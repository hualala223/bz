/**
 * 影院豆瓣重抓命令（票 301 追加决策 Q15）：抓错了清掉重来。
 * 按笔记类型分流：书籍 → 书架域图书链路（refetchBookDoubanWithPrompt，含改词弹框）；
 * 影视 → clearMovieDoubanFields 清字段+旧海报（D3 单点在域 fetcher）→ fetchNoteDouban
 * （query 覆盖，弹框改词）。清除口径：只清豆瓣来源字段——用户自有字段（评分/状态/感想）
 * 一律不动。
 */
import type { App, TFile } from 'obsidian';
import { notice } from '../core/notice';
import { openTextPromptDialog } from '../core/prompt-dialog';
import { fetchNoteDouban, extractMovieName, clearMovieDoubanFields } from './douban-fetcher';
import { fetchDepsFromSettings } from './douban-queue';
import { LEGACY_TAG_MAP } from './constants';
import { refetchBookDoubanWithPrompt } from '../bookshelf/douban-refetch';

/** fm tags 判书籍（旧「小说」tag 归一；与队列 getGroupSafe 同口径的轻量版） */
function isBookNote(app: App, file: TFile): boolean {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter as { tags?: unknown } | undefined;
  const tags = fm?.tags;
  const list: string[] = Array.isArray(tags)
    ? tags.map(String)
    : typeof tags === 'string'
      ? tags.split(/[,\s]+/)
      : [];
  return list.some((t) => (LEGACY_TAG_MAP[t] ?? t) === '书籍');
}

/** 重抓豆瓣（Q17c）：命令 bz-cinema-douban-refetch 无参走当前打开的笔记；详情卡「重抓」
 *  按钮传条目文件（it.file）——不用离开面板翻底层 md */
export async function refetchCinemaDouban(app: App, target?: TFile): Promise<void> {
  const file = target ?? app.workspace.getActiveFile();
  if (!file) {
    notice('没有打开的笔记', 'error');
    return;
  }
  const deps = fetchDepsFromSettings(app);
  if (isBookNote(app, file)) {
    await refetchBookDoubanWithPrompt(app, file, deps);
    return;
  }
  const name = extractMovieName(file.name);
  const query = await openTextPromptDialog({
    title: '重抓豆瓣（影视）',
    message: '确认搜索词（同名/翻拍多时可补年份）：',
    defaultValue: name,
    placeholder: '片名 [年份]',
  });
  if (query === null) return; // 用户取消，不动文件
  if (!query) {
    notice('搜索词为空，已取消重抓', 'error');
    return;
  }
  try {
    await clearMovieDoubanFields(app, file);
  } catch {
    notice('旧豆瓣数据清理失败，已取消重抓', 'error');
    return;
  }
  const outcome = await fetchNoteDouban(app, file, deps, { query });
  if (outcome.ok) {
    notice(outcome.skipped ? '该条目豆瓣信息本已齐全，未重抓' : `豆瓣信息已重抓：${name}`);
  } else if (outcome.reason === 'blocked') notice('豆瓣风控拦截，稍后重试（重载插件后开面板也会自动补抓）', 'error');
  else if (outcome.reason === 'notfound') notice('豆瓣没搜到该条目，可换搜索词再重抓', 'error');
  else notice('重抓失败（网络/写盘异常）', 'error');
}
