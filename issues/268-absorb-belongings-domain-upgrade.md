# 268 · 吸收上游「归物本（belongings）整域升级」

日期：2026-09-13 · 状态：**开发完成，待用户验收** · 上游基线：`7b06f4b4`
关联：ADR-0117（选择性吸收双门）、ADR-0120（纪律与冻结清单）、ADR-0121（冻结裁决 + 第 5 条皮肤例外）、ADR-0118（本地命名保留）、ADR-0104（markup 单源）

---

## 一句话

把上游「归物本」域整批升级搬到本地**同名 `belongings` 域**：**7 项缺陷修复 + 3 个新设置项 + 夜版海报 + 长按开抽屉**，同时**原样保留本地 5 项自有能力**（上游没有的）。域名/键名不动（两边同名，无改名对位）。

> **票号顺序说明**：票 266 里排的队列是「267 待办 → 268 知识盒 → 269 归物本」，本次改为**先做归物本**（差量最小 + 双边各自演化，先验证合并手法），故归物本占 268，知识盒顺延。

## 上游票号

`294`（金额单位 / 默认排序 / 新增物品默认状态三设置）、`270`（夜版海报 `.theme-dark` 暗色变体）、`291`（确认流程框带域皮肤类）、`271`（详情 ✕ 退役 → 点遮罩关，**本地优先不吸**）、`H14~H20`（七项缺陷修复，见下表）。

## 吸收的改动

| # | 内容 | 落到哪 |
|---|---|---|
| 1 | **H19 数据损坏防护**：`items` 为真值非对象（字符串/数组/数字）时重置为空表 + 控制台告警（此前会按字符/元素派生垃圾分类） | `data.ts` |
| 2 | **H20 AI 图标回退**：AI 只给合法分类但图标非法/缺失时，回退菜单内通用「杂物」图标，不再整条弃用建议 | `ai.ts` |
| 3 | **H18 新增 id 加随机后缀**：裸 `Date.now()` 同毫秒两条（批量导入）会互相覆盖 | `ui.ts` |
| 4 | **H16 出离日期倒挂校验**：出离日期早于购买日期时保存前拦下（会让「陪伴 N 天」与日均成本失真） | `ui.ts` |
| 5 | **H15 撤销写盘失败回滚**：状态流转撤销 / 删除撤销的 `try/catch` + `notifySaveError`，失败时从盘回滚（否则内存已改、后续任意保存把未落盘的撤销补刀持久化） | `ui.ts` |
| 6 | **H17 主题监听随面板关闭断开**：`bodyThemeObserver.disconnect()`（面板关闭期间不空转回调） | `ui.ts` |
| 7 | **H14 表单防叠开区分**：同一物品聚焦 / 另一物品误聚焦时明确提示，不再让 B 的编辑窗没开、内容填进 A | `ui.ts` |
| 8 | **新功能：金额单位**（`belongingsCurrency`）：￥ 前缀 / 元 后缀 / $ / 无符号四档；纯层显式入参 `MoneyUnit`，KPI / 卡片 / 抽屉 / 详情 / 表单字段名全链路跟随，非法值回落 ￥ | `shared.ts`、`layouts/poster/render.ts`、`ui.ts`、`settings.ts` |
| 9 | **新功能：默认排序**（`belongingsDefaultSort`）：recent / price / daily；每次打开面板读设置，非法值回落「最近购入」 | `ui.ts`、`settings.ts` |
| 10 | **新功能：新增物品默认状态**（`belongingsNewStatus`）：使用中 / 闲置；只管新记，编辑回填不受影响 | `ui.ts`、`settings.ts` |
| 11 | **夜版海报（暗色）**：`.theme-dark` 深炭底 + 米白粉笔墨 + 赤橙微提亮，反色体系随 token 自动翻转，阴影转纯黑加深（issue 270 推翻「双主题恒定纸面」旧口径）。**纯 CSS，零结构规则** | `styles.css` |
| 12 | **确认框带皮**：删除确认 / 放弃草稿确认两个 body 弹窗挂 `.bz-bel-flow-dialog`，与详情/表单同皮 | `styles.css` + `ui.ts` 两处传参 |
| 13 | **B1/B4 撤销口径**：面板已关后撤销从盘重载；恢复流转前封口快照（出离→出离撤销不丢原日期） | `ui.ts` |
| 14 | **B8 表单防叠开**：重复开表单时聚焦既有表单直接返回（模块级 baseline 互踩会让脏拦截失效） | `ui.ts` |
| 15 | **移动端长按卡开抽屉**：统一手势 `core/dom.longPress`（被动监听 + 10px 移动取消），与点卡入口同一 `openMobSheet` | `ui.ts` |
| 16 | **单源收敛**：`STATUS_LABELS` 改从 `STATUS_ORDER` 派生（禁再手抄一份）；`SEARCH_DEBOUNCE_MS` 常量抽出；`makeSheetRebuild` 抽出 | `shared.ts`、`ui.ts` |
| 17 | **渲染纯层显式入参**：KPI / 卡片 / 抽屉头 / 详情 / 表单的金额相关函数统一收 `unit` 参数（ADR-0104 纯层不读设置） | `layouts/poster/render.ts`、`shared.ts` |

