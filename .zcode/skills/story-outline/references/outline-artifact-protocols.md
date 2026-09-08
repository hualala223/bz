# story-outline 产物协议

> 本文件定义粗纲的落盘产物结构与爽点双名对照。产物轨道＝markdown（源 A），第四组 JSON 片段只作生成中间态。

---

## 一、落盘产物

| 文件 | 粒度 | 内容 | 何时建 |
|---|---|---|---|
| `大纲/粗纲总表.md` | 全书 | 五节全局视图：约束表 / 结构 / 爽点预判 / 伏笔 / 节奏曲线 | 首次进粗纲时建，每卷滚动增补 |
| `大纲/粗纲_第X卷.md` | 卷 | 本卷「逐章粗纲表」（约束问卷 + 逐章事件合并） | 每卷一轮，卷内全部章节确认后落盘 |

> 不落 `04_plot_outline.json`（第四组原版产物）。JSON 只用于过程中承载字段，结束转写 markdown。

---

## 二、`大纲/粗纲总表.md` 模板

```markdown
# 全书粗纲总表

## 约束表（五张，源自 _约束表.md / story-constraint-gate）
### character_chapter_map（人物-章节出场映射）
| 角色 | 首次出场章 | 弧线章区间 | 关键转变章 | 登场方式(引原文) | 退场方式 |
|---|---|---|---|---|---|
### character_arc_beat_map（弧线节拍映射）
| 弧线/支线 | 章节区间 | 埋设章 | 引爆章 | 收束章 | 状态 |
|---|---|---|---|---|---|
### worldview_conflict_schedule（世界观冲突排期）
| 规则 | 首次暗示章 | 首次展示章 | 升级章 | 最终代价章 | 关联碰桩 |
|---|---|---|---|---|---|
### theme_beat_schedule（四部分主题论点）
| 部分 | 主导论点 | 论证方 | 反驳方 | 章节范围 |
|---|---|---|---|---|
### subplot_schedule（副线排期，消费 OB-3.8 subplot_structure）
| 副线ID | 功能 | 捆绑度 | 锚定角色 | 首现章 | 推进区间 | 收束章 | 状态 |
|---|---|---|---|---|---|---|---|
| SP-01 | 情绪支撑 | 强绑定 | {角色} | N | N-N | N | 进行中/已收束 |

## 结构
- 时间结构 / 空间结构（+理由）
- 四部分比例、8-N 个转折点章号（表格）
- 分卷四部分（V>1）
- 对抗层级 → 转折点映射（表格）
- 心路五阶段 → 章节范围（表格）

## 爽点预判
- 逐转折点预判类型（双名：第四组九型标尺 → 源A九型落地）
- 四部分爽点密度目标（小/中/大）

## 伏笔
| 伏笔ID | 内容 | 埋设章 | 强化章 | 回收章 | 关联象征物 | 来源(种子/新增) |
|---|---|---|---|---|---|---|

## 节奏曲线
| 分组 | 章节范围 | 主导情绪 | 紧张值 | 爽点联动 |
|---|---|---|---|---|
```

---

## 三、`大纲/粗纲_第X卷.md` 逐章粗纲表模板

每章合并「约束问卷 + 粗纲事件」为一行/一块（不重复两份文件）：

```markdown
# 粗纲 第X卷

## 第 N 章
- core_event：{行动→阻碍→结果，≥30字}
- characters：C01★ / A01 / M02⟲（★初出场 †退场 ⟲间接铺垫）
- subplot：{SP-XX · 本章推进什么 / 无}
- causal_network：承接自{N-1 事件} → 产出给{N+1 事件}
- protagonist_state：{困兽期·心结牢固 …}
- antagonist：{层级N / 表现}
- theme_argument：{论点} ← {人物·行动}
- value_level：{距价值光谱哪一级}
- knowledge_check：{谁不知道什么 / ✅无越界}
- symbol：{象征物·阶段 / 无}
- worldview_rule：{规则·暗示/展示/升级 / 无}
- foreshadowing：{埋设/强化 / 无}
- highlight：{TP-XX 预判 级别+类型，蓄力自第A-B章}（非五字段细设计）
```

---

## 四、爽点类型双名对照（两源对齐，不新增权威）

第四组九型（结构位置标尺）↔ 源 A `highlight-system.md` 九型（题材落地）：

| 第四组九型 | 适用结构位置 | 映射源 A 九型 |
|---|---|---|
| 危机爆发型 | 第一情节点/间歇期低谷/高潮 | 打脸反转型（蓄能引爆） |
| 真相揭示型 | 中间点/关口二/高潮 | 身份揭露型 / 复仇兑现型 |
| 身份反转型 | 关口二后/高潮附近 | 身份揭露型 |
| 力量展示型 | 每卷高光章 | 逆袭升级型 |
| 情感爆发型 | 弧线转折点 | 守护救赎型 / 情感余韵型 |
| 智谋碾压型 | 中间点/第三部分主动段 | 赌局博弈型 |
| 伏笔回收型 | 分散全篇/高潮 | 资源滚雪球型（布局兑现） |
| 新信念高光型 | 高潮/结局 | 情感余韵型（完美弧线终点） |
| 群像汇聚型 | 高潮/结局 | （无直接对应，源 A 以 TP-08 全书维承载） |

> 用法：粗纲 `highlight_preset` 用第四组九型标「位置+级别」，同时在括号注明源 A 落地名；细纲「爽点五字段」用源 A 九型 + TP-XX 编号闭环。两套只映射、不互斥。

---

## 五、逐章粗纲字段与第四组原文对应

| 本 skill 字段 | 第四组原文字段 | 去留 |
|---|---|---|
| core_event | core_event | 保留 |
| characters | characters | 保留 |
| subplot | —（第四组无逐章副线字段） | 新增：消费 OB-3.8 `subplot_structure`，落地 `subplot_schedule` |
| causal_network | causal_network | 保留 |
| protagonist_state / substate | protagonist_state / protagonist_substate | 保留 |
| antagonist_level / manifestation | antagonist_level / antagonist_manifestation | 保留 |
| theme_argument_check | theme_argument_check | 保留 |
| value_level_check | value_level_check | 保留 |
| knowledge_check | character_knowledge_check | 保留 |
| symbol_stage_check | symbol_stage_check | 保留 |
| worldview_rule_check | worldview_rule_check | 保留 |
| foreshadowing_check | foreshadowing_check | 保留 |
| highlight | highlight_check（只保预判，不保五字段） | 降级 |
| — | humor_check / stance_check / transcendence_check / worse_off / stakes_tags | 下放：humor/stance/transcendence 到场景卡层，worse_off/stakes_tags 留细纲层，粗纲不逐章填 |
| — | character_appearance_check / exit_check（逐章全表） | 并入 characters 行，不单独成表 |
