/**
 * 今日已复习·纯数据层测试（ticket 276，node 环境零 DOM 依赖）：
 * collectTodayReviewed —— isReviewedToday 筛选 / lastReviewed 倒序 / 当天次数（reviewHistory 口径）/
 * 评级透传 / 挂起记录（isMissing）标记 / 空历史兜底。
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { collectTodayReviewed } from '../../src/review/today';
import type { ReviewItem } from '../../src/review/data';

const NOW = new Date('2026-01-15T10:00:00'); // 本地固定时钟：1 月 15 日 10:00

function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'review_1_abc',
    filePath: 'A.md',
    name: 'A',
    reviewStart: '2026-01-01T08:00:00',
    stage: 3,
    phase: 'ladder',
    stability: 1,
    difficulty: 0.3,
    reviewHistory: [],
    totalReviews: 1,
    averageConfidence: 0,
    nextReviewDate: '2026-01-16T08:00:00',
    lastReviewed: null,
    lastDifficulty: null,
    completed: false,
    ...overrides,
  } as ReviewItem;
}

describe('collectTodayReviewed（ticket 276）', () => {
  it('只收当天复习的条目（lastReviewed 本地自然日），昨天/未复习排除', () => {
    const items = [
      makeItem({ filePath: 'A.md', lastReviewed: '2026-01-15T09:00:00' }),
      makeItem({ filePath: 'B.md', lastReviewed: '2026-01-14T09:00:00' }), // 昨天
      makeItem({ filePath: 'C.md', lastReviewed: null }), // 未复习
    ];
    const out = collectTodayReviewed(items, NOW);
    expect(out.map((e) => e.filePath)).toEqual(['A.md']);
  });

  it('lastReviewed 倒序（最近复习在上）；当天次数按 reviewHistory 当天条数', () => {
    const items = [
      makeItem({
        filePath: 'A.md',
        lastReviewed: '2026-01-15T09:00:00',
        reviewHistory: [
          { timestamp: '2026-01-15T08:30:00', stage: 3, rating: 'again' },
          { timestamp: '2026-01-15T09:00:00', stage: 4, rating: 'good' },
          { timestamp: '2026-01-14T09:00:00', stage: 2, rating: 'good' }, // 昨天：不计
        ],
      }),
      makeItem({ filePath: 'B.md', lastReviewed: '2026-01-15T10:30:00', reviewHistory: [{ timestamp: '2026-01-15T10:30:00', stage: 5, rating: 'easy' }] }),
    ];
    const out = collectTodayReviewed(items, NOW);
    expect(out.map((e) => e.filePath)).toEqual(['B.md', 'A.md']); // 10:30 > 09:00
    expect(out[1].countToday).toBe(2); // 当天两条历史
    expect(out[0].countToday).toBe(1);
  });

  it('lastDifficulty 透传为 lastRating；缺省为 null', () => {
    const items = [
      makeItem({ filePath: 'A.md', lastReviewed: '2026-01-15T09:00:00', lastDifficulty: 'good' }),
      makeItem({ filePath: 'B.md', lastReviewed: '2026-01-15T09:30:00', lastDifficulty: null }),
    ];
    const out = collectTodayReviewed(items, NOW);
    expect(out[0].lastRating).toBeNull();
    expect(out[1].lastRating).toBe('good');
  });

  it('挂起记录（isMissing）照常列出并带标记', () => {
    const items = [makeItem({ filePath: 'GONE.md', lastReviewed: '2026-01-15T09:00:00', isMissing: true })];
    const out = collectTodayReviewed(items, NOW);
    expect(out.length).toBe(1);
    expect(out[0].isMissing).toBe(true);
  });

  it('lastReviewed 在当天但 reviewHistory 为空/缺失 → 次数兜底 1', () => {
    const items = [makeItem({ filePath: 'A.md', lastReviewed: '2026-01-15T09:00:00', reviewHistory: [] })];
    const out = collectTodayReviewed(items, NOW);
    expect(out[0].countToday).toBe(1);
  });

  it('空输入 → 空数组', () => {
    expect(collectTodayReviewed([], NOW)).toEqual([]);
  });
});
