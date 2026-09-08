# 双源合并指令（原版 oh-story ⇄ 《小说设置提示词》）

> 本文件固化「取长补短」规则，防止未来任何一方覆盖另一方。任何对写作类 skill 的修改，先对照本文件的合并规则，不得引入「用 A 代替 B」或「用 B 代替 A」的改动。

## 一、三源定义

| 代号 | 内容 | 定位 |
|---|---|---|
| 源 A（原版） | 全局插件 skills 0.8.0（0.7.10 为升级前基线） | 商业/读者/感情线/题材工程/追踪脚本 |
| 源 B（提示词） | `小说设置提示词/` G1-G8 | 逐决策点确认/量化公式/受阻恢复/G3 逐步/G7G8 体检 |
| 现状 C | 项目本地 `.zcode/skills/` | 源 A 打底 + 第一期注入源 B 门结构 |

## 二、合并规则（六条硬约束）

1. **能力并集**：两源任一已有的能力都保留；缺失才补。禁止用源 B 门结构替换源 A 已有流程，或反之。
2. **门结构取源 B、门内容取源 A 强字段**：用源 B 的「逐决策点确认门」（素材请求→草案→交互→确认→锚定）做骨架，承载源 A 独有强字段（目标平台/读者契约/主角代理权/核心期待债/题材正文提示卡）。
3. **产物轨道取源 A**：markdown 可读视图 + `_开书.json`/`追踪/_tracking-state.json` 双权威；源 B 的「对话内 JSON 累积」只降级为字段映射（见 field-mapping.md），不引入第二套产物。
4. **数值公式双源同源优先**：两源均有的公式取已对齐值；仅源 B 有的公式（篇幅自适应/S 公式/密度/合理性检查）继承源 B；仅源 A 有的（场景卡容量三件套等）保持源 A。
5. **素材/商业/读者/感情线取源 A + 本地资产**：`genre-readers`/`character-relations`/`commercial-core-methods`/`female-audience-writing`/`reader-profiling`/`publishing-guide`/平台 rubric/`genre-prose-cards` 36 题材卡，源 B 无；外加本地 `行为词典/`+`工具箱/` 关系模式 5 文件。全部接线到门。
6. **人物逐步设计取源 B 为主干 + 源 A 感情线接线**：G3.0→G3.9 逐步 + 层级标准（源 B）为主干；character-relations 好感度/男女频逻辑（源 A）接线；三阵营迁移为新增。

## 三、双源特征对照（并集清单）

| 维度 | 源 A 优点 | 源 B 优点 | 融合结论 |
|---|---|---|---|
| 开书/定位 | Phase 2 核心设定表：目标平台/目标读者/读者契约/主角代理权/核心期待债 | G1.2/G1.3 逐决策点确认 | 门=源B；字段=两源并集 |
| 时间/地点/背景 | 世界观骨架「时代/背景」+力量体系/社会结构 | G1.3 第四步年代地点背景 + 时代锚点感官五维 | 两源并集 → 时空背景锚定门 |
| 人物 | character-relations、character-design-methods、female-audience-writing | G3.0→G3.9 十文件逐步 + 层级标准 | 主干=源B；感情线=源A；三阵营迁移=新增 |
| 情感关系 | character-relations + 行为词典/工具箱 | 无 | 源A + 本地资产，做成门 |
| 文风 | style-craft、genre-prose-cards、文风.md 最高优先插槽、去AI味脚本 | G7 量化（七级距离/开篇三页/句长标点） | 门=源B；内容=源A插槽+源B量化并存 |
| 平台/读者画像 | genre-readers、reader-profiling、publishing-guide、平台 rubric、commercial | 无 | 源A 独有，接线 |
| 大纲/细纲 | 题材正文提示卡/题材契约.json、plot-emotion-system、highlight-system | G4/G5 四约束表、α点、S公式、爽点库、节奏检查 | 双源并集 |
| 正文/验收 | language_gate/check-*/tracking_commit/story_doctor/voice_profile 脚本链 | 无 | 源A脚本链 + 源B检查维度对照 |
| 完稿体检 | review 多视角+平台 rubric、final-check 脚本预检 | G8 MICE/冲突密度/伏笔闭环/时间线地理/镜像 | 双源并集 |
| 交互/恢复 | 无 | 逐决策点确认、blocked_at、A/B/C 模式、判断显式化三段式 | 源B 独有，全保留 |
| 发布 | release-package/publish/cover/export-for-platform | 无 | 源A 独有，保持 |

## 四、取长登记（本清单第二期落地项）

