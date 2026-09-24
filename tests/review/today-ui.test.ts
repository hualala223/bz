/**
 * 今日已复习弹窗 UI 测试（ticket 276）：
 * 有记录 → 列表（倒序/次数/评级文案）、点击行 → 关弹窗 + 新标签页 openFile 强制阅读模式（mode: 'preview'）；
 * 挂起记录 → is-missing 样式、点击 warning 不打开且弹窗不关；无记录 → 空态文案；closeTodayReviewed 幂等。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { ReviewDataManager, REVIEW_FILE_PATH } from '../../src/review/data';
import { showTodayReviewed, closeTodayReviewed } from '../../src/review/today';

function seedItem(id: string, filePath: string, name: string, lastReviewed: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    filePath,
    name,
    reviewStart: '2026-01-01T08:00:00',
    stage: 3,
    phase: 'ladder',
    stability: 1,
    difficulty: 0.3,
    reviewHistory: [{ timestamp: lastReviewed, stage: 4, rating: 'good' }],
    totalReviews: 1,
    averageConfidence: 0,
    nextReviewDate: '2026-01-16T08:00:00',
    lastReviewed,
    lastDifficulty: 'good',
    completed: false,
    ...extra,
  };
}

describe('showTodayReviewed（ticket 276）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    document.body.innerHTML = '';
    setApp(null as any);
    setSettingsProvider(() => ({ storagePath: 'CONFIG/STORAGE' }) as any);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeTodayReviewed();
    document.body.innerHTML = '';
  });

  it('有记录：列表倒序 + 次数 + 评级文案；点击行 → 关弹窗 + 新标签页强制阅读模式', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文A');
    vault.files.set('B.md', '正文B');
    // 回放今天：B 10:30 easy（更新），A 09:00 good
    const now = new Date();
    const at = (h: number, m: number) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
      return d.toISOString();
    };
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([
      seedItem('1', 'A.md', 'A', at(9, 0), { lastDifficulty: 'good' }),
      seedItem('2', 'B.md', 'B', at(10, 30), { lastDifficulty: 'easy' }),
    ]));
    const app = mockAppWithVault(vault);
    const openFile = vi.fn().mockResolvedValue(undefined);
    const getLeaf = vi.fn().mockReturnValue({ openFile });
    (app.workspace as any).getLeaf = getLeaf;
    setApp(app);
    const dm = new ReviewDataManager(app);

    await showTodayReviewed(app, dm);

    const popup = document.getElementById('bz-review-today-popup');
    expect(popup).toBeTruthy();
    expect(popup!.textContent).toContain('今日已复习（2）');
    const rows = popup!.querySelectorAll('.bz-review-today-row');
    expect(rows.length).toBe(2);
    // 倒序：B（10:30）在上
    expect((rows[0].querySelector('.bz-review-today-name') as HTMLElement).textContent).toBe('B');
    expect(rows[0].textContent).toContain('1 次');
    expect(rows[0].textContent).toContain('简单'); // easy → RATING_NAMES
    expect((rows[1].querySelector('.bz-review-today-name') as HTMLElement).textContent).toBe('A');
    expect(rows[1].textContent).toContain('一般'); // good → RATING_NAMES（stats.ts 口径：忘了/困难/一般/简单）

    // 点击行：先关弹窗再打开；新标签页（getLeaf('tab')）+ 强制阅读模式
    (rows[0] as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById('bz-review-today-popup')).toBeNull();
    expect(getLeaf).toHaveBeenCalledWith('tab');
    expect(openFile).toHaveBeenCalledTimes(1);
    const [file, opts] = openFile.mock.calls[0];
    expect(file.path).toBe('B.md');
    expect(opts).toEqual({ state: { mode: 'preview' } });
  });

  it('挂起记录：is-missing 样式 + 点击提示不打开、弹窗不关', async () => {
    const vault = new MockVault();
    const now = new Date();
    const at = (h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([
      seedItem('1', 'GONE.md', 'GONE', at(9, 0), { lastDifficulty: null }),
    ]));
    const app = mockAppWithVault(vault);
    const openFile = vi.fn();
    (app.workspace as any).getLeaf = () => ({ openFile });
    setApp(app);
    const dm = new ReviewDataManager(app);

    await showTodayReviewed(app, dm);

    const row = document.querySelector('.bz-review-today-row') as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.className).toContain('is-missing');
    expect(row.textContent).toContain('挂起');
    row.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(openFile).not.toHaveBeenCalled();
    expect(document.getElementById('bz-review-today-popup')).toBeTruthy(); // 弹窗保持打开
  });

  it('无记录：空态文案；closeTodayReviewed 幂等', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 0).toISOString();
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([seedItem('1', 'A.md', 'A', yesterday)]));
    const app = mockAppWithVault(vault);
    setApp(app);
    const dm = new ReviewDataManager(app);

    await showTodayReviewed(app, dm);
    const popup = document.getElementById('bz-review-today-popup')!;
    expect(popup.textContent).toContain('今天还没有复习记录');
    expect(popup.querySelector('.bz-review-today-row')).toBeNull();

    closeTodayReviewed();
    expect(document.getElementById('bz-review-today-popup')).toBeNull();
    closeTodayReviewed(); // 幂等
    expect(document.getElementById('bz-review-today-popup')).toBeNull();
  });
});
