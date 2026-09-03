/**
 * 复习计划核心逻辑测试（ticket 16 修正版；ticket 168 切片 04：旧复习流程测试退役）：markReview 阶梯/FSRS/未到期
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks, getNoticeMessages } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { reviewApp } from '../../src/review/app';
import { ReviewDataManager, REVIEW_FILE_PATH, ReviewItem } from '../../src/review/data';

function makeApp(vault: MockVault) {
  return mockAppWithVault(vault);
}

/** 预置一条逾期复习数据 */
async function seedOverdue(vault: MockVault, partial: Partial<ReviewItem> = {}) {
  const now = new Date();
  vault.files.set(REVIEW_FILE_PATH, JSON.stringify([
    {
      id: 'x', filePath: 'A.md', name: 'A',
      reviewStart: now.toISOString(), stage: 0, phase: 'ladder', stability: 1, difficulty: 0.3,
      reviewHistory: [], totalReviews: 0, averageConfidence: 0,
      nextReviewDate: new Date(now.getTime() - 1000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false,
      ...partial,
    },
  ]));
  return now;
}

describe('markReview 阶梯分支', () => {
  beforeEach(() => {
    resetObsidianMocks();
    setSettingsProvider(() => ({}) as any);
    (reviewApp as any).dataManager = null; // 重置单例（跨测试污染）
  });

  it('again→stage-1（clamp 0）；hard 不变；good+1；easy+2（clamp 9）；ISO 时间落盘', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedOverdue(vault, { stage: 3 });
    const app = makeApp(vault);
    setApp(app);

    // 每次复习前重置种子（避免未到期拦截）
    await reviewApp.markReview('A.md', 'again');
    let items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stage).toBe(2);
    expect(items[0].phase).toBe('ladder');
    expect(typeof items[0].nextReviewDate).toBe('string');
    expect(typeof items[0].lastReviewed).toBe('string');
    expect(items[0].reviewHistory[0]).toMatchObject({ rating: 'again', stage: 3 });
    expect(typeof items[0].reviewHistory[0].timestamp).toBe('string');

    await seedOverdue(vault, { stage: 3 });
    await reviewApp.markReview('A.md', 'hard');
    items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stage).toBe(3);

    await seedOverdue(vault, { stage: 3 });
    await reviewApp.markReview('A.md', 'good');
    items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stage).toBe(4);
  });

  it('easy 从 stage 8 → clamp 9 进入 fsrs：stability=initS、difficulty、Notice 文案', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedOverdue(vault, { stage: 8 });
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.markReview('A.md', 'easy');
    const items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stage).toBe(9);
    expect(items[0].phase).toBe('fsrs');
    expect(items[0].stability).toBe(5.8); // initS('easy')
    expect(items[0].difficulty).toBe(0.3);
    // 进入 fsrs 的 nextReviewDate = 阶梯 interval[9] = 120 天（源码语义）
    const diffDays = (new Date(items[0].nextReviewDate!).getTime() - new Date(items[0].reviewStart).getTime()) / 86400000;
    expect(diffDays).toBeCloseTo(120, 5);
  });

  it('again 从阶梯不可达 fsrs（9-1=8 仍阶梯）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedOverdue(vault, { stage: 9 });
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.markReview('A.md', 'again');
    const items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stage).toBe(8);
    expect(items[0].phase).toBe('ladder');
  });

  it('未到期 → ceil 分钟 Notice 且不推进', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const now = new Date();
    await seedOverdue(vault, { stage: 2, nextReviewDate: new Date(now.getTime() + 10 * 60000 + 30000).toISOString() });
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.markReview('A.md', 'good');
    const items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stage).toBe(2); // 未变
  });

  it('completed 条目 → 该笔记已完成全部复习', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedOverdue(vault, { completed: true });
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.markReview('A.md', 'good');
    const items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stage).toBe(0); // 未变
  });
});

