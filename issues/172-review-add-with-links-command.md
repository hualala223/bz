# Ticket 172 — 「批量加入复习计划」命令接入与文档同步（review add with links，切片 02）

> 父 spec：issues/170-review-add-with-links-command.md
> 状态：`ready-for-agent`

## What to build

把切片 01 的批量加入能力接为永久命令 `bz-review-add-current-with-links`「批量加入复习计划」：命令面板（取 active file）+ 文档内右键（editorCallback）双入口，仅在 main.ts COMMANDS 表注册一次。同步文档与实测一致：smoke 命令数 36→37、AGENTS.md 命令数、CONTEXT.md「复习计划」条补批量加入入口一句、PROGRESS.md 记票。门禁全绿后可合并交付。

## Blocked by

- 171（批量加入应用层）

## Acceptance criteria

- [ ] 命令面板可搜到「批量加入复习计划」，执行后当前文档及一级出链加入复习计划，汇总通知出现
- [ ] 文档内右键待选命令可见并可触发；卸载全量 removeCommand
- [ ] smoke 命令数断言 36→37；AGENTS.md / CONTEXT.md / PROGRESS.md 同步
- [ ] 既有 `bz-review-add-current` 行为与文案不变
- [ ] 门禁全绿：pnpm test + pnpm exec tsc --noEmit + 构建 + diff 自审
