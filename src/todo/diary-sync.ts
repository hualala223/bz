/**
 * 待办日记同步编排层（todo 域，ADR-0122）。
 * 维护同步不变量：**所有未完成待办条目，都在今天日记 `## 代办事项` 小节有投影行**。
 *
 * 三个触发点：
 *  - 添加：面板新增条目 → 投影行追加到今天小节末尾（序号 = 既有最大号 + 1）；
 *  - 勾选：面板完成 ↔ 日记打钩、面板恢复 ↔ 日记退回 `[ ]`；
 *  - 顺延：插件启动（onLayoutReady）/ 当天首次打开待办面板时，把所有历史未完成且今天
 *    尚无投影行的条目补写进今天小节（按 created 升序，去重只补一次；今天文件缺失按
 *    daily-capture 先例「标记 + 空行 + 首行」建档）。
 *
 * 双向同步（用户裁决「都跟着改，不管是哪边」）：改标题双向、删除双向；同步窗口 =
 * **今天**的日期文件——历史日记是当天快照，永不回改、不触发反向。反向监听
 * vault modify（仅今天日记路径，去抖），以 lastSeen 快照判「行被手动删除/勾选态翻转/
 * 标题被手动改」，回声抑制靠快照幂等：本模块自己写的日记修改先更新快照，事件到达时
 * 状态一致 → 零动作，不循环。手动加行/无号历史行不创建面板条目、不联动。
 *
 * 写盘全部经 diary 域 daily-capture 的 `writeDiarySection`（同路径串行队列键，与 diary
 * store 互斥）；读侧同理入队。无桌面专属 API，移动端同样生效（onLayoutReady 触发顺延）。
 * 数据冻结：memo.json 14 字段不加项，序号/匹配键均由既有字段推导。
 */
import { moment } from 'obsidian';
import type { App, EventRef, TAbstractFile, TFile } from 'obsidian';
import { TODO_HEADING, editSectionLines, insertBlockIntoSection, writeDiarySection } from '../diary/daily-capture';
import { DIARY_DIRECTORY } from '../diary/config';
import { enqueueFileTask } from '../core/storage';
import { notify, notifyUndo } from '../core/notice';
import { tryGetSettings } from '../core/settings-provider';
import { TodoData } from './data';
import type { TodoItem } from './types';
import {
  appendLine,
  buildProjectionLine,
  collectProjections,
  itemKeyOf,
  itemTime,
  maxWrittenSeq,
  projectionKey,
  tfRemove,
  tfSetChecked,
  tfSetTitle,
} from './diary-projection';

// ===== 模块状态 =====

let initialized = false;
let cancelled = false;
let appRef: App | null = null;
/** vault modify 监听（自持引用，卸载顺序无关，对照 reminder.ts E7） */
let modifyRef: EventRef | null = null;
let modifyApp: App | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 今天日记投影行快照：key → { checked, time }（反向删行/改题判定与回声抑制） */
let lastSeen = new Map<string, { checked: boolean; time: string }>();
let lastSeenDate = '';
/** 顺延已完成标记（每天一次；force 供测试） */
let rolloverDoneDate = '';

function todayStr(): string {
  return moment().format('YYYY-MM-DD');
}

function diaryPath(date: string): string {
  return `${DIARY_DIRECTORY}/${date}.md`;
}

// ===== 读侧（入同路径串行队列，与写互斥） =====

/** 用 editSectionLines 的「收集器」用法抽出小节行（不改动内容） */
function sectionLinesOf(content: string): string[] {
  let out: string[] = [];
  editSectionLines(content, TODO_HEADING, (lines) => {
    out = lines;
    return null;
  });
  return out;
}

async function readSectionLines(date: string): Promise<string[]> {
  const app = appRef;
  if (!app) return [];
  const path = diaryPath(date);
  return enqueueFileTask(path, async () => {
    const f = app.vault.getAbstractFileByPath(path);
    if (!f || !('stat' in f)) return [];
    try {
      return sectionLinesOf(await app.vault.read(f as TFile));
    } catch {
      return [];
    }
  });
}

