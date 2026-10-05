/**
 * 第二大脑 VectorStore（ticket 103；对齐 QA 闪念.js L442-745）
 * meta v10 段 + secondbrain.vec（ticket 120：原 secondbrain_vectors.vec 改名；uint32LE dim 头 + float32 平铺；
 * 行序 = meta.notes 键序 × chunks）。meta 段随 JSON 并入 secondbrain.json（store-file 单文件三段）。
 *
 * 对齐要点：
 * - 检索 = 归一化矩阵缓存 + 暴力全扫点积（issue 425/ADR-0185，VP-Tree 与 score^0.35 锐化已退役）；
 *   分数即原始余弦 [0,1]，零向量/非有限行整行跳过；
 * - refresh 批量嵌入走 parallelMap 自适应并发（起始并发 3，EMA 爬坡上限 60），批量失败回退逐条；
 *   逐条失败按段计数，完成态有失败 → 通知失败段数（ticket 3 假成功修复），全部成功才发完成通知；
 * - 移动端三级降级 remote→tfidf→text；TF-IDF 以 chunk 为文档单位且构建后复用（不再随查询重建）。
 *
 * 保留 bz 改进：MobileBuffer 写入避 Node Buffer 池偏移、Embedding 统一 30s 超时（慢推理不误伤）、
 * 检索异常降级文本（10s 检索级超时上限，保证参考面板/对话不被挂起请求长期阻塞——ticket 46）。
 * ticket 107：isIndexReady() 就绪判定（空库/损坏态 → 主面板引导态，首次向量化须用户触发）；
 * refresh 并发去重（进行中复用同一 promise）；meta 有条目但向量缺失 → 视为全量重建自愈；
 * 移动端嵌入端点走远程 URL（引导初始化在移动端亦可完成）。
 * ticket 103 修复 QA/bz 同源缺陷两处（Q3=B 用户拍板，冻结描述随 ADR 修订）：
 * ① 仅删除文件时提前 return 跳过落盘 → 删除也持久化（紧凑重排后重写 meta+vec；白名单清空同样生效）；
 * ② 旧向量段偏移按「删除前」完整键序计算（原实现用删除后键序拷贝删除前布局，非末尾删除会错位）。
 * ticket 110：切块剥离 frontmatter（YAML 样板不进 embedding 文本）+ 笔记标题并入首块；
 * meta v8→v9，旧库经 load() 版本不符路径自动清空、下次 refresh 全量重建（一次性 re-embed，桌面执行）。
 * ticket 114：断点暂存——长库初始化/重建期间按「时间 + 新增完成块数」双阈值周期性把已完成
 * 文件合并落盘（mergeWrite 与最终写回同一实现，行序布局不变式不破坏），中断（关面板/重启
 * Obsidian/Ollama 中途失联）后重开自动从已暂存进度增量续嵌，不再整库从零重来；
 * isRefreshing() 暴露进行中状态供主面板恢复进度视图。
 * ticket 173/ADR-0078：正文指纹三层判定——mtime 未变跳过；mtime 变指纹同（改 YAML）只更新登记；
 * 指纹变才重嵌。挪动 = 孤儿池指纹命中 → 继承向量迁移登记键（单轮 refresh 内存活）；
 * v9→v10 迁移在 load() 从已存 chunks 现算指纹就地升级，零读盘零重嵌。
 */
import type { App, TFile } from 'obsidian';
import { buildConfig, DEFAULT_EMBEDDING_MODEL, IS_MOBILE, rerankChannel, type RerankChannel } from './config';
import { loadStore, mutateStore } from './store-file';
import { MobileBuffer } from './binary';
import { canvasToText, embedChunks, hashChunks, noteTitleFromPath } from './chunk';
import { isValidVector, normalizeVec } from './vector-math';
import { RERANK_MAX_DOCS, rerankScores } from './rerank';
import { jevRerankScores } from './rerank-jev';
import { abortError, isAbortError, throwIfAborted } from '../core/abort';
import { parallelMap } from './parallel';
import { TFIDF } from './tfidf';
import { searchTextIndex } from './text-search';
import { checkRemoteOllama, EMBED_BATCH_SIZE, getEmbedding, getEmbeddingsBatch, SEARCH_TIMEOUT_MS } from './ollama';
import { bytesEqual } from '../core/utils';

// v8→v9（ticket 110）：切块剥离 frontmatter + 标题入首块——旧库版本不符走 load() 自动重建
// v9→v10（ticket 173/ADR-0078）：NoteEntry 新增正文指纹 hash——v9 存量 load 时从已存 chunks
// 现算指纹就地升级（零读盘零重嵌），.vec 格式不变直接复用；仅 version<9 才走整库清空重建
const VECTOR_STORE_VERSION = 10;

/**
 * 断点暂存阈值（ticket 114）：距上次暂存 ≥minIntervalMs 且新完成块数 ≥minNewChunks 才落盘一次。
 * 导出为可变属性对象仅供测试收紧阈值；生产代码勿改。
 */
export const CHECKPOINT_POLICY = { minIntervalMs: 5000, minNewChunks: 200 };

export interface NoteEntry {
  mtime: number;
  chunks: { text: string }[];
  /** 正文指纹（ticket 173/ADR-0078）：chunks 文本拼接的 FNV-1a；v9 存量经 load() 迁移补齐 */
  hash?: string;
}

export interface SecondBrainMeta {
  version: number;
  notes: Record<string, NoteEntry>;
  _dim: number;
}

/** 归一化矩阵缓存（ADR-0185） */
interface NormCache {
  src: Float32Array;
  dim: number;
  rows: number;
  data: Float32Array;
  valid: Uint8Array;
}

export interface SearchHit {
  path: string;
  chunk: string;
  score: number;
  /** 重排分（上游 issue 429；bge-m3 下不激活恒缺省） */
  rerankScore?: number;
}

