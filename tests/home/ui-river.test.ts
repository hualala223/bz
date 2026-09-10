/**
 * 内容首页（home 域）UI 测试（issue 232 活动河改版）：
 * 面板装配（头行/三栏/移动瓦片）、16 域入口行、时间线空态、预告三卡、点行直达、ESC/遮罩关闭。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { openHome, unloadHome } from '../../src/home';
import { closeOverlay } from '../../src/home/ui';
import { resetHomeState, H } from '../../src/home/state';
import { DOMAINS } from '../../src/home/domains';

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function yesterdayDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function yesterdayStr(): string {
  return `${yesterdayDateStr()} 09:00:00`;
}

function recApp(vault: MockVault): any {
  const app = mockAppWithVault(vault) as any;
  app.__executed = [] as string[];
  app.commands = {
    listCommands: () => [],
    executeCommandById: (id: string) => {
      app.__executed.push(id);
    },
  };
  return app;
}

describe('home 活动河 UI（issue 232）', () => {
  let vault: MockVault;

  beforeEach(() => {
    vault = new MockVault();
    setApp(mockAppWithVault(vault) as any);
    setSettingsProvider(() => ({ ...DEFAULT_SETTINGS }));
    resetHomeState();
  });

  afterEach(() => {
    unloadHome();
  });

  it('面板装配：头行标题/日期 + 三栏容器 + 关闭钮；数据采集后 16 行入口全渲染', async () => {
    const app = recApp(vault);
    openHome(app);
    await new Promise((r) => setTimeout(r, 20));
    const overlay = document.querySelector('.bz-home-overlay') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.querySelector('.bz-home-title')!.textContent).toBe('首页');
    expect(overlay.querySelector('[data-home-date]')!.textContent).toMatch(/\d{4}-\d{2}-\d{2} 周/);
    expect(overlay.querySelector('[data-home-close]')).toBeTruthy();
    expect(overlay.querySelectorAll('[data-home-go]').length).toBeGreaterThanOrEqual(DOMAINS.length);
    // 每行：彩点 + 图标 + 名称 + 计数
    expect(overlay.querySelectorAll('.bz-home-erow').length).toBe(DOMAINS.length);
    expect(overlay.querySelectorAll('.bz-home-erow .bz-ic').length).toBe(DOMAINS.length);
  });

  it('时间线空态与预告三卡', async () => {
    const app = recApp(vault);
    openHome(app);
    await new Promise((r) => setTimeout(r, 20));
    const overlay = document.querySelector('.bz-home-overlay')!;
    expect(overlay.querySelector('.bz-home-flow-empty')).toBeTruthy(); // 空河引导文案
    const prs = overlay.querySelectorAll('.bz-home-pr');
    expect(prs.length).toBe(3); // 复习/剪藏/日记三张规则卡
    expect((overlay.querySelector('[data-home-next]') as HTMLElement).textContent).toContain('明 天 预 告');
  });

  it('点入口行执行对应域命令并关首页（demo 命令通道记录 id）', async () => {
    const app = recApp(vault);
    openHome(app);
    await new Promise((r) => setTimeout(r, 20));
    (document.querySelector('[data-home-go="cinema"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(app.__executed).toEqual(['bz-cinema-open']);
    expect(document.querySelector('.bz-home-overlay')).toBeNull();
    expect(H.river).toBeNull(); // 关闭清采集态
  });

  it('周历：7 格动静历渲染；点昨天格时间线切天、选中格同步', async () => {
    vault.files.set('CONFIG/STORAGE/memo.json', JSON.stringify([
      { title: '甲', created: yesterdayStr() + ' 09:00:00', completed: null },
    ]));
    const app = recApp(vault);
    openHome(app);
    await new Promise((r) => setTimeout(r, 20));
    const wks = document.querySelectorAll('[data-home-weekday]');
    expect(wks.length).toBe(7);
    // 倒排：第一格=今天，显示「今」不写数字
    expect((wks[0] as HTMLElement).dataset.homeWeekday).toBe(todayStr());
    expect(wks[0].querySelector('.bz-home-wk-n')!.textContent).toBe('今');
    expect(document.querySelectorAll('.bz-home-wk--hit').length).toBe(1); // 只有昨天有动静
    const yesterday = yesterdayDateStr();
    const ybtn = document.querySelector(`[data-home-weekday="${yesterday}"]`) as HTMLElement;
    ybtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect((document.querySelector('[data-home-flow] .bz-home-sec-t') as HTMLElement).textContent).toContain(yesterday.slice(5));
    expect(document.querySelectorAll('.bz-home-timeline .bz-home-ev').length).toBe(1); // 新增待办一条
    expect(document.querySelector(`[data-home-weekday="${yesterday}"]`)!.classList.contains('bz-home-wk--sel')).toBe(true);
  });

  it('今日收集快照卡：今日条数 + 最近 3 条（分类 badge + 摘要）；点卡片直达日常收集', async () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${p(d.getFullYear() % 100)}/${p(d.getMonth() + 1)}/${p(d.getDate())}-08:00:00`;
    vault.files.set(
      '我的/日常收集/日常灵感收集.md',
      `## 非文件收集\n- ${stamp} 一条很长的灵感内容需要被截断展示\n`
    );
    const app = recApp(vault);
    openHome(app);
    await new Promise((r) => setTimeout(r, 20));

    const card = document.querySelector('.bz-home-collect') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.querySelector('.bz-home-collect-n')!.textContent).toBe('1 条');
    expect(card.querySelector('.bz-home-collect-cat')!.textContent).toBe('日常灵感收集');
    expect(card.querySelectorAll('.bz-home-collect-it').length).toBe(1);
    // 入口行计数文案同源
    const erow = document.querySelector('[data-home-go="collect"].bz-home-erow') as HTMLElement;
    expect(erow.querySelector('.bz-home-ect')!.textContent).toBe('今日 1 条');

    card.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(app.__executed).toEqual(['bz-collect-open']);
  });

  it('今日收集快照卡空态：无收集文件时给引导文案且不入库', async () => {
    const app = recApp(vault);
    openHome(app);
    await new Promise((r) => setTimeout(r, 20));
    const card = document.querySelector('.bz-home-collect') as HTMLElement;
    expect(card.querySelector('.bz-home-collect-empty')).toBeTruthy();
    expect(card.querySelectorAll('.bz-home-collect-it').length).toBe(0);
    expect(vault.files.size).toBe(0);
  });

  it('点关闭钮 / 遮罩均关闭（桌面无关闭钮显示由 CSS 控制事件仍可用）', async () => {
    const app = recApp(vault);
    openHome(app);
    await new Promise((r) => setTimeout(r, 20));
    (document.querySelector('[data-home-close]') as HTMLElement).click();
    expect(document.querySelector('.bz-home-overlay')).toBeNull();

    openHome(app);
    await new Promise((r) => setTimeout(r, 20));
    const overlay = document.querySelector('.bz-home-overlay')!;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.bz-home-overlay')).toBeNull();
  });
});
