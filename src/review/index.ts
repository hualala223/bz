/**
 * 复习入口（ticket 168 单一入口重构；ticket 169 加回「加入复习计划」命令入口）：
 * 按数量复习命令 reviewCountStart、加入复习计划 reviewAddCurrent、
 * ensureReview 常驻监控（逾期轮询 + 监听文件夹）与 unloadReview 卸载清理。命令由 main.ts 裸注册。
 */
import type { App } from 'obsidian';
import { notice } from '../core/notice';
import { onDomainEvent } from '../core/domain-bus';
import { ReviewDataManager } from './data';
import { ReviewWatcher } from './watch';
import { UIManager } from './ui';
import { reviewApp } from './app';

let initialized = false;
export let dataManager: ReviewDataManager | null = null;
export let uiManager: UIManager | null = null;
export let reviewWatcher: ReviewWatcher | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;
/** P2：ensureReview 注册的全部退订函数（unload 统一调用，防卸载后监听残留双触发） */
let unsubscribers: (() => void)[] = [];

/** 原生事件注册即记账（把 offref 语义包装成退订函数：真实 Obsidian 与测试 mock 均按 ref 注销） */
function listen(source: any, event: string, cb: (...args: any[]) => void): void {
  const ref = source.on(event, cb);
  if (!ref) return;
  unsubscribers.push(() => source.offref?.(ref));
}

/** 总线订阅即记账（onDomainEvent 返回幂等退订函数，直接入账） */
function listenBus<E>(channel: string, cb: (evt: E) => void): void {
  unsubscribers.push(onDomainEvent(channel, cb));
}

/** 总线载荷 → watcher 方法签名所需的伪 TFile（仅路径派生字段，满足签名即可） */
function pseudoMdFile(path: string): any {
  const base = path.split('/').pop() || '';
  return { path, basename: base.replace(/\.md$/, ''), extension: 'md' };
}

