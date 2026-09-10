// @vitest-environment node
/**
 * 日常收集（collect 域）数据纯层测试（issue 246）：
 * 捕获管线（时间戳格式 / 标题下末尾追加 / 标题缺失兜底 / 初始文件内容 / 多行内容）+ 条目解析器
 * （只认标准行 / 秒位越界不校验 / 跨分类聚合）+ 分类配置纯操作（增删改规范化）。
 *
 * 只测外部行为：给文件原文与输入，断言新文件原文/条目数组（issue 246 Testing Decisions）。
 */
import { describe, it, expect } from 'vitest';
import {
  COLLECT_HEADING, DEFAULT_COLLECT_CATEGORIES,
  formatStamp, parseStamp, splitContentLines, buildEntryLines,
  appendEntryLines, appendCollect, initialFileContent, parseEntries, truncateText,
  normalizeCategories, ensureMdName, categoryFilePath,
  upsertCategory, removeCategory, renameCategory,
} from '../../src/collect/data';

const NOW = new Date(2026, 8, 10, 9, 5, 3); // 2026-09-10 09:05:03

describe('时间戳（QuickAdd 同款 YY/MM/DD-HH:MM:SS）', () => {
  it('格式化两位年/月/日与时分秒', () => {
    expect(formatStamp(NOW)).toBe('26/09/10-09:05:03');
    expect(formatStamp(NOW.getTime())).toBe('26/09/10-09:05:03');
  });

  it('解析回同一时刻；秒位越界的历史怪值不校验不清洗（Date 自行进位）', () => {
    expect(parseStamp('26/09/10-09:05:03')).toBe(NOW.getTime());
    expect(parseStamp('25/11/02-13:11:54')).toBe(new Date(2025, 10, 2, 13, 11, 54).getTime());
    expect(parseStamp('26/01/14-09:01:99')).toBe(new Date(2026, 0, 14, 9, 2, 39).getTime());
    expect(parseStamp('不是时间戳')).toBeNull();
  });
});

describe('捕获管线（纯函数）', () => {
  const file = `---\ncreated: 2025-06-14\n---\n${COLLECT_HEADING}\n- 25/11/02-13:11:54 第一条\n- 26/01/14-09:01:49 第二条\n`;

  it('追加到「## 非文件收集」段末尾（段尾留白前，紧贴最后一条）', () => {
    const next = appendCollect(file, '第三条', NOW);
    expect(next).toBe(
      `---\ncreated: 2025-06-14\n---\n${COLLECT_HEADING}\n- 25/11/02-13:11:54 第一条\n- 26/01/14-09:01:49 第二条\n- 26/09/10-09:05:03 第三条\n`
    );
  });

  it('标题后紧跟下一个同级/更高级标题时插在段内（不越界到后段）', () => {
    const src = `${COLLECT_HEADING}\n- 25/11/02-13:11:54 第一条\n\n## 文件收集\n- 保留内容\n`;
    const next = appendCollect(src, '新条目', NOW);
    expect(next).toBe(
      `${COLLECT_HEADING}\n- 25/11/02-13:11:54 第一条\n- 26/09/10-09:05:03 新条目\n\n## 文件收集\n- 保留内容\n`
    );
  });

  it('标题缺失：兜底追加文件末尾（不新建标题，兼容冻结）', () => {
    const src = '# 冲突类型\n- 核心特征\n- 冲突核心要素\n';
    const next = appendCollect(src, '新增一行', NOW);
    expect(next).toBe('# 冲突类型\n- 核心特征\n- 冲突核心要素\n- 26/09/10-09:05:03 新增一行\n');
    expect(next).not.toContain(COLLECT_HEADING);
  });

  it('空文件/空串：直接写入条目', () => {
    expect(appendCollect('', '第一条', NOW)).toBe('- 26/09/10-09:05:03 第一条\n');
    expect(appendEntryLines('   \n\n', ['- 26/09/10-09:05:03 x'])).toBe('- 26/09/10-09:05:03 x\n');
  });

  it('无条目行时不改动原文', () => {
    expect(appendCollect(file, '   \n  \n', NOW)).toBe(file);
  });

  it('多行内容按行拆成多条（保持换行结构，不并成一行）', () => {
    expect(buildEntryLines('第一行\n第二行\n\n第三行', '26/09/10-09:05:03')).toEqual([
      '- 26/09/10-09:05:03 第一行',
      '- 26/09/10-09:05:03 第二行',
      '- 26/09/10-09:05:03 第三行',
    ]);
    expect(splitContentLines('  a  \r\n b \n\n')).toEqual(['a', 'b']);
  });

  it('文件不存在时的初始内容：frontmatter + 非文件收集标题', () => {
    const init = initialFileContent(NOW);
    expect(init.startsWith('---\n')).toBe(true);
    expect(init).toContain('created: 2026-09-10');
    expect(init.endsWith(`${COLLECT_HEADING}\n`)).toBe(true);
    // 初始内容再追加一条 → 落在标题下
    expect(appendCollect(init, '第一条', NOW)).toBe(`${init}- 26/09/10-09:05:03 第一条\n`);
  });
});

