/**
 * 收藏本标签定义（上游 issue 363：定义本体迁 data.json 设置键 favoriteTags）。
 * 独立成纯文件（ADR-0104）：只依赖 settings-provider 注入读层——render 纯层引用图谱零污染
 * （config.ts 的存储路径兼容转发不进 render 图）。
 */
import { tryGetSettings } from '../core/settings-provider';

/** data.json 设置键（上游 issue 363：标签定义迁 data.json，伴生文件退役） */
const TAGS_SETTINGS_KEY = 'favoriteTags';
let tagIdSeq = 0;
import type { FavTag } from './types';

/**
 * 内置 9 类 seed（旧硬编码 TAGS 收编）：id 固定不随改名变化——GitHub 强标签特判、
 * 删除迁移兜底目标（'web' 网站）等内部引用一律按 id 取当前 label。
 */
export const DEFAULT_TAGS: FavTag[] = [
  { id: 'github', label: 'GitHub', ic: 'github' },
  { id: 'desktop', label: '桌面软件', ic: 'app-window' },
  { id: 'web', label: '网站', ic: 'globe' },
  { id: 'llm', label: '大模型', ic: 'brain-circuit' },
  { id: 'pi', label: 'pi', ic: 'keyboard' },
  { id: 'claude', label: 'Claude', ic: 'bot' },
  { id: 'skills', label: 'skills', ic: 'zap' },
  { id: 'pub', label: '酒馆', ic: 'beer' },
  { id: 'dsh', label: 'DeepSeek Harness', ic: 'waypoints' },
];

/** 运行时标签集（null = 未载入，getTags() 首次访问自设置键播种；setTags 写键时同步注入） */
let currentTags: FavTag[] | null = null;

/** 设置键现值归一化（坏行剔除/缺 id 补，data.json 手改防御）：无键/空/坏 → []，由调用方回退 seed */
function tagsFromSettings(): FavTag[] {
  return normalizeTags((tryGetSettings() as any)?.[TAGS_SETTINGS_KEY]);
}

/**
 * 当前生效标签定义（设置键优先，无键/空/坏回退内置 9 类 seed；顺序即磁贴行与表单顺序）。
 * 缓存语义（审查修复注明）：本运行时缓存只在「未播种/setTags 写入」时读设置键，之后不再
 * 回读——外部直接改 data.json 的 favoriteTags 在本次会话内不感知，需重载插件（resetTagsState）
 * 或走任一 saveTags/迁移写入路径才会刷新；正常链路都经 setTags 单点写，缓存即最新。
 */
export function getTags(): FavTag[] {
  if (!currentTags) {
    const tags = tagsFromSettings();
    currentTags = tags.length ? tags : DEFAULT_TAGS;
  }
  return currentTags;
}

/**
 * 注入标签定义到设置层（归一化后写 data.json 设置键 favoriteTags + 运行时即时生效）。
 * 注意：只写不落盘——持久化由 data.saveTags（管理界面唯一落盘点）与旧伴生文件迁移任务
 * 经 saveSettings 收口；seed 回退不写键（首次改动才落盘）。
 */
export function setTags(tags: FavTag[]): void {
  currentTags = tags;
  (tryGetSettings() as any)[TAGS_SETTINGS_KEY] = tags;
}

/** 测试/卸载重置（丢弃运行时集，下次 getTags 自设置键重播种——设置键即真理） */
export function resetTagsState(): void {
  currentTags = null;
}

/** 按稳定 id 取标签定义（GitHub 特判等内部引用单源；不存在返回 null） */
export function getTagById(id: string): FavTag | null {
  return getTags().find((t) => t.id === id) ?? null;
}

/** 标签定义归一化：坏行剔除、缺 id 补（旧手改文件防御）、缺图标回落 tag、名称去空白 */
export function normalizeTags(raw: unknown): FavTag[] {
  if (!Array.isArray(raw)) return [];
  const out: FavTag[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Partial<FavTag>;
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    if (!label) continue;
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : newTagId(),
      label,
      ic: typeof o.ic === 'string' && o.ic ? o.ic : 'tag',
    });
  }
  return out;
}

export function newTagId(): string {
  tagIdSeq = (tagIdSeq + 1) % 1679616; // 36^4 循环（单毫秒内不可能耗尽，跨毫秒回绕也无碰撞面）
  return 't' + Date.now().toString(36) + tagIdSeq.toString(36);
}