/** 幂等初始化（对齐源码 entry：UI 构建 + 事件监听 + 索引就绪后首查 + 60s 周期） */
export function ensureReview(app: App): void {
  if (initialized) return;
  initialized = true;
  reviewApp.ensure(app);
  dataManager = new ReviewDataManager(app);
  uiManager = new UIManager(app, dataManager);
  reviewWatcher = new ReviewWatcher(app, dataManager);

  // 首查等索引就绪（ADR-0116 追加，金丝雀门）：网络盘上 resolved/固定延时都可能早于 vault 文件扫描
  // 完成——彼时复习条目文件「全员路径失效」，首查拿到偏小逾期快照、挪动兜底也接不回
  // （2026-09-11「挂起 23/接回 0」事故）。就绪判据（任一满足即执行）：
  //   ① 复习条目文件全部能被 vault 索引命中（最直接）；② 索引 md 数连续两次采样一致（扫描已结束，
  // 剩余失效是真实缺失）；③ 60s 硬兜底。等待期间被卸载（插件重载）则放弃启动。
  let checksStarted = false;
  const startPeriodicChecks = (): void => {
    if (checksStarted) return;
    checksStarted = true;
    void startChecksWhenIndexReady(app);
  };
  const startChecksWhenIndexReady = async (appRef: App): Promise<void> => {
    const t0 = Date.now();
    let prevCount = -1;
    while (Date.now() - t0 < 60000) {
      if (!initialized) return; // 等待期间被卸载：不再启动周期检查（防卸载后补挂 interval）
      let ready = true;
      let miss = 0;
      try {
        const items = await dataManager!.loadItems();
        miss = items.filter((i) => !appRef.vault.getAbstractFileByPath(i.filePath)).length;
        ready = miss === 0;
        if (!ready) console.log(`[bz][review] 金丝雀: 条目 ${items.length}，索引未命中 ${miss}，继续等扫描`);
      } catch {
        ready = false; // 计划读取失败不再放行（空读抛错=盘抖动）：视为未就绪继续等，60s 硬兜底保底
        console.log('[bz][review] 金丝雀: 计划读取失败，继续等重试');
      }
      if (ready) {
        console.log(`[bz][review] 金丝雀通过（${((Date.now() - t0) / 1000).toFixed(1)}s，未命中 0）`);
        break;
      }
      const count = appRef.vault.getMarkdownFiles().length;
      if (count > 0 && count === prevCount) break; // 扫描结束：剩余失效是真实缺失
      prevCount = count;
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(`[bz][review] 首查执行（索引就绪等待 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
    reviewApp.checkOverdueAndNotify();
    checkInterval = setInterval(() => reviewApp.checkOverdueAndNotify(), 60000);
    // ADR-0115 挪动兜底：启动收敛——上次会话中被挪动（rename 事件丢失）的挂起条目按同名唯一自动接回
    void reviewWatcher?.relinkMissingByBasename();
  };
  listen(app.metadataCache as any, 'resolved', startPeriodicChecks);
  setTimeout(startPeriodicChecks, 15000);

  // 文件树懒渲染：展开/折叠/节点出现即触发染色（根治 60s 轮询错过渲染时机就不染色）
  void reviewApp.startFileTreeWatch(app);

  // 事件监听（metadataCache resolved / vault modify / workspace quit 保持原生订阅；
  // created/deleted/renamed 已迁域事件总线，见下方总线接线）
  listen(app.metadataCache as any, 'resolved', async () => {
    await reviewApp.applyReviewStyles(app);
  });
  listen(app.vault as any, 'modify', async (file: any) => {
    if (file.extension === 'md') await reviewApp.applyReviewStyles(app, file);
  });
  // ticket 098：监听文件夹自动加入（created）+ 删除/改名/移动确认（deleted/renamed）——
  // 订域事件总线通用兜底通道（obsidian-adapter 恒发、仅 md，载荷见 src/core/obsidian-adapter.ts），
  // 目录过滤逻辑留在 ReviewWatcher 内部
  listenBus<{ path: string }>('vault:md-created', (evt) => {
    void reviewWatcher?.onVaultCreate(pseudoMdFile(evt.path));
  });
  listenBus<{ path: string }>('vault:md-deleted', (evt) => {
    reviewWatcher?.onVaultDelete(pseudoMdFile(evt.path));
  });
  listenBus<{ oldPath: string; newPath: string }>('vault:md-renamed', (evt) => {
    const file = pseudoMdFile(evt.newPath);
    file.oldPath = evt.oldPath;
    reviewWatcher?.onVaultRename(file, evt.oldPath);
  });
  listen(app.workspace as any, 'quit', () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  });
}

/** 复习（按数量）（review-count，ticket 02）：打开篇数弹窗 → 自动安排 → 逐篇做题 */
export function reviewCountStart(app: App): void {
  ensureReview(app);
  uiManager?.showCountReviewModal();
}

/** 加入复习计划（ticket 169）：默认取当前打开笔记；编辑器右键路径传入右键所在文件 */
export function reviewAddCurrent(app: App, file?: { path: string; basename: string; extension: string } | null): void {
  const target = file ?? app.workspace.getActiveFile();
  if (!target) {
    notice('没有打开的笔记', 'info');
    return;
  }
  void reviewApp.addCurrentToReview(target);
}

/** 批量加入复习计划（ticket 170）：当前文档及其一级出链一起加入；编辑器右键路径传入右键所在文件 */
export function reviewAddCurrentWithLinks(app: App, file?: { path: string; basename: string; extension: string } | null): void {
  const target = file ?? app.workspace.getActiveFile();
  if (!target) {
    notice('没有打开的笔记', 'info');
    return;
  }
  void reviewApp.addCurrentWithLinksToReview(target);
}

/** 卸载清理 */
export function unloadReview(): void {
  initialized = false;
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  // P2：全部退订函数统一调用（原生 offref + 总线退订），防卸载后旧监听残留（再 ensure 后事件双触发）
  for (const off of unsubscribers) {
    try {
      off();
    } catch (e) {
      /* 单个注销失败不阻断其余清理 */
    }
  }
  unsubscribers = [];
  uiManager?.destroy();
  uiManager = null;
  dataManager = null;
  reviewWatcher?.destroy();
  reviewWatcher = null;
}
/** 复习计划分析报告（上游线 P2 移植，bz-review-report）：独立命令，直接打开统计弹窗 */
export async function openReviewReport(app: App): Promise<void> {
  ensureReview(app);
  const { showStatsModal } = await import('./stats-ui');
  await showStatsModal(app, dataManager!);
}

/** 今日已复习（ticket 276，bz-review-today）：独立命令，弹窗罗列当天复习过的文档，点击新标签页打开原文（强制阅读模式） */
export async function openTodayReviewed(app: App): Promise<void> {
  ensureReview(app);
  const { showTodayReviewed } = await import('./today');
  await showTodayReviewed(app, dataManager!);
}
