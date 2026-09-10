# issue 245：三个日常时间记录 QuickAdd 宏整合进 diary 域

## 目标

把 vault 里 `CONFIG/SCRIPTS/日常时间记录/` 下三个 QuickAdd 宏搬进插件 diary 域，统一入口、去掉外部脚本依赖：

| 宏 | 插件内实现 | 命令 id |
|---|---|---|
| 当天任务完成情况（7 项依次打勾） | `runTaskCheck()` | `bz-diary-task-check` |
| 每日复盘 | `openReviewDialog()` | `bz-diary-review` |
| 日程规划（明日日记） | `planTomorrow()` | `bz-diary-plan` |

## 用户三项决策

1. **复盘作为日记条目写入**——原宏是「往当日 md 文件末尾追加 markdown」，与 diary 域「按日期一个 md、整文件重写」的条目模型冲突（追加内容会被下一次重写冲掉/错位），必须走 `addEntry` 条目链路。
2. **打勾状态沿用原 JSON**——`CONFIG/SCRIPTS/每日任务状态.json`，格式 `{ "YYYY-MM-DD": { taskId: boolean } }` 不变，旧数据零迁移直接续用（铁律 1）。路径硬编码不走 `storagePath`（兼容决定）。
3. **入口 = 命令 + 日记面板按钮**。

## 实现

新增 `src/diary/daily.ts`（单一入口模块，三件事都在内）：

- **任务打勾**：`DAILY_TASKS`（7 项定义，顺序即弹出顺序）+ `TASK_TIME_RESTRICTIONS`（accounting≥12 点，diary/work_summary/review_words/review_index≥16 点）；`selectDueTasks(status, today, hour)` 纯函数筛待问项（true/false 均算已问过、未到时间跳过）；`runTaskCheck()` 用 `jsonFileStore` 读 → `openFlowDialog` 逐项弹选择（取消=跳过不计）→ `updateFileSections` 段级合并写回（只声明今天一段，其他日期/其他写方段落保留）。
- **每日复盘**：`REVIEW_TEMPLATE`（`## 当日复盘` + 触动点三问）经写日记弹窗 preset 预填——`openAddDialog({ tags:['复盘'], content: REVIEW_TEMPLATE })`，保存链路完全复用既有。
- **日程规划**：`buildPlanContent()` 三段（代办事项 / 完成情况跟踪 / 备注）；`planTomorrow()` 写前先保证 `diaryDataMap` 完整（为 null 时先 `loadAll()`，防整文件重写丢数据），检测 `PLAN_MARKER`(`### 代办事项`) 已存在则跳过。

配套改动：

- `src/diary/config.ts`：`DEFAULT_TAGS_CONFIG` 加 `复盘: { emoji: '🪞' }`。
- `src/diary/ui/dialogs.ts`：`openAddDialog(preset?: AddDialogPreset)`，`{ tags?, content?, date?, time? }`——预激活标签按钮、预填 textarea、覆盖默认日期时间；**无参行为不变**（回归用例覆盖）。
- `src/diary/ui/panel.ts`：头部行写日记按钮后加 📋 / 🪞 / 🗓️ 三按钮。
- `src/main.ts`：COMMANDS 表加三条（循环自动注册/卸载，无需另接线）。

## 测试

- `tests/diary/daily-tasks.test.ts`（node）：`selectDueTasks` 六分支 + 任务定义自洽 + 两个模板结构（12 例）。
- `tests/diary/daily-flow.test.ts`（jsdom）：`runTaskCheck` 七例（全完成/未完成/取消跳过/全取消不写盘/无待问/段级合并保留其他日期/已记不再问）、`planTomorrow` 三例（首次创建/重复检测/未加载先 loadAll）、`openReviewDialog` 两例（preset 生效 + 无 preset 回归）（12 例）。
- `tests/smoke.test.ts`：`EXPECTED_COMMAND_IDS` 补三条。

## 门禁

tsc 0 错 + 全量 4210 测试绿（新增 24 例）+ 构建部署。
