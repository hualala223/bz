/**
 * 待办日记同步编排层测试（todo/diary-sync，ADR-0122，jsdom）：
 * - 顺延：历史未完成补进今天 `## 代办事项`（created 升序接续序号；已完成不投影；
 *   无号捕获行原样保留；文件缺失建档；重复运行去重）；
 * - 单向钩子：新增追加（序号续接）/ 勾选打钩退钩 / 改标题 / 删除 / 撤销恢复；
 * - 反向同步（vault modify → 面板）：日记打钩 → 面板完成；改行标题 → 面板标题；
 *   删行 → 面板条目删除（带撤销）；无号行/手动加行不联动；回声幂等（自身写入不反弹）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import moment from 'moment';
import { setApp } from '../../src/core/app';
import { setSettingsProvider, setSettingsSaver } from '../../src/core/settings-provider';
import { resetObsidianMocks, clearNotices, hasNotice } from '../mock-obsidian-entry';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetTodoState } from '../../src/todo/state';
import { ensureTodoDiarySync, unloadTodoDiarySync } from '../../src/todo/diary-sync';
import {
  syncItemAdded, syncItemChecked, syncItemDeleted, syncItemReAdded, syncItemTitle,
} from '../../src/todo/diary-sync';
import { TodoData } from '../../src/todo/data';
import type { TodoItem } from '../../src/todo/types';

const BASE_SETTINGS = {
  storagePath: 'CONFIG/STORAGE',
  memoScenarios: '',
  memoDefaultScene: '',
  cinemaFolderPath: '我的/影视',
};

function today(): string {
  return moment().format('YYYY-MM-DD');
}

function diaryKey(): string {
  return `我的/日记/${today()}.md`;
}

function item(extra: Partial<TodoItem>): TodoItem {
  return {
    id: 'x', title: '条目', scene: '剪藏', priority: 'minor', created: `${today()} 10:00:00`,
    completed: null, due: null, notePath: null, notePosition: null,
    scriptName: null, courseName: null, coursePath: null, linkedNote: null, url: null,
    ...extra,
  };
}

/** 清空微任务队列（串行队列多级 await） */
async function flushAll(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

/** 反向同步去抖 300ms + 队列链 */
async function flushDebounce(): Promise<void> {
  await flushAll();
  vi.advanceTimersByTime(350);
  await flushAll();
}

function setup(vaultItems: TodoItem[], diaryContent = '', settingsOverride = {}): MockVault {
  const vault = new MockVault();
  if (vaultItems.length) {
    vault.files.set('CONFIG/STORAGE/memo.json', JSON.stringify(vaultItems, null, 2));
  }
  if (diaryContent) vault.files.set(diaryKey(), diaryContent);
  const settings = { ...BASE_SETTINGS, ...settingsOverride };
  const app = mockAppWithVault(vault);
  setApp(app);
  setSettingsProvider(() => settings as any);
  setSettingsSaver(vi.fn(async () => {}));
  TodoData.init(settings as any);
  return vault;
}

beforeEach(() => {
  resetObsidianMocks();
  resetTodoState();
  clearNotices();
  document.body.innerHTML = '';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-13T12:00:00'));
});

afterEach(() => {
  unloadTodoDiarySync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function loadMemo(vault: MockVault): Promise<TodoItem[]> {
  return JSON.parse(vault.files.get('CONFIG/STORAGE/memo.json')!);
}

describe('顺延（启动/首开面板）', () => {
  it('历史未完成按 created 升序补进今天小节；已完成不投影；无号捕获行原样保留', async () => {
    const vault = setup(
      [
        item({ id: 'a', title: '老二', created: '2026-09-12 15:00:00' }),
        item({ id: 'b', title: '老大', created: '2026-09-12 09:00:00' }),
        item({ id: 'c', title: '已完成', created: '2026-09-12 08:00:00', completed: '2026-09-12 20:00:00' }),
      ],
      '## 睡眠相关\n- 起床：\n\n## 代办事项\n- [ ] 买菜-09:00\n\n# 日程规划\n'
    );
    const app = mockAppWithVault(vault);
    setApp(app);
    ensureTodoDiarySync(app);
    await flushAll();
    const out = vault.files.get(diaryKey())!;
    expect(out).toContain('- [ ] 1. 老大-09:00');
    expect(out).toContain('- [ ] 2. 老二-15:00');
    expect(out).not.toContain('已完成');
    expect(out).toContain('- [ ] 买菜-09:00'); // 无号捕获行原样不动
    expect(out.indexOf('- [ ] 买菜-09:00')).toBeLessThan(out.indexOf('- [ ] 1. 老大-09:00'));
    expect(out).toContain('## 睡眠相关');
    expect(out).toContain('# 日程规划');
  });

  it('手打编号行（无空格/无时间后缀）计入续号，插件行不与手打编号撞车', async () => {
    // 复刻 2026-09-13 实测缺陷：手打 1-10 后插件从 1 重新编号
    const vault = setup(
      [item({ id: 'a', title: 'B站视频', created: '2026-09-13 09:44:00' })],
      '## 代办事项\n- [x] 1.折腾股票做Tskills-08:20\n- [ ] 9.给添加代办事项添加自动添加序号功能\n- [ ] 10.给todo和添加代办事项打通\n'
    );
    const app = mockAppWithVault(vault);
    setApp(app);
    ensureTodoDiarySync(app);
    await flushAll();
    const out = vault.files.get(diaryKey())!;
    expect(out).toContain('- [ ] 11. B站视频-09:44'); // 接手打最大号 10 续号
    expect(out).not.toContain('- [ ] 1. B站视频');
  });

  it('今天日记文件缺失：建档「标记 + 空行 + 首行」', async () => {
    const vault = setup([item({ id: 'a', title: '任务', created: '2026-09-12 09:00:00' })]);
    const app = mockAppWithVault(vault);
    setApp(app);
    ensureTodoDiarySync(app);
    await flushAll();
    expect(vault.files.get(diaryKey())).toBe('## 代办事项\n\n- [ ] 1. 任务-09:00\n');
  });

  it('今天已有投影行的条目不重复补（去重）；序号接既有最大号', async () => {
    const vault = setup(
      [
        item({ id: 'a', title: '已在', created: '2026-09-13 09:00:00' }),
        item({ id: 'b', title: '新来', created: '2026-09-12 08:00:00' }),
      ],
      '## 代办事项\n- [ ] 3. 已在-09:00\n'
    );
    const app = mockAppWithVault(vault);
    setApp(app);
    ensureTodoDiarySync(app);
    await flushAll();
    const out = vault.files.get(diaryKey())!;
    expect(out).toContain('- [ ] 3. 已在-09:00');
    expect(out).toContain('- [ ] 4. 新来-08:00');
    expect((out.match(/已在/g) || []).length).toBe(1);
  });
});

describe('面板侧单向钩子', () => {
  async function seededVault(diary = '## 代办事项\n- [ ] 1. 老条-09:00\n') {
    const vault = setup([item({ id: 'a', title: '老条', created: `${today()} 09:00:00` })], diary);
    const app = mockAppWithVault(vault);
    setApp(app);
    ensureTodoDiarySync(app);
    await flushAll();
    return vault;
  }

  it('新增：序号接当天最大号', async () => {
    const vault = await seededVault();
    await syncItemAdded(item({ id: 'b', title: '新条', created: `${today()} 12:00:00` }));
    await flushAll();
    expect(vault.files.get(diaryKey())).toContain('- [ ] 2. 新条-12:00');
  });

  it('勾选/退钩', async () => {
    const vault = await seededVault();
    await syncItemChecked(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }), true);
    await flushAll();
    expect(vault.files.get(diaryKey())).toContain('- [x] 1. 老条-09:00');
    await syncItemChecked(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }), false);
    await flushAll();
    expect(vault.files.get(diaryKey())).toContain('- [ ] 1. 老条-09:00');
  });

  it('改标题保留序号与勾选态', async () => {
    const vault = await seededVault('## 代办事项\n- [x] 1. 老条-09:00\n');
    await syncItemTitle(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }), '改了名');
    await flushAll();
    expect(vault.files.get(diaryKey())).toContain('- [x] 1. 改了名-09:00');
  });

  it('删除投影行；撤销重写（行已删，序号从当下最大号重排）', async () => {
    const vault = await seededVault();
    await syncItemDeleted(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }));
    await flushAll();
    expect(vault.files.get(diaryKey())!.includes('老条')).toBe(false);
    await TodoData.restoreItem(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }));
    await syncItemReAdded(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }));
    await flushAll();
    expect(vault.files.get(diaryKey())).toContain('- [ ] 1. 老条-09:00');
  });
});

