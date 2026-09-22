/**
 * 娱乐域国家/题材待选项池（ADR-0127 票 294；票 299 / ADR-0128 题材池改按组隔离；
 * 同日补充：默认题材池按组改定——影视四组/纪录片/公开课各有专属名单，书籍=中图法 22 大类）。
 * 国家池全局共享一个（data.json `entertainmentCountries`）；题材池按顶级类型分组——
 * 各组的自定义项互不可见（data.json `entertainmentGenresByGroup`，组 → 自定义段顿号串）。
 * 自定义即固定——添加后出现在此后该组条目的编辑窗待选项里。
 * 存量兼容：旧全局键 `entertainmentGenres`（票 294 语义，仅存自定义段）在组键缺省时作回落——
 * 旧自定义项对所有组保持可见（与隔离前行为一致），组键一旦写入即以组键为准。
 */
import { tryGetSettings, saveSettings } from '../core/settings-provider';

/** 国家默认待选项（票 291 grill Q3：用户原话「美剧/韩剧」规范化为「美国/韩国」） */
export const DEFAULT_COUNTRY_OPTIONS: string[] = ['内地', '港台', '美国', '韩国'];

/** 影视四组（电影/电视剧/短剧/动漫）共用默认题材（票 299 补充：用户改定） */
export const DEFAULT_FILM_GENRE_OPTIONS: string[] = [
  '剧情', '喜剧', '动作', '爱情', '科幻/奇幻', '悬疑/惊悚', '历史/传记', '纪实', '动画', '其他',
];

/** 纪录片组默认题材（票 299 补充：用户改定，16 项） */
export const DEFAULT_DOCUMENTARY_GENRE_OPTIONS: string[] = [
  '历史', '人物传记', '自然地理', '科学科技', '社会人文', '政治军事', '经济商业', '文化艺术',
  '美食旅行', '体育', '犯罪司法', '灾难危机', '健康医疗', '宗教哲学', '教育亲子', '环境动物',
];

/** 公开课组默认体裁：学科门类（票 299 补充：用户改定） */
export const DEFAULT_LECTURE_GENRE_OPTIONS: string[] = [
  '哲学', '经济学', '法学', '教育学', '文学', '历史学', '理学', '工学', '农学', '医学', '管理学', '艺术学',
];

/**
 * 书籍组默认体裁：《中国图书馆分类法》22 大类（票 299 grill Q5；类名去顿号——
 * 顿号是选项池存储分隔符，类名内不得出现）
 */
export const DEFAULT_BOOK_GENRE_OPTIONS: string[] = [
  '马列毛邓', '哲学宗教', '社会科学总论', '政治法律', '军事', '经济',
  '文化科学教育体育', '语言文字', '文学', '艺术', '历史地理', '自然科学总论',
  '数理科学和化学', '天文学地球科学', '生物', '医药卫生', '农业', '工业技术',
  '交通运输', '航空航天', '环境安全科学', '综合性图书',
];

/** 组 → 默认题材池（未知组回落影视默认；票 299 + 补充改定） */
export const DEFAULT_GENRE_OPTIONS_BY_GROUP: Record<string, string[]> = {
  电影: DEFAULT_FILM_GENRE_OPTIONS,
  电视剧: DEFAULT_FILM_GENRE_OPTIONS,
  短剧: DEFAULT_FILM_GENRE_OPTIONS,
  书籍: DEFAULT_BOOK_GENRE_OPTIONS,
  动漫: DEFAULT_FILM_GENRE_OPTIONS,
  纪录片: DEFAULT_DOCUMENTARY_GENRE_OPTIONS,
  公开课: DEFAULT_LECTURE_GENRE_OPTIONS,
};

const SEP = '、';

/** 顿号串解析（trim + 去空） */
function parseSep(raw: unknown): string[] {
  return (typeof raw === 'string' ? raw : '').split(SEP).map((v) => v.trim()).filter(Boolean);
}

/** 读国家选项池：data.json 键解析 + 默认项并集（去重保序：默认在前，自定义在后） */
export function getCountryOptions(): string[] {
  const stored = parseSep((tryGetSettings() as Record<string, unknown>)?.['entertainmentCountries']);
  const out: string[] = [];
  for (const v of [...DEFAULT_COUNTRY_OPTIONS, ...stored]) {
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * 旧全局键的默认内容（票 294 DEFAULT_SETTINGS 原值）——回落解析时剔除：
 * 该键默认值即这三项（非用户自定义），否则会污染书籍体裁池等非影视默认组
 */
const LEGACY_GLOBAL_GENRE_DEFAULTS: string[] = ['悬疑', '爱情', '年代'];

/** 读组自定义段：组键存在取组键；缺省回落旧全局键（票 299 存量平移语义：旧自定义项全组可见） */
function readGenreCustoms(group: string): string[] {
  const s = tryGetSettings() as Record<string, unknown>;
  const byGroup = s?.['entertainmentGenresByGroup'];
  if (byGroup && typeof byGroup === 'object' && typeof (byGroup as Record<string, unknown>)[group] === 'string') {
    return parseSep((byGroup as Record<string, string>)[group]);
  }
  return parseSep(s?.['entertainmentGenres']).filter((v) => !LEGACY_GLOBAL_GENRE_DEFAULTS.includes(v));
}

/** 读题材选项池（按组）：默认项在前 + 自定义段，去重保序；未知组回落影视默认 */
export function getGenreOptions(group: string): string[] {
  const defaults = DEFAULT_GENRE_OPTIONS_BY_GROUP[group] ?? DEFAULT_FILM_GENRE_OPTIONS;
  const out: string[] = [];
  for (const v of [...defaults, ...readGenreCustoms(group)]) {
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** 写国家选项池：追加自定义值（已存在则幂等跳过）并落盘 */
export async function addCountryOption(value: string): Promise<void> {
  const v = value.trim();
  if (!v) return;
  const pool = getCountryOptions();
  if (pool.includes(v)) return;
  const custom = pool.filter((x) => !DEFAULT_COUNTRY_OPTIONS.includes(x));
  custom.push(v);
  const s = tryGetSettings() as Record<string, unknown>;
  s['entertainmentCountries'] = custom.join(SEP);
  await saveSettings();
}

/** 写题材选项池（按组）：追加到该组自定义段并落盘；默认项不重复写入；回落中的旧全局自定义项随首次写入固化进组键 */
export async function addGenreOption(group: string, value: string): Promise<void> {
  const v = value.trim();
  if (!v) return;
  if ((DEFAULT_GENRE_OPTIONS_BY_GROUP[group] ?? DEFAULT_FILM_GENRE_OPTIONS).includes(v)) return;
  const customs = readGenreCustoms(group);
  if (customs.includes(v)) return;
  customs.push(v);
  const s = tryGetSettings() as Record<string, unknown>;
  const byGroup = s?.['entertainmentGenresByGroup'];
  const obj = byGroup && typeof byGroup === 'object' ? { ...(byGroup as Record<string, string>) } : {};
  obj[group] = customs.join(SEP);
  s['entertainmentGenresByGroup'] = obj;
  await saveSettings();
}
