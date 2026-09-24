/**
 * 复习计划核心应用（ticket 16 修正版：对齐源码 App，含 quizReviewLoop/reviewLoop）
 */
import type { App, TFile } from 'obsidian';
import { notice, notify } from '../core/notice';
import type { NoticeHandle } from '../core/notice';
import { getApp } from '../core/app';
import { getSettings, saveSettings } from '../core/settings-provider';
import { escapeHtml } from '../core/utils';
import { FSRS, FSRS_FIRST_INTERVALS, FSRS_FIRST_TEXTS, LADDER_MAX, DEFAULT_W } from './fsrs';
import type { Rating } from './fsrs';
import type { ReviewItem } from './data';
import { ReviewDataManager, getReviewFilePath, loadFittedParams, saveFittedParams } from './data';
import { fitFromItems, mergeFittedW } from './fit';
import { collectOutgoingLinks } from './links';
import { collectFolderFiles, eligibleCount, selectCountReview, selectOverduePicks, type CountPick, type CountPickKind } from './count';
import { showNotePreview } from './preview';

/** 按数量复习单篇结果（汇总页数据源） */
export interface CountSessionResult {
  filePath: string;
  name: string;
  kind: CountPickKind;
  bucket: string | null;
  correct: number;
  wrong: number;
  total: number;
  accuracy: number;
  rating: Rating;
  failed: boolean;
}

/** 已完成（有答题）篇数 */
function doneCount(results: CountSessionResult[]): number {
  return results.filter((r) => r.total > 0).length;
}

