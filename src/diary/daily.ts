/**
 * 日常时间记录（自 CONFIG/SCRIPTS/日常时间记录 三个 QuickAdd 宏整合进 diary 域）：
 * 1. runTaskCheck —— 当天任务完成情况：7 项每日任务经流程框依次打勾，
 *    状态沿用原 CONFIG/SCRIPTS/每日任务状态.json（格式不变，旧数据直接续用）；
 * 2. openReviewDialog —— 每日复盘：复盘模板作为日记条目写入（写日记弹窗预填）；
 * 3. planTomorrow —— 日程规划：为明天创建含代办事项/完成情况跟踪/备注的日记条目。
 * 追加式写文件在 diary 条目模型下会被整文件重写覆盖，故一律走 addEntry 条目链路。
 */
import { moment } from 'obsidian';
import { notice } from '../core/notice';
import { openFlowDialog } from '../core/flow-dialog';
import { jsonFileStore, updateFileSections } from '../core/storage';
import { addEntry, loadAll } from './store';
import { diaryDataMap } from './state';
import { createAddDialog, openAddDialog } from './ui/dialogs';

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

/** 复盘模板正文（结构沿用原 QuickAdd 宏「## 当日复盘」段落） */
export const REVIEW_TEMPLATE = [
  '## 当日复盘',
  '### 触动点',
  '#### 描述经过（具体场景）',
  '- ',
  '#### 分析原因（why→启发）',
  '- ',
  '#### 改进措施（提炼认知点或行动点）',
  '- ',
].join('\n');

/** 每日复盘：打开写日记弹窗，预选「复盘」标签并预填模板正文，走既有保存链路 */
export function openReviewDialog(): void {
  if (!document.getElementById('add-diary-mask')) createAddDialog();
  openAddDialog({ tags: [REVIEW_TAG], content: REVIEW_TEMPLATE });
}

// ===== 日程规划（明日日记） =====

/** 明日日程规划正文标记（重复创建检测用） */
export const PLAN_MARKER = '### 代办事项';

/** 明日日程规划条目正文（三段结构沿用原 QuickAdd 宏） */
export function buildPlanContent(): string {
  return [
    '### 代办事项',
    '- [ ] ',
    '- [ ] ',
    '- [ ] ',
    '',
    '### 完成情况跟踪',
    '| 计划完成 | 实际完成 |',
    '| -------- | -------- |',
    '|  |  |',
    '|  |  |',
    '|  |  |',
    '',
    '### 备注',
    '1. ',
    '2. ',
    '3. ',
  ].join('\n');
}

/**
 * 日程规划：为明天创建含日程模板的日记条目。
 * 条目模型整文件重写，写入前必须保证该日期内存数据完整——面板未加载过时先 loadAll。
 */
export async function planTomorrow(): Promise<void> {
  const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
  try {
    if (!diaryDataMap) await loadAll();
  } catch (e) {
    console.error('日记数据加载失败', e);
    notice('日记数据加载失败，无法创建日程规划', 'error');
    return;
  }

  const existing = diaryDataMap?.get(tomorrow) ?? [];
  if (existing.some((e) => e.content.includes(PLAN_MARKER))) {
    notice(`明天（${tomorrow}）已有日程规划，不再重复创建`);
    return;
  }

  try {
    await addEntry(tomorrow, moment().format('HH:mm'), ['日记'], buildPlanContent());
    notice(`已在 ${tomorrow} 日记中创建日程规划`, 'success');
  } catch (e: any) {
    console.error('创建日程规划失败', e);
    notice('创建日程规划失败：' + (e?.message || e), 'error');
  }
}
