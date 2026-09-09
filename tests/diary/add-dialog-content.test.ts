/**
 * 写日记弹窗正文直写：弹窗输入 → 保存即落盘 → 不打开日记文件。
 * - 有正文：内容随条目写入今日日记文件，且不调用 openLinkText（跳过「保存后进入编辑」）；
 * - 无正文：保持既有设置行为（diaryJumpToEditAfterSave 开 → 跳转进入编辑）；
 * - 弹窗再次打开时正文清空（上一条正文不带进下一条）。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { moment } from 'obsidian';
import { setApp } from '../../src/diary/app';
import { applyDirectories, resetTagsConfig } from '../../src/diary/config';
import { setDiaryDataMap, state } from '../../src/diary/state';
import { applyUiSettings } from '../../src/diary/ui/ui-settings';
import { createAddDialog, openAddDialog, saveNewEntry } from '../../src/diary/ui/dialogs';
import { clearNotices } from '../mock-obsidian-entry';
import { MockVault, mockAppWithVault } from '../mock-vault';

let vault: MockVault;
let openSpy: ReturnType<typeof vi.fn>;

function makeVault(files: Record<string, string>) {
  vault = new MockVault();
  for (const [p, c] of Object.entries(files)) vault.files.set(p, c);
  const app = mockAppWithVault(vault);
  openSpy = vi.fn();
  (app.workspace as any).openLinkText = openSpy;
  setApp(app);
  return vault;
}

function todayPath(): string {
  return `我的/日记/${moment().format('YYYY-MM-DD')}.md`;
}

/** 打开写日记弹窗并选中一个类型 */
function openDialogWithType() {
  createAddDialog();
  openAddDialog();
  const typeBtn = document.querySelector<HTMLElement>('#add-diary-type-container .diary-tag-selector-btn')!;
  expect(typeBtn).toBeTruthy();
  typeBtn.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
  clearNotices();
  resetTagsConfig();
  applyDirectories({});
  setDiaryDataMap(null);
  state.data.originalDiaryEntries = [];
  state.data.currentFilteredEntries = [];
  state.data.selectedTags.clear();
  state.data.currentDateFilter = null;
  state.data.currentSearchKeyword = '';
  state.ui.entriesContainer = null as any;
  state.ui.scrollContainer = null as any;
  state.ui.singleSelectedTagForDisplay = null;
  state.events.isInternalUpdate = false;
  vi.restoreAllMocks();
});

describe('写日记弹窗正文直写（不打开日记文件）', () => {
  it('弹窗含正文输入框（add-diary-content）', () => {
    makeVault({});
    applyUiSettings({ diaryJumpToEditAfterSave: true });
    openDialogWithType();
    const ta = document.getElementById('add-diary-content') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.tagName).toBe('TEXTAREA');
  });

  it('有正文：保存即写入今日日记文件，不调用 openLinkText', async () => {
    makeVault({});
    applyUiSettings({ diaryJumpToEditAfterSave: true });
    openDialogWithType();

    const ta = document.getElementById('add-diary-content') as HTMLTextAreaElement;
    ta.value = '弹窗直写的正文内容';

    await saveNewEntry();

    const saved = vault.files.get(todayPath());
    expect(saved).toBeTruthy();
    // 条目标题（# emoji HH:mm）+ 弹窗正文都落盘
    expect(saved).toMatch(/^# \S+ \d{2}:\d{2}/m);
    expect(saved).toContain('弹窗直写的正文内容');
    // 有正文：不跳转打开日记文件
    expect(openSpy).not.toHaveBeenCalled();
    // 弹窗已关闭
    expect(document.getElementById('add-diary-mask')!.style.display).toBe('none');
  });

  it('无正文：设置开时保持原行为——保存后跳转进入编辑', async () => {
    makeVault({});
    applyUiSettings({ diaryJumpToEditAfterSave: true });
    openDialogWithType();

    const ta = document.getElementById('add-diary-content') as HTMLTextAreaElement;
    ta.value = '';

    await saveNewEntry();

    expect(vault.files.get(todayPath())).toBeTruthy();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('再次打开弹窗：上一条正文已清空', async () => {
    makeVault({});
    applyUiSettings({ diaryJumpToEditAfterSave: false });
    openDialogWithType();

    const ta = document.getElementById('add-diary-content') as HTMLTextAreaElement;
    ta.value = '第一条';
    await saveNewEntry();

    openAddDialog();
    expect((document.getElementById('add-diary-content') as HTMLTextAreaElement).value).toBe('');
  });
});