export const reviewApp = {
  checkInterval: null as ReturnType<typeof setInterval> | null,
  dataManager: null as ReviewDataManager | null,
  /** 上游线 P1：拟合后的生效权重（无拟合产物 = null 回退 DEFAULT_W） */
  _fittedW: null as number[] | null,
  /** 上游线 P1：距上次拟合的评级累计（达 reviewFitEveryN 触发后台重拟合） */
  _reviewCountSinceFit: 0,
  _fitRunning: false,
  /** 测试注入：对齐源码 window.__quiz 语义 */
  _quizOverride: null as any | null,
  /** 已通知逾期的笔记路径（ticket 100：diff 记忆集合，避免重复刷屏） */
  _notifiedOverdue: new Set<string>(),
/** 文件树未渲染重试计数（applyReviewStyles 自愈：抽屉未开/懒渲染时 2s 重试） */
  _stainRetries: 0,
  /** 逾期常驻通知句柄：同键合并时 notify 返回空操作，留存真句柄供逾期清零时主动收起 */
  _overdueNotice: null as NoticeHandle | null,
  /** ADR-0116 追加：上次通知展示的逾期篇数（-1=未展示过）——数字自纠的对比基准 */
  _lastOverdueCount: -1,
  /** ticket 48：已染色/挂徽章的文件路径（移出计划后据此回退；仅提交计划路径 + 曾染色路径，不再全库扫描） */
  _styledPaths: new Set<string>(),

  async getQuiz(): Promise<any> {
    if (this._quizOverride) return this._quizOverride;
    return (await import('../quiz')).quizUI;
  },

  ensure(app: App): void {
    if (!this.dataManager) this.dataManager = new ReviewDataManager(app);
    // 上游线 P1：启动加载拟合参数（无产物回退默认；fire-and-forget）
    void this.loadFitParams(app).catch(() => {});
  },

  /** 上游线 P1：加载拟合参数到 _fittedW（无则 null 回退默认） */
  async loadFitParams(app: App): Promise<void> {
    try {
      const fit = await loadFittedParams(app);
      this._fittedW = fit ? mergeFittedW(fit.w) : null;
    } catch (e) {
      this._fittedW = null;
    }
  },

  /** 上游线 P1：每 N 次复习自动重拟合（全自动定期重算，样本门槛与开关在实现内）。
   *  markReview 每次评级后调用（count+1）；达阈值且开关开 → 异步后台跑，完成后轻提示。
   *  样本不足 → 静默保留默认（不提示）。 */
  async maybeRunFit(app: App): Promise<void> {
    const s = getSettings() as any;
    if (s.reviewEnableFit === false) return;
    const n = Number(s.reviewFitEveryN) || 10;
    this._reviewCountSinceFit++;
    if (this._reviewCountSinceFit < n || this._fitRunning) return;
    this._fitRunning = true;
    this._reviewCountSinceFit = 0;
    try {
      const dm = this.dataManager!;
      const items = await dm.loadItems();
      const result = fitFromItems(items);
      if (result) {
        await saveFittedParams(app, {
          w: result.fit.w,
          fitAt: new Date().toISOString(),
          fitCount: result.count,
          full: result.fit.w.length >= 19,
        });
        this._fittedW = mergeFittedW(result.fit.w);
        notice(`已根据 ${result.count} 条复习记录拟合记忆参数`, 'success');
      }
    } catch (e) {
      console.warn('复习参数拟合失败，回退默认:', e);
    } finally {
      this._fitRunning = false;
    }
  },

  /** 上游线 P1：获取当前生效权重（拟合参数优先，回退默认） */
  currentW(): number[] {
    return this._fittedW || DEFAULT_W;
  },

  /** 上游线 P1：某条目当前记忆保留度 R（FSRS 相位且已复习过才可算；否则 null） */
  currentR(item: ReviewItem): number | null {
    if (item.phase !== 'fsrs' || !item.stability || !item.lastReviewed) return null;
    const t = (new Date().getTime() - new Date(item.lastReviewed).getTime()) / 86400000;
    if (!(t > 0)) return null;
    return new FSRS(this.currentW()).R(t, item.stability);
  },

  async markReview(filePath: string, selectedDifficulty: Rating, opts?: { autoPending?: boolean; force?: boolean }): Promise<void> {
    const app = getApp();
    this.ensure(app);
    const dm = this.dataManager!;
    const items = await dm.loadItems();
    const item = items.find((i) => i.filePath === filePath);
    if (!item) {
      notice('条目不存在');
      return;
    }
    if (item.completed) {
      notice('该笔记已完成全部复习');
      return;
    }

    const now = new Date();
    const nextReview = item.nextReviewDate ? new Date(item.nextReviewDate) : new Date(0);
    // 时间门仅挡手动路径；按数量复习（force）会选「今天到期/阶段采样」的未来排期文档，复习完成即合法排期
    if (now < nextReview && !opts?.force) {
      const diff = nextReview.getTime() - now.getTime();
      const mins = Math.ceil(diff / 60000);
      notice(`还未到复习时间（${mins}分钟后）`);
      return;
    }

    const rating = selectedDifficulty;
    const currentStage = item.stage;
    const fsrs = new FSRS(this.currentW()); // 上游线 P1：拟合权重优先（无产物=DEFAULT_W，行为等同）

    // ===== 阶段 0-9：固定阶梯 =====
    if (currentStage <= LADDER_MAX) {
      let targetStage: number;
      if (rating === 'again') targetStage = Math.max(0, currentStage - 1);
      else if (rating === 'hard') targetStage = currentStage;
      else if (rating === 'good') targetStage = currentStage + 1;
      else targetStage = currentStage + 2; // easy
      targetStage = Math.max(0, Math.min(targetStage, LADDER_MAX));
      const nextDate = new Date(now.getTime() + FSRS_FIRST_INTERVALS[targetStage] * 86400000);
      const enteringFsrs = targetStage >= LADDER_MAX;

      await dm.updateItem(filePath, (it) => {
        it.stage = targetStage;
        it.phase = enteringFsrs ? 'fsrs' : 'ladder';
        it.lastReviewed = now.toISOString();
        it.lastDifficulty = rating;
        it.totalReviews = (it.totalReviews || 0) + 1;
        if (!it.reviewHistory) it.reviewHistory = [];
        it.reviewHistory.push({ timestamp: now.toISOString(), stage: targetStage + 1, rating });
        // 进入 FSRS 阶段时，用对应评分初始化 S
        if (enteringFsrs) {
          it.stability = fsrs.initS(rating);
          it.difficulty = rating === 'again' ? fsrs.w[4] : 0.3;
        }
        it.nextReviewDate = nextDate.toISOString();
        if (enteringFsrs) it.completed = false; // 进入 FSRS 不算完成

        // ticket 098：做题会话自动评级未通过/通过联动待重做标记；其余路径 good/easy 清（ADR-0044）
        if (opts?.autoPending) it.pendingRedo = rating === 'again' || rating === 'hard';
        else if (rating === 'good' || rating === 'easy') it.pendingRedo = false;
      });
      notice(enteringFsrs ? `进入深度复习，${FSRS_FIRST_TEXTS[targetStage]}后复习` : `${FSRS_FIRST_TEXTS[targetStage]}后复习`, 'success');
      // 上游线 P1：评级也累计拟合计数（含阶梯阶段；样本过滤在 fit.ts 内做）。fire-and-forget 防卡评级路径
      void this.maybeRunFit(getApp());
      return;
    }

    // ===== 阶段 10+：满血 FSRS =====
    const S = item.stability || 1;
    const D = item.difficulty || 0.3;
    const t = (now.getTime() - new Date(item.lastReviewed || item.reviewStart).getTime()) / 86400000;
    const R = fsrs.R(t, S);
    const result = fsrs.nextInterval(S, D, rating, R);
    // ticket 100：复习间隔缩放（ADR-0046，用户拍板解冻）——FSRS 相位出题天数 × 系数；阶梯阶段固定表不受影响
    const scale = (getSettings() as any).reviewIntervalScale ?? 1;
    const scaledDays = Math.max(0.01, result.days * (Number(scale) > 0 ? Number(scale) : 1));
    const nextDate = new Date(now.getTime() + scaledDays * 86400000);

    await dm.updateItem(filePath, (it) => {
      it.stability = Math.round(result.S * 100) / 100;
      it.difficulty = Math.round(result.D * 100) / 100;
      it.lastReviewed = now.toISOString();
      it.lastDifficulty = rating;
      it.totalReviews = (it.totalReviews || 0) + 1;
      if (!it.reviewHistory) it.reviewHistory = [];
      it.reviewHistory.push({ timestamp: now.toISOString(), stage: currentStage + 1, rating, stability: Math.round(result.S * 100) / 100, R: Math.round(R * 100) });
      it.nextReviewDate = nextDate.toISOString();

      // ticket 098：做题会话自动评级未通过/通过联动待重做标记；其余路径 good/easy 清（ADR-0044）
      if (opts?.autoPending) it.pendingRedo = rating === 'again' || rating === 'hard';
      else if (rating === 'good' || rating === 'easy') it.pendingRedo = false;
    });

    const days = Math.round(scaledDays);
    const rPct = Math.round(R * 100);
    notice(`R=${rPct}% → 下次复习：${days > 0 ? days + '天' : '1天'}后`, 'success');
    // 上游线 P1：fire-and-forget 后台拟合（不 await，避免大历史时卡评级路径）
    void this.maybeRunFit(getApp());
  },

  /** 准确率 → 难度评级 */
  accuracyToRating(accuracy: number): Rating {
    if (accuracy >= 90) return 'easy';
    if (accuracy >= 70) return 'good';
    if (accuracy >= 50) return 'hard';
    return 'again';
  },

  /** 重做出题（ADR-0044/Q7-②）：清空旧题 → ensureQuestions 全新生成；失败或空题回退剩余错题
   *  ticket 099：与 batchGenerateQuestions 对齐补 notePath/_index（renderModal 需要；缺失曾致 split 崩溃） */
  async regenerateQuestions(filePath: string): Promise<any[]> {
    const quiz: any = await this.getQuiz();
    if (!quiz || !quiz.ai) return [];
    const leftover = (await quiz.manager.getQuestionsForNote(getApp(), filePath)) || [];
    await quiz.manager.saveQuestionsForNote(getApp(), filePath, []);
    await quiz.ensureQuestions([filePath]);
    const fresh = (await quiz.manager.getQuestionsForNote(getApp(), filePath)) || [];
    const picked = fresh.length ? fresh : leftover;
    return picked.map((q: any, i: number) => ({ ...q, notePath: filePath, _index: i }));
  },

/** 按数量复习（ticket 02）：候选统计（篇数弹窗上限与空态） */
  async countStats(): Promise<{ folder: string; files: string[]; available: number }> {
    const app = getApp();
    this.ensure(app);
    const settings = getSettings() as any;
    const folder = (settings.reviewCountFolder || '卡片盒/笔记盒').trim();
    const files = collectFolderFiles(app, folder);
    const items = await this.dataManager!.loadItems();
    return { folder, files, available: eligibleCount(files, items, new Date()) };
  },

  /** 按数量复习（ticket 02 骨架）：选择安排 → 逐篇做题 → 正确率；排期写入 T03 接入 */
  async startCountSession(count: number): Promise<void> {
    const app = getApp();
    this.ensure(app);
    const stats = await this.countStats();
    if (!stats.available) {
      notice(`「${stats.folder}」下没有可复习的笔记`, 'warning');
      return;
    }
    const n = Math.min(Math.max(1, Math.floor(count) || 1), stats.available);
    if (n !== count) notice(`本次共 ${n} 篇（可用 ${stats.available} 篇）`, 'info');
    const picks = selectCountReview(stats.files, await this.dataManager!.loadItems(), n, new Date());
    if (!picks.length) {
      notice('没有可复习的笔记', 'warning');
      return;
    }
    const s = getSettings() as any;
    if (s && s.reviewCountLastInput !== n) {
      s.reviewCountLastInput = n;
      await saveSettings();
    }
    const quiz = await this.ensureQuizReady();
    if (!quiz) {
      notice('AI 服务未配置，无法按数量复习', 'warning');
      return;
    }
    await this.countReviewLoop(picks, 0);
  },

  /** 做题家懒加载（统一出口，ticket 168）：设置里配了 AI 但本会话还没初始化过做题家时 quiz.ai 为 null
   *  （ensureQuiz 幂等：AI 注入）；失败/未配置返回 null。手动按数量与「去复习」会话共用。 */
  async ensureQuizReady(): Promise<any | null> {
    let quiz: any = null;
    try {
      quiz = await this.getQuiz();
    } catch {
      /* ignore */
    }
    if (quiz && !quiz.ai) {
      try {
        const { ensureQuiz } = await import('../quiz');
        ensureQuiz(getApp());
        quiz = await this.getQuiz();
      } catch {
        /* ignore */
      }
    }
    return quiz && quiz.ai ? quiz : null;
  },

  /** 去复习会话（ticket 168/切片 03）：逾期常驻通知「去复习」→ 直接进入按数量复习会话。
   *  选择 = 全 vault 逾期（任意目录，见 count.ts selectOverduePicks），
   *  篇数 = min(逾期数, 每日复习上限||∞)，超限提示剩余留到下次；复用 countReviewLoop 与汇总页。 */
  async startOverdueCountSession(): Promise<void> {
    const app = getApp();
    this.ensure(app);
    const items = await this.dataManager!.loadItems();
    const overdueCount = items.filter((i) => i.isOverdue && !i.isCompleted && !i.isMissing).length;
    const picks = selectOverduePicks(items, new Date(), Number((getSettings() as any).reviewDailyLimit) || 0);
    if (!picks.length) {
      notice('没有逾期笔记', 'success');
      return;
    }
    if (picks.length < overdueCount) {
      notice(`本轮复习 ${picks.length} 篇，剩余 ${overdueCount - picks.length} 篇留到下次`, 'info');
    }
    const quiz = await this.ensureQuizReady();
    if (!quiz) {
      notice('AI 服务未配置，无法按数量复习', 'warning');
      return;
    }
    await this.countReviewLoop(picks, 0);
  },

  /** 按数量复习逐篇循环（ticket 02/05）：进篇逐篇出题 → 单篇做题 → 收集结果 → 末篇/结束进汇总页 */
  async countReviewLoop(picks: CountPick[], index: number, results: CountSessionResult[] = []): Promise<void> {
    const app = getApp();
    this.ensure(app);
    if (index >= picks.length) {
      await this.showCountSummary(picks, results);
      return;
    }
    const pick = picks[index];
    const file = app.vault.getAbstractFileByPath(pick.filePath) as TFile | null;
    if (!file) {
      await this.countReviewLoop(picks, index + 1, results);
      return;
    }
    // 逐篇出题：复用重做链路（清旧题 → AI 全新生成 → 补 notePath/_index）；失败跳过该篇
    const questions = await this.regenerateQuestions(pick.filePath);
    if (!questions.length) {
      // 区分原因：文档内容为空（被 ensureQuestions 的 content.trim() 排除，无任何报错通知）→ 明确提示，避免误判为 AI 异常
      let contentEmpty = false;
      try {
        contentEmpty = !(await app.vault.read(file)).trim();
      } catch {
        contentEmpty = true;
      }
      notice(
        contentEmpty
          ? `「${file.basename}」内容为空，无法出题，已跳过`
          : `「${file.basename}」出题失败，已跳过`,
        'warning'
      );
      await this.countReviewLoop(picks, index + 1, results);
      return;
    }
    const isLast = index >= picks.length - 1;
    const out = await this.runCountItem(pick, file, questions, isLast ? '查看汇总' : '下一篇');
    if (out === null) {
      await this.showCountSummary(picks, results); // 用户提前结束：汇总已完成部分
      return;
    }
    results.push(out);
    await this.countReviewLoop(picks, index + 1, results);
  },

  /** 单篇做题会话（ticket 05）：做题 → 排期写入 → 结果卡（查看原文档/下一篇/结束）
   *  返回该篇结果；「结束这次复习」返回 null（不终结会话弹窗，由调用方决定收尾）。 */
  async runCountItem(pick: CountPick, file: TFile, questions: any[], nextLabel: string, redoSemantic: boolean = false): Promise<CountSessionResult | null> {
    const app = getApp();
    const quiz = await this.getQuiz();
    return new Promise((resolve) => {
      quiz.startReviewSession({
        questions,
        // 按数量复习：多选徽标不提示正确选项数（hideOptionCount）
        hideOptionCount: true,
        onComplete: async (q: any) => {
          const rating = this.accuracyToRating(q.accuracy);
          await this.applyCountScheduling(pick, file.basename, rating, redoSemantic);
          const result: CountSessionResult = {
            filePath: pick.filePath,
            name: file.basename,
            kind: pick.kind,
            bucket: pick.bucket,
            correct: q.correct,
            wrong: q.wrong,
            total: q.total,
            accuracy: q.accuracy,
            rating,
            failed: rating === 'again' || rating === 'hard',
          };
          const popup = quiz.popup;
          if (!popup) {
            resolve(result); // 弹窗被关闭（如 ESC 结算）：本篇已结算，继续流程
            return;
          }
          popup.innerHTML = this.buildCountResultCard(pick, file.basename, q, rating, nextLabel);
          // 查看原文档（T04）：内嵌预览弹层，不推进流程；关闭后回到结果卡
          popup.querySelector('#quiz-view-note')!.addEventListener('click', () => {
            void showNotePreview(app, pick.filePath, file.basename);
          });
          const action = await new Promise<string>((resolveAction) => {
            popup.querySelector('#quiz-next-note')!.onclick = () => resolveAction('next');
            popup.querySelector('#quiz-end-review')!.onclick = () => resolveAction('end');
          });
          if (action === 'end') {
            resolve(null);
            return;
          }
          resolve(result);
        },
      });
    });
  },

  /** 排期写入（T03）：普通文档（逾期/今天到期/新文件/阶段采样）首次评级写排期 + autoPending（<70% 置待重做）；
   *  新文件先加入 review.json 再写排期；待重做/重做语义——≥70%（一般/简单）仅清标记不写排期，<70% 保持待重做（ADR-0044）。 */
  async applyCountScheduling(pick: CountPick, name: string, rating: Rating, redoSemantic: boolean = false): Promise<void> {
    const app = getApp();
    this.ensure(app);
    const dm = this.dataManager!;
    const items = await dm.loadItems();
    const item = items.find((i) => i.filePath === pick.filePath);
    const failed = rating === 'again' || rating === 'hard';
    console.warn('[bz/sched] 进入排期写入', {
      kind: pick.kind, filePath: pick.filePath, hasItem: !!item, redoSemantic, itemsCount: items.length,
      reviewFile: getReviewFilePath(),
    });
    try {
      if (redoSemantic || pick.kind === 'redo') {
        if (item && !failed) {
          await dm.updateItem(pick.filePath, (it) => {
            it.pendingRedo = false;
          });
          console.warn('[bz/sched] redo 清标记');
        }
      } else if (item) {
        await this.markReview(pick.filePath, rating, { autoPending: true, force: true });
        console.warn('[bz/sched] 老条目 markReview 完成');
      } else {
        // 新文件：先入计划（首次评级 = 唯一排期来源，ADR-0044）
        try {
          await dm.addItem(pick.filePath, name);
          console.warn('[bz/sched] 新文件 addItem 完成');
        } catch (e) {
          /* 并发已加入 → 忽略 */
          console.warn('[bz/sched] addItem 已存在/忽略', e);
        }
        await this.markReview(pick.filePath, rating, { autoPending: true, force: true });
        console.warn('[bz/sched] 新文件 markReview 完成');
      }
    } catch (e) {
      console.error('[bz/sched] 排期写入异常', e);
    }
    await this.applyReviewStyles(app);
  },

  /** 按数量复习汇总页（ticket 05）：总正确率 + 每篇一行（正确率/查看原文档/重做本篇；未通过标红） */
  async showCountSummary(picks: CountPick[], results: CountSessionResult[]): Promise<void> {
    const quiz = await this.getQuiz();
    if (!quiz.popup) return;
    const done = results.filter((r) => r.total > 0);
    const totalCorrect = done.reduce((s, r) => s + r.correct, 0);
    const totalQ = done.reduce((s, r) => s + r.total, 0);
    const acc = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
    quiz.popup.innerHTML = this.buildCountSummary(picks, results, acc);
    quiz.popup.querySelectorAll('#count-summary-view').forEach((btn) => {
      btn.addEventListener('click', () => {
        const path = (btn as HTMLElement).dataset.path || '';
        const name = (btn as HTMLElement).dataset.name || '';
        void showNotePreview(getApp(), path, name);
      });
    });
    quiz.popup.querySelectorAll('#count-summary-redo').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number((btn as HTMLElement).dataset.idx);
        const pk = picks[idx];
        if (pk) void this.countRedoOne(pk, idx, picks, results);
      });
    });
    quiz.popup.querySelector('#quiz-end-summary')!.addEventListener('click', () => {
      quiz.endReviewSession();
    });
  },

  /** 汇总页模板：总正确率 + 每篇一行；未完成篇显示「已跳过」 */
  buildCountSummary(picks: CountPick[], results: CountSessionResult[], acc: number): string {
    const byPath = new Map(results.map((r) => [r.filePath, r]));
    const rows = picks
      .map((p, idx) => {
        const r = byPath.get(p.filePath);
        const name = r ? r.name : (p.filePath.split('/').pop() || '').replace(/\.md$/, '');
        if (!r) {
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--background-modifier-border);">
              <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);">${name}</div>
              <span style="font-size:12px;color:var(--text-muted);flex-shrink:0;">已跳过</span>
              <button id="count-summary-view" data-path="${p.filePath}" data-name="${name}" style="flex-shrink:0;padding:4px 10px;border:none;border-radius:6px;background:var(--background-secondary);color:var(--text-normal);cursor:pointer;font-size:12px;">查看原文档</button>
            </div>`;
        }
        const color = r.failed ? '#ff4757' : '#2ed573';
        const status = r.failed ? '未通过' : '通过';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--background-modifier-border);">
            <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-normal);">🎯 ${name}</div>
            <span style="font-size:13px;color:var(--text-muted);flex-shrink:0;">${r.correct}/${r.total}（${r.accuracy}%）</span>
            <span style="font-size:12px;color:${color};flex-shrink:0;">${status}</span>
            <button id="count-summary-view" data-path="${p.filePath}" data-name="${name}" style="flex-shrink:0;padding:4px 10px;border:none;border-radius:6px;background:var(--background-secondary);color:var(--text-normal);cursor:pointer;font-size:12px;">查看原文档</button>
            <button id="count-summary-redo" data-idx="${idx}" style="flex-shrink:0;padding:4px 10px;border:none;border-radius:6px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:12px;">重做本篇</button>
          </div>`;
      })
      .join('');
    return `
      <div style="padding:24px;">
        <div style="font-size:18px;font-weight:600;margin-bottom:4px;color:var(--text-normal);">📊 复习汇总</div>
        <div style="font-size:32px;font-weight:700;margin:8px 0 16px;color:var(--text-normal);">${acc}%</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">总正确率（已完成 ${doneCount(results)}/${picks.length} 篇）</div>
      </div>
      <div style="padding:0 24px;">${rows || '<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">未完成任何复习</div>'}</div>
      <div style="padding:16px 24px 24px;">
        <button id="quiz-end-summary" style="display:block;width:100%;padding:10px;border:none;border-radius:6px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:13px;font-weight:500;">结束这次复习</button>
      </div>
    `;
  },

  /** 重做本篇（ticket 05）：重新出题单篇重做（重做语义——通过清标记不写排期、未通过保持待重做），完成后刷新汇总行 */
  async countRedoOne(pick: CountPick, idx: number, picks: CountPick[], results: CountSessionResult[]): Promise<void> {
    const app = getApp();
    const quiz = await this.getQuiz();
    const file = app.vault.getAbstractFileByPath(pick.filePath) as TFile | null;
    if (!file) return;
    const questions = await this.regenerateQuestions(pick.filePath);
    if (!questions.length) {
      notice('重做失败：无题目可用', 'warning');
      return;
    }
    const out = await this.runCountItem(pick, file, questions, '返回汇总', true);
    if (out === null) {
      quiz.endReviewSession(); // 重做中点「结束这次复习」→ 会话结束
      return;
    }
    results[idx] = out;
    await this.showCountSummary(picks, results);
  },

  /** 按数量复习结果卡：kind 标注 + 正确率 + 查看原文档/下一篇/结束 */
  buildCountResultCard(pick: CountPick, name: string, results: any, rating: Rating, nextLabel: string): string {
    const ratingNames: Record<string, string> = { again: '忘了', hard: '困难', good: '一般', easy: '简单' };
    const tagColors: Record<string, string> = { again: '#ff4757', hard: '#ff9f43', good: '#2ed573', easy: '#7bed9f' };
    const kindTexts: Record<string, string> = { redo: '待重做', overdue: '逾期', 'due-today': '今天到期', new: '新文件', stage: '复习' };
    return `
      <div style="text-align:center;padding:24px;">
        <div style="font-size:18px;font-weight:600;margin-bottom:16px;color:var(--text-normal);">🎯 ${name.replace(/^《|》$/g, '')}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">📌 ${kindTexts[pick.kind] || ''}${pick.bucket ? ` · ${pick.bucket}` : ''}</div>
        <div style="font-size:40px;margin-bottom:16px;">${results.correct}/${results.total}</div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:12px;">✅ 答对 ${results.correct} 题　❌ 答错 ${results.wrong} 题</div>
        <div style="display:inline-block;padding:6px 16px;border-radius:16px;font-size:14px;font-weight:500;background:${tagColors[rating]}22;color:${tagColors[rating]};margin-bottom:20px;">正确率 ${results.accuracy}% · 自动标记：${ratingNames[rating]}</div>
      </div>
      <button id="quiz-view-note" style="display:block;width:100%;padding:10px;border:none;border-radius:6px;background:var(--background-secondary);color:var(--text-normal);cursor:pointer;font-size:13px;">查看原文档</button>
      <button id="quiz-next-note" style="display:block;width:100%;padding:10px;border:none;border-radius:6px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:13px;font-weight:500;">${nextLabel || '下一篇'}</button>
      <button id="quiz-end-review" style="display:block;width:100%;padding:10px;margin-top:8px;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-secondary);color:var(--text-muted);cursor:pointer;font-size:13px;">结束这次复习</button>
    `;
  },

  /** 加入当前笔记到复习计划（ticket 169：非 .md 拒绝；已在计划中提示且不动既有排期；参数取结构最小面） */
  async addCurrentToReview(file: { path: string; basename: string; extension: string }): Promise<void> {
    if (file.extension !== 'md') {
      notice('仅支持 Markdown 笔记加入复习计划', 'error');
      return;
    }
    this.ensure(getApp());
    const dm = this.dataManager!;
    const items = await dm.loadItems();
    if (items.some((i) => i.filePath === file.path)) {
      notice('已在复习计划中', 'info');
      return;
    }
    await dm.addItem(file.path, file.basename);
    notice('已加入复习计划，首次复习：1分钟后', 'success');
  },

  /** 批量加入当前笔记及其一级出链（ticket 170）：正文 + frontmatter 链接逐篇查重加入，
   *  已在计划中的跳过不动排期；当前文档已在计划中不中止（计入跳过）、出链照常处理；
   *  非 .md 整单拒绝；结束给一条汇总通知（有新增 success、无新增 info）。 */
  async addCurrentWithLinksToReview(file: { path: string; basename: string; extension: string }): Promise<void> {
    if (file.extension !== 'md') {
      notice('仅支持 Markdown 笔记加入复习计划', 'error');
      return;
    }
    const app = getApp();
    this.ensure(app);
    const dm = this.dataManager!;
    const items = await dm.loadItems();
    const existing = new Set(items.map((i) => i.filePath));
    const cache = app.metadataCache?.getFileCache?.(file as any) ?? null;
    const outgoing = collectOutgoingLinks(cache as any, file.path, (lp, from) =>
      app.metadataCache.getFirstLinkpathDest(lp, from) as any
    );
    // 目标集合整体按路径去重（出链指回当前文档/互相重复时不重复计数）
    const seenTargets = new Set<string>();
    const targets = [file, ...outgoing].filter((t) => !seenTargets.has(t.path) && seenTargets.add(t.path));
    let added = 0;
    let skipped = 0;
    for (const target of targets) {
      if (existing.has(target.path)) {
        skipped++;
        continue;
      }
      await dm.addItem(target.path, target.basename);
      existing.add(target.path);
      added++;
    }
    notice(
      added > 0 ? `已加入 ${added} 篇${skipped > 0 ? `，${skipped} 篇已在计划中跳过` : ''}` : `共 ${skipped} 篇，均已在复习计划中`,
      added > 0 ? 'success' : 'info'
    );
  },

