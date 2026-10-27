/**
 * 写日记单弹窗（票 323：上游 1.33.x 视觉移植，两步制 ADR-0109 退役）：
 * - core uiModal 壳「开即建关即拆」：挂载即见、关闭即摘（无 display 切换）；
 * - 脏拦截：有输入（类型/正文/日期偏离）走 confirmDiscard，无输入直接收；
 * - preset（每日触动点记录）预选标签/预填模板/指定落点；
 * - 防连点（保存中禁用）+ Ctrl/⌘+Enter 提交 + 软键盘抬升 + chips 频次前置。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setApp } from '../../src/diary/app';
import { applyDirectories, resetTagsConfig } from '../../src/diary/config';
import { setDiaryDataMap, state } from '../../src/diary/state';
import { applyUiSettings } from '../../src/diary/ui/ui-settings';
import { createAddDialog, openAddDialog, saveNewEntry, resetTagUsageStats, __resetAddDialogDraftForTests } from '../../src/diary/ui/dialogs';
import { emitDomainEvent } from '../../src/core/domain-bus';
import { REVIEW_TEMPLATE } from '../../src/diary/daily';
import { REVIEW_HEADING } from '../../src/diary/daily-write';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { clearNotices, hasNotice } from '../mock-obsidian-entry';

let vault: MockVault;

function setup(): void {
  vault = new MockVault();
  setApp(mockAppWithVault(vault) as any);
}

function mask(): HTMLElement | null {
  return document.getElementById('add-diary-mask');
}

function popup(): HTMLElement {
  return document.getElementById('add-diary-popup')!;
}

function contentInput(): HTMLTextAreaElement {
  return document.getElementById('add-diary-content') as HTMLTextAreaElement;
}

function datetimeInput(): HTMLInputElement {
  return document.getElementById('add-diary-datetime') as HTMLInputElement;
}

function chip(tag: string): HTMLElement {
  return document.querySelector(`#add-diary-type-container [data-tag="${tag}"]`)!;
}

function firstChip(): HTMLElement {
  return document.querySelector('#add-diary-type-container .diary-tag-selector-btn')!;
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  document.body.innerHTML = '';
  clearNotices();
  __resetAddDialogDraftForTests();
  resetTagUsageStats();
  resetTagsConfig();
  applyDirectories({});
  setDiaryDataMap(new Map());
  state.data.originalDiaryEntries = [];
  state.data.currentFilteredEntries = [];
  state.data.selectedTags.clear();
  state.data.currentDateFilter = null;
  state.data.currentSearchKeyword = '';
  state.events.isInternalUpdate = false;
  applyUiSettings({ diaryJumpToEditAfterSave: false });
  vi.restoreAllMocks();
});

describe('写日记单弹窗（票 323 上游视觉移植）', () => {
  it('打开即建壳：遮罩/弹窗挂载，标题「写日记」，表单三件套与吸底栏在位', () => {
    setup();
    createAddDialog(); // 兼容空操作（panel init 契约）
    expect(mask()).toBeNull();
    openAddDialog();
    expect(mask()).toBeTruthy();
    expect(popup().querySelector('.bz-dialog-title')!.textContent).toBe('写日记');
    expect(document.getElementById('add-diary-datetime')).toBeTruthy();
    expect(document.getElementById('add-diary-type-container')).toBeTruthy();
    expect(contentInput().tagName).toBe('TEXTAREA');
    const foot = popup().querySelector('.bz-diary-add-foot')!;
    expect(foot).toBeTruthy();
    const btnTexts = [...foot.querySelectorAll('button')].map((b) => b.textContent);
    expect(btnTexts.some((t) => t!.includes('取消'))).toBe(true);
    expect(btnTexts.some((t) => t!.includes('添加'))).toBe(true);
  });

  it('默认不预选标签；保存落 `# 随笔`，保存后壳摘除', async () => {
    setup();
    openAddDialog();
    expect(document.querySelectorAll('#add-diary-type-container .diary-active').length).toBe(0);
    chip('日记').click();
    contentInput().value = '单弹窗直写';
    datetimeInput().value = '2024-03-04 09:30';
    await saveNewEntry();
    const saved = vault.files.get('我的/日记/2024-03-04.md')!;
    expect(saved).toContain('# 随笔');
    expect(saved).toContain('**📖 09:30**');
    expect(saved).toContain('单弹窗直写');
    expect(hasNotice(/已保存日记/)).toBe(true);
    expect(mask()).toBeNull();
  });

  it('preset（每日触动点记录）：预选「触动点」、预填模板、不误选其他标签', () => {
    setup();
    openAddDialog({ tags: ['触动点'], content: REVIEW_TEMPLATE, section: REVIEW_HEADING });
    expect(chip('触动点').classList.contains('diary-active')).toBe(true);
    expect(contentInput().value).toBe(REVIEW_TEMPLATE);
    expect(document.querySelectorAll('#add-diary-type-container .diary-active').length).toBe(1);
  });

  it('脏拦截：有输入点遮罩 → 放弃确认弹层（域皮）；点「放弃」才关壳', async () => {
    setup();
    openAddDialog();
    chip('日记').click();
    mask()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(); // 确认框经 openFlowDialog 异步挂载
    const confirmPopup = document.getElementById('__shared_confirm_popup__');
    expect(confirmPopup).toBeTruthy();
    expect(confirmPopup!.classList.contains('bz-diary-flow-dialog')).toBe(true);
    // 未确认前壳仍在
    expect(mask()).toBeTruthy();
    const giveUpBtn = [...confirmPopup!.querySelectorAll('button')].find(
      (b) => b.textContent === '放弃'
    ) as HTMLElement;
    giveUpBtn.click();
    await flush();
    expect(mask()).toBeNull();
  });

  it('无输入点遮罩：直接收壳，不出确认弹层', () => {
    setup();
    openAddDialog();
    mask()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('__shared_confirm_popup__')).toBeNull();
    expect(mask()).toBeNull();
  });

  it('防连点与按钮态：点击「添加」即禁用并显示「保存中…」，写盘结束壳摘除', async () => {
    setup();
    openAddDialog();
    chip('日记').click();
    datetimeInput().value = '2024-03-05 08:00';
    const saveBtn = document.getElementById('add-diary-save') as HTMLButtonElement;
    saveBtn.click();
    expect(saveBtn.disabled).toBe(true);
    expect(saveBtn.textContent).toContain('保存中…');
    await flush();
    expect(vault.files.get('我的/日记/2024-03-05.md')!).toContain('**📖 08:00**');
    expect(mask()).toBeNull();
  });

  it('Ctrl/⌘+Enter 提交（bindFormSubmit）', async () => {
    setup();
    openAddDialog();
    chip('日记').click();
    datetimeInput().value = '2024-03-06 21:00';
    contentInput().value = '回车直存';
    popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await flush();
    expect(vault.files.get('我的/日记/2024-03-06.md')!).toContain('回车直存');
  });

  it('软键盘抬升：输入聚焦加 .keyboard-up，失焦回落', () => {
    setup();
    openAddDialog();
    const ta = contentInput();
    ta.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(popup().classList.contains('keyboard-up')).toBe(true);
    ta.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(popup().classList.contains('keyboard-up')).toBe(false);
  });

  it('chips 频次前置：保存用过「诗」后重开弹窗，诗排到首位', () => {
    setup();
    emitDomainEvent('diary:entry-added', { date: '2024-01-01', time: '08:00', tags: ['诗'], content: '' });
    openAddDialog();
    expect(firstChip().getAttribute('data-tag')).toBe('诗');
  });
});
