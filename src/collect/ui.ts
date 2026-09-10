/**
 * 日常收集（collect 域）UI 层（issue 246）。
 *
 * 三件套（用户决策 2/8/9 + 主窗口规范）：
 *  - 捕获弹窗（统一入口 / 每分类直达 / 选区收集共用）：选分类（指定分类时只读显示）→ 多行输入
 *    → 确认写入。不放关闭按钮，靠遮罩 + ESC（主窗口规范）。
 *  - 主面板（分类启动器）：`.bz-win-head` 头行（功能 → ⚙️ → 关闭秩序）+ 分类网格，
 *    点分类直接进入该分类捕获输入；移动端全屏走 `collectMobileDefaultFullscreen`。
 *  - ⚙️ 域设置弹窗：目标文件夹（core 统一路径选择器）+ 分类映射增删改。
 *
 * 样式一律写 `./styles.css`（铁律 9：`bz-` 前缀，构建聚合，禁止运行时注入）。
 * 写盘一律经 ./store 薄壳，本文件不直接触碰 vault。
 */
import { escManager } from '../core/esc-manager';
import { notice } from '../core/notice';
import { getSelectionSnapshot } from '../core/selection';
import { applyMobileWindowFullscreen } from '../core/mobile';
import { openSettingsModal } from '../core/settings-modal';
import { getSettings, saveSettings, tryGetSettings } from '../core/settings-provider';
import { uiBtn, uiIconBtn, uiModal, uiDialogActions, uiSelect } from '../core/ui';
import type { GroupDecl, SettingsSchema } from '../core/settings-schema';
import { mobileFullscreenGroup } from '../core/settings-common';
import type { CollectCategory } from './data';
import {
  DEFAULT_COLLECT_CATEGORIES, normalizeCategories,
  getCategories, upsertCategory, removeCategory, renameCategory,
} from './data';
import { captureToCategory } from './store';

/** 面板 DOM id（外部约定：与既有域 mask/popup 同款命名） */
const MASK_ID = 'bz-collect-mask';
const POPUP_ID = 'bz-collect-popup';

/** 主面板单例（重复打开 = 抬顶重建内容） */
let mask: HTMLElement | null = null;
let popup: HTMLElement | null = null;
let escHandle: { unregister: () => void } | null = null;
/** 当前宿主 app（命令注入；卸载后置 null） */
let hostApp: any = null;

/* ---------- 捕获弹窗 ---------- */

/**
 * 打开捕获弹窗（统一入口 / 每分类命令 / 选区收集共用）。
 * preset 指定分类 → 跳过分类选择（只读显示）；initialText 预填输入（选区收集）。
 * preset 不在已配置分类里也照常受理（按名就地派生 `分类名.md`）：未预置分类
 * （冲突类型/情感/想法/疑问等，issue 246 决策 3）可由外部命令直达收集，文件不存在走自动创建。
 */
export function openCollectCapture(app: any, preset?: string, initialText = ''): void {
  const cats = getCategories();
  if (!cats.length) {
    notice('还没有配置收集分类，请先在 ⚙️ 里添加', 'warning');
    return;
  }
  const fixed = (preset || '').trim();
  let current = fixed || cats[0].name;

  const body = document.createElement('div');
  body.className = 'bz-collect-cap';

  const title = document.createElement('div');
  title.className = 'bz-collect-cap-title';
  title.textContent = '日常收集';
  body.appendChild(title);

  const row = document.createElement('div');
  row.className = 'bz-collect-cap-row';
  const label = document.createElement('span');
  label.className = 'bz-collect-cap-label';
  label.textContent = '分类';
  row.appendChild(label);
  if (fixed) {
    const fixedEl = document.createElement('span');
    fixedEl.className = 'bz-collect-cap-fixed';
    fixedEl.textContent = fixed;
    row.appendChild(fixedEl);
  } else {
    const sel = uiSelect<string>({
      value: current,
      options: cats.map((c) => ({ value: c.name, label: c.name })),
      onChange: (v) => {
        current = v;
      },
      className: 'bz-collect-cap-select',
    });
    row.appendChild(sel.el);
    void sel;
  }
  body.appendChild(row);

  const area = document.createElement('textarea');
  area.className = 'bz-input bz-collect-input';
  area.rows = 5;
  area.placeholder = '写点什么，多行会按行分成多条';
  area.value = initialText || '';
  body.appendChild(area);

  const { close } = uiModal({
    content: body,
    maxWidth: 480,
    className: 'bz-collect-cap-pop',
  });

  const submit = (): void => {
    const text = area.value;
    // 未预置分类就地派生（file 留空 → categoryFilePath 按名回落 `分类名.md`）
    const cat = cats.find((c) => c.name === current) ?? { name: current, file: '' };
    if (!cat.name) {
      notice('分类不存在，请重新选择', 'warning');
      return;
    }
    void (async () => {
      try {
        const res = await captureToCategory(app, cat, text);
        if (!res) {
          notice('请输入要收集的内容', 'warning');
          return;
        }
        close();
        notice(`已收集 ${res.count} 条到「${cat.name}」`, 'success');
      } catch (e) {
        notice('收集失败：' + (e instanceof Error ? e.message : String(e)), 'error');
      }
    })();
  };

  // Ctrl/Cmd+Enter 提交（多行输入框：Enter 留给换行）
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  });

  const actions = uiDialogActions({
    okText: '收集',
    onOk: submit,
    onCancel: () => close(),
  });
  body.appendChild(actions.row);
  setTimeout(() => area.focus(), 0);
}

