# ADR-0116: 存储层空读防护 + review 数据写加固（P1-33）

日期：2026-09-11 ｜ 状态：已采纳

## 背景

2026-09-11 review.json 清库事故（7925 条复习记录一度被清成 2 字节 `[]`，经 git 快照抢救）暴露两条链路缺陷：

1. **读抖动被当成文件损坏**：N 盘映射盘（Syncthing 多端同步）偶发返回空内容或半截内容。`jsonFileStore.read` 对解析失败不做区分、不重试，直接走留档+重建默认值——**盘上原本完好的 4.9MB 数据被 `[]` 覆盖**。更早现场（`CONFIG/.CORRUPT` 目录根本不存在）说明还存在「句柄瞬时丢失 → 走缺失首建 → 覆盖写默认值」的变体。
2. **review 域读改写裸奔**：`ReviewDataManager` 五个变更方法（addItem/updateItem/removeItem/restoreItem/updateFilePath）都是裸「loadItems → 改 → saveItems」，不走 D1 原语 1 的 `enqueueFileTask` 串行队列——挪动兜底接回与复习评级并发时，后写者用旧基线覆盖先写者（实测发生：接回结果被评级写回盖掉）。同时 `saveItems` 把 `loadItems` 现算的运行时字段（isMissing/isCompleted/isOverdue/currentStage/totalStages/file）全量写回，review.json 无限膨胀（~512KB → ~4.9MB），每次评级在 N 盘全量重写 4.9MB，进一步放大读改写窗口。

## 决策

### core/storage.ts（读重试 + 空读防护 + 写前留底）

1. **读重试**：`read` 对空内容/解析失败最多尝试 `READ_MAX_ATTEMPTS`（3）次，间隔 `READ_RETRY_DELAY_MS`（150ms）——专治映射盘/同步盘抖动。
2. **空读 ≠ 损坏**：重试耗尽后区分两种失败——
   - **空内容**（`raw.trim() === ''`）：疑似读层抖动而非文件损坏，**抛错且绝不改动盘上文件**（不走留档+重建，那正是清库路径），附 30s 去重的 warning toast；
   - **非空解析失败**：维持既有 P1-32/D1 原语 3 语义（留档 `.CORRUPT` → 重建默认值 → 通知），文件真损坏时自愈能力不回退。
3. **写前留底**：`write` 对已存在文件 modify 前，把盘上现内容轮换存为 `CONFIG/.CORRUPT/<名>-prev.bak`（每文件一份，覆盖式；连字符命名避免与 `<名>.<时间戳>.bak` 损坏留档的前缀断言混淆）。留底失败仅 console.warn，不阻塞写入。首建（原文件不存在）不留底。

### review/data.ts（运行时字段剥离 + 串行写）

1. **运行时字段黑名单剥离**：`saveItems` 落盘前删除 `file/isMissing/isCompleted/isOverdue/currentStage/totalStages` 六个运行时字段；白名单外的未知/旧字段（reviewStage 等）原样保留（铁律 1 兼容）。旧文件已混入的运行时字段在下一次保存时自然洗掉，无需迁移。
2. **五个变更方法整体入队**：`addItem` / `updateItem` / `removeItem` / `restoreItem` / `updateFilePath` 的「读→改→写」整体包进 `enqueueFileTask(getReviewFilePath(), …)`；`loadItems`/`saveItems` 保持不排队（队列不可重入，包内调用方防死锁），仅供排队任务内部组合使用。

## 理由与边界

- **宁可功能暂不可用，不可静默清库**：空读抛错会让域功能在 I/O 持续异常时报错，但盘上数据原样保留，用户可从 git / `.prev.bak` / 同步对端恢复——与「解析失败静默重置」的失效模式相比是正确取舍。
- **重试不能包治百病**：句柄瞬时丢失走「缺失首建」分支的变体仍可能发生（Obsidian adapter 层无从验证），`.prev.bak` 与 vault git 是最后一道兜底；根治需 I/O 层稳定（Syncthing 单写者 / 排除 `CONFIG/STORAGE` 同步属用户侧环境决策）。
- **膨胀剥离不影响旧数据可读**：剥离只发生在写侧，读侧兼容逻辑（reviewStage→stage 等）不变；新旧版本互读无障碍。
- **串行队列语义对齐既有契约**：review-fit 写入（ADR-0077）已走 `enqueueFileTask`，本次是 review.json 主文件补齐同一契约；段写原语（updateFileSections）不适用于数组形态的 review.json。

## 影响

- `src/core/storage.ts`：`READ_MAX_ATTEMPTS` / `READ_RETRY_DELAY_MS` / `notifyEmptyRead`（30s 去重）/ `rotatePrevBackup`；read/write 逻辑如上；文件头契约注释同步。
- `src/review/data.ts`：`RUNTIME_FIELDS` 常量；saveItems 剥离；五方法入队。
- 测试：`tests/core/storage-reliability.test.ts` +6 例（空读自愈 / 空读耗尽不动盘 / 半截读自愈 / 留底轮换 / 首建不留底 / 留底失败不阻塞）；`tests/review/data.test.ts` +3 例（运行时字段不落盘 / 并发评级不丢 / 接回与评级并发不回写旧路径）。
- 已知副作用：损坏留档类既有用例因重试各增加 ~300ms；`.prev.bak` 每数据文件新增一份留底文件（`CONFIG/.CORRUPT/` 内）。

## 追记（同日晚）：逾期通知链路「索引就绪门 + 数字自纠 + 染色解耦」

部署后实测常驻逾期 toast 钉死在启动瞬间的偏小快照（「有 1 篇」，实时引擎算 24 篇）。三处修复：

1. **首查等索引就绪**（review/index.ts）：固定 2s 首查在网络盘上早于 metadataCache 建完索引——彼时全库文件皆「路径失效」，首查拿到偏小逾期数、挪动兜底也接不回。v1 改为监听 `resolved` + 15s 兜底；实测（2026-09-11 19:38 复现「挂起 23/接回 0」）`resolved` 在 N 盘上仍可能早于 vault 文件扫描完成，v2 升级为**金丝雀门**：resolved/15s 触发后，再等「复习条目文件全部被索引命中 ∨ 索引 md 数连续两次采样稳定 ∨ 60s 硬兜底」才执行首查 + 60s 周期 + 挪动兜底收敛；等待期间被卸载则放弃（防卸载后补挂 interval），就绪耗时打 `[bz][review] 首查执行` 日志。
2. **通知数字自纠**（review/app.ts）：`checkOverdueAndNotify` 新增 `_lastOverdueCount` 基准——当前逾期篇数与上次展示不同即重发通知，不再仅依赖 newly diff（首查偏小快照进已通知集合后，旧语义永不重发、常驻通知钉死旧数字）。
3. **染色与通知解耦**：`applyReviewStyles` 移到通知逻辑之后并独立 try/catch——染色环节任何异常不再阻断同轮逾期通知（原来同处一个 try 块，染色抛错 = 整轮静默）。
