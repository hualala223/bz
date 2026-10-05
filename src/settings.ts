/**
 * 插件设置（对应原 QuickAdd 各脚本 settings.options 全量迁移，spec「设置项总表」）
 *
 * 迁移原则（ADR-0005 / spec「设置页」）：保留原脚本全部可配置项；
 * 默认值均提取自各脚本源码 settings.options.defaultValue。
 */

// 工具坞（dock 域）登记条目类型 —— **type-only**：类型层引用，运行时零依赖（不拖 dock 侧的 core/storage）
import type { DockToolEntry, DockToolRunState } from './dock/data';

export default interface BzSettings {
  // ===== 🤖 AI 全局（Q3 语义，spec「AI 全局」）=====
  /** AI 服务商：deepseek / opencode-go / zhipu / siliconflow / volcano-ark */
  aiProvider: string;
  /** 🔑 DeepSeek API Key（留空则回退读取 QuickAdd data.json） */
  deepseekApiKey: string;
  /** 🔑 OpenCode Go API Key */
  opencodeGoApiKey: string;
  // —— 五家统一「密钥行 + 可选模型行」（ticket 175）：模型留空 = 内置默认 ——
  /** DeepSeek 可选模型（留空用插件默认模型） */
  deepseekModel: string;
  /** OpenCode Go 可选模型（留空 deepseek-v4-flash） */
  opencodeGoModel: string;
  /** 🔑 智谱 API Key（open.bigmodel.cn） */
  zhipuApiKey: string;
  /** 智谱可选模型（留空 glm-4.7-flash） */
  zhipuModel: string;
  /** 🔑 硅基流动 API Key（api.siliconflow.cn） */
  siliconflowApiKey: string;
  /** 硅基流动可选模型（留空 deepseek-ai/DeepSeek-V3） */
  siliconflowModel: string;
  /** 🔑 火山方舟 API Key（ark.cn-beijing.volces.com） */
  volcanoArkApiKey: string;
  /** 火山方舟可选模型（留空 doubao-seed-1-6-flash-250828；ep-xxx 接入点 ID 也填这里） */
  volcanoArkModel: string;

  // ===== 🧰 工具坞（dock 域，2026-10-04：外部工具的登记、启动、观测）=====
  /** 外部工具登记表 —— 「要执行什么」的**唯一真理源**，也是本插件权限最高的数据。
   *  只存在插件设置（`.obsidian/plugins/bz/data.json`，不随 vault 分享）里：若允许从 vault
   *  内文件读，「打开别人给的 vault」就等于「在他机器上执行任意命令」（ADR-0235 决策）。
   *  管理入口 = 工具坞面板内的「添加工具」（不走设置页行编辑）。 */
  dockTools: DockToolEntry[];
  /** 🔔 漏跑提醒（默认开）：工具自己声明了节奏、而当天该有记录却没有时，标红之外再发一条通知。
   *  只有**声明了节奏**才判；声明缺失时退回「只展示最后运行时间」，不猜（ADR-0235 决策 D11）。 */
  dockNotifyMissed: boolean;
  /** 🚀 自动运行（默认开，ADR-0236）：Obsidian 启动就绪后，bz 亲自按各工具声明的节奏触发它 ——
   *  到点跑、该跑没跑就补跑、失败提醒。关掉 = 全部退回「只手点」。移动端恒不生效（起不了进程）。 */
  dockAutoRun: boolean;
  /** bz 侧自动运行台账（每工具：最近一次尝试 / 连续失败数 / 是否熔断暂停）。
   *  **不是**工具的运行记录 —— 那份归工具自己写（D8/D9）；这里只是 bz 的调度账（`DockToolRunState`）。 */
  dockRunState: Record<string, DockToolRunState>;
  // ===== 👤 脸谱（people 域，2026-10-04 并入）：数据目录与导入/提炼口径 =====
  /** 脸谱数据目录（导出/画像/媒体仓根；vault 相对路径） */
  peopleDataDir: string;
  /** 微信账号数据目录（聊天记录 raw 来源根） */
  peopleWxAccountDir: string;
  /** 导入是否包含群聊会话 */
  peopleIncludeGroups: boolean;
  /** 语音转写预览开关 */
  peoplePreviewVoice: boolean;
  /** 图片描述模式（AI 段口径） */
  peopleImageDescMode: string;
  /** 图片描述批量大小 */
  peopleDescBatchSize: number;
  /** 视频预览开关 */
  peoplePreviewVideo: boolean;
  /** 导入保留系统会话 */
  peopleKeepSystem: boolean;
  /** 外部工具：Python 路径（bz-face 工具包运行时） */
  pythonPath: string;
  /** 脸谱面板桌面端拖拽缩放记忆（宽/高；0 = 未设置） */
  peoplePanelWidth: number;
  /** 脸谱面板桌面端拖拽缩放记忆（高） */
  peoplePanelHeight: number;
  /** 🖱 设置面板桌面端拖拽缩放记忆（ADR-0084/0094，492-sp-res）：0 = 未设置（默认宽走壳参数） */
  settingsPanelWidth: number;
  /** 设置面板桌面端拖拽缩放记忆（高） */
  settingsPanelHeight: number;
  /** 🖱 首页面板桌面端拖拽缩放记忆（上游 ADR-0084/0094，票 319）：0 = 未设置 */
  homePanelWidth: number;
  /** 首页面板桌面端拖拽缩放记忆（高） */
  homePanelHeight: number;

  // ===== 📂 数据存储路径（ADR-0009 共享数据路径）=====
  /** 共享 JSON 数据目录（memo/belongings/passwords/favorites/review/quiz/闪念 meta+vec 统一存放） */
  storagePath: string;

  // ===== 🔔 通知（core notice toast 横切偏好，issue 258）=====
  // 与上游同名同值，故沿用上游键名（ADR-0118 例外：两侧无命名分歧）。
  // 缺省值 = 加入偏好之前的既有行为，四项均未改时通知行为与旧版逐条一致。
  /** 🔔 通知级别：all（全部）/ important（仅警告与错误）/ error（仅错误）；带操作按钮的通知与
   *  进度类型不受影响（撤销/查看是交互出口，进度是长任务状态框，静默掉会让用户无从反悔） */
  noticeLevel: string;
  /** ⏱️ 停留时长档位：quick（2 秒）/ standard（3 秒）/ relaxed（5 秒）/ persistent（常驻点击才关）；
   *  只作用于未显式指定时长的默认停留——撤销类 6 秒反悔窗口与长文案动态延长不受缩放 */
  noticeDuration: string;
  /** 🧭 弹出位置：top-right（默认）/ top-left / bottom-right / bottom-left；
   *  仅在桌面端生效，移动端恒为顶部居中 */
  noticePosition: string;
  /** 📚 同屏上限：3 / 5 / 8（字符串存值）；超出时挤掉最旧一条，常驻进度帧不被挤出 */
  noticeMaxVisible: string;

  // ===== 📎 附件搬移（ticket 65，运行时记忆，不暴露设置）=====
  /** 上次选择的目标文件夹（文件夹选择器默认值） */
  attachLastFolder: string;

  // ===== 📝 备忘录/待办（memo.json 共享键；上游 ADR-0092 起 todo 域为唯一属主）=====
  /** 📄 显示文件名（固定 true，不暴露设置） */
  showFileName: boolean;
  /** 🚀 启动时自动弹出：启动时若存在未完成的重要或到期备忘录，自动弹出面板提醒 */
  autoPopupOnStart: boolean;
  /** 🔔 打开笔记自动提醒：打开笔记时若该笔记有重要/到期未完成备忘录，自动弹出面板 */
  openNoteReminder: boolean;
  /** 🏷️ 场景列表（逗号分隔，空则内置默认：剪藏,工作,学习,生活,代码,公开课） */
  memoScenarios: string;
  /** 🔀 默认排序方式：票 298 起面板改用三维分类器（ADR-0128），本键退役仅保留兼容旧 data.json，面板不再读写 */
  memoSortMode: string;
  /** 📁 默认显示归档：打开面板时显示已归档条目 */
  memoShowArchivedByDefault: boolean;
  /** ⭐ 新条目默认优先级：minor / important */
  memoDefaultPriority: string;
  /** 🆕 新条目默认场景（空=第一个场景） */
  memoDefaultScene: string;
  /** 🕒 到期时间格式：relative（今天 14:00 到期）/ absolute（MM/DD HH:mm 到期） */
  memoDueFormat: string;
  /** 🚪 打开面板默认场景：'@last'（上次停留，关面板时记忆）/ '全部' / '今日' / '重要' / 场景名；非法值回落「全部」 */
  memoOpenScene: string;
  /** ↩️ 上次停留场景（memoOpenScene='@last' 的取数源；关面板时写入，场景已删则回落「全部」） */
  memoLastScene: string;
  /** 🗂️ 已完成折叠区时间窗（天）：'7'/'30'/'90'，'all'=全部不折叠；非法值回落 30 */
  memoDoneWindow: string;

