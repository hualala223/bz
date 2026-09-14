# 票 284：文献盒录入解析（手机分享文本 + b23.tv 短链认 BV）

- 状态：已交付（2026-09-14）
- 关联：ADR-0124（本票新落）、ADR-0071（AI 回迁插件侧）、ADR-0068（聚合讯 B站条目改道文献盒）
- 起因：用户实跑报「无法从链接中识别 BV 号」。盘上 `literature.json` 失败任务 `url` = 手机分享文本
  `【【配音】彼得希夫|…-哔哩哔哩】 https://b23.tv/sHBBikh`，`reason` = CLI 原样抛错。

## 成因（已实证）

| # | 环节 | 事实 |
|---|---|---|
| 1 | 短链无 BV | CLI `extractBv` = `/BV[0-9A-Za-z]{10}/`（`tools/bili-downloader/core.js:89-92`）只在字符串里硬找 BV；b23.tv 短码需跟随 302 才有 BV，CLI 不解析跳转（`core.js:139` 抛错）。工具自带用例 `b23.tv/BV1GJ411x7h7` 是「短链里恰好带 BV」的假样本 |
| 2 | 分享文本没被拆 | `normalizeSourceUrl`（`src/literature/source.ts:52-55`）正则要求整串以 `http(s)://` 开头，`【标题】 …` 前缀命中不了 → 原样返回；`normalizeUrl`（`src/literature/data.ts:65`）净化因此在分享文本上是个空操作 |
| 3 | 呈现 | `humanizeError`（`src/literature/ui.ts:97-131`）无此条映射 → CLI 原文透出 |
| 4 | 无法改 CLI 兜底 | 插件 spawn 的是**全局包** `AppData\Roaming\npm\node_modules\@jwbz\bili-downloader`（`processor.ts:87-90` cmd 硬编码 `bili-dl`），改仓库 `tools/` 不生效 |

## 技术前提的实测结论（影响方案）

- ✅ 短链 302 的 `Location` **本身带 BV**：实测 `https://b23.tv/sHBBikh` → `https://www.bilibili.com/video/BV1RdYi6jEGJ?...&unique_k=sHBBikh`
- ❌ 跳转后的**页面 HTML 里没有 BV**（`"bvid"` / `og:url` / `canonical` / `<title>` 全 0 命中，77KB JS 壳）→ 只能靠 `Location`
- Obsidian `requestUrl` 是否跟随重定向未在仓内被验证过（`video-meta.ts:6` 仅记载「响应无 url 字段」）→ 实现取**防御式双路径**：先看 `headers.location`，再扫响应文本

## 落地清单

### 代码

- `src/literature/source.ts`
  - 新增 `extractUrlFromText(text)`：抠自由文本里的首个 `http(s)` 链接（手机分享文本、带前后说明的粘贴）；无匹配返回原串。**不改 `normalizeSourceUrl` 既有语义**（术语来源 `serializeTermSource` 共用，整串判定口径不动）
- `src/literature/data.ts`
  - `normalizeUrl` 改为 `normalizeSourceUrl(cleanUrlText(extractUrlFromText(raw)))`——数据层落库口径单点收口（`addTask` 已走它）
- `src/literature/video-meta.ts`
  - 新增 `resolveBvidFromShortLink(url)`：已含 BV 直接返回（零请求）；否则 `requestUrl` 取一次，**先** `headers.location` **再** 响应文本找 BV；10s 超时；失败 `null`
- `src/literature/ui.ts`
  - 录入防抖 `addUrlResolve`：净化前先 `extractUrlFromText`；净化后仍无 BV 且是 B 站链接 → 尝试 `resolveBvidFromShortLink`，成功则把输入框改写成规范链接 `https://www.bilibili.com/video/<BV>`（用户可见），再抓元信息
  - `_handleAddSave`：落库前用 `normalizeUrl` 统一口径，并**校验 BV 号**——无 BV 时 `notice` 明确告知并**中止保存**（不出必败任务）
  - `humanizeError`：补「无法从链接中识别 BV 号」映射（防御：历史任务与未来旁路仍给人话）

### 文档与测试

- `docs/adr/0124-literature-input-parse-and-shortlink.md`（新）
- `CONTEXT.md`、`PROGRESS.md` 同步
- `tests/literature/source.test.ts`：`extractUrlFromText` 各形态
- `tests/literature/data.test.ts`：`normalizeUrl` 分享文本 → 短链
- `tests/literature/video-meta.test.ts`：`resolveBvidFromShortLink` 双路径 + 失败/超时/零请求
- `tests/literature/ui.test.ts`：`humanizeError` 新增映射；保存校验用例

## 验收

- `node node_modules/typescript/bin/tsc --noEmit` → 0 错
- 全量 `vitest run` → 290 文件 / 4582 例全绿
- 构建验证通过（production）+ 部署至 vault 插件目录（产物内已含新提示文案）
- **用户数据零改动**：盘上 `literature.json` 既有失败任务保持原样，不代为修正（用户只要求修代码）

## 有意不做

- 不改 `tools/bili-downloader/`（改了对运行态无效；CLI 是上游产物）
- 不支持 av 号 / 番剧 ep 链接（CLI 无此能力，校验会明确提示）
