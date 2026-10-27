/**
 * 弹窗族：添加日记、标签选择器、日期筛选（原脚本 949-1130 + 2243-2430 + 3238-3478）。
 */
import { MarkdownView as MarkdownViewFromObsidian, moment } from 'obsidian';
import { pad2 } from '../../core/utils';
import { topifyZ } from '../../core/z-order';
import { notice } from '../../core/notice';
import { confirmDiscard, openFlowDialog } from '../../core/flow-dialog';
import { emitDomainEvent, onDomainEvent } from '../../core/domain-bus';
import { getApp } from '../app';
import {
  DIARY_DIRECTORY,
  getSortedTagsForAddDialog,
  getTagEmoji,
  getParentPrimaryTag,
  isSubTag,
} from '../config';
import { parseFlexibleDateTime } from '../parser';
import { writeFile, reloadWithEncrypted } from '../store';
import { ENCRYPT_TAG, reclassifyEntry } from '../encrypt';
import { diaryDataMap, state } from '../state';
import { ESSAY_HEADING, writeDiaryEntry } from '../daily-write';
import { getJumpToEditAfterSaveSetting, getTagShowEmojiSetting, getUseFileDateTimeSetting } from './ui-settings';
import { rebuildTags, updateTitleSuffix } from './filter-shared';
import { applyFilter as applyFilterFromDialogs, insertCard, removeCard, showConfirm as showConfirmFromDialogs } from './entries';
import { createDateTimeControl, resetDateTimeControl } from './datetime-picker';
import { uiModal, bindFormSubmit } from '../../core/ui/modal';
import { uiBtn } from '../../core/ui/button';
import { motionSheetDialog } from './motion';

// ===== 类型选择按钮（类型选择器与写日记弹窗共用） =====

/**
 * 生成类型选择按钮（emoji + 标签，二级标签附父标签 emoji 角标）。
 * showEmoji=false 时纯文字（类型选择器跟随 diaryTagShowEmoji 设置；
 * 写日记弹窗保持始终显示 emoji 的既有行为，传 true）。
 */
function createTagOptionButton(tag: string, showEmoji: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'diary-tag-selector-btn';
  btn.dataset.tag = tag;
  let buttonText = showEmoji ? `${getTagEmoji(tag)} ${tag}` : `${tag}`;
  if (isSubTag(tag)) {
    const parentTag = getParentPrimaryTag(tag);
    if (parentTag && showEmoji) {
      buttonText += ` <span style="font-size: 12px;margin-left:4px;position: absolute;top: 0;right: 0;translate: 5px -5px;">${getTagEmoji(parentTag)}</span>`;
    }
  }
  btn.innerHTML = buttonText;
  btn.style.cssText = 'padding:6px 12px;border-radius:20px;background:var(--background-secondary);border:none;cursor:pointer;font-size:14px;color:var(--text-normal);position: relative;';
  return btn;
}

// ===== 日期筛选弹窗（原 949-1129） =====

export function createDatePicker() {
  const existingMask = document.getElementById('diary-date-filter-mask');
  const existingPopup = document.getElementById('diary-date-filter-popup');
  if (existingMask) existingMask.remove();
  if (existingPopup) existingPopup.remove();

  const mask = document.createElement('div');
  mask.id = 'diary-date-filter-mask';
  mask.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--background-modifier-cover);display:none;';
  mask.onclick = (e) => {
    if (e.target === mask) mask.style.display = 'none';
  };

  const popup = document.createElement('div');
  popup.id = 'diary-date-filter-popup';
  popup.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--background-primary);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:90%;max-width:480px;display:flex;flex-direction:column;overflow:hidden;';

  const header = document.createElement('div');
  header.style.cssText = 'padding:16px 20px;border-bottom:1px solid var(--background-modifier-border);display:flex;justify-content:space-between;align-items:center;';

  const headerTitle = document.createElement('h4');
  headerTitle.textContent = '按日期筛选';
  headerTitle.style.cssText = 'margin:0;font-size:16px;font-weight:600;color:var(--text-normal);';

  const resetBtn = document.createElement('button');
  resetBtn.textContent = '全部';
  resetBtn.style.cssText = 'background:var(--background-secondary);border:none;border-radius:20px;padding:4px 12px;font-size:13px;cursor:pointer;color:var(--text-normal);';
  resetBtn.onclick = () => {
    state.data.currentDateFilter = null;
    applyFilterFromDialogs();
    mask.style.display = 'none';
  };

  header.appendChild(headerTitle);
  header.appendChild(resetBtn);

  const content = document.createElement('div');
  content.id = 'date-filter-content';
  content.style.cssText = 'flex:1;overflow-y:auto;padding:20px;';

  popup.appendChild(header);
  popup.appendChild(content);
  mask.appendChild(popup);
  document.body.appendChild(mask);
}

