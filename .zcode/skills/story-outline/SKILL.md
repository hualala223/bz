---
name: story-outline
version: 1.0.0
description: "粗纲设计（故事结构骨架层）。在卷纲之后、细纲之前，把全书拆成四部分结构+关键转折点，并为每一章产出「一句话核心事件 + 结构性标注（因果网/认知范围/价值层级/对抗层级/主题论点/世界观关键时刻/伏笔埋设/爽点预判）」，作为细纲与场景卡的结构约束来源。触发方式：「粗纲」「写粗纲」「出粗纲」「情节粗纲」「结构骨架」「四部分结构」；产出 大纲/粗纲_第X卷.md 与 大纲/粗纲总表.md。"
metadata: {"openclaw":{"source":"https://github.com/qin1473692580-ux/oh-story-claudecode"}}
---

# story-outline：情节粗纲（故事结构骨架层）

> **全书位置**：阶段 5 大纲的「粗纲门」，介于卷纲与细纲之间，见 `story-stepwise/references/book-roadmap.md`。
> **职责边界**：本 skill 只产粗纲，不产细纲、也不产场景卡。粗纲只定「每章要发生什么、为什么、受谁约束」的结构骨架；「怎么写/怎么演」交给下游的细纲步骤与场景卡步骤（各自独立，见 book-roadmap「阶段 5 大纲」）。本文件对下游只描述「粗纲交付了什么」，不锁死下游由哪个 skill 承接。

## 方法论来源与双源声明

本 skill 以《小说设置提示词》**第四组 G4.0→G4.10** 为主体（源 B），按 `story-constraint-gate/references/merge-directive.md` 的三处定轨改造落地（见下「轨道转换」）。源 A 的商业技法（八节点结构 / 换地图 / 装逼暗线 / 五级展开）只在「结构骨架」这一层被粗纲消费，不越界到细纲。

**双源声明（本节为唯一权威，改本 skill 前先对照 merge-directive）**：
- 结构骨架（四部分/转折点/对抗层级映射/心路五阶段/逐章约束问卷）＝源 B；
- 产物轨道＝源 A（markdown 落盘，JSON 片段降级为生成中间态，不落盘为第二权威）；
- 爽点类型＝两源对齐（第四组九型做「结构位置标尺」，源 A 九型做「题材落地」，见 `references/outline-artifact-protocols.md`）。

---

## 轨道转换（相对第四组原版的三处改法）

第四组是「对话内 JSON 片段累积 → `04_plot_outline.json`」。本 skill 落地为源 A 的 markdown 轨道，只转换、不引入第二权威：

1. **产物改 markdown**：第四组产出的四份约束表、转折点位置、逐章约束问卷、爽点预判、伏笔计划等**全部最终落进 markdown**（`大纲/粗纲_第X卷.md` + `大纲/粗纲总表.md`）。生成过程中允许在对话里出 JSON 片段当草稿，但**结束时必须转写为 markdown 落盘**，不落 `04_plot_outline.json`。
2. **前序扫描改读本地产物**：第四组要求重粘 `01_story_core.json`/`02_theme_world.json`/`03_characters.json`。本 skill 改为扫描 `设定/_开书.json`（唯一结构化权威）+ `设定/` 可读视图 + `大纲/_约束清单.md`（`story-constraint-gate` 产物）+ `设定/角色/*.md`。找不到时按字段提示用户补齐，不要求重粘三份 JSON。
3. **爽点只预判、不下钻**：粗纲只产出爽点「预判类型 + 密度目标 + 蓄力链方向」，**不做五字段精细设计**（角色/类型/级别/蓄力目标/蓄力进度的逐章闭环属细化步骤，与本书爽点体系 `story-long-write/references/highlight-system.md` 的「爽点五字段」对齐）。第四组 G4.2~G4.5 原文「爽点节奏下放细纲」的边界，本 skill 严格执行。

---

## 守门

- **卡壳/交互协议**：卡壳信号识别、八维启发轮换、3 轮终止占位、素材请求、判断显式化三段式、A/B/C 自动扩展模式 → 共享 `story-stepwise/references/interactive-protocol.md`，本 skill 不重复定义。
- **前置硬门**：没有卷纲（`大纲/卷纲_第X卷.md`）或没有 `设定/_开书.json` 的 `length_params`，不做粗纲——提示先回 `story-long-write` Phase 3 补齐体量门与卷纲。缺 `大纲/_约束清单.md` 时，按 `story-constraint-gate` 规则先补，或用户明示「跳过约束清单」继续（但 A 类硬约束仍从 `_开书.json` 读底线）。
- **不越界**：粗纲不产出细纲字段（α点/五段式/情节点序列/爽点五字段细设计）、不产出场景镜头字段（地点镜头/节拍链/字数预算）。发现某章粗纲事件撑不起后续时，只标注「欠账点」回卷纲，不擅自造新主线/新人物/新反转；经卷纲确认进入的新具名人物，由 `story-character-lab` 增量补人模式补设计后再入粗纲。

