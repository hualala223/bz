// @vitest-environment node
/**
 * 日常行为记录（diary/daily-capture，issue 247）数据层测试：
 * （当日待办事项捕获已随 ADR-0122 退役，其行构建测试一并移除）
 * - 纯函数：冻结格式行构建（QuickAdd data.json format 展开形态）、insertIntoSection
 *   小节末尾插入（命中小节 / 小节为空 / 未命中追加文末 / CRLF 归一 / 空文件起头）；
 * - 薄壳 IO：captureToDiarySection——文件缺失新建（标记+行起头）、模板形态在
 *   `# 日常行为记录` 末尾插入且 frontmatter 等其余行原样保留、条目形态在正文
 *   `## 代办事项` 小节插入且 parser 原样回读、未命中小节追加文末；
 * - 旧层级兼容（ADR-0113）：旧日记里的 `## 日常行为记录` / `### 代办事项` 仍按命中行
 *   实际层级切分，插行结果与改动前逐字一致。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { setApp as setCoreApp } from '../../src/core/app';
import { setApp } from '../../src/diary/app';
import {
  ACTIVITY_HEADING,
  TODO_HEADING,
  insertIntoSection,
  captureToDiarySection,
  sanitizeCaptureText,
  buildActivityLine,
} from '../../src/diary/daily-capture';
import { MockVault, mockAppWithVault } from '../mock-vault';

/** setup 返回（vault, app）：app 才是薄壳 IO 的入参 */
function setup(files: Record<string, string> = {}): { v: MockVault; app: any } {
  const vault = new MockVault();
  for (const [p, c] of Object.entries(files)) vault.files.set(p, c);
  const app = mockAppWithVault(vault);
  setApp(app);
  setCoreApp(app);
  return { v: vault, app };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T20:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('冻结格式行（QuickAdd format 展开形态，task:true 冻结）', () => {
  it('行为：`- HH:mm-活动`（时间在前、活动在后）', () => {
    expect(buildActivityLine('123', '10:20')).toBe('- 10:20-123');
  });
});

describe('insertIntoSection（纯函数）', () => {
  it('模板形态（旧层级兼容，ADR-0113）：插到「## 日常行为记录」小节末尾，其余小节原样保留', () => {
    const tpl = [
      '## 睡眠相关',
      '- 起床时间：',
      '## 随笔',
      '- 18:32-晚饭',
      '',
      '## 日常行为记录',
      '',
      '## 日程规划',
      '',
    ].join('\n');
    const { content, placed } = insertIntoSection(tpl, ACTIVITY_HEADING, '- 21:04-跑步');
    expect(placed).toBe('section');
    // 小节内容为空（尾部仅有分隔空行）：紧跟标记行插入，分隔空行与后继小节保留
    expect(content).toContain('## 日常行为记录\n- 21:04-跑步\n\n## 日程规划');
  });

  it('小节已有内容：插到最后一行非空行之后，尾部空行结构保留', () => {
    const src = ['## 日常行为记录', '- 09:00-晨会', '- 11:00-写代码', '', '## 日程规划', ''].join('\n');
    const { content } = insertIntoSection(src, ACTIVITY_HEADING, '- 12:30-午饭');
    expect(content).toContain('- 11:00-写代码\n- 12:30-午饭\n\n## 日程规划');
    expect(content.endsWith('## 日程规划\n')).toBe(true);
  });

  it('条目形态（旧层级兼容，ADR-0113）：插进条目正文「### 代办事项」与「### 完成情况跟踪」之间', () => {
    const entryFile = [
      '# 📖 10:18',
      '',
      '### 代办事项',
      '- [ ] ',
      '- [ ] ',
      '',
      '### 完成情况跟踪',
      '| 计划完成 | 实际完成 |',
    ].join('\n');
    const { content, placed } = insertIntoSection(entryFile, TODO_HEADING, '- [ ] 买牛奶-10:30');
    expect(placed).toBe('section');
    expect(content).toContain('- [ ] \n- [ ] 买牛奶-10:30\n\n### 完成情况跟踪');
  });

  it('小节为空（只有标记行无后继标题）：紧跟标记行插入', () => {
    const { content, placed } = insertIntoSection('## 日常行为记录', ACTIVITY_HEADING, '- 08:00-晨跑');
    expect(placed).toBe('section');
    // 纯函数只插行：是否补文末换行由写盘方决定（writeFile 原文无尾换行则保持无）。
    // 由于原文末尾无换行，插行后 join 不带 \n；这里统一断言行紧跟标记行。
    expect(content).toBe('## 日常行为记录\n- 08:00-晨跑');
  });

  it('未命中小节：追加到文件末尾，不动原有行', () => {
    const entryFile = '# 📖 10:18\n\n同学讨论了项目方案。\n';
    const { content, placed } = insertIntoSection(entryFile, ACTIVITY_HEADING, '- 10:20-查资料');
    expect(placed).toBe('append-end');
    expect(content).toBe(entryFile + '- 10:20-查资料\n');
  });

  it('未命中且文末已有空行：先收空行再追加', () => {
    const { content, placed } = insertIntoSection('# 📖 10:18\n\n随手记。\n\n\n', TODO_HEADING, '- [ ] 看书-21:00');
    expect(placed).toBe('append-end');
    expect(content).toBe('# 📖 10:18\n\n随手记。\n- [ ] 看书-21:00\n');
  });

  it('原文 CRLF 归一为 LF 后插行', () => {
    const { content } = insertIntoSection('## 日常行为记录\r\n\r\n## 日程规划\r\n', ACTIVITY_HEADING, '- 07:11-打球');
    expect(content).toBe('## 日常行为记录\n- 07:11-打球\n\n## 日程规划\n');
  });

  it('空内容视为空文件：标记+行 起头（用新层级标记）', () => {
    const { content, placed } = insertIntoSection('', ACTIVITY_HEADING, '- 08:00-晨跑');
    expect(placed).toBe('section');
    expect(content).toBe('# 日常行为记录\n- 08:00-晨跑\n');
  });

  it('新层级（ADR-0113）：`# 日常行为记录` 命中，按命中行层级切分（遇 `# 日程规划` 收尾）', () => {
    const tpl = ['# 睡眠相关', '- 起床时间：', '# 日常行为记录', '', '# 日程规划', ''].join('\n');
    const { content, placed } = insertIntoSection(tpl, ACTIVITY_HEADING, '- 21:04-跑步');
    expect(placed).toBe('section');
    expect(content).toContain('# 日常行为记录\n- 21:04-跑步\n\n# 日程规划');
  });

  it('新层级（ADR-0113）：插进条目正文 `## 代办事项` 与 `## 完成情况跟踪` 之间', () => {
    const entryFile = [
      '# 📖 10:18',
      '',
      '## 代办事项',
      '- [ ] ',
      '- [ ] ',
      '',
      '## 完成情况跟踪',
      '| 计划完成 | 实际完成 |',
    ].join('\n');
    const { content, placed } = insertIntoSection(entryFile, TODO_HEADING, '- [ ] 买牛奶-10:30');
    expect(placed).toBe('section');
    expect(content).toContain('- [ ] \n- [ ] 买牛奶-10:30\n\n## 完成情况跟踪');
  });
});

describe('sanitizeCaptureText', () => {
  it('换行折叠空格、首尾去空白', () => {
    expect(sanitizeCaptureText('写代码\n eat')).toBe('写代码 eat');
    expect(sanitizeCaptureText('  空格处理  ')).toBe('空格处理');
    expect(sanitizeCaptureText('\n\r\n')).toBe('');
  });
});

describe('captureToDiarySection（薄壳 IO）', () => {
  it('文件缺失：以「标记 + 行」新建（新层级标记）', async () => {
    const { v, app } = setup();
    const res = await captureToDiarySection(app, '2026-09-10', ACTIVITY_HEADING, '- 20:00-复盘');
    expect(res.created).toBe(true);
    expect(res.placed).toBe('section');
    expect(v.files.get('我的/日记/2026-09-10.md')).toBe('# 日常行为记录\n- 20:00-复盘\n');
  });

  it('新层级模板文件（ADR-0113）：其余行原样保留，插进 `# 日常行为记录` 末尾', async () => {
    const tpl = [
      '---',
      'card_type: 日记',
      '---',
      '# 睡眠相关',
      '- 起床时间：',
      '# 日常行为记录',
      '',
      '# 日程规划',
    ].join('\n');
    const { v, app } = setup({ '我的/日记/2026-09-10.md': tpl });
    const res = await captureToDiarySection(app, '2026-09-10', ACTIVITY_HEADING, '- 21:00-健身');
    expect(res.created).toBe(false);
    expect(res.placed).toBe('section');
    const out = v.files.get('我的/日记/2026-09-10.md')!;
    expect(out).toContain('card_type: 日记');
    expect(out).toContain('# 日常行为记录\n- 21:00-健身');
    expect(out).toContain('- 起床时间：');
    expect(out).toContain('# 日程规划');
  });

  it('模板形态文件：其余行原样保留，插进小节末尾', async () => {
    const tpl = [
      '---',
      'card_type: 日记',
      '---',
      '## 睡眠相关',
      '- 起床时间：',
      '## 日常行为记录',
      '',
      '## 日程规划',
    ].join('\n');
    const { v, app } = setup({ '我的/日记/2026-09-10.md': tpl });
    const res = await captureToDiarySection(app, '2026-09-10', ACTIVITY_HEADING, '- 21:00-健身');
    expect(res.created).toBe(false);
    expect(res.placed).toBe('section');
    const out = v.files.get('我的/日记/2026-09-10.md')!;
    expect(out).toContain('card_type: 日记');
    expect(out).toContain('## 日常行为记录\n- 21:00-健身');
    expect(out).toContain('- 起床时间：');
  });

  it('条目形态文件：插进条目正文小节，插行后可被 parser 原样保留在条目内容里', async () => {
    const entryFile = [
      '# 📖 10:18',
      '',
      '### 代办事项',
      '- [ ] ',
      '',
      '### 完成情况跟踪',
    ].join('\n');
    const { v, app } = setup({ '我的/日记/2026-09-10.md': entryFile });
    await captureToDiarySection(app, '2026-09-10', TODO_HEADING, '- [ ] 备货-20:05');
    const out = v.files.get('我的/日记/2026-09-10.md')!;
    expect(out).toContain('- [ ] \n- [ ] 备货-20:05\n\n### 完成情况跟踪');
    // 回读经 diary parser：插行留在条目正文里（parser 按 `# emoji HH:mm` 切条目）
    const { parseFile } = await import('../../src/diary/parser');
    const entries = parseFile(out, '2026-09-10');
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toContain('- [ ] 备货-20:05');
  });

  it('未命中小节：追加文末，其余行不动', async () => {
    const { v, app } = setup({ '我的/日记/2026-09-10.md': '# 📖 10:18\n\n随手记。\n' });
    const res = await captureToDiarySection(app, '2026-09-10', ACTIVITY_HEADING, '- 10:20-查资料');
    expect(res.placed).toBe('append-end');
    expect(v.files.get('我的/日记/2026-09-10.md')).toBe('# 📖 10:18\n\n随手记。\n- 10:20-查资料\n');
  });
});