/** 获取所有存在的年份 */
function getYears(): string[] {
  const years = new Set<string>();
  state.data.originalDiaryEntries.forEach((entry) => {
    const year = entry.date.split('-')[0];
    years.add(year);
  });
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

/** 显示日期选择器 */
export function showDatePicker() {
  const mask = document.getElementById('diary-date-filter-mask');
  const content = document.getElementById('date-filter-content');
  if (!mask || !content) return;

  const years = getYears();
  let selectedYear: string | null = years.length ? years[0] : null;
  // 当前筛选所在年份优先（DateFilter.year 恒存在）
  if (state.data.currentDateFilter?.year) {
    selectedYear = state.data.currentDateFilter.year;
  }

  renderDatePicker(content, years, selectedYear);
  topifyZ(mask); // ADR-0067：显示即发号，谁后显示谁在上（content 为 mask 子节点随动）
  mask.style.display = 'block';
}

/** 渲染日期选择器内容 */
function renderDatePicker(container: HTMLElement, years: string[], currentYear: string | null) {
  container.innerHTML = '';
  if (!years.length) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = '暂无日记数据';
    emptyMsg.style.cssText = 'text-align:center;padding:40px;color:var(--text-muted);';
    container.appendChild(emptyMsg);
    return;
  }

  const navBar = document.createElement('div');
  navBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;background:var(--background-secondary);border-radius:40px;padding:4px;';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹';
  prevBtn.style.cssText = 'width:36px;height:36px;border-radius:50%;border:none;background:var(--background-primary);cursor:pointer;font-size:20px;color:var(--text-normal);display:flex;align-items:center;justify-content:center;';
  prevBtn.onclick = () => {
    const idx = years.indexOf(currentYear!);
    if (idx < years.length - 1) {
      renderDatePicker(container, years, years[idx + 1]);
    }
  };

  const yearDisplay = document.createElement('div');
  yearDisplay.textContent = currentYear!;
  yearDisplay.style.cssText = 'font-weight:600;font-size:18px;color:var(--text-normal);padding:0 12px;cursor:pointer;';
  yearDisplay.onclick = () => {
    state.data.currentDateFilter = { year: currentYear! };
    applyFilterFromDialogs();
    document.getElementById('diary-date-filter-mask')!.style.display = 'none';
  };

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '›';
  nextBtn.style.cssText = 'width:36px;height:36px;border-radius:50%;border:none;background:var(--background-primary);cursor:pointer;font-size:20px;color:var(--text-normal);display:flex;align-items:center;justify-content:center;';
  nextBtn.onclick = () => {
    const idx = years.indexOf(currentYear!);
    if (idx > 0) {
      renderDatePicker(container, years, years[idx - 1]);
    }
  };

  navBar.appendChild(prevBtn);
  navBar.appendChild(yearDisplay);
  navBar.appendChild(nextBtn);
  container.appendChild(navBar);

  const monthStats = new Map<string, number>();
  state.data.originalDiaryEntries.forEach((entry) => {
    const [year, month] = entry.date.split('-');
    if (year === currentYear) {
      monthStats.set(month, (monthStats.get(month) || 0) + 1);
    }
  });

  const monthGrid = document.createElement('div');
  monthGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;';

  for (let i = 1; i <= 12; i++) {
    const monthStr = pad2(i);
    const count = monthStats.get(monthStr) || 0;
    const monthCard = document.createElement('div');
    monthCard.className = 'diary-date-filter-month-card';
    monthCard.style.cssText = 'background:var(--background-secondary);border-radius:12px;padding:12px 8px;text-align:center;cursor:pointer;transition:all 0.2s;border:1px solid transparent;';
    if (count === 0) {
      monthCard.style.opacity = '0.5';
      monthCard.style.cursor = 'not-allowed';
    } else {
      monthCard.onclick = () => {
        state.data.currentDateFilter = { year: currentYear!, month: monthStr };
        applyFilterFromDialogs();
        document.getElementById('diary-date-filter-mask')!.style.display = 'none';
      };
      monthCard.onmouseenter = () => {
        if (count > 0) monthCard.style.background = 'var(--background-modifier-hover)';
      };
      monthCard.onmouseleave = () => {
        monthCard.style.background = 'var(--background-secondary)';
      };
    }

    const monthName = document.createElement('div');
    monthName.textContent = `${i}月`;
    monthName.style.cssText = 'font-size:15px;font-weight:500;color:var(--text-normal);margin-bottom:4px;';

    const countSpan = document.createElement('div');
    countSpan.textContent = `${count}篇`;
    countSpan.style.cssText = 'font-size:12px;color:var(--text-muted);';

    monthCard.appendChild(monthName);
    monthCard.appendChild(countSpan);
    monthGrid.appendChild(monthCard);
  }

  container.appendChild(monthGrid);

  if (monthStats.size === 0) {
    const noDataMsg = document.createElement('div');
    noDataMsg.textContent = '该年份无日记记录';
    noDataMsg.style.cssText = 'text-align:center;padding:20px;color:var(--text-muted);margin-top:16px;';
    container.appendChild(noDataMsg);
  }
}

