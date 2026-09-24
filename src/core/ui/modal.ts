/* ============================================================
 * bz 组件库 · 居中模态（src/core/ui/modal.ts）
 * 对齐设计手册 §9/§10 弹窗规格（12px 圆角、shadow-lg、82vh 限高）：
 *   .bz-overlay-mask（遮罩，点关）+ .bz-overlay-popup（内容卡）
 * 供新体系域复用——替换各域自造的 .bz-*-mask/modal 弹窗基座。
 * ESC 经 escManager 单例注册（先开先关，后开优先）。
 * ============================================================ */
import { escManager } from '../esc-manager';
import { allocZ } from '../z-order';
import { uiIcon } from './icon';

export interface BzModalOpts {
  content: HTMLElement | string;   // 弹窗内容（元素或 HTML 片段）
  maxWidth?: number;               // 像素宽度（默认 400，≤90vw）
  head?: boolean;                  // 带头行（关闭钮）——默认 false（无关闭钮，靠遮罩/ESC）
  title?: string;
  onClose?: () => void;            // 关闭回调（遮罩/ESC/✕）
  /** 关闭意图拦截（上游 issue 365，脏表单弹窗用）：提供时遮罩点击/ESC 改调 requestClose——
   *  由消费方确认后再调 close；✕ 钮直走 close 不拦（显式意图） */
  requestClose?: () => void;
  className?: string;              // 附加到 popup 的类
}

/** 存活模态登记表（上游移植随件）：插件卸载时 closeAllModals() 统一收口，防禁用后遮罩残留
 *  且 ESC 已被 escManager.destroy 短路。遍历副本：close 会同步改集合。 */
const liveModals = new Set<() => void>();

/** 关闭全部存活 uiModal（unload 收口；未打开时 no-op，可无条件调用） */
export function closeAllModals(): void {
  for (const close of [...liveModals]) close();
}

/** 打开居中模态，返回 { mask, popup, close } */
export function uiModal(opts: BzModalOpts): { mask: HTMLElement; popup: HTMLElement; close: () => void } {
  const mask = document.createElement('div');
  mask.className = 'bz-overlay-mask';
  mask.style.zIndex = String(allocZ());

  const popup = document.createElement('div');
  popup.className = 'bz-overlay-popup' + (opts.className ? ' ' + opts.className : '');
  if (opts.maxWidth) popup.style.maxWidth = `min(${opts.maxWidth}px, calc(100vw - 32px))`;

  if (opts.head) {
    const head = document.createElement('div');
    head.className = 'bz-dialog-head';
    const title = document.createElement('span');
    title.className = 'bz-dialog-title';
    title.textContent = opts.title || '';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'bz-icon-btn bz-icon-btn--lg';
    closeBtn.title = '关闭';
    closeBtn.appendChild(uiIcon('x'));
    closeBtn.addEventListener('click', () => close());
    head.appendChild(title);
    head.appendChild(closeBtn);
    popup.appendChild(head);
  }

  const body = document.createElement('div');
  body.className = 'bz-dialog-body';
  if (typeof opts.content === 'string') body.innerHTML = opts.content;
  else body.appendChild(opts.content);
  popup.appendChild(body);
  mask.appendChild(popup);

  let closed = false;
  let escHandle: ReturnType<typeof escManager.register> | null = null;
  function close() {
    if (closed) return;
    closed = true;
    if (!mask.isConnected) return; // 幂等：closeAllModals/ESC/✕/遮罩多路只走一次
    mask.remove();
    escHandle?.unregister();
    liveModals.delete(close);
    opts.onClose?.();
  }

  // 关闭意图统一走 attemptClose（上游 issue 365 同款）：有 requestClose 时交消费方拦截，否则直接关
  const attemptClose = (): void => {
    if (opts.requestClose) opts.requestClose();
    else close();
  };

  // 点遮罩关闭（弹窗内元素不触发）
  mask.addEventListener('click', (e) => {
    if (e.target === mask) attemptClose();
  });

  // ESC：栈顶后开先关（escManager 会做可见性判断）
  escHandle = escManager.register('bz-modal', {
    isVisible: () => mask.isConnected,
    close: attemptClose,
  });

  document.body.appendChild(mask);
  liveModals.add(close);
  return { mask, popup, close };
}

/** bindFormSubmit（效率基元，上游效率#2）：弹窗表单回车提交——Ctrl/⌘+Enter 任意处、
 *  纯 Enter 仅单行 input（textarea 回车换行不拦；data-bz-no-form-submit 豁免过滤/搜索框）。 */
export function bindFormSubmit(popup: HTMLElement, onSubmit: () => void): void {
  popup.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (e.key !== 'Enter') return;
    if (!(e.ctrlKey || e.metaKey)) return; // 纯 Enter 交 keypress 段（输入框消费在彼处可见）
    e.preventDefault();
    onSubmit();
  });
  popup.addEventListener('keypress', (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.dataset.bzNoFormSubmit !== undefined) return;
    e.preventDefault();
    onSubmit();
  });
}
