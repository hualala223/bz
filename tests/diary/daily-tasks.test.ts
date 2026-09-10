// @vitest-environment node
/**
 * 日常时间记录（diary/daily）数据层测试：
 * selectDueTasks 各分支（已问过跳过 / 未到时间跳过 / 全天任务不受限）、
 * 任务定义自洽、复盘模板与明日日程模板结构、状态文件路径沿用原 QuickAdd 脚本。
 */
import { describe, expect, it } from 'vitest';
import {
  DAILY_TASKS,
  PLAN_MARKER,
  REVIEW_TAG,
  REVIEW_TEMPLATE,
  TASK_STATUS_PATH,
  TASK_TIME_RESTRICTIONS,
  buildPlanContent,
  selectDueTasks,
} from '../../src/diary/daily';

const TODAY = '2026-09-10';

describe('selectDueTasks', () => {
  it('空状态 + 晚上：7 项任务全部待问', () => {
    const due = selectDueTasks({}, TODAY, 20);
    expect(due.map((t) => t.id)).toEqual(DAILY_TASKS.map((t) => t.id));
    expect(due).toHaveLength(7);
  });

  it('已记录的项跳过（true 与 false 均视为已问过）', () => {
    const status = { [TODAY]: { accounting: true, review: false } };
    const due = selectDueTasks(status, TODAY, 20);
    expect(due.map((t) => t.id)).not.toContain('accounting');
    expect(due.map((t) => t.id)).not.toContain('review');
    expect(due).toHaveLength(5);
  });

  it('早上：受时间限制的任务不出（accounting≥12、其余≥16），全天任务照出', () => {
    const due = selectDueTasks({}, TODAY, 8).map((t) => t.id);
    // 仅 review / reading 无时间限制
    expect(due).toEqual(['review', 'reading']);
  });

  it('时间边界：12 点整 accounting 出现，11 点不出现', () => {
    expect(selectDueTasks({}, TODAY, 11).map((t) => t.id)).not.toContain('accounting');
    expect(selectDueTasks({}, TODAY, 12).map((t) => t.id)).toContain('accounting');
  });

  it('16 点：日记/工作梳理/复习单词/复习索引加入', () => {
    const at15 = selectDueTasks({}, TODAY, 15).map((t) => t.id);
    const at16 = selectDueTasks({}, TODAY, 16).map((t) => t.id);
    for (const id of ['diary', 'work_summary', 'review_words', 'review_index']) {
      expect(at15).not.toContain(id);
      expect(at16).toContain(id);
    }
  });

  it('只看今天那一段：其他日期的状态不影响', () => {
    const status = { '2026-09-09': { accounting: true, review: true, reading: true } };
    expect(selectDueTasks(status, TODAY, 20)).toHaveLength(7);
  });

  it('今天全记完 → 无待问任务', () => {
    const status: Record<string, Record<string, boolean>> = { [TODAY]: {} };
    for (const t of DAILY_TASKS) status[TODAY][t.id] = true;
    expect(selectDueTasks(status, TODAY, 20)).toEqual([]);
  });
});

describe('任务定义', () => {
  it('7 项、id 唯一、完成选项都出自可选项', () => {
    expect(DAILY_TASKS).toHaveLength(7);
    const ids = DAILY_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of DAILY_TASKS) {
      expect(t.options.length).toBeGreaterThan(0);
      for (const c of t.completedOptions) expect(t.options).toContain(c);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it('时间限制表只收录已定义的任务 id', () => {
    const ids = new Set(DAILY_TASKS.map((t) => t.id));
    for (const id of Object.keys(TASK_TIME_RESTRICTIONS)) expect(ids.has(id)).toBe(true);
  });

  it('状态文件路径沿用原 QuickAdd 脚本（旧数据直接续用）', () => {
    expect(TASK_STATUS_PATH).toBe('CONFIG/SCRIPTS/每日任务状态.json');
  });
});

describe('模板', () => {
  it('复盘模板：当日复盘 + 触动点三问', () => {
    expect(REVIEW_TEMPLATE.startsWith('## 当日复盘')).toBe(true);
    expect(REVIEW_TEMPLATE).toContain('### 触动点');
    expect(REVIEW_TEMPLATE).toContain('#### 描述经过（具体场景）');
    expect(REVIEW_TEMPLATE).toContain('#### 分析原因（why→启发）');
    expect(REVIEW_TEMPLATE).toContain('#### 改进措施（提炼认知点或行动点）');
    expect(REVIEW_TAG).toBe('复盘');
  });

  it('明日日程模板：代办事项/完成情况跟踪/备注 三段齐全', () => {
    const content = buildPlanContent();
    expect(content).toContain(PLAN_MARKER);
    expect(content).toContain('### 完成情况跟踪');
    expect(content).toContain('| 计划完成 | 实际完成 |');
    expect(content).toContain('### 备注');
    // 顺序：代办 → 跟踪 → 备注
    expect(content.indexOf(PLAN_MARKER)).toBeLessThan(content.indexOf('### 完成情况跟踪'));
    expect(content.indexOf('### 完成情况跟踪')).toBeLessThan(content.indexOf('### 备注'));
  });
});