/** 文件树变更即染色：Obsidian 文件树懒渲染（折叠时节点不存在），且无展开事件可监听——
   *  MutationObserver 观察文件树容器，节点出现/变化（如展开文件夹）节流触发染色，
   *  根治「60s 轮询恰好错过渲染时机就不染色」的场景。
   *  移动端（抽屉式文件树）容器选择器与桌面同源，另加入 .workspace-leaf[data-type=file-explorer]
   *  作为移动端抽屉结构候选。 */
  async startFileTreeWatch(app: App): Promise<void> {
    const container =
      (document.querySelector('.workspace-leaf-content[data-type="file-explorer"] .nav-files-container') as HTMLElement | null) ||
      (document.querySelector('.nav-files-container') as HTMLElement | null) ||
      (document.querySelector('.workspace-leaf-content[data-type="file-explorer"]') as HTMLElement | null) ||
      (document.querySelector('.workspace-leaf[data-type="file-explorer"]') as HTMLElement | null);
    // 找不到文件树容器（如 jsdom 测试环境）则不启动观察，避免对 document.body 全量 DOM 变动误触发
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void this.applyReviewStyles(app);
      }, 300);
    }).observe(container, { childList: true, subtree: true });
  },

  /** 文件树染色 + 阶段徽标（源码 L719-772 逐字；ticket 100 加「文件树标记」开关；
   *   ticket 48 收敛：不再全库 getMarkdownFiles + 逐路径 querySelector——
   *   处理范围 = 复习条目路径 + 曾染色路径（移出计划后回退），树节点一次 querySelectorAll 建 Map 查找；
   *   可选 items 参数：checkOverdueAndNotify 传本轮已加载结果，避免每轮二次读盘。
   *   2026-08 稳健化（本地分支）：遍历 `[data-path]` 精确比对取值，目标文本层多备选退避
   *   （tree-item-inner → nav-file-title-content → 容器本身），最大化命中已渲染的文件树节点。
   *   自愈重试：全量轮计划里该染的文档一个都没染上（文件树未渲染 / 折叠 / 移动端抽屉未开）时，
   *   每 2s 自动重试（最多 8 次 ≈16s；之后交 60s 轮询与 startFileTreeWatch 负责）。 */
  async applyReviewStyles(app: App, changedFile?: TFile, items?: ReviewItem[]): Promise<void> {
    if ((getSettings() as any).reviewTreeBadge === false) return; // ticket 100：关=清爽文件树（不染色不挂徽章）
    this.ensure(app);
    const allItems = items || (await this.dataManager!.loadItems());
    const itemByPath = new Map<string, ReviewItem>();
    for (const item of allItems) {
      if (item.filePath) itemByPath.set(item.filePath, item);
    }

    // 处理路径集：单文件事件只处理该文件；全量轮 = 复习条目 + 曾染色路径（回退清洗用）
    const paths = new Set<string>();
    if (changedFile) {
      paths.add(changedFile.path);
    } else {
      for (const p of itemByPath.keys()) paths.add(p);
      for (const p of this._styledPaths) paths.add(p);
    }

    // 树节点一次收集（data-path → 元素，首个匹配语义与原 querySelector 一致）
    const els = new Map<string, HTMLElement>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('div[data-path]'))) {
      const p = el.getAttribute('data-path');
      if (p && !els.has(p)) els.set(p, el);
    }
    const fsrs = new FSRS(this.currentW()); // 上游线 P1：拟合权重优先（无产物=DEFAULT_W，行为等同）
    const planPaths = new Set(allItems.map((i) => i.filePath));
    let stainedCount = 0;

