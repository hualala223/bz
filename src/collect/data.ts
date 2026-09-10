/**
 * 日常收集（collect 域）数据纯层（issue 246）。
 *
 * 收编 QuickAdd「日常收集」Multi 宏的捕获能力：选分类 → 输内容 → 按
 * `- YY/MM/DD-HH:MM:SS 内容` 追加到目标文件「## 非文件收集」标题下末尾。
 *
 * 纯层契约（AGENTS 测试规范：数据层测试跑 node 环境）：
 *  - 捕获管线核心为纯函数：`appendCollect(文件原文, 收集内容, 当前时间) → 新文件原文`；
 *  - 条目解析器纯函数：`parseEntries(文件原文) → 条目数组`（只认标准时间戳格式行，其余行忽略）；
 *  - 副作用（读文件 → 纯函数 → 写文件）为薄壳，见 ./store；本文件零 vault/DOM 访问
 *    （仅经 core/settings-provider 读分类配置——config 层依赖 core，符合 ADR-0002）。
 *
 * 兼容冻结（issue 246 用户决策 4/6/7）：
 *  - 时间戳沿用 QuickAdd 的 `YY/MM/DD-HH:MM:SS` 形态（现存条目秒位越界的历史怪值不校验不清洗）；
 *  - 写入位置与格式同构，插件与 QuickAdd 宏可共存共写同一批 md 文件；
 *  - 目标文件不存在时自动创建（含 frontmatter + `## 非文件收集`，QuickAdd 原配是报错，此处有意改进）。
 */
import { tryGetSettings } from '../core/settings-provider';

/** 收集条目归属标题（QuickAdd 宏 insertAfter.after，逐字沿用） */
export const COLLECT_HEADING = '## 非文件收集';

/** 默认目标文件夹（vault 根相对；与 QuickAdd 宏现存目录一致） */
export const DEFAULT_COLLECT_FOLDER = '我的/日常收集';

/** 分类配置条目（设置键 collectCategories 的元素） */
export interface CollectCategory {
  /** 分类名（命令 id 与面板入口的显示名） */
  name: string;
  /** 目标文件名或 vault 相对路径；含「/」视为完整路径，否则挂在目标文件夹下 */
  file: string;
}

/** 一条收集条目（解析器产出） */
export interface CollectEntry {
  /** 所属分类名（单文件解析时为空串） */
  category: string;
  /** 原始时间戳文本 `YY/MM/DD-HH:MM:SS` */
  stamp: string;
  /** 条目正文（不含 `- 时间戳 ` 前缀） */
  text: string;
  /** 时间戳解析结果（毫秒；不可解析为 null） */
  time: number | null;
}

/** 标准条目行：- YY/MM/DD-HH:MM:SS 内容（秒位等数值不校验，历史怪值照收） */
const ENTRY_RE = /^-[\t ]+(\d{2})\/(\d{2})\/(\d{2})-(\d{2}):(\d{2}):(\d{2})[\t ]+(.*)$/;

/**
 * 内置 16 分类（照 QuickAdd「日常收集」宏迁移，顺序同宏内 choices）。
 * name 取目标文件名（宏内「日常金优秀句子收集」为历史笔误，按其指向的
 * `日常优秀描写句子收集.md` 正名；「日常人物需求收集 」去尾空格）。
 * 未纳入宏的文件（冲突类型/冲突：矛盾对抗/情感/想法/疑问）不预置，用户可在 ⚙️ 自行添加。
 */
export const DEFAULT_COLLECT_CATEGORIES: ReadonlyArray<CollectCategory> = [
  { name: '故事情节收集', file: '故事情节收集.md' },
  { name: '日常感悟收集', file: '日常感悟收集.md' },
  { name: '人物特征收集', file: '人物特征收集.md' },
  { name: '代表人物收集', file: '代表人物收集.md' },
  { name: '日常搞笑收集', file: '日常搞笑收集.md' },
  { name: '日常技巧收集', file: '日常技巧收集.md' },
  { name: '日常灵感收集', file: '日常灵感收集.md' },
  { name: '日常人物需求收集', file: '日常人物需求收集.md' },
  { name: '日常金句收集', file: '日常金句收集.md' },
  { name: '日常优秀描写句子收集', file: '日常优秀描写句子收集.md' },
  { name: '日常事件收集', file: '日常事件收集.md' },
  { name: '日常受触动词句收集', file: '日常受触动词句收集.md' },
  { name: '日常吐槽收集', file: '日常吐槽收集.md' },
  { name: '日常信息收集', file: '日常信息收集.md' },
  { name: '日常社会事件收集', file: '日常社会事件收集.md' },
  { name: '日常社会敏感议题收集', file: '日常社会敏感议题收集.md' },
];