describe('markReview FSRS 分支', () => {
  beforeEach(() => {
    resetObsidianMocks();
    setSettingsProvider(() => ({}) as any);
    (reviewApp as any).dataManager = null;
  });

  it('stage 不递增（源码语义）；S/D 舍入；history stage=currentStage+1', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const now = new Date();
    await seedOverdue(vault, {
      stage: 12, phase: 'fsrs', stability: 5, difficulty: 0.3,
      lastReviewed: new Date(now.getTime() - 3 * 86400000).toISOString(),
    });
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.markReview('A.md', 'good');
    const items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stage).toBe(12); // FSRS 分支不递增 stage
    expect(items[0].totalReviews).toBe(1);
    expect(items[0].reviewHistory[0]).toMatchObject({ rating: 'good', stage: 13 });
    expect(typeof items[0].reviewHistory[0].R).toBe('number');
    expect(items[0].nextReviewDate).toBeTruthy();
  });

  it('again → stability 显著降低', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const now = new Date();
    await seedOverdue(vault, {
      stage: 15, phase: 'fsrs', stability: 0.4, difficulty: 0.3,
      lastReviewed: new Date(now.getTime() - 86400000).toISOString(),
    });
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.markReview('A.md', 'again');
    const items = await new ReviewDataManager(app).loadItems();
    expect(items[0].stability).toBeLessThan(1);
  });
});

describe('accuracyToRating / addCurrentToReview', () => {
  beforeEach(() => {
    resetObsidianMocks();
    setSettingsProvider(() => ({ forceQuizForReview: false }) as any);
    (reviewApp as any).dataManager = null;
  });

  it('accuracyToRating 分档', () => {
    expect(reviewApp.accuracyToRating(95)).toBe('easy');
    expect(reviewApp.accuracyToRating(75)).toBe('good');
    expect(reviewApp.accuracyToRating(55)).toBe('hard');
    expect(reviewApp.accuracyToRating(30)).toBe('again');
  });

  it('addCurrentToReview：重复 → 抛错', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.addCurrentToReview(vault.file('A.md') as any);
    await expect(reviewApp.addCurrentToReview(vault.file('A.md') as any)).rejects.toThrow('该笔记已在复习计划中');
  });
});

describe('applyReviewStyles', () => {
  beforeEach(() => {
    resetObsidianMocks();
    document.body.innerHTML = '';
    setSettingsProvider(() => ({}) as any);
    (reviewApp as any).dataManager = null;
    (reviewApp as any)._styledPaths = new Set(); // ticket 48：曾染色集合逐用例隔离
  });

  it('data-path 选择器 + 时间徽标（d/h/m）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const now = new Date();
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([
      { id: '1', filePath: 'A.md', reviewStart: now.toISOString(), stage: 2, phase: 'ladder', stability: 1, difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0, nextReviewDate: new Date(now.getTime() + 5 * 3600000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false },
    ]));
    // 文件树 DOM（源码选择器）
    const treeItem = document.createElement('div');
    treeItem.setAttribute('data-path', 'A.md');
    const inner = document.createElement('div');
    inner.className = 'tree-item-inner';
    treeItem.appendChild(inner);
    document.body.appendChild(treeItem);

    const app = makeApp(vault);
    setApp(app);
    await reviewApp.applyReviewStyles(app, vault.file('A.md') as any);
    expect(inner.style.color).toBe('rgb(24, 144, 255)'); // stage<=2 #1890ff
    const badge = inner.querySelector('.review-stage-badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toMatch(/^\d+[dhm]$/); // 时间文本
  });

  it('completed → ✅ + #52c41a', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const now = new Date();
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([
      { id: '1', filePath: 'A.md', reviewStart: now.toISOString(), stage: 0, phase: 'ladder', stability: 1, difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0, nextReviewDate: now.toISOString(), lastReviewed: null, lastDifficulty: null, completed: true },
    ]));
    const treeItem = document.createElement('div');
    treeItem.setAttribute('data-path', 'A.md');
    const inner = document.createElement('div');
    inner.className = 'tree-item-inner';
    treeItem.appendChild(inner);
    document.body.appendChild(treeItem);

    const app = makeApp(vault);
    setApp(app);
    await reviewApp.applyReviewStyles(app, vault.file('A.md') as any);
    expect(inner.style.color).toBe('rgb(82, 196, 26)'); // #52c41a
    expect(inner.querySelector('.review-stage-badge')!.textContent).toBe('✅');
  });

  it('ticket 100：文件树标记关闭 → 不染色不挂徽章', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const now = new Date();
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([
      { id: '1', filePath: 'A.md', reviewStart: now.toISOString(), stage: 2, phase: 'ladder', stability: 1, difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0, nextReviewDate: new Date(now.getTime() + 5 * 3600000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false },
    ]));
    const treeItem = document.createElement('div');
    treeItem.setAttribute('data-path', 'A.md');
    const inner = document.createElement('div');
    inner.className = 'tree-item-inner';
    treeItem.appendChild(inner);
    document.body.appendChild(treeItem);
    setSettingsProvider(() => ({ reviewTreeBadge: false } as any));
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.applyReviewStyles(app, vault.file('A.md') as any);
    expect(inner.style.color).toBe('');
    expect(inner.querySelector('.review-stage-badge')).toBeNull();
  });

  it('ticket 48：changedFile 单文件路径——非条目节点不被触碰（他方颜色保持）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文'); // 非复习条目
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([]));
    const treeItem = document.createElement('div');
    treeItem.setAttribute('data-path', 'A.md');
    const inner = document.createElement('div');
    inner.className = 'tree-item-inner';
    treeItem.appendChild(inner);
    document.body.appendChild(treeItem);
    inner.style.color = '#1890ff'; // 模拟他方设置的颜色
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.applyReviewStyles(app, vault.file('A.md') as any);
    expect(inner.style.color).toBe('rgb(24, 144, 255)'); // 未被重置
    expect(inner.querySelector('.review-stage-badge')).toBeNull();
  });

});

