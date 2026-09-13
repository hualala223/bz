/**
 * 日常行为记录（diary 域，issue 247；当日待办事项捕获已随 ADR-0122 退役——日记
 * `## 代办事项` 的写入由 todo 域日记同步模块（todo-diary-sync）接管，本文件保留
 * 其小节标记 TODO_HEADING 与小节编辑原语供其复用）。
 * 自 QuickAdd「日常时间记录」Multi 的 Capture 宏换血进插件，与已有
 * task-check/review/plan（daily.ts）同源不同写法：那三个是「生成条目」，这个是
 * 「捕获行」——往当天日记 `我的/日记/YYYY-MM-DD.md` 指定小节末尾追加一行。
 *
 * 数据契约（兼容冻结，逐字沿用 QuickAdd data.json；标题层级按 ADR-0113 各上提一级）：
 *  - 日常行为记录：insertAfter.after = `# 日常行为记录`、
 *    format = `- {{DATE:HH:mm}}-{{VALUE:请输入已做活动}}`。
 *
 * 复用 issue 246（collect 域）建立的共写先例：与 QuickAdd 宏同格式共写同一批 md 文件，
 * 两者共存互不干扰。写盘走 core/storage 同路径串行队列（键 = 日记文件路径），与 diary
 * store writeFile（同队列键）互斥，消灭读改写窗口踩踏。
 * 两种现存文件形态都直接原样插入、其余行不动：
 *  - 模板形态（frontmatter + `## 小节`，QuickAdd 模板创建）：按 QuickAdd 语义插入小节末尾；
 *  - 条目形态（`# emoji HH:mm` 时间标题，本插件条目模型重写）：小节标记在条目正文里，
 *    同样在该小节末尾插入，行作为正文被 parser 原样保留（重写不丢）。
 * 小节不存在时不建不补（沿用 createIfNotFound=false，防破坏文体），有意改进为在文件
 * 末尾追加一行并在通知中说明；文件缺失时以「标记 + 首行」建文件——不复制 QuickAdd
 * 模板 frontmatter，避免制造对 diary 解析器永不可见的新文件。
 *
 * 纯层契约（AGENTS 测试规范）：行构建/小节插入为纯函数（node 可测）；
 * 副作用（读文件 → 纯函数 → 写文件）为薄壳；弹窗为 UI 层。
 *
 * 另：本文件是全插件**唯一**的「按标题小节插入」实现所在地（ADR-0114）。写日记（`# 随笔`）
 * 与每日复盘（`# 当日复盘`）的落盘层（daily-write.ts）复用同一套定位逻辑，只用三个入口切差异：
 *  - `insertIntoSection`  —— 单行捕获（日常行为记录入口，冻结格式 `- HH:mm-活动`）；
 *  - `insertBlockIntoSection` —— 多行块（写日记 / 复盘），可带 `createIfNotFound` 现场建节；
 *  - `editSectionLines` —— 小节行集合变换（更新/删除，ADR-0122 待办日记投影用），
 *    与 `writeDiarySection`（小节写壳导出）一并供 todo 域同步模块复用。
 * 二者共用 `locateSection`，故「新层级优先、旧层级兜底」与「小节边界取命中行实际层级」的
 * 兼容承诺只有一份实现，不会漂移。
 */
import { moment } from 'obsidian';
import { notice } from '../core/notice';
import { enqueueFileTask } from '../core/storage';
import { uiModal, uiInput, uiDialogActions } from '../core/ui';
import { DIARY_DIRECTORY } from './config';
import { getApp } from './app';

/** 日常行为记录小节标记（QuickAdd 宏 insertAfter.after 上提一级，ADR-0113） */
export const ACTIVITY_HEADING = '# 日常行为记录';

/** 待办事项小节标记（同 daily.ts PLAN_MARKER 逐字一致；ADR-0122 起消费方 = todo 域日记同步模块） */
export const TODO_HEADING = '## 代办事项';

// ===== 纯数据层（node 可测，零 vault/DOM） =====

