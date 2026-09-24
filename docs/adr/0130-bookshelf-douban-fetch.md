# ADR-0130: 书架豆瓣抓取——页面解析路线与 EPUB 落点隔离

日期：2026-09-23 ｜ 票：issues/301-bookshelf-douban-fetch.md ｜ 状态：已接受

## 背景

书籍从未接入豆瓣自动抓取：影院链路（ADR-0129）的搜索分类（cat=1002）、字段源（ApiZero douban-movie）、兜底（rexxar movie/tv）全是影视专用。用户拍板书籍（含 EPUB）全量纳入。查证 ApiZero 无图书接口（aidocs 404 + 商城无类目），豆瓣图书字段只能走页面。

另发现 EPUB 的自然落点 weave-data.json 是外部 Weave 阅读器的数据文件——阅读中整文件重写，bz 写入的任何字段随时被覆盖丢失，与 news.json「外部进程写、bz 只读」同类红线。

## 决策

1. **数据源：豆瓣统一搜索页（cat=1001）+ book.douban.com 详情页解析**。搜索页与电影共用同一套统一搜索结构（实测同构，`parseSearchResults` 正则直接沿用）；详情页解析实测锚点：评分 `property="v:average"`、封面 `a.nbg img`（`/view/subject/s/public/` → `/l/public/` 升高清）、`#info` 块纯文本化后按键取值（作者/出版社/出品方/出版年/译者/ISBN/页数/定价）。电影当年退役详情页 HTML 是因为有了更好的 API；图书没有 API，页面解析是唯一可选路线，风控兜底（searchLooksBlocked + 失败聚合 + 重启重试）直接继承影院口径。
2. **纯函数上沉 core**：frontmatter 写入（updateFrontmatterFields/insertPosterEmbed）、搜索解析、风控检测等自 cinema 上移 `src/core/douban/fetch-core.ts`，cinema re-export 兼容。「缺失才填」数据正确性口径单点维护，杜绝两域正则/写入漂移；队列骨架两域各自持有（与域内 state 耦合重，不硬抽）。
3. **EPUB 字段隔离落点**：豆瓣字段写书架自有 `CONFIG/STORAGE/bookshelf-douban.json`（键 = epubVaultPath，updateFileSections 段写），**不碰 weave-data.json**；EPUB 封面写 `CONFIG/BOOK/EPUB COVER/<title>.<ext>` 约定路径——`resolveEpubCoverPath`（bookshelf/data.ts）已按此路径自动拾取，零读侧改动，且 coverPath 优先级天然实现「已有封面不覆盖」。md 书照影院口径写 frontmatter，封面落 `CONFIG/BOOK COVER`。
4. **Cookie 共用**：读影院 `cinemaDoubanCookie` 设置，不新设书架 Cookie 项（一份豆瓣 Cookie 两域通用，避免用户配两遍）。
5. **影院书籍纳入自动抓取（票 301 追加 Q14）**：影院墙 tag=书籍（含旧「小说」归一）条目开面板自动抓豆瓣，`douban-queue` 队列条目增 kind（movie/book），书籍路由到书架域图书链路 `fetchMdBookDouban`（显式跨域 import，符合 ADR-0002）；资格 = 缺豆瓣链接（书籍封面是缺失才填的顺带产物，不设门槛）。不采用「影院 fetcher 内部分流」——图书字段口径单点在书架 fetcher，影院影视链路零改动。
6. **重抓机制（追加 Q15）**：两域各一条命令（`bz-cinema-douban-refetch` / `bz-bookshelf-douban-refetch`，作用当前笔记）。流程 = 弹框确认/修改搜索词（`core/prompt-dialog` 单输入弹窗，默认书名+作者，可补 ISBN）→ `clearDoubanContent` 清豆瓣来源字段与旧海报/封面 embed（纯函数入 fetch-core 单点）→ 重抓。只清豆瓣来源字段，用户自有字段（作者/评分/状态/感想）不动；清字段的「缺失才填」复核天然放行重抓，无需给 fetcher 加豁免开关。抓错的根因是搜索词歧义（同名书/翻拍），弹框改词是真正能纠错的环节。
7. **自动上架单向 书架→娱乐（追加 Q16b）**：书库 md 书 / EPUB 抓取成功后，娱乐目录无同名书籍笔记则自动创建（tags: [书籍] + 豆瓣字段 + 封面 embed），书库的书出现在影院墙书籍分类；同名即视为同一本，已存在跳过，**绝不反向改书库**。实现于书架 fetcher（ensureCinemaShelfNote），只在生产执行器/重抓路径触发（测试注入执行器不触发，保持队列测试纯净）。娱乐目录解析复用 `resolveCinemaFolderPath()`（跨域读设置，与日记本同口径）。

## 后果

- 书架域新增 2 文件（douban-fetcher/douban-queue）+1 测试文件（后续 +douban-refetch）；cinema 仅 import 改路径 + kind 路由，影视行为零变化（既有 douban-fetcher/queue 测试兜底）。
- 命令数 73→75（+2 重抓命令，smoke EXPECTED_COMMAND_IDS 同步）；一期不做 UI（评分角标另票）。
- EPUB 豆瓣数据暂为 write-only（sidecar 就绪，UI 另票消费；自动上架的娱乐笔记承载展示）；md 书字段在笔记 frontmatter 即时可见。
- 豆瓣页面结构变更会导致图书解析失效（电影走 API 无此风险）——接受，失效形态为「抓取失败聚合通知」，不损坏数据（缺失才填）。
- 自动上架按「同名即同一本」去重，书名不同实为同书的边缘场景会出现两条娱乐条目——接受（用户可手动删除其一，重抓不会复活已删条目以外的重复）。
