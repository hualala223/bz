/**
 * 书架豆瓣抓取测试（票 301 / ADR-0130）：详情页解析 / md 写回（缺失才填+二跑跳过）/
 * EPUB sidecar+约定封面 / sweep 资格与去重 / 失败聚合通知。
 * 队列执行器走测试注入（与 cinema douban-queue.test 同惯例），不触 requestUrl。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockVault, mockAppWithVault, parseFrontmatter } from '../mock-vault';
import { resetObsidianMocks, getNoticeMessages, clearNotices } from '../mock-obsidian-entry';
import { M, resetBookshelfState } from '../../src/bookshelf/state';
import {
  parseBookDetail, flattenInfoHtml, infoValue, upgradeBookCoverUrl,
  fetchMdBookDouban, fetchEpubBookDouban, readSidecar, epubNeedsFetch,
  mdBookQuery, BOOK_COVER_FOLDER, EPUB_COVER_FOLDER, sidecarPathOf,
  ensureCinemaShelfNote, refetchMdBookDouban,
  type BookFetchDeps,
} from '../../src/bookshelf/douban-fetcher';
import { clearDoubanContent } from '../../src/core/douban/fetch-core';
import {
  sweepBookFetch, shutdownBookQueue, configureFetchQueue,
  type FetchBook, type QueueEntry,
} from '../../src/bookshelf/douban-queue';
import type { BookFetchOutcome } from '../../src/bookshelf/douban-fetcher';

const SIDECAR = sidecarPathOf('CONFIG/STORAGE');

/** 豆瓣统一搜索页 fixture（>8000 字符过 searchLooksBlocked；link2 包装 url= 参数） */
function searchPageHtml(detailUrl: string, title = '三体'): string {
  const enc = encodeURIComponent(detailUrl);
  const block = `<div class="result"><div class="pic"><a href="https://www.douban.com/link2/?url=${enc}&query=x">`
    + `<img src="https://img.doubanio.com/view/subject/s/public/s1.jpg"></a></div>`
    + `<div class="title"><a href="https://www.douban.com/link2/?url=${enc}">${title}</a></div></div>`;
  let html = '<html><body>' + block + '</body></html>';
  while (html.length < 9000) html += ' ';
  return html;
}

/** 图书详情页 fixture（实测锚点：v:average / a.nbg img / #info 块） */
const DETAIL_HTML = `<html><head></head><body>
<strong class="ll rating_num" property="v:average"> 8.9 </strong>
<a class="nbg" href="https://book.douban.com/subject/2567698/"><img src="https://img3.doubanio.com/view/subject/s/public/s2768378.jpg" alt="三体"></a>
<div id="info">
<span class="pl">作者</span> : <a href="/search?q=%E5%88%98%E6%85%88%E6%AC%A3">刘慈欣</a> <br/>
<span class="pl">出版社:</span> 重庆出版社 <br/>
<span class="pl">出品方:</span> <a href="/search?q=科幻世界">科幻世界</a> <br/>
<span class="pl">出版年:</span> 2008-1 <br/>
<span class="pl">页数:</span> 302 <br/>
<span class="pl">定价:</span> 23.00元 <br/>
<span class="pl">丛书:</span> 科幻世界·中国科幻基石丛书 <br/>
<span class="pl">ISBN:</span> 9787536692930 <br/>
</div>
<h2>内容简介</h2><div class="intro"><p>文化大革命如火如荼进行的同时，军方探寻外星文明的绝秘计划“红岸工程”取得了突破性进展。</p><p>四光年外，“三体文明”正苦苦挣扎。</p></div>
<h2>作者简介</h2><div class="intro"><p>刘慈欣，祖籍河南，中国科幻作家。</p></div>
<div class="indent" id="dir_2567698_full" style="display:none">1.科学边界<br/>2.台球<br/>3.射手和农场主<br/>4.三体、周文王、长夜<br/>后记<br/> · · · · · · (<a>收起</a>) </div>
</body></html>`;

