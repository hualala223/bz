/**
 * 番茄钟域入口（ticket 26-32）：命令回调与生命周期清理。
 * 命令 bz-pomodoro-open 在 main.ts COMMANDS 表注册（域内不重复 addCommand）。
 * ticket 63：移除读书番茄钟与专注目标（导出面同步清理）。
 * 增强包：startFocusForTask——备忘录「专注这个」联动入口（memo 域动态 import，ADR-0002 延迟解析）。
 * 票 323：toggleEyeMode——护眼模式开关（命令 bz-pomodoro-eye-toggle 快捷面）；
 * shutdownPomodoro——完整休眠（命令「关闭番茄钟」：停循环 + 关面板 + 收状态栏，再开满血复活）。
 */
export {
  openPomodoro, unloadPomodoro, ensurePomodoro, startFocusForTask, toggleFocus,
  isFocusing, menuPhase, skipBreak, togglePause, toggleEyeMode, shutdownPomodoro,
} from './ui';
