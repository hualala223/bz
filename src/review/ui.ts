/**
 * 复习设置 + 按数量复习篇数弹窗（ticket 168 单一入口重构，切片 02/05）：
 * 复习计划主面板及全部交互（列表/卡片/统一抽屉/难度弹窗/归档/搜索/键盘路径）随命令退役整体删除；
 * 保留面 = 命令「复习（按数量）」的篇数弹窗 + ⚙️ 域设置弹窗入口（空候选时弹窗仍打开，设置可达）；
 * 切片 05：设置弹窗新增「复习条目管理」组——面板删除后清理 review.json 条目的唯一入口。
 * 对外导出：reviewSettingsSchema（⚙️ 设置弹窗唯一内容入口）/ UIManager（showCountReviewModal/destroy）。
 */
import { Setting, type App } from 'obsidian';
import { notice, notifyUndo, notifySaveError } from '../core/notice';
import { openFlowDialog } from '../core/flow-dialog';
import { getSettings, saveSettings } from '../core/settings-provider';
import { openSettingsModal } from '../core/settings-modal';
import type { SettingsSchema } from '../core/settings-schema';
import { ReviewDataManager } from './data';

/**
 * 复习设置 schema（ticket 131 声明式；ADR-0064）：检查提醒/做题家/复习节奏/按数量复习/自动化/界面 +
 * 移动端六组卡片。做题家子项显隐收敛为 visibleWhen 声明式联动；监听文件夹走通用 path 行
 * （multi chips + 添加… 按钮，落盘外部 binding 自管：新增先确认存量收编、移除连带清理排除记录）；
 * 排除名单 chips 区走 custom 插槽（DOM id/类名零变化）。置于模块顶层供文案 lint 直接引用；
 * deps 仅在交互回调（custom/path onChange）经闭包引用，工厂构建无副作用。
 * ticket 168 切片 02：面板删除后 schema 是 ⚙️ 设置弹窗的唯一内容入口。
 */
