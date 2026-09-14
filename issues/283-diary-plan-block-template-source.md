# 票 283：日程三段真源迁进日记模板（删空占位 + 顺延建档同源）

- 状态：已完成
- 关联：ADR-0123（本票新落）、ADR-0112（模板建文件）、ADR-0113（层级提级）、ADR-0122（待办日记同步）
- 起因：用户报「日程规划的模板现在又不对了」——回溯认定非日程规划代码被改坏，而是待办顺延抢建顶格文件 + 日程规划只能文末追加（详见 ADR-0123 背景）

## 用户裁定（三轮 grill-with-docs）

| 轮次 | 裁决 |
|---|---|
| 一 | Q1=(a) 症状即「今天没骨架、待办顶到第一行」；Q2=(A) 顺延建档改读模板 |
| 二 | Q3/Q5：只删 `## 代办事项` 下的三个 `- [ ] ` 空占位，其他内容（`## 完成情况跟踪` 空表、`## 备注` 的 `1. 2. 3.`）不动；待办按现有投影行规则直接填在该节下。Q4/Q7：QuickAdd 剩余条目用户自行删除，本次不代劳。Q8：只修 `2026-09-14.md`。Q9：落 ADR + 改测试断言 |
| 三 | Q10=(A) 三段迁进 vault 模板、代码改为从模板截取，模板成唯一真源；Q11=(A) `2026-09-14.md` 重排、正文段归位 `# 随笔`；Q13：**日程规划命令完整保留**（「代办不是每天都有遗留」，仍需手动建未来日记的入口） |

## 落地清单

### vault（不在 git 内，改前已备份）

- `CONFIG/TEMPLATE/模板-日记.md`：`# 日程规划` 之下补 `## 代办事项`（空）/ `## 完成情况跟踪`（空表）/ `## 备注`（`1. 2. 3.`）；不含 `- [ ] ` 占位。
- `我的/日记/2026-09-14.md`：重排为骨架形态——5 条投影落 `## 代办事项`，`**📖 06:45**` + 正文归位 `# 随笔`，内容一行不丢。
- 备份：`.scratch/283-diary-plan-block-template-source/模板-日记.md.bak-20260914`

### 代码

- `src/diary/daily.ts`
  - `buildPlanContent()`：删三个 `- [ ] `，角色改为「模板不完整时的兜底块」。
  - 新增 `extractPlanBlock(template)`：从模板 `# 日程规划` 之后截三段（只收首尾空行）。
  - `buildDiaryFileContent(template, date)`：不再拼接日程块，产物 = 模板原文（frontmatter 规整后）；模板缺标题才兜底补块。
  - `appendPlanToDiary(content, template)`：三段改从模板截取。
  - `FALLBACK_DIARY_TEMPLATE`：内置兜底补三段。
  - `readDiaryTemplate` 改 export；`planDiary` 一次读模板、两分支共用。
- `src/diary/daily-capture.ts`
  - `writeDiarySection` 新增 `opts.seedWhenMissing`：文件缺失时把「建档初稿」交给 transform（不传维持旧口径）。
- `src/todo/diary-sync.ts`
  - 新增 `seedForMissing(date)`：文件缺失才读模板，产出「骨架 + 三段」初稿。
  - `runTodoRollover` / `syncItemAdded` 传入 seed，投影落进模板自带的 `## 代办事项`。
  - 修 `rollOverContent`：小节已存在但无新行可补 → 原样返回，不再误判为「小节不存在」而往文末建节。

### 文档与测试

- `docs/adr/0123-diary-template-single-source-with-plan-block.md`（新）
- `CONTEXT.md`、`PROGRESS.md` 同步
- `tests/diary/daily-tasks.test.ts`：新增「兜底三段无空占位（逐行快照）」与「`extractPlanBlock` 截取 / 兜底」两例
- `tests/diary/daily-flow.test.ts`：`PLAN_BODY` 去空占位、抽出 `TEMPLATE_SKELETON`，模板文件与基准文件改为「骨架 + 三段」
- `tests/todo/diary-sync.test.ts`：缺失建档改为断言「模板骨架 + 投影落 `# 日程规划` 内」；新增「vault 有模板时以模板为准」与「无新行可补 → 文件一字不动」两例

## 验收

- `node node_modules/typescript/bin/tsc --noEmit` ✅
- `node node_modules/vitest/vitest.mjs run` ✅ 全量通过（详见 PROGRESS）

## 已知遗留（有意不处理）

- QuickAdd `data.json` 里「日常行为记录」「当日代办事项」两条 Capture 及其旧层级 `insertAfter.after`（`createIfNotFoundLocation: "top"`）→ 用户自行删除；插件内已有同名命令。
- `CONFIG/SCRIPTS/日常时间记录/` 6 个旧 js 仍在 vault（功能已由插件接管）→ 用户自行处置。
- 磁盘上另两份同名旧模板（`随笔库`、`仓库-旧-不动` 符号链接目录）属别的 vault，未动。
