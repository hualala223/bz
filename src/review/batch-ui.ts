/**
 * 批量移出复习计划弹窗（票 320）：attach 域 openMovePreview 可勾选清单范式
 * （uiModal + uiDialogActions，复选框默认全不选 + 表头全选联动 + 底部按钮实时计数、0 禁用）。
 * 执行 = removeItems 一次落盘 + 监听目录内未排除路径写排除名单（CONTEXT.md「排除笔记」既有语义，
 * 与删除联动 watch.ts 同口径）+ 文件树染色回退 + notifyUndo 批量撤销（原序插回 + 仅解除本次新增排除）。
 * 按效率整改 5：逐条勾选本身即明确表态，不再二次确认；单次读改写（区别于 attach 逐文件 rename），
 * 无 progress 通知。挂起条目（文件缺失）同单条口径参与勾选与全选。
 */
import type { App } from 'obsidian';
import { notice, notifyUndo, notifySaveError } from '../core/notice';
import { uiModal, uiDialogActions } from '../core/ui';
import type { ReviewDataManager, ReviewItem } from './data';

/** 批量移出执行：一次落盘 → 监听目录写排除名单 → 染色回退 → 撤销兜底（原序插回 + 仅解除本次新增排除） */
async function executeBatchRemove(
  app: App,
  dataManager: ReviewDataManager,
  paths: string[],
  onDone?: () => void
): Promise<void> {
  try {
    // 以 removeItems 实际移除者为准（弹窗打开期间计划可能被会话/自动加入改动；返回值为计划序快照，供撤销）
    const removed = await dataManager.removeItems(paths);
    if (!removed.length) {
      notice('所选条目已不在复习计划中', 'info');
      onDone?.();
      return;
    }
    const { ReviewWatcher } = await import('./watch');
    const watcher = new ReviewWatcher(app, dataManager);
    // 仅监听目录内且尚未排除的路径落名单（防自动加回；记录本次新增，撤销只解除这些）
    const newlyExcluded = removed.map((i) => i.filePath).filter((p) => watcher.isWatched(p) && !watcher.isExcluded(p));
    if (newlyExcluded.length) await watcher.excludePaths(newlyExcluded);
    const { reviewApp } = await import('./app');
    await reviewApp.applyReviewStyles(app);
    onDone?.();
    // ticket 141 通病 1：原条目（含阶段/排期/历史）按计划序原样插回，进度不丢
    notifyUndo(`已移出 ${removed.length} 条复习记录`, () => {
      void (async () => {
        try {
          await dataManager.restoreItems(removed);
          for (const p of newlyExcluded) await watcher.removeExcludedNote(p);
          await reviewApp.applyReviewStyles(app);
          onDone?.();
        } catch (e) {
          notifySaveError(e, '撤销移出复习条目');
        }
      })();
    });
  } catch (e) {
    notifySaveError(e, '批量移出复习条目');
  }
}

/**
 * 批量移出弹窗：罗列计划内全部条目（含挂起），单选/全选后一次移出。
 * onDone：执行与撤销后回调（⚙️ 条目管理组传 renderList 重渲染；命令直达入口不传）。
 */
export async function openReviewBatchRemove(
  app: App,
  dataManager: ReviewDataManager,
  onDone?: () => void
): Promise<void> {
  const items = await dataManager.loadItems();
  if (!items.length) {
    notice('复习计划暂无条目', 'info');
    return;
  }

  const body = document.createElement('div');
  body.className = 'bz-review-batch';

  const missing = items.filter((i) => i.isMissing).length;
  const sum = document.createElement('div');
  sum.className = 'bz-review-batch-sum';
  sum.textContent = `计划内共 ${items.length} 条${missing ? `（含挂起 ${missing} 条）` : ''}；移出后可在通知里一键撤销。`;
  body.appendChild(sum);

  const head = document.createElement('label');
  head.className = 'bz-review-batch-head';
  const all = document.createElement('input');
  all.type = 'checkbox';
  all.className = 'bz-review-batch-all';
  const allLabel = document.createElement('span');
  allLabel.textContent = '全选';
  head.appendChild(all);
  head.appendChild(allLabel);
  body.appendChild(head);

  const list = document.createElement('div');
  list.className = 'bz-review-batch-list';
  const boxes: HTMLInputElement[] = [];
  for (const item of items) {
    const row = document.createElement('label');
    row.className = 'bz-review-batch-row' + (item.isMissing ? ' is-missing' : '');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'bz-review-batch-check';
    box.value = item.filePath;
    boxes.push(box);
    const name = document.createElement('span');
    name.className = 'bz-review-batch-name';
    name.textContent = item.isMissing ? `${item.name}（挂起）` : item.name;
    name.title = item.filePath;
    row.appendChild(box);
    row.appendChild(name);
    list.appendChild(row);
  }
  body.appendChild(list);

  const { close } = uiModal({
    content: body,
    maxWidth: 480,
    head: true,
    title: '批量移出复习计划',
    className: 'bz-review-batch-pop',
  });

  const actions = uiDialogActions({
    okText: '移出 0 条',
    okTone: 'danger',
    onOk: () => {
      const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
      if (!chosen.length) return;
      close();
      void executeBatchRemove(app, dataManager, chosen, onDone);
    },
    onCancel: () => close(),
  });
  actions.okBtn.id = 'bz-review-batch-ok';
  const syncOk = (): void => {
    const n = boxes.filter((b) => b.checked).length;
    actions.okBtn.disabled = n === 0;
    const label = actions.okBtn.querySelector('span') || actions.okBtn;
    label.textContent = `移出 ${n} 条`;
    all.checked = n === boxes.length;
    all.indeterminate = n > 0 && n < boxes.length;
  };
  for (const b of boxes) b.addEventListener('change', syncOk);
  all.addEventListener('change', () => {
    for (const b of boxes) b.checked = all.checked;
    syncOk();
  });
  syncOk();
  body.appendChild(actions.row);
}
