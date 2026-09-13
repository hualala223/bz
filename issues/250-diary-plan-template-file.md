# issue 250：日程规划改为「按日记模板建文件」（ADR-0112）

## 报障（用户）

> 你修改了我原本的日程规划的模板样式，请按照现在仓库中的「2026-09-11.md」文档内容来设定日程规划给出的文件样式

## 定位

`CONFIG/SCRIPTS/日常时间记录/日程规划.js`（用户原 QuickAdd 宏）的真实行为：

1. 目标日期写死明天，路径 `我的/日记/YYYY-MM-DD.md`；
2. **目标文件已存在 → Notice「第二天的日记文件 … 已存在」直接返回**，一个字节不写；
3. 否则读 `CONFIG/TEMPLATE/模板-日记.md` → `模板原文 += '\n' + 日程三段` → `vault.create` 新建。

即产物是**模板骨架形态**（frontmatter + `## 睡眠相关/## 随笔/## 新闻联播内容记录/## 日常行为记录/## 日程规划`），`我的/日记/2026-09-11.md` 就是它的产物。

插件版（ADR-0111 落盘实现）走 `addEntry` 条目链路，产物是条目形态 `# 📖 HH:mm` + 三段——**与宏产物不同形**，条目模型整文件重写也产不出骨架形态。用户的"模板样式被改了"属实。

**字节级校验**：`模板原文 + "\n\n" + buildPlanContent() + "\n\n"` 与 vault 真文件 `2026-09-11.md` **完全一致**（`COMPOSE_MATCH=true`）。

## 修复（ADR-0112）

落盘改为文件级原样读写（不再经 `addEntry` / 条目模型 / `diaryDataMap`）：

| 目标文件状态 | 行为 |
|---|---|
| 不存在 | 读模板（`CONFIG/TEMPLATE/模板-日记.md`，不可读用内置兜底骨架）→ 模板 + `\n\n` + 三段 + `\n\n` → 新建 |
| 存在且原文已有规划（双标记同时命中） | 提示不重复创建，**一个字节不写** |
| 存在但无规划 | 末尾补 `## 日程规划` + 三段（已有该标题则只补三段），其余内容一字不动 |

- 新增纯函数：`buildDiaryFileContent(template, date)` / `appendPlanToDiary(content)` / `hasPlan(text)`（判据从「条目」改「文件原文」）；
- 常量：`DIARY_TEMPLATE_PATH` / `FALLBACK_DIARY_TEMPLATE` / `PLAN_HEADING`；
- 目录走插件设置 `DIARY_DIRECTORY`（默认 `我的/日记`），缺失逐段创建；写盘走 `core/storage` 同路径串行队列（键 = 日记文件路径），与 diary store `writeFile` 互斥；
- frontmatter 规整（用户确认 Q3-B）：删 `title`（模板占位残留 `"电视剧.md"`）、`date_creation` 改写为 `{目标日期} 00:00:00`，缺失则补。这是产物与 `2026-09-11.md` 的**仅有差异**。

## 模板文件清理（Q3-B，动的是 vault 里的文件）

`CONFIG/TEMPLATE/模板-日记.md` 删除 `title: "电视剧.md"` 与秒数非法的 `date_creation: 2025-11-06 23:11:89` 两行（其余一字不动，末尾仍无换行）。该模板有 4 个消费方：`日程规划.js`、`日记.js`、核心 daily-notes、QuickAdd —— 全部随之受益（新建日记不再带脏字段）；代价是宏不再自动产出 `date_creation`（插件会填）。

## 测试（`tests/diary/daily-flow.test.ts`，17 例全绿）

以 vault 真文件 `2026-09-11.md` 原文为**逐字节基准**（内联 fixture），共 8 例：

- 选「明日」/「当日」→ 产物 `toBe(基准文件按目标日期规整 frontmatter 后的全文)`（含 `- 睡眠相关` 骨架与三段）；
- 取消（遮罩 / ESC）→ 今天/明天都不建文件；
- 模板文件缺失 → 内置兜底骨架仍建出同形文件；
- 文件已存在且已有规划 → 提示不重复、`modifiedPaths` 为空（一字不写）；
- 文件已存在但无规划 → 末尾补标题 + 三段，原内容一字不动；
- 已有 `## 日程规划` 标题但空 → 只补三段，标题不重复；
- 回归（ADR-0111）：单 `### 代办事项`（待办捕获残留）不算已规划，仍补写。

## 门禁

- `tsc --noEmit` 0 错；
- 全量测试 268 文件 / 4284 用例全绿；
- `node esbuild.config.mjs production` 构建通过并部署（产物含模板读取与兜底文案）；
- 文档：ADR-0112 + ADR-0111「修订」段 + CONTEXT.md 词条再修（含新增 `_Avoid_`）。
