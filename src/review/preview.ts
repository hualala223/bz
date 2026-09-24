/**
 * 笔记内嵌预览（ticket 04）：复习结果卡「查看原文档」→ 弹层内渲染该篇全文 + 「在 Obsidian 打开」。
 * 复用 Obsidian MarkdownRenderer（渲染失败降级纯文本）；关闭弹层回到原流程，不打断做题会话。
 * 结果卡与汇总页共用本组件。
 */
import type { App, TFile } from 'obsidian';
import { MarkdownRenderer, Component } from 'obsidian';
import { topifyZ } from '../core/z-order';

/** 打开笔记预览弹层（返回前自动渲染；关闭由遮罩/❌/ESC 触发） */
export async function showNotePreview(app: App, filePath: string, title?: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(filePath) as TFile | null;
  if (!file) return;
  let content = '';
  try {
    content = await app.vault.read(file);
  } catch {
    return;
  }

  const mask = document.createElement('div');
  mask.id = 'note-preview-mask';
  Object.assign(mask.style, { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.35)' });
  const popup = document.createElement('div');
  popup.id = 'note-preview-popup';
  Object.assign(popup.style, { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--background-primary)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxWidth: '680px', width: '92%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' });
  topifyZ(mask, popup); // ADR-0067：显示即发号，永远盖过已显示的做题弹窗/确认框

  const head = document.createElement('div');
  head.style.cssText = 'padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid var(--background-modifier-border);';
  const titleEl = document.createElement('h4');
  titleEl.style.cssText = 'margin:0;font-size:15px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  titleEl.textContent = `📖 ${(title || file.basename).replace(/^《|》$/g, '')}`;
  head.appendChild(titleEl);
  const btnOpen = document.createElement('button');
  btnOpen.textContent = '在 Obsidian 打开';
  btnOpen.style.cssText = 'padding:4px 10px;border:none;border-radius:6px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:12px;';
  const btnClose = document.createElement('button');
  btnClose.textContent = '❌';
  btnClose.style.cssText = 'padding:0;width:22px;height:24px;border:none;border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;font-size:12px;';
  head.appendChild(btnOpen);
  head.appendChild(btnClose);

  const body = document.createElement('div');
  body.id = 'note-preview-body';
  body.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;font-size:13px;';

  const close = () => {
    mask.remove();
    popup.remove();
    document.removeEventListener('keydown', escHandler);
  };
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  mask.onclick = close;
  btnClose.onclick = close;
  btnOpen.onclick = () => {
    close();
    void app.workspace.openLinkText(filePath, '', false, { active: true });
  };
  document.addEventListener('keydown', escHandler);
  document.body.appendChild(mask);
  document.body.appendChild(popup);
  popup.appendChild(head);
  popup.appendChild(body);

  try {
    await MarkdownRenderer.render(app, content, body, filePath, new Component());
  } catch {
    body.textContent = content; // 渲染失败降级纯文本
  }
}