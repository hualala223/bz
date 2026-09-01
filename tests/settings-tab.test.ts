/**
 * 设置页测试（覆盖 main.ts BzSettingTab，ADR-0009）：单页三区块（🤖 AI / 📂 数据存储路径 /
 * 🐱 小橘电力电源）渲染 + 控件交互保存持久化 + storagePath 迁移（旧 7 字段 → 共享路径）。
 * ticket 128：数据存储路径行改为统一路径选择器（chips + 选择…按钮，无手输文本框），
 * 交互经选择器录入；onCommit 提示语义（有变更才提示、同一次会话至多一次、改回原值复位）保留。
 * ticket 131：两区块 schema 化（ADR-0064 渲染器）；AI 服务商切换 → 密钥行显隐走 visibleWhen；
 * ticket 100 文案修正（标题收短为「DeepSeek 密钥」「OpenCode 密钥」，键名/行为不动）。
 * ticket 103（合并回归恢复）：主设置页重新挂「🐱 小橘」电源区块（启用开关 + 关闭方式三档，
 * 立即生效；schema 由 smartcat 域提供，main.ts 组合渲染）。
 * 依赖 mock-obsidian-entry 的 Setting 链式 mock（MockDropdown/MockText/MockToggle）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BzPlugin, { BzSettingTab } from '../src/main';
import { MockVault, mockAppWithVault } from './mock-vault';
import { setApp } from '../src/core/app';
import { resetObsidianMocks, getNoticeMessages, hasNotice, clearNotices } from './mock-obsidian-entry';
import { ensureSmartCat, unloadSmartCat, __getSmartcatInternals } from '../src/smartcat';
import { CAT_CONTAINER_ID } from '../src/smartcat/ui';

const diskData: Record<string, any> = {};

function makeMockApp() {
  const vault = new MockVault();
  return {
    vault,
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      getActiveFile: () => null,
      activeEditor: null,
      on: () => ({ ref: 'ref' }),
    },
    commands: { addCommand: () => {}, removeCommand: () => {} },
    metadataCache: { getFileCache: () => null, getBacklinksForFile: () => null, on: () => ({ ref: 'ref' }) },
    fileManager: { processFrontMatter: () => Promise.resolve() },
  };
}

async function createPlugin(app: any) {
  const plugin: any = new BzPlugin(app, {} as any);
  plugin.app = app;
  plugin.loadData = async () => diskData['bz'] ?? null;
  plugin.saveData = async (d: any) => {
    diskData['bz'] = d;
  };
  await plugin.onload();
  return plugin;
}

/** 按设置名找 setting-item */
function findSetting(tab: BzSettingTab, name: string): HTMLElement {
  const el = [...tab.containerEl.querySelectorAll('.setting-item')].find(
    (s) => (s as HTMLElement).dataset.name === name
  ) as HTMLElement;
  expect(el, `设置项「${name}」存在`).toBeTruthy();
  return el;
}

/** 取设置项的控件（MockText/MockToggle 均有 trigger） */
function controlOf(el: HTMLElement): any {
  return (el as any).__setting.controls.find((c: any) => typeof c.trigger === 'function');
}