export function reviewSettingsSchema(deps: { app: App; dataManager: ReviewDataManager }): SettingsSchema {
  // 排除名单 custom 行的 chips 重渲染句柄（原 renderExcludeRows；交互后调用）
  let renderExcludeRows: (() => void) | null = null;
  // enableAutoNotify 常驻轮询在 main.ts onload 注册、运行时按设置实时读值（app.ts checkOverdueAndNotify
  // 门控），设置弹窗 toggle 只需落盘，渲染器键直绑自动完成，无需额外副作用回调。
  return {
    groups: [
      {
        icon: 'bell',
        name: '检查提醒',
        rows: [
          { type: 'toggle', name: '到期提醒', desc: '有笔记到期待复习时自动弹出提醒', binding: { key: 'enableAutoNotify' } },
          { type: 'toggle', name: '新笔记加入提醒', desc: '新笔记被自动加入时弹出提示，多条合并成一条', binding: { key: 'reviewAutoAddNotice' } },
        ],
      },
      {
        icon: 'graduation-cap',
        name: '做题家',
        rows: [
          // ticket 168（切片 04）：复习全面做题化——「用做题测难度」开关退役（键 forceQuizForReview 移除），出题子项常显
          { type: 'toggle', name: '允许多选题', desc: '开启后 AI 可能出多选题，关闭则只出单选题', binding: { key: 'enableMultipleChoice' } },
          { type: 'text', name: '每篇笔记出题数量', desc: '固定每篇笔记出题的数量，留空/0=自动', binding: { key: 'questionsPerNote' } },
          { type: 'toggle', name: '打乱出题顺序', desc: '做题时随机排列题目顺序', binding: { key: 'shuffleQuestions' } },
          {
            type: 'select',
            name: '出题难度',
            desc: '控制 AI 出题深浅',
            binding: { key: 'difficulty' },
            options: [
              { value: 'random', label: '随机' },
              { value: 'easy', label: '简单' },
              { value: 'medium', label: '中等' },
              { value: 'hard', label: '困难' },
            ],
          },
        ],
      },
      {
        icon: 'timer',
        name: '复习节奏',
        rows: [
          // 非正数钳制为 0（原 onChange 口径：>0 保留否则 0）；空串不写（防脏值落盘）
          { type: 'number', name: '每日复习上限', desc: '一轮最多复习的篇数，不填则不限制', binding: { key: 'reviewDailyLimit' }, min: 0 },
          // 原钳制「n>0 且 n<=5 保留、否则回 1」：渲染器 min/max 只做边界钳制，超上界回 1 语义在 onChange 复刻
          {
            type: 'number',
            name: '复习间隔缩放',
            desc: '数值越小复习越频繁，数值越大越宽松',
            binding: { key: 'reviewIntervalScale' },
            onChange: (v) => {
              if (!(v > 0 && v <= 5)) (getSettings() as any).reviewIntervalScale = 1;
            },
          },
        ],
      },
      // 按数量复习（ticket 06 本地分支移植：候选文件夹/默认篇数/历史配比——分组并入声明式 schema，
      // 原手写 _addCountSettings 随 ticket 131 schema 化退役）
      {
        icon: 'list',
        name: '按数量复习',
        rows: [
          {
            type: 'path',
            mode: 'single',
            name: '候选文件夹',
            desc: '按数量复习时从该文件夹选择笔记，含子文件夹',
            binding: { key: 'reviewCountFolder' },
            pickerTitle: '选择按数量复习候选文件夹',
            pickerDesc: 'vault 内目录路径，如 卡片盒/笔记盒',
            okText: '确定',
          },
          { type: 'number', name: '默认篇数', desc: '开启按数量复习时默认填写的复习篇数', binding: { key: 'reviewCountDefault' }, onChange: (v) => { if (!(v >= 1 && v <= 99)) (getSettings() as any).reviewCountDefault = 5; } },
          { type: 'number', name: '历史配比', desc: '已复习笔记在本次安排中的占比，其余为新笔记', binding: { key: 'reviewCountHistoryRatio' }, onChange: (v) => { if (!(v >= 0 && v <= 100)) (getSettings() as any).reviewCountHistoryRatio = 70; } },
        ],
      },
      {
        icon: 'sliders-horizontal',
        name: '自动化',
        rows: [
          // 监听文件夹：通用 path 行（multi chips + 添加… 按钮，ticket 133 形态）。
          // 落盘走外部 binding 自管（权威写盘在 onChange）：新增目录需先确认存量收编（取消=不加入，
          // 回传回退清单否决本次变更），移除目录需连带清理其下排除记录（ticket 099）。
          {
            type: 'path',
            mode: 'multi',
            name: '监听文件夹',
            desc: '文件夹里的新笔记自动加入复习计划，包括子文件夹',
            binding: {
              get: () => ((getSettings() as any).reviewWatchedFolders || []) as string[],
              set: () => {},
              save: () => {},
            },
            pickerTitle: '选择监听文件夹',
            pickerDesc: '文件夹里的新笔记自动加入复习计划，包括子文件夹',
            okText: '确定',
            onChange: (list) => {
              const prev = [...(((getSettings() as any).reviewWatchedFolders as string[]) || [])];
              return (async (): Promise<string[]> => {
                const { ReviewWatcher } = await import('./watch');
                const watcher = new ReviewWatcher(deps.app, deps.dataManager);
                const kept: string[] = [];
                for (const folder of list) {
                  if (!folder) {
                    notice('暂不支持监听库根目录', 'warning');
                    continue;
                  }
                  if (prev.includes(folder)) {
                    kept.push(folder);
                    continue;
                  }
                  // 新增：先确认存量收编；取消 = 该目录不加入（不写排除名单）
                  if (await watcher.confirmBatchAddForFolder(folder)) kept.push(folder);
                }
                for (const folder of prev) {
                  if (list.includes(folder)) continue;
                  // 移除：同时清空其下排除记录（否则二次添加时存量被旧黑名单挡住）
                  const cleared = await watcher.removeWatchedFolder(folder);
                  notice(cleared > 0 ? `已移除监听文件夹，并清理其下 ${cleared} 条排除记录` : '已移除监听文件夹', 'success');
                }
                (getSettings() as any).reviewWatchedFolders = kept;
                await saveSettings();
                return kept;
              })();
            },
          },
          // 排除名单 chips 区（ticket 57 管理 UI；DOM id/类名零变化；交互后经 renderExcludeRows 重渲染）
          {
            type: 'custom',
            render: (body) => {
              const setting = new Setting(body).setName('排除名单').setDesc('不参与监听自动加入的笔记，可在此单条解除');
              setting.settingEl.classList.add('bz-review-exclude-row');
              const excludeBox = document.createElement('div');
              excludeBox.id = 'review-excluded-list';
              setting.controlEl.appendChild(excludeBox);
              renderExcludeRows = () => {
                excludeBox.innerHTML = '';
                const notes = (getSettings() as any).reviewExcludedNotes || [];
                if (!notes.length) {
                  const empty = document.createElement('div');
                  empty.className = 'bz-review-exclude-empty';
                  empty.textContent = '暂无排除笔记';
                  excludeBox.appendChild(empty);
                  return;
                }
                notes.forEach((path: string) => {
                  const chip = document.createElement('span');
                  chip.className = 'bz-review-exclude-chip';
                  const name = document.createElement('span');
                  name.className = 'bz-review-exclude-name';
                  name.textContent = path;
                  name.title = path;
                  const remove = document.createElement('button');
                  remove.className = 'bz-review-exclude-remove';
                  remove.setAttribute('aria-label', `解除排除 ${path}`);
                  remove.textContent = '✕';
                  remove.onclick = () => {
                    void (async () => {
                      const { ReviewWatcher } = await import('./watch');
                      await new ReviewWatcher(deps.app, deps.dataManager).removeExcludedNote(path);
                      renderExcludeRows?.();
                      notice('已解除排除', 'success');
                    })();
                  };
                  chip.appendChild(name);
                  chip.appendChild(remove);
                  excludeBox.appendChild(chip);
                });
              };
              renderExcludeRows();
            },
          },
        ],
      },
      {
        icon: 'list-tree',
        name: '复习条目管理',
        rows: [
          // 条目列表（ticket 168 切片 05）：面板删除后清理 review.json 条目的唯一入口。
          // 挂起（文件缺失）条目标灰展示；逐条移出走确认弹窗 → removeItem → toast 撤销原样恢复（阶段/排期/历史零丢失，
          // ticket 141 通病 1 机制，与旧面板抽屉「移出复习计划」同构）。
          {
            type: 'custom',
            render: (body) => {
              const setting = new Setting(body).setName('条目列表').setDesc('复习计划内全部条目；挂起（文件缺失）标灰，移出可撤销');
              setting.settingEl.classList.add('bz-review-manage-row');
              const listBox = document.createElement('div');
              listBox.className = 'bz-review-manage-list';
              setting.controlEl.appendChild(listBox);
              const renderList = async () => {
                listBox.innerHTML = '';
                const items = await deps.dataManager.loadItems();
                if (!items.length) {
                  const empty = document.createElement('div');
                  empty.className = 'bz-review-manage-empty';
                  empty.textContent = '暂无复习条目';
                  listBox.appendChild(empty);
                  return;
                }
                for (const item of items) {
                  const row = document.createElement('div');
                  row.className = 'bz-review-manage-item' + (item.isMissing ? ' is-missing' : '');
                  const name = document.createElement('span');
                  name.className = 'bz-review-manage-name';
                  name.textContent = item.isMissing ? `${item.name}（挂起）` : item.name;
                  name.title = item.filePath;
                  const remove = document.createElement('button');
                  remove.className = 'bz-review-manage-remove';
                  remove.textContent = '移出';
                  remove.addEventListener('click', () => {
                    void openFlowDialog({
                      title: '移出复习计划',
                      message: `确定移出“${item.name}”？`,
                      actions: [
                        { label: '取消', value: 'cancel' },
                        { label: '确定', value: 'ok', cta: true },
                      ],
                    }).then(async (v) => {
                      if (v !== 'ok') return;
                      try {
                        await deps.dataManager.removeItem(item.filePath);
                        await renderList();
                        const { reviewApp } = await import('./app');
                        await reviewApp.applyReviewStyles(deps.app);
                        // ticket 141 通病 1：原条目（含阶段/排期/历史）重新插回，进度不丢
                        notifyUndo(`已移出「${item.name}」`, () => {
                          void (async () => {
                            try {
                              await deps.dataManager.restoreItem(item);
                              await renderList();
                            } catch (e) {
                              notifySaveError(e, '移出复习条目');
                            }
                          })();
                        });
                      } catch (e) {
                        notifySaveError(e, '移出复习条目');
                      }
                    });
                  });
                  row.appendChild(name);
                  row.appendChild(remove);
                  listBox.appendChild(row);
                }
              };
              void renderList();
            },
          },
        ],
      },
      {
        icon: 'eye',
        name: '界面',
        rows: [
          { type: 'toggle', name: '文件树标记', desc: '在文件树中为复习笔记着色并标到期时间', binding: { key: 'reviewTreeBadge' } },
        ],
      },
    ],
  };
}

