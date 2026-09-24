/**
 * 复习计划数据层（ticket 16 修正版：对齐源码 DataManager，日期字段 ISO 字符串）
 * review.json：CONFIG/STORAGE/review.json，jsonStore 读写。
 */
import type { App, TFile } from 'obsidian';
import { enqueueFileTask, jsonFileStore, storageFile } from '../core/storage';
import { tryGetSettings } from '../core/settings-provider';
import { FSRS_FIRST_INTERVALS, LADDER_MAX, TOTAL_STAGES } from './fsrs';

export const REVIEW_FILE_PATH = 'CONFIG/STORAGE/review.json';

/** 复习数据文件路径（ADR-0009：storagePath 优先，旧 reviewStoragePath 兼容兜底；trim 收敛至 storageFile） */
export function getReviewFilePath(): string {
  const s = tryGetSettings() as any;
  return storageFile('review.json', (s && (s.storagePath || s.reviewStoragePath)) || 'CONFIG/STORAGE');
}

/** 运行时字段（loadItems 现算 / TFile 引用）：saveItems 落盘前剥离，永不清写入 review.json */
const RUNTIME_FIELDS = ['file', 'isMissing', 'isCompleted', 'isOverdue', 'currentStage', 'totalStages'] as const;

export interface ReviewItem {
  id: string;
  filePath: string;
  name: string;
  reviewStart: string; // ISO
  stage: number;
  phase: 'ladder' | 'fsrs';
  stability: number;
  difficulty: number;
  reviewHistory: any[];
  totalReviews: number;
  averageConfidence: number;
  nextReviewDate: string | null; // ISO
  lastReviewed: string | null; // ISO
  lastDifficulty: string | null;
  completed: boolean;
  /** 待重做（做题会话首次评级 ∈ {忘了,困难} 置位；重做通过只清标记不写 FSRS——ADR-0044） */
  pendingRedo?: boolean;
  /** 运行时：文件在 vault 中不存在（挂起记录，列表删除线展示） */
  isMissing?: boolean;
  // 兼容旧字段（读取时映射）
  reviewStage?: number;
  // 运行时
  file?: TFile;
  isCompleted?: boolean;
  isOverdue?: boolean;
  currentStage?: number;
  totalStages?: number;
}

export class ReviewDataManager {
  app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** 加载条目（向后兼容旧字段；日期兼容 ISO 字符串与数字）。
   *  走模块级 getApp（reviewApp 为单例 dataManager，app 参数注入会绑定旧 app 导致跨测试/重开写错 vault） */
  async loadItems(): Promise<ReviewItem[]> {
    const data = (await jsonFileStore<any[]>(getReviewFilePath()).read()) as any;
    const items = Array.isArray(data) ? data : [];
    const valid: ReviewItem[] = [];

    for (const item of items) {
      const file = this.app.vault.getAbstractFileByPath(item.filePath);
      if (!file) {
        // 挂起记录（ticket 098）：文件不存在 → 保留条目（挂起，列表删除线展示、不计逾期、不进复习队列）
        item.file = null as any;
        item.isMissing = true;
        item.name = item.name || item.filePath.split('/').pop()?.replace(/\.md$/, '') || item.filePath;
        item.isCompleted = item.completed || false;
        item.isOverdue = false;
        item.currentStage = (item.stage ?? (item.reviewStage || 1) - 1) + 1;
        item.totalStages = TOTAL_STAGES;
        valid.push(item);
        continue;
      }
      item.file = file as TFile;
      item.name = (file as TFile).basename;
      // 向后兼容：旧数据用 reviewStage，新数据用 stage
      if (item.stage === undefined) item.stage = (item.reviewStage || 1) - 1;
      if (item.stability === undefined) item.stability = 1;
      if (item.difficulty === undefined) item.difficulty = 0.3;
      if (item.phase === undefined) item.phase = item.stage >= LADDER_MAX ? 'fsrs' : 'ladder';
      const now = new Date();
      const isCompleted = item.completed || false;
      const nextReview = item.nextReviewDate ? new Date(item.nextReviewDate) : null;
      const isOverdue = !!nextReview && now > nextReview && !isCompleted;
      item.isCompleted = isCompleted;
      item.isOverdue = isOverdue;
      item.currentStage = item.stage + 1;
      item.totalStages = TOTAL_STAGES;
      valid.push(item);
    }
    return valid;
  }

  /** 保存（剥离运行时字段；走模块级 getApp——见 loadItems 注释）。
   *  P1-33：loadItems 现算的运行时字段（isMissing/isCompleted/isOverdue/currentStage/totalStages/file）
   *  一律不落盘——旧实现全量写回导致 review.json 无限膨胀（~5MB），且多端旧基线回写时把陈旧
   *  运行时态放大成持久数据。白名单外字段保留（reviewStage 等旧字段兼容不动）。 */
  async saveItems(items: ReviewItem[]): Promise<void> {
    const data = items.map((it) => {
      const clone: Record<string, unknown> = { ...it };
      for (const k of RUNTIME_FIELDS) delete clone[k];
      return clone;
    });
    await jsonFileStore<any[]>(getReviewFilePath()).write(data as any[]);
  }

