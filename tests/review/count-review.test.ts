/**
 * 按数量复习流程测试（ticket 02）：篇数弹窗 + 命令/按钮入口 + 逐篇做题骨架（排期写入 T03）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks, getNoticeMessages, clearNotices } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { reviewApp } from '../../src/review/app';
import { ReviewDataManager } from '../../src/review/data';
import { UIManager } from '../../src/review/ui';
import type { CountPick } from '../../src/review/count';

// 模拟做题家懒加载域：ai 初始为 null（本会话未 ensureQuiz 过的状态），ensureQuiz 幂等补上 ai
vi.mock('../../src/quiz', () => {
  const quiz: any = {
    ai: null,
    popup: null as any,
    mask: null as any,
    _cb: null as any,
    startCalls: 0,
    endCalls: 0,
    lastStartOpts: null as any,
    startReviewSession(opts: any) {
      this.startCalls++;
      this.lastStartOpts = opts;
      this.popup = document.createElement('div');
      this.popup.id = 'quiz-popup';
      this.mask = document.createElement('div');
      document.body.appendChild(this.mask);
      document.body.appendChild(this.popup);
      this._cb = opts.onComplete;
    },
    endReviewSession() {
      this.endCalls++;
    },
    close() {
      if (this.popup && this.popup.parentNode) this.popup.remove();
      if (this.mask && this.mask.parentNode) this.mask.remove();
      this.popup = null;
      this.mask = null;
    },
    manager: {
      getQuestionsForNote: async () => [],
      saveQuestionsForNote: async () => {},
    },
    ensureQuestions: async () => {},
  };
  return {
    quizUI: quiz,
    ensureQuiz: () => {
      quiz.ai = {};
    },
    QuizMasterUI: { ai: null, settings: null },
  };
});

function makeApp(vault: MockVault) {
  return mockAppWithVault(vault);
}

function makeQuizMock() {
  const quiz: any = {
    ai: {},
    popup: null as any,
    mask: null as any,
    _cb: null as any,
    endCalls: 0,
    startCalls: 0,
    lastStartOpts: null as any,
    startReviewSession(opts: any) {
      this.startCalls++;
      this.lastStartOpts = opts;
      this.popup = document.createElement('div');
      this.popup.id = 'quiz-popup';
      this.mask = document.createElement('div');
      document.body.appendChild(this.mask);
      document.body.appendChild(this.popup);
      this._cb = opts.onComplete;
    },
    endReviewSession() {
      this.endCalls++;
    },
    close() {
      if (this.popup && this.popup.parentNode) this.popup.remove();
      if (this.mask && this.mask.parentNode) this.mask.remove();
      this.popup = null;
      this.mask = null;
    },
    manager: {
      getQuestionsForNote: async (_app: any, _path: string) => [],
      saveQuestionsForNote: async () => {},
    },
    ensureQuestions: async () => {},
  };
  return quiz;
}

const Q = [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndices: [0] }];

function pick(path: string, kind: CountPick['kind'], stage: number | null = null, bucket: string | null = null): CountPick {
  return { filePath: path, kind, stage, bucket };
}

describe('countReviewLoop（ticket 02 骨架：逐篇做题 + 正确率 + 下一篇/结束）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    clearNotices();
    setSettingsProvider(() => ({}) as any);
    (reviewApp as any).dataManager = null;
    (reviewApp as any)._quizOverride = null;
    vi.restoreAllMocks();
  });

  it('逐篇做题：每篇做完显示正确率与 kind 标注，下一篇进入下一篇，结束中止', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    vault.files.set('B.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);

    const p = reviewApp.countReviewLoop([pick('A.md', 'new'), pick('B.md', 'overdue', 2, '刚学')], 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(quiz.startCalls).toBe(1);
    // 按数量复习：做题会话带 hideOptionCount（多选徽标不提示正确选项数）
    expect(quiz.lastStartOpts.hideOptionCount).toBe(true);
    // 第一篇（新文件）：100% → 卡片含正确率与「新文件」标注
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.popup.innerHTML).toContain('正确率 100%');
    expect(quiz.popup.innerHTML).toContain('📌 新文件');
    expect(quiz.popup.innerHTML).toContain('下一篇');
    // 下一篇 → 第二篇（逾期：正确率标注 + 阶段桶）
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.startCalls).toBe(2);
    void quiz._cb({ correct: 1, wrong: 1, total: 2, accuracy: 50 });
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.popup.innerHTML).toContain('正确率 50%');
    expect(quiz.popup.innerHTML).toContain('📌 逾期 · 刚学');
    expect(quiz.popup.innerHTML).toContain('自动标记：困难');
    // 末篇按钮为「查看汇总」；点结束 → 进汇总页（总正确率），结束按钮终结会话
    expect(quiz.popup.innerHTML).toContain('查看汇总');
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
    expect(quiz.popup.innerHTML).toContain('总正确率');
    expect(quiz.endCalls).toBe(0); // 会话仍在，等待汇总页「结束这次复习」
    quiz.popup.querySelector('#quiz-end-summary')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(quiz.endCalls).toBe(1);
    expect(quiz.startCalls).toBe(2);
  });

  it('逐篇出题失败：提示并跳过该篇继续', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    vault.files.set('B.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    let call = 0;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockImplementation(async () => (call++ === 0 ? [] : Q));
    const p = reviewApp.countReviewLoop([pick('A.md', 'new'), pick('B.md', 'new')], 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(getNoticeMessages().join('|')).toContain('出题失败');
    expect(quiz.startCalls).toBe(1); // 跳过 A，进入 B
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await p;
    expect(quiz.popup.innerHTML).toContain('总正确率');
    quiz.popup.querySelector('#quiz-end-summary')!.click();
    expect(quiz.endCalls).toBe(1); // 汇总页结束
  });

  it('文档内容为空 → 提示「内容为空，无法出题」，区别于 AI 失败', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '   \n  '); // 纯空白
    vault.files.set('B.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    let call = 0;
    // A（空内容）→ 返回空触发「内容为空」分支；B（有内容）→ 正常出题，验证跳过 A 后流程继续
    vi.spyOn(reviewApp, 'regenerateQuestions').mockImplementation(async () => (call++ === 0 ? [] : Q));
    const p = reviewApp.countReviewLoop([pick('A.md', 'new'), pick('B.md', 'new')], 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(getNoticeMessages().join('|')).toContain('「A」内容为空，无法出题，已跳过');
    expect(quiz.startCalls).toBe(1); // 跳过 A，进入 B 做题
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await p;
    expect(quiz.popup.innerHTML).toContain('总正确率');
    quiz.popup.querySelector('#quiz-end-summary')!.click();
  });

  it('文件不存在：静默跳过（挂起清理上游已做）', async () => {
    const vault = new MockVault();
    vault.files.set('B.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const p = reviewApp.countReviewLoop([pick('GONE.md', 'new'), pick('B.md', 'new')], 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.startCalls).toBe(1); // 只到 B
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await p;
    expect(quiz.popup.innerHTML).toContain('总正确率');
    expect(quiz.popup.innerHTML).toContain('已跳过'); // GONE 行
    quiz.popup.querySelector('#quiz-end-summary')!.click();
    expect(quiz.endCalls).toBe(1);
  });

  it('结果卡「查看原文档」（ticket 04）：内嵌预览弹层渲染全文，关闭后回到结果卡', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '# 标题\n正文内容ABC');
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const p = reviewApp.countReviewLoop([pick('A.md', 'new')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.popup.innerHTML).toContain('查看原文档');
    // ADR-0067 动态层级：预览显示即发号，必须盖过已显示的做题弹窗（合并后修复：原写死 10061 被 dynamic z 压住）
    quiz.popup.style.zIndex = '100000';
    (quiz.popup.querySelector('#quiz-view-note') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    // 预览渲染全文（mock MarkdownRenderer 写 textContent）
    const body = document.querySelector('#note-preview-body');
    expect(body).toBeTruthy();
    expect(body!.textContent).toContain('正文内容ABC');
    const previewPopup = document.querySelector('#note-preview-popup') as HTMLElement;
    expect(previewPopup).toBeTruthy();
    expect(Number(previewPopup.style.zIndex)).toBeGreaterThan(Number(quiz.popup.style.zIndex));
    // ❌ 关闭预览 → 回到结果卡 → 下一篇照常推进（末篇按钮为「查看汇总」，id 不变）
    (document.querySelector('#note-preview-popup button:last-child') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector('#note-preview-popup')).toBeNull();
    expect(quiz.popup.innerHTML).toContain('查看原文档');
    expect(quiz.popup.querySelector('#quiz-next-note')).toBeTruthy();
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await p;
    expect(quiz.popup.innerHTML).toContain('总正确率'); // 末篇 → 汇总页
    quiz.popup.querySelector('#quiz-end-summary')!.click();
    expect(quiz.endCalls).toBe(1);
  });

  it('预览「在 Obsidian 打开」：调用 openLinkText 并关闭预览', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const openLinkText = vi.fn().mockResolvedValue(undefined);
    (app.workspace as any).openLinkText = openLinkText;
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const p = reviewApp.countReviewLoop([pick('A.md', 'new')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    (quiz.popup.querySelector('#quiz-view-note') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    const btn = [...document.querySelectorAll('#note-preview-popup button')].find((b) => b.textContent === '在 Obsidian 打开') as HTMLElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(openLinkText).toHaveBeenCalledWith('A.md', '', false, { active: true });
    expect(document.querySelector('#note-preview-popup')).toBeNull();
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });
});

describe('buildCountResultCard（纯渲染：kind 标注 + 正确率 + 按钮）', () => {
  it('renders kind/bucket 与正确率', () => {
    const html = reviewApp.buildCountResultCard(pick('X.md', 'due-today', 3, '短期'), '《X》', { correct: 3, wrong: 1, total: 4, accuracy: 75 }, 'good', '下一篇');
    expect(html).toContain('🎯 X');
    expect(html).toContain('📌 今天到期 · 短期');
    expect(html).toContain('3/4');
    expect(html).toContain('正确率 75% · 自动标记：一般');
    expect(html).toContain('下一篇');
    expect(html).toContain('结束这次复习');
  });
});

describe('startCountSession（ticket 02：候选空态 / AI 未配置 / 正常启动 + 记忆输入）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    clearNotices();
    (reviewApp as any).dataManager = null;
    (reviewApp as any)._quizOverride = null;
  });

  it('候选文件夹为空 → 提示无文件可复习，不启动会话', async () => {
    const vault = new MockVault();
    vault.files.set('别处.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ reviewCountFolder: '卡片盒/笔记盒' }) as any);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    await reviewApp.startCountSession(5);
    expect(getNoticeMessages().join('|')).toContain('没有可复习的笔记');
    expect(quiz.startCalls).toBe(0);
  });

  it('AI 未配置 → 提示并中止', async () => {
    const vault = new MockVault();
    vault.files.set('卡片盒/笔记盒/A.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ reviewCountFolder: '卡片盒/笔记盒' }) as any);
    (reviewApp as any)._quizOverride = { ai: null };
    await reviewApp.startCountSession(2);
    expect(getNoticeMessages().join('|')).toContain('AI 服务未配置');
  });

  it('AI 已配置但做题家本会话未初始化（quiz.ai 为 null）→ 自动 ensureQuiz 后正常启动（回归：设置已配 AI 却误报未配置）', async () => {
    const vault = new MockVault();
    vault.files.set('卡片盒/笔记盒/A.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ reviewCountFolder: '卡片盒/笔记盒', reviewCountLastInput: 0 }) as any);
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const p = reviewApp.startCountSession(1);
    await new Promise((r) => setTimeout(r, 30));
    // 未设 _quizOverride：getQuiz 拿到被 ensureQuiz 补上 ai 的 quizUI → 进入做题，而非误报
    const quiz: any = await reviewApp.getQuiz();
    expect(quiz.ai).toBeTruthy();
    expect(quiz.startCalls).toBe(1);
    expect(getNoticeMessages().join('|')).not.toContain('AI 服务未配置');
    void quiz._cb({ correct: 1, wrong: 0, total: 1, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });

  it('正常启动：逾期优先安排、记忆上次输入、走逐篇做题', async () => {
    const vault = new MockVault();
    vault.files.set('卡片盒/笔记盒/A.md', '正文');
    vault.files.set('卡片盒/笔记盒/B.md', '正文');
    vault.files.set('卡片盒/笔记盒/C.md', '正文');
    const now = new Date();
    vault.files.set('CONFIG/STORAGE/review.json', JSON.stringify([
      {
        id: 'b', filePath: '卡片盒/笔记盒/B.md', name: 'B',
        reviewStart: now.toISOString(), stage: 1, phase: 'ladder', stability: 1, difficulty: 0.3,
        reviewHistory: [], totalReviews: 0, averageConfidence: 0,
        nextReviewDate: new Date(now.getTime() - 1000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false,
      },
    ]));
    const app = makeApp(vault);
    setApp(app);
    const settings: any = { reviewCountFolder: '卡片盒/笔记盒', reviewCountDefault: 5, reviewCountLastInput: 0 };
    setSettingsProvider(() => settings);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    setApp(app);
    const p = reviewApp.startCountSession(2);
    await new Promise((r) => setTimeout(r, 30));
    // 逾期 B 优先，其次新文件 A（新配额不足时补齐）
    expect(quiz.startCalls).toBe(1);
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.popup.innerHTML).toContain('📌 逾期');
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.startCalls).toBe(2);
    void quiz._cb({ correct: 0, wrong: 2, total: 2, accuracy: 0 });
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.popup.innerHTML).toContain('📌 新文件');
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
    expect(settings.reviewCountLastInput).toBe(2);
  });

  it('输入超出可用 → 取可用上限并提示实际篇数', async () => {
    const vault = new MockVault();
    vault.files.set('卡片盒/笔记盒/A.md', '正文');
    vault.files.set('卡片盒/笔记盒/B.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    setSettingsProvider(() => ({ reviewCountFolder: '卡片盒/笔记盒' }) as any);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const p = reviewApp.startCountSession(99);
    await new Promise((r) => setTimeout(r, 30));
    expect(getNoticeMessages().join('|')).toContain('本次共 2 篇（可用 2 篇）');
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });
});

describe('countReviewLoop 排期写入（ticket 03：首次评级写排期 / 新文件自动加入 / 待重做语义）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    clearNotices();
    setSettingsProvider(() => ({}) as any);
    (reviewApp as any).dataManager = null;
    (reviewApp as any)._quizOverride = null;
    vi.restoreAllMocks(); // 防跨测试 spy 污染（markReview/regenerateQuestions）
  });

  async function seedReview(vault: MockVault, paths: { path: string; stage?: number; nextReviewDate?: string | null; pendingRedo?: boolean }[]) {
    const now = new Date();
    vault.files.set('CONFIG/STORAGE/review.json', JSON.stringify(paths.map((p, i) => ({
      id: `id${i}`, filePath: p.path, name: p.path.split('/').pop()!.replace('.md', ''),
      reviewStart: now.toISOString(), stage: p.stage ?? 0, phase: 'ladder', stability: 1, difficulty: 0.3,
      reviewHistory: [], totalReviews: 0, averageConfidence: 0,
      nextReviewDate: p.nextReviewDate === undefined ? null : p.nextReviewDate, lastReviewed: null,
      lastDifficulty: null, completed: false, pendingRedo: p.pendingRedo ?? false,
    }))));
  }

  it('普通文档（未到期/阶段采样）：force 绕过时间门写排期（首次评级）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedReview(vault, [{ path: 'A.md', stage: 3, nextReviewDate: new Date(Date.now() + 86400000).toISOString() }]);
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const dm = new ReviewDataManager(app);
    const p = reviewApp.countReviewLoop([pick('A.md', 'due-today', 3, '短期')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    const after = (await dm.loadItems())[0];
    expect(after.lastReviewed).toBeTruthy(); // 未到期也写排期（force 生效）
    expect(after.totalReviews).toBe(1);
    expect(after.pendingRedo).toBe(false); // easy 清标记
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });

  it('普通文档 <70%（忘了）：写排期 + 自动置待重做', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedReview(vault, [{ path: 'A.md', stage: 3, nextReviewDate: new Date(Date.now() - 1000).toISOString() }]);
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const dm = new ReviewDataManager(app);
    const p = reviewApp.countReviewLoop([pick('A.md', 'overdue', 3, '短期')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 0, wrong: 2, total: 2, accuracy: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const after = (await dm.loadItems())[0];
    expect(after.pendingRedo).toBe(true); // again/hard → autoPending 置位
    expect(after.totalReviews).toBe(1);
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });

  it('新文件：自动加入 review.json 再写排期', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const dm = new ReviewDataManager(app);
    const p = reviewApp.countReviewLoop([pick('A.md', 'new')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    const items = await dm.loadItems();
    expect(items.length).toBe(1); // 自动加入
    expect(items[0].stage).toBe(2); // easy：stage 0 → +2
    expect(items[0].lastReviewed).toBeTruthy();
    expect(items[0].pendingRedo).toBe(false);
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });

  it('待重做 ≥70%（一般/简单）：仅清标记不写排期（markReview 不被调用、nextReviewDate 不变）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const fixed = new Date(Date.now() + 86400000).toISOString();
    await seedReview(vault, [{ path: 'A.md', stage: 5, nextReviewDate: fixed, pendingRedo: true }]);
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const markSpy = vi.spyOn(reviewApp, 'markReview').mockResolvedValue(undefined);
    const dm = new ReviewDataManager(app);
    const p = reviewApp.countReviewLoop([pick('A.md', 'redo', 5, '短期')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    const after = (await dm.loadItems())[0];
    expect(after.pendingRedo).toBe(false); // 清标记
    expect(after.nextReviewDate).toBe(fixed); // 排期未动
    expect(markSpy).not.toHaveBeenCalled();
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });

  it('待重做 <70%：保持待重做、不中断流程（下一篇继续）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    vault.files.set('B.md', '正文');
    await seedReview(vault, [
      { path: 'A.md', stage: 3, nextReviewDate: new Date(Date.now() - 1000).toISOString(), pendingRedo: true },
      { path: 'B.md', stage: 1, nextReviewDate: new Date(Date.now() - 1000).toISOString() },
    ]);
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const dm = new ReviewDataManager(app);
    const p = reviewApp.countReviewLoop([pick('A.md', 'redo', 3, '短期'), pick('B.md', 'overdue', 1, '刚学')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 0, wrong: 2, total: 2, accuracy: 0 });
    await new Promise((r) => setTimeout(r, 30));
    expect((await dm.loadItems())[0].pendingRedo).toBe(true); // 保持待重做
    // 不中断流程 → 下一篇 B 照常开始
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.startCalls).toBe(2);
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });

  it('中途退出结算 total=0 → again：已做篇写排期 + 置待重做（不悬挂）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    await seedReview(vault, [{ path: 'A.md', stage: 2, nextReviewDate: new Date(Date.now() - 1000).toISOString() }]);
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const dm = new ReviewDataManager(app);
    const p = reviewApp.countReviewLoop([pick('A.md', 'overdue', 2, '刚学')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 0, wrong: 0, total: 0, accuracy: 0 });
    await new Promise((r) => setTimeout(r, 30));
    const after = (await dm.loadItems())[0];
    expect(after.pendingRedo).toBe(true);
    expect(after.lastReviewed).toBeTruthy();
    quiz.popup.querySelector('#quiz-end-review')!.click();
    await p;
  });
});

describe('汇总页与重做本篇（ticket 05）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    clearNotices();
    setSettingsProvider(() => ({}) as any);
    (reviewApp as any).dataManager = null;
    (reviewApp as any)._quizOverride = null;
    vi.restoreAllMocks();
  });

  it('汇总页：总正确率 + 未通过标红 + 重做本篇刷新该行（重做语义：通过清标记不写排期）', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    vault.files.set('B.md', '正文');
    const now = new Date();
    vault.files.set('CONFIG/STORAGE/review.json', JSON.stringify([
      {
        id: 'a', filePath: 'A.md', name: 'A',
        reviewStart: now.toISOString(), stage: 2, phase: 'ladder', stability: 1, difficulty: 0.3,
        reviewHistory: [], totalReviews: 0, averageConfidence: 0,
        nextReviewDate: new Date(now.getTime() - 1000).toISOString(), lastReviewed: null, lastDifficulty: null, completed: false,
      },
    ]));
    const app = makeApp(vault);
    setApp(app);
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    const dm = new ReviewDataManager(app);
    const p = reviewApp.countReviewLoop([pick('A.md', 'overdue', 2, '刚学'), pick('B.md', 'new')], 0);
    await new Promise((r) => setTimeout(r, 20));
    void quiz._cb({ correct: 0, wrong: 2, total: 2, accuracy: 0 }); // A 失败
    await new Promise((r) => setTimeout(r, 30));
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await new Promise((r) => setTimeout(r, 30));
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 }); // B 通过
    await new Promise((r) => setTimeout(r, 30));
    quiz.popup.querySelector('#quiz-next-note')!.click(); // 末篇 → 汇总
    await p;
    expect(quiz.popup.innerHTML).toContain('总正确率');
    expect(quiz.popup.innerHTML).toContain('50%'); // (0+2)/(2+2)
    expect(quiz.popup.innerHTML).toContain('未通过');
    expect(quiz.popup.innerHTML).toContain('通过');
    expect((await dm.loadItems()).find((i) => i.filePath === 'A.md')!.pendingRedo).toBe(true);
    // 重做本篇 A：重新出题单篇重做 → 通过 → 汇总行刷新
    (quiz.popup.querySelectorAll('#count-summary-redo')[0] as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.startCalls).toBe(3); // 第三篇会话（重做）
    void quiz._cb({ correct: 2, wrong: 0, total: 2, accuracy: 100 });
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.popup.innerHTML).toContain('返回汇总');
    quiz.popup.querySelector('#quiz-next-note')!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(quiz.popup.innerHTML).toContain('总正确率');
    expect(quiz.popup.innerHTML).not.toContain('未通过'); // 两篇均通过
    expect((await dm.loadItems()).find((i) => i.filePath === 'A.md')!.pendingRedo).toBe(false);
    quiz.popup.querySelector('#quiz-end-summary')!.click();
    expect(quiz.endCalls).toBe(1);
  });
});

describe('入口与篇数弹窗（ticket 02 UI）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    clearNotices();
    document.body.innerHTML = '';
    setSettingsProvider(() => ({ reviewCountFolder: '卡片盒/笔记盒', reviewCountDefault: 5, reviewCountLastInput: 0 }) as any);
    (reviewApp as any).dataManager = null;
    (reviewApp as any)._quizOverride = null;
  });

  it('复习主窗口头部含「按数量复习」按钮；点击弹出篇数弹窗（默认值与上限正确），确定后启动会话', async () => {
    const vault = new MockVault();
    vault.files.set('卡片盒/笔记盒/A.md', '正文');
    vault.files.set('卡片盒/笔记盒/B.md', '正文');
    vault.files.set('卡片盒/笔记盒/C.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const ui = new UIManager(app, new ReviewDataManager(app));
    ui.showMain();
    const btn = document.querySelector('#review-btn-count') as HTMLElement;
    expect(btn).toBeTruthy();
    const quiz = makeQuizMock();
    (reviewApp as any)._quizOverride = quiz;
    vi.spyOn(reviewApp, 'regenerateQuestions').mockResolvedValue(Q);
    btn.click();
    await new Promise((r) => setTimeout(r, 50));
    const input = document.querySelector('.review-count-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.max).toBe('3'); // 可用 3 篇
    expect(input.value).toBe('3'); // 上次 0 → 默认 5 → 钳制到 3
    (document.querySelector('.review-count-ok') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(quiz.startCalls).toBeGreaterThan(0);
    ui.destroy();
  });

  it('空候选：弹窗不开，提示无文件可复习', async () => {
    const vault = new MockVault();
    vault.files.set('别处.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const ui = new UIManager(app, new ReviewDataManager(app));
    ui.showMain();
    (document.querySelector('#review-btn-count') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('.review-count-input')).toBeNull();
    expect(getNoticeMessages().join('|')).toContain('没有可复习的笔记');
    ui.destroy();
  });
});