/**
 * 列表显示用相关度百分比（issue 429）：重排过的条目显示重排分（P(yes)）——
 * 名次按重排分排，显示的百分比就得是同一个尺，否则肉眼看到「没按相关度排序」。
 * 未重排/重排回退的条目回落到余弦 score。**只影响显示**：分数条与阈值仍以余弦为唯一尺（ADR-0186）。
 * 双端面板共用（桌面 reference-panel / 移动 mobile-panel）。
 */
export function relevancePct(item: SearchHit): number {
  return Math.round((item.rerankScore ?? item.score) * 100);
}

interface ChunkTask {
  filePath: string;
  chunkIdx: number;
  text: string;
  embedding?: Float32Array;
}

export class VectorStore {
  app: App;
  meta: SecondBrainMeta = { version: VECTOR_STORE_VERSION, notes: {}, _dim: 0 };
  vectors: Float32Array = new Float32Array(0);
  dim = 0;
  tfidf = new TFIDF();
  searchMode: 'remote' | 'tfidf' | 'text' = 'text';
  updateProgress: (msg: string) => void = () => {};
  /** 初始 load 完成信号（域入口注入；主面板打开时等待，防启动竞态误入引导态——ticket 107） */
  initialLoad: Promise<void> | null = null;

  /** 归一化矩阵缓存（issue 425/ADR-0185）：检索全扫用，键=来源数组身份+维度+行数 */
  private normCache: NormCache | null = null;
  /** 进行中的 refresh（并发去重：重复调用复用同一 promise，ticket 107） */
  private refreshPromise: Promise<void> | null = null;
  /** 索引收敛订阅（票 305：explorer「已入脑」角标等轻消费方）——load 与每轮 refresh 成功后触发 */
  private indexUpdatedListeners = new Set<() => void>();

  constructor(app: App) {
    this.app = app;
  }

  /**
   * 订阅索引收敛（票 305）：load 完成与每轮 refresh 成功收敛各触发一次。
   * 返回退订函数；回调抛错仅告警不拖垮索引管线（装饰类消费方不许反噬主链路）。
   */
  onIndexUpdated(cb: () => void): () => void {
    this.indexUpdatedListeners.add(cb);
    return () => this.indexUpdatedListeners.delete(cb);
  }

  private notifyIndexUpdated(): void {
    for (const cb of this.indexUpdatedListeners) {
      try {
        cb();
      } catch (e) {
        console.warn('[secondbrain] 索引更新回调失败', e);
      }
    }
  }

  get notes(): Record<string, NoteEntry> {
    return this.meta.notes;
  }

  async load(): Promise<void> {
    await this.doLoad();
    this.notifyIndexUpdated();
  }

  private async doLoad(): Promise<void> {
    // ticket 120：meta 段并入 secondbrain.json；旧 secondbrain_meta.json 经 store-file 一次性迁移
    const data = await loadStore(this.app);
    const parsed = data.meta as SecondBrainMeta | null;
    if (parsed && typeof parsed === 'object' && parsed.version === VECTOR_STORE_VERSION) {
      this.meta = parsed;
      this.dim = parsed._dim || 0;
      await this.loadVectors();
      return;
    }
    if (parsed && typeof parsed === 'object' && parsed.version === VECTOR_STORE_VERSION - 1) {
      // v9→v10 迁移（ticket 173/ADR-0078）：指纹从已存 chunks 现算，零读盘零重嵌，.vec 直接复用
      console.log('[secondbrain] 向量库 v9→v10：就地补正文指纹（不重嵌）');
      this.meta = parsed;
      this.meta.version = VECTOR_STORE_VERSION;
      for (const entry of Object.values(this.meta.notes)) {
        entry.hash = hashChunks(entry.chunks.map((c) => c.text));
      }
      this.dim = parsed._dim || 0;
      await this.loadVectors();
      await this.saveStore();
      return;
    }
    if (parsed && typeof parsed === 'object') {
      // 版本不符整库重建（QA 同语义；v7→v8 首载触发一次性全量重嵌）
      console.log(`[secondbrain] 向量库版本升级: ${(parsed as any).version || 0} → ${VECTOR_STORE_VERSION}，触发重建`);
    }
    this.meta = { version: VECTOR_STORE_VERSION, notes: {}, _dim: 0 };
    this.vectors = new Float32Array(0);
    this.dim = 0;
  }

  async loadVectors(): Promise<void> {
    const CONFIG = buildConfig();
    try {
      const buf = await this.app.vault.adapter.readBinary(CONFIG.VEC_PATH);
      const arr = new Uint8Array(buf);
      const dim = new DataView(arr.buffer, arr.byteOffset, 4).getUint32(0, true);
      const payload = arr.slice(4);
      this.vectors = new Float32Array(payload.buffer, payload.byteOffset, payload.byteLength >> 2);
      this.dim = dim;
    } catch {
      this.vectors = new Float32Array(0);
      this.dim = 0;
    }
  }

  /**
   * 索引是否就绪（ticket 107）：meta 有条目且向量已装载。
   * 空库 / meta 残留但 .vec 丢失（损坏态）返回 false——主面板据此进入引导态，
   * 参考侧边栏与 AI 对话命令据此统一转开主面板。
   */
  isIndexReady(): boolean {
    return Object.keys(this.meta.notes).length > 0 && this.vectors.length > 0 && this.dim > 0;
  }

  /** 是否有 refresh 正在进行（ticket 114）：主面板重开时据此恢复进度视图而非引导死按钮 */
  isRefreshing(): boolean {
    return this.refreshPromise !== null;
  }

