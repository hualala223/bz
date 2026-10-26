/**
 * 批量移出复习计划弹窗测试（票 320）：
 * 空计划不弹窗 / 默认全不选 + 挂起标灰 / 全选联动 indeterminate / 计数与 0 禁用 /
 * 执行 = removeItems 单次落盘 + 监听目录内写排除名单 / 撤销原序插回 + 仅解除本次新增排除 /
 * 预先存在的排除记录不重复写、撤销不解除。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { ReviewDataManager, REVIEW_FILE_PATH } from '../../src/review/data';
import { openReviewBatchRemove } from '../../src/review/batch-ui';

function makeApp(vault: MockVault) {
  return mockAppWithVault(vault);
}

function row(id: string, filePath: string, extra: any = {}) {
  return {
    id, filePath, reviewStart: new Date().toISOString(), stage: 2, phase: 'ladder', stability: 1,
    difficulty: 0.3, reviewHistory: [], totalReviews: 0, averageConfidence: 0,
    nextReviewDate: new Date(Date.now() + 86400000).toISOString(),
    lastReviewed: null, lastDifficulty: null, completed: false, ...extra,
  };
}

function noticeMsgs(): string {
  return [...document.querySelectorAll('.bz-notice-msg')].map((e) => e.textContent).join('|');
}

describe('批量移出复习计划弹窗（票 320）', () => {
  let vault: MockVault;

  beforeEach(() => {
    resetObsidianMocks();
    document.body.innerHTML = '';
    vault = new MockVault();
    setApp(makeApp(vault)); // storage 层走模块级 app（jsonFileStore resolveApp）
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function open(settings: any): Promise<void> {
    setSettingsProvider(() => settings);
    await openReviewBatchRemove(makeApp(vault), new ReviewDataManager(makeApp(vault)));
  }

  it('空计划：提示且不弹窗（命令冷开路径）', async () => {
    await open({});
    expect(document.querySelector('.bz-review-batch-pop')).toBeNull();
    expect(noticeMsgs()).toContain('复习计划暂无条目');
  });

  it('渲染：默认全不选、挂起标灰；全选联动 indeterminate；计数实时、0 禁用', async () => {
    vault.files.set('A.md', '正文');
    vault.files.set('B.md', '正文');
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([row('1', 'A.md'), row('2', 'B.md'), row('3', 'GONE.md')]));
    await open({});
    const pop = document.querySelector('.bz-review-batch-pop') as HTMLElement;
    expect(pop).not.toBeNull();
    expect(pop.querySelector('.bz-dialog-title')!.textContent).toBe('批量移出复习计划');
    expect(pop.textContent).toContain('计划内共 3 条（含挂起 1 条）');
    const rows = [...pop.querySelectorAll<HTMLElement>('.bz-review-batch-row')];
    expect(rows).toHaveLength(3);
    expect(rows[2].classList.contains('is-missing')).toBe(true); // 挂起参与勾选、标灰
    expect(rows[2].textContent).toContain('挂起');
    const boxes = [...pop.querySelectorAll<HTMLInputElement>('.bz-review-batch-check')];
    expect(boxes.every((b) => !b.checked)).toBe(true); // 默认全不选（encrypt 危险批量先例）
    const all = pop.querySelector<HTMLInputElement>('.bz-review-batch-all')!;
    const ok = document.getElementById('bz-review-batch-ok') as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    expect(ok.textContent).toContain('移出 0 条');
    // 勾一个 → 半选态 + 计数
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new Event('change'));
    expect(ok.disabled).toBe(false);
    expect(ok.textContent).toContain('移出 1 条');
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(true);
    // 全选 → 全勾、半选态解除
    all.checked = true;
    all.dispatchEvent(new Event('change'));
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
    expect(ok.textContent).toContain('移出 3 条');
  });

  it('执行：勾选项单次落盘移除；监听目录内（含挂起）落排除名单；撤销原样插回且仅解除本次新增排除', async () => {
    vault.files.set('A.md', '正文');
    vault.files.set('B.md', '正文');
    const settings: any = { reviewWatchedFolders: ['我的/复习'], reviewExcludedNotes: [] };
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([
      row('1', '我的/复习/A.md', { stage: 7 }), // 监听目录内
      row('2', 'B.md'), // 目录外
      row('3', '我的/复习/GONE.md'), // 监听目录内挂起
    ]));
    await open(settings);
    const boxes = [...document.querySelectorAll<HTMLInputElement>('.bz-review-batch-check')];
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new Event('change'));
    boxes[2].checked = true;
    boxes[2].dispatchEvent(new Event('change'));
    (document.getElementById('bz-review-batch-ok') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    const dm = new ReviewDataManager(makeApp(vault));
    expect((await dm.loadItems()).map((i) => i.filePath)).toEqual(['B.md']); // A + GONE 移除，B 不动
    expect(settings.reviewExcludedNotes).toEqual(['我的/复习/A.md', '我的/复习/GONE.md']); // 仅监听目录内落名单
    expect(noticeMsgs()).toContain('已移出 2 条复习记录');
    // 撤销：原序插回（阶段保留）+ 排除名单清空
    (document.querySelector('.bz-notice-action') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    const back = await dm.loadItems();
    expect(back.map((i) => i.filePath)).toEqual(['B.md', '我的/复习/A.md', '我的/复习/GONE.md']);
    expect(back.find((i) => i.filePath === '我的/复习/A.md')!.stage).toBe(7);
    expect(settings.reviewExcludedNotes).toEqual([]);
  });

  it('预先已在排除名单的条目：移出不重复写，撤销不解除（只有本次新增才解除）', async () => {
    vault.files.set('A.md', '正文');
    const settings: any = { reviewWatchedFolders: ['我的/复习'], reviewExcludedNotes: ['我的/复习/A.md'] };
    vault.files.set(REVIEW_FILE_PATH, JSON.stringify([row('1', '我的/复习/A.md')]));
    await open(settings);
    const box = document.querySelector<HTMLInputElement>('.bz-review-batch-check')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    (document.getElementById('bz-review-batch-ok') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(settings.reviewExcludedNotes).toEqual(['我的/复习/A.md']); // 不重复写
    (document.querySelector('.bz-notice-action') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect((await new ReviewDataManager(makeApp(vault)).loadItems()).length).toBe(1); // 已插回
    expect(settings.reviewExcludedNotes).toEqual(['我的/复习/A.md']); // 预先存在的排除保留
  });
});
