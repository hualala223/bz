/**
 * 观影志（yearbook）测试：数据派生 + 覆盖层装配 + 入口 markup（批 5cine 收尾补票）
 * - deriveYb：真实字段派生的口径锚（总量/已看/想看/年份分组/片长/影评/热门短评）
 * - openYearbookOverlay / closeYearbookOverlay：空态与有库两形态、重复开不叠层、幂等关
 * - midnight 壳：桌面 rail 与移动 bar 的 data-film-open「观影志」入口在位
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { resetCinemaState } from '../../src/cinema/state';
import { rebuildItems } from '../../src/cinema/data';
import { deriveYb, parseMinutes, YB_SCENES, yearbookFixedHtml, yearbookHtml } from '../../src/cinema/yearbook';
import { openYearbookOverlay, closeYearbookOverlay } from '../../src/cinema/ui';
import { midnightDeskHtml, midnightMobHtml } from '../../src/cinema/layouts/midnight/render';

function makeApp(vault: MockVault) {
  const app = mockAppWithVault(vault);
  setApp(app);
  return app;
}

/** 种子库：已看电影（全字段）+ 已看剧集（季集）+ 想看（评分 -1 = 想看，data.test 同口径） */
function seed(vault: MockVault): void {
  vault.files.set('我的/娱乐/《星际穿越》.md', [
    '---',
    'tags:',
    '  - 电影',
    '评分: 9.6',
    '观影日期: 2026-08-01',
    '片长: 169分钟',
    '影评: 爱是穿越维度的唯一力量',
    '导演: 克里斯托弗·诺兰',
    '主演: 马修·麦康纳 / 安妮·海瑟薇',
    '类型: 剧情 / 科幻',
    '制片国家/地区: 美国',
    '上映日期: 2014-11-07',
    '豆瓣评分: 9.4',
    '热门短评: 硬科幻的天花板，时间与爱的双重奏令人震撼。',
    '---',
  ].join('\n'));
  vault.files.set('我的/娱乐/《三体》.md', '---\ntags: [电视剧]\n评分: 8.5\n观影日期: 2026-08-02\n季集: 30集\n---');
  vault.files.set('我的/娱乐/《想看片》.md', '---\ntags: [电影]\n评分: -1\n---');
}

describe('yearbook 数据派生（deriveYb）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
  });

  it('总量口径：total / watchedCount / wantCount（评分 -1=想看、正数=已看）', () => {
    const vault = new MockVault();
    seed(vault);
    const data = deriveYb(rebuildItems(makeApp(vault)));
    expect(data.total).toBe(3);
    expect(data.watchedCount).toBe(2);
    expect(data.wantCount).toBe(1);
  });

  it('年份分组按「观影日期」聚合；片长解析 169分钟；影评/短评归文字段', () => {
    const vault = new MockVault();
    seed(vault);
    const data = deriveYb(rebuildItems(makeApp(vault)));
    expect(data.years.length).toBeGreaterThanOrEqual(1);
    expect(data.years.some((y) => y.y === 2026)).toBe(true);
    expect(parseMinutes('169分钟')).toBe(169);
    expect(data.totalMinutes).toBeGreaterThanOrEqual(169);
    expect(data.reviews.length).toBe(1);
    expect(data.hotComments.length).toBe(1);
  });

  it('yearbookFixedHtml：25 幕导航点逐幕在位', () => {
    const html = yearbookFixedHtml();
    expect(html.split('yb-rail-t').length - 1).toBe(YB_SCENES.length);
  });

  it('YB_SCENES 幕表固定 25 幕，首尾为开卷/落款', () => {
    expect(YB_SCENES.length).toBe(25);
    expect(YB_SCENES[0].id).toBe('open');
    expect(YB_SCENES[YB_SCENES.length - 1].id).toBe('colophon');
  });
});

describe('观影志覆盖层（openYearbookOverlay / closeYearbookOverlay）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    document.body.innerHTML = '';
    setSettingsProvider(() => ({} as any));
  });
  afterEach(() => {
    closeYearbookOverlay();
    setSettingsProvider(() => ({} as any));
  });

  it('空库：出空态（添加影视入口），无 25 幕与固定层', () => {
    const app = makeApp(new MockVault());
    openYearbookOverlay(app);
    const ovl = document.body.querySelector('.bz-yb') as HTMLElement;
    expect(ovl).toBeTruthy();
    expect(ovl.querySelector('.bz-yb-blank')).toBeTruthy();
    expect(ovl.querySelector('[data-cinema-analysis-add]')?.textContent).toContain('添加影视');
    expect(ovl.querySelector('.bz-yb-film')).toBeNull();
    expect(ovl.querySelector('.yb-fixed')).toBeNull();
  });

  it('有库：25 幕整装 + 固定层导航点；重复开不叠第二层', () => {
    const vault = new MockVault();
    seed(vault);
    const app = makeApp(vault);
    openYearbookOverlay(app);
    openYearbookOverlay(app); // 已开：只晃一下提示还在
    expect(document.body.querySelectorAll('.bz-yb').length).toBe(1);
    const ovl = document.body.querySelector('.bz-yb') as HTMLElement;
    expect(ovl.querySelector('.bz-yb-film')).toBeTruthy();
    expect(ovl.querySelectorAll('.bz-yb-scn').length).toBe(YB_SCENES.length);
    expect(ovl.querySelectorAll('.yb-rail-t').length).toBe(YB_SCENES.length);
  });

  it('25 幕 HTML 转义：影评原话里的 HTML 不原样出', () => {
    const vault = new MockVault();
    seed(vault);
    const data = deriveYb(rebuildItems(makeApp(vault)));
    const html = yearbookHtml(data, () => null);
    expect(html).toContain('爱是穿越维度的唯一力量');
    expect(html).not.toContain('<script>');
  });

  it('关闭幂等：开→关→DOM 无残留；再关不抛', () => {
    const vault = new MockVault();
    seed(vault);
    const app = makeApp(vault);
    openYearbookOverlay(app);
    closeYearbookOverlay();
    expect(document.body.querySelector('.bz-yb')).toBeNull();
    expect(() => closeYearbookOverlay()).not.toThrow();
  });

  it('空态「添加影视」：先收层再开表单', () => {
    const app = makeApp(new MockVault());
    openYearbookOverlay(app);
    const ovl = document.body.querySelector('.bz-yb') as HTMLElement;
    (ovl.querySelector('[data-cinema-analysis-add]') as HTMLElement).click();
    expect(document.body.querySelector('.bz-yb')).toBeNull();
  });
});

describe('观影志入口 markup（midnight 壳）', () => {
  it('桌面 rail：data-film-open「观影志」按钮在位，与「观影分析」并列', () => {
    const html = midnightDeskHtml();
    expect(html).toContain('data-film-open');
    expect(html).toContain('观影志');
    expect(html).toContain('data-tool="stat"'); // 本地统计页入口原样保留
  });

  it('移动 bar：data-film-open + j-yb 按钮在位，j-mstat 统计入口原样保留', () => {
    const html = midnightMobHtml();
    expect(html).toContain('data-film-open');
    expect(html).toContain('j-yb');
    expect(html).toContain('j-mstat');
  });
});
