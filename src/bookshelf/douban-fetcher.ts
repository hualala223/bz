/**
 * 书架豆瓣抓取核心（票 301 / ADR-0130）：书籍版豆瓣链路。
 * 数据源（ApiZero 查证无图书接口 → 页面解析路线）：统一搜索页（cat=1001 图书分类，
 * 与电影共用同一套搜索结构，parseSearchResults 直接沿用）→ book.douban.com 详情页解析
 * （评分 v:average / 封面 a.nbg img s→l 升高清 / #info 块纯文本化按键取值）。
 * 写回口径（Q3 拍板）：全部字段「缺失才填」（共享 core updateFrontmatterFields，不覆盖手改）。
 * 两类书两条写回路径：
 * - md 书：frontmatter（豆瓣评分/作者/出版社/出版年/译者/ISBN/页数/出品方/简介/豆瓣链接）
 *   + 封面落 CONFIG/BOOK COVER + 正文 FM 后 embed（与影院海报同口径）；
 * - EPUB：**绝不写 weave-data.json**（Weave 阅读时整文件重写会覆盖丢数据，ADR-0130）——
 *   字段落书架自有 sidecar CONFIG/STORAGE/bookshelf-douban.json（键 = epubVaultPath，
 *   updateFileSections 段写）；封面写 CONFIG/BOOK/EPUB COVER/<title>.<ext> 约定路径
 *   （data.ts resolveEpubCoverPath 自动拾取，已有封面不覆盖）。
 * 纯逻辑 + 依赖注入（httpGet / downloadBinary / writeBinary / mkdir），node 环境可测。
 */
import type { App, TFile } from 'obsidian';
import { updateFileSections } from '../core/storage';
import {
  parseSearchResults, searchLooksBlocked, extractSid,
  updateFrontmatterFields, insertPosterEmbed, fmFieldValue, safeFileName, clearDoubanContent,
  type HttpGet, type DownloadBinary, type FmFieldSpec,
} from '../core/douban/fetch-core';
import { resolveCinemaFolderPath } from '../cinema/state';

/** md 书封面目录（Q5 拍板：对齐影院 POSTER_FOLDER 命名风格） */
export const BOOK_COVER_FOLDER = 'CONFIG/BOOK COVER';
/** EPUB 封面约定目录（bookshelf/data.ts resolveEpubCoverPath 按此拾取，勿改路径拼写） */
export const EPUB_COVER_FOLDER = 'CONFIG/BOOK/EPUB COVER';
/** EPUB 豆瓣字段 sidecar（书架自有；键 = epubVaultPath） */
export const BOOK_DOUBAN_SIDECAR = 'bookshelf-douban.json';
/** 共享 sidecar 路径解析（走 storageFile 尊重 storagePath 设置；由队列/调用方注入具体路径值） */
export const sidecarPathOf = (dir: string): string => `${dir}/${BOOK_DOUBAN_SIDECAR}`;

/** 统一 UA（与影院抓取同口径；豆瓣对无 UA 请求风控更严） */
export const DOUBAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ---------- 依赖注入 ----------

export interface BookFetchDeps {
  httpGet: HttpGet;
  downloadBinary: DownloadBinary;
  /** 封面写盘（vault adapter.writeBinary 适配） */
  writeBinary: (path: string, data: ArrayBuffer) => Promise<void>;
  /** 封面目录不存在时建目录 */
  mkdir: (path: string) => Promise<void>;
  /** 豆瓣 Cookie（可选；读影院 cinemaDoubanCookie 共用，ADR-0130 决策 4） */
  doubanCookie?: string;
  now?: () => number;
}

// ---------- 详情页解析 ----------

