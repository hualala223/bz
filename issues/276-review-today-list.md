# 276 - 复习域：今日已复习列表（点击打开原文，强制阅读模式）

## 需求（2026-09-13，grill-with-docs 四问全部推荐）

- 新增命令 `bz-review-today`「今日已复习」：独立弹窗罗列当天复习过的文档。
- 条目 = 文档名 + 最后复习时间（HH:MM）+ 当天复习次数 + 最后评级，按 `lastReviewed` 倒序。
- 点击条目 → **新标签页**打开原文并**强制阅读模式**（`openFile({ state: { mode: 'preview' } })`），点击后先关列表（否则文档被遮罩挡住）。
- 空态文案「今天还没有复习记录」；文件缺失（挂起记录）标灰删除线，点击 warning 提示不报错。
- 「当天」口径沿用既有术语 **当天已复习 (Reviewed Today)**：`lastReviewed` 落在本地日历日（`isReviewedToday`/`sameLocalDay`），零新增数据字段。

## 实现

- `src/review/today.ts`（新增）：`collectTodayReviewed`（纯函数，node 可测）+ `showTodayReviewed`/`closeTodayReviewed`（createOverlay 共享壳 + bz-win-head/bz-win-close + escManager，骨架对齐 stats-ui）。
- `src/review/index.ts`：`openTodayReviewed(app)`（ensureReview + 懒加载 today）。
- `src/main.ts`：COMMANDS 表注册 `bz-review-today`（icon: history）。
- `src/review/styles.css`：`.bz-review-today-*` 正文列表样式（壳样式走 core components）。
- 全插件首个强制阅读模式先例（此前无任何 setViewState/mode:'preview' 用法）。

## 测试

- `tests/review/today.test.ts`：纯函数 6 例（筛选/倒序/次数/评级/挂起/空态兜底）。
- `tests/review/today-ui.test.ts`：UI 3 例（列表+点击阅读模式、挂起记录、空态+幂等关闭）。
- `tests/smoke.test.ts`：EXPECTED_COMMAND_IDS + 命令名断言。

## 决策记录

- 入口选独立命令而非塞进复习会话汇总页/统计弹窗（Q1）：随时可调出，不依赖刚复习完的时机。
- 打开方式选新标签页 + 总是强制阅读（Q3）：不碰正在编辑的标签页；不保留「保持当前模式」分支。
- 点击行后关闭列表：遮罩 z-index 高于工作区，不关则打开的文档不可见。
