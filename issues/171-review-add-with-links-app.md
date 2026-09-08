# Ticket 171 — 批量加入应用层：出链收集 + 批量加入方法（review add with links，切片 01）

> 父 spec：issues/170-review-add-with-links-command.md
> 状态：`ready-for-agent`

## What to build

review 应用层新增完整的「批量加入」能力：给定当前文档，收集它的一级出链（正文链接 + frontmatter 链接，经 Obsidian 链接解析还原为 vault 内 .md 文件，断链与非 .md 丢弃、按链接目标去重），连同当前文档逐篇查重加入复习计划（已在计划中的跳过、不动排期），并按结果给一条汇总通知（新增 X 篇 / 跳过 Y 篇；X>0 success、X=0 info）。当前文档非 .md 时整单拒绝、零副作用。本切片不含命令注册，验收靠测试全绿。

## Blocked by

None (can start immediately)

## Acceptance criteria

- [ ] 出链收集为纯函数（文档缓存与解析器注入），覆盖正文链接、frontmatter 链接、去重、断链丢弃、非 .md 丢弃
- [ ] 全部新文档 → 全部入列（含默认首排）+ success 汇总通知
- [ ] 部分已存在 → 新的入列、旧条目排期字段不变 + 汇总通知；全部已存在 → 零写数据 + info 通知
- [ ] 当前文档已在计划中不中止，出链仍处理；当前文档非 .md → 拒绝且零副作用（与单篇命令同文案）
- [ ] 复习数据格式零改动（review.json 既有字段不变）
- [ ] `pnpm test`（相关文件）+ `pnpm exec tsc --noEmit` 全绿
