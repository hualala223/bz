# ADR-0132: PlanFlow 保持独立插件——内容首页以外部插件卡只读接入

日期：2026-09-24 ｜ 票：issues/304-planflow-home-card.md ｜ 状态：已接受

## 背景

PlanFlow（插件 id `planflow`，独立插件，约 6900 行 / 9 文件）评估能否整体吸收进 bz。grill 裁决（2026-09-24，Q1–Q6 全部收敛）认定：

- 全量吸收 ≈ 8 张串行票的**移植重写**（`PlanBoardView.ts` 单文件 3801 行、六视图挤一个 View，与 bz 域拆分惯例差异大）；
- 其 `src/diary-sync.ts`（489 行）已写日记四个小节（`## 代办事项` 投影 / `## 完成情况跟踪` 镜像 / `## 备注` 总结 / `# 当日复盘`），吸收即踩 ADR-0121 冻结区，须豁免立项 + 投影单点收敛（ADR-0122 双写者问题）。

用户裁决 **Q1(b)：不吸收**——planflow 保持独立插件继续运行；bz 侧只在内容首页（home 域）加一张「计划」卡做只读接入。Q5(b) 卡带实时计数「今日打卡 N/M」；Q6(b) 右键照挂 planflow 既有命令。

## 决策

1. **不吸收**：PlanFlow 全部功能留在独立插件里；bz 不新增 plan 域、不动 todo/memo.json、不碰日记投影链路。本裁决记录在案——后续若重启吸收，须按 ADR-0117/0120 分块纪律重新立项，不复用本文。
2. **home 域加外部插件卡（首例）**：`DOMAINS` 加 id `plan` 的卡，左键执行 `planflow:open-planboard`（planflow 唯一命令，其 main.ts:71）。这是 `DOMAINS` 首个非 bz 域条目；执行仍走现成 `runCommand`（`app.commands.executeCommandById`，ui.ts:233），planflow 未启用时走既有失败提示——**不新增执行通道**。
3. **右键挂 1 条**（Q6(b) 用户点名）：`DOMAIN_MENU.plan = [{ label: '打开计划总览', commandId: 'planflow:open-planboard' }]`。破「菜单不放打开 X」惯例（2026-09-10 拍板）——用户点名形态统一，diary「打开今日日记」已开先例（shared.ts:231）。planflow 当前命令面仅此 1 条，其后续扩命令面可再挂。
4. **计数只读**（Q5(b) 用户点名）：卡上显示「今日打卡 N/M」，bz 侧只读解析 `CONFIG/计划/计划{year}/年度计划.md` frontmatter（plans）与 `每日/YYYY-MM-DD.md` 勾选状态，**不写回 planflow 任何数据**；数据缺失/格式变动时计数隐藏，不报错、不阻塞首页。
5. **planflow 侧零改动**：本次不修改 planflow 仓库任何代码。

## 后果

- home 域从 16 张卡变 16+1；home.json 钉选顺序（HomeOrder v3，两端各一份）须容忍新增 id 缺省落位。
- 静态原型镜像（`src/home/prototype-render.js` 的 DOMAINS/DOMAIN_MENU）须与 shared.ts 同步改。
- 新增图标须用原型图标表内已有的 lucide 名（表外名字静默渲染成空，shared.ts:219 惯例）。
- 双插件长期并存：日记「## 代办事项」双写者（bz 投影 + planflow diary-sync）现状照旧——两边格式同源（planflow ADR-0004 ↔ 本仓 ADR-0122），**改投影格式须两仓同步**（已知维护税，用户知情选择 Q1(b)）。
- bz 对 planflow 数据只读；planflow 数据格式变更不算 bz 破坏数据契约（铁律 1 不受限），失效表现仅为计数隐藏。
- 后续若觉得右键 1 项太空，走 planflow 仓库补命令面（按视图注册命令）再挂——bz 侧菜单结构不变。