/* ---------- 时间戳 ---------- */

function p2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 条目时间戳 `YY/MM/DD-HH:MM:SS`（QuickAdd 宏 {{DATE:YY/MM/DD-HH:MM:SS}} 同款） */
export function formatStamp(now: Date | number = Date.now()): string {
  const d = now instanceof Date ? now : new Date(now);
  return `${p2(d.getFullYear() % 100)}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}-${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/**
 * 时间戳文本 → 毫秒（`YY` 按 20YY 解释；秒位越界等怪值由 Date 自行进位，不校验不清洗）。
 * 不可解析返回 null。
 */
export function parseStamp(stamp: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})-(\d{2}):(\d{2}):(\d{2})$/.exec((stamp || '').trim());
  if (!m) return null;
  const t = new Date(
    2000 + Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  ).getTime();
  return Number.isFinite(t) ? t : null;
}

/* ---------- 条目构造 ---------- */

/** 多行输入 → 有效内容行（去首尾空白、按换行拆分、丢弃空行；每行一条，保持换行结构不并成一行） */
export function splitContentLines(content: string): string[] {
  return (content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** 内容行 → 标准条目行（同一时间戳前缀） */
export function buildEntryLines(content: string, stamp: string): string[] {
  return splitContentLines(content).map((line) => `- ${stamp} ${line}`);
}

/* ---------- 捕获管线（纯函数） ---------- */

/** 段内下一处同级/更高级标题的行号（无则文件末尾） */
function sectionEndRow(rows: string[], fromRow: number): number {
  for (let i = fromRow; i < rows.length; i++) {
    if (/^#{1,2}[\t ]/.test(rows[i])) return i;
  }
  return rows.length;
}

/**
 * 把条目行追加到「## 非文件收集」标题段末尾（找不到标题则追加文件末尾）。
 * 段尾空行贴回：新条目紧接最后一条内容，不与段尾留白之间插空档。
 */
export function appendEntryLines(text: string, lines: string[]): string {
  if (!lines.length) return text;
  const src = typeof text === 'string' ? text : '';
  if (!src.trim()) return lines.join('\n') + '\n';
  const rows = src.split('\n');
  const idx = rows.findIndex((l) => l.trim() === COLLECT_HEADING || l.trim().startsWith(COLLECT_HEADING + ' '));
  let at: number;
  if (idx < 0) {
    // 标题缺失（兼容冻结：不新建标题，直接追加文件末尾——贴住末条内容，不留空档）
    at = rows.length;
    while (at > 0 && rows[at - 1].trim() === '') at--;
  } else {
    at = sectionEndRow(rows, idx + 1);
    while (at > idx + 1 && rows[at - 1].trim() === '') at--;
  }
  return [...rows.slice(0, at), ...lines, ...rows.slice(at)].join('\n');
}

/** 捕获管线核心：`(文件原文, 收集内容, 当前时间) → 新文件原文` */
export function appendCollect(text: string, content: string, now: Date | number = Date.now()): string {
  return appendEntryLines(text, buildEntryLines(content, formatStamp(now)));
}

/** 目标文件不存在时的初始内容（frontmatter + 标题，形态照现存收集文件） */
export function initialFileContent(now: Date | number = Date.now()): string {
  const d = now instanceof Date ? now : new Date(now);
  const created = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  return `---\naliases: ""\ntags: \ncreated: ${created}\n---\n${COLLECT_HEADING}\n`;
}

/* ---------- 条目解析（纯函数） ---------- */

/**
 * 文件原文 → 条目数组（只认标准时间戳格式行，其余行忽略——含无时间戳的历史条目、
 * 引用续行、dataview 代码块等）。category 可选：聚合多文件时回填分类名。
 */
export function parseEntries(text: string, category = ''): CollectEntry[] {
  const out: CollectEntry[] = [];
  for (const raw of (text || '').split('\n')) {
    const m = ENTRY_RE.exec(raw.trim());
    if (!m) continue;
    const stamp = `${m[1]}/${m[2]}/${m[3]}-${m[4]}:${m[5]}:${m[6]}`;
    out.push({ category, stamp, text: m[7], time: parseStamp(stamp) });
  }
  return out;
}

/** 摘要截断（超出加 …；max ≤ 0 原样返回） */
export function truncateText(text: string, max: number): string {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  if (max <= 0 || s.length <= max) return s;
  return s.slice(0, max) + '…';
}

/* ---------- 分类配置（读设置 + 纯列表操作） ---------- */

/** 当前目标文件夹（设置缺失回落默认） */
export function getCollectFolder(): string {
  const raw = (tryGetSettings() as { collectFolderPath?: unknown } | null)?.collectFolderPath;
  const v = typeof raw === 'string' ? raw.trim().replace(/^\/+|\/+$/g, '') : '';
  return v || DEFAULT_COLLECT_FOLDER;
}

/** 容错规范化：过滤无效项、去空、按名去重（旧/脏 data.json 不炸） */
export function normalizeCategories(raw: unknown): CollectCategory[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: CollectCategory[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const name = String((it as CollectCategory).name ?? '').trim();
    if (!name || seen.has(name)) continue;
    const file = String((it as CollectCategory).file ?? '').trim() || name;
    seen.add(name);
    out.push({ name, file: ensureMdName(file) });
  }
  return out;
}

/** 当前分类清单（设置缺失/为空回落内置 16 分类） */
export function getCategories(): CollectCategory[] {
  const raw = (tryGetSettings() as { collectCategories?: unknown } | null)?.collectCategories;
  const list = normalizeCategories(raw);
  return list.length ? list : DEFAULT_COLLECT_CATEGORIES.map((c) => ({ ...c }));
}

/** 文件名补 .md（已带 .md/.markdown 后缀则不动） */
export function ensureMdName(file: string): string {
  const f = (file || '').trim();
  if (!f) return '';
  return /\.(md|markdown)$/i.test(f) ? f : f + '.md';
}

/** 分类 → 目标文件完整路径（file 含「/」视为完整路径，否则挂在目标文件夹下） */
export function categoryFilePath(cat: CollectCategory, folder?: string): string {
  const dir = (folder ?? getCollectFolder()).replace(/^\/+|\/+$/g, '');
  const file = ensureMdName(cat?.file || cat?.name || '');
  if (!file) return '';
  if (file.includes('/')) return file.replace(/^\/+/, '');
  return dir ? `${dir}/${file}` : file;
}

/** 新增/覆盖分类（按名去重；空名忽略，返回原清单） */
export function upsertCategory(list: CollectCategory[], name: string, file?: string): CollectCategory[] {
  const n = (name || '').trim();
  if (!n) return list;
  const f = ensureMdName((file || '').trim() || n);
  const idx = list.findIndex((c) => c.name === n);
  if (idx < 0) return [...list, { name: n, file: f }];
  const next = list.slice();
  next[idx] = { name: n, file: f };
  return next;
}

/** 删除分类（不存在返回原清单） */
export function removeCategory(list: CollectCategory[], name: string): CollectCategory[] {
  return list.filter((c) => c.name !== name);
}

/** 重命名分类（含其目标文件未显式指定路径时随名更新）；目标名已存在则返回原清单 */
export function renameCategory(list: CollectCategory[], from: string, to: string): CollectCategory[] {
  const t = (to || '').trim();
  if (!t || list.some((c) => c.name === t)) return list;
  return list.map((c) => {
    if (c.name !== from) return c;
    // 显式路径（含 /）保持不动；纯文件名且原名派生（= 原名.md）时随名更新
    const derived = c.file === ensureMdName(from);
    return { name: t, file: derived && !c.file.includes('/') ? ensureMdName(t) : c.file };
  });
}