/** 标题的标题层级（`#` 计数；`# 日常行为记录` → 1，`## 代办事项` → 2） */
function headingLevel(heading: string): number {
  const m = heading.match(/^#+/);
  return m ? m[0].length : 1;
}

/**
 * 找小节标记行（精确层级优先，其次兼容旧文件的多一级形态）。
 * ADR-0113 把骨架提到 `#`、三段提到 `##`，此前写下的日记仍是 `##` / `###`；
 * 插行侧按「新层级优先、旧层级兜底」两轮查找，历史文件照常命中不退化。
 */
function findMarkerLine(lines: string[], heading: string): number {
  const exact = lines.findIndex((l) => l.trim() === heading);
  if (exact !== -1) return exact;
  const legacy = '#' + heading;
  return lines.findIndex((l) => l.trim() === legacy);
}

/** 小节定位结果：标记行号、命中行的实际层级、小节结束行（首个同/更高级标题行，无线则取文末）、插入锚点 */
interface SectionSpot {
  markerIdx: number;
  level: number;
  sectionEnd: number;
  insertAt: number;
}

/**
 * 定位小节（纯函数内部件，两个插入入口共用；未命中返回 null）：
 *  - 小节结束按**命中行的实际层级**判定，故旧层级文件切分口径与改动前一致；
 *  - 插入锚点 = 小节内最后一个非空行之后（小节尾部空行结构与后继小节因此保持不动）。
 */
function locateSection(lines: string[], heading: string): SectionSpot | null {
  const markerIdx = findMarkerLine(lines, heading);
  if (markerIdx === -1) return null;
  const level = headingLevel(lines[markerIdx]);
  let sectionEnd = lines.length;
  for (let j = markerIdx + 1; j < lines.length; j++) {
    const m = lines[j].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      sectionEnd = j;
      break;
    }
  }
  let insertAt = markerIdx + 1;
  for (let k = markerIdx + 1; k < sectionEnd; k++) {
    if (lines[k].trim() !== '') insertAt = k + 1;
  }
  return { markerIdx, level, sectionEnd, insertAt };
}

/** 收掉数组尾部空行（追加/建节前的公共步骤） */
function trimTrailingBlanks(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  return out;
}

/**
 * 把一行插入指定小节末尾（纯函数，单行捕获语义，ADR-0113 冻结）：
 *  - 命中小节（新层级或旧层级）：插到小节内最后一个非空行之后（保留小节尾部空行结构与
 *    后继小节不动）；小节为空（标记行后无内容）则紧跟标记行之后插入；
 *  - 未命中：整行追加到文件末尾并收掉文末多余空行（placed = 'append-end'，不建小节）；
 *  - 原文为空/纯空白（文件缺失走此分支前置）视为空文件：直接「标记 + 行」起头（用新层级）。
 */
export function insertIntoSection(
  content: string,
  heading: string,
  line: string
): { content: string; placed: 'section' | 'append-end' } {
  if (!content.trim()) {
    return { content: `${heading}\n${line}\n`, placed: 'section' };
  }

  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const spot = locateSection(lines, heading);

  if (!spot) {
    const trimmed = trimTrailingBlanks(lines);
    trimmed.push(line);
    return { content: trimmed.join('\n') + '\n', placed: 'append-end' };
  }

  lines.splice(spot.insertAt, 0, line);
  return { content: lines.join('\n'), placed: 'section' };
}

/** 块插入落点：'section' 命中已有小节；'created' 现场在文末新建小节；'append-end' 未命中且不许建节 */
export type SectionBlockPlaced = 'section' | 'created' | 'append-end';

/**
 * 把**多行块**插入指定小节末尾（纯函数；写日记 / 每日复盘落盘用，ADR-0114）：
 *  - 与单行版共用 `locateSection`，旧层级兼容口径完全一致；
 *  - 块前恒加一个空行（与上一段内容分隔），块后按需补一个空行——仅当小节原本紧贴后继标题
 *    （无空行分隔）时才补，故既有空行结构不会被叠成两行；
 *  - 未命中小节：`createIfNotFound` 为真则在文末新建「空行 + 小节标题 + 空行 + 块」
 *    （placed = 'created'，复盘用：`# 当日复盘` 不在骨架里）；为假则整块追加文末
 *    （placed = 'append-end'，写日记用：存量文件不动，ADR-0113 决策 3）；
 *  - 原文为空/纯空白视为空文件：直接「小节标题 + 空行 + 块」起头（用入参的新层级标题）。
 */