// ===== 标签选择器（原 2243-2430） =====

export function createTagPicker() {
  const existingPopup = document.getElementById('diary-tag-selector-popup');
  const existingMask = document.getElementById('diary-tag-selector-mask');
  if (existingPopup) existingPopup.remove();
  if (existingMask) existingMask.remove();

  const mask = document.createElement('div');
  mask.id = 'diary-tag-selector-mask';
  mask.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);display:none;';
  mask.onclick = (e) => e.target === mask && (mask.style.display = 'none');

  const popup = document.createElement('div');
  popup.id = 'diary-tag-selector-popup';
  popup.className = 'diary-tag-selector-popup';
  popup.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--background-primary);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);padding:20px;max-width:300px;width:90%;max-height:80vh;overflow-y:auto;display:none;';

  const title = document.createElement('h4');
  title.className = 'diary-tag-selector-title';
  title.textContent = '选择类型';

  // 按钮容器 - 动态生成内容，不在初始化时填充
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'diary-tag-selector-buttons';

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'diary-tag-selector-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'diary-action-btn diary-delete-btn';
  deleteBtn.textContent = '删除';
  deleteBtn.style.cssText = 'background:var(--background-modifier-error);color:var(--background-primary);margin-right:auto;';
  deleteBtn.onclick = () => {
    const entryId = popup.dataset.entryId;
    if (entryId) showConfirmFromDialogs(entryId);
  };

  const saveBtn = document.createElement('button');
  saveBtn.className = 'diary-action-btn diary-save-btn';
  saveBtn.textContent = '保存';
  saveBtn.onclick = () => {
    const selTagNames: string[] = [];
    buttonsContainer.querySelectorAll('.diary-tag-selector-btn.diary-active').forEach((btn) => {
      selTagNames.push((btn as HTMLElement).dataset.tag!);
    });
    const entryId = popup.dataset.entryId;
    if (!entryId) {
      mask.style.display = 'none';
      popup.style.display = 'none';
      return;
    }
    if (selTagNames.length === 0) {
      notice('请至少选择一个标签');
      return;
    }
    const entry = state.data.originalDiaryEntries.find((e) => e.id === entryId);
    const isEncryptedEntry = !!entry?.encrypted;
    hideTagPicker();
    void handleTagPickerSave(entryId, selTagNames, isEncryptedEntry);
  };

  actionsContainer.appendChild(deleteBtn);
  actionsContainer.appendChild(saveBtn);
  popup.appendChild(title);
  popup.appendChild(buttonsContainer);
  popup.appendChild(actionsContainer);
  mask.appendChild(popup);
  document.body.appendChild(mask);
}

/** 隐藏标签选择器弹窗 */
function hideTagPicker() {
  const mask = document.getElementById('diary-tag-selector-mask');
  const popup = document.getElementById('diary-tag-selector-popup');
  if (mask) mask.style.display = 'none';
  if (popup) popup.style.display = 'none';
}

/**
 * 标签选择器「保存」分流（ADR-0017）：
 * - 加密条目的保存 = 改分类降级（reclassifyEntry），成功后 merge 回 md 并从保险箱取出。
 * - 非加密条目走原 updateTags 写回（加密入口在抽屉「加密」动作，标签选择器不提供加密分类）。
 */
async function handleTagPickerSave(
  entryId: string,
  selTagNames: string[],
  isEncryptedEntry: boolean
) {
  const entry = state.data.originalDiaryEntries.find((e) => e.id === entryId);
  if (!entry) return;

  if (isEncryptedEntry) {
    // 加密条目：改分类 = 解密降级 + 应用新标签（Q20-a）
    const proceed =
      (await openFlowDialog({
        title: '改分类',
        message: '将解密此日记并恢复为普通条目，是否继续？',
        actions: [
          { label: '取消', value: 'cancel' },
          { label: '确定', value: 'ok', cta: true },
        ],
      })) === 'ok';
    if (!proceed) return;
    if (!entry.noteId) return;
    const success = await reclassifyEntry(entry.noteId, selTagNames);
    if (!success) {
      notice('解密改分类失败', 'error');
    } else {
      // UX-8：加密条目改分类成功提示，语义同「已解密还原」
      notice('已解密还原', 'success');
    }
    await reloadWithEncrypted();
    return;
  }

  // 普通改分类
  await updateTags(entryId, selTagNames);
}

