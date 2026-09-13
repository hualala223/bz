# 262 · 吸收上游「视频录入自动填元信息」（文学域增强第一块）

**Status:** 已交付（2026-09-13，见文末验收）

## 背景

用户圈定上游 B 类吸收清单（功能菜单 5「文学域增强」）。为控制单票体量拆两块，本票先做**视频录入 URL 防抖自动回填**（上游 issue 278）；「术语来源标注」（上游 ADR-0116，source.ts 的选择器交互面）拆后续票。

冻结约束（ADR-0121，同日扩充）：diary 系 / review 系 / 设置页 AI 设置与小橘设置板块零接触——本票只动 literature 域与 core/utils 新增小工具，天然满足。

## 内容

来源：上游 `src/knowledge/video-meta.ts` + `src/knowledge/source.ts`（纯函数部分）+ `tests/knowledge/{video-meta,source}.test.ts`。

- `src/core/utils.ts`：新增 `stripMdExt(name)`（1 行小工具，上游同款，注释标 issue 262）。
- `src/literature/source.ts`：上游 `knowledge/source.ts` 原样复制（`normalizeSourceUrl` 追踪参数剥除 / `cleanUrlText` / `isUrlLikeSourceText` / `noteSourceName` / `serializeTermSource` / `cleanSourceTitle`）。本票只消费 `normalizeSourceUrl`，其余纯函数随模块带来并带测试（术语来源后续票消费）。
- `src/literature/video-meta.ts`：上游原样复制——`parseBvid`（BV 号提取）+ `fetchVideoMeta`（B 站 view API → 失败回退页面标题剔尾巴；10s 超时；非 B 站 URL 零请求）。
- `src/literature/ui.ts` 接线（createAddDialog / showAddDialog / hideAddDialog）：
  -录入弹窗 `#lit-add-url` 加 450ms 防抖 input 监听：停顿后 `normalizeSourceUrl` 净化写回 + `fetchVideoMeta` 抓 `{title, uploader}` 回填**空字段**（`#lit-add-vtitle` / `#lit-add-uploader`）；
  - 序列号 `addUrlSeq` + 输入值双校验丢弃迟到响应；全程静默（无通知、无按钮、无 placeholder——既有拍板不回加）；
  - 开/关弹窗 `addUrlReset()` 清定时器并失效在途解析。
- `tests/literature/{source,video-meta}.test.ts`：上游测试原样搬（import 路径 knowledge→literature），纯函数测试，node 环境。

## 数据契约

无变化——自动回填只写录入弹窗表单字段，落盘仍走既有 `LiteratureData.addTask` 既有字段（url/title/uploader）。frontmatter 格式不变。

## 冻结核查（ADR-0121）

- diary 系：零接触 ✅（改动面 = literature + core/utils 新增函数）
- review 系：零接触 ✅
- 设置页 AI 设置 / 小橘设置板块：零接触 ✅（无设置键新增）

## 验收

- tsc --noEmit 0 错；literature 域 149 例全绿（8 文件）；全量 vitest 绿；构建通过。
- 上游测试 31 例随票搬入。
