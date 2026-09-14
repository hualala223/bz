# ADR-0124：文献盒录入解析（分享文本抠链接 + 短链解 BV + 保存前校验）

## 背景

用户 2026-09-14 首次实跑「文献盒 → 视频录入」，批量处理报 **`无法从链接中识别 BV 号`**。盘上
`CONFIG/STORAGE/literature.json` 那条失败任务的 `url` 是**手机 App 分享整段文本**：

```
【【配音】彼得希夫|股债开启同步杀跌…-哔哩哔哩】 https://b23.tv/sHBBikh
```

四个环节叠加成这个结果：

| # | 环节 | 事实 |
|---|---|---|
| 1 | 短链无 BV | CLI `extractBv` = `/BV[0-9A-Za-z]{10}/`（`tools/bili-downloader/core.js:89-92`）只在整串里硬找 BV；b23.tv 短码必须跟随 302 才有 BV，CLI **不解析跳转**（`core.js:139` 抛错）。工具自带用例 `b23.tv/BV1GJ411x7h7` 是「短链里恰好带 BV」的假样本，把真短链漏了 |
| 2 | 分享文本没被拆 | `normalizeSourceUrl`（`src/literature/source.ts`）正则要求整串以 `http(s)://` **开头**，`【标题】 …` 前缀命中不了 → 原样返回；`normalizeUrl` 的净化因此在分享文本上是**空操作** |
| 3 | 呈现 | `humanizeError`（`src/literature/ui.ts`）无此条映射 → CLI 原文透出 |
| 4 | 改 CLI 无效 | 插件 spawn 的是**全局包**（`processor.ts:87-90` cmd 硬编码 `bili-dl`）→ 改仓库 `tools/` 对运行态零影响 |

## 实测结论（决定方案形状）

- ✅ 短链的 302 `Location` **自带 BV**：`https://b23.tv/sHBBikh` → `https://www.bilibili.com/video/BV1RdYi6jEGJ?...&unique_k=sHBBikh`
- ❌ 跳转**落地后的页面 HTML 里没有 BV**（`"bvid"` / `og:url` / `canonical` / `<title>` 全部 0 命中，77KB JS 壳）→ 文本扫描只能当兜底
- Obsidian `requestUrl` 是否跟随重定向，仓内从未验证（`video-meta.ts` 只记载「响应无 url 字段」）→ **不能假定**，实现必须两路都试

## 决策

**1. 链接抽取前置到净化之前（新增 `extractUrlFromText`）。**

`source.ts` 新增纯函数：从自由文本里抠出首个 `http(s)` 链接；无链接（含裸 BV 号、纯中文）原样返回。字符类显式排除中日韩标点与引号尖括号——中文说明常**紧跟链接且无空格**，只靠 `cleanUrlText` 剥尾随标点救不回来（会把「，然后」并进路径）。

**不改 `normalizeSourceUrl` 既有语义**：它被术语来源 `serializeTermSource` 共用，整串判定口径（`isUrlLikeSourceText` 明确要求「整串无空白」）是另一条已定契约。

**2. 落库口径单点收口在数据层。**

`src/literature/data.ts` 的 `normalizeUrl` 改为 `normalizeSourceUrl(cleanUrlText(extractUrlFromText(raw)))`——`addTask` 已走它，录入路径与编辑路径自然同口径，不会出现「界面看着干净、库里存着整段」。

**3. 短链解析做「防御式双路径」。**

`video-meta.ts` 新增 `resolveBvidFromShortLink(url)`：

- 已含 BV（完整链接/裸号）→ 直接返回，**零请求**；
- 否则 `requestUrl` 请求一次，**先**读响应头 `location`（未跟随重定向时能拿到 302 目标，实测主路径），**再**扫响应文本兜底；
- 10s 超时；拿不到 → `null`。

**4. 录入防抖里解短链并写回输入框。**

`addUrlResolve`（`ui.ts`）：净化后仍无 BV 且是 B 站链接 → 解析成功则把输入框改写成规范链接 `https://www.bilibili.com/video/<BV>`（**用户可见**，不是偷偷替换），随后照常抓元信息。解析失败保持原样，交给下一步的校验提示。

**5. 保存前校验 BV，拦下必然失败的任务。**

`_handleAddSave` 落库前用 `normalizeUrl` 统一口径并校验 `parseBvid(url)`；无 BV 则 `notice` 明确告知（「b23.tv 短链请先在浏览器打开、复制带 BV 号的完整链接再粘」）并**中止保存**。

这是**行为变更**：以前保存必成功、任务必失败；现在当场拦下。判定依据是 CLI 的能力边界——它的入口只有 `--batch <url>`，而 `extractBv` 只认 BV，故「无 BV ⇒ 必失败」是必然，不是概率。

**6. `humanizeError` 补该条映射。**

历史任务与未来旁路仍可能带着 CLI 原文失败，白话化为「链接里没找到 BV 号 + 解法」。

## 后果

- 手机「复制链接」整段粘贴 → 自动抠出链接；短链能解则直接变成可用链接；解不出则当场得到人话提示，不会攒出一堆注定失败的任务。
- 落库的 `url` 从「整段分享文本」变成干净链接，任务卡片展示与重试都更可读。
- 术语来源不受影响（`normalizeSourceUrl` 未动）。

## 风险与缓解

- **短链解析成功率取决于 `requestUrl` 是否跟随重定向**。若它跟随且落地页无 BV（实测形态），解析会走文本兜底并失败 → 用户看到的是「请先在浏览器打开」的引导，而不是静默失败。行为是安全降级，不是错。
- **上线的 CLI 若将来支持 av 号 / 番剧 ep**，这条保存校验会误拦。缓解：校验只依赖「有无 BV 号」这一条与 CLI 同源的判据，届时同改一处即可。
- **短链解析会在防抖路径上多花一次网络往返**（最长 10s）。已在既有「序列号 + 输入值」双校验内，迟到响应会被丢弃，不会回填到已关闭的弹窗。

## 备选（未采纳）

- **改仓库 `tools/bili-downloader/` 的 `extractBv`**：插件调的是全局安装包（`AppData\Roaming\npm\...`），改仓库源码对运行态零影响；要生效须把全局包重装成本地分叉，等于私有化上游产物，违背吸收铁律。
- **直接给全局包打补丁 / `npm i -g <本地路径>`**：同上，且会随下次 `npm update` 被覆盖。
- **只改文案、不改行为**：用户仍要手工把短链换成完整链接，且失败任务照旧堆积——本次用户明确要「跑通」。
- **保存时不拦、只在批处理前解短链**：失败反馈延后到批处理，用户更难定位；且解不出时仍会产出失败任务。
