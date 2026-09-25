/**
 * 娱乐条目查重/去重（票 306）：双口径判定 + 保留推荐 + 用户数据搬补。
 * 判定（用户拍板 Q7-C）：豆瓣 sid 相同 = 确认重复（影视 movie / 书籍 book 的 subject 同构，
 * 直接比 id）；名称归一（去书名号/空格/大小写）相同 = 疑似重复——兜住没抓过豆瓣的老条目，
 * 也可能误伤重名不同作品，所以裁决留人。两种判定撞到的成员并成一组（union-find），
 * 组内只要出现过 sid 撞车就整组标「确认」，否则「疑似」。
 * 保留推荐（Q10）：信息最全计分——豆瓣指纹有值权重最高，用户数据（评分/影评）次之，
 * 观影日期新者微加。被删条的评分/影评/观影日期搬补给保留条缺失项，已有的一律不覆盖。
 * 纯数据层：不碰 DOM / 不碰 vault——删除（回收站）与落盘由 ui.ts 行为层承接。
 */
import type { CinemaItem } from './state';

/** 豆瓣指纹（影视 movie / 书籍 book 是两个独立编号空间，须带站点前缀比较：
 *  https://movie.douban.com/subject/42/ ≠ https://book.douban.com/subject/42/） */
export function extractDoubanSid(url: string | null): string | null {
  const m = /(movie|book)\.douban\.com\/subject\/(\d+)/.exec(url ?? '');
  return m ? `${m[1]}:${m[2]}` : null;
}

/** 名称归一：去书名号与空格（\s 含全角空格）、统一小写——同人异写判疑似重复 */
export function normalizeEntryName(name: string): string {
  return name.replace(/[《》\s]/g, '').toLowerCase();
}

export interface DedupeGroup {
  /** sid=确认重复（豆瓣同一条目）；name=疑似重复（归一同名，裁决留人） */
  kind: 'sid' | 'name';
  members: CinemaItem[];
  /** 推荐保留的下标（members 内信息最全者；组内已按 keepScore 降序，恒 0） */
  keepIndex: number;
}

/** 保留推荐计分：豆瓣指纹 100 > 评分/影评各 10 > 豆瓣评分 5 > 观影日期有无 1 */
export function keepScore(it: CinemaItem): number {
  let s = extractDoubanSid(it.doubanUrl) ? 100 : 0;
  if (it.rating !== null && it.rating > 0) s += 10;
  if (it.review && it.review.trim()) s += 10;
  if (it.doubanRating !== null && it.doubanRating.trim()) s += 5;
  if (it.watchDate) s += 1;
  return s;
}

/** 查重分组：重叠判定并组；组内按 keepScore 降序（keepIndex 恒 0），组级确认重复排前 */
export function findDuplicateGroups(items: CinemaItem[]): DedupeGroup[] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const bySid = new Map<string, number>();
  const byName = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const sid = extractDoubanSid(items[i].doubanUrl);
    if (sid) {
      const prev = bySid.get(sid);
      if (prev === undefined) bySid.set(sid, i);
      else union(prev, i);
    }
    const nameKey = normalizeEntryName(items[i].name);
    const prevName = byName.get(nameKey);
    if (prevName === undefined) byName.set(nameKey, i);
    else union(prevName, i);
  }
  const comps = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = comps.get(root);
    if (list) list.push(i);
    else comps.set(root, [i]);
  }
  const groups: DedupeGroup[] = [];
  for (const members of comps.values()) {
    if (members.length < 2) continue;
    const list = members.map((i) => items[i]);
    // 组内判性质：有 sid 的成员里出现重号 = 确认重复；纯归一同名 = 疑似
    const sids = list.map((it) => extractDoubanSid(it.doubanUrl)).filter((s): s is string => !!s);
    const kind: DedupeGroup['kind'] = new Set(sids).size < sids.length ? 'sid' : 'name';
    list.sort((a, b) => keepScore(b) - keepScore(a));
    groups.push({ kind, members: list, keepIndex: 0 });
  }
  groups.sort((a, b) => (a.kind === b.kind ? b.members.length - a.members.length : a.kind === 'sid' ? -1 : 1));
  return groups;
}

/** 被删条 → 保留条用户数据搬补（就地改 keep）：仅补缺失，已有的一律不覆盖。
 *  返回搬补的字段数（0 = 没动保留条，行为层据此决定要不要落盘） */
export function mergeUserData(keep: CinemaItem, drop: CinemaItem): number {
  let n = 0;
  if ((keep.rating === null || keep.rating <= 0) && drop.rating !== null && drop.rating > 0) {
    keep.rating = drop.rating;
    n++;
  }
  if (!(keep.review && keep.review.trim()) && drop.review && drop.review.trim()) {
    keep.review = drop.review;
    n++;
  }
  if (!keep.watchDate && drop.watchDate) {
    keep.watchDate = drop.watchDate;
    n++;
  }
  return n;
}