describe('设置页 BzSettingTab（ADR-0009 单页）', () => {
  let plugin: any;
  let tab: BzSettingTab;

  beforeEach(async () => {
    resetObsidianMocks();
    delete diskData['bz'];
    document.body.innerHTML = '';
    plugin = await createPlugin(makeMockApp());
    tab = new BzSettingTab(plugin.app, plugin);
    tab.display();
  });

  afterEach(() => {
    if (plugin && plugin.unregisterGestures) plugin.unregisterGestures();
  });

  it('单页平铺：无 tab，只有 🤖 AI、📂 数据存储路径、🐱 小橘 三个区块标题', () => {
    expect(tab.containerEl.querySelectorAll('.bz-tab').length).toBe(0);
    const titles = [...tab.containerEl.querySelectorAll('.bz-setting-section-title')].map((t) => t.textContent);
    expect(titles).toEqual(['🤖 AI', '📂 数据存储路径', '🐱 小橘']);
  });

  it('AI 区块：服务商下拉 + 两个密钥行；数据存储路径区块：路径选择行（已选态 chip + ✕，无按钮/手输框）', () => {
    findSetting(tab, 'AI 服务商');
    findSetting(tab, 'DeepSeek 密钥');
    findSetting(tab, 'OpenCode 密钥');
    const storageRow = findSetting(tab, '数据存储路径');
    // ticket 128：行内无 text 输入框；ticket 133：已选态「选择…」按钮移出 DOM（chip 内 ✕ 仍是 button）；
    // 默认值场景 data-filled=1（CSS 双保险隐藏按钮——用户反馈「有默认值时按钮不消失」的回归锁）
    expect(storageRow.querySelector('.setting-item-control input')).toBeNull();
    expect(storageRow.querySelector('.setting-item-control .bz-path-picker-btn--slim')).toBeNull();
    expect(storageRow.dataset.filled).toBe('1');
    expect(storageRow.querySelector('.setting-item-control .bz-path-picker-chip-x')).toBeTruthy();
    expect(storageRow.querySelector('.setting-item-control .bz-path-picker-chip-name')!.textContent).toBe('CONFIG/STORAGE');
    // 域设置不再出现在设置页（已迁往各域 ⚙️ 弹窗）
    expect([...tab.containerEl.querySelectorAll('.setting-item')].some((s) => (s as HTMLElement).dataset.name === '启动时自动弹窗')).toBe(false);
    expect([...tab.containerEl.querySelectorAll('.setting-item')].some((s) => (s as HTMLElement).dataset.name === '剪藏目录')).toBe(false);
  });

  it('AI 服务商切换 → 密钥行 visibleWhen 显隐（ticket 131：默认 opencode-go 显示 OpenCode 行）', async () => {
    const hiddenOf = (name: string) => findSetting(tab, name).classList.contains('bz-setting-hidden');
    // 默认 opencode-go：OpenCode 行显示、DeepSeek 行隐藏
    expect(hiddenOf('DeepSeek 密钥')).toBe(true);
    expect(hiddenOf('OpenCode 密钥')).toBe(false);
    // 切 deepseek：反转
    const aiSetting = findSetting(tab, 'AI 服务商');
    const dd = (aiSetting as any).__setting.controls.find((c: any) => c.options && 'deepseek' in c.options);
    dd.trigger('deepseek');
    await new Promise((r) => setTimeout(r, 10));
    expect(hiddenOf('DeepSeek 密钥')).toBe(false);
    expect(hiddenOf('OpenCode 密钥')).toBe(true);
    // 切回 opencode-go：再次反转
    dd.trigger('opencode-go');
    await new Promise((r) => setTimeout(r, 10));
    expect(hiddenOf('DeepSeek 密钥')).toBe(true);
    expect(hiddenOf('OpenCode 密钥')).toBe(false);
  });

  it('AI 服务商切换更新设置并持久化', async () => {
    const aiSetting = findSetting(tab, 'AI 服务商');
    const dd = (aiSetting as any).__setting.controls.find((c: any) => c.options && 'opencode-go' in c.options);
    dd.trigger('opencode-go');
    await new Promise((r) => setTimeout(r, 10));
    expect(plugin.settings.aiProvider).toBe('opencode-go');
    expect(diskData['bz'].aiProvider).toBe('opencode-go');
  });

  it('数据存储路径经统一选择器录入：确认即落盘 + f1 风险提示（同会话不重复、改回原值复位）', async () => {
    // 选择器数据源 = vault 文件夹：种几个候选目录（含默认 CONFIG/STORAGE）
    const vault = new MockVault();
    vault.create('CONFIG/STORAGE/a.json', 'x');
    vault.create('CONFIG/数据/b.json', 'x');
    vault.create('CONFIG/数据2/c.json', 'x');
    setApp(mockAppWithVault(vault) as any);
    const saveSpy = vi.spyOn(plugin, 'saveData');

    const pickVia = async (path: string) => {
      const el = findSetting(tab, '数据存储路径');
      (el as any).__setting.controls[0].trigger(); // 「选择…」按钮 → 打开选择器
      const popup = document.getElementById('bz-path-picker-popup')!;
      await vi.waitFor(() => expect(popup.querySelectorAll('.bz-path-picker-row').length).toBeGreaterThan(0));
      const row = [...popup.querySelectorAll('.bz-path-picker-row')].find(
        (r) => (r as HTMLElement).dataset.path === path
      ) as HTMLElement;
      row.click();
      (popup.querySelector('.bz-path-picker-btn--primary') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 10));
    };

    // 选 CONFIG/数据 → 内存 + 落盘一次 + 风险提示（仅改路径、文件不迁移、重载后生效；正文不带 emoji）
    await pickVia('CONFIG/数据');
    expect(plugin.settings.storagePath).toBe('CONFIG/数据');
    expect(saveSpy).toHaveBeenCalledTimes(1); // 离散选择 → 确认即落盘（无防抖必要，语义保留）
    expect(getNoticeMessages().some((m) => m.includes('文件') && m.includes('迁移') && m.includes('重载'))).toBe(true);

    // 同会话再改其它值：不重复提示（warned 去重）
    clearNotices();
    await pickVia('CONFIG/数据2');
    expect(plugin.settings.storagePath).toBe('CONFIG/数据2');
    expect(getNoticeMessages().filter((m) => m.includes('重载')).length).toBe(0);

    // 改回原值 → warned 复位（不提示）；再次改动 → 可再次提示
    clearNotices();
    await pickVia('CONFIG/STORAGE');
    expect(plugin.settings.storagePath).toBe('CONFIG/STORAGE');
    expect(getNoticeMessages().filter((m) => m.includes('重载')).length).toBe(0);
    await pickVia('CONFIG/数据');
    expect(hasNotice(/重载/)).toBe(true);
  });
});

