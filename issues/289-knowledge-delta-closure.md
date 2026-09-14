# 289 · 知识盒剩余差量收口（上游 issue 278 命令入口 + 领域提示去枚举）

## 背景

用户问「文献盒是不是被改成知识盒了」后点名「把上游的知识盒拿进来」。归一比对（knowledge→literature 词形归一）确认：本地文献盒与上游知识盒的数据/逻辑层**早已基本同步**（昨天 `e33f6d4c` 吸收 issue 269、`1e720f92` 吸收 issue 262；issue 298 生成即建链本地 secondbrain/link-agent 已实现；5eb1c80b B 站联网收窄本地 video-meta 已含；票 284 短链解析为本地领先）。UI/样式两套体系（票 288 前既定策略）维持本地。

## 真实差量（仅 2 项）

1. **`bz-literature-note-video`（视频生成文献笔记）命令入口**：上游 `bz-knowledge-note-video` → `openKnowledgeAddTask`（弹视频录入窗）。本地 `openLiteratureAddTask` 函数早已存在（clipbook「保存至文献」分流在用，ADR-0068），只缺命令注册。
2. **领域提示去示例枚举**（上游 ff230b27）：note-gen AI 提示 `"领域，用一个中文词（如 物理/医学/…等）"` → `"领域，用一个中文词"`。

## 明确排除（核验记录）

- issue 275 预览双份/兜底判据修复：修的是上游 ADR-0112 重建版 UI 的 openPreview（预填+追加渲染=双份）；本地文献盒无该弹层（ticket 136 改版体系），无同病灶。
- 上游 data.ts `migrateLegacy`：上游自有旧文件名迁移（ADR-0112 正名），本地数据文件一直叫 literature.json，无迁移需求。
- issue 291 全域子弹窗浮层壳 / 277 滚动条收敛 / 7aa8c7d6 settings-panel 通用化：全域 UI 体系改造，按「UI/样式两套体系」既定策略排除。

## 实施

- `src/main.ts`：+1 命令（`bz-literature-note-video`，icon list-video，直呼 `openLiteratureAddTask(getApp())`）；import 补 `openLiteratureAddTask`。
- `src/literature/note-gen.ts:60`：领域提示去枚举。
- `tests/smoke.test.ts`：EXPECTED_COMMAND_IDS +1（71→72）。
- AGENTS.md / PROGRESS.md 数字口径同步（72）。

## 验收

- [x] tsc --noEmit 0 错
- [x] vitest 全量 303 文件 / 4762+ 用例通过
- [x] esbuild production 构建通过
- [x] 命令数口径 71→72 双文档同步
