# ticket 176：复习出题 AI 调用链加固——单篇化、超时/重试、提示词修订

## 背景

核查「复习出题」（复习计划按数量会话 → regenerateQuestions → quiz.ensureQuestions → AI）发现一批不合理点，逐条取证：

1. **批量协议错键被当成功**：`ensureQuestions` 无条件先走 `generateBatch`（哪怕 1 篇，即现行唯一生产路径）。批量协议要求模型按笔记完整路径回显 JSON 键，中文长路径极易改写；回错键时该篇静默缺失，代码却走成功分支（「已为 0 篇笔记生成题目」），上层 `regenerateQuestions` 静默回退旧题。
2. **`quizUpdate`/`updateQuiz` 死代码**：「更新题库」命令 ADR-0045 退役后遗留的模块直调入口已无任何调用方（quiz/index.ts 头注释仍声称 review/ui.ts 在调）。
3. **无超时无取消**：`aiService.json()` 不传 signal（ticket 141 已支持），fetch/requestUrl 均无超时——请求挂死则复习循环永久卡住且不可取消。
4. **无重试**：429/5xx/网络抖动一次即失败，该篇被「出题失败，已跳过」丢掉。
5. **校验不对称**：单篇一题坏 throw 整篇作废（含索引越界直接 throw），批量口径却是逐题过滤——兜底路径反而更脆。
6. **提示词自相矛盾**：单篇模板开头硬编码「四选一的选择题（每题一个正确答案）」，与 `enableMultipleChoice=true` 的 typeHint 冲突，抑制多选产出。
7. **截断过狠且不一致**：单篇 3000 / 批量 2000 字符，长笔记后半段永远不出题。
8. **出题未关思考**：豆包 seed-1.6 系自适应思考默认可能开启，思考 token 与输出共享 max_tokens，极端时 JSON 截断。
9. **选项不打乱**：模型对正确答案位置有明显偏好，`shuffleQuestions` 只打乱题目顺序不解决。
10. **questionsPerNote 无界**：自由文本输入，填 100 撑爆 max_tokens 整篇失败。
11. **response_format 无降级**：`json()` 强制 `response_format:{json_object}`，不支持该字段的服务商 400 时 fetch/requestUrl 两路同 body 双双失败。
12. 每次出题 `console.log` 原始响应，常驻噪音。

## 方案（ADR-0079）

- **单篇化**：删 `quizUpdate`/`updateQuiz`/`generateBatch`/`buildBatchPrompt` 及降级分支；`ensureQuestions` 逐篇生成 + 每篇即时落盘；quiz.json 格式不变。
- **超时**：出题请求统一 `AbortSignal.timeout(90s)`（不可用环境退化为无超时）；超时不重试。
- **重试**：generator 层包装（不动 core）——非 AbortError 且非配置类错误重试 ≤2 次，退避 1s/2s；JSON 提取失败不重试。
- **关思考**：请求带 `modelOptions.enable_thinking: false`（智谱/方舟走既有方言翻译）。
- **response_format 降级**（唯一 core/ai.ts 改动）：主路+兜底双双失败且报文提及 `response_format` → 去字段按主路重试一次；其余 400 行为不变。
- **校验对齐**：单篇改逐题过滤（结构非法剔除、索引越界剔除、全无效才报「AI 未返回有效题目数组。」）。
- **选项打乱**：生成落盘前选项 Fisher-Yates 乱序 + correctIndices 重映射（存储与会话同源，removeQuestion 内容定位不受影响）。
- **提示词**：开头随题型变化；截断统一 `NOTE_CONTENT_LIMIT=10000`；追加「选项不带 A. 前缀且互不相同」「题目答案必须依据笔记内容」两条约束。
- **questionsPerNote 钳制** 1~20（0/无效=自动）；删 console.log。
- 通知链路保留 ADR-0010 动态更新模式（progress → 原地转结果），仅去「批量」措辞；既有「已为 N 篇笔记生成题目」「N 篇笔记出题失败（原因）」文案不变。

## 验收

- [x] 出题只发单篇协议请求；批量方法与「更新题库」入口在源码中不存在。
- [x] AI 请求带超时 signal + enable_thinking:false；瞬时错误退避重试，配置错误/超时/JSON 提取失败不重试。
- [x] 一题坏不再毁整篇：坏题剔除、越界索引剔除、好题保留；全坏才报错。
- [x] 生成的题目选项乱序后：选项集合不变、正确索引仍指向原正确文本（会话判定与落盘删除均不受影响）。
- [x] 多选开关开启时提示词不再出现「每题一个正确答案」；内容截断 10000；提示词含选项卫生与内容依据约束。
- [x] questionsPerNote '100'→20、'-3'→0；'0'/空=自动。
- [x] core/ai.ts：response_format 400 两路失败且报文提及该字段 → 去字段重试成功；降级也失败抛组合错误；无关 400 不触发。
- [x] pnpm test（全量 3630 绿）+ pnpm exec tsc --noEmit（0 错）+ pnpm run build 通过。

## 交付

- `src/quiz/generator.ts`（重构：requestJSON 超时+重试+关思考、generate 逐题过滤+选项打乱、提示词修订、批量协议删除）
- `src/quiz/ui.ts`（ensureQuestions 单篇化 + parseQuestionsPerNote 钳制 + updateQuiz 删除）
- `src/quiz/index.ts`（quizUpdate 删除 + 头注释修正）
- `src/core/ai.ts`（prompt() response_format 400 去字段降级重试）
- 测试：tests/quiz/generator.test.ts（重写：提示词/过滤/打乱/重试/超时/关思考）、tests/quiz/ui.test.ts（ensureQuestions 三用例）、tests/core/ai.test.ts（B4 两用例）
- 文档：docs/adr/0079-quiz-single-note-generation.md、CONTEXT.md「做题家」词条

## Out of Scope

- 难度 `random` 改客户端随机（语义「不指定」保留）；并发会话互斥锁（低概率场景）；温度参数暴露为设置；updateQuiz 若未来复活以「分批单篇调用」重建而非恢复键回显协议（ADR-0079 决策 1）。

## 追加（同日，用户拍板）：出题数量按篇幅自适应

原「留空/0=自动」实际是固定提示「建议 3~6 道」，与文档长度无关。改为按截断后篇幅四档自适应（显式数字仍优先，恰好 N 道）：

- `<500` 字 → 2~3 道；`500~1999` → 3~5 道；`2000~4999` → 5~8 道；`≥5000`（10000 截断上限内）→ 8~12 道。
- 上限 12 × 每题约 200 token ≈ 3000 输出，远低于 max_tokens 钳制，token 可控；提示词同时告知模型本篇字数。
- 实现：`QuestionGenerator.countRangeForLength` 静态纯函数 + buildPrompt 分档提示；决策可逆，不另立 ADR（ADR-0079 出题链路单篇化的参数级追加）。
- 测试：四档边界 + 提示词分档 + 显式数量优先；顺带修复一处选项打乱引入的非确定性断言（断言改为「索引→原文本」映射，连跑 5 次验证无 flake）。
- 设置项文案不动（「留空/0=自动」语义现在名副其实）。