/** 重读今天小节并刷新 lastSeen 快照（写侧钩子尾调，保证事件到达时状态一致 → 回声零动作） */
async function refreshLastSeen(date: string): Promise<void> {
  const projections = collectProjections(await readSectionLines(date));
  const next = new Map<string, { checked: boolean; time: string }>();
  for (const p of projections) {
    const key = projectionKey(p);
    if (!next.has(key)) next.set(key, { checked: p.checked, time: p.time });
  }
  lastSeen = next;
  lastSeenDate = date;
}

// ===== 顺延（不变量补齐） =====

/**
 * 顺延：把所有历史未完成且今天无投影行的条目补进今天小节。
 * 每天（每插件会话）只跑一次；文件缺失建档，小节缺失现场建节（不变量优先于「不建节」
 * 的捕获语义——捕获防破坏文体，顺延是数据补齐，ADR-0122 决策 3）。
 */
export async function runTodoRollover(force = false): Promise<void> {
  const app = appRef;
  if (!app || cancelled) return;
  const today = todayStr();
  if (!force && rolloverDoneDate === today) return;
  rolloverDoneDate = today;
  try {
    const items = await TodoData.loadItems();
    const pending = items
      .filter((i) => !i.completed)
      .sort((a, b) => a.created.localeCompare(b.created));
    await writeDiarySection(app, today, (existing) => ({
      content: rollOverContent(existing, pending),
      placed: 'section' as const,
    }));
    await refreshLastSeen(today);
  } catch (e) {
    console.error('[todo-diary-sync] rollover', e);
    notify('日记待办顺延失败，本次启动跳过', { type: 'error', dedupeKey: 'todo-diary-sync-rollover' });
  }
}

/** 顺延内容变换（纯逻辑内联）：命中已有小节 → 补缺失行；无小节 → 建节；空文件 → 标记起头 */
function rollOverContent(existing: string, pending: TodoItem[]): string {
  if (!existing.trim()) {
    // 空文件：标记 + 空行 + 首行起头（daily-capture 建档先例，不复制模板 frontmatter）
    let seq = 0;
    const body: string[] = [];
    for (const it of pending) {
      seq += 1;
      body.push(buildProjectionLine(seq, it.title, itemTime(it), false));
    }
    return body.length ? `${TODO_HEADING}\n\n${body.join('\n')}\n` : `${TODO_HEADING}\n`;
  }

  const res = editSectionLines(existing, TODO_HEADING, (section) => {
    const keys = new Set(collectProjections(section).map(projectionKey));
    let seq = maxWrittenSeq(section);
    const add: string[] = [];
    for (const it of pending) {
      const key = itemKeyOf(it);
      if (keys.has(key)) continue;
      seq += 1;
      add.push(buildProjectionLine(seq, it.title, itemTime(it), false));
    }
    return add.length ? appendLines(section, add) : null;
  });
  if (res.changed) return res.content;

  // 小节不存在：文末建节（空行 + 标记 + 空行 + 行）
  let seq = 0;
  const body: string[] = [];
  for (const it of pending) {
    seq += 1;
    body.push(buildProjectionLine(seq, it.title, itemTime(it), false));
  }
  const block = body.join('\n');
  return insertBlockIntoSection(existing, TODO_HEADING, block, { createIfNotFound: true }).content;
}

/** 多行追加（尾部空行结构不动） */
function appendLines(lines: string[], add: string[]): string[] {
  let out = lines;
  for (const l of add) out = appendLine(out, l);
  return out;
}

// ===== 面板侧单向钩子（ui.ts 在数据落盘成功后调用；失败静默降级不拦主流程） =====

