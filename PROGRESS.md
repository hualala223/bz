# PROGRESS — 包仔（bz）插件开发进度

> 进度同步总表（AGENTS.md）。每票一节，状态：计划中 → 进行中 → 门禁 → 已交付。

## 上游吸收第二轮（issue 266 审计归档 + 票 267~274 执行）— 基线 7b06f4b4

**状态：已交付（2026-09-13）**。审计归档见 `issues/266-upstream-audit-archive-and-skin-exception.md`（含三档分级清单、出局项、皮肤例外逐条裁决）；ADR-0121 二次修订（第 5 条皮肤/外观层例外 + 原第 3 条第 1 项作废）已落盘。

- [x] 票 267 待办本：面板重做 + 渲染纯层 + 排序下拉 + 三个新设置项 + E7/E21/E22/E23 修复；路径 `memo/`→`todo/` 逐文件对位
- [x] 票 268 归物本：H14~H20 七项修复 + 金额单位/默认排序/默认状态三设置项 + 夜版海报 + 长按开抽屉；本地 5 项独有全保留
- [x] 票 269 知识盒：术语来源 source/sourceTitle + URL 净化 + 标题/UP 主只补空 + AI 标题禁疑问句；UI/样式两套体系，本地文献盒原样保留
- [x] 票 270 番茄钟：F11/F12/F13 三项修复（相位纯函数 + 渲染层；本地 `skin.ts` 保留）
- [x] 票 271 影院：行为修复 G6~G9 + 荐片方案 A + 视图切换口径
- [x] 票 272 保险库：共享解锁屏 + 锁屏统计落盘；只接 encrypt 侧，日记复用路径走 legacy 冻结（契约 6 函数，diary 分支不接）
- [x] 票 273 第二大脑：原型重写 + 移动端滚动全屏 + 文献即时建链；本地向量指纹票 173 保留
- [x] 票 274 小对齐打包：自动摘要/数据体检/书架墙/附件搬运四小域行为修复 + core 滚动条单源（S3-a 只吸前半段）+ bookshelf 假成功/确认框皮肤/继续钮
- [x] 纪律执行：全部走 worktree 从 `095872f8` 分叉；冻结域（diary 系/review 系/AI 设置/小橘设置）零接触；上游守卫型测试未搬；构建产物未提交
- [x] 收尾整合校验（主仓库工作区 = 吸收代码 + 用户未提交个人改动）：`tsc --noEmit` 0 错误（worktree 门禁基线不含个人改动，此为二者首次合体验证）；主仓 `node esbuild.config.mjs production` 构建成功，运行产物已含全部吸收功能（用户拍板「要生效」，重启 Obsidian 即生效）；在制产物备份于 `.workbuddy/backup-artifacts-20260913/`
- [x] 构建产物（根 `main.js`/`styles.css`/4 个 `prototype-render.js`）随主仓构建刷新为吸收后版本，按惯例不提交
- [ ] 待办：皮肤例外剩余候选（S1 模型弹窗同皮 / S3-b 遮罩毛玻璃 / S3-c 暗色补齐扫尾）暂不做，用户日后点名再立项；读书报告（人工对位类）暂缓

## 上游分叉处置 — 与 GitHub yeshimei/bz 的关系定位（ADR-0117 ~ 0120）

**状态：规则已定；吸收第一块（通知四项偏好）已交付，其余块等用户圈定**

- [x] 审计：本地 ⇄ 上游分层比对（共同祖先 `af7ed6b5`；本地那次「并入上游」只有 1 个 parent，是内容复制非 merge）。产物 `.scratch/upstream-compare/`（`report/*.json` + `上游差异审计.html`）；分类 A 直接冲突 15 / B 纯增量约 15 / C 中性
- [x] 决策 ADR-0117：定位「同源分叉的独立演进线、单向取用」——不 merge、不回归上游、不彻底分家；按块吸收，每块独立 ticket，两条硬门槛（不改数据契约 / 不倒逼调用方改写）
- [x] 决策 ADR-0118：命名一律用本地叫法（todo / literature / encrypt / diary-wall / collect），上游别名只登记在 CONTEXT.md「上游别名」节
- [x] 决策 ADR-0119：上游 ADR 进 `docs/adr/upstream-yeshimei/`、上游 issue 进 `issues/upstream-yeshimei/`（只读归档、保留原文件名含重号）；本地从 `0117` 续发；引用写「上游 ADR-XXXX」
- [x] 决策 ADR-0120：A 类冲突一律本地优先（例外只能靠独立票 + 单独 ADR 走）；8 项冻结清单（storage.ts / mobile.ts 导出 / diary 写链路 / vec 版本 / pomodoro / literature 文件名 / encrypt / todo）；数据层三不（不迁文件名、不裁历史、不动向量版本）
- [x] 归档落地：`docs/adr/upstream-yeshimei/` 23 篇 + README；`issues/upstream-yeshimei/` 累计 67 篇 + README
- [x] Spec：`issues/256-upstream-absorption-spec.md`（就绪待开工）——吸收工作流总 spec，第一块 = 通知四项设置（`issues/255-absorb-notice-settings.md`）
- [x] 事实核正：命令数「68」→ **63**（静态 47 以 smoke `EXPECTED_COMMAND_IDS` 为准 + collect 汉字分类 16 条动态生成），AGENTS.md 与审计报告同步；锁屏编号 → 上游 ADR-0124；ADR-0127 是路径选择弹窗单源（`core/ui/setlist.ts` 是另一件事）
- [x] 拆票：本块按 ADR-0120「一块一票」立为 `issues/257`（基线落定，待用户过目清单）+ `issues/258`（通知四项偏好，已交付）；`issues/255` 转为设计依据不再启动
- [x] 吸收第一块（`issues/258`，**已交付**）：通知四项横切偏好——级别降噪 / 停留档位 / 桌面四角位置 / 同屏上限；四个设置键 + 「🔔 通知」平铺分组 + 通知模块偏好读取通道（provider 抛错按缺省走）+ 四消费点接入 + core 层位置样式；四项缺省值均等于既有行为，模块导出面未变（零调用方改动）；既有 33 例断言语义未改，新增 22 例偏好测试
- [ ] 待办：**其余吸收块由用户圈定后再开工**（候选：锁屏、单源选择器 / 路径弹窗单源、全域换肤、首页条目化、剪藏本渲染单源、影院豆瓣队列、知识盒术语来源与视频元数据、行为单源体系）
- [ ] 待办：工作区未提交改动先落基线（提交前需用户过目）；根目录 `%SystemDrive%/`、`test-bundle.js`、`test-out*.txt` 待清理

## Ticket 254 — 存储层空读防护 + review 数据写加固（P1-33）

**状态：已交付**

- [x] 定性：review.json 清库事故复盘（N 盘空读被当损坏重建默认值；`.CORRUPT` 无留档说明还走过「句柄瞬时丢失→缺失首建覆盖」变体）+ review 域裸读改写并发互覆实测 + 运行时字段全量写回膨胀（512KB→4.9MB）
- [x] 方案：ADR-0116（`docs/adr/0116-storage-empty-read-guard.md`）
- [x] core：read 重试 3 次（150ms）→ 空读耗尽抛错不动盘（绝不清库）+ 30s 去重 warning；非空解析失败维持留档+重建；write 前留底 `CONFIG/.CORRUPT/<名>-prev.bak`（失败不阻塞）
- [x] review：saveItems 剥离 6 个运行时字段（旧字段兼容保留）；五变更方法（addItem/updateItem/removeItem/restoreItem/updateFilePath）整体入 `enqueueFileTask` 串行队列
- [x] 测试：storage-reliability +6 例、review/data +3 例
- [x] 文档：`issues/254-storage-empty-read-guard.md`
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署
- [x] 追记：逾期常驻通知冻结「1 篇」三连修——首查金丝雀门（resolved/15s 触发后，再等「条目文件全被索引命中 ∨ 索引数采样稳定 ∨ 60s 兜底」才首查，v1 纯 resolved 在 N 盘早于扫描完成仍复现假挂起）/ `_lastOverdueCount` 数字自纠 / 染色移出通知 try 块独立容错；index.test.ts 时序断言更新 + describe 补 `vi.restoreAllMocks()`（单例 spy 历史跨用例泄漏）

## Ticket 253 — 复习计划挪动兜底：同名唯一自动接回

**状态：已交付**

- [x] 定性：Obsidian 关闭期间/外部工具挪动 → rename 事件丢失 → 条目挂起（不计逾期），用户视角「从计划消失」（23 篇实例核查 review.json）
- [x] 方案：ADR-0115（`docs/adr/0115-review-move-relink.md`）——失效条目 × vault 同名文件双向唯一 → 走既有 `updateFilePath` 接回原排期；歧义不动
- [x] 实现：`src/review/watch.ts` 新增 `baseNameOf`/`relinkOneByBasename`（created 实时接回，onVaultCreate 入口先试）/`relinkMissingByBasename`（启动批量收敛）；`src/review/index.ts` ensureReview 2s 定时器追加收敛调用
- [x] 测试：`tests/review/watch.test.ts` +3 例（接回+通知 / 三类歧义不动 / created 接回不走自动加入）
- [x] 文档：CONTEXT.md「挪动兜底」词条 + `issues/253-review-move-relink.md`
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署（产物含 relink 逻辑）

## Ticket 167 — 已有 related 不再触发自动双链

**状态：已交付**

- [x] 需求确认（用户拍板，grill-with-docs：三条自动路径统一跳过 / related 非空才算「有」/ 手动重跑豁免 / 加开关默认开）
- [x] 规格：`issues/167-link-agent-respect-related.md` + spec.md v1.7 节（尊重开关 + 自动路径统一跳过）
- [x] 数据层：`link-agent/data.ts` 新增 `hasRelatedEntries`（related 非空判定统一出口）；settings.ts 新增 `linkAgentRespectRelated` 默认 true
- [x] 管线：`pipeline.ts` `processNote` 尊重门（related 非空 → `skipped-related`，不探测不裁判不写入）；`consumeQueue` 已连接条目顺带移除队列；`runBatch` 静默不计
- [x] 手动命令：`index.ts` `rebuildSecondBrainLinks` 传 `respectRelated:false` 豁免（显式意图强制重跑）
- [x] ⚙️ 弹窗：`panel.ts` 自动双链组新增 toggle「已有关联不再建链」
- [x] 测试：数据层 `hasRelatedEntries` + 七键断言；UI 层尊重门/空值语义/豁免/开关关闭恢复旧行为/队列消费移除；既有 3 处幂等重跑用例改豁免模式
- [x] 构建验证 + 部署产物同步（worktree/167 合并 master 后，push origin master）

