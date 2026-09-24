// @vitest-environment node
/**
 * 计划卡测试（外部插件 PlanFlow 只读接入，ADR-0132/票 304）：
 * parsePlanCheckins 纯解析（小节边界/复选状态/非任务行忽略）+ riverCountText plan 分支
 * + DOMAINS/DOMAIN_MENU 卡面与命令 id + collectRiver 集成（MockVault：有数据/无文件/不建文件）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { collectRiver, riverCountText, EMPTY_COUNTS, dateStrOf } from '../../src/home/river';
import { parsePlanCheckins, DOMAINS, DOMAIN_MENU, DOMAIN_MAP } from '../../src/home/shared';

const NOW = new Date(2026, 8, 24, 12, 50).getTime(); // 2026-09-24

/** planflow 每日笔记真实形态（按 planflow 代码内模板；行含 emoji/标签/日期后缀） */
const PLAN_DAILY = [
  '---',
  'date: 2026-09-24',
  'type: daily',
  '---',
  '# 📅 2026-09-24 星期四',
  '',
  '## ✅ 今日打卡',
  '- [ ] 📈 复盘 复盘+次日计划 → [[2026-09-24 复盘]] #计划/复盘 🛫 2026-09-24 📅 2026-09-24',
  '- [x] 📖 阅读 #计划/阅读 🛫 2026-09-24 📅 2026-09-24',
  '- [x] 🗣️ 笔记复习 #计划/笔记复习 🛫 2026-09-24 📅 2026-09-24',
  '',
  '## 📝 今日总结',
  '测试1',
].join('\n');

const planPath = (date: string) => `CONFIG/计划/计划2026/每日/${date}.md`;

describe('parsePlanCheckins（纯解析）', () => {
  it('真实形态：3 行任务 2 勾 1 未勾', () => {
    expect(parsePlanCheckins(PLAN_DAILY)).toEqual({ done: 2, total: 3 });
  });

  it('小节不存在 → {0,0}', () => {
    expect(parsePlanCheckins('# 📅 2026-09-24\n\n## 📝 今日总结\nx')).toEqual({ done: 0, total: 0 });
    expect(parsePlanCheckins('')).toEqual({ done: 0, total: 0 });
  });

  it('小节内非任务行忽略；小节边界=下一个任意级标题', () => {
    const md = [
      '## ✅ 今日打卡',
      '- [x] A',
      '普通文本行不算',
      '* [X] B',
      '  - [ ] C',
      '### 子标题截断',
      '- [x] D',
      '',
      '# 尾注',
    ].join('\n');
    expect(parsePlanCheckins(md)).toEqual({ done: 2, total: 3 });
  });

  it('空小节（标题后直接下一个标题）→ {0,0}', () => {
    expect(parsePlanCheckins('## ✅ 今日打卡\n## 📝 今日总结')).toEqual({ done: 0, total: 0 });
  });
});

describe('riverCountText plan 分支', () => {
  const data = (over: Partial<{ planDone: number; planTotal: number }> = {}) => {
    const emptyDay = (ds: string) => ({ dateStr: ds, events: [], summary: { diary: 0, movies: 0, books: 0, todoDone: 0, todoCreated: 0, pomodoros: 0, pomodoroMinutes: 0 }, firstTs: null });
    return {
      today: emptyDay('x'), yesterday: emptyDay('x'), days: [], week: [],
      streak: { diaryStreak: 0, diaryWrittenToday: false },
      counts: { ...EMPTY_COUNTS, ...over },
      collectRecent: [],
      pomodoroFocusing: false,
    } as Parameters<typeof riverCountText>[1];
  };

  it('有数据 → 今日打卡 N/M；总数 0 → null（回落域副题）', () => {
    expect(riverCountText('plan', data({ planDone: 2, planTotal: 3 }))).toBe('今日打卡 2/3');
    expect(riverCountText('plan', data({ planDone: 0, planTotal: 0 }))).toBeNull();
    expect(riverCountText('plan', data({ planDone: 3, planTotal: 3 }))).toBe('今日打卡 3/3');
  });
});

describe('DOMAINS / DOMAIN_MENU 计划卡（ADR-0132）', () => {
  it('DOMAINS 含 plan 卡：外部命令 id、图标入表', () => {
    const d = DOMAIN_MAP.get('plan');
    expect(d).toBeDefined();
    expect(d!.commandId).toBe('planflow:open-planboard');
    expect(d!.name).toBe('计划');
    expect(d!.icon).toBeTruthy();
  });

  it('DOMAIN_MENU.plan 挂「打开计划总览」1 条（Q6(b)）', () => {
    expect(DOMAIN_MENU.plan).toEqual([
      { label: '打开计划总览', commandId: 'planflow:open-planboard', icon: 'target' },
    ]);
  });
});

describe('collectRiver 计划卡采集（MockVault 集成）', () => {
  let vault: MockVault;

  beforeEach(() => {
    vault = new MockVault();
    setApp(mockAppWithVault(vault) as never);
    setSettingsProvider({ ...DEFAULT_SETTINGS } as never);
  });

  it('每日笔记在 → 计数采集成功', async () => {
    vault.files.set(planPath(dateStrOf(NOW)), PLAN_DAILY);
    const app = mockAppWithVault(vault);
    setApp(app as never);
    const r = await collectRiver(app as never, NOW);
    expect(r.counts.planDone).toBe(2);
    expect(r.counts.planTotal).toBe(3);
  });

  it('每日笔记缺失 → 计数留 0 且不建文件（只读契约）', async () => {
    const r = await collectRiver({} as never, NOW);
    expect(r.counts.planDone).toBe(0);
    expect(r.counts.planTotal).toBe(0);
    expect(vault.files.has(planPath(dateStrOf(NOW)))).toBe(false);
  });

  it('文件内容非 planflow 格式（解析无小节）→ 计数留 0', async () => {
    vault.files.set(planPath(dateStrOf(NOW)), '# 随手记\n- [x] 与 planflow 无关的行');
    const r = await collectRiver({} as never, NOW);
    expect(r.counts.planTotal).toBe(0);
  });
});
