# ADR-0125：留档目录（`CONFIG/.CORRUPT`）读写一律走 adapter

## 背景

用户 2026-09-14 控制台每次写 JSON 都刷一条：

```
[storage] CONFIG/STORAGE/literature.json 写前留底失败（不影响本次写入） Error: File already exists.
```

`CONFIG/.CORRUPT` 是**点开头目录**，Obsidian 不把它收进 vault 文件索引 → `vault.getAbstractFileByPath()`
对它恒返回 `null`，而文件在盘上真实存在。已上盘验证：
`N:\仓库\仓库-新\-0.笔记汇总库\CONFIG\.CORRUPT\literature.json-prev.bak` 物理存在。

`src/core/storage.ts` 里同一根因共三处：

| 位置 | 表现 |
|---|---|
| `rotatePrevBackup` 判存+落盘 | 判存恒「不存在」→ 每次都走 `vault.create` 分支 → 撞已存在文件抛 `File already exists` → 被 catch 成告警。**留底永不更新**，且每次写都刷一条 |
| `backupOriginal` 建目录 | `getAbstractFileByPath(CORRUPT_BACKUP_DIR)` 恒 null → 每次都试 `createFolder`，靠空 `catch {}` 吞掉 |
| `backupOriginal` 同秒撞名循环 | `for (… getAbstractFileByPath(backupPath) …)` 恒 null → 判重失效 → 同秒第二次留档 `create` 抛错 → 返回 `null`，**留档静默丢失** |

## 影响面（决定这票的优先级）

- ✅ **数据无损**：正式写入走 `CONFIG/STORAGE/`（普通目录，索引正常），`modifyWithBackup` 不受影响
- ⚠️ 日志噪音：每个 JSON 域每写一次刷一条
- ❌ **可靠性契约退化**：`-prev.bak` 永远停在首次写前内容、此后不再更新——「写坏了有上一版可手工回滚」这个承诺实际是假的；同秒撞名场景下留档直接丢
- 影响**所有 JSON 域**（`core/storage.ts` 共用），非 literature 特有

## 决策

**点前缀目录的判存/读/写一律走 `app.vault.adapter`。**

新增两个内部工具：

- `corruptAdapter(app)`：取 `app.vault.adapter`，缺 `exists`/`write` 时返回 `null`（纯数据层替身环境）；
- `ensureCorruptDir(app)`：`adapter.exists` 判存 + `adapter.mkdir` 递归建（仓内既有惯例见 `src/encrypt/data.ts` 注释「adapter.mkdir 递归建，点前缀可用」）。

改造两处：

- `rotatePrevBackup`：`adapter.write(bakPath, cur)` **覆盖写**取代「存在则 `modify` / 不存在则 `create`」两条分支——一个 API 覆盖两种情形，顺带消掉判存这一步。
- `backupOriginal`：建目录、同秒判重循环（`await adapter.exists`）、落盘全走 adapter；**源文件读取口径不变**（源路径在普通目录，`vault.read` 保持）。

`adapter` 不可得时留底**静默跳过**（返回/提前 return），写入流程照常——与既有「留底失败不阻塞本次写入」一致。

返回语义、通知文案、去重窗口、`onCorrupt` 口径全部不变。

## 后果

- `-prev.bak` 恢复「每次写前轮换更新」语义，回滚承诺重新成立；同秒多条留档不再丢。
- 每个域的写盘路径不再刷告警。
- 留底目录的读写通道与 `CONFIG/.ENCRYPT` 对齐，core 层不再有一处「点目录用 vault API」的例外。

## 风险与缓解

- **adapter 缺失的替身环境**：留底会被跳过（以前至少尝试过）。真实 Obsidian 必有 adapter，且留底本身是尽力而为的兜底，可接受。
- **`adapter.write` 是否自动建父目录**：Obsidian 的 `adapter.write` 不保证建目录，故落盘前显式 `ensureCorruptDir`；建目录失败由落盘报错走既有 `catch` → 返回 `null`，不改变调用方语义。
- **为什么此前测试没抓出来**：`tests/mock-vault.ts` 的 `getAbstractFileByPath` **能**看见点目录、`create` 是**静默覆盖写**——两条都比真实 Obsidian 宽松，把 bug 完全掩盖了。本次未改 MockVault 通用语义（会波及全仓既有测试），而是在用例内局部模拟真实行为的这两条：索引对点目录打盲 + `create` 撞已存在抛错。**已验证这两条新用例在改动前的实现上必然失败**（留底停在第 1 版 / 同秒留档只剩 1 个）。

## 备选（未采纳）

- **把留档目录改成非点目录**：会出现在用户文件树里，且历史留档全部失联（`checkup` 的留档路径提示也会变）。
- **改 `MockVault` 让索引对点目录不可见**：更贴近真实，但会波及全仓既有断言（多个域测的留档用例都按「能看见」写），超出本票范围。
- **继续靠空 `catch` 忽略**：现状即此，代价是留底功能长期失效 + 噪音，属于把已知缺陷当配置冻结，不可接受。