/** 依赖替身：httpGet 按域名分流；写盘走 MockVault.adapter */
function makeDeps(vault: MockVault, opts: { search?: string; detail?: string } = {}): BookFetchDeps & { searchUrls: string[] } {
  const searchUrls: string[] = [];
  return {
    searchUrls,
    httpGet: async (url) => {
      if (url.includes('/search?')) {
        searchUrls.push(url);
        return opts.search ?? searchPageHtml('https://book.douban.com/subject/2567698/');
      }
      return opts.detail ?? DETAIL_HTML;
    },
    downloadBinary: async () => new ArrayBuffer(8),
    writeBinary: (path, data) => vault.adapter.writeBinary(path, data),
    mkdir: (path) => vault.adapter.mkdir(path),
  };
}

/** 等串行队列跑完（gapMs=refreshDelayMs=0 时 25ms 足够链路收敛） */
const settle = () => new Promise((r) => setTimeout(r, 25));

describe('图书详情页解析（parseBookDetail）', () => {
  it('评分/封面升高清/info 块字段全解析', () => {
    const d = parseBookDetail(DETAIL_HTML);
    expect(d.score).toBe('8.9');
    expect(d.coverUrl).toBe('https://img3.doubanio.com/view/subject/l/public/s2768378.jpg');
    expect(d.author).toBe('刘慈欣');
    expect(d.publisher).toBe('重庆出版社');
    expect(d.publisherBrand).toBe('科幻世界');
    expect(d.publishYear).toBe('2008-1');
    expect(d.pages).toBe('302');
    expect(d.isbn).toBe('9787536692930');
    // 简介 = 首个 intro 块（内容简介），不吞作者简介
    expect(d.intro).toBe('文化大革命如火如荼进行的同时，军方探寻外星文明的绝秘计划“红岸工程”取得了突破性进展。\n四光年外，“三体文明”正苦苦挣扎。');
    // 章节数 = dir_full 块条目计数（剔除收起标记）
    expect(d.chapters).toBe(5);
  });

  it('infoValue：键序锚点截断；flattenInfoHtml 并空白', () => {
    const text = flattenInfoHtml('<span>作者</span> : 张三 <span>出版社:</span> X社 <span>出版年:</span> 2020');
    expect(text).toBe('作者 : 张三 出版社: X社 出版年: 2020');
    expect(infoValue(text, '作者')).toBe('张三');
    expect(infoValue(text, '出版社')).toBe('X社');
    expect(infoValue(text, '出版年')).toBe('2020');
    expect(infoValue(text, '译者')).toBe('');
  });

  it('upgradeBookCoverUrl：s/public → l/public；无封面返回空串字段', () => {
    expect(upgradeBookCoverUrl('https://img.doubanio.com/view/subject/s/public/s9.jpg')).toBe('https://img.doubanio.com/view/subject/l/public/s9.jpg');
    const d = parseBookDetail('<html><body>风控拦截占位</body></html>'.padEnd(9000, 'x'));
    expect(d.score).toBe('');
    expect(d.coverUrl).toBe('');
    expect(d.author).toBe('');
  });
});