---

## 流程

按卷滚动执行（`stepwise` 默认叠加：每一步出草案 → 展示 → 用户确认/「这步你定」）。单卷（`total_volumes = 1`）则全书一轮走完；多卷则每卷一轮、卷末汇总。

### 0. 读前序（全量扫描 → 编译约束表）

读 `设定/_开书.json`（`length_params` 四字段 + 四锚定字段）、`设定/主题.md`、`设定/世界观/`、` 设定/角色/`、`大纲/_约束清单.md`、目标卷的 `大纲/卷纲_第X卷.md`。产出两类中间态（转 markdown）：

- **约束三表**：把字段分成 A 硬约束 / B 软约束 / C 元数据（分类口径见第四组 G4.0 零.2）。硬约束必须逐条列（人物登场退场、世界观规则触发、主题论点、关系变化章、象征物阶段、伏笔种子、金手指成长弧），不得概括。
- **五份约束数据表**（转 `大纲/粗纲总表.md` 的「约束表」节）：
  1. `character_chapter_map`（人物-章节出场映射）
  2. `character_arc_beat_map`（弧线节拍映射）
  3. `worldview_conflict_schedule`（世界观冲突排期：首次暗示/首次展示/升级/最终代价四时刻）
  4. `theme_beat_schedule`（四部分主题论点·论证方/反驳方）
  5. `subplot_schedule`（副线排期：消费 `_开书.json` 的 `subplot_structure`，见下）

> 已存在 `大纲/_约束表.md`（`story-long-write` 体量门产出）时，本步直接沿用已有约束表、只做增量核对，不重复生成第二份。

- **副线排期表 `subplot_schedule`（新增，纯缺失补齐）**：消费 OB-3.8 的 `subplot_structure`（副线 id `SP-XX`、功能 function、捆绑度 entanglement、锚定角色占位），把每条副线落到章号：首现章 / 推进区间 / 收束章 / 状态。副线 id 与开书阶段一致，全程可追溯；开书只落了「骨架」，粗纲层填「排期」。若 `subplot_structure` 为空（无双副线/用户未设），本表置「无」，逐章 `subplot` 字段标「无」。

### 1. 结构骨架（转 `大纲/粗纲总表.md`「结构」节）

- **篇幅自适应参数**：由 `length_params` 驱动（merge-directive 规则 4）；关键转折点数 `K=max(5,min(15,floor(3+sqrt(C/8))))`、伏笔总数 `F`、节奏粒度 `G` 取源 B 公式；细纲事件数 `S` 不在此层算。
- **时间/空间结构**：线形/倒叙插叙/多时间线/循环；单一核心/对立升级/旅途/多空间并置。出推荐 + 理由（基于 `core_conflict` + `genre_tone`）。
- **四部分结构 + 8 转折点**：四部分比例、各转折点章号（开篇钩子/引发性事件/关口一/第一关键点/中间点/间歇期低谷/关口二/高潮对决），K>8 时等距插补。
- **分卷四部分**（V>1）：每卷卷内四部分 + 卷内转折点。
- **对抗层级 → 转折点映射**：每个对抗层级对应转折点，含冲突场景一句话 + 主角应对 + 鸿沟（预期/现实）。
- **心路五阶段 → 结构映射**：困兽/萌芽/拉锯/决心/新生，各配章节范围 + 转折事件。

### 2. 逐章约束问卷（转 `大纲/粗纲_第X卷.md`，结构骨架的逐章落地）

为卷内**每一章**生成一次约束问卷（源 B 的 `per_chapter_constraint_questionnaire`，转 markdown 表格）。每章七块：
- `mandatory_character_checks`（新登场/持续在场/退场/间接铺垫，引设计原文）
- `mandatory_arc_progress`（本章推进谁的哪个弧线节拍）
- `mandatory_worldview`（本章触发/展示哪条规则、方式是暗示/展示/升级）
- `mandatory_theme`（本章论证主题哪一方、谁承担）
- `causal_chain_input` / `causal_chain_output_requirement`（因果链：承接 N-1、产出给 N+1）
- `turning_point_check`（是否转折点、预分配人物）

### 3. 逐章粗纲事件（转 `大纲/粗纲_第X卷.md`「逐章粗纲」节）

每章产出「一句话核心事件（行动→阻碍→结果，≥30 字）+ 结构性标注」。**只保留结构骨架字段、不下钻到细纲**：

