/**
 * 复习计划监听器（ticket 098；ticket 099 修订）：
 *  - 监听文件夹自动加入（新建自动加入 + 排除名单）
 *  - 删除计划内文件 → 确认「是否同步移除复习记录？」
 *  - 重命名/移动计划内文件 → 自动更新路径（不再确认，ticket 099）
 *  - 监听文件夹添加：选择弹窗后立即确认存量收编（取消=什么都不做，不再写排除名单，ticket 099）
 *  - 挪动兜底（ADR-0115）：rename 事件丢失（Obsidian 关闭期间/外部工具挪动）→ 同名双向唯一自动接回
 *    （启动批量收敛 relinkMissingByBasename + created 实时接回 relinkOneByBasename）；歧义不动
 * 依赖方向：store 层（confirm 为 core，无其它域 DOM）；经 index.ts 事件接线；refresh 函数体延迟解析。
 */
import type { App, TFile } from 'obsidian';
import { notice } from '../core/notice';
import { openFlowDialog } from '../core/flow-dialog';
import { tryGetSettings, saveSettings } from '../core/settings-provider';
import { ReviewDataManager } from './data';

/** 目录边界判定：path 恰为 folder 或位于其下（递归语义） */
export function isUnderFolder(folder: string, path: string): boolean {
  const f = (folder || '').trim().replace(/\/+$/, '');
  if (!f) return false;
  return path === f || path.startsWith(f + '/');
}

/** ADR-0115：路径末段文件名（去 .md 后缀），与 TFile.basename 同口径，供同名比对 */
export function baseNameOf(path: string): string {
  return (path.split('/').pop() || '').replace(/\.md$/, '');
}

/** ticket 100：自动加入提醒合并窗口（3 秒；测试可注入短值） */
export let REVIEW_AUTO_ADD_MERGE_MS = 3000;
export function __setAutoAddMergeMsForTests(ms: number): void {
  REVIEW_AUTO_ADD_MERGE_MS = ms;
}

/** ticket n2：改名通知合并窗口（3 秒；批量重命名只弹一条；测试可注入短值） */
export let RENAME_MERGE_MS = 3000;
export function __setRenameMergeMsForTests(ms: number): void {
  RENAME_MERGE_MS = ms;
}

export class ReviewWatcher {
  app: App;
  dataManager: ReviewDataManager;

