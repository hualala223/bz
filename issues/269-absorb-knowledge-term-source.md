# 269 · 吸收上游「知识盒（knowledge）功能层增量：术语来源 + URL 净化」

日期：2026-09-13 · 状态：**开发完成，待用户验收** · 上游基线：`7b06f4b4`
关联：ADR-0116（术语来源）、ADR-0118（本地命名保留）、ADR-0120（纪律与冻结清单）、ADR-0121（冻结裁决 + 皮肤例外）、ADR-0104（markup 单源）、票 262（净化单源已搬）

---

## 一句话

本地 `literature`（**文献盒**）与上游 `knowledge`（**知识盒**）的 **UI 与样式已是两套体系**，因此本票**不做整域覆盖**，只把上游**功能层 5 处增量**在本地文献盒 UI 上接线：**URL 净化**、**术语来源（source/sourceTitle）**、**标题/UP主「只补空」**、**AI 标题禁疑问句**、**命令入口带当前笔记作来源预填**。本地术语面板形态（ticket 142 简洁版）、文献列表、样式体系**原样保留**。

## 上游票号

`ADR-0116`（术语来源，术语面板可记录来源：内部笔记写原生双链、外部链接写 URL + 抓标题）、`278`（URL 净化 + 标题与 UP主 同为「只在空时回填」）、`276`（AI 标题指令收敛为完整陈述句，禁疑问语气）、`257`（净化单源补记，**票 262 已搬入本地 `source.ts`**）。

## 背景：为什么这一票不能整域搬

两域 9 个文件**一一对位、无独有文件**，但把改名噪音（`Knowledge`↔`Literature`、`bz-kb-*`↔`bz-lit-*`、`KN_`↔`LIT_`）归一化后：

| 文件 | 归一化后差异 | 性质 |
|---|---|---|
| `types.ts` | 0 / 0 | 已对齐 |
| `source.ts`、`video-meta.ts` | 逐字节相同 | **票 262 已搬** |
| `data.ts` | +3 / −22 | 功能层（见下表） |
| `index.ts` | +4 / −10 | 功能层 |
| `note-gen.ts` | +9 / −23 | 功能层 |
| `processor.ts` | +9 / −14 | 功能层 |
| **`ui.ts`** | **+786 / −839** | **两套界面** |
| **`styles.css`** | **+730 / −951** | **两套视觉体系** |

- 本地 = 文献盒：`bz-lit-*` 类 + Obsidian 变量 + 主面板 / 视频录入 / 历史 / 术语生成四窗口（ticket 136 / ADR-0072）。
- 上游 = P5 词典风知识盒：`.kb` 命名空间 + 自有配色变量 + **部壹文献 / 部贰卡片 / 部叁主题**三部重构（ADR-0112）。

**结论**：`ui.ts` 与 `styles.css` **整体不吸**（直接覆盖会把本地文献盒界面整个换掉）；只挑功能层增量在本地 UI 上接线。

## 吸收的改动

