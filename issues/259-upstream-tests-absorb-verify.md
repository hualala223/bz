# 259: 吸收上游纯新增测试 —— 核验记录（结论：无可直接落地项，票关闭）

**What to build（原拟）:** 从上游 88 个本地没有的测试文件里，把「纯新增、可直接搬」的部分搬进本地测试树。

**Status:** 已核验关闭 —— **结论反转：上游独有测试 0 个可以先行落地。** 此票转为核验记录，防止后人重走弯路。

## 核验方法（可复现）

1. **import 可解析性扫描**（`.scratch/upstream-compare/scan_tests.py` → `report/08-test-candidates.json`）：
   88 个上游独有测试中，仅 **19 个** 的全部 import 能在本地仓库解析（其余 69 个直接 import 上游独有模块 `src/memo|knowledge|password-vault|diary/render|clipbook/render|core/lock-stats|core/ui/setlist|review/queue…`，本地没有这些模块，必炸）。
2. **实跑筛选**：19 个里去掉 1 个非测试 helper（`helpers/date.ts`），18 个按原相对路径复制进本地 `tests/` 实跑 vitest——
   **18 个文件全部整体失败**（合计 124 例失败 / 32 例通过，无一个文件全绿）。
3. 失败原因一致：这些测试是**上游特性的守卫测试**——断言皮肤 CSS 规则块、`--bz-vvh` 消费、滚动条约定（ADR-0122）、flow-dialog 皮肤类、`render.ts` 输出等**上游才有、本地没有的实现内容**。import 能解析 ≠ 行为存在。

## 结论

- 审计报告（`.scratch/upstream-compare/上游差异审计.html`）L6 与 B 清单里「上游新增测试 88 个，其中约 26 个纯新增、可直接搬」**被证伪**——26 是按 import 估算的乐观值，实测可落地数为 **0**。
- 上游测试的正确吸收姿势：**随各自特性块一起走**（吸收皮肤块时带皮肤守卫测试、吸收视口消费时带对应断言），不存在可独立先行搬的测试批次。
- 唯一例外候选是纯函数 helper `tests/helpers/date.ts`，但本地没有任何测试引用它，单独搬入是死代码，不搬。

## 证据

- `report/08-test-candidates.json` —— 88 个文件的 import 明细与缺失清单
- `.scratch/upstream-compare/scan_tests.py` / `copy_candidates.py` —— 扫描与实跑复制脚本（可重跑）
- 实跑记录：18 文件 / 156 例（124 失败 / 32 通过），2026-09-13 09:16