## Ticket 165 — 通知 z-index 与小橘对齐 + 桌面端位置下移

**状态：已交付**

- [x] 调研：toast 已接入 ADR-0067 动态层级（`notice.ts:447` allocZ 抬顶），小橘猫恒压最高层但不与 toast 重叠（猫底部中央、toast 右上角）——z-index 无需改，改静态反而倒退
- [x] 实现：`src/core/styles.css:190` 桌面端 `#bz-notice-container` top 16px → 56px（下移 40px 避开顶部栏）；移动端断点不动
- [x] 测试：tsc 0 错 + 全量 221 文件 3563 用例绿（notice 无位置/z 断言）
- [x] 构建验证 + 部署产物同步（worktree/165 合并 master 后）

## Ticket 166 — 开始复习双 progress 通知合并为一条

**状态：已交付**

- [x] 根因：`review/app.ts:206`（key `review-generate`）与 `quiz/ui.ts:139`（key `quiz-generate`）两个不同 dedupeKey 的 progress 框并存，去重不生效
- [x] 实现：`review/app.ts:206` dedupeKey 统一为 `'quiz-generate'`，同键原地合并更新文案，只留一条；失败/逐篇降级路径共用同键行为不变
- [x] 测试：tsc 0 错 + 全量 221 文件 3563 用例绿（review/quiz/notice 测试无 key 断言）
- [x] 构建验证 + 部署产物同步（worktree/166 合并 master 后）

## Ticket 164 — 通知操作按钮高度与文字对齐（button → span）

**状态：已交付**

- [x] 需求确认（用户拍板：按钮不用 HTML button，改用 span）
- [x] 根因：Obsidian 核心 `button{height: var(--input-height)}` 32px 硬撑，`.bz-notice-action` 只覆盖 padding 未覆盖 height
- [x] 实现：`core/notice.ts` + `auto-summary/processor.ts` 操作按钮改 span + `role="button"`；`core/styles.css` 补 `line-height: 1`
- [x] 测试：tsc 0 错 + 全量 221 文件 3563 用例绿（既有断言只查文本不查标签类型）
- [x] 构建验证 + 部署产物同步

## Ticket 163 — 洞察条数上限 + 记忆来源分布按追查目录 + 小橘对我的称呼

**状态：门禁（实现/测试全绿，构建部署收尾）**

- [x] 需求确认（用户拍板：洞察上限默认 3 放面板；来源分布洞察计入 + note 按追查目录分行；称呼默认包仔，所有喂记忆/行为流的 AI 调用替换「你/用户」）
- [x] 规格：`issues/163-smartcat-insight-cap-source-dist-nickname.md`（spec.md「洞察上限 + 来源分布按追查目录 + 称呼替换」节同步）
- [x] 文档：ADR-0076（洞察上限 + 来源分布口径 + 称呼替换；CONTEXT.md「三层记忆流水线」词条修订 + 新增「小橘对我的称呼」词条）
- [x] 数据层：settings.ts 两新键；memory.ts getConsolidationConfig.maxInsights + getUserNickname/replaceUserReference + 反思/小结/追标/格式化四处内容替换 + 洞察 `.slice(0,N)` 截断
- [x] UI 层：⚙️ 互动组「小橘对我的称呼」+ 记忆巩固组「反思洞察条数上限」；dashboard 来源分布（洞察单列 + note 按追查目录分行 + 最近记忆列表同口径）
- [x] 测试：memory/dashboard/report/companion-context/settings 新增 + trait-attribution/adr0069-core 断言同步；tsc 0 错 + 全量 221 文件 3563 用例绿
- [x] 构建验证 + 部署 E 盘（worktree/dash-tweaks-163 合并 master 后）

## Ticket 136 — 文献盒改版（literature 域 / 术语生成 / AI 回迁 / 去网页版）

**状态：已交付（含终审全项闭环）**

- [x] 设计定稿（grill-with-docs 五轮拍板，契约见 `issues/136-literature-box-redesign.md`）
- [x] 文档：ADR-0071（AI 回迁+去网页版）/ ADR-0072（新域迁出+literature.json）/ ADR-0073（type+domain）
- [x] CONTEXT.md 词条更新（文献盒/B站下载/快速流程/文献笔记/文献类型/领域/术语文献/文献目录）
- [x] Worktree A `worktree/tools-literature`：CLI 去 AI 去网页版、转录临时文件、压缩步骤 → 已合并 master（531bcd2）
- [x] Worktree B `worktree/literature-domain`：src/literature 域全量实现 + 集成 + 测试 + 构建 → 已合并 master（77e9222）
- [x] 全量测试绿 + tsc 0 错 + 构建通过 + 部署产物与仓库一致
- [x] 命令：bz-literature-open（文献盒）/ bz-literature-note-term（术语生成文献笔记）；移除 bz-bili-open / bz-bili-tasks-open
- [x] 独立终审（46172556）：P1×4（bz-bili 样式恢复/backfill type 回滚/instanceof 字符串/术语确认重跑 AI）+ P2×4 + P3×5 全部闭环

## Ticket 138 — 文献盒 UX 修复与增强（用户实测反馈）

**状态：已交付**

- [x] 规格：`issues/138-literature-ux-fixes.md`
- [x] 硬 bug：openTermNote 改 getActiveViewOfType(MarkdownView)（修 instanceof）；ensureLiterature 失败可重试 + createMainUI 自愈（点两次才打开）；backfill AI 25s 超时跳过（补全不卡批）
- [x] 术语流程：generateTermDraft 纯 AI 预览不落盘；确认写入 generateTermNote 传面板值所见即所得、不重跑 AI
- [x] 主面板 UI：emoji 按钮 📝🎬、🔍 前移、去类型分类栏、去类型徽章、样式对齐日记本、loadNotes 递归
- [x] worktree/literature-ux 3 提交合并 master（dc8728e）+ 全量 218 文件/3468 用例绿 + 构建部署

## Ticket 139 — 文献盒 UX 二轮（用户清单拍板 10 项 + 关闭按钮统一）

**状态：已交付**

- [x] 规格：`issues/139-literature-ux-round2.md`（spec.md「文献盒 UX 二轮」节同步）
- [x] 交互：📝/🎬 子面板叠开不隐藏主面板（关闭子面板回列表）；openNote 收起文献盒全部窗口
- [x] 增量刷新：新增 core/list-patch.ts 键控卡片 diff；literature + clipping 文件事件只 patch 差异卡片（滚动不跳顶）；diary/movie 单列后续
- [x] 视频队列：失败原因白话化（humanizeError，原文在 title）+ 失败卡片点击进编辑弹窗带原因提示条；移动端仅 ➕ + ❌；移动端默认全屏补齐
- [x] 弹窗：添加任务「整片/剪辑」分段开关 + 校验失败聚焦 + Enter 提交；术语面板重设计（输入同行/状态行/预览卡片化）+ 重新生成手改确认
- [x] 样式：筛选/搜索留白 16px 对齐卡片；关闭按钮 ✕→❌ 三处统一；加载中占位
- [x] worktree/literature-ux-139 合并 master（1e340df）+ 全量 219 文件/3484 用例绿 + tsc + 构建部署

## Ticket 140 — 收藏本抽屉归档（纯冷存，ADR-0074）

**状态：已交付**

- [x] 规格：`issues/140-favorites-archive.md`（grill-with-docs 五轮拍板 Q1-Q8）
- [x] 抽屉动作序：打开 → 置顶 → 跳转笔记 → 刷新余额 → 编辑 → 归档 → 删除；归档 openFlowDialog 确认 → archived+archivedAt 落盘 → 冷存消失 + 📁 toast + 观察流「你归档了收藏《X》」
- [x] 冷存全排除：主列表/搜索/标签计数/批量余额（refreshData 唯一装载点过滤，data.ts 零改动零迁移）
- [x] 文档：ADR-0074（归档=纯冷存不可见）+ CONTEXT.md「归档」词条 + 收藏本动作序更新
- [x] worktree/favorites-archive 合并 master（263b47e）+ 全量 219 文件/3493 用例绿 + tsc + 构建部署


## Ticket 141 — 小橘「对话即操作」助手（待实现计划）

**状态：计划中**（仅记录需求 + 设计概要 + 待拍板项，未实施）

- [ ] 需求：小橘聊天说一句话（如「添加关于黑洞的文献笔记」）→ 直接调用对应域函数生成产物，无需打开域面板
- [ ] 设计：三层结构——① 技能注册表（每域动作 = 一条技能：detect/execute/confirm?/summary，新域接入零改聊天主流程）② 意图识别（词法快路径 + AI 慢路径兜底，不命中则照常聊天）③ 执行与反馈（复用域既有函数落盘 + emit 域事件入行为流 + 结果注入 AI 回复 + 自动打开产物）
- [ ] 边界：数据格式零变化、域事件契约复用（与 UI 手动生成同口径）、命令单点不动、纯增量
- [ ] 待拍板：直接执行 vs 预览确认／参数缺失行为（多轮追问/开面板/不执行）／V1 范围（文献盒+备忘录 / 仅文献盒 / 多域）
- [ ] 详细记录：`issues/141-smartcat-agent-assistant-plan.md`

## Ticket 142 — 术语生成文献笔记面板简洁版（用户逐条拍板）

**状态：已交付**