export interface BookDetailInfo {
  /** 豆瓣评分（无评分空串） */
  score: string;
  author: string;
  publisher: string;
  publisherBrand: string;
  publishYear: string;
  translator: string;
  isbn: string;
  pages: string;
  /** 内容简介（详情页首个 div.intro 块的段落文本；无简介空串） */
  intro: string;
  /** 章节数（详情页目录 dir_<sid>_full 块条目计数；无目录块 null——豆瓣图书很多无目录） */
  chapters: number | null;
  /** 封面大图 URL（s/public → l/public 升高清；无封面空串） */
  coverUrl: string;
}

/** EPUB sidecar 单书记录 */
export interface BookDoubanRecord {
  doubanUrl: string;
  title: string;
  score: string;
  author: string;
  publisher: string;
  publishYear: string;
  translator: string;
  isbn: string;
  pages?: string;
  publisherBrand?: string;
  intro?: string;
  /** 章节数（豆瓣目录条目计数；无目录缺省） */
  chapters?: number;
  coverPath?: string;
  fetchedAt: number;
}

/** 纯函数：图书详情页封面 URL（a.nbg img）→ 升高清（s/public → l/public） */
export function upgradeBookCoverUrl(url: string): string {
  return url.replace('/view/subject/s/public/', '/view/subject/l/public/');
}

