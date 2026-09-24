# 301：书架豆瓣抓取（书籍版豆瓣链路）

日期：2026-09-23 ｜ 状态：进行中 ｜ ADR：0130

## 需求来源

用户提问：「豆瓣中不是也有书籍吗，为什么书籍没有像电影电视剧一样自动从豆瓣中抓取相应的信息？」

查明根因（grill-with-docs 会话）：影院豆瓣链路（issue 303/ADR-0129）从影视专用外部 CLI 移植，三段依赖（搜索 `cat=1002` 电影分类、ApiZero `douban-movie` 接口、rexxar `movie/tv` 演职员接口）书一本都用不上，故书架域从未接入。属历史沿革，非技术不可行。

## 决策（grill 轮次拍板）

| 决策点 | 拍板 |
|---|---|
| Q1 立项 | 做完整票 |
| Q2 字段源 | ApiZero 查证**无图书接口**（aidocs 404 + 商城无类目）→ 走豆瓣统一搜索页（`cat=1001`）+ book.douban.com 详情页解析 |
| Q3 字段 | 全家桶：豆瓣评分/作者/出版社/出版年/译者/ISBN/**页数/出品方/简介**/封面/豆瓣链接，一律「缺失才填」（对齐影院 C8/C9；9-23 用户点名补 简介/页数/出品方——简介=详情页首个 div.intro 块） |
| Q4 触发 | 复刻影院全自动：开面板 sweep 入队（15s 间隔、3 分钟硬超时、风控检测、失败聚合通知、会话去重、移动端启用） |
| Q5 封面落点 | 新目录 `CONFIG/BOOK COVER`（md 书；对齐影院 `CONFIG/MOVIE POSTER` 命名） |
| Q6 复用架构 | 纯函数抽 `src/core/douban/` 单点维护（frontmatter 写入口径不漂移），队列骨架两域各自持有 |
| Q7 范围 | md 书 + EPUB **都做**（用户明确 EPUB 纳入） |
| Q8 资格 | 书库全量自动（md 缺「豆瓣链接」即入队；EPUB 缺 sidecar 记录即入队） |
| Q10 EPUB 字段落点 | **绝不写 weave-data.json**（Weave 阅读时整文件重写会覆盖丢数据）→ 书架自有 `CONFIG/STORAGE/bookshelf-douban.json`（键 = epubVaultPath，updateFileSections 段写） |
| Q11 EPUB 封面 | 写 `CONFIG/BOOK/EPUB COVER/<title>.<ext>` 约定路径（data.ts resolveEpubCoverPath 自动拾取，零读侧改动）；已有 coverPath 的不覆盖 |
| Q12 搜索基准 | EPUB 用 `meta.title + meta.author`；md 用 basename + fm.author |
| Q13 UI | 一期不做 UI（字段落数据即止；评分角标等另票） |
| Q14 娱乐书籍 | **纳入**：影院墙 tag=书籍（含旧小说归一）条目开面板自动抓豆瓣，队列按 kind 路由到图书链路（`douban-queue` kind='book' → fetchMdBookDouban）；资格 = 缺豆瓣链接 |
| Q15 重抓 | 两域各一条命令（`bz-cinema-douban-refetch` / `bz-bookshelf-douban-refetch`，作用当前笔记）：清豆瓣来源字段 + 旧海报/封面 embed → **弹框确认/修改搜索词**（默认书名+作者，可补 ISBN——抓错根因是搜索词歧义，不改词大概率再错）→ 重抓。用户自有字段（作者/评分/状态/感想）不动 |
| Q16b 自动上架 | **单向 书架→娱乐**：书库 md 书 / EPUB 抓取成功后，娱乐目录无同名书籍笔记则自动创建（tags: [书籍] + 豆瓣字段 + 封面 embed），书库的书出现在影院墙书籍分类；已存在跳过，绝不反向改书库 |
| 五轮追加（20:08） | ① 电视剧**总集数自动抓**：ApiZero `episodes` 落 fm「总集数」（当年 C1 撤回的是误写「季集」；总集数是正确落点），仅剧集类型（`fmTags`+`episodesEligibleTag` 门槛）且缺失才填；② 详情卡加集数行（镜像章节行）；③ 书籍总章节数链路本已全通，存量笔记需重抓补齐（实测《原则》豆瓣页有目录块 47 章） |
| Q17 重抓入口（21:13，(c)） | **详情卡加「重抓豆瓣」按钮**（有笔记文件的条目渲染）：点卡片 → 按钮 → 弹框改词 → 重抓 → 重建数据原样重开详情卡看新数据；两域命令保留（键盘入口）。解决「重抓要翻底层 md」的体验死角 |

## 实现

- `src/core/douban/fetch-core.ts`：自 cinema douban-fetcher 上移纯函数（parseSearchResults/searchLooksBlocked/upgradePosterUrl/normalizeListValue/extractSid/updateFrontmatterFields/insertPosterEmbed + HttpGet 等类型），cinema 改 re-export（测试兼容零改动）；`FmFieldSpec` 增 `quote` 标记（ISBN 等标识符防 YAML number 化丢前导零）；Q15 增 `clearDoubanContent`（重抓前置清理纯函数）。
- `src/bookshelf/douban-fetcher.ts`：parseBookDetail（评分 v:average、封面 nbg img s→l 升清、#info 块纯文本化按键取值）+ fetchMdBookDouban / fetchEpubBookDouban；Q15/Q16b 增 refetchMdBookDouban / ensureCinemaShelfNote（自动上架，单向 书架→娱乐）。
- `src/bookshelf/douban-queue.ts`：复刻影院队列口径；无 loading UI（Q13a），完成后 rebuildItems+renderFn 刷新；sweep 异步（EPUB 资格需读 sidecar）；生产执行器成功后自动上架（Q16b，测试注入不触发）。
- `src/cinema/douban-queue.ts`：QueueEntry/FetchNote 增 kind（movie/book），sweep 书籍（含旧小说归一）缺豆瓣链接入队走图书链路（Q14）；fetchDepsFromSettings 导出供重抓复用。
- `src/cinema/douban-fetcher.ts`：fetchNoteDouban 增 `opts.query` 覆盖（Q15 重抓改词）。
- `src/bookshelf/douban-refetch.ts` / `src/cinema/douban-refetch.ts`：重抓编排（弹框 openTextPromptDialog → 清字段 → 重抓 → 通知）；书架 wrapper 限书库目录内 md。
- `src/core/prompt-dialog.ts`：单输入文本弹窗（复用 flow-dialog 壳/ESC/动态发号惯例，零新增样式）。
- `src/main.ts`：+2 命令 `bz-bookshelf-douban-refetch`（重抓当前书籍豆瓣）/ `bz-cinema-douban-refetch`（重抓当前条目豆瓣，影视/书籍自动分流）——73→75。
- Cookie 复用影院 `cinemaDoubanCookie` 设置（一份豆瓣 Cookie 两域共用，不加新设置项）。

## 验收

- [ ] vitest 全量 + tsc --noEmit 全绿
- [ ] 新增数据层测试：parseBookDetail / md 写回（缺失才填+二跑跳过）/ EPUB sidecar+封面 / sweep 资格+去重 / 失败聚合 / clearDoubanContent / ensureCinemaShelfNote / refetchMdBookDouban / sweep kind 路由
- [ ] 构建验证（视主仓构建产物干净状态执行）
