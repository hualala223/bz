/**
 * 日常收集（collect 域）IO 薄壳（issue 246）。
 *
 * 依赖方向（ADR-0002）：core ← data（纯层）← store ← ui。本文件是唯一触碰 vault 的一层：
 * 读文件 → 调纯函数 → 写文件；无 DOM、无通知（结果由 UI 层决定）。
 *
 * 写入策略：
 *  - 目标目录不存在自动创建（逐段建，兼容多级目录）；
 *  - 目标文件不存在 → 以 `initialFileContent()` 建文件；存在 → 读原文追加后 modify；
 *  - 与 QuickAdd 宏同格式共写，两者共存互不干扰。
 * 只读聚合（home 快照消费）：目标文件缺失/为空一律跳过，不建目录不建文件。
 */
import type { CollectCategory, CollectEntry } from './data';
import {
  appendCollect, categoryFilePath, getCategories, getCollectFolder, initialFileContent, parseEntries,
} from './data';
import { enqueueFileTask } from '../core/storage';

/** 捕获结果（UI 层据此提示） */
export interface CaptureResult {
  /** 写入的目标文件路径 */
  path: string;
  /** 是否新建了文件 */
  created: boolean;
  /** 本次写入条目数 */
  count: number;
}

function fileAt(app: any, path: string): any | null {
  try {
    return app?.vault?.getAbstractFileByPath?.(path) ?? null;
  } catch {
    return null;
  }
}

/** 逐段建目录（已存在则跳过；失败静默——后续 create 会报真实错误） */
export async function ensureFolder(app: any, folder: string): Promise<void> {
  const dir = (folder || '').replace(/^\/+|\/+$/g, '');
  if (!dir) return;
  const parts = dir.split('/');
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (fileAt(app, cur)) continue;
    try {
      await app.vault.createFolder(cur);
    } catch {
      /* 并发创建/无权限：由写入阶段兜底报错 */
    }
  }
}

/** 读取文件原文（不存在返回 null） */
export async function readFileText(app: any, path: string): Promise<string | null> {
  const f = fileAt(app, path);
  if (!f) return null;
  try {
    return await app.vault.read(f);
  } catch {
    return null;
  }
}

/**
 * 捕获写入：把内容按分类追加到目标文件（文件/目录缺失自动创建）。
 * 内容为空返回 null（调用方不写盘、不提示成功）。
 */
export async function captureToCategory(
  app: any,
  category: CollectCategory,
  content: string,
  now: Date | number = Date.now()
): Promise<CaptureResult | null> {
  const lines = (content || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const path = categoryFilePath(category);
  if (!path) return null;
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (dir) await ensureFolder(app, dir);
  // 写盘走 core/storage 契约（D3 直写守门）：读改写整段进串行队列，防并发收集互踩
  return enqueueFileTask(path, async () => {
    const existing = await readFileText(app, path);
    const created = existing === null;
    const next = appendCollect(created ? initialFileContent(now) : existing, content, now);
    const f = fileAt(app, path);
    if (f) await app.vault.modify(f, next);
    else await app.vault.create(path, next);
    return { path, created, count: lines.length };
  });
}

/**
 * 只读聚合全部分类的条目（home 快照用）：按时间倒序取最近 limit 条。
 * 目标文件缺失/为空/解析失败一律跳过；分类路径去重（多分类指向同一文件不重复计数）。
 */
export async function readRecentEntries(app: any, limit = 3): Promise<CollectEntry[]> {
  const cats = getCategories();
  const folder = getCollectFolder();
  const seen = new Set<string>();
  const all: CollectEntry[] = [];
  for (const c of cats) {
    const path = categoryFilePath(c, folder);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const text = await readFileText(app, path);
    if (!text) continue;
    all.push(...parseEntries(text, c.name));
  }
  all.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return limit > 0 ? all.slice(0, limit) : all;
}

/** 同一时刻（本地日期同一天）的条目数（today 为任意当天时间戳） */
export function countSameDay(entries: CollectEntry[], today: Date | number): number {
  const d = today instanceof Date ? today : new Date(today);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  return entries.filter((e) => {
    if (e.time === null) return false;
    const t = new Date(e.time);
    return t.getFullYear() === y && t.getMonth() === m && t.getDate() === day;
  }).length;
}
