/**
 * 日常时间记录（diary/daily）流程层测试：
 * - runTaskCheck：逐项问答 → 段级合并写回 CONFIG/SCRIPTS/每日任务状态.json（取消跳过、无待问不写、其他日期段保留）；
 * - openPlanPicker / planDiary：流程框选「当日 / 明日」→ 按日记模板为目标日期建文件并补日程三段
 *   （两目标共用同一模板、取消不写、模板缺失走内置兜底、双标记判重、已存在则原样补写，ADR-0112；
 *   标题层级上提一级且读侧兼容旧层级，ADR-0113）；
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

// ===== 日程规划（ADR-0112：按日记模板建文件）=====

/** 模板路径（与 QuickAdd 宏「日程规划.js」同源） */
const TEMPLATE_PATH = 'CONFIG/TEMPLATE/模板-日记.md';

/** vault 模板文件当前内容（Q3-B 清理后：无 title、date_creation 由插件填），末尾无换行 */
const TEMPLATE_FILE = [
  '---',
  'card_type: 日记',
  '---',
  '',
  '# 睡眠相关',
  '- 起床时间：',
  '- 睡觉时间：',
  '- 睡眠情况：',
  '- 做梦情况：',
  '# 随笔',
  '',
  '# 新闻联播内容记录',
  '',
  '# 日常行为记录',
  '',
  '# 日程规划',
].join('\n');

/** 日程三段（与 buildPlanContent 同形；ADR-0113 起为二级标题） */
const PLAN_BODY = [
  '## 代办事项',
  '- [ ] ',
  '- [ ] ',
  '- [ ] ',
  '',
  '## 完成情况跟踪',
  '| 计划完成 | 实际完成 |',
  '| -------- | -------- |',
  '|  |  |',
  '|  |  |',
  '|  |  |',
  '',
  '## 备注',
  '1. ',
  '2. ',
  '3. ',
].join('\n');

/**
 * 基准：用户点名要的日记样式（骨架一级、日程三段二级，ADR-0113 各级上提一级）。
 * frontmatter 两行脏字段保留旧真文件原样，用于验证 ADR-0112 决策 3 的规整口径：
 * 删 `title`（模板占位残留）、`date_creation` 填目标日期。
 */
const REFERENCE_DIARY =
  [
    '---',
    'card_type: 日记',
    'title: "电视剧.md"',
    'date_creation: 2025-11-06 23:11:89',
    '---',
    '',
    '# 睡眠相关',
    '- 起床时间：',
    '- 睡觉时间：',
    '- 睡眠情况：',
    '- 做梦情况：',
    '# 随笔',
    '',
    '# 新闻联播内容记录',
    '',
    '# 日常行为记录',
    '',
    '# 日程规划',
  ].join('\n') +
  '\n\n' +
  PLAN_BODY +
  '\n\n';

/** 基准文件在目标日期下的期望产物（只有 frontmatter 两处不同） */
function expectedFor(date: string): string {
  return REFERENCE_DIARY.replace(
    'title: "电视剧.md"\ndate_creation: 2025-11-06 23:11:89\n',
    `date_creation: ${date} 00:00:00\n`
  );
}

function pick(label: 'today' | 'tomorrow'): void {
  answerByLabel({ '为哪一天的日记创建日程规划？': label });
}

