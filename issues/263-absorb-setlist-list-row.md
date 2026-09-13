# 263 · 吸收上游「设置通用列表行 + 行内动作按钮」（组件地基）

**Status:** 已交付（2026-09-13）

## 背景

功能菜单 6「设置里的选目录控件升级」。核查后发现：本地第一/二档上游合并（a9a07ca4）已吸收 path-picker / settings-model-picker 主体，**真正的剩余增量**是：

1. `core/ui/setlist.ts`（可移除列表组件，本地缺）；
2. 设置 schema 的 `type:'list'` 行（两渲染器消费 setlist，单源 markup——上游"面板 ListRow 条目横铺事故"根治）；
3. text/number/slider/info 行的行内动作按钮（`actions`，列表行「添加」流程的使能件，剪藏本 RSS 行也要用）。

本票 = 三块组件地基。真实消费方：剪藏本 RSS 源（票 265）；review 设置也用 list 行但**冻结排除**。

## 改动

- `src/core/ui/setlist.ts`：上游原样新增（uiSetlist 四布局变体，缺省 chips 胶囊）；
- `src/core/ui/types.ts` / `index.ts`：BzSetlistItem/BzSetlistOpts 类型 + 导出；
- `src/core/ui/components.css`：`.bz-setlist` 全套样式（46 处引用，上游原样）；
- `src/core/settings-schema.ts`：`RowAction` + `SettingsListItem` 接口；text/number/slider/info 行 `actions` 声明与渲染（onClick 完成后重读绑定回填、不置脏）；`ListRow` 行类型 + `case 'list'`（uiSetlist 单源、移除回调抛错通知回滚、customRefreshes 即时重建）；注释行类型十类→十二类；
- `src/settings-panel/renderer.ts`：`case 'list'`（同调 uiSetlist；`bz-sp-set-row--list` 宿主；regRefresh 重建）；text/number 行内动作按钮（按钮在左、onClick 传当前输入值、完成回填不置脏）；
- `src/settings-panel/shared.ts`：SpRowVm.isList + rowHtml 挂 `--list` modifier；
- `src/settings-panel/styles.css`：`--list` 行宿主三条规则（上游原样）；
- `tests/core/ui-setlist.test.ts`：上游原样 6 例（组件契约 + **两渲染器同构锁** + 动态增删）。

## 冻结核查（ADR-0121 扩充版）

- review/diary 系：零接触 ✅（改动面 = core/ui + core/settings-schema + settings-panel）
- 设置页「AI 设置」「小橘设置」板块：零接触 ✅——**未吸收** settings-model-picker 的 C11 onPick 异常兜底修复（该选择器位于 AI 设置板块，属冻结范围；如需此缺陷修复请单独拍板）；path-picker 的 skinClassName 皮肤通道参数留待皮肤票（264）随皮肤块一起进。
- 现有设置行行为：不变 ✅（纯新增行类型与可选字段，既有 schema 渲染路径未动）

## 验收

- ui-setlist 测试 6/6 绿（含同构锁）；tsc 0 错；core+settings-panel 回归 35 文件 544 例绿；全量 vitest 绿；构建通过。