describe('条目解析器（只认标准时间戳行）', () => {
  it('标准行识别；无时间戳/引用续行/代码块一律忽略', () => {
    const text = [
      '---',
      'created: 2025-05-13',
      '---',
      COLLECT_HEADING,
      '- [[书库/某书#^wcxio8|平静而谨慎]]',
      '- 爱脑补',
      '- 25/11/02-13:11:54 有时间戳的条目',
      '- 26/01/14-09:01:49 第二条',
      '> [!quote]',
      '> 续行内容不算条目',
      '```dataview',
      '- 代码块里的无时间戳行',
      '```',
    ].join('\n');
    const entries = parseEntries(text, '人物特征收集');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ category: '人物特征收集', stamp: '25/11/02-13:11:54', text: '有时间戳的条目' });
    expect(entries[0].time).toBe(new Date(2025, 10, 2, 13, 11, 54).getTime());
    expect(entries[1].text).toBe('第二条');
  });

  it('空文件/无条目文件返回空数组', () => {
    expect(parseEntries('')).toEqual([]);
    expect(parseEntries('# 只有标题\n')).toEqual([]);
  });

  it('摘要截断：超长加省略号，空白折叠', () => {
    expect(truncateText('短文本', 10)).toBe('短文本');
    expect(truncateText('一二三四五六七八九十', 5)).toBe('一二三四五…');
    expect(truncateText('  a \n b  ', 0)).toBe('a b');
  });
});

describe('分类配置（纯列表操作 + 路径解析）', () => {
  it('内置 16 分类（照 QuickAdd 宏迁移）', () => {
    expect(DEFAULT_COLLECT_CATEGORIES).toHaveLength(16);
    expect(DEFAULT_COLLECT_CATEGORIES.map((c) => c.name)).toContain('日常灵感收集');
    expect(DEFAULT_COLLECT_CATEGORIES.every((c) => c.file.endsWith('.md'))).toBe(true);
  });

  it('规范化：去空、按名去重、非法项丢弃、文件名补 .md', () => {
    const out = normalizeCategories([
      { name: '想法', file: '想法' },
      { name: '想法', file: '重复.md' },
      { name: '  ', file: 'x.md' },
      { name: '情感', file: '' },
      null,
      'garbage',
    ] as unknown[]);
    expect(out).toEqual([
      { name: '想法', file: '想法.md' },
      { name: '情感', file: '情感.md' },
    ]);
    expect(normalizeCategories(undefined)).toEqual([]);
  });

  it('目标路径：纯文件名挂目标文件夹下，含斜杠视为完整路径', () => {
    expect(categoryFilePath({ name: '想法', file: '想法.md' }, '我的/日常收集')).toBe('我的/日常收集/想法.md');
    expect(categoryFilePath({ name: '其他', file: '归档/其他收集.md' }, '我的/日常收集')).toBe('归档/其他收集.md');
    expect(categoryFilePath({ name: 'x', file: 'x' }, '')).toBe('x.md');
    expect(ensureMdName('a.MD')).toBe('a.MD');
  });

  it('增删改：新增/覆盖、删除、改名（派生文件随名更新，显式路径不动）', () => {
    const base = [{ name: '想法', file: '想法.md' }];
    expect(upsertCategory(base, '情感', '')).toEqual([
      { name: '想法', file: '想法.md' },
      { name: '情感', file: '情感.md' },
    ]);
    expect(upsertCategory(base, '想法', '自定义.md')).toEqual([{ name: '想法', file: '自定义.md' }]);
    expect(upsertCategory(base, '', 'x')).toBe(base);
    expect(removeCategory(base, '想法')).toEqual([]);
    expect(renameCategory(base, '想法', '疑问')).toEqual([{ name: '疑问', file: '疑问.md' }]);
    expect(renameCategory([{ name: '想法', file: '归档/想法.md' }], '想法', '疑问')).toEqual([
      { name: '疑问', file: '归档/想法.md' },
    ]);
    // 目标名已存在 / 空名 → 原样返回
    expect(renameCategory(base, '想法', '')).toBe(base);
    expect(renameCategory([...base, { name: '疑问', file: '疑问.md' }], '想法', '疑问')).toHaveLength(2);
  });
});