  // ===== 📖 日记本（12 项，diary-notebook 合并）=====
  /** 📂 日记目录 */
  diaryDirectory: string;
  /** 🎬 影视目录（日记本用） */
  movieDirectory: string;
  /** ✉️ 信目录 */
  letterDirectory: string;
  /** 📊 显示标签计数 */
  showTagCount: boolean;
  /** 🕒 使用文件日期作为默认日期 */
  useFileDateTime: boolean;
  /** 📄 每批加载数量（滚动加载每批显示的条目数） */
  diaryBatchSize: string;
  /** 🔒 日记隐私门（ADR-0100）：开启时日记内容绝不发往云端 AI——smartcat 对日记整条豁免、recap AI 摘要剔除日记痕迹；仅显式 false 关闭 */
  diaryPrivacyGuard: boolean;
  /** 😀 标签按钮显示 emoji（筛选栏与写日记弹窗，关=纯文字） */
  diaryTagShowEmoji: boolean;
  /** 📝 卡片内容渲染方式：markdown / plain（纯文本） */
  diaryContentRenderMode: string;
  /** 🔀 标签排序：fixed（内置配置顺序）/ count（条目数量降序） */
  diaryTagSortMode: string;
  /** 📅 打开面板默认日期筛选：all（全部）/ this-month（本月） */
  diaryDefaultDateFilter: string;
  /** 🏷️ 默认选中标签（空=全部；填主标签名则打开面板即选中该标签） */
  diaryDefaultSelectedTag: string;
  /** ✏️ 保存后立即进入编辑（关=保存后仅关闭弹窗） */
  diaryJumpToEditAfterSave: boolean;

  // ===== 📦 归物本（1 项，ADR-0009 废弃）=====
  /** 📁 存储文件夹路径（belongings.json）——ADR-0009 废弃，统一走 storagePath，仅兼容保留 */
  belongingsDataFolder: string;

  // ===== 📰 剪藏本（2 项 + 自动摘要开关 + ticket 124 详设/数据源）=====
  /** 📂 剪藏目录 */
  articleDirectory: string;
  /** 📄 每批加载数量（滚动加载每批显示的条目数） */
  articleBatchSize: string;
  /** 📄 自动摘要：监听剪藏目录新文件（路径与剪藏目录一致） */
  autoSummaryEnabled: boolean;
  /** 📏 自动摘要长度档位：simple（简短）/ standard（标准）/ detailed（详细）——ticket 124 详设 */
  autoSummaryLength: string;
  /** 🏷️ 自动摘要标签生成开关（关 = 不生成/不补全 tags）——ticket 124 详设 */
  autoSummaryTagsEnabled: boolean;
  /** 🔢 自动摘要标签数量（"3-6" 区间文本）——ticket 124 详设 */
  autoSummaryTagCount: string;
  /** ⏱️ 自动摘要时机：immediate（保存后立刻，create+file-open 双监听）/ lazy（仅打开文件时补全）——ticket 124 详设 */
  autoSummaryTiming: string;
  /** 🗑️ 聚合讯保留策略：已保存骨架（state=saved，正文已清空）保留天数——ticket 124 数据源组 */
  /** 🗑️ 聚合讯保留策略：已跳过骨架（state=skipped）保留天数——ticket 124 数据源组 */
  newsRetentionUnsavedDays: string;

  // ===== 🔐 密码本（4 项）=====
  /** 📂 数据存储路径——ADR-0009 废弃，统一走 storagePath，仅兼容保留 */
  pwStoragePath: string;
  /** 🔤 密码生成字符集 */
  passwordCharset: string;
  /** 🔢 密码生成长度 */
  passwordLength: string;
  /** 🔒 安全模式（关闭列表窗口立即自动上锁） */
  securityMode: boolean;

  // ===== ⭐ 收藏本（1 项，ADR-0009 废弃）=====
  /** 📂 数据存储目录（文件名固定 favorites.json，只允许改目录）——ADR-0009 废弃，统一走 storagePath，仅兼容保留 */
  favoritesStoragePath: string;

  // ===== 📚 书库（7 项）=====
  /** 📁 书库文件夹 */
  // ===== 📚 书架墙（bookshelf 域；旧书库域 library 已退役，本域独立承担书库 UI）=====
  /** 📁 书库文件夹（书架墙域；空 = 运行时回落旧 libraryFolderPath 存量值，再回落「书库」） */
  bookshelfFolderPath: string;
  bookshelfMobileDefaultFullscreen: boolean;
  bookshelfDefaultSide: string;
  bookshelfSortMode: string;
  bookshelfSkin: string;
  /** 书架墙面板布局（上游 ADR-0199 外观组联动键；现仅 default 一档） */
  bookshelfLayout: string;
  /** 🏷️ 书籍识别标签 */
  bookTag: string;
  /** 📦 显示文件大小 */
  showFileSize: boolean;
  /** ⏱️ 显示阅读时长 */
  showReadingTime: boolean;
  /** 💡 显示划线数 */
  showHighlights: boolean;
  /** 🧠 显示想法数 */
  showThinks: boolean;
  /** 📝 显示书评摘要 */
  showReview: boolean;

  // ===== 🎬 影视（5 项）=====
  /** 📁 影视文件夹 */
  /** 📄 每页加载数量（列表初始加载及每次滚动加载的条数） */
  /** 🔀 默认排序：date-desc / date-asc / rating-desc / rating-asc / name-asc / name-desc */
  /** 🏷️ 默认类型筛选（空=全部；填 ALL_TAGS 中类型名则打开即筛选） */
  /** 📊 默认状态筛选：全部 / 想看 / 在看 / 已看 */
  /** ⭐ 已看卡片评分显示：stars（星星串）/ number（⭐数字） */


  // ===== 🧠 做题家（4 项，含 shuffleQuestions；设置并入复习计划 tab）=====
  /** 允许多选题 */
  enableMultipleChoice: boolean;
  /** 每篇笔记出题数量（f8：留空/0=自动） */
  questionsPerNote: string;
  /** 打乱题目顺序 */
  shuffleQuestions: boolean;
  /** 题目难度：random/easy/medium/hard */
  difficulty: string;

  // ===== 🔁 复习计划 + 做题家（合并 tab；quiz/review 共用数据路径）=====
  /** 数据存储路径（review.json / quiz.json 所在目录）——ADR-0009 废弃，统一走 storagePath，仅兼容保留 */
  reviewStoragePath: string;
  /** 🔔 到期提醒（ticket 100：原「启用逾期通知」键名不动，真正生效——有逾期即弹） */
  enableAutoNotify: boolean;
  /** 🆕 新笔记自动加入提醒（ticket 100：自动收编时弹提示，多条合并一条；关=静默收编） */
  reviewAutoAddNotice: boolean;
  /** 🆕 每日复习上限（0=不限；一轮开始复习最多处理 N 篇逾期） */
  reviewDailyLimit: number;
  /** 上游线 P1（ADR-0077）：自动拟合 FSRS 记忆参数——每 reviewFitEveryN 次评级后台拟合一次（false 关闭） */
  reviewEnableFit: boolean;
  /** 拟合间隔：累计多少次评级触发一次重拟合 */
  reviewFitEveryN: number;
  /** 🆕 复习间隔缩放（FSRS 相位出题天数 × 系数，0.1-5，默认 1；阶梯阶段不受影响）——ADR-0046 */
  reviewIntervalScale: number;
  /** 🆕 文件树标记（ticket 100：为复习笔记着色并标到期时间；关=清爽文件树） */
  reviewTreeBadge: boolean;
  /** 🗂️ 监听文件夹（多个目录；目录内未加入且未排除的 .md 自动进入复习计划，递归） */
  reviewWatchedFolders: string[];
  /** 🚫 排除名单（不参与监听自动加入的笔记路径数组；手动移除/确认移除/批量取消/不更新落此名单） */
  reviewExcludedNotes: string[];
  /** 🆕 按数量复习（ticket 01）：候选文件夹（目录内全部 .md 为候选池，含未入计划=新文件） */
  reviewCountFolder: string;
  /** 🆕 按数量复习：默认篇数 */
  reviewCountDefault: number;
  /** 🆕 按数量复习：历史:新配比（历史占百分比，默认 70＝历史 70%；一侧不足另一侧补齐） */
  reviewCountHistoryRatio: number;
  /** 🆕 按数量复习：上次输入篇数记忆（运行时字段，不进设置 UI） */
  reviewCountLastInput: number;

