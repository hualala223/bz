/**
 * 日常时间记录（自 CONFIG/SCRIPTS/日常时间记录 三个 QuickAdd 宏整合进 diary 域）：
 * 1. runTaskCheck —— 当天任务完成情况：7 项每日任务经流程框依次打勾，
 *    状态沿用原 CONFIG/SCRIPTS/每日任务状态.json（格式不变，旧数据直接续用）；
 * 2. openReviewDialog —— 每日复盘：预填内层模板，写入 `# 当日复盘` 小节（缺失则写时新建，
 *    块首行为 `## 🪞 HH:mm`，ADR-0114）；
 * 3. openPlanPicker —— 日程规划：先选「当日 / 明日」，再按日记模板
 *    （CONFIG/TEMPLATE/模板-日记.md，与 QuickAdd 宏同源）为该日期新建日记文件并补
 *    代办事项/完成情况跟踪/备注三段；两目标共用同一模板，只有落盘日期不同（ADR-0112）。
 *    标题层级自 ADR-0113 起整体上提一级（骨架 `#`、日程三段 `##`）；读侧（判重 / 补写 /
 *    捕获插行）同时认旧层级，旧日记文件不受影响。
 * 写盘口径分两路：任务状态走 updateFileSections 段级合并；目录/规划按原文读写（文件级原样），
 * 不走 addEntry 条目链路——条目模型整文件重写产不出「模板骨架」形态的文件。
 * 复盘/写日记的落点同上，见 daily-write.ts（ADR-0114）。
 */
import { moment } from 'obsidian';
import { notice } from '../core/notice';
import { openFlowDialog } from '../core/flow-dialog';
import { enqueueFileTask, jsonFileStore, updateFileSections } from '../core/storage';
import { DIARY_DIRECTORY } from './config';
import { getApp } from './app';
import { createAddDialog, openAddDialog } from './ui/dialogs';
import { REVIEW_HEADING } from './daily-write';

// ===== 当天任务完成情况 =====

/** 任务状态存储路径（沿用原 QuickAdd 脚本的文件与格式，铁律 1：旧数据直接可读） */
export const TASK_STATUS_PATH = 'CONFIG/SCRIPTS/每日任务状态.json';

export interface DailyTaskDef {
  id: string;
  label: string;
  /** 可选项（顺序即弹出顺序） */
  options: string[];
  /** 视为「已完成」的选项 */
  completedOptions: string[];
}

/** 7 项每日任务（顺序即弹出顺序，与原脚本一致） */
export const DAILY_TASKS: DailyTaskDef[] = [
  { id: 'accounting', label: '今天记账了没？', options: ['不需要记', '待记', '已记'], completedOptions: ['不需要记', '已记'] },
  { id: 'review', label: '今天复习了没？', options: ['尚未', '已进行'], completedOptions: ['已进行'] },
  { id: 'diary', label: '今天写日记了没？', options: ['尚未', '已进行'], completedOptions: ['已进行'] },
  { id: 'reading', label: '今天阅读了没？', options: ['尚未', '已进行'], completedOptions: ['已进行'] },
  { id: 'work_summary', label: '今天梳理全部工作内容没？', options: ['尚未', '已进行'], completedOptions: ['已进行'] },
  { id: 'review_words', label: '今天复习单词没？', options: ['尚未', '已进行'], completedOptions: ['已进行'] },
  { id: 'review_index', label: '今天复习索引没？', options: ['尚未', '已进行'], completedOptions: ['已进行'] },
];

/** 各任务最早可打勾的小时数（24 小时制；不在表内 = 全天可问，与原脚本一致） */
export const TASK_TIME_RESTRICTIONS: Record<string, number> = {
  accounting: 12,
  diary: 16,
  work_summary: 16,
  review_words: 16,
  review_index: 16,
};

export type TaskStatusData = Record<string, Record<string, boolean>>;

function taskStatusStore() {
  return jsonFileStore<TaskStatusData>(TASK_STATUS_PATH, { defaultValue: {} });
}

/**
 * 纯函数（node 可测）：从状态库筛出本次要问的任务——
 * 今天已记录（true/false 均算已问过）的跳过；未到时间限制的跳过。
 */