| 字段 | 内容 | 来源 |
|---|---|---|
| `chapter` | 章号 | — |
| `core_event` | ≥30 字事件 | 问卷 |
| `characters` | 登场/退场/间接（★/†/⟲） | character_chapter_map |
| `subplot` | 本章推进哪条副线（SP-XX·推进动作 / 无） | subplot_schedule |
| `causal_network` | triggers_from / consequences_for / network_note | 因果链 |
| `protagonist_state` | 心路阶段·子状态 | arc_stage_structure_map |
| `antagonist_level` / `manifestation` | 对抗层级 / 表现 | antagonist_turning_point_map |
| `theme_argument_check` | 论点·人物·行动 | theme_beat_schedule |
| `value_level_check` | 距主题价值光谱哪一级 | theme_values |
| `knowledge_check` | 谁不知道什么（认知越界自查） | core_characters_detail |
| `symbol_stage_check` | 象征物·阶段（无则“无”） | symbols[] |
| `worldview_rule_check` | 规则·展示方式（无则“无”） | worldview_conflict_schedule |
| `foreshadowing_check` | 埋设/强化（无则“无”） | foreshadowing_seeds[] |
| `highlight_preset` | 爽点预判：级别+类型+蓄力来源（**非**五字段细设计） | highlight_type_library |

> 逐章约束问卷与粗纲事件可**合并为一张粗纲表**（每章一行问卷 + 一行粗纲事件），由 `references/outline-artifact-protocols.md` 给模板；不必重复两份文件。

### 4. 爽点预判与密度目标（转 `大纲/粗纲总表.md`「爽点」节，只到预判层）

- 逐转折点预判天然爽点类型（用第四组九型做标尺，映射到源 A 九型落地名，见 references 对照表）。
- 四部分各设小/中/大爽点密度目标（≈C/8 / C/25 / 3-5 个大爽点）。
- 蓄力链方向（哪个爽点由前几章蓄力）。
- **止步点**：不逐章填「爽点五字段」，写到「TP-XX 预判为 X 型、由第A-B章蓄力」即可，精细闭环属下游细化步骤。

### 5. 转折点场景卡要点 + 伏笔计划 + 节奏曲线（轻量）

- **转折点场景卡要点**（G4.6 轻量）：只为 K 个转折点各留一段「场景功能 + 必修约束（人物/主题/世界观/爽点感官强化方向）」，**不写镜头级场景卡**（那是 `story-scene-card` 的活）。
- **伏笔计划**（G4.7 轻量）：继承 `foreshadowing_seeds` → 扩充至 F → 每条标 埋设章/强化章/回收章 + 可关联象征物；产出进 `大纲/粗纲总表.md`「伏笔」节。伏笔的逐章登记与回收走下游细化步骤与正文追踪，不在粗纲层做。
- **节奏曲线**（G4.8 轻量）：按 `G` 分组标紧张值 + 主导情绪，做一次「爽点-紧张值」交叉检查（引爆对应高紧张、余韵对应回落）。

### 6. 联动验证与收口（G4.9/G4.10 轻量 → 落盘）

- **联动检查**：人物出场一致性、弧线完整性、因果网无断裂、伏笔回收完整、主题论点一致、象征/世界观关键时刻覆盖、体裁基调一致。发现问题转「待修订清单」逐项经用户确认后回改对应粗纲行。
- **落盘**（本 skill 的唯一正式产物）：
  - `大纲/粗纲_第X卷.md`：本卷「逐章粗纲表」（问卷+事件合并）。
  - `大纲/粗纲总表.md`：全书「约束表 / 结构 / 爽点预判 / 伏笔 / 节奏曲线」五节全局视图。
- **停靠**：粗纲交付后停止，报告「粗纲已就绪，可进入下一细化步骤」。**不自动产出细纲、不自动写正文**，除非用户同一句明确要求。

---

## 与相邻步骤的接力

| 上游 → 本 skill | 本 skill → 下游 |
|---|---|
| 卷纲（`大纲/卷纲_第X卷.md`）+ 体量门（`length_params`） | 细化步骤（消费 `大纲/粗纲_*.md` 的逐章事件与爽点预判） |
| `story-constraint-gate` 的 `大纲/_约束清单.md` | 场景卡（只消费细化产物，不直接消费粗纲） |

- **给下游的可消费项**：粗纲交付 `core_event`（每章一句话事件）+ `highlight_preset`（爽点预判）+ `subplot`（本章副线推进）这三项是下游展开 α点/情节点序列/爽点五字段/副线情节点 的输入；粗纲已确认的结构骨架（四部分/转折点/对抗层级/副线排期/心路阶段）下游只消费、不改写，确需改走「跨产物修订门禁」。
- **场景卡不直接读粗纲**——它通过细化产物继承粗纲定下的情绪方向与约束。

---

## 参考文件

- `references/outline-artifact-protocols.md`：粗纲产物模板（`粗纲_第X卷.md` / `粗纲总表.md`）+ 爽点类型双名对照表 + 逐章粗纲字段定义。
- 方法论原文（只读、不被本 skill 改写）：`小说设置提示词/第四组：情节粗纲.md`（G4.0→G4.10 全文），源 A 侧 `story-long-write/references/highlight-system.md`（爽点五字段细设计归属，粗纲只引用其九型与三段式、不做五字段）、`outline-structure-theory.md`（八节点/换地图等结构技法，仅粗纲层消费）。
