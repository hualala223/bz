/**
 * 当日待办事项 / 日常行为记录（diary 域，issue 247）。
 * 自 QuickAdd「日常时间记录」Multi 的两个 Capture 宏换血进插件，与已有
 * task-check/review/plan（daily.ts）同源不同写法：那三个是「生成条目」，这两个是
 * 「捕获行」——往当天日记 `我的/日记/YYYY-MM-DD.md` 指定小节末尾追加一行。
 *
 * 数据契约（兼容冻结，逐字沿用 QuickAdd data.json）：
 *  - 当日待办事项：insertAfter.after = `### 代办事项`、task: true、
 *    format = `{{VALUE:请输入待办事项}}-{{DATE:HH:mm}}`；
 *  - 日常行为记录：insertAfter.after = `## 日常行为记录`、
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
 */
import { moment } from 'obsidian';
import { notice } from '../core/notice';
import { enqueueFileTask } from '../core/storage';
import { uiModal, uiInput, uiDialogActions } from '../core/ui';
import { DIARY_DIRECTORY } from './config';
import { getApp } from './app';

/** 日常行为记录小节标记（QuickAdd 宏 insertAfter.after，逐字沿用） */
export const ACTIVITY_HEADING = '## 日常行为记录';

/** 当日待办事项小节标记（同 daily.ts PLAN_MARKER 逐字一致，独立导出免跨文件耦合） */
export const TODO_HEADING = '### 代办事项';

// ===== 纯数据层（node 可测，零 vault/DOM） =====

/** 标题的标题层级（`#` 计数；`## 日常行为记录` → 2，`### 代办事项` → 3） */
function headingLevel(heading: string): number {
  const m = heading.match(/^#+/);
  return m ? m[0].length : 1;
}

/**
 * 把一行插入指定小节末尾（纯函数）：
 *  - 命中小节：插到小节内最后一个非空行之后（保留小节尾部空行结构与后继小节不动）；
 *    小节为空（标记行后无内容）则紧跟标记行之后插入；
 *  - 未命中：整行追加到文件末尾并收掉文末多余空行（placed = 'append-end'，不建小节）；
 *  - 原文为空/纯空白（文件缺失走此分支前置）视为空文件：直接「标记 + 行」起头。
 */
export function insertIntoSection(
  content: string,
  heading: string,
  line: string
): { content: string; placed: 'section' | 'append-end' } {
  const level = headingLevel(heading);

  if (!content.trim()) {
    return { content: `${heading}\n${line}\n`, placed: 'section' };
  }

  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const markerIdx = lines.findIndex((l) => l.trim() === heading);

  if (markerIdx === -1) {
    const trimmed = [...lines];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === '') trimmed.pop();
    trimmed.push(line);
    return { content: trimmed.join('\n') + '\n', placed: 'append-end' };
  }

  // 小节结束 = 标记行之后第一个层级 ≤ 本小节的标题行（同/更高级小节）
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
  lines.splice(insertAt, 0, line);
  return { content: lines.join('\n'), placed: 'section' };
}

// ===== 薄壳 IO（本文件内唯一触碰 vault 的一层） =====

/** 捕获结果（UI 层据此提示） */
export interface DiaryCaptureResult {
  path: string;
  created: boolean;
  placed: 'section' | 'append-end';
}

/**
 * 捕获一行到日记文件指定小节（QuickAdd Capture 同语义薄壳）。
 * 目标目录缺失逐段创建后，走同路径串行队列：读原文 → 纯函数插行 → modify/create。
 */
export async function captureToDiarySection(
  app: any,
  dateStr: string,
  heading: string,
  line: string
): Promise<DiaryCaptureResult> {
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
    const next = insertIntoSection(existing ?? '', heading, line);
    if (f) await app.vault.modify(f, next.content);
    else await app.vault.create(path, next.content);
    return { path, created, placed: next.placed };
  });
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

/** 当日待办事项行：`- [ ] {内容}-{HH:mm}`（QuickAdd format `{{VALUE}}-{{DATE:HH:mm}}` + task:true） */
export function buildTodoLine(text: string, time: string): string {
  return `- [ ] ${sanitizeCaptureText(text)}-${time}`;
}

/** 日常行为记录行：`-{HH:mm}-{活动}`（QuickAdd format `- {{DATE:HH:mm}}-{{VALUE}}`） */
export function buildActivityLine(text: string, time: string): string {
  return `- ${time}-${sanitizeCaptureText(text)}`;
}

/** 当日待办事项：输入内容 → `- [ ] 内容-HH:mm` 插入 `### 代办事项` 小节末尾（QuickAdd 同格式） */
export function openTodoCapture(): void {
  openQuickCapture({
    title: '当日待办事项',
    placeholder: '输入待办事项，加入今天日记的代办清单',
    emptyHint: '请输入待办事项',
    heading: TODO_HEADING,
    lineBuilder: buildTodoLine,
  });
}

/** 日常行为记录：输入活动 → `- HH:mm-活动` 插入 `## 日常行为记录` 小节末尾（QuickAdd 同格式） */
export function openActivityCapture(): void {
  openQuickCapture({
    title: '日常行为记录',
    placeholder: '输入刚做了什么，记进今天日记',
    emptyHint: '请输入已做活动',
    heading: ACTIVITY_HEADING,
    lineBuilder: buildActivityLine,
  });
}
