/**
 * 骨架加载冒烟（ticket 01）：mock obsidian 环境下插件可加载、
 * 37 命令裸注册、ribbon 主入口、设置页挂载、卸载清理命令（ticket 170 加「批量加入复习计划」后）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import BzPlugin, { BzSettingTab } from '../src/main';
import { MockVault } from './mock-vault';
import { resetObsidianMocks, getNoticeMessages, hasNotice, clearNotices } from './mock-obsidian-entry';
import { notify } from '../src/core/notice';

// ai-agent 域解散后的新注册点隔离：ensureFileSync（todo）/ensureFavoritesFileSync 换 spy
// （vi.mock 局部替换，其余导出保持真实实现，命令回调冒烟等用例不受影响）
const syncSpies = vi.hoisted(() => ({
  ensureFileSync: vi.fn(),
  ensureFavoritesFileSync: vi.fn(),
}));
vi.mock('../src/todo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureFileSync: syncSpies.ensureFileSync,
}));
vi.mock('../src/favorites', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureFavoritesFileSync: syncSpies.ensureFavoritesFileSync,
}));

// 小橘启动门控（ticket 103）：mock ensureSmartCat spy，同步断言四态启动姿态（不依赖异步装配完成）
const smartcatSpies = vi.hoisted(() => ({
  ensureSmartCat: vi.fn(),
}));
vi.mock('../src/smartcat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureSmartCat: smartcatSpies.ensureSmartCat,
}));

/** 构造 mock app（workspace/vault/commands/metadataCache 最小面） */
function makeMockApp() {
  const vault = new MockVault();
  return {
    vault,
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      getActiveFile: () => null,
      getActiveViewOfType: () => null,
      activeEditor: null,
      on: () => ({ ref: 'ref' }),
    },
    commands: {
      addCommand: (c: any) => {
        registeredCommands.push(c);
      },
      removeCommand: (id: string) => {
        removedCommands.push(id);
      },
      listCommands: () => [],
      executeCommandById: () => {},
    },
    metadataCache: { getFileCache: () => null, getBacklinksForFile: () => null, on: () => ({ ref: 'ref' }) },
    fileManager: { processFrontMatter: () => Promise.resolve() },
  };
}

const removedCommands: string[] = [];
const registeredCommands: any[] = [];

/** 期望的命令 id 全集（spec「命令 id 全清单」第 9 轮：COMMANDS 表 + 日记本 bz-diary-open） */
const EXPECTED_COMMAND_IDS = [
  'bz-home',
  // 上游线并入新域（第一档）：内容首页/今日回顾/回忆墙/数据体检/设置面板
  'bz-home-open', 'bz-recap-today', 'bz-diary-wall-open', 'bz-data-checkup-open', 'bz-settings-panel-open',
  'bz-todo-open', 'bz-todo-add',
  'bz-belongings-add', 'bz-belongings-open',
  'bz-clipbook-open',
  'bz-pw-open', 'bz-pw-add', 'bz-pw-generate',
  'bz-favorites-open', 'bz-favorites-add',
  'bz-bookshelf-open',
  'bz-reading-report-open',
  'bz-cinema-open', 'bz-cinema-add', 'bz-cinema-analysis',
  'bz-review-count', 'bz-review-add-current', 'bz-review-add-current-with-links',
  // 上游线 P2/P3：复习统计报告 + 快速复制密码
  'bz-review-report', 'bz-encrypt-copy-password',
  'bz-secondbrain-panel', 'bz-secondbrain-open', 'bz-secondbrain-chat', 'bz-secondbrain-rebuild-links', 'bz-secondbrain-link-all',
  'bz-pomodoro-open',
  'bz-literature-open', 'bz-literature-note-term',
  'bz-attach-move',
  'bz-encrypt-open', 'bz-encrypt-lock',
  'bz-smartcat-open', 'bz-smartcat-chat', 'bz-smartcat-hide', 'bz-smartcat-dashboard',
  'bz-diary-open',
];