describe('ticket 100：到期提醒 / 每日上限 / 间隔缩放', () => {
  beforeEach(() => {
    resetObsidianMocks();
    document.body.innerHTML = '';
    (reviewApp as any).dataManager = null;
    (reviewApp as any)._notifiedOverdue = new Set();
    (reviewApp as any)._overdueNotice = null;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    (reviewApp as any)._notifiedOverdue = new Set();
    (reviewApp as any)._overdueNotice = null;
  });

  function seedOverdueWith(vault: MockVault, paths: string[]) {
    const now = new Date();
    const rows = paths.map((p, i) => ({
      id: String(i), filePath: p, reviewStart: now.toISOString(), stage: 0, phase: 'ladder', stability: 1,
      difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0,
      nextReviewDate: new Date(now.getTime() - 1000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false,
    }));
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify(rows));
  }

  it('到期提醒：新增逾期弹篇数常驻通知；再次检查不重复弹；移出逾期后再逾期重现', async () => {
    const noticeSpy = vi.spyOn(await import('../../src/core/notice'), 'notify');
    const vault = new MockVault();
    for (const p of ['A.md', 'B.md']) vault.files.set(p, '正文');
    seedOverdueWith(vault, ['A.md', 'B.md']);
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ enableAutoNotify: true } as any));
    // 首次：两篇全新逾期 → 一条篇数通知（不列题目，duration 0 常驻）
    await reviewApp.checkOverdueAndNotify();
    expect(noticeSpy).toHaveBeenCalledTimes(1);
    expect(String(noticeSpy.mock.calls[0][0])).toBe('有 2 篇笔记逾期');
    expect((noticeSpy.mock.calls[0][1] as any).duration).toBe(0);
    // 再次检查：无新逾期 → 不再弹
    noticeSpy.mockClear();
    await reviewApp.checkOverdueAndNotify();
    expect(noticeSpy).not.toHaveBeenCalled();
    // B 保持逾期，A 移出（nextReviewDate 推后）→ 集合剔除；A 再逾期 → 重新弹
    seedOverdueWith(vault, ['B.md']);
    await reviewApp.checkOverdueAndNotify();
    noticeSpy.mockClear();
    seedOverdueWith(vault, ['A.md', 'B.md']);
    await reviewApp.checkOverdueAndNotify();
    expect(noticeSpy).toHaveBeenCalledTimes(1);
    expect(String(noticeSpy.mock.calls[0][0])).toBe('有 2 篇笔记逾期');
  });

  it('ticket 168：到期提醒挂「去复习」action → 走全 vault 按数量会话（非单篇打开）', async () => {
    const noticeSpy = vi.spyOn(await import('../../src/core/notice'), 'notify');
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    vault.files.set('B.md', '正文');
    const now = new Date();
    // A 最早到期（最紧迫），B 次之；本轮都属 newly
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([
      { id: '1', filePath: 'A.md', reviewStart: now.toISOString(), stage: 0, phase: 'ladder', stability: 1, difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0, nextReviewDate: new Date(now.getTime() - 2 * 86400000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false },
      { id: '2', filePath: 'B.md', reviewStart: now.toISOString(), stage: 0, phase: 'ladder', stability: 1, difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0, nextReviewDate: new Date(now.getTime() - 1 * 86400000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false },
    ]));
    const app = makeApp(vault);
    const openFile = vi.fn().mockResolvedValue(undefined);
    (app.workspace as any).getLeaf = () => ({ openFile });
    setApp(app);
    setSettingsProvider(() => ({ enableAutoNotify: true } as any));
    // 拦截 startOverdueCountSession：验证「去复习」触发统一按数量会话（而非直接 openFile）
    const sessionSpy = vi.spyOn(reviewApp, 'startOverdueCountSession').mockResolvedValue(undefined);
    await reviewApp.checkOverdueAndNotify();
    const opts = noticeSpy.mock.calls[0][1] as any;
    expect(opts.action).toBeTruthy();
    expect(opts.action.label).toBe('去复习'); // 无 emoji
    expect(String(noticeSpy.mock.calls[0][0])).toBe('有 2 篇笔记逾期');
    opts.action.onClick();
    await new Promise((r) => setTimeout(r, 10));
    expect(sessionSpy).toHaveBeenCalledTimes(1); // 走统一按数量会话
    expect(openFile).not.toHaveBeenCalled(); // 不再裸开单篇
  });

  it('ticket 153：已通知的旧逾期不重复弹——「去复习」仍只对 newly 弹通知', async () => {
    const noticeSpy = vi.spyOn(await import('../../src/core/notice'), 'notify');
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    vault.files.set('B.md', '正文');
    const now = new Date();
    const seed = (rows: any[]) => vault.files.set(REVIEW_FILE_PATH, JSON.stringify(rows));
    const aRow = { id: '1', filePath: 'A.md', reviewStart: now.toISOString(), stage: 0, phase: 'ladder', stability: 1, difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0, lastReviewed: null, lastDifficulty: null, completed: false };
    // 首轮：仅 A 逾期（最紧迫）；B 未逾期 → 通知 A
    seed([{ ...aRow, nextReviewDate: new Date(now.getTime() - 2 * 86400000).toISOString() }]);
    const app = makeApp(vault);
    const openFile = vi.fn().mockResolvedValue(undefined);
    (app.workspace as any).getLeaf = () => ({ openFile });
    setApp(app);
    setSettingsProvider(() => ({ enableAutoNotify: true } as any));
    await reviewApp.checkOverdueAndNotify();
    expect(String(noticeSpy.mock.calls[0][0])).toBe('有 1 篇笔记逾期');
    // 第二轮：A 仍逾期（已在已通知集合），B 变逾期且晚于 A → 通知内容不变（不重复弹 A）
    noticeSpy.mockClear();
    const sessionSpy = vi.spyOn(reviewApp, 'startOverdueCountSession').mockResolvedValue(undefined);
    seed([
      { ...aRow, nextReviewDate: new Date(now.getTime() - 2 * 86400000).toISOString() },
      { id: '2', filePath: 'B.md', reviewStart: now.toISOString(), stage: 0, phase: 'ladder', stability: 1, difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0, nextReviewDate: new Date(now.getTime() - 1 * 86400000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false },
    ]);
    await reviewApp.checkOverdueAndNotify();
    expect(String(noticeSpy.mock.calls[0][0])).toBe('有 2 篇笔记逾期');
    const opts = noticeSpy.mock.calls[0][1] as any;
    opts.action.onClick();
    await new Promise((r) => setTimeout(r, 10));
    expect(sessionSpy).toHaveBeenCalledTimes(1); // 点「去复习」走统一按数量会话
    expect(openFile).not.toHaveBeenCalled();
  });

  it('逾期通知只报篇数（多/单篇一致，不列题目；duration 0 常驻）', async () => {
    const noticeSpy = vi.spyOn(await import('../../src/core/notice'), 'notify');
    const vault = new MockVault();
    for (const p of ['A.md', 'B.md', 'C.md', 'D.md', 'E.md']) vault.files.set(p, '正文');
    seedOverdueWith(vault, ['A.md', 'B.md', 'C.md', 'D.md', 'E.md']);
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ enableAutoNotify: true } as any));
    await reviewApp.checkOverdueAndNotify();
    const msg = String(noticeSpy.mock.calls[0][0]);
    expect(msg).toBe('有 5 篇笔记逾期'); // 不含任何题目名
    expect((noticeSpy.mock.calls[0][1] as any).duration).toBe(0); // 常驻
    // 单篇同口径
    noticeSpy.mockClear();
    (reviewApp as any)._notifiedOverdue = new Set();
    (reviewApp as any)._overdueNotice = null;
    seedOverdueWith(vault, ['F.md']);
    vault.files.set('F.md', '正文');
    await reviewApp.checkOverdueAndNotify();
    expect(String(noticeSpy.mock.calls[0][0])).toBe('有 1 篇笔记逾期');
  });

  it('逾期清零 → 常驻通知主动收起', async () => {
    const noticeModule = await import('../../src/core/notice');
    noticeModule.__resetNoticeForTests(); // 清 30s 去重窗口，保证本测真实建框
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    seedOverdueWith(vault, ['A.md']);
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ enableAutoNotify: true } as any));
    await reviewApp.checkOverdueAndNotify();
    expect(document.querySelector('.bz-notice')).not.toBeNull();
    // 全部逾期清除 → 常驻通知失去时效被收起
    seedOverdueWith(vault, []);
    await reviewApp.checkOverdueAndNotify();
    expect((reviewApp as any)._overdueNotice).toBeNull();
    await new Promise((r) => setTimeout(r, 280)); // 退出动画 200ms
    expect(document.querySelector('.bz-notice')).toBeNull();
  });

  it('到期提醒开关关 → 完全静默', async () => {
    const noticeSpy = vi.spyOn(await import('../../src/core/notice'), 'notify');
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    seedOverdueWith(vault, ['A.md']);
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ enableAutoNotify: false } as any));
    await reviewApp.checkOverdueAndNotify();
    expect(noticeSpy).not.toHaveBeenCalled();
  });

  it('每日复习上限：去复习会话逾期队列截断，剩余留到下次（ticket 168 迁移）', async () => {
    const vault = new MockVault();
    for (const p of ['A.md', 'B.md', 'C.md']) vault.files.set(p, '正文');
    seedOverdueWith(vault, ['A.md', 'B.md', 'C.md']);
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ reviewDailyLimit: 1 } as any));
    const loopSpy = vi.spyOn(reviewApp, 'countReviewLoop').mockResolvedValue(undefined);
    vi.spyOn(reviewApp, 'ensureQuizReady').mockResolvedValue({ ai: {} });
    await reviewApp.startOverdueCountSession();
    const picks = loopSpy.mock.calls[0][0] as any[];
    expect(picks.length).toBe(1); // 上限 1 → 只进 1 篇
    expect(getNoticeMessages().join('|')).toContain('本轮复习 1 篇，剩余 2 篇留到下次');
  });

  it('FSRS 间隔缩放：scale 2 翻倍；scale 0.5 减半（相对 scale 1 基准）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const now = new Date();
    const runWith = async (scale: number): Promise<number> => {
      vault.files.set(REVIEW_FILE_PATH, JSON.stringify([{
        id: '1', filePath: 'A.md', reviewStart: new Date(now.getTime() - 100 * 86400000).toISOString(), stage: 12, phase: 'fsrs', stability: 100, difficulty: 0.3, reviewHistory: [{ timestamp: new Date(now.getTime() - 30 * 86400000).toISOString() }], totalReviews: 1, averageConfidence: 0, nextReviewDate: now.toISOString(), lastReviewed: new Date(now.getTime() - 30 * 86400000).toISOString(), lastDifficulty: 'good', completed: false,
      }]));
      const app = makeApp(vault);
      setApp(app);
      setSettingsProvider(() => ({ reviewIntervalScale: scale } as any));
      await reviewApp.markReview('A.md', 'good');
      const items = await new ReviewDataManager(app).loadItems();
      return new Date(items[0].nextReviewDate!).getTime() - now.getTime();
    };
    const base = await runWith(1);
    const d2 = await runWith(2);
    const dHalf = await runWith(0.5);
    expect(Math.abs(d2 / base - 2)).toBeLessThan(0.05); // 翻倍
    expect(Math.abs(dHalf / base - 0.5)).toBeLessThan(0.05); // 减半
  });
});
describe('ticket 098：待重做 / 重做流程（ADR-0044）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    setSettingsProvider(() => ({ forceQuizForReview: true }) as any);
    (reviewApp as any).dataManager = null;
    (reviewApp as any)._quizOverride = null;
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    (reviewApp as any)._quizOverride = null;
  });

  it('markReview(autoPending)：again/hard 置位，good/easy 清除', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedOverdue(vault, { stage: 3 });
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.markReview('A.md', 'again', { autoPending: true });
    expect((await new ReviewDataManager(app).loadItems())[0].pendingRedo).toBe(true);
    await seedOverdue(vault, { stage: 3 });
    await reviewApp.markReview('A.md', 'good', { autoPending: true });
    expect((await new ReviewDataManager(app).loadItems())[0].pendingRedo).toBe(false);
  });

  it('markReview 手动路径：again/hard 不置位；good/easy 清除陈旧标记', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedOverdue(vault, { stage: 3, pendingRedo: true });
    const app = makeApp(vault);
    setApp(app);
    await reviewApp.markReview('A.md', 'good'); // 无 opts：good 清
    expect((await new ReviewDataManager(app).loadItems())[0].pendingRedo).toBe(false);
    await seedOverdue(vault, { stage: 3, pendingRedo: true });
    await reviewApp.markReview('A.md', 'again'); // 无 opts：手动模式不置位
    expect((await new ReviewDataManager(app).loadItems())[0].pendingRedo).toBe(true);
  });

  it('regenerateQuestions：返回题补 notePath/_index（ticket 099：缺失曾致 renderModal split 崩溃）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    // 新题链路：清空 → ensureQuestions → 读回 fresh
    const fresh = [{ question: 'F', options: ['a', 'b', 'c', 'd'], correctIndices: [0] }];
    (reviewApp as any)._quizOverride = {
      ai: {},
      ensureQuestions: async () => {},
      manager: {
        getQuestionsForNote: vi.fn(async (_app: any, path: string) => (path === 'A.md' ? [...fresh] : [])),
        saveQuestionsForNote: async () => {},
      },
    };
    const out = await reviewApp.regenerateQuestions('A.md');
    expect(out).toHaveLength(1);
    expect(out[0].notePath).toBe('A.md');
    expect(out[0]._index).toBe(0);
    // 回退链路：新题为空 → 用 leftover 旧题，同样补 notePath/_index
    const leftover = [{ question: 'L', options: ['a', 'b', 'c', 'd'], correctIndices: [1] }];
    let call = 0;
    (reviewApp as any)._quizOverride.manager.getQuestionsForNote = async () => (call++ === 0 ? [...leftover] : []);
    const out2 = await reviewApp.regenerateQuestions('A.md');
    expect(out2[0].question).toBe('L');
    expect(out2[0].notePath).toBe('A.md');
    expect(out2[0]._index).toBe(0);
    (reviewApp as any)._quizOverride = null;
  });
});