export class UIManager {
  app: App;
  dataManager: ReviewDataManager;

  constructor(app: App, dataManager: ReviewDataManager) {
    this.app = app;
    this.dataManager = dataManager;
  }

  /** 按数量复习篇数弹窗（ticket 02/168，命令「复习（按数量）」唯一入口）：默认预填上次输入/设置默认、
   *  上限 = 可用候选、钳制；确认后调用 reviewApp.startCountSession → 自动安排 → 逐篇做题。
   *  ticket 168（切片 02）：空候选时弹窗仍打开（空态文案 + 仅剩 ⚙️ 设置可修正候选文件夹——
   *  设置入口必须常驻可达，否则候选为空时设置被锁死）。 */
  showCountReviewModal(): void {
    const app = this.app;
    void (async () => {
      const { reviewApp } = await import('./app');
      const stats = await reviewApp.countStats();
      const s = getSettings() as any;
      const def = Math.max(1, Number(s.reviewCountDefault) || 5);
      const last = Math.max(0, Number(s.reviewCountLastInput) || 0);
      const initial = Math.max(1, Math.min(last || def, stats.available));
      const hasCandidates = stats.available > 0;

      const mask = document.createElement('div');
      Object.assign(mask.style, { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: '10050' });
      const popup = document.createElement('div');
      Object.assign(popup.style, { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--background-primary)', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', zIndex: '10051', padding: '24px', maxWidth: '420px', width: '90%', display: 'flex', flexDirection: 'column', gap: '12px' });
      popup.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <h4 style="margin:0;font-size:17px;font-weight:600;">按数量复习</h4>
          <button class="review-count-settings" style="padding:4px 10px;border:none;border-radius:6px;background:var(--background-secondary);color:var(--text-normal);cursor:pointer;font-size:13px;" title="复习设置">⚙️ 设置</button>
        </div>
        <p style="margin:0;font-size:13px;color:var(--text-muted);">候选：${stats.folder}（可用 ${stats.available} 篇）</p>
        ${
          hasCandidates
            ? `<input type="number" class="review-count-input" min="1" max="${stats.available}" value="${initial}" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal);font-size:14px;box-sizing:border-box;" />`
            : `<p class="review-count-empty" style="margin:0;font-size:13px;color:var(--text-muted);">该文件夹下没有可复习的笔记，可在 ⚙️ 设置中调整候选文件夹</p>`
        }
        <div style="display:flex;gap:12px;">
          ${
            hasCandidates
              ? `<button class="review-count-cancel" style="flex:1;padding:8px;border:none;border-radius:6px;background:var(--background-secondary);color:var(--text-normal);cursor:pointer;">取消</button>
             <button class="review-count-ok" style="flex:1;padding:8px;border:none;border-radius:6px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-weight:500;">开始复习</button>`
              : `<button class="review-count-cancel" style="flex:1;max-width:120px;padding:8px;border:none;border-radius:6px;background:var(--background-secondary);color:var(--text-normal);cursor:pointer;">关闭</button>`
          }
        </div>
      `;
      const close = () => {
        mask.remove();
        popup.remove();
      };
      mask.onclick = close;
      document.body.appendChild(mask);
      document.body.appendChild(popup);
      const settingsBtn = popup.querySelector('.review-count-settings') as HTMLElement;
      settingsBtn.addEventListener('click', () => {
        openSettingsModal({
          title: '复习设置', // ticket 168：设置入口收敛到篇数弹窗，标题去「计划」
          maxWidth: 560,
          schema: reviewSettingsSchema({ app, dataManager: this.dataManager }),
        });
      });
      popup.querySelector('.review-count-cancel')!.addEventListener('click', close);
      if (!hasCandidates) return;
      const input = popup.querySelector('.review-count-input') as HTMLInputElement;
      input.focus();
      input.select();
      const submit = () => {
        const raw = parseInt(input.value, 10);
        const n = Number.isFinite(raw) && raw > 0 ? raw : def;
        close();
        void reviewApp.startCountSession(n);
      };
      popup.querySelector('.review-count-ok')!.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        else if (e.key === 'Escape') close();
      });
    })();
  }

  /** 销毁（卸载清理）：面板已删除，无常驻 DOM/定时器；按次弹窗自销。 */
  destroy(): void {
    /* no-op */
  }
}