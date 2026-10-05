/**
 * 票 319（上游吸收：home 缩放/滚位/焦点回置 + 二脑 canvas 入脑）：
 *  - home：closeOverlay 存滚位 → showOverlay 写回（display:none 复用丢滚位的反命题）；
 *    renderAll 全量重建不打回浏览位置；unloadHome 后句柄清空（重开面板可再挂，不误判「已挂」）。
 *  - secondbrain：canvas 入脑（上游 ADR-0141 §5）——白名单命中 canvas 文件进索引范围、
 *    canvasToText 抽节点文本走切块链路；ticket 116 本地红线（白名单空 = 什么也不录）不破。
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetObsidianMocks } from './mock-obsidian-entry';
import { setApp } from '../src/core/app';
import { setSettingsProvider } from '../src/core/settings-provider';
import { DEFAULT_SETTINGS } from '../src/settings';
import { MockVault } from './mock-vault';
import { H, resetHomeState } from '../src/home/state';
import { EMPTY_COUNTS, EMPTY_SUMMARY } from '../src/home/shared';
import type { RiverData } from '../src/home/river';
import { canvasToText } from '../src/secondbrain/chunk';

const collectRiverMock = vi.hoisted(() => vi.fn());
vi.mock('../src/home/river', () => ({
  collectRiver: (...args: unknown[]) => collectRiverMock(...args),
}));
const orderMock = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn() }));
vi.mock('../src/home/order', () => ({
  saveHomeConfig: (...args: unknown[]) => orderMock.save(...args),
  loadHomeOrder: (...args: unknown[]) => orderMock.load(...args),
}));

import { createOverlay, closeOverlay, showOverlay, unmountPanelResize } from '../src/home/ui';
import { unloadHome } from '../src/home/index';

function makeRiver(): RiverData {
  const day = (dateStr: string) => ({ dateStr, events: [], summary: { ...EMPTY_SUMMARY }, firstTs: null });
  const days = Array.from({ length: 7 }, (_, i) => day(`2025-06-1${i}`));
  const week = days.map((d, i) => ({ dateStr: d.dateStr, label: d.dateStr.slice(5), dayOfMonth: 10 + i, weekday: '一', hit: false }));
  return {
    today: days[0], yesterday: days[1], days, week,
    streak: { diaryStreak: 0, diaryWrittenToday: false },
    counts: { ...EMPTY_COUNTS },
    collectRecent: [],
    pomodoroFocusing: false,
  };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (fn()) return;
    await tick(30);
  }
  throw new Error('waitFor 超时');
}

describe('home 滚位记忆（上游 eff P2-2，票 319）', () => {
  beforeEach(() => {
    resetHomeState();
    resetObsidianMocks();
    document.body.innerHTML = '';
    setApp({ vault: new MockVault() } as any);
    setSettingsProvider(() => ({}) as any);
    orderMock.load.mockResolvedValue(null);
    orderMock.save.mockResolvedValue(undefined);
    collectRiverMock.mockResolvedValue(makeRiver());
  });

  it('closeOverlay 存滚位、showOverlay 写回（display:none 复用不丢浏览位置）', async () => {
    const app = { vault: new MockVault() } as any;
    H.appRef = app; // refreshRiverAndRender 的守卫前提（index.ts openHome 同款接线）
    createOverlay(app);
    await waitFor(() => !!H.currentOverlay!.querySelector('[data-home-entries] .bz-home-erow'));
    const flow = H.currentOverlay!.querySelector<HTMLElement>('.bz-home-flow')!;
    flow.scrollTop = 120;
    closeOverlay();
    expect(H.scroll.flow).toBe(120); // 隐藏前已存
    showOverlay();
    const flow2 = H.currentOverlay!.querySelector<HTMLElement>('.bz-home-flow')!;
    expect(flow2.scrollTop).toBe(120); // 重开写回
    closeOverlay();
  });

  it('renderAll 全量重建不打回滚位（keepHome 动作落地刷新同口径）', async () => {
    const app = { vault: new MockVault() } as any;
    H.appRef = app;
    createOverlay(app);
    await waitFor(() => !!H.currentOverlay!.querySelector('[data-home-entries] .bz-home-erow'));
    const flow = H.currentOverlay!.querySelector<HTMLElement>('.bz-home-flow')!;
    flow.scrollTop = 88;
    closeOverlay();
    showOverlay(); // 复用显 → refreshRiverAndRender → renderAll 重建
    await waitFor(() => !!H.currentOverlay!.querySelector('[data-home-entries] .bz-home-erow'));
    await tick(30);
    expect(H.currentOverlay!.querySelector<HTMLElement>('.bz-home-flow')!.scrollTop).toBe(88);
    closeOverlay();
  });
});

describe('home 缩放句柄生命周期（上游 ADR-0084，票 319）', () => {
  beforeEach(() => {
    resetHomeState();
    resetObsidianMocks();
    document.body.innerHTML = '';
    setApp({ vault: new MockVault() } as any);
    setSettingsProvider(() => ({}) as any);
    orderMock.load.mockResolvedValue(null);
    orderMock.save.mockResolvedValue(undefined);
    collectRiverMock.mockResolvedValue(makeRiver());
  });

  it('unmountPanelResize 幂等 + unloadHome 清场后可重建（无「已挂」误判）', async () => {
    createOverlay({ vault: new MockVault() } as any);
    await tick(30);
    expect(() => unmountPanelResize()).not.toThrow();
    unmountPanelResize(); // 二连摘不抛（句柄空 no-op）
    unloadHome();
    // 卸载后重建全链不抛（句柄已清，重新挂载不会被旧句柄挡住）
    expect(() => createOverlay({ vault: new MockVault() } as any)).not.toThrow();
    unloadHome();
  });

  it('拖拽尺寸记忆键就位：DEFAULT homePanelWidth/Height = 0（0 = 未设置走壳参数）', () => {
    expect(DEFAULT_SETTINGS.homePanelWidth).toBe(0);
    expect(DEFAULT_SETTINGS.homePanelHeight).toBe(0);
  });
});

describe('二脑 canvas 入脑（上游 ADR-0141 §5，票 319）', () => {
  it('canvasToText：text > label > file(取笔记名) > url 逐节点取，畸形 JSON 返回空串', () => {
    const canvas = JSON.stringify({
      nodes: [
        { id: '1', type: 'text', text: '  卢曼卡片盒笔记  ' },
        { id: '2', type: 'group', label: '分组标题' },
        { id: '3', type: 'file', file: '我的/日记/2026-10-05.md' },
        { id: '4', type: 'link', url: 'https://obsidian.md' },
        { id: '5', type: 'text', text: '' },
      ],
      edges: [],
    });
    expect(canvasToText(canvas)).toBe('卢曼卡片盒笔记\n\n分组标题\n\n2026-10-05\n\nhttps://obsidian.md');
    expect(canvasToText('不是 JSON')).toBe('');
    expect(canvasToText(JSON.stringify({ edges: [] }))).toBe('');
    expect(canvasToText('')).toBe('');
  });

  it('whitelistedFiles 收 canvas 文件；白名单空 = 什么也不录（ticket 116 红线不破）', async () => {
    const { VectorStore } = await import('../src/secondbrain/vector-store');
    const mdFile = { path: '我的/日记/2026-10-05.md', extension: 'md', stat: { mtime: 1 } };
    const canvasFile = { path: '我的/画布/脑图.canvas', extension: 'canvas', stat: { mtime: 2 } };
    const vault = {
      getMarkdownFiles: () => [mdFile],
      getFiles: () => [mdFile, canvasFile],
      read: async () => '',
    };
    const store = new VectorStore({ vault } as any);
    // buildConfig 缺键自兜底（|| 回落），白名单只吃 secondBrainAllowPaths
    setSettingsProvider(() => ({ secondBrainAllowPaths: '我的' }) as any);
    const files = store.whitelistedFiles();
    expect(files.map((f) => f.path)).toContain('我的/画布/脑图.canvas');
    expect(files.map((f) => f.path)).toContain('我的/日记/2026-10-05.md');
    // ticket 116 红线：白名单空 = 什么也不录（canvas 不例外）
    setSettingsProvider(() => ({}) as any);
    expect(store.whitelistedFiles()).toEqual([]);
  });
});