  /** 可索引文件全集（上游 ADR-0141 §5，票 319）：全库 md + canvas。canvas 只作**候选来源**
   *  （抽节点文本嵌入，不写回——canvas 无 frontmatter，related 无处落），与 md 同列。 */
  private indexableFiles(): TFile[] {
    const vault = this.app.vault as any;
    const md = typeof vault.getMarkdownFiles === 'function' ? (vault.getMarkdownFiles() as TFile[]) : [];
    const canvas =
      typeof vault.getFiles === 'function'
        ? (vault.getFiles() as TFile[]).filter((f) => f && f.extension === 'canvas')
        : [];
    return [...md, ...canvas];
  }

  /** 索引范围过滤后的文件列表（doRefresh / hasPendingChanges / 主面板覆盖率共用） */
  whitelistedFiles(): TFile[] {
    const CONFIG = buildConfig();
    const allowPaths = CONFIG.ALLOW_PATHS || [];
    // ticket 116 本地语义保留（票 319 红线）：白名单空 = 什么也不录（不索引任何目录），不再是"全库"
    if (allowPaths.length === 0) return [];
    return this.indexableFiles().filter((f) => {
      for (const allow of allowPaths) {
        if (f.path.startsWith(allow + '/') || f.path === allow) return true;
      }
      return false;
    });
  }

  /**
   * 是否有增量索引待处理项（ticket 108）：新文件 / mtime 变化 / 已删除文件，任一即 true。
   * 主面板打开时据此决定是否显示增量索引进度视图（纯扫描不读文件内容，开销可忽略）。
   */
  hasPendingChanges(): boolean {
    const files = this.whitelistedFiles();
    const filePaths = new Set(files.map((f) => f.path));
    for (const path of Object.keys(this.meta.notes)) {
      if (!filePaths.has(path)) return true; // 有已删除条目待清理
    }
    for (const f of files) {
      const entry = this.meta.notes[f.path];
      if (!entry || entry.mtime !== f.stat.mtime) return true; // 新文件或已修改
    }
    return false;
  }

  /**
   * 全量重建（ticket 108「重新索引」）：清空元数据与向量后整库重嵌。
   * 先等待进行中的 refresh 结束再清空，避免与增量刷新交错写坏布局。
   */
  async rebuildAll(updateProgress?: (msg: string) => void): Promise<void> {
    if (this.refreshPromise) {
      try {
        await this.refreshPromise;
      } catch {
        /* 前一轮失败不影响重建 */
      }
    }
    this.meta.notes = {};
    this.vectors = new Float32Array(0);
    this.dim = 0;
    this.meta._dim = 0;
    // 归一化缓存随内容失效（来源数组身份已变）
    this.normCache = null;
    await this.refresh(updateProgress);
  }

  async saveVectors(): Promise<void> {
    const CONFIG = buildConfig();
    const dim = this.dim;
    // 固定用 MobileBuffer（alloc 从 0 起，避免 Node Buffer 池偏移）
    const header = MobileBuffer.alloc(4);
    header.writeUInt32LE(dim, 0);
    const payload = new Uint8Array(this.vectors.buffer, this.vectors.byteOffset, this.vectors.byteLength);
    const data = MobileBuffer.concat([header._data, payload]);
    // Syncthing 冲突止血（用户拍板 2026-08-29）：写前比对盘上现读字节，没变就跳过
    // （.vec 为二进制整写，refresh/断点暂存的无变化重写是多设备冲突高发源）
    try {
      const adapter = this.app.vault.adapter as any;
      if (typeof adapter?.readBinary === 'function') {
        const cur = new Uint8Array(await adapter.readBinary(CONFIG.VEC_PATH));
        if (bytesEqual(cur, data._data)) return;
      }
    } catch {
      /* 首写/无文件 → 照写 */
    }
    await this.app.vault.adapter.writeBinary(CONFIG.VEC_PATH, data._data.buffer as ArrayBuffer);
  }

  async saveStore(): Promise<void> {
    // ticket 120：meta 段写入 secondbrain.json（经串行写链，与 panel/link 段互斥）
    await mutateStore(
      (s) => {
        s.meta = this.meta as unknown as Record<string, unknown>;
      },
      this.app
    );
  }

  /**
   * 按 meta.notes 当前键序紧凑重排向量段并落盘。
   * @param srcOffsets 删除前布局的 path→行偏移；无源偏移的条目（理论不出现在删除-only 路径）跳过其向量段。
   */
  private async compactAndSave(srcOffsets: Map<string, number>): Promise<void> {
    const dim = this.dim;
    if (dim > 0) {
      let total = 0;
      for (const note of Object.values(this.meta.notes)) total += note.chunks.length;
      const merged = new Float32Array(total * dim);
      let offset = 0;
      for (const [path, note] of Object.entries(this.meta.notes)) {
        const srcRow = srcOffsets.get(path);
        if (srcRow === undefined) continue;
        const count = note.chunks.length;
        merged.set(this.vectors.subarray(srcRow * dim, srcRow * dim + count * dim), offset);
        offset += count * dim;
      }
      this.vectors = merged;
      await this.saveVectors();
    }
    await this.saveStore();
  }

