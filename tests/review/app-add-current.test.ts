/**
 * 「将当前文档加入复习计划」测试（ticket 169）：成功加入 / 重复加入不动排期 / 非 .md 拒绝
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks, getNoticeMessages } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { reviewApp } from '../../src/review/app';
import { reviewAddCurrent } from '../../src/review/index';
import { ReviewDataManager, REVIEW_FILE_PATH } from '../../src/review/data';

function mdFile(path = '笔记/甲.md'): any {
  return { path, basename: path.split('/').pop()!.replace(/\.md$/, ''), extension: 'md' };
}

describe('addCurrentToReview（ticket 169）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    vi.useFakeTimers();
    setSettingsProvider(() => ({}) as any);
    (reviewApp as any).dataManager = null; // 重置单例（跨测试污染）
  });

  it('成功加入：新条目落盘、名称取 basename、成功通知', async () => {
    const vault = new MockVault();
    vault.files.set('笔记/甲.md', '正文');
    const app = mockAppWithVault(vault);
    setApp(app);

    await reviewApp.addCurrentToReview(mdFile());

    const items = await new ReviewDataManager(app).loadItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ filePath: '笔记/甲.md', name: '甲', completed: false });
    expect(getNoticeMessages().some((m) => m.includes('已加入复习计划'))).toBe(true);
  });

  it('重复加入：提示已在计划中、不重建条目、原排期字段不动', async () => {
    const vault = new MockVault();
    vault.files.set('A.md', '正文');
    const app = mockAppWithVault(vault);
    setApp(app);

    await reviewApp.addCurrentToReview(mdFile('A.md'));
    const first = await new ReviewDataManager(app).loadItems();
    // 只比较持久化字段（loadItems 附加的运行时 file 对象含惰性 stat，不稳定）
    const persisted = (i: any) => JSON.stringify({ ...i, file: undefined, isMissing: undefined, isOverdue: undefined, isCompleted: undefined });
    const before = persisted(first[0]);

    await reviewApp.addCurrentToReview(mdFile('A.md'));

    const after = await new ReviewDataManager(app).loadItems();
    expect(after).toHaveLength(1);
    expect(persisted(after[0])).toBe(before);
    expect(getNoticeMessages().some((m) => m.includes('已在复习计划中'))).toBe(true);
  });

  it('非 .md 拒绝：错误通知、不写任何数据', async () => {
    const vault = new MockVault();
    const app = mockAppWithVault(vault);
    setApp(app);

    await reviewApp.addCurrentToReview({ path: '附件/图.png', basename: '图', extension: 'png' } as any);

    expect(vault.files.has(REVIEW_FILE_PATH)).toBe(false);
    expect(getNoticeMessages().some((m) => m.includes('仅支持 Markdown 笔记加入复习计划'))).toBe(true);
  });

  it('命令入口 reviewAddCurrent：默认取当前打开笔记；无打开笔记时提示', async () => {
    const vault = new MockVault();
    vault.files.set('B.md', '正文');
    const app = mockAppWithVault(vault);
    (app.workspace as any).getActiveFile = () => mdFile('B.md');
    setApp(app);

    reviewAddCurrent(app);
    await vi.runAllTimersAsync();
    let items = await new ReviewDataManager(app).loadItems();
    expect(items.map((i) => i.filePath)).toContain('B.md');

    // 无打开笔记
    (app.workspace as any).getActiveFile = () => null;
    reviewAddCurrent(app);
    expect(getNoticeMessages().some((m) => m.includes('没有打开的笔记'))).toBe(true);
    items = await new ReviewDataManager(app).loadItems();
    expect(items).toHaveLength(1);
  });
});