describe('planDiary / openPlanPicker', () => {
  it('选「明日」→ 明天文件与 2026-09-11.md 样式逐字节一致（frontmatter 按 Q3-B 规整）', async () => {
    setupVault({ [TEMPLATE_PATH]: TEMPLATE_FILE });
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('tomorrow');
    await openPlanPicker();
    expect(vault.files.get(`我的/日记/${tomorrow()}.md`)).toBe(expectedFor(tomorrow()));
    expect(hasNotice(`已在 ${tomorrow()} 日记中创建日程规划`)).toBe(true);
  });

  it('选「当日」→ 同一模板落盘在今天，明天文件不建', async () => {
    setupVault({ [TEMPLATE_PATH]: TEMPLATE_FILE });
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('today');
    await openPlanPicker();
    expect(vault.files.get(`我的/日记/${today()}.md`)).toBe(expectedFor(today()));
    expect(vault.files.has(`我的/日记/${tomorrow()}.md`)).toBe(false);
    expect(hasNotice(`已在 ${today()} 日记中创建日程规划`)).toBe(true);
  });

  it('取消（遮罩 / ESC）→ 不创建任何文件', async () => {
    setupVault({ [TEMPLATE_PATH]: TEMPLATE_FILE });
    mocks.dialog.mockResolvedValue(undefined);
    const { openPlanPicker } = await import('../../src/diary/daily');
    await openPlanPicker();
    expect(vault.files.has(`我的/日记/${today()}.md`)).toBe(false);
    expect(vault.files.has(`我的/日记/${tomorrow()}.md`)).toBe(false);
  });

  it('模板文件缺失 → 内置兜底骨架仍能建出同形文件', async () => {
    setupVault();
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('tomorrow');
    await openPlanPicker();
    const file = vault.files.get(`我的/日记/${tomorrow()}.md`)!;
    expect(file).toContain('# 睡眠相关');
    expect(file).toContain('# 新闻联播内容记录');
    expect(file).toContain('# 日程规划');
    expect(file).toContain('date_creation: ' + tomorrow() + ' 00:00:00');
    expect(file.endsWith(PLAN_BODY + '\n\n')).toBe(true);
  });

  it('目标文件已存在且原文已有日程规划 → 提示不重复创建，一个字节不写', async () => {
    const existing = expectedFor(today());
    setupVault({ [TEMPLATE_PATH]: TEMPLATE_FILE, [`我的/日记/${today()}.md`]: existing });
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('today');
    await openPlanPicker();
    expect(vault.files.get(`我的/日记/${today()}.md`)).toBe(existing);
    expect(vault.modifiedPaths).toHaveLength(0);
    expect(hasNotice(`当天（${today()}）已有日程规划，不再重复创建`)).toBe(true);
  });

  it('兼容（ADR-0113）：旧层级 `### 代办事项` + `### 完成情况跟踪` 仍判为已有规划，不重复创建', async () => {
    const existing =
      '---\ncard_type: 日记\n---\n\n## 日程规划\n\n### 代办事项\n- [ ] 旧\n\n### 完成情况跟踪\n| 计划完成 | 实际完成 |\n';
    setupVault({ [TEMPLATE_PATH]: TEMPLATE_FILE, [`我的/日记/${today()}.md`]: existing });
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('today');
    await openPlanPicker();
    expect(vault.files.get(`我的/日记/${today()}.md`)).toBe(existing);
    expect(vault.modifiedPaths).toHaveLength(0);
    expect(hasNotice(`当天（${today()}）已有日程规划，不再重复创建`)).toBe(true);
  });

  it('目标文件已存在但没有日程规划 → 末尾补一级标题 + 三段，原有内容一字不动', async () => {
    const src = '# 📖 08:00\n\n早读\n';
    setupVault({ [TEMPLATE_PATH]: TEMPLATE_FILE, [`我的/日记/${tomorrow()}.md`]: src });
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('tomorrow');
    await openPlanPicker();
    expect(vault.files.get(`我的/日记/${tomorrow()}.md`)).toBe(
      '# 📖 08:00\n\n早读\n\n# 日程规划\n\n' + PLAN_BODY + '\n\n'
    );
    expect(hasNotice(`已在 ${tomorrow()} 日记中补充日程规划`)).toBe(true);
  });

  it('兼容（ADR-0113）：旧文件已有 `## 日程规划` 标题但内容空 → 只补三段，标题不重复', async () => {
    setupVault({
      [TEMPLATE_PATH]: TEMPLATE_FILE,
      [`我的/日记/${today()}.md`]: '## 随笔\n\n## 日程规划',
    });
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('today');
    await openPlanPicker();
    const file = vault.files.get(`我的/日记/${today()}.md`)!;
    expect(file.match(/^## 日程规划$/gm)).toHaveLength(1);
    expect(file).toBe('## 随笔\n\n## 日程规划\n\n' + PLAN_BODY + '\n\n');
  });

  it('新层级文件已有 `# 日程规划` 标题但内容空 → 只补三段，标题不重复', async () => {
    setupVault({
      [TEMPLATE_PATH]: TEMPLATE_FILE,
      [`我的/日记/${today()}.md`]: '# 随笔\n\n# 日程规划',
    });
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('today');
    await openPlanPicker();
    const file = vault.files.get(`我的/日记/${today()}.md`)!;
    expect(file.match(/^# 日程规划$/gm)).toHaveLength(1);
    expect(file).toBe('# 随笔\n\n# 日程规划\n\n' + PLAN_BODY + '\n\n');
  });

  it('回归（ADR-0111）：只有「代办事项」小节（待办捕获写入的同名标记）不算已规划，仍补写', async () => {
    const src = '# 日常行为记录\n\n## 代办事项\n- [ ] 买牛奶-09:00\n';
    setupVault({ [TEMPLATE_PATH]: TEMPLATE_FILE, [`我的/日记/${today()}.md`]: src });
    const { openPlanPicker } = await import('../../src/diary/daily');
    pick('today');
    await openPlanPicker();
    expect(vault.files.get(`我的/日记/${today()}.md`)).toBe(
      src.replace(/\s+$/, '') + '\n\n# 日程规划\n\n' + PLAN_BODY + '\n\n'
    );
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
