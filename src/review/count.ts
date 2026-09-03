/**
 * 按数量复习数据层（ticket 01）：
 * - 「当天已复习」判定（review.json lastReviewed 本地自然日）
 * - 候选大小统计（篇数弹窗上限）
 * - 按数量选择算法（纯函数）：候选池 → 排除当天已复习 → 优先级填充 N 篇
 *   待重做 FIFO → 逾期 → 今天到期 → 新文件/历史按 7:3 配比 → 剩余已入计划按复习阶段分桶采样（一侧不足另一侧补齐）
 * 本模块零运行时依赖（含 isUnderFolder 本地纯实现，避免测试侧引入 DOM 依赖），可 node 环境单测。
 * bucket 语义与设计总览一致：刚学 stage 0–2 / 短期 3–6 / 中期 7–9 / 长期 FSRS 10+。
 */
import type { App } from 'obsidian';
import type { ReviewItem } from './data';

/** 选中类型（安排展示用）：待重做 / 逾期 / 今天到期 / 新文件 / 阶段采样 */
export type CountPickKind = 'redo' | 'overdue' | 'due-today' | 'new' | 'stage';

export interface CountPick {
  filePath: string;
  kind: CountPickKind;
  /** 已入计划条目的 stage（新文件为 null） */
  stage: number | null;
  /** 复习阶段分桶（新文件为 null）：刚学/短期/中期/长期 */
  bucket: string | null;
}

/** 目录边界判定（与 watch.ts isUnderFolder 同义；本地纯实现保持本模块零 DOM 依赖） */
export function isUnderFolder(folder: string, path: string): boolean {
  const f = (folder || '').trim().replace(/\/+$/, '');
  if (!f) return false;
  return path === f || path.startsWith(f + '/');
}

/** 复习阶段分桶：刚学 stage 0–2 / 短期 3–6 / 中期 7–9 / 长期 FSRS 10+ */
export function stageBucket(stage: number): string {
  if (stage <= 2) return '刚学';
  if (stage <= 6) return '短期';
  if (stage <= 9) return '中期';
  return '长期';
}

/** 本地自然日相同判定（lastReviewed 与 now 同一天 = 当天已复习） */
export function sameLocalDay(a: string | null | undefined, b: Date): boolean {
  if (!a) return false;
  const da = new Date(a);
  return da.getFullYear() === b.getFullYear() && da.getMonth() === b.getMonth() && da.getDate() === b.getDate();
}

/** 「当天已复习」：条目 lastReviewed 为本地今天 */
export function isReviewedToday(item: ReviewItem, now: Date): boolean {
  return !!item.lastReviewed && sameLocalDay(item.lastReviewed, now);
}

/** 本地今天结束（23:59:59.999） */
export function endOfLocalDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** 候选文件夹内全部 .md 路径（递归语义同监听文件夹） */
export function collectFolderFiles(app: App, folder: string): string[] {
  const f = (folder || '').trim().replace(/\/+$/, '');
  if (!f) return [];
  return app.vault
    .getMarkdownFiles()
    .map((file) => file.path)
    .filter((p) => isUnderFolder(f, p));
}

/** 排除「当天已复习」与已完成条目后的候选数（篇数弹窗上限） */
export function eligibleCount(files: string[], items: ReviewItem[], now: Date): number {
  const itemByPath = new Map(items.filter((i) => !i.isMissing).map((i) => [i.filePath, i]));
  return files.filter((p) => {
    const it = itemByPath.get(p);
    if (!it) return true; // 未入计划 = 新文件
    if (it.completed || it.isCompleted) return false; // 已完成全部复习不参与
    return !isReviewedToday(it, now);
  }).length;
}

/** 条目是否逾期（与 data.ts loadItems 口径一致：nextReviewDate 早于 now 且未完成） */
function isOverdueItem(it: ReviewItem, now: Date): boolean {
  if (it.completed || it.isCompleted) return false;
  return !!it.nextReviewDate && new Date(it.nextReviewDate).getTime() < now.getTime();
}

/** 今天到期（不逾期但 nextReviewDate ≤ 今天结束） */
function isDueToday(it: ReviewItem, now: Date): boolean {
  if (it.completed || it.isCompleted) return false;
  if (!it.nextReviewDate) return false;
  const t = new Date(it.nextReviewDate).getTime();
  return t >= now.getTime() && t <= endOfLocalDay(now).getTime();
}

/** 桶轮转排序：各阶段桶轮流取（覆盖各阶段），桶内按 nextReviewDate 升序 */
function roundRobinByBucket(items: ReviewItem[]): ReviewItem[] {
  const buckets: Record<string, ReviewItem[]> = {};
  for (const it of items) {
    const key = stageBucket(it.stage ?? 0);
    (buckets[key] ||= []).push(it);
  }
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => {
      const ta = a.nextReviewDate ? new Date(a.nextReviewDate).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.nextReviewDate ? new Date(b.nextReviewDate).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
  }
  const order = ['刚学', '短期', '中期', '长期'];
  const out: ReviewItem[] = [];
  let alive = order.length;
  while (alive > 0) {
    alive = 0;
    for (const key of order) {
      const arr = buckets[key];
      if (arr && arr.length) {
        out.push(arr.shift()!);
        alive++;
      }
    }
  }
  return out;
}

