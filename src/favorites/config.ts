/**
 * 收藏本配置（ticket 11 移植 + ticket 177 重构）：源码 收藏本.js L12-25。
 * 9 类固定标签（顺序即 UI 顺序）：数据 tags[] 存 label（如 'GitHub'）。
 * 归档冷存（ADR-0074）为数据层字段扩展，见 types.ts。
 *
 * issue 363 标签自定义：9 类降为内置 seed（DEFAULT_TAGS），定义本体存 data.json 设置键
 * favoriteTags（issue 363 修订，2026-09-16 拍板：伴生文件 favorites.tags.json 退役——
 * favorites.json 顶层纯条目数组契约不动：主页.js 读 favorites.length、checkup 字段漂移
 * 检查依赖纯数组根）。getTags 读设置层即时生效（无键/空/坏回退 seed，不落盘）；
 * setTags 写设置层（持久化由 data.saveTags / 旧文件迁移任务收口，首次改动才落盘）。
 */
import { tryGetSettings } from '../core/settings-provider';
import { normalizeStorageDir, storageFile } from '../core/storage';
export { getTags, setTags, resetTagsState, getTagById } from './tags';
import type { FavTag } from './types';

export const CONFIG = {
  /** 默认存储目录（文件名固定 favorites.json，设置只允许改目录） */
  DEFAULT_STORAGE_PATH: 'CONFIG/STORAGE',
  /** 数据文件名（固定，不允许用户修改） */
  STORAGE_FILE: 'favorites.json',
  /** 标签定义设置键（data.json；旧伴生文件 favorites.tags.json 仅迁移期识别，见 data.ts） */
  TAGS_SETTINGS_KEY: 'favoriteTags',
};


/** 新增标签 id（'t' + 时间戳36进制 + 同毫秒递增序；id 一经生成不再变化）。
 *  审查修复：纯时间戳同毫秒批量新增/归一化多行会撞 id，追加毫秒内计数器保证唯一。 */




/**
 * 归一化存储目录。
 *
 * @deprecated 单源收编（深审 ARCH-2，bz-fix-core-pledges）：目录解析本体已上沉
 * core/storage normalizeStorageDir（含 .json 尾段剥除防御），本口仅为存量消费方
 * （checkup files.ts / home river.ts / 域内 app·ui）保留的兼容转发，勿新增引用。
 */
export function getStorageDir(value?: string): string {
  return normalizeStorageDir(value);
}

/**
 * 完整数据文件路径（目录 + 固定文件名）。
 *
 * @deprecated 同 getStorageDir：兼容转发 ≡ storageFile(STORAGE_FILE, normalizeStorageDir(value))，
 * 新代码直接走 core/storage 单源。
 */
export function getStoragePath(value?: string): string {
  return storageFile(CONFIG.STORAGE_FILE, getStorageDir(value));
}


/** 补协议头（无 http(s) 前缀时补 https://） */
export function normalizeUrl(url: string): string {
  const u = (url || '').trim();
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}

/** URL 形态判定（ticket 188 贴链自动搬家）：无空白的 http(s):// 或 www. 开头串 */
export function isUrlLike(text: string): boolean {
  const t = (text || '').trim();
  return t.length > 0 && !/\s/.test(t) && (/^https?:\/\//i.test(t) || /^www\./i.test(t));
}
