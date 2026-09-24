/**
 * 影院（cinema）域常量：类型/状态/评分（复刻自 movie 域，独立成域不共享）
 */
/**
 * 状态枚举：想看=0 / 在看=1 / 已看=2（面板筛选/徽标等消费口径）。
 * 注意与「评分编码」是两套数值（错位勿混）：评分 -1=想看 / 0=在看 / >0=已看，
 * 评分 → 状态枚举的推断在 data.ts parseMovieFile（rating === -1/0/其余）。
 */
export const STATUS_WANT = 0;
export const STATUS_WATCHING = 1;
export const STATUS_WATCHED = 2;

/**
 * 默认评分（编辑窗预填默认分；10 分制中点 5）。
 * 评分编码口径（≠上方状态枚举）：-1=想看 / 0=在看 / >0（或无评分）=已看，
 * 消费推断唯一落点 data.ts parseMovieFile。
 */
export const DEFAULT_RATING = 5;

/**
 * 类型分组：组 → 细分 tag 清单（ADR-0127 票 293：固定七项顶级类型，「剧集」退役、
 * 细分剧 tag 归一映射「电视剧」；票 300：动漫细分退役——日漫/国漫/美漫归一映射「动漫」，
 * 七项顶级类型全部组名即 tag；不开放顶级类型自定义。
 * 票 299 / ADR-0128：「小说」正名「书籍」，旧 tag 经 LEGACY_TAG_MAP 读侧归一）
 */

/**
 * 文件名非法字符集（Windows 保留集；名称源自文件名《X》，改名拦截/海报落盘替换共用）：
 * 域内统一从此取口径，禁止各处内联字符类（审查批 C 收敛）。
 * 消费：douban-fetcher（海报文件名替换 `_`）；ui.ts 改名拦截 ILLEGAL_NAME_RE 待收口切换。
 */
export const ILLEGAL_NAME_CHARS = '\\\\/:*?"<>|';
/** 同字符集的整词正则（.test() 拦截用；供 ui.ts 侧后续一行切换） */
export const ILLEGAL_NAME_RE = new RegExp(`[${ILLEGAL_NAME_CHARS}]`);
/** 同字符集的全局正则（.replace 全量替换用；douban-fetcher 海报文件名清洗） */
export const ILLEGAL_NAME_RE_GLOBAL = new RegExp(`[${ILLEGAL_NAME_CHARS}]`, 'g');

/** 类型分组：组 → 细分 tag 清单 */
export const TYPE_GROUPS: Record<string, string[]> = {
  电影: ['电影'],
  电视剧: ['电视剧'],
  短剧: ['短剧'],
  书籍: ['书籍'],
  动漫: ['动漫'],
  纪录片: ['纪录片'],
  公开课: ['公开课'],
};

export const ALL_TAGS: string[] = Object.values(TYPE_GROUPS).flat();

/**
 * 旧 tag → 新 tag 归一映射（读侧归一显示，fm 原值不改写）：
 * 旧「剧集」组细分 tag → 「电视剧」（票 293）；「小说」→「书籍」组正名（票 299 / ADR-0128）；
 * 旧动漫细分 tag → 「动漫」（票 300 细分退役）
 */
export const LEGACY_TAG_MAP: Record<string, string> = {
  小说: '书籍',
  日漫: '动漫',
  国漫: '动漫',
  美漫: '动漫',
  国产剧: '电视剧',
  美剧: '电视剧',
  英剧: '电视剧',
  德剧: '电视剧',
  日剧: '电视剧',
  韩剧: '电视剧',
  哥伦比亚剧: '电视剧',
};

/** 组展示顺序（左栏/移动端分类条） */
export const GROUP_ORDER: string[] = ['电影', '电视剧', '短剧', '书籍', '动漫', '纪录片', '公开课', '其他'];

/** 类型色（功能色，双主题一致；剧集色值由电视剧继承，短剧/书籍新增） */
export const TYPE_COLORS: Record<string, string> = {
  电影: '#e6951d',
  电视剧: '#3d7bd6',
  短剧: '#d9534f',
  书籍: '#3aa08f',
  动漫: '#d64d8f',
  纪录片: '#45a35c',
  公开课: '#9b6dd4',
  其他: '#888',
};