for (const path of paths) {
      const el = els.get(path);
      if (!el) {
        // 树节点不存在（文件删除/目录收起）：从曾染色集合剔除，防集合无限增长
        this._styledPaths.delete(path);
        continue;
      }
      // 目标文本层多备选退避（本地分支稳健化）：.tree-item-inner（Obsidian 文件树旧结构）
      // → .nav-file-title-content（部分主题/旧版）→ 容器本身；取能挂内联色+徽标的最内层可染文本
      const target =
        (el.querySelector('div.tree-item-inner') as HTMLElement | null) ||
        (el.querySelector('.nav-file-title-content') as HTMLElement | null) ||
        el;
      const badge = target.querySelector('.review-stage-badge');
      if (badge) badge.remove();

      const item = itemByPath.get(path);
      if (!item) {
        // 仅回退「本插件曾染色」的路径（从未染色的非条目节点不触碰，缩范围语义）
        if (this._styledPaths.has(path)) {
          target.style.color = '';
          this._styledPaths.delete(path);
        }
        continue;
      }
      stainedCount++;
      const currentStage = item.stage || 0;
      const now = new Date();
      const nextReview = item.nextReviewDate ? new Date(item.nextReviewDate) : null;
      let color = 'currentColor';
      let status = '';
      if (item.completed) {
        color = '#52c41a';
        status = 'complete';
      } else if (nextReview && now > nextReview) {
        color = '#ff4757';
        status = 'overdue';
      } else if (item.phase === 'fsrs' && item.stability && item.lastReviewed) {
        const t = (now.getTime() - new Date(item.lastReviewed).getTime()) / 86400000;
        const r = fsrs.R(t, item.stability);
        if (r >= 0.9) color = '#52c41a';
        else if (r >= 0.7) color = '#faad14';
        else color = '#ff9f43';
      } else if (currentStage <= 2) {
        color = '#1890ff';
      } else if (currentStage <= 6) {
        color = '#faad14';
      } else {
        color = '#52c41a';
      }
      target.style.color = color;

      let timeText = '';
      if (status === 'complete') timeText = '✅';
      else if (nextReview) {
        const diff = nextReview.getTime() - now.getTime();
        if (diff > 0) {
          const d = Math.floor(diff / (1000 * 60 * 60 * 24));
          const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          if (d > 0) timeText = `${d}d`;
          else if (h > 0) timeText = `${h}h`;
          else timeText = `${m}m`;
        } else timeText = '📅';
      }
      if (timeText) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'review-stage-badge';
        badgeEl.textContent = timeText;
        badgeEl.style.cssText = `font-size:0.7em;opacity:0.8;margin-left:6px;color:${color};background:color-mix(in srgb, ${color} 10%, transparent);padding:1px 4px;border-radius:3px;border:1px solid color-mix(in srgb, ${color} 30%, transparent);font-weight:500;`;
        target.appendChild(badgeEl);
      }
      this._styledPaths.add(path);
    }

    // 自愈重试：全量扫描且计划里有该染的文档，但本次一个都没染上（文件树未渲染 / 折叠 / 移动端抽屉未开）
    if (!changedFile && paths.size > 0) {
      const planInPaths = [...paths].filter((p) => planPaths.has(p)).length;
      if (planInPaths > 0 && stainedCount === 0) {
        this._stainRetries = (this._stainRetries || 0) + 1;
        if ((this._stainRetries || 0) <= 8) {
          setTimeout(() => {
            this._stainRetries = (this._stainRetries || 0) - 1;
            void this.applyReviewStyles(app);
          }, 2000);
        }
      } else {
        this._stainRetries = 0;
      }
    }
  },

  /**
   * 到期提醒 + 染色刷新（ticket 100：原只刷染色，重写为 diff + 通知；染色职责保留）
   * 每轮与已通知集合对比：新增逾期 → 弹篇数常驻通知（duration 0，逾期清零主动收起；不列题目）；
   * 移出逾期（评级/完成/挂起）从集合剔除 → 之后再次逾期重新提醒。
   * 启动首查把存量逾期当新产生 → 汇总篇数（Q1 拍板接受）。
   * ticket 48 收敛：与本轮 loadItems 共用结果，不再二次读盘；
   * ticket 58：通知挂「去复习」action → 打开最早逾期笔记；
   * ticket 153/168：「去复习」升级为走复习应用统一流程；ticket 168 起 = 全 vault 逾期按数量会话。
   */
  async checkOverdueAndNotify(): Promise<void> {
    try {
      this.ensure(getApp());
      const dm = this.dataManager!;
      const items = await dm.loadItems();
      // 诊断锚点（ADR-0116）：每轮报三个数——条目/挂起/逾期，与金丝雀、挪动兜底日志对时序
      console.log(`[bz][review] 逾期检查: 条目 ${items.length}，挂起 ${items.filter((i) => i.isMissing).length}，逾期 ${items.filter((i) => i.isOverdue && !i.completed && !i.isMissing).length}`);
      if ((getSettings() as any).enableAutoNotify !== false) {
        const overdueMap = new Map<string, ReviewItem>(
          items.filter((i) => i.isOverdue && !i.completed && !i.isMissing).map((i) => [i.filePath, i])
        );
        const newly = [...overdueMap.entries()].filter(([p]) => !this._notifiedOverdue.has(p));
        // 清掉已不再逾期的（评级/完成/挂起后）
        for (const p of this._notifiedOverdue) {
          if (!overdueMap.has(p)) this._notifiedOverdue.delete(p);
        }
        // 数字自纠（ADR-0116 追加）：当前逾期数与上次展示不同也重发——首查在索引未就绪时可能拿到
        // 偏小快照，仅靠 newly diff 触发会让常驻通知把旧数字钉死在屏上（2026-09-11「1 篇」事故）
        const countChanged = overdueMap.size !== this._lastOverdueCount;
        if (newly.length || (countChanged && overdueMap.size > 0)) {
          this._lastOverdueCount = overdueMap.size;
          for (const [p] of newly) this._notifiedOverdue.add(p);
          // 通知只报当前逾期篇数，不列具体题目（用户拍板 2026-08-29）；duration 0 = 常驻（通知系统语义）
          // ticket 153/168：「去复习」不再只打开单篇（旧 ticket 58/修 #1 语义），
          // ticket 168 起走「全 vault 逾期按数量会话」（startOverdueCountSession，见该节），
          // 通知名单仍只报 newly（diff 记忆语义保留，见上方过滤）。
          const handle = notify(`有 ${overdueMap.size} 篇笔记逾期`, {
            type: 'info',
            duration: 0, // 常驻不自动消失，靠点击「去复习」/本体收起
            dedupeKey: 'review-overdue-notice',
            action: {
              label: '去复习', // action 文案不带 emoji（通知规范）
              onClick: () => {
                // ticket 168：走统一按数量复习会话（全 vault 逾期、每日上限截断），不再裸开最早逾期笔记
                void reviewApp.startOverdueCountSession();
              },
            },
          });
          // 同键合并返回空操作句柄：仅当旧句柄已失联（被消费）时才换存新句柄，保证清零收起有效
          const cur = this._overdueNotice;
          if (!cur || !cur.el.isConnected) this._overdueNotice = handle;
        } else if (!overdueMap.size) {
          // 逾期清零：常驻通知失去时效，主动收起（句柄已被点击消费时 hide 幂等无害）
          this._overdueNotice?.hide();
          this._overdueNotice = null;
        }
      }
      // 染色刷新保留（原 60s 轮询职责：逾期文件实时变红；是否染色由 reviewTreeBadge 决定）。
      // ADR-0116 追加：置于通知之后 + 独立容错——染色环节任何异常不得阻断逾期通知。
      try {
        await this.applyReviewStyles(getApp(), undefined, items);
      } catch (e) {
        console.error('复习计划染色刷新出错:', e);
      }
    } catch (e) {
      console.error('复习计划检查出错:', e);
    }
  },
};
