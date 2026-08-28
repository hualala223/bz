/**
 * smartcat 电源对账 + 命令守卫测试（ticket 103）：
 * 设置页「启用小橘」开关与「关闭方式」三档（stop 彻底停机 / hide 仅隐藏 / lazy 仅不自动启动）
 * 的运行时对账（applySmartcatPowerState）、隐藏启动装配（ensureSmartCat startHidden）、
 * 停机档召唤/聊天命令守卫（toast 拒绝不复活）。
 * 走模块入口 seam（对齐 index-cov/presence 惯例：MockVault + setSettingsProvider + 总线接线）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { setApp } from '../../src/core/app';
import { setSettingsProvider, setSettingsSaver } from '../../src/core/settings-provider';
import { resetObsidianMocks, hasNotice, clearNotices } from '../mock-obsidian-entry';
import { setAISettingsProvider, resetAIProviderCache } from '../../src/core/ai';
import { clearDomainEvents } from '../../src/core/domain-bus';
import { attachObsidianAdapter, detachObsidianAdapter } from '../../src/core/obsidian-adapter';
import {
  ensureSmartCat,
  unloadSmartCat,
  openSmartCat,
  openSmartCatChat,
  hideSmartCat,
  applySmartcatPowerState,
  __getSmartcatInternals,
} from '../../src/smartcat';
import { openSmartcatSettings, CAT_CONTAINER_ID } from '../../src/smartcat/ui';

let settings: any = {
  storagePath: 'CONFIG/STORAGE',
  smartcatEnabled: true,
  smartcatOffMode: 'stop',
  smartcatMobileDefaultFullscreen: false,
};

function makeApp() {
  const vault = new MockVault();
  const app: any = mockAppWithVault(vault);
  setApp(app);
  setSettingsProvider(() => settings);
  setSettingsSaver(async () => {});
  const wsListeners: Record<string, Function[]> = {};
  app.workspace.on = (ev: string, cb: any) => {
    (wsListeners[ev] ||= []).push(cb);
    return { ev, cb };
  };
  app.workspace.offref = (ref: any) => {
    const arr = wsListeners[ref?.ev] || [];
    const idx = arr.indexOf(ref?.cb);
    if (idx >= 0) arr.splice(idx, 1);
    return arr;
  };
  (app as any).__wsListeners = wsListeners;
  detachObsidianAdapter();
  clearDomainEvents();
  attachObsidianAdapter(app);
  return { app, vault };
}

beforeEach(() => {
  resetObsidianMocks();
  clearNotices();
  document.body.innerHTML = '';
  settings = {
    storagePath: 'CONFIG/STORAGE',
    smartcatEnabled: true,
    smartcatOffMode: 'stop',
    smartcatMobileDefaultFullscreen: false,
  };
  unloadSmartCat();
  resetAIProviderCache();
  setAISettingsProvider(() => settings);
});

afterEach(() => {
  unloadSmartCat();
  detachObsidianAdapter();
  clearDomainEvents();
  vi.restoreAllMocks();
});

describe('电源对账（ticket 103）', () => {
  it('stop：对账卸载——容器消失、initialized false', async () => {
    const { app } = makeApp();
    await ensureSmartCat(app);
    await applySmartcatPowerState(app, false, 'stop');
    expect(__getSmartcatInternals().initialized).toBe(false);
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
  });

  it('hide：未装配时隐藏启动装配——子系统在线、容器不出现', async () => {
    const { app } = makeApp();
    await applySmartcatPowerState(app, false, 'hide');
    const st: any = __getSmartcatInternals();
    expect(st.initialized).toBe(true);
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
  });

  it('hide：已装配时收起 DOM、后台仍在', async () => {
    const { app } = makeApp();
    await ensureSmartCat(app);
    await applySmartcatPowerState(app, false, 'hide');
    const st: any = __getSmartcatInternals();
    expect(st.initialized).toBe(true);
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
  });

  it('lazy：已装配当场不动（容器仍在）', async () => {
    const { app } = makeApp();
    await ensureSmartCat(app);
    await applySmartcatPowerState(app, false, 'lazy');
    const st: any = __getSmartcatInternals();
    expect(st.initialized).toBe(true);
    expect(document.getElementById(CAT_CONTAINER_ID)).not.toBeNull();
  });

  it('lazy：未装配也不装配（当场零动作）', async () => {
    const { app } = makeApp();
    await applySmartcatPowerState(app, false, 'lazy');
    expect(__getSmartcatInternals().initialized).toBe(false);
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
  });

  it('重开：停机后 apply(true) 重新装配显示', async () => {
    const { app } = makeApp();
    await ensureSmartCat(app);
    await applySmartcatPowerState(app, false, 'stop');
    await applySmartcatPowerState(app, true, 'stop');
    expect(__getSmartcatInternals().initialized).toBe(true);
    expect(document.getElementById(CAT_CONTAINER_ID)).not.toBeNull();
  });

  it('隐藏启动装配后 openSmartCat 幂等重挂恢复显示', async () => {
    const { app } = makeApp();
    await ensureSmartCat(app, { startHidden: true });
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
    await openSmartCat(app);
    expect(document.getElementById(CAT_CONTAINER_ID)).not.toBeNull();
  });

  it('stop 对账顺带关闭开着的小橘 ⚙️ 设置弹窗', async () => {
    const { app } = makeApp();
    await ensureSmartCat(app);
    const internals: any = __getSmartcatInternals();
    openSmartcatSettings({
      getConfig: () => internals.data.config,
      saveConfig: async () => {},
      settingsKeys: { enabled: true, mobileFullscreen: false },
      setMobileFullscreen: async () => {},
      onClose: () => {},
    });
    expect(document.getElementById('bz-settings-modal-popup')).not.toBeNull();
    await applySmartcatPowerState(app, false, 'stop');
    expect(document.getElementById('bz-settings-modal-popup')).toBeNull();
  });
});

describe('停机档命令守卫（ticket 103）', () => {
  it('stop 档：召唤命令拒绝 + toast，不装配、不挂容器', async () => {
    const { app } = makeApp();
    settings = { storagePath: 'CONFIG/STORAGE', smartcatEnabled: false, smartcatOffMode: 'stop' };
    await openSmartCat(app);
    expect(__getSmartcatInternals().initialized).toBe(false);
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
    expect(hasNotice('小橘已在设置中关闭')).toBe(true);
  });

  it('stop 档：聊天命令拒绝，不弹聊天面板', async () => {
    const { app } = makeApp();
    settings = { storagePath: 'CONFIG/STORAGE', smartcatEnabled: false, smartcatOffMode: 'stop' };
    await openSmartCatChat(app);
    expect(__getSmartcatInternals().initialized).toBe(false);
    expect(document.getElementById('chat-panel')).toBeNull();
    expect(hasNotice('小橘已在设置中关闭')).toBe(true);
  });

  it('lazy 档：召唤即启动（不弹拒绝通知）', async () => {
    const { app } = makeApp();
    settings = { storagePath: 'CONFIG/STORAGE', smartcatEnabled: false, smartcatOffMode: 'lazy' };
    await openSmartCat(app);
    expect(__getSmartcatInternals().initialized).toBe(true);
    expect(document.getElementById(CAT_CONTAINER_ID)).not.toBeNull();
    expect(hasNotice('小橘已在设置中关闭')).toBe(false);
  });

  it('hide 档：隐藏启动后召唤恢复显示', async () => {
    const { app } = makeApp();
    settings = { storagePath: 'CONFIG/STORAGE', smartcatEnabled: false, smartcatOffMode: 'hide' };
    await ensureSmartCat(app, { startHidden: true });
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
    await openSmartCat(app);
    expect(document.getElementById(CAT_CONTAINER_ID)).not.toBeNull();
  });

  it('隐藏命令在停机档为空操作（未初始化早退：无异常、无 DOM 变化）', async () => {
    const { app } = makeApp();
    settings = { storagePath: 'CONFIG/STORAGE', smartcatEnabled: false, smartcatOffMode: 'stop' };
    expect(() => hideSmartCat()).not.toThrow();
    expect(document.getElementById(CAT_CONTAINER_ID)).toBeNull();
    expect(hasNotice('小橘已在设置中关闭')).toBe(false);
  });
});