/**
 * 写日记 / 每日复盘的「按小节落盘」层（issue 252，ADR-0114）。
 *
 * 落点（用户裁定）：
 *  - 写日记 → `# 随笔`：骨架自带（模板-日记.md / FALLBACK_DIARY_TEMPLATE），
 *    **缺失不建**——追加文末并在通知里说明，存量文件一字不改（ADR-0113 决策 3）；
 *  - 每日复盘 → `# 当日复盘`：**不在骨架里**，缺失则在文末现场新建小节
 *    （用户原话「在日记文件最下面添加『当日复盘』」）。
 *
 * 块形态（同样由用户裁定）：
 *  - 写日记：`**✍️ 20:30**` + 空行 + 正文。加粗行**不是标题**，故 `HEADING_RE`
 *    （`^#\s*emoji HH:mm`）及仓库里另外三份同源正则在日记面板 / 标签筛选 / 回忆墙 /
 *    智能猫一律命中不到——这正是用户要的「不要让这些内容出现在那些地方」；
 *    多类型 emoji 连写（选「随笔 + 梦」→ `**✍️🌙 20:30**`），与条目模型记号同源。
 *  - 每日复盘：`## 🪞 21:40` + 空行 + 内层模板。时间分隔标题为 h2，落在骨架级 `# 当日复盘`
 *    之下（ADR-0113「复盘只提首行」的延伸：小节名占 `#`，时间行占 `##`）。
 *
 * 为什么不复用 addEntry：条目模型整文件重写产不出「骨架 + 小节」形态，且条目标题
 * `# emoji HH:mm` 会被上述四个消费方解析成条目。写盘走 core/storage 同路径串行队列
 * （键 = 日记文件路径，与 diary store writeFile 互斥），与日程规划同口径。
 */
import { notice } from '../core/notice';
import { getTagEmoji } from './config';
import { getApp } from './app';
import { writeBlockToDiarySection, type DiaryCaptureResult } from './daily-capture';

/** 写日记落点小节（骨架自带；缺失不建，见文件头） */
export const ESSAY_HEADING = '# 随笔';

/** 每日复盘落点小节（不在骨架里；缺失则写时新建） */
export const REVIEW_HEADING = '# 当日复盘';

/** 复盘块的时间分隔标题层级：h2（小节名占 h1，故差一级） */
const REVIEW_TIME_PREFIX = '## ';
/** 写日记块的标题形态：加粗行（非标题，任何标题正则都不命中） */
const ESSAY_TIME_WRAP = (emojis: string, time: string): string => `**${emojis} ${time}**`;

/** 小节标题的文字部分（通知文案用；`# 当日复盘` → `当日复盘`） */
export function sectionTitle(section: string): string {
  return section.replace(/^#{1,6}[ \t]*/, '');
}

/**
 * 该小节的写入是否允许现场建节。
 * 只有复盘允许：它不在骨架里；随笔在骨架里，缺失说明是存量文件 → 遵「存量不动」追加文末。
 */
export function sectionCreatesIfMissing(section: string): boolean {
  return section === REVIEW_HEADING;
}

/** 块首行（纯函数）：写日记 = 加粗行；复盘 = h2 时间分隔标题 */
export function buildEntryTitle(section: string, tags: string[], time: string): string {
  const emojis = tags.map((tag) => getTagEmoji(tag)).join('');
  return section === REVIEW_HEADING ? `${REVIEW_TIME_PREFIX}${emojis} ${time}` : ESSAY_TIME_WRAP(emojis, time);
}

/** 块正文（纯函数）：标题 + 空行 + 正文；正文为空（含纯空白）时只留标题行 */
export function buildEntryBlock(section: string, tags: string[], time: string, content: string): string {
  const title = buildEntryTitle(section, tags, time);
  const body = (content || '').trim();
  return body ? `${title}\n\n${body}` : title;
}

/** 落盘结果：path 供「保存后打开日记文件」使用 */
export interface DiaryEntryWriteResult extends DiaryCaptureResult {
  section: string;
}

/** 通知文案（纯函数）：落点三分支各自说清楚，append-end 交给 warning 语义 */
export function writeNoticeText(res: DiaryCaptureResult, dateStr: string, section: string): string {
  const name = sectionTitle(section);
  if (res.placed === 'created') return `已保存日记（已在 ${dateStr} 日记末尾新建「${name}」小节）`;
  if (res.placed === 'append-end') return `已保存日记（${dateStr} 日记里没有「${name}」小节，已追加到文末）`;
  return res.created ? `已保存日记（${dateStr} 日记不存在，已新建）` : '已保存日记';
}

/**
 * 写入一条日记内容到指定小节（写日记 / 每日复盘共用）。
 * 落点是否建节由 `sectionCreatesIfMissing(section)` 决定；成功/警告由落点决定。
 */
export async function writeDiaryEntry(
  dateStr: string,
  section: string,
  tags: string[],
  time: string,
  content: string
): Promise<DiaryEntryWriteResult> {
  const block = buildEntryBlock(section, tags, time, content);
  const res = await writeBlockToDiarySection(getApp(), dateStr, section, block, {
    createIfNotFound: sectionCreatesIfMissing(section),
  });
  notice(writeNoticeText(res, dateStr, section), res.placed === 'append-end' ? 'warning' : 'success');
  return { ...res, section };
}
