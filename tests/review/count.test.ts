// @vitest-environment node
/**
 * 按数量复习数据层测试（ticket 01）：当天已复习排除 / 优先级 / 7:3 配比 / 阶段分桶补齐 / 不足取全部 / 空池
 */
import { describe, it, expect } from 'vitest';
import {
  isUnderFolder,
  stageBucket,
  sameLocalDay,
  isReviewedToday,
  endOfLocalDay,
  eligibleCount,
  selectCountReview,
  selectOverduePicks,
  type CountPick,
} from '../../src/review/count';
import type { ReviewItem } from '../../src/review/data';

function makeItem(filePath: string, opts: Partial<ReviewItem> = {}): ReviewItem {
  const now = new Date();
  return {
    id: `id-${filePath}`,
    filePath,
    name: filePath.replace(/\.md$/, ''),
    reviewStart: now.toISOString(),
    stage: 0,
    phase: 'ladder',
    stability: 1,
    difficulty: 0.3,
    reviewHistory: [],
    totalReviews: 0,
    averageConfidence: 0,
    nextReviewDate: null,
    lastReviewed: null,
    lastDifficulty: null,
    completed: false,
    ...opts,
  } as ReviewItem;
}

const NOW = new Date('2026-01-15T10:00:00');
const paths = (picks: CountPick[]) => picks.map((p) => p.filePath);
const kinds = (picks: CountPick[]) => picks.map((p) => p.kind);

describe('isUnderFolder', () => {
  it('目录边界：恰为目录 / 子路径递归 / 非子路径 / 空目录', () => {
    expect(isUnderFolder('卡片盒/笔记盒', '卡片盒/笔记盒')).toBe(true);
    expect(isUnderFolder('卡片盒/笔记盒', '卡片盒/笔记盒/A.md')).toBe(true);
    expect(isUnderFolder('卡片盒/笔记盒/', '卡片盒/笔记盒/子/B.md')).toBe(true);
    expect(isUnderFolder('卡片盒/笔记盒', '卡片盒/其他/A.md')).toBe(false);
    expect(isUnderFolder('', 'A.md')).toBe(false);
  });
});

describe('stageBucket', () => {
  it('分桶边界：0–2 刚学 / 3–6 短期 / 7–9 中期 / 10+ 长期', () => {
    expect(stageBucket(0)).toBe('刚学');
    expect(stageBucket(2)).toBe('刚学');
    expect(stageBucket(3)).toBe('短期');
    expect(stageBucket(6)).toBe('短期');
    expect(stageBucket(7)).toBe('中期');
    expect(stageBucket(9)).toBe('中期');
    expect(stageBucket(10)).toBe('长期');
    expect(stageBucket(20)).toBe('长期');
  });
});

describe('sameLocalDay / isReviewedToday / endOfLocalDay', () => {
  it('同本地自然日判定；null 视为未复习', () => {
    expect(sameLocalDay('2026-01-15T01:00:00', NOW)).toBe(true);
    expect(sameLocalDay('2026-01-15T23:00:00', NOW)).toBe(true);
    expect(sameLocalDay('2026-01-14T23:59:59', NOW)).toBe(false);
    expect(sameLocalDay(null, NOW)).toBe(false);
    expect(isReviewedToday(makeItem('A.md', { lastReviewed: '2026-01-15T09:00:00' }), NOW)).toBe(true);
    expect(isReviewedToday(makeItem('A.md', { lastReviewed: '2026-01-14T09:00:00' }), NOW)).toBe(false);
    expect(isReviewedToday(makeItem('A.md', { lastReviewed: null }), NOW)).toBe(false);
    expect(endOfLocalDay(NOW).getHours()).toBe(23);
    expect(endOfLocalDay(NOW).getMinutes()).toBe(59);
  });
});

describe('selectCountReview：候选与当天已复习排除', () => {
  it('空池 / count≤0 → 空结果', () => {
    expect(selectCountReview([], [makeItem('A.md')], 5, NOW)).toEqual([]);
    expect(selectCountReview(['A.md'], [makeItem('A.md')], 0, NOW)).toEqual([]);
    expect(selectCountReview(['A.md'], [makeItem('A.md')], -1, NOW)).toEqual([]);
  });

  it('排除当天已复习（lastReviewed=今天），昨天复习与新文件仍入选；已完成条目不参与', () => {
    const files = ['A.md', 'B.md', 'C.md', 'D.md'];
    const items = [
      makeItem('A.md', { lastReviewed: '2026-01-14T20:00:00' }), // 昨天复习 → 可入选
      makeItem('B.md', { lastReviewed: '2026-01-15T09:00:00' }), // 今天复习 → 排除
      makeItem('D.md', { lastReviewed: '2026-01-10T09:00:00', completed: true }), // 完成 → 排除
    ];
    const picks = selectCountReview(files, items, 10, NOW);
    expect(picks.length).toBe(2); // A + C（不足取全部）
    expect(paths(picks)).toEqual(['A.md', 'C.md']);
    expect(kinds(picks)).toEqual(['stage', 'new']);
    expect(eligibleCount(files, items, NOW)).toBe(2);
  });
});