/** 新增条目 → 追加投影行（序号接当天最大号） */
export async function syncItemAdded(it: TodoItem): Promise<void> {
  const app = appRef;
  if (!app || cancelled || it.completed) return;
  const today = todayStr();
  try {
    await writeDiarySection(app, today, (existing) => {
      if (!existing.trim()) {
        return { content: `${TODO_HEADING}\n\n${buildProjectionLine(1, it.title, itemTime(it), false)}\n`, placed: 'section' as const };
      }
      const res = editSectionLines(existing, TODO_HEADING, (section) =>
        appendLine(section, buildProjectionLine(maxWrittenSeq(section) + 1, it.title, itemTime(it), false))
      );
      if (res.changed) return { content: res.content, placed: 'section' as const };
      // 小节不存在：文末建节
      const created = insertBlockIntoSection(existing, TODO_HEADING, buildProjectionLine(1, it.title, itemTime(it), false), {
        createIfNotFound: true,
      });
      return { content: created.content, placed: created.placed };
    });
    await refreshLastSeen(today);
  } catch (e) {
    handleSyncError(e, '写入日记待办');
  }
}

/** 完成/恢复 → 今天投影行勾选态同步 */
export async function syncItemChecked(it: TodoItem, checked: boolean): Promise<void> {
  const app = appRef;
  if (!app || cancelled) return;
  const today = todayStr();
  try {
    await writeDiarySection(app, today, (existing) => {
      const res = editSectionLines(existing, TODO_HEADING, tfSetChecked(itemKeyOf(it), checked));
      return { content: res.content, placed: 'section' as const };
    });
    await refreshLastSeen(today);
  } catch (e) {
    handleSyncError(e, checked ? '同步日记打钩' : '同步日记退钩');
  }
}

/** 编辑条目标题 → 今天投影行文本同步（保留序号/勾选态/时间） */
export async function syncItemTitle(oldItem: TodoItem, newTitle: string): Promise<void> {
  const app = appRef;
  if (!app || cancelled || oldItem.title === newTitle) return;
  const today = todayStr();
  try {
    await writeDiarySection(app, today, (existing) => {
      const res = editSectionLines(existing, TODO_HEADING, tfSetTitle(itemKeyOf(oldItem), newTitle));
      return { content: res.content, placed: 'section' as const };
    });
    await refreshLastSeen(today);
  } catch (e) {
    handleSyncError(e, '同步日记待办标题');
  }
}

/** 删除条目 → 今天投影行删除 */
export async function syncItemDeleted(it: TodoItem): Promise<void> {
  const app = appRef;
  if (!app || cancelled) return;
  const today = todayStr();
  try {
    await writeDiarySection(app, today, (existing) => {
      const res = editSectionLines(existing, TODO_HEADING, tfRemove(itemKeyOf(it)));
      return { content: res.content, placed: 'section' as const };
    });
    await refreshLastSeen(today);
  } catch (e) {
    handleSyncError(e, '同步日记待办删除');
  }
}

/** 撤销删除 → 面板条目恢复后重写投影行（序号接当天最大号；「撤销 = 两边都恢复」） */
export async function syncItemReAdded(it: TodoItem): Promise<void> {
  if (it.completed) return;
  await syncItemAdded(it);
}

function handleSyncError(e: unknown, what: string): void {
  console.error('[todo-diary-sync]', e);
  notify(`${what}失败`, { type: 'error', dedupeKey: 'todo-diary-sync' });
}

// ===== 反向同步（日记 → 面板，仅今天） =====

function onVaultModify(file: TAbstractFile): void {
  if (cancelled || !appRef) return;
  const today = todayStr();
  if (!file || file.path !== diaryPath(today)) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void processDiaryModify(today);
  }, 300);
}

/** 反向处理：lastSeen → 现状 diff（删行/勾选/改题）；首次见到当天只建快照不动作（防启动误删）。
 *  改题与删行的区分：lastSeen 里消失的键，若现状存在**同时刻且未被任何条目精确认领**的行，
 *  判定为改题（标题变了、时间后缀没变）；找不到才判定删行。 */
