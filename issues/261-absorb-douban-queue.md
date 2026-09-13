# 261 · 吸收上游影院豆瓣抓取队列（主动模型）+ 退役本地海报 watcher（被动模型）

**上游来源**：`src/cinema/douban-queue.ts`（yeshimei/bz，ADR-0113 / issue 255 / 256 修订）
**分类**：B 类增量吸收（audit `上游差异审计.html` B 块「影院豆瓣队列」）
**裁决**：用户 Q(c)——只吸收主动队列，本地被动 watcher 一并退役（2026-09-13）

## 背景

本地 cinema 自 ADR-0087 接管后走**被动 watcher 模型**（`poster-watch.ts`：轮询笔记「海报」字段，外部
`@jwbz/obsidian-douban-poster` watcher 守护进程负责实际抓取）。上游演进为**主动队列模型**
（`douban-queue.ts`：插件内存队列串行 spawn `douban-poster fetch <笔记>`，15s 防限流间隔 + 3 分钟
硬超时 + 字段落盘轮询兜底 + 失败聚合通知 + G8 删除出队）。两模型对同一外部工具，并存会重复抓取，
用户裁决 (c)：只留队列。

## 契约核查（吸收前置条件，均已验证）

- [x] 数据契约不变：完成信号 = frontmatter「海报」+「豆瓣链接」字段齐全，与本地 data.ts 解析字段（`fm['海报']`/`fm['豆瓣链接']`）完全一致
- [x] 模块依赖本地全有：`core/notice`、`core/utils.sleep`、`state.M`（items/currentOverlay/appRef/renderFn）、`data.rebuildItems(app)` 签名一致
- [x] 不倒逼调用方改写：接线点为 saveNew/quickAddWant 的替换式改造 + index.ts 三行挂载
- [x] 无新增设置键、无数据迁移
- [x] 外部 CLI 缺失 / 无 Node / 移动端：静默禁用 + 一次性提示（优雅降级）

## 改动清单

| 文件 | 动作 |
|---|---|
| `src/cinema/douban-queue.ts` | 新增（上游原样，自包含 + 测试注入点） |
| `src/cinema/poster-watch.ts` | **删除**（watcher 退役） |
| `src/cinema/ui.ts` | saveNew：progress 通知 + watchPosterFetch → enqueueDoubanFetch；midnightInput 补 `fetching` 回调；局部刷新 pcardHtml 补 isFetching 第三参 |
| `src/cinema/recommend.ts` | quickAddWant：watchPosterFetch → enqueueDoubanFetch |
| `src/cinema/index.ts` | openCinema / openCinemaAnalysis 开面板后 sweepDoubanFetch；unloadCinema：stopAllPosterWatch → shutdownDoubanQueue |
| `src/cinema/shared.ts` | pcardHtml 增第三参 `fetching = false`（海报区遮罩 spinner，ADR-0113） |
| `src/cinema/layouts/midnight/render.ts` | MidnightRenderInput 增 `fetching` 字段；两处 pcardHtml 调用透传 |
| `src/cinema/styles.css` | 增 `.pw-fetch` / `.pw-spin`（复用既有 `cn-spin` 关键帧） |
| `tests/mock-vault.ts` | adapter 增 `getFullPath`（上游同款 `/mock-vault-root/` 前缀，测试映射用） |
| `tests/cinema/douban-queue.test.ts` | 新增（上游原样：sweep 口径 / 去重 / 完成验证 / 失败聚合 / 超时兜底 / G8 删除出队 / pcardHtml fetching） |
| `tests/cinema/poster-watch.test.ts` | **删除** |

## UX 变化（用户已裁决接受）

- 新建/推荐入库后不再弹「正在获取海报和豆瓣信息…」progress 通知（随 watcher 退役）；
  反馈改为：卡片海报区 spinner（抓取中）+ 完成后自动刷新上卡 + 失败聚合一 条 error 通知（含片名清单）。
- 面板每次打开自动扫缺补抓（会话内去重），不再依赖外部 watcher 守护进程常驻。

## 验收

- [ ] `pnpm exec tsc --noEmit` 0 错（本机 `node node_modules/typescript/bin/tsc --noEmit`）
- [ ] 全量测试绿（含新 douban-queue.test.ts，poster-watch.test.ts 已删）
- [ ] `node esbuild.config.mjs production` 构建通过
- [ ] 独立提交，只暂存本票文件

**Status:** 已完成（2026-09-13，本票随实现即时交付）
