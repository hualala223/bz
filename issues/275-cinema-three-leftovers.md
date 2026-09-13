# 275 — 影院遗留三项吸收（标记已看改编辑窗 + 随机一部 + localNow 单源）

日期：2026-09-13 ｜ 类型：feat（吸收）｜ 状态：已交付
来源：用户对票 271 遗留清单裁决「①根据上游的来，只要数据是通的就行」
关联：issue 271（遗留三项记录）、ADR-0117/0120（吸收纪律）、ADR-0121（冻结裁决；本票不涉冻结域）

## 交付内容

1. **标记已看改走编辑窗**（上游 `6cb2ac88`）：
   - `itemActions` 的「标记已看」由直接 `markStatus(it,'已看')` 改为 `openForm(sec, it, app, '已看')`——评分/影评由用户在表单确认，保存才落盘；
   - `openForm` 增加可选第 4 参 `presetSt?: string`（预选状态，中文口径）；
   - `saveEdit` 落盘后**补发域事件**（状态流转 want/watching/watched + 评分变化），承接原 markStatus 的小橘行为流语义——「数据是通的」的落点即此处；
   - `markStatus` 保留（「标记在看」仍走快速标记），仅改注释。
2. **随机抽一部**（上游 2026-09-11 首页入口菜单）：
   - `cinema/ui.ts` 新增 `openRandomMovie(app)`（想看池随机 → 直开详情；池空退全量并说明；已开面板先整刷回落 list 再叠详情）；
   - `cinema/index.ts` 新增 `pickRandomCinema(app)`（ensureCinema + M.view='list' + openRandomMovie）;
   - `main.ts` 注册命令 `bz-cinema-random-pick`（icon: shuffle）。
3. **localNow 单源**（上游 core/ui/str 收敛）：
   - `core/ui/str.ts` 新增 `localNow()`（与本地两份私有实现逐字节等价，行为零变化）；
   - `cinema/ui.ts` 私有 `localNow`、`cinema/recommend.ts` 私有 `localNowFormat` 退役，改 import。

## 冻结核查

- 改动全集 = `src/cinema/*` 3 文件 + `src/core/ui/str.ts` + `src/main.ts`（2 hunk）+ tests 2 文件 + 本票。
- diary 系 / review 系 / recap / AI 设置 / 小橘设置：零接触。
- `core/ui/str.ts` 是零依赖渲染纯层（render-purity 守卫范围），新增纯函数无 import，纯度不变。
- main.ts 仅追加 1 条命令 + 1 个 import 名，在制 hunk 未入暂存（hash-object 构造法，见 PROGRESS 票 260 技法）。

## 测试

- `tests/cinema/ui.test.ts`：
  - 既有「标记已看」用例随新交互改写：点菜单 → 编辑窗打开 + 状态预选「已看」+ 评分影评展开；保存后 status=2、`movie` 域事件补发 `want→watched`；
  - 移植上游「补扫 C」随机一部 describe（已开面板先整刷 / 冷开）+ 新增「想看池空退全量并说明」用例；
- `tests/smoke.test.ts`：`EXPECTED_COMMAND_IDS` 补 `bz-cinema-random-pick`。

## 门禁

- [x] 影院域 + smoke：3 文件 61 例全绿
- [x] tsc --noEmit 0 错误
- [x] 全量 vitest（见 PROGRESS 收尾记录）
- [x] production 构建通过（主仓构建，产物抽查 `bz-cinema-random-pick` 命中）