  // ===== 🧩 入口页（2 项）=====
  // 列数自 launcher.json v3 起存储（桌面/移动独立配置，域内设置页可调），
  // 旧 data.json 残留的 launcherColumns/launcherMobileColumns 死键已删除（P2：全仓 0 读）
  /** 显示磁贴文字（桌面端；关闭 = 全部磁贴仅显示图标） */
  launcherShowText: boolean;
  /** 移动端独立：显示磁贴文字（未设置 → 继承桌面端） */
  launcherShowTextMobile?: boolean;

  // ===== 🖐 手势触发（入口页域：选一个手势打开命令入口页，默认关闭）=====
  /** 打开入口页的手势（桌面端）：off | double | triple | swipe */
  launcherGesture: string;
  /** 移动端独立：打开入口页手势（未设置 → 继承桌面端） */
  launcherGestureMobile?: string;

  // ===== 🧠 第二大脑（secondbrain 域；原闪念 17 键 ticket 103 全量更名，onload 迁移旧值）=====
  /** Ollama URL（本地） */
  secondBrainOllamaUrl: string;
  /** Embedding 模型 */
  secondBrainEmbeddingModel: string;
  /** 检索重排总闸（issue 427；issue 431/ADR-0189 起常显，通道由 rerankChannel 单源判定） */
  secondBrainRerank: boolean;
  /** 重排走 Jev（issue 431/ADR-0189）：总闸开才显示，开启后走 JEV 组的 Jev 通道、不绑 8B 嵌入门 */
  secondBrainRerankJev: boolean;
  /** 重排模型（留空 = 内置 Qwen3-Reranker-4B；仅本地通道消费） */
  secondBrainRerankModel: string;
  /** 参考结果数 */
  secondBrainTopK: string;
  /** AI 检索结果数 */
  secondBrainChatTopK: string;
  /** 段落最小长度 */
  secondBrainChunkMinLength: string;
  /** 允许的文件夹（逗号分隔；f8：留空/空=不索引任何目录，不是「全库」） */
  secondBrainAllowPaths: string;
  /** 文件浏览器「已入脑」角标（票 305：已向量化笔记在文件列表挂绿点，缺省开） */
  secondBrainExplorerBadge: boolean;
  /** Embedding 请求并发数（QA 遗留死配置：定义后从未接线，忠实保留不删） */
  secondBrainConcurrency: string;
  /** 上下文限制 */
  secondBrainContextLimit: string;
  /** 防抖延迟（ms） */
  secondBrainDebounceDelay: string;
  /** 光标轮询间隔（ms） */
  secondBrainCursorPollInterval: string;
  /** Ollama 对话模型 */
  secondBrainChatModel: string;
  /** DeepSeek 模型 */
  secondBrainDeepseekModel: string;
  /** 默认使用 DeepSeek（true/false） */
  secondBrainDefaultUseDeepseek: string;
  /** 最大历史记录 */
  secondBrainMaxHistory: string;
  /** 远程 Ollama URL（移动端探活/降级链） */
  secondBrainRemoteOllamaUrl: string;

  // ===== 🔗 第二大脑·自动双链管线（ticket 111，⚙️ 弹窗「自动双链」组）=====
  /** 自动双链总开关：关联范围新笔记落盘时自动建立 related 双链（false 时无任何监听与写入） */
  linkAgentEnabled: boolean;
  /** 关联范围：英文逗号分隔的 vault 内目录清单（风格同 aiAgentWatchedFolders），同时决定落盘监听与候选过滤；f8：留空/空=不自动关联（ticket 116 起不再回退「文献盒」） */
  linkAgentScopes: string;
  /** 单篇候选数量（关联范围内向量近邻 Top-K） */
  linkAgentTopK: number;
  /** 每篇 related 写入上限；0 = 不限，由 AI 裁判自行决定（沿用复习域「0=不限制」惯例） */
  linkAgentMaxLinks: number;
  /** 处理完成后通知提醒（关闭则全程静默） */
  linkAgentNotify: boolean;
  /** 失效关联自动清理（metadataCache 删除事件 + 低频巡检） */
  linkAgentAutoClean: boolean;
  /** 已有关联不再建链（v1.7/ticket 167）：自动路径（创建/修改/队列消费）对 related 非空笔记跳过；手动重跑豁免 */
  linkAgentRespectRelated: boolean;

  // ===== 常驻监听开关（懒加载架构，ADR-0003）=====
  // AI Agent 4 项（ADR-0009）：设置不暴露 UI，运行时读字段（默认值兜底，尊重旧 data.json 值）
  /** AI Agent：笔记 rename/delete/create 同步 */
  aiAgentEnabled: boolean;
  /** 🤖 AI 剪藏匹配：开启后剪藏未命中时用 AI 判断并弹窗批准 */
  enableAIClipMatch: boolean;
  /** 📂 AI Agent 监听文件夹（逗号分隔） */
  aiAgentWatchedFolders: string;
  /** 🧠 AI Agent 剪藏匹配模型 */
  aiAgentModel: string;
  /** 第二大脑启用开关（l7A）：仅控制启动时自动加载（常驻监听/面板初始化），关闭后仍可从命令面板手动打开；原 flashEnabled，ticket 103 更名迁移 */
  secondBrainEnabled: boolean;