export function showTagPicker(entryId: string) {
  const entry = state.data.originalDiaryEntries.find((e) => e.id === entryId);
  if (!entry) return;
  const mask = document.getElementById('diary-tag-selector-mask');
  const popup = document.getElementById('diary-tag-selector-popup');
  if (!mask || !popup) return;
  popup.dataset.entryId = entryId;

  const buttonsContainer = popup.querySelector('.diary-tag-selector-buttons');
  if (!buttonsContainer) return;

  // 清空并重新生成按钮
  buttonsContainer.innerHTML = '';

  // 加密分类不在类型选择器提供（加密唯一入口 = 抽屉「加密」动作，ADR-0017）；
  // 加密条目的改分类（降级）同样不含「加密」选项
  const isEncryptedEntry = !!entry.encrypted;
  const sortedTags = getSortedTagsForAddDialog();

  // 当前条目的标签集合（加密条目：除「加密」外的原始分类为已选项）
  const currentTagsSet = new Set(isEncryptedEntry ? entry.tags.filter((t) => t !== ENCRYPT_TAG) : entry.tags);

  // 生成按钮
  for (const tag of sortedTags) {
    const button = createTagOptionButton(tag, getTagShowEmojiSetting());

    if (currentTagsSet.has(tag)) {
      button.classList.add('diary-active');
      button.style.background = 'var(--interactive-accent)';
      button.style.color = 'var(--background-primary)';
    } else {
      button.style.background = 'var(--background-secondary)';
      button.style.color = 'var(--text-normal)';
    }

    button.onclick = (e) => {
      e.stopPropagation();
      button.classList.toggle('diary-active');
      if (button.classList.contains('diary-active')) {
        button.style.background = 'var(--interactive-accent)';
        button.style.color = 'var(--background-primary)';
      } else {
        button.style.background = 'var(--background-secondary)';
        button.style.color = 'var(--text-normal)';
      }
    };
    buttonsContainer.appendChild(button);
  }

  topifyZ(mask, popup); // ADR-0067：显示即发号
  mask.style.display = 'block';
  popup.style.display = 'block';
}

/** 更新条目标签（原 2372-2430） */
export async function updateTags(entryId: string, newTags: string[]) {
  const entry = state.data.originalDiaryEntries.find((e) => e.id === entryId);
  if (!entry) return;

  const oldTags = [...entry.tags];
  if (oldTags.length === newTags.length && oldTags.every((t) => newTags.includes(t))) {
    return;
  }

  const dateStr = entry.date;
  const entries = diaryDataMap?.get(dateStr) ?? null;
  // 稳定定位（P1-12）：行号优先，同 time 多条不再改错位置；旧行号失配时回退「该时间仅一条」
  const sameTime = entries?.filter((e) => e.time === entry.time) ?? [];
  const targetEntry =
    entries?.find((e) => e.time === entry.time && e.lineNumber === entry.lineNumber) ??
    (sameTime.length === 1 ? sameTime[0] : undefined);
  // P2 审查修复：定位失败（map 中无对应块，如数据未加载/被加密链路换血）时告警并中止，
  // 不再盲写旧数据——旧行为 UI 显示新标签、磁盘还是旧标签
  if (!targetEntry) {
    notice('未能在日记数据中定位该条目，标签没有修改', 'error');
    return;
  }

  entry.tags = newTags;
  // 使用 getTagEmoji 生成 emoji 序列
  entry.emoji = newTags.map((tag) => getTagEmoji(tag)).join('');
  targetEntry.tags = newTags;
  targetEntry.emoji = entry.emoji;

  await writeFile(dateStr);

  // 动作埋点：标签变更写盘成功（oldTags 已在函数开头捕获）
  emitDomainEvent('diary:tags-changed', { entryId, date: entry.date, time: entry.time, from: oldTags, to: newTags });

  // 更新卡片上的 emoji 显示
  const emojiElement = document.querySelector(`#diary-entry-${CSS.escape(entryId)} .diary-emoji`);
  if (emojiElement) {
    let displayEmojiSeq = '';
    if (state.ui.singleSelectedTagForDisplay && entry.tags.includes(state.ui.singleSelectedTagForDisplay)) {
      displayEmojiSeq = getTagEmoji(state.ui.singleSelectedTagForDisplay);
    } else {
      displayEmojiSeq = entry.tags.map((tag) => getTagEmoji(tag)).join('');
    }
    emojiElement.textContent = displayEmojiSeq;
  }

  // 如果当前有筛选，且条目不再匹配筛选条件，则移除卡片
  if (state.data.selectedTags.size > 0) {
    const stillMatches = entry.tags.some((tag) => state.data.selectedTags.has(tag));
    if (!stillMatches) {
      removeCard(entryId);
      const idx = state.data.currentFilteredEntries.findIndex((e) => e.id === entryId);
      if (idx !== -1) state.data.currentFilteredEntries.splice(idx, 1);
    } else {
      // 如果本来不在 filtered 中但现在匹配了，需要插入
      const idx = state.data.currentFilteredEntries.findIndex((e) => e.id === entryId);
      if (idx === -1) {
        state.data.currentFilteredEntries.push(entry);
        state.data.currentFilteredEntries.sort((a, b) => {
          const dateCmp = b.date.localeCompare(a.date);
          return dateCmp !== 0 ? dateCmp : b.timeValue - a.timeValue;
        });
        insertCard(entry);
        // P2 审查修复：插卡后前移显示计数——新卡片已渲染进 DOM，滚动加载下一批
        // 从其后开始，否则滚到底时尾部条目重复渲染
        state.data.currentDisplayCount += 1;
      }
    }
  }

  rebuildTags();
  updateTitleSuffix();
}

