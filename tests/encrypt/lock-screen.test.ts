/**
 * 保险库共享解锁屏（ADR-0124 本地单档实例）：
 * - 默认 showPasswordDialog() → .bz-lockscreen--vault（统计卡 3 张 + 首设双输入 + 风险勾选）
 * - showPasswordDialog('legacy') → 旧主密码弹窗结构原样（日记 / 回忆墙复用路径，ADR-0121 冻结）
 * - 首设至少 4 位（与密码本同规则）
 * - 冷启动回落 CONFIG/STORAGE/lock-stats.json 上次快照（core/lock-stats）
 * - 解锁态 renderAll 快照落盘（captureLockStats：日记条目与密码本整表不计入）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { SafeManager } from '../../src/encrypt/data';
import { UIManager } from '../../src/encrypt/ui';
import { writeLockStats } from '../../src/core/lock-stats';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks, hasNotice } from '../mock-obsidian-entry';

const CONFIG = { root: 'CONFIG/.ENCRYPT', previewEnabled: false, previewSize: 384, previewQuality: 0.5, autoLoadOriginal: false, securityMode: false };

/** 轮询等待（真实 PBKDF2 长异步） */
async function waitFor(cond: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('waitFor 超时');
    await new Promise((r) => setTimeout(r, 25));
  }
}

function findLock(): HTMLElement | null {
  return ([...document.querySelectorAll('div')].find(
    (d) => d.classList.contains('bz-lockscreen--vault') && d.style.display === 'flex'
  ) || null) as HTMLElement | null;
}

function findLegacy(): HTMLElement | null {
  return ([...document.querySelectorAll('div')].find(
    (d) => d.classList.contains('bz-encrypt-dialog-mask') && d.style.display === 'flex'
  ) || null) as HTMLElement | null;
}

describe('保险库共享解锁屏（ADR-0124 本地实例）', () => {
  let vault: MockVault;
  let dm: SafeManager;
  let ui: UIManager;

  beforeEach(() => {
    vault = new MockVault();
    setApp(mockAppWithVault(vault) as any);
    setSettingsProvider(() => CONFIG as any);
    resetObsidianMocks();
    document.body.innerHTML = '';
    dm = new SafeManager('CONFIG/.ENCRYPT');
    ui = new UIManager(dm, CONFIG);
    ui.ensureElements();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('默认走共享解锁屏：标题/统计卡×3/首设双输入/风险勾选，点遮罩取消', async () => {
    const p = ui.showPasswordDialog();
    await waitFor(() => !!findLock());
    const ls = findLock()!;
    expect(ls.className).toContain('bz-lockscreen--vault');
    expect(ls.querySelector('.bz-lockscreen-title')!.textContent).toBe('设置主密码'); // 空库 → 首设
    expect(ls.querySelectorAll('.bz-lockscreen-stat').length).toBe(3);
    expect((ls.querySelectorAll('input[type="password"]')[1] as HTMLInputElement).style.display).toBe(''); // 首设双输入可见
    expect(ls.querySelector('.bz-lockscreen-ack')).toBeTruthy();
    // 点遮罩 = 取消
    ls.dispatchEvent(new MouseEvent('click', { bubbles: false }));
    await expect(p).resolves.toBe(false);
  });

  it("showPasswordDialog('legacy') 弹旧主密码弹窗：结构原样（日记/回忆墙复用路径冻结）", async () => {
    const p = ui.showPasswordDialog('legacy');
    await waitFor(() => !!findLegacy());
    const dialog = findLegacy()!;
    expect(dialog.querySelector('.bz-encrypt-dialog-ack')).toBeTruthy(); // 首设硬警告勾选
    const cancel = [...dialog.querySelectorAll('button')].find((b) => b.textContent === '取消')!;
    cancel.click();
    await expect(p).resolves.toBe(false);
  });

  it('首设主密码至少 4 位（与密码本同规则）', async () => {
    const p = ui.showPasswordDialog();
    await waitFor(() => !!findLock());
    const ls = findLock()!;
    const inputs = ls.querySelectorAll('input[type="password"]');
    (inputs[0] as HTMLInputElement).value = 'ab';
    (inputs[1] as HTMLInputElement).value = 'ab';
    (ls.querySelector('.bz-lockscreen-ack input') as HTMLInputElement).click();
    (ls.querySelector('.bz-lockscreen-action') as HTMLButtonElement).click();
    await waitFor(() => hasNotice('主密码至少 4 位'));
    expect(dm.unlocked).toBe(false);
    ls.dispatchEvent(new MouseEvent('click', { bubbles: false }));
    await expect(p).resolves.toBe(false);
  });

  it('冷启动回落 lock-stats.json 上次快照（无快照才显示「—」）', async () => {
    await writeLockStats('vault', [
      { num: '9', label: '笔记条目' },
      { num: '2', label: '随库附件' },
      { num: '3.0 KB', label: '附件密文' },
    ]);
    const p = ui.showPasswordDialog();
    await waitFor(() => !!findLock());
    const stats = findLock()!.querySelector('.bz-lockscreen-stats')!.textContent || '';
    expect(stats).toContain('9');
    expect(stats).toContain('随库附件');
    findLock()!.dispatchEvent(new MouseEvent('click', { bubbles: false }));
    await expect(p).resolves.toBe(false);
  });

  it('解锁态 renderAll 快照落盘：普通笔记计数，diary-entry 不计入', async () => {
    await dm.unlock('master123');
    await dm.lockNote({ path: '我的/n1.md', title: 'n1', content: '# n1', attachments: [] });
    await dm.lockNote({ path: '我的/d1.md', title: 'd1', content: '# d1', attachments: [], kind: 'diary-entry' });
    ui.show(); // renderAll → captureLockStats → writeLockStats（fire-and-forget）
    await waitFor(() => vault.files.has('CONFIG/STORAGE/lock-stats.json'));
    const parsed = JSON.parse(vault.files.get('CONFIG/STORAGE/lock-stats.json') || '{}');
    expect(parsed.vault[0].num).toBe('1');
    expect(parsed.vault[0].label).toBe('笔记条目');
  });
});