  // ===== 🍅 番茄钟（9 项，ticket 31）=====
  /** 预设方案 id（PRESETS 12 档：11 科学预设 + custom 自定义） */
  pomodoroPreset: string;
  /** 自定义工作时长（分钟） */
  pomodoroWorkMin: string;
  /** 自定义短休息时长（分钟） */
  pomodoroShortBreakMin: string;
  /** 自定义长休息时长（分钟） */
  pomodoroLongBreakMin: string;
  /** 几个专注后进长休息（N，默认 4） */
  pomodoroLongBreakInterval: string;
  /** 强制专注模式：专注阶段禁暂停/跳过/重置 */
  pomodoroForceFocus: boolean;
  /** 自动循环：阶段完成自动进入下一阶段 */
  pomodoroAutoCycle: boolean;
  /** 自动跳过休息：连续工作模式 */
  pomodoroAutoSkipBreak: boolean;
  /** 声音提醒（默认开） */
  pomodoroSound: boolean;
  /** 倒数滴答：最后十秒每秒一记轻响（默认开，上游 2026-09-23 特效批） */
  pomodoroTickSound: boolean;
  /** 提示音音量 0-100（默认 100 最大） */
  pomodoroVolume: number;
  /** 打开时恢复方式：background（后台继续倒计时）/ popup（正在倒计时则自动弹窗） */
  pomodoroRestoreMode: string;
  /** 后台自动暂停：窗口 hidden（最小化/遮挡/休眠）时主番茄钟暂停，恢复可见自动继续（默认开，ticket 62；blur 不触发） */
  pomodoroAutoPauseOnHide: boolean;
  /** 🎨 番茄钟面板布局（issue 264 吸收上游；当前仅 default 计时盘，非法值域内回落） */
  pomodoroSkin: string;
  /** 🎨 番茄钟面板主题（10 套皮单源 = src/pomodoro/skin.ts，未知值回落番茄） */
  pomodoroSkinTheme: string;
  /** 🎨 剪藏本面板布局（issue 265 吸收上游；当前仅 default 编辑部，非法值域内回落） */
  clipbookSkin: string;
  /** 🎨 剪藏本面板主题（新闻纸皮单源 = src/clipbook/styles.css，未知值回落新闻纸） */
  clipbookSkinTheme: string;
  /** 📎 剪藏图片本地化落地目录（上游 issue 329；空 = 关闭本地化） */
  clipbookImageFolder: string;
  /** 🗂 知识盒卡片盒目录 */
  knowledgeCardboxDirectory: string;
  /** 🗂 知识盒主题盒目录 */
  knowledgeTopicDirectory: string;
  /** 🔗 挂载/关联候选相似度下限（原始余弦；0=不过滤；批 4 补换算迁移） */
  linkAgentMinScore: number;
  /** 🔗 挂载建议自动弹出（上游 issue 318） */
  knowledgeMountAutoSuggest: boolean;
  /** B 站 Cookie（上游 ADR-0133：知识盒视频档位查询；数据源凭据组） */
  bilibiliCookie: string;
  /** 🧩 智谱 Plan 密钥（上游 issue 411 融合：Coding 套餐专用端点） */
  zhipuPlanApiKey: string;
  /** 🧩 智谱 Plan 模型（默认 glm-5.3-flash） */
  zhipuPlanModel: string;
  /** Ollama（本地）密钥（融合上游 issue 411；本地服务无需密钥，留空放行） */
  ollamaApiKey: string;
  /** Ollama 模型（留空 = 内置 llama3.1） */
  ollamaModel: string;
  /** 🧩 per-provider 最大输出 token 覆盖（上游 ADR-0148/0151；键=provider id） */
  aiMaxTokensOverrides: Record<string, number>;
  /** 🧩 per-provider 思考档位（上游 issue 330/411；键=provider id，值='off'|'default'） */
  aiThinkingOverrides: Record<string, string>;
  /** Jev 判定通道（上游 issue 389/ADR-0173；与生成通道并存，cinema/secondbrain 消费）。
   *  issue 430/433/ADR-0188/0190（上游吸收批 3）起：服务商两家（typesafe / bocha），
   *  密钥与模型按服务商分存（键 = JEV_PROVIDER_REGISTRY id），旧全局键经 onload 迁移进 typesafe 槽位 */
  jevProvider: string;
  /** 各服务商密钥（各控制台创建，互不通用）——填了即接管判定，无独立开关 */
  jevApiKeys: Record<string, string>;
  /** 各服务商模型名（空/缺 = 跟随该家缺省：typesafe → jev-latest，博查 → bocha-jev-v1） */
  jevModels: Record<string, string>;
  /** 🎨 知识盒面板皮肤（上游外观组范式） */
  knowledgeSkin: string;
  knowledgeSkinTheme: string;
  /** 🖼 知识盒影像本地化目录 */
  knowledgeImageFolder: string;

  // ===== 📥 日常收集（collect 域，issue 246：QuickAdd「日常收集」宏换血）=====
  /** 📂 目标文件夹（收集 md 统一存放目录，vault 根相对） */
  collectFolderPath: string;
  /** 🏷️ 分类映射（分类名 → 目标文件；空/非法回落内置 16 分类） */
  collectCategories: Array<{ name: string; file: string }>;
  /** 📥 日常收集主窗口：移动端默认全屏（默认开——分类网格铺满更好点） */
  collectMobileDefaultFullscreen: boolean;

  // ===== 🔐 加密保险箱（encrypt 域，ticket NN）=====
  /** 📂 保险箱根目录（加密清单 .safe.enc 与点前缀密文镜像的统一存放目录，默认 CONFIG/.ENCRYPT——点前缀目录 Obsidian 侧栏不可见，防误删） */
  encryptRoot: string;
  /** 🖼️ 生成省略图预览：加密时生成图片/视频压缩预览层（体积小但看得清，默认开） */
  encryptPreviewEnabled: boolean;
  /** 📏 预览目标长边（px，默认 384——用户可调，越小预览打开越快） */
  encryptPreviewSize: string;
  /** 🎚️ 预览 JPEG 质量 0-1（默认 0.5——用户可调） */
  encryptPreviewQuality: string;
  /** 🚀 预览自动加载原图：打开预览窗即自动解密原始层替换省略图（默认关——省流量/内存；开启后点击缩略图的手动逻辑仍可用） */
  encryptAutoLoadOriginal: boolean;
  /** 🔒 安全模式：关闭保险箱面板立即自动上锁（默认关） */
  encryptSecurityMode: boolean;

  // ===== 📱 移动端主窗口默认全屏（ticket 68，跨域，ADR-0019）=====
  // 仅移动端（Platform.isMobile）显示与生效；≤768px 开=真全屏（.bz-win-mfs）/关=95% 常规卡。
  // 只决定每次打开的初始形态；默认值=行为保持（原移动端即全屏→开，原居中卡→关）。
  // 聚合讯跟随剪藏本键、阅读报告跟随书库键、影视分析随影视键（2026-08 用户拍板，不设独立开关）。
  /** 日记本：移动端默认全屏（默认开——原 ≤480px 即全屏，480-768 原抽屉形态） */
  diaryMobileDefaultFullscreen: boolean;
  /** 待办（todo 新域）：移动端默认全屏（默认关——与旧备忘录一致，上游 ADR-0092） */
  todoMobileDefaultFullscreen: boolean;
  /** 待办面板尺寸记忆（ADR-0084 拖拽缩放；0=未手动调整过，用默认 720×580） */
  todoPanelWidth: number;
  todoPanelHeight: number;
  /** 待办皮肤（ADR-0095 皮肤系统；'paper' 纸面为默认肤） */
  todoSkin: string;
  /** 归物本：移动端默认全屏（默认开——原 JS 内联强制全屏） */
  belongingsMobileDefaultFullscreen: boolean;
  /** 剪藏本：移动端默认全屏（默认开——原 CSS !important 强制全屏；聚合讯跟随此键） */
  // ===== 📚 剪藏本（clipbook 融合域，上游 ADR-0082；与旧 clipping/news 并存）=====
  clipbookMobileDefaultFullscreen: boolean;
  clipbookReaderFontSize: string;
  clipbookPanelWidth: number;
  clipbookPanelHeight: number;
  clipbookMidWidth: number;
  /** 密码本：移动端默认全屏（默认开——原 JS 内联强制全屏） */
  /** 收藏本：移动端默认全屏（默认开——原 JS 内联强制全屏） */
  favoritesMobileDefaultFullscreen: boolean;
  /** 收藏本：列表排序键（created=创建时间最新优先 / title=标题 / domain=域名，ticket 141。
   *  排序选择持久化于 data.json 而非 favorites.json——favorites.json 顶层是纯条目数组，
   *  顶层加字段需改根结构，会破坏仍在用的外部统计脚本 主页.js（读 favorites.length），
   *  且违背「既有结构不改」铁律；排序键落设置与 memoSortMode/movieDefaultSort 同惯例） */
  favoritesSortKey: string;
  // ===== 内容首页（home 域；票 288 随上游 issue 287/288 吸收）=====
  /** 🎨 内容首页外观占位（issue 246 同范式）：布局=活动河单卡，主题=米白单卡 */
  homeLayout: string;
  homeSkin: string;
  /** 🎨 归物本面板布局皮肤（上游外观组范式；当前仅 poster 瑞士大字报） */
  belSkin: string;
  /** 🎨 归物本主题（poster ↔ warmwhite 恒定纸面） */
  belSkinTheme: string;
  /** 🎨 收藏本面板布局皮肤（上游外观组范式；当前仅 default） */
  favoritesSkin: string;
  /** 🎨 收藏本主题（当前仅 linen 亚麻） */
  favoritesSkinTheme: string;
  /** 收藏本：打开面板默认筛选（上游 issue 296）：''=全部 / '@last'=记住上次 / 标签 label；非法值回落全部 */
  favoritesOpenFilter: string;
  /** 收藏本：上次筛选记忆（上游 issue 296；closePanel 写回；仅 favoritesOpenFilter='@last' 时消费） */
  favoritesLastFilter: string;
  /** 收藏本：默认排序（上游 issue 296）：new/old/title；置顶恒最前；非法值回落 new */
  favoritesDefaultSort: string;

