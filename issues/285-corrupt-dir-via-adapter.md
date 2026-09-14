# 票 285：core 留底对点目录改走 adapter（`CONFIG/.CORRUPT`）

- 状态：已交付（2026-09-14）
- 关联：ADR-0125（本票新落）、ADR-0116（空读防护，同属 D1 可靠写契约）
- 起因：用户控制台刷屏 `[storage] CONFIG/STORAGE/literature.json 写前留底失败（不影响本次写入）Error: File already exists.`

## 成因（已实证）

`CONFIG/.CORRUPT` 是**点开头目录**，Obsidian 不把它收进 vault 文件索引 → `vault.getAbstractFileByPath()` 恒返回
`null`，而文件在盘上真实存在。`rotatePrevBackup`（`src/core/storage.ts:320-338`）据此判「不存在」走 `vault.create`
分支 → 抛 `File already exists` → 被 `catch` 成 `console.warn`。

已上盘验证：`N:\仓库\仓库-新\-0.笔记汇总库\CONFIG\.CORRUPT\literature.json-prev.bak` 物理存在。

同一根因另有两处：

| 位置 | 表现 |
|---|---|
| `storage.ts:328-332` 建目录 | `getAbstractFileByPath(CORRUPT_BACKUP_DIR)` 恒 null → 每次都试 `createFolder`，靠 `catch {}` 吞掉 |
| `storage.ts:186-188` 同秒撞名循环 | `for (…getAbstractFileByPath(backupPath)…)` 恒 null → 判重失效，同秒第二次留档直接 `create` 抛错 → `backupOriginal` 返回 null（**留档静默丢失**） |

## 影响面

- ✅ **数据无损**：正式写入走 `CONFIG/STORAGE/`（普通目录，索引正常），`modifyWithBackup` 不受影响
- ⚠️ 日志噪音：每次写刷一条 warn
- ❌ **功能退化**：`-prev.bak` 永远停在首次写前内容、此后不再更新，「写坏了有上一版可回滚」承诺实际失效；同秒留档丢失
- 波及**所有 JSON 域**（`core/storage.ts` 共用），非 literature 特有

## 落地清单

### 代码

- `src/core/storage.ts`
  - 新增 `corruptAdapter(app)`：取 `app.vault.adapter`（点前缀目录的唯一合法通道，仓内既有惯例见 `src/encrypt/data.ts:439`）
  - 新增 `ensureCorruptDir(app)`：`adapter.exists` 判存 + `adapter.mkdir` 递归建
  - `rotatePrevBackup`：`adapter.exists/read/write` 取代 `getAbstractFileByPath/modify/create`
  - `backupOriginal`：留档目录建目录 + 判重循环 + 落盘全改走 adapter；**源文件读取口径不变**（源路径是普通目录，`vault.read` 保持不变）
  - 返回语义、通知文案、去重窗口一律不变

### 文档与测试

- `docs/adr/0125-corrupt-dir-via-adapter.md`（新）
- `CONTEXT.md`、`PROGRESS.md` 同步
- `tests/core/storage-reliability.test.ts`：新增 describe「点目录留底（ticket 285：索引对 CONFIG/.CORRUPT 不可见）」
  - 模拟真实 Obsidian：`getAbstractFileByPath` 对 `CONFIG/.CORRUPT/**` 返回 null（盘上文件仍在 adapter 里）
  - 用例 1：连写两次 → `-prev.bak` 第二次被**覆盖更新**为上一版内容，且**无 console.warn**
  - 用例 2：预置同秒留档 → `backupOriginal` 判重退到 `-2.bak`（不抛错、不丢档）
  - 既有两例「留档失败」「留底失败」的 mock 通道由 `vault.create` 改为 `vault.adapter.write`（拦截点随实现迁移；只改 `getAbstractFileByPath` 而不改拦截点会因 `MockVault.create` 静默覆盖而假过）
- `tests/core/json-store.test.ts`：`P1-32 留档失败` 同上改拦截 `adapter.write`（不改则留档意外成功，断言 `.CORRUPT` 为空会失败）

## 验收

- `node node_modules/typescript/bin/tsc --noEmit` → 0 错
- 全量 `vitest run` → 290 文件 / 4582 例全绿
- 回归有效性自证：临时把 `storage.ts` 换回 HEAD 版，新用例如期失败（证明用例真的拦得住旧 bug），再还原
- 构建验证通过（production）+ 部署至 vault 插件目录

## 有意不做

- 不改 `CONFIG/.CORRUPT` 这个目录名/位置（既有留档契约，改则历史留档失联）
- 不动 `MockVault.getAbstractFileByPath` 的通用语义（会波及全仓既有测试；本票在用例内局部模拟真实行为）
