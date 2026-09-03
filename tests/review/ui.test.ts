/**
 * 复习残留 UI 测试（ticket 168 切片 02）：面板删除后 UIManager 仅剩篇数弹窗。
 * 覆盖：构造无常驻 DOM、弹窗默认/上限/钳制、Enter 提交 / Escape 关闭、空候选空态（⚙️ 仍可达）、destroy 幂等。
 * 会话流程与设置写回分别在 count-review / ui-cov 覆盖。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { closeSettingsModal } from '../../src/core/settings-modal';
import { ReviewDataManager } from '../../src/review/data';
import { UIManager } from '../../src/review/ui';
import { reviewApp } from '../../src/review/app';

function makeApp(vault: MockVault) {
  return mockAppWithVault(vault);
}

describe('UIManager（ticket 168：面板删除后的残留面）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    document.body.innerHTML = '';
    setApp(null as any);
    setSettingsProvider(() => ({ reviewCountFolder: '卡片盒/笔记盒', reviewCountDefault: 5 }) as any);
    (reviewApp as any).dataManager = null;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeSettingsModal();
    document.body.innerHTML = '';
  });

  it('构造不再建常驻面板 DOM；destroy 幂等', () => {
    const vault = new MockVault();
    const app = makeApp(vault);
    setApp(app);
    const ui = new UIManager(app, new ReviewDataManager(app));
    expect(document.getElementById('review-popup')).toBeNull();
    expect(document.getElementById('review-mask')).toBeNull();
    expect(document.getElementById('review-entries-container')).toBeNull();
    ui.destroy();
    ui.destroy(); // 幂等
  });

  it('有候选：弹窗默认/上限/钳制正确；Enter 提交 startCountSession；Escape 关闭不启动', async () => {
    const vault = new MockVault();
    vault.files.set('卡片盒/笔记盒/A.md', '正文');
    vault.files.set('卡片盒/笔记盒/B.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const ui = new UIManager(app, new ReviewDataManager(app));
    const startSpy = vi.spyOn(reviewApp, 'startCountSession').mockResolvedValue(undefined);
    ui.showCountReviewModal();
    await new Promise((r) => setTimeout(r, 50));
    const input = document.querySelector('.review-count-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.max).toBe('2'); // 可用 2 篇
    expect(input.value).toBe('2'); // 默认 5 → 钳制到可用 2
    // Enter 提交
    input.value = '1';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(startSpy).toHaveBeenCalledWith(1);
    expect(document.querySelector('.review-count-input')).toBeNull(); // 弹窗已关
    // Escape 关闭不启动（重开弹窗后重新取 input，旧元素已被移除）
    startSpy.mockClear();
    ui.showCountReviewModal();
    await new Promise((r) => setTimeout(r, 20));
    (document.querySelector('.review-count-input') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(startSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.review-count-input')).toBeNull();
    ui.destroy();
  });

  it('空候选：弹窗打开显示空态（无输入/无开始按钮），⚙️ 仍可打开「复习设置」', async () => {
    const vault = new MockVault();
    vault.files.set('别处.md', '正文');
    const app = makeApp(vault);
    setApp(app);
    const ui = new UIManager(app, new ReviewDataManager(app));
    ui.showCountReviewModal();
    await new Promise((r) => setTimeout(r, 20));
    expect((document.querySelector('.review-count-empty') as HTMLElement).textContent).toContain('该文件夹下没有可复习的笔记');
    expect(document.querySelector('.review-count-ok')).toBeNull();
    (document.querySelector('.review-count-settings') as HTMLElement).click();
    const popup = document.getElementById('bz-settings-modal-popup')!;
    expect(popup.querySelector('.bz-settings-title')!.textContent).toBe('复习设置');
    expect(popup.textContent).toContain('按数量复习'); // 声明式七组渲染有果（切片 05 起含复习条目管理）
    ui.destroy();
  });
});