/** 选区收集命令：把当前笔记选区（含多行）收进所选分类 */
export function captureSelection(app: any): void {
  const sel = getSelectionSnapshot(app ?? hostApp);
  if (!sel || !sel.text) {
    notice('没有选中文字，先选中一段再收集', 'warning');
    return;
  }
  openCollectCapture(app ?? hostApp, undefined, sel.text);
}

/* ---------- 主面板（分类启动器）---------- */

/** 打开日常收集主面板（重复打开 = 抬顶 + 重渲分类） */
export function openCollectPanel(app: any): void {
  hostApp = app;
  if (!popup || !popup.isConnected) build(app);
  applyMobileWindowFullscreen(popup, (tryGetSettings() as any)?.collectMobileDefaultFullscreen === true);
  if (mask) mask.style.display = 'block';
  if (popup) popup.style.display = 'flex';
  renderGrid();
}

/** 关闭主面板（头行关闭钮 / 遮罩 / ESC） */
export function closeCollectPanel(): void {
  if (mask) mask.style.display = 'none';
  if (popup) popup.style.display = 'none';
}

/** 插件卸载清理：拆面板 + 注销 ESC 层 */
export function unloadCollect(): void {
  escHandle?.unregister();
  escHandle = null;
  popup?.remove();
  mask?.remove();
  popup = null;
  mask = null;
  hostApp = null;
}

function build(app: any): void {
  const m = document.createElement('div');
  m.id = MASK_ID;
  m.className = 'bz-overlay-mask';
  m.addEventListener('click', (e) => {
    if (e.target === m) closeCollectPanel();
  });

  const p = document.createElement('div');
  p.id = POPUP_ID;
  p.className = 'bz-overlay-popup bz-collect-panel';

  const head = document.createElement('div');
  head.className = 'bz-win-head';
  const title = document.createElement('h3');
  title.className = 'bz-collect-title';
  title.textContent = '日常收集';
  const btns = document.createElement('div');
  btns.className = 'bz-collect-head-btns';
  const settingsBtn = uiIconBtn({ icon: 'settings', title: '设置', onClick: () => openCollectSettings() });
  settingsBtn.id = 'bz-collect-btn-settings';
  const closeBtn = uiIconBtn({ icon: 'x', lg: true, title: '关闭', onClick: () => closeCollectPanel() });
  closeBtn.classList.add('bz-win-close');
  closeBtn.id = 'bz-collect-btn-close';
  btns.append(settingsBtn, closeBtn);
  head.append(title, btns);

  const body = document.createElement('div');
  body.className = 'bz-collect-body';

  p.append(head, body);
  document.body.append(m, p);
  mask = m;
  popup = p;

  escHandle = escManager.register('bz-collect', {
    isVisible: () => !!popup && popup.style.display === 'flex',
    close: closeCollectPanel,
  });
  void app;
}