describe('md 书抓取（fetchMdBookDouban）', () => {
  let vault: MockVault;

  beforeEach(() => {
    resetObsidianMocks();
    vault = new MockVault();
    vault.files.set('书库/三体.md', '---\ntags: [book]\n---\n# 三体\n读书笔记正文');
  });

  it('全缺书：字段全家桶缺失才填 + 封面落 BOOK COVER + 正文 embed', async () => {
    const app = mockAppWithVault(vault);
    const file = vault.file('书库/三体.md');
    const deps = makeDeps(vault);
    const r = await fetchMdBookDouban(app, file, deps);
    expect(r).toEqual({ ok: true });

    const fm = parseFrontmatter(vault.files.get('书库/三体.md')!);
    expect(fm!['豆瓣链接']).toBe('https://book.douban.com/subject/2567698/');
    // fm 数值形态：mock 与真实 Obsidian 都会把裸 8.9 解析成 number，String 归一断言
    expect(String(fm!['豆瓣评分'])).toBe('8.9');
    expect(fm!['作者']).toBe('刘慈欣');
    expect(fm!['出版社']).toBe('重庆出版社');
    expect(fm!['出版年']).toBe('2008-1');
    expect(fm!['ISBN']).toBe('9787536692930');
    expect(String(fm!['页数'])).toBe('302'); // 数量字段，YAML number 化无害
    expect(fm!['出品方']).toBe('科幻世界');
    expect(fm!['简介']).toContain('红岸工程'); // 简介（新行已单行化）
    expect(String(fm!['总章节数'])).toBe('5');
    // 封面：目录 + 二进制 + fm 路径 + 正文 embed
    expect(fm!['封面']).toMatch(new RegExp(`^${BOOK_COVER_FOLDER}/三体_\\d+\\.jpg$`));
    expect(vault.binaryFiles.has(fm!['封面'] as string)).toBe(true);
    expect(vault.files.get('书库/三体.md')).toContain(`![[${fm!['封面']}]]`);
    expect(deps.searchUrls[0]).toContain('cat=1001');
    expect(deps.searchUrls[0]).toContain(encodeURIComponent('三体'));
  });

  it('已有豆瓣链接 → skipped（零请求）；手改作者不覆盖（缺失才填）', async () => {
    vault.files.set('书库/手改.md', '---\ntags: [book]\n作者: 手改作者\n豆瓣链接: https://book.douban.com/subject/1/\n---\n正文');
    const app = mockAppWithVault(vault);
    const deps = makeDeps(vault);
    const r = await fetchMdBookDouban(app, vault.file('书库/手改.md'), deps);
    expect(r).toEqual({ ok: true, skipped: true });
    expect(deps.searchUrls).toHaveLength(0);
    expect(parseFrontmatter(vault.files.get('书库/手改.md')!)!['作者']).toBe('手改作者');

    // 缺链接但作者已有 → 搜索词拼作者、写回不覆盖
    vault.files.set('书库/有作者.md', '---\ntags: [book]\n作者: 张三\n---\n正文');
    await fetchMdBookDouban(app, vault.file('书库/有作者.md'), deps);
    expect(parseFrontmatter(vault.files.get('书库/有作者.md')!)!['作者']).toBe('张三');
    expect(parseFrontmatter(vault.files.get('书库/有作者.md')!)!['出版社']).toBe('重庆出版社');
    expect(deps.searchUrls[deps.searchUrls.length - 1]).toContain(encodeURIComponent('有作者 张三'));
  });

  it('搜索词：basename + fm 作者（Q12）；无作者只用书名', () => {
    expect(mdBookQuery('三体', null)).toBe('三体');
    expect(mdBookQuery('三体', '未知作者')).toBe('三体');
    expect(mdBookQuery('三体', '刘慈欣')).toBe('三体 刘慈欣');
  });

  it('风控拦截 → blocked；搜索无果 → notfound', async () => {
    const app = mockAppWithVault(vault);
    const file = vault.file('书库/三体.md');
    expect(await fetchMdBookDouban(app, file, makeDeps(vault, { search: 'short' }))).toEqual({ ok: false, reason: 'blocked' });
    expect(await fetchMdBookDouban(app, file, makeDeps(vault, { search: '没有找到'.padEnd(9000, ' ') }))).toEqual({ ok: false, reason: 'notfound' });
  });

  it('文件已删除 → skipped（队列快照里的幽灵条目不算失败）', async () => {
    const app = mockAppWithVault(vault);
    // getAbstractFileByPath 探测不到的路径：从 vault 摘除但保留 TFile 引用
    const file = vault.file('书库/三体.md');
    vault.files.delete('书库/三体.md');
    const deps = makeDeps(vault);
    expect(await fetchMdBookDouban(app, file as any, deps)).toEqual({ ok: true, skipped: true });
    expect(deps.searchUrls).toHaveLength(0);
  });
});