- [x] 规格：`issues/142-term-note-panel-simple.md`（spec.md「术语生成面板简洁版」节同步）；原型 `.scratch/term-note-panel/index.html`（方案 A 属性表定稿，.scratch 不入库）
- [x] 删：弹窗标题（bz-win-head 整行）/「术语」label / 输入框 placeholder / 输入框下红色提示小字（生成中状态行并入按钮「生成中…」，输入行下方无文字）；「类型」行不展示
- [x] 预览只读：领域 input / 简介 textarea 删除，上属性卡（术语/领域/日期）下内容卡，无「属性/内容」区标题
- [x] 「重新生成」手改守卫删除（ticket 139 的 flow-dialog 确认随预览只读一并移除）；确认写入仍传面板 term+预览值（所见即所得不重跑 AI）
- [x] 测试改写：无标题/label/placeholder/状态行断言 + 预览只读 input/textarea 为空断言 + 重新生成直接覆盖无守卫用例；全量测试绿 + tsc 0 错 + 构建部署

## Ticket 143 — 文献盒桌面窗口简洁版（用户拍板：主面板/视频录入保留标题；worktree 交付）

**状态：进行中 → 已交付**

- [x] 规格：`issues/143-literature-simple-layouts.md`（spec.md「文献盒桌面窗口简洁版」节同步）；原型 `.scratch/literature-minimal/index.html` 每窗 4 套布局走查后全部拍板 A（.scratch 不入库）
- [x] 主面板/视频录入：**保留原标题**（用户拍板），仅搜索框简洁化（去 placeholder，盒内 🔍 图标）
- [x] 历史：去标题，工具栏 = 「🕘 历史 · 共 N 条」+ ❌；组头去「UP主」前缀与「N 条笔记」计数；笔记行 `shortNoteName` 去目录去 .md；时间 `formatRelativeTime` 相对显示
- [x] 添加任务：去 h4 标题（编辑态右上角 `#lit-add-mode` 标签）；链接输入 label + 整片/剪辑开关同行；新任务默认剪辑片段（编辑按 start/end 回显）；分P 去括号；去 placeholder；失败提示条红色 → 中性化
- [x] 移动端：表单行 / 链接行折单列，每行一个输入框
- [x] 测试：新增 4 用例 + 改写默认剪辑/mode 标签/历史路径与标题断言；全量测试绿 + tsc 0 错 + 构建部署（worktree/literature-simple → master 合并）

## Ticket 144 — 全站 UX/UI 批次第一波（19 域审查拍板，分波交付）

**状态：第一波已交付；待办归档见 issues/144-ux-batch.md**（原编号 141 与并行会话撞号重编；代码提交信息保留旧号）

- [x] core：notifyUndo/notifySaveError/confirmDiscard helper + toast action 按钮减重
- [x] review：flow-dialog 迁移 / ESC 层级 / 搜索防抖 / 移出可撤销 / 通知类型修复 / 样式收敛
- [x] quiz：普通模式删除（纯复习会话语义）/ 键盘快捷键 / 去 800ms 强制跳题 / 对错计数 / 样式收敛
- [x] secondbrain：对话可取消+流式 / 历史持久化+清空 / 多行输入 / 移动端吞错修复 / 移除 AI 生成概括 / ESC 层级
- [x] favorites：分页 / 排序（favoritesSortKey 设置键）/ 搜索空态区分 / 删除可撤销 / 保存防假死 / 脏表单拦截 / 样式收敛
- [x] 全量 221 文件 / 3528 用例绿 + tsc 零错误；待办（真 Bug 剪藏/影视、通病接入、加密盒/密码/番茄钟/聚合讯/小橘/自动摘要/影视报告/阅读报告）见 issues/144-ux-batch.md

## Ticket 146 — 文献盒交互第三轮（用户三条拍板；worktree 交付）

**状态：进行中 → 已交付**

- [x] 规格：`issues/146-literature-ux-round3.md`（spec.md「文献盒交互第三轮」节同步）
- [x] 主面板列表：标题↔简介↔时间分档加大间距（summary 6→10px、date 6→12px）；日期改 `formatRelativeTime` 相对显示（无效回退原文、空不显示）
- [x] 视频录入单钮态机：删独立 `#lit-btn-video-abort`；空闲「▶️ 批量处理」（无工作禁用）↔ 运行中「⏹ 终止」（仅失败项续跑「⏹ 终止整批」）；完成有失败可再点续跑；移动端整钮隐藏（`.bz-lit-run-btn` 文本钮）
- [x] 测试：改写视频面板/移动端用例（无 abort、三态断言）+ 新增主面板日期用例 + 新增单钮态机用例（含失败续跑）；全量测试绿 + tsc 0 错 + 构建部署（worktree → master 合并）

## Ticket 145 — bili-dl 压缩回退（压缩件比原文件大则采纳原文件；用户拍板，tools 交付）

**状态：进行中 → 已交付**

- [x] 规格：`issues/145-bili-downloader-compress-fallback.md`（spec.md「压缩回退」节同步；CONTEXT/README/cli.js 注释同步）
- [x] tools/bili-downloader core.js ③.5：`needsCompressFallback`（压缩件严格更大 → 删压缩件沿用输入、不写压缩缓存、交付文件名不带 `_crf` 标记）；断点续跑命中缓存恒为采纳
- [x] 测试：`needsCompressFallback` 单测（更大回退/更小·相等·stat 异常不回退）；tools `node --test` 49 全绿
- [x] bz 侧 tsc + 全量测试 + 构建不回归；全局安装副本 core.js/文档同步生效

## Ticket 152 — secondbrain Syncthing 冲突文件自动自愈（worktree 交付）

**状态：进行中 → 已交付**

- [x] 诊断：冲突文件 `.sync-conflict-20260830-*.json/.vec` 为双设备并发 refresh 索引不同新笔记的真实分叉（conf 多 1 篇 + vec 恰好多 1 行，见 issues/152）；写前比对（2026-08-29 止血）挡不住「两端真写不同内容」
- [x] 设计：store-file 每次读取扫描 `*.sync-conflict-*` —— JSON 段级 union（meta.notes 键并集取 mtime 大者 / panel 取 generatedAt 大者 / queue-state-chatHistory 并集去重）+ .vec 按合并后 meta 键序行级重排（meta 未变则主 .vec 复用）；兜底删向量走 indexIncomplete 全量重建（ticket 107）；损坏冲突 JSON 保留待人工处置
- [x] 规格：`issues/152-secondbrain-syncthing-conflict-selfheal.md`；spec.md「冲突文件自愈」节（v1.6）同步；CONTEXT 第二大脑词条补冲突自愈
- [x] 代码：`src/secondbrain/store-file.ts`（mergeStoreWithConflict / mergeVecByMeta / reconcileConflicts / reconcileVecConflicts / nukeVectorsForRebuild + readStoreRaw 出口统一收敛）；`tests/mock-vault.ts` adapter 补 readBinary/writeBinary + list 纳入 binaryFiles
- [x] 测试：store-file 冲突自愈 7 用例（段级 union / vec 行级重排 / meta 未变复用 / 损坏保留 / 无冲突零行为 / 纯函数 / 无 list 降级）；全量 221 文件 3542 用例绿 + tsc 0 错
- [x] 构建部署：worktree → master 合并后构建，产物同步 E 盘插件目录与仓库根目录三件套

## Ticket 153 — 通知「去复习」走做题流程 + 做题答对自动跳下一题

**状态：已交付**（2026-08-30；worktree/review-notify-quiz）

- [x] 规格：`issues/153-review-notify-quiz-flow.md`（CONTEXT.md 词条「到期提醒」同步）
- [x] **bug 修复**：逾期通知「去复习」action 由「裸开最早逾期笔记」改为 `reviewApp.autoJumpOverdue()`——按「用做题测难度」（forceQuizForReview）分流：开启 → 批量出题做题；关闭 → 普通复习；删单篇跳转与 earliest 目标计算（newly diff 去重语义保留）
- [x] **交互拍板**：做题答对（单选/多选）持久化成功后自动 `showQuestion()` 进入下一题，不再挂「下一题」按钮；答错才显示按钮（点按或 Enter）；删 `_enableNextButton`/`_removeNextButton`/disabled 占位参数与 `.quiz-next-btn--pending` 样式
- [x] 测试：review/app.test.ts ticket 58 两用例改写 153 语义（「去复习」触发 autoJumpOverdue、不裸开单篇）；quiz/ui.test.ts 答对类用例改自动跳题断言 + 新增键盘 Enter 答错跳题用例；全量 3536 绿 + tsc 0 错 + 构建部署

## Ticket 154 — 主页统计条「索引」改「文献」开文献盒

**状态：已交付**（2026-08-30；vault 主页.js 仓库外改动）

- [x] 规格：`issues/154-home-index-to-literature.md`（CONTEXT.md「主页统计条」词条同步）
- [x] vault `CONFIG/SCRIPTS/DataView/主页.js`：计数 `indexCount`→`literatureCount`（`文献盒/` 笔记数，与卡片/主题口径一致）；点击动作 `__homeActions.文献` → `bz-literature-open` 开主面板
- [x] 插件侧零改动（`bz-literature-open` → `openLiteraturePanel` 既有）；文档型提交

## Ticket 155 — 术语窗口自动生成 + 生成/重新生成/总结按钮

**状态：已交付**（2026-08-30）

- [x] 规格：`issues/155-literature-term-autogen-summary.md`（spec.md「术语面板自动生成 + 总结按钮」节同步）
- [x] `showTermEntry(term)` 预填非空自动生成（选中文字打开即生成）；`termHasDraft` 态机：生成成功输入行按钮「生成」→「重新生成」
- [x] 底部按钮「重新生成」→「总结」（`#lit-term-regenerate` id 契约不变）：`summarizeTermSummary` AI 精简预览正文回填，所见即所得落入确认写入；无预览提示先生成，`termSummarizing` 防并发
- [x] 测试：literature 121 用例绿（ui 622/732 改写 + 总结落盘新用例、note-gen 精简用例、index-cov 打桩断言自动生成）+ tsc 0 错

## Ticket 156 — 做题家：答对 0.8s 亮绿跳题 + 去右上角统计 + 逾期复习出新题

**状态：已交付**（2026-08-30）

