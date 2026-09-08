/**
 * 「批量加入复习计划」测试（ticket 170）：出链收集 / 成功加入汇总 / 重复跳过不动排期 / 非 .md 拒绝 / 断链与非 .md 出链忽略
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks, getNoticeMessages, clearNotices } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { reviewApp } from '../../src/review/app';
import { reviewAddCurrentWithLinks } from '../../src/review/index';
import { ReviewDataManager, REVIEW_FILE_PATH } from '../../src/review/data';

function mdFile(path: string): any {
  return { path, basename: path.split('/').pop()!.replace(/\.md$/, ''), extension: 'md' };
}

/** 给 mock app 挂 metadataCache 替身：cache 为 getFileCache 结果，linkMap 为链接目标映射（缺键 = 断链） */
function withMetadataCache(app: any, cache: any, linkMap: Record<string, any>): void {
  app.metadataCache = {
    getFileCache: () => cache,
    getFirstLinkpathDest: (lp: string) => linkMap[lp] ?? null,
  };
}

describe('addCurrentWithLinksToReview（ticket 170）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    vi.useFakeTimers();
    setSettingsProvider(() => ({}) as any);
    (reviewApp as any).dataManager = null;
  });

  it('全部新文档：当前 + 正文出链 + frontmatter 出链全部入列，success 汇总通知', async () => {
    const vault = new MockVault();
    vault.files.set('笔记/甲.md', '正文');
    const app = mockAppWithVault(vault);
    setApp(app);
    withMetadataCache(app, {
      links: [{ link: '乙' }, { link: '子/丙#标题' }],
      frontmatterLinks: [{ link: '丁' }],
    }, {
      '乙': mdFile('笔记/乙.md'),
      '子/丙#标题': mdFile('子/丙.md'),
      '丁': mdFile('笔记/丁.md'),
    });

    await reviewApp.addCurrentWithLinksToReview(mdFile('笔记/甲.md'));

    const items = await new ReviewDataManager(app).loadItems();
    expect(items.map((i) => i.filePath).sort()).toEqual(['笔记/丁.md', '笔记/乙.md', '笔记/甲.md', '子/丙.md'].sort());
    expect(getNoticeMessages().some((m) => m.includes('已加入 4 篇'))).toBe(true);
  });

  it('部分已存在：新的入列、旧条目持久化字段不变，汇总通知含跳过数', async () => {
    const vault = new MockVault();
    vault.files.set('甲.md', '正文');
    const app = mockAppWithVault(vault);
    setApp(app);
    withMetadataCache(app, { links: [{ link: '甲' }, { link: '乙' }] }, {
      '甲': mdFile('甲.md'),
      '乙': mdFile('乙.md'),
    });

    // 预置「甲」已在计划中（经单篇命令，顺便验证互不干扰）
    await reviewApp.addCurrentToReview(mdFile('甲.md'));
    const first = await new ReviewDataManager(app).loadItems();
    const persisted = (i: any) => JSON.stringify({ ...i, file: undefined, isMissing: undefined, isOverdue: undefined, isCompleted: undefined });
    const before = persisted(first.find((i) => i.filePath === '甲.md'));

    await reviewApp.addCurrentWithLinksToReview(mdFile('甲.md'));

    const after = await new ReviewDataManager(app).loadItems();
    expect(after).toHaveLength(2);
    expect(persisted(after.find((i) => i.filePath === '甲.md'))).toBe(before);
    expect(getNoticeMessages().some((m) => m.includes('已加入 1 篇，1 篇已在计划中跳过'))).toBe(true);
  });

  it('全部已存在：零写数据（不重写文件）、info 通知', async () => {
    const vault = new MockVault();
    vault.files.set('甲.md', '正文');
    const app = mockAppWithVault(vault);
    setApp(app);
    withMetadataCache(app, { links: [{ link: '甲' }] }, { '甲': mdFile('甲.md') });

    await reviewApp.addCurrentWithLinksToReview(mdFile('甲.md'));
    const written = vault.files.get(REVIEW_FILE_PATH);
    clearNotices();
    // 清空通知后再次触发：不应产生新条目也不应产生 success
    await reviewApp.addCurrentWithLinksToReview(mdFile('甲.md'));

    expect(vault.files.get(REVIEW_FILE_PATH)).toBe(written);
    expect(getNoticeMessages().some((m) => m.includes('共 1 篇，均已在复习计划中'))).toBe(true);
    const items = await new ReviewDataManager(app).loadItems();
    expect(items).toHaveLength(1);
  });

  it('断链与非 .md 出链静默忽略，不计入汇总', async () => {
    const vault = new MockVault();
    vault.files.set('甲.md', '正文');
    const app = mockAppWithVault(vault);
    setApp(app);
    withMetadataCache(app, {
      links: [{ link: '不存在' }, { link: '图' }, { link: '乙' }],
    }, {
      '图': { path: '附件/图.png', basename: '图', extension: 'png' },
      '乙': mdFile('乙.md'),
    });

    await reviewApp.addCurrentWithLinksToReview(mdFile('甲.md'));

    const items = await new ReviewDataManager(app).loadItems();
    expect(items.map((i) => i.filePath).sort()).toEqual(['乙.md', '甲.md'].sort());
    expect(getNoticeMessages().some((m) => m.includes('已加入 2 篇'))).toBe(true);
  });

  it('非 .md 当前文档：整单拒绝、零副作用', async () => {
    const vault = new MockVault();
    const app = mockAppWithVault(vault);
    setApp(app);

    await reviewApp.addCurrentWithLinksToReview({ path: '附件/图.png', basename: '图', extension: 'png' } as any);

    expect(vault.files.has(REVIEW_FILE_PATH)).toBe(false);
    expect(getNoticeMessages().some((m) => m.includes('仅支持 Markdown 笔记加入复习计划'))).toBe(true);
  });

  it('命令入口 reviewAddCurrentWithLinks：默认取当前打开笔记；无打开笔记时提示', async () => {
    const vault = new MockVault();
    vault.files.set('B.md', '正文');
    const app = mockAppWithVault(vault);
    (app.workspace as any).getActiveFile = () => mdFile('B.md');
    setApp(app);
    withMetadataCache(app, null, {});

    reviewAddCurrentWithLinks(app);
    // 只跑已排定计时器（写盘防抖）——通知发出后新排定的自动消失计时器不会被触发，DOM 仍在
    await vi.runOnlyPendingTimersAsync();
    const items = await new ReviewDataManager(app).loadItems();
    expect(items.map((i) => i.filePath)).toContain('B.md');
    expect(getNoticeMessages().some((m) => m.includes('已加入 1 篇'))).toBe(true);

    (app.workspace as any).getActiveFile = () => null;
    reviewAddCurrentWithLinks(app);
    expect(getNoticeMessages().some((m) => m.includes('没有打开的笔记'))).toBe(true);
  });
});
