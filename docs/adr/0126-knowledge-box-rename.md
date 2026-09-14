# ADR-0126: 知识盒域正名（literature → knowledge，对齐上游命名）

日期：2026-09-14 ｜ 票：issues/290-knowledge-box-rename.md ｜ 状态：已接受

## 背景

knowledge 域（视频转文献 + 术语生成文献笔记）经历两次命名：上游 yeshimei/bz 在 ADR-0112（上游编号）把 knowledge 域整体正名「知识盒」（目录 `src/knowledge/`、命令 `bz-knowledge-*`、设置键 `knowledgeDirectory`、数据 `knowledge.json` + 一次性迁移）；本地在 ADR-0118 反向采用「文献盒」/literature 命名。两侧长期存在同构不同名的映射成本（home 行为流来源映射、smartcat 实体别名、上游吸收票的词形归一比对）。

用户裁决（票 290）：**本地正名回上游叫法「知识盒」**。

## 决策

1. **骨架全改名**：`src/literature/` → `src/knowledge/`；`tests/literature/` → `tests/knowledge/`；`src/smartcat/literature-source.ts` → `knowledge-source.ts`；命令 id `bz-literature-open/note-term/note-video` → `bz-knowledge-open/note-term/note-video`；设置键 `literature*` 16 键 → `knowledge*`；域事件通道 `literature:tasks`、`literature:file-*` → `knowledge:*`；DOM id `literature-*` → `knowledge-*`；CSS/导出符号同步（KnowledgeData/KnowledgeTask/openKnowledgePanel 等）。
2. **数据零丢失迁移（照上游 ADR-0112 范式）**：
   - `knowledge.json` 不存在而 `literature.json` 存在时**原样复制一份**（`KnowledgeData.migrateLegacy`，loadTasks 前置调用，只复制不改写，旧文件保留在原处；`vault.create` 经 D3 直写守门 WHITELIST 豁免并注明理由）。
   - 设置键 `literatureDirectory` 值在 onload 平移到 `knowledgeDirectory`（仅当旧键存在且新键仍为默认值时采纳，随后删旧键，随 `migrated` 旗标一次性落盘）。
3. **vault 文件夹名不变**：默认「文献盒」文件夹、`knowledgeDirectory` 默认值、`path-classify` 回退目录均保持 `'文献盒'`——改的是域名不是用户文件夹，改文件夹会断既有笔记路径。
4. **功能术语不动**：「文献笔记」「术语文献」「文献目录」等称谓保留（上游同口径：命令名「术语生成文献笔记/视频生成文献笔记」）。
5. **存量数据兼容别名（不迁移、只兼容）**：smartcat-behavior.json 旧条目 source/entity `'literature'`（与更早 `'bili'/'bili-downloader'`）经 behavior-wording 别名表、memory/dashboard 来源标签表、home 行为流 SOURCE_DOMAIN 与 `literature:term-generated/converted` case 分支继续命中「知识盒」文案。
6. **不吸收上游 ADR-0112 三部重构 UI**：本票仅正名。上游三部重构（部壹文献/部贰卡片/部叁主题，移除领域筛选/搜索/双击/抽屉）与本域本地增强（ticket 284 短链解析、内联链接提取）差异达千行级，是否吸收另票决策。

## 后果

- 命令数不变（72）；`EXPECTED_COMMAND_IDS` 三条 id 同步改名。
- home.json 里钉选的 `literature` 卡 id 失效（同 library 先例：可在编辑模式重钉）。
- 上游未来对本域的改动可直接整域比对（不再需要 literature→knowledge 词形归一）。
- ADR-0118 的「本地命名优先」在本域被本 ADR 取代；其余域不受影响。