  /**
   * 合并写回（ticket 114：最终写回与中途断点暂存共用同一实现）。
   * 按 meta.notes 当前键序重建整段向量：本轮新完成文件（embedded）写入新嵌入向量，
   * 未变文件按「删除前」源偏移从 srcVectors（本轮开始时的原始缓冲，永不原地改写）拷贝旧段，
   * 随后 saveVectors + saveStore。中间无论暂存多少次，最终布局与一次到位完全一致。
   */
  private async mergeWrite(
    srcVectors: Float32Array,
    srcOffsets: Map<string, number>,
    embedded: Map<string, Float32Array[]>,
    dim: number
  ): Promise<void> {
    if (dim > 0) {
      let totalVecs = 0;
      for (const note of Object.values(this.meta.notes)) totalVecs += note.chunks.length;
      const merged = new Float32Array(totalVecs * dim);
      let offset = 0;
      for (const [path, note] of Object.entries(this.meta.notes)) {
        const vecs = embedded.get(path);
        if (vecs) {
          for (const v of vecs) {
            merged.set(v, offset);
            offset += v.length;
          }
        } else {
          const srcRow = srcOffsets.get(path);
          if (srcRow === undefined) continue; // 理论不达：meta 条目要么旧（有源偏移）要么新（在 embedded）
          const srcStart = srcRow * dim;
          merged.set(srcVectors.subarray(srcStart, srcStart + note.chunks.length * dim), offset);
          offset += note.chunks.length * dim;
        }
      }
      this.vectors = merged;
      this.dim = dim;
      this.meta._dim = dim;
      await this.saveVectors();
    }
    await this.saveStore();
  }

