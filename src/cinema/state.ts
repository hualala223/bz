/**
 * 影院（cinema）域状态：模块级可变对象 M
 * 自 ADR-0087 起接管原 movie 域（旧 src/movie 已退役），数据仍是 `我的/影视/*.md`。
 */
import type { CinemaViewKind } from './shared';
import type { App, TFile } from 'obsidian';
import { tryGetSettings } from '../core/settings-provider';

/** 娱乐目录默认值（cinemaFolderPath 未配置时回落；旧 movieFolderPath 键已退役。
 *  ADR-0127 票 292：默认目录 我的/影视 → 我的/娱乐，旧默认留存供启动迁移判定） */
export const DEFAULT_FOLDER = '我的/娱乐';
/** 旧默认目录（迁移判定用：启动时该目录存在且新目录不存在则整目录搬迁） */
export const OLD_DEFAULT_FOLDER = '我的/影视';

/** 影视目录解析（目录唯一真理跨域化，ADR-0115）：cinemaFolderPath 显式配置优先，缺省回落默认。
 *  日记本域经此函数读取影视目录（不再有独立的 movieDirectory 设置键），设置访问器未注入时回落默认。 */
export function resolveCinemaFolderPath(): string {
  try {
    const s = tryGetSettings() as Record<string, unknown>;
    return typeof s.cinemaFolderPath === 'string' && s.cinemaFolderPath.trim() ? s.cinemaFolderPath : DEFAULT_FOLDER;
  } catch (e) {
    return DEFAULT_FOLDER;
  }
}

export interface CinemaItem {
  file: TFile | null;
  name: string;
  typeTag: string;
  group: string;
  watchDate: string | null;
  rating: number | null;
  status: number;
  poster: string | null;
  review: string | null;
  genre: string | null;
  director: string | null;
  actors: string | null;
  region: string | null;
  year: string | null;
  doubanRating: string | null;
  doubanUrl: string | null;
  synopsis: string | null;
  /** 片长原文（frontmatter「片长」，如「118分钟」；分析页片长画像用，ADR-0090 并入） */
  duration: string | null;
  /** 季集原文（frontmatter「季集」，如「2季」；分析页追剧深度用，ADR-0090 并入） */
  seasonText: string | null;
  /** 国家（frontmatter「国家」单值；票 294 / ADR-0127） */
  country: string | null;
  /** 题材数组（frontmatter「类型」顿号/斜杠分隔解析；票 294 / ADR-0127） */
  genres: string[];
  /** 总集数（frontmatter「总集数」；仅电视剧/短剧写入，票 295） */
  episodesTotal: number | null;
  /** 正在看集数（frontmatter「正在看集数」；仅电视剧/短剧写入，票 295） */
  episodesWatching: number | null;
}

/** 排序模式：date=最近观看（默认）/ created=按创建 / rating=按评分 */
export type CinemaSortMode = 'date' | 'created' | 'rating';

export interface CinemaState {
  currentOverlay: HTMLElement | null;
  items: CinemaItem[];
  /** 当前筛选：type=组（null=全部）、status=状态（null=全部）、country=国家（null=全部/'未填'） */
  typeFilter: string | null;
  statusFilter: string | null;
  /** 国家筛选：null=全部；'未填'=只看国家为空的条目；其余=精确匹配（票 294） */
  countryFilter: string | null;
  /** 排序模式 */
  sortMode: CinemaSortMode;
  /** 当前视图：list / ai / stat */
  view: CinemaViewKind;
  searchKeyword: string;
  searchDebounceTimer: ReturnType<typeof setTimeout> | null;
  appRef: App | null;
  folderPath: string;
  renderFn: (() => void) | null;
  /** AI 页内状态（不弹窗）：是否运行中 / 等待消息 / 结果列表 / 错误信息 */
  aiRunning: boolean;
  aiWaitMsg: string;
  aiResult: any[] | null;
  aiError: string | null;
  /** 找同类基准影片（「换一批」按基准重跑；荐片为 null） */
  aiBase: CinemaItem | null;
  /** 多选导出模式（票 296）：进入后点卡片=勾选/取消勾选 */
  multiSelect: boolean;
  /** 多选模式下已勾选条目（稳定键集合，票 296） */
  selected: Set<string>;
}

export const M: CinemaState = {
  currentOverlay: null,
  items: [],
  typeFilter: null,
  countryFilter: null,
  statusFilter: null,
  sortMode: 'date',
  view: 'list',
  searchKeyword: '',
  searchDebounceTimer: null,
  appRef: null,
  folderPath: DEFAULT_FOLDER,
  renderFn: null,
  aiRunning: false,
  aiWaitMsg: '',
  aiResult: null,
  aiError: null,
  aiBase: null,
  multiSelect: false,
  selected: new Set<string>(),
};

/** 测试/重建用：整体重置模块状态 */
export function resetCinemaState(): void {
  M.currentOverlay = null;
  M.items = [];
  M.typeFilter = null;
  M.countryFilter = null;
  M.statusFilter = null;
  M.sortMode = 'date';
  M.view = 'list';
  M.searchKeyword = '';
  M.searchDebounceTimer = null;
  M.appRef = null;
  M.folderPath = DEFAULT_FOLDER;
  M.renderFn = null;
  M.aiRunning = false;
  M.aiWaitMsg = '';
  M.aiResult = null;
  M.aiError = null;
  M.aiBase = null;
  M.multiSelect = false;
  M.selected = new Set<string>();
}
