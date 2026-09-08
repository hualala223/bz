# ticket 173：第二大脑正文指纹索引——挪动/改 YAML 不重嵌

## 背景

用户实际观察到：文档在白名单内从 A 文件夹挪到 B 文件夹后被整篇重新向量化。根因：增量索引判定 =「meta 无该路径条目 ∨ mtime 变」，meta 键是路径，挪动即重嵌；同理改 frontmatter（不进 embedding 文本）也触发重嵌。经 grill-with-docs 四问拍板（Q1 观察到的现象 / Q2 要改 / Q3 迁移式升级 / Q4 落 ADR）。

## 方案（ADR-0078）

- `NoteEntry` 新增可选 `hash`（对已存 chunks 文本拼接的 FNV-1a），meta version 9 → 10。
- 三层判定：mtime 未变 → 跳过；mtime 变 + 指纹同 → 仅更新 mtime；指纹变 → 重嵌。
- 挪动：孤儿池（单轮 refresh 内存活）指纹匹配 → 继承 chunks 与向量、迁移登记键，不调 Ollama；未命中照常清理。
- v9→v10 迁移在 load() 就地补指纹（从 chunks 现算），零读盘零重嵌；version < 9 才清库重建。
- 重复笔记同指纹孤儿任取其一迁移，其余清理。

## 验收

- [x] 挪动文件夹后 refresh：新路径继承旧向量与 chunks，无嵌入调用，旧条目删除。
- [x] 仅改 frontmatter（正文不动）refresh：不重嵌，mtime 登记更新。
- [x] 改正文 refresh：整篇重嵌（既有契约不变）。
- [x] v9 存量 load 后就地升 v10 补指纹，.vec 不动、不重嵌。
- [x] 同指纹孤儿多个时迁移一个、其余清理。
- [x] 失败续传/断点暂存/删除清理等既有契约回归全绿。
- [x] pnpm test + tsc --noEmit + build 全绿。

## 交付

- ADR-0078 + CONTEXT.md「正文指纹」词条。
- `src/secondbrain/chunk.ts` hashChunks；`src/secondbrain/vector-store.ts` 三层判定 + 孤儿迁移 + v10 迁移。
- `tests/secondbrain/vector-store.test.ts` 更新 + 新增用例。
