# 工具坞外部脚本接入指南（dock 契约 v1）

给谁看：要把一个外部脚本接入 bz「工具坞」的人或 **agent**。按本指南做完三件事，脚本即可被登记、运行、观测——不 import 任何 bz 代码，bz 不关心脚本内部是什么。

**三件事**：① 工具目录放一份 `manifest.json` 声明自己；② 脚本按**四行协议**往 stdout 说话、干完 `exit 0`（失败 `exit 1` + stderr 说明原因）；③ 自己往目录里写 `runs.json` 运行记录（原子写）。

| 文件（工具目录内） | 谁写 | 用途 |
|---|---|---|
| `manifest.json` | **你**（手写） | 声明：叫什么、有哪些参数、默认节奏、怎么跑 |
| `main.mjs` | **你** | 主程序（约定入口；也可在 `run` 段指定别的） |
| `data.json` | **bz** | 用户填的参数值（你不读它，值会经命令行发给你） |
| `runs.json` | **你** | 运行记录（bz 只读） |

旧名（`dock.json` / `dock.settings.json` / `dock.runs.json`）bz 读侧仍认，新工具一律用上表新名。

## 1. manifest.json

```jsonc
{
  "v": 1,
  "id": "iamtxt-signin",        // ^[a-z0-9][a-z0-9-]*$，≤64；必须与 runs.json 的 "tool" 逐字一致
  "name": "iamtxt 每日签到",     // 必填非空
  "description": "在 iamtxt 签到领积分",
  "icon": "calendar-check",      // lucide 图标名，可选
  "schedule": { "kind": "daily", "hour": 12 },  // 可选；只是默认节奏（见 §4）
  "run": { "cmd": "node", "args": ["main.mjs"] }, // 可选：目录里有 main.mjs 时整段可省（自动按 node main.mjs 跑）
  "params": []                   // 可选，见 §2
}
```

- `v` 必须是 `1`；`id` / `name` 不合法 → 整份被拒，面板显示人话原因。
- **`run` 段**：`cmd`（可执行文件或 PATH 名）、`args`、`cwd`（缺省 = 工具目录）、`shell`（缺省按扩展名：`.cmd`/`.bat` 自动开）。**省略 `run` 且目录里有 `main.mjs`** → 自动视为 `node main.mjs`；python 等其他运行时必须写 `run`。
- 可选字段 `author` / `toolVersion` / `docs`（http(s) 链接会在详情页可点）。未知字段原样保留，随便扩展。

## 2. params：只向用户要只有他知道的东西

每项 `{ "key", "label", "type", "required?", "default?", "help?" }`。八种 `type`：`text` `multiline` `number` `bool` `choice`（带 `options`）`multichoice` `path` `secret`。

- 值经 argv 下发：`--key=value`（`bool` 为 true 时发裸 `--key`，false 不发；`multichoice` 重复 key）。
- **该放**：凭据（cookie/token，用 `secret`）、用户偏好（下载目录）、因机器而异的值。
- **不该放**：接口地址、请求体、字段名、超时——这些你写死在脚本里。判据：用户看到这个框能凭自己填对吗？填不对的就不该是参数。
- 用户填的值存工具目录 `data.json`（bz 写），每次运行经 argv 发给你；`secret` 不落运行记录。

## 3. 脚本本体（契约 B：四行协议 + 退出码）

stdout 逐行输出，四个前缀（bz 逐行解析，非协议行原样透传，坏行静默忽略）：

| 行 | 作用 |
|---|---|
| `[bz-step] 检查登录态` | 步骤（纯文案） |
| `[bz-p] {"phase":"签到","pct":35}` | 阶段进度；拿不到真实进度写 `null`，别编 |
| `[bz-info] {"mode":"fast"}` | 结构化信息（可选） |
| `[bz-result] {"balance":52}` | 结构化结果（可选；一次运行取最后一次） |

**退出码**：干成 `exit 0`；没干成 `exit 1` + stderr 写清原因（尾部 2KB 会被保留展示）。被用户手动停止 = `stopped`，与你无关。

最小 Node 模板（零依赖，Node 18+）：

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : null; }).filter(Boolean),
);
const RUNS_FILE = process.env.BZ_DOCK_RUNS_FILE
  || path.join(path.dirname(fileURLToPath(import.meta.url)), 'runs.json');
const TRIGGER = process.env.BZ_DOCK_TRIGGER === 'auto' ? 'auto' : 'manual';
const started = new Date().toISOString();
const steps = [];

