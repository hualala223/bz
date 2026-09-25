# ADR-0134 — 小橘「禁止读取目录」+「读取笔记库」开关：读取入口级隐私拦截

**日期**：2026-09-25　**票**：307　**状态**：已采纳

## 背景

小橘的信息来源不止「记忆目录」（ADR-0069）：固定目录观察链（日记/卡片盒/现代诗/信）、剪藏补全、书评、域 JSON 感知、记忆目录流各有入口。用户要求：**在 ⚙️ 小橘设置页可自行多选「禁止小橘读取的文件夹」**（首要用例：禁读日记目录），并暴露笔记读取的总开关；其余小橘行为保持与上游（yeshimei/bz）一致——经盘点上游基线（7b06f4b4）无同类实现（仅 review 域 `reviewExcludedNotes`，不相干），本地按既有风格实现。

既有「日记隐私门」（`diaryPrivacyGuard`，ADR-0100/0106）拦在 memory 层（`addObservation` 豁免 diary 来源），两个缺口：① 只断「落流」，结算链仍读文件正文（读完即弃）；② **记忆目录流的 `upsertNoteMemory` 不经隐私门**——只要配置了任意记忆目录，日记目录即被整体按时间段拆条入库（`classifyForMemory` 日记分支优先于目录归属），日记内容照样可达。

## 决策

**拦在读取入口，而非入库口**：命中禁止清单的路径，文件内容根本不被读取。

1. **数据**：根设置键 `smartcatExcludedDirectories: string[]`（默认 `[]`，与 `memoryDirectories` 同居 data.json）；纯函数 `isPathExcluded(path, dirs)`（smartcat/config.ts，前缀语义对齐 `resolveOwnerDir`，`''`=库根全禁，反斜杠归一）。
2. **读取闸门（index.ts `readBlocked`，各入口逐一短路）**：日记/卡片盒/现代诗/信的活动入口与结算函数（挂起计时器到期也不读，清计时即弃）、删除/重命名观察（新路径被禁沿用「移出观察目录」删除语义，旧路径被禁视为从未跟踪）、剪藏补全、书评（当前笔记命中即不读不评）、两条重启基线（不读不建快照）。
3. **记忆目录同步器（note-memory.ts）**：`getExcluded` 依赖注入；`seedsFor` 命中即空（不触 `readFile`）、`onModified` 命中即回删、`onRenamed` 移入禁止目录只删不建、`syncDirectories` 回删条件加命中判定；新增 `dropExcludedRefs()`（listRefPaths 全量枚举，定位符剥离后判定，跨会话存量一并回删）挂 `init`/`syncDirectories` 双挂点（设置变更当场清 + 重启自愈）。
4. **「读取笔记库」开关**：`config.noteSource`（ADR-0024 键）首次暴露 UI。关闭 = 既有 noteSource 守卫当场生效 + 拆同步器 + **清空笔记记忆库**（`wipeAll`：引用是文件的纯派生数据，重开后全量重扫重建，清空可逆；同步器未装配时直清 backend 兜底）。开启 = 重建同步器补扫。
5. **UI**：⚙️「记忆目录」组三行——「读取笔记库」（toggle，bindConfig noteSource）→「禁止读取目录」（custom 多选，`renderPathSettingRow`，与「记忆目录」行同控件）→「记忆目录」。文案过 ticket 131 lint。

**为什么清空笔记记忆库而非只断新增（开关关闭场景）**：入库引用会在 prompt 检索时经 refResolver 当场读文件——只断新增则旧引用照样把内容带回对话，与「不读取」语义矛盾；派生数据可重建，清空无损失。禁止目录同理必须清存量，否则禁止形同虚设。

## 后果

- 与日记隐私门互补分层：隐私门拦「落流」（观察豁免、存量不追溯），禁止目录拦「读取」（内容不可达 + 记忆库引用清理）；两层叠加，禁读日记时两条链都断。
- 写日记/闪念的活动级信号（信任成长、PAD 轻推）不拦——它们不读内容，与「禁止读取」语义不冲突。
- 域 JSON 感知（memo/番茄钟等）无文件夹语义，不在本机制范围；全局停读走「读取笔记库」开关。
- 上游吸收注意：`isPathExcluded`/`readBlocked`/`dropExcludedRefs`/`wipeAll` 与上游 smartcat 无对应物，后续上游移植批在 smartcat 域合并时需按 ADR-0121 冻结域口径处理。
