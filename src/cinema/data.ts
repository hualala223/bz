/**
 * 影院（cinema）域数据层：扫描笔记 → 条目；排序（观影日期倒序）；筛选
 */
import type { App, TFile } from 'obsidian';
import { ALL_TAGS, getGroupSafe, LEGACY_TAG_MAP, REWATCH_SHELF, STATUS_WATCHED, STATUS_WANT, STATUS_WATCHING } from './constants';
import { extractMovieName } from './douban-fetcher';
import { statusNum } from './shared';
import type { CinemaItem } from './state';
import { M } from './state';

/** frontmatter `tags` → string[]（兼容数组 / 单个字符串 / 缺失）。
 *  影院域 tag 归一化单源：UI 写盘（ui.ts 改名替换）与解析（parseMovieFile）共用，
 *  避免同域第二份漂移（审查收口）。 */
export function normalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  if (typeof raw === 'string' && raw) return [raw];
  return [];
}

/** frontmatter `重看` → string[]（重温时刻列表，新档日期+时刻、旧档 date-only；兼容数组 / 单字符串 / 缺失，口径同 normalizeTags）。
 *  建档/编辑不写此键——只有「重温 +1」与未来的删除入口落盘，旧笔记无键照旧 */
export function normalizeRewatches(raw: unknown): string[] {
  return normalizeTags(raw).filter(Boolean);
}

/** frontmatter `片单` → string[]（自建片单；兼容数组 / 单字符串 / 缺失，口径同 normalizeTags）。
 *  归入/移出弹层落盘，建档/编辑不写此键 */
export function normalizeLists(raw: unknown): string[] {
  return normalizeTags(raw).filter(Boolean);
}

/** 片单枚举（侧栏 / 归入弹层消费）：内置「重映厅」恒首位，其余按成员数降序、同数按名称。
 *  纯函数显式入参（原型侧/纯层同源可用）；空片单不出现（没有成员就没有枚举） */
export function allLists(items: CinemaItem[]): string[] {
  const count = new Map<string, number>();
  for (const it of items) for (const name of it.lists) count.set(name, (count.get(name) ?? 0) + 1);
  const rest = [...count.entries()]
    .filter(([name]) => name !== REWATCH_SHELF)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  return count.has(REWATCH_SHELF) ? [REWATCH_SHELF, ...rest] : rest;
}