  /** 增量重建向量库（并发去重：进行中重复调用复用同一 promise——ticket 107）。
   *  成功收敛后通知 onIndexUpdated 订阅方（票 305）；失败不通知，订阅方拿到的总是有效索引态。 */
  refresh(updateProgress?: (msg: string) => void): Promise<void> {
    if (updateProgress) this.updateProgress = updateProgress;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh()
      .then(() => this.notifyIndexUpdated())
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<void> {
    const CONFIG = buildConfig();

    // 索引范围过滤（与 hasPendingChanges / 主面板覆盖率同一实现）
    const allowPaths = CONFIG.ALLOW_PATHS || [];
    const allFiles = this.indexableFiles();
    const files = this.whitelistedFiles();
    console.log(`[secondbrain] 可索引 ${allFiles.length} 个文件（md+canvas），范围 [${allowPaths}] → 过滤后 ${files.length} 个`);

    // 记录「删除前」完整键序的源偏移（修复②：拷贝旧段必须按源布局寻址）
    const srcOffsets = new Map<string, number>();
    let srcOff = 0;
    for (const [path, note] of Object.entries(this.meta.notes)) {
      srcOffsets.set(path, srcOff);
      srcOff += note.chunks.length;
    }

    // 白名单清空：全库清空并落盘（修复①在空集场景的延伸）
    if (files.length === 0) {
      if (Object.keys(this.meta.notes).length > 0) {
        this.meta.notes = {};
        this.vectors = new Float32Array(0);
        this.dim = 0;
        this.meta._dim = 0;
        await this.saveVectors();
        await this.saveStore();
        this.updateProgress('✅ 向量库已清空（白名单为空）');
      } else {
        this.updateProgress('⚠️ 没有符合条件的文件');
      }
      return;
    }

    // 删除已不存在文件的 meta 条目；孤儿先进指纹池等迁移匹配（ticket 173/ADR-0078：
    // 池只在单轮 refresh 内存活，未命中的照常清理——删除仍是删除，仅「删+同指纹重建」
    // 恰好构成挪动时才继承）。重复文本孤儿任取其一（向量相同，结果等价）。
    const filePaths = new Set(files.map((f) => f.path));
    let deleted = 0;
    const orphans = new Map<string, { entry: NoteEntry; srcPath: string }>();
    for (const path of Object.keys(this.meta.notes)) {
      if (!filePaths.has(path)) {
        const entry = this.meta.notes[path];
        const hash = entry.hash ?? hashChunks(entry.chunks.map((c) => c.text));
        if (!orphans.has(hash)) orphans.set(hash, { entry, srcPath: path });
        delete this.meta.notes[path];
        deleted++;
      }
    }

    // ticket 107 自愈：meta 有条目但向量缺失/为空（.vec 丢失或写入中断）→ 视为全量重建，
    // 否则 mtime 全匹配会永远「已最新」，损坏态无法自愈、主面板引导也无法修复
    const indexIncomplete = Object.keys(this.meta.notes).length > 0 && (this.vectors.length === 0 || !this.dim);

    let vectors = this.vectors;
    let dim = this.meta._dim || this.dim || 0;
    if (srcOff === 0 || indexIncomplete) {
      vectors = new Float32Array(0);
      dim = 0;
    }

    // 待处理：新文件或 mtime 变化；自愈态全量重处理
    let toProcess = files.filter((f) => {
      const entry = this.meta.notes[f.path];
      return !entry || entry.mtime !== (f.stat as any).mtime;
    });
    if (indexIncomplete) toProcess = files.slice();

    // 修复①：无变更但有删除 → 也必须落盘
    if (toProcess.length === 0) {
      if (deleted > 0) {
        await this.compactAndSave(srcOffsets);
        this.updateProgress(`✅ 向量库已最新（清理 ${deleted} 个失效条目）`);
      } else {
        this.updateProgress('✅ 向量库已最新');
      }
      return;
    }

    // 读取 + 分块；指纹三层判定（ticket 173/ADR-0078，自愈态除外——indexIncomplete 必须整库重嵌）
    const minChunk = 1; // 上游 issue 424：不按长度丢块（该限制已删；只影响未来重建，存量库不动）
    const fileChunksMap = new Map<string, (ChunkTask | null)[]>();
    const fileHashes = new Map<string, string>();
    const globalTasks: ChunkTask[] = [];
    let keptUnchanged = 0; // mtime 变但指纹同（仅改 YAML/纯触碰）→ 只更新登记不重嵌
    let migrated = 0; // 挪动后指纹命中孤儿 → 继承向量、迁移登记键，不调嵌入
    for (const file of toProcess) {
      try {
        const raw = await this.app.vault.read(file);
        // canvas 入脑（上游 ADR-0141 §5，票 319）：JSON 白板抽节点文本后走同一条切块链路（md 原样进）
        const content = file.extension === 'canvas' ? canvasToText(raw) : raw;
        // ticket 110：frontmatter 剥离后切块、标题并入首块（空正文兜底截断收口在 embedChunks 内）
        const chunks = embedChunks(content, noteTitleFromPath(file.path), minChunk);
        const hash = hashChunks(chunks);
        const entry = this.meta.notes[file.path];
        if (!indexIncomplete) {
          if (entry && entry.hash !== undefined && entry.hash === hash) {
            // 内容指纹一致 → 刷新 mtime 登记，旧向量经源偏移原样拷贝
            entry.mtime = (file.stat as any).mtime;
            keptUnchanged++;
            continue;
          }
          if (!entry) {
            const orphan = orphans.get(hash);
            if (orphan) {
              orphans.delete(hash);
              this.meta.notes[file.path] = { mtime: (file.stat as any).mtime, chunks: orphan.entry.chunks, hash };
              // 向量继承：新路径按孤儿旧路径的源偏移拷贝（mergeWrite/compactAndSave 同一寻址口径）
              srcOffsets.set(file.path, srcOffsets.get(orphan.srcPath)!);
              migrated++;
              continue;
            }
          }
        }
        fileHashes.set(file.path, hash);
        fileChunksMap.set(file.path, chunks.map(() => null));
        chunks.forEach((text, idx) => globalTasks.push({ filePath: file.path, chunkIdx: idx, text }));
      } catch (err) {
        console.error(`[secondbrain] 读取失败 [${file.path}]`, err);
        delete this.meta.notes[file.path];
      }
    }
    if (globalTasks.length === 0) {
      if (deleted > 0 || keptUnchanged > 0 || migrated > 0) {
        await this.compactAndSave(srcOffsets);
        const parts: string[] = [];
        if (migrated > 0) parts.push(`迁移 ${migrated} 篇挪动笔记（未重嵌）`);
        if (keptUnchanged > 0) parts.push(`${keptUnchanged} 篇正文未变跳过`);
        if (deleted > 0) parts.push(`清理 ${deleted} 个失效条目`);
        this.updateProgress(`✅ 向量库已最新（${parts.join('，')}）`);
      } else {
        this.updateProgress('✅ 向量化完成（无新内容）');
      }
      return;
    }

    // 批量嵌入：EMBED_BATCH_SIZE 分批 → parallelMap 自适应并发（起始 3，QA 同参）
    // 嵌入端点（ticket 107）：桌面本地 Ollama；移动端优先远程 URL——引导初始化在移动端亦可完成
    const embedBase = IS_MOBILE ? CONFIG.OLLAMA_REMOTE_URL || CONFIG.OLLAMA_URL : CONFIG.OLLAMA_URL;
    const batches: ChunkTask[][] = [];
    for (let i = 0; i < globalTasks.length; i += EMBED_BATCH_SIZE) {
      batches.push(globalTasks.slice(i, i + EMBED_BATCH_SIZE));
    }
    let processed = 0;
    const total = toProcess.length;
    // ticket 3 假成功修复：统计逐条回退失败段数——有失败不发「✅ 向量化完成」，完成态按失败数提示
    let failed = 0;

    // —— 断点暂存（ticket 114）：长库初始化/重建期间周期性把「已完整嵌完」的文件合并落盘，
    //    中断后重开可从已存进度增量续嵌。ckptEmbedded 累积全部已暂存文件的向量（与任务槽位
    //    同引用，零拷贝）；ckptChain 串行化防并发写盘；最终合并前先排空链，保证互斥。 ——
    const ckptEmbedded = new Map<string, Float32Array[]>();
    const ckptDoneFiles = new Set<string>();
    let lastCkptAt = Date.now();
    let ckptChunks = 0;
    let ckptChain: Promise<void> = Promise.resolve();

    const maybeCheckpoint = (): void => {
      if (dim <= 0) return;
      let doneChunks = 0;
      for (const slots of fileChunksMap.values()) {
        for (const s of slots) if (s) doneChunks++;
      }
      if (doneChunks - ckptChunks < CHECKPOINT_POLICY.minNewChunks) return;
      const now = Date.now();
      if (now - lastCkptAt < CHECKPOINT_POLICY.minIntervalMs) return;
      lastCkptAt = now;
      ckptChunks = doneChunks;
      ckptChain = ckptChain
        .then(async () => {
          let newly = 0;
          for (const file of toProcess) {
            const slots = fileChunksMap.get(file.path);
            if (!slots || slots.some((s) => !s || !s.embedding)) continue; // 槽位有任务且 embedding 已赋值
            if (ckptDoneFiles.has(file.path)) continue;
            ckptDoneFiles.add(file.path);
            newly++;
            const tasks = slots as ChunkTask[];
            this.meta.notes[file.path] = { mtime: (file.stat as any).mtime, chunks: tasks.map((c) => ({ text: c.text })), hash: fileHashes.get(file.path) };
            const vecs = tasks.map((t) => t.embedding!);
            ckptEmbedded.set(file.path, vecs);
          }
          if (newly === 0) return;
          await this.mergeWrite(vectors, srcOffsets, ckptEmbedded, dim);
          let regTotal = 0;
          for (const v of ckptEmbedded.values()) regTotal += v.length;
          this.updateProgress(`已暂存 ${regTotal}/${globalTasks.length} 段（此时关闭也会保留进度，重开自动继续）`);
        })
        .catch((e) => console.warn('[secondbrain] 断点暂存失败（索引继续，不影响最终结果）', e));
    };

    await parallelMap(batches, 3, async (batch) => {
      try {
        const embeddings = await getEmbeddingsBatch(batch.map((t) => t.text), embedBase);
        for (let j = 0; j < batch.length; j++) {
          fileChunksMap.get(batch[j].filePath)![batch[j].chunkIdx] = batch[j];
          batch[j].embedding = new Float32Array(embeddings[j]);
        }
        // 嵌入维度在第一批嵌入完成时即可确定（与最终注册口径一致）
        if (dim === 0 && batch[0]?.embedding) dim = batch[0].embedding.length;
        processed += batch.length;
        this.updateProgress(
          `向量化: ${processed}/${globalTasks.length} chunks (${total} 篇文件, ${Math.round((processed / globalTasks.length) * 100)}%)`
        );
        maybeCheckpoint();
      } catch (err) {
        console.warn('[secondbrain] 批量向量化失败，回退逐条处理', err);
        for (const task of batch) {
          try {
            const embedding = await getEmbedding(task.text, false, embedBase);
            // 回填槽位与登记口径一致（QA L598 同构）：否则 chunks 与向量数错位、合并越界
            fileChunksMap.get(task.filePath)![task.chunkIdx] = task;
            task.embedding = new Float32Array(embedding);
            if (dim === 0 && task.embedding.length) dim = task.embedding.length;
            processed++;
          } catch (e) {
            failed++; // 该段落本次未嵌成（断点续传语义不变：文件 mtime 未登记，下次增量会重试）
            console.warn(`[secondbrain] 段落向量化失败 [${task.filePath}]`, e);
          }
        }
        maybeCheckpoint(); // 逐条回退也可能凑满触发条件（慢速大库同样受益断点续嵌）
      }
    });
    await ckptChain; // 排空暂存链再最终合并（最终写回与链互斥）

    // 登记新 meta 条目（meta 只存 text，向量只进 .vec——QA L610-619 同构；
    // 已被断点暂存登记过的文件在此按同一口径重登记，幂等覆盖）。
    // [3] 与断点暂存 ckptDoneFiles 同口径：文件只要还有失败（空）槽位，整篇不写 mtime——
    // 部分登记会让失败段永久丢失（下轮 refresh 的 mtime 比对把它跳过）。保留旧条目/无条目
    // → 下轮按 mtime 差异整篇重试；仅整篇全失败才删除旧条目（QA 同语义）。
    const newChunksPerFile = new Map<string, Float32Array[]>();
    for (const file of toProcess) {
      const slots = fileChunksMap.get(file.path);
      if (!slots) continue; // 读取失败的文件：读取循环已删条目，无槽位（与 maybeCheckpoint 同守卫）
      if (slots.some((s) => !s || !s.embedding)) {
        if (!slots.some((s) => s?.embedding)) delete this.meta.notes[file.path]; // 整篇全失败
        continue; // 部分失败：保持旧条目/无条目 → 下轮自动整篇重试
      }
      const vecs = slots.map((s) => s!.embedding!);
      if (dim === 0) dim = vecs[0].length;
      const keptTexts = slots.map((c) => ({ text: c!.text }));
      this.meta.notes[file.path] = { mtime: (file.stat as any).mtime, chunks: keptTexts, hash: fileHashes.get(file.path) };
      newChunksPerFile.set(file.path, vecs);
    }

    // 合并写回：未变文件按源偏移拷贝旧段，新文件写新向量（QA L621-639 偏移口径不变；与断点暂存共用 mergeWrite）
    await this.mergeWrite(vectors, srcOffsets, newChunksPerFile, dim);
    console.log(`[secondbrain] 向量库已保存: ${Object.keys(this.meta.notes).length} 个文件, dim=${dim}`);
    // ticket 3 假成功修复：全部成功才发「✅ 向量化完成」；有失败段 → 提示失败数（失败段不登记，
    // 下轮按 mtime 差异自动重试，断点续传契约不变）
    if (failed === 0) {
      const extra = migrated > 0 ? `（另有 ${migrated} 篇挪动笔记继承向量未重嵌）` : '';
      this.updateProgress(`✅ 向量化完成：${total} 篇文件，${globalTasks.length} 个段落${extra}`);
    } else {
      this.updateProgress(`⚠️ ${failed} 段向量化失败，请检查 Ollama 服务`);
    }
  }


  /**
   * 向量检索（issue 425/ADR-0185）：查询嵌入 → 暴力全扫余弦（归一化点积）→ 去重 → topK。
   * 全扫精确无近似：VP-Tree 近似召回会漏掉真实最近邻，且其距离→余弦换算只对单位向量成立
   * （零向量距离恒 1.0 → 旧公式反推 0.5 → 锐化后 78%，见 ADR-0185）。分数即原始余弦 [0,1]，
   * 与参考面板百分比同尺，不再做幂次锐化——阈值型调用方（自动关联下限 / 每周撞车）已同步换算。
   * signal（issue 428）：面板换新查询即中断本轮（嵌入请求中断 + 全扫/重排检查点让出）。
   * opts.skipRerank（issue 541）：调用方显式声明不重排——成员集在重排前已按余弦锁死，重排只换顺序
   * 与挂 `rerankScore`，凡是只读 `score` 的链路（建链）拿到的结果与「重排失败回退余弦序」逐条相同，
   * 那一轮重排纯属白付耗时。判别权交给调用方，不再靠列表长度隐式区分前后台。
   */
  async vectorSearch(
    query: string,
    topK = 20,
    baseUrl?: string,
    signal?: AbortSignal,
    opts?: { skipRerank?: boolean }
  ): Promise<SearchHit[]> {
    throwIfAborted(signal);
    const queryEmbedding = await getEmbedding(query, true, baseUrl, undefined, signal);
    throwIfAborted(signal);
    if (!isValidVector(queryEmbedding)) return [];
    const dim = this.meta._dim || this.dim;
    if (!dim || this.vectors.length === 0) return [];
    if (queryEmbedding.length !== dim) {
      throw new Error(`查询向量维度 ${queryEmbedding.length} 与索引维度 ${dim} 不符（索引需重建）`);
    }

    const cache = this.buildNormCache(dim);
    const q = Float32Array.from(normalizeVec(queryEmbedding));

    const hits: SearchHit[] = [];
    let row = 0;
    let scanned = 0;
    for (const [path, note] of Object.entries(this.meta.notes)) {
      // 取消检查点（issue 428）：全扫是同步段，取消只能靠行间让出——每 64 篇一查，
      // 检查开销相对点积可忽略，大库下也让「已经没人要的查询」不再吃完整个扫描
      if (++scanned % 64 === 0) throwIfAborted(signal);
      for (const chunk of note.chunks) {
        if (row >= cache.rows) break;
        if (cache.valid[row]) {
          const off = row * dim;
          let dot = 0;
          for (let i = 0; i < dim; i++) dot += cache.data[off + i] * q[i];
          hits.push({ path, chunk: chunk.text, score: Math.max(0, dot) });
        }
        row++;
      }
      if (row >= cache.rows) break;
    }

    const seen = new Set<string>();
    const deduped: SearchHit[] = [];
    for (const item of hits.sort((a, b) => b.score - a.score)) {
      const key = item.path + '::' + item.chunk;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= topK) break;
    }
    return this.applyRerank(query, deduped, baseUrl, signal, opts?.skipRerank === true);
  }