| # | 内容 | 落到哪 |
|---|---|---|
| 1 | **URL 净化接线**（上游 issue 278）：`normalizeUrl` 由「仅去首尾空白」改为 `normalizeSourceUrl(cleanUrlText(raw))`——剥尾随标点 + 剥追踪参数（`spm_id_from`/`vd_source`/`utm_*` 等），保留内容性参数 `p`/`t`；裸 BV 号与非 http 文本原样 | `data.ts`（+import 净化单源） |
| 2 | **术语来源：落盘**（上游 ADR-0116）：`generateTermNote` 新增可选 `source?: TermSource \| null`，内部笔记写原生双链 `[[路径\|名]]`、外部链接写 URL 原文 + 抓到的标题落 `sourceTitle`；键序在 `date` 之后（五键顺序不变，来源追加在后）；来源为 null/缺省不写键 | `note-gen.ts` |
| 3 | **术语来源：面板接线**（上游 ADR-0116）：术语面板新增「来源」行（行首小标签 + 输入框 / chip 二选一）——整串 URL 输入惰性认领为外部来源（450ms 防抖 + 回车即确认）、vault 全部 `.md` 联想点选回填内部笔记来源、chip 显示「内 部/外 部 + 名称 + ✕ 清除」、属性卡来源行可点（内部笔记开笔记 / 外部链接开浏览器）；确认写入随 `source` 落库 | `ui.ts`、`styles.css` |
| 4 | **命令入口来源预填**（上游 ADR-0116）：`openTermNote` 在**无显式 term** 时取当前激活笔记（`.md`）作来源预填候选；主面板「文字录入」按钮入口不带上下文、不预填 | `index.ts` |
| 5 | **标题/UP主「只在空时回填」**（上游 issue 278）：CLI `[bz-info]` 解析出的标题不再直接覆盖——**两键同口径「空则回填」**，录入期手填值不被下载阶段覆盖 | `processor.ts` |
| 6 | **AI 标题指令收紧**（上游 issue 276）：生成视频文献元数据的 prompt 由「完整陈述句**或疑问句**」改为「完整陈述句，**不得使用疑问句或疑问语气**（为何/为什么/怎么/如何/吗/呢）」 | `note-gen.ts` |

> 顺带核实：#5 的注释行（`issue 278 合并口径`）与上游逐字一致；#6 与上游 prompt 逐字一致。

## 明确未吸收

| 项 | 原因 |
|---|---|
| **上游 `migrateLegacy`（ADR-0112 旧数据文件一次性迁移）** | 上游是 `literature.json` **→** `knowledge.json`（上游改名后的迁移）。**本地文件名恰好就叫 `literature.json`**，且本地历史上从未有过该域名/数据文件改名 → 本地**没有旧文件可迁**；照搬反而会把上游格式的 `knowledge.json` 误当"旧数据"复制进来污染本地。→ 不吸，并在 `data.ts` 保持零迁移（注释口径「旧/手改数据零迁移」不变）。 |
| **上游三部重构 UI**（部壹文献 / 部贰卡片 / 部叁主题、卡片盒扫描、**落卡 + 互链 `appendRelatedLine`**、主题笔记） | 属上游**新界面体系**，本地文献盒无此链路。引入即等于换掉本地界面，超出本票范围。`appendRelatedLine` 是 `saveCard()` 互链的配套纯函数，本地无调用方 → 不吸。 |
| **上游 `ui.ts` / `styles.css` 全量** | 两套界面/视觉体系（见上表）。本地风格与 Obsidian 变量体系保留。 |
| **上游 `skin.test.ts`** | 随上游词典风皮肤（`.kb` 作用域）而来，本地无对应皮肤 → 不吸。 |
| **上游「部壹预览」来源块**（`bz-kb-cliplink .bz-lit-srcopen`） | 属上游词典风预览，本地文献列表卡片无来源块 → 不吸；仅吸 `.bz-lit-srcopen` 这个**本地也适用**的可点样式（用于术语属性卡来源行）。 |

## 本地保留（原样不动）

| 项 | 说明 |
|---|---|
| 术语面板形态 | ticket 142 简洁版：无标题、无 placeholder、无状态行，预览只读双卡（上属性卡下内容卡）。新增来源行沿用本地排版口径（行首小标签用与属性卡 label 同款字号/颜色），**未引入上游的「术语/来源同款行」布局改写**。 |
| 文献列表 / 领域筛选 / 视频录入 / 历史窗口 | 一个未动。 |
| 样式体系 | 新增样式全部用本地 Obsidian 变量（`--text-faint` / `--text-accent` / `--background-secondary` / `--background-modifier-border` / `--background-modifier-hover` / `--text-error`），**未引入上游自有 token**（`--line` / `--chip` / `--ink` / `--accent` / `--bz-space-*` / `--bz-radius-*`）。 |
| `literature.json` 数据文件名、`LiteratureData` / `LiteratureTask` 等命名 | 一律不跟上游改名（ADR-0118）。 |
| `shortUrlText` / `openNote` / `_openExternal` | 复用本地既有实现（未搬上游同名但实现不同的版本）。 |