/** 内存"磁盘"存储：模拟 Obsidian 插件的 data.json 持久层 */
const diskData: Record<string, any> = {};

async function createPlugin(app: any) {
  const plugin: any = new BzPlugin(app, {} as any);
  plugin.app = app;
  // MockPlugin.loadData/saveData 走共享 diskData（模拟插件 data.json）
  plugin.loadData = async () => diskData['bz'] ?? null;
  plugin.saveData = async (d: any) => {
    diskData['bz'] = d;
  };
  await plugin.onload();
  return plugin;
}

describe('bz 骨架冒烟', () => {
  beforeEach(() => {
    resetObsidianMocks();
    removedCommands.length = 0;
    registeredCommands.length = 0;
    delete diskData['bz'];
    document.body.innerHTML = '';
  });

  it('onload 裸注册全部命令 id（统一 bz- 前缀，app.commands 原样 id 注册）', async () => {
    await createPlugin(makeMockApp());

    const ids = registeredCommands.map((c: any) => c.id);
    // 含日记本 init 内注册的命令（bz-diary-write）
    const expected = [...EXPECTED_COMMAND_IDS, 'bz-diary-write'];
    expect(ids.sort()).toEqual(expected.sort());
    // 均未设置默认快捷键
    for (const c of registeredCommands) {
      expect(c.hotkeys).toBeUndefined();
    }
  });

  it('ribbon 主入口指向待办面板（上游 ADR-0092：todo 接管备忘录）', async () => {
    const plugin = await createPlugin(makeMockApp());

    expect(plugin.ribbonIcons.length).toBeGreaterThanOrEqual(1);
    expect(plugin.ribbonIcons[0].title).toBe('待办');
  });

  it('命令名统一（f3/f7/t1/t2，id 不动）与重复图标去重（f7）', async () => {
    await createPlugin(makeMockApp());
    const byId = (id: string) => registeredCommands.find((c: any) => c.id === id)!;
    // t1：主页 → 入口页（术语随 CONTEXT.md；id bz-home 不变）
    expect(byId('bz-home').name).toBe('入口页');
    // f3：新建类动词统一（加待办/加影视，与加物品/加密码/加收藏一致；上游 ADR-0092 memo→todo）
    expect(byId('bz-todo-add').name).toBe('加待办');
    expect(byId('bz-cinema-add').name).toBe('加影视');
    // t2：阅读分析报告 → 阅读数据分析报告
    expect(byId('bz-reading-report-open').name).toBe('阅读分析报告'); // 上游 ADR-0091：报告内嵌书架墙，正名收短
    // ticket 168：复习域单一入口——仅「复习（按数量）」命令保留，10 个旧命令已退役
    expect(byId('bz-review-count').name).toBe('复习（按数量）');
    // ticket 169：「加入复习计划」加回——editorCallback 注册（命令面板 + 快捷键 + 文档右键待选）
    expect(byId('bz-review-add-current').name).toBe('将当前文档加入复习计划');
    expect(typeof byId('bz-review-add-current').editorCallback).toBe('function');
    // ticket 170：「批量加入复习计划」——当前文档及一级出链一起加入
    expect(byId('bz-review-add-current-with-links').name).toBe('批量加入复习计划');
    expect(typeof byId('bz-review-add-current-with-links').editorCallback).toBe('function');
    // f7：第二大脑面板与第二大脑参考区分（不再与功能名歧义）
    expect(byId('bz-secondbrain-panel').name).toBe('第二大脑面板');
    expect(byId('bz-secondbrain-open').name).toBe('第二大脑参考');
    // f7：重复图标去重——clapperboard / message-circle 各只出现一次
    const icons = registeredCommands.map((c: any) => c.icon);
    expect(icons.filter((i: string) => i === 'clapperboard')).toHaveLength(1);
    expect(icons.filter((i: string) => i === 'message-circle')).toHaveLength(1);
    expect(byId('bz-cinema-analysis').icon).toBe('pie-chart');
    expect(byId('bz-smartcat-chat').icon).toBe('messages-square');
  });

  it('onunload 清理 toast 容器（UX 整改 l2-toast）', async () => {
    const plugin = await createPlugin(makeMockApp());
    // createPlugin 期间日记本 mock 加载失败会弹一条 error 通知（既有噪音），先清空再精确计数
    clearNotices();
    notify('一条提示', { type: 'info' });
    expect(document.querySelectorAll('.bz-notice')).toHaveLength(1);
    await plugin.onunload();
    expect(document.getElementById('bz-notice-container')).toBeNull();
    expect(document.querySelectorAll('.bz-notice')).toHaveLength(0);
    // 卸载后如再触发通知也能重建容器（模块单例未被销毁）
    notify('重建');
    expect(document.getElementById('bz-notice-container')).not.toBeNull();
    clearNotices();
  });

  it('设置页挂载且含 AI 配置骨架', async () => {
    const plugin = await createPlugin(makeMockApp());

    expect(plugin.settingTabs.length).toBe(1);
    expect(plugin.settingTabs[0]).toBeInstanceOf(BzSettingTab);
  });

  it('默认设置与源码默认值一致（抽查）', async () => {
    const plugin = await createPlugin(makeMockApp());

    const s = plugin.settings;
    expect(s.articleDirectory).toBe('归档/网页剪藏');
    expect(s.articleDirectory).toBe('归档/网页剪藏');
    expect(s.cinemaFolderPath).toBe('我的/影视');
    expect(s.bookshelfFolderPath).toBe(''); // 上游换血：空=运行时回落旧 libraryFolderPath 存量值
    expect(s.favoritesStoragePath).toBe('CONFIG/STORAGE');
    expect(s.secondBrainOllamaUrl).toBe('http://localhost:11434');
    expect(s.secondBrainEmbeddingModel).toBe('bge-m3');
    expect(s.passwordLength).toBe('16');
  });

  it('域命令回调不抛异常（已实现域真实执行，未实现域占位 Notice）', async () => {
    // 超时放宽到 15s：并行高负载下闪念/复习等异步初始化可能超过默认 5s
    const plugin = await createPlugin(makeMockApp());

    // 已实现域：归物本命令真实打开弹窗（异步），同步调用不抛错
    const cmd1 = registeredCommands.find((c: any) => c.id === 'bz-belongings-add');
    expect(() => cmd1.callback()).not.toThrow();
    // 已实现域：复习（按数量）异步执行，同步调用不抛错（ticket 168：单一入口，其余复习命令已退役）
    expect(() => registeredCommands.find((c: any) => c.id === 'bz-review-count').callback()).not.toThrow();
    expect(() => registeredCommands.find((c: any) => c.id === 'bz-reading-report-open').callback()).not.toThrow();
  }, 15000);
  it('全部 37 命令回调冒烟：逐个调用覆盖各域懒加载入口（含日记本 init 两个命令）', async () => {
    const plugin = await createPlugin(makeMockApp());
    const failures: string[] = [];
    for (const c of registeredCommands) {
      try {
        c.callback();
        // 让异步初始化微任务跑完（不等待网络/长定时器）
        await new Promise((r) => setTimeout(r, 5));
      } catch (e) {
        failures.push(`${c.id}: ${(e as Error).message}`);
      }
    }
    expect(failures, `失败命令:
${failures.join('\n')}`).toEqual([]);
    expect(registeredCommands.length).toBeGreaterThanOrEqual(37);
  }, 15000);
  it('事件常驻域开关开启时 onload 注册（autoSummary/aiAgent→todo+favorites 文件同步/secondBrain 懒加载分支；旧 flashEnabled 键随 ticket 103 迁移）', async () => {
    delete diskData['bz'];
    // 故意种旧键：验证 onload 迁移把 flashEnabled 平移为 secondBrainEnabled
    diskData['bz'] = { autoSummaryEnabled: true, aiAgentEnabled: true, flashEnabled: true };
    syncSpies.ensureFileSync.mockClear();
    syncSpies.ensureFavoritesFileSync.mockClear();
    const app = makeMockApp();
    const plugin = await createPlugin(app);
    // aiAgent 键名不变（旧 data.json 兼容）：开启后 onLayoutReady 触发新注册点——
    // todo/favorites 两路文件同步 ensure 各恰好一次，均不抛错
    expect(plugin.settings.autoSummaryEnabled).toBe(true);
    expect(plugin.settings.aiAgentEnabled).toBe(true);
    expect(plugin.settings.secondBrainEnabled).toBe(true);
    expect(plugin.settings.flashEnabled).toBeUndefined();
    expect(syncSpies.ensureFileSync).toHaveBeenCalledTimes(1);
    expect(syncSpies.ensureFileSync).toHaveBeenCalledWith(app);
    expect(syncSpies.ensureFavoritesFileSync).toHaveBeenCalledTimes(1);
    expect(syncSpies.ensureFavoritesFileSync).toHaveBeenCalledWith(app);
  }, 15000);
  it('onunload 清理全部裸注册命令', async () => {
    const plugin = await createPlugin(makeMockApp());
    plugin.onunload();

    // 含日记本 init 内注册的命令（bz-diary-write）
    const expectedRemoved = [...EXPECTED_COMMAND_IDS, 'bz-diary-write'];
    expect(removedCommands.sort()).toEqual(expectedRemoved.sort());
  });

  it('设置持久化（saveData/loadData 往返）', async () => {
    const plugin = await createPlugin(makeMockApp());

    plugin.settings.todoFilePath = '自定义/路径';
    await plugin.saveSettings();
    expect(diskData['bz'].todoFilePath).toBe('自定义/路径');

    // 重新加载时合并默认值
    const plugin2 = await createPlugin(makeMockApp());
    expect(plugin2.settings.todoFilePath).toBe('自定义/路径');
    expect(plugin2.settings.cinemaFolderPath).toBe('我的/影视');
  });
});