describe('🐱 小橘电源区块（ticket 103 回归恢复：设置页开关 + 三档关闭方式，立即生效）', () => {
  let plugin: any;
  let tab: BzSettingTab;

  const enabledToggle = () => controlOf(findSetting(tab, '启用小橘'));
  const offModeDd = () => controlOf(findSetting(tab, '关闭方式'));

  beforeEach(async () => {
    resetObsidianMocks();
    delete diskData['bz'];
    document.body.innerHTML = '';
    plugin = await createPlugin(makeMockApp());
    // onload 的 onLayoutReady 立即回调会触发一次空转装配（smartcatEnabled 默认开）——
    // 先卸载清掉这趟「在途」装配（ensure 竞态守卫自动中止），本 describe 以「未装配」为起点
    unloadSmartCat();
    tab = new BzSettingTab(plugin.app, plugin);
    tab.display();
  });

  afterEach(() => {
    if (plugin && plugin.unregisterGestures) plugin.unregisterGestures();
  });

  it('渲染：启用开关默认开；关闭方式下拉 stop/hide/lazy 三选项、默认 stop；下拉行默认隐藏', () => {
    expect(enabledToggle().value).toBe(true);
    expect(findSetting(tab, '关闭方式').classList.contains('bz-setting-hidden')).toBe(true);
    const dd = offModeDd();
    expect(Object.keys(dd.options)).toEqual(['stop', 'hide', 'lazy']);
    expect(dd.value).toBe('stop');
  });

  it('关开关（默认 stop）：立即全量停机、下拉行现身、设置持久化', async () => {
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(false));
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
    expect(findSetting(tab, '关闭方式').classList.contains('bz-setting-hidden')).toBe(false);
    expect(plugin.settings.smartcatEnabled).toBe(false);
    expect(diskData['bz'].smartcatEnabled).toBe(false);
  });

  it('开开关（停机后重开）：重新装配显示，不丢数据', async () => {
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(false));
    enabledToggle().trigger(true);
    await vi.waitFor(() => expect(document.getElementById(CAT_CONTAINER_ID)).toBeTruthy());
    expect(__getSmartcatInternals().initialized).toBe(true);
    expect(plugin.settings.smartcatEnabled).toBe(true);
  });

  it('关开关（仅隐藏档）：未装配时隐藏启动装配——子系统在线、容器不出现', async () => {
    offModeDd().trigger('hide');
    await vi.waitFor(() => expect(diskData['bz'].smartcatOffMode).toBe('hide'));
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(true));
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
  });

  it('关开关（仅隐藏档）：已装配时收起 DOM、后台仍在', async () => {
    await ensureSmartCat(plugin.app);
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeTruthy();
    offModeDd().trigger('hide');
    await vi.waitFor(() => expect(diskData['bz'].smartcatOffMode).toBe('hide'));
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull());
    expect(__getSmartcatInternals().initialized).toBe(true);
  });

  it('关开关（仅不自动启动档）：当场零变化——未装配不装配、已装配不动（Q8 拍板）', async () => {
    await ensureSmartCat(plugin.app);
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeTruthy();
    offModeDd().trigger('lazy');
    await vi.waitFor(() => expect(diskData['bz'].smartcatOffMode).toBe('lazy'));
    enabledToggle().trigger(false);
    await new Promise((r) => setTimeout(r, 30));
    // 已装配：容器仍在、子系统在线（当场不动）
    expect(__getSmartcatInternals().initialized).toBe(true);
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeTruthy();
  });

  it('关闭状态下切换关闭方式：stop→hide 立即按新档对账（隐藏启动装配）', async () => {
    await ensureSmartCat(plugin.app);
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(false));
    offModeDd().trigger('hide');
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(true));
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
    expect(diskData['bz'].smartcatOffMode).toBe('hide');
  });

  it('关闭状态下切换关闭方式：hide→stop 立即卸载', async () => {
    offModeDd().trigger('hide');
    await vi.waitFor(() => expect(diskData['bz'].smartcatOffMode).toBe('hide'));
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(true));
    offModeDd().trigger('stop');
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(false));
    expect(diskData['bz'].smartcatOffMode).toBe('stop');
  });
});

