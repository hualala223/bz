/**
 * 解析层：从文件内容/文件对象解析日记条目（纯函数，不直接触碰 DOM）。
 * 原脚本 1364-1721 行 + parseNaturalTime（3550-3581）。
 */
import { moment } from 'obsidian';
import { getApp } from './app';
import { emojiToTagMap, getTagEmoji } from './config';
import type { DiaryEntry } from './types';

/** 加密条目：内容含 🔐 的条目在列表中隐藏，但保留在数据映射中防止写入丢失 */
export function isEncryptedEntry(entry: DiaryEntry): boolean {
  return typeof entry.content === 'string' && entry.content.includes('🔐');
}

/** 合法条目标题：`# emoji序列 HH:mm`（emoji 与时间之间须有空白、时间恰两位） */
export const HEADING_RE = /^#\s*((?:\S+)+)\s+(\d{2}:\d{2})/u;
/** 形似标题但 emoji 与时间间缺空白：`# 🤝02:43`（可修，见 repair.ts R1） */
export const NO_SPACE_HEADING_RE = /^#\s*((?:\S+)+)(\d{2}:\d{2})/u;
/** 形似标题但时间非两位：`# 📖 9:33`（可修，见 repair.ts R2） */
export const SHORT_TIME_HEADING_RE = /^#\s*((?:\S+)+)\s+(\d{1,2}):(\d{1,2})/u;

/** 疑似条目标题行：合法标题或两种可修形态（时间是否越界不影响判定） */
function isEntryHeadingLike(line: string): boolean {
  return HEADING_RE.test(line) || NO_SPACE_HEADING_RE.test(line) || SHORT_TIME_HEADING_RE.test(line);
}

/**
 * 前导区边界：首个「疑似条目标题行」的行号（0-based）。
 * 全篇无此类行时返回 lines.length——整篇都是前导区（QuickAdd 模板形态文件的典型形态）。
 * 口径与 repair.ts 的「疑似头行」单源（ADR-0110）：边界行本身属条目区，其不合规形态交
 * 「检测日记解析」修复（补空格 / 时间补零）。
 */
export function findEntryRegionStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (isEntryHeadingLike(lines[i])) return i;
  }
  return lines.length;
}

/**
 * 前导区文本（首个疑似条目标题行之前的全部内容）；无前导区返回 ''。
 * 只收掉首尾空行（行内空白不动，尽量「一字不改」）——writeFile 全量重写文件时把它原样写回，
 * 模板形态文件（frontmatter + `## 小节` 骨架、QuickAdd 宏写入的正文）不再因为插件写条目而丢失（ADR-0110）。
 */
