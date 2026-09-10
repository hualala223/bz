/**
 * 日常时间记录（diary/daily）流程层测试：
 * - runTaskCheck：逐项问答 → 段级合并写回 CONFIG/SCRIPTS/每日任务状态.json（取消跳过、无待问不写、其他日期段保留）；
 * - planTomorrow：为明天建含日程模板的日记条目（重复检测、未加载时先 loadAll 防整文件重写丢数据）；
 * - openReviewDialog：预选「复盘」标签 + 预填复盘模板（写日记弹窗 preset）。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { moment } from 'obsidian';
import { setApp as setCoreApp } from '../../src/core/app';
import { setApp } from '../../src/diary/app';
import { applyDirectories, resetTagsConfig } from '../../src/diary/config';
import { setDiaryDataMap, state } from '../../src/diary/state';
import { createAddDialog } from '../../src/diary/ui/dialogs';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { clearNotices, hasNotice } from '../mock-obsidian-entry';

const mocks = vi.hoisted(() => ({
  dialog: vi.fn(async (_opts?: any) => undefined as string | undefined),
}));
// 流程框可编程应答（按任务文案决定选哪项 / 取消）
vi.mock('../../src/core/flow-dialog', () => ({ openFlowDialog: mocks.dialog }));

let vault: MockVault;

/** 按任务文案指定答案；未列出的任务选最后一项（cta，即「已完成」语义） */
function answerByLabel(map: Record<string, string | undefined>): void {
  mocks.dialog.mockImplementation(async (opts: any) => {
    const actions: Array<{ label: string; value: string }> = opts.actions;
    if (Object.prototype.hasOwnProperty.call(map, opts.message)) return map[opts.message];
    return actions[actions.length - 1].value;
  });
}

function setupVault(files: Record<string, string> = {}): MockVault {
  vault = new MockVault();
  for (const [p, c] of Object.entries(files)) vault.files.set(p, c);
  const app = mockAppWithVault(vault);
  setApp(app);
  setCoreApp(app as any);
  return vault;
}

function readStatus(): Record<string, Record<string, boolean>> {
  return JSON.parse(vault.files.get('CONFIG/SCRIPTS/每日任务状态.json') ?? '{}');
}

function today(): string {
  return moment().format('YYYY-MM-DD');
}

function tomorrow(): string {
  return moment().add(1, 'day').format('YYYY-MM-DD');
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
  state.events.isInternalUpdate = false;
  mocks.dialog.mockReset();
  mocks.dialog.mockResolvedValue(undefined);
  // 固定在晚上 20 点：7 项任务全部到点可问（消除时间限制带来的用例抖动）
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T20:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runTaskCheck', () => {
  it('7 项全部选完成项 → 状态文件记录全 true', async () => {
    setupVault();
    answerByLabel({});
    const { runTaskCheck } = await import('../../src/diary/daily');
    await runTaskCheck();
    expect(mocks.dialog).toHaveBeenCalledTimes(7);
    const status = readStatus()[today()];
    expect(Object.keys(status)).toHaveLength(7);
    for (const v of Object.values(status)) expect(v).toBe(true);
    expect(hasNotice('已记录 7 项任务（完成 7 项）')).toBe(true);
  });

  it('选「尚未」记为 false（未完成）', async () => {
    setupVault();
    answerByLabel({ '今天复习了没？': '尚未' });
    const { runTaskCheck } = await import('../../src/diary/daily');
    await runTaskCheck();
    expect(readStatus()[today()].review).toBe(false);
    expect(hasNotice('已记录 7 项任务（完成 6 项）')).toBe(true);
  });

  it('取消（undefined）视为跳过，该项不写入', async () => {
    setupVault();
    answerByLabel({ '今天记账了没？': undefined });
    const { runTaskCheck } = await import('../../src/diary/daily');
    await runTaskCheck();
    const status = readStatus()[today()];
    expect(status.accounting).toBeUndefined();
    expect(Object.keys(status)).toHaveLength(6);
  });

  it('全部取消 → 不写盘（状态文件保持空对象）', async () => {
    setupVault();
    answerByLabel({});
    mocks.dialog.mockResolvedValue(undefined);
    const { runTaskCheck } = await import('../../src/diary/daily');
    await runTaskCheck();
    expect(mocks.dialog).toHaveBeenCalledTimes(7);
    expect(readStatus()).toEqual({});
  });

  it('今天已全部记录 → 提示无待确认任务，不弹框', async () => {
    const done: Record<string, boolean> = {};
    for (const id of ['accounting', 'review', 'diary', 'reading', 'work_summary', 'review_words', 'review_index']) {
      done[id] = true;
    }
    setupVault({ 'CONFIG/SCRIPTS/每日任务状态.json': JSON.stringify({ [today()]: done }) });
    const { runTaskCheck } = await import('../../src/diary/daily');
    await runTaskCheck();
    expect(mocks.dialog).not.toHaveBeenCalled();
    expect(hasNotice('今天没有待确认的任务')).toBe(true);
  });

  it('段级合并写：只动今天一段，其他日期保留', async () => {
    setupVault({ 'CONFIG/SCRIPTS/每日任务状态.json': JSON.stringify({ '2026-09-09': { review: true } }) });
    answerByLabel({});
    const { runTaskCheck } = await import('../../src/diary/daily');
    await runTaskCheck();
    const all = readStatus();
    expect(all['2026-09-09']).toEqual({ review: true });
    expect(Object.keys(all[today()])).toHaveLength(7);
  });

  it('只问未记录过的项（已记的不再重复问）', async () => {
    setupVault({ 'CONFIG/SCRIPTS/每日任务状态.json': JSON.stringify({ [today()]: { accounting: false } }) });
    answerByLabel({});
    const { runTaskCheck } = await import('../../src/diary/daily');
    await runTaskCheck();
    expect(mocks.dialog).toHaveBeenCalledTimes(6);
    expect(mocks.dialog.mock.calls.some((c: any) => c[0].message === '今天记账了没？')).toBe(false);
  });
});

