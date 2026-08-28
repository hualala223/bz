/**
 * 设置页测试（覆盖 main.ts BzSettingTab，ADR-0009）：单页两区块（🤖 AI / 📂 数据存储路径）渲染 +
 * 控件交互保存持久化 + storagePath 迁移（旧 7 字段 → 共享路径）。
 * 依赖 mock-obsidian-entry 的 Setting 链式 mock（MockDropdown/MockText/MockToggle）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BzPlugin, { BzSettingTab } from '../src/main';
import { MockVault } from './mock-vault';
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

  it('AI 区块：服务商下拉 + 两个 API Key；数据存储路径区块：storagePath 输入', () => {
    findSetting(tab, 'AI 服务商');
    findSetting(tab, 'DeepSeek API Key');
    findSetting(tab, 'OpenCode Go API Key');
    findSetting(tab, '数据存储路径');
    // 域设置不再出现在设置页（已迁往各域 ⚙️ 弹窗）
    expect([...tab.containerEl.querySelectorAll('.setting-item')].some((s) => (s as HTMLElement).dataset.name === '启动时自动弹窗')).toBe(false);
    expect([...tab.containerEl.querySelectorAll('.setting-item')].some((s) => (s as HTMLElement).dataset.name === '剪藏目录')).toBe(false);
  });

  it('AI 服务商切换更新设置并持久化', async () => {
    const aiSetting = findSetting(tab, 'AI 服务商');
    const dd = (aiSetting as any).__setting.controls.find((c: any) => c.options && 'opencode-go' in c.options);
    dd.trigger('opencode-go');
    await new Promise((r) => setTimeout(r, 10));
    expect(plugin.settings.aiProvider).toBe('opencode-go');
    expect(diskData['bz'].aiProvider).toBe('opencode-go');
  });

  it('数据存储路径输入更新设置并持久化', async () => {
    const el = findSetting(tab, '数据存储路径');
    const text = (el as any).__setting.controls.find((c: any) => typeof c.trigger === 'function' && c.placeholder !== undefined);
    text.trigger('CONFIG/数据');
    await new Promise((r) => setTimeout(r, 10));
    expect(plugin.settings.storagePath).toBe('CONFIG/数据');
    expect(diskData['bz'].storagePath).toBe('CONFIG/数据');
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

describe('🐱 小橘区块（ticket 103：设置页开关 + 三档关闭方式）', () => {
  let plugin: any;
  let tab: BzSettingTab;

  /** 不触发 onLayoutReady（避免 onload 自动装配小橘的异步噪音，测试显式驱动） */
  function makeNoLayoutApp() {
    const app = makeMockApp();
    app.workspace.onLayoutReady = () => {};
    return app;
  }

  const offModeRow = () => findSetting(tab, '关闭方式');
  const offModeDd = () => (offModeRow() as any).__setting.controls.find((c: any) => c.options);
  const enabledToggle = () => controlOf(findSetting(tab, '启用小橘'));

  beforeEach(async () => {
    resetObsidianMocks();
    delete diskData['bz'];
    document.body.innerHTML = '';
    // 前置 describe（makeMockApp 触发 layout-ready）可能残留异步装配——先清模块态保证幂等早退不干扰
    unloadSmartCat();
    plugin = await createPlugin(makeNoLayoutApp());
    tab = new BzSettingTab(plugin.app, plugin);
    tab.display();
  });

  afterEach(() => {
    if (plugin && plugin.unregisterGestures) plugin.unregisterGestures();
  });

  it('渲染：启用开关默认开 + 关闭方式下拉（stop/hide/lazy 三选项、默认 stop），下拉默认隐藏', () => {
    expect(enabledToggle().value).toBe(true);
    const dd = offModeDd();
    expect(dd).toBeTruthy();
    expect(dd.value).toBe('stop');
    expect(Object.keys(dd.options)).toEqual(['stop', 'hide', 'lazy']);
    // 开关开启时「关闭方式」下拉行隐藏（bz-setting-hidden）
    expect(offModeRow().classList.contains('bz-setting-hidden')).toBe(true);
  });

  it('关开关（默认 stop）：立即停机，下拉行现身，设置持久化', async () => {
    await ensureSmartCat(plugin.app);
    expect(__getSmartcatInternals().initialized).toBe(true);
    expect(document.getElementById(CAT_CONTAINER_ID)).not.toBeNull();

    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(false));
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
    expect(plugin.settings.smartcatEnabled).toBe(false);
    expect(diskData['bz'].smartcatEnabled).toBe(false);
    expect(diskData['bz'].smartcatOffMode).toBe('stop');
    // 关闭后「关闭方式」下拉行现身
    expect(offModeRow().classList.contains('bz-setting-hidden')).toBe(false);
  });

  it('开开关（停机后重开）：重新装配并显示，不丢数据', async () => {
    await ensureSmartCat(plugin.app);
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(false));

    enabledToggle().trigger(true);
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(true));
    expect(document.getElementById(CAT_CONTAINER_ID)).not.toBeNull();
    expect(diskData['bz'].smartcatEnabled).toBe(true);
  });

  it('关开关（仅隐藏档）：未装配时隐藏启动装配——子系统在线但容器不出现，下拉选项持久化', async () => {
    offModeDd().trigger('hide');
    await new Promise((r) => setTimeout(r, 10));
    expect(diskData['bz'].smartcatOffMode).toBe('hide');

    enabledToggle().trigger(false);
    // 装配启动：initialized 在 ensure 入口同步翻真（隐藏启动容器全程不出现）
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(true));
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
  });

  it('关开关（仅隐藏档）：已装配时收起 DOM、后台仍在', async () => {
    await ensureSmartCat(plugin.app);
    offModeDd().trigger('hide');
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull());
    expect(__getSmartcatInternals().initialized).toBe(true);
  });

  it('关开关（仅不自动启动档）：当场不动——容器仍在、子系统在线（Q8 拍板）', async () => {
    await ensureSmartCat(plugin.app);
    offModeDd().trigger('lazy');
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(diskData['bz'].smartcatEnabled).toBe(false));
    expect(__getSmartcatInternals().initialized).toBe(true);
    expect(document.getElementById(CAT_CONTAINER_ID)).not.toBeNull();
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
    enabledToggle().trigger(false);
    await vi.waitFor(() => expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull());

    offModeDd().trigger('stop');
    await vi.waitFor(() => expect(__getSmartcatInternals().initialized).toBe(false));
  });
});
