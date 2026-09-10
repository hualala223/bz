/**
 * 日常收集（collect 域）UI 层测试（issue 246）：
 * 统一入口弹窗（分类选择 → 多行输入 → 写入参数与目标文件内容）/ 每分类直达跳过选择 /
 * 主面板 16 分类网格与 ⚙️ 分类增删改 / 选区收集预填 / 空内容不写盘。
 *
 * 只测外部行为（渲染结果与写盘结果），不测内部实现（issue 246 Testing Decisions）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { clearNotices, hasNotice } from '../mock-obsidian-entry';
import { setSettingsProvider, setSettingsSaver } from '../../src/core/settings-provider';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { DEFAULT_COLLECT_CATEGORIES, COLLECT_HEADING } from '../../src/collect/data';
import {
  openCollectCapture, openCollectPanel, captureSelection, openCollectSettings,
  unloadCollect, categoryCommandId,
} from '../../src/collect';
import { categoryCommandId as idOf } from '../../src/collect';

const NOW = new Date(2026, 8, 10, 9, 5, 3);
const STAMP = '26/09/10-09:05:03';

let vault: MockVault;
let app: any;
let settings: any;
let saves: number;

function setup(files: Record<string, string> = {}): void {
  vault = new MockVault();
  for (const [p, c] of Object.entries(files)) vault.files.set(p, c);
  app = mockAppWithVault(vault);
  settings = { ...DEFAULT_SETTINGS, collectCategories: [] as any[] };
  saves = 0;
  setSettingsProvider(() => settings);
  setSettingsSaver(async () => {
    saves++;
  });
}

/** 点「收集」按钮（uiDialogActions 主按钮） */
function clickOk(root: ParentNode = document): void {
  const btns = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  const ok = btns.find((b) => (b.textContent || '').includes('收集') && !(b.textContent || '').includes('选区'));
  expect(ok, '未找到「收集」按钮').toBeTruthy();
  ok!.click();
}

function captureModal(): HTMLElement {
  const pop = document.querySelector('.bz-collect-cap-pop') as HTMLElement | null;
  expect(pop, '捕获弹窗未打开').toBeTruthy();
  return pop!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  clearNotices();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  unloadCollect();
  document.body.innerHTML = '';
});

describe('统一入口捕获弹窗', () => {
  it('分类下拉 + 多行输入 → 确认后追加到目标文件「## 非文件收集」下末尾', async () => {
    setup({ '我的/日常收集/日常灵感收集.md': `---\ncreated: 2025-06-14\n---\n${COLLECT_HEADING}\n- 25/11/02-13:11:54 旧条目\n` });
    openCollectCapture(app);

    const pop = captureModal();
    const area = pop.querySelector('textarea') as HTMLTextAreaElement;
    expect(area).toBeTruthy();
    // 分类下拉默认落在第一个内置分类
    const sel = pop.querySelector('.bz-select') as HTMLElement;
    expect(sel.textContent).toContain(DEFAULT_COLLECT_CATEGORIES[0].name);

    area.value = '体内有无数生物基因';
    clickOk(pop);
    await vi.waitFor(() => {
      expect(hasNotice('已收集 1 条到「故事情节收集」')).toBe(true);
    });
    const text = vault.files.get('我的/日常收集/故事情节收集.md') ?? '';
    expect(text).toContain(`${COLLECT_HEADING}\n- ${STAMP} 体内有无数生物基因\n`);
    // 弹窗已关闭
    expect(document.querySelector('.bz-collect-cap-pop')).toBeNull();
  });

  it('指定分类（每分类命令）：不渲染下拉，写入该分类文件', async () => {
    setup();
    openCollectCapture(app, '日常灵感收集');
    const pop = captureModal();
    expect(pop.querySelector('.bz-select')).toBeNull();
    expect((pop.querySelector('.bz-collect-cap-fixed') as HTMLElement).textContent).toBe('日常灵感收集');
    (pop.querySelector('textarea') as HTMLTextAreaElement).value = '一条灵感\n第二条灵感';
    clickOk(pop);
    await vi.waitFor(() => {
      expect(hasNotice('已收集 2 条到「日常灵感收集」')).toBe(true);
    });
    const text = vault.files.get('我的/日常收集/日常灵感收集.md') ?? '';
    expect(text).toContain(`- ${STAMP} 一条灵感\n- ${STAMP} 第二条灵感\n`);
  });

  it('目标文件与目录都不存在：自动创建（frontmatter + 标题）', async () => {
    setup();
    openCollectCapture(app, '想法');
    const pop = captureModal();
    (pop.querySelector('textarea') as HTMLTextAreaElement).value = '未预置分类也能收';
    clickOk(pop);
    await vi.waitFor(() => {
      expect(vault.files.has('我的/日常收集/想法.md')).toBe(true);
    });
    const text = vault.files.get('我的/日常收集/想法.md')!;
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain(`- ${STAMP} 未预置分类也能收`);
  });

  it('空内容不写盘并提示', async () => {
    setup();
    openCollectCapture(app, '日常灵感收集');
    const pop = captureModal();
    (pop.querySelector('textarea') as HTMLTextAreaElement).value = '   \n ';
    clickOk(pop);
    await vi.waitFor(() => {
      expect(hasNotice('请输入要收集的内容')).toBe(true);
    });
    expect(vault.files.has('我的/日常收集/日常灵感收集.md')).toBe(false);
    expect(document.querySelector('.bz-collect-cap-pop')).not.toBeNull();
  });

  it('每分类命令 id 为汉字三段式且与分类一一对应', () => {
    expect(idOf('日常灵感收集')).toBe('bz-collect-日常灵感收集');
    expect(categoryCommandId('想法')).toBe('bz-collect-想法');
    expect(DEFAULT_COLLECT_CATEGORIES.map((c) => idOf(c.name))).toHaveLength(16);
  });
});