export function extractPreamble(content: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const start = findEntryRegionStart(lines);
  if (start === 0) return '';
  return lines.slice(0, start).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * 解析日记文件内容（按 `# emoji序列 HH:mm` 标题切分条目）。
 *
 * 文件分两区（ADR-0110）：
 *  - 前导区：文件开头到首个疑似条目标题行之前（frontmatter、`## 小节` 骨架、模板正文）。
 *    解析器不产出条目，但写回时原样保留（extractPreamble），不构成丢失；
 *  - 条目区：自首个疑似条目标题行起。此区内无法归属任何条目的行才是「未解析行」
 *    （时间越界的条目标题行、空行 + `# ` 截断后的孤行等），写回会丢，由写前守卫拦截。
 *
 * UX-9：onUnparsed 仅统计条目区内的未解析行（前导区免统计）。
 */
export function parseFile(content: string, dateStr: string, onUnparsed?: (unparsedLineCount: number) => void): DiaryEntry[] {
  const entries: DiaryEntry[] = [];
  const lines = content.split('\n');
  let currentEntry: DiaryEntry | null = null;
  let contentLines: string[] = [];
  let unparsedLines = 0;

  const headingRegex = HEADING_RE;
  // 前导区边界：其前的行由 writeFile 原样保留，不计入未解析行
  const regionStart = findEntryRegionStart(lines);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(headingRegex);

    if (headingMatch) {
      if (currentEntry) {
        currentEntry.content = contentLines.join('\n').trim();
        entries.push(currentEntry);
        contentLines = [];
      }

      const emojiSequence = headingMatch[1];
      const time = headingMatch[2];

      const [hours, minutes] = time.split(':').map(Number);
      if (isNaN(hours) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        // 时间越界的条目标题行：跳过（原行为），计入未解析行
        unparsedLines++;
        continue;
      }

      const timeValue = hours * 100 + minutes;

      // 使用 emoji 映射解析每个 emoji 对应的标签
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const segments = segmenter.segment(emojiSequence);
      const tags: string[] = [];
      for (const seg of segments) {
        const ch = seg.segment;
        const mappedTag = emojiToTagMap[ch];
        if (mappedTag) {
          tags.push(mappedTag);
        }
      }
      if (tags.length === 0) {
        tags.push('日记');
      }

      currentEntry = {
        date: dateStr,
        time: time,
        timeValue: timeValue,
        tags: tags,
        emoji: emojiSequence,
        content: '',
        filename: dateStr,
        lineNumber: i + 1,
      };
    } else if (currentEntry) {
      if (line.trim() === '' && i + 1 < lines.length && lines[i + 1].match(/^#\s/)) {
        currentEntry.content = contentLines.join('\n').trim();
        entries.push(currentEntry);
        currentEntry = null;
        contentLines = [];
      } else {
        contentLines.push(line);
      }
    } else if (line.trim() !== '') {
      // 条目区内、首个条目之前游离的非空行：无法归属任何条目（原行为静默丢弃），计入未解析行。
      // 前导区（i < regionStart）不计：它由 writeFile 原样写回，不会丢。
      if (i >= regionStart) unparsedLines++;
    }
  }

  if (currentEntry) {
    currentEntry.content = contentLines.join('\n').trim();
    entries.push(currentEntry);
  }

  // UX-9：有未解析行才回调（零值时免打扰）
  if (onUnparsed && unparsedLines > 0) onUnparsed(unparsedLines);

  // 向后兼容旧数据
  for (const entry of entries) {
    if ((entry as any).type !== undefined) {
      entry.tags = [(entry as any).type];
      delete (entry as any).type;
    }
    if (!entry.tags || entry.tags.length === 0) {
      entry.tags = ['日记'];
    }
    // 重新生成 emoji 字段（保证与 tags 同步）
    entry.emoji = entry.tags.map((tag) => getTagEmoji(tag)).join('');
  }

  return entries;
}

/** 获取文件 frontmatter（无则返回 null） */
function getFileFrontmatter(file: any): Record<string, any> | null {
  const cache = getApp().metadataCache.getFileCache(file);
  return cache && cache.frontmatter ? cache.frontmatter : null;
}

/** 文件创建时间 → { timeStr, timeValue } */
async function getFileTimeParts(file: any): Promise<{ timeStr: string; timeValue: number }> {
  const stat = await file.stat;
  const createTime = stat.ctime || stat.birthtime;
  const m = moment(createTime);
  return { timeStr: m.format('HH:mm'), timeValue: parseInt(m.format('HHmm')) };
}

/** 生成特殊文件条目的稳定 id */
function makeEntryId(prefix: string, file: any, dateStr: string): string {
  return `${prefix}-${file.path.replace(/\//g, '-')}-${dateStr}`;
}

/**
 * 解析影视文件，生成一个日记条目（每个文件对应一个条目）
 */
export async function parseMovieFile(file: any): Promise<DiaryEntry | null> {
  try {
    const fm = getFileFrontmatter(file);
    if (!fm) return null;

    // 必须有影评且非空
    let review = fm['影评'];
    if (!review || review.trim() === '') return null;

    // 观影日期
    let dateStr = fm['观影日期'];
    if (!dateStr || !moment(dateStr, 'YYYY-MM-DD', true).isValid()) return null;
    dateStr = moment(dateStr).format('YYYY-MM-DD');

    let poster = fm['海报'];

    // 文件创建时间作为时分秒
    const { timeStr, timeValue } = await getFileTimeParts(file);

    // 解析标签
    let rawTag = '';
    if (fm.tags && Array.isArray(fm.tags) && fm.tags.length > 0) {
      rawTag = fm.tags[0];
    } else if (fm.tags && typeof fm.tags === 'string') {
      rawTag = fm.tags;
    }
    let mainTag = '日记';
    if (rawTag === '电影') mainTag = '电影';
    else if (rawTag === '纪录片') mainTag = '纪录片';
    else if (rawTag.endsWith('剧')) mainTag = '电视剧';
    else if (rawTag.endsWith('漫')) mainTag = '动漫';
    else if (rawTag === '电视剧') mainTag = '电视剧';
    else if (rawTag === '动漫') mainTag = '动漫';

    // 构建内容：影评 + 空行 + #《文件名》
    const fileNameWithoutExt = file.basename;
    const content = `${review.trim()}\n\n![[${poster}]]\n\n#${fileNameWithoutExt}`;

    // 生成日记条目
    return {
      date: dateStr,
      time: timeStr,
      timeValue: timeValue,
      tags: [mainTag],
      emoji: getTagEmoji(mainTag),
      content: content,
      filename: file.path,
      lineNumber: 0,
      id: makeEntryId('movie', file, dateStr),
    };
  } catch (err) {
    console.error(`解析影视文件失败 ${file.path}:`, err);
    return null;
  }
}

/**
 * 解析信文件，生成一个日记条目（每个文件对应一个条目）
 */
export async function parseLetterFile(file: any): Promise<DiaryEntry | null> {
  try {
    const fm = getFileFrontmatter(file);
    if (!fm) return null;

    // 如果 readonly 为 true，忽略
    if (fm.readonly === true) return null;

    // 解析 date（支持 "YYYY-MM-DD" 或 "YYYY-MM-DD HH:mm"）
    let dateStr = fm.date;
    if (!dateStr) return null;

    let parsed = moment(dateStr, ['YYYY-MM-DD', 'YYYY-MM-DD HH:mm'], true);
    if (!parsed.isValid()) {
      parsed = moment(dateStr);
      if (!parsed.isValid()) return null;
    }
    const dateFormatted = parsed.format('YYYY-MM-DD');

    // 读取文件内容，提取正文（去掉 frontmatter）
    const fullContent = await getApp().vault.read(file);
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
    const match = fullContent.match(frontmatterRegex);
    let body = fullContent;
    if (match) {
      body = fullContent.slice(match[0].length);
    }
    body = body.trim();

    // 标题（不含扩展名）
    const title = file.basename;
    // 构建内容：标题（不带《》） + 空行 + 正文
    const entryContent = `**${title}**\n\n${body}`.trim();
    // 文件创建时间作为时分秒
    const { timeStr, timeValue } = await getFileTimeParts(file);

    return {
      date: dateFormatted,
      time: timeStr,
      timeValue: timeValue,
      tags: ['信'],
      emoji: getTagEmoji('信'),
      content: entryContent,
      filename: file.path,
      lineNumber: 0,
      id: makeEntryId('letter', file, dateFormatted),
    };
  } catch (err) {
    console.error(`解析信文件失败 ${file.path}:`, err);
    return null;
  }
}

// ===== 自然语言时间解析（原 3550-3581） =====

/** 解析自然语言日期时间；失败返回 null */
export function parseNaturalTime(input: string): any {
  if (!input) return null;
  const now = moment();
  const lower = input.toLowerCase().trim();

  const relMatch = lower.match(/^(\d+)\s*(分钟?|小时?|天|秒)前$/);
  if (relMatch) {
    const num = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    if (unit.startsWith('分')) return now.clone().subtract(num, 'minutes');
    if (unit.startsWith('小')) return now.clone().subtract(num, 'hours');
    if (unit === '天') return now.clone().subtract(num, 'days');
    if (unit === '秒') return now.clone().subtract(num, 'seconds');
  }

  const yesterdayMatch = lower.match(/^昨天\s*(\d{1,2}:\d{2})$/);
  if (yesterdayMatch) {
    const time = yesterdayMatch[1];
    const yesterday = now.clone().subtract(1, 'days');
    return moment(`${yesterday.format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD HH:mm', true);
  }

  const beforeYesterdayMatch = lower.match(/^前天\s*(\d{1,2}:\d{2})$/);
  if (beforeYesterdayMatch) {
    const time = beforeYesterdayMatch[1];
    const before = now.clone().subtract(2, 'days');
    return moment(`${before.format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD HH:mm', true);
  }

  const std = moment(input, 'YYYY-MM-DD HH:mm', true);
  if (std.isValid()) return std;
  return null;
}

/** 自然语言时间优先，失败回退严格 `YYYY-MM-DD HH:mm`（写日记保存与手动输入共用） */
export function parseFlexibleDateTime(input: string): any {
  const natural = parseNaturalTime(input);
  if (natural && natural.isValid()) return natural;
  return moment(input, 'YYYY-MM-DD HH:mm', true);
}
