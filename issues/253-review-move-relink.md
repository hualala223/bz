# issue 253：复习计划挪动兜底——同名唯一自动接回（ADR-0115）

## 现象

用户报：2026-09-10 监听文件夹 `卡片盒/笔记盒` 自动加入的 23 篇新笔记，次日被挪到 `卡片盒/文献/` 后，逾期复习列表不再显示。

## 定性

- review.json 中 23 条记录仍在、排除名单为空 → 没被移出，也没被黑名单挡；
- 但 filePath 全部停留旧路径（笔记盒已空）→ rename 事件丢失（Obsidian 关闭期间挪动，启动不补发事件）；
- 路径失效 → `loadItems` 判 `isMissing` 挂起 → **不计逾期、不进复习队列** → 用户视角「消失」。

## 方案（ADR-0115）

挪动兜底：失效条目 × vault 同名文件**双向唯一** → 自动接回原排期。

- 启动收敛：`relinkMissingByBasename()`（ensureReview 2s 首查内调用）；
- created 实时接回：`relinkOneByBasename()`（onVaultCreate 入口先试，不限监听目录）；
- 歧义（vault 重名 / 挂起同名多条 / 目标在计划或排除名单）一律不动。

## 验收

- [x] 接回后进度/排期原样保留（走既有 `updateFilePath`）
- [x] 接回 ≥1 条 toast 提示；0 条静默
- [x] 三类歧义场景不动（测试覆盖）
- [x] created 实时接回不再走自动加入（无双记录）
- [x] vitest 全量绿 + tsc 0 错 + 构建部署通过