describe('反向同步（日记 → 面板）', () => {
  async function seededVault(diary: string) {
    const vault = setup([item({ id: 'a', title: '老条', created: `${today()} 09:00:00` })], diary);
    const app = mockAppWithVault(vault);
    setApp(app);
    ensureTodoDiarySync(app);
    await flushAll();
    return { vault, app };
  }

  it('日记手动打钩 → 面板条目标记完成；退钩 → 恢复', async () => {
    const { vault, app } = await seededVault('## 代办事项\n- [ ] 1. 老条-09:00\n');
    vault.files.set(diaryKey(), '## 代办事项\n- [x] 1. 老条-09:00\n');
    vault.emit('modify', vault.file(diaryKey()));
    await flushDebounce();
    expect((await loadMemo(vault))[0].completed).not.toBeNull();

    vault.files.set(diaryKey(), '## 代办事项\n- [ ] 1. 老条-09:00\n');
    vault.emit('modify', vault.file(diaryKey()));
    await flushDebounce();
    expect((await loadMemo(vault))[0].completed).toBeNull();
    void app;
  });

  it('日记改行标题 → 面板标题同步', async () => {
    const { vault } = await seededVault('## 代办事项\n- [ ] 1. 老条-09:00\n');
    vault.files.set(diaryKey(), '## 代办事项\n- [ ] 1. 新名字-09:00\n');
    vault.emit('modify', vault.file(diaryKey()));
    await flushDebounce();
    expect((await loadMemo(vault))[0].title).toBe('新名字');
  });

  it('删行 → 面板条目删除（带撤销通知）；撤销重写投影行', async () => {
    const { vault } = await seededVault('## 代办事项\n- [ ] 1. 老条-09:00\n');
    vault.files.set(diaryKey(), '## 代办事项\n');
    vault.emit('modify', vault.file(diaryKey()));
    await flushDebounce();
    expect((await loadMemo(vault)).length).toBe(0);
    expect(hasNotice(/已删除待办「老条」/)).toBe(true);

    // 模拟撤销：条目回写 + 重写投影行
    await TodoData.restoreItem(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }));
    await syncItemReAdded(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }));
    await flushAll();
    expect(vault.files.get(diaryKey())).toContain('- [ ] 1. 老条-09:00');
  });

  it('手动加行/无号行不联动面板；跨天首见只建快照不误删', async () => {
    const { vault } = await seededVault('## 代办事项\n- [ ] 1. 老条-09:00\n- [ ] 手动加的-10:00\n- [ ] 无号捕获行\n');
    vault.emit('modify', vault.file(diaryKey()));
    await flushDebounce();
    const memo = await loadMemo(vault);
    expect(memo.length).toBe(1);
    expect(memo[0].title).toBe('老条');
  });

  it('回声幂等：面板完成链路（memo 落盘 + 钩子写日记）后 emit modify，面板数据不再变动', async () => {
    const { vault } = await seededVault('## 代办事项\n- [ ] 1. 老条-09:00\n');
    // 真实链路两步：面板 completeItem → syncItemChecked（日记打钩 + 快照刷新）
    await TodoData.completeItem('a');
    await syncItemChecked(item({ id: 'a', title: '老条', created: `${today()} 09:00:00` }), true);
    await flushAll();
    const completedBefore = (await loadMemo(vault))[0].completed;
    expect(completedBefore).not.toBeNull();

    const diaryWrites = vault.modifiedPaths.filter((p) => p === diaryKey()).length;
    vault.emit('modify', vault.file(diaryKey()));
    await flushDebounce();
    expect((await loadMemo(vault))[0].completed).toBe(completedBefore); // 回声零动作
    expect(vault.modifiedPaths.filter((p) => p === diaryKey()).length).toBe(diaryWrites); // 不触发二次写
  });
});
