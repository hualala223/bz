/**
 * 今日已复习列表（ticket 276）：
 * - collectTodayReviewed（纯函数）：筛出「当天已复习」条目（isReviewedToday 口径，CONTEXT.md 术语），
 *   附当天复习次数（reviewHistory 当天条数，历史缺失按 1 兜底）与最后评级（lastDifficulty），
 *   按 lastReviewed 倒序（最近复习的在上）。
 * - showTodayReviewed：独立弹窗（createOverlay 共享壳 + escManager，骨架对齐 stats-ui 统计弹窗）；
 *   点击条目 → 新标签页打开原文并强制阅读模式（openFile({ state: { mode: 'preview' } })，
 *   全插件首个强制阅读模式先例），点击后关闭列表（否则文档被遮罩挡住看不见）；
 *   文件缺失（挂起记录）→ 标灰删除线，点击 warning 提示不报错。
 * 对外导出：collectTodayReviewed / showTodayReviewed / closeTodayReviewed（测试依赖）。
 */
import { type App, type TFile } from 'obsidian';
import { createOverlay } from '../core/dom';
import { escManager } from '../core/esc-manager';
import { notice } from '../core/notice';
import { uiIcon } from '../core/ui';
import type { ReviewDataManager, ReviewItem } from './data';
import { isReviewedToday, sameLocalDay } from './count';
import { RATING_NAMES, RATING_COLORS } from './stats';

/** 今日已复习条目（列表行数据） */
export interface TodayReviewedEntry {
  filePath: string;
  name: string;
  /** 最后一次复习时间（ISO；恒有值——isReviewedToday 已保证） */
  lastReviewed: string;
  /** 当天复习次数（reviewHistory 当天条数；历史缺失按 1 兜底） */
  countToday: number;
  /** 最后评级（again/hard/good/easy；旧数据可能缺） */
  lastRating: string | null;
  /** 运行时：文件在 vault 中已不存在（挂起记录） */
  isMissing: boolean;
}

/** 收集今天复习过的条目（纯函数）：isReviewedToday 筛选 + lastReviewed 倒序 */
export function collectTodayReviewed(items: ReviewItem[], now: Date): TodayReviewedEntry[] {
  return items
    .filter((i) => isReviewedToday(i, now))
    .map((i) => {
      const todayHistory = (i.reviewHistory || []).filter((h) => h && sameLocalDay(h.timestamp, now));
      return {
        filePath: i.filePath,
        name: i.name,
        lastReviewed: i.lastReviewed as string,
        countToday: Math.max(todayHistory.length, 1),
        lastRating: i.lastDifficulty ?? null,
        isMissing: !!i.isMissing,
      };
    })
    .sort((a, b) => b.lastReviewed.localeCompare(a.lastReviewed));
}

/** 新标签页打开原文并强制阅读模式（全插件首个强制阅读模式先例） */
function openInReadingMode(app: App, filePath: string): void {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file || (file as TFile).extension !== 'md') {
    notice('文件不存在或已被移动', 'warning');
    return;
  }
  const leaf = app.workspace.getLeaf('tab');
  void leaf.openFile(file as TFile, { state: { mode: 'preview' } });
}

/** 本地 HH:MM（当天列表用钟点即可，相对时间反而不直观） */
function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

let todayMask: HTMLElement | null = null;
let todayPopup: HTMLElement | null = null;
let todayEsc: { unregister: () => void } | null = null;

/** 关闭今日已复习弹窗（幂等） */
export function closeTodayReviewed(): void {
  todayEsc?.unregister();
  todayEsc = null;
  if (todayMask) todayMask.remove();
  if (todayPopup) todayPopup.remove();
  todayMask = null;
  todayPopup = null;
}

/** 打开今日已复习弹窗（命令 bz-review-today 唯一入口；读 review.json 只读，不改数据）。
 *  签名对齐 showStatsModal(app, dm)：条目在入口内加载，调用方传 ReviewDataManager 即可 */
export async function showTodayReviewed(app: App, dm: ReviewDataManager): Promise<void> {
  closeTodayReviewed();
  const now = new Date();
  const items: ReviewItem[] = await dm.loadItems();
  const entries = collectTodayReviewed(items, now);

  const overlay = createOverlay({
    maskId: 'bz-review-today-mask',
    popupId: 'bz-review-today-popup',
    onMaskClick: closeTodayReviewed,
    width: '90%',
    maxWidth: 440,
  });
  todayMask = overlay.mask;
  todayPopup = overlay.popup;

  // 头部行：标题（含篇数）+ 关闭钮（统一视觉：bz-win-head / bz-win-close）
  const header = document.createElement('div');
  header.className = 'bz-win-head';
  const title = document.createElement('h3');
  title.className = 'bz-dialog-title';
  title.textContent = entries.length ? `今日已复习（${entries.length}）` : '今日已复习';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'bz-win-close bz-touch-target--xl';
  closeBtn.title = '关闭';
  closeBtn.appendChild(uiIcon('x'));
  closeBtn.addEventListener('click', closeTodayReviewed);
  header.appendChild(title);
  header.appendChild(closeBtn);
  todayPopup.appendChild(header);

  // 正文：空态 / 条目列表
  const body = document.createElement('div');
  body.className = 'bz-review-today-body';
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'bz-review-today-empty';
    empty.textContent = '今天还没有复习记录';
    body.appendChild(empty);
  } else {
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'bz-review-today-row' + (entry.isMissing ? ' is-missing' : '');
      const name = document.createElement('span');
      name.className = 'bz-review-today-name';
      name.textContent = entry.isMissing ? `${entry.name}（挂起）` : entry.name;
      name.title = entry.filePath;
      const meta = document.createElement('span');
      meta.className = 'bz-review-today-meta';
      const time = document.createElement('span');
      time.textContent = hhmm(entry.lastReviewed);
      meta.appendChild(time);
      const count = document.createElement('span');
      count.textContent = `${entry.countToday} 次`;
      meta.appendChild(count);
      if (entry.lastRating && RATING_NAMES[entry.lastRating]) {
        const rating = document.createElement('span');
        rating.textContent = RATING_NAMES[entry.lastRating];
        rating.style.color = RATING_COLORS[entry.lastRating] || '';
        meta.appendChild(rating);
      }
      row.appendChild(name);
      row.appendChild(meta);
      row.addEventListener('click', () => {
        // 挂起记录（文件缺失）不尝试打开，warning 提示不报错
        if (entry.isMissing) {
          notice('文件不存在或已被移动', 'warning');
          return;
        }
        // 打开原文前先关列表：新标签页在遮罩后面，不关看不见
        closeTodayReviewed();
        openInReadingMode(app, entry.filePath);
      });
      body.appendChild(row);
    }
  }
  todayPopup.appendChild(body);

  document.body.appendChild(todayMask);
  document.body.appendChild(todayPopup);
  todayMask.style.display = 'block';
  todayPopup.style.display = 'flex';

  todayEsc = escManager.register('review-today', {
    isVisible: () => !!todayMask && todayMask.style.display === 'block',
    close: closeTodayReviewed,
  });
}
