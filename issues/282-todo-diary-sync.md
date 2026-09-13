# Ticket 282 · 加待办 × 日记「代办事项」双向同步（当日待办事项捕获退役）

ADR：`docs/adr/0122-todo-diary-sync.md` · grill-with-docs 两轮决策，用户逐条裁决后确认开工。

## 需求（用户原话口径）

打通「加待办」和日记文件中的「## 代办事项」：
1. 加待办添加待办 → 同步写进当天日记 `## 代办事项`；
2. 加待办中勾选完成 → 日记对应行打钩；
3. 当天未完成的自动顺延到第二天；
4. 每个待办按添加顺序编序号。

## 两轮 grill 裁决记录

| 决策点 | 结论 |
|---|---|
| Q1/Q7 | 「当日待办事项」捕获（bz-diary-todo-capture）**彻底退役**，日记 `## 代办事项` 唯一写入者 = 新同步机制 |
| Q2/Q3 | 行格式 `- [ ] <序号>. <标题>-<HH:mm>`；序号**按天重排**（顺延批按 created 升序排前，新加接最大号续尾；已写行永不重排）；面板不显示序号 |
| Q4/Q8 | **全部双向**：完成↔打钩、恢复↔退钩、改标题↔行文本、删除↔删行，哪边改另一边都跟 |
| Q5/Q10 | 顺延 = 启动 + 当天首次开待办面板，补所有历史未完成且今天无投影行的条目（去重一次）；文件缺失建档；不预建明天文件 |
| Q9 | 同步窗口 = 今天的日记；历史日记是快照永不回改 |
| 补充 | **移动端功能同步**：链路全走 vault + 串行队列，无桌面专属 API |

## 实现

- `src/diary/daily-capture.ts`：删 `openTodoCapture`/`buildTodoLine`；导出 `writeDiarySection`；新增纯函数 `editSectionLines`（小节行集合变换，与插入版共用 locateSection，ADR-0114 单点不漂移）。
- `src/todo/diary-projection.ts`（新，纯层）：投影行解析/构建、匹配键 `标题-HH:mm`（created 推导，不写 id）、maxSeq、小节行变换（勾选/改题/删行）。
- `src/todo/diary-sync.ts`（新，编排层）：面板五动作钩子（增/勾/题/删/撤销）；`runTodoRollover` 顺延；vault modify 反向监听（仅今天日记，300ms 去抖）——lastSeen 快照判删行与改题（**同时刻新行 = 改题**，否则删行），回声幂等防循环；当天首见只建快照不动作（防启动误删）。
- `src/todo/ui.ts`：completeItem/restoreItem/deleteItemConfirm(含撤销)/composer 添加/编辑器保存(新建+改题) 挂钩子。
- `src/todo/index.ts`：openTodoPanel/ensureTodoReminders 挂 `ensureTodoDiarySync`（幂等 + 每天一次顺延）；unloadTodo 挂卸载。
- `src/main.ts` + `src/diary/ui/panel.ts`：删命令与日记面板 ✅ 按钮（命令数 64 → 63）。
- memo.json 14 字段冻结不动；无号历史捕获行不参与匹配、永不改动。

## 测试

- `tests/todo/diary-projection.test.ts`（13 用例，纯层）
- `tests/todo/diary-sync.test.ts`（12 用例：顺延三态/单向五钩子/反向打钩·改题·删行撤销/无号行与手动加行不联动/回声幂等）
- `tests/smoke.test.ts` 命令清单同步；`tests/diary/daily-capture*.test.ts` 移除退役入口用例。

## 状态

- [x] 实现 + 测试 + tsc
- [x] smoke/daily-capture 测试同步修订
- [x] 全量测试 + 构建验证

## 修订 1（2026-09-13 晚）：续号撞手打编号

**现象**：用户手打的编号行（`1.折腾…-08:20` 点号后无空格、`9./10.` 无时间后缀）不被
`maxSeq` 认账（正则要求 `N. ` 带空格 + 时间后缀）→ 插件顺延以为小节是空的，从 1 重新编号，
与手打 1-10 撞号（二次重载后又续成 4、5，坐实根因）。

**修复**：
- `diary-projection.ts`：① `parseProjectionLine` 点号后空格改可选（`\.\s*`）——手打
  `1.标题-HH:mm` 也成投影行，可参与勾选联动/去重；② 新增 `maxWrittenSeq`（续号专用）：
  只要 `- [x] N.` 编号行就占号，不要求空格与时间后缀。
- `diary-sync.ts`：顺延与新增两处续号 `maxSeq` → `maxWrittenSeq`；顺手修 `vault.read(f)`
  的 TFile 类型收窄（`'stat' in f` 守卫）。
- 用户今天日记（2026-09-13.md）撞号的第二个 1-5 人工修为 11-15（保持行序，符合「已写行
  永不重排」精神——只修撞号不改内容）。
- 测试：投影层 +手打形态解析/maxWrittenSeq 用例，同步层 +「手打 1-10 → 续号 11」端到端回归
  （15 + 13 用例）。

**边界口径（沿用）**：无时间后缀的手打编号行（如 `9.给添加…`）不是投影行，不联动、不被
插件改动，只在续号时占号——想让它进入同步体系就补上 `-HH:mm` 后缀，或改用「加待办」。
