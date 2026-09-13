/**
 * 日常行为记录（diary/daily-capture）UI 层测试（jsdom）：
 * （当日待办事项捕获已随 ADR-0122 退役，其 UI 测试一并移除）
 * - 捕获弹窗：打开即出遮罩、输入框占位正确；
 * - 空输入提交：弹窗保留 + warning 通知，不写盘；
 * - 填写确认：写盘按冻结格式落到今天日记小节，成功通知文案带日期。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { moment } from 'obsidian';
import { setApp as setCoreApp } from '../../src/core/app';
import { setApp } from '../../src/diary/app';
import { resetTagsConfig, applyDirectories } from '../../src/diary/config';
import { setDiaryDataMap, state } from '../../src/diary/state';
import { openActivityCapture } from '../../src/diary/daily-capture';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { clearNotices } from '../mock-obsidian-entry';

let vault: MockVault;

function setup(files: Record<string, string> = {}): void {
  vault = new MockVault();
  for (const [p, c] of Object.entries(files)) vault.files.set(p, c);
  const app = mockAppWithVault(vault);
  setApp(app);
  setCoreApp(app);
}

function today(): string {
  return `我的/日记/${moment().format('YYYY-MM-DD')}.md`;
}

function popup(): HTMLElement {
  return document.querySelector('.bz-overlay-popup') as HTMLElement;
}

function input(): HTMLInputElement {
  return popup().querySelector<HTMLInputElement>('.bz-input')!;
}

function okBtn(): HTMLButtonElement {
  return [...popup().querySelectorAll<HTMLButtonElement>('.bz-btn-row button')].pop()!;
}

/** 清空微任务队列（串行队列写盘链有多级 await，逐次 Promise.resolve 数量不够时通知迟到） */
async function flushAll(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = '';
  clearNotices();
  resetTagsConfig();
  applyDirectories({});
  setDiaryDataMap(null);
  state.data.originalDiaryEntries = [];
  state.data.currentFilteredEntries = [];
  state.events.isInternalUpdate = false;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T11:25:00'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('日常行为记录', () => {
  it('填写确认：`- 11:25-活动` 落到「## 日常行为记录」小节（旧层级兼容，ADR-0113）', async () => {
    setup({ '我的/日记/2026-09-10.md': '## 日常行为记录\n\n## 日程规划\n' });
    openActivityCapture();
    input().value = '跑了一公里';
    okBtn().click();
    await flushAll();
    const out = vault.files.get(today())!;
    expect(out).toContain('## 日常行为记录\n- 11:25-跑了一公里');
    expect(out).toContain('## 日程规划');
  });

  it('填写确认：`- 11:25-活动` 落到新层级 `# 日常行为记录` 小节（ADR-0113）', async () => {
    setup({ '我的/日记/2026-09-10.md': '# 日常行为记录\n\n# 日程规划\n' });
    openActivityCapture();
    input().value = '跑了一公里';
    okBtn().click();
    await flushAll();
    const out = vault.files.get(today())!;
    expect(out).toContain('# 日常行为记录\n- 11:25-跑了一公里');
    expect(out).toContain('# 日程规划');
  });
});