// ===== 添加日记弹窗（票 323：上游 1.33.x 纸张视觉移植 + 本地两步流程保留） =====

/**
 * 写日记弹窗（ADR-0121 修订：2026-10-27 用户解冻写界面换肤）。用户裁定的最终形态：
 * - **流程 = 本地两步制（ADR-0109）保留**：第一步「日期时间 + 类型 chips」点「添加」→
 *   第二步「正文」输入 → 「确认」→ 内容落 `addDialogSection`（写日记 `# 随笔`，
 *   每日触动点记录入口经 preset 指到 `# 当日触动点`）；
 * - **皮 = 上游 yeshimei/bz master（2a1a62b1，v1.33.x）纸张视觉**：core uiModal 壳
 *  （标题行 + 82vh 限高 + 遮罩/ESC/requestClose 全走壳）、米黄纸材料、类型 chips、
 *   吸底「取消/添加」栏、字段落纸 + 章签摆上动效（./motion）。
 * 随上游一并吸收的交互升级：chips 按使用频次前置、放弃确认（confirmDiscard 域皮）、
 * 防连点（「保存中…」禁用）、Ctrl/⌘+Enter 提交、软键盘避让 .keyboard-up。
 * 移动端软键盘问题（ADR-0109 立票动因）由「壳限高 + 表单自滚 + 吸底栏 + .keyboard-up 抬升」消化。
 * 与上游刻意保留的本地差异：落盘走 writeDiaryEntry（ADR-0114 小节写入），非上游条目模型；
 * 正文在第二步弹框输入（上游无正文框、存后跳条目文件书写——用户明确不要该流程）。
 * 冻结 id：add-diary-mask / add-diary-popup（main.ts 卸载清理表按 id 摘除，缺席即跳过）。
 */

/** 当前写日记弹窗壳（uiModal 产物，开即建关即拆） */
let addDialogUi: { close: () => void } | null = null;
/** 「确认」钮引用（保存进行中禁用 + 「保存中…」，防大文件写盘期连点重复落块） */
let addDialogSaveBtn: HTMLButtonElement | null = null;
/** 打开时刻的日期默认值（脏检测基准：当前值偏离默认 = 有输入） */
let addDialogDefaultDateTime = '';

/**
 * 本次打开弹窗的落点小节（ADR-0114）：默认 `# 随笔`；每日触动点记录入口经 preset.section
 * 指到 `# 当日触动点`（票 302 前为 `# 当日复盘`）。openAddDialog 重置、closeAddDialog 归位。
 */
let addDialogSection: string = ESSAY_HEADING;

/** 第二步正文草稿：仅「上一步」返回时保留，取消/保存后清空（ADR-0109 草稿语义） */
let addDialogDraft = '';

/** 测试钩子：清空跨步草稿与落点（跨用例隔离） */
export function __resetAddDialogDraftForTests(): void {
  addDialogDraft = '';
  addDialogSection = ESSAY_HEADING;
}

/** 兼容入口（panel init 预构建契约）：迁 uiModal 壳后弹窗改「开即建关即拆」，此处为空操作 */
export function createAddDialog(): void {}

// --- 标签使用频次（上游效率#1：chips 按使用频次前置，无历史保持原序） ---

const tagUsageCount = new Map<string, number>();
onDomainEvent<{ tags?: string[] }>('diary:entry-added', (evt) => {
  for (const t of evt?.tags ?? []) tagUsageCount.set(t, (tagUsageCount.get(t) ?? 0) + 1);
});