  /** 模型重建门（融合批）：本地 meta 无 _model 跟踪、默认 bge-m3 未变——恒 false（F2：绝不自动重建）。
   *  （上游 issue 422 的 meta._model 深跟踪未随本批吸收，维持本地 stub 语义。） */
  needsModelRebuild(): boolean {
    return false;
  }

  /**
   * 重排接线（issue 427/ADR-0186 建本地通道；issue 431/ADR-0189 起双通道二选一）：列表整体交
   * 当前生效通道打分，重排分另记 `hit.rerankScore`（issue 429），显示层据此让百分比与名次同尺；
   * **hit.score 不动**——阈值仍走 ADR-0185 的单一余弦尺。**要么整体重排、要么维持余弦序**
   * （ADR-0186 不变量）：skip 或列表超过 RERANK_MAX_DOCS 即整轮不重排（见下方两处早退）——
   * 已重排头部 + 只有余弦分的尾部混排，正是 issue 429 要消灭的两把尺观感；面板侧 TopK 上限（1–50）保证
   * 交互检索永远走整列重排。通道由 `rerankChannel()` 单源决定（off / local / jev）：
   * local = Qwen3-Reranker 交叉编码（Ollama，绑 8B 嵌入门）；jev = Jev noul 云端判定
   * （不绑 8B 门；返回 null 即 Jev 不可用——未配密钥 / 超时 / 畸形 / 缺题键都在这一路回落）。
   * 任一通道失败（模型未装 / 超时 / 预算用尽）→ 静默回退余弦序 + console.warn：重排是增强层，
   * 不打断检索链路，也不触发 search() 的文本降级（那是向量链路故障的降级）。
   * 取消（AbortError）例外：直抛——发起方已换成新查询，这里回填旧序只会盖掉新结果。
   */
  private async applyRerank(
    query: string,
    hits: SearchHit[],
    baseUrl?: string,
    signal?: AbortSignal,
    skip = false
  ): Promise<SearchHit[]> {
    if (skip) return hits; // issue 541：调用方声明不重排（建链只要成员集与余弦分）
    if (hits.length < 2) return hits;
    const channel: RerankChannel = rerankChannel();
    if (channel === 'off') return hits;
    // 未声明 skip 的长列表兜底：半重排会让本函数的「整轮同尺」不变量失守。
    // issue 541 起建链不再靠这条判别——它的池 = max(TopK×3, 24)，TopK ≤ 16 时 ≤ 48，
    // 本就够不到这里，白跑一整轮（现由 findCandidates 显式传 skipRerank）。
    if (hits.length > RERANK_MAX_DOCS) return hits;
    try {
      if (channel === 'jev') {
        const scores = await jevRerankScores(query, hits.map((h) => h.chunk), signal);
        if (!scores) {
          // null = Jev 不可用（未配密钥 / 超时 / 畸形 / 缺题键）→ 维持余弦序（judgeOrFallback 的
          // fallback 槽位）。失败要留痕（ADR-0189 决策 5：失败一律 warn）——judgeOrFallback 自己
          // 只有 debug 且文案是「回落 LLM」（本票是首个非 LLM 回落），未配密钥连 debug 都没有，
          // 与本地通道的 catch-warn 不对称，review 收口补齐。
          console.warn('[secondbrain] Jev 重排不可用，按余弦序返回');
          return hits;
        }
        return this.rankByScores(hits, scores);
      }
      const scores = await rerankScores(query, hits.map((h) => h.chunk), baseUrl, signal);
      return this.rankByScores(hits, scores);
    } catch (e) {
      if (signal?.aborted || isAbortError(e)) throw abortError();
      console.warn('[secondbrain] 重排不可用，按余弦序返回', e);
      return hits;
    }
  }