/** 渲染分类网格（配置变更后重渲） */
function renderGrid(): void {
  const body = popup?.querySelector('.bz-collect-body') as HTMLElement | null;
  if (!body) return;
  body.innerHTML = '';
  const cats = getCategories();
  if (!cats.length) {
    const empty = document.createElement('div');
    empty.className = 'bz-collect-empty';
    empty.textContent = '还没有分类，点右上角 ⚙️ 添加';
    body.appendChild(empty);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'bz-collect-grid';
  for (const c of cats) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'bz-collect-card';
    card.dataset.category = c.name;
    card.title = c.name;
    const name = document.createElement('span');
    name.className = 'bz-collect-card-name';
    name.textContent = c.name;
    card.appendChild(name);
    card.addEventListener('click', () => openCollectCapture(hostApp ?? undefined, c.name));
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

/* ---------- ⚙️ 域设置 ---------- */

/**
 * 当前分类清单（内存态副本取自设置）。
 * 设置里未配置/为空时回落内置 16 分类——与 getCategories() 同一口径（空 = 未配置），
 * 否则 ⚙️ 弹窗会显示 0 行、用户无从下手。首次编辑时由 commitCats 把整份清单落盘。
 */
function readCats(): CollectCategory[] {
  const s = getSettings() as any;
  const list = normalizeCategories(s.collectCategories);
  return list.length ? list : DEFAULT_COLLECT_CATEGORIES.map((c) => ({ ...c }));
}

async function commitCats(list: CollectCategory[]): Promise<void> {
  const s = getSettings() as any;
  s.collectCategories = list;
  try {
    await saveSettings();
  } catch {
    notice('分类保存失败', 'error');
  }
}

/** 分类映射编辑区（custom 行内容）：每行 名称 + 目标文件 + 删除，底部「添加分类」 */
function buildCategoryEditor(host: HTMLElement): void {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'bz-collect-cats';
  host.appendChild(wrap);

  const render = (): void => {
    wrap.innerHTML = '';
    const list = readCats();
    list.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'bz-collect-cat-row';
      row.dataset.name = c.name;

      const nameIn = document.createElement('input');
      nameIn.className = 'bz-input bz-collect-cat-name';
      nameIn.type = 'text';
      nameIn.value = c.name;
      nameIn.placeholder = '分类名';
      nameIn.addEventListener('change', () => {
        const next = renameCategory(readCats(), c.name, nameIn.value.trim());
        void commitCats(next).then(render);
      });

      const fileIn = document.createElement('input');
      fileIn.className = 'bz-input bz-collect-cat-file';
      fileIn.type = 'text';
      fileIn.value = c.file;
      fileIn.placeholder = '目标文件';
      fileIn.addEventListener('change', () => {
        const next = upsertCategory(readCats(), c.name, fileIn.value.trim());
        void commitCats(next).then(render);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'bz-collect-cat-del';
      del.title = '删除分类';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        const next = removeCategory(readCats(), c.name);
        void commitCats(next).then(() => {
          render();
          notice(`已删除分类「${c.name}」（收集文件保留）`, 'info');
        });
      });

      row.append(nameIn, fileIn, del);
      wrap.appendChild(row);
      void i;
    });

    const addRow = document.createElement('div');
    addRow.className = 'bz-collect-cat-add';
    const addBtn = uiBtn({
      label: '添加分类',
      icon: 'plus',
      onClick: () => {
        const base = '新分类';
        let n = 1;
        const names = new Set(readCats().map((c) => c.name));
        while (names.has(`${base}${n}`)) n++;
        const name = `${base}${n}`;
        const next = upsertCategory(readCats(), name, '');
        void commitCats(next).then(render);
      },
    });
    addRow.appendChild(addBtn);
    wrap.appendChild(addRow);
  };

  render();
}

/** 日常收集设置 schema（⚙️ 弹窗消费） */
export function collectSettingsSchema(): SettingsSchema {
  const groups: GroupDecl[] = [
    {
      icon: 'folder-open',
      name: '收集目录',
      rows: [
        {
          type: 'path',
          name: '目标文件夹',
          desc: '收集条目统一写入的目录，分类文件都在里面',
          mode: 'single',
          binding: { key: 'collectFolderPath' },
          pickerTitle: '选择日常收集目录',
          buttonText: '选择…',
        },
      ],
    },
    {
      icon: 'tags',
      name: '分类',
      rows: [
        {
          type: 'custom',
          render: (body: HTMLElement) => buildCategoryEditor(body),
        },
      ],
    },
    mobileFullscreenGroup('collectMobileDefaultFullscreen', { desc: '' }),
  ];
  return { groups };
}

/** 打开日常收集设置弹窗（面板 ⚙️） */
export function openCollectSettings(): void {
  openSettingsModal({
    title: '日常收集设置',
    maxWidth: 560,
    schema: collectSettingsSchema(),
    onClose: () => {
      renderGrid();
    },
  });
}
