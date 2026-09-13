# 270 · 吸收上游「番茄钟 F11 / F12 / F13 三项修复」

日期：2026-09-13 · 状态：**开发完成，待用户验收** · 上游基线：`7b06f4b4`
关联：ADR-0118（本地命名保留）、ADR-0120（纪律与冻结清单）、ADR-0121（冻结裁决 + 皮肤例外）、票 264（番茄钟皮肤已吸）、票 266（吸收队列）
上游来源：提交 `a4c69488`「fix(clipbook): 剪藏流家族五域批修 F1-F15（全域审查第四节）」中的 pomodoro 三条

---

## 一句话

番茄钟**皮肤早在票 264 就已整批吸收**（`ffb67ed1`，10 套面板皮肤 + `skin.ts` 单源），本票**只接上游三条缺陷修复**：**重置即落盘（F11）**、**冻结标记随解冻清除（F12）**、**历史按 7 日历日保留窗裁剪（F13）**。本地独有形态（⚙️ 设置弹窗、12 槽时段分布、`skin.ts`）**原样保留**。

## 背景：为什么只吸三条

| 文件 | 本地 | 上游 | 上游相对本地 | 性质 |
|---|---|---|---|---|
| `config.ts` `sound.ts` `statusbar.ts` | — | — | **+0 / −0** | 逐字节相同 |
| `data.ts` | 117 行 | 113 行 | +1 / −5 | **本票接 F13**；其余仅注释差（下方说明） |
| `state.ts` | 245 行 | 245 行 | +3 / −3 | **仅注释用词差**（本地「待办」↔ 上游「备忘录」，ADR-0118） |
| `index.ts` | 7 行 | 10 行 | +5 / −2 | 上游多 5 个导出（见「未吸收」） |
| `stats.ts` | 80 行 | 60 行 | +4 / −24 | 本地**保留 12 槽时段分布**（上游整行删） |
| `styles.css` | 159 行 | 142 行 | +4 / −21 | 差异**全是本地独有段**（⚙️ 钮定位 + 移动避让 + 时段柱） |
| `ui.ts` | 803 行 | 822 行 | +139 / −120 | 上游弹窗降噪 + 设置入口迁设置面板 + 彩点导出 |
| `skin.ts` / `render.ts` | **本地独有** | **上游独有** | — | 皮肤单源两套文件名，**已是同一份内容**（票 264 对位） |

**结论**：`ui.ts` / `styles.css` / `stats.ts` **不做整域覆盖**（会换掉本地弹窗形态、删掉时段分布）；只挑上游那三条**纯行为修复**接进来。

## 吸收的改动

| # | 内容 | 落到哪 |
|---|---|---|
| 1 | **F11 · 重置即落盘**：`applyAction` 落盘条件补 `\|\| (action === 'reset' && r.state !== prev)`。`transition('reset')` **恒返回 `event:{type:'none'}`**（`state.ts:195-202`，本地已核）→ 不落盘则盘上旧 `endTime` 残留，**重启后旧计时复活并弹「番茄钟继续」**。`forceFocus` 拦下的 reset 返回**同一 state 引用**，`r.state !== prev` 为假 → 不写盘（避免无意义落盘） | `ui.ts`（`prev` 变量 + 落盘条件） |
| 2 | **F12 · 冻结标记随解冻清除**：`applyAction` 在 `state` 更新后补 `if (!state.paused) autoPauseMain = false;`。`autoPauseMain` 原本**只在 `resumeOnVisible` 块内与 `unload` 清理**（本地已核）→ 冻结后在 `document.hidden` 期间经其他入口（popout 窗口 / 通知动作）解冻，标记残留；用户随后手动暂停，恢复可见时 `resumeOnVisible` 见 `autoPauseMain && state.paused` 成立 → **把手动暂停静默续跑** | `ui.ts`（`applyAction`） |
| 3 | **F13 · 历史保留窗裁剪**：`data.ts` 新增纯函数 `trimHistory(history, now)`（窗口起点 = 今日零点 −6 天）；`save()` 落盘前裁剪、`initData()` 装载即裁剪——`history` 永不裁剪会让 `pomodoro.json` **随使用线性膨胀** | `data.ts`（新增）+ `ui.ts`（`save` / `initData` 接线） |

### F13 的下游口径核查（先把风险排掉再动手）

裁剪窗会不会削掉别的域要用的数据？逐条核过本地四个消费方，**均无影响**：

| 消费方 | 读取口径 | 结论 |
|---|---|---|
| `stats.ts` `last7Days` / `todayCount` / `todayMinutes` | 近 7 个**日历日** | 窗口起点与裁剪窗**完全一致** → 恒不丢 |
| `home` 周统计 | **自然周**（周一为起点，最长 7 天） | 本窗口**恒覆盖**该周 |
| `recap/aggregate` | **只读今日** | 不受影响 |
| `smartcat/pomodoro-source` | **只订阅域事件**，不读 `history` | 不受影响 |
| `checkup` | 仅字段漂移巡检 | 不受影响 |

> 窗口用「今日零点减 6 天」而非「now − 7×86400s」，是**日历日口径**（跨 DST 安全）；未来时间戳（时钟回拨）落在窗口右侧 → 保守保留。

## 明确未吸收

