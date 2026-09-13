# 票 274 · 小对齐打包（四小域行为修复 + core S3 视觉单源）

日期：2026-09-13 · 状态：已交付 · 提交：见 git log「ticket 274」

## 一句话结论

队列收尾票：auto-summary / attach / checkup / bookshelf 四小域吸收上游行为修复与评审补丁，core 落地 S3 的三段纯视觉 CSS（遮罩毛玻璃单源 + bz 界面隐藏滚动条单源 + `--bz-vvh` 变量段），全量 286 文件 / 4511 例全绿。

## 吸收内容（21 文件：20 改 + 1 新增）

### auto-summary（上游 F9 + 276）
| # | 内容 | 落点 |
|---|---|---|
| 1 | **F9 重试走域队列**：失败通知「重试」改经 `retrySummaryWithAI`（复用 `enqueueJob`/`processingPaths` 去重），双击/并发只跑一次 AI，不再双倍花费；函数级动态 import 解 processor←→index 环 | `src/auto-summary/index.ts`（新函数）、`processor.ts`（重试按钮改接线） |
| 2 | **标题提示词禁疑问句**（上游 276）：「完整陈述句或疑问句」→「完整陈述句，不得使用疑问句或疑问语气（为何/为什么/怎么/如何/吗/呢）」 | `processor.ts` FIELD_DEFS.title + 测试断言 ×2 |

### attach（上游 F10）
| # | 内容 | 落点 |
|---|---|---|
| 3 | **F10 md 链接两形态剥壳**：`<my image.png>`（尖括号含空格）与 `path "标题"`（尾标题）原样进 resolveTarget 永远匹配不上 → 清单偏小漏搬附件；现剥壳后归一 | `src/attach/data.ts` |
| 4 | 触屏行 padding 硬编码 `12px` → token `var(--bz-space-md)`（纯视觉） | `src/attach/styles.css` |

### checkup（上游双链核对 + 291 评审补 + 体检覆盖面）
| # | 内容 | 落点 |
|---|---|---|
| 5 | **检查四升级双链核对**：单例链（loadItems 口径快照）× 直读链（`normalizeItem` 实际归一）各自计数比对，归一链分叉报红「双链计数不一致」；上游 `memo/data` 对位本地 `todo/data`（ADR-0118 命名保留），首部注释按本地口径改写 | `src/checkup/checks-consistency.ts` 整文件（字段 storeView/rawView） |
| 6 | **体检覆盖面补 `clipbook.json`「剪藏本侧写」**扫描行（本地此前只扫 news.json） | `src/checkup/files.ts` |
| 7 | 「清除」失效引用确认钮标 `danger: true`（删除类主动作主钮不高亮，上游 291 评审补；本地 core/flow-dialog 已支持） | `src/checkup/ui.ts` |
| 8 | 测试：检查四 describe 换双链版（含双链分叉报红用例）；ui.test 的 flowMock 参数透传 + danger 断言 | `tests/checkup/data.test.ts`、`ui.test.ts` |

### bookshelf（上游 G12 + 291 皮肤贯通 + 继续读）
| # | 内容 | 落点 |
|---|---|---|
| 9 | **G12 假成功修复**：`updateComment`/`deleteHighlight` 预检命中后**重放未命中**（并发改动高亮原文）旧实现全文原样写回仍报成功并关弹窗（编辑丢失）；现走失败路径（notice + return false，deleteHighlight 失败也重开壳） | `src/bookshelf/notes.ts` |
| 10 | **借书卡「继续」钮**：在读条目状态行内嵌 `data-bs-d-continue` 跳书钮（`openLinkText` 落回 Weave 上次阅读位置）；本地 `×` 关闭钮**保留共存**（271 同裁决：关闭钮不退役） | `shared.ts`（go 按钮 markup）、`ui.ts`（continueBook + 接线）、`styles.css`（.bz-bs-d-go/.bz-bs-d-nowrap） |
| 11 | **删除划线确认框皮肤贯通 + danger**：md/EPUB 两处 `openFlowDialog` 补 `className: 'bz-bs-flow-dialog ' + bsSkinClass()`（流程框挂 body 脱离面板树掉回 core 裸皮）+ `danger: true` | `src/bookshelf/notes-ui.ts` ×2 |
| 12 | **确认框纸卡映射段**：`#__shared_confirm_popup__.bz-bs-flow-dialog` 规则块（底/描边走 --bsw-* 域变量 + 自带字体栈，与借书卡详情弹窗同一套取值） | `src/bookshelf/styles.css`（从上游整段移植） |
| 13 | **ESC 样板收口**：本地手写 `mainEscRegistered` 幂等守卫 → core 新样板 `registerPanelEsc`/`unregisterPanelEsc`（行为等价，幂等注册） | `src/core/esc-manager.ts`（追加样板）、`ui.ts`（换用） |
| 14 | 测试：删成功通知断言 ×5（G12 版成功不再弹通知）、改用例名 ×2、**新增 G12 回归 ×2**（并发改动原文 → 不假成功）、G11 用例、issue 291 describe（3 个样式源文本断言） | `tests/bookshelf/notes.test.ts`、`notes-ui.test.ts`、`flow-dialog-skin.test.ts`（新，照搬上游 80 行） |

