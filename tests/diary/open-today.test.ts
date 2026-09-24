/**
 * 打开今日日记（票 303）测试：
 * - todayDiaryPath：路径口径 {日记目录}/{YYYY-MM-DD}.md，目录随设置（applyDirectories）；
 * - openTodayDiary：缺失按模板建档后打开（与 planDiary 同链路，模板缺失走内置兜底）；
 *   已存在原样打开一个字节不写；打开走 workspace.openLinkText；
 * - ensureDiaryEditorMenu：editor-menu 挂「打开今日日记」，点击与命令同一执行函数。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { moment } from 'obsidian';
import { setApp as setCoreApp } from '../../src/core/app';
import { setApp } from '../../src/diary/app';
import { applyDirectories, resetTagsConfig } from '../../src/diary/config';
import { setDiaryDataMap, state } from '../../src/diary/state';
import { DIARY_TEMPLATE_PATH, FALLBACK_DIARY_TEMPLATE } from '../../src/diary/daily';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { clearNotices, hasNotice } from '../mock-obsidian-entry';

const TEMPLATE_PATH = DIARY_TEMPLATE_PATH;

/** 迷你模板（骨架一级 + 日程段；足以验证建档链路与 frontmatter 规整） */
const TEMPLATE_FILE = [
  '---',
  'card_type: 日记',
  'title: "模板占位.md"',
  '---',
  '',
  '# 睡眠相关',
  '',
  '# 随笔',
  '',
  '# 新闻联播内容记录',
  '',
  '# 日程规划',
].join('\n');

let vault: MockVault;
let opened: string[];

/** 建 mock app（workspace.openLinkText 换成可断言的收集器）并注入双 app 单例 */
function setup(files: Record<string, string> = {}): any {
  vault = new MockVault();
  for (const [p, c] of Object.entries(files)) vault.files.set(p, c);
  const app = mockAppWithVault(vault);
  opened = [];
  (app.workspace as any).openLinkText = async (link: string) => {
    opened.push(link);
  };
  setApp(app);
  setCoreApp(app as any);
  return app;
}

