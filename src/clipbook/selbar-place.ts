/**
 * 划选工具框定位口径（issue 329/ADR-0144；2026-09-30 上游改版：移动端文字工具框**下方优先**，
 * 系统选择菜单恒在选区上方——Android 选择 ActionMode 不认 preventDefault，压不死就让开）。
 * 纯函数单源：ui.ts 的 placeSelBar 消费，测试直接打算式（上游吸收批 3，源 yeshimei/bz issue 536 批次）。
 */

/** 视口与浮框尺寸（0 = 未知，跳过对应钳制——jsdom 零尺寸走估算兜底） */
export interface SelBarViewport {
  w: number;
  h: number;
}

/** 选区/图片的 getBoundingClientRect 四值 */
export interface SelBarRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/**
 * 定位算式：默认光标上方 8px、放不下翻下方；`preferBelow`（移动端文字工具框）反之，
 * 下方 8px 优先、放不下翻上方；横纵钳制在视口内（留 8px 边距）。
 */
export function placeSelBarRect(
  rect: SelBarRect,
  preferBelow: boolean,
  vp: SelBarViewport,
  bar: { w: number; h: number }
): { left: number; top: number } {
  let left = rect.left;
  let top: number;
  if (preferBelow) {
    top = (rect.bottom || rect.top) + 8;
    if (vp.h && top + bar.h > vp.h - 8) top = rect.top - bar.h - 8;
  } else {
    top = rect.top - bar.h - 8;
    if (top < 8) top = (rect.bottom || rect.top) + 8;
  }
  if (vp.w) left = Math.min(Math.max(left, 8), Math.max(8, vp.w - bar.w - 8));
  if (vp.h) top = Math.min(Math.max(top, 8), Math.max(8, vp.h - bar.h - 8));
  return { left, top };
}
