# 字段映射声明：提示词 JSON 路径 ↔ oh-story 产物

> **产物轨道决策（规范声明）**：本项目维持「markdown 产物 + `设定/_开书.json`（设定期）+ `追踪/_tracking-state.json`（正文期）」双权威轨道，**不引入**提示词的「对话内 JSON 片段累积」模式（01~06/`project_state` 系列）。提示词的 JSON 字段名作为**语义等价目标**，通过本表映射到 oh-story 实际文件字段，保证：① 约束清单门可逐条报告来源路径；② G3.9/G4.9/G8 类机械校验可基于本表执行；③ 未来如需与提示词 JSON 互通，可据此自动转换。
>
> 用法：下游 skill（大纲/细纲/场景卡/体检）引用约束时，一律写「提示词字段路径 → oh-story 文件字段路径」；校验时以 oh-story 文件的实际字段为准。
>
> 本表为**声明字典**，非产物模板。各产物文件的详细模板仍以对应 skill 的 references 为准。

## 一、设定期（G1/G2 ↔ story-openbook）

| 提示词 JSON 路径（01_story_core / 02_theme_world 等） | oh-story 实际字段（设定/_开书.json） | 可读视图文件（设定/*.md） | 备注 |
|---|---|---|---|
| `01_story_core.length_params.total_chapters` | `length_params.total_chapters` | 故事蓝图.md（篇幅节） | 总章节数 |
| `01_story_core.length_params.words_per_chapter` | `length_params.words_per_chapter` | 故事蓝图.md（篇幅节） | 每章预估字数 |
| `01_story_core.length_params.total_words` | `length_params.total_words` | 故事蓝图.md（篇幅节） | 总字数（万字，篇幅三连自动计算） |
| `01_story_core.length_params.volume_tier` | `length_params.volume_tier` | 故事蓝图.md（篇幅节） | 篇幅档位（短/中/长/超长） |
| `01_story_core.core_conflict` | `story_core.core_conflict` | 故事蓝图.md（核心冲突节） | 主线矛盾 |
| `01_story_core.protagonist.wound`（心结） | `story_core.wound` | 故事蓝图.md（心结节） | 主角心结，A 类硬约束 |
| `01_story_core.three_act_seeds` | `three_act_seeds` | 故事蓝图.md（三幕种子） | 三幕种子与关口、volume_mini_acts |
| `01_story_core.genre_tone` | `genre_tone` | 题材定位.md（基本信息） | 题材主类型/基调 |
| `01_story_core.target_audience` | `target_audience` | 题材定位.md（读者画像） | 目标读者 |
| `01_story_core.reader_contract` | `reader_contract` | 题材定位.md（读者契约节） | A 类硬约束 |
| `01_story_core.countdown.global` | `countdown.global` | 题材定位.md（悬念引擎节） | 全局倒计时（类型/始末章/失败后果） |
| `01_story_core.humor_config_early` | `humor_config_early` | 题材定位.md（幽默节） | 苦笑转化目标/密度/锚点（扩为五件套） |
| `01_story_core.theme_values` | `theme_values` | 主题.md（价值光谱节） | OB-2 初值 → OB-5 深化 |
| `01_story_core.core_contradictions` | `core_contradictions` | 故事蓝图.md（矛盾节） | ≥3 组核心矛盾 |
| `01_story_core.theme_statement` | `theme_statement` | 主题.md（金句节） | 主旨一句话（OB-2 初探） |
| `01_story_core.volume_structure` | `volume_structure` | 大纲/大纲.md（阶段总览） | 分卷结构（顶层字段，与 length_params 平级），Phase 3 消费 |
| `02_theme_world.theme_expression` | `theme_expression` | 主题.md（呈现节） | 主题呈现方式/立论争论/普遍性检查 |
| `02_theme_world.world_rules` | `world_rules` | 世界观/*.md（规则节） | 每条规则标注冲突功能 |
| `02_theme_world.foreshadowing_seeds` | `foreshadowing_seeds` | 追踪/伏笔.md（设定期种子视图） | 含 `_inherited_by:"G4.7"` 继承声明 |
| `02_theme_world.setting.time_period` | `setting.time_period` | 世界观/背景设定.md（时代节） | 年代设定 |
| `02_theme_world.setting.social_background` | `setting.social_background` | 世界观/背景设定.md（社会节） | 社会背景（含冲突功能说明） |
| `02_theme_world.setting.locations` | `setting.locations` | 世界观/地理.md | 地点草案（2-4 个） |
| `01_story_core.setting.time_anchor`（时间锚定：起点/跨度/推进规则/多时间线/追踪初始化） | `setting.time_anchor` | 世界观/背景设定.md（时间锚节） | OB-3 时间锚定产物，A 类；四锚定门之一 |
| `01_story_core.setting.place_anchor`（地点锚定：核心空间/叙事功能/空间层级/地点×时间×背景联动） | `setting.place_anchor` | 世界观/地理.md（地点锚节） | OB-3 地点锚定产物，A 类；四锚定门之一（地点不丢） |
| `01_story_core.style_anchor`（文风锚点：关键词/锚点语/句长标点基调） | `style_anchor` | 文风.md（锚点语节） | OB-3.5 文风确认产物，A 类 |
| `01_story_core.platform_profile`（平台/规则/标签/更新节奏） | `platform_profile` | 题材定位.md（平台与读者画像节） | OB-3.6 平台确认产物，A 类；双轨同字段（原版 Phase 2 表单「目标平台」） |
| `01_story_core.audience_profile`（性别/年龄/阅读场景/付费追读/期待） | `audience_profile` | 题材定位.md（平台与读者画像节） | OB-3.6 读者画像产物，A 类；双轨同字段（原版「目标读者」） |
| `01_story_core.protagonist_agency`（主角因果权+结算权） | `protagonist_agency` | 题材定位.md（读者契约节） | 原版强字段补回，A 类 |
| `01_story_core.core_debt`（核心期待债） | `core_debt` | 题材定位.md（读者契约节） | 原版强字段补回，A 类 |
| `01_story_core.emotional_relations`（meta 基调/占比/捆绑度 + details 逐关系模式来源/张力/推进节点） | `emotional_relations` | 关系.md（情感关系小节） | OB-3.7 + 人物段产物，A 类；消费 character-relations/行为词典/工具箱 |
| `02_theme_world.symbols_and_anchors` | `symbols_and_anchors` | 世界观/金手指与象征.md、时代锚点.md | 象征物/时代锚点（感官五维子类+重复策略） |
| `02_theme_world.type_adaptation` | `type_adaptation` | 题材定位.md（类型适配节） | 含 reader_contract_refined |
| `02_theme_world.stance_check` | `stance_check` | 题材定位.md（立场节） | 立场合理性五维 |
| `02_theme_world.sublimation_check` | `sublimation_check` | 题材定位.md（超越误区节） | 超越误区检查 |
| `symbol_theme_links`/`vivid_details`/`density_plan` | `symbol_theme_links`/`vivid_details`/`density_plan` | 世界观/金手指与象征.md | 象征-主题关联/CBT 细节/密度方案 |
| `_meta`（模式/版本/受阻状态） | `_meta`（mode/version/execution_status/blocked_at_<门>/cross_validation/modifications/inspiration_fragments/user_overrides） | — | 管理信息 + OB-9 九项联动校验结果 |

## 二、人物期（G3 ↔ story-character-lab）

| 提示词 JSON 路径 | oh-story 实际字段 | 可读视图文件 | 备注 |
|---|---|---|---|
| `g3_0_preparation.character_quantity_plan` | `_人物框架.md`（层级表/数量规划） | 设定/角色/_人物框架.md | C/M/F/B 四层级代号档位数量；主角+最重要反派从核心层提出单独成 L1 层、其余核心为 L2（见 character-lab depth-modules 〇节） |
| `g3_0_preparation.personality_conflict_matrix` | `_人物框架.md`（咬合矩阵） | 设定/角色/_人物框架.md | 八型咬合/冲突类占比 |
| `g3_0_preparation.character_type_annotation` | `_人物框架.md`（类型标注） | 设定/角色/_人物框架.md | 三阶段标注体系（配合深度设计五阶段弧线） |
| `g3_0_preparation.change_event_master_schedule` | `_人物框架.md`（变化事件总表） | 设定/角色/_人物框架.md | 全局锁定工件（T/R 触发章+连锁影响+分布概览） |
| `g3_0_preparation.personality_type_anchor.status` | 角色档案「性格锚点」status（confirmed/pending/deferred） | 设定/角色/{名}.md | 锚点状态机 + 性格词典交互 |
| `g3_0_preparation.出场密度/独特性红线` | `_人物框架.md`（密度等级公式 + U-01~ 红线） | 设定/角色/_人物框架.md | C01 0.7-0.9/C02 0.35-0.55/重要 10-20%≥3 章/单章峰值≤12；红线 3-5 条 |
| `g3_x_*.depth_design.five_stage_arc` | `设定/角色/{名}.md`（## 深度设计） | 设定/角色/{名}.md | 五阶段弧线；关键节点心理详表 14 字段模板见 depth-modules 十二 |
| `g3_x_*.faction_arc`（三阵营状态机：start/end∈{支持,对抗,中立} + 三事件链 triggers[3] + chapter） | `_人物框架.md`（阵营迁移登记） | 设定/角色/_人物框架.md | 六型阵营迁移；G3.0 第七步登记占位 → G3.3（核心·支持）＋G3.4（核心·对抗）、G3.5（重要·支持）＋G3.6（重要·对抗）、G3.7（功能）兑现 → G3.9 全局核对 |
| `g3_x_*.humor_module` | 角色档案「幽默增强」（适配判断/词典/HT-01~15） | 设定/角色/{名}.md | 可选；重要层走简化二步 |
| `g3_x_*.language_profile` | `设定/角色/{名}.md`（语言特征卡） | 设定/角色/{名}.md | 与 style-spec 十要素卡同源（十要素扩展后） |
| `g3_x_*.commercial_dim`（源 A 注入商业维） | 角色档案「商业维」字段块 | 设定/角色/{名}.md | 三层标签(身份/表现/内核)/人设关联分层(强≥3)/动机链 CICR/记忆点/红线自检；定义见 character-lab depth-modules 〇-3 |
| `g3_x_*.villain_tier`（反派四档） | `_人物框架.md`（对抗侧角色标注） | 设定/角色/_人物框架.md | 小反派/中等反派/大弧Boss/最终Boss；仅对抗侧、正交于五层；对应 G3.2（最终Boss）、G3.4（核心·对抗）、G3.6（重要·对抗）、G3.7（功能·对抗侧） |
| `g3_9_cross_validation.revision_suggestions` | 修订清单（精确到文件与小节） | 各角色档案 | 提示词用 JSON 修订包，oh-story 用 markdown 回写 |

## 三、大纲期（G4/G5 ↔ story-long-write Phase 3）

| 提示词 JSON 路径（04_plot_outline / 05_chapter_plans） | oh-story 实际字段 | 可读视图文件 | 备注 |
|---|---|---|---|
| `04_plot_outline.character_chapter_map` | 约束表 1（人物-章节映射） | 大纲/_约束表.md | 已实现；与 G4.0 1.1 同构；生成于 long-write Phase 3「四张约束表」节（workflow-setup.md） |
| `04_plot_outline.character_arc_beat_map` | 约束表 2（弧线节拍，引用 G3 原文关键转变） | 大纲/_约束表.md | 已实现；与 G4.0 1.1 同构；生成于 long-write Phase 3「四张约束表」节（workflow-setup.md） |
| `04_plot_outline.worldview_conflict_schedule` | 约束表 3（暗示/展示/升级/代价四时刻） | 大纲/_约束表.md | 已实现；与 G4.0 1.1 同构；生成于 long-write Phase 3「四张约束表」节（workflow-setup.md） |
| `04_plot_outline.theme_beat_schedule` | 约束表 4（四部分正反论点排期） | 大纲/_约束表.md | 已实现；与 G4.0 1.1 同构；生成于 long-write Phase 3「四张约束表」节（workflow-setup.md） |
| `04_plot_outline.foreshadowing_tracker` | `追踪/伏笔.md`（每 ID 一行） | 追踪/伏笔.md | 当前行状态：埋设/回收/状态 |
| `04_plot_outline.爽点蓄力链（TP-XX）` | 卷纲「爽点蓄力链」行（为TP-XX蓄力+进度） | 大纲/卷纲_第X卷.md | 爽点蓄力链（TP-XX）；参考 highlight-system.md |
| `05_chapter_plans.chapters[].scene_count_planned` | `大纲/细纲_第NNN章.md`（情节细化/字数预算） | 大纲/细纲_第NNN章.md | 场景卡守门消费 |
| `05_chapter_plans.chapters[].alpha_point` | `大纲/细纲_第NNN章.md`（α点必填行：目标→障碍→代价+情绪弧线） | 大纲/细纲_第NNN章.md | α点已实现；与 G5.2 1.1 同构 |
| `05_chapter_plans.chapters[].highlight_design` | `大纲/细纲_第NNN章.md`（爽点五字段：角色/类型/级别/蓄力目标/蓄力进度） | 大纲/细纲_第NNN章.md | 爽点五字段已升级 |
| `05_chapter_plans.chapters[].chapter_question / hook_chain_status` | 细纲「结尾设定和钩子」双向追溯 | 大纲/细纲_第NNN章.md | 疑问/钩子双向追溯（已实现） |
| `05_chapter_plans.chapters[].tension_level` | 细纲「紧张值」+ G5.3 节奏检查（7 检查/4 豁免/引爆阈值） | 大纲/细纲_第NNN章.md | 紧张值与节奏检查（G5.3） |

## 四、场景期（G6 ↔ story-scene-card）

| 提示词 JSON 路径（06_scene_cards） | oh-story 实际字段 | 可读视图文件 | 备注 |
|---|---|---|---|
| `06_scene_cards.scene_cards_collection[]` | `大纲/场景卡_第NNN章.md`（场景卡模板） | 大纲/场景卡_第NNN章.md | scene_id `S{卷}-{章}-{序}` 对应文件内 S{序号} |
| `*.sensory_details` | 模板「五感锚点」（≥3 种） | 同上 | 提示词为五通道各 ≥1 |
| `*.scene_narrative_decomposition` | 模板「节拍链五元素」 | 同上 | 字段名不同，语义同源（见 G6 审计备注） |
| `*.character_behaviors[]` | 模板「人物行为/肢体语言」 | 同上 | 行为需含心理分解（心理详表 14 字段可作扩展） |
| `g6_6.volume_summary` | `大纲/场景卡_第{V}卷汇总.md` | 大纲/场景卡_第{V}卷汇总.md | 已实现（每卷末 md 汇总，不做全书 JSON） |
| `g6_0 容量参数（详细比例 r / 高张力密度 d / 幽默幕次表）` | 场景卡头部「全局配置」注记（`r` / `d` / 幽默段） | 大纲/场景卡_第NNN章.md | 容量参数三件套已实现：`r=min(1.0,max(0.2,20/C+0.1))`（C=全书章节数）、`d=max(1,floor(C/30))`、幕次表四段 |

## 五、风格期（G7 ↔ story-style-spec）

| 提示词 JSON 路径 | oh-story 实际字段 | 可读视图文件 | 备注 |
|---|---|---|---|
| `style_guide.anchor_constraints` | `设定/文风.md`（锚点语节） | 设定/文风.md | 最高优先级风格基 |
| `style_guide.narrative_voice` | `设定/文风.md`（视角与距离节） | 设定/文风.md | 视角+进入程度；七级距离谱系见 `story-style-spec/references/language-distance.md`（对应提示词 G7.9） |
| `style_guide.punctuation_emotion_strategy` | `设定/文风.md`（量化规则节） | 设定/文风.md | 破折号/感叹号/动词密度 |
| `characters_language_profiles[].language_profile` | `设定/角色/{名}.md`（语言特征卡） | 设定/角色/{名}.md | 十要素基础卡（补语速/沉默/爱的语言）+ 可选沟通行为扩展 4 字段 |
| `opening.requirements` | `设定/文风.md`（开篇规范节） | 设定/文风.md | 三页/雷区/读者三问 + 钩子三型/炸弹埋设/前 1000 字感官激活 |
| `humor_configuration` | `设定/文风.md`（幽默配置节） | 设定/文风.md | 三参数 + 苦笑转化映射（由 story-openbook OB-5 配合） |

## 六、体检期（G8 ↔ story-final-check / story-review）

| 提示词 JSON 路径（project_state_final / g8_*_report） | oh-story 实际字段 | 产物文件 | 备注 |
|---|---|---|---|
| `g8_0_initial_state.initial_read_notes` | 体检报告「直觉初读四维」 | 追踪/体检_第X卷.md | 节奏/情绪/人物/逻辑四表 |
| `g8_0 冷却期状态与权重标注` | 体检报告头部「冷却状态 + 初读权重」注记 | 同上 | 冷却期硬门三选一 + 未冷却权重下调标注 |
| `g8_1 作者侧内在声音两问` | 简化内在声音工作表（批评家/拖延者） | 同上 | 冷却期硬门；两问均答「无」跳过 |
| `g8_2 基因纯度（MICE）` | 体检报告「MICE」小节（四占比+健康度+重复清单） | 同上 | 基因纯度 MICE；健康度阈值由 skill 自定（G8.2 L866 占位） |
| `g8_3_tension_report.conflict_density` | 量化体检「冲突密度」0.6-0.8 | 同上 | 公式同源 |
| `g8_4 副情节收束状态` | 体检报告「副情节收束」小节（四态+跨卷间隔+入侵性标记） | 同上 | 副情节收束四态：已闭环/未闭环/开放式/延续 |
| `g8_5_foreshadowing_report.closure_rate` | 量化体检「伏笔闭环率」≥80% | 同上 | 对照 追踪/伏笔.md |
| `g8_6_character_consistency_report` | 人物「四判定」 | 同上 | 一致/合理演变/断裂/数据不足 |
| `g8_11/g8_12 脚本预检结果` | 体检报告「脚本预检」小节（5+1 脚本命中汇总） | 同上 | 脚本预检；只报告不改写，失败降级标注 |
| `g8_13_reader_feedback` | 体检报告「读者反馈」小节（共性问题/优先级/两案） | 同上 | 读者反馈；只收用户粘贴的外部反馈，不扮演读者 |
| `g8_14_integration_report` | 综合修改清单（高/中/低） | 同上 | 合并/去重/优先级 |
| `project_state_final`（16 片段累积） | `追踪/体检_*.md` + `追踪/_tracking-state.json` | 两者 | ⚠️ 审计缺口：无 JSON 档案，当前为 markdown 体检 |

## 七、跨阶段权威说明

| 提示词概念 | oh-story 对应 | 说明 |
|---|---|---|
| `modification_log` / `pending_fields` | `_开书.json` 的 `_meta.modifications` / `pending_fields` | 设定期累积/受阻恢复 |
| `_tracking-state.json`（正文期唯一结构化权威） | `追踪/_tracking-state.json` | 角色快照/伏笔/时间线/上下文 7 栏 |
| 灵感碎片 / 搁置项目 | `_开书.json` 的 `_meta.inspiration_fragments` | 灵感碎片归档（OB-9 整合归档门）已补齐：G2.5 询问收集 → 落 `_meta.inspiration_fragments` |
| 对话内 JSON 片段协议 | 不采用 | P0-1 决策：markdown 落盘替代分段拼接 |

> 本表随修补进度更新：P0-P2（37/37）完成后，所有分配过 P 条目的缺口已移除「⚠️ 审计缺口」标注并在备注注明补齐位置。剩余 ⚠️ 均为未分配条目的开放问题：`project_state_final` 无 JSON 档案（G8 产物为 markdown 体检）、`_meta.inspiration_fragments` 已落盘但无独立视图、核心变量追踪表（提示词使用方法 L25）无 skill 对应产物。

---

## 修订记录

> P0-P2 修补期间分配的条目编号。备注列已改为纯语义描述，编号统一登记于此，供追溯。

| 编号 | 对应实现 |
|---|---|
| P1-G1-1 | 篇幅三连闭环（总字数与档位自动计算） |
| P1-G1-4 | OB-9 整合归档门：灵感碎片与搁置项目收集 |
| P1-G1-7 | 苦笑转化五件套 |
| P1-G3 | 行为心理分解扩展（心理详表 14 字段） |
| P1-G3-1 | 性格锚点状态机 + 性格词典交互 |
| P1-G3-3 | G3.0 变化事件总表 / 出场密度公式 / 独特性红线 |
| P1-G3-4 | 关键节点心理详表 14 字段模板 |
| P1-G3-5 | 幽默增强模块（重要层简化二步） |
| P1-G4/G5-1 | 四张约束表（人物映射/弧线节拍/世界观排期/主题节拍） |
| P1-G4/G5-2 | 爽点蓄力链 + 爽点五字段 |
| P1-G4/G5-4 | α点（目标→障碍→代价 + 情绪弧线） |
| P1-G4/G5-6 | 章尾疑问/钩子链双向追溯 + 紧张值节奏检查 |
| P1-G6-1 | 容量参数三件套（详细比例 r / 高张力密度 d / 幽默幕次表） |
| P1-G6-4 | 卷末场景卡汇总 |
| P1-G7-2 | 语言特征卡十要素（补语速/节奏、沉默模式、爱的语言体现）+ 沟通行为扩展 4 字段 |
| P1-G7-3 | 七级距离谱系 |
| P1-G7-4 | 开篇规范（三页/雷区/读者三问 + 钩子三型/炸弹埋设/感官激活） |
| P1-G8-1 | 脚本预检（只报告不改写，失败降级标注） |
| P1-G8-2 | 基因纯度 MICE |
| P1-G8-3 | 读者反馈收束（仅收用户粘贴的外部反馈） |
| P1-G8-4 | 副情节收束四态 |
| P1-G8-5 | 冷却期硬门 + 作者侧内在声音两问 |