function today(): string {
  return moment().format('YYYY-MM-DD');
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
  // 固定日期消除用例抖动（与 daily-flow.test.ts 同口径）
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T20:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('todayDiaryPath', () => {
  it('路径口径 {日记目录}/{YYYY-MM-DD}.md', async () => {
    const { todayDiaryPath } = await import('../../src/diary/daily');
    expect(todayDiaryPath()).toBe('我的/日记/2026-09-10.md');
  });

  it('目录随设置（applyDirectories）跟随', async () => {
    applyDirectories({ diaryDirectory: '日记/备份' });
    const { todayDiaryPath } = await import('../../src/diary/daily');
    expect(todayDiaryPath()).toBe('日记/备份/2026-09-10.md');
    applyDirectories({});
  });
});

describe('openTodayDiary', () => {
  it('文件不存在 → 按模板建档后打开，frontmatter 规整（删 title、date_creation 填今日）', async () => {
    setup({ [TEMPLATE_PATH]: TEMPLATE_FILE });
    const { openTodayDiary } = await import('../../src/diary/daily');
    await openTodayDiary();
    const path = `我的/日记/${today()}.md`;
    const file = vault.files.get(path)!;
    expect(file).toContain('# 睡眠相关');
    expect(file).toContain('# 日程规划');
    expect(file).not.toContain('title: "模板占位.md"');
    expect(file).toContain(`date_creation: ${today()} 00:00:00`);
    expect(opened).toEqual([path]);
    expect(hasNotice(`已创建并打开今日日记（${path}）`)).toBe(true);
  });

  it('文件已存在 → 原样打开一个字节不写，无建档通知', async () => {
    const existing = '---\ncard_type: 日记\n---\n\n# 睡眠相关\n- 起床时间：7 点\n';
    setup({ [TEMPLATE_PATH]: TEMPLATE_FILE, [`我的/日记/${today()}.md`]: existing });
    const { openTodayDiary } = await import('../../src/diary/daily');
    await openTodayDiary();
    expect(vault.files.get(`我的/日记/${today()}.md`)).toBe(existing);
    expect(vault.modifiedPaths).toHaveLength(0);
    expect(opened).toEqual([`我的/日记/${today()}.md`]);
    expect(hasNotice('已创建并打开今日日记')).toBe(false);
  });

  it('模板文件缺失 → 内置兜底骨架仍能建档', async () => {
    setup();
    const { openTodayDiary } = await import('../../src/diary/daily');
    await openTodayDiary();
    const file = vault.files.get(`我的/日记/${today()}.md`)!;
    for (const line of FALLBACK_DIARY_TEMPLATE.split('\n').filter((l) => l.startsWith('# '))) {
      expect(file).toContain(line);
    }
    expect(file).toContain(`date_creation: ${today()} 00:00:00`);
    expect(opened).toHaveLength(1);
  });
});

describe('ensureDiaryEditorMenu', () => {
  /** 假插件：捕获 registerEvent 与 workspace.on 回调 */
  function makeFakePlugin(app: any) {
    const events: Record<string, (...args: any[]) => void> = {};
    const registered: any[] = [];
    const plugin = { app, registerEvent: (ref: any) => registered.push(ref) };
    (app.workspace as any).on = (name: string, cb: (...args: any[]) => void) => {
      events[name] = cb;
      return { id: 'evt-mock' };
    };
    return { plugin, events, registered };
  }

  function makeFakeMenu() {
    const items: any[] = [];
    return {
      items,
      addItem(build: (item: any) => void) {
        const item: any = { _title: '', _icon: '', _onClick: null };
        item.setTitle = (t: string) => ((item._title = t), item);
        item.setIcon = (i: string) => ((item._icon = i), item);
        item.onClick = (fn: () => void) => ((item._onClick = fn), item);
        build(item);
        items.push(item);
      },
    };
  }

  it('editor-menu 挂「打开今日日记」，点击与命令同一执行函数（建档 + 打开）', async () => {
    const app = setup({ [TEMPLATE_PATH]: TEMPLATE_FILE });
    const { ensureDiaryEditorMenu } = await import('../../src/diary/daily');
    const { plugin, events, registered } = makeFakePlugin(app);
    ensureDiaryEditorMenu(plugin);

    expect(registered).toHaveLength(1);
    expect(events['editor-menu']).toBeTypeOf('function');

    const menu = makeFakeMenu();
    events['editor-menu'](menu);
    expect(menu.items).toHaveLength(1);
    expect(menu.items[0]._title).toBe('打开今日日记');

    await menu.items[0]._onClick();
    // onClick 内是 void fire-and-forget：轮询等建档完成（与命令同函数的真实时序）
    await vi.waitFor(() => expect(vault.files.has(`我的/日记/${today()}.md`)).toBe(true));
    expect(opened).toEqual([`我的/日记/${today()}.md`]);
  });

  it('注册失败静默（workspace.on 抛错不影响插件加载）', async () => {
    const app = setup();
    const { ensureDiaryEditorMenu } = await import('../../src/diary/daily');
    const plugin = {
      app,
      registerEvent: () => {
        throw new Error('boom');
      },
    };
    expect(() => ensureDiaryEditorMenu(plugin)).not.toThrow();
  });
});

describe('wireDiaryPanelHeaderMenu（日记本面板头部右键，票 303 Q1a）', () => {
  it('头部右键弹 core 跟手菜单「打开今日日记」，点项与命令同一执行函数', async () => {
    setup({ [TEMPLATE_PATH]: TEMPLATE_FILE });
    const { wireDiaryPanelHeaderMenu } = await import('../../src/diary/ui/panel');
    const header = document.createElement('div');
    wireDiaryPanelHeaderMenu(header);

    header.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 })
    );
    const menu = document.querySelector('.bz-item-menu');
    expect(menu).not.toBeNull();
    const items = Array.from(menu!.querySelectorAll<HTMLButtonElement>('.bz-item-menu-item'));
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('打开今日日记');

    // 点菜单项 → 走 openTodayDiary 同一执行函数（建档 + 打开）
    items[0].click();
    await vi.waitFor(() => expect(vault.files.has(`我的/日记/${today()}.md`)).toBe(true));
    expect(opened).toEqual([`我的/日记/${today()}.md`]);
  });
});