/** 使用频次降序稳定排序（次数相同 / 无历史保持传入原序） */
function sortTagsByUsage(tags: string[]): string[] {
  return tags
    .map((tag, idx) => ({ tag, idx, count: tagUsageCount.get(tag) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.idx - b.idx)
    .map((x) => x.tag);
}

/** 清空标签使用频次统计（测试/重置入口，上游同款） */
export function resetTagUsageStats(): void {
  tagUsageCount.clear();
}

/**
 * 写日记弹窗的类型 chip（上游 D-UI11：标签名/emoji 走 textContent + createElement 拼装，
 * 标签配置含 HTML 片段时字面显示；样式收 src/diary/styles.css，不再内联 cssText）。
 * 条目「换分类」选择器（showTagPicker）继续用下方 createTagOptionButton（跟随 diaryTagShowEmoji 设置）。
 */
function createAddTagChip(tag: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'diary-tag-selector-btn bz-diary-tag-chip';
  btn.dataset.tag = tag;
  btn.appendChild(document.createTextNode(`${getTagEmoji(tag)} ${tag}`));
  if (isSubTag(tag)) {
    const parentTag = getParentPrimaryTag(tag);
    if (parentTag) {
      const badge = document.createElement('span');
      badge.className = 'bz-diary-tag-badge';
      badge.textContent = getTagEmoji(parentTag);
      btn.appendChild(badge);
    }
  }
  return btn;
}

/** 重建类型 chips（频次前置由调用方排好传入；selected 命中即选中态） */
function renderAddTagChips(container: HTMLElement, tags: string[], selected: Set<string>): void {
  container.innerHTML = '';
  for (const tag of tags) {
    const btn = createAddTagChip(tag);
    if (selected.has(tag)) btn.classList.add('diary-active');
    btn.onclick = (e) => {
      e.preventDefault();
      btn.classList.toggle('diary-active');
    };
    container.appendChild(btn);
  }
}

/** 两步视图句柄（同挂一壳，二选一显示；第一步 DOM 常驻是保存数据源） */
function addDialogViews() {
  return {
    typeView: document.getElementById('add-diary-step-type'),
    contentView: document.getElementById('add-diary-step-content'),
    contentInput: document.getElementById('add-diary-content') as HTMLTextAreaElement | null,
  };
}

/** 显示第 1 步（类型+时间）或第 2 步（正文）；壳常显，两个视图二选一 */
function showAddStep(step: 1 | 2): void {
  const { typeView, contentView, contentInput } = addDialogViews();
  if (!typeView || !contentView) return;
  typeView.style.display = step === 1 ? '' : 'none';
  contentView.style.display = step === 2 ? '' : 'none';
  if (step === 2) {
    // 第二步意图明确（专门来写正文），移动端也自动聚焦——键盘由用户主动进入触发
    setTimeout(() => contentInput?.focus(), 100);
  }
}

/** 第一步 → 第二步（「添加」钮）：先校验至少选了一个类型（冻结文案），避免写完全文才被告知 */
export function gotoContentStep(): void {
  if (readSelectedAddTags().length === 0) {
    notice('请至少选择一个类型');
    return;
  }
  // 草稿回填：从第二步「上一步」回来再进时，正文原样还在（取消/保存后草稿为空，不回填）
  const { contentInput } = addDialogViews();
  if (contentInput && addDialogDraft) contentInput.value = addDialogDraft;
  showAddStep(2);
}

/** 第二步 → 第一步（「上一步」钮）：保留草稿（返回属流程内导航，不丢已写正文） */
export function backToTypeStep(): void {
  const { contentInput } = addDialogViews();
  addDialogDraft = contentInput ? contentInput.value : '';
  showAddStep(1);
}

/** 脏检测：已选类型 / 已写正文 / 日期偏离打开时默认值 = 有未保存输入 */
function addDialogDirty(): boolean {
  if (!document.getElementById('add-diary-popup')) return false;
  if (readSelectedAddTags().length > 0) return true;
  const contentInput = document.getElementById('add-diary-content') as HTMLTextAreaElement | null;
  if (contentInput && contentInput.value.trim() !== '') return true;
  const datetimeInput = document.getElementById('add-diary-datetime') as HTMLInputElement | null;
  return !!datetimeInput && datetimeInput.value !== addDialogDefaultDateTime;
}

/** 收壳：uiModal close 自会摘 mask、注销 ESC 层、还原焦点 */
export function closeAddDialog(): void {
  addDialogUi?.close();
  addDialogUi = null;
  addDialogSaveBtn = null;
  addDialogDraft = '';
  addDialogSection = ESSAY_HEADING;
}

/** 关闭意图分流：有输入走 confirmDiscard（放弃确认），无输入直接收（ESC/遮罩/取消共用） */
function requestCloseAddDialog(): void {
  if (addDialogDirty()) confirmDiscard(closeAddDialog, undefined, 'bz-diary-flow-dialog');
  else closeAddDialog();
}

/** 保存进行中按钮态：禁用 + 「保存中…」，写盘结束（含失败）复位 */
function setAddSavingUi(saving: boolean): void {
  const btn = addDialogSaveBtn;
  if (!btn) return;
  btn.disabled = saving;
  const label = btn.querySelector('span') ?? btn;
  label.textContent = saving ? '保存中…' : '确认';
}

/** 软键盘避让（上游 D-UI16）：输入聚焦给弹窗加 .keyboard-up 上移档，失焦回落（样式在域 styles.css） */
function wireKeyboardLift(popup: HTMLElement): void {
  popup.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) popup.classList.add('keyboard-up');
  });
  popup.addEventListener('focusout', () => popup.classList.remove('keyboard-up'));
}

/** 读取第一步选中的类型（saveNewEntry 与「添加」校验共用同一数据源） */
function readSelectedAddTags(): string[] {
  const typeContainer = document.getElementById('add-diary-type-container');
  const tags: string[] = [];
  if (!typeContainer) return tags;
  typeContainer.querySelectorAll('.diary-tag-selector-btn.diary-active').forEach((btn) => {
    const tag = (btn as HTMLElement).dataset.tag;
    if (tag) tags.push(tag);
  });
  return tags;
}