describe('storagePath 迁移（ADR-0009）', () => {
  // 迁移只关心 onload 的 migrateStoragePath；不触发布局回调（避免日记本初始化噪音 Notice）
  function makeAppNoLayout() {
    const app = makeMockApp();
    app.workspace.onLayoutReady = () => {};
    return app;
  }

  beforeEach(() => {
    delete diskData['bz'];
    clearNotices();
  });

  it('旧 7 字段全部相同（默认 CONFIG/STORAGE）→ seed storagePath，无 Notice', async () => {
    const p = await createPlugin(makeAppNoLayout());
    expect(p.settings.storagePath).toBe('CONFIG/STORAGE');
    expect(getNoticeMessages().length).toBe(0);
  });

  it('旧字段全同但自定义 → 以该值初始化 storagePath', async () => {
    diskData['bz'] = {
      todoFilePath: 'CONFIG/数据',
      belongingsDataFolder: 'CONFIG/数据',
      pwStoragePath: 'CONFIG/数据',
      favoritesStoragePath: 'CONFIG/数据',
      reviewStoragePath: 'CONFIG/数据',
      META_PATH: 'CONFIG/数据/ai_completion_meta.json',
      VEC_PATH: 'CONFIG/数据/ai_completion_vectors.vec',
    };
    const p = await createPlugin(makeAppNoLayout());
    expect(p.settings.storagePath).toBe('CONFIG/数据');
    expect(getNoticeMessages().length).toBe(0);
  });

  it('旧字段参差 → 默认 CONFIG/STORAGE + Notice 列出被忽略路径', async () => {
    diskData['bz'] = {
      todoFilePath: 'CONFIG/数据',
      pwStoragePath: '其他/路径',
    };
    const p = await createPlugin(makeAppNoLayout());
    expect(p.settings.storagePath).toBe('CONFIG/STORAGE');
    expect(getNoticeMessages().length).toBe(1);
    const msg = getNoticeMessages()[0] as string;
    expect(msg).toContain('todoFilePath');
    expect(msg).toContain('pwStoragePath');
  });

  it('已有 storagePath → 不覆盖（用户已配置）', async () => {
    diskData['bz'] = { storagePath: 'CONFIG/我的数据', todoFilePath: '旧/路径' };
    const p = await createPlugin(makeAppNoLayout());
    expect(p.settings.storagePath).toBe('CONFIG/我的数据');
    expect(getNoticeMessages().length).toBe(0);
  });
});

describe('设置页 onload 迁移（保留既有）', () => {
  it('旧手势设置 → launcherGesture 单选', async () => {
    diskData['bz'] = { gestureDoubleTap: true, gestureTripleTap: false };
    const p1 = await createPlugin(makeMockApp());
    expect(p1.settings.launcherGesture).toBe('double');
    expect((p1.settings as any).gestureDoubleTap).toBeUndefined();
    diskData['bz'] = { gestureSwipeDown: 'bz-memo-open' };
    const p2 = await createPlugin(makeMockApp());
    expect(p2.settings.launcherGesture).toBe('swipe');
    diskData['bz'] = { gestureTripleTap: 'off' };
    const p3 = await createPlugin(makeMockApp());
    expect(p3.settings.launcherGesture).toBe('off');
  });
});

