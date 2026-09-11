// @vitest-environment node
/**
 * 日记「未解析行」扫描/修复引擎（ticket 121，ADR-0054）纯函数测试：
 * R1 补空格 / R2 时间补零 / 时间越界与游离正文不可修 / 修复后再解析归零（真机样本）。
 */
import { describe, expect, it } from 'vitest';
import { scanUnparsed, applyRepairs } from '../../src/diary/repair';
import { parseFile } from '../../src/diary/parser';

/** 与 parseFile 同口径统计未解析行数 */
function countUnparsed(content: string): number {
  let n = 0;
  parseFile(content, '2026-08-27', (c) => (n += c));
  return n;
}

describe('scanUnparsed 规则', () => {
  it('R1 缺空格标题补空格（真机 2023-04-22 样本）', () => {
    const scan = scanUnparsed('# 🤝02:43\n第一行\n');
    expect(scan.repairs).toEqual([
      { line: 1, kind: 'space', before: '# 🤝02:43', after: '# 🤝 02:43' },
    ]);
    expect(scan.freeTexts).toEqual([]);
  });

  it('R2 单数字时间补零（真机 2023-10-27 样本：修头行，19 行正文归位不进清单）', () => {
    const content = '# 📖 9:33\n世界是一个圈，\n命运亦是如此。\n';
    const scan = scanUnparsed(content);
    expect(scan.repairs).toEqual([
      { line: 1, kind: 'pad-time', before: '# 📖 9:33', after: '# 📖 09:33' },
    ]);
    expect(scan.freeTexts).toEqual([]);
  });

  it('R1 缺空格（无空白形态，真机 2025-08-06 样本）', () => {
    const scan = scanUnparsed('# 📖12:28\n神经 🤣\n');
    expect(scan.repairs).toEqual([
      { line: 1, kind: 'space', before: '# 📖12:28', after: '# 📖 12:28' },
    ]);
  });

  it('时间越界标题行不可自动修 → freeTexts time-oob（其后正文无归属，一并列出）', () => {
    const scan = scanUnparsed('# 📖 25:00\n正文\n');
    expect(scan.repairs).toEqual([]);
    expect(scan.freeTexts).toEqual([
      { line: 1, text: '# 📖 25:00', reason: 'time-oob' },
      { line: 2, text: '正文', reason: 'free-text' },
    ]);
  });

  it('缺空格但时间越界 → 判不可修而非修出非法时间', () => {
    const scan = scanUnparsed('# 🤝25:00\n正文\n');
    expect(scan.repairs).toEqual([]);
    expect(scan.freeTexts[0]?.reason).toBe('time-oob');
  });

  it('整篇无标题的正文是前导区：不算问题（写回原样保留，不列不可修）', () => {
    const scan = scanUnparsed('今天天气真好\n明天也是\n');
    expect(scan.repairs).toEqual([]);
    expect(scan.freeTexts).toEqual([]); // ADR-0110：前导区不丢，故不报
  });

  it('模板形态整篇（frontmatter + ## 小节）：零修复零不可修', () => {
    const scan = scanUnparsed('---\ncard_type: 日记\n---\n\n## 随笔\n\n## 日常行为记录\n');
    expect(scan.repairs).toEqual([]);
    expect(scan.freeTexts).toEqual([]);
  });

  it('条目区内的游离正文照旧列入（前导区之后的才是真问题）', () => {
    // L1 越界标题（条目区起点）→ L2 游离正文：前导区之后，写回会丢 → 必须列出
    const scan = scanUnparsed('# 📖 25:00\n待归位\n');
    expect(scan.freeTexts).toEqual([
      { line: 1, text: '# 📖 25:00', reason: 'time-oob' },
      { line: 2, text: '待归位', reason: 'free-text' },
    ]);
  });

  it('合法文件零修复零不可修', () => {
    const scan = scanUnparsed('# 📖 09:33\n正文\n# 🏃 10:00\n更多\n');
    expect(scan.repairs).toEqual([]);
    expect(scan.freeTexts).toEqual([]);
  });

  it('首个合法标题之后的行（含形似标题的行）是正文，不误报', () => {
    const scan = scanUnparsed('# 📖 09:33\n正文\n# 世界是一个圈，\n');
    expect(scan.repairs).toEqual([]);
    expect(scan.freeTexts).toEqual([]);
  });

  it('合法标题之后的时间越界标题行仍计入不可修（全行扫描无盲区）', () => {
    const content = '# 📖 08:00\n正文\n# 📖 25:00\n';
    const scan = scanUnparsed(content);
    expect(scan.repairs).toEqual([]);
    expect(scan.freeTexts).toEqual([{ line: 3, text: '# 📖 25:00', reason: 'time-oob' }]);
  });

  it('CRLF 文件：归一后扫描、修复保留行尾', () => {
    const content = '# 🤝02:43\r\n正文A\r\n';
    const scan = scanUnparsed(content);
    expect(scan.repairs[0]).toEqual({ line: 1, kind: 'space', before: '# 🤝02:43', after: '# 🤝 02:43' });
    const next = applyRepairs(content, scan.repairs);
    expect(next).toBe('# 🤝 02:43\r\n正文A\r\n');
    expect(next.includes('\r\n')).toBe(true); // CRLF 未被破坏
  });

  it('修复只改格式局部，行尾其它内容一字不动', () => {
    const scan = scanUnparsed('# 📖 9:33备注\n');
    expect(scan.repairs[0]?.after).toBe('# 📖 09:33备注');
    const next = applyRepairs('# 📖 9:33备注\n', scan.repairs);
    expect(next).toBe('# 📖 09:33备注\n');
    expect(countUnparsed(next)).toBe(0); // 修复后仍能被识别为合法条目标题
  });

  it('不可修头行之后的游离正文也列入（修复后仍无法归位）', () => {
    // L1 越界标题（不可修）→ L2 游离正文 → L3 可修头行：L2 位于首个可修头行之前，必须列出
    const scan = scanUnparsed('# 📖 24:99\n待归位\n# 🤝02:43\n');
    expect(scan.repairs).toHaveLength(1);
    expect(scan.repairs[0]?.line).toBe(3);
    expect(scan.freeTexts).toEqual([
      { line: 1, text: '# 📖 24:99', reason: 'time-oob' },
      { line: 2, text: '待归位', reason: 'free-text' },
    ]);
  });
});