/** 预填参数（日常时间记录等入口复用写日记弹窗）：预选标签、预填正文、覆盖默认日期时间、指定落点小节 */
export interface AddDialogPreset {
  tags?: string[];
  content?: string;
  date?: string;
  time?: string;
  /** 落点小节标题（默认 `# 随笔`；每日触动点记录传 `# 当日触动点`，见 daily-write / ADR-0114） */
  section?: string;
}

/** 保存进行中标志：大文件写盘慢时双击「添加」会在同小节写重复块，进行中再点直接忽略 */
let savingNewEntry = false;

export function openAddDialog(preset?: AddDialogPreset) {
  // 重开先收旧壳（开即建关即拆，避免叠加；close 幂等）
  if (addDialogUi) closeAddDialog();
  addDialogSection = preset?.section ?? ESSAY_HEADING;

  // ---------- 第一步视图：日期时间 + 类型 chips ----------
  const typeView = document.createElement('div');
  typeView.id = 'add-diary-step-type';
  typeView.className = 'bz-diary-form';

  typeView.appendChild(createDateTimeControl());

  const typeLabel = document.createElement('label');
  typeLabel.className = 'bz-diary-field-label';
  typeLabel.textContent = '类型';

  const typeContainer = document.createElement('div');
  typeContainer.id = 'add-diary-type-container';
  typeContainer.className = 'diary-tag-selector-buttons bz-diary-chip-scroll';

  typeView.appendChild(typeLabel);
  typeView.appendChild(typeContainer);

  const typeFoot = document.createElement('div');
  typeFoot.className = 'bz-diary-add-foot';
  const cancelBtn = uiBtn({ label: '取消', onClick: requestCloseAddDialog });
  // 「添加」= 进入下一步写正文（用户点名的流程口径；上游同名词汇）
  const nextBtn = uiBtn({ label: '添加', tone: 'primary', onClick: () => gotoContentStep() });
  nextBtn.id = 'add-diary-next';
  typeFoot.appendChild(cancelBtn);
  typeFoot.appendChild(nextBtn);
  typeView.appendChild(typeFoot);

  // ---------- 第二步视图：正文 ----------
  const contentView = document.createElement('div');
  contentView.id = 'add-diary-step-content';
  contentView.className = 'bz-diary-form';
  contentView.style.display = 'none';

  const contentLabel = document.createElement('label');
  contentLabel.className = 'bz-diary-field-label';
  contentLabel.textContent = '内容';

  // 正文输入框：弹窗内直写正文，保存即落盘（留空则只写一行时间标题，并按设置打开当天日记）
  const contentInput = document.createElement('textarea');
  contentInput.id = 'add-diary-content';
  contentInput.className = 'bz-diary-add-content';
  contentInput.placeholder = '写点什么…（留空则保存后打开当天日记）';
  contentInput.rows = 4;

  const contentFoot = document.createElement('div');
  contentFoot.className = 'bz-diary-add-foot';
  const backBtn = uiBtn({ label: '上一步', onClick: () => backToTypeStep() });
  backBtn.id = 'add-diary-back';
  const saveBtn = uiBtn({ label: '确认', tone: 'primary', onClick: () => void saveNewEntry() });
  saveBtn.id = 'add-diary-save';
  addDialogSaveBtn = saveBtn;
  contentFoot.appendChild(backBtn);
  contentFoot.appendChild(saveBtn);

  contentView.appendChild(contentLabel);
  contentView.appendChild(contentInput);
  contentView.appendChild(contentFoot);

  const content = document.createElement('div');
  content.appendChild(typeView);
  content.appendChild(contentView);

  const { mask, popup, close } = uiModal({
    content,
    maxWidth: 400,
    head: true,
    title: '写日记',
    className: 'bz-diary-add-popup',
    requestClose: requestCloseAddDialog, // ESC/遮罩关闭统一走脏拦截分流
  });
  // 遗留 id 保留在壳上：main.ts 卸载兜底按 id 摘除（D15）；类名走 bz- 域皮
  mask.id = 'add-diary-mask';
  popup.id = 'add-diary-popup';
  addDialogUi = { close };
  bindFormSubmit(popup, () => void saveNewEntry()); // 效率#2：Ctrl/⌘+Enter 提交
  wireKeyboardLift(popup);

  // 1. 刷新类型 chips（频次前置；preset 命中即选中态，如触动点入口预选「触动点」）
  const presetTags = new Set(preset?.tags ?? []);
  renderAddTagChips(typeContainer, sortTagsByUsage(getSortedTagsForAddDialog()), presetTags);
  motionSheetDialog(popup);

  // 2. 设置日期时间默认值（本地口径：preset 覆盖 > useFileDateTime 当前日记文件日期 > 现在）
  let defaultDateStr = moment().format('YYYY-MM-DD');
  let defaultTimeStr = moment().format('HH:mm');

  if (preset?.date && /^\d{4}-\d{2}-\d{2}$/.test(preset.date)) {
    defaultDateStr = preset.date;
    if (preset?.time && /^\d{2}:\d{2}$/.test(preset.time)) defaultTimeStr = preset.time;
  } else if (getUseFileDateTimeSetting()) {
    const activeView = getApp().workspace.getActiveViewOfType(MarkdownViewFromObsidian) as any;
    if (activeView && activeView.file) {
      const file = activeView.file;
      if (file.path.startsWith(DIARY_DIRECTORY)) {
        const fileName = file.basename;
        if (/^\d{4}-\d{2}-\d{2}$/.test(fileName)) {
          defaultDateStr = fileName;
        }
      }
    }
  }
  // 否则保持当前时间

  const defaultDateTime = `${defaultDateStr} ${defaultTimeStr}`;
  // P1 审查修复：打开时同步重置控件内部 currentMoment（显示与滚轮起点一致）。
  // 旧路径只改 hiddenInput 显示值——控件内部时刻停在创建那天，隔天打开直接点
  // 「确定」会把日记写回旧时刻
  resetDateTimeControl(moment(defaultDateTime, 'YYYY-MM-DD HH:mm', true));
  const datetimeInput = document.getElementById('add-diary-datetime') as HTMLInputElement | null;
  if (datetimeInput) {
    datetimeInput.value = defaultDateTime;
  }
  addDialogDefaultDateTime = defaultDateTime;

  // 正文每次打开清空（上一条的正文不应带进下一条）；preset 有预填正文时例外
  contentInput.value = preset?.content ?? '';

  // 两步（ADR-0109）：preset 已带分类（如每日触动点记录预选「触动点」）→ 直接进正文步；
  // 否则从类型页起步。第一步的 datetime / 类型容器始终保留在 DOM 里，是保存时的数据源。
  showAddStep(readSelectedAddTags().length > 0 ? 2 : 1);
}