  // ===== 🎮 游戏库（gameshelf 域，上游 issue 368：Steam 直连自动拉库，一作一笔记）=====
  /** 📁 游戏文件夹（游戏库域数据源；缺省回落「我的/游戏」） */
  gameshelfFolderPath: string;
  /** 📁 游戏海报文件夹（封面/图标本地缓存目录；空 = 关闭本地缓存） */
  gameshelfPosterFolder: string;
  /** 🎮 SteamID64（17 位数字；GetOwnedGames/GetRecentlyPlayedGames 查询主体） */
  gameshelfSteamId: string;
  /** 🎮 Steam Web API 密钥（steamcommunity.com/dev/apikey 免费申请；掩码行） */
  gameshelfSteamApiKey: string;
  /** 🎮 自动同步开关（打开面板时数据过期即后台拉库；默认开） */
  gameshelfAutoSync: boolean;
  /** 🎨 游戏库面板布局（外观组占位单卡；当前仅 default 海报墙） */
  gameshelfLayout: string;
  /** 🎨 游戏库面板主题（当前仅 ink 墨黑） */
  gameshelfSkinTheme: string;
  // ===== 首页时间线（issue 287，2026-09-11 用户点名六项；issue 288 拆组 + 去「已跳过」）=====
  /** 时间线字号档：compact 紧凑 / normal 标准 / loose 宽松（域 UI 在 .bz-home-panel 上挂 data-tl-size） */
  homeTimelineSize: string;
  /** 时间线时间范围（天数口径）：today 当天 / 3d 最近 3 天 / week 本周 7 天（= 周历窗口，默认） */
  homeTimelineRange: string;
  /** 时间线内容过滤：勾选显示哪些类（产出 / 状态推进 / 点评 ✦ / 已跳过，issue 305） */
  homeTimelineSkipped: boolean;
  homeTimelineProduce: boolean;
  homeTimelineProgress: boolean;
  homeTimelineNotes: boolean;
  /** 打开首页默认落到哪天：today 今天 / lastActive 最后有动静的那天 */
  homeDefaultDay: string;
  /** 时间线显示时刻列（11:03 那列；关掉整列隐藏，行首缩进随之内收） */
  homeTimelineTime: boolean;
  /** 明天预告卡开关（第三栏整块） */
  homeNextCards: boolean;
  /** 书库：移动端默认全屏（默认开——原 CSS ≤768 全屏主面板与读书笔记；阅读报告跟随此键） */
  /** 影视：移动端默认全屏（默认开——主面板/影视分析/影视报告同控，原 JS 内联强制全屏） */
  // ===== 🎬 影院（cinema 域；上游 ADR-0087 起接管旧影视域）=====
  cinemaFolderPath: string;
  /** 🖼 影院海报文件夹（上游 issue 397；留空用默认目录） */
  cinemaPosterFolder: string;
  /** 📺 剧集按季合并（上游 ADR-0168） */
  cinemaMergeSeasons: boolean;
  /** 🪟 影院面板桌面拖拽尺寸记忆（ADR-0084/0094；意图值，0=未记过） */
  cinemaPanelWidth: number;
  cinemaPanelHeight: number;
  cinemaSortMode: string;
  cinemaStatusFilter: string;
  cinemaGridColumns: string;
  cinemaStyle: string;
  /** 影院抓取：ApiZero Key（豆瓣字段接口，apizero.cn；空 = 字段走豆瓣演职员兜底，ADR-0129） */
  cinemaApizeroKey: string;
  /** 影院抓取：豆瓣 Cookie（搜索页风控时提高成功率，可选） */
  cinemaDoubanCookie: string;
  /** 影院：面板主题皮肤键（午夜场布局下的主题，渲染待皮肤设计接入） */
  cinemaSkinTheme: string;
  cinemaMobileDefaultFullscreen: boolean;
  /** 娱乐域国家待选项池（顿号分隔自定义段；票 294 / ADR-0127） */
  entertainmentCountries: string;
  /** 娱乐域题材待选项池（顿号分隔自定义段；票 294 旧全局键，票 299 起仅作组键缺省回落） */
  entertainmentGenres: string;
  /** 娱乐域题材池按组自定义段（组 → 顿号串；票 299 / ADR-0128 按组隔离） */
  entertainmentGenresByGroup: Record<string, string>;
  /** 番茄钟：移动端默认全屏（默认关——原移动端 320px 居中卡） */
  pomodoroMobileDefaultFullscreen: boolean;
  /** 保险箱：移动端默认全屏（默认开——原 JS 内联强制全屏） */
  encryptMobileDefaultFullscreen: boolean;
  /** 知识盒：移动端默认全屏（默认关——95% 居中卡，ADR-0065） */
  knowledgeMobileDefaultFullscreen: boolean;
  /** 知识盒：步骤进度详细度（默认开——当前步骤+耗时+百分比+步骤时间线；关=仅步骤徽章，ADR-0066） */
  knowledgeProgressDetail: boolean;
  /** 知识盒：处理完是否保留视频原件（默认保留；关=只出文献笔记不落视频，ADR-0066） */
  knowledgeKeepVideo: boolean;
  /** 知识盒：下载清晰度（'highest'/'1080'/'720'，默认最高；透传工具 options.quality，ADR-0066） */
  knowledgeQuality: string;
  /** 知识盒：遇错即停（默认关=失败后继续；开=单条失败后剩余保持待处理，ADR-0066） */
  knowledgeStopOnFailure: boolean;
  /** 知识盒：输出目录覆盖（默认空=跟随工具配置 ~/.bilibili-dl.json 的 outputDir，ADR-0066） */
  knowledgeOutputDir: string;
  /** 知识盒：压缩开关（默认开——用户拍板 ticket 136；透传工具 options.compress） */
  knowledgeCompress: boolean;
  /** 知识盒：压缩质量 CRF（默认 23，范围 18-28；透传工具 options.crf，ticket 136） */
  knowledgeCrf: number;
  /** 知识盒：文献目录（文献笔记落盘位置，默认 vault 根下「文献盒」文件夹——文件夹名不随票 290 域正名改动；ticket 136/ADR-0072） */
  knowledgeDirectory: string;
  /** 知识盒：领域词表（逗号分隔；空 = AI 自由写，ticket 136/ADR-0073） */
  knowledgeDomainList: string;
  /** 知识盒：ffmpeg 路径（原工具 rc ffmpegPath，ticket 136 全并进设置） */
  knowledgeFfmpegPath: string;
  /** 知识盒：ffprobe 路径（原工具 rc ffprobePath） */
  knowledgeFfprobePath: string;
  /** 知识盒：Python 路径（faster-whisper，原工具 rc pythonPath） */
  knowledgePythonPath: string;
  /** 知识盒：Whisper 模型（原工具 rc whisperModel） */
  knowledgeWhisperModel: string;
  /** 知识盒：缓存目录（原工具 rc cacheDir；留空=系统临时目录/bili-dl-cache） */
  knowledgeCacheDir: string;
  /** 知识盒：缓存保留天数（原工具 rc cacheRetentionDays） */
  knowledgeCacheRetentionDays: number;
  /** 转写 LLM 校对总开关（ADR-0222/issue 518，上游吸收批 3，缺省关）：知识盒影像转写文本在
   *  成文前发送到 AI 面板所配服务商「只修错不创作」校对。开启即同意文本出域 */
  asrLlmProofread: boolean;

  // ===== 🐱 小橘陪伴猫（smartcat 域：桌面宠物 + AI 陪伴）=====
  /** 小橘启用开关（l7A）：仅控制启动时自动加载（猫容器挂载/常驻行为），关闭后仍可从命令面板手动打开 */
  smartcatEnabled: boolean;
  /** 关闭方式（ticket 103）：小橘关闭后的处理——stop 彻底停机 / hide 仅隐藏（后台仍感知）/ lazy 仅不自动启动；默认 stop。立即生效 */
  smartcatOffMode: string;
  /**
   * 小橘主窗口：移动端默认全屏（默认关——原居中卡）。
   * 2026-08-23 合并一套（用户拍板）：聊天/设置/数据面板三窗共用本开关；
   * 原独立键 smartcatDashboardMobileDefaultFullscreen（ticket 071）删除，旧值残留忽略。
   */
  smartcatMobileDefaultFullscreen: boolean;
  /** 小橘记忆库向量化模型（'' = 跟随第二大脑嵌入模型；改动需重建记忆向量索引） */
  smartcatEmbeddingModel: string;
  /** 小橘记忆库分块字符上限（200–6000；默认 800——中文语义检索粒度优先，改动后新入库条目生效） */
  smartcatChunkLimitChars: number;

