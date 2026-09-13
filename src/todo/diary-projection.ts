/**
 * 待办日记投影纯函数层（todo 域，ADR-0122）。
 * memo.json 未完成条目在当天日记 `## 代办事项` 小节的投影行模型：
 *
 *   - [ ] <序号>. <标题>-<HH:mm>      未完成
 *   - [x] <序号>. <标题>-<HH:mm>      已完成
 *
 * 序号 = 该行写入当天日记的先后顺序，按天重排不跨天稳定（新行接当天既有最大号续号，
 * 已写下的行永不重排）；匹配键 = 去掉序号前缀的 `标题-HH:mm`（HH:mm 取条目 created），
 * 不往日记行写 id。历史「无号捕获行」（`- [ ] 内容-HH:mm`，ADR-0122 前的 QuickAdd
 * 冻结格式）不匹配本正则 → 不参与联动、不被改动。
 *
 * 纯数据层（node 可测，零 vault/DOM/obsidian 依赖）；小节定位/写盘在 diary 域
 * daily-capture.ts 单点（ADR-0114/ADR-0122），本层只消费「小节行数组」。
 */
import type { TodoItem } from './types';

/** 投影行解析结果 */
export interface ProjectionLine {
  checked: boolean;
  seq: number;
  title: string;
  /** 添加时刻 HH:mm */
  time: string;
}

/**
 * 投影行解析：`- [x] 3. 标题-08:30` → 结构；非投影行返回 null。
 * 点号后的空格可选（用户手打常写 `3.标题`），但时间后缀 `-HH:mm` 必须有——
 * 无时间后缀的编号行不算投影行（无法与条目建匹配键），只参与 maxWrittenSeq 续号。
 * 无号捕获行 / 空行 / 普通列表行都不是投影行。
 */
export function parseProjectionLine(line: string): ProjectionLine | null {
  const m = line.match(/^- \[([xX ])\] (\d+)\.\s*(.*)$/);
  if (!m) return null;
  const tm = m[3].match(/^(.*)-(\d{2}:\d{2})$/);
  if (!tm) return null;
  return { checked: m[1].toLowerCase() === 'x', seq: Number(m[2]), title: tm[1], time: tm[2] };
}

/** 构建投影行 */
export function buildProjectionLine(seq: number, title: string, time: string, checked: boolean): string {
  return `- [${checked ? 'x' : ' '}] ${seq}. ${title}-${time}`;
}

/** 投影行匹配键（去序号行体）：`标题-HH:mm` */
export function projectionKey(p: ProjectionLine): string {
  return `${p.title}-${p.time}`;
}

/** 条目匹配键：`标题-HH:mm`（HH:mm 取 created 的第 11..16 位，created 形如 `YYYY-MM-DD HH:mm:ss`） */
export function itemKey(title: string, created: string): string {
  return `${title}-${(created || '').slice(11, 16)}`;
}

/** 条目匹配键（便捷重载） */
export function itemKeyOf(it: TodoItem): string {
  return itemKey(it.title, it.created);
}

/** 条目添加时刻 HH:mm（created 缺形时回退 '00:00'，仅影响匹配键稳定性） */
export function itemTime(it: TodoItem): string {
  const t = (it.created || '').slice(11, 16);
  return /^\d{2}:\d{2}$/.test(t) ? t : '00:00';
}

/** 收集小节里的全部投影行（按行序；无号捕获行等一律跳过） */
export function collectProjections(lines: string[]): ProjectionLine[] {
  const out: ProjectionLine[] = [];
  for (const l of lines) {
    const p = parseProjectionLine(l);
    if (p) out.push(p);
  }
  return out;
}

/** 当天已有投影行的最大序号（无投影行返回 0） */
export function maxSeq(lines: string[]): number {
  let max = 0;
  for (const p of collectProjections(lines)) {
    if (p.seq > max) max = p.seq;
  }
  return max;
}

/**
 * 当天小节里「已写下的编号」最大值——续号专用（新行接 N+1）。
 * 与 maxSeq 的差别：只要是小节里 `- [x] N.` 形态的编号行就计数，
 * 不要求点号后有空格、也不要求时间后缀——用户手打的编号行
 * （如 `1.折腾-08:20`、`9.还没写完的`）同样占号，避免插件续号从 1
 * 重来与手打编号撞车（2026-09-13 实测缺陷，ADR-0122 修订）。
 */
export function maxWrittenSeq(lines: string[]): number {
  let max = 0;
  for (const l of lines) {
    const m = l.match(/^- \[[xX ]\]\s*(\d+)\./);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return max;
}

/** 在小节行末尾插一行（收掉尾部空行结构不动：插在最后一个非空行之后） */
export function appendLine(lines: string[], line: string): string[] {
  const out = [...lines];
  let at = out.length;
  while (at > 0 && out[at - 1].trim() === '') at--;
  out.splice(at, 0, line);
  return out;
}

// ===== 供 editSectionLines 用的小节行变换（fn: (lines) => string[] | null，null = 无改动） =====

/** 追加一行（调用方算好序号） */
export function tfAppend(line: string): (lines: string[]) => string[] {
  return (lines) => appendLine(lines, line);
}

/** 按匹配键勾/退钩；键不存在或状态已是目标值 → null（无改动） */
export function tfSetChecked(key: string, checked: boolean): (lines: string[]) => string[] | null {
  return (lines) => {
    let changed = false;
    const next = lines.map((l) => {
      const p = parseProjectionLine(l);
      if (!p || projectionKey(p) !== key) return l;
      if (p.checked === checked) return l;
      changed = true;
      return buildProjectionLine(p.seq, p.title, p.time, checked);
    });
    return changed ? next : null;
  };
}

/** 按匹配键改标题（保留序号/勾选态/时间后缀）；键不存在或标题已一致 → null */
export function tfSetTitle(key: string, title: string): (lines: string[]) => string[] | null {
  return (lines) => {
    let changed = false;
    const next = lines.map((l) => {
      const p = parseProjectionLine(l);
      if (!p || projectionKey(p) !== key) return l;
      if (p.title === title) return l;
      changed = true;
      return buildProjectionLine(p.seq, title, p.time, p.checked);
    });
    return changed ? next : null;
  };
}

/** 按匹配键删行；键不存在 → null */
export function tfRemove(key: string): (lines: string[]) => string[] | null {
  return (lines) => {
    const next = lines.filter((l) => {
      const p = parseProjectionLine(l);
      return !p || projectionKey(p) !== key;
    });
    return next.length !== lines.length ? next : null;
  };
}