/** 解析单条笔记（frontmatter → CinemaItem）；无 frontmatter 返回 null */
export function parseMovieFile(file: TFile, app: App): CinemaItem | null {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache || !cache.frontmatter) return null;
  const fm = cache.frontmatter;

  // 《名称》提取域内单源（审查批 C 收敛）：basename 无扩展名，与 fetcher 版（先剥 .md）语义一致
  const name = extractMovieName(file.basename);

  // tags → typeTag（ALL_TAGS 顺序优先；无固定 tag 取首个；完全无 tag 跳过）
  // 归一化走单源 normalizeTags（兼容数组/单字符串/缺失，与 UI/判定命令同口径）
  const tags = normalizeTags(fm.tags);
  let typeTag: string | null = null;
  for (const t of ALL_TAGS) {
    if (tags.includes(t)) {
      typeTag = t;
      break;
    }
  }
  if (!typeTag) {
    if (tags.length === 0) return null;
    typeTag = tags[0];
  }
  // 票 293：旧「剧集」细分 tag 归一为「电视剧」（仅内存显示口径，fm 原值不改写）
  typeTag = LEGACY_TAG_MAP[typeTag] ?? typeTag;

  const watchDate = fm['观影日期']?.toString() ?? null;
  const rawRating = fm['评分'];
  const ratingNum =
    rawRating === undefined || rawRating === null || rawRating === ''
      ? null
      : Number(rawRating);

  // 状态单源键「状态」：评分只当分值，不承担状态语义。评分编码 -1/0 于 2026-09-30 退役，
  // 兼容期结束（2026-10-03 拍板）：旧档评分推断与 -1/0 清洗移除——【上游】库已全量迁移且零残留。
  // 本地差异（票 309 兼容层）：本地库未跑过状态键迁移，旧档无「状态」键时仍按编码推断
  // （-1=想看 / 0=在看 / 其余=已看，ours 原口径）；带「状态」键的新档直读，非法值仍落已看。
  const stRaw = typeof fm['状态'] === 'string' ? (fm['状态'] as string).trim() : '';
  const status = stRaw
    ? statusNum(stRaw)
    : ratingNum === -1 ? STATUS_WANT : ratingNum === 0 ? STATUS_WATCHING : STATUS_WATCHED;
  const rating = ratingNum;

  return {
    file,
    name: name ?? '',
    typeTag,
    group: getGroupSafe(typeTag),
    watchDate,
    rating,
    status,
    // 状态日期（想看日期/在看日期）：旧笔记无键 = null，不参与显示
    wantDate: fm['想看日期']?.toString() ?? null,
    watchingDate: fm['在看日期']?.toString() ?? null,
    // 已看日期（issue 536）只读新键；非已看态无键自然为 null——一条没看过的条目不许凭空出「已看」日
    // （幽灵节点教训保留）。本地差异（票 310）：上游已删「观影日期」回落（其库 665 篇已看笔记均已带新键、
    // 零回填），本地库未批量回写（兼容性冻结，票 309 裁决），故保留**仅已看态**的观影日期回落——
    // 老已看档显示不回退，想看/在看档绝不凭空出已看日。
    watchedDate: fm['已看日期']?.toString() ?? (status === STATUS_WATCHED ? fm['观影日期']?.toString() ?? null : null),
    rewatches: normalizeRewatches(fm['重看']),
    lists: normalizeLists(fm['片单']),
    shelvedOnly: fm['片单收纳'] === true,
    // 海报（票 301）：书籍笔记封面写 fm「封面」（无「海报」键），读侧兜底拾取
    poster: fm['海报']?.toString() || fm['封面']?.toString() || null,
    review: fm['影评']?.toString() ?? null,
    genre: fm['类型']?.toString() ?? null,
    director: fm['导演']?.toString() ?? null,
    actors: fm['主演']?.toString() ?? null,
    region: fm['制片国家/地区']?.toString() ?? null,
    year: fm['上映日期'] ? String(fm['上映日期']).slice(0, 4) : null,
    releaseDate: fm['上映日期'] ? String(fm['上映日期']) : null,
    doubanRating: fm['豆瓣评分'] !== undefined && fm['豆瓣评分'] !== '' ? String(fm['豆瓣评分']) : null,
    doubanUrl: /^https?:\/\//.test(String(fm['豆瓣链接'] ?? '')) ? String(fm['豆瓣链接']) : null,
    synopsis: fm['简介']?.toString() ?? null,
    // 片长/季集：原独立观影报告的两项统计源字段（ADR-0090 并入内嵌分析页）
    duration: fm['片长']?.toString() ?? null,
    seasonText: fm['季集']?.toString() ?? null,
    // 国家（票 294）：fm 键「国家」单值；豆瓣「制片国家/地区」独立保留不走此键
    country: fm['国家']?.toString() ?? null,
    // 题材（票 294）：fm 键「类型」按顿号/逗号/斜杠分隔解析为多选数组（豆瓣题材串兼容）
    genres: parseGenres(fm['类型']),
    // 集数（票 295）：fm 键「总集数」「正在看集数」仅剧类写入，读侧对任意值宽容解析
    episodesTotal: parseEpisodeCount(fm['总集数']),
    episodesWatching: parseEpisodeCount(fm['正在看集数']),
    // 豆瓣热门短评（上游 issue 409 融合）：fm 键「热门短评」单值原文
    hotComment: fm['热门短评']?.toString() ?? null,
    // 章节（票 301，对齐集数口径）：fm 键「总章节数」「正在看章节」仅书籍写入
    chaptersTotal: parseEpisodeCount(fm['总章节数']),
    chaptersWatching: parseEpisodeCount(fm['正在看章节']),
    // 书籍字段行（票 301）：详情卡「豆瓣信息」区书籍字段（非空才进行）
    bookInfo: ([
      ['作者', fm['作者']],
      ['出版社', fm['出版社']],
      ['出版年', fm['出版年']],
      ['译者', fm['译者']],
      ['ISBN', fm['ISBN']],
      ['页数', fm['页数']],
      ['出品方', fm['出品方']],
    ] as [string, unknown][]).filter(([, v]) => v !== undefined && String(v) !== '').map(([k, v]) => [k, String(v)]),
  };
}

/** 题材串解析：「悬疑、爱情」/「悬疑,爱情」/「悬疑 / 爱情」统一为数组（豆瓣题材串兼容） */
export function parseGenres(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') return [];
  const str = String(raw);
  return str.split(/[、,，/]/).map((v) => v.trim()).filter(Boolean);
}

/** 集数解析（票 295）：正整数有效，其余（空/0/负/非数）一律 null */
export function parseEpisodeCount(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}


/**
 * 海报路径 rename 联动目标扫描（issue 337 审计#11）：`海报` 是纯路径非双链，
 * Obsidian 改名海报文件不联动 frontmatter。扫影院目录全部 md 的 metadataCache frontmatter，
 * 返回 海报==oldPath 的笔记（不依赖面板是否开过，M.items 未填充也能命中）。
 * 读法与 parseMovieFile 同口径（toString 剥引号——metadataCache 已解析 YAML）。
 */