function finish(rec) {
  const done = new Date();
  const prev = (() => { try { return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8')); } catch { return { runs: [] }; } })();
  const out = { v: 1, tool: '你的id', updatedAt: done.toISOString(), runs: [{ runId: `${started}-${process.pid}`, trigger: TRIGGER, startedAt: started, finishedAt: done.toISOString(), durationMs: done - started, steps, ...rec }, ...(prev.runs ?? [])].slice(0, 200) };
  const tmp = `${RUNS_FILE}.${process.pid}.0.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
  fs.renameSync(tmp, RUNS_FILE); // 原子顶替：写一半被读也不会出半截 JSON
}

// —— 干活：步骤用 say.step / say.p 汇报，成功 exit 0，失败 exit 1 + stderr ——
```

**环境变量**（bz 注入这五个，**不继承宿主环境**——不要依赖 `PATH` 等去找东西，要什么写绝对路径）：`BZ_DOCK_CONTRACT=1`、`BZ_DOCK_TOOL=<id>`、`BZ_DOCK_RUNS_FILE=<runs.json 绝对路径>`、`BZ_DOCK_VAULT=<vault 根>`、`BZ_DOCK_TRIGGER=auto|manual`（读它标记录的 `trigger` 字段，别写死）。

## 4. 运行记录（契约 C）：你写，bz 只读

每次运行一条，**新记录在前**，`slice(0, 200)` 自裁剪（bz 不会替你删）。必填：`status`（`ok|failed|stopped|timeout`，不认识的整条丢弃）、`startedAt`（ISO 带时区）。推荐：`finishedAt`/`durationMs`/`exitCode`/`message`（给人看的一句话，如「签到成功，+2 分」）/`progress`/`steps`/`result`/`info`（数组）/`metrics`/`artifacts`/`params`（**剔除 secret**）。

失败时**必写** `error: { kind, detail?, stderr? }`——`kind` 让面板给出可操作提示：

| kind | 面板提示 |
|---|---|
| `auth` | 登录态失效，重新导出凭据 |
| `network` | 网络不通，查代理或稍后重试 |
| `config` | 命令或参数配错 |
| `timeout` | 执行超时 |
| `aborted` | 被手动中止 |
| `unknown` | 看 stderr 尾部定位 |

硬要求：**tmp + rename 原子写**；**id 与 `tool` 逐字一致**（不符整份被拒）；bz 读不到/读不懂就当该工具没记录，绝不连累面板。

## 5. 自动化：bz 按规则表替你触发，你只给默认值

`schedule` 是**种子默认**（「我猜用户大概想这么跑」），不是宣布——用户在 bz 面板的规则表里可以改、加多条、或关掉，bz 不会回写你的 `manifest.json`。kind 全集：

| kind | 字段 | 语义 |
|---|---|---|
| `daily` | `hour` 0–23 | 当天 `hour` 前没跑过就该跑（缺省 hour = 一过零点算欠） |
| `weekly` | `weekdays`（多选）或 `weekday` | 本周期望日没跑就该跑（缺省 = 最近 7 天内有） |
| `monthly` | `day` 1–31 | 本月该日之后没跑就该跑（缺省 = 本月出现过就算） |
| `interval` | `everyHours` > 0 | 距上次超过 N 小时（首次无基线也跑一次） |
| `on-demand` | — | 不按节奏，用户手点 |

bz 侧规则表还支持（对你是透明的，无需配合）：多规则并集、允许时段、随机延迟错峰、补跑宽限、到点只提醒不跑、前置工具依赖、断网恢复 / 系统唤醒后立即补跑。

**三条纪律**（作者侧）：
1. 声明了节奏，bz 就会在 Obsidian 开着时替你触发（含漏跑补、失败冷却与熔断）——**别再自己配系统计划任务**（两处触发 = 记录翻倍）。只有「Obsidian 关着也要跑」才需要你自己配，那是离场形态：拿不到 `BZ_DOCK_RUNS_FILE`，照样写自己目录的 `runs.json`。
2. `trigger` 读 `BZ_DOCK_TRIGGER`，别写死。
3. 自动运行时没人盯屏幕：**失败必须 `failed` + `error.kind`**，记录是唯一真相来源。

## 6. 不要做

- 不要把声明从 stdout 吐出来（`--manifest` 通道已取消）。
- 不要把 `secret` 写进运行记录的 `params`。
- 不要 try/catch 吞异常后 `exit 0`——bz 会当成功。
- 不要直接覆写 `runs.json`（半截 JSON = 记录全丢）；裁剪是你的活。
- 不要往一行 stdout 塞大对象（1 MiB 截断）。
- 不要依赖 `PATH` 或其他环境变量。
- 不要在脚本里做「今天跑过了就跳过」以外的调度判断——到点没到点是 bz 的活。

## 7. 提交前自检

1. `manifest.json` 可解析，`v===1`、`id` 合法、`name` 非空；声明 `id` 与记录 `tool` 逐字一致。
2. 不写 `run` 段时目录里有 `main.mjs` 且 `node main.mjs` 能直接跑。
3. 正常路径：stdout 有 `[bz-step]` / `[bz-p]`，退出码 0。
4. 造一个失败：`exit 1` + stderr 最后一行是原因 + 记录 `error.kind` 贴切。
5. `runs.json` 多了一条且 `trigger` 来自环境变量；记录是 tmp+rename 写出的；数组 ≤ 200。
6. 参数表逐项自问：用户能凭自己填对吗？
7. 面板「导入声明」核对名字 / 命令 / 参数个数；关掉自动化手动跑一遍也通。

## 8. 真相源与参考

- 校验与路径：`src/dock/schema.ts`、`src/dock/declaration.ts`；协议与进程：`src/core/external-tool.ts`；拉起：`src/dock/runner.ts`；规则判据：`src/dock/schedule.ts`、调度：`src/dock/scheduler.ts`。
- 参考实现：`E:\Obsidian\dock-tools\daily-signin\`（`manifest.json` + `main.mjs`，接口写死、参数只留 Cookie）。
- 决策记录：ADR-0235（声明自描述）、ADR-0236（bz 调度）、ADR-0237（文件名惯例）、ADR-0238（规则表）。本文与代码冲突时以代码为准，并顺手改这里。