  /** 重排分 → 名次（同分保持余弦序的稳定排序），重排分随条目走、score 不动（单一余弦尺） */
  private rankByScores(hits: SearchHit[], scores: number[]): SearchHit[] {
    return hits
      .map((hit, i) => ({ hit, s: scores[i], i }))
      .sort((a, b) => b.s - a.s || a.i - b.i) // 同分保持余弦序（稳定排序）
      .map((x) => ({ ...x.hit, rerankScore: x.s }));
  }

  /**
   * 归一化矩阵缓存（上游 ADR-0185 逐字）：零向量/非有限行整行跳过；行序不变量告警。
   * 缓存键 = 来源数组身份 + 维度 + 行数——内容变更即换新缓冲，身份比对即失效。
   */
  private buildNormCache(dim: number): NormCache {
    const rows = Math.floor(this.vectors.length / dim);
    const cached = this.normCache;
    if (cached && cached.src === this.vectors && cached.dim === dim && cached.rows === rows) return cached;
    const data = new Float32Array(rows * dim);
    const valid = new Uint8Array(rows);
    let skipped = 0;
    for (let r = 0; r < rows; r++) {
      const off = r * dim;
      let norm = 0;
      let ok = true;
      for (let i = 0; i < dim; i++) {
        const x = this.vectors[off + i];
        if (!Number.isFinite(x)) { ok = false; break; }
        norm += x * x;
      }
      if (!ok || !(norm > 0) || !Number.isFinite(norm)) { skipped++; continue; }
      const inv = 1 / Math.sqrt(norm);
      for (let i = 0; i < dim; i++) data[off + i] = this.vectors[off + i] * inv;
      valid[r] = 1;
    }
    if (skipped > 0) {
      console.warn(`[secondbrain] 检索跳过 ${skipped}/${rows} 条无效向量（零向量或非有限分量）——重新索引可修复`);
    }
    const expected = Object.values(this.meta.notes).reduce((n, note) => n + note.chunks.length, 0);
    if (expected !== rows) {
      console.warn(`[secondbrain] .vec 行数 ${rows} 与 meta 段落总数 ${expected} 不一致（损坏态），本次检索仅覆盖 ${Math.min(rows, expected)} 行——重新索引可修复`);
    }
    console.log(`[secondbrain] 检索归一化缓存已构建: ${rows} 行 × ${dim} 维`);
    this.normCache = { src: this.vectors, dim, rows, data, valid };
    return this.normCache;
  }

