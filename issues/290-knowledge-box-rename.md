# 票 290：知识盒正名（literature → knowledge）

## 需求

用户：「如果知识盒的原名是文献盒，那你就给我改成知识盒。」

预检关键事实（2026-09-14）：上游 knowledge 域已完成 ADR-0112（上游编号）三部重构，与本地 literature 归一化后仍差千行级（ui.ts +724/−838、styles.css +930/−780），且本地持有上游没有的 ticket 284 能力（b23.tv 短链→BV 解析、内联链接提取）。用户拍板：**Q1(a) 纯改名、功能一字不动，不吸三部重构**；Q2(a) 无外部裸调用，不留旧 id 别名。

## 决策

ADR-0126。骨架全改名 + 数据一次性迁移（knowledge.json / knowledgeDirectory），vault 文件夹「文献盒」与「文献笔记」术语不动，存量行为流条目走兼容别名。

## 改动清单

- 目录/文件：`src/literature`→`src/knowledge`、`tests/literature`→`tests/knowledge`、`src/smartcat/literature-source.ts`→`knowledge-source.ts`
- 命令 id：`bz-literature-open/note-term/note-video` → `bz-knowledge-*`（main.ts + smoke EXPECTED_COMMAND_IDS，条数仍 72）
- 设置键：`literature*` 16 键 → `knowledge*`；main.ts onload 一次性平移 `literatureDirectory` 值并删旧键
- 数据：`KnowledgeData.migrateLegacy`（literature.json → knowledge.json 原样复制，D3 WHITELIST 豁免注明理由）
- 域事件/实体：`literature:tasks`、`literature:file-*` → `knowledge:*`；entityType `knowledge`；behavior-wording/memory/dashboard/behavior-timeline 保留 `literature` 兼容别名与 case 分支
- home：域卡 id `knowledge`、命令引用改名；补挂「视频生成文献笔记」菜单项（票 289 已有命令，票 288 注记作废）
- 文档：AGENTS.md 领域清单与命令数口径、CONTEXT.md 术语与映射表、ADR-0126、PROGRESS.md
- 全局替换 1315 处（src+tests），例外修正 13 处（文件夹默认值恢复「文献盒」等）

## 门禁

- tsc --noEmit：0 错
- vitest 全量：待跑（见 PROGRESS）
- esbuild production：待跑