  /** 删除确认防抖缓冲（多文件删除合并为一次确认） */
  private deleteQueue: string[] = [];
  private deleteTimer: ReturnType<typeof setTimeout> | null = null;
  /** ticket 100：新笔记自动加入提醒合并缓冲（3 秒窗口收集，多条合并一条通知） */
  private autoAddQueue: string[] = [];
  private autoAddTimer: ReturnType<typeof setTimeout> | null = null;
  /** ticket n2：改名通知合并缓冲（3 秒窗口收集；列表/文件树更新仍即时） */
  private renameQueue: string[] = [];
  private renameTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, dataManager: ReviewDataManager) {
    this.app = app;
    this.dataManager = dataManager;
  }

  get watchedFolders(): string[] {
    const s = tryGetSettings() as any;
    return Array.isArray(s?.reviewWatchedFolders)
      ? (s.reviewWatchedFolders as any[]).filter((x) => typeof x === 'string' && x.trim().length > 0)
      : [];
  }

  get excludedNotes(): string[] {
    const s = tryGetSettings() as any;
    return Array.isArray(s?.reviewExcludedNotes) ? (s.reviewExcludedNotes as string[]) : [];
  }

  isWatched(path: string): boolean {
    return this.watchedFolders.some((f) => isUnderFolder(f, path));
  }

  isExcluded(path: string): boolean {
    return this.excludedNotes.includes(path);
  }

  /** 追加排除名单（去重 + 落盘；手动/确认四类表态共用） */
  async excludePaths(paths: string[]): Promise<void> {
    const s = tryGetSettings() as any;
    const cur = Array.isArray(s?.reviewExcludedNotes) ? [...(s.reviewExcludedNotes as string[])] : [];
    let changed = false;
    for (const p of paths) {
      if (p && !cur.includes(p)) {
        cur.push(p);
        changed = true;
      }
    }
    if (!changed) return;
    if (s) s.reviewExcludedNotes = cur;
    await saveSettings();
  }

  /** ticket 57：单条解除排除记录（数据 reviewExcludedNotes 既有；仅补 UI 管理入口） */
  async removeExcludedNote(path: string): Promise<void> {
    const s = tryGetSettings() as any;
    if (!s) return;
    const cur = Array.isArray(s.reviewExcludedNotes) ? [...(s.reviewExcludedNotes as string[])] : [];
    const kept = cur.filter((p) => p !== path);
    if (kept.length === cur.length) return;
    s.reviewExcludedNotes = kept;
    await saveSettings();
  }

  /** vault create：监听目录内新建 md → 自动加入（未排除、未在计划）；ticket 100：3 秒窗口合并提醒 + 开关。
   *  ADR-0115：先试同名挂起接回（外部挪动的文件会以 created 出现，不限监听目录）——接回成功即返回，不再走自动加入 */
  async onVaultCreate(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;
    if (await this.relinkOneByBasename(file)) return;
    if (!this.isWatched(file.path)) return;
    if (this.isExcluded(file.path)) return;
    const items = await this.dataManager.loadItems();
    if (items.some((i) => i.filePath === file.path)) return;
    await this.dataManager.addItem(file.path, file.basename);
    // 提醒开关（默认开）：3 秒窗口内多条合并成一条通知
    const s = tryGetSettings() as any;
    if (s && s.reviewAutoAddNotice === false) return;
    this.autoAddQueue.push(file.basename);
    if (this.autoAddTimer) return;
    this.autoAddTimer = setTimeout(() => {
      this.autoAddTimer = null;
      const batch = this.autoAddQueue;
      this.autoAddQueue = [];
      if (!batch.length) return;
      const shown = batch.slice(0, 3).join('、');
      const tail = batch.length > 3 ? ` 等 ${batch.length - 3} 篇` : '';
      notice(batch.length > 1 ? `已自动加入复习计划：${shown}${tail}` : `已自动加入复习计划：${shown}`, 'success');
    }, REVIEW_AUTO_ADD_MERGE_MS);
  }

  /** ADR-0115 挪动兜底（实时）：新建文件与同名挂起条目双向唯一 → 自动接回原排期（不限监听目录）。
   *  适用：Obsidian 关闭期间/外部工具挪动（rename 事件丢失，Obsidian 以 delete+created 补发）。
   *  正文是否变动无从校验，以「同名 × 挂起条目 × vault 全库」双向唯一为充分条件；歧义一律不动。 */
  private async relinkOneByBasename(file: TFile): Promise<boolean> {
    const base = file.basename;
    if (!base) return false;
    const items = await this.dataManager.loadItems();
    const matches = items.filter((i) => i.isMissing && baseNameOf(i.filePath) === base);
    if (matches.length !== 1) return false;
    if (items.some((i) => i.filePath === file.path)) return false;
    if (this.isExcluded(file.path)) return false;
    // vault 内同名唯一才接（另有同名文件 → 歧义不动）
    const others = this.app.vault.getMarkdownFiles().filter((f) => f.basename === base && f.path !== file.path);
    if (others.length > 0) return false;
    const ok = await this.dataManager.updateFilePath(matches[0].filePath, file.path, base);
    if (ok) {
      notice(`已重新关联被移动笔记的复习路径：${base}`, 'success');
      await this.refresh();
    }
    return ok;
  }

  /** ADR-0115 挪动兜底（启动收敛）：全部路径失效条目 × vault 同名文件 双向唯一 → 批量接回原排期。
   *  返回接回条数；0 条静默。覆盖 Obsidian 未运行期间发生的挪动（启动时不补发事件，只能主动收敛）。 */
  async relinkMissingByBasename(): Promise<number> {
    const items = await this.dataManager.loadItems();
    const missing = items.filter((i) => i.isMissing);
    if (!missing.length) return 0;
    // vault 同名索引
    const byBase = new Map<string, number>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      byBase.set(f.basename, (byBase.get(f.basename) || 0) + 1);
    }
    // 挂起条目同名计数（同名 > 1 → 目标歧义）
    const missingByBase = new Map<string, number>();
    for (const m of missing) {
      const base = baseNameOf(m.filePath);
      missingByBase.set(base, (missingByBase.get(base) || 0) + 1);
    }
    const planPaths = new Set(items.map((i) => i.filePath));
    let relinked = 0;
    for (const m of missing) {
      const base = baseNameOf(m.filePath);
      if (!base || (missingByBase.get(base) || 0) > 1) continue;
      if ((byBase.get(base) || 0) !== 1) continue; // vault 无同名 / 重名歧义
      const target = this.app.vault.getMarkdownFiles().find((f) => f.basename === base);
      if (!target || target.path === m.filePath || planPaths.has(target.path) || this.isExcluded(target.path)) continue;
      const ok = await this.dataManager.updateFilePath(m.filePath, target.path, base);
      if (ok) {
        planPaths.add(target.path);
        relinked++;
      }
    }
    if (missing.length > 0 || relinked > 0) {
      // 诊断锚点：无论接回与否，有挂起就留痕（控制台可查「跑没跑、跑了多少」）
      console.info(`[bz][review] 挪动兜底: 挂起 ${missing.length}，接回 ${relinked}`);
    }
    if (relinked > 0) {
      notice(`已重新关联 ${relinked} 篇被移动笔记的复习路径`, 'success');
      await this.refresh();
    }
    return relinked;
  }

  /** vault delete：计划内文件删除 → 防抖合并确认「同步移除复习记录？」 */
  onVaultDelete(file: TFile): void {
    void (async () => {
      const items = await this.dataManager.loadItems();
      if (!items.some((i) => i.filePath === file.path)) return;
      this.deleteQueue.push(file.path);
      if (this.deleteTimer) return;
      this.deleteTimer = setTimeout(async () => {
        this.deleteTimer = null;
        const batch = this.deleteQueue;
        this.deleteQueue = [];
        if (!batch.length) return;
        const n = batch.length;
        const firstName = (batch[0] || '').split('/').pop();
        void openFlowDialog({
          title: n > 1 ? `删除 ${n} 篇笔记` : '笔记已删除',
          message:
            n > 1
              ? `有 ${n} 篇笔记已从 vault 删除，是否同步移除复习计划里的记录？不移除则保留（文件恢复后继续复习，列表现删除线）。`
              : `「${firstName}」已从 vault 删除，是否同步移除复习计划里的记录？不移除则保留（文件恢复后继续复习，列表现删除线）。`,
          actions: [
            { label: '保留', value: 'cancel' },
            { label: '移除', value: 'ok', cta: true },
          ],
        }).then(async (v) => {
          if (v === 'ok') {
            for (const path of batch) await this.dataManager.removeItem(path);
            // 仅监听目录内的删除写排除名单（防自动加回；目录外的删除无监听风险）
            await this.excludePaths(batch.filter((p) => this.isWatched(p)));
            notice(`已移除 ${n} 条复习记录`, 'success');
            await this.refresh();
          } else {
            void this.refresh();
          }
        });
      }, 300);
    })();
  }

  /** vault rename：计划内文件改名/移动 → 自动更新路径（ticket 099：不再弹确认）；
   *   ticket n2：通知改合并窗口（窗口内多条合并一条；列表/文件树刷新仍即时） */
  onVaultRename(file: TFile, oldPath: string): void {
    void (async () => {
      if (file.extension !== 'md') return;
      if (oldPath === file.path) return;
      const items = await this.dataManager.loadItems();
      if (!items.some((i) => i.filePath === oldPath)) return;
      const updated = await this.dataManager.updateFilePath(oldPath, file.path, file.basename);
      if (!updated) return;
      await this.refresh(); // 列表自动更新（即时）
      this.renameQueue.push(file.basename);
      if (this.renameTimer) return;
      this.renameTimer = setTimeout(() => {
        this.renameTimer = null;
        const batch = this.renameQueue;
        this.renameQueue = [];
        if (!batch.length) return;
        const shown = batch.slice(0, 3).join('、');
        const tail = batch.length > 3 ? `，等 ${batch.length - 3} 篇` : '';
        notice(
          batch.length > 1 ? `已更新 ${batch.length} 篇笔记的复习路径：${shown}${tail}` : '已更新复习计划路径',
          'success'
        );
      }, RENAME_MERGE_MS);
    })();
  }

  /** 未加入候选：目录内全部 md − 已加入 − 已排除（递归；挂起记录占位路径天然排除） */
  collectAutoaddCandidates(folder: string, items: Array<{ filePath: string }>): string[] {
    return this.app.vault
      .getMarkdownFiles()
      .map((f) => f.path)
      .filter((p) => isUnderFolder(folder, p))
      .filter((p) => !items.some((i) => i.filePath === p))
      .filter((p) => !this.isExcluded(p));
  }

  /** 选择监听文件夹后的存量收编确认（ticket 099）：确认 → 批量全部加入并返回 true；取消 → 什么都不做返回 false（不写排除名单） */
  async confirmBatchAddForFolder(folder: string): Promise<boolean> {
    const items = await this.dataManager.loadItems();
    const candidates = this.collectAutoaddCandidates(folder, items);
    if (!candidates.length) return true; // 无存量候选：直接接受
    const v = await openFlowDialog({
      title: '批量加入复习计划',
      message: `监听文件夹「${folder}」下有 ${candidates.length} 篇笔记未加入复习计划，是否一并加入？`,
      actions: [
        { label: '取消', value: 'cancel' },
        { label: '加入', value: 'ok', cta: true },
      ],
    });
    if (v !== 'ok') return false;
    let ok = 0;
    for (const p of candidates) {
      try {
        await this.dataManager.addItem(p, p.split('/').pop()!.replace(/\.md$/, ''));
        ok++;
      } catch {
        /* 并发已加入 → 跳过 */
      }
    }
    notice(`已加入 ${ok} 篇笔记到复习计划`, 'success');
    await this.refresh();
    return true;
  }

  /** 移除监听文件夹（ticket 099 追加）：同时清空该目录下全部排除记录——否则二次添加时存量被旧黑名单挡住。
   *  返回清理的排除条数（仅用于提示文案）。 */
  async removeWatchedFolder(folder: string): Promise<number> {
    const s = tryGetSettings() as any;
    if (!s) return 0;
    const folders = Array.isArray(s.reviewWatchedFolders) ? [...(s.reviewWatchedFolders as string[])] : [];
    const idx = folders.indexOf(folder);
    if (idx !== -1) folders.splice(idx, 1);
    s.reviewWatchedFolders = folders;
    const before = Array.isArray(s.reviewExcludedNotes) ? [...(s.reviewExcludedNotes as string[])] : [];
    const kept = before.filter((p) => !isUnderFolder(folder, p));
    s.reviewExcludedNotes = kept;
    await saveSettings();
    return before.length - kept.length;
  }

  private async refresh(): Promise<void> {
    // ticket 168（切片 02）：复习面板已删除，刷新仅剩文件树染色（原 refreshPanel 职责随面板退役）
    const { reviewApp } = await import('./app');
    await reviewApp.applyReviewStyles(this.app);
  }

  /** 卸载清理（定时器/缓冲） */
  destroy(): void {
    if (this.deleteTimer) {
      clearTimeout(this.deleteTimer);
      this.deleteTimer = null;
    }
    this.deleteQueue = [];
    if (this.autoAddTimer) {
      clearTimeout(this.autoAddTimer);
      this.autoAddTimer = null;
    }
    this.autoAddQueue = [];
    if (this.renameTimer) {
      clearTimeout(this.renameTimer);
      this.renameTimer = null;
    }
    this.renameQueue = [];
  }
}