describe('EPUB 抓取（fetchEpubBookDouban）', () => {
  let vault: MockVault;

  beforeEach(() => {
    resetObsidianMocks();
    vault = new MockVault();
  });

  const target = { vaultPath: '书库/三体.epub', title: '三体', author: '刘慈欣' };

  it('无封面书：sidecar 段写全字段 + 封面落 EPUB COVER 约定路径', async () => {
    const app = mockAppWithVault(vault);
    const r = await fetchEpubBookDouban(app, target, makeDeps(vault), { sidecarPath: SIDECAR, hasCover: false, now: () => 123 });
    expect(r).toEqual({ ok: true });

    const records = await readSidecar(app, SIDECAR);
    const rec = records['书库/三体.epub'];
    expect(rec.doubanUrl).toBe('https://book.douban.com/subject/2567698/');
    expect(rec.score).toBe('8.9');
    expect(rec.publisher).toBe('重庆出版社');
    expect(rec.isbn).toBe('9787536692930');
    expect(rec.pages).toBe('302');
    expect(rec.intro).toContain('红岸工程');
    expect(rec.chapters).toBe(5);    expect(rec.fetchedAt).toBe(123);
    expect(rec.coverPath).toBe(`${EPUB_COVER_FOLDER}/三体.jpg`);
    expect(vault.binaryFiles.has(`${EPUB_COVER_FOLDER}/三体.jpg`)).toBe(true);
    // weave-data.json 不被触碰（ADR-0130 红线）
    expect([...vault.files.keys(), ...vault.binaryFiles.keys()].some((p) => p.includes('weave-data'))).toBe(false);
  });

  it('已有封面（hasCover）→ 不写封面文件、记录无 coverPath；资格判定转 false', async () => {
    const app = mockAppWithVault(vault);
    await fetchEpubBookDouban(app, target, makeDeps(vault), { sidecarPath: SIDECAR, hasCover: true });
    const records = await readSidecar(app, SIDECAR);
    expect(records['书库/三体.epub'].coverPath).toBeUndefined();
    expect([...vault.binaryFiles.keys()]).toHaveLength(0);

    // 抓完 → 资格转 false（Q8：缺记录或缺链接才抓）
    expect(epubNeedsFetch(records, '书库/三体.epub')).toBe(false);
    expect(epubNeedsFetch(records, '书库/另一本.epub')).toBe(true);
  });

  it('sidecar 段写不吞并发写者的其他键（updateFileSections 合并语义）', async () => {
    const app = mockAppWithVault(vault);
    vault.files.set(SIDECAR, JSON.stringify({ '书库/别的书.epub': { doubanUrl: 'https://book.douban.com/subject/9/', title: '别的书' } }));
    await fetchEpubBookDouban(app, target, makeDeps(vault), { sidecarPath: SIDECAR, hasCover: true });
    const records = await readSidecar(app, SIDECAR);
    expect(records['书库/别的书.epub'].doubanUrl).toBe('https://book.douban.com/subject/9/');
    expect(records['书库/三体.epub'].score).toBe('8.9');
  });
});

