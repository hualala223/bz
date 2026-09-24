/**
 * 影院豆瓣抓取核心（issue 303 / ADR-0129）：自 tools/obsidian-douban-poster 移植入插件。
 * 字段链（用户拍板）：搜索豆瓣（搜索页正则解析）→ **ApiZero 豆瓣电影信息接口**（评分/导演/
 * 主演/类型/地区/片长首选 + 上映日期←year/热门短评，key 设置项）→ rexxar 演职员兜底
 * （缺导演/主演或需编剧时）；海报走豆瓣（搜索页提 URL → upgradePosterUrl 高清 → writeBinary 写盘）。
 * 豆瓣详情页 HTML 退役（字段已由 ApiZero 承接）；移动端同源可用。
 * 写回口径（审查 C8/C9 拍板）：除豆瓣链接（修正脏值）外一律「缺失才填」——已有值
 * （含用户手工修正）不覆盖；ApiZero 逗号列表值写入前归一化为消费端的 ` / ` 切分口径（C2）。
 * 纯逻辑 + 依赖注入（httpGet / downloadBinary），node 环境可测。
 * 票 301 / ADR-0130：共享纯函数上沉 src/core/douban/fetch-core.ts 单点维护（书架书籍抓取
 * 共用「缺失才填」写入口径），此处 re-export 兼容既有引用与测试；HTTP/写盘等副作用与
 * 影视专用字段链（ApiZero/rexxar）仍由本文件持有。
 */
import type { App, TFile } from 'obsidian';
import { episodesEligibleTag } from './constants';
import {
  parseSearchResults, searchLooksBlocked, upgradePosterUrl, normalizeListValue, extractSid,
  updateFrontmatterFields, insertPosterEmbed, fmFieldValue, clearDoubanContent,
  type HttpGet, type DownloadBinary, type FmFieldSpec,
} from '../core/douban/fetch-core';

// 共享纯函数 re-export（票 301：单点在 core，本域与测试的既有 import 路径不变）
export {
  parseSearchResults, searchLooksBlocked, upgradePosterUrl, normalizeListValue, extractSid,
  updateFrontmatterFields, insertPosterEmbed, fmFieldValue, safeFileName,
  type HttpGet, type DownloadBinary, type DoubanSearchResult, type FmFieldSpec,
} from '../core/douban/fetch-core';

/** 海报目录（对齐 CLI config 默认值） */
export const POSTER_FOLDER = 'CONFIG/MOVIE POSTER';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BILIBILI_NONE = ''; // 占位防误用（无实际引用）

void BILIBILI_NONE;

// ---------- 依赖注入 ----------

export interface DoubanFetchDeps {
  httpGet: HttpGet;
  downloadBinary: DownloadBinary;
  /** adapter.writeBinary 适配 */
  writeBinary: (path: string, data: ArrayBuffer) => Promise<void>;
  /** 海报目录不存在时建目录（adapter.mkdir） */
  mkdir: (path: string) => Promise<void>;
  /** ApiZero Key（设置项；空 = 不走 ApiZero，字段落 rexxar 兜底） */
  apizeroKey?: string;
  /** 豆瓣 Cookie（设置项，可选；注入搜索/rexxar 请求头） */
  doubanCookie?: string;
  now?: () => number;
}

// ---------- 影视专用纯函数（通用纯函数已上沉 core/douban/fetch-core，见顶部 re-export） ----------

/** 从文件名提取影视名称（《名称》.md 与 名称.md 两种格式，照搬 note-processor） */
export function extractMovieName(filename: string): string {
  const basename = filename.replace(/\.md$/i, '');
  const m = basename.match(/《(.+)》/);
  return m ? m[1] : basename;
}

/** 纯函数：fm tags 块提取类型 tag 列表（抓取器内判定剧集资格；sweep 侧 item.typeTag 同源口径）。
 *  兼容两种形态：块列表（tags:\n- 电影 / 缩进 - 电视剧）与行内数组（tags: [电影]） */
