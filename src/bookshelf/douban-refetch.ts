/**
 * 书籍豆瓣重抓编排（票 301 追加决策 Q15/Q16）：清豆瓣字段 → 弹搜索词确认框
 * （默认 = 书名 + fm 作者，可改词/补 ISBN——重名书的命中率靠它）→ 重跑图书抓取链路
 * → 成功后自动上架娱乐（Q16b，书库书；娱乐笔记自身路径已存在自动跳过）。
 * 书架命令（bz-bookshelf-douban-refetch）与影院书籍分支共用 refetchBookDoubanWithPrompt。
 */
import type { App, TFile } from 'obsidian';
import { notice } from '../core/notice';
import { openTextPromptDialog } from '../core/prompt-dialog';
import { fmFieldValue } from '../core/douban/fetch-core';
import { refetchMdBookDouban, type BookFetchDeps } from './douban-fetcher';
import { fetchDepsFromSettings } from './douban-queue';
import { resolveFolderPath } from './data';

/**
 * 带弹框的 md 书重抓。返回 'ok'（已重抓）/ 'skipped'（本已齐全未动）/ 'cancel'（用户取消）。
 * 结果通知在本函数内给出（两域文案一致）。
 */
export async function refetchBookDoubanWithPrompt(app: App, file: TFile, deps: BookFetchDeps): Promise<'ok' | 'skipped' | 'cancel'> {
  let content: string;
  try {
    content = await app.vault.read(file);
  } catch {
    notice('笔记读取失败，无法重抓', 'error');
    return 'cancel';
  }
  const author = fmFieldValue(content, '作者');
  const defaultQuery = author ? `${file.basename} ${author}` : file.basename;
  const query = await openTextPromptDialog({
    title: '重抓豆瓣（书籍）',
    message: '确认搜索词。重名书多，可补作者/ISBN 提高命中：',
    defaultValue: defaultQuery,
    placeholder: '书名 [作者] [ISBN]',
  });
  if (query === null) return 'cancel'; // 用户取消，不动文件
  if (!query) {
    notice('搜索词为空，已取消重抓', 'error');
    return 'cancel';
  }
  const outcome = await refetchMdBookDouban(app, file, deps, query);
  if (outcome.ok) {
    notice(outcome.skipped ? '该书籍豆瓣信息本已齐全，未重抓' : `豆瓣信息已重抓：${file.basename}`);
    return outcome.skipped ? 'skipped' : 'ok';
  }
  if (outcome.reason === 'blocked') notice('豆瓣风控拦截，稍后重试（重载插件后开面板也会自动补抓）', 'error');
  else if (outcome.reason === 'notfound') notice('豆瓣没搜到该书，可换搜索词再重抓', 'error');
  else notice('重抓失败（网络/写盘异常）', 'error');
  return 'ok';
}

/** 重抓当前书籍豆瓣（命令 bz-bookshelf-douban-refetch：作用当前打开的笔记，限书库目录内 md） */
export async function refetchBookshelfDouban(app: App): Promise<void> {
  const file = app.workspace.getActiveFile();
  if (!file) {
    notice('没有打开的笔记', 'error');
    return;
  }
  const folder = resolveFolderPath();
  if (!file.path.startsWith(folder + '/') && file.path !== `${folder}.md`) {
    notice('当前笔记不在书库目录', 'error');
    return;
  }
  await refetchBookDoubanWithPrompt(app, file, fetchDepsFromSettings(app));
}
