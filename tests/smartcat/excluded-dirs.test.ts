// @vitest-environment node
/**
 * 禁止读取目录（票 307）数据层测试：
 *  - isPathExcluded 前缀命中语义（精确/子路径/反斜杠归一/库根全禁/空清单）；
 *  - NoteMemorySync：禁止目录不读不入库（init 扫描与 modify 增量均不触 readFile）；
 *    syncDirectories 变更回删（tracked + listRefPaths 跨会话存量）；rename 进禁止目录只删不建；
 *    wipeAll 全清（读取笔记库开关关闭语义）。
 */
import { describe, it, expect } from 'vitest';
import { isPathExcluded } from '../../src/smartcat/config';
import { NoteMemorySync, type NoteMemorySeed } from '../../src/smartcat/note-memory';

describe('isPathExcluded 命中语义', () => {
  it('精确命中与子路径命中；未配置不命中', () => {
    expect(isPathExcluded('我的/日记', ['我的/日记'])).toBe(true);
    expect(isPathExcluded('我的/日记/2026-09-25.md', ['我的/日记'])).toBe(true);
    expect(isPathExcluded('我的/日记本/2026-09-25.md', ['我的/日记'])).toBe(false); // 前缀不粘指
    expect(isPathExcluded('笔记/a.md', ['我的/日记'])).toBe(false);
    expect(isPathExcluded('笔记/a.md', [])).toBe(false);
  });

  it("反斜杠归一；'' 库根全禁；path 空串不命中", () => {
    expect(isPathExcluded('我的\\日记\\a.md', ['我的/日记'])).toBe(true);
    expect(isPathExcluded('我的/日记', ['我的\\日记'])).toBe(true);
    expect(isPathExcluded('任意/路径.md', [''])).toBe(true);
    expect(isPathExcluded('', [''])).toBe(false);
  });
});

/** 内存 vault + 记录式 backend（state.dirs / state.excluded 可变，供变更类用例原地改配置） */
function makeSync(files: Record<string, string>, dirs: string[], excluded: string[]) {
  const state = { dirs, excluded };
  const reads: string[] = [];
  const ups: NoteMemorySeed[] = [];
  const removed: string[] = [];
  const refs = new Set<string>();
  const sync = new NoteMemorySync({
    adapter: {
      listFiles: () => Object.keys(files),
      readFile: async (p: string) => {
        reads.push(p);
        return Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null;
      },
      fileMtime: () => 1000,
      now: () => 1_000_000,
      diaryDirectory: () => '我的/日记',
    },
    backend: {
      upsertNoteMemory: async (seed) => {
        ups.push(seed);
        refs.add(seed.refPath);
      },
      removeMemoryByRef: async (ref: string) => {
        removed.push(ref);
        refs.delete(ref);
      },
      setRefResolver: () => {},
      listRefPaths: async () => [...refs],
    },
    getDirectories: () => state.dirs,
    getExcluded: () => state.excluded,
  });
  return { sync, state, reads, ups, removed, refs };
}

describe('NoteMemorySync 禁止读取目录', () => {
  it('init 全量扫描跳过禁止目录：不读文件、不入库', async () => {
    const { sync, reads, ups } = makeSync(
      { '笔记/a.md': '正文A', '秘密/b.md': '机密正文' },
      ['笔记'],
      ['秘密']
    );
    await sync.init();
    expect(ups.map((s) => s.refPath)).toEqual(['笔记/a.md']);
    expect(reads).not.toContain('秘密/b.md');
  });

  it('对照：未禁止时记忆目录流会读日记目录文件；禁止后同类场景零读取', async () => {
    const files = { '我的/日记/2026-09-25.md': '12:00 一条记录' };
    const plain = makeSync({ ...files }, ['笔记'], []);
    await plain.sync.init();
    expect(plain.reads).toContain('我的/日记/2026-09-25.md');

    const blocked = makeSync({ ...files }, ['笔记'], ['我的/日记']);
    await blocked.sync.init();
    expect(blocked.reads).not.toContain('我的/日记/2026-09-25.md');
    expect(blocked.ups).toHaveLength(0);
  });

  it('syncDirectories：新命中禁止目录 → tracked 与 listRefPaths 存量一并回删，补扫不再入库', async () => {
    const files = { '笔记/a.md': '正文A', '秘密/b.md': '机密正文' };
    const env = makeSync(files, ['笔记'], []);
    await env.sync.init();
    expect(env.refs.has('笔记/a.md')).toBe(true);
    // 模拟跨会话存量：backend 里存在、本会话 tracked 表没有的引用（普通 + 日记段带定位符）
    env.refs.add('秘密/b.md');
    env.refs.add('秘密/old.md#08:00');

    env.state.excluded = ['秘密']; // 设置变更：秘密目录列入禁止
    const readsBefore = env.reads.length;
    await env.sync.syncDirectories(env.state.dirs);

    expect(env.removed).not.toContain('笔记/a.md'); // 仍属记忆目录且未被禁 → 保留
    expect(env.removed).toContain('秘密/b.md'); // 存量回删
    expect(env.removed).toContain('秘密/old.md#08:00'); // 日记段存量回删（定位符剥离后命中）
    expect(env.refs).toContain('笔记/a.md');
    // 补扫阶段：秘密目录文件不再被读取（init 阶段未禁时读过，不计）
    expect(env.reads.slice(readsBefore).filter((p) => p.startsWith('秘密/'))).toHaveLength(0);
  });

  it('onModified 命中禁止目录：不读文件，已跟踪 ref 回删', async () => {
    const env = makeSync({ '秘密/b.md': '机密正文' }, ['秘密'], []);
    await env.sync.init(); // 先正常入库（秘密目录此时是记忆目录）
    expect(env.refs.has('秘密/b.md')).toBe(true);
    env.state.excluded = ['秘密']; // 随后列入禁止
    const readsBefore = env.reads.length;
    await env.sync.onModified('秘密/b.md');
    expect(env.reads.length).toBe(readsBefore); // 不读文件
    expect(env.removed).toContain('秘密/b.md'); // 已跟踪 ref 回删
  });

  it('onRenamed 移入禁止目录：旧 ref 回删、新路径不入库', async () => {
    const files: Record<string, string> = { '笔记/a.md': '正文A' };
    const { sync, ups, removed } = makeSync(files, ['笔记'], ['秘密']);
    await sync.init();
    expect(ups.map((s) => s.refPath)).toEqual(['笔记/a.md']);
    delete files['笔记/a.md'];
    files['秘密/a.md'] = '正文A';
    await sync.onRenamed('笔记/a.md', '秘密/a.md');
    expect(removed).toContain('笔记/a.md');
    expect(ups.map((s) => s.refPath)).not.toContain('秘密/a.md');
  });

  it('wipeAll：listRefPaths 全量回删 + 本地表清空', async () => {
    const { sync, refs, removed } = makeSync(
      { '笔记/a.md': '正文A', '秘密/b.md': '机密' },
      ['笔记', '秘密'],
      []
    );
    await sync.init();
    expect(refs.size).toBe(2);
    await sync.wipeAll();
    expect(removed).toContain('笔记/a.md');
    expect(removed).toContain('秘密/b.md');
    expect(refs.size).toBe(0);
    expect(sync.getTrackedRefs().size).toBe(0);
  });
});
