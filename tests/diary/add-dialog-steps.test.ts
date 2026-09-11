/**
 * 写日记弹窗两步化（ADR-0109）：
 * 第一步「类型 + 时间」→ 第二步「正文」。移动端正文框不再被软键盘吞掉。
 * - 未选类型点「下一步」被拦（冻结文案「请至少选择一个类型」）；
 * - 上一步保留草稿、遮罩取消丢弃草稿；
 * - preset 带分类（每日复盘）直接进第二步；
 * - 保存后两步都收起，数据仍以第一步的 datetime/类型为源。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { moment } from 'obsidian';
import { setApp } from '../../src/diary/app';
import { applyDirectories, resetTagsConfig } from '../../src/diary/config';
import { setDiaryDataMap, state } from '../../src/diary/state';
import { createAddDialog, openAddDialog, __resetAddDialogDraftForTests } from '../../src/diary/ui/dialogs';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { clearNotices, hasNotice } from '../mock-obsidian-entry';

let vault: MockVault;

function setup(): void {
  vault = new MockVault();
  setApp(mockAppWithVault(vault) as any);
  createAddDialog();
}

function step1(): HTMLElement {
  return document.getElementById('add-diary-popup')!;
}

function step2(): HTMLElement {
  return document.getElementById('add-diary-content-popup')!;
}

function mask(): HTMLElement {
  return document.getElementById('add-diary-mask')!;
}

function visible(el: HTMLElement): boolean {
  return el.style.display === 'block';
}

function contentInput(): HTMLTextAreaElement {
  return document.getElementById('add-diary-content') as HTMLTextAreaElement;
}

function pickFirstTag(): void {
  const btn = document.querySelector<HTMLElement>('#add-diary-type-container .diary-tag-selector-btn')!;
  btn.click();
}

function clickNext(): void {
  (document.getElementById('add-diary-next') as HTMLElement).click();
}

function clickBack(): void {
  (document.getElementById('add-diary-back') as HTMLElement).click();
}

beforeEach(() => {
  document.body.innerHTML = '';
  clearNotices();
  __resetAddDialogDraftForTests();
  resetTagsConfig();
  applyDirectories({});
  setDiaryDataMap(new Map());
  state.data.originalDiaryEntries = [];
  state.data.currentFilteredEntries = [];
  state.data.selectedTags.clear();
  state.data.currentDateFilter = null;
  state.data.currentSearchKeyword = '';
  state.events.isInternalUpdate = false;
  vi.restoreAllMocks();
});

describe('写日记弹窗两步化', () => {
  it('打开停在第一���（类型页），正文页不显示', () => {
    setup();
    openAddDialog();
    expect(visible(mask())).toBe(true);
    expect(visible(step1())).toBe(true);
    expect(visible(step2())).toBe(false);
  });

  it('未选类型点下一步：被拦在第一步并提示（不进正文页）', () => {
    setup();
    openAddDialog();
    clickNext();
    expect(visible(step1())).toBe(true);
    expect(visible(step2())).toBe(false);
    expect(hasNotice('请至少选择一个类型')).toBe(true);
  });

  it('选类型后下一步进正文页，第一步隐藏但 DOM 保留（仍是保存数据源）', () => {
    setup();
    openAddDialog();
    pickFirstTag();
    clickNext();
    expect(visible(step1())).toBe(false);
    expect(visible(step2())).toBe(true);
    expect(document.getElementById('add-diary-type-container')).toBeTruthy();
    expect(document.getElementById('add-diary-datetime')).toBeTruthy();
  });

  it('上一步保留草稿，再下一步正文原样回来', () => {
    setup();
    openAddDialog();
    pickFirstTag();
    clickNext();
    contentInput().value = '写了一半的正文';
    clickBack();
    expect(visible(step1())).toBe(true);
    clickNext();
    expect(contentInput().value).toBe('写了一半的正文');
  });

  it('遮罩取消丢弃草稿（重新打开是空正文）', () => {
    setup();
    openAddDialog();
    pickFirstTag();
    clickNext();
    contentInput().value = '要丢掉的草稿';
    clickBack();
    mask().click();
    expect(visible(mask())).toBe(false);
    openAddDialog();
    pickFirstTag();
    clickNext();
    expect(contentInput().value).toBe('');
  });

  it('preset 带分类（每日复盘）跳过第一步，正文预填', () => {
    setup();
    openAddDialog({ tags: ['复盘'], content: '## 当日复盘' });
    expect(visible(step1())).toBe(false);
    expect(visible(step2())).toBe(true);
    expect(contentInput().value).toBe('## 当日复盘');
  });

  it('两步保存：条目按第一步的日期与类型落盘，两步都收起', async () => {
    setup();
    openAddDialog();
    pickFirstTag();
    clickNext();
    contentInput().value = '今天的正文';
    const { saveNewEntry } = await import('../../src/diary/ui/dialogs');
    await saveNewEntry();
    const today = moment().format('YYYY-MM-DD');
    const file = vault.files.get(`我的/日记/${today}.md`)!;
    expect(file).toContain('今天的正文');
    expect(hasNotice('已保存日记')).toBe(true);
    expect(visible(mask())).toBe(false);
    expect(visible(step1())).toBe(false);
    expect(visible(step2())).toBe(false);
  });

  it('按钮行是 body/foot 结构（foot 在滚动区外，吸底不被挤走）', () => {
    setup();
    const foot = document.querySelector('#add-diary-popup .bz-diary-add-foot')!;
    const body = document.querySelector('#add-diary-popup .bz-diary-add-body')!;
    expect(foot).toBeTruthy();
    expect(body).toBeTruthy();
    expect(foot.contains(document.getElementById('add-diary-next')!)).toBe(true);
    expect(body.contains(document.getElementById('add-diary-type-container')!)).toBe(true);
  });
});