describe('书架豆瓣队列（sweepBookFetch）', () => {
  let vault: MockVault;
  let app: any;

  beforeEach(() => {
    resetObsidianMocks();
    clearNotices();
    resetBookshelfState();
    shutdownBookQueue();
    vault = new MockVault();
    app = mockAppWithVault(vault);
    M.appRef = app;
    M.folderPath = '书库';
  });

  afterEach(() => {
    shutdownBookQueue();
    vi.useRealTimers();
  });

  /** md item（file 必须来自 vault.file 以过 metadataCache 预判） */
  const mdItem = (path: string) => ({ file: vault.file(path), isEpub: false, title: path.replace(/\.md$/, '').split('/').pop()!, author: 'x', cover: null, epubVaultPath: null });
  const epubItem = (vPath: string, title: string, hasCover = false) => ({ file: null, isEpub: true, title, author: 'y', cover: hasCover ? 'CONFIG/BOOK/EPUB COVER/x.jpg' : null, epubVaultPath: vPath });

  /** 假执行器：记录路径；成功时补齐书源（md 写 fm / epub 写 sidecar） */
  function makeFetch(outcome: BookFetchOutcome | ((e: QueueEntry) => BookFetchOutcome) = { ok: true }) {
    const fetched: string[] = [];
    const fetch: FetchBook = async (e) => {
      fetched.push(e.path);
      if (e.kind === 'md') {
        const c = vault.files.get(e.path) ?? '';
        vault.files.set(e.path, c.replace(/\n*$/, '\n') + '豆瓣链接: https://book.douban.com/subject/1/\n');
      } else {
        await fetchEpubBookDouban(app, e.target, makeDeps(vault), { sidecarPath: SIDECAR, hasCover: e.hasCover });
      }
      return typeof outcome === 'function' ? outcome(e) : outcome;
    };
    return { fetched, fetch };
  }

  it('sweep：md 缺链接 + EPUB 缺记录入队；齐全的不入队', async () => {
    vault.files.set('书库/缺.md', '---\ntags: [book]\n---\n正文');
    vault.files.set('书库/齐.md', '---\ntags: [book]\n豆瓣链接: https://book.douban.com/subject/1/\n---\n正文');
    vault.files.set(SIDECAR, JSON.stringify({ '书库/齐.epub': { doubanUrl: 'https://book.douban.com/subject/2/', title: '齐' } }));
    M.items = [mdItem('书库/缺.md'), mdItem('书库/齐.md'), epubItem('书库/缺.epub', '缺'), epubItem('书库/齐.epub', '齐')] as any;

    const { fetched, fetch } = makeFetch();
    configureFetchQueue({ fetch, gapMs: 0, refreshDelayMs: 0 });
    await sweepBookFetch(app);
    await settle();

    expect(fetched.sort()).toEqual(['书库/缺.epub', '书库/缺.md'].sort());
  });

  it('会话去重：第二次 sweep 零新抓取；卸载后重置', async () => {
    vault.files.set('书库/缺.md', '---\ntags: [book]\n---\n正文');
    M.items = [mdItem('书库/缺.md')] as any;
    const { fetched, fetch } = makeFetch();
    configureFetchQueue({ fetch, gapMs: 0, refreshDelayMs: 0 });
    await sweepBookFetch(app);
    await settle();
    expect(fetched).toHaveLength(1);
    await sweepBookFetch(app);
    await settle();
    expect(fetched).toHaveLength(1);

    shutdownBookQueue();
    // 卸载重置后同条目可再次入队（会话语义）
    vault.files.set('书库/缺.md', '---\ntags: [book]\n---\n正文');
    await sweepBookFetch(app);
    await settle();
    expect(fetched).toHaveLength(2);
  });

  it('失败聚合：普通失败与风控分文案（书籍措辞）', async () => {
    vault.files.set('书库/甲.md', '---\ntags: [book]\n---\n正文');
    vault.files.set('书库/乙.md', '---\ntags: [book]\n---\n正文');
    M.items = [mdItem('书库/甲.md'), mdItem('书库/乙.md')] as any;
    const fetch: FetchBook = async (e) => (e.path.includes('甲') ? { ok: false, reason: 'blocked' } : { ok: false, reason: 'notfound' });
    configureFetchQueue({ fetch, gapMs: 0, refreshDelayMs: 0 });
    await sweepBookFetch(app);
    await settle();

    const msgs = getNoticeMessages().join('\n');
    expect(msgs).toContain('豆瓣风控拦截');
    expect(msgs).toContain('甲');
    expect(msgs).toContain('以下书籍豆瓣信息获取失败');
    expect(msgs).toContain('乙');
  });
});

