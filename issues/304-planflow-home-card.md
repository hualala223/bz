# 票 304 — 内容首页「计划」卡：PlanFlow 外部插件只读接入

**状态：已完成（2026-09-24）**

用户裁决（grill 2026-09-24）：planflow **不吸收**、保持独立插件（Q1(b)）；Q5(b) 域卡 + 实时计数「今日打卡 N/M」；Q6(b) 右键照挂「打开计划总览」。

依据：ADR-0132。

## 裁决回执

- Q1 (b) 不吸收，planflow 独立插件照跑，bz 零吸收票。
- Q5 (b) 域卡 + 计数；不做「明日预告」卡（(c) 留待后续再议）。
- Q6 (b) 右键挂 1 条「打开计划总览」（planflow 现有全部命令），破「不放打开 X」惯例由用户点名（diary 先例）。

## 落地

- [x] `src/core/domain-icons.ts`：`DOMAIN_ICONS.plan = 'target'`（目标语义；原型图标表同步补 `target` 内联 svg）
- [x] `src/home/shared.ts`：`DOMAINS` 加 `{ id: 'plan', commandId: 'planflow:open-planboard', name: '计划', sub: '计划打卡与目标追踪（PlanFlow）', icon: iconOf('plan') }`（置于 todo 之后）；`DOMAIN_DOT.plan = '#4a6fa5'`
- [x] `src/home/shared.ts`：`DOMAIN_MENU` 加 `plan: [{ label: '打开计划总览', commandId: 'planflow:open-planboard', icon: 'target' }]`（破「不放打开 X」惯例，用户点名，先例 diary）
- [x] 计数「今日打卡 N/M」：`shared.ts` 新增纯函数 `parsePlanCheckins`（只认 `## ✅ 今日打卡` 小节内任务行，下一任意级标题截断；小节缺失 → {0,0}）+ `RiverCounts.planDone/planTotal` 字段；`river.ts` 新增 `collectPlanCounts`（路径 `CONFIG/计划/计划{year}/每日/YYYY-MM-DD.md`，只读，缺失/失败留 0，不建文件）；`riverCountText` plan 分支：总数 >0 → `今日打卡 N/M`，否则 null（回落域副题）
- [x] `src/home/prototype-render.js`：production 构建重出（构建产物，已 grep 验证含 plan 卡/菜单/计数/解析逻辑）
- [x] `home.json` 顺序持久化：新 id 走 `applyOrder` 既有「未列出项缺省落位」路径（shared.ts:104 注释即此契约），无需改 order 读写
- [x] planflow 未启用场景：`runCommand` 现成失败提示（ui.ts:227）兜底，无新增执行通道；计数隐藏（planTotal=0 → null）
- [x] 测试：新增 `tests/home/plan-card.test.ts` 10 用例（解析四态/计数分支/卡面与菜单形状/MockVault 采集三态含不建文件断言）；`tests/home/entry-menu.test.ts` 守卫更新——「打开 X」白名单加「打开计划总览」（用户点名特例），命令 id 断言放行外部插件 id `planflow:open-planboard`
- [x] `AGENTS.md` 领域清单 home 行补注「含首张外部插件卡『计划』（planflow 只读接入，ADR-0132）」；`CONTEXT.md` 术语「计划卡（home 域外部插件接入，ADR-0132）」
- [x] 门禁：`tsc --noEmit` 0 错；esbuild production 过（vault 产物 + 根三件套再生，不提交）；vitest home 域 + render-purity **10 文件 120 用例全绿**
- [x] PROGRESS.md 记票

## 边界（不做）

- 不改 planflow 仓库任何代码（含其命令面扩充——那是 planflow 侧独立决策）。
- 不读/不写 planflow 设置（`.obsidian/plugins/planflow/data.json`）：路径解析按其默认 rootPath `CONFIG/计划` + `计划{year}` 目录约定；若用户改过 rootPath 导致计数失效，属已知限制（ADR-0132 后果条），后续再议适配。
- 不动 diary 投影、不动 memo.json、不新增 bz 命令（本票全部复用 planflow 既有命令 id）。
