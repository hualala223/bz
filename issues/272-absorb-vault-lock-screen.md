# issue-272：保险库吸收（B11：锁屏统计落盘 + 统一锁屏只接保险库侧）

- 日期：2026-09-13 ｜ 分支：wt-vault（worktree 隔离）→ master
- 上游来源：`issues/300-lock-stats-persist.md`、`docs/adr/ADR-0124-shared-lock-screen.md`、`issues/299-encrypt-prototype-shell.md`（票 266 总览 ◆6 / B11）
- 红线裁剪：ADR-0124 上游锁屏为 encrypt + password-vault + **diary** 三域共用 → **只接保险库侧**，日记档不接（ADR-0121）

## 一句话结论

保险库（encrypt）接入上游共享解锁屏（`core/ui/lock-screen`）+ 锁屏统计明文落盘（`core/lock-stats` → `CONFIG/STORAGE/lock-stats.json`），**日记/回忆墙的解锁路径原样冻结**（`ensureSafeUnlocked` 显式走旧弹窗 legacy 分支）；上游 299 的评审壳与面板评审改动不吸。

## 吸收改动（7 项）

| # | 改动 | 落点 |
|---|---|---|
| 1 | 锁屏统计明文落盘（ADR-0124 决策 4 修订）：段级合并写 `CONFIG/STORAGE/lock-stats.json`；读失败/缺档回落「—」不编造数字 | `src/core/lock-stats.ts` 新建（照搬上游，`readLockStats`/`writeLockStats`） |
| 2 | 共享解锁屏组件：印章徽 + 标题 + 副题 + 统计卡 + 主密码 + 主按钮 + 安全提示行；`inline` 双模式 | `src/core/ui/lock-screen.ts` 新建（照搬上游） |
| 3 | 解锁屏样式（`.bz-lockscreen*` 系列，作用域 `.bz-lockscreen--<kind>`） | `src/core/ui/components.css` 尾部追加 202 行；`src/encrypt/styles.css` 尾部追加 9 行 |
| 4 | `showPasswordDialog(kind: 'vault' \| 'legacy' = 'vault')` 调度器：默认走新解锁屏（首设标题「设置主密码」/已有清单「保险库已上锁」）；`'legacy'` 走旧弹窗（**结构/类名/文案一字未动**，日记/回忆墙复用路径冻结） | `src/encrypt/ui.ts`（旧 `showPasswordDialog` 方法体整体改名为私有 `showLegacyPasswordDialog`） |
| 5 | `showVaultLockScreen` 新解锁屏实例：统计快照（会话缓存 → 冷启动回落 lock-stats.json → 兜底「—」）、首设双输入 + 风险勾选 + **至少 4 位**（上游 E18，与密码本同规则；此前加密侧无下限）、冷却节流/损坏清单重设确认/自愈回滚提示全保留；无「取消」按钮（点遮罩/ESC 取消，ADR-0124 决策 5） | `src/encrypt/ui.ts` |
| 6 | 解锁态 `renderAll` 快照：`captureLockStats()` 只算保险库一档（口径与 overviewStats 一致：`diary-entry`/`password-vault` 不计入），会话缓存 + `writeLockStats` fire-and-forget 落盘 | `src/encrypt/ui.ts` |
| 7 | `ensureSafeUnlocked()`（日记/回忆墙复用）显式传 `'legacy'`，注释写明红线依据 | `src/encrypt/index.ts` |

## 明确不吸（上游 299 其余部分）

| 项 | 理由 |
|---|---|
| `prototypes/encrypt/` 评审壳 + `BEHAVIOR_DOMAINS` 登记 | 本地无 prototypes 评审体系，纯上游开发工具链 |
| preview-live 热重载修复 | 同上，上游工具链 |
| mock 假层 `rename` 源不存在 no-op | 本地 `tests/mock-vault.ts` **已具备**（adapter.rename 的 `if (v !== undefined)` 与 vault.rename 的 `if (!this.files.has(old)) return`） |
| 面板评审两轮（删顶栏三按钮/副标题/三点菜单、搜索框下移 keepHead、概览跨栏、「加密笔记」→「笔记」文案） | encrypt 面板 UI/交互大改；本地面板自有形态，属交互变更，按票 271 同类裁剪纪律不吸（如需可单独立票拍板） |
| password-vault 独立锁屏档 | 本地密码本已并入保险库面板（ADR-0085），无独立锁屏 |

