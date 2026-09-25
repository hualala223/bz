// @vitest-environment node
/**
 * 影院查重/去重数据层（票 306）：双口径判定（豆瓣 sid=确认 / 归一名称=疑似）、
 * 重叠判定并组（union-find）、保留推荐计分、用户数据搬补只补不覆盖。
 * 纯函数测试，不碰 DOM / vault（行为层接线在 ui.test.ts）。
 */
import { describe, it, expect } from 'vitest';
import {
  extractDoubanSid,
  normalizeEntryName,
  findDuplicateGroups,
  keepScore,
  mergeUserData,
} from '../../src/cinema/dedupe';
import type { CinemaItem } from '../../src/cinema/state';

function mk(over: Partial<CinemaItem> & { name: string }): CinemaItem {
  return {
    file: null,
    typeTag: '电影',
    group: '电影',
    status: 2,
    rating: null,
    watchDate: null,
    review: null,
    poster: null,
    genre: null,
    director: null,
    actors: null,
    region: null,
    year: null,
    doubanRating: null,
    doubanUrl: null,
    synopsis: null,
    duration: null,
    seasonText: null,
    country: null,
    genres: [],
    episodesTotal: null,
    episodesWatching: null,
    chaptersTotal: null,
    chaptersWatching: null,
    bookInfo: [],
    releaseDate: null,
    hotComment: null,
    ...over,
  } as CinemaItem;
}

describe('extractDoubanSid / normalizeEntryName（票 306 双口径的原子归一）', () => {
  it('豆瓣指纹提取：影视/书籍带站点前缀（独立编号空间），非条目链接回落 null', () => {
    expect(extractDoubanSid('https://movie.douban.com/subject/26302614/')).toBe('movie:26302614');
    expect(extractDoubanSid('https://book.douban.com/subject/35193035/')).toBe('book:35193035');
    expect(extractDoubanSid('https://movie.douban.com/')).toBeNull();
    expect(extractDoubanSid(null)).toBeNull();
  });

  it('名称归一：书名号/半角空格/全角空格剥除 + 小写', () => {
    expect(normalizeEntryName('《我的大叔》')).toBe(normalizeEntryName('我的大叔'));
    expect(normalizeEntryName('X 档案')).toBe(normalizeEntryName('x档案'));
    expect(normalizeEntryName('X\u3000档案')).toBe(normalizeEntryName('x档案'));
  });
});

describe('findDuplicateGroups（票 306 双口径分组）', () => {
  it('同 sid = 确认重复组；信息最全者排首位（keepIndex=0）', () => {
    const rich = mk({ name: '重复B', doubanUrl: 'https://movie.douban.com/subject/999/', rating: 8.5 });
    const bare = mk({ name: '重复A', doubanUrl: 'https://movie.douban.com/subject/999/' });
    const groups = findDuplicateGroups([bare, rich]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('sid');
    expect(groups[0].members).toHaveLength(2);
    expect(groups[0].members[0].name).toBe('重复B');
    expect(groups[0].keepIndex).toBe(0);
  });

  it('归一同名（无 sid）= 疑似重复组；不同名不同 sid 不成组', () => {
    const a = mk({ name: '《X》' });
    const b = mk({ name: 'x' });
    const c = mk({ name: '无关片', doubanUrl: 'https://movie.douban.com/subject/1/' });
    const groups = findDuplicateGroups([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('name');
    expect(groups[0].members.map((m) => m.name).sort()).toEqual(['x', '《X》']);
  });

  it('无重复 → 空数组（当前真实库的常态）', () => {
    const items = [
      mk({ name: '甲', doubanUrl: 'https://movie.douban.com/subject/1/' }),
      mk({ name: '乙', doubanUrl: 'https://movie.douban.com/subject/2/' }),
      mk({ name: '丙' }),
    ];
    expect(findDuplicateGroups(items)).toEqual([]);
  });

  it('sid 组与同名链重叠 → 并成一组，有 sid 撞车整组标确认', () => {
    const a = mk({ name: 'A', doubanUrl: 'https://movie.douban.com/subject/7/' });
    const b = mk({ name: 'A 剧场版', doubanUrl: 'https://movie.douban.com/subject/7/' });
    const c = mk({ name: 'A剧场版' }); // 与 b 归一同名、无 sid —— 链入同组
    const groups = findDuplicateGroups([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
    expect(groups[0].kind).toBe('sid');
  });

  it('影视与书籍 sid 各自独立空间：同号不同域不成组', () => {
    const film = mk({ name: '同名作（影）', doubanUrl: 'https://movie.douban.com/subject/42/' });
    const book = mk({ name: '同名作（书）', typeTag: '书籍', doubanUrl: 'https://book.douban.com/subject/42/' });
    expect(findDuplicateGroups([film, book])).toEqual([]);
  });
});

describe('keepScore / mergeUserData（票 306 保留推荐与搬补）', () => {
  it('计分序：豆瓣指纹 > 用户数据 > 裸条目', () => {
    const bare = mk({ name: '甲' });
    const rated = mk({ name: '乙', rating: 9 });
    const rich = mk({ name: '丙', rating: 9, doubanUrl: 'https://movie.douban.com/subject/3/' });
    expect(keepScore(rich)).toBeGreaterThan(keepScore(rated));
    expect(keepScore(rated)).toBeGreaterThan(keepScore(bare));
  });

  it('搬补只补缺失：保留条已有的字段一律不覆盖；返回搬补字段数', () => {
    const keep = mk({ name: '保留', rating: 7, watchDate: '2026-08-01' });
    const drop = mk({ name: '删除', rating: 9, review: '来自重复条的感觉', watchDate: '2026-09-01' });
    const n = mergeUserData(keep, drop);
    expect(n).toBe(1); // 只搬补了影评（评分/观影日期保留条已有，不动）
    expect(keep.rating).toBe(7);
    expect(keep.watchDate).toBe('2026-08-01');
    expect(keep.review).toBe('来自重复条的感觉');
  });

  it('在看条评分 0 视为缺失，可被搬补', () => {
    const keep = mk({ name: '在看中', rating: 0 });
    const drop = mk({ name: '重复', rating: 8 });
    expect(mergeUserData(keep, drop)).toBe(1);
    expect(keep.rating).toBe(8);
  });
});
