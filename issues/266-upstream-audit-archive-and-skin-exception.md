# 266 — 上游吸收·全面审计归档 + 皮肤例外条款落地

日期：2026-09-13 ｜ 类型：docs（零代码）｜ 状态：**已完成**
来源：用户「对本地插件与 yeshimei/bz 做一次全面核查对比」+ 追加「整理出可直接全盘吸收的项目」+ Q1~Q7 拍板
关联：ADR-0117（选择性吸收双门槛）、ADR-0120（纪律与冻结清单）、**ADR-0121（本次二次修订：新增第 5 条皮肤/外观层例外）**

本票**不含任何源码改动**。产出 = 1 份 ADR 修订 + 本归档票（审计结论内联）。

---

## §1 送审基线（已核实，非推断）

| 项 | 事实 |
|---|---|
| 本地 HEAD | `095872f8`（2026-09-13，"吸收上游剪藏本整域升级（issue 265）"） |
| 上游基线 | `7b06f4b4`（2026-09-12 22:24）。**WebFetch `api.github.com/repos/yeshimei/bz/commits` 复核：master 顶端无漂移** |
| 共同祖先 | `af7ed6b5`（2026-08-31，"叫我包仔"） |
| 分叉后提交 | 本地 64 / 上游 1156 |
| 差异条目 | 1773（其中 `.zcode/skills/**` 826 条为软链接误读的删除，不计） |
| 本地票号 | 最大 265 → **本票 266**；下一张吸收票从 **267** 起 |
| 本地 ADR | 最大 0121 → 本票为**就地增补**（不占新号） |

**基线锁定决策**：本轮全部工作以 `7b06f4b4` 为唯一比对基准。上游约 89 提交/天，**不追最新**——手上这批吸收完再统一对齐一次，否则菜单边做边过期。

---

## §2 交付物

### 2.1 ADR-0121 二次修订（本次核心决策）

- **新增第 5 条「皮肤/外观层例外」**：四板块的皮肤/外观层可按上游走，判据 = **不影响现有功能实现**。
  可核验化为一句话：**把这段 diff 回滚后，插件行为完全不变、只是外观退回旧样式** → 允许；否则不允许。
  允许落点 = CSS 变量/选择器/规则体/样式源文件；禁止落点 = DOM 结构、控件类型与实现、事件绑定、交互流程、数据字段、设置项键名与选项语义。
- **第 3 条第 1 项作废**：原文「全域皮肤剔除 `diarySkin` 与任何 review 相干组」与用户新裁决直接冲突，已就地标注作废并指向第 5 条。
- **防后门条款**：第 2 条「AI 设置/小橘设置板块不得更换控件实现」**不被本例外豁免**——皮肤例外只放开样式，不放开控件（故 ADR-0127 路径选择器换控件仍属禁止）。
- 「后果」节新增：走皮肤例外的票必须附**回滚自检记录**（列出只碰了哪些样式文件 + 回滚后行为不变的理由）。

### 2.2 审计证据（四份，脚本与产物均在 `.scratch/upstream-audit-2026-09-13/`）

> ⚠️ `.scratch/` 已 gitignore，**不入库**。故本票 §3 内联核心结论；原始产物若需长期留存，另立票复制到 `docs/`。

| 证据 | 脚本 | 用途 |
|---|---|---|
| 红线双向 import 扫描 | `redline-scan.py` | 判「该域碰不碰红线」 |
| AI/settings 符号比对 | `ai-deps.py` | 判「它调的 AI 接口本地有没有」 |
| 逐域逐文件差量 | `per-domain-delta.py` | 量工作量（difflib，不受 git 改名检测影响） |
| 红线域接口契约 | `redline-contract.py` | 提取「搬动时不许改名的导出」 |

### 2.3 两条必须记住的既存风险（承接上轮，未变化）

1. **工作区脏在红线上**：未提交改动含 `src/diary/`（7 改 + 删 `repair.ts`/`ui/repair-modal.ts` + 新增 `daily-write.ts`）、`src/recap/summarize.ts`、`src/review/`（4 改）、`src/core/storage.ts`、`src/main.ts`。
   → **用户 2026-09-13 裁决：暂不提交，也不改动**。本票未碰、未提交、未 stash。
   → 开工一律走 `git worktree` 从 `095872f8` 分叉，物理隔离。
   → **严禁 `git add -A` / `git commit -a` / `git stash -u`**：工作区另有 `.zcode/**` 827 条 + `.scratch/**` 的删除待提交，全量操作会连带删除并提交。
2. **上游把真实日记素材入库**（隐私）：上游 `prototypes/diary/prototype-data.js` = `我的/日记|影视|信|书库` 的 md 原文逐字（其 `PROTOTYPE.md` 自证），`assets/` 含 106 个真实媒体文件。上游 `.gitignore` 未排除 `prototypes/` → 已跟踪。**本地绝不吸收 `prototypes/diary/`**；处置在上游仓，超出本仓职权。

---

## §3 可直接全盘吸收清单（核心结论）

### 判定门槛（四条，全满足才进「全盘」）