export function insertBlockIntoSection(
  content: string,
  heading: string,
  block: string,
  opts: { createIfNotFound?: boolean } = {}
): { content: string; placed: SectionBlockPlaced } {
  const body = (block || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  if (!content.trim()) {
    return { content: `${heading}\n\n${body}\n`, placed: 'section' };
  }

  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const spot = locateSection(lines, heading);

  if (spot) {
    const inserted = ['', ...body.split('\n')];
    // 小节原本没有空行分隔后继标题 → 补一个，避免块尾与下一个标题贴死
    if (spot.sectionEnd < lines.length && lines[spot.sectionEnd - 1].trim() !== '') inserted.push('');
    lines.splice(spot.insertAt, 0, ...inserted);
    return { content: lines.join('\n'), placed: 'section' };
  }

  const trimmed = trimTrailingBlanks(lines);
  if (opts.createIfNotFound) {
    trimmed.push('', heading, '', ...body.split('\n'));
    return { content: trimmed.join('\n') + '\n', placed: 'created' };
  }
  trimmed.push('', ...body.split('\n'));
  return { content: trimmed.join('\n') + '\n', placed: 'append-end' };
}

/**
 * 小节行集合变换（纯函数，ADR-0122 待办日记投影用）：
 * 把小节内（标记行之后到小节结束前）的全部行交给 `fn` 变换，返回 null 表示无需改动；
 * 小节外的行（标记行本身、其他小节）永远原样保留，小节不存在时 likewise 原样返回。
 * 与插入版共用 `locateSection`，「新层级优先、旧层级兜底」口径单源不漂移。
 */
export function editSectionLines(
  content: string,
  heading: string,
  fn: (sectionLines: string[]) => string[] | null
): { content: string; changed: boolean } {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const spot = locateSection(lines, heading);
  if (!spot) return { content, changed: false };
  const sectionLines = lines.slice(spot.markerIdx + 1, spot.sectionEnd);
  const next = fn(sectionLines);
  if (!next) return { content, changed: false };
  const rebuilt = [
    ...lines.slice(0, spot.markerIdx + 1),
    ...next,
    ...lines.slice(spot.sectionEnd),
  ];
  return { content: rebuilt.join('\n'), changed: true };
}

// ===== 薄壳 IO（本文件内唯一触碰 vault 的一层） =====

/** 小节写入结果（UI 层据此提示）：placed 见 SectionBlockPlaced */
export interface DiaryCaptureResult {
  path: string;
  created: boolean;
  placed: SectionBlockPlaced;
}

/** 目标目录缺失逐段创建（写日记 / 捕获共用；失败交写入阶段兜底报错） */
async function ensureDiaryFolder(app: any): Promise<void> {
  let cur = '';
  for (const p of DIARY_DIRECTORY.split('/')) {
    cur = cur ? `${cur}/${p}` : p;
    if (app?.vault?.getAbstractFileByPath?.(cur)) continue;
    try {
      await app.vault.createFolder(cur);
    } catch {
      /* 并发创建/无权限：由写入阶段兜底报错 */
    }
  }
}

/**
 * 日记小节写入薄壳（单行捕获 / 多行块共用）：确保目录 → 同路径串行队列内
 * 「读原文 → 纯函数变换 → modify/create」。transform 收到磁盘原文（文件缺失时为空串），
 * 返回下一版全文与落点；队列键 = 日记文件路径，与 diary store writeFile 互斥。
 * 导出供 todo 域日记同步模块复用（ADR-0122：同一写壳，同一队列键，互斥不踩踏）。
 */
export async function writeDiarySection(
  app: any,
  dateStr: string,
  transform: (existing: string) => { content: string; placed: SectionBlockPlaced }
): Promise<DiaryCaptureResult> {
  await ensureDiaryFolder(app);
  const path = `${DIARY_DIRECTORY}/${dateStr}.md`;
  return enqueueFileTask(path, async () => {
    const f = app.vault.getAbstractFileByPath(path) ?? null;
    let existing: string | null = null;
    if (f) {
      try {
        existing = await app.vault.read(f);
      } catch {
        existing = null;
      }
    }
    const created = existing === null;
    const next = transform(existing ?? '');
    if (f) await app.vault.modify(f, next.content);
    else await app.vault.create(path, next.content);
    return { path, created, placed: next.placed };
  });
}

/**
 * 捕获一行到日记文件指定小节（QuickAdd Capture 同语义薄壳）。
 * 目标目录缺失逐段创建后，走同路径串行队列：读原文 → 纯函数插行 → modify/create。
 * 未命中且不许建节：追加文末（createIfNotFound 恒假，防破坏存量文体）。
 */
export async function captureToDiarySection(
  app: any,
  dateStr: string,
  heading: string,
  line: string
): Promise<DiaryCaptureResult> {
  return writeDiarySection(app, dateStr, (existing) => insertIntoSection(existing, heading, line));
}

/**
 * 多行块写入日记小节（写日记 / 每日复盘薄壳，ADR-0114）。
 * 与单行捕获共用写壳；`createIfNotFound` 决定未命中时是否在文末现场建节
 * （复盘 `# 当日复盘` 不在骨架里 → 建；写日记 `# 随笔` 由骨架自带 → 不建，追加文末并提示）。
 */
export async function writeBlockToDiarySection(
  app: any,
  dateStr: string,
  heading: string,
  block: string,
  opts: { createIfNotFound?: boolean } = {}
): Promise<DiaryCaptureResult> {
  return writeDiarySection(app, dateStr, (existing) =>
    insertBlockIntoSection(existing, heading, block, opts)
  );
}

// ===== 输入弹窗 + 命令入口 =====

/** 捕获行单行语义：输入换行折叠为空格（QuickAdd 单值输入天然单行） */
export function sanitizeCaptureText(text: string): string {
  return (text || '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

/** 内部提交链路：落盘 → 通知（成功文案区分小节命中/文末追加） */
async function submitCapture(text: string, heading: string, line: string): Promise<void> {
  const today = moment().format('YYYY-MM-DD');
  try {
    const res = await captureToDiarySection(getApp(), today, heading, line);
    notice(
      res.placed === 'section'
        ? `已记录到 ${today} 日记${res.created ? '（已新建）' : ''}`
        : `已记录到 ${today} 日记（未找到${heading}小节，已追加到文末）`,
      'success'
    );
  } catch (e) {
    notice('记录失败：' + (e instanceof Error ? e.message : String(e)), 'error');
  }
}

/**
 * 捕获输入弹窗（两入口共用）：单行输入 → Enter/确认即写入。
 * 不放关闭按钮，靠遮罩 + ESC（主窗口规范）；Enter 直接提交。
 * lineBuilder = 冻结格式行构建（QuickAdd data.json format 逐字形态）。
 */
export function openQuickCapture(opts: {
  title: string;
  placeholder: string;
  emptyHint: string;
  heading: string;
  lineBuilder: (text: string, time: string) => string;
}): void {
  const body = document.createElement('div');
  body.className = 'bz-diary-capture';

  const titleEl = document.createElement('div');
  titleEl.className = 'bz-diary-capture-title';
  titleEl.textContent = opts.title;
  body.appendChild(titleEl);

  const input = uiInput({ placeholder: opts.placeholder });
  body.appendChild(input);

  const { close } = uiModal({ content: body, maxWidth: 400 });

  const submit = (): void => {
    const text = sanitizeCaptureText(input.value);
    if (!text) {
      notice(opts.emptyHint, 'warning');
      return;
    }
    close();
    void submitCapture(text, opts.heading, opts.lineBuilder(text, moment().format('HH:mm')));
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  body.appendChild(uiDialogActions({ okText: '记一条', onOk: submit, onCancel: () => close() }).row);
  setTimeout(() => input.focus(), 0);
}

// ===== 冻结格式行构建（QuickAdd format 的展开形态，纯函数便于测试冻结） =====

/** 日常行为记录行：`-{HH:mm}-{活动}`（QuickAdd format `- {{DATE:HH:mm}}-{{VALUE}}`） */
export function buildActivityLine(text: string, time: string): string {
  return `- ${time}-${sanitizeCaptureText(text)}`;
}

/** 日常行为记录：输入活动 → `- HH:mm-活动` 插入 `# 日常行为记录` 小节末尾（QuickAdd 同格式） */
export function openActivityCapture(): void {
  openQuickCapture({
    title: '日常行为记录',
    placeholder: '输入刚做了什么，记进今天日记',
    emptyHint: '请输入已做活动',
    heading: ACTIVITY_HEADING,
    lineBuilder: buildActivityLine,
  });
}
