/**
 * 禁止读取目录 UI 层测试（票 307）：⚙️ 小橘设置弹窗「读取笔记库」开关行 +「禁止读取目录」
 * 多选行——开关绑定 noteSource 读写与回调、path-picker 多选 chips ✕ 移除写回设置并通知 index。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openSmartcatSettings } from '../../src/smartcat/ui';
import { setSettingsProvider, setSettingsSaver, getSettings } from '../../src/core/settings-provider';

function baseConfig(): any {
  return {
    appearance: 'orange',
    speakInterval: 5,
    speakProbability: 0.3,
    contextLength: 500,
    contextSplitRatio: 0.5,
    conversationHistory: [],
    shortTermMemory: 50,
    noteSource: true,
    proactiveCare: true,
    proactiveWeeklyCap: 2,
    cloudScoring: 'smart',
  };
}

interface Hooks {
  excludedChanged: string[][];
  noteSourceChanged: boolean[];
  saves: number;
}

function openWith(init: { excluded?: string[]; noteSource?: boolean }, hooks: Hooks) {
  const settings: any = {
    memoryDirectories: [],
    smartcatExcludedDirectories: init.excluded ?? [],
  };
  const config = baseConfig();
  if (init.noteSource !== undefined) config.noteSource = init.noteSource;
  setSettingsProvider(() => settings);
  setSettingsSaver(async () => { hooks.saves++; });
  openSmartcatSettings({
    getConfig: () => config,
    saveConfig: async () => { /* config 是闭包对象，断言直接读 config */ },
    settingsKeys: { enabled: true, mobileFullscreen: false },
    setMobileFullscreen: async () => {},
    onMemoryDirectoriesChanged: () => {},
    onNoteSourceChanged: (on) => hooks.noteSourceChanged.push(on),
    onExcludedDirectoriesChanged: (dirs) => hooks.excludedChanged.push([...dirs]),
  });
  return { config, settings };
}

const rowByName = (name: string) => document.querySelector(`.setting-item[data-name="${name}"]`) as HTMLElement | null;

describe('⚙️ 小橘设置：禁止读取目录（票 307）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('空配置：行存在、空态显示紧凑「添加…」按钮，无 chips', () => {
    const hooks: Hooks = { excludedChanged: [], noteSourceChanged: [], saves: 0 };
    openWith({}, hooks);
    const el = rowByName('禁止读取目录');
    expect(el).not.toBeNull();
    expect((el as any).__setting.name).toBe('禁止读取目录');
    expect((el as any).__setting.desc).toContain('一概不读取');
    expect(el!.dataset.filled).toBe('0');
    expect(el!.querySelector('button')?.textContent).toBe('添加…');
  });

  it('已选配置：chips 渲染；✕ 移除写回设置并通知 index（含 saves）', () => {
    const hooks: Hooks = { excludedChanged: [], noteSourceChanged: [], saves: 0 };
    openWith({ excluded: ['我的/日记', '私密'] }, hooks);
    const el = rowByName('禁止读取目录')!;
    const chips = [...el.querySelectorAll('.bz-path-picker-chip-name')].map((n) => n.textContent);
    expect(chips).toEqual(['我的/日记', '私密']);
    expect(el.dataset.filled).toBe('1');
    const x = el.querySelectorAll('.bz-path-picker-chip-x')[0] as HTMLButtonElement;
    x.click();
    expect(getSettings().smartcatExcludedDirectories).toEqual(['私密']);
    expect(hooks.excludedChanged).toEqual([['私密']]);
    expect(hooks.saves).toBe(1);
  });

  it('「读取笔记库」开关：绑定 noteSource，翻转写入 config 并触发回调', async () => {
    const hooks: Hooks = { excludedChanged: [], noteSourceChanged: [], saves: 0 };
    const { config } = openWith({ noteSource: true }, hooks);
    const el = rowByName('读取笔记库')!;
    expect((el as any).__setting.name).toBe('读取笔记库');
    // mock ToggleComponent.setValue 只存 value 不动 checkbox.checked——交互经 trigger 助手驱动；
    // schema 侧 onChange 在 await persist() 之后触发，断言前等一拍宏任务
    const toggle = (el as any).__setting.controls.find((c: any) => c.toggleEl);
    expect(toggle).toBeTruthy();
    expect(toggle.value).toBe(true);
    toggle.trigger(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(config.noteSource).toBe(false);
    expect(hooks.noteSourceChanged).toEqual([false]);
  });
});