- [x] 规格：`issues/156-quiz-correct-jump-stats-newq.md`（spec.md「做题家作答节奏与出题语义」节同步）
- [x] 答对延时 800ms 自动跳题（亮绿反馈窗口；放弃/强制关闭清除延时 + `_sessionActive` 守卫防僵尸弹窗）
- [x] 删头部 `.bz-quiz-stats` 对错统计（元素/字段/方法/样式）；结算面板统计保留
- [x] `batchGenerateQuestions` 改「先清后生」：逐笔记清空 quiz.json 存量题再全新生成（上轮错题不再重考）
- [x] 测试：quiz+review 187 用例绿（答对类补延时等待、新增延时竞态用例、批量出题断言先清空）+ tsc 0 错

## Ticket 157 — 入口页：移动端长按无法拖拽图标（长按同手势直接拖）

**状态：已交付**（2026-08-30）

- [x] 规格：`issues/157-launcher-longpress-drag-mobile.md`（spec.md「入口页长按同手势拖拽」节同步）
- [x] 根因（移动端）：长按只进编辑重建 DOM（拖拽需松手重按）+ touchmove 无阻断/touch-action 缺失（滚动抢占 pointercancel 杀手势）+ 系统长按菜单未拦
- [x] 修复：长按触发后同手势延续监听（>10px 直接 startDrag）+ document 非被动 touchmove preventDefault（拖拽全程、抬起解除）+ `.launcher-tile.editing` touch-action:none + grid contextmenu 拦截 + callout 禁用
- [x] 测试：launcher 76 用例绿（helper 补 pointerup 释放防悬空手势、新增同手势拖拽/仅进编辑两用例）+ tsc 0 错

## Ticket 158 — 小橘：日小结/洞察/周报未生效（记忆流断粮饿死修复）

**状态：已交付**（2026-08-30）

- [x] 规格：`issues/158-smartcat-reflect-digest-weekly-starvation.md`（spec.md「小橘反思/日小结/周报饿死修复」节同步）
- [x] 根因：ADR-0069 R2 后记忆流断粮——反思证据<2 静默空转、首次日小结被 `!lastReflect` 卡死、周报门槛/原料读记忆流恒<3
- [x] 修复：`behaviorToObservations` 派生视图（wording+credibility）——反思证据池并入（双写去重）、周报门槛/原料并入；`shouldReflect` 行为流 20 条触发首次反思；`shouldDigest` 首次解耦反思（3 条即触发）；周报 `hour>=10` 防相位跳档
- [x] 测试：smartcat 1137 用例绿（重写 2 旧语义用例 + 新增 4 用例）+ tsc 0 错

## Ticket 159 — 备忘录：删除未入小橘行为流（落盘时序加固）

**状态：已交付**（2026-08-30）

- [x] 规格：`issues/159-memo-delete-behavior-flush.md`（spec.md「备忘录删除行为流落盘加固」节同步）
- [x] 实证：事件链路完整且有测试；真实行为流 added×8/completed×7/edited×3/deleted×0 ⇒ 症状=落盘时序（30s 防抖 + 卸载 fire-and-forget，删除后 30s 内退出即丢）
- [x] 加固：`markBehaviorDirty` 追加 5s 短防抖直写（窗口内合并；与 30s tick 并存）；`stopScheduler` 清定时器
- [x] 测试：新增 5s 直写/合并/停止清理用例；smartcat 1138 用例绿 + tsc 0 错

## Ticket 160 — 小橘：三层记忆流水线 + 巩固参数设置面板（推翻 158 合并池）

**状态：已交付**（2026-08-30）

- [x] 规格：`issues/160-three-tier-memory-pipeline.md`（spec.md「三层记忆流水线 + 巩固参数面板」节同步；ADR-0075）
- [x] 数据层：digest 产出 `makeDigestObservation`（observation/source=digest/evidenceIds 溯源，〔今日小结〕前缀取消）；reflect 证据池只吃记忆流观察（删 behaviorToObservations 并池与描述去重）+ ref 条目贴「原文摘录」（refResolver，读失败回退路径）；shouldReflect 改「≥间隔 且 新素材≥阈值」双闸（新素材=max(pending 计数, created 扫描)，计数落 memory 路由分支/日小结批量/记忆目录新建）；周报只吃本周新增 insight（buildWeeklyReportData 重写：themeDist/insights/padAvg，统计字段退役）；SOURCE_LABELS 补 digest/weekly-report/note
- [x] 设置层：BzSettings +11 键（smartcatReflect*/smartcatDigest*/smartcatWeeklyMinInsights/smartcatRefExcerptLimit）+ ⚙️ 弹窗「记忆巩固」组 11 滑杆；getConsolidationConfig 统一读取（MEMORY_CONFIG 缺省，非法值回退）；旧设置清点：无既有键重叠，废弃面为内部常量语义与死代码
- [x] 测试：memory.test 158 三用例改写（行为流不再直进反思证据/首反思只看记忆流）+ ref 原文（截断/失效回退/0 关闭）+ digest→reflect 全链路 + getConsolidationConfig 覆盖 + shouldReflect 双闸；report.test 重写洞察语义；adr0069-core 计数语义更新；index-cov 周报链路种子加洞察；settings.test 九组快照
- [x] 门禁：tsc 0 错 + 全量 221 文件 3557 用例绿 + 构建部署 E 盘

## Ticket 161 — 小橘：巩固参数滑杆改输入框

**状态：已交付**（2026-08-30）

- [x] 规格：`issues/161-smartcat-consolidation-number-input.md`（spec.md「巩固参数滑杆改输入框」节同步）
- [x] 实现：src/smartcat/ui.ts 17 处 slider 行改 number 行（min/max/step/绑定/文案不变）；设置面板下滑误触滑杆问题消除
- [x] 测试：smartcat ui/settings + settings-schema-ui 用例绿 + tsc 0 错 + 构建部署 E 盘

## Ticket 162 — 小橘：巩固语义重定义（行为小结并入反思 + 阈值精简 + 周报锚定首洞察）

**状态：已交付**（2026-08-30）

- [x] 规格：`issues/162-consolidation-semantics-simplify.md`（spec.md「巩固语义重定义」节同步；CONTEXT.md「三层记忆流水线」词条改写）
- [x] 语义：反思只看素材阈值（默认 20，无间隔闸）；「日小结」更名「行为小结」并改为反思前置步骤（上次反思以来全部行为流 →1 条 observation，首次 24h，不占素材额度）；反思证据池全量按重要度排序（洞察条数 AI 自定）；周报窗口锚定第一条洞察按 7 天链式推进（空窗静默推进、洞察门槛退役）
- [x] 设置：巩固参数 11 → 2（反思观察阈值 + 引用摘录字数）；「移动端默认全屏」组挪面板最下；6 个退役设置键 data.json 残留值忽略
- [x] 测试：memory.test「睡前巩固」describe 整体重写为「行为小结」+ routedFetch 路由 mock；insight-version/emotion-recall/adr0069-core/trait-attribution/index-cov/behavior-wording/settings 同步
- [x] 门禁：tsc 0 错 + 全量 221 文件 3553 用例绿 + 构建部署 E 盘

## Ticket 168 — 复习单一入口：命令与面板退役，交互收敛到「复习（按数量）」

**状态：已交付**（2026-08-31）

- [x] 规格：`issues/168-review-single-count-entry.md`（grill 三轮全推荐 + 设计确认书；六切片发布）
- [x] 切片 01：命令收敛——10 个旧复习命令退役注册，仅留 `bz-review-count`（注册命令 39 → 35；命令 id 外部契约破坏接受）
- [x] 切片 02：主面板整体删除——列表/卡片/统一抽屉/难度弹窗等随删；⚙️ 设置入口收敛到篇数弹窗（空候选仍打开，设置可达）；「复习设置」标题去「计划」
- [x] 切片 03：「去复习」改走全 vault 逾期按数量会话（min(逾期数,每日上限) 截断 + 剩余留到下次提示）
- [x] 切片 04：死代码全清——autoJumpOverdue/redoReviewLoop/quizReviewLoop/reviewLoop/batchGenerateQuestions/结果卡函数；forceQuizForReview/reviewMobileDefaultFullscreen 两键删；做题家子项常显；styles 死类清理
- [x] 切片 05：⚙️ 设置弹窗「复习条目管理」组——全部条目列出、挂起标灰、逐条移出确认 → 撤销原样恢复（数据零丢失）
- [x] 切片 06：ADR-0077 + CONTEXT 术语修订 + PROGRESS 记票 + AGENTS 命令数同步
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署 + worktree 合并 master 并清理

## Ticket 169 — 「将当前文档加入复习计划」命令加回（review add current）

**状态：已交付**（2026-09-08）

- [x] 规格：`issues/169-review-add-current-command.md`（grill 四轮对齐 + to-spec 发布 + 单切片）
- [x] 实现：`bz-review-add-current`「将当前文档加入复习计划」——COMMANDS 表新增可选 editorCallback 通道（命令面板/快捷键/文档内右键待选三表面）；复用 `ReviewApp.addCurrentToReview`，补 .md 守卫与重复提示（原抛错语义改通知，不动既有排期）
- [x] 测试：新增 tests/review/app-add-current.test.ts（成功/重复/非 .md/命令入口四用例）；app.test 重复用例改新语义；smoke 命令数 35 → 36 + editorCallback 断言
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署 + worktree 合并 master 并清理

## Ticket 170 — 「批量加入复习计划」命令（review add with links）

**状态：已交付**（2026-09-08）

- [x] 规格：`issues/170-review-add-with-links-command.md`（grill 两轮对齐 + to-spec 发布；切片工单 171/172）
- [x] 切片 01（issues/171）：`src/review/links.ts` 出链收集纯函数（正文 links + frontmatterLinks，getFirstLinkpathDest 解析，断链/非 .md 丢弃、路径去重）+ `ReviewApp.addCurrentWithLinksToReview`（逐篇查重加入、跳过不动排期、汇总通知 success/info、目标集合整体去重）+ 入口 `reviewAddCurrentWithLinks`
- [x] 切片 02（issues/172）：`bz-review-add-current-with-links`「批量加入复习计划」注册（双入口）；smoke 命令 36 → 37 + 名称/editorCallback 断言；AGENTS/CONTEXT 同步
- [x] 测试：tests/review/links.test.ts（纯函数三用例）+ tests/review/app-add-with-links.test.ts（六用例：全新增/部分跳过/全部已存在/断链忽略/非 .md 拒绝/命令入口）
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建验证

