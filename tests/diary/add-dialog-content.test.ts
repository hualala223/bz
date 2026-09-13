/**
 * 写日记落点：弹窗输入 → 保存 → 写进当天日记的 `# 随笔` 小节（ADR-0114）。
 * - 有正文：`**emoji HH:mm**` + 正文落进 `# 随笔`，且不产生条目标题（面板/筛选/回忆墙/智能猫都看不到）；
 * - 无正文：设置 diaryJumpToEditAfterSave 开 → 保存后**打开该日期日记文件**（块模型下无条目可跳）；
 * - 弹窗再次打开时正文清空（上一条正文不带进下一条）。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { moment } from 'obsidian';
import { setApp } from '../../src/diary/app';
import { applyDirectories, resetTagsConfig } from '../../src/diary/config';
import { setDiaryDataMap, state } from '../../src/diary/state';
import { applyUiSettings } from '../../src/diary/ui/ui-settings';
import { createAddDialog, openAddDialog, saveNewEntry, __resetAddDialogDraftForTests } from '../../src/diary/ui/dialogs';
import { openReviewDialog } from '../../src/diary/daily';
import { clearNotices } from '../mock-obsidian-entry';
import { MockVault, mockAppWithVault } from '../mock-vault';

let vault: MockVault;
let openLinkSpy: ReturnType<typeof vi.fn>;
let openFileSpy: ReturnType<typeof vi.fn>;

function makeVault(files: Record<string, string>) {
  vault = new MockVault();
  for (const [p, c] of Object.entries(files)) vault.files.set(p, c);
  const app = mockAppWithVault(vault);
  openLinkSpy = vi.fn();
  openFileSpy = vi.fn();
  (app.workspace as any).openLinkText = openLinkSpy;
  // 块模型下「保存后进入编辑」= 打开该日期日记文件（getLeaf().openFile）
  (app.workspace as any).getLeaf = () => ({ openFile: openFileSpy });
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
  __resetAddDialogDraftForTests();
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

describe('写日记落点：`# 随笔` 小节（ADR-0114）', () => {
  it('弹窗含正文输入框（add-diary-content）', () => {
    makeVault({});
    applyUiSettings({ diaryJumpToEditAfterSave: true });
    openDialogWithType();
    const ta = document.getElementById('add-diary-content') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.tagName).toBe('TEXTAREA');
  });

  it('有正文：写入当天日记的 `# 随笔` 小节，块首行为加粗行（非标题），不打开文件', async () => {
    makeVault({});
    applyUiSettings({ diaryJumpToEditAfterSave: true });
    openDialogWithType();

    const ta = document.getElementById('add-diary-content') as HTMLTextAreaElement;
    ta.value = '弹窗直写的正文内容';

    await saveNewEntry();

    const saved = vault.files.get(todayPath());
    expect(saved).toBeTruthy();
    // 骨架小节 + 加粗块首行 + 弹窗正文
    expect(saved).toContain('# 随笔');
    expect(saved).toMatch(/\*\*[^*\s]+ \d{2}:\d{2}\*\*/);
    expect(saved).toContain('弹窗直写的正文内容');
    // 关键：不再产出条目标题（否则会被面板/回忆墙/智能猫四处解析器当条目）
    expect(saved).not.toMatch(/^# \S+ \d{2}:\d{2}/m);
    // 有正文：不打开日记文件
    expect(openFileSpy).not.toHaveBeenCalled();
    expect(openLinkSpy).not.toHaveBeenCalled();
    // 弹窗已关闭
    expect(document.getElementById('add-diary-mask')!.style.display).toBe('none');
  });

  it('有正文：不进面板列表（标签/日期/搜索筛选都不再联动）', async () => {
    makeVault({});
    applyUiSettings({ diaryJumpToEditAfterSave: false });
    state.data.currentSearchKeyword = '弹窗';
    openDialogWithType();

    (document.getElementById('add-diary-content') as HTMLTextAreaElement).value = '弹窗直写的正文内容';
    await saveNewEntry();

    expect(state.data.currentFilteredEntries).toHaveLength(0);
    expect(document.querySelector('.diary-entry-card')).toBeNull();
  });

  it('无正文：设置开时打开该日期日记文件（无条目可跳，降级为打开文件）', async () => {
    makeVault({});
    applyUiSettings({ diaryJumpToEditAfterSave: true });
    openDialogWithType();

    (document.getElementById('add-diary-content') as HTMLTextAreaElement).value = '';

    await saveNewEntry();

    expect(vault.files.get(todayPath())).toBeTruthy();
    expect(openFileSpy).toHaveBeenCalledTimes(1);
    expect(openFileSpy.mock.calls[0][0]).toMatchObject({ path: todayPath() });
    expect(openLinkSpy).not.toHaveBeenCalled();
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

describe('每日复盘的落点（ADR-0114）', () => {
  it('复盘入口的落点 = `# 当日复盘`：文件里没有该小节时现场新建，块首行为 h2 时间标题', async () => {
    makeVault({ '我的/日记/2024-01-05.md': '# 随笔\n\n# 日程规划\n' });
    applyUiSettings({ diaryJumpToEditAfterSave: false });
    createAddDialog();
    openReviewDialog();

    const dt = document.getElementById('add-diary-datetime') as HTMLInputElement;
    dt.value = '2024-01-05 21:40';
    await saveNewEntry();

    const saved = vault.files.get('我的/日记/2024-01-05.md')!;
    expect(saved).toContain('# 当日复盘');
    expect(saved).toMatch(/## 🪞 21:40/);
    expect(saved).toContain('### 触动点');
    // 随笔小节与日程规划小节一字不动
    expect(saved).toContain('# 随笔');
    expect(saved).toContain('# 日程规划');
  });

  it('复盘写第二次：追加在 `# 当日复盘` 小节末尾，不重复小节标题', async () => {
    const first = ['# 随笔', '', '# 当日复盘', '', '## 🪞 09:00', '', '### 触动点', '- ', ''].join('\n');
    makeVault({ '我的/日记/2024-01-05.md': first });
    applyUiSettings({ diaryJumpToEditAfterSave: false });
    createAddDialog();
    openReviewDialog();

    const dt = document.getElementById('add-diary-datetime') as HTMLInputElement;
    dt.value = '2024-01-05 22:10';
    await saveNewEntry();

    const saved = vault.files.get('我的/日记/2024-01-05.md')!;
    expect(saved.match(/^# 当日复盘$/gm)).toHaveLength(1);
    expect(saved.match(/^## 🪞 /gm)).toHaveLength(2);
    expect(saved.indexOf('## 🪞 09:00')).toBeLessThan(saved.indexOf('## 🪞 22:10'));
  });
});
