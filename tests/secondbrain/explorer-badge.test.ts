/**
 * 文件浏览器「已入脑」角标测试（票 305/ADR-0133）：
 * 装饰 pass 只标 meta.notes 已登记的文件行（nav-file-title），文件夹行不标；
 * 索引收敛回调（onIndexUpdated → 防抖 pass）驱动挂/摘；开关关闭清场；卸载清类并断开全部接线。
 * VectorStore 只用结构兼容假体（explorer-badge 仅消费 notes 与 onIndexUpdated），不触真库。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VEC_BADGE_CLASS,
  initExplorerBadge,
  unloadExplorerBadge,
  redrawExplorerBadge,
  __runBadgePassForTests,
} from '../../src/secondbrain/explorer-badge';
import { setSettingsProvider } from '../../src/core/settings-provider';

/** 结构兼容 VectorStore 的最小假体（explorer-badge 只消费 notes 与 onIndexUpdated） */
function makeStore(notePaths: string[]) {
  let cb: (() => void) | null = null;
  const notes: Record<string, unknown> = {};
  for (const p of notePaths) notes[p] = { mtime: 1, chunks: [{ text: 'x' }] };
  return {
    notes,
    onIndexUpdated: (fn: () => void) => {
      cb = fn;
      return () => {
        cb = null;
      };
    },
    fire: () => cb?.(),
    subscribed: () => cb !== null,
  };
}

/** 假工作区：layout-change 可注册/摘除；file-explorer 叶子返回注入的容器 */
function makeApp(container: HTMLElement | null) {
  const handlers = new Map<unknown, () => void>();
  return {
    workspace: {
      on: (name: string, cb: () => void) => {
        const ref = { name, id: handlers.size };
        handlers.set(ref, cb);
        return ref;
      },
      offref: (ref: unknown) => {
        handlers.delete(ref as never);
      },
      getLeavesOfType: (type: string) =>
        type === 'file-explorer' && container ? [{ view: { containerEl: container } }] : [],
    },
    handlerCount: () => handlers.size,
  };
}

function makeRow(path: string, kind: 'file' | 'folder'): HTMLElement {
  const self = document.createElement('div');
  self.className = kind === 'file' ? 'tree-item-self nav-file-title' : 'tree-item-self nav-folder-title';
  self.setAttribute('data-path', path);
  const inner = document.createElement('div');
  inner.className = 'tree-item-inner';
  inner.textContent = path;
  self.appendChild(inner);
  return self;
}

let root: HTMLElement;
let store: ReturnType<typeof makeStore>;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  root = document.createElement('div');
  root.appendChild(makeRow('我的/A.md', 'file'));
  root.appendChild(makeRow('我的/未入脑.md', 'file'));
  root.appendChild(makeRow('我的', 'folder'));
  document.body.appendChild(root);
  store = makeStore(['我的/A.md']);
  app = makeApp(root);
  setSettingsProvider(() => ({}) as never); // 缺省 = 开
});

afterEach(() => {
  unloadExplorerBadge();
  root.remove();
  vi.useRealTimers();
});

describe('文件浏览器「已入脑」角标（票 305）', () => {
  it('pass：已登记的文件行挂角标，未登记行与文件夹行不挂', () => {
    initExplorerBadge(app as never, store as never);
    __runBadgePassForTests();
    const rows = root.querySelectorAll('.tree-item-self');
    expect(rows[0].classList.contains(VEC_BADGE_CLASS)).toBe(true); // 我的/A.md 已登记
    expect(rows[1].classList.contains(VEC_BADGE_CLASS)).toBe(false); // 未登记
    expect(rows[2].classList.contains(VEC_BADGE_CLASS)).toBe(false); // 文件夹行永不标
  });

  it('索引收敛回调驱动重装饰：新登记经防抖 pass 挂上；移出索引即摘除', () => {
    vi.useFakeTimers();
    initExplorerBadge(app as never, store as never);
    __runBadgePassForTests();
    expect(store.subscribed()).toBe(true);

    store.notes['我的/未入脑.md'] = { mtime: 2, chunks: [{ text: 'x' }] };
    store.fire(); // onIndexUpdated → schedulePass（防抖 120ms）
    vi.advanceTimersByTime(120);
    expect(root.querySelectorAll('.tree-item-self')[1].classList.contains(VEC_BADGE_CLASS)).toBe(true);

    delete store.notes['我的/未入脑.md'];
    store.fire();
    vi.advanceTimersByTime(120);
    expect(root.querySelectorAll('.tree-item-self')[1].classList.contains(VEC_BADGE_CLASS)).toBe(false);
  });

  it('开关关闭：清场不挂类；重开即时恢复', () => {
    vi.useFakeTimers();
    initExplorerBadge(app as never, store as never);
    __runBadgePassForTests();
    expect(root.querySelectorAll('.tree-item-self')[0].classList.contains(VEC_BADGE_CLASS)).toBe(true);

    setSettingsProvider(() => ({ secondBrainExplorerBadge: false }) as never);
    redrawExplorerBadge();
    vi.advanceTimersByTime(120);
    expect(root.querySelectorAll('.' + VEC_BADGE_CLASS).length).toBe(0);

    setSettingsProvider(() => ({ secondBrainExplorerBadge: true }) as never);
    redrawExplorerBadge();
    vi.advanceTimersByTime(120);
    expect(root.querySelectorAll('.tree-item-self')[0].classList.contains(VEC_BADGE_CLASS)).toBe(true);
  });

  it('卸载：已挂类全清、订阅与 workspace 句柄断开、观察器不再复挂', () => {
    initExplorerBadge(app as never, store as never);
    __runBadgePassForTests();
    expect(root.querySelector('.' + VEC_BADGE_CLASS)).not.toBeNull();
    expect(store.subscribed()).toBe(true);
    expect(app.handlerCount()).toBe(1);

    unloadExplorerBadge();
    expect(root.querySelector('.' + VEC_BADGE_CLASS)).toBeNull();
    expect(store.subscribed()).toBe(false);
    expect(app.handlerCount()).toBe(0);
  });

  it('无 file-explorer 叶子（工作区未渲染文件 tab）：pass 静默不抛', () => {
    const bare = makeApp(null);
    initExplorerBadge(bare as never, store as never);
    expect(() => __runBadgePassForTests()).not.toThrow();
  });
});