## Ticket 173 — 第二大脑正文指纹索引：挪动/改 YAML 不重嵌

**状态：已交付**（2026-09-08）

- [x] 规格：`issues/173-secondbrain-body-fingerprint.md`（grill-with-docs 四轮对齐，ADR-0078）
- [x] 实现：`chunk.ts` hashChunks（chunks 拼接 FNV-1a，口径与向量输入严格一致）；`vector-store.ts` 三层判定（mtime 未变跳过 / 指纹同仅更新登记 / 指纹变重嵌）+ 孤儿池指纹迁移（继承向量、迁移登记键，单轮内存活）+ meta v9→v10 load 就地补指纹（零读盘零重嵌）
- [x] 文档：ADR-0078 + CONTEXT.md「正文指纹」词条 + 第二大脑词条 v10 修订
- [x] 测试：vector-store.test 新增五用例（v10 迁移/挪动继承/YAML-only/正文编辑重嵌/重复孤儿）+ cov 迁移断言；全量 3604 绿
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## Ticket 174 — opencode-go 请求带 x-opencode-session 头 + AI 报错透出服务端报文

**状态：已交付**（2026-09-08）

- [x] 背景：opencode Go 端点策略变更，强制 x-opencode-session 头，缺失一律 400 MissingSessionID——出题/对话/摘要等所有 opencode-go AI 功能全挂；requestUrl 默认 throw 吞掉服务端报文导致排查困难
- [x] 实现：core/ai.ts AIProvider 增 headers（两路请求合并）；opencode-go 挂进程内稳定 UUID；chatCompletionsNonStream 改 throw:false 自判状态码，400+ 透出服务端错误报文
- [x] 测试：tests/core/ai.test.ts 新增三用例（session 头稳定复用 / 400 报文透传 + throw:false / 非 JSON 错误体）；全量 3608 绿
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署；真实端点回归带头后 HTTP 200

## Ticket 175 — AI 服务商扩充：智谱 / 硅基流动 / 火山方舟

**状态：已交付**（2026-09-08）

- [x] 规格：`issues/175-ai-providers-zhipu-siliconflow-volcark.md`（grill-with-docs 两轮对齐 + to-spec 发布；与 174 并行开发，合并前 rebase）
- [x] 实现：core/ai.ts 三家 provider 解析（内置 endpoint + 够用低价默认模型 glm-4.7-flash / deepseek-ai/DeepSeek-V3 / doubao-seed-1-6-flash-250828；CORS 实测放行走流式 fetch）+ thinking 方言翻译（智谱/方舟 thinking:{type}，硅基原生透传）+ 五家模型行经 provider.model 覆盖；settings.ts 八新键；主设置页下拉五项、五家统一「密钥行 + 可选模型行」（opencode 行显隐收窄为 === opencode-go）；favorites 门控按所选服务商查各自密钥
- [x] 测试：ai.test 七新用例（三家解析/报错/方言翻译/模型覆盖）+ settings-schema 五家十行断言 + copy-lint 行清单更新 + favorites 门控 it.each 三家；全量 3619 绿
- [x] 文档：CONTEXT.md「AIService / createAI」词条五家枚举；无新 ADR（决策可逆）
- [x] 门禁：tsc 0 错 + 全量测试绿（含 174 rebase 后重跑）+ 构建部署

## Ticket 176 — 复习出题 AI 调用链加固：单篇化、超时/重试、提示词修订

**状态：已交付**（2026-09-08）

- [x] 取证核查：批量键回显协议错键被当成功（静默回退旧题）/ quizUpdate・updateQuiz 死代码 / AI 请求无超时无重试 / 单篇校验过严与批量不对称 / 提示词多选矛盾 / 截断 3000・2000 过狠 / 未关思考 / 选项不打乱 / questionsPerNote 无界 / response_format 无降级（详见 issues/176）
- [x] 实现：quiz/generator.ts 重构（90s 超时 + 瞬时失败退避重试 ≤2 次 + enable_thinking:false 关思考 + 逐题过滤校验 + 选项 Fisher-Yates 打乱重映射 correctIndices + 提示词修矛盾/截断统一 10000/选项卫生与内容依据约束 + 批量协议删除）；quiz/ui.ts ensureQuestions 单篇化 + questionsPerNote 钳制 1~20 + updateQuiz 删；quiz/index.ts quizUpdate 删 + 注释修正；core/ai.ts prompt() 增 response_format 400 去字段降级重试（唯一五域共享改动，已回归）
- [x] ADR-0079（出题链路单篇化）+ CONTEXT.md「做题家」词条 + issues/176-quiz-ai-call-hardening.md
- [x] 测试：generator.test 重写 16 用例（提示词/extractJSON/过滤/打乱/重试/超时/关思考）+ ui.test 新增 ensureQuestions 三用例（成功落盘/钳制/失败透出）+ ai.test 增 B4 两用例；全量 3630 绿
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## Ticket 176 追加 — 出题数量按篇幅自适应

**状态：已交付**（2026-09-08）

- [x] `QuestionGenerator.countRangeForLength` 四档（<500 字 2~3 / <2000 3~5 / <5000 5~8 / 其余 8~12，上限 12 × ≈200 token 输出可控）；出题数量留空时生效，显式数字仍「恰好 N 道」优先；提示词同时告知模型本篇字数
- [x] 测试：四档边界 + 提示词分档 + 显式优先；顺带修复选项打乱引入的非确定性断言（改「索引→原文本」映射，连跑 5 次无 flake）；全量 3631 绿
- [x] 门禁：tsc 0 错 + 构建部署

## 上游线合并（tier 1+2）— 并入 yeshimei/bz 第一档安全增量与第二档换肤

**状态：已交付**（2026-09-09）

- [x] 取证：yeshimei/bz 与本地自 af7ed6b5 分叉（上游 727 提交 UI 重构线 / 本地 40 提交功能线）；按「不影响现有功能」分三档裁决，仅并第一档（纯加法）+ 第二档（数据兼容换肤），第三档（review 域重写、todo 接管 memo.json、8 域删除、命令 id 更替）整体排除
- [x] 第一档并入：上游 ADR-0077~0105、issues 177~244、5 份 UI 手册、新只读聚合域 home/recap/checkup/diary-wall、settings-panel（ADR-0080 并存不替换）、core ui 组件库（components.css/tokens.css/ui/* 等 35 文件）、domain-icons 单一事实源
- [x] 第二档并入：favorites/belongings/pomodoro/smartcat/diary/secondbrain/attach/literature/auto-summary 换肤（styles.css+ui），全局裸 button 排版基线（reset.css）
- [x] 本地数据源适配（新域消费本地域）：home/river+weekly、recap/aggregate 改用本地 movie(rebuildItems)/library(getBookItems/loadEpubBookItems)；checkup files/orphans/consistency 适配 weave 路径与 memo 单视角；home 磁贴命令映射本地 id（movie/clipping/library/pw）
- [x] 双方同改文件三方合并或手工重打：smartcat/ui.ts（上游换肤 + 本地电源组重植）、secondbrain/panel.ts（上游重构 + ticket 173 进度视图重植）、smoke 白名单 +5 新命令、favorites/ui.test 取上游（本地零增量）
- [x] 冲突裁决：settings-common 保留本地「移动端默认全屏」默认描述（文案冻结）；settings-schema 恢复 ToggleRow/SelectRow 导出；path-classify 恢复 movieFolderPath 键 + 'movie' 标签；core/json-store 采上游集中式 CONFIG/.CORRUPT 留档（launcher 测试断言同步）；main.ts 导出 applyDiarySettingsToRuntime；ai-models/settings-model-picker（上游 AI 注册表，与本地 ticket 175 冲突）不并入
- [x] 排除域遗留测试清理：walkthrough-fix-c/review-fix-b/enh-sweep-c（专测上游独占域样式）删除；d3-write-gate 白名单映射本地域；render-purity PREVIEW_DOMAINS 裁剪为本地四域；settings-panel.test 按本地域集重写
- [x] 设置键新增（接口+默认值）：belongingsDefaultStatus、settingsPanelLayout/Skin/MobileDefaultFullscreen、diaryWallMobileDefaultFullscreen
- [x] main.ts 接线：5 新命令（bz-home-open/bz-recap-today/bz-diary-wall-open/bz-data-checkup-open/bz-settings-panel-open）+ applyWallDirectories + 5 unload；attach/index 重植 ensureAttachSeed（本地 launcher 播种）；favorites/index 重植 file-sync 出口
- [x] reading-report 保持本地版（上游改版与未并入的 bookshelf 深度耦合）；review/encrypt/todo/clipbook/cinema/bookshelf/memo/launcher 全部保持本地
- [x] 门禁：tsc 0 错 + 全量 4192 测试绿 + 构建部署

## 上游线移植（P1~P7）— 纯增量功能五项 + 文档归档 + 构建挂接

**状态：已交付**（2026-09-09，继 tier1+2 合并后按用户裁决逐项落地）

- [x] P1 FSRS 拟合：`review/fit.ts` + data.ts FittedParams 存取（review-fit.json，D3 串行队列）+ reviewApp loadFitParams/maybeRunFit/currentW/currentR（两处评级尾部触发、两处 FSRS 构造改拟合权重优先，无产物行为等同）+ 设置键 reviewEnableFit/reviewFitEveryN（⚙️「记忆拟合」组，默认开、样本 <100 自动跳过）+ checkup 扫描目标恢复 review-fit 行
- [x] P2 复习统计：`review/stats.ts + stats-ui.ts`（streak/评级分布/负载热力图/单条时间线）+ 命令 `bz-review-report`（icon calendar-check）
- [x] P3 快速取密：`encrypt/pw-picker.ts`（条目类型对齐本地 PasswordEntry，不引上游 vault-data）+ password 域 `quick-copy.ts`（ensureSafeUnlocked → DataManager → 选择即复制，60s 清空复用本地 copySensitiveText）+ 命令 `bz-encrypt-copy-password` + pwqp 样式段落域
- [x] P5 获取模型名：`core/ai-models.ts` 本地适配版（registry 换五家静态端点表，与 getAIProvider 逐字对齐；opencode-go noCors 直走 requestUrl）+ `core/settings-model-picker.ts`（依赖仅 ModelOption 类型）+ main-schema AI 组尾「获取模型名」按钮行（拉取→弹选→回填当前服务商模型键）
- [x] P4 fav 字段随 C6 延后（pw-picker 无消费点，唯一消费方是未并入的三栏面板）
- [x] P6 上游碰撞 issues（168~176 共 7 篇）归档 `issues/upstream-yeshimei/`，本地工单号语义保持唯一
- [x] P7 esbuild production 段挂 buildPreview（评审壳预览包，ADR-0104；部署目标保持本地真实 vault 不动）
- [x] smoke 白名单 +2；AGENTS 命令数 44；CONTEXT 增补四词条
- [x] 拒绝项维持：C1 review 面板/冲刺/quiz-core、C7 AI registry 全套、C9 main-schema 拆分、C10 esbuild 上游部署目标
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## 上游线补充移植 — A4 错题解析 + dev 预览包监听（用户裁决：冲突项全部不动）

**状态：已交付**（2026-09-09）

- [x] 用户裁决：C1 直接冲突项（三区面板/冲刺、quiz-core、批量出题、满血 FSRS、快捷评级命令组）全部不改；纯增量由包仔裁量
- [x] A4 错题解析：QuizQuestion.explain 可选字段（存量零迁移）+ prompt 要求每题「一句话解析+原文依据」+ quiz/ui 单选/多选答错分支渲染 .quiz-explain 行（存量题静默不显示）；补数据层+UI 层测试 3 用例
- [x] dev 预览包监听补全：esbuild dev 段挂 watchPreview（render.ts 变化重出 prototype-render.js；P7 此前只挂 production 段）
- [x] 明确不做：A1 移除命令（属 ticket 168 退役的 F2 命令组）、A2 queue.ts（无消费点死代码）、A3 面板样式（无消费点）、P4 fav（消费方在未并入的三栏）、F1 满血 FSRS（行为变更，违背「不影响现有功能」约束）
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## 上游线 C2 裁决落地 — todo 待办域整体换血，memo 域退役（ADR-0092）

**状态：已交付**（2026-09-09，用户裁决：「直接全部换成他的，尚未用过该功能」）

- [x] 数据零迁移确认：TodoItem 与 MemoItem 14 字段一致、同一 memo.json、id 生成同源
- [x] 换血：src/memo + tests/memo 退役删除；上游 src/todo（10 文件：场景工作台 UI/due/reminder/file-sync/settings）+ tests/todo（5 文件）并入
- [x] main.ts：imports/ribbon「待办」/命令 bz-todo-open+bz-todo-add/onload ensureTodoReminders+ensureFileSync/onunload unloadTodo+unloadFileSync；storagePath 迁移清单 todoFilePath 条目删除；favorites 引用同步保留本地（todo/file-sync 只管 memo.json，天然分工零重复）
- [x] settings.ts：删 todoFilePath/memoAutoArchive/memoMobileDefaultFullscreen；加 todoPanelWidth/Height/todoSkin/todoMobileDefaultFullscreen；memoScenarios/memoDefault*/autoPopupOnStart/openNoteReminder 保留（todo 设置沿用）；aiAgent 三键保留（本地门控引用同步现状不变）
- [x] settings-panel：todo 域导航+loader（todoSettingsSchema）替换 memo；DOMAINS/NAV_SECS 同步
- [x] 适配：todo/data.ts 的 cinemaFolderPath 引用改 movieFolderPath（本地影视目录键）；todo/settings 文案两处过本地 lint（去括号/收短）；移动端组描述恢复本地默认文案（文案冻结口径）
- [x] 测试：smoke（ribbon/命令名/常驻域/默认抽查）、mobile（OFF memo→todo）、settings-schema（全屏键参数）、settings-tab（todoFilePath 退出迁移提示）、settings-panel（域清单）、lint-a（目标 memo→todo）全部同步
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## 上游线 C3 裁决落地 — bookshelf 书架墙整体换血，library 书库域退役