export function fmTags(content: string): string[] {
  const out: string[] = [];
  const inline = /^tags:\s*\[(.+)\]\s*$/m.exec(content);
  if (inline) return inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  let inTags = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^tags:\s*(#.*)?$/.test(line)) { inTags = true; continue; }
    if (!inTags) continue;
    if (/^\s+-\s/.test(line)) {
      const v = line.replace(/^\s+-\s*/, '').trim().replace(/^["']|["']$/g, '');
      if (v) out.push(v);
    } else {
      break; // 列表结束（空行继续容忍由下一行非列表项触发 break）
    }
  }
  return out;
}

/** 纯函数：该笔记是否剧集类型（任一 tag 归一后命中 电视剧/短剧）——总集数写入门槛 */
export function noteEpisodesEligible(content: string): boolean {
  return fmTags(content).some((t) => episodesEligibleTag(t));
}

export interface CelebritiesInfo {
  directors: string;
  writers: string;
  casts: string;
  mediaType: 'tv' | 'movie' | null;
}

/** 纯函数：rexxar Celebrities JSON → 导演/编剧/主演（照搬 parseCelebrities；主演截前 6） */
export function parseCelebrities(data: any): { directors: string; writers: string; casts: string } {
  if (!data || data.msg) return { directors: '', writers: '', casts: '' };
  const directors = (data.directors || []).map((d: any) => d.name || d).join(' / ');
  const ws = (data.celebrities || []).filter((c: any) => (c.roles || []).some((r: string) => /编剧/.test(r)));
  const writers = ws.map((w: any) => w.name).join(' / ');
  const actors = data.actors || [];
  const casts = actors.length
    ? (typeof actors[0] === 'object' ? actors.slice(0, 6).map((a: any) => a.name || '').filter(Boolean) : actors.slice(0, 6)).join(' / ')
    : '';
  return { directors, writers, casts };
}

// ---------- ApiZero 客户端 ----------

export interface ApizeroInfo {
  name: string;
  year: string;
  score: string;
  director: string;
  actor: string;
  genre: string;
  area: string;
  duration: string;
  /** ApiZero 返回为总集数，非季数，勿作季集写入（审查 C1 撤回：季集是季数口径，见 ADR-0129 修订更正） */
  episodes: string;
  isTv: boolean;
  doubanUrl: string;
  /** 热门短评 + 作者（issue 303 字段扩展，ADR-0129 修订：可选风味字段） */
  shortComment: string;
  commentAuthor: string;
}

/** ApiZero 豆瓣电影信息接口（v1.apizero.cn/api/douban-movie?id=<sid>，Bearer key）。
 *  code !== 0（无效 id/额度耗尽等）→ null，交上层走 rexxar 兜底 */
export async function fetchApizeroInfo(sid: string, key: string, httpGet: HttpGet): Promise<ApizeroInfo | null> {
  const text = await httpGet(`https://v1.apizero.cn/api/douban-movie?id=${encodeURIComponent(sid)}`, {
    Authorization: `Bearer ${key}`,
  });
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    if (!j || j.code !== 0 || !j.data) return null;
    const d = j.data;
    return {
      name: String(d.name ?? ''),
      year: String(d.year ?? ''),
      score: String(d.score ?? ''),
      director: String(d.director ?? ''),
      actor: String(d.actor ?? ''),
      genre: String(d.genre ?? ''),
      area: String(d.area ?? ''),
      duration: String(d.duration ?? ''),
      episodes: String(d.episodes ?? ''),
      isTv: d.is_tv === true,
      doubanUrl: String(d.douban_url || `https://movie.douban.com/subject/${sid}/`),
      shortComment: String(d.short_comment ?? ''),
      commentAuthor: String(d.comment_author ?? ''),
    };
  } catch {
    return null;
  }
}

// ---------- 端到端抓取 ----------

/** rexxar 演职员探测（tv 优先 404 判电影，照搬 fetchSubjectInfo 第 2 步；带 Cookie 注入） */
export async function fetchCelebrities(sid: string, httpGet: HttpGet, cookie?: string): Promise<CelebritiesInfo | null> {
  const headers: Record<string, string> = { Referer: `https://m.douban.com/movie/subject/${sid}/` };
  if (cookie) headers.Cookie = cookie;
  for (const type of ['tv', 'movie'] as const) {
    const text = await httpGet(`https://m.douban.com/rexxar/api/v2/${type}/${sid}/celebrities`, headers);
    if (text && text.length > 150) {
      try {
        const data = JSON.parse(text);
        if (!data.msg) {
          const c = parseCelebrities(data);
          return { ...c, mediaType: type };
        }
      } catch { /* 非 JSON 下一类型 */ }
    }
  }
  return null;
}

export type DoubanFetchOutcome =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: 'blocked' | 'notfound' | 'network' | 'write' };