| 项 | 原因 |
|---|---|
| **上游 `render.ts`** | 与本地 `skin.ts` **同职同内容**（皮肤主题单源），票 264 已对位。搬进来会造成双源 |
| **上游 `index.ts` 额外 5 个导出**（`toggleFocus` / `isFocusing` / `menuPhase` / `skipBreak` / `togglePause`） | 依赖上游 `core/pomodoro-phase.ts`（**本地不存在**）；且本地全仓**零调用方**——上游是给其 home 域 issue 283「五灯彩点」用的，本地 home 无此链路 |
| **上游删 `todayHourBuckets`（`stats.ts`）** | 本地弹窗**仍展示**「今日 12 槽时段分布」小方柱（增强包），生产侧有消费者 → 不能删 |
| **上游设置入口迁「设置面板」** | 本地保留 ⚙️ 域设置弹窗（ADR-0009），属既有交互，不在本票范围 |
| **上游 `stats.ts` 的 `dayKey` → `localDayKey` 单源替换** | 本地 `core/utils.ts` **已有** `localDayKey`（第 173 行），与本地 `pad2` 自算版**行为完全等价**（同一 `YYYY-MM-DD` 口径）。属「单源收敛」而非行为修复，**与本票 F11–F13 无关 → 本次不动**（记为可选项，供后续单独决定） |
| **上游 `styles.css` 全量、`ui.ts` 全量** | 差异主体是本地独有形态，见上表 |
| **上游守卫型测试**（`tests/review-fix-clip*.test.ts`） | 按票 259 教训不照搬；**等价意图的用例已写进本地域内测试文件**（见下） |

## 本地保留（原样不动）

| 项 | 说明 |
|---|---|
| ⚙️ 番茄钟设置弹窗 | 保留（未跟上游迁设置面板）。 |
| 今日 12 槽时段分布 | 保留（`todayHourBuckets` + `.pomodoro-hours` / `.pomodoro-hour-bar*` 样式一个未动）。 |
| `skin.ts` 皮肤单源 | 保留（未跟上游 `render.ts`）。 |
| 「待办」用词 | 注释里的「待办」不跟上游改「备忘录」（ADR-0118）。 |
| `styles.css` | **本票零改动**（三条修复无视觉变化）。 |

## 测试改动

| 文件 | 处理 |
|---|---|
| `tests/pomodoro/data.test.ts` | **新增** `trimHistory` 单测 5 条：窗外剔除 + 窗口边界（含）保留、未来时间戳保守保留、空/全窗外 → 空数组、返回新数组不改入参、窗口覆盖 7 个日历日全部记录 |
| `tests/pomodoro/ui.test.ts` | **新增** 3 条：①F11 重置落盘（先断言运行态已落盘，再点重置断言 `endTime` 归空 / `remaining` 回满）；②F12 冻结 → hidden 期间手动解冻再手动暂停 → visible **不误自动恢复**；③F13 装载 + 落盘链路裁剪（30 天前记录不进 `pomodoro.json`） |

> 实现备注：F12 用例必须先 `ensurePomodoro`（`visibilitychange` 监听**只在此注册**）再 `openPomodoro`（拿弹窗按钮）；只调 `openPomodoro` 则监听未注册、事件空转。

## 门禁

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 0 错误 |
| 番茄钟域 `vitest` | ✅ 10 文件 / **177 例**全绿（本票净新增 7 例） |
| 全量 `vitest` | ✅ 279 文件 / **4440 例**全绿 |
| `node esbuild.config.mjs production` | ✅ 构建通过（安装目录 `main.js` 含 `trimHistory` ×2；构建产物未提交） |

## 冻结域零接触核查

本次改动文件全集（4 个）：

```
 M src/pomodoro/data.ts
 M src/pomodoro/ui.ts
 M tests/pomodoro/data.test.ts
 M tests/pomodoro/ui.test.ts
```

**零接触**：`src/diary/`、`src/recap/`、`src/review/`、`src/diary-wall/`、`src/smartcat/`、设置页 AI 设置与小橘设置板块，以及 `src/settings.ts`（**本票未新增任何设置键**）——一个文件未动。

---

## 环境事件记录（本票开发中）

票 270 开发期间，本机 `/git worktree` 机制**两次被外部清空**：`git worktree add` 成功建立后，主仓 `N:\新建文件夹\bz\.git\worktrees` 目录随即消失（第一次：`wt-pomodoro` 已跑完全部门禁后失效；第二次：新建 `wt-pomodoro2` 后立刻失效），导致 worktree 内 `git` 报 `fatal: not a git repository: (NULL)`。

处置：**改门禁与提交分离**——门禁全部在隔离 worktree 目录内跑（不依赖 git），提交则在主仓用**显式路径** `git add src/pomodoro/ui.ts src/pomodoro/data.ts tests/pomodoro/data.test.ts tests/pomodoro/ui.test.ts` 完成，主仓其余未提交改动（日记 / 复习 / `main.ts` 等**红线域在制工作**）**一律未碰、未纳入暂存**。

另：主仓工作区含大量在制改动（`src/diary/*`、`src/review/*`、`src/recap/summarize.ts`、`src/main.ts`、`main.js`、`styles.css` 等），**故未在主仓执行任何构建**（构建会覆盖 `main.js` / `styles.css` / `prototype-render.js`，可能损毁在制工作）——构建一律在隔离目录内进行。
