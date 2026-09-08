# ticket 174：opencode-go 请求带 x-opencode-session 头 + AI 报错透出服务端报文

## 背景

用户报「出题失败：AI 请求失败: Request failed, status 400（fallback: Request failed, status 400）」。排查：opencode Go 端点（`https://opencode.ai/zen/go/v1`）服务端策略变更，强制要求请求头 `x-opencode-session`（官方要求每会话一个稳定 ID，用于路由/prompt 缓存优化，见 opencode.ai/docs/go），缺失一律 400 `MissingSessionID`。与出题内容无关——凡走 opencode-go 的 AI 功能（出题/对话/摘要/收藏识别等）全部 400。报错只给一句 "Request failed, status 400" 是因为 Obsidian `requestUrl` 默认 `throw: true`，400+ 时直接抛默认话术，服务端报文被吞；且 opencode-go `noCors` 主备两路都走 requestUrl，主备错误一模一样。

实测验证：同一请求，不带该头 400，带任意自生成 UUID 即 200。

## 方案

- `src/core/ai.ts`：`AIProvider` 增加可选 `headers`（fetch 与 requestUrl 两路都合并）；opencode-go 分支挂 `x-opencode-session`（进程内懒生成 UUID 全程复用，`crypto.randomUUID` 优先、手写 v4 兜底）。
- `chatCompletionsNonStream` 改 `throw: false` 自判状态码：400+ 时解析服务端错误体透出（OpenAI `{error:{message}}` / opencode `{type,error:{type,message}}`），非 JSON 用原文截断 300 字符。旧版 Obsidian 不识别 `throw` 参数时自动退回原行为，不会更糟。

## 验收

- [x] opencode-go 请求带 x-opencode-session 头，进程内多次调用同值（UUID 格式）。
- [x] 非流式 400 + 服务端 JSON 错误体 → 报错含 `API 400: <服务端 message>`；requestUrl 收到 `throw:false`。
- [x] 非流式 400 + 非 JSON 错误体 → 报错含状态码与原文。
- [x] 真实端点回归：带该头后出题同款请求体（response_format + max_tokens 8192）HTTP 200。
- [x] pnpm test（3608 绿）+ tsc --noEmit 0 错 + 构建部署。

## 交付

- `src/core/ai.ts`（provider headers + session id + 非流式错误透传）。
- `tests/core/ai.test.ts` 新增三用例。
