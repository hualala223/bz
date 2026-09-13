/**
 * 影院（cinema）入口/目录回落 + 事件补发测试（ADR-0087 接管旧 movie 域）
 * - ensureCinema：cinemaFolderPath 显式配置生效；缺省回落「我的/影视」
 * - quickAddWant：发 movie:created(want) 域事件（smartcat 行为流依赖）+ progress 通知 + 建笔记
 * - runAIRecommend / 快速状态窗 / 删除等事件补发由 ui.test / recommend.test 覆盖
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { onDomainEvent, clearDomainEvents } from '../../src/core/domain-bus';
import { M, resetCinemaState } from '../../src/cinema/state';
import { ensureCinema, unloadCinema, applyDefaultView } from '../../src/cinema';
import { quickAddWant } from '../../src/cinema/recommend';

function makeApp(vault: MockVault) {
  const app = mockAppWithVault(vault);
  setApp(app);
  return app;
}

describe('cinema ensureCinema 目录回落（ADR-0087）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    unloadCinema();
    setSettingsProvider(() => ({} as any));
  });

  it('未配置 cinemaFolderPath → 回落默认「我的/影视」', () => {
    setSettingsProvider(() => ({} as any));
    const vault = new MockVault();
    ensureCinema(makeApp(vault));
    expect(M.folderPath).toBe('我的/影视');
  });

  it('显式配置 cinemaFolderPath → 使用该目录', () => {
    setSettingsProvider(() => ({ cinemaFolderPath: '我的/影院' } as any));
    const vault = new MockVault();
    ensureCinema(makeApp(vault));
    expect(M.folderPath).toBe('我的/影院');
  });

  it('cinemaFolderPath 为空白串 → 回落默认（trim 判断）', () => {
    setSettingsProvider(() => ({ cinemaFolderPath: '   ' } as any));
    const vault = new MockVault();
    ensureCinema(makeApp(vault));
    expect(M.folderPath).toBe('我的/影视');
  });
});

describe('cinema 默认视图接线（issue 194）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    unloadCinema();
    setSettingsProvider(() => ({} as any));
  });

  it('未配置 → 默认最近观看排序 + 状态全部', () => {
    setSettingsProvider(() => ({} as any));
    applyDefaultView();
    expect(M.sortMode).toBe('date');
    expect(M.statusFilter).toBeNull();
  });

  it('合法配置生效（rating 排序 + 已看筛选）', () => {
    setSettingsProvider(() => ({ cinemaSortMode: 'rating', cinemaStatusFilter: '已看' } as any));
    applyDefaultView();
    expect(M.sortMode).toBe('rating');
    expect(M.statusFilter).toBe('已看');
  });

  it('非法值回落（未知排序回 date、未知状态回全部）', () => {
    setSettingsProvider(() => ({ cinemaSortMode: 'xxx', cinemaStatusFilter: '想' } as any));
    applyDefaultView();
    expect(M.sortMode).toBe('date');
    expect(M.statusFilter).toBeNull();
  });
});

describe('cinema quickAddWant 事件补发（movie:created want）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    clearDomainEvents();
    document.body.innerHTML = '';
    M.folderPath = '我的/影视';
  });

  it('加入想看 → 建笔记 + 发 movie:created(want) 事件（豆瓣队列接管，无 progress 通知）', async () => {
    const seen: any[] = [];
    const off = onDomainEvent('movie', (evt) => seen.push(evt));
    const vault = new MockVault();
    const app = makeApp(vault);
    await quickAddWant(app, '新片', '电影');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'created', name: '新片', status: 'want', rating: null });
    expect((vault.files as any).get('我的/影视/《新片》.md')).toContain('评分: -1');
    // issue 261：海报抓取改由 douban-queue 接管——不再弹 progress 通知（jsdom 无 window.require，入队静默跳过）
    expect(document.querySelector('.bz-notice--progress')).toBeNull();
    off();
  });
});

describe('G6：影视文件夹设置会话内即时生效（票 271）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    unloadCinema();
    setSettingsProvider(() => ({} as any));
  });

  it('已初始化后再改 cinemaFolderPath → 再次 ensureCinema 立即改用新目录（不必重载）', () => {
    setSettingsProvider(() => ({ cinemaFolderPath: '我的/影院' } as any));
    const vault = new MockVault();
    ensureCinema(makeApp(vault));
    expect(M.folderPath).toBe('我的/影院');
    // 会话内改设置：目录每次 ensureCinema 同步读 → 面板/新建立刻走新目录
    setSettingsProvider(() => ({ cinemaFolderPath: '我的/新影库' } as any));
    ensureCinema(makeApp(vault));
    expect(M.folderPath).toBe('我的/新影库');
  });

  it('已初始化 + 设置被清空 → 回落默认目录（幂等初始化不阻断目录同步）', () => {
    setSettingsProvider(() => ({ cinemaFolderPath: '我的/影院' } as any));
    const vault = new MockVault();
    ensureCinema(makeApp(vault));
    setSettingsProvider(() => ({} as any));
    ensureCinema(makeApp(vault));
    expect(M.folderPath).toBe('我的/影视');
  });
});
