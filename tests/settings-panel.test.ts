/**
 * 设置面板域测试（settings-panel，ADR-0080；上游线并入后的本地口径版）
 *
 * 上游原测试深度绑定上游域清单（todo/cinema/bookshelf/clipbook 及其 per-provider AI 行），
 * 本仓库未并入这些域，故按本地域集重写聚焦断言：
 * - DOMAINS/NAV_SECS 不变量：本地域名、图标非空、分组 id 有定义、无上游独占域；
 * - listableDomains / loadedCounts 可见性逻辑（noSettings 与零项域剔除）；
 * - general/ai 加载器从本地 mainSettingsSchema 按组名拆分；general 组尾挂「数据体检」按钮行。
 * 面板壳/渲染器 UI 流程为上游未改动结构（仅换数据表），其行为由上游线验证。
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mainSettingsSchemaMock, openDataCheckupMock } = vi.hoisted(() => ({
  mainSettingsSchemaMock: vi.fn(),
  openDataCheckupMock: vi.fn(),
}));

vi.mock('../src/core/settings-main-schema', () => ({
  mainSettingsSchema: mainSettingsSchemaMock,
  STORAGE_PATH_COMMIT_NOTICE: '存储路径已修改',
}));

vi.mock('../src/checkup', () => ({
  openDataCheckup: openDataCheckupMock,
}));

import { DOMAINS, NAV_SECS, listableDomains, loadedCounts } from '../src/settings-panel/ui';
import { DOMAIN_ICONS } from '../src/core/domain-icons';
import { appearanceSettingsSchema } from '../src/settings-panel/schema';
import { setApp } from '../src/core/app';
import type { SettingsSchema } from '../src/core/settings-schema';

beforeEach(() => {
  loadedCounts.clear();
  mainSettingsSchemaMock.mockReset();
  openDataCheckupMock.mockReset();
  setApp({} as never); // general 按钮回调里 getApp() 需要
});

describe('设置面板域清单（本地口径）', () => {
  it('包含本地 20 域与上游并入新域，且不含上游独占域', () => {
    const ids = DOMAINS.map((d) => d.id);
    // 本地既有域
    for (const id of ['global', 'ai', 'diary', 'todo', 'belongings', 'clipping', 'favorites', 'movie', 'bookshelf', 'review', 'secondbrain', 'pomodoro', 'password', 'encrypt', 'literature', 'smartcat']) {
      expect(ids, `缺本地域 ${id}`).toContain(id);
    }
    // 上游并入新域
    for (const id of ['diary-wall', 'home']) {
      expect(ids, `缺并入域 ${id}`).toContain(id);
    }
    // 上游独占域不得出现（todo 已随 ADR-0092 换血并入，不再属上游独占）
    for (const id of ['memo', 'cinema', 'clipbook', 'recap', 'checkup']) {
      expect(ids, `不应出现上游独占域 ${id}`).not.toContain(id);
    }
  });

  it('域名映射本地口径：备忘录/影视/书库/密码本/保险箱（非上游命名）', () => {
    const nameOf = (id: string) => DOMAINS.find((d) => d.id === id)?.name;
    expect(nameOf('todo')).toBe('待办');
    expect(nameOf('movie')).toBe('影视');
    expect(nameOf('bookshelf')).toBe('书库');
    expect(nameOf('password')).toBe('密码本');
    expect(nameOf('encrypt')).toBe('保险箱');
    expect(nameOf('diary-wall')).toBe('回忆墙');
  });

  it('图标一律取自 DOMAIN_ICONS（个别上游无键的本地域用 lucide 字符串）；除上游既定 ai/auto-summary 同用 sparkles 外不重复', () => {
    const icons = DOMAINS.map((d) => d.icon);
    for (const d of DOMAINS) {
      expect(d.icon, `${d.id} 图标为空`).toBeTruthy();
    }
    // 豁免对：ai 与 auto-summary 上游同用 sparkles（enh-sweep-a 记录的历史重复对，两键均为表值）
    const exempt = DOMAINS.filter((d) => !['ai', 'auto-summary'].includes(d.id)).map((d) => d.icon);
    expect(new Set(exempt).size).toBe(exempt.length);
    // 单一事实源引用抽查：DOMAIN_ICONS 里有的键必须取表值
    for (const d of DOMAINS) {
      if (DOMAIN_ICONS[d.id] !== undefined) {
        expect(d.icon, `${d.id} 图标应取 DOMAIN_ICONS.${d.id}`).toBe(DOMAIN_ICONS[d.id]);
      }
    }
  });

  it('NAV_SECS 分组 id 全部在 DOMAINS 内有定义，且覆盖全部有设置项的域', () => {
    const ids = new Set(DOMAINS.map((d) => d.id));
    const grouped = NAV_SECS.flatMap((s) => s.ids);
    for (const id of grouped) {
      expect(ids.has(id), `NAV_SECS 引用了未定义域 ${id}`).toBe(true);
    }
    for (const d of DOMAINS) {
      if (d.schemaLoader) {
        expect(grouped, `有设置项的域 ${d.id} 未归组`).toContain(d.id);
      }
    }
  });
});

describe('可见性：listableDomains', () => {
  it('noSettings 域不进列表；loadedCounts 记 0 的域剔除、未加载的保留', () => {
    const listableIds = () => listableDomains().map((d) => d.id);
    // 初始（未加载）：noSettings 之外全保留
    expect(listableIds()).toContain('todo');
    expect(listableIds()).not.toContain('news');

    // 某域当前端可见项数 0 → 剔除
    loadedCounts.set('movie', 0);
    expect(listableIds()).not.toContain('movie');
    // 恢复非零 → 回到列表
    loadedCounts.set('movie', 3);
    expect(listableIds()).toContain('movie');
    loadedCounts.delete('movie');
    expect(listableIds()).toContain('movie');
  });
});

describe('外观域 schema（settings-panel 自身设置）', () => {
  it('单组「外观」：布局行绑 settingsPanelLayout、主题行绑 settingsPanelSkin，默认经纬/晨昏', () => {
    const schema = appearanceSettingsSchema();
    expect(schema.groups).toHaveLength(1);
    const [layout, skin] = schema.groups[0].rows as Array<{ binding: { key: string }; options?: Array<{ value: string; label: string }> }>;
    expect(layout.binding).toEqual({ key: 'settingsPanelLayout' });
    expect(skin.binding).toEqual({ key: 'settingsPanelSkin' });
    const optionsOf = (row: { options?: Array<{ value: string }> }) => row.options?.map((o) => o.value);
    expect(optionsOf(layout)).toEqual(['jingwei']);
    expect(optionsOf(skin)).toEqual(['chenhun']);
  });
});

describe('通用/AI 加载器（本地 mainSettingsSchema 按组名拆分）', () => {
  const fullSchema: SettingsSchema = {
    groups: [
      {
        name: '🤖 AI',
        rows: [{ type: 'select', name: 'AI 服务商', binding: { key: 'aiProvider' }, options: [] }],
      },
      {
        name: '📂 数据存储路径',
        rows: [{ type: 'path', mode: 'single', name: '数据存储路径', binding: { key: 'storagePath' } }],
      },
    ],
  };

  it('general：只保留存储路径组，组尾挂「数据体检」按钮行（点击调 openDataCheckup）', async () => {
    mainSettingsSchemaMock.mockReturnValue(fullSchema);
    // 动态 import 拿内部 schemaLoaders 不可行（非导出），经 DOMAINS 的 schemaLoader 触发
    const general = DOMAINS.find((d) => d.id === 'global')!;
    expect(general.schemaLoader).toBeTruthy();
    const schema = await general.schemaLoader!();
    expect(schema.groups.map((g) => g.name)).toEqual(['📂 数据存储路径']);
    const last = schema.groups[0].rows[schema.groups[0].rows.length - 1] as { name: string; onClick?: () => void };
    expect(last.name).toBe('数据体检');
    last.onClick?.();
    expect(openDataCheckupMock).toHaveBeenCalledTimes(1);
  });

  it('ai：只保留 AI 组（与服务商行）', async () => {
    mainSettingsSchemaMock.mockReturnValue(fullSchema);
    const ai = DOMAINS.find((d) => d.id === 'ai')!;
    const schema = await ai.schemaLoader!();
    expect(schema.groups.map((g) => g.name)).toEqual(['🤖 AI']);
    expect((schema.groups[0].rows[0] as { name: string }).name).toBe('AI 服务商');
  });
});