/**
 * 保存：把弹窗正文按本次落点写进日记小节，不建条目。
 * - 落点 = `addDialogSection`（写日记 `# 随笔` / 每日触动点记录 `# 当日触动点`），块形态与建节规则见 daily-write；
 * - 通知文案随落点走（命中小节 / 现场新建 / 追加文末）由 daily-write 统一给出，这里不再自己拼；
 * - 面板列表不插卡：新内容不是条目，标签筛选 / 日期筛选 / 索引 / 回忆墙 / 智能猫都看不到它（用户裁定）；
 * - 「保存后进入编辑」降级为**打开该日期日记文件**（设置项名与开关保留，块模型下无条目可跳）；
 *   弹窗里已写正文时不打开——沿用旧行为「写完不打扰」。
 */
export async function saveNewEntry() {
  if (savingNewEntry) return; // 防连点：上一笔仍在写盘
  const datetimeInput = document.getElementById('add-diary-datetime') as HTMLInputElement | null;
  const typeContainer = document.getElementById('add-diary-type-container');
  if (!datetimeInput || !typeContainer || !document.getElementById('add-diary-popup')) return;

  const userInput = datetimeInput.value.trim();
  const selTagNames = readSelectedAddTags();
  if (selTagNames.length === 0) {
    notice('请至少选择一个类型');
    return;
  }

  let targetMoment = parseFlexibleDateTime(userInput);
  if (!targetMoment || !targetMoment.isValid()) {
    notice('日期时间格式不正确');
    return;
  }

  const dateStr = targetMoment.format('YYYY-MM-DD');
  const timeStr = targetMoment.format('HH:mm');

  // 弹窗正文：非空即随块直接落盘（校验失败在下方 catch 兜底）
  const contentInput = document.getElementById('add-diary-content') as HTMLTextAreaElement | null;
  const content = contentInput ? contentInput.value.trim() : '';

  savingNewEntry = true;
  setAddSavingUi(true);
  try {
    const res = await writeDiaryEntry(dateStr, addDialogSection, selTagNames, timeStr, content);
    // 动作埋点：新增保存成功（载荷形状不变：date/time/tags/content）
    emitDomainEvent('diary:entry-added', { date: dateStr, time: timeStr, tags: selTagNames, content });
    closeAddDialog();

    // 保存后立即进入编辑（设置项 diaryJumpToEditAfterSave，关=仅关闭弹窗）
    if (getJumpToEditAfterSaveSetting() && !content) void openDiaryFile(res.path);
  } catch (error: any) {
    console.error('保存日记失败:', error);
    notice('保存日记失败：' + error.message, 'error');
  } finally {
    savingNewEntry = false;
    setAddSavingUi(false); // 失败路径恢复按钮态（成功路径按钮已随壳摘除，复位为空操作）
  }
}

/** 打开日记文件（「保存后进入编辑」的落点；块模型下没有条目可跳，改为打开当天文件） */
async function openDiaryFile(path: string): Promise<void> {
  const app = getApp();
  const file = app?.vault?.getAbstractFileByPath?.(path) ?? null;
  if (!file) return;
  await app.workspace?.getLeaf?.()?.openFile?.(file as any);
}

