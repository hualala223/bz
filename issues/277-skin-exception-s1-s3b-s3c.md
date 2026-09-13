# 277 — 皮肤例外落地：S1 模型弹窗同皮 + S3-b 遮罩毛玻璃单源 + S3-c quiz token 对档

日期：2026-09-13 ｜ 类型：style（纯 CSS，零 DOM/控件/交互改动）｜ 状态：已交付
来源：用户裁决「④跟上游保持一致」（对票 266 §4 暂缓候选的翻牌）；依据 **ADR-0121 第 5 条皮肤/外观层例外** 执行
关联：票 266（皮肤例外逐条裁决 S1/S3-a/S3-b/S3-c）、上游 issue 265 / 270 / 282（ADR-0123）

## 交付内容

### S1 模型选择器弹窗与设置面板同皮（上游 265 纯 CSS 剥离版）
- `src/settings-panel/styles.css`：亮/暗两组 `--sp-*` token 作用域各挂 `#bz-model-picker-popup`（暗色组带 `.theme-dark` 前缀——上游 265 的 bug 根因即丢前缀，本地从源头带对）；追加弹窗内部皮收口段（头部描边/内容区/行 hover·选中/名称·来源/空态全消费 `--sp-*`）+ 移动端 `@media ≤768px` 卡片 max-height 安全区夹取（纯视觉，无行为改动）。
- **不吸**：上游夹带的 `.bz-sp-mobile` inset:0 真全屏重构 + `bz-panel-mtop` 类名（ui.ts DOM 改动，属行为/结构层；本地设置面板移动端有自身机制）。
- 弹窗 DOM 核实：本地 `core/settings-model-picker.ts` 内部类名与上游逐字一致（diff 过），CSS 选择器全命中。

### S3-b 遮罩毛玻璃 token 单源（上游 282 / ADR-0123 收编）
| 域 | 遮罩 | 改动 | 提交 |
|---|---|---|---|
| diary×3 | add-diary / tag-selector / date-filter | `blur(2px)` → `blur(var(--bz-overlay-blur))` | **不提交**（文件含用户在制改动，随其工作落盘生效） |
| quiz×1 | #quiz-mask | 同上 | 提交 |
| encrypt×3 | dialog / health / vault-dlg | 加 `backdrop-filter` token 行 | 提交 |
| favorites×1 | form-mask | 加 token 行（`--mask` 品牌底色保留） | 提交 |
| literature×1 | .bz-lit-mask | `--background-modifier-cover` 收编 `--bz-overlay` + token | 提交 |
| settings-panel×1 | picker-mask | 加 token 行（暖黑底色保留） | 提交 |
- 不动：smartcat（双方本就一致，且属小橘域）、password-vault（本地无此域）、review 统计/历史弹窗（本地为 stats-ui.ts 内联，属 .ts 层不吸）。

### S3-c 暗色补齐扫尾（上游 270 批）
- **quiz token 对档**（上游「quiz 弹窗 96 行样式找回」剥离版）：本地 quiz 规则集与上游一一对应，仅做取值对档——原生变量 → `--bz-*` token、硬编码绿/红 → `--bz-success/--bz-danger`（color-mix 等价）、弹窗壳对齐 `--bz-radius-md/--bz-shadow-lg/82vh`；无消费者的 `@keyframes spin` 随上游退役。
- **todo / secondbrain / belongings 暗色：已随票 267/273/268 进入**（`.theme-dark` 计数 local=upstream：45/45、28/28、8/8，实测核对），本票零改动。
- **不吸**：reading-report 去内联+暗色（187→6 处内联含 .ts 重构，非纯皮肤，随读书报告独立票）；knowledge 风格化收编（与本地文献盒自有 UI 两套体系冲突，ADR-0118 本地优先）。

## 回滚自检记录（ADR-0121 第 5 条要求）

- **改动落点清单**：`src/settings-panel/styles.css`、`src/quiz/styles.css`、`src/encrypt/styles.css`、`src/favorites/styles.css`、`src/literature/styles.css`、`src/diary/styles.css`（仅样式）；无任何 `.ts`/DOM/事件/数据/设置键改动。
- **回滚判据**：把本票 CSS diff 整体回滚后，插件全部点击、读写、命令、设置项语义完全不变，仅外观退回旧样式（弹窗退回通用 `.bz-overlay-popup` 皮、遮罩退回无 blur/旧 blur(2px)、quiz 退回旧取值）。`tests/core/overlay-blur.test.ts` 为文本守卫，回滚后该测试红——这是守护本身，非行为回归。
- **防后门确认**：模型选择器属 AI 设置板块，本票只改其 CSS（控件实现/DOM 未动），不违反 ADR-0121 第 2 条「板块控件不换实现」。

## 守卫

- `tests/core/overlay-blur.test.ts` 10 例：token 定义存在、8 处遮罩规则挂 token blur、六域无残留 `blur(2px)`、S1 双 token 作用域挂接（暗色带前缀）+ 收口段禁原生变量回潮。

## 门禁

- [x] 守卫 10 例 + tsc --noEmit 0 错误
- [x] 全量 vitest + production 构建见 PROGRESS 收尾记录