## 本地差异 · 原样保留（不跟随上游）

| 项 | 上游做法 | 本地保留 | 理由 |
|---|---|---|---|
| **详情 × 关闭钮** | issue 271 把 ✕ 退役，改「点遮罩关」 | **保留** `data-bd-close` 按钮 + 接线（同时遮罩 mousedown 仍可关） | 本地现有入口，退役即掉功能 |
| **保存/更新成功提示** | 无 | **保留** `notice('物品「X」已添加/已更新')` | 本地现有反馈 |
| **移动端默认全屏开关** | 无此设置，面板恒为常规卡 | **保留** `belongingsMobileDefaultFullscreen` 键 + `applyMobileWindowFullscreen` + 设置「移动端」组 | 本地现有开关 |
| **懒加载入口** | 注释自述「无需懒加载初始化」 | **保留** `ensureBelongings` 幂等初始化（ADR-0003） | 本地架构约定 |
| **`belongingsDataFolder` 键** | 已删 | **保留**（ADR-0009 废弃兼容键） | 数据键不动 |
| **ICON.chevR** | 无 | **保留**（本地图标表超集） | 零成本，保持图标表一致 |

## 明确未吸收

- **外观组占位单卡**（`belSkin` / `belSkinTheme`）：上游注释自认「占位单卡，布局/主题扩展待将来开模」，**选了无任何视觉变化** → 按票 266 占位项处置原则不吸，对应两个设置键也不加入本地 `settings.ts`。
- **详情 ✕ 退役**（issue 271）：与本地现有入口冲突，按 ADR-0120「A 类冲突一律本地优先」保留本地做法。
- **上游 7 个归物本测试**：本次随特性块**一并吸收**（见下），非独立批次搬运。

## 测试改动

| 文件 | 处理 |
|---|---|
| `dark-skin.test.ts`、`panel-fix.test.ts` | **新增**（上游随暗色皮肤 / 面板修复特性块而来） |
| `d2-reliability.test.ts`、`data.test.ts`、`emoji-icon-map.test.ts` | 与上游逐字节相同，无改动 |
| `render.test.ts` | 用上游版（新增金额单位 8 条断言） |
| `ui.test.ts` | 用上游版，并**回补本地独有断言**：①`belongingSettingsSchema` 用例改为「显示组（状态+排序+金额单位）+ 记一笔组 + 移动端组」三组口径（去掉外观占位组断言，加移动端组门控断言）；②详情关闭改测「× 钮」（遮罩 mousedown 关闭由原有独立用例继续覆盖）；③补 `已添加`/`已更新` 两条 notice 断言 |

## 门禁

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 0 错误 |
| 归物本域 `vitest` | ✅ 7 文件 / 147 例全绿 |
| 全量 `vitest` | ✅ 279 文件 / 4421 例全绿（含归物本域 7 文件 / 147 例） |
| `node esbuild.config.mjs production` | ✅ 构建通过（产物含 `belongingsCurrency` / `belongingsDefaultSort` / `belongingsNewStatus` 与 `bz-bel-flow-dialog`；构建产物已 `git checkout --` 还原，未提交） |

## 冻结域零接触核查

本次改动文件全集（`git status --porcelain`）：

```
 M src/belongings/ai.ts
 M src/belongings/data.ts
 M src/belongings/layouts/poster/render.ts
 M src/belongings/shared.ts
 M src/belongings/styles.css
 M src/belongings/ui.ts
 M src/settings.ts                     （仅新增 3 个 belongings 键声明与默认值）
 M tests/belongings/render.test.ts
 M tests/belongings/ui.test.ts
 M tests/settings-modal.test.ts        （仅跟改组索引：显示组 2→3 组、移动端组 index 1→2）
?? tests/belongings/dark-skin.test.ts
?? tests/belongings/panel-fix.test.ts
```

**零接触**：`src/diary/`、`src/recap/`、`src/review/`、`src/diary-wall/`、`src/smartcat/`、设置页 AI 设置与小橘设置板块 —— 一个文件未动。

**旁证核查**：
- 冻结域样式未被牵连：归物本 `styles.css` 消费的 27 个 CSS 变量在本地 CSS 中**全部有定义**（零缺失）。
- 守卫测试未被削弱：本地 `belongings/index.ts` 与 master 逐字节相同（`ensureBelongings` 已按本地口径还原，故不出现在 diff 中）。