describe('主面板与选区收集', () => {
  it('面板渲染 16 分类网格，点分类直达该分类捕获输入', () => {
    setup();
    openCollectPanel(app);
    const panel = document.getElementById('bz-collect-popup') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.querySelectorAll('.bz-collect-card').length).toBe(DEFAULT_COLLECT_CATEGORIES.length);

    const card = Array.from(panel.querySelectorAll('.bz-collect-card')).find(
      (c) => (c as HTMLElement).dataset.category === '日常吐槽收集'
    ) as HTMLElement;
    card.click();
    const pop = captureModal();
    expect((pop.querySelector('.bz-collect-cap-fixed') as HTMLElement).textContent).toBe('日常吐槽收集');
  });

  it('⚙️ 打开设置弹窗：目标文件夹行 + 16 分类编辑行；新增与删除落盘设置', async () => {
    setup();
    openCollectPanel(app);
    (document.getElementById('bz-collect-btn-settings') as HTMLElement).click();
    const modal = document.querySelector('.bz-settings-modal') ?? document.querySelector('.bz-overlay-popup');
    expect(modal).toBeTruthy();
    // 分类编辑行（custom 行）：内置 16 条 + 添加按钮
    const rows = document.querySelectorAll('.bz-collect-cat-row');
    expect(rows.length).toBe(DEFAULT_COLLECT_CATEGORIES.length);

    // 新增分类
    const addBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('添加分类')
    ) as HTMLButtonElement;
    addBtn.click();
    await vi.waitFor(() => {
      expect(settings.collectCategories).toHaveLength(DEFAULT_COLLECT_CATEGORIES.length + 1);
    });
    expect(settings.collectCategories.at(-1).name).toBe('新分类1');
    expect(saves).toBeGreaterThan(0);

    // 删除第一个分类
    const del = document.querySelector('.bz-collect-cat-row .bz-collect-cat-del') as HTMLButtonElement;
    del.click();
    await vi.waitFor(() => {
      expect(settings.collectCategories).toHaveLength(DEFAULT_COLLECT_CATEGORIES.length);
    });
    expect(settings.collectCategories.some((c: any) => c.name === DEFAULT_COLLECT_CATEGORIES[0].name)).toBe(false);
  });

  it('选区收集：无选区提示；有选区预填进输入框', () => {
    setup();
    app.workspace.activeEditor = null;
    captureSelection(app);
    expect(hasNotice(/没有选中文字/)).toBe(true);

    app.workspace.activeEditor = { editor: { getSelection: () => '选中的一段话\n第二行' }, file: { path: 'x.md' } };
    captureSelection(app);
    const pop = captureModal();
    expect((pop.querySelector('textarea') as HTMLTextAreaElement).value).toBe('选中的一段话\n第二行');
  });

  it('卸载清理面板 DOM', () => {
    setup();
    openCollectPanel(app);
    expect(document.getElementById('bz-collect-popup')).not.toBeNull();
    unloadCollect();
    expect(document.getElementById('bz-collect-popup')).toBeNull();
  });
});
