/**
 * 护眼模式 UI 集成测试（票 323）：toggleEyeMode 命令语义（切开+空闲直接开跑 / 切关收敛会话）、
 * 循环内 toast 静默（声音以外）、远眺秒级文案、圆点行隐藏、设置 schema 三行。
 * 范式同 pomodoro-action.test.ts：真实内存态 + MockVault + 假时钟，断言走 DOM。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks, clearNotices } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { openPomodoro, unloadPomodoro, toggleEyeMode } from '../../src/pomodoro';
import { pomodoroSettingsSchema } from '../../src/pomodoro/ui';

const T0 = new Date('2026-10-27T10:00:00').getTime();
const EYE_WORK_MS = 20 * 60 * 1000;
const REST_MS = 20 * 1000;

function setup(settings: any = {}) {
  const vault = new MockVault();
  const app: any = mockAppWithVault(vault);
  setApp(app);
  setSettingsProvider(() => settings);
  return { app, settings };
}

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function noticeCount(): number {
  return document.querySelectorAll('.bz-notice').length;
}

beforeEach(() => {
  resetObsidianMocks();
  clearNotices();
  document.body.innerHTML = '';
  unloadPomodoro();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  unloadPomodoro();
  clearNotices();
  vi.useRealTimers();
});

describe('护眼模式：toggleEyeMode 命令（票 323）', () => {
  it('切开 + 空闲 → 设置键落盘为开，直接开始第一轮用眼（20:00 计时中）', async () => {
    const { app, settings } = setup();
    await openPomodoro(app);
    await toggleEyeMode(app);
    expect(settings.pomodoroEyeMode).toBe(true);
    expect(el('pomodoro-time').textContent).toBe('20:00');
    expect(el('pomodoro-phase').textContent).toBe('专注');
  });

  it('切关 + 护眼计时中 → 停止计时回空闲专注（remaining 回满）', async () => {
    const { app, settings } = setup({ pomodoroEyeMode: true });
    await openPomodoro(app);
    el('pomodoro-btn-start').click();
    vi.advanceTimersByTime(60_000); // 走 1 分钟
    await toggleEyeMode(app);
    expect(settings.pomodoroEyeMode).toBe(false);
    // 回满的是**正常模式**时长（关护眼即回预设节奏），未计时
    expect(el('pomodoro-time').textContent).toBe('25:00');
    expect(el('pomodoro-phase').textContent).toBe('专注');
  });

  it('切关 + 休息相位 → 静默跳过回空闲专注（skip 不记历史）', async () => {
    const { app } = setup({ pomodoroEyeMode: true });
    await openPomodoro(app);
    el('pomodoro-btn-start').click();
    await vi.advanceTimersByTimeAsync(EYE_WORK_MS); // 用眼完成 → 远眺自动开始
    expect(el('pomodoro-phase').textContent).toBe('远眺');
    await toggleEyeMode(app);
    expect(el('pomodoro-phase').textContent).toBe('专注'); // 空闲专注（focus 相位文案）
  });

  it('切开 + 已有会话在跑 → 只切开关不重启会话（正常专注继续走）', async () => {
    const { app, settings } = setup();
    await openPomodoro(app);
    el('pomodoro-btn-start').click();
    vi.advanceTimersByTime(60_000);
    await toggleEyeMode(app);
    expect(settings.pomodoroEyeMode).toBe(true);
    expect(el('pomodoro-time').textContent).toBe('24:00'); // 原 25 分钟会话未被重启
  });
});

describe('护眼模式：循环行为（票 323）', () => {
  it('循环内阶段自然流转不弹 toast：手动开始 1 条之后，用眼/远眺完成各零新增', async () => {
    const { app } = setup({ pomodoroEyeMode: true });
    await openPomodoro(app);
    el('pomodoro-btn-start').click(); // 手动开始 → 「专注开始」1 条
    expect(noticeCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(EYE_WORK_MS); // 用眼完成 → 远眺（静默）
    expect(el('pomodoro-phase').textContent).toBe('远眺');
    expect(el('pomodoro-time').textContent).toBe('00:20'); // 秒级远眺
    // 手动开始的「专注开始」toast 早已到时自灭；计数 0 = 完成时刻零新增 toast（静默成立）
    expect(noticeCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(REST_MS); // 远眺完成 → 下一轮用眼（静默）
    expect(el('pomodoro-phase').textContent).toBe('专注');
    expect(el('pomodoro-time').textContent).toBe('20:00');
    expect(noticeCount()).toBe(0);
  });

  it('远眺暂停后继续 → 提示按秒说（远眺开始：20 秒）', async () => {
    const { app } = setup({ pomodoroEyeMode: true });
    await openPomodoro(app);
    el('pomodoro-btn-start').click();
    await vi.advanceTimersByTimeAsync(EYE_WORK_MS); // 进远眺
    el('pomodoro-btn-start').click(); // 暂停
    clearNotices();
    el('pomodoro-btn-start').click(); // 继续
    const texts = Array.from(document.querySelectorAll('.bz-notice')).map((n) => n.textContent);
    expect(texts.some((t) => t?.includes('远眺开始：20 秒'))).toBe(true);
  });

  it('护眼模式圆点行隐藏；正常模式不隐藏且 4 点（回归）', async () => {
    const eye = setup({ pomodoroEyeMode: true });
    await openPomodoro(eye.app);
    expect(el('pomodoro-cycle').hidden).toBe(true);
    expect(el('pomodoro-phase').textContent).toBe('护眼'); // 全新空闲态的模式标签
    unloadPomodoro();
    document.body.innerHTML = '';
    const normal = setup({});
    await openPomodoro(normal.app);
    expect(el('pomodoro-cycle').hidden).toBe(false);
    expect(el('pomodoro-cycle').childElementCount).toBe(4);
  });

  it('用眼自然完成照常记 history（今日 +1 个 · +20 分钟）', async () => {
    const { app } = setup({ pomodoroEyeMode: true });
    await openPomodoro(app);
    el('pomodoro-btn-start').click();
    await vi.advanceTimersByTimeAsync(EYE_WORK_MS);
    expect(el('pomodoro-today').textContent).toContain('今日 1 个');
    expect(el('pomodoro-today').textContent).toContain('20 分钟');
  });
});

describe('护眼模式：设置 schema（票 323）', () => {
  it('三行存在：开关 + 用眼分钟 + 休息秒数，两数字行仅护眼开启时可见', () => {
    const schema = pomodoroSettingsSchema();
    const rows: any[] = schema.groups.flatMap((g) => g.rows);
    const toggle = rows.find((r) => r.name === '护眼模式');
    expect(toggle?.binding?.key).toBe('pomodoroEyeMode');
    const workRow = rows.find((r) => r.name === '护眼用眼分钟数');
    const restRow = rows.find((r) => r.name === '护眼休息秒数');
    expect(workRow).toBeTruthy();
    expect(restRow).toBeTruthy();
    expect(workRow.visibleWhen({ pomodoroEyeMode: true })).toBe(true);
    expect(workRow.visibleWhen({ pomodoroEyeMode: false })).toBe(false);
    expect(restRow.visibleWhen({ pomodoroEyeMode: true })).toBe(true);
    expect(restRow.visibleWhen({ pomodoroEyeMode: false })).toBe(false);
  });
});
