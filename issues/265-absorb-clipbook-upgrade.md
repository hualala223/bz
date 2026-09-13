# Ticket 265：剪藏本（clipbook）整域吸收上游升级

日期：2026-09-13 ｜ 类型：上游吸收（ADR-0117 双门 + ADR-0121 冻结裁决下执行）

## 一句话

本地 clipbook 域自融合基线（7dbfac64）后零本地改动、零未提交修改，故采取**整域换血**：`src/clipbook/` 19 文件 + `tests/clipbook/` 16 文件按上游 tip（7b06f4b4）原样替换，唯一适配点为文献盒命名（上游 `knowledge` → 本地 `literature`），另补齐 4 个共享依赖与 2 处接线。

## 吸收内容（上游 issue 溯源）

| 上游 issue/commit | 内容 |
|---|---|
| issue 247/ADR-0104 | `render.ts` 渲染纯层 + `prototype-render.js` 评审壳预览包（markup 单源，`data-clip-*` 钩子契约） |
| issue 273 | 正文渲染转 **Obsidian 内置 MarkdownRenderer**（全保真 markdown；`md.ts` 段落化管线退役，只留外壳剥离） |
| issue 274 | 已读/已收**正文保留不清空**（不再删 body；超龄由保留策略整条清理） |
| F1-F15 批修 + F3 收窄 | 已读未收补收可升级 saved 且不重复计已读；未命中不加统计不空写 |
| ADR-0121 | RSS 订阅源（`rssFeeds` 段 + 管理弹窗 + 试拉校验）+ 每日简报退役（本地从未吸收简报，无迁移负担） |
| issue 291 | flow-dialog 弹窗壳统一（`bz-overlay-popup bz-flow-dialog`）+ `className` 皮肤透传 + `cancelActiveFlowDialog` 卸载结算 |
| issue 294 | 剪藏本设置精简 + 管理弹窗通用组件化（uiSetlist 已于 ticket 263 吸收） |
| issue 301 | 文章标题字号降档 |
| 批次 A/F/D 令牌对档 | utils 上收（localDayKey/stripTitleMarks/cmpZh）+ 剪藏本 CSS 令牌化 |
| 全局去在读/会话冻结序/移动端目录化等 | ADR-0107/0108 系列面板行为升级 |

## 非拷贝适配点

1. `src/clipbook/flow.ts`：动态 `import('../knowledge')` → `import('../literature')`（`openKnowledgeAddTask` → `openLiteratureAddTask`，本地文献盒命名）。
2. `tests/clipbook/flow.test.ts`：vi.mock 同步改为 `../../src/literature`。
3. `src/core/utils.ts`：只补 clipbook 实际消费的 3 个函数（localDayKey/stripTitleMarks/cmpZh）；上游同段的 password-vault/encrypt 系函数（secureRandomPassword 等）本地无属主域，不吸收。
4. `src/core/flow-dialog.ts`：整文件按上游补齐（本地仅差 issue 291 批次，diff 48 行）。
5. `src/core/styles.css`：仅替换「通用确认弹窗」一节为上游令牌版（旧版备份 `.scratch/upstream-compare/backup-clipbook-265/`）；`tokens.css` 补 `--bz-overlay-blur: 8px`。
6. `src/settings-panel/ui.ts`：clipping 域 schema loader 改为先 `readDataSourceState()` 预载再建 schema（新签名）。
7. `src/settings.ts`：新增 `clipbookSkin`('default') / `clipbookSkinTheme`('newsprint') 两键（界面口径对齐 issue 264 番茄钟键范式）。
8. `src/main.ts`：import `markAllUnreadRead` + 注册命令 `bz-clipbook-mark-all-read` + onunload 调 `cancelActiveFlowDialog()`。
9. `scripts/build-preview.mjs`：`PREVIEW_DOMAINS` 加 `'clipbook'`。
10. `tests/core/settings-copy-lint-b.test.ts`：整文件换上游版（适配新 schema 签名与 rss-manager 目标）。

## 明确不吸收

- 上游 home/shared.ts「入口菜单」项（本地 home 域为旧版整文件不同，硬搬会炸）——`未读全部标为已读`仅命令面板/设置可达。
- 上游 utils 同段的 encrypt/password-vault 函数（本地无该两域的属主形态）。

## 已知边界（须告知用户）

- **RSS 抓取依赖守护进程升级**：插件侧只写 `rssFeeds` 段 + 管理弹窗（含试拉校验），实际拉取由 obsidian-news 守护执行；本地守护未支持 RSS 前该开关无效但无害（旧守护对新段静默忽略）。
- 根目录 `main.js`/`styles.css` 为构建产物且混有用户未提交改动，按惯例**不入本票提交**。

## 冻结核查（ADR-0121）

- diary 系/recap/回忆墙/smartcat：clipbook 全部 import 清单核查，**零接触**。
- 设置页「AI 设置」「小橘设置」板块：未触碰（仅新增剪藏本皮肤两键）。

## 门禁

- `tsc --noEmit`：✅ 0 错误
- 全量 vitest：✅ 275 文件 / 4397 用例全绿（首次跑冒烟 2 失败为命令清单守卫未含新命令，已补 `bz-clipbook-mark-all-read`）
- `node esbuild.config.mjs production`：✅ 含 `src/clipbook/prototype-render.js` 评审壳出包、styles 聚合

## 回滚

`git checkout 5fc9058b -- src/clipbook tests/clipbook` + 备份 `.scratch/upstream-compare/backup-clipbook-265/`（含被替换的 core-styles 旧节）。
