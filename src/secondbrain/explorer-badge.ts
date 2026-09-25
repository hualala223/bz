/**
 * 文件浏览器「已入脑」角标（票 305/ADR-0133）
 *
 * 给向量库已登记（meta.notes 有键 = 已向量化入索引）的笔记在左侧文件列表挂一枚绿点，
 * 一眼区分「已入脑 / 未入脑」。标记**不写进笔记文件**，实时派生自索引真相——
 * 为什么不用 frontmatter（ADR-0133 拒绝项）：
 * - 插件写笔记触发 vault modify 监听链路（索引登记刷新 + link agent 哈希比对）空转；
 * - Syncthing 多设备场景插件写笔记 = 冲突文件高发（STORAGE 已有 sync-conflict 自愈先例）；
 * - 笔记移出白名单/从索引删除后，文件内标记残留成假信息，追删又是一轮全量写放大。
 *
 * 实现口径：
 * - 挂点 = Obsidian 文件浏览器原生行元素 `.tree-item-self.nav-file-title[data-path]`（票 305，
 *   Obsidian 事件适配器同款「全插件单点」思路——本模块是 secondbrain 域唯一的 explorer DOM 消费方）；
 *   文件夹行（.nav-folder-title）不标，「已入脑」是文件级语义；
 * - DOM 增量：MutationObserver(childList+subtree) 兜住懒展开/重排/新建行；索引变更：
 *   store.onIndexUpdated（load 与每轮 refresh 收敛点）重跑装饰；叶子重建：workspace
 *   'layout-change' 防抖重找 file-explorer 叶子重挂观察器；
 * - 装饰 = 幂等全量 pass：只扫当前 DOM 行集 classList.toggle，万级行也只毫秒级（Obsidian
 *   折叠目录的子行同样在 DOM 内，无需额外展开处理）；
 * - 开关 secondBrainExplorerBadge（缺省开）：关闭 = 一次「空集合 pass」清掉全部角标。
 */
import type { App } from 'obsidian';
import { tryGetSettings } from '../core/settings-provider';
import type { VectorStore } from './vector-store';

/** 角标类名（样式源头 src/secondbrain/styles.css，构建聚合进根 styles.css） */
export const VEC_BADGE_CLASS = 'bz-sb-vec';

/** 防抖窗口（ms）：MutationObserver 抖动与 layout-change 风暴合流为一轮 pass */
const PASS_DEBOUNCE_MS = 120;

let appRef: App | null = null;
let storeRef: VectorStore | null = null;
let unsubStore: (() => void) | null = null;
let layoutRef: unknown = null;
let observer: MutationObserver | null = null;
let attachedView: unknown = null;
let passTimer: ReturnType<typeof setTimeout> | null = null;
let attachTimer: ReturnType<typeof setTimeout> | null = null;

/** 开关读取：缺省开（未注入设置/旧 data.json 均视为开启） */
function badgeEnabled(): boolean {
  return (tryGetSettings() as Record<string, unknown>)?.secondBrainExplorerBadge !== false;
}

/** 当前文件浏览器视图容器（无 file-explorer 叶子 → null：工作区尚未渲染文件 tab） */
function explorerContainer(): HTMLElement | null {
  const workspace = (appRef as { workspace?: { getLeavesOfType?: (t: string) => Array<{ view?: { containerEl?: HTMLElement } }> } } | null)?.workspace;
  const leaf = workspace?.getLeavesOfType?.('file-explorer')?.[0];
  return leaf?.view?.containerEl ?? null;
}

/** 一轮装饰 pass（幂等）：设置关 → 空集合 pass 清场；开 → 按 meta.notes 键集挂/摘角标 */
function runPass(): void {
  const root = explorerContainer();
  if (!root) return;
  const indexed = badgeEnabled() ? new Set(Object.keys(storeRef?.notes ?? {})) : null;
  const rows = root.querySelectorAll('.tree-item-self.nav-file-title[data-path]');
  for (const row of rows) {
    const path = row.getAttribute('data-path') || '';
    row.classList.toggle(VEC_BADGE_CLASS, indexed !== null && indexed.has(path));
  }
}

/** pass 防抖合流（观察器/订阅/布局事件共用一条时间线） */
function schedulePass(): void {
  if (passTimer) clearTimeout(passTimer);
  passTimer = setTimeout(() => {
    passTimer = null;
    runPass();
  }, PASS_DEBOUNCE_MS);
}

/** 摘除 DOM 观察器（叶子实例比对：同一 leaf 不重挂，layout 抖动零成本） */
function detachObserver(): void {
  observer?.disconnect();
  observer = null;
  attachedView = null;
}

/** 找 file-explorer 叶子挂观察器 + 立即跑一轮装饰 */
function attachObserver(): void {
  const root = explorerContainer();
  if (!root) return;
  if (observer && attachedView === root) {
    schedulePass();
    return;
  }
  detachObserver();
  observer = new MutationObserver(schedulePass);
  observer.observe(root, { childList: true, subtree: true });
  attachedView = root;
  schedulePass();
}

/** attach 防抖（layout-change 高频触发，重挂有 disconnect 成本） */
function scheduleAttach(): void {
  if (attachTimer) clearTimeout(attachTimer);
  attachTimer = setTimeout(() => {
    attachTimer = null;
    attachObserver();
  }, PASS_DEBOUNCE_MS);
}

/**
 * 初始化（secondbrain 域入口 ensureSecondBrain 调用，幂等）：订阅索引收敛 + 布局重挂 +
 * 立即装饰一轮。设置关闭时同样常驻接线（关→开切换即时生效），只是 pass 清场不挂类。
 */
export function initExplorerBadge(app: App, store: VectorStore): void {
  if (storeRef) return;
  appRef = app;
  storeRef = store;
  unsubStore = store.onIndexUpdated(() => schedulePass());
  try {
    layoutRef = (app.workspace as unknown as { on: (n: string, cb: () => void) => unknown }).on(
      'layout-change',
      scheduleAttach
    );
  } catch {
    layoutRef = null; // 无 workspace 环境（异常宿主）静默：仅失去叶子重建后的自动重挂
  }
  attachObserver();
}

/** 设置开关回调（⚙️ 域设置弹窗 onChange）：不开订阅不走 store 通知，就地重跑一轮 */
export function redrawExplorerBadge(): void {
  schedulePass();
}

/** 卸载清理（unloadSecondBrain 调用）：摘订阅/观察器/定时器 + 清已挂角标类 */
export function unloadExplorerBadge(): void {
  unsubStore?.();
  unsubStore = null;
  if (layoutRef) {
    try {
      (appRef?.workspace as unknown as { offref: (r: unknown) => void } | null)?.offref(layoutRef);
    } catch {
      /* 引用可能已随宿主清理，忽略 */
    }
    layoutRef = null;
  }
  if (passTimer) {
    clearTimeout(passTimer);
    passTimer = null;
  }
  if (attachTimer) {
    clearTimeout(attachTimer);
    attachTimer = null;
  }
  detachObserver();
  document.querySelectorAll('.' + VEC_BADGE_CLASS).forEach((el) => el.classList.remove(VEC_BADGE_CLASS));
  storeRef = null;
  appRef = null;
}

// ---------------- 测试钩子（同 weekly-ui.__setWeeklyScheduleDelayMsForTests 先例） ----------------

/** 直跑一轮装饰 pass（测试跳过防抖） */
export function __runBadgePassForTests(): void {
  runPass();
}

/** 直跑观察器挂载（测试注入叶子容器后重挂） */
export function __attachBadgeObserverForTests(): void {
  attachObserver();
}