  /** 桌面检索：向量优先，异常降级文本；移动端直走文本索引（QA L694-699 + bz 降级改进）。
   *  取消（issue 428）例外：AbortError 直抛不降级——发起方已换新查询，降级回填旧文本只会盖掉新轮。 */
  async search(query: string, topK = 20, onDegraded?: (reason: unknown) => void, signal?: AbortSignal): Promise<SearchHit[]> {
    if (IS_MOBILE) return searchTextIndex(query, this.meta.notes, topK);
    try {
      // ticket 46：检索整体限时（与 Ollama 统一超时同值）——挂起/超时即降级文本，避免 30s 阻塞参考面板/对话
      return await this.withSearchTimeout(this.vectorSearch(query, topK, undefined, signal));
    } catch (e) {
      if (signal?.aborted || isAbortError(e)) throw abortError();
      console.warn('[secondbrain] 向量检索失败，降级为文本检索', e);
      onDegraded?.(e); // 降级信号：调用方（参考面板）可给用户降级提示
      return searchTextIndex(query, this.meta.notes, topK);
    }
  }

  /** [46] 检索级超时封装：超时按失败降级处理（不吞掉原错误，仅兜住挂起请求）；
   *  10s（SEARCH_TIMEOUT_MS）与嵌入端点 30s 分离——检索降级快，嵌入不因慢推理误报失败 */
  private async withSearchTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`向量检索超时（${SEARCH_TIMEOUT_MS / 1000}s）`)), SEARCH_TIMEOUT_MS);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  searchText(query: string, topK = 20): SearchHit[] {
    return searchTextIndex(query, this.meta.notes, topK);
  }

  /** 移动端三级检索：远程向量 → TF-IDF（复用已建索引）→ 文本（QA L704-718）。
   *  signal（issue 428）：取消通道——远程向量这一级被取消时直抛（不清空结果、不降级文本）。 */
  async searchMobile(query: string, topK = 20, signal?: AbortSignal): Promise<SearchHit[]> {
    const CONFIG = buildConfig();
    if (this.searchMode === 'remote' && CONFIG.OLLAMA_REMOTE_URL) {
      try {
        const results = await this.vectorSearch(query, topK, CONFIG.OLLAMA_REMOTE_URL, signal);
        if (results.length) return results;
      } catch (e) {
        if (signal?.aborted || isAbortError(e)) throw abortError();
        console.warn('[secondbrain] 远程向量检索失败，降级', e);
      }
    }
    if (this.searchMode === 'tfidf' && this.tfidf.N > 0) {
      return this.tfidf.search(query, topK);
    }
    return this.searchText(query, topK);
  }

  /** 移动端初始化：探活远程 Ollama，否则建 chunk 粒度 TF-IDF 索引（构建一次，检索期复用） */
  async initMobile(): Promise<string> {
    const CONFIG = buildConfig();
    if (CONFIG.OLLAMA_REMOTE_URL) {
      const ok = await checkRemoteOllama(CONFIG.OLLAMA_REMOTE_URL);
      if (ok) {
        this.searchMode = 'remote';
        console.log(`[secondbrain][移动端] 远程 Ollama 就绪: ${CONFIG.OLLAMA_REMOTE_URL}`);
        return '✅ 远程 Ollama 已连接';
      }
    }
    const docs: { path: string; text: string }[] = [];
    for (const [path, note] of Object.entries(this.meta.notes)) {
      for (const chunk of note.chunks) {
        if (chunk.text) docs.push({ path, text: chunk.text });
      }
    }
    this.tfidf.build(docs);
    if (this.tfidf.N > 0) {
      this.searchMode = 'tfidf';
      console.log(`[secondbrain][移动端] TF-IDF 就绪: ${this.tfidf.N} docs`);
      return `✅ TF-IDF 就绪（${this.tfidf.N} 段）`;
    }
    this.searchMode = 'text';
    console.log('[secondbrain][移动端] TF-IDF 无数据，使用文本匹配');
    return '⚠️ 没有符合条件的文件';
  }
}
