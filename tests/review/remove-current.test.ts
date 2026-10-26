/**
 * 「将当前文档移出复习计划」测试（票 321）：计划内移出 + 撤销恢复 / 不在计划仅提示 /
 * 监听目录内排除名单写入与撤销解除 / 无活动笔记提示。
 * reviewRemoveCurrent 内部 ensureReview（幂等）——照 index.test 惯例 fake timers + unloadReview 收尾；
 * 移出链含动态 import（remove.ts 模块真实异步加载），统一用 vi.waitFor 轮询终点（vitest 自动推进 fake timers）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks, getNoticeMessages, clearNotices } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { reviewRemoveCurrent, unloadReview } from '../../src/review/index';
import { ReviewDataManager, REVIEW_FILE_PATH } from '../../src/review/data';

function mdFile(path = 'A.md'): any {
  return { path, basename: path.split('/').pop()!.replace(/\.md$/, ''), extension: 'md' };
}

function row(id: string, filePath: string, extra: any = {}) {
  return {
    id, filePath, reviewStart: new Date().toISOString(), stage: 5, phase: 'ladder', stability: 1,
    difficulty: 0.3, reviewHistory: [], totalReviews: 2, averageConfidence: 0.7,
    nextReviewDate: new Date(Date.now() + 86400000).toISOString(),
    lastReviewed: null, lastDifficulty: null, completed: false, ...extra,
  };
}

describe('reviewRemoveCurrent（票 321）', () => {
  let vault: MockVault;
  let app: any;
  let settings: any;

  beforeEach(() => {
    resetObsidianMocks();
    clearNotices();
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    document.body.innerHTML = '';
    vault = new MockVault();
    settings = {};
    setSettingsProvider(() => settings);
    app = mockAppWithVault(vault);
    setApp(app);
  });

  afterEach(() => {
    unloadReview();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('计划内文档：移除落盘 + 撤销 toast → 原样恢复（阶段不丢）', async () => {
    vault.files.set('A.md', '正文');
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([row('1', 'A.md')]));
    const dm = new ReviewDataManager(app);
    reviewRemoveCurrent(app, mdFile('A.md'));
    await vi.waitFor(() => {
      expect(getNoticeMessages().some((m) => m.includes('已移出「A」'))).toBe(true);
    });
    expect((await dm.loadItems()).length).toBe(0); // 已移出
    const action = await vi.waitFor(() => {
      const el = document.querySelector('.bz-notice-action') as HTMLElement | null;
      expect(el).toBeTruthy();
      return el!;
    });
    action.click(); // 撤销
    await vi.waitFor(async () => {
      expect((await dm.loadItems()).length).toBe(1);
    });
    const back = await dm.loadItems();
    expect(back[0].filePath).toBe('A.md');
    expect(back[0].stage).toBe(5); // 阶段/进度不丢
  });

  it('不在计划中：仅提示，不动任何数据', async () => {
    vault.files.set('A.md', '正文');
    reviewRemoveCurrent(app, mdFile('A.md'));
    await vi.waitFor(() => {
      expect(getNoticeMessages().some((m) => m.includes('该笔记不在复习计划中'))).toBe(true);
    });
    // 未写条目（loadItems 空读守卫会落空数组，属数据层既有行为）
    expect(JSON.parse(vault.files.get(REVIEW_FILE_PATH) || '[]')).toEqual([]);
  });

  it('监听目录内文档：移出落排除名单，撤销解除', async () => {
    settings.reviewWatchedFolders = ['我的/复习'];
    vault.files.set('我的/复习/A.md', '正文');
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([row('1', '我的/复习/A.md')]));
    reviewRemoveCurrent(app, mdFile('我的/复习/A.md'));
    await vi.waitFor(() => {
      expect(settings.reviewExcludedNotes).toEqual(['我的/复习/A.md']); // 防自动加回
    });
    const action = await vi.waitFor(() => {
      const el = document.querySelector('.bz-notice-action') as HTMLElement | null;
      expect(el).toBeTruthy();
      return el!;
    });
    action.click(); // 撤销
    await vi.waitFor(() => {
      expect(settings.reviewExcludedNotes).toEqual([]); // 撤销解除
    });
    expect((await new ReviewDataManager(app).loadItems()).length).toBe(1);
  });

  it('无活动笔记：提示且不弹数据', async () => {
    app.workspace.getActiveFile = () => null;
    reviewRemoveCurrent(app, undefined);
    await vi.waitFor(() => {
      expect(getNoticeMessages().some((m) => m.includes('没有打开的笔记'))).toBe(true);
    });
  });
});
