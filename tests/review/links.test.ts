// @vitest-environment node
/**
 * 出链收集纯函数测试（ticket 170）：正文+frontmatter 合并、去重、断链/非 .md 丢弃
 */
import { describe, it, expect } from 'vitest';
import { collectOutgoingLinks } from '../../src/review/links';

const md = (path: string) => ({ path, basename: path.split('/').pop()!.replace(/\.md$/, ''), extension: 'md' });

describe('collectOutgoingLinks（ticket 170）', () => {
  const resolve = (map: Record<string, any>) => (lp: string) => map[lp] ?? null;

  it('正文 links + frontmatterLinks 合并收集', () => {
    const out = collectOutgoingLinks(
      { links: [{ link: '甲' }], frontmatterLinks: [{ link: '乙' }] },
      'src.md',
      resolve({ 甲: md('甲.md'), 乙: md('乙.md') })
    );
    expect(out.map((t) => t.path)).toEqual(['甲.md', '乙.md']);
  });

  it('断链与非 .md 丢弃；解析结果按路径去重', () => {
    const out = collectOutgoingLinks(
      { links: [{ link: '断' }, { link: '图' }, { link: '别名' }, { link: '甲' }], frontmatterLinks: [{ link: '别名' }] },
      'src.md',
      resolve({ 图: { path: '图.png', basename: '图', extension: 'png' }, 别名: md('甲.md'), 甲: md('甲.md') })
    );
    expect(out.map((t) => t.path)).toEqual(['甲.md']);
  });

  it('空缓存/空链接返回空数组', () => {
    expect(collectOutgoingLinks(null, 'a.md', resolve({}))).toEqual([]);
    expect(collectOutgoingLinks({ links: [], frontmatterLinks: [] }, 'a.md', resolve({}))).toEqual([]);
  });
});