export function selectDueTasks(
  status: TaskStatusData,
  today: string,
  hour: number
): DailyTaskDef[] {
  const todayStatus = status[today] || {};
  return DAILY_TASKS.filter((task) => {
    if (todayStatus[task.id] !== undefined) return false;
    const limitHour = TASK_TIME_RESTRICTIONS[task.id];
    if (limitHour !== undefined && hour < limitHour) return false;
    return true;
  });
}

/** 逐项弹流程框收集回答；取消（ESC/遮罩）视为跳过该项不计入（与原 suggester 行为一致） */
async function collectAnswers(
  tasks: DailyTaskDef[]
): Promise<Record<string, boolean>> {
  const answers: Record<string, boolean> = {};
  for (const task of tasks) {
    const chosen = await openFlowDialog({
      title: '当天任务完成情况',
      message: task.label,
      actions: task.options.map((opt, i) => ({
        label: opt,
        value: opt,
        cta: i === task.options.length - 1,
      })),
    });
    if (chosen === undefined) continue;
    answers[task.id] = task.completedOptions.includes(chosen);
  }
  return answers;
}

/**
 * 当天任务完成情况主流程：筛出待问任务 → 逐项打勾 → 段级合并写回状态文件
 * （updateFileSections：只写今天一段，其他日期/其他写方段落不动）。
 */
export async function runTaskCheck(): Promise<void> {
  const today = moment().format('YYYY-MM-DD');
  const hour = moment().hour();
  let due: DailyTaskDef[];
  try {
    const status = await taskStatusStore().read();
    due = selectDueTasks(status, today, hour);
  } catch (e) {
    console.error('读取每日任务状态失败', e);
    notice('读取任务状态失败，请检查权限', 'error');
    return;
  }

  if (due.length === 0) {
    notice('今天没有待确认的任务');
    return;
  }

  const answers = await collectAnswers(due);
  if (Object.keys(answers).length === 0) return;

  try {
    await updateFileSections<TaskStatusData>(TASK_STATUS_PATH, (current) => {
      const todayStatus = { ...(current[today] || {}) };
      for (const [id, done] of Object.entries(answers)) {
        todayStatus[id] = done;
      }
      return { [today]: todayStatus };
    }, { defaultValue: {} });
    const doneCount = Object.values(answers).filter(Boolean).length;
    notice(`已记录 ${Object.keys(answers).length} 项任务（完成 ${doneCount} 项）`, 'success');
  } catch (e) {
    console.error('保存每日任务状态失败', e);
    notice('保存任务状态失败，请检查权限', 'error');
  }
}

// ===== 每日复盘 =====

/** 复盘条目标签（DEFAULT_TAGS_CONFIG 内置同名标签，emoji 🪞） */
export const REVIEW_TAG = '复盘';

/**
 * 复盘模板正文（结构沿用原 QuickAdd 宏「当日复盘」段落）。
 * 自 ADR-0114 起**不含**首行小节名：块落在 `# 当日复盘` 小节内，小节名由落点提供
 * （写时缺失才建），若模板再带一行就会在文件里出现两个「当日复盘」标题。
 * 块首行的时间分隔标题由 daily-write 的 buildEntryTitle 生成（`## 🪞 HH:mm`）。
 */
export const REVIEW_TEMPLATE = [
  '### 触动点',
  '#### 描述经过（具体场景）',
  '- ',
  '#### 分析原因（why→启发）',
  '- ',
  '#### 改进措施（提炼认知点或行动点）',
  '- ',
].join('\n');

/**
 * 每日复盘：打开写日记弹窗，预选「复盘」标签并预填内层模板，
 * 落点指定 `# 当日复盘` 小节（缺失则写时新建）——不再走条目模型（ADR-0114）。
 */
export function openReviewDialog(): void {
  if (!document.getElementById('add-diary-mask')) createAddDialog();
  openAddDialog({ tags: [REVIEW_TAG], content: REVIEW_TEMPLATE, section: REVIEW_HEADING });
}

// ===== 日程规划（当日 / 明日） =====

/** 日程规划正文标记（重复创建检测用之一；层级随 ADR-0113 提为 `##`，判重不看层级） */
export const PLAN_MARKER = '## 代办事项';

/**
 * 重复检测第二个标记：须与 PLAN_MARKER 同时命中才算「已有日程规划」。
 * 单看 PLAN_MARKER 会被「当日待办事项」捕获行误伤——daily-capture 的 TODO_HEADING
 * 与它同标题，当天用过待办捕获的日记会被判成已规划而跳过（ADR-0111）。
 */