/** frontmatter 行级字段读取（共享 fmFieldValue 的域内别名，调用点语义不变） */
const fieldValue = fmFieldValue;

/**
 * 单条笔记抓取（队列执行器注入点；成功 = 海报与豆瓣链接都写齐或本已齐全）。
 * 链路：搜索（风控检测）→ 海报下载写盘（无海报时）→ ApiZero 字段 + rexxar 兜底 → frontmatter 写入。
 * 搜索失败/网络异常 → network；搜索风控 → blocked；海报下载失败 → network；写盘失败 → write。
 * 写回经 vault.process：字段一律「缺失才填」并基于回调内 fresh 内容复核（C8），
 * 抓取期间用户手改不会被覆盖。
 */
export async function fetchNoteDouban(app: App, file: TFile, deps: DoubanFetchDeps, opts?: { query?: string }): Promise<DoubanFetchOutcome> {
  const name = extractMovieName(file.name);
  let content: string;
  try {
    content = await app.vault.read(file);
  } catch {
    return { ok: false, reason: 'network' };
  }
  const hasPoster = !!(fieldValue(content, '海报'));
  const doubanUrlRaw = fieldValue(content, '豆瓣链接');
  const hasDoubanInfo = !!doubanUrlRaw && /^https?:\/\//.test(doubanUrlRaw);
  if (hasPoster && hasDoubanInfo) return { ok: true, skipped: true };

  // 1. 搜索（豆瓣搜索页；Cookie 注入）。网络异常上抛接住归 network（C6：不与风控混淆）。
  //  query 覆盖（票 301 Q15 重抓）：重抓命令允许用户改搜索词（默认 = 笔记名）
  const searchHeaders: Record<string, string> = { Referer: 'https://movie.douban.com/', 'Accept-Language': 'zh-CN,zh;q=0.9' };
  if (deps.doubanCookie) searchHeaders.Cookie = deps.doubanCookie;
  let html: string | null;
  try {
    html = await deps.httpGet(`https://www.douban.com/search?cat=1002&q=${encodeURIComponent(opts?.query || name)}`, searchHeaders);
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (searchLooksBlocked(html)) return { ok: false, reason: 'blocked' };
  const results = parseSearchResults(html!);
  if (results.length === 0) return { ok: false, reason: 'notfound' };
  const first = results[0];
  const sid = extractSid(first.detailUrl);
  if (!sid) return { ok: false, reason: 'notfound' };

  // 2. 海报（无海报时：高清 URL → 二进制 → 写盘 → frontmatter + 正文 embed）。
  //  下载失败（抛错/null）归 network，写盘失败归 write（C6：下载与落盘失败语义拆分）
  let posterRelative = fieldValue(content, '海报');
  if (!hasPoster && first.posterUrl) {
    let buf: ArrayBuffer | null;
    try {
      buf = await deps.downloadBinary(upgradePosterUrl(first.posterUrl), { Referer: 'https://movie.douban.com/' });
    } catch {
      return { ok: false, reason: 'network' };
    }
    if (!buf) return { ok: false, reason: 'network' };
    try {
      await deps.mkdir(POSTER_FOLDER);
      const ext = first.posterUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i)?.[1] || 'jpg';
      const safeName = name.replace(/[/\\:*?"<>|]/g, '_');
      const fileName = `${safeName}_${(deps.now || Date.now)()}.${ext}`;
      posterRelative = `${POSTER_FOLDER}/${fileName}`;
      await deps.writeBinary(posterRelative, buf);
    } catch {
      return { ok: false, reason: 'write' };
    }
  }

  // 3. 字段：ApiZero 首选 → rexxar 兜底（缺导演/主演或需编剧）。
  //  口径（C9）：除豆瓣链接（修正脏值）外一律缺失才填——「已有」判断交给写回时基于
  //  fresh 内容复核（C8），此处不再依赖抓取开始时的快照
  const fields: Record<string, FmFieldSpec> = {};
  if (posterRelative) fields['海报'] = { value: posterRelative, ifMissing: true };
  fields['豆瓣链接'] = first.detailUrl;
  let az: ApizeroInfo | null = null;
  if (deps.apizeroKey) {
    az = await fetchApizeroInfo(sid, deps.apizeroKey, deps.httpGet);
    if (az) {
      if (az.score) fields['豆瓣评分'] = { value: az.score, ifMissing: true };
      if (az.director) fields['导演'] = { value: normalizeListValue(az.director), ifMissing: true };
      if (az.actor) fields['主演'] = { value: normalizeListValue(az.actor), ifMissing: true };
      if (az.genre) fields['类型'] = { value: normalizeListValue(az.genre), ifMissing: true };
      if (az.area) fields['制片国家/地区'] = { value: normalizeListValue(az.area), ifMissing: true };
      if (az.duration) fields['片长'] = { value: az.duration, ifMissing: true };
      // issue 303 字段扩展（ADR-0129 修订）：上映日期降级年份、热门短评，均缺失才填。
      // 季集←episodes 已撤回（C1）：episodes 是总集数非季数，勿写入「季集」。
      // 总集数（票 301 追加）：episodes 即总集数口径，落 fm「总集数」正确落点——仅剧集类型
      // （电视剧/短剧，含旧 tag 归一）且缺失才填；电影不写。
      if (az.year) fields['上映日期'] = { value: az.year, ifMissing: true };
      if (az.shortComment) fields['热门短评'] = { value: az.shortComment, ifMissing: true };
      if (az.episodes && noteEpisodesEligible(content)) fields['总集数'] = { value: az.episodes, ifMissing: true };
    }
  }
  const needCelebrities = !az || !az.director || !az.actor;
  if (needCelebrities) {
    const cel = await fetchCelebrities(sid, deps.httpGet, deps.doubanCookie);
    if (cel) {
      if (!fields['导演'] && cel.directors) fields['导演'] = { value: cel.directors, ifMissing: true };
      if (cel.writers) fields['编剧'] = { value: cel.writers, ifMissing: true };
      if (!fields['主演'] && cel.casts) fields['主演'] = { value: cel.casts, ifMissing: true };
    }
  }

  // 4. 写入（vault.process 原子读改写；海报 embed 先于字段更新算好内容一次写）。
  //  fresh 复核（C8）：缺失才填由 updateFrontmatterFields 基于 c 复核；embed 仅当
  //  fresh 内容确无海报字段时插入（抓取中途用户贴海报则跳过）
  try {
    await app.vault.process(file, (c) => {
      let next = updateFrontmatterFields(c, fields);
      if (posterRelative && !hasPoster && !fieldValue(c, '海报')) next = insertPosterEmbed(next, posterRelative);
      return next;
    });
  } catch {
    return { ok: false, reason: 'write' };
  }
  return { ok: true };
}

// ---------- 重抓前置清理（票 301 追加决策 Q15） ----------

/** 影视重抓清除的 frontmatter 键（豆瓣来源全套 + 海报；用户自有字段——评分/状态/感想——不动） */
export const MOVIE_REFETCH_FM_KEYS = ['海报', '豆瓣链接', '豆瓣评分', '导演', '主演', '编剧', '类型', '制片国家/地区', '片长', '上映日期', '热门短评'];

/** 影视重抓前置清理：vault.process 原子清豆瓣字段 + 旧海报 embed（D3：写盘走域 fetcher 单点） */
export async function clearMovieDoubanFields(app: App, file: TFile): Promise<void> {
  await app.vault.process(file, (c) => clearDoubanContent(c, MOVIE_REFETCH_FM_KEYS, [POSTER_FOLDER]));
}
