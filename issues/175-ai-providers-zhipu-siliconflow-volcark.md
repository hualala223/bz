# ticket 175：AI 服务商扩充——智谱 / 硅基流动 / 火山方舟

## 背景

主设置页 AI 服务商目前只有 deepseek / opencode-go 两家（写死在 core AI 解析、设置键与主设置页 schema 三处）。用户希望增加智谱、硅基流动、火山方舟三家国内 OpenAI 兼容平台：其他全部内置预设好，自己只填 API Key 就能用；另给每家一个可选模型行以备换模型（grill-with-docs 对齐：Q1 默认模型取「够用低价」档 / Q2 密钥行 + 可选模型行 / Q3 worktree 流程 / Q4 五家统一模式）。

与在途 ticket 174（opencode-go 会话头修复，另一会话）同文件并行开发：本工单分支从 174 落库前基线分叉，合并前 rebase。

## 方案

- 新增三家服务商（纯增量，默认服务商仍 opencode-go，老键老值一律不动）：
  - `zhipu` 智谱：`https://open.bigmodel.cn/api/paas/v4`，默认模型 `glm-4.7-flash`（免费档）
  - `siliconflow` 硅基流动：`https://api.siliconflow.cn/v1`，默认模型 `deepseek-ai/DeepSeek-V3`（平台对 V3 系列升级不换 ID）
  - `volcano-ark` 火山方舟：`https://ark.cn-beijing.volces.com/api/v3`，默认模型 `doubao-seed-1-6-flash-250828`（方舟 Model ID 带日期后缀，官方文档 2026-05 核实）
- 三家端点 CORS 已实测放行 Obsidian 来源（app://obsidian.md）→ 走 deepseek 同款「流式 fetch + 失败自动 requestUrl 兜底」，不设 noCors，保留流式输出与取消（ticket 141 语义）。
- 设置新增八个键（DEFAULT_SETTINGS 全空串）：`deepseekModel` / `opencodeGoModel` / `zhipuApiKey` / `zhipuModel` / `siliconflowApiKey` / `siliconflowModel` / `volcanoArkApiKey` / `volcanoArkModel`。
- 五家统一「密钥行 + 可选模型行（留空 = 内置默认）」schema 模式，按所选服务商 visibleWhen 显隐；opencode 密钥行显隐条件由「非 deepseek」收窄为「=== opencode-go」（两选项时代的口径，扩容后必须收窄，否则新三家会错显 opencode 行）；文案守 ticket 100 规范（~20 字自然句、无符号花样）。
- 模型覆盖复用现有 `provider.model` 通道：调用方用默认模型时 provider 配置的模型生效；deepseek 模型行留空则维持现状（不传 provider.model）。
- 思考模式参数映射：`reason()` 系列的 `enable_thinking` 在智谱与火山方舟翻译为其文档参数 `thinking: { type: 'enabled' | 'disabled' }`，硅基流动原生透传，deepseek / opencode-go 维持原样。
- 空密钥行为沿用 opencode-go 口径：切到该家未填密钥 → 报错并提示设置位置；deepseek 的 QuickAdd data.json 兜底保持专属，不为新家复制。
- favorites 域「AI 已配置」判定改为按所选服务商检查对应密钥（deepseek 恒真——有 QuickAdd 兜底；其余四家查各自密钥键）。

## 验收

- [ ] 主设置页 AI 服务商下拉含五项；选择任一家只显示该家的密钥行与可选模型行。
- [ ] 选智谱/硅基/方舟并填密钥后，AI 对话/摘要走对应端点：请求打到内置 endpoint，模型为「设置模型行或内置默认」。
- [ ] 三家均支持流式 fetch；fetch 失败自动回落 requestUrl 非流式；未填密钥时报错文案指明设置位置。
- [ ] 智谱/方舟下 reason() 请求体出现 thinking 对象且无 enable_thinking 残留；硅基保留 enable_thinking；deepseek / opencode-go 行为零变化。
- [ ] deepseek 模型行填值后覆盖默认模型；opencode-go 模型行留空仍用 deepseek-v4-flash。
- [ ] favorites 的 AI 门控按所选服务商判密钥：新三家未填 Key 判未配置，填了判已配置。
- [ ] 兼容性：老数据（aiProvider 旧值、旧密钥键）行为不变；无新命令，smoke 命令数不变。
- [ ] pnpm test + pnpm exec tsc --noEmit + pnpm run build 全绿。

## 交付

- `src/core/ai.ts`（provider 解析三分支 + 五家模型行覆盖 + thinking 映射）；`src/settings.ts`（八新键）；`src/core/settings-main-schema.ts`（下拉五项 + 十行 visibleWhen）；`src/favorites/ai.ts`（门控按家查密钥）。
- 测试：tests/core/ai.test.ts（三家解析/报错/模型覆盖/thinking 映射）、tests/core/settings-schema.test.ts + settings-schema-ui.test.ts（五家行显隐与文案 lint）、tests/core/settings-tab.test.ts（切换服务商渲染）、tests/favorites/*（门控）。
- CONTEXT.md「AIService / createAI」词条服务商枚举同步；无新 ADR（决策可逆、无惊喜成本）。

## Out of Scope

- 第二大脑嵌入（走 Ollama HTTP，铁律 6）；火山方舟 ep-xxx 推理接入点用户可直接填进可选模型行，不做专UI；免费/旗舰档位切换不做成设置项（改模型行走可选模型行）。