describe('selectCountReview：优先级', () => {
  it('待重做 FIFO 先于逾期；逾期按 nextReviewDate 升序', () => {
    const files = ['D.md', 'E.md', 'F.md'];
    const items = [
      // D：待重做且今天到期（不逾期）；lastReviewed 昨天 → 不受当天排除
      makeItem('D.md', { pendingRedo: true, stage: 3, lastReviewed: '2026-01-14T08:00:00', nextReviewDate: '2026-01-15T11:00:00' }),
      // E：逾期较晚
      makeItem('E.md', { stage: 1, nextReviewDate: '2026-01-14T00:00:00' }),
      // F：逾期较早
      makeItem('F.md', { stage: 2, nextReviewDate: '2026-01-13T00:00:00' }),
    ];
    const picks = selectCountReview(files, items, 3, NOW);
    expect(paths(picks)).toEqual(['D.md', 'F.md', 'E.md']);
    expect(kinds(picks)).toEqual(['redo', 'overdue', 'overdue']);
  });

  it('待重做 FIFO 按 lastReviewed 升序；当天已复习的待重做不重入（当天排除优先）', () => {
    const files = ['P1.md', 'P2.md'];
    const items = [
      makeItem('P2.md', { pendingRedo: true, lastReviewed: '2026-01-14T09:00:00' }),
      makeItem('P1.md', { pendingRedo: true, lastReviewed: '2026-01-14T08:00:00' }),
      makeItem('P0.md', { pendingRedo: true, lastReviewed: '2026-01-15T09:00:00' }), // 今天已复习 → 排除
    ];
    expect(paths(selectCountReview(files, items, 2, NOW))).toEqual(['P1.md', 'P2.md']);
  });

  it('今天到期（不逾期）在逾期之后、新文件/采样之前', () => {
    const files = ['Q1.md', 'Q2.md', 'Q3.md'];
    const items = [
      makeItem('Q1.md', { stage: 4, nextReviewDate: '2026-01-15T20:00:00' }), // 今天到期
      makeItem('Q2.md', { stage: 5, nextReviewDate: '2026-01-16T00:00:00' }), // 明天到期 → 剩余采样
    ];
    const picks = selectCountReview(files, items, 3, NOW);
    expect(kinds(picks)).toEqual(['due-today', 'stage', 'new']);
    expect(paths(picks)).toEqual(['Q1.md', 'Q2.md', 'Q3.md']);
  });
});

