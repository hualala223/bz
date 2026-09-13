# 255 — 吸收上游「通知四项设置」（草案 · 已由 258 落地）

**状态：草案内容留作本块设计依据；实施已由 `issues/258-absorb-notice-preferences.md` 承接并交付。**

> 拆票说明：本块最终**未按「四项拆成三张票」**——四项共用同一个偏好读取通道、集中在同一个模块里，实测一次改完更稳。故本块 = 一张票（`issues/258`），回滚单元即整块（与 ADR-0120「一次一块、独立票」一致）。本文件保留上游来源与逐项核对结果，不再单独启动。

## 背景

ADR-0117 定下「同源分叉、单向取用、按块吸收上游纯增量」。2026-09-13 审计把「通知四项设置」列为**唯一零调用方改动**的块，故选它当第一块——目的不止于加功能，更在于**把吸收流程完整跑通一遍**：摘取上游文件 → 按本地命名落位 → 补测试 → 过门禁 → 提交。

## 上游来源（tip `7b06f4b4`）

| 位置 | 内容 |
|---|---|
| `src/core/notice.ts` | 新增 `noticePref()` 读取偏好；`maxVisible()` 消费 `noticeMaxVisible`（只认 3/8，其余回落 5）；级别/时长/位置三处消费点 |
| `src/core/settings-main-schema.ts` | `noticeSettingsSchema()`（4 行 select）；`generalSettingsSchema()` 注释「通知组已拆出」；`mainSettingsSchema()` 改为 AI + 数据存储路径 + 通知 三区块 |
| `src/settings.ts` | 4 个键的类型声明 + 默认值 |
| 上游 issue 297 | 通知行型全 select，原生设置页与设置面板双渲染器通用 |

## 四项设置（选项集以上游 `noticeSettingsSchema()` 为准，本次已逐条核对）

| 键 | 项名 | 选项 | 默认 | 语义备注 |
|---|---|---|---|---|
| `noticeLevel` | 通知级别 | `all` 全部 / `important` 仅警告与错误 / `error` 仅错误 | `all` | 低档位静默常规通知；**带撤销按钮的通知不受影响** |
| `noticeDuration` | 停留时长 | `quick` 2 秒 / `standard` 3 秒 / `relaxed` 5 秒 / `persistent` 常驻（点击才关） | `standard` | 长文案自动延长；**撤销类 6 秒反悔窗口不受影响** |
| `noticePosition` | 弹出位置 | `top-right` / `bottom-right` / `bottom-left` / `top-left` | `top-right` | 桌面端四角任选，移动端恒顶部居中 |
| `noticeMaxVisible` | 同屏上限 | `3` / `5` / `8` | `5` | 超出挤掉最旧一条 |

## 落地范围（预估）

- `src/settings.ts`：+4 键类型声明与默认值（照抄上游语义，键名用上游原名 —— 这几个键两侧无命名分歧）
- `src/core/notice.ts`：+`noticePref()` 与四处消费；偏好经 `settings-provider.tryGetSettings()` 读取（本地已有该 API）
- `src/core/settings-main-schema.ts`：+`noticeSettingsSchema()` 并并入 `mainSettingsSchema()`
- 测试：`tests/core/notice.test.ts`（两侧同名，需比对后取并集）+ 四项偏好的生效用例

## 不做什么

- **不动 ADR-0120 冻结清单的任何一项**
- 不改既有设置键语义；**缺省值必须等于旧行为**（未设置时插件行为零变化）
- 不建通知业务域（上游明确：横切偏好，schema 留 core）
- 不引入上游其他横切偏好；不动通知图标表与既有通知类型（铁律 7）

## 验收标准

- [ ] 未设置四项时，通知行为与现状**完全一致**（回归零差异）
- [ ] 四项各自生效：级别降档静默／时长四档／位置四角（移动端仍居中）／同屏上限挤旧
- [ ] 撤销类通知 6 秒反悔窗口、progress 常驻通知不受四项影响
- [ ] 原生设置页与设置面板（若本地有对应渲染器）都能读到四项
- [ ] `pnpm test` + `pnpm exec tsc --noEmit` + 构建 全绿
- [ ] 本次吸收**未触碰**任何冻结文件（ADR-0120 自检项）

## 风险与回滚

- 风险低：新增键，缺省即旧行为；无数据迁移；不碰 `CONFIG/STORAGE/*.json` 与 vault 文件
- 回滚：删掉四个键与对应消费点即回到现状，无数据副作用

## 已定（原「待定」项已核清）

- 上游把通知做成了**设置面板里的独立一页**；本地**不适用**——本地设置面板的导航是**按域组织**的（`.bz-sp-nav` + `data-sp-domain` 域条目），而通知偏好是核心横切项、不建业务域。→ 本块**只进原生设置页**（主设置页新增一个通知区块）。
- 形态口径：本地主设置页的分组有「卡片组（带 `icon`）」与「区块标题平铺」两种形态，AI 区块现为**平铺**；通知组沿用**平铺**写法，不引入 `icon` 字段改变既有版式契约。

关联：本票是 `issues/256-upstream-absorption-spec.md` 的第一块（该 spec 状态：就绪待开工）。