  // ===== 🐱 小橘记忆巩固（ticket 160 三层流水线；ticket 162 精简——反思只看素材阈值（证据池全量进
  // prompt，仅按重要度排序）；行为小结为反思前置步骤（1 条，不占素材额度）；周报窗口=上次周报以来（首次 7 天），
  // 洞察/小结条数由 AI 定）=====
  /** 反思新观察阈值（自上次反思记忆流新增达到该条数即反思；无时间间隔闸） */
  smartcatReflectMinNew: number;
  /** 反思引用原文摘录字数（0 表示不附原文） */
  smartcatRefExcerptLimit: number;
  /** 每次反思最多归纳洞察条数（ticket 163：默认 3——LLM 输出超限按序截断，防一次性产出过多） */
  smartcatReflectMaxInsights: number;
  /** 小橘对我的称呼（ticket 163：默认「包仔」；把记忆流/行为流喂给 AI 时「你/用户」替换为称呼） */
  smartcatUserName: string;

  // ===== 🐱 小橘行为流设置（P1 数据基座，ticket 123）=====
  /** 行为流最大保留天数（超出部分删除最旧条目） */
  behaviorMaxDays: number;
  /** 行为流最大保留条数（超出部分删除最旧） */
  behaviorMaxCount: number;
  /** 显示行为日志面板（控制 UI 入口是否可见） */
  showBehaviorLog: boolean;
  /** 启用自动双链（关联范围新笔记落盘时自动建立 related 双链） */
  enableAutoLinking: boolean;
  /** 自动双链窗口天数（关联范围内的笔记时间窗口） */
  linkWindowDays: number;
  /** 记忆目录（ADR-0069 记忆目录流）：进入小橘笔记记忆库的多个 vault 文件夹（⚙️ 小橘设置弹窗配置） */
  memoryDirectories: string[];
  /** 禁止读取目录（票 307）：小橘一概不读取的 vault 文件夹（观察/记忆库/书评全短路；⚙️ 小橘设置弹窗配置） */
  smartcatExcludedDirectories: string[];

  // ===== 🧠 第二大脑 =====
  /** 第二大脑主面板：移动端默认全屏（默认开——总览信息密度高；ticket 103） */
  secondBrainMobileDefaultFullscreen: boolean;

  // ===== 上游线（yeshimei/bz）并入新域设置键（第一档加法） =====
  /** 📦 归物本：默认状态筛选（空串=全部，其余 using/idle/sold/discard；非法值回落全部。上游 issue 194） */
  belongingsDefaultStatus: string;
  /** 📦 归物本：默认排序（recent 最近购入 / price 投入最高 / daily 日均最高；非法值回落 recent。上游 issue 294） */
  belongingsDefaultSort: string;
  /** 📦 归物本：新记条目默认状态（使用中/闲置；非法值回落「使用中」。上游 issue 294） */
  belongingsNewStatus: string;
  /** 📦 归物本：金额单位（cny=￥ 前缀默认 / yuan=元 后缀 / usd=$ / none=无符号；非法值回落 cny。上游 issue 294） */
  belongingsCurrency: string;
  /** 设置面板主窗口：移动端默认全屏（默认开；主面板全屏 + 关闭按钮，子面板一律弹窗。ADR-0080） */
  settingsPanelMobileDefaultFullscreen: boolean;
  /** 设置面板布局：'jingwei' = 经纬（当前唯一布局，ADR-0080） */
  settingsPanelLayout: string;
  /** 设置面板主题：'chenhun' = 晨昏（跟随 Obsidian 亮暗，ADR-0080） */
  settingsPanelSkin: string;
  /** 🎨 第二大脑面板布局（issue 246 占位单卡；未知值回落 default） */
  secondbrainSkin: string;
  /** 🎨 第二大脑面板主题（未知值回落 graphite） */
  secondbrainSkinTheme: string;
  /** 回忆墙：移动端默认全屏（默认开——媒体优先瀑布流真全屏，ADR-0081） */
  diaryWallMobileDefaultFullscreen: boolean;
}