  /** 新增条目（P1-33：读→改→写整体入 per-path 串行队列，防并发互覆） */
  async addItem(filePath: string, fileName: string): Promise<ReviewItem> {
    return enqueueFileTask(getReviewFilePath(), async () => {
      const items = await this.loadItems();
      if (items.some((i) => i.filePath === filePath)) throw new Error('该笔记已在复习计划中');
      const now = new Date();
      const newItem: ReviewItem = {
        id: `review_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
        filePath,
        name: fileName,
        reviewStart: now.toISOString(),
        stage: 0,
        phase: 'ladder',
        stability: 1,
        difficulty: 0.3,
        reviewHistory: [],
        totalReviews: 0,
        averageConfidence: 0,
        nextReviewDate: new Date(now.getTime() + FSRS_FIRST_INTERVALS[0] * 86400000).toISOString(),
        lastReviewed: null,
        lastDifficulty: null,
        completed: false,
      };
      items.push(newItem);
      await this.saveItems(items);
      return newItem;
    });
  }

  /** 更新条目（按 filePath 定位 + 就地修改 + 落盘；P1-33：整体入串行队列） */
  async updateItem(filePath: string, updateFn: (item: ReviewItem) => void): Promise<void> {
    await enqueueFileTask(getReviewFilePath(), async () => {
      const items = await this.loadItems();
      const idx = items.findIndex((i) => i.filePath === filePath);
      if (idx === -1) throw new Error('条目不存在');
      updateFn(items[idx]);
      await this.saveItems(items);
    });
  }

  /** 移除条目（P1-33：整体入串行队列） */
  async removeItem(filePath: string): Promise<void> {
    await enqueueFileTask(getReviewFilePath(), async () => {
      const items = await this.loadItems();
      const next = items.filter((i) => i.filePath !== filePath);
      await this.saveItems(next);
    });
  }

  /** 撤销移出（ticket 141 通病 1）：原条目（含阶段/排期/历史）原样插回，不走 addItem 重置进度（P1-33：整体入串行队列） */
  async restoreItem(item: ReviewItem): Promise<void> {
    await enqueueFileTask(getReviewFilePath(), async () => {
      const items = await this.loadItems();
      if (items.some((i) => i.filePath === item.filePath)) return;
      const { file: _file, isMissing: _m, isCompleted: _c, isOverdue: _o, currentStage: _cs, totalStages: _ts, ...rest } = item; // 运行时字段不落盘（saveItems 同口径）
      items.push(rest as ReviewItem);
      await this.saveItems(items);
    });
  }

  getOverdueCount(items: ReviewItem[]): number {
    return items.filter((i) => i.isOverdue && !i.isCompleted).length;
  }

  /** 文件重命名时更新路径（P1-33：整体入串行队列——挪动兜底与复习评级并发时不再互相覆盖） */
  async updateFilePath(oldPath: string, newPath: string, newName: string): Promise<boolean> {
    return enqueueFileTask(getReviewFilePath(), async () => {
      const items = await this.loadItems();
      const item = items.find((i) => i.filePath === oldPath);
      if (!item) return false;
      if (items.some((i) => i.filePath === newPath && i.filePath !== oldPath)) return false;
      item.filePath = newPath;
      item.name = newName;
      await this.saveItems(items);
      return true;
    });
  }
}

// ===== 拟合参数落盘（上游线 P1 移植，ADR-0077：独立存储 review-fit.json，不覆盖 DEFAULT_W、不破坏 review.json 数组结构） =====

export interface FittedParams {
  /** 拟合出的 19 权重（首版只填前 8 个，其余为 DEFAULT_W） */
  w: number[];
  /** 拟合时间戳 ISO */
  fitAt: string;
  /** 参与拟合的样本数 */
  fitCount: number;
  /** 全参(true)还是子集(false)拟合 */
  full: boolean;
}

export function getReviewFitFilePath(): string {
  const s = tryGetSettings() as any;
  return storageFile('review-fit.json', (s && s.storagePath) || 'CONFIG/STORAGE');
}

export async function loadFittedParams(app: App): Promise<FittedParams | null> {
  const data = (await jsonFileStore<any>(getReviewFitFilePath()).read()) as any;
  if (!data || !Array.isArray(data.w) || data.w.length < 8) return null;
  return data as FittedParams;
}

export async function saveFittedParams(app: App, fit: FittedParams): Promise<void> {
  // D3 原语 1 收编：review-fit.json 拟合写同样入 per-path 串行队列（防多端/多入口并发拟合写互踩）
  await enqueueFileTask(getReviewFitFilePath(), () => jsonFileStore<FittedParams>(getReviewFitFilePath()).write(fit));
}