/** tag → 组（旧剧集细分 tag 经归一映射命中「电视剧」） */
export function getGroupForTag(tag: string): string | null {
  const normalized = LEGACY_TAG_MAP[tag] ?? tag;
  for (const [group, tags] of Object.entries(TYPE_GROUPS)) {
    if (tags.includes(normalized)) return group;
  }
  return null;
}

/** tag → 组（未知 tag 归「其他」） */
export function getGroupSafe(tag: string): string {
  return getGroupForTag(tag) ?? '其他';
}

/**
 * 分 ↔ 星：满星 5 颗 = 10 分，半颗星 = 1 分；分数先 ÷2 得星数，再四舍五入到 0.5 星。
 * 固定 5 星轨道：实心 ★ = 已得整星，空心 ☆ = 半星或未得分。
 * 例：9.6 → ★★★★★；9.2 → ★★★★☆；8.0 → ★★★★☆；5.4 → ★★☆☆☆
 */
export function getStarString(rating: number): string {
  if (!rating || rating <= 0) return '';
  const stars = Math.min(Math.round((rating / 2) * 2) / 2, 5);
  const full = Math.floor(stars);
  let s = '';
  for (let i = 0; i < full; i++) s += '★';
  for (let j = full; j < 5; j++) s += '☆';
  return s;
}

// ======================= 豆瓣抓取适用类型（票 293） =======================

/** 豆瓣自动抓取仅对 电影/电视剧 生效（短剧搜不到、书籍是图书条目不适用；手动「在豆瓣打开」不受限） */
export const DOUBAN_ELIGIBLE_TYPES: string[] = ['电影', '电视剧'];

/** 类型 tag 是否可自动抓豆瓣（旧剧集细分 tag 归一后判定） */
export function doubanEligibleTag(tag: string | null | undefined): boolean {
  if (!tag) return false;
  const normalized = LEGACY_TAG_MAP[tag] ?? tag;
  return DOUBAN_ELIGIBLE_TYPES.includes(normalized);
}

// ======================= 集数进度适用类型（票 295） =======================

/** 集数（总集数/正在看集数）仅对 电视剧/短剧 生效（票 295；fm 两键也仅剧类写入） */
export const EPISODE_TYPES: string[] = ['电视剧', '短剧'];

/** 类型 tag 是否支持集数进度（旧剧集细分 tag 归一后判定） */
export function episodesEligibleTag(tag: string | null | undefined): boolean {
  if (!tag) return false;
  const normalized = LEGACY_TAG_MAP[tag] ?? tag;
  return EPISODE_TYPES.includes(normalized);
}

// ======================= 章节进度适用类型（票 301，对齐票 295 集数口径） =======================

/** 章节（总章节数/正在看章节）仅对 书籍 生效；fm 两键也仅书籍写入 */
export const CHAPTER_TYPES: string[] = ['书籍'];

/** 类型 tag 是否支持章节进度（旧「小说」tag 归一后判定） */
export function chaptersEligibleTag(tag: string | null | undefined): boolean {
  if (!tag) return false;
  const normalized = LEGACY_TAG_MAP[tag] ?? tag;
  return CHAPTER_TYPES.includes(normalized);
}

// ======================= 风格框架（issue 236 / ADR-0103） =======================

// 当前仅午夜场上岸（gazette/booth 为 styles.css 预留段，设置项见 settings.ts）；
// 未来多风格时在此定义风格 id 联合类型（读设置取值属行为层，ADR-0104 纯度守卫）。

// ======================= 名称合法性（深审批A P3-7：三入口统一校验） =======================

/** 人话提示主干（编辑改名/新增建档/AI 加想看同源，尾巴按入口补动作指引） */
export const ILLEGAL_NAME_HINT = '名称含非法字符（\\ / : * ? " < > |）';

/** 名称是否含非法字符（saveEdit / saveNew / quickAddWant 统一跑，不再只有编辑改名一入口把关）；
 *  正则复用上方批 C 单源 ILLEGAL_NAME_RE（主线程收口归一：批 A 原私有副本与此同名，去重） */
export function hasIllegalNameChar(name: string): boolean {
  return ILLEGAL_NAME_RE.test(name);
}
