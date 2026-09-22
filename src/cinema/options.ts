/**
 * 娱乐域国家/题材待选项池（ADR-0127 票 294）：默认待选项 + 用户自定义项（持久化
 * data.json 两键，全局共享一个选项池，同 collectCategories 先例）。自定义即固定——
 * 添加后出现在此后所有条目的编辑窗待选项里。
 * 存储：data.json `entertainmentCountries` / `entertainmentGenres`，顿号分隔字符串。
 */
import { tryGetSettings, saveSettings } from '../core/settings-provider';

/** 国家默认待选项（票 291 grill Q3：用户原话「美剧/韩剧」规范化为「美国/韩国」） */
export const DEFAULT_COUNTRY_OPTIONS: string[] = ['内地', '港台', '美国', '韩国'];

/** 题材默认待选项（用户原话「悬疑/爱情/年代等」的最小起步，扩充靠自定义固定） */
export const DEFAULT_GENRE_OPTIONS: string[] = ['悬疑', '爱情', '年代'];

const SEP = '、';

/** 读选项池：data.json 键解析 + 默认项并集（去重保序：默认在前，自定义在后） */
function readPool(key: 'entertainmentCountries' | 'entertainmentGenres', defaults: string[]): string[] {
  let stored: string[] = [];
  try {
    const s = tryGetSettings() as Record<string, unknown>;
    const raw = typeof s[key] === 'string' ? (s[key] as string) : '';
    stored = raw.split(SEP).map((v) => v.trim()).filter(Boolean);
  } catch {
    stored = [];
  }
  const out: string[] = [];
  for (const v of [...defaults, ...stored]) {
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** 写选项池：追加自定义值（已存在则幂等跳过）并落盘 */
async function addToPool(key: 'entertainmentCountries' | 'entertainmentGenres', defaults: string[], value: string): Promise<void> {
  const v = value.trim();
  if (!v) return;
  const pool = readPool(key, defaults);
  if (pool.includes(v)) return;
  const custom = pool.filter((x) => !defaults.includes(x));
  custom.push(v);
  const s = tryGetSettings() as Record<string, unknown>;
  s[key] = custom.join(SEP);
  await saveSettings();
}

export function getCountryOptions(): string[] {
  return readPool('entertainmentCountries', DEFAULT_COUNTRY_OPTIONS);
}

export function getGenreOptions(): string[] {
  return readPool('entertainmentGenres', DEFAULT_GENRE_OPTIONS);
}

export async function addCountryOption(value: string): Promise<void> {
  await addToPool('entertainmentCountries', DEFAULT_COUNTRY_OPTIONS, value);
}

export async function addGenreOption(value: string): Promise<void> {
  await addToPool('entertainmentGenres', DEFAULT_GENRE_OPTIONS, value);
}