async function processDiaryModify(today: string): Promise<void> {
  const app = appRef;
  if (!app || cancelled) return;
  try {
    const projections = collectProjections(await readSectionLines(today));
    const current = new Map<string, { checked: boolean; title: string; time: string }>();
    for (const p of projections) {
      const key = projectionKey(p);
      if (!current.has(key)) current.set(key, { checked: p.checked, title: p.title, time: p.time });
    }

    if (lastSeenDate !== today) {
      // 当天首次感知（插件启动后第一批事件/跨天）：只建快照，不做删除类联动
      lastSeen = snapshotOf(current);
      lastSeenDate = today;
      return;
    }

    const items = await TodoData.loadItems();
    const byKey = new Map<string, TodoItem>();
    for (const it of items) {
      const key = itemKeyOf(it);
      if (!byKey.has(key)) byKey.set(key, it);
    }

    // 1) 键精确命中：勾选态/标题 diff（手动加行/无号行/重复条目不认领）
    const claimed = new Set<string>();
    for (const [key, info] of current) {
      const it = byKey.get(key);
      if (!it) continue;
      claimed.add(key);
      if (info.checked && !it.completed) await TodoData.completeItem(it.id);
      else if (!info.checked && it.completed) await TodoData.updateItem(it.id, { completed: null });
      if (info.title !== it.title) await TodoData.updateItem(it.id, { title: info.title });
    }

    // 2) 快照里有、现状无：同时刻新行 = 改题；否则 = 删行（带撤销；撤销 = 两边都恢复）
    for (const [key, seen] of lastSeen) {
      if (claimed.has(key) || current.has(key)) continue;
      const it = byKey.get(key);
      if (!it) continue;
      const edited = [...current.entries()].find(
        ([k, info]) => !claimed.has(k) && !byKey.has(k) && info.time === seen.time
      );
      if (edited) {
        claimed.add(edited[0]);
        const info = edited[1];
        if (info.checked && !it.completed) await TodoData.completeItem(it.id);
        else if (!info.checked && it.completed) await TodoData.updateItem(it.id, { completed: null });
        if (info.title !== it.title) await TodoData.updateItem(it.id, { title: info.title });
      } else {
        await TodoData.deleteItem(it.id);
        notifyUndo(`已删除待办「${it.title}」（日记行被删除）`, () => {
          void (async () => {
            try {
              await TodoData.restoreItem(it);
              await syncItemReAdded(it);
            } catch (e) {
              handleSyncError(e, '撤销删除');
            }
          })();
        });
      }
    }

    lastSeen = snapshotOf(current);
    lastSeenDate = today;
  } catch (e) {
    console.error('[todo-diary-sync] modify', e);
  }
}

/** 现状 → 快照形状（只留勾选态与时间） */
function snapshotOf(current: Map<string, { checked: boolean; time: string }>): Map<string, { checked: boolean; time: string }> {
  const out = new Map<string, { checked: boolean; time: string }>();
  for (const [key, info] of current) out.set(key, { checked: info.checked, time: info.time });
  return out;
}

// ===== 生命周期 =====

/**
 * 幂等初始化（index.ts ensureTodoReminders 启动顺延 / openTodoPanel 首开顺延入口共用）：
 * 注册 vault modify 监听并跑当天顺延。
 */
export function ensureTodoDiarySync(app: App): void {
  TodoData.init(tryGetSettings() as any);
  if (initialized) {
    void runTodoRollover();
    return;
  }
  initialized = true;
  cancelled = false;
  appRef = app;
  modifyApp = app;
  modifyRef = app.vault.on('modify' as any, onVaultModify as any);
  void runTodoRollover();
}

/** 卸载清理（index.ts unloadTodo 调用） */
export function unloadTodoDiarySync(): void {
  cancelled = true;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (modifyRef && modifyApp) {
    try {
      modifyApp.vault.offref(modifyRef);
    } catch {
      /* 忽略 */
    }
  }
  modifyRef = null;
  modifyApp = null;
  appRef = null;
  lastSeen = new Map();
  lastSeenDate = '';
  rolloverDoneDate = '';
  initialized = false;
}