describe('selectCountReview：7:3 配比与阶段分桶', () => {
  it('历史 70% / 新 30%；历史侧不足时新文件补齐', () => {
    const files = ['K1.md', 'K2.md', 'K3.md', 'K4.md', 'K5.md', 'K6.md', 'K7.md', 'K8.md', 'K9.md', 'K10.md', 'S1.md', 'S2.md', 'S3.md', 'S4.md'];
    const sampled = [
      makeItem('S1.md', { stage: 0 }),
      makeItem('S2.md', { stage: 3 }),
      makeItem('S3.md', { stage: 7 }),
      makeItem('S4.md', { stage: 12 }),
    ];
    const items = [...sampled];
    const picks = selectCountReview(files, items, 10, NOW);
    expect(picks.length).toBe(10);
    // 历史配额 7：仅 4 个采样可给 → 4 stage + 新配额 3 → 不足再补 3 新 = 6 new
    expect(picks.filter((p) => p.kind === 'stage').length).toBe(4);
    expect(picks.filter((p) => p.kind === 'new').length).toBe(6);
    // 阶段分桶轮流覆盖：刚学→短期→中期→长期
    expect(picks.slice(0, 4).map((p) => p.bucket)).toEqual(['刚学', '短期', '中期', '长期']);
    expect(paths(picks.slice(0, 4))).toEqual(['S1.md', 'S2.md', 'S3.md', 'S4.md']);
  });

  it('新文件不足时历史侧补齐', () => {
    const files = ['S1.md', 'S2.md', 'S3.md', 'S4.md', 'N1.md'];
    const sampled = [
      makeItem('S1.md', { stage: 0 }),
      makeItem('S2.md', { stage: 3 }),
      makeItem('S3.md', { stage: 7 }),
      makeItem('S4.md', { stage: 12 }),
    ];
    const picks = selectCountReview(files, sampled, 5, NOW); // N1 未入计划
    expect(picks.length).toBe(5);
    expect(picks.filter((p) => p.kind === 'stage').length).toBe(4);
    expect(picks.filter((p) => p.kind === 'new').length).toBe(1);
  });

  it('自定义配比生效（如 50:50）', () => {
    const files = ['H1.md', 'H2.md', 'N1.md', 'N2.md'];
    const items = [makeItem('H1.md', { stage: 1 }), makeItem('H2.md', { stage: 4 })];
    const picks = selectCountReview(files, items, 4, NOW, 50);
    expect(picks.filter((p) => p.kind === 'stage').length).toBe(2);
    expect(picks.filter((p) => p.kind === 'new').length).toBe(2);
  });

  it('优先池消耗名额后按剩余名额配比', () => {
    const files = ['O1.md', 'S1.md', 'S2.md', 'S3.md', 'S4.md', 'N1.md', 'N2.md', 'N3.md', 'N4.md', 'N5.md'];
    const items = [
      makeItem('O1.md', { stage: 6, nextReviewDate: '2026-01-14T00:00:00' }), // 逾期（优先）
      makeItem('S1.md', { stage: 0 }),
      makeItem('S2.md', { stage: 3 }),
      makeItem('S3.md', { stage: 7 }),
      makeItem('S4.md', { stage: 12 }),
    ];
    const picks = selectCountReview(files, items, 10, NOW);
    // 1 逾期 + 剩余 9：历史 70% ≈ 6（含采样 4 后不足 → 新补 2）+ 新 30% ≈ 3
    expect(kinds(picks)[0]).toBe('overdue');
    expect(picks.length).toBe(10);
  });
});

describe('selectOverduePicks（ticket 168 去复习会话选择）', () => {
  const T168 = new Date('2026-08-01T10:00:00');

  it('只取逾期：nextReviewDate 早于 now 且未完成；挂起（isMissing）/completed/未到期/无排期排除', () => {
    const items = [
      makeItem('A.md', { nextReviewDate: '2026-07-31T10:00:00' }),
      makeItem('B.md', { nextReviewDate: '2026-08-01T09:59:59' }),
      makeItem('C.md', { nextReviewDate: '2026-08-01T10:00:01' }), // 未到期
      makeItem('D.md', { nextReviewDate: '2026-07-01T10:00:00', completed: true }),
      makeItem('E.md', { nextReviewDate: '2026-07-01T10:00:00', isMissing: true }), // 挂起
      makeItem('F.md', { nextReviewDate: null }),
    ];
    const picks = selectOverduePicks(items, T168);
    expect(picks.map((p) => p.filePath)).toEqual(['A.md', 'B.md']);
  });

  it('任意目录（不依赖候选文件夹）且按 nextReviewDate 升序；kind/stage/bucket 正确', () => {
    const items = [
      makeItem('卡片盒/笔记盒/X.md', { nextReviewDate: '2026-07-20T10:00:00', stage: 8 }),
      makeItem('别处/A.md', { nextReviewDate: '2026-07-30T10:00:00', stage: 0 }),
      makeItem('子/深/B.md', { nextReviewDate: '2026-07-25T10:00:00', stage: 12 }),
    ];
    const picks = selectOverduePicks(items, T168);
    expect(picks.map((p) => p.filePath)).toEqual(['卡片盒/笔记盒/X.md', '子/深/B.md', '别处/A.md']);
    expect(picks[0].kind).toBe('overdue');
    expect(picks[0].stage).toBe(8);
    expect(picks[0].bucket).toBe('中期');
    expect(picks[2].bucket).toBe('刚学');
  });

  it('dailyLimit 截断（>0 取前 N；0/非法=不限）；空输入/无逾期返回空', () => {
    const items = [
      makeItem('A.md', { nextReviewDate: '2026-07-30T10:00:00' }),
      makeItem('B.md', { nextReviewDate: '2026-07-31T10:00:00' }),
      makeItem('C.md', { nextReviewDate: '2026-07-29T10:00:00' }),
    ];
    expect(selectOverduePicks(items, T168, 2).map((p) => p.filePath)).toEqual(['C.md', 'A.md']);
    expect(selectOverduePicks(items, T168, 0).length).toBe(3);
    expect(selectOverduePicks(items, T168, -1).length).toBe(3);
    expect(selectOverduePicks([], T168)).toEqual([]);
    expect(selectOverduePicks([makeItem('N.md', { nextReviewDate: '2026-09-01T10:00:00' })], T168)).toEqual([]);
  });
});