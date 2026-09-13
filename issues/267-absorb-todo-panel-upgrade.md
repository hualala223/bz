# 267 · 吸收上游「待办本（备忘录）整域升级」

日期：2026-09-13 · 状态：**开发完成，待用户验收** · 上游基线：`7b06f4b4`
关联：ADR-0117（选择性吸收双门）、ADR-0120（纪律与冻结清单）、ADR-0121（冻结裁决 + 皮肤例外）、ADR-0118（本地命名保留）、ADR-0104（markup 单源）

---

## 一句话

把上游「备忘录（memo）」域这一整批升级（面板重做 + 渲染纯层抽出 + 排序改下拉 + 三个新设置项 + 四个 bug 修复）整域搬到本地**待办（todo）**域，域名/类名/DOM 属性一律改回本地 `todo` 口径，**本地四项自有能力原样保留**。

## 上游票号

`260`（正名迁移）、`266`、`268`（面板重做主体：真全屏 + 场景 chip + 排序下拉 + 抽屉勾选圈）、`269`（移动端「添加」带场景进弹窗）、`284`、`292`、`293`（打开默认场景 + 上次停留）、`E7/E21/E22/E23`（四个缺陷修复，见下）。

## 落地的改动

| # | 内容 | 落到哪 |
|---|---|---|
| 1 | **渲染纯层抽出**：面板壳/主头行计数/场景 nav/移动 chips/条目卡/meta 行/分区标签/完成折叠条全部收进新文件 `render.ts`（markup 单源，ADR-0104） | 新增 `src/todo/render.ts`（239 行） |
| 2 | **面板重做**：移动端真全屏 + 顶部横滑场景条（场景 chip + 尾部「添加场景」虚线 chip）；桌面头行钮组收敛；移动端头行撤掉设置/新建 | `src/todo/ui.ts` + `src/todo/styles.css` |
| 3 | **排序控件**：三档平铺（浮岛 segmented）→ 单枚下拉 `uiSelect`，收起态只占一行文案宽 | 同上 |
| 4 | **抽屉头勾选圈**：移动端长按抽屉顶部与列表卡同源 markup，勾选圈 19px + 45px 热区 | `ui.ts` + 核心 `item-actions` |
| 5 | **新设置「打开默认场景」**：`@last`（上次停留）/ 全部 / 今日 / 重要 / 场景名，非法值回落「全部」；关面板记忆当下场景 | `settings.ts` + 根 `src/settings.ts` |
| 6 | **新设置「已完成显示范围」**：7 / 30 / 90 天 / 全部；窗内直列，更早的收进尾部「更早 N 条」 | 同上 |
| 7 | **三个新设置键**：`memoOpenScene`（默认 `@last`）、`memoLastScene`、`memoDoneWindow`（默认 30） | 根 `src/settings.ts` |
| 8 | **E23 数据损坏兜底**：memo.json 合法但非数组时，原内容留档 + 重建空清单 + 提示，不再静默空白 | `src/todo/data.ts` |
| 9 | **E21 标题联动收窄**：重命名笔记时，只对「本条确实引用了该笔记」（notePath/linkedNote 命中）的条目改标题，不再按「标题恰好等于旧文件名」盲改 | `src/todo/file-sync.ts` |
| 10 | **E22 范围外引用放行**：监听目录之外的笔记，只要被 memo.json 实际引用，改名/删除同样同步（此前不同步 → 卡片「位置」tag 指向不存在的文件） | 同上 |
| 11 | **删除分支口径对齐**：笔记删除时同时清 `notePath`/`notePosition`（此前只清 linkedNote，两分支口径不对称） | 同上 |
| 12 | **E7 卸载缺陷**：提醒后台注册时自持 app 引用，不再依赖 `M.appRef` 存活（此前卸载顺序不对会让 file-open 监听残留、重载叠加） | `src/todo/reminder.ts` |

## 本地差异 · 原样保留（不跟随上游）

| 项 | 上游做法 | 本地保留 | 理由 |
|---|---|---|---|
| **到期时间格式设置** | 已退役，文案固定相对 | **保留** `memoDueFormat` 设置行 + `due.ts` 的 `mode` 参数 | 本地现有功能，退役即掉功能 |
| **移动端默认全屏开关** | 纯 CSS 无条件撑满 | **保留** `todoMobileDefaultFullscreen` + `applyMobileWindowFullscreen`；域内真全屏段改挂 `.bz-todo-panel.bz-win-mfs`（开关开才撑满，关走 core 常规卡） | 本地现有开关，可切全屏/常规卡 |
| 面板皮肤设置键 | `memoSkin` | **保留** `todoSkin` | 改名会让用户已选皮肤失效 |
| 面板尺寸记忆键 | `memoPanelWidth/Height` | **保留** `todoPanelWidth/Height` | 同上 |
| 状态字段 | 无 `editingId` | **保留** 本地 `editingId` | 本地独有字段，无冲突 |
| 「场景写入…设置」文案 | — | 保留本地原文「场景将写入备忘录设置（与备忘录共用）」 | 用户可见文案不动 |
| 域名 / 类名 / DOM 属性 / 命令 id | `memo` / `bz-memo-*` / `data-memo-*` / `bz-memo-*` | 一律 **`todo` / `bz-todo-*` / `data-todo-*` / `bz-todo-*`** | ADR-0118 本地命名保留 |
| **共享设置键** | —— | `memoScenarios` / `memoSortMode` / `memoShowArchivedByDefault` / `memoDefaultPriority` / `memoDefaultScene` / `memoDueFormat` 一律**不改名** | 与 memo.json 共享键，改名即数据断层 |

## 连带改动的共享层（2 处，均为纯新增，向后兼容）

1. **`src/core/item-actions.ts`**：`ItemActionsOptions` 新增可选 `sheetClass?: string`，`openItemSheet` 挂到抽屉根节点（上游为让皮肤类随行传递）。不传即与改动前完全一致，其它域零影响。
2. **`src/settings.ts`**：新增 `memoOpenScene` / `memoLastScene` / `memoDoneWindow` 三个键的接口声明与默认值。

## 测试改动

- `tests/todo/ui.test.ts`：原「排序三档 = 浮岛 segmented」用例改适配为「排序 = 组件库下拉」（断言收起态文案 + 展开三档 + 切换写回设置）。
- `tests/todo/file-sync.test.ts`：原「范围外改名不处理」用例改为 E22 新语义「范围外但被引用 → 同步」，并**新增**一条「范围外且未被引用 → 仍不处理、不写回」保住原有保护。

## 门禁

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 0 错误 |
| 全量 `vitest` | ✅ 277 文件 / 4394 例全绿（含待办域 99 例） |
| `node esbuild.config.mjs production` | ✅ 构建通过 |

## 冻结域零接触核查

本次改动文件全集（`git status --porcelain`）：

```
 M src/core/item-actions.ts      （+7 行，纯新增可选属性）
 M src/settings.ts               （+9 行，新键声明与默认值）
 M src/todo/data.ts
 M src/todo/file-sync.ts
 M src/todo/reminder.ts
 M src/todo/settings.ts
 M src/todo/styles.css
 M src/todo/ui.ts
 M tests/todo/file-sync.test.ts
 M tests/todo/ui.test.ts
?? src/todo/render.ts
```

**零接触**：`src/diary/`、`src/recap/`、`src/review/`、`src/diary-wall/`、`src/smartcat/`、设置页 AI 设置与小橘设置板块 —— 一个文件未动。

## 明确未吸收（本票范围外）

- 上游 `bz-memo-note-binding`（「给当前笔记记一笔」，首页入口菜单专用）——首页本轮不搬，跳过。
- 上游 `memoLayout`（面板布局占位键，上游注释自认「布局维度待皮肤设计时接入」）——**占位，非功能**，跳过。
- 上游把皮肤设置行重排进新「外观」组 —— 本地皮肤行位置不动。
- 上游 12 个 memo 守卫测试 —— 按票 259 教训不搬运（本地 6 个测试文件已全程绿色）。

## 上游自称占位/未实现项（据实标注）

| 项 | 原文 | 处理 |
|---|---|---|
| `memoLayout` | 「布局维度待皮肤设计时接入」 | 未吸收（占位键） |
| `diarySkin` / `reviewSkin` | 「域 UI 消费在各域真做皮肤时接入」 | 已按 ADR-0121 第 5 条判定不吸收 |
