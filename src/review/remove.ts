/**
 * 复习条目移出用例（票 320/321 共用编排）：⚙️ 设置组单条「移出」与命令/文档内右键
 * 「将当前文档移出复习计划」同走此路径，保证单一语义。
 * removeItem → 监听目录内未排除路径写排除名单（CONTEXT.md「排除笔记」，与批量/删除联动同口径；
 * 记录本次新增，撤销只解除这些）→ 文件树染色回退 → notifyUndo 撤销（restoreItem 原样插回 +
 * 解除本次新增排除 + onDone）。效率整改 5：接撤销兜底，不再二次确认。
 */
import type { App } from 'obsidian';
import { notifyUndo, notifySaveError } from '../core/notice';
import type { ReviewDataManager, ReviewItem } from './data';

export async function removeItemWithUndo(
  app: App,
  dataManager: ReviewDataManager,
  item: ReviewItem,
  onDone?: () => void
): Promise<void> {
  try {
    await dataManager.removeItem(item.filePath);
    const { ReviewWatcher } = await import('./watch');
    const watcher = new ReviewWatcher(app, dataManager);
    const newlyExcluded =
      watcher.isWatched(item.filePath) && !watcher.isExcluded(item.filePath) ? [item.filePath] : [];
    if (newlyExcluded.length) await watcher.excludePaths(newlyExcluded);
    const { reviewApp } = await import('./app');
    await reviewApp.applyReviewStyles(app);
    onDone?.();
    // ticket 141 通病 1：原条目（含阶段/排期/历史）原样插回，进度不丢
    notifyUndo(`已移出「${item.name}」`, () => {
      void (async () => {
        try {
          await dataManager.restoreItem(item);
          for (const p of newlyExcluded) await watcher.removeExcludedNote(p);
          await reviewApp.applyReviewStyles(app);
          onDone?.();
        } catch (e) {
          notifySaveError(e, '移出复习条目');
        }
      })();
    });
  } catch (e) {
    notifySaveError(e, '移出复习条目');
  }
}