1. 自己不 import 红线代码（`diary/`、`recap/`、`review/`、`settings.ts`）；
2. **不用上游 `core/ai.ts` 的本地没有的导出**——本地 7 个：`createAI`、`getAIProvider`、`AIService`、`AIOptions`、`AISettingsLike`、`setAISettingsProvider`、`resetAIProviderCache`；上游多 4 个：`AIProviderDescriptor`、`AI_IDLE_TIMEOUT_MS`、`AI_PROVIDER_REGISTRY`、`getProviderDescriptor`；
3. 红线域不反向依赖它（或只依赖稳定接口）；
4. 无占位/未收尾。

### 第一档 ★ 完全干净（零红线 + 零契约 + 零改造）

| 序 | 功能 | 上游票 | 差量 | 待处理 |
|---|---|---|---|---|
| ★1 | **待办本**（上游「备忘录」）面板重做 + 6 项设置 | 260/266/268/269/284/292/293 | +1277/−852 | 路径 `memo/`→`todo/`；上游多 `render.ts`（238 行，域图标表） |
| ★2 | **归物本三项设置** | 295 | +397/−202 | 保留本地 `default-categories.gen.ts` |
| ★3 | **知识盒**（本地术语/文献盒）：来源框、弹层补全、重复渲染修复、标题改陈述句、生成即跑双链 | 255b/257/258/275/276/298 | +1976/−1658 | 路径 `knowledge/`→`literature/` |
| ★4 | **番茄钟结构件**（相位纯函数 + 渲染层） | core/pomodoro-phase.ts + pomodoro/render.ts | +179/−173 | **必须保留本地 `skin.ts`**；需新增 `core/pomodoro-phase.ts` |

★3 的红线证据：`knowledge/note-gen.ts` 只用 `createAI`（本地有）；`knowledge/ui.ts` 引 `../settings` 是 **`import type BzSettings`**（纯类型），不碰 AI/小橘板块。
★4 的横切点：`core/pomodoro-phase.ts` 上游同时被 `home/shared.ts|state.ts|ui.ts` 引用；本轮不搬首页，故该文件只被番茄钟消费。
改名对位：`memo` ⇄ `todo`（11/10 文件）、`knowledge` ⇄ `literature`（9/9 文件），**逐文件同名完美对位**。

### 第二档 ◆ 可整域搬，但必须守住导出名

| 序 | 功能 | 上游票 | 差量 | 不许改名的导出（红线域在用） |
|---|---|---|---|---|
| ◆5 | **影院**（标记已看改弹编辑窗等） | 286 | +579/−738 | `cinema/data→parseMovieFile`；`cinema/constants→STATUS_WATCHED,getStarString` |
| ◆6 | **保险库**（锁屏统计 + 只接保险库侧） | 300/ADR-0124/299 | +1159/−951 | `encrypt→getSafeManager,ensureSafeUnlocked`；`encrypt/ui→collectNoteAttachmentPaths,kindOf`；`encrypt/data→LockAttachmentInput,bytesToBase64` |
| ◆7 | **第二大脑**（真全屏 + 滚动模型 + 视觉重写） | 272/ADR-0114/251b | +2111/−1474 | 无红线契约（`smartcat/memory.ts` 依赖其 `config`/`ollama`，需保持） |

◆6 契约即「只接保险库侧」的落地依据：日记域实际只调 6 个函数，三域共用锁屏的 diary 分支**不接**，日记侧一行不动。

### 第三档 ○ 零成本小对齐（本轮新发现）

| 序 | 功能 | 差量 | 备注 |
|---|---|---|---|
| ○8 | 自动摘要 | **+14/−5** | 只用本地已有 AI 导出，近乎纯同步 |
| ○9 | 数据体检 | +61/−49 | 零红线 |
| ○10 | 书架墙 | +248/−286 | 须保 `bookshelf/data→loadEpubItems,scanMarkdownBooks` |
| ○11 | 附件搬运 | +11/−28 | 本地 `index.ts` 多 25 行（有自建）→ 人工对位，勿直接覆盖 |

### 第四档 △ 需小改造，不算「全盘」

| 序 | 功能 | 原因与路径 |
|---|---|---|
| △12 | **收藏本**（默认筛选 + 默认排序） | 上游 `favorites/ai.ts` 用了本地没有的 `getProviderDescriptor`，而它住在 `core/ai.ts`（红线③，不可改）→ **窄化路径**：只搬 `favorites/ui.ts` 的筛选/排序 + 域内设置，完全不碰 `ai.ts` |

### 出局（再次确认）

- **首页**：`home/river.ts` 直接 import `recap/aggregate`（2 处）+ `review/app` + `review/data`；`home/shared.ts` 亦 import `recap/aggregate` → 双向压在红线①②。**不做**。
- **设置面板**：`settings-panel/ui.ts` 同时 import `diary/settings` + `review/app` + `review/ui` + `../settings` + `smartcat/data` + `smartcat/ui` → 四条红线全中。**不做**。
- **读书报告**：零红线，但本地 `report.ts`/`stats.ts` 有大量自建改动（+264/−318、+7/−49），属「人工对位」非「全盘」。暂缓。