### core S3 视觉单源（上游 270/277/282 纯 CSS 部分）+ cinema 1 行
| # | 内容 | 落点 |
|---|---|---|
| 15 | **遮罩毛玻璃单源**：3 处面板/弹层/遮罩 `background: var(--bz-overlay)` 后补 `backdrop-filter: blur(var(--bz-overlay-blur))`（变量本地已定义） | `src/core/ui/components.css` |
| 16 | **bz 界面隐藏滚动条单源**（ADR-0122/issue 277）：作用域从 `.bz-panel-overlay *`/`.bz-panel-frame *` 扩到 `[class^="bz-"]` 等前缀选择器 + 遗留容器 id；**只隐藏条不动 overflow**，Obsidian 核心 UI 不受影响（纯视觉） | 同上 |
| 17 | **`--bz-vvh` 变量段**（issue 266 令牌闭环）：≤768px 基线 100vh、@supports 升级 100dvh；JS 侧 `core/viewport.ts` 本地已有，缺的正是这段 CSS | 同上 |
| 18 | cinema 移动端全屏 `height: 100vh` → `var(--bz-vvh, 100vh)`（闭环消费） | `src/cinema/styles.css` 1 行 |

## 明确不吸（含理由）

| 项 | 理由 |
|---|---|
| bookshelf settings「外观组」（面板布局 bookshelfLayout choiceCards + layoutKey 联动） | **本地 `bookshelfLayout` 零消费端**——吸收即死设置；本地「显示」组的 bookshelfSkin 五肤卡保留原位 |
| bookshelf notes-ui 上游版（无 applyMobileWindowFullscreen） | 本地「移动端默认全屏跟随 bookshelfMobileDefaultFullscreen」为本地独有，保留 |
| bookshelf `localDayKey` 转发壳收敛（data.ts/notes-ui.ts 内联日期格式化） | 行为等价纯重构，本地内联口径与 core 同款，避免无谓 churn |
| checkup drift `news.json` 约定加 `rssFeeds` | 本地 news.json（obsidian-news 守护进程写）无该字段，加约定会误报「约定字段缺失」 |
| checkup orphans/run.ts 注释与 yieldToMainThread 转发壳 | 注释无行为；本地 core/utils 无 yieldToMainThread，不值得为转发壳加依赖，保留内联实现 |
| bookshelf/cinema styles.css token 化整换 | 上游 styles 已随 core/item-actions 重构改版（票 271 已裁定不吸该重构），整换会删本地 UI 在用的类；本地独有 UI 样式占大头（cinema 374 行 / bookshelf 含筛选抽屉等），逐 hunk 挑拣收益低。S3 的**行为性**部分已由 #15–17 覆盖 |
| attach `ensureAttachSeed`（上游无） | 本地独有 launcher 磁贴播种，保留 |
| auto-summary 本地 console.log ×3 | 本地调试日志，保留 |

## 门禁与验证

- tsc 0 错；受影响域（auto-summary/attach/checkup/bookshelf/cinema/core）**57 文件 / 894 例全绿**
- **全量 286 文件 / 4511 例全绿**（票 273 后 285/4501 → +1 文件/+10 例：flow-dialog-skin 4 + G11 1 + issue291 3 + G12 2，与新增吻合）
- production 构建通过，产物抽查命中（retrySummaryWithAI / 标题禁疑问句提示词 / 剪藏本侧写 / --bz-vvh / bz- 前缀滚动条选择器 / bz-bs-d-go / bz-bs-flow-dialog）；构建产物已还原未提交
- 冻结域（日记/复习/AI 设置/小橘设置）零接触；`src/settings.ts` 未动（本票未新增设置键）

## 遗留与记录

1. **bookshelf notes 链路未进 main.js**：核查发现 bookshelf notes/notes-ui 的运行时字符串在**主仓、上游双方**的 main.js 里都不存在（借书卡在）——bookshelf notes 的接线方式是既有状态，非本票回归；如需让「删除划线/读书笔记」在插件里可用，应另立接线票排查 main.ts 可达图。
2. 全量跑测试会在 worktree 生成 `test-bundle.js`（136KB，未跟踪）——非 git 跟踪文件，未提交。
3. 队列全部完成（268→274），吸收工程收官；此前各票遗留拍板项见各票文档。
