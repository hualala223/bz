# 票 307 — 小橘「禁止读取目录」多选 +「读取笔记库」开关

**日期**：2026-09-25　**域**：smartcat　**状态**：已交付

## 需求

用户提出：在小橘的设置页面可以自行增加禁止小橘读取的文件夹（可多选，不是后台代码写死），首要用例是禁止读取日记目录；再加上小橘的读取开关；其他小橘功能保持与上游仓库（yeshimei/bz）一致。背景：上游无同类实现（基线 7b06f4b4 盘点，仅 review 域 `reviewExcludedNotes` 不相干）；既有「日记隐私门」（ADR-0100/0106）只拦 memory 层落流——记忆目录流的 `upsertNoteMemory` 不经隐私门，配置了任意记忆目录后日记目录即被整体拆条入库（`classifyForMemory` 日记分支优先），内容照样可达。

## 决策（ADR-0134）

| 问题 | 备选 | 拍板 |
|---|---|---|
| Q1 拦截层级 | (a) 入库口（upsertNoteMemory 加门）/(b) 读取入口（内容根本不读） | **(b)**：结算链「读完即弃」也算读；引用条目 prompt 时经 refResolver 当场读文件，入库口拦不住 |
| Q2 存量引用 | 保留衰减 / 变更即清 | **变更即清**（tracked 回删 + dropExcludedRefs listRefPaths 全量扫 + init 跨会话自愈）；旧引用会把内容带回对话，禁止形同虚设 |
| Q3 开关关闭语义 | 只断新增 / 清空笔记记忆库 | **清空（wipeAll）**：引用是文件派生数据，重开重扫重建，清空可逆；理由同 Q2 |

## 实现

- `src/smartcat/config.ts`：`isPathExcluded(path, dirs)` 纯函数（前缀语义对齐 `resolveOwnerDir`，`''`=库根全禁，反斜杠归一）
- `src/settings.ts`：`smartcatExcludedDirectories: string[]` 键（默认 `[]`，与 `memoryDirectories` 相邻）
- `src/smartcat/index.ts`：`readBlocked` 助手 + 各读取入口短路——`handleDiaryVaultActivity`/`handleNoteVaultActivity`（活动入口）、`settleDiaryEntry`/`settleNoteFile`（挂起计时器到期清计时即弃）、`onVaultDelete`/`onVaultRename`（新路径被禁=移出观察目录删除语义，旧路径被禁=从未跟踪）、`completePendingNewsSave`、`generateBookReview`、`buildDiaryBaseline`/`buildNoteBaseline`；`ensureNoteMemorySync` 注入 `getExcluded`；`wipeNoteMemoryRefsDirect` 兜底直清；schema 注入 `onNoteSourceChanged`（关→拆同步器+`wipeAll`，开→重建补扫）与 `onExcludedDirectoriesChanged`（→`syncDirectories` 回删+补扫跳过）
- `src/smartcat/note-memory.ts`：`NoteMemoryDeps.getExcluded?`；`blocked` 判定入 `seedsFor`（不触 readFile）/`onModified`/`onRenamed`/`syncDirectories`；新增 `dropExcludedRefs()`（init/syncDirectories 双挂点）、`wipeAll()`；`dropTrackedState` 抽出复用
- `src/smartcat/ui.ts`：「记忆目录」组加「读取笔记库」toggle（`bindConfig('noteSource')`，ADR-0024 键首次暴露 UI；文案过 ticket 131 lint）+「禁止读取目录」custom 多选行（`renderPathSettingRow`）；schema 与弹窗两层 opts 各加两回调
- 通知/命令零新增（无命令注册变化，smoke 口径不动）

## 测试

- `tests/smartcat/excluded-dirs.test.ts`（node 纯数据层）：`isPathExcluded` 命中语义 2 例；NoteMemorySync 5 例——init 跳过禁止目录（不读不入库）、日记目录禁止前后对照（零读取）、syncDirectories 变更回删（tracked + listRefPaths 存量含日记段定位符）、onModified 禁止后不读且回删、onRenamed 移入禁止只删不建、wipeAll 全清
- `tests/smartcat/excluded-dirs-ui.test.ts`（UI 层）：禁止行空态/已选 chips ✕ 写回+回调 2 例；读取笔记库 toggle 翻转写 config + 回调 1 例（mock Toggle 经 trigger 驱动，断言前等一拍宏任务——schema 侧 onChange 在 await persist 之后）
- 门禁：tsc --noEmit 0 错；smartcat 域 53 文件 874 例全绿；全量 **274 文件 3963 例全绿**（含 settings-copy-lint-c 文案 lint）；`pnpm run build` 构建+部署通过（vault 产物 + 根三件套）
