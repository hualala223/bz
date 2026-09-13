# 276 — 第二大脑「重建索引」命令登记

日期：2026-09-13 ｜ 类型：feat（吸收补全）｜ 状态：已交付
来源：用户对票 273 遗留项裁决「②重建索引跟我改动的功能没有关系吧？……跟索引没有关系吧？」——确认无关联后按上游补登记
关联：issue 273（遗留记录）、ticket 173/ADR-0078（本地向量指纹，本票不触碰）

## 与票 173 的关系（用户问询的确认）

**无关。** 两条路径互不依赖：
- 票 173 指纹（`vector-store.ts` v10）：管**自动增量索引**——打开面板时对有变更的笔记按 mtime+正文指纹判定「要不要重嵌」，挪文件夹不重嵌即走此机制；
- 重建索引（`rebuildSecondBrainIndex`）：**手动命令**触发的一次性清空全库重嵌（确认弹窗后执行），读取与写入都走既有 store 接口，不读不写指纹判定逻辑。
- 唯一交互点：重建后全库获得新基准哈希——这正是票 173 设计内的「重建索引区别于增量索引」既有语义（ticket 108 起），非新增行为。

## 交付内容

- `main.ts`：import 补 `rebuildSecondBrainIndex`（导出早已存在于 `secondbrain/index.ts`，票 273 起「导出闲置」）+ 注册命令 `bz-secondbrain-rebuild-index`（name: 重建索引，icon: refresh-cw，注册位置随上游排在 link-all 之后）。
- `tests/smoke.test.ts`：`EXPECTED_COMMAND_IDS` 补该 id。

## 冻结核查

- 改动全集 = `main.ts`（2 hunk）+ smoke 1 行 + 本票。第二大脑域源文件零改动。
- diary 系 / review 系 / AI 设置 / 小橘设置：零接触。
- main.ts 暂存版用 hash-object 构造（HEAD + 本票 hunk），用户在制 hunk 未入提交。

## 门禁

- [x] smoke + secondbrain 域：27 文件 349 例全绿
- [x] tsc --noEmit 0 错误
- [x] 全量 vitest + production 构建见 PROGRESS 收尾记录