| 项 | 取源 | 落地文件 | 说明 |
|---|---|---|---|
| 时间/地点/背景锚定门（OB-3 扩） | 融合 | story-openbook confirmation-gates.md | 时间锚定（源B G1.3 升级）+ 地点空间层级（新增）+ 背景互证，均在 OB-3 内、先于大纲 |
| 文风确认门（OB-3.5） | 融合 | 同上 | 源A 文风.md 插槽 + 源B G7 量化并存 |
| 平台与读者画像门（OB-3.6） | 取A | 同上 | genre-readers/reader-profiling/publishing-guide 接线；双轨同字段（Phase 2 表单） |
| 情感关系门（OB-3.7 开书段） | 取A+本地 | 同上 + character-lab | character-relations + 行为词典 + 工具箱 |
| 主角代理权/核心期待债 | 取A | confirmation-gates.md OB-3 产出字段 | 原版 Phase 2 表单字段并入 OB 门 |
| 五层×六型迁移×G3.0→G3.9 | 融合 | story-character-lab/SKILL.md | 源B逐步主干 + 源A感情线 + 三阵营状态机 faction_arc（新增） |
| 人物商业方法注入（三层标签反差/主角红线/代入感/配角功能化/反派四档/动机链 CICR） | 融合 | story-character-lab/references/commercial-character-methods.md（新建）+ depth-modules 〇-1~〇-3 | 源A商业方法注入源B十步门链各步，只注入不替代；反派四档为源A补源B「只有一个最重要反派」的缺口 |
| 全流程步骤地图 | 融合 | story-stepwise/references/book-roadmap.md | 门骨架源B + 能力内容源A |
| 大纲三步骤分离（粗纲/细纲/场景卡） | 融合 | story-outline/SKILL.md（新建） + story-long-write Phase 3 回改 | 第四组 G4.0→G4.10 独立化为**粗纲步骤**（story-outline）；第五组 G5.x=细纲、第六组 G6.x=场景卡（已由 story-scene-card 承接）。粗纲产物=markdown（`大纲/粗纲_第X卷.md`+`大纲/粗纲总表.md`），第四组 JSON 片段降级为生成中间态、不落盘为第二权威（轨道取源A，merge-directive 规则3）；前序扫描改读 `设定/_开书.json`+`大纲/_约束清单.md`（不再要求重粘 01/02/03.json）；爽点只做「预判+密度目标」，五字段精细设计仍归细纲 |
| 细纲独立步骤 + 第五组融合 | 融合 | story-outline-detail/SKILL.md（新建） + story-long-write Phase 3 回改 | 细纲从 long-write Phase 3 独立为 `story-outline-detail`（消费第五组 G5.0→G5.6）；**接管粗纲已让渡的字段**（α点三要素/五段式/情节点序列/爽点五字段/伏笔逐章登记/幽默立场超越等，闭环不丢）；**注入第五组六取长点**（α点逐字段约束溯源、α点-心路阶段对齐表、α点-爽点预判对齐、补充事件库按心路阶段对齐、四部分事件密度+空白章校验、关系变化节点保护）；产物=markdown（`大纲/细纲_第NNN章.md`），延续 G5.0 S公式/G5.3 节奏检查（第一期已对齐） |
| 场景卡全面重对齐 + 第六组融合 | 融合 | story-scene-card/SKILL.md + references 重写 | 场景卡已是独立 skill（不新建），按第六组 G6.1→G6.5 系统重排：补 G6.2 完整字段体系（g5_2_context 继承、五感/肢体/行为分解/对话亮点/叙述分解）+ 场景-爽点/关系变化联动规则 + 要素完整性校验表 + 细纲可支撑性回查；**补充场景职责划给细纲层**（场景卡发现素材不足只回细纲、不自造事件）；产物 markdown `场景卡_第NNN章.md`；G6.3 张力增强 + G6.5 场景卡级一致性十步校验落入 references |
| 金手指独立确认 + 专项设计门（OB-6 先导 + OB-6.5 金手指门） | 融合 | story-openbook/SKILL.md + confirmation-gates.md | 金手指从 OB-8 象征与锚点拆出：① OB-6 第 0 步单独确认「有无」（`special_items_enabled` 布尔 + 判断显式化三段 + 素材请求/启发循环）→ ② 新增 OB-6.5 金手指专项门（仅 `true` 时执行），补全 G2.4 2.4.2 此前被压扁为「三限制」一案的完整四件套（三限制/成长轨迹/伏笔计划/核心信念关联）+ 源 A「金手指↔爽点/升级台阶」挂钩；产物独立 `设定/世界观/金手指.md` + `special_items` 完整结构（含 `upgrade_ladder`）；OB-8 只留象征/时代锚点/生动细节/密度。 |
| 对抗层级与副线独立确认门（OB-3.8） | 融合 | story-openbook/SKILL.md + confirmation-gates.md | 对抗层级 N、副线数 S 从 OB-4「长度自适应参数」汇总表拆出独立成 OB-3.8：N 逐层确认（档位公式 + 每层性质/价值对应/承接角色占位/篇幅够不够 + 判断显式化三段），产出 `antagonism_structure` 供价值阶梯（OB-5）/规则数（OB-6）/反派四档（character-lab villain_tier）/转折点映射（story-outline antagonist_level）/细纲 α点对抗表现消费；S 逐条确认（条数公式 + 功能五类 + 捆绑度 + 锚定角色占位），产出 `subplot_structure`。副线下游字段已随「副线三层贯穿」一并打通（见下一行）。 |
| 副线三层贯穿（下游字段打通） | 新增（两源均无副线正向设计，纯缺失补齐） | story-outline + story-outline-detail + story-scene-card | 副线 id `SP-XX`（来自 OB-3.8 `subplot_structure`）三层贯穿：① 粗纲 story-outline 约束表新增 `subplot_schedule`（副线排期：功能/捆绑度/锚定角色/首现章/推进区间/收束章）+ 逐章字段 `subplot`；② 细纲 story-outline-detail「情节安排（多线）」的「辅线推进」结构化为「副线推进（SP-XX·功能·本章推进）」+ 让渡表加副线；③ 场景卡 story-scene-card g5_2_context 继承新增「副线」（role：推进/爆发/收束/none + SP-XX）+ 模板加副线字段。副线从「只剩条数公式」变为开书定骨架 → 粗纲排期 → 细纲逐章推进 → 场景卡镜头落地的完整闭环。 |
| 人物言行锚定（写正文言行符合人物设计） | 融合（人物设计源 B + 语言特征卡源 B + 行为词典本地资产） | story-long-write/SKILL.md + references/character-voice-anchor.md（新建） | 补上「人物设计 → 正文言行」的关键连接缺口：Phase 4 写前准备在「状态筛选」后新增「人物言行锚定」步骤，按细纲出场名单逐人读 `设定/角色/{名}.md`（语言特征卡十要素 / 认知信念 dominant_auto_thought·cognitive_bias·core_belief·knot / 行为 signature_actions·typical_patterns）+ `追踪/角色状态/{名}.md`，产出「本体名人言行锚定卡」（语言/思维认知/行为/状态四锚）进 narrative-writer prompt 作硬约束；人设样本不足时按性格类型映射 `行为词典/` 补足（只检索不改人设）。语言距离、场景卡行为分解、十步校验行为一致性为其下游/正交配套。 |
| 单章语言与节奏精修（章后核验+修改） | 融合（第七组 G7.6/7.7/7.8 + 第八组 G8.11 单章级项） | story-long-write/SKILL.md + references/chapter-language-revision.md（新建） | 补上 Phase 5 已有的「去 AI 味审查（负向删冗余）」之外的正向精修层：新增「单章语言与节奏精修」步骤，把第七/八组单章级核验修改项显式纳入每章写后流程——①关键场景句子节奏（高张力句长 8-15 字/动词密度 ≥40%，prose_metrics 实测）②标点服务情绪（G7.7）③语言综合精修（动词强度/五感覆盖下限/比喻分级，G7.8 正向）④海明威修改法（被动改主动/分号削减/叙述感叹号/限定词，G8.11 deslop 未显式覆盖项）⑤肢体语言终检（无孤立抽象情绪词/姿态簇一致/撒谎线索/动作重复，G8.11）⑥读者三问终检（那又怎样/噢是吗/呃，G8.11）。八组的完本级步骤（G8.0 冷却/G8.1 内在声音/G8.2 MICE/G8.4 收束/G8.8 镜像/G8.13 反馈）不进单章层，仍归 story-final-check。 |
| 人物增量补人/改人闭环（大纲期/正文期中途新增或修改人物） | 新增（两源均无中途补人机制，纯缺失补齐） | story-character-lab/SKILL.md（「增量补人与改人模式」节）+ story-outline-detail/SKILL.md（步骤 8 路由）+ story-scene-card/SKILL.md（守门回补+重跑）+ story-outline/SKILL.md（卷纲确认回指） | 新人物按层级走对应 G3.x 标准逐子步骤设计（不降档）+ C/M/F/B 编码分配 + `_人物框架.md` 登记（faction_arc/出场密度重算）+ G3.9 相关子集局部核查；改人前置跨产物修订门禁影响分析、只重设计受影响模块；场景卡禁止速记人设，欠账一律回细纲触发补人，补完重跑该章场景卡 |