describe('applyRepairs 与解析自洽', () => {
  it('修复后未解析数归零、条目正常生成（真机 3 样本合并场景）', () => {
    const cases: string[] = [
      '# 🤝02:43\n正文A\n',
      '# 📖 9:33\n诗一\n诗二\n',
      '# 📖12:28\n图片引用\n',
    ];
    for (const content of cases) {
      expect(countUnparsed(content)).toBeGreaterThan(0); // 修复前确实有未解析行
      const scan = scanUnparsed(content);
      const next = applyRepairs(content, scan.repairs);
      expect(countUnparsed(next)).toBe(0); // 修复后解析干净
      const entries = parseFile(next, '2026-08-27');
      expect(entries.length).toBe(1); // 头行成为唯一合法条目
      // 正文归位不改写：正文内容必须原样保留
      expect(entries[0]?.content.length).toBeGreaterThan(0);
    }
  });

  it('applyRepairs 行内容与 before 不符时跳过（防并发改动错位）', () => {
    const content = '# 手改过\n正文\n';
    const scan = scanUnparsed('# 🤝02:43\n正文\n');
    expect(scan.repairs[0]?.before).not.toBe(content.split('\n')[0]);
    const next = applyRepairs(content, scan.repairs);
    expect(next).toBe(content);
  });

  it('applyRepairs 幂等：同一计划不重复改写', () => {
    const content = '# 🤝02:43\n正文\n';
    const scan = scanUnparsed(content);
    const once = applyRepairs(content, scan.repairs);
    const twice = applyRepairs(once, scan.repairs);
    expect(twice).toBe(once);
  });
});