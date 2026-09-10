/**
 * 日常收集（collect 域）入口（issue 246）。
 *
 * 命令由 main.ts COMMANDS 表裸注册（铁律 2）；本文件只导出回调与数据/纯函数，
 * 供命令、home 快照与测试消费。命令 id 三段式 `bz-collect-<动作>`，16 个内置分类
 * 各一条汉字 id 命令（用户决策 9：自用裸调用直观优先，Obsidian 支持非 ASCII id）。
 */
import { openCollectCapture } from './ui';

export { openCollectPanel, closeCollectPanel, openCollectCapture, captureSelection, openCollectSettings, unloadCollect, collectSettingsSchema } from './ui';
export {
  COLLECT_HEADING, DEFAULT_COLLECT_FOLDER, DEFAULT_COLLECT_CATEGORIES,
  formatStamp, parseStamp, splitContentLines, buildEntryLines,
  appendEntryLines, appendCollect, initialFileContent, parseEntries, truncateText,
  normalizeCategories, ensureMdName, categoryFilePath,
  getCategories, getCollectFolder, upsertCategory, removeCategory, renameCategory,
} from './data';
export type { CollectCategory, CollectEntry } from './data';
export { captureToCategory, readRecentEntries, countSameDay, ensureFolder, readFileText } from './store';
export type { CaptureResult } from './store';

/** 分类命令 id（`bz-collect-<分类名>`） */
export function categoryCommandId(name: string): string {
  return `bz-collect-${name}`;
}

/** 分类命令回调：直达该分类的捕获输入（跳过分类选择步） */
export function openCategoryCapture(app: any, name: string): void {
  openCollectCapture(app, name);
}
