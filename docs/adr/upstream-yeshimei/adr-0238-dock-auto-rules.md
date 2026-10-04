# ADR-0238 · 工具坞：自动化规则表 —— 一工具多条规则，条件与动作扩展

日期：2026-10-04 · 状态：已采纳 · 关联：ADR-0236（bz 亲自调度）、ADR-0237（文件名惯例）、
增强清单 `.scratch/dock/enhancements.md` #20–#28（用户全批采纳）

## 决策

### 一、数据模型：登记项新增 `autoRules`，`scheduleOverride` 转 legacy

```ts
interface DockAutoRule {
  name?: string;               // 规则名；缺省「规则 N」
  enabled?: boolean;           // 缺省 true
  action?: 'run' | 'remind';   // 缺省 'run'（#27：到点只提醒不拉进程）
  schedule: DockSchedule;      // kind 见下
  window?: { from: number; to: number }; // #22 允许时段（小时 0–23，本地点到窗外不欠不吵）
  jitterSec?: number;          // #24 到点后随机延迟 0–N 秒（调度器掷骰，判据不含随机）
  graceSec?: number;           // #26 过点 + N 秒后放弃本周期；缺省旧行为（daily 当天内一直补）
  after?: string;              // #28 前置工具 id：它最近一次成功收尾后才轮到我
}
```

- **生效规则 = `entry.autoRules`（非空）→ 否则种子**：`scheduleOverride`（legacy）映射成一条
  规则；再否则声明 `schedule` 是自动节奏 → 一条种子规则（跟随脚本日后改动，`overrideDeclSig`
  语义仅在种子视图下有意义）。**读侧映射，不写盘迁移**；用户首次编辑保存即落 `autoRules`。
- 规则表非空后，脚本改默认**不影响**已存规则（种子只在规则表为空时存在）。

### 二、kind 扩枚举

`daily`（hour）/ `weekly`（weekday，**多选 `weekdays`**，#23）/ **`monthly`**（`day` 1–31，
缺省 = 本月出现过就算）/ `interval`（everyHours）/ **`on-launch`**（`delayMin` 缺省 5：
Obsidian 启动后 N 分钟且本会话没跑过）/ `on-demand` / `unknown`。**不收 cron**（不变）。

### 三、并集语义与「跑一次清全部」

- 任一规则欠 → 该工具 due；同一批多条同时到期**只跑一次**（串行队列天然兜住）。
- **跑一次清所有规则的欠**（run-clears-all）：运行记录是全工具共享的事实，「这周跑过了」
  不区分因哪条规则跑的。近似但直觉，且可测——不引入规则级 satisfied 账本。
- `decideDue` 每工具至多出一个 ready（多条到期合并一条，附最紧的 jitter）。

### 四、调度侧（判据不含随机，执行才掷骰）

- 判据输出确定性的 due；起跑前由调度器延迟 `rand(0, jitterSec)`（缺省 0）。
- **remind 动作**：due → 通知（dedupe 按天），不拉进程、不进串行队列、不算失败。
- **after 前置**：读前置工具的台账 `lastAttemptOk === true` 才放行，否则 skip（reason `after`）；
  **只查一层不递归**；after 图成环 → 环上规则整批 skip 并每会话提示一次。
- **事件触发（#25）**：网络 = 渲染进程 `online` 事件；系统唤醒 = tick 间隔 > 5 分钟（时间跳变）。
  事件 → `kickDockScheduler()` 立即重判（欠的当场补，不等下一分钟 tick）。
- 移动端照旧不起调度器；on-launch 的「会话启动时刻」由调度器给出（`STARTUP_DELAY_MS` 基准）。

## 明确不做

- 不做规则级独立 satisfied 账本（run-clears-all 覆盖真实场景，少一本会漂的账）。
- 不做 cron / 文件监听 / OS 计划任务注入（前三条 ADR 的否决继续成立）。
- 不做规则间并行依赖图（after 只一层）。

## 后果

- 判据纯函数群（`isRuleDue` / `decideDue` / `nextDueAt` / `overviewOf` / `judgeDue`）从
  「一工具一节奏」改为「一工具规则数组」；node 可直测不变。
- 详情页「自动运行」块改规则列表（每条命名 / 启停 / 编辑 / 删除 + 添加规则 + 恢复脚本默认）。
- 旧登记零迁移零丢失（读侧映射）；两分区仍由「是否存在生效且启用的 run 规则」派生。
