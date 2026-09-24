import { makeApp } from '../helpers/app';
// @vitest-environment node
/**
 * 影院（cinema）数据层测试：解析/排序/筛选
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks } from '../mock-obsidian-entry';
import { M, resetCinemaState, type CinemaItem } from '../../src/cinema/state';
import { rebuildItems, getDisplayItems, sortByDateDesc, sortByCreatedDesc, dateVal, parseEpisodeCount } from '../../src/cinema/data';
import { getStarString, getGroupForTag, getGroupSafe, doubanEligibleTag, episodesEligibleTag, STATUS_WATCHING, STATUS_WATCHED } from '../../src/cinema/constants';
import { pcardHtml, detailModalHtml } from '../../src/cinema/shared';
import { unloadCinema } from '../../src/cinema';


function md(content: string): string {
  return content;
}

describe('cinema 解析', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    M.folderPath = '我的/娱乐';
  });

  it('解析条目：名称/标签/组/评分/日期/状态/海报/豆瓣字段', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《星际穿越》.md', md(`---
tags:
  - 电影
评分: 9.6
观影日期: 2026-08-01
影评: 爱是穿越维度的唯一力量
海报: CONFIG/MOVIE POSTER/1.jpg
导演: 克里斯托弗·诺兰
主演: 马修·麦康纳 / 安妮·海瑟薇
类型: 剧情 / 科幻
制片国家/地区: 美国
上映日期: 2014-11-07
豆瓣评分: 9.4
豆瓣链接: https://movie.douban.com/subject/1889243/
简介: 近未来的地球黄沙遍野。
---`));
    const app = makeApp(vault);
    const items = rebuildItems(app);
    expect(items.length).toBe(1);
    const it = items[0];
    expect(it.name).toBe('星际穿越');
    expect(it.typeTag).toBe('电影');
    expect(it.group).toBe('电影');
    expect(it.rating).toBe(9.6);
    expect(it.watchDate).toBe('2026-08-01');
    expect(it.review).toBe('爱是穿越维度的唯一力量');
    expect(it.poster).toBe('CONFIG/MOVIE POSTER/1.jpg');
    expect(it.director).toBe('克里斯托弗·诺兰');
    expect(it.actors).toBe('马修·麦康纳 / 安妮·海瑟薇');
    expect(it.genre).toBe('剧情 / 科幻');
    expect(it.region).toBe('美国');
    expect(it.year).toBe('2014');
    expect(it.doubanRating).toBe('9.4');
    expect(it.doubanUrl).toBe('https://movie.douban.com/subject/1889243/');
    expect(it.synopsis).toBe('近未来的地球黄沙遍野。');
  });

  it('状态推断：-1=想看 / 0=在看 / 正数=已看', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《A》.md', '---\ntags: [电影]\n评分: -1\n---');
    vault.files.set('我的/娱乐/《B》.md', '---\ntags: [电影]\n评分: 0\n---');
    vault.files.set('我的/娱乐/《C》.md', '---\ntags: [电影]\n评分: 8.2\n---');
    const app = makeApp(vault);
    const items = rebuildItems(app);
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName['A'].status).toBe(0); // STATUS_WANT
    expect(byName['B'].status).toBe(1); // STATUS_WATCHING
    expect(byName['C'].status).toBe(2); // STATUS_WATCHED
  });

  it('无 frontmatter 跳过；无 tag 跳过', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《无fm》.md', '正文没有 frontmatter');
    vault.files.set('我的/娱乐/《无tag》.md', '---\n评分: 8\n---');
    const app = makeApp(vault);
    const items = rebuildItems(app);
    expect(items.length).toBe(0);
  });

  it('旧剧集细分 tag 归一：国产剧/英剧 → 组归「电视剧」，typeTag 归一、fm 原值不改写（票 293）', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《三体》.md', '---\ntags: [国产剧]\n评分: 9.2\n---');
    vault.files.set('我的/娱乐/《黑镜》.md', '---\ntags: [英剧]\n评分: 8.1\n---');
    const app = makeApp(vault);
    const items = rebuildItems(app);
    items.forEach((i) => expect(i.group).toBe('电视剧'));
    expect(items[0].typeTag).toBe('电视剧');
    expect(items[1].typeTag).toBe('电视剧');
    expect(vault.files.get('我的/娱乐/《三体》.md')).toContain('国产剧'); // fm 原值不改写
  });

  it('顶级类型：短剧直建直归；旧 tag「小说」经归一映射入「书籍」组，fm 原值不改写（票 293/299）', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《长风渡》.md', '---\ntags: [短剧]\n评分: 7\n---');
    vault.files.set('我的/娱乐/《百年孤独》.md', '---\ntags: [小说]\n评分: 9.5\n---');
    const app = makeApp(vault);
    const items = rebuildItems(app);
    expect(items.map((i) => i.group)).toEqual(['短剧', '书籍']);
    expect(items[1].typeTag).toBe('书籍'); // 读侧归一（同旧剧 tag 先例）
    expect(vault.files.get('我的/娱乐/《百年孤独》.md')).toContain('小说'); // fm 原值不改写
  });

  it('rebuildItems：metadataCache 未就绪（cache null）的文件保留内存既有条目，防新建闪失（issue 256）', () => {
    const vault = new MockVault();
    // 无 frontmatter 也无 embeds → mock cache 返回 null（≈ 真库中新建文件尚未被 metadataCache 索引）
    vault.files.set('我的/娱乐/《缓存未就绪》.md', '正文');
    const app = makeApp(vault);
    const tfile = vault.getMarkdownFiles()[0];
    const handItem: CinemaItem = {
      file: tfile, name: '缓存未就绪', typeTag: '电影', group: '电影', watchDate: null, rating: null,
      status: 2, poster: null, review: null, genre: null, director: null, actors: null,
      region: null, year: null, doubanRating: null, doubanUrl: null, synopsis: null, duration: null, seasonText: null, country: null, genres: [], episodesTotal: null, episodesWatching: null, chaptersTotal: null, chaptersWatching: null, bookInfo: [],
    };
    M.items.push(handItem);
    const items = rebuildItems(app);
    expect(items).toHaveLength(1);
    expect(items[0]).toBe(handItem);
  });

  it('rebuildItems：已索引但无效的文件（frontmatter 无 tags）不被保留分支救回', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《无效》.md', '---\n评分: 8\n---');
    const app = makeApp(vault);
    const tfile = vault.getMarkdownFiles()[0];
    M.items.push({
      file: tfile, name: '无效', typeTag: '电影', group: '电影', watchDate: null, rating: null,
      status: 2, poster: null, review: null, genre: null, director: null, actors: null,
      region: null, year: null, doubanRating: null, doubanUrl: null, synopsis: null, duration: null, seasonText: null, country: null, genres: [], episodesTotal: null, episodesWatching: null, chaptersTotal: null, chaptersWatching: null, bookInfo: [],
    });
    rebuildItems(app);
    expect(M.items).toHaveLength(0);
  });
});

describe('cinema 排序与筛选', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    M.folderPath = '我的/娱乐';
  });

  function seed() {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《旧片》.md', '---\ntags: [电影]\n评分: 7.0\n观影日期: 2024-01-01\n---');
    vault.files.set('我的/娱乐/《新片》.md', '---\ntags: [电影]\n评分: 9.0\n观影日期: 2026-08-01\n---');
    vault.files.set('我的/娱乐/《无日期》.md', '---\ntags: [电影]\n评分: 8.0\n---');
    vault.files.set('我的/娱乐/《剧》.md', '---\ntags: [美剧]\n评分: 8.5\n观影日期: 2026-07-01\n---');
    const app = makeApp(vault);
    rebuildItems(app);
    return app;
  }

  it('默认排序：观影日期倒序，无日期排最后', () => {
    seed();
    const list = getDisplayItems();
    expect(list.map((i) => i.name)).toEqual(['新片', '剧', '旧片', '无日期']);
  });

  it('类型筛选 + 再点取消（typeFilter 置空 = 全部）', () => {
    seed();
    M.typeFilter = '电影';
    expect(getDisplayItems().map((i) => i.name)).toEqual(['新片', '旧片', '无日期']);
    M.typeFilter = null;
    expect(getDisplayItems().length).toBe(4);
  });

  it('状态筛选', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《想看》.md', '---\ntags: [电影]\n评分: -1\n---');
    vault.files.set('我的/娱乐/《在看》.md', '---\ntags: [电影]\n评分: 0\n---');
    vault.files.set('我的/娱乐/《已看》.md', '---\ntags: [电影]\n评分: 8\n---');
    const app = makeApp(vault);
    rebuildItems(app);
    M.statusFilter = '想看';
    expect(getDisplayItems().map((i) => i.name)).toEqual(['想看']);
    M.statusFilter = '在看';
    expect(getDisplayItems().map((i) => i.name)).toEqual(['在看']);
  });

  it('按创建排序用 ctime：后编辑（mtime 新）不改排名', () => {
    // 旧片先创建但最近被编辑过（mtime 最新）；新片后创建未编辑——按创建应新片在前
    const mk = (name: string, ctime: number, mtime: number): CinemaItem => ({
      file: { path: `我的/娱乐/《${name}》.md`, stat: { ctime, mtime } } as any,
      name, typeTag: '电影', group: '电影',
      watchDate: null, rating: null, status: 2, poster: null, review: null,
      genre: null, director: null, actors: null, region: null, year: null,
      doubanRating: null, doubanUrl: null, synopsis: null, duration: null, seasonText: null, country: null, genres: [], episodesTotal: null, episodesWatching: null, chaptersTotal: null, chaptersWatching: null, bookInfo: [],
    });
    const t0 = 1000;
    const old = mk('旧片', t0, 9000); // 先创建，后被编辑 → mtime 最大
    const newer = mk('新片', t0 + 1000, t0 + 1000); // 后创建，未编辑
    const list = sortByCreatedDesc([old, newer]);
    expect(list.map((i) => i.name)).toEqual(['新片', '旧片']); // 按 ctime 倒序，mtime 不参与
  });

  it('搜索：名称/影评/导演命中', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《星际穿越》.md', '---\ntags: [电影]\n评分: 9.6\n影评: 爱是穿越维度的力量\n导演: 诺兰\n---');
    vault.files.set('我的/娱乐/《三体》.md', '---\ntags: [国产剧]\n评分: 9.2\n---');
    const app = makeApp(vault);
    rebuildItems(app);
    M.searchKeyword = '穿越';
    expect(getDisplayItems().map((i) => i.name)).toEqual(['星际穿越']);
    M.searchKeyword = '诺兰';
    expect(getDisplayItems().map((i) => i.name)).toEqual(['星际穿越']);
    M.searchKeyword = '三体';
    expect(getDisplayItems().map((i) => i.name)).toEqual(['三体']);
  });
});

describe('cinema 工具函数', () => {
  it('星星：5 星轨道（实心+空心）', () => {
    expect(getStarString(9.6)).toBe('★★★★★');
    expect(getStarString(9.2)).toBe('★★★★☆');
    expect(getStarString(8.0)).toBe('★★★★☆');
    expect(getStarString(7.4)).toBe('★★★☆☆');
    expect(getStarString(5.4)).toBe('★★☆☆☆');
    expect(getStarString(1.4)).toBe('☆☆☆☆☆');
    expect(getStarString(0)).toBe('');
    expect(getStarString(-1)).toBe('');
  });

  it('组映射（票 293 旧剧归一 / 票 299 小说→书籍）', () => {
    expect(getGroupForTag('美剧')).toBe('电视剧');
    expect(getGroupForTag('哥伦比亚剧')).toBe('电视剧');
    expect(getGroupForTag('电视剧')).toBe('电视剧');
    expect(getGroupForTag('短剧')).toBe('短剧');
    expect(getGroupForTag('书籍')).toBe('书籍');
    expect(getGroupForTag('小说')).toBe('书籍');
    expect(getGroupForTag('日漫')).toBe('动漫');
    expect(getGroupForTag('国漫')).toBe('动漫');
    expect(getGroupForTag('美漫')).toBe('动漫');
    expect(getGroupForTag('动漫')).toBe('动漫');
    expect(getGroupSafe('未知tag')).toBe('其他');
  });

  it('豆瓣抓取 gate（票 293）：电影/电视剧（含旧剧 tag 归一）可抓，短剧/书籍（含旧小说 tag）不可', () => {
    expect(doubanEligibleTag('电影')).toBe(true);
    expect(doubanEligibleTag('电视剧')).toBe(true);
    expect(doubanEligibleTag('美剧')).toBe(true);
    expect(doubanEligibleTag('短剧')).toBe(false);
    expect(doubanEligibleTag('书籍')).toBe(false);
    expect(doubanEligibleTag('小说')).toBe(false);
    expect(doubanEligibleTag('日漫')).toBe(false);
    expect(doubanEligibleTag(null)).toBe(false);
  });

  it('集数 gate（票 295）：电视剧/短剧（含旧剧 tag 归一）适用，其余类型不适用', () => {
    expect(episodesEligibleTag('电视剧')).toBe(true);
    expect(episodesEligibleTag('短剧')).toBe(true);
    expect(episodesEligibleTag('美剧')).toBe(true);
    expect(episodesEligibleTag('电影')).toBe(false);
    expect(episodesEligibleTag('书籍')).toBe(false);
    expect(episodesEligibleTag('小说')).toBe(false);
    expect(episodesEligibleTag(null)).toBe(false);
  });

  it('集数解析（票 295）：正整数有效（小数取整），空/0/负/非数一律 null', () => {
    expect(parseEpisodeCount(40)).toBe(40);
    expect(parseEpisodeCount('12')).toBe(12);
    expect(parseEpisodeCount(12.4)).toBe(12);
    expect(parseEpisodeCount('')).toBeNull();
    expect(parseEpisodeCount(null)).toBeNull();
    expect(parseEpisodeCount(0)).toBeNull();
    expect(parseEpisodeCount(-3)).toBeNull();
    expect(parseEpisodeCount('abc')).toBeNull();
  });

});

describe('集数落盘与角标（票 295）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    M.folderPath = '我的/娱乐';
  });
  afterEach(() => {
    unloadCinema();
  });

  it('fm 解析：「总集数」「正在看集数」读入条目；缺失为 null', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《某剧》.md', '---\ntags: [电视剧]\n评分: 0\n总集数: 40\n正在看集数: 12\n---');
    vault.files.set('我的/娱乐/《某片》.md', '---\ntags: [电影]\n评分: 8\n---');
    const app = makeApp(vault);
    const items = rebuildItems(app);
    const drama = items.find((i) => i.name === '某剧')!;
    expect(drama.status).toBe(STATUS_WATCHING);
    expect(drama.episodesTotal).toBe(40);
    expect(drama.episodesWatching).toBe(12);
    const film = items.find((i) => i.name === '某片')!;
    expect(film.episodesTotal).toBeNull();
    expect(film.episodesWatching).toBeNull();
  });

  it('书籍条目（票 301）：封面兜底 poster；章节两键读取；bookInfo 行非空项', () => {
    const vault = new MockVault();
    vault.files.set('我的/娱乐/《某书》.md', '---\ntags: [书籍]\n评分: 0\n封面: "CONFIG/BOOK COVER/x.jpg"\n总章节数: 36\n正在看章节: 12\n作者: 张三\nISBN: "9787508684031"\n---');
    vault.files.set('我的/娱乐/《某影》.md', '---\ntags: [电影]\n评分: 8\n---');
    const app = makeApp(vault);
    const items = rebuildItems(app);
    const book = items.find((i) => i.name === '某书')!;
    expect(book.poster).toBe('CONFIG/BOOK COVER/x.jpg'); // 封面兜底（书籍无海报键）
    expect(book.chaptersTotal).toBe(36);
    expect(book.chaptersWatching).toBe(12);
    expect(book.bookInfo).toContainEqual(['作者', '张三']);
    expect(book.bookInfo).toContainEqual(['ISBN', '9787508684031']);
    expect(book.bookInfo.some(([k]) => k === '出版社')).toBe(false); // 空键不进行
    const film = items.find((i) => i.name === '某影')!;
    expect(film.chaptersTotal).toBeNull();
    expect(film.bookInfo).toEqual([]);
  });

  it('在看剧类卡片角标：`12/40` 右上角标；非在看/非剧类/缺数据不显示', () => {    const mk = (over: Partial<CinemaItem>): CinemaItem => ({
      file: null, name: 'X', typeTag: '电视剧', group: '电视剧', watchDate: null, rating: 0,
      status: STATUS_WATCHING, poster: null, review: null, genre: null, director: null, actors: null,
      region: null, year: null, doubanRating: null, doubanUrl: null, synopsis: null, duration: null,
      seasonText: null, country: null, genres: [], episodesTotal: null, episodesWatching: null, chaptersTotal: null, chaptersWatching: null, bookInfo: [], ...over,
    });
    expect(pcardHtml(mk({ name: 'A', episodesTotal: 40, episodesWatching: 12 }), null)).toContain('badge-eps">12/40</span>');
    expect(pcardHtml(mk({ name: 'B', status: STATUS_WATCHED, episodesTotal: 40, episodesWatching: 40 }), null)).not.toContain('badge-eps');
    expect(pcardHtml(mk({ name: 'C', typeTag: '电影', episodesTotal: 40, episodesWatching: 12 }), null)).not.toContain('badge-eps');
    expect(pcardHtml(mk({ name: 'D', episodesTotal: 40, episodesWatching: null }), null)).not.toContain('badge-eps');
    expect(pcardHtml(mk({ name: 'E', episodesTotal: null, episodesWatching: 12 }), null)).not.toContain('badge-eps');
  });

  it('详情卡（Q17c）：有笔记文件的条目渲染「重抓豆瓣」按钮，无文件不渲染；集数行/章节行形态', () => {
    const mk = (over: Partial<CinemaItem>): CinemaItem => ({
      file: null, name: 'X', typeTag: '电视剧', group: '电视剧', watchDate: null, rating: 0,
      status: STATUS_WATCHING, poster: null, review: null, genre: null, director: null, actors: null,
      region: null, year: null, doubanRating: null, doubanUrl: null, synopsis: null, duration: null,
      seasonText: null, country: null, genres: [], episodesTotal: null, episodesWatching: null, chaptersTotal: null, chaptersWatching: null, bookInfo: [], ...over,
    });
    expect(detailModalHtml(mk({ name: 'A', file: { path: '我的/娱乐/《A》.md' } as CinemaItem['file'] }), null)).toContain('j-refetch');
    expect(detailModalHtml(mk({ name: 'B', file: null }), null)).not.toContain('j-refetch');
    // 集数行：有总集数显示（有在看进度给 X / Y，否则 共 X 集）；书籍章节行同款
    expect(detailModalHtml(mk({ name: 'C', episodesTotal: 24, episodesWatching: 12 }), null)).toContain('>集数</span><span class="dm-kv-v">12 / 24<');
    expect(detailModalHtml(mk({ name: 'D', episodesTotal: 24, episodesWatching: null }), null)).toContain('共 24 集');
    expect(detailModalHtml(mk({ name: 'E', typeTag: '书籍', chaptersTotal: 47 }), null)).toContain('共 47 章');
  });
});