/**
 * 按数量选择（纯函数）
 * @param files 候选文件路径（候选文件夹内全部 .md，见 collectFolderFiles）
 * @param items review.json 已加载条目（含运行时 isMissing）
 * @param count 本次复习篇数（≤0 返回空）
 * @param now 当前时间
 * @param historyRatio 历史:新配比（历史占百分比，默认 70）
 */
export function selectCountReview(
  files: string[],
  items: ReviewItem[],
  count: number,
  now: Date,
  historyRatio: number = 70
): CountPick[] {
  const picks: CountPick[] = [];
  if (count <= 0 || !files.length) return picks;

  const itemByPath = new Map(items.filter((i) => !i.isMissing).map((i) => [i.filePath, i]));
  // 候选：排除当天已复习（新文件恒入选）与已完成条目
  const eligible = files.filter((p) => {
    const it = itemByPath.get(p);
    if (!it) return true;
    if (it.completed || it.isCompleted) return false;
    return !isReviewedToday(it, now);
  });
  const inPlan = eligible.map((p) => itemByPath.get(p)!).filter(Boolean);

  // 优先池：待重做 FIFO（lastReviewed 升序）→ 逾期（nextReviewDate 升序）→ 今天到期（nextReviewDate 升序）；跨池去重
  const redoPool = inPlan
    .filter((i) => i.pendingRedo && !(i.completed || i.isCompleted))
    .sort((a, b) => new Date(a.lastReviewed || a.reviewStart).getTime() - new Date(b.lastReviewed || b.reviewStart).getTime());
  const overduePool = inPlan
    .filter((i) => isOverdueItem(i, now))
    .sort((a, b) => new Date(a.nextReviewDate as string).getTime() - new Date(b.nextReviewDate as string).getTime());
  const dueTodayPool = inPlan
    .filter((i) => isDueToday(i, now))
    .sort((a, b) => new Date(a.nextReviewDate as string).getTime() - new Date(b.nextReviewDate as string).getTime());

  const historyPriority: ReviewItem[] = [];
  const prioritySeen = new Set<string>();
  for (const pool of [redoPool, overduePool, dueTodayPool]) {
    for (const it of pool) {
      if (!prioritySeen.has(it.filePath)) {
        prioritySeen.add(it.filePath);
        historyPriority.push(it);
      }
    }
  }

  for (const it of historyPriority) {
    if (picks.length >= count) break;
    picks.push({
      filePath: it.filePath,
      kind: it.pendingRedo ? 'redo' : isOverdueItem(it, now) ? 'overdue' : 'due-today',
      stage: it.stage ?? 0,
      bucket: stageBucket(it.stage ?? 0),
    });
  }

  // 剩余名额：历史:新按比例（历史=其余已入计划按阶段分桶采样，新=未入计划文件）；一侧不足另一侧补齐
  const rest = count - picks.length;
  if (rest > 0) {
    const historySlots = Math.round((rest * historyRatio) / 100);
    const newSlots = rest - historySlots;
    const remaining = inPlan.filter((i) => !prioritySeen.has(i.filePath) && !(i.completed || i.isCompleted));
    const sampled = roundRobinByBucket(remaining);
    const newPaths = eligible.filter((p) => !itemByPath.has(p));

    while (picks.length < count && historySlots > 0 && sampled.length) {
      const it = sampled.shift()!;
      picks.push({ filePath: it.filePath, kind: 'stage', stage: it.stage ?? 0, bucket: stageBucket(it.stage ?? 0) });
    }
    while (picks.length < count && newSlots > 0 && newPaths.length) {
      picks.push({ filePath: newPaths.shift()!, kind: 'new', stage: null, bucket: null });
    }
    // 一侧不足另一侧补齐（历史优先）
    while (picks.length < count && sampled.length) {
      const it = sampled.shift()!;
      picks.push({ filePath: it.filePath, kind: 'stage', stage: it.stage ?? 0, bucket: stageBucket(it.stage ?? 0) });
    }
    while (picks.length < count && newPaths.length) {
      picks.push({ filePath: newPaths.shift()!, kind: 'new', stage: null, bucket: null });
    }
  }

  return picks;
}

/** 全 vault 逾期选择（ticket 168「去复习」会话）：逾期（nextReviewDate 早于 now 且未完成）条目
 *  按 nextReviewDate 升序；挂起记录（isMissing）不计逾期（CONTEXT.md 挂起语义）；
 *  dailyLimit>0 截断（对齐「每日复习上限」语义，0/非法 = 不限）。kind 恒为 'overdue'。 */
export function selectOverduePicks(items: ReviewItem[], now: Date, dailyLimit: number = 0): CountPick[] {
  if (!items.length) return [];
  const overdue = items
    .filter(
      (i) =>
        !i.isMissing &&
        !(i.completed || i.isCompleted) &&
        !!i.nextReviewDate &&
        new Date(i.nextReviewDate).getTime() < now.getTime()
    )
    .sort(
      (a, b) =>
        new Date(a.nextReviewDate as string).getTime() - new Date(b.nextReviewDate as string).getTime()
    );
  const limit = Number(dailyLimit) > 0 ? Math.floor(Number(dailyLimit)) : overdue.length;
  return overdue.slice(0, limit).map((it) => ({
    filePath: it.filePath,
    kind: 'overdue' as const,
    stage: it.stage ?? 0,
    bucket: stageBucket(it.stage ?? 0),
  }));
}