**状态：已交付**（2026-09-09，用户裁决：看书/做笔记经字段级验证不受影响，直接换血不设并存期）

- [x] 笔记功能等价验证：parseBookNotes 逐字一致；updateComment 仅签名异步化（写盘 vault.process 原子读改写不变）；跳转聚焦修复弃用 activeLeaf；EPUB weave-cfi 深链协议本地本就有（与 Weave EpubLinkService 对齐）
- [x] 换血：src/bookshelf（18 文件：书脊墙/借书卡/五肤×亮暗/notes/notes-ui/EPUB 分类 v3/layouts 布局层）+ tests/bookshelf（5）并入；src/library + tests/library 退役删除
- [x] 连带采纳 reading-report 内嵌化（ADR-0091）：上游 3 文件 + 测试；bz-reading-report-open 打开面板内报告视图（正名「阅读分析报告」）
- [x] settings.ts：删 libraryFolderPath/libraryMobileDefaultFullscreen；加 bookshelfFolderPath('')/bookshelfMobileDefaultFullscreen(true)/bookshelfDefaultSide('all')/bookshelfSortMode('date')/bookshelfSkin('nordic')；folderPath 空时回落旧键存量值（零感知迁移）
- [x] 数据消费点回接上游：home/river+weekly、recap/aggregate、checkup/files+checks-orphans 的书目读取从 library/items 改回 bookshelf/data（scanMarkdownBooks/loadEpubItems/progress/epubVaultPath）；weave 路径常量回 bookshelf/data
- [x] main.ts：命令 bz-bookshelf-open（书库）/bz-reading-report-open（阅读分析报告→openBookshelfReport）；bz-book-notes-open 退役（笔记窗口从面板进）；onunload unloadBookshelf
- [x] settings-panel：bookshelf 行/loader 换血；home 磁贴 commandId bz-bookshelf-open
- [x] 工程同步：build-css SOURCES library→bookshelf；d3-write-gate 白名单回 bookshelf/notes；render-purity PREVIEW_DOMAINS 加回 bookshelf（5 域）
- [x] 测试同步：smoke（白名单/命令名/默认抽查）、mobile（ON library→bookshelf）、lint-b（目标 library→bookshelf）、settings-panel（域清单）
- [x] 门禁：tsc 0 错 + 全量 4218 测试绿 + 构建部署

## 缺陷修复 — 样式聚合清单缺 core/ui 两层，书架墙/待办面板不可见

**状态：已交付**（2026-09-09，真实 Obsidian 控制台定位）

- [x] 症状：点击「书库」无反应；DevTools 实测 `.bz-panel-overlay` 计算样式 position=static（壳样式缺失），DOM 已挂载但流式渲染不可见
- [x] 根因：换血合并只换了域条目，样式聚合清单（build-css SOURCES）缺上游新增的 `core/ui/tokens.css` + `core/ui/components.css` 两层——书架墙/待办/快速取密等全部新 UI 的壳与控件样式基座
- [x] 修复：SOURCES 补两项（styles.css 275→360KB，.bz-panel-overlay/.bz-input/.bz-bs-wall 全部就位）；真实 Obsidian 重载验证书脊墙正常弹出（23 本全馆藏书统计/分类/搜索排序/书脊均正常）
- [x] 波及面排查：待办面板（todo）、快速取密（pw-picker）同样依赖组件库样式——本次修复一并恢复

## 上游线 C4 裁决落地 — cinema 影院域整体换血，movie + movie-report 域退役（ADR-0087/0090）

**状态：已交付**（2026-09-09，用户裁决：C4/C5/C6 直接完整替换）

- [x] 数据同源验证：评分推断状态语义（-1/0/其他）与字段（观影日期/评分/海报/影评）逐字一致，零迁移
- [x] 换血：src/cinema（18 文件：书脊化风格框架/analysis AI 页/recommend AI 推荐/poster-watch/layouts 布局层）+ tests/cinema（6）并入；src/movie + src/movie-report + tests/movie + tests/movie-report 退役删除
- [x] main.ts：命令 bz-movie-open/add/report → bz-cinema-open/bz-cinema-add/bz-cinema-analysis（ADR-0090 报告内嵌影院分析页）；onunload unloadCinema
- [x] settings.ts：删 movieFolderPath/PageSize/DefaultSort/DefaultTypeFilter/DefaultStatusFilter/RatingDisplay/MobileDefaultFullscreen；加 cinemaFolderPath('我的/影视')/cinemaSortMode('date')/cinemaStatusFilter/cinemaGridColumns('5')/cinemaStyle('midnight')/cinemaMobileDefaultFullscreen；movieDirectory（日记侧）保留
- [x] 消费点回接上游：home/river+weekly、recap/aggregate、checkup/orphans 影视读取改回 cinema/data parseMovieFile + cinema/constants（含 getStarString）；path-classify 恢复 cinemaFolderPath+'cinema' 标签
- [x] settings-panel/home 磁贴/build-css/d3 白名单/render-purity 预览域（6 域）/lint-c/main-lifecycle/mobile/smoke 全部同步
- [x] smartcat 行为感知兼容：cinema 沿用 'movie' 通道派发；movie-source 直读数据不变
- [x] 门禁：tsc 0 错 + 全量 4198 测试绿 + 构建部署

## 上游线 C5 裁决落地 — clipbook 剪藏本融合域整体换血，news + clipping 域退役（ADR-0082/0086）

**状态：已交付**（2026-09-09，用户裁决：C4/C5/C6 直接完整替换）

- [x] 数据契约：news.json 四段「磁盘为基底、双写者各自保留非本域段」；clipbook.json 新增侧写；剪藏 md 不动——零迁移
- [x] 换血：src/clipbook（17 文件：未读流+剪藏一体化工作台/保存流水线/B 站源组/write-queue/news-data）+ tests/clipbook（11）并入；src/news + src/clipping + tests/news + tests/clipping 退役删除
- [x] auto-summary 随上游对接 clipbook（3 src + 3 测试恢复上游版）
- [x] main.ts：命令 bz-clipping-open/bz-news-open → bz-clipbook-open；onunload unloadClipbook
- [x] settings.ts：删 clippingMobileDefaultFullscreen/newsRetentionSavedDays+SkippedDays；加 clipbookMobileDefaultFullscreen/ReaderFontSize/PanelWidth/Height/MidWidth/newsRetentionUnsavedDays；articleDirectory 保留
- [x] settings-panel/home 磁贴/build-css/d3 白名单（news/reader → clipbook/save+ui）/lint-b（恢复上游 clipbook+up-manager 目标）/mobile（clipping 键退役，9 键）/smoke 同步
- [x] 门禁：tsc 0 错 + 全量 4191 测试绿 + 构建部署

