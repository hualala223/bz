/**
 * 书架豆瓣抓取队列（票 301 / ADR-0130）：复刻影院队列口径（ADR-0113/0129）——
 * 插件内存队列 → 串行执行插件内 fetcher；15s 间隔防限流，单条 3 分钟硬超时（Promise.race）；
 * 会话去重 / 失败聚合通知（风控分文案）/ 全平台启用（requestUrl 移动端可用）。
 * 与影院的差异（Q13 拍板一期不做 UI）：无卡片 loading 驱动（isFetching/waitAhead 整类省略）；
 * sweep 异步（EPUB 资格需读 sidecar）；完成后 rebuildItems + renderFn 刷新（面板开着才刷）。
 * 资格口径（Q8 拍板全量自动）：md 书 frontmatter 缺「豆瓣链接」；EPUB sidecar 缺记录。
 */
import type { App, TFile } from 'obsidian';
import { requestUrl } from 'obsidian';
import { notice } from '../core/notice';
import { sleep } from '../core/utils';
import { tryGetSettings } from '../core/settings-provider';
import { storageDir } from '../core/storage';
import { M } from './state';
import { rebuildItems } from './data';
import {
  fetchMdBookDouban, fetchEpubBookDouban, readSidecar, epubNeedsFetch,
  sidecarPathOf, DOUBAN_UA, ensureShelfNoteForMdBook, ensureCinemaShelfNote, shelfSourceFromRecord,
  type BookFetchDeps, type BookFetchOutcome, type EpubFetchTarget,
} from './douban-fetcher';

/** 条目间隔 ms（防豆瓣限流，对齐影院） */
const FETCH_GAP_MS = 15000;
/** 单条硬超时 ms（Promise.race 兜底） */
export const FETCH_TIMEOUT_MS = 3 * 60 * 1000;
/** 单请求超时 ms（requestUrl 不支持中止 → Promise.race） */
const HTTP_TIMEOUT_MS = 15000;

type QueueEntry =
  | { kind: 'md'; path: string; file: TFile; title: string }
  | { kind: 'epub'; path: string; target: EpubFetchTarget; hasCover: boolean };

/** 执行器抽象（测试注入点） */
export type FetchBook = (entry: QueueEntry) => Promise<BookFetchOutcome>;

export type { QueueEntry };

const queue: QueueEntry[] = [];
/** 会话内去重：已入队/已处理过的路径，同会话不重复补抓 */
const attempted = new Set<string>();
const failedNames: string[] = [];
/** 风控失败单独聚合（文案区分：重启 Obsidian 重载插件后随 sweep 自动重试） */
let blockedNames: string[] = [];
let pumping = false;
/** 测试注入 */
let fetchFn: FetchBook | null = null;
let gapMs = FETCH_GAP_MS;
/** 抓取完成后延迟重建渲染的间隔（等 metadataCache 消化磁盘变化；测试注 0） */
let refreshDelayMs = 1500;

// ---------- requestUrl 适配（生产默认 HTTP 通道；与影院 douban-queue 同口径） ----------

async function httpGet(url: string, headers?: Record<string, string>): Promise<string | null> {
  const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), HTTP_TIMEOUT_MS));
  const req = requestUrl({ url, method: 'GET', headers, throw: false }).then((resp) => {
    return resp.status >= 200 && resp.status < 300 ? resp.text : null;
  });
  req.catch(() => {}); // race 选中 timer 时消化 rejection，防 unhandled
  return await Promise.race([req, timer]);
}

async function downloadBinary(url: string, headers?: Record<string, string>): Promise<ArrayBuffer | null> {
  const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), HTTP_TIMEOUT_MS * 2));
  const req = requestUrl({ url, method: 'GET', headers, throw: false }).then((resp) => {
    return resp.status >= 200 && resp.status < 300 ? resp.arrayBuffer : null;
  });
  req.catch(() => {});
  return await Promise.race([req, timer]);
}

/** 从插件设置读抓取依赖（豆瓣 Cookie 读影院设置共用，ADR-0130 决策 4；重抓命令复用） */
export function fetchDepsFromSettings(app: App): BookFetchDeps {
  const s = (tryGetSettings() ?? {}) as Record<string, unknown>;
  const adapter = (app.vault as unknown as { adapter?: { writeBinary?: (p: string, d: ArrayBuffer) => Promise<void>; mkdir?: (p: string) => Promise<void> } }).adapter;
  const uaHeaders = { 'User-Agent': DOUBAN_UA };
  return {
    httpGet: (url, headers) => httpGet(url, { ...uaHeaders, ...(headers || {}) }),
    downloadBinary: (url, headers) => downloadBinary(url, { ...uaHeaders, ...(headers || {}) }),
    writeBinary: async (path, data) => {
      if (!adapter?.writeBinary) throw new Error('adapter.writeBinary 不可用');
      await adapter.writeBinary(path, data);
    },
    mkdir: async (path) => {
      await adapter?.mkdir?.(path);
    },
    doubanCookie: typeof s.cinemaDoubanCookie === 'string' ? s.cinemaDoubanCookie.trim() : '',
  };
}

/** 测试注入：替换执行器 / 条目间隔 / 完成后刷新延迟 */
export function configureFetchQueue(hooks: {
  fetch?: FetchBook;
  gapMs?: number;
  refreshDelayMs?: number;
}): void {
  if (hooks.fetch) fetchFn = hooks.fetch;
  if (hooks.gapMs !== undefined) gapMs = hooks.gapMs;
  if (hooks.refreshDelayMs !== undefined) refreshDelayMs = hooks.refreshDelayMs;
}