describe('planTomorrow', () => {
  it('为明天创建含三段日程模板的日记条目', async () => {
    setupVault();
    setDiaryDataMap(new Map());
    const { planTomorrow } = await import('../../src/diary/daily');
    await planTomorrow();
    const file = vault.files.get(`我的/日记/${tomorrow()}.md`)!;
    expect(file).toBeTruthy();
    expect(file).toContain('### 代办事项');
    expect(file).toContain('### 完成情况跟踪');
    expect(file).toContain('### 备注');
    expect(hasNotice(`已在 ${tomorrow()} 日记中创建日程规划`)).toBe(true);
  });

  it('已存在日程规划 → 提示不重复创建，文件不变', async () => {
    setupVault();
    setDiaryDataMap(
      new Map([
        [
          tomorrow(),
          [
            {
              date: tomorrow(),
              time: '08:00',
              timeValue: 800,
              tags: ['日记'],
              emoji: '📖',
              content: '### 代办事项\n- [ ] 旧',
              filename: tomorrow(),
              lineNumber: 1,
            } as any,
          ],
        ],
      ])
    );
    const { planTomorrow } = await import('../../src/diary/daily');
    await planTomorrow();
    expect(vault.files.has(`我的/日记/${tomorrow()}.md`)).toBe(false);
    expect(hasNotice(`明天（${tomorrow()}）已有日程规划，不再重复创建`)).toBe(true);
  });

  it('内存映射未加载 → 先 loadAll，既有日记内容不被整文件重写冲掉', async () => {
    setupVault({ [`我的/日记/${tomorrow()}.md`]: '# 📖 08:00\n早读\n' });
    setDiaryDataMap(null);
    const { planTomorrow } = await import('../../src/diary/daily');
    await planTomorrow();
    const file = vault.files.get(`我的/日记/${tomorrow()}.md`)!;
    expect(file).toContain('早读');
    expect(file).toContain('### 代办事项');
  });
});

describe('openReviewDialog', () => {
  it('预选「复盘」标签并预填复盘模板', async () => {
    setupVault();
    createAddDialog();
    const { openReviewDialog, REVIEW_TEMPLATE } = await import('../../src/diary/daily');
    openReviewDialog();
    const active = Array.from(document.querySelectorAll('#add-diary-type-container .diary-active')).map(
      (el) => el.textContent || ''
    );
    expect(active.some((t) => t.includes('复盘'))).toBe(true);
    const ta = document.getElementById('add-diary-content') as HTMLTextAreaElement;
    expect(ta.value).toBe(REVIEW_TEMPLATE);
  });

  it('回归：无 preset 打开写日记弹窗仍然是空正文、无预选标签', async () => {
    setupVault();
    createAddDialog();
    const { openReviewDialog } = await import('../../src/diary/daily');
    openReviewDialog();
    const { openAddDialog } = await import('../../src/diary/ui/dialogs');
    openAddDialog();
    const ta = document.getElementById('add-diary-content') as HTMLTextAreaElement;
    expect(ta.value).toBe('');
    expect(document.querySelectorAll('#add-diary-type-container .diary-active')).toHaveLength(0);
  });
});