## 上游线 C6 裁决落地 — encrypt 统一保险库换血，password 域退役（ADR-0085）

**状态：已交付**（2026-09-09，用户裁决：C4/C5/C6 直接完整替换）

- [x] 数据零迁移确认：同一 .safe.enc 清单、同一主密码/解锁态；密码=kind='password-vault' SafeNote；fav 字段新增兼容旧 7 字段
- [x] 换血：src/encrypt 上游版（ui 2695 行三栏工作台 + vault-data/vault-pw-view/vault-assets-view/pw-picker 子模块 + styles）+ tests/encrypt（8）并入；新增 core/crypto.ts（CryptoService 独立模块）；src/password + tests/password 退役删除
- [x] main.ts：命令 bz-pw-open/add/generate 退役；bz-encrypt-open 正名「保险库」；bz-encrypt-copy-password 走上游 controller.quickCopyPassword；onunload 移除 unloadPassword
- [x] settings.ts：删 passwordMobileDefaultFullscreen（charset/length/securityMode 保留——生成器消费）；encrypt 行正名
- [x] 面板/磁贴：password 行删除、encrypt 行正名「保险库·密码·加密笔记·日记」；home password 磁贴删除
- [x] P3 适配版退役：自移植 pw-picker/quick-copy 由上游原生实现替代（fav 字段随 vault-data 到位，P4 兑现）
- [x] 测试同步：smoke（bz-pw 三条删/passwordLength 抽查删）、mobile（ON 删 password，8 键）、lint-a（删 password 目标）、settings-panel（域清单/NAV_SECS/保险库正名）、main-lifecycle（unloadPassword 移除）
- [x] 门禁：tsc 0 错 + 全量 4176 测试绿 + 构建部署

## 2026-09-09 · 日记隐私门（ADR-0106）：日记内容零上云硬开关

- [x] settings.ts：新增 `diaryPrivacyGuard`（默认 true，仅显式 false 关闭——缺省宁紧勿松）
- [x] smartcat/memory.ts：addObservation 新旧签名在路由解析前拦截 diary 来源（与 ADR-0069 exempt 同口径：不落行为/记忆任何流、不打分、不进反思与对话）
- [x] recap/summarize.ts：numbersSegments/buildRecapDigest 增 `excludeDiary` 选项；generateRecapContent 按隐私门剔除 AI 提示词中的日记数字与日记时间轴（本地写回不受影响）
- [x] diary/ui/panel.ts：日记本 ⚙️ 新增「隐私」组开关
- [x] 测试：tests/smartcat/diary-privacy-guard.test.ts（4 例）+ summarize.test.ts 增 digest 剔除/AI 提示词剔除（2 例）
- [x] 同步：CONTEXT.md 术语「日记隐私门」+ docs/adr/0106
- [x] 门禁：tsc + 全量测试 + 构建部署

## 2026-09-10 · ticket 245：日常时间记录三 QuickAdd 宏整合进 diary 域

**状态：已交付**（issues/245-daily-quickadd-integration.md）

- [x] 新增 `src/diary/daily.ts`：`runTaskCheck`（7 项任务 `openFlowDialog` 逐项打勾 → `updateFileSections` 段级合并写回 `CONFIG/SCRIPTS/每日任务状态.json`，格式沿用原宏零迁移）/ `openReviewDialog`（复盘模板经写日记弹窗 preset 预填，走 addEntry 条目链路）/ `planTomorrow`（明日日记三段日程模板，写前 `diaryDataMap` 为 null 先 `loadAll` 防整文件重写丢数据，`### 代办事项` 重复检测）
- [x] `selectDueTasks(status, today, hour)` 纯函数：已问过（true/false）跳过、时间限制（accounting≥12、diary/work_summary/review_words/review_index≥16）未到跳过
- [x] `src/diary/ui/dialogs.ts`：`openAddDialog(preset?: AddDialogPreset)` 支持预选标签/预填正文/覆盖日期时间，无参行为不变
- [x] `src/diary/config.ts`：DEFAULT_TAGS_CONFIG 加 `复盘: { emoji: '🪞' }`
- [x] 入口：COMMANDS 表三条 `bz-diary-task-check`/`bz-diary-review`/`bz-diary-plan` + 日记面板头部 📋/🪞/🗓️ 三按钮
- [x] 测试：daily-tasks.test.ts（12，node）+ daily-flow.test.ts（12，jsdom）+ smoke 命令 id 同步
- [x] 门禁：tsc 0 错 + 全量 4210 测试绿 + 构建部署

## 2026-09-10 · issue 246：日常收集（collect）新域——QuickAdd「日常收集」宏换血进插件

**状态：已交付**（issues/246-collect-domain.md；ADR-0107 域新增 + ADR-0108 隐私门边界例外）

- [x] 数据层 `src/collect/data.ts`（纯函数）：捕获管线 `appendCollect`（追加到 `## 非文件收集` 段末尾/标题缺失追加文件末尾）、条目解析器 `parseEntries`（只认 `- YY/MM/DD-HH:MM:SS 内容`）、`formatStamp`/`parseStamp`、初始文件内容（frontmatter + 标题）、分类清单纯操作（normalize/upsert/remove/rename/categoryFilePath/getCategories 空回落内置 16）
- [x] IO 薄壳 `src/collect/store.ts`：`captureToCategory`（目录逐段建、文件缺失走 initialFileContent、存在则读原文追加后 modify）+ 只读 `readRecentEntries`/`countSameDay`
- [x] UI `src/collect/ui.ts`：捕获弹窗（选分类/指定分类只读/选区预填、Ctrl+Enter 提交）、主面板分类启动器（`bz-win-head` + ⚙️ + 关闭 + 移动端全屏键）、⚙️ 设置弹窗（目标文件夹 path 行 + 分类增删改）+ `src/collect/styles.css`（进 build-css 聚合清单）
- [x] settings.ts：`collectCategories`/`collectFolderPath`/`collectMobileDefaultFullscreen` 默认值落盘
- [x] main.ts：命令 19 条（`bz-collect-open`/`bz-collect-capture`/`bz-collect-selection` + 16 条汉字分类命令 `bz-collect-<分类名>`）+ ribbon + onunload `unloadCollect`
- [x] home 快照：域清单加 collect 磁贴；`RiverCounts.collectToday` / `RiverData.collectRecent` / `riverCountText` / `buildDots` / `truncateCollect`；第三栏「今日收集」只读卡（今日条数 + 最近 3 条分类 badge + 摘要）
- [x] 测试：tests/collect/data.test.ts（16，node）+ tests/collect/ui.test.ts（9，jsdom）+ smoke 命令 id 全集同步 + tests/home river/ui-river 收集快照用例
- [x] 文档：ADR-0107/0108、CONTEXT.md 术语（收集条目/非文件收集/收集分类/收集目录）、AGENTS.md 领域清单与命令数、`.scratch/collect` spec
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## 2026-09-10 · issue 247：当日待办事项/日常行为记录——QuickAdd「日常时间记录」两个 Capture 宏换血进插件

**状态：已交付**（issues/247-diary-daily-capture.md）

- [x] 新增 `src/diary/daily-capture.ts`（diary 域，与 daily.ts 并列）：纯函数 `buildTodoLine`（`- [ ] 内容-HH:mm`，task:true 冻结）/`buildActivityLine`（`- HH:mm-活动`）/`insertIntoSection`（小节末尾插行：最后一个非空行后 / 小节空紧跟标记行 / 未命中整行追加文末）/`sanitizeCaptureText`；薄壳 IO `captureToDiarySection`（enqueueFileTask 同路径串行，与 diary writeFile 互斥）
- [x] 共写语义（issue 246 模式）：与 QuickAdd 宏同格式共写当天日记；模板形态（frontmatter+小节）与条目形态（`# emoji HH:mm`，插行进条目正文 parser 重写不丢）都原样插行不动其余行；文件缺失以「标记+首行」新建（不复制 QuickAdd 模板 frontmatter）
- [x] UI：`openQuickCapture` 单行输入弹窗（uiModal 基座 + 遮罩/ESC 无关闭钮 + Enter 直提）→ `openTodoCapture`/`openActivityCapture`
- [x] 入口：COMMANDS 两条 `bz-diary-todo-capture`/`bz-diary-activity-capture` + 日记面板头部 ✅/🏃 两按钮
- [x] 样式：`.bz-diary-capture` 写 `src/diary/styles.css`（基座走 core uiModal）
- [x] 测试：daily-capture.test.ts（16，node）+ daily-capture-ui.test.ts（4，jsdom）+ smoke 命令 id 同步
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## 2026-09-11 · 写日记弹窗两步化（ADR-0109）：移动端正文不再被软键盘吞

**状态：已交付**

- [x] 背景：原单弹窗 `时间→类型→正文→保存`，移动端键盘弹起后正文框与保存按钮被覆盖，无法输入/保存
- [x] 结构：两步共用一个 mask、两个 popup——第一步 `#add-diary-popup`（时间+类型+吸底「下一步」）、第二步 `#add-diary-content-popup`（正文+吸底「上一步」「保存」）；第一步隐藏不销毁，datetime/类型容器仍是 `saveNewEntry` 数据源
- [x] 吸底：`.bz-diary-add-body`（限高滚动）+ `.bz-diary-add-foot`（按钮行不随内容滚走），新增类写 `src/diary/styles.css`，不新增内联视觉样式
- [x] 语义：第一步「下一步」拦截未选类型（冻结文案）；上一步保留草稿、遮罩/ESC/保存丢弃；preset 带分类（每日复盘）跳过第一步；第一步移动端不自动聚焦、第二步自动聚焦正文
- [x] 同步：panel.ts ESC 关闭改调 `closeAddDialog()`（两步同收 + 草稿清零）；main.ts 卸载清理 id 清单加 `add-diary-content-popup`
- [x] 测试：新增 `tests/diary/add-dialog-steps.test.ts`（8 例：停在第一步/未选类型拦截/进第二步 DOM 保留/草稿保留/取消丢弃/preset 跳步/两步保存落盘/body-foot 结构）；修 `dialogs-cov.test.ts` 保存按钮查询改到第二步 popup
- [x] 文档：ADR-0109 + CONTEXT.md 术语「分步写日记」
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## 2026-09-11 · 日记前导区保留（ADR-0110 / issue 248）：模板形态文件不再被守卫拒写