/** 入队（会话内去重）；全平台启用。返回是否真入队 */
export function enqueueBookFetch(entry: QueueEntry): boolean {
  if (attempted.has(entry.path)) return false;
  attempted.add(entry.path);
  queue.push(entry);
  void pump();
  return true;
}

/**
 * 面板打开扫描（异步：EPUB 资格需读 sidecar）：md 缺「豆瓣链接」（metadataCache 预判，
 * fetcher 内 fresh 复核）与 EPUB 缺 sidecar 记录的条目入队补抓。
 * 期间面板开着 → 完成后 rebuild 刷新（Q13：无 loading，静默补齐）。
 */
export async function sweepBookFetch(app: App): Promise<void> {
  if (pumping) return; // 队列在跑：会话去重已覆盖，避免 sidecar 读放大
  const records = await readSidecar(app, sidecarPathOf(storageDir()));
  let added = 0;
  for (const it of M.items) {
    if (it.isEpub) {
      if (!epubNeedsFetch(records, it.epubVaultPath)) continue;
      if (enqueueBookFetch({ kind: 'epub', path: it.epubVaultPath!, target: { vaultPath: it.epubVaultPath!, title: it.title, author: it.author }, hasCover: !!it.cover })) added++;
    } else if (it.file) {
      const fm = app.metadataCache.getFileCache(it.file)?.frontmatter as Record<string, unknown> | undefined;
      const link = fm?.['豆瓣链接'];
      if (typeof link === 'string' && /^https?:\/\//.test(link)) continue;
      if (enqueueBookFetch({ kind: 'md', path: it.file.path, file: it.file, title: it.title })) added++;
    }
  }
  if (added > 0) void refreshAfterFetch(0);
}

/** 执行单条：注入执行器优先；默认 = 按条目类型跑插件内 fetcher + 3 分钟硬超时 */
async function runOne(entry: QueueEntry): Promise<BookFetchOutcome> {
  const fn = fetchFn ?? defaultFetchBook;
  try {
    return await Promise.race([
      fn(entry),
      new Promise<BookFetchOutcome>((resolve) => setTimeout(() => resolve({ ok: false, reason: 'network' }), FETCH_TIMEOUT_MS)),
    ]);
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** 默认执行器：组装设置依赖跑插件内抓取；成功后自动上架娱乐（Q16b，测试注入执行器不触发） */
async function defaultFetchBook(entry: QueueEntry): Promise<BookFetchOutcome> {
  const app = M.appRef;
  if (!app) return { ok: false, reason: 'network' };
  const deps = fetchDepsFromSettings(app);
  if (entry.kind === 'md') {
    const r = await fetchMdBookDouban(app, entry.file, deps);
    if (r.ok && !r.skipped) await ensureShelfNoteForMdBook(app, entry.file);
    return r;
  }
  const r = await fetchEpubBookDouban(app, entry.target, deps, { sidecarPath: sidecarPathOf(storageDir()), hasCover: entry.hasCover });
  if (r.ok && !r.skipped) {
    const records = await readSidecar(app, sidecarPathOf(storageDir()));
    const rec = records[entry.target.vaultPath];
    if (rec) await ensureCinemaShelfNote(app, shelfSourceFromRecord(rec));
  }
  return r;
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    let first = true;
    while (queue.length > 0) {
      const entry = queue.shift()!;
      if (!first) await sleep(gapMs);
      first = false;
      const r = await runOne(entry);
      if (!r.ok) {
        if (r.reason === 'blocked') blockedNames.push(entry.kind === 'md' ? entry.title : entry.target.title);
        else failedNames.push(entry.kind === 'md' ? entry.title : entry.target.title);
      }
      // 完成即刷新（抓取落盘 → metadataCache 消化 → 书架条目更新；面板关着时 no-op）
      void refreshAfterFetch(refreshDelayMs);
    }
  } finally {
    pumping = false;
  }
  // 失败聚合通知：风控与一般失败分开文案（会话语义与影院一致：重载插件后随 sweep 自动重试）
  if (blockedNames.length > 0) {
    notice(`豆瓣风控拦截，以下书籍本轮未抓到：${blockedNames.join('、')}（重启 Obsidian（重载插件）后会自动重试）`, 'error');
    blockedNames = [];
  }
  if (failedNames.length > 0) {
    notice(`以下书籍豆瓣信息获取失败：${failedNames.join('、')}（重启 Obsidian（重载插件）后会自动重试）`, 'error');
    failedNames.length = 0;
  }
}

/** 抓取落盘后刷新：立即一次 + 延迟一次（等 metadataCache 消化磁盘变化）；面板关着时 no-op */
async function refreshAfterFetch(delayMs: number): Promise<void> {
  const app = M.appRef;
  if (!app || !M.currentOverlay) return;
  await rebuildItems(app);
  M.renderFn?.();
  if (delayMs > 0) {
    setTimeout(() => {
      if (!M.currentOverlay || !M.appRef) return;
      void rebuildItems(M.appRef).then(() => M.renderFn?.());
    }, delayMs);
  }
}

/** 插件卸载：清队列与状态（会话语义重置） */
export function shutdownBookQueue(): void {
  queue.length = 0;
  attempted.clear();
  failedNames.length = 0;
  blockedNames = [];
  pumping = false;
}