## 五、双轨同字段声明（防第二权威）

| 字段 | 交互轨道（story-openbook OB 门） | 快速轨道（long-write Phase 2 表单） | 唯一权威 |
|---|---|---|---|
| 目标平台 | `platform_profile` | 「目标平台」行 | `_开书.json.platform_profile` |
| 目标读者 | `audience_profile` | 「目标读者：{画像}」行 | `_开书.json.audience_profile` |
| 读者契约 | `reader_contract` | 「读者契约」行 | `_开书.json.reader_contract` |
| 主角代理权 | `protagonist_agency` | 「主角高光/代理权」行 | `_开书.json.protagonist_agency` |
| 核心期待债 | `core_debt` | 「核心期待债」行 | `_开书.json.core_debt` |
| 时间/地点/背景 | `setting.time_anchor`/`place_anchor` | 「世界观骨架·时间/地点/背景」行 | `_开书.json` 对应字段 |
| 文风锚点 | `style_anchor` | （开书后由 style-spec 精化） | `_开书.json.style_anchor` |

两个轨道写的是同一字段的两个视图，落盘都以 `_开书.json` 为唯一结构化权威。

## 六、逐 skill 双源声明

- `story-openbook`：门结构源B（G1-G2 决策点）；OB-3 补回源A字段（平台/读者/代理权/期待债）；四锚定门融合双源。
- `story-character-lab`：十步门链骨架/层层确认/层级标准/判断显式化源B；三层标签反差/反派四档/动机链 CICR/代入感/主角红线/配角功能化/商业健康度清单源A（注入各步）；诉求三阵营迁移 faction_arc 新增。
- `story-style-spec`：文风.md 插槽源A；量化规则源B；二者并存。
- `story-long-write`：主体源A（题材契约/追踪/脚本链）；Phase 3 四约束表/α点/S公式源B；Phase 2 表单与 OB 门双轨同字段；Phase 3 大纲改为「卷纲→粗纲→细纲」三段，粗纲交 `story-outline`、细纲接力第五组。
- `story-outline`（粗纲，新建）：主体源B（第四组 G4.0→G4.10）；产物轨道源A（markdown `大纲/粗纲_*.md`）；爽点类型双源对齐（第四组九型=标尺，源A九型=题材落地）；篇幅公式 `S`/`G_outline` 与源B K/F/G 由 `length_params` 统一驱动。
- `story-outline-detail`（细纲，新建）：主体源A（细分模板/七检/脚本链）；第五组 G5.x 注入（逐字段溯源/三张对齐表/密度校验/关系节点保护）；接管粗纲让渡的 α点/五段式/情节点序列/爽点五字段/伏笔逐章登记；产物 markdown `大纲/细纲_第NNN章.md`。
- `story-scene-card`：主体源A（雪花分层/五元素节拍链/容量三件套）；第六组 G6.1→G6.5 字段体系与校验重对齐（g5_2_context 继承、五感/肢体/行为分解/对话/叙述分解、要素完整性校验、G6.5 场景卡级一致性十步）；补充场景职责划给细纲层。
- `story-final-check`：脚本预检/MICE链路源A；G8 维度源B对照。
- `story-review`/`story-deslop`：源A 为主；平台 rubric 消费 `platform_profile`。
- 人物增量补人/改人模式：本工作区新增机制（两源均无中途补人流程）；层级标准与逐子步骤确认仍取源 B 骨架，产物与框架/追踪登记取源 A 轨道；只补缺口，不替代两源既有流程。

## 七、素材接线（回应第一期开放问题 ③）

| 素材 | 消费点 |
|---|---|
| `行为词典/`（爱的五种语言等） | 情感关系门（character-lab G3.0 第七步） |
| `工具箱/`（人物间关系模式汇总、相爱不能爱矛盾模式、健康/不健康爱情模式、人类关系拉扯） | 情感关系门（同上） |
| `素材积累/`（阶段一~三） | 候选 wiring：开书/大纲素材检索（待立项，见修正用） |
| `story-long-scan/references/reader-profiling.md`、`publishing-guide.md` | 平台与读者画像门（OB-3.6） |
| `story-review/references/rubrics/{fanqie,qidian,zhihu}.md` | 审查阶段按 `platform_profile` 取 rubric |
