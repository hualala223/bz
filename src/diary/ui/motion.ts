/**
 * 写日记弹窗入场动效（票 323，自上游 yeshimei/bz master src/diary/motion.ts 移植）：
 * 字段行落纸接力 + 类型章签一枚枚摆上。
 * 口径同上游：只动 transform/opacity/filter，几何从不改写，终态与无动效版逐像素一致；
 * jsdom / 无 WAAPI 环境直达终态，测试零感知。禁 import obsidian / core 服务（纯浏览器 API）。
 */

const M = { base: 280 } as const;
const E = { out: 'cubic-bezier(.22,.82,.3,1)' } as const;

/** 安全 WAAPI：宿主不支持时直达终态（落最后一帧） */
function waapi(el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof el.animate !== 'function') {
    const last = frames[frames.length - 1];
    if (el && last) {
      for (const k of Object.keys(last)) {
        if (k === 'offset') continue;
        try {
          (el.style as unknown as Record<string, string>)[k] = String((last as Record<string, unknown>)[k]);
        } catch {
          /* 不可内联属性忽略 */
        }
      }
    }
    return null;
  }
  try {
    return el.animate(frames, opts);
  } catch {
    return null;
  }
}

/** 写日记弹窗内编排：字段行落纸接力 + 类型章签一枚枚摆上（壳归 core uiModal，域内只编排表单内容） */
export function motionSheetDialog(popup: HTMLElement): void {
  const form = popup.querySelector<HTMLElement>('.bz-diary-form');
  if (!form) return;
  [...form.children].forEach((el, i) => {
    if (i >= 6) return;
    waapi(
      el as HTMLElement,
      [
        { opacity: 0, transform: 'translateY(7px)', filter: 'blur(3px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: M.base, delay: 40 + i * 50, easing: E.out, fill: 'backwards' }
    );
  });
  popup.querySelectorAll<HTMLElement>('.diary-tag-selector-btn').forEach((el, i) => {
    if (i >= 14) return;
    waapi(
      el,
      [
        { opacity: 0, transform: 'translateY(4px) scale(.94)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: M.base, delay: 150 + i * 18, easing: E.out, fill: 'backwards' }
    );
  });
}
