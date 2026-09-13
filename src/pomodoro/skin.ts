/**
 * 番茄钟面板主题（皮肤）单源（issue 264 吸收上游 render.ts 皮肤清单段；markup 仍在 ui.ts）。
 *
 * 与插件侧 ui.ts、设置面板「外观 → 面板主题」选项、评审壳 skins.html 共用同一份清单；
 * 色值本身在 styles.css 的 `:root` 变量表（`--pz-<id>-*`），设置面板预览卡引用同一批变量。
 */

/** 面板主题（皮肤）取值——与 CSS 的 `pomodoro-skin-<value>` 一一对应，改名须留兼容 */
export type PomodoroSkinTheme =
  | 'tomato'
  | 'ink'
  | 'grid'
  | 'moss'
  | 'mist'
  | 'sand'
  | 'citrus'
  | 'sakura'
  | 'latte'
  | 'night';

/**
 * 面板主题清单（**皮肤单源**）：设置面板选项、弹窗皮肤类、评审壳皮肤页三处同表。
 * 顺序 = 默认项（番茄）在前；value 改动牵动 CSS 类名与旧设置值。
 */
export const POMODORO_SKIN_THEMES: ReadonlyArray<{ value: PomodoroSkinTheme; label: string }> = [
  { value: 'tomato', label: '番茄' },
  { value: 'ink', label: '墨白' },
  { value: 'grid', label: '方格纸' },
  { value: 'moss', label: '苔原' },
  { value: 'mist', label: '海雾' },
  { value: 'sand', label: '暖沙' },
  { value: 'citrus', label: '蜜柑' },
  { value: 'sakura', label: '樱粉' },
  { value: 'latte', label: '咖啡' },
  { value: 'night', label: '夜航' },
];

/** 默认皮肤（与 src/settings.ts 的 pomodoroSkinTheme 默认值一致） */
export const DEFAULT_POMODORO_SKIN_THEME: PomodoroSkinTheme = 'tomato';

/** 任意设置值 → 合法主题（未知/空值回落默认） */
export function normalizeSkinTheme(v: unknown): PomodoroSkinTheme {
  const cur = String(v ?? '');
  return POMODORO_SKIN_THEMES.some((t) => t.value === cur) ? (cur as PomodoroSkinTheme) : DEFAULT_POMODORO_SKIN_THEME;
}

/** 主题 → 皮肤类名（挂在 #pomodoro-popup 上） */
export function skinClassOf(v: unknown): string {
  return `pomodoro-skin-${normalizeSkinTheme(v)}`;
}
