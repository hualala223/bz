# 297: 娱乐域改版收尾（文档同步 + 全量门禁）

**What to build:** 改版收尾清点——AGENTS.md 领域清单/命令数口径、PROGRESS.md 进度、票 291 与各子票勾验；全量测试 + tsc --noEmit + esbuild production 三门禁全绿；构建产物按仓库约定处理（vault 产物直出，根目录三件套构建生成、不提交）。

**Blocked by:** 295、296

**Status:** ready-for-agent

- [x] AGENTS.md：领域清单「影院」行改「娱乐」、命令数口径 72→73 及核算说明更新
- [x] PROGRESS.md 追加票 292–296 记录；票 291–296 勾验
- [x] tsc --noEmit 0 错；vitest 全量绿（数字以输出为准）；esbuild production 通过
- [x] 构建产物还原检查：不把 main.js/styles.css/prototype-render.js 混入提交