## 测试改动

| 文件 | 处理 |
|---|---|
| `tests/literature/data.test.ts` | 原用例标题补全为「仅去首尾空白（裸 BV 号与非 http 文本原样）」；**新增**净化断言 1 条（B 站带参 / b23 短链 / 知乎 utm / 幂等，照上游 issue 278 口径） |
| `tests/literature/note-gen.test.ts` | **新增** 2 处：①视频文献 meta prompt 断言（含「完整陈述句」「不得使用疑问句或疑问语气」、反向断言不含旧口径，上游 issue 276）；②术语来源 5 条（内部笔记双链 / 显式名 / 外部 URL + sourceTitle + 键序 / 尾标点净化 / null 不写键，上游 ADR-0116） |
| `tests/literature/processor.test.ts` | **新增** 1 条（上游 issue 278）：`title` 已有值不被下载覆盖、`uploader` 空则照补 |
| `tests/literature/index-cov.test.ts` | **新增** 2 条：①命令入口带 md 笔记 → 来源 chip 预填「内 部」+ 笔记名；②非 md（canvas）→ 不预填 |
| `tests/literature/ui.test.ts` | **新增** 2 条：①URL 回车 → 外部 chip + 属性卡来源行（净化尾标点）+ 点来源行开浏览器 + 确认写入落 `source`；②内部笔记 chip + ✕ 清除还原 + 无来源重开不复带。另跟改 3 处既有断言（`generateTermNote` 载荷新增 `source: null`）与 3 处 mock 签名 |

## 门禁

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 0 错误 |
| 文献盒域 `vitest` | ✅ 8 文件 / 160 例全绿（较本票前 +11 例） |
| 全量 `vitest` | ✅ 279 文件 / 4432 例全绿（含文献盒域 8 文件 / 160 例；较票 268 后 +11 例） |
| `node esbuild.config.mjs production` | ✅ 构建通过（产物含 `lit-term-src-chip` / `lit-term-meta-srcrow` / `data-term-src-clear` 与 `bz-lit-srcchip` / `bz-lit-srcopen`；构建产物已 `git checkout --` 还原，未提交） |

## 冻结域零接触核查

本次改动文件全集（`git status --porcelain`）：

```
 M src/literature/data.ts
 M src/literature/index.ts
 M src/literature/note-gen.ts
 M src/literature/processor.ts
 M src/literature/styles.css
 M src/literature/ui.ts
 M tests/literature/data.test.ts
 M tests/literature/index-cov.test.ts
 M tests/literature/note-gen.test.ts
 M tests/literature/processor.test.ts
 M tests/literature/ui.test.ts
```

**零接触**：`src/diary/`、`src/recap/`、`src/review/`、`src/diary-wall/`、`src/smartcat/`、设置页 AI 设置与小橘设置板块，以及 `src/settings.ts`（本票**未新增任何共享设置键**，来源是写在笔记 frontmatter、不入设置）——一个文件未动。

**旁证核查**：
- 新增 CSS 类（`.bz-lit-term-srcrow` / `.bz-lit-term-src-k` / `.bz-lit-srcchip` / `.bz-lit-srcopen`）全仓仅出现在 `src/literature/` 两个文件，**无跨域冲突**。
- 新增样式消费的 6 个 CSS 变量均为 Obsidian 标准变量，全仓多域已在用（零新增 token 依赖）。
- `source.ts` / `video-meta.ts` 本票**未改动**（与上游逐字节相同，票 262 已对齐）。

## 与票 268 的顺序调换

票 266 排的队列是「267 待办 → 268 知识盒 → 269 归物本」，本票开工前已先做归物本（票 268，双边各自演化、差量最小，用于验证合并手法），知识盒顺延至 269 —— 已在票 268 文档注明。