export const DEFAULT_SETTINGS: BzSettings = {
  // AI 全局
  aiProvider: 'opencode-go',
  deepseekApiKey: '',
  opencodeGoApiKey: '',
  deepseekModel: '',
  opencodeGoModel: '',
  zhipuApiKey: '',
  zhipuModel: '',
  siliconflowApiKey: '',
  siliconflowModel: '',
  volcanoArkApiKey: '',
  volcanoArkModel: '',

  // 工具坞（dock 域）：空登记表起步（面板内添加）；漏跑提醒默认开；bz 自动运行默认开（ADR-0236）
  dockTools: [],
  dockNotifyMissed: true,
  dockAutoRun: true,
  dockRunState: {},
  peopleDataDir: '脸谱',
  peopleWxAccountDir: '',
  peopleIncludeGroups: false,
  peoplePreviewVoice: true,
  peopleImageDescMode: 'ai',
  peopleDescBatchSize: 4,
  peoplePreviewVideo: true,
  peopleKeepSystem: false,
  pythonPath: 'python',
  peoplePanelWidth: 0,
  peoplePanelHeight: 0,
  settingsPanelWidth: 0,
  settingsPanelHeight: 0,
  homePanelWidth: 0,
  homePanelHeight: 0,

  // 共享数据路径（ADR-0009）
  storagePath: 'CONFIG/STORAGE',

  // 通知横切偏好（issue 258；缺省 = 既有行为）
  noticeLevel: 'all',
  noticeDuration: 'standard',
  noticePosition: 'top-right',
  noticeMaxVisible: '5',

  // 附件搬移（ticket 65，运行时记忆）
  attachLastFolder: '',

  // 备忘录/待办（memo.json 共享键）
  showFileName: true,
  autoPopupOnStart: true,
  openNoteReminder: true,
  memoScenarios: '',
  memoSortMode: 'priority',
  memoShowArchivedByDefault: false,
  memoDefaultPriority: 'minor',
  memoDefaultScene: '',
  memoDueFormat: 'relative',
  memoOpenScene: '@last',
  memoLastScene: '',
  memoDoneWindow: '30',

  // 日记本
  diaryDirectory: '我的/日记',
  movieDirectory: '我的/娱乐',
  letterDirectory: '我的/信',
  showTagCount: true,
  useFileDateTime: false,
  diaryBatchSize: '20',
  diaryPrivacyGuard: true,
  diaryTagShowEmoji: true,
  diaryContentRenderMode: 'markdown',
  diaryTagSortMode: 'fixed',
  diaryDefaultDateFilter: 'all',
  diaryDefaultSelectedTag: '',
  diaryJumpToEditAfterSave: true,

  // 归物本
  belongingsDataFolder: 'CONFIG/STORAGE',

  // 剪藏本
  articleDirectory: '归档/网页剪藏',
  articleBatchSize: '20',
  autoSummaryEnabled: true,
  autoSummaryLength: 'standard',
  autoSummaryTagsEnabled: true,
  autoSummaryTagCount: '3-6',
  autoSummaryTiming: 'immediate',
  newsRetentionUnsavedDays: '7',

  // 密码本
  pwStoragePath: 'CONFIG/STORAGE',
  passwordCharset:
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ~!@$%^&*()_+',
  passwordLength: '16',
  securityMode: false,

  // 收藏本（只允许改目录，文件名固定 favorites.json）
  favoritesStoragePath: 'CONFIG/STORAGE',

  // 书库
  // 书架墙（bookshelf；空 = 未配置，运行时回落旧 libraryFolderPath 存量值——零感知迁移）
  bookshelfFolderPath: '',
  bookshelfMobileDefaultFullscreen: true,
  bookshelfDefaultSide: 'all',
  bookshelfSortMode: 'date',
  bookshelfSkin: 'nordic',
  bookshelfLayout: 'default',
  bookTag: 'book',
  showFileSize: true,
  showReadingTime: true,
  showHighlights: true,
  showThinks: true,
  showReview: true,

  // 影院（cinema；上游 ADR-0087 起接管影视；缺省回落默认目录，旧 movieFolderPath 键已退役；
  // ADR-0127 票 292：默认目录改 我的/娱乐，旧值 我的/影视 由启动迁移平移）
  cinemaFolderPath: '我的/娱乐',
  cinemaPosterFolder: '',
  cinemaMergeSeasons: true,
  cinemaPanelWidth: 0,
  cinemaPanelHeight: 0,
  cinemaSortMode: 'date',
  cinemaStatusFilter: '',
  cinemaGridColumns: '5',
  cinemaStyle: 'midnight',
  cinemaApizeroKey: '',
  cinemaDoubanCookie: '',
  cinemaSkinTheme: 'nightfall',
  entertainmentCountries: '内地、港台、美国、韩国',
  entertainmentGenres: '悬疑、爱情、年代',
  entertainmentGenresByGroup: {},


  // 做题家（设置并入复习计划 tab）
  enableMultipleChoice: true,
  questionsPerNote: '0',
  shuffleQuestions: true,
  difficulty: 'random',

  // 复习计划（quiz/review 共用数据路径）
  reviewStoragePath: 'CONFIG/STORAGE',
  enableAutoNotify: true,
  reviewAutoAddNotice: true,
  reviewDailyLimit: 0,
  // 上游线 P1：自动拟合记忆参数（默认开；样本 <100 时拟合器自动跳过，零感知）
  reviewEnableFit: true,
  reviewFitEveryN: 10,
  reviewIntervalScale: 1,
  reviewTreeBadge: true,
  reviewWatchedFolders: [],
  reviewExcludedNotes: [],
  reviewCountFolder: '卡片盒/笔记盒',
  reviewCountDefault: 5,
  reviewCountHistoryRatio: 70,
  reviewCountLastInput: 0,

  // 入口页
  launcherShowText: true,

  // 手势触发（默认关闭；单选一个手势打开命令入口页）
  launcherGesture: 'off',

  // 第二大脑（ticket 103：原闪念键更名，值语义与存储类型不变；META_PATH/VEC_PATH 废弃清除）
  secondBrainOllamaUrl: 'http://localhost:11434',
  secondBrainEmbeddingModel: 'bge-m3',
  secondBrainRerank: true,
  secondBrainRerankJev: false, // issue 431/ADR-0189：缺省本地通道（有 8B 门），Jev 为可选第二通道
  secondBrainRerankModel: '', // issue 429：空 = 默认 Qwen3-Reranker-4B（secondbrain/config RERANK_MODEL）
  secondBrainTopK: '20',
  secondBrainChatTopK: '20',
  secondBrainChunkMinLength: '50',
  secondBrainAllowPaths: '', // ticket 116：默认空 = 什么也不录（不索引任何目录），由用户自行填写
  secondBrainExplorerBadge: true, // 票 305：文件列表「已入脑」角标缺省开（派生标记，不写笔记）
  secondBrainConcurrency: '15',
  secondBrainContextLimit: '600',
  secondBrainDebounceDelay: '300',
  secondBrainCursorPollInterval: '500',
  secondBrainChatModel: 'qwen2.5:14b-instruct',
  secondBrainDeepseekModel: 'deepseek-v4-flash',
  secondBrainDefaultUseDeepseek: 'false',
  secondBrainMaxHistory: '10',
  secondBrainRemoteOllamaUrl: 'http://192.168.1.8:11434',

  // 自动双链管线（ticket 111；ticket 116 起默认空 = 什么也不录，由用户自行填写范围）
  linkAgentEnabled: true,
  linkAgentScopes: '',
  linkAgentTopK: 8,
  linkAgentMaxLinks: 0,
  linkAgentNotify: true,
  linkAgentAutoClean: true,
  linkAgentRespectRelated: true, // v1.7/ticket 167：默认尊重「已有 related 不再自动建链」

  // 常驻监听
  aiAgentEnabled: true,
  enableAIClipMatch: true,
  aiAgentWatchedFolders: '卡片盒,归档/网页剪藏',
  aiAgentModel: 'deepseek-v4-flash',
  secondBrainEnabled: true,

  // 番茄钟（9 项，ticket 31）
  pomodoroPreset: 'classic',
  pomodoroWorkMin: '25',
  pomodoroShortBreakMin: '5',
  pomodoroLongBreakMin: '15',
  pomodoroLongBreakInterval: '4',
  pomodoroForceFocus: false,
  pomodoroAutoCycle: false,
  pomodoroAutoSkipBreak: false,
  pomodoroSound: true,
  pomodoroTickSound: true,
  pomodoroVolume: 100,
  pomodoroRestoreMode: 'background',
  pomodoroAutoPauseOnHide: true,
  pomodoroSkin: 'default',
  pomodoroSkinTheme: 'tomato',
  clipbookSkin: 'default',
  clipbookSkinTheme: 'newsprint',

  // 加密保险箱（encrypt 域）
  encryptRoot: 'CONFIG/.ENCRYPT',
  encryptPreviewEnabled: true,
  encryptPreviewSize: '384',
  encryptPreviewQuality: '0.5',

  // 日常收集（collect 域，issue 246：QuickAdd「日常收集」宏换血进插件）
  collectFolderPath: '我的/日常收集',
  // 分类映射默认空 = 运行时回落内置 16 分类（DEFAULT_COLLECT_CATEGORIES）
  collectCategories: [],
  collectMobileDefaultFullscreen: true,
  encryptAutoLoadOriginal: false,
  encryptSecurityMode: false,

  // 移动端主窗口默认全屏（ticket 68：默认值=行为保持——原移动端即全屏→开，原居中卡→关；
  // 聚合讯跟随剪藏本键、阅读报告跟随书库键，不设独立键）
  diaryMobileDefaultFullscreen: true,
  // 待办（todo 域）：面板尺寸记忆 + 皮肤 + 移动端默认全屏（默认关，与旧备忘录一致）
  todoPanelWidth: 0,
  todoPanelHeight: 0,
  todoSkin: 'editorial', // 融合上游 2026-09-22 拍板：默认编辑部（显式选纸感的存量用户不受影响）
  todoMobileDefaultFullscreen: false,
  belongingsMobileDefaultFullscreen: true,
  // clipbook（上游 ADR-0082）：移动端默认全屏对齐 clipping 默认开
  clipbookMobileDefaultFullscreen: true,
  clipbookReaderFontSize: 'medium',
  clipbookPanelWidth: 0,
  clipbookPanelHeight: 0,
  clipbookMidWidth: 0,
  favoritesMobileDefaultFullscreen: true,
  favoritesSortKey: 'created',
  // 内容首页（home 域，票 288）：默认 = 标准字号 / **本周**（能往回翻整周，用户 2026-09-11 拍板）/
  // 三类中前三类开 / 默认今天 / 显示时刻 / 预告卡开
  homeLayout: 'default',
  homeSkin: 'cream',
  belSkin: 'poster',
  belSkinTheme: 'warmwhite',
  favoritesSkin: 'default',
  favoritesSkinTheme: 'linen',
  favoritesOpenFilter: '',
  favoritesLastFilter: '',
  favoritesDefaultSort: 'new',
  clipbookImageFolder: '',
  knowledgeCardboxDirectory: '卡片盒',
  knowledgeTopicDirectory: '主题盒',
  linkAgentMinScore: 0.3,
  knowledgeMountAutoSuggest: false,
  bilibiliCookie: '',
  zhipuPlanApiKey: '',
  zhipuPlanModel: '',
  ollamaApiKey: '',
  ollamaModel: '',
  aiMaxTokensOverrides: {},
  aiThinkingOverrides: {},
  jevProvider: 'typesafe',
  jevApiKeys: {},
  jevModels: {},
  knowledgeSkin: 'default',
  knowledgeSkinTheme: 'manila',
  knowledgeImageFolder: '',

  // 游戏库（gameshelf，上游 issue 368；目录缺省「我的/游戏」）
  gameshelfFolderPath: '我的/游戏',
  gameshelfPosterFolder: '',
  gameshelfSteamId: '',
  gameshelfSteamApiKey: '',
  gameshelfAutoSync: true,
  gameshelfLayout: 'default',
  gameshelfSkinTheme: 'ink',
  homeTimelineSize: 'normal',
  homeTimelineRange: 'week',
  homeTimelineProduce: true,
  homeTimelineSkipped: false,
  homeTimelineProgress: true,
  homeTimelineNotes: true,
  homeDefaultDay: 'today',
  homeTimelineTime: true,
  homeNextCards: true,
  cinemaMobileDefaultFullscreen: true,
  pomodoroMobileDefaultFullscreen: false,
  encryptMobileDefaultFullscreen: true,
  knowledgeMobileDefaultFullscreen: false,
  // 知识盒处理设置（键名随域更名 knowledge*；ticket 136 默认值=既存行为不动，零迁移）
  knowledgeProgressDetail: true,
  knowledgeKeepVideo: true,
  knowledgeQuality: 'highest',
  knowledgeStopOnFailure: false,
  knowledgeOutputDir: '',
  knowledgeCompress: true,
  knowledgeCrf: 23,
  knowledgeDirectory: '文献盒',
  knowledgeDomainList: '',
  knowledgeFfmpegPath: 'ffmpeg',
  knowledgeFfprobePath: 'ffprobe',
  knowledgePythonPath: '',
  knowledgeWhisperModel: 'small',
  knowledgeCacheDir: '',
  knowledgeCacheRetentionDays: 7,
  // 转写 LLM 校对（ADR-0222/issue 518，上游吸收批 3）：缺省关——出域是显式行为，不默认替用户同意
  asrLlmProofread: false,
  secondBrainMobileDefaultFullscreen: true,

  // 上游线（yeshimei/bz）并入新域设置键默认值（第一档加法）
  // 归物本默认状态筛选（空串=全部，上游 issue 194）
  belongingsDefaultStatus: '',
  // 归物本默认排序 / 新记默认状态 / 金额单位（上游 issue 294）
  belongingsDefaultSort: 'recent',
  belongingsNewStatus: '使用中',
  belongingsCurrency: 'cny',
  // 设置面板（ADR-0080）：移动端默认全屏（默认开）；布局默认经纬；主题默认晨昏（跟随亮暗）
  settingsPanelMobileDefaultFullscreen: true,
  settingsPanelLayout: 'jingwei',
  settingsPanelSkin: 'chenhun',
  secondbrainSkin: 'default',
  secondbrainSkinTheme: 'graphite',
  // 回忆墙（diary-wall 域，ADR-0081）：移动端默认全屏（默认开——媒体优先瀑布流真全屏）
  diaryWallMobileDefaultFullscreen: true,

  // 小橘陪伴猫（smartcat 域；移动端默认全屏键聊天/设置/数据面板共用，2026-08-23 合并一套）
  smartcatEnabled: true,
  // 小橘关闭方式（ticket 103）：stop/hide/lazy，默认彻底停机
  smartcatOffMode: 'stop',
  smartcatMobileDefaultFullscreen: false,
  smartcatEmbeddingModel: '',
  smartcatChunkLimitChars: 800,
  // 小橘对我的称呼（ticket 163）：默认包仔——把记忆流/行为流喂给 AI 时「你/用户」替换为此称呼
  smartcatUserName: '包仔',

  // 小橘记忆巩固（ticket 160 引入；ticket 162 精简——窗口化语义，见接口注释。旧键（间隔/条数阈值/
  // 证据窗口/洞察条数/周报门槛）从默认值退役，data.json 残留值被忽略）
  smartcatReflectMinNew: 20,
  smartcatRefExcerptLimit: 400,
  // ticket 163：洞察条数上限（默认 3——反思 prompt 最高 N 条 + LLM 返回按序截断）
  smartcatReflectMaxInsights: 3,

  // 小橘行为流设置（P1 数据基座，ticket 123；ADR-0069：全量补齐后扩容 30→60 天 / 2000→10000 条）
  behaviorMaxDays: 60,
  /** 行为流最大保留条数（ticket 129：1000→2000；ADR-0069：2000→10000——全域事件补齐后条目增速再升，已有 data.json 值尊重、零迁移） */
  behaviorMaxCount: 10000,
  showBehaviorLog: true,
  enableAutoLinking: true,
  linkWindowDays: 7,

  // 记忆目录（ADR-0069 记忆目录流）：默认空=不启用笔记记忆库
  memoryDirectories: [],

  // 禁止读取目录（票 307）：默认空=无禁止
  smartcatExcludedDirectories: [],
};