export const PLAN_TRACK_MARKER = '## 完成情况跟踪';

/** 日程规划目标：当日 = 今天，明日 = 明天 */
export type PlanTarget = 'today' | 'tomorrow';

/** 日程规划条目正文（三段结构沿用原 QuickAdd 宏；当日 / 明日共用同一模板，只有落盘日期不同） */
export function buildPlanContent(): string {
  return [
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
}

/** 纯函数（node 可测）：目标 → 日记日期 YYYY-MM-DD */
export function planDate(
  target: PlanTarget,
  now: ReturnType<typeof moment> = moment()
): string {
  return (target === 'tomorrow' ? now.clone().add(1, 'day') : now.clone()).format('YYYY-MM-DD');
}

/** 纯函数：目标 → 通知文案里的日期称谓 */
export function planDateLabel(target: PlanTarget): string {
  return target === 'tomorrow' ? '明天' : '当天';
}

/** 日程规划小节标题（模板形态文件由模板提供；追加补写时缺失才补；ADR-0113 起为一级） */
export const PLAN_HEADING = '# 日程规划';

/**
 * 标题行匹配（整行、任意层级）：`hasPlan` / 补写判定的统一口径。
 * 层级用 `#{1,6}` 通配 = ADR-0113 的兼容承诺：旧日记里的 `### 代办事项` / `## 日程规划`
 * 与新层级产物一样被认出，不因层级改动而重复创建或重复插标题。
 */
function headingLineRe(text: string): RegExp {
  return new RegExp(`^#{1,6}[ \\t]+${text}[ \\t]*$`, 'm');
}

/** 日记模板真源路径（与 QuickAdd 宏「日程规划.js」同源：宏读它、插件也读它，ADR-0112） */
export const DIARY_TEMPLATE_PATH = 'CONFIG/TEMPLATE/模板-日记.md';

/**
 * 模板文件缺失时的内置兜底骨架（正文与模板文件同构）。
 * 正常路径一律以模板文件为真源——用户改模板文件，宏与插件同步跟随，不产生第二份真源。
 */
export const FALLBACK_DIARY_TEMPLATE = [
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

/** frontmatter 块匹配（首行 `---` 到下一个 `---`） */
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

/**
 * 纯函数（node 可测）：模板原文 + 目标日期 → 待落盘的新日记全文。
 * 拼装与 QuickAdd 宏「日程规划.js」逐字等价：`模板原文 + "\n" + 日程三段块`；
 * 差异只在 frontmatter 规整（ADR-0112 决策 3）：删 `title`（模板占位残留）、
 * `date_creation` 改写为 `{目标日期} 00:00:00`，缺失则补一行。
 */
export function buildDiaryFileContent(template: string, date: string): string {
  const src = template.replace(/\r\n?/g, '\n');
  const m = src.match(FRONTMATTER_RE);
  let body = src;
  if (m) {
    const fmLines = m[1].split('\n').filter((l) => !/^\s*title\s*:/.test(l));
    let filled = false;
    const normalized = fmLines.map((l) => {
      if (!/^\s*date_creation\s*:/.test(l)) return l;
      filled = true;
      return `date_creation: ${date} 00:00:00`;
    });
    if (!filled) normalized.push(`date_creation: ${date} 00:00:00`);
    // 正文接缝收敛为恰一个空行（原模板为 `---\n\n# 睡眠相关`），避免多出空行
    const rest = src.slice(m[0].length).replace(/^\n+/, '\n');
    body = ['---', ...normalized, '---', rest].join('\n');
  }
  return body.replace(/\s+$/, '') + '\n\n' + buildPlanContent() + '\n\n';
}

/**
 * 纯函数（node 可测）：把日程规划补进**已存在**的日记原文（不新建文件，其余内容一字不动）。
 * 已有「日程规划」标题（任意层级，兼容旧文件的 `##`）→ 只补三段；没有 → 先补标题再补三段。
 */
export function appendPlanToDiary(content: string): string {
  const src = content.replace(/\r\n?/g, '\n');
  const hasHeading = headingLineRe('日程规划').test(src);
  return (
    src.replace(/\s+$/, '') +
    '\n\n' +
    (hasHeading ? '' : PLAN_HEADING + '\n\n') +
    buildPlanContent() +
    '\n\n'
  );
}

/** 纯函数（node 可测）：日记**原文**里是否已有日程规划（双标记同时命中，ADR-0111；层级无关，ADR-0113） */
export function hasPlan(text: string): boolean {
  const src = text.replace(/\r\n?/g, '\n');
  return headingLineRe('代办事项').test(src) && headingLineRe('完成情况跟踪').test(src);
}

/** 读模板文件原文；读不到（缺失/不可读）→ 内置兜底骨架（不阻断创建） */
async function readDiaryTemplate(app: any): Promise<string> {
  const f: any = app?.vault?.getAbstractFileByPath?.(DIARY_TEMPLATE_PATH) ?? null;
  if (f) {
    try {
      const text = await app.vault.read(f);
      if (typeof text === 'string' && text.trim()) return text;
    } catch {
      /* 落到内置兜底 */
    }
  }
  console.warn(`日记模板 ${DIARY_TEMPLATE_PATH} 不可读，改用内置骨架`);
  return FALLBACK_DIARY_TEMPLATE;
}

/** 目标目录缺失逐段创建（与 daily-capture 同口径，失败交写入阶段兜底报错） */
async function ensureDiaryFolder(app: any): Promise<void> {
  let cur = '';
  for (const p of DIARY_DIRECTORY.split('/')) {
    cur = cur ? `${cur}/${p}` : p;
    if (app?.vault?.getAbstractFileByPath?.(cur)) continue;
    try {
      await app.vault.createFolder(cur);
    } catch {
      /* 已存在/无权限：由写入阶段兜底 */
    }
  }
}

/**
 * 日程规划落盘（ADR-0112）：**按日记模板建文件**，与 QuickAdd 宏「日程规划.js」同产物形态。
 * - 目标日期文件不存在 → 读模板（缺失用内置兜底）→ 模板 + 日程三段 → 新建文件；
 * - 文件已存在且原文已有日程规划（双标记）→ 提示不重复创建，一个字节不写；
 * - 文件已存在但没有日程规划 → 只补 `# 日程规划` + 三段，其余内容一字不动。
 * 不走 addEntry 条目链路：条目模型整文件重写无法产出「模板骨架」形态的文件。
 * 写盘走 core/storage 同路径串行队列（键 = 日记文件路径），与 diary store writeFile 互斥。
 */
export async function planDiary(target: PlanTarget): Promise<void> {
  const date = planDate(target);
  const label = planDateLabel(target);
  const app = getApp();
  const path = `${DIARY_DIRECTORY}/${date}.md`;

  try {
    await ensureDiaryFolder(app);
    const outcome = await enqueueFileTask(path, async () => {
      const f: any = app.vault.getAbstractFileByPath(path) ?? null;
      let existing: string | null = null;
      if (f) {
        try {
          existing = await app.vault.read(f);
        } catch {
          existing = null;
        }
      }

      if (existing !== null && hasPlan(existing)) return 'exists' as const;

      const next =
        existing === null
          ? buildDiaryFileContent(await readDiaryTemplate(app), date)
          : appendPlanToDiary(existing);
      if (f) await app.vault.modify(f, next);
      else await app.vault.create(path, next);
      return existing === null ? ('created' as const) : ('appended' as const);
    });

    if (outcome === 'exists') {
      notice(`${label}（${date}）已有日程规划，不再重复创建`);
    } else if (outcome === 'appended') {
      notice(`已在 ${date} 日记中补充日程规划`, 'success');
    } else {
      notice(`已在 ${date} 日记中创建日程规划`, 'success');
    }
  } catch (e: any) {
    console.error('创建日程规划失败', e);
    notice('创建日程规划失败：' + (e?.message || e), 'error');
  }
}

/**
 * 日程规划入口：先弹流程框选「当日 / 明日」，再为选中日期创建规划。
 * 两动作流程框默认聚焦最后一个动作（= 明日），回车即旧行为；
 * 遮罩点击 / ESC 按取消语义 resolve undefined → 不创建任何条目。
 */
export async function openPlanPicker(): Promise<void> {
  const chosen = await openFlowDialog({
    title: '日程规划',
    message: '为哪一天的日记创建日程规划？',
    actions: [
      { label: '当日', value: 'today' },
      { label: '明日', value: 'tomorrow' },
    ],
  });
  if (chosen !== 'today' && chosen !== 'tomorrow') return;
  await planDiary(chosen);
}