export function findPosterRenameTargets(app: App, oldPath: string): TFile[] {
  if (!oldPath) return [];
  const files = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(M.folderPath + '/'));
  const hits: TFile[] = [];
  for (const file of files) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm && fm['海报'] != null && String(fm['海报']) === oldPath) hits.push(file);
  }
  return hits;
}

/** 重建条目列表（扫描 M.folderPath 下全部 md） */
export function rebuildItems(app: App): CinemaItem[] {
  const newItems: CinemaItem[] = [];
  const files = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(M.folderPath + '/'));
  for (const file of files) {
    try {
      const item = parseMovieFile(file, app);
      if (item) {
        newItems.push(item);
        continue;
      }
      // 文件在但 metadataCache 尚未索引（新建后立即重建）→ 保留内存既有条目，
      // 防刚添加的影片闪现后被整体替换掉（缓存就绪的下次重建会正常解析接管）
      if (!app.metadataCache.getFileCache(file)) {
        const kept = M.items.find((p) => p.file?.path === file.path);
        if (kept) newItems.push(kept);
      }
    } catch (error) {
      console.warn('处理影视文件失败:', file.path, error);
    }
  }
  M.items.length = 0;
  M.items.push(...newItems);
  return newItems;
}

/** 观影日期时间戳（无日期 → 0，排最后） */
export function dateVal(it: CinemaItem): number {
  if (!it.watchDate) return 0;
  const t = new Date(it.watchDate).getTime();
  return isNaN(t) ? 0 : t;
}

/** 排序：按观影日期倒序（新→旧）；无日期排最后 */
export function sortByDateDesc(list: CinemaItem[]): CinemaItem[] {
  return [...list].sort((a, b) => dateVal(b) - dateVal(a));
}

/** 按创建时间（笔记文件 ctime）倒序；编辑（mtime）不改变排序，文件无 ctime 时按名称兜底保持稳定 */
export function sortByCreatedDesc(list: CinemaItem[]): CinemaItem[] {
  return [...list].sort((a, b) => {
    const ta = a.file ? a.file.stat.ctime : 0;
    const tb = b.file ? b.file.stat.ctime : 0;
    if (ta !== tb) return tb - ta;
    return (b.name || '').localeCompare(a.name || '');
  });
}

/** 按评分倒序：已看（评分>0）降序；未看（未评分/想看/在看）排最后（其内部按日期倒序） */
export function sortByRatingDesc(list: CinemaItem[]): CinemaItem[] {
  return [...list].sort((a, b) => {
    const ar = a.rating && a.rating > 0 ? a.rating : -1;
    const br = b.rating && b.rating > 0 ? b.rating : -1;
    if (ar !== br) return br - ar;
    return dateVal(b) - dateVal(a);
  });
}

/** 按当前排序模式排序（date/created/rating）；未识别模式回退观影日期倒序 */
export function applySortMode(list: CinemaItem[], mode: string): CinemaItem[] {
  if (mode === 'created') return sortByCreatedDesc(list);
  if (mode === 'rating') return sortByRatingDesc(list);
  return sortByDateDesc(list);
}

/** 当前筛选（类型/状态/片单/搜索）+ 当前排序模式（先筛选后排序，保证列表正确） */
export function getDisplayItems(): CinemaItem[] {
  let list = [...M.items];
  if (M.typeFilter) list = list.filter((it) => it.group === M.typeFilter);
  const sf = M.statusFilter;
  if (sf) list = list.filter((it) => it.status === statusNum(sf));
  if (M.listFilter) list = list.filter((it) => it.lists.includes(M.listFilter as string));
  // 片单收纳条目只在片单视图出现（2026-09-30 拍板：一键导入不混入正常影视视图）——
  // 无片单筛选时（全部/类型/状态/搜索）整体排除
  else list = list.filter((it) => !it.shelvedOnly);
  // 票 294：国家筛选（'未填' = 只看国家为空的条目）
  if (M.countryFilter === '未填') list = list.filter((it) => !it.country);
  else if (M.countryFilter) list = list.filter((it) => it.country === M.countryFilter);
  if (M.searchKeyword) {
    const kw = M.searchKeyword.toLowerCase();
    list = list.filter((it) => {
      return (
        (it.name && it.name.toLowerCase().includes(kw)) ||
        (it.typeTag && it.typeTag.toLowerCase().includes(kw)) ||
        (it.review && it.review.toLowerCase().includes(kw)) ||
        (it.director && it.director.toLowerCase().includes(kw)) ||
        (it.actors && it.actors.toLowerCase().includes(kw))
      );
    });
  }
  return applySortMode(list, M.sortMode);
}

/** 重建数据 + 重渲染 */
export function refreshDataAndView(app: App): void {
  rebuildItems(app);
  M.renderFn?.();
}