/** 闪念旧键 → 第二大脑新键映射（ticket 103；META_PATH/VEC_PATH 废弃清除无继任者） */
export const SECOND_BRAIN_RENAMED_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['OLLAMA_URL', 'secondBrainOllamaUrl'],
  ['EMBEDDING_MODEL', 'secondBrainEmbeddingModel'],
  ['TOP_K', 'secondBrainTopK'],
  ['CHAT_TOP_K', 'secondBrainChatTopK'],
  ['CHUNK_MIN_LENGTH', 'secondBrainChunkMinLength'],
  ['ALLOW_PATHS', 'secondBrainAllowPaths'],
  ['CONCURRENCY', 'secondBrainConcurrency'],
  ['CONTEXT_LIMIT', 'secondBrainContextLimit'],
  ['DEBOUNCE_DELAY', 'secondBrainDebounceDelay'],
  ['CURSOR_POLL_INTERVAL', 'secondBrainCursorPollInterval'],
  ['OLLAMA_CHAT_MODEL', 'secondBrainChatModel'],
  ['DEEPSEEK_MODEL', 'secondBrainDeepseekModel'],
  ['DEFAULT_USE_DEEPSEEK', 'secondBrainDefaultUseDeepseek'],
  ['MAX_HISTORY', 'secondBrainMaxHistory'],
  ['OLLAMA_REMOTE_URL', 'secondBrainRemoteOllamaUrl'],
  ['flashEnabled', 'secondBrainEnabled'],
];

/**
 * ticket 103 设置迁移：闪念 16 键更名平移（旧有值且新缺 → 复制；一律删旧键），
 * 废弃 META_PATH/VEC_PATH 直接清除（ADR-0009 起 storagePath 接管，不再兼容保留）。
 * 纯函数可测；main.onload 调用，返回是否发生迁移以决定落盘。
 */
export function migrateSecondBrainSettings(s: BzSettings): boolean {
  const anyS = s as unknown as Record<string, unknown>;
  let migrated = false;
  for (const [from, to] of SECOND_BRAIN_RENAMED_KEYS) {
    if (anyS[from] !== undefined) {
      if (anyS[to] === undefined) anyS[to] = anyS[from];
      delete anyS[from];
      migrated = true;
    }
  }
  for (const dead of ['META_PATH', 'VEC_PATH']) {
    if (anyS[dead] !== undefined) {
      delete anyS[dead];
      migrated = true;
    }
  }
  return migrated;
}

/** Jev 旧键退役迁移（issue 424/ADR-0184 + 433/ADR-0190，上游吸收批 3）：
 * 1) 424 期退役键兜底清除——`jevEnabled` / `jevEndpoint` / `jevTimeoutMs`（本地未发放过则空转，幂等）；
 * 2) 旧缺省模型名改写 `jev-1.13.0` → `jev-latest`（插件缺省被落盘的产物，用户自选值保留）；
 * 3) 全局 `jevApiKey` / `jevModel` 退役——迁移进按服务商分存 `jevApiKeys` / `jevModels` 的
 *    **typesafe 槽位**（存量用户无感：原值原样带走，换服务商后各存各的互不覆盖；非空才搬，空值是噪音）。
 * 幂等：无旧键/无脏值即不改动，返回是否动过（调用方据返回值调度落盘）。 */
const RETIRED_JEV_KEYS: string[] = ['jevEnabled', 'jevEndpoint', 'jevTimeoutMs', 'jevApiKey', 'jevModel'];
/** 旧缺省模型名（ADR-0173 §5 曾刻意钉版本；issue 424 起改为跟随服务端最新） */
const LEGACY_JEV_DEFAULT_MODEL = 'jev-1.13.0';
/** 全局密钥/模型键迁移的落位服务商（旧键只有一份，归属缺省服务商 typesafe） */
const LEGACY_JEV_PROVIDER = 'typesafe';

export function migrateRetiredJevKeys(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  let migrated = false;
  if (rec.jevModel !== undefined && String(rec.jevModel) === LEGACY_JEV_DEFAULT_MODEL) {
    rec.jevModel = 'jev-latest';
    migrated = true;
  }
  // 全局键 → 按服务商分存 map（issue 433/ADR-0190）
  for (const [oldKey, mapField] of [
    ['jevApiKey', 'jevApiKeys'],
    ['jevModel', 'jevModels'],
  ] as const) {
    const v = rec[oldKey];
    if (v === undefined || v === null || v === '') continue;
    if (!rec[mapField] || typeof rec[mapField] !== 'object') rec[mapField] = {};
    (rec[mapField] as Record<string, unknown>)[LEGACY_JEV_PROVIDER] = v;
  }
  for (const key of RETIRED_JEV_KEYS) {
    if (rec[key] !== undefined) {
      delete rec[key];
      migrated = true;
    }
  }
  return migrated;
}
