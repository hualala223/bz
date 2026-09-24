/**
 * 单输入文本弹窗（票 301 追加决策 Q15：豆瓣重抓搜索词确认框）。
 * 复用 flow-dialog 的弹窗壳惯例（issue 291 统一壳 `bz-overlay-popup`、动态发号、
 * ESC 经 escManager、遮罩点击取消、焦点还原）；单行 input + 取消/确认双钮。
 * 取消语义与 openFlowDialog 一致：遮罩 / ESC / 取消钮 → resolve null。
 * 样式零新增：壳与按钮沿用 .confirm-actions 既有规则（铁律 8），input 用内联功能性样式
 * （宽度占满——动态计算类，属功能性内联豁免）。
 */
import { escManager } from './esc-manager';
import { escapeHtml } from './utils';
import { allocZ } from './z-order';

export interface TextPromptOptions {
  title?: string;
  message?: string;
  /** 输入框预填值（重抓场景 = 自动生成的默认搜索词，可改） */
  defaultValue?: string;
  placeholder?: string;
}

/** 打开文本输入弹窗；确认 resolve 输入内容（trim），取消 resolve null */
export function openTextPromptDialog(opts: TextPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const prevActive = document.activeElement;

    const mask = document.createElement('div');
    mask.id = '__bz_text_prompt_mask__';
    mask.style.zIndex = String(allocZ());
    mask.onclick = (e) => {
      if (e.target === mask) settle(null);
    };

    const popup = document.createElement('div');
    popup.className = 'bz-overlay-popup bz-text-prompt';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.innerHTML =
      '<h4>' + escapeHtml(opts.title || '输入') + '</h4>' +
      (opts.message ? '<p>' + escapeHtml(opts.message) + '</p>' : '') +
      '<input type="text" id="__bz_text_prompt_input__" style="width:100%"' +
      (opts.placeholder ? ` placeholder="${escapeHtml(opts.placeholder)}"` : '') +
      ' />' +
      '<div class="confirm-actions">' +
      '<button id="__bz_text_prompt_cancel__">取消</button>' +
      '<button id="__bz_text_prompt_ok__">确认</button>' +
      '</div>';

    mask.appendChild(popup);
    document.body.appendChild(mask);

    const escHandle = escManager.register('bz-text-prompt', {
      isVisible: () => mask.isConnected,
      close: () => settle(null),
    });

    let settled = false;
    function restoreFocus(): void {
      if (prevActive && prevActive instanceof HTMLElement && prevActive.isConnected) {
        prevActive.focus();
      }
    }
    function settle(v: string | null) {
      if (settled) return;
      settled = true;
      escHandle.unregister();
      mask.remove();
      restoreFocus();
      resolve(v);
    }

    const input = popup.querySelector<HTMLInputElement>('#__bz_text_prompt_input__');
    const okBtn = popup.querySelector<HTMLButtonElement>('#__bz_text_prompt_ok__');
    const cancelBtn = popup.querySelector<HTMLButtonElement>('#__bz_text_prompt_cancel__');
    if (okBtn) okBtn.onclick = () => settle(input ? input.value.trim() : '');
    if (cancelBtn) cancelBtn.onclick = () => settle(null);
    if (input) {
      input.value = opts.defaultValue ?? '';
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          settle(input.value.trim());
        }
      };
      input.focus();
      input.select();
    }
  });
}