---

## §4 皮肤例外逐条裁决（第 5 条判据的实际应用）

> 已逐个打开上游票面核实，含「是否占位」判断。

| 候选 | 上游票 | 核实到的真相 | 裁决 |
|---|---|---|---|
| **S1 模型选择器弹窗样式** | 265 | 上游 bug 根因 = `settings-panel/styles.css` 暗色 token 块里 `#bz-model-picker-popup` **丢了 `.theme-dark` 前缀**，成无条件命中的普通选择器，把浅色 token 灌进暗色上下文 → 黑底黑字。**已核实本地不存在这条规则**：本地暗色块只有 `.bz-sp-desk`/`.bz-sp-mobile`/`.bz-sp-mob-modal`/`.bz-sp-picker-mask`，**全部带 `.theme-dark` 前缀**（`src/settings-panel/styles.css:34-37`）→ **本地不复现该 bug**。本地 `#bz-model-picker-popup` 走通用 `.bz-overlay-popup` 皮（`src/core/styles.css:1155-1179`，用 Obsidian 原生变量，暗色下自配套） | **不立票（本地非 bug）**。剩余价值仅"让模型弹窗与设置面板同皮"的视觉统一——属纯皮肤项，视觉会变、收益不明，**暂不做**；若你日后觉得不协调，再单独立票 |
| **S2 diarySkin / reviewSkin** | 246 | 上游 `settings.ts` 注释自证是**占位键**：「域 UI 消费在各域真做皮肤时接入（届时挂 onChange 热切换）」。默认值 `diarySkin:'default'`/`diarySkinTheme:'gallery'`、`reviewSkin:'default'`/`reviewSkinTheme:'sage'`，**无 apply、无 CSS → 选了没有任何视觉变化** | **不吸**。它不是皮肤，是设置页里的两张无效选项卡。符合用户「上游自认占位的东西别当真功能」 |
| **S3-a 隐藏滚动条单源** | 277 | core 新增一条界面级规则（`[class^="bz-"]`/`[id^="bz-"]` 等通杀）**+ 删各域重复声明**（含 `diary:57-66`、`review:23-24`） | **只吸前半段**：core 新增一条规则 = 纯新增、零风险。**域内重复声明的删除暂不做**——视觉完全等价（新规则已覆盖），却要动红线域样式文件，收益为零 |
| **S3-b 遮罩毛玻璃** | 282 | `--bz-overlay-blur` token 单源 + 各域遮罩统一（含 `diary×2`、`review×3`） | **可吸（纯 CSS）**，但两点须知：① 视觉会**真的变**（遮罩加 blur）——这就是皮肤例外的正常用途；② 要改 `diary`/`review` 的样式声明 |
| **S3-c 暗色补齐扫尾** | 270 | 非红线域（memo/belongings/secondbrain/knowledge/reading-report）纯 CSS 暗色 token；**但 review 部分 = quiz 弹窗 96 行样式找回 + 统计/历史弹窗内联 55→19（含 `.ts` 改动）** | 前半段**随各域票走**（不单独立票）；**review 那部分不吸**——含 .ts 改动、收益低、且本地 review 工作区尚有未提交改动，风险收益比不成立 |

---

## §5 开工前置（Q3~Q7 用户授权自行判断，采纳如下）

| 问 | 决策 |
|---|---|
| Q3 工作区 | **不提交、不改动、不 stash**。全部开发走 `git worktree`，从 `095872f8` 分叉 |
| Q4 基线 | **锁死 `7b06f4b4`**，本轮不追上游最新 |
| Q5 门禁 | 一律在 worktree 内跑：`node node_modules/typescript/bin/tsc --noEmit` + `node node_modules/vitest/vitest.mjs run`（并发时 `BZ_TEST_MAX_WORKERS=8`）+ `node esbuild.config.mjs production`。构建产物（根 `main.js`/`styles.css`）**不提交** |
| Q6 票号 | 266 = 本票；吸收票从 **267** 起。ADR 不占新号（0121 就地增补）。术语沿用 `CONTEXT.md` |
| Q7 顺序 | 267 待办本 → 268 知识盒 → 269 归物本 → 270 番茄钟 → 影院 → 保险库 → 第二大脑 → 小对齐打包票 |

**纪律不变**：一次一域一票；写码前先以大白话向用户确认理解；上游守卫型测试不搬（票 259 实证全部失败）；每票交付须 tsc / 全量 vitest / production 构建三道门禁全绿。

---

## §6 验收

- [x] ADR-0121 二次修订落盘（第 5 条 + 第 3 条第 1 项作废 + 后果节补充）
- [x] 审计四份证据产出（`.scratch/`，含可重跑脚本）
- [x] 「可直接全盘吸收清单」三档分级 + 出局项 + 皮肤例外逐条裁决
- [x] 零源码改动、零提交、零触碰用户未提交改动
- [ ] （后续）267 起逐票吸收