**状态：已交付**

- [x] 报障：2026-09-11 写日记报「28 行内容无法解析，本次修改没有写入文件」——当天文件是模板形态（frontmatter + `## 小节` 骨架、0 条目标题），整篇被计为未解析行 → P0 守卫拒写；通知引导的「检测日记解析」对该形态无任何可执行动作（只能跳转），死锁
- [x] 面：全库 621 个日记文件，153 个模板形态、仅 4 个含 `# emoji HH:mm` 条目头——结构性冲突而非脏数据
- [x] 修复：日期文件分「前导区 + 条目区」，前导区写回原样拼回文件头；未解析行口径收窄为条目区孤行；疑似头行边界（合法/缺空格/时间非两位）与修复引擎单源；行号戳带前导区偏移；条目清空时前导区存在则保留文件只收回条目区
- [x] 端到端：真实 `2026-09-11.md` 修复前 28 行未解析拒写 → 修复后 0 行、写入成功且骨架一字不动（临时脚本验证后已删）
- [x] 测试：新增 12 例 + 随语义更新 7 例（parser/repair/write-guard/repair-modal/store/recap-summarize）
- [x] 文档：ADR-0110 + issues/248 + CONTEXT 术语修订（「未解析行」）+ 新词条「日记前导区」
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署

## 2026-09-11 · 日程规划支持「当日 / 明日」（ADR-0111 / issue 249）

**状态：已交付**

- [x] 需求：点「日程规划」先出现「当日 / 明日」两个选项；两选项生成的模版完全一样，只有落盘日期不同（当日=今天日记，明日=明天日记）
- [x] 入口：新增 `openPlanPicker()`（`openFlowDialog` 两动作，默认焦点=明日，回车即旧行为；遮罩/ESC 取消不建）；命令 `bz-diary-plan` id 不变、名称去「（明日日记）」改「日程规划」
- [x] 主流程：`planTomorrow()` 退役 → `planDiary(target)` + 纯函数 `planDate`/`planDateLabel`；模板 `buildPlanContent()` 逐字不动，两目标产物除日期外同构
- [x] 顺带修缺陷：判重原用单标记 `### 代办事项`，与「当日待办事项」捕获的 `TODO_HEADING` 同名——支持「当日」后当天写过待办就会被误判为已规划而跳过；收紧为 `### 代办事项` + `### 完成情况跟踪` 双标记同时命中（纯函数 `hasPlan`），通知文案随目标走「当天/明天」
- [x] 测试：`tests/diary/daily-flow.test.ts` 17 例（改造 3 例 + 新增 4 例：当日落盘/取消不写/两目标正文逐字一致/单标记不误判/「当天」文案）
- [x] 文档：ADR-0111 + issues/249 + CONTEXT.md「日常时间记录」词条修订（含新增 `_Avoid_`）
- [x] 门禁：tsc 0 错 + 全量测试 268 文件 4284 例绿 + 构建部署（根 main.js 已同步）

## 2026-09-11 · 日程规划改为「按日记模板建文件」（ADR-0112 / issue 250）

**状态：已交付**

- [x] 报障：用户「你修改了我原本的日程规划的模板样式」——对照真源属实：QuickAdd 宏 `日程规划.js` = 读 `CONFIG/TEMPLATE/模板-日记.md` + 末尾追加三段 + 新建文件（产物即 `我的/日记/2026-09-11.md` 的骨架形态）；插件版走 `addEntry` 条目链路，产物是 `# 📖 HH:mm` 条目形态，**不同形**
- [x] 字节级校验：`模板原文 + "\n\n" + buildPlanContent() + "\n\n"` 与 vault 真文件 `2026-09-11.md` 完全一致（COMPOSE_MATCH=true），基准确立
- [x] 落盘改造：文件不存在 = 模板 + 三段新建；已存在且原文已有规划（双标记）= 提示不重复一字不写；已存在但无规划 = 末尾补 `## 日程规划` + 三段（已有标题则只补三段），其余一字不动
- [x] 纯函数：`buildDiaryFileContent(template, date)` / `appendPlanToDiary(content)` / `hasPlan(text)`（判据由「解析条目」改「文件原文」）；模板真源仍为 vault 模板文件（与宏同源），不可读时内置兜底骨架
- [x] frontmatter 规整（Q3-B）：删 `title`（占位残留）、`date_creation` 填 `{目标日期} 00:00:00`；这是与用户基准文件仅有的两处差异
- [x] 模板文件清理（Q3-B，vault 内 `CONFIG/TEMPLATE/模板-日记.md` 去两行脏字段）：4 个消费方（日程规划.js / 日记.js / daily-notes / QuickAdd）同步受益
- [x] 测试：`tests/diary/daily-flow.test.ts` 17 例（8 例日程规划，内联 vault 真文件为逐字节基准）
- [x] 文档：ADR-0112 + ADR-0111「修订」段 + issues/250 + CONTEXT.md 词条再修（含新增 `_Avoid_`）
- [x] 门禁：tsc 0 错 + 全量测试 268 文件 4284 例绿 + 构建部署

## 2026-09-11 · 日记标题层级整体上提一级（ADR-0113 / issue 251）

**状态：已交付**

- [x] 需求：用户「把所有的标题都往前提一级，就是二号标题变成一号标题，三号标题变成二号标题」
- [x] 裁定：存量旧日记**兼容旧层级**（读侧按标题文字匹配、层级无关，不批量迁移）；复盘模板**只提首行**（`## 当日复盘` → `# 当日复盘`，其下 `###`/`####` 不动）
- [x] 写侧：`FALLBACK_DIARY_TEMPLATE` 骨架各级 → `#`；`buildPlanContent()` 三段 → `##`；`PLAN_HEADING` → `# 日程规划`；`PLAN_MARKER`/`PLAN_TRACK_MARKER` → `## 代办事项`/`## 完成情况跟踪`；`ACTIVITY_HEADING` → `# 日常行为记录`、`TODO_HEADING` → `## 代办事项`；vault `CONFIG/TEMPLATE/模板-日记.md` 五个骨架标题同步提级
- [x] 读侧兼容：新增 `headingLineRe(text)`（`^#{1,6}[ \t]+文字[ \t]*$`）——`hasPlan` 与 `appendPlanToDiary` 判标题层级无关；`insertIntoSection` 新增 `findMarkerLine` 两轮查找（精确优先、旧层级兜底）且小节边界取**命中行实际层级**，旧文件插行结果逐字不变
- [x] 测试：`daily-flow` / `daily-capture` / `daily-capture-ui` / `daily-tasks` 四文件更新 + 新增 6 例（旧层级判重命中、新层级标题不重复插、新层级小节插入与切分、新层级 UI 落行、兜底骨架为 `#`、复盘首行 `#`）
- [x] 文档：ADR-0113 + issues/251 + CONTEXT.md「日常时间记录」「日记前导区」词条修订（含新增 `_Avoid_`：读侧标题匹配不得写死层级）
- [x] 门禁：tsc 0 错 + 全量测试 268 文件 4290 例绿 + 构建部署（根 main.js 与 vault 插件目录均已同步，旧层级字面量 0 命中）

## 2026-09-11 · 写日记 / 复盘改为「按小节落块」+ 退役日记解析检测（ADR-0114 / issue 252）

**状态：已交付**

- [x] 需求：写日记内容落 `# 随笔`、复盘落 `# 当日复盘`；不要出现在日记面板列表 / 标签筛选 / 回忆墙 / smartcat；「检测日记解析」取消
- [x] 落点：新增 `src/diary/daily-write.ts`（`ESSAY_HEADING` / `REVIEW_HEADING` / `buildEntryBlock` / `writeDiaryEntry`）——写日记块首行 `**✍️ 20:30**`（**加粗行不是标题**，四份 `^# emoji HH:mm` 头条正则全部不命中，故自然不进那四个消费方）；复盘块首行 `## 🪞 21:40`（h2，落在骨架级 `# 当日复盘` 之下）
- [x] 建节规则（有意不对称）：`# 随笔` 在骨架里 → 缺失**不建**、追加文末并弹 warning；`# 当日复盘` 不在骨架里 → 缺失则**写时在文末新建**（用户原话「在日记文件最下面添加」）
- [x] 复用与兼容：`daily-capture.ts` 抽出 `locateSection` 两入口共用，新增 `insertBlockIntoSection`（多行块 + `createIfNotFound`）；单行 `insertIntoSection` 行为逐字不变，ADR-0113 的「新层级优先、旧层级兜底」只有一份实现
- [x] 链路：`saveNewEntry` 改走 `writeDiaryEntry`（不再 `addEntry` / 不再 `insertCard` / 不再标签筛选联动）；`jumpToEntry` 降级为 `openDiaryFile`（打开该日期文件）；`REVIEW_TEMPLATE` 去掉首行（小节名由落点提供，避免重复标题）
- [x] 退役工具：删面板「维护」组 + `repair-modal.ts` + `repair.ts` + 对应测试 + `bz-diary-repair-*` / `.bz-button` 样式 + d3 白名单条目；`store.ts`×3 / `recap/summarize.ts`×1 守卫文案改为不指向已删工具的人话；**写前守卫本体保留**（防丢行）
- [x] 测试：更新 8 个文件（两条旧「插卡」用例改写为「不插卡」，成功文案改正则，失败分支改从 `vault.create` 注入）；`tests/diary` 32 文件 479 例全绿
- [x] 文档：ADR-0114 + issues/252 + CONTEXT.md「日常时间记录」「日记前导区」词条修订（新增「日记内容块」词条）
- [x] 门禁：tsc 0 错 + 全量测试绿 + 构建部署
