// @vitest-environment node
/**
 * 划选工具框定位算式测试（issue 329/ADR-0144；2026-09-30 上游改版，上游吸收批 3 / 票 308）：
 * 桌面选区上方 8px、放不下翻下方；移动端（preferBelow）选区下方 8px 优先、放不下翻上方——
 * Android 选择 ActionMode 压不死、恒在选区上方，工具框从下方让开；横纵钳制与零尺寸兜底。
 */
import { describe, it, expect } from 'vitest';
import { placeSelBarRect } from '../../src/clipbook/selbar-place';

/** jsdom 口径的估算浮框尺寸（ui.ts：offsetWidth 零值回落 240×36） */
const BAR = { w: 240, h: 36 };
const VP = { w: 1024, h: 768 };

describe('placeSelBarRect（划选工具框定位）', () => {
  it('桌面：选区上方 8px', () => {
    const p = placeSelBarRect({ top: 100, left: 50, bottom: 120, right: 290 }, false, VP, BAR);
    expect(p.top).toBe(100 - 36 - 8);
    expect(p.left).toBe(50);
  });

  it('桌面：上方放不下翻下方（top<8 → bottom+8）', () => {
    const p = placeSelBarRect({ top: 0, left: 50, bottom: 30, right: 290 }, false, VP, BAR);
    expect(p.top).toBe(38);
  });

  it('移动端：选区下方 8px 优先（系统选择菜单恒在上方）', () => {
    const p = placeSelBarRect({ top: 100, left: 50, bottom: 120, right: 290 }, true, VP, BAR);
    expect(p.top).toBe(128);
    expect(p.left).toBe(50);
  });

  it('移动端：下方放不下翻上方', () => {
    // 视口 768：bottom=750 → 758+36 越界 → 翻上方 720-36-8=676
    const p = placeSelBarRect({ top: 720, left: 50, bottom: 750, right: 290 }, true, VP, BAR);
    expect(p.top).toBe(676);
  });

  it('横钳制：贴左与贴右都留 8px 边距', () => {
    const l = placeSelBarRect({ top: 100, left: 2, bottom: 120, right: 242 }, false, VP, BAR);
    expect(l.left).toBe(8);
    const r = placeSelBarRect({ top: 100, left: 900, bottom: 120, right: 1140 }, false, VP, BAR);
    expect(r.left).toBe(1024 - 240 - 8);
  });

  it('零尺寸兜底：视口未知时跳过钳制，只算翻面', () => {
    const p = placeSelBarRect({ top: 0, left: 50, bottom: 30, right: 290 }, false, { w: 0, h: 0 }, BAR);
    expect(p.top).toBe(38);
    expect(p.left).toBe(50);
  });

  it('bottom 缺省回落 top（rect 无 bottom 值时翻面口径不炸）', () => {
    const p = placeSelBarRect({ top: 0, left: 50, bottom: 0, right: 290 }, false, VP, BAR);
    // top=0 上方放不下 → (bottom||top)+8 = 8
    expect(p.top).toBe(8);
  });
});