/** 纯函数：#info 块 HTML → 纯文本（剥标签、并空白）——字段取值的统一基底 */
export function flattenInfoHtml(infoHtml: string): string {
  return infoHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 已知 info 键（值取值时遇到下一个键即截断） */
const INFO_KEYS = ['出版社', '出品方', '副标题', '原作名', '译者', '出版年', '页数', '定价', '装帧', '丛书', 'ISBN', '开本', '纸张'];

/** 纯函数：info 纯文本中按键取值——值 = 该键冒号后到下一个已知键冒号前的文本。
 *  键序在文本中天然分隔（实测 info 块「作者 : 刘慈欣 出版社: 重庆出版社 …」），
 *  值本身不含「已知键+冒号」形态，锚点截断可靠。
 *  截断锚点用正则（键与冒号间允许空白）：实测页「译者 : 刘波」冒号前有空格，
 *  indexOf('译者:') 匹配不到会把译者吞进作者值（票 301 实测踩过） */
export function infoValue(infoText: string, key: string, allKeys: string[] = INFO_KEYS): string {
  const m = new RegExp(`${key}\\s*[::]\\s*`).exec(infoText);
  if (!m) return '';
  const rest = infoText.slice(m.index + m[0].length);
  let end = rest.length;
  for (const k of allKeys) {
    if (k === key) continue;
    const km = new RegExp(`${k}\\s*[::]`).exec(rest);
    if (km && km.index < end) end = km.index;
  }
  return rest.slice(0, end).trim();
}

/** 纯函数：内容简介（详情页首个 div.intro 块；段落 <p> 取文本按行拼接）。
 *  实测页两个 intro 块 = 内容简介 / 作者简介，只取首个（内容简介）；
 *  实体轻解码（&amp; &lt; &gt; &quot; &#39;），段落间 \n 由 formatYamlValue 落 fm 时单行化 */
export function parseBookIntro(html: string): string {
  const m = html.match(/<div class="intro">([\s\S]*?)<\/div>/);
  if (!m) return '';
  const paras = m[1].match(/<p>([\s\S]*?)<\/p>/g) || [];
  const lines = paras
    .map((p) => p.replace(/^<p>|<\/p>$/g, '').replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  return lines
    .join('\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** 纯函数：目录章节数（dir_<sid>_full 块按 <br/> 切段计数，剔除空段与「· · ·」收起标记）。
 *  实测锚点：短目录块在前（仅前几章），必须锚 _full 块；无目录块返回 null */
export function parseChapterCount(html: string): number | null {
  const m = html.match(/id="dir_\d+_full"[\s\S]*?>([\s\S]*?)<\/div>/);
  if (!m) return null;
  const segs = m[1].split(/<br\s*\/?>/)
    .map((s) => s.replace(/<[^>]+>/g, '').trim())
    .filter((s) => s && !/·\s·/.test(s));
  return segs.length > 0 ? segs.length : null;
}

/** 纯函数：图书详情页 HTML → 字段集（实测锚点见文件头；解析失败字段留空串） */
export function parseBookDetail(html: string): BookDetailInfo {
  const scoreM = html.match(/property="v:average">\s*([\d.]+)\s*</);
  const coverM = html.match(/<a class="nbg"[^>]*>\s*<img[^>]*src="([^"]+)"/);
  const infoStart = html.indexOf('<div id="info"');
  let infoText = '';
  if (infoStart >= 0) {
    // info 块截断：info 内无嵌套 div（实测锚点），首个 </div> 即闭合——防「内容简介/豆瓣评分」
    // 段落混入字段值（简介 截断会泄漏尾部文本进 ISBN，实测踩过）
    const rest = html.slice(infoStart, infoStart + 8000);
    const closeIdx = rest.indexOf('</div>');
    infoText = flattenInfoHtml(closeIdx > 0 ? rest.slice(0, closeIdx) : rest);
  }
  return {
    score: scoreM ? scoreM[1].trim() : '',
    author: infoValue(infoText, '作者', INFO_KEYS),
    publisher: infoValue(infoText, '出版社', INFO_KEYS),
    publisherBrand: infoValue(infoText, '出品方', INFO_KEYS),
    publishYear: infoValue(infoText, '出版年', INFO_KEYS),
    translator: infoValue(infoText, '译者', INFO_KEYS),
    isbn: infoValue(infoText, 'ISBN', INFO_KEYS),
    pages: infoValue(infoText, '页数', INFO_KEYS),
    intro: parseBookIntro(html),
    chapters: parseChapterCount(html),
    coverUrl: coverM ? upgradeBookCoverUrl(coverM[1]) : '',
  };
}

// ---------- 搜索 + 详情（两域共享链路骨架） ----------

export interface BookSearchHit {
  sid: string;
  doubanUrl: string;
  title: string;
  posterUrl: string;
}

export type BookFetchOutcome =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: 'blocked' | 'notfound' | 'network' | 'write' };

/** 搜索图书（统一搜索页 cat=1001；query = 书名 + 可选作者提命中），取第一条命中 */
export async function searchBook(query: string, deps: BookFetchDeps): Promise<{ hit?: BookSearchHit; reason?: 'blocked' | 'notfound' | 'network' }> {
  const headers: Record<string, string> = { Referer: 'https://book.douban.com/', 'Accept-Language': 'zh-CN,zh;q=0.9' };
  if (deps.doubanCookie) headers.Cookie = deps.doubanCookie;
  let html: string | null;
  try {
    html = await deps.httpGet(`https://www.douban.com/search?cat=1001&q=${encodeURIComponent(query)}`, headers);
  } catch {
    return { reason: 'network' };
  }
  if (searchLooksBlocked(html)) return { reason: 'blocked' };
  const results = parseSearchResults(html!);
  if (results.length === 0) return { reason: 'notfound' };
  const first = results[0];
  const sid = extractSid(first.detailUrl);
  if (!sid) return { reason: 'notfound' };
  return { hit: { sid, doubanUrl: first.detailUrl, title: first.title, posterUrl: first.posterUrl } };
}

/** 抓图书详情页（book.douban.com/subject/<sid>/；Cookie 注入） */
export async function fetchBookDetail(sid: string, deps: BookFetchDeps): Promise<BookDetailInfo | null> {
  const headers: Record<string, string> = { Referer: 'https://book.douban.com/' };
  if (deps.doubanCookie) headers.Cookie = deps.doubanCookie;
  let html: string | null;
  try {
    html = await deps.httpGet(`https://book.douban.com/subject/${sid}/`, headers);
  } catch {
    return null;
  }
  // 详情页无统一「结构存在性」判据（区别于搜索页的 result 块），只认关键字段锚点：
  // 评分锚点与 info 块锚点同时缺失判 blocked（风控拦截页两者必无）
  if (!html || (html.length < 8000 && !/property="v:average"/.test(html) && !html.includes('<div id="info"'))) return null;
  return parseBookDetail(html);
}

// ---------- 封面写盘 ----------

/** 封面扩展名推断（URL 后缀；缺省 jpg） */
function coverExt(url: string): string {
  return url.match(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i)?.[1] || 'jpg';
}

/** 下载并写封面；返回 vault 相对路径。下载失败/写盘失败 → null（调用方归 network/write 由 outcome 语义给出） */
export async function downloadCover(
  coverUrl: string, fileName: string, folder: string, deps: BookFetchDeps
): Promise<string | null> {
  let buf: ArrayBuffer | null;
  try {
    buf = await deps.downloadBinary(coverUrl, { Referer: 'https://book.douban.com/' });
  } catch {
    return null;
  }
  if (!buf) return null;
  try {
    await deps.mkdir(folder);
    const path = `${folder}/${fileName}.${coverExt(coverUrl)}`;
    await deps.writeBinary(path, buf);
    return path;
  } catch {
    return null;
  }
}

// ---------- md 书抓取 ----------

/** md 书搜索词：书名（basename）+ frontmatter 作者（存在且非「未知作者」时拼接，Q12 拍板提命中） */
export function mdBookQuery(basename: string, fmAuthor: string | null): string {
  const author = fmAuthor && fmAuthor !== '未知作者' ? fmAuthor.trim() : '';
  return author ? `${basename} ${author}` : basename;
}

/**
 * 单本 md 书抓取（队列执行器注入点；成功 = 豆瓣链接已写齐或本已齐全）。
 * 链路：资格复核（frontmatter 已有豆瓣链接 → skipped）→ 搜索 → 详情页 → 封面落
 * CONFIG/BOOK COVER → frontmatter 缺失才填（vault.process 原子写 + fresh 复核）。
 * 文件已删除 → skipped（队列扫书架快照，条目中途消失不算失败）。
 */
export async function fetchMdBookDouban(app: App, file: TFile, deps: BookFetchDeps, query?: string): Promise<BookFetchOutcome> {
  if (!app.vault.getAbstractFileByPath(file.path)) return { ok: true, skipped: true };
  let content: string;
  try {
    content = await app.vault.read(file);
  } catch {
    return { ok: false, reason: 'network' };
  }
  const doubanUrlRaw = fmFieldValue(content, '豆瓣链接');
  if (doubanUrlRaw && /^https?:\/\//.test(doubanUrlRaw)) return { ok: true, skipped: true };

  const name = file.basename.replace(/\.md$/i, '');
  const fmAuthor = fmFieldValue(content, '作者');
  const s = await searchBook(query || mdBookQuery(name, fmAuthor), deps);
  if (s.reason) return { ok: false, reason: s.reason };
  const hit = s.hit!;
  const detail = await fetchBookDetail(hit.sid, deps);
  if (!detail) return { ok: false, reason: 'blocked' };

  // 封面（无封面时落 BOOK COVER；下载失败不阻塞字段写入——评分/链接照常落）
  let coverRelative = fmFieldValue(content, '封面');
  let coverWriteFailed = false;
  if (!coverRelative && detail.coverUrl) {
    const written = await downloadCover(detail.coverUrl, `${safeFileName(name)}_${(deps.now || Date.now)()}`, BOOK_COVER_FOLDER, deps);
    if (written) coverRelative = written;
    else coverWriteFailed = true;
  }

  // 字段（缺失才填；Q3 全家桶）；豆瓣链接修正脏值（对齐影院口径 string 更新）
  const fields: Record<string, FmFieldSpec> = {};
  if (coverRelative) fields['封面'] = { value: coverRelative, ifMissing: true };
  fields['豆瓣链接'] = hit.doubanUrl;
  if (detail.score) fields['豆瓣评分'] = { value: detail.score, ifMissing: true };
  if (detail.author) fields['作者'] = { value: detail.author, ifMissing: true };
  if (detail.publisher) fields['出版社'] = { value: detail.publisher, ifMissing: true };
  if (detail.publishYear) fields['出版年'] = { value: detail.publishYear, ifMissing: true };
  if (detail.translator) fields['译者'] = { value: detail.translator, ifMissing: true };
  // ISBN 是标识符不是数量：quote 防裸写被 YAML number 化丢前导零（ISBN-10 场景）
  if (detail.isbn) fields['ISBN'] = { value: detail.isbn, ifMissing: true, quote: true };
  if (detail.pages) fields['页数'] = { value: detail.pages, ifMissing: true };
  if (detail.publisherBrand) fields['出品方'] = { value: detail.publisherBrand, ifMissing: true };
  if (detail.intro) fields['简介'] = { value: detail.intro, ifMissing: true };
  if (detail.chapters !== null) fields['总章节数'] = { value: String(detail.chapters), ifMissing: true };

  try {
    await app.vault.process(file, (c) => {
      let next = updateFrontmatterFields(c, fields);
      // 正文 embed：与影院海报同口径（FM 后插入、已存在跳过）；仅封面新落盘时插
      if (coverRelative && !fmFieldValue(c, '封面')) next = insertPosterEmbed(next, coverRelative);
      return next;
    });
  } catch {
    return { ok: false, reason: 'write' };
  }
  // 字段已落、仅封面下载失败 → ok（不空转重试整条链路；缺失才填保证下次 sweep 补封面）
  void coverWriteFailed;
  return { ok: true };
}

// ---------- EPUB 抓取 ----------

export interface EpubFetchTarget {
  /** EPUB 本体 vault 路径（sidecar 键） */
  vaultPath: string;
  title: string;
  author: string;
}

/** 读 sidecar（缺失/形态异常返回空表——sidecar 是纯衍生缓存，坏了重建无损失） */
export async function readSidecar(app: App, path: string): Promise<Record<string, BookDoubanRecord>> {
  try {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return {};
    const parsed = JSON.parse(await app.vault.adapter.read(path));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** EPUB 资格：sidecar 无该 vaultPath 记录或缺豆瓣链接（Q8 拍板全量自动） */
export function epubNeedsFetch(records: Record<string, BookDoubanRecord>, vaultPath: string | null): boolean {
  if (!vaultPath) return false;
  const rec = records[vaultPath];
  return !rec || !rec.doubanUrl;
}

/**
 * 单本 EPUB 抓取：搜索（title + author）→ 详情页 → 封面落 EPUB COVER 约定路径
 * （仅当无现有封面：meta.coverPath 已解析成 item.cover 由调用方判定传入）→ sidecar 段写。
 */
export async function fetchEpubBookDouban(
  app: App,
  target: EpubFetchTarget,
  deps: BookFetchDeps,
  opts: { sidecarPath: string; hasCover: boolean; now?: () => number }
): Promise<BookFetchOutcome> {
  const s = await searchBook(mdBookQuery(target.title, target.author), deps);
  if (s.reason) return { ok: false, reason: s.reason };
  const hit = s.hit!;
  const detail = await fetchBookDetail(hit.sid, deps);
  if (!detail) return { ok: false, reason: 'blocked' };

  // 封面：约定路径 CONFIG/BOOK/EPUB COVER/<title>.<ext>（resolveEpubCoverPath 拾取口径）；
  // 已有封面（coverPath 或约定文件已存在）不覆盖（Q11 拍板）
  let coverPath: string | undefined;
  if (!opts.hasCover && detail.coverUrl) {
    const written = await downloadCover(detail.coverUrl, safeFileName(target.title), EPUB_COVER_FOLDER, deps);
    if (written) coverPath = written;
  }

  const record: BookDoubanRecord = {
    doubanUrl: hit.doubanUrl,
    title: target.title,
    score: detail.score,
    author: detail.author || target.author,
    publisher: detail.publisher,
    publishYear: detail.publishYear,
    translator: detail.translator,
    isbn: detail.isbn,
    ...(detail.pages ? { pages: detail.pages } : {}),
    ...(detail.publisherBrand ? { publisherBrand: detail.publisherBrand } : {}),
    ...(detail.intro ? { intro: detail.intro } : {}),
    ...(detail.chapters !== null ? { chapters: detail.chapters } : {}),
    ...(coverPath ? { coverPath } : {}),
    fetchedAt: (opts.now || Date.now)(),
  };
  try {
    await updateFileSections<Record<string, BookDoubanRecord>>(opts.sidecarPath, (cur) => ({ [target.vaultPath]: { ...cur[target.vaultPath], ...record } }), { app });
  } catch {
    return { ok: false, reason: 'write' };
  }
  return { ok: true };
}

// ---------- 自动上架（票 301 追加决策 Q16b：书架 → 娱乐，单向） ----------

/** 自动上架数据源（md 书 = 抓取后的 frontmatter；EPUB = sidecar 记录） */
export interface CinemaShelfSource {
  title: string;
  doubanUrl: string;
  score?: string;
  author?: string;
  publisher?: string;
  publishYear?: string;
  translator?: string;
  isbn?: string;
  pages?: string;
  publisherBrand?: string;
  intro?: string;
  chapters?: number;
  coverPath?: string;
}

/** md 书抓取后的 frontmatter → 上架数据源（无豆瓣链接 = 尚未抓到，返回 null 不上架） */
export function mdShelfSourceFromContent(content: string, title: string): CinemaShelfSource | null {
  const doubanUrl = fmFieldValue(content, '豆瓣链接');
  if (!doubanUrl || !/^https?:\/\//.test(doubanUrl)) return null;
  return {
    title,
    doubanUrl,
    score: fmFieldValue(content, '豆瓣评分') ?? undefined,
    author: fmFieldValue(content, '作者') ?? undefined,
    publisher: fmFieldValue(content, '出版社') ?? undefined,
    publishYear: fmFieldValue(content, '出版年') ?? undefined,
    translator: fmFieldValue(content, '译者') ?? undefined,
    isbn: fmFieldValue(content, 'ISBN') ?? undefined,
    pages: fmFieldValue(content, '页数') ?? undefined,
    publisherBrand: fmFieldValue(content, '出品方') ?? undefined,
    intro: fmFieldValue(content, '简介') ?? undefined,
    chapters: fmFieldValue(content, '总章节数') !== null ? Number(fmFieldValue(content, '总章节数')) || undefined : undefined,
    coverPath: fmFieldValue(content, '封面') ?? undefined,
  };
}

/** EPUB sidecar 记录 → 上架数据源 */
export function shelfSourceFromRecord(rec: BookDoubanRecord): CinemaShelfSource {
  return {
    title: rec.title,
    doubanUrl: rec.doubanUrl,
    score: rec.score || undefined,
    author: rec.author || undefined,
    publisher: rec.publisher || undefined,
    publishYear: rec.publishYear || undefined,
    translator: rec.translator || undefined,
    isbn: rec.isbn || undefined,
    pages: rec.pages || undefined,
    publisherBrand: rec.publisherBrand || undefined,
    intro: rec.intro || undefined,
    chapters: rec.chapters || undefined,
    coverPath: rec.coverPath,
  };
}

/**
 * 自动上架：娱乐目录无同名书籍笔记时创建一条（tags: [书籍] + 豆瓣字段 + 封面 embed），
 * 书库的书随即出现在影院墙书籍分类（Q16b）。已存在（同名即视为同一本）跳过 → false。
 * 单向：只建娱乐笔记，绝不反向改书库。创建失败（目录缺失等）静默 false——上架是
 * 附带产物，不阻塞/不污染抓取结果。
 */
export async function ensureCinemaShelfNote(app: App, src: CinemaShelfSource): Promise<boolean> {
  if (!src.title || !src.doubanUrl) return false;
  const path = `${resolveCinemaFolderPath()}/${safeFileName(src.title)}.md`;
  if (app.vault.getAbstractFileByPath(path)) return false;
  try {
    // 最小骨架（tags 走 YAML 列表形态，对齐影院解析读法）→ updateFrontmatterFields
    // 复用 YAML 序列化/quote 口径填字段 → 封面 embed 同海报口径插 FM 后
    let content = '---\ntags:\n  - 书籍\n---\n';
    const fields: Record<string, FmFieldSpec> = {};
    if (src.coverPath) fields['封面'] = src.coverPath;
    if (src.score) fields['豆瓣评分'] = src.score;
    if (src.author) fields['作者'] = src.author;
    if (src.publisher) fields['出版社'] = src.publisher;
    if (src.publishYear) fields['出版年'] = src.publishYear;
    if (src.translator) fields['译者'] = src.translator;
    if (src.isbn) fields['ISBN'] = { value: src.isbn, ifMissing: false, quote: true };
    if (src.pages) fields['页数'] = src.pages;
    if (src.publisherBrand) fields['出品方'] = src.publisherBrand;
    if (src.intro) fields['简介'] = src.intro;
    if (src.chapters) fields['总章节数'] = String(src.chapters);
    fields['豆瓣链接'] = src.doubanUrl;
    content = updateFrontmatterFields(content, fields);
    if (src.coverPath) content = insertPosterEmbed(content, src.coverPath);
    await app.vault.create(path, content);
    return true;
  } catch {
    return false;
  }
}

/** md 书抓取成功后自动上架（队列与重抓共用；读 fresh 内容提字段） */
export async function ensureShelfNoteForMdBook(app: App, file: TFile): Promise<void> {
  try {
    const content = await app.vault.read(file);
    const src = mdShelfSourceFromContent(content, file.basename);
    if (src) await ensureCinemaShelfNote(app, src);
  } catch { /* 上架是附带产物，读失败不阻塞 */ }
}

// ---------- 重抓（票 301 追加决策 Q15：抓错了清掉重来） ----------

/** 书籍重抓清除的 frontmatter 键（含 作者——作者属豆瓣来源字段，重抓回填；9-23 解析 bug
 *  曾把译者吞进作者值，纳入清理才能自愈。不含 正在看章节——用户阅读进度，重抓绝不动） */
export const BOOK_REFETCH_FM_KEYS = ['豆瓣链接', '豆瓣评分', '作者', '出版社', '出版年', '译者', 'ISBN', '页数', '出品方', '简介', '总章节数', '封面'];
/** 书籍封面 embed 目录标识（清旧 embed 行用） */
export const BOOK_EMBED_MARKERS = [BOOK_COVER_FOLDER];

/**
 * md 书重抓：清豆瓣字段 + 旧封面 embed → 按给定搜索词重跑抓取（豆瓣链接已清，
 * fetchMdBookDouban 的 skipped 复核天然放行）→ 成功后自动上架（Q16b）。
 * query 为空 = 自动词（书名 + fm 作者）；重抓命令弹框让用户改词/补 ISBN。
 */
export async function refetchMdBookDouban(app: App, file: TFile, deps: BookFetchDeps, query?: string): Promise<BookFetchOutcome> {
  try {
    await app.vault.process(file, (c) => clearDoubanContent(c, BOOK_REFETCH_FM_KEYS, BOOK_EMBED_MARKERS));
  } catch {
    return { ok: false, reason: 'write' };
  }
  const outcome = await fetchMdBookDouban(app, file, deps, query || undefined);
  if (outcome.ok && !outcome.skipped) await ensureShelfNoteForMdBook(app, file);
  return outcome;
}