describe('小橘启动门控（ticket 103）', () => {
  beforeEach(() => {
    smartcatSpies.ensureSmartCat.mockClear();
  });

  it('开启：onLayoutReady 调 ensureSmartCat、无隐藏旗标', async () => {
    await createPlugin(makeMockApp());
    expect(smartcatSpies.ensureSmartCat).toHaveBeenCalledTimes(1);
    expect(smartcatSpies.ensureSmartCat.mock.calls[0][1]).toBeUndefined();
  });

  it('关闭 + 彻底停机：不自动挂载', async () => {
    diskData['bz'] = { smartcatEnabled: false, smartcatOffMode: 'stop' };
    await createPlugin(makeMockApp());
    expect(smartcatSpies.ensureSmartCat).not.toHaveBeenCalled();
  });

  it('关闭 + 仅不自动启动：不自动挂载', async () => {
    diskData['bz'] = { smartcatEnabled: false, smartcatOffMode: 'lazy' };
    await createPlugin(makeMockApp());
    expect(smartcatSpies.ensureSmartCat).not.toHaveBeenCalled();
  });

  it('关闭 + 仅隐藏：隐藏启动装配（startHidden 旗标）', async () => {
    diskData['bz'] = { smartcatEnabled: false, smartcatOffMode: 'hide' };
    await createPlugin(makeMockApp());
    expect(smartcatSpies.ensureSmartCat).toHaveBeenCalledTimes(1);
    expect(smartcatSpies.ensureSmartCat.mock.calls[0][1]).toEqual({ startHidden: true });
  });

  it('四个小橘命令照常注册（开关不改变命令表）', async () => {
    diskData['bz'] = { smartcatEnabled: false, smartcatOffMode: 'stop' };
    await createPlugin(makeMockApp());
    const ids = registeredCommands.map((c: any) => c.id);
    for (const id of ['bz-smartcat-open', 'bz-smartcat-chat', 'bz-smartcat-hide', 'bz-smartcat-dashboard']) {
      expect(ids).toContain(id);
    }
  });
});
