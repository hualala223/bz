# 260: 吸收视口令牌剥离版 —— `core/viewport.ts` + `--bz-vvh`（不带 mobile 重写）

**What to build:** 把上游 ADR-0120（移动端可视视口高度）里**可剥离的一半**搬进本地：`src/core/viewport.ts` 模块（visualViewport.height → `--bz-vvh` CSS 变量）、core 层的 `:root` 令牌基线（`100vh` + `@supports` 升级 `100dvh`）、main.ts onload/onunload 接线。**不搬**另一半——mobile 重写（上游删 `applyMobileWindowFullscreen` 改 `.bz-panel-mtop` 模型）是 A 类冲突（本地 19 个文件在用该导出，ADR-0120 冻结清单第 2 项），本地移动端全屏机制原样不动。

**Blocked by:** 无（自包含块；与 257 基线票并行推进，提交时按 258 先例只暂存本块文件）

**Status:** 已交付 —— 提交 `8e8109cf`（4 文件，+225/−0：`src/core/viewport.ts`、`src/core/styles.css` 令牌基线、`src/main.ts` 三处接线、`tests/core/viewport.test.ts` 8 例）。门禁全绿：tsc 0 错、全量 267 文件/4312 例、构建通过（产物含 `--bz-vvh` 与 visualViewport 接线）。main.ts 暂存用「HEAD+仅本块编辑」构造，用户两处未提交 hunk 未夹带。

## 范围边界（先说清「不做什么」）

- **不动 `src/core/mobile.ts`**：`applyMobileWindowFullscreen` 与 19 处调用点原样保留。
- **不改任何域面板的高度模型**：本地面板不消费 `--bz-vvh`（消费接线属「域吸收块」，随各域票走）；本块交付后该变量由 JS 写入但无消费方，CSS 侧 `100vh/100dvh` 基线先行就位——这是「只取令牌不取重写」的既定剥离策略。
- **无 `bz-vvh` 命令**：审计报告 B 类曾写「bz-vvh 命令」，经核实上游**不存在**该命令（上游只有 CSS 变量 + 模块 + main.ts 接线），此处一并勘误。
- 不引入上游 components.css 整文件；令牌基线按铁律 8 写进本地 core 层样式源头（`src/core/styles.css`）。

## 交付内容

1. `src/core/viewport.ts` —— 上游原样（自包含零依赖：`VVH_VAR` 常量、`syncMobileViewport`（含 `<120px` 异常帧夹取）、`bindMobileViewport`（幂等单监听，document 级 resize/scroll + window 兜底）、`unbindMobileViewport`、`isViewportBound`）。
2. `src/core/styles.css` 增补令牌基线（与上游 components.css 等义）：
   ```css
   :root { --bz-vvh: 100vh; }
   @supports (height: 100dvh) { :root { --bz-vvh: 100dvh; } }
   ```
3. `src/main.ts` 接线三处：import 一行；onload 在 `attachObsidianAdapter` 之后 `bindMobileViewport()`；onunload 在 `cleanupNotices()` 之后 `unbindMobileViewport()`。
4. `tests/core/viewport.test.ts` —— jsdom 行为测试（上游无本模块专属测试，本地自写）：
   - `syncMobileViewport`：有 visualViewport 时写 round 后的 px 值；无则回落 innerHeight；高度 `<120px` 的异常帧忽略（变量保持旧值）；无 window/document 环境安全 no-op。
   - `bindMobileViewport`：幂等（重复绑定返回同一解绑器、监听不叠加）；resize/scroll 触发重算。
   - `unbindMobileViewport`：清变量、解绑后再 bind 可重挂。
   - 导出面与上游一致（`VVH_VAR`/`syncMobileViewport`/`bindMobileViewport`/`unbindMobileViewport`/`isViewportBound`）。

## 验收

- [ ] `src/core/viewport.ts` 落位，导出面与上游一致
- [ ] core 样式源头含 `--bz-vvh` 基线块（构建聚合可查）
- [ ] main.ts 三处接线；onunload 解绑；`core/mobile.ts` 零改动
- [ ] 新增测试全绿；smoke 的 `EXPECTED_COMMAND_IDS` 无需变更（无新命令）
- [ ] 门禁全绿：全量测试 + `node node_modules/typescript/bin/tsc --noEmit` + 构建
- [ ] 提交只含本块文件（`src/core/viewport.ts`、`src/core/styles.css`、`src/main.ts`、`tests/core/viewport.test.ts`）

## 提交注意（工作区混有 257 待基线的用户改动）

`src/main.ts` 工作区混有用户未提交改动（diary/daily 导入与一条命令名，位于 62~68 / 93~99 行，与本块三个接线点不重叠）。提交时暂存区用「HEAD 版本 + 仅本块编辑」构造（`git hash-object` + `git update-index --cacheinfo`），不夹带用户两处 hunk。
