/**
 * 皮肤就绪门控三域接线测试（上游 ADR-0199，票 318 吸收）：
 *  - bookshelf：bsSkinClass 读时回落——远端未就绪回落内置雪松白，种子就绪后挂远端类；
 *  - smartcat：applyAppearance 挂类回落——未就绪落回橘猫（设置值不动），就绪后挂远端类；
 *  - pomodoro：外观组主题行选项走 skinPackOptions——未就绪只剩内置番茄，种子后逐套进卡。
 * 种子用 tests/skin-pack-helpers.ts 的 seedRemoteSkins（票 314 铺设的就绪表测试基建）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { seedRemoteSkins } from './skin-pack-helpers';
import { resetSkinPackState } from '../src/core/skin-pack';
import { setSettingsProvider } from '../src/core/settings-provider';
import { bsSkinClass } from '../src/bookshelf/ui';
import { applyAppearance } from '../src/smartcat/ui';
import { pomodoroSettingsSchema } from '../src/pomodoro/ui';

afterEach(() => {
  resetSkinPackState();
  setSettingsProvider(() => ({} as any));
});

describe('bookshelf 皮肤就绪门控（ADR-0199）', () => {
  it('远端未就绪：bookshelfSkin=noir 读时回落雪松白（设置值不动）', () => {
    setSettingsProvider(() => ({ bookshelfSkin: 'noir' } as any));
    expect(bsSkinClass()).toContain('bz-bs-skin-nordic');
    expect(bsSkinClass()).not.toContain('bz-bs-skin-noir');
  });

  it('种子就绪后：noir 挂远端类（清单顺序外的 mono 仍回落）', () => {
    seedRemoteSkins('bookshelf', ['noir']);
    setSettingsProvider(() => ({ bookshelfSkin: 'noir' } as any));
    expect(bsSkinClass()).toContain('bz-bs-skin-noir');
    setSettingsProvider(() => ({ bookshelfSkin: 'mono' } as any));
    expect(bsSkinClass()).toContain('bz-bs-skin-nordic');
  });
});

describe('smartcat 皮肤就绪门控（ADR-0199）', () => {
  it('远端未就绪：applyAppearance(calico) 落回橘猫类', () => {
    const el = document.createElement('div');
    applyAppearance(el, 'calico');
    expect(el.classList.contains('bz-sc-skin-orange')).toBe(true);
    expect(el.classList.contains('bz-sc-skin-calico')).toBe(false);
  });

  it('种子就绪后：calico 挂远端类 + 遗留 .skin-calico 同步挂（远端皮肤规则消费）', () => {
    seedRemoteSkins('smartcat', ['calico']);
    const el = document.createElement('div');
    applyAppearance(el, 'calico');
    expect(el.classList.contains('bz-sc-skin-calico')).toBe(true);
    expect(el.classList.contains('skin-calico')).toBe(true);
    // 切回内置首套：远端类与遗留类一起摘净
    applyAppearance(el, 'orange');
    expect(el.classList.contains('bz-sc-skin-calico')).toBe(false);
    expect(el.classList.contains('skin-calico')).toBe(false);
  });
});

describe('pomodoro 主题行选项就绪门控（ADR-0199）', () => {
  it('未就绪：外观组主题行只有内置「番茄」一张卡', () => {
    const schema = pomodoroSettingsSchema();
    const look = schema.groups.find((g) => g.name === '外观')!;
    const theme = look.rows.find((r: any) => r.binding?.key === 'pomodoroSkinTheme') as any;
    expect(theme.options.map((o: any) => o.value)).toEqual(['tomato']);
  });

  it('种子九套后：番茄恒首位 + 远端按清单顺序跟进', () => {
    seedRemoteSkins('pomodoro', ['ink', 'grid', 'moss', 'mist', 'sand', 'citrus', 'sakura', 'latte', 'night']);
    const schema = pomodoroSettingsSchema();
    const look = schema.groups.find((g) => g.name === '外观')!;
    const theme = look.rows.find((r: any) => r.binding?.key === 'pomodoroSkinTheme') as any;
    expect(theme.options).toHaveLength(10);
    expect(theme.options[0].value).toBe('tomato');
    expect(theme.options.map((o: any) => o.value)).toContain('ink');
  });
});