## 本地保留

- 旧主密码弹窗 `.bz-encrypt-dialog-*` 结构、类名、文案、按钮**一字未动**（红线复用路径）。
- 节流/损坏重设/自愈回滚/首设写盘失败收场等既有行为语义全保留（仅换壳）。
- `resolveCinemaFolderPath` 式跨域收敛未引入；`src/settings.ts` 未动（无新增设置键）。

## 测试改动（3 改 + 2 新增，净增 +9 例）

| 文件 | 改动 |
|---|---|
| `tests/core/lock-stats.test.ts` | 新建 4 例（照搬上游：无文件 null / 写读回 / 段级合并 / 损坏 null） |
| `tests/encrypt/lock-screen.test.ts` | 新建 5 例：默认走新屏（统计卡×3 + 首设双输入 + 点遮罩取消）/ `'legacy'` 弹旧弹窗 / 首设 ≥4 位 / 冷启动回落 lock-stats 快照 / 解锁态 renderAll 落盘（diary-entry 不计入） |
| `tests/encrypt/ui.test.ts` | 14 例适配新屏选择器：`findDialog()` 双路径（旧 mask 优先）+ `findConfirmBtn`/`findAckInput` helper；标题断言「输入主密码」→「保险库已上锁」；「取消」按钮 → 点遮罩（新屏无取消钮）；首设密码 'pw1'(3位)/'pw'(2位) → 'pw12'/'pw1234'（**新屏 E18 ≥4 位校验会拦截短密码导致 unlock 永不发生 → 用例超时**，这是本轮排障核心） |
| `tests/encrypt/ui-cov.test.ts` | 6 例同法适配 |
| `tests/encrypt/enh-ui.test.ts` | 2 例选择器直改新屏（`.bz-lockscreen--mask` / `.bz-lockscreen-input` / `.bz-lockscreen-action`） |

## 门禁（全绿）

- `tsc --noEmit` 0 错
- encrypt + core 域：45 文件 / 732 例全绿（改前 22 例失败 → 0）
- 全量：**282 文件 / 4465 例全绿**（票 271 后基线 280/4456 → +2 文件/+9 例，与新测试数吻合）
- production 构建通过；产物抽查命中「保险库已上锁」「lock-stats.json」「主密码至少 4 位」「我已了解：主密码无法找回」（`bz-lockscreen--vault` 字面量不命中系模板串拼接，正常）；构建产物（main.js/styles.css/7 个 prototype-render.js）已还原未提交

## 冻结域零接触核查

改动全集 = `src/core/ui/{components.css,lock-screen.ts}` + `src/core/lock-stats.ts` + `src/encrypt/*`（3 文件）+ `tests/encrypt/*`（3 改 1 新）+ `tests/core/lock-stats.test.ts`，共 11 文件。`src/diary/*`、`src/review/*`、`src/recap/*`、`src/smartcat/*`、`src/settings.ts` 全部未动；日记/回忆墙解锁走 `ensureSafeUnlocked → 'legacy'`，UI 零变化。

## 排障记录（复用价值）

1. **新屏 E18 长度校验 × 测试短密码 = 用例 20s 超时**：首设分支密码 <4 位被「主密码至少 4 位」拦截 → `unlock` 永不发生 → `await p` 永挂。表现为 Test timed out 而非断言失败，易误判为死锁。诊断手段：一次性 diag 用例逐步 console 打印 `err text`（看到「主密码至少 4 位」即定位）。
2. **补丁脚本顺序坑**：helper 函数体内含待替换子串（`findAckInput` 函数体含 `.bz-encrypt-dialog-ack input`）时，正文替换必须**先于** helper 块插入，否则计数断言多 1 且全局替换会破坏 helper。
3. 测试适配三件套：`findDialog()` 双路径、`findConfirmBtn`（「确认」或 `.bz-lockscreen-action`）、`findAckInput`（旧 ack 或 `.bz-lockscreen-ack input`）——后续若第二大脑等域接锁屏可直接复用。