describe('重抓与自动上架（票 301 追加决策 Q15/Q16b）', () => {
  let vault: MockVault;

  beforeEach(() => {
    resetObsidianMocks();
    vault = new MockVault();
  });

  it('clearDoubanContent：删指定 fm 键 + 封面 embed 行，用户自有字段与正文不动', () => {
    const content = '---\ntags: [book]\n作者: 张三\n豆瓣评分: 1.0\nISBN: "978"\n---\n![[CONFIG/BOOK COVER/三体_1.jpg]]\n正文保留';
    const next = clearDoubanContent(content, ['豆瓣评分', 'ISBN', '封面'], ['CONFIG/BOOK COVER']);
    expect(next).not.toContain('豆瓣评分');
    expect(next).not.toContain('ISBN');
    expect(next).not.toContain('![[CONFIG/BOOK COVER');
    expect(next).toContain('作者: 张三');
    expect(next).toContain('tags: [book]');
    expect(next).toContain('正文保留');
    // 无 frontmatter / 无匹配行原样返回
    expect(clearDoubanContent('纯正文', ['豆瓣评分'], ['CONFIG/BOOK COVER'])).toBe('纯正文');
  });

  it('ensureCinemaShelfNote：无同名 → 建书籍条目（tag/字段/embed/ISBN 引号）；已存在 → 跳过', async () => {
    const app = mockAppWithVault(vault);
    const created = await ensureCinemaShelfNote(app, {
      title: '三体', doubanUrl: 'https://book.douban.com/subject/2567698/',
      score: '8.9', author: '刘慈欣', isbn: '9787536692930', coverPath: 'CONFIG/BOOK COVER/三体_1.jpg',
      intro: '三体人舰队正在驶向地球。', chapters: 5,
    });
    expect(created).toBe(true);
    const fm = parseFrontmatter(vault.files.get('我的/娱乐/三体.md')!);
    expect(fm!.tags).toContain('书籍');
    expect(fm!['豆瓣链接']).toBe('https://book.douban.com/subject/2567698/');
    expect(String(fm!['豆瓣评分'])).toBe('8.9');
    expect(fm!['作者']).toBe('刘慈欣');
    expect(fm!['ISBN']).toBe('9787536692930');
    expect(fm!['简介']).toBe('三体人舰队正在驶向地球。');
    expect(String(fm!['总章节数'])).toBe('5');
    expect(vault.files.get('我的/娱乐/三体.md')).toContain('![[CONFIG/BOOK COVER/三体_1.jpg]]');
    // 单向：同名即同一本，绝不覆盖（Q16b）
    expect(await ensureCinemaShelfNote(app, { title: '三体', doubanUrl: 'https://book.douban.com/subject/9/' })).toBe(false);
    expect(fm!['豆瓣链接']).toBe('https://book.douban.com/subject/2567698/');
  });

  it('refetchMdBookDouban：清旧豆瓣字段（保留作者）→ 按改词重抓 → 自动上架娱乐', async () => {
    vault.files.set('书库/三体.md', '---\ntags: [book]\n作者: 张三\n豆瓣评分: 1.0\n豆瓣链接: https://book.douban.com/subject/99/\n封面: CONFIG/BOOK COVER/old.jpg\n---\n![[CONFIG/BOOK COVER/old.jpg]]\n正文');
    const app = mockAppWithVault(vault);
    const deps = makeDeps(vault);
    const r = await refetchMdBookDouban(app, vault.file('书库/三体.md'), deps, '三体 刘慈欣');
    expect(r).toEqual({ ok: true });
    expect(deps.searchUrls[0]).toContain(encodeURIComponent('三体 刘慈欣'));
    const fm = parseFrontmatter(vault.files.get('书库/三体.md')!);
    expect(fm!['作者']).toBe('刘慈欣'); // 作者属豆瓣来源字段：清旧值后由豆瓣回填（9-23 吞译者脏值自愈）
    expect(String(fm!['豆瓣评分'])).toBe('8.9'); // 旧错值 1.0 已清，新值写入
    expect(fm!['豆瓣链接']).toBe('https://book.douban.com/subject/2567698/');
    expect(String(fm!['ISBN'])).toBe('9787536692930');
    // 自动上架（Q16b）：娱乐目录出现同书籍条目
    expect(vault.files.has('我的/娱乐/三体.md')).toBe(true);
  });
});
