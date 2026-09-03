/**
 * 复习设置弹窗写回测试（ticket 168 切片 02）：面板删除后 ⚙️ 收敛到篇数弹窗
 * （showCountReviewModal 的 .review-count-settings），设置弹窗经其打开；
 * 六组声明式 schema 逐项触发写回 + 空候选时入口仍可达。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks } from '../mock-obsidian-entry';
import { setApp } from '../../src/core/app';
import { setSettingsProvider } from '../../src/core/settings-provider';
import { closeSettingsModal } from '../../src/core/settings-modal';
import { ReviewDataManager } from '../../src/review/data';
import { UIManager } from '../../src/review/ui';

function makeApp(vault: MockVault) {
  return mockAppWithVault(vault);
}

describe('设置弹窗（ticket 168：经篇数弹窗 ⚙️ 打开）onChange 写回', () => {
  let vault: MockVault;

  beforeEach(() => {
    resetObsidianMocks();
    document.body.innerHTML = '';
    setApp(null as any);
    vault = new MockVault();
    vault.files.set('A.md', '正文'); // 库根文件：候选为空态弹窗仍打开（设置入口常驻）
    setApp(makeApp(vault));
  });

  afterEach(() => {
    closeSettingsModal();
    document.body.innerHTML = '';
  });

  /** 打开篇数弹窗并点 ⚙️ 进设置（面板已删除，此为唯一设置入口）；弹窗异步构建，先等一帧 */
  async function openSettings(settings: any = {}): Promise<void> {
    setSettingsProvider(() => settings);
    const ui = new UIManager(makeApp(vault), new ReviewDataManager(makeApp(vault)));
    ui.showCountReviewModal();
    await new Promise((r) => setTimeout(r, 30));
    (document.querySelector('.review-count-settings') as HTMLElement).click();
  }

  /** 取指定名设置项的首个控件 */
  function controlOf(name: string): any {
    const el = [...document.querySelectorAll('#bz-settings-modal-popup .setting-item')].find(
      (e) => (e as HTMLElement).dataset.name === name
    ) as any;
    expect(el, `设置项 ${name} 应存在`).toBeTruthy();
    return el.__setting.controls[0];
  }

  it('标题「复习设置」+ 六组齐全；检查提醒组：到期提醒 / 新笔记加入提醒写回设置', async () => {
    const settings: any = { enableAutoNotify: true, reviewAutoAddNotice: true };
    await openSettings(settings);
    const popup = document.getElementById('bz-settings-modal-popup')!;
    expect(popup.querySelector('.bz-settings-title')!.textContent).toBe('复习设置'); // ticket 168：标题去「计划」
    const groupNames = [...popup.querySelectorAll('.bz-settings-group-name')].map((e) => e.textContent);
    for (const g of ['检查提醒', '做题家', '复习节奏', '按数量复习', '自动化', '界面']) expect(groupNames).toContain(g);
    controlOf('到期提醒').trigger(false);
    controlOf('新笔记加入提醒').trigger(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(settings.enableAutoNotify).toBe(false);
    expect(settings.reviewAutoAddNotice).toBe(false);
  });

  it('做题家组：多选/题量/打乱/难度写回；出题子容器随开关显隐', async () => {
    const settings: any = { forceQuizForReview: true };
    await openSettings(settings);
    controlOf('允许多选题').trigger(true);
    controlOf('每篇笔记出题数量').trigger('3');
    controlOf('打乱出题顺序').trigger(true);
    controlOf('出题难度').trigger('hard');
    await new Promise((r) => setTimeout(r, 10));
    expect(settings.enableMultipleChoice).toBe(true);
    expect(settings.questionsPerNote).toBe('3');
    expect(settings.shuffleQuestions).toBe(true);
    expect(settings.difficulty).toBe('hard');
  });

  it('复习节奏组：每日上限非法归 0；缩放超界回 1', async () => {
    const settings: any = {};
    await openSettings(settings);
    controlOf('每日复习上限').trigger('5');
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewDailyLimit).toBe(5);
    controlOf('每日复习上限').trigger('-3'); // 非正数 → 0
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewDailyLimit).toBe(0);

    controlOf('复习间隔缩放').trigger('2');
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewIntervalScale).toBe(2);
    controlOf('复习间隔缩放').trigger('9'); // >5 → 回 1
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewIntervalScale).toBe(1);
    controlOf('复习间隔缩放').trigger('0'); // <=0 → 回 1
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewIntervalScale).toBe(1);
  });

  it('按数量复习组：候选文件夹按钮打开选择弹窗；默认篇数/历史配比写回并校验边界', async () => {
    const settings: any = { reviewCountFolder: '卡片盒/笔记盒', reviewCountDefault: 5, reviewCountHistoryRatio: 70 };
    await openSettings(settings);
    const popup = document.getElementById('bz-settings-modal-popup')!;
    const names = () => [...popup.querySelectorAll('.setting-item')].map((el) => (el as HTMLElement).dataset.name);
    expect(names()).toContain('候选文件夹');
    expect(names()).toContain('默认篇数');
    expect(names()).toContain('历史配比');
    // 候选文件夹 chips 展示已选值；清空后「选择…」按钮现身并打开路径选择弹窗（ticket 133 行形态）
    const folderRow = [...popup.querySelectorAll('.setting-item')].find((el) => (el as HTMLElement).dataset.name === '候选文件夹') as HTMLElement;
    expect(folderRow).toBeTruthy();
    const chips = folderRow.querySelector('.bz-path-picker-chips')!;
    expect(chips.textContent).toContain('卡片盒/笔记盒');
    // 清空当前值 → 选择按钮登场（有值态按钮移出 DOM，data-filled 双保险）
    (chips.querySelector('.bz-path-picker-chip-x') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 5));
    const pickerBtn = folderRow.querySelector('button.bz-path-picker-btn--slim') as HTMLElement;
    expect(pickerBtn).toBeTruthy();
    expect(pickerBtn.textContent).toContain('选择');
    pickerBtn.click();
    expect(document.getElementById('bz-path-picker-mask')).not.toBeNull();
    expect(document.querySelector('.bz-path-picker-title')!.textContent).toBe('选择按数量复习候选文件夹');
    // 默认篇数：合法写回；非正数回 5
    controlOf('默认篇数').trigger('10');
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewCountDefault).toBe(10);
    controlOf('默认篇数').trigger('-3');
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewCountDefault).toBe(5);
    // 历史配比：合法写回；越界回 70
    controlOf('历史配比').trigger('50');
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewCountHistoryRatio).toBe(50);
    controlOf('历史配比').trigger('101');
    await new Promise((r) => setTimeout(r, 5));
    expect(settings.reviewCountHistoryRatio).toBe(70);
  });

  it('界面组：文件树标记写回（ticket 168 切片 04：复习移动端全屏行已随面板删除）', async () => {
    const settings: any = { reviewTreeBadge: true };
    await openSettings(settings);
    controlOf('文件树标记').trigger(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(settings.reviewTreeBadge).toBe(false);
  });
});