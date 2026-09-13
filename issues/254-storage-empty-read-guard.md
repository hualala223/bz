# Issue 254: 存储层空读防护 + review 数据写加固（P1-33 / ADR-0116）

## 背景

2026-09-11 review.json 清库事故（详见 ADR-0116）：N 盘偶发空读 + 解析失败不区分「读抖动/真损坏」直接重建默认值 → 7925 条复习记录被 `[]` 覆盖；抢救后顺带查明 review 域两个伴生缺陷（裸读改写并发互覆、运行时字段全量写回膨胀至 ~4.9MB）。

## 决策（ADR-0116）

### core/storage.ts
- [x] read：空内容/解析失败重试 3 次（150ms 间隔）
- [x] 重试耗尽分流：空内容 → 抛错 + warning toast（30s 去重），**不动盘上文件**；非空解析失败 → 既有留档+重建语义不变
- [x] write：modify 前 `CONFIG/.CORRUPT/<名>-prev.bak` 写前留底（覆盖式单份；失败不阻塞；首建不留底）

### review/data.ts
- [x] saveItems 剥离运行时字段（file/isMissing/isCompleted/isOverdue/currentStage/totalStages），未知旧字段保留
- [x] addItem / updateItem / removeItem / restoreItem / updateFilePath 整体入 `enqueueFileTask` 串行队列

## 测试

- [x] `tests/core/storage-reliability.test.ts` +6：空读自愈 / 空读耗尽不动盘 / 半截读自愈 / 留底轮换 / 首建不留底 / 留底失败不阻塞
- [x] `tests/review/data.test.ts` +3：运行时字段不落盘 / 并发 updateItem 不丢写 / 接回与评级并发不回写旧路径

## 门禁

- [x] `tsc --noEmit` 0 错
- [x] 全量 vitest 全绿
- [x] `pnpm run build` 构建部署通过（vault 插件目录产物含新逻辑）

## 备注

- 环境级根治（Syncthing 单写者 / `.stignore` 排除 `CONFIG/STORAGE`）属用户侧决策，代码防护只兜单机 I/O 抖动。
- `.prev.bak` 留底文件会新增到 `CONFIG/.CORRUPT/`，数据体检「留档对账」检查天然兼容（该目录本就是巡检对象）。

## 追记（同日晚）：逾期常驻通知冻结「1 篇」三连修

部署后用户实测常驻 toast 钉死在「有 1 篇笔记逾期」（引擎实时计算 24 篇正确）。根因链：
1. **首查早于索引就绪**：固定 2s 首查在网络盘上早于 metadataCache 建完索引，全库文件瞬时皆「挂起」，首查拿到偏小逾期快照（挪动兜底也空手而归——Console 实锤「挂起 23，接回 0」）。
2. **通知只由 newly diff 触发**：偏小快照进 `_notifiedOverdue` 后，后续轮询若触发路径异常则永不重发，常驻通知把错误数字钉死。
3. **染色与通知同 try 块**：染色环节任何异常会吞掉同轮通知重发。

修复（review/index.ts + review/app.ts）：
- [x] 首查/兜底收敛改等索引就绪：监听 `metadataCache resolved` + 15s 兜底超时，幂等触发（挪动兜底一并挪入）
- [x] 通知数字自纠：新增 `_lastOverdueCount`，逾期篇数与上次展示不同即重发（不依赖 newly）
- [x] 染色解耦：移到通知之后、独立 try/catch，染色异常不再阻断逾期通知
- [x] 测试：index.test.ts 首查时序断言更新 + 新增 resolved 先到用例；本组 beforeEach 补 `vi.restoreAllMocks()`（reviewApp 单例 spy 历史跨用例泄漏）；假定时器用例 try/finally 防泄漏级联
