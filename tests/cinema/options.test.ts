// @vitest-environment node
/**
 * 娱乐域选项池（票 294 / ADR-0127）：国家单选池 + 题材多选池。
 * 默认项并集去重保序；自定义添加持久化到 data.json 两键并固定进后续待选项；幂等。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_COUNTRY_OPTIONS, DEFAULT_GENRE_OPTIONS,
  getCountryOptions, getGenreOptions, addCountryOption, addGenreOption,
} from '../../src/cinema/options';
import { setSettingsProvider, setSettingsSaver } from '../../src/core/settings-provider';

describe('选项池（票 294）', () => {
  let settings: Record<string, unknown>;
  let savedCount: number;

  beforeEach(() => {
    settings = {};
    savedCount = 0;
    setSettingsProvider(() => settings as any);
    setSettingsSaver(async () => { savedCount++; });
  });

  afterEach(() => {
    setSettingsProvider(() => ({}) as any);
    setSettingsSaver(async () => {});
  });

  it('默认待选项：国家四项 / 题材三项（未配置时回落）', () => {
    expect(DEFAULT_COUNTRY_OPTIONS).toEqual(['内地', '港台', '美国', '韩国']);
    expect(DEFAULT_GENRE_OPTIONS).toEqual(['悬疑', '爱情', '年代']);
    expect(getCountryOptions()).toEqual(['内地', '港台', '美国', '韩国']);
    expect(getGenreOptions()).toEqual(['悬疑', '爱情', '年代']);
  });

  it('data.json 已存自定义项：与默认项并集去重，默认在前自定义在后', () => {
    settings['entertainmentCountries'] = '泰国、内地、法国';
    settings['entertainmentGenres'] = '科幻、 悬疑 、武侠';
    expect(getCountryOptions()).toEqual(['内地', '港台', '美国', '韩国', '泰国', '法国']);
    expect(getGenreOptions()).toEqual(['悬疑', '爱情', '年代', '科幻', '武侠']);
  });

  it('非法存储值（非字符串）不炸，回落默认', () => {
    settings['entertainmentCountries'] = 42;
    expect(getCountryOptions()).toEqual(['内地', '港台', '美国', '韩国']);
  });

  it('addCountryOption：新值持久化并固定；已有值幂等跳过', async () => {
    await addCountryOption('泰国');
    expect(settings['entertainmentCountries']).toBe('泰国');
    expect(savedCount).toBe(1);
    expect(getCountryOptions()).toEqual(['内地', '港台', '美国', '韩国', '泰国']);
    // 再加一个：保留已有自定义项，追加在后
    await addCountryOption('法国');
    expect(settings['entertainmentCountries']).toBe('泰国、法国');
    // 幂等：已存在不落盘
    await addCountryOption('泰国');
    expect(settings['entertainmentCountries']).toBe('泰国、法国');
    expect(savedCount).toBe(2);
  });

  it('addGenreOption：同口径；空串/纯空白不落盘', async () => {
    await addGenreOption('科幻');
    expect(settings['entertainmentGenres']).toBe('科幻');
    await addGenreOption('  ');
    expect(settings['entertainmentGenres']).toBe('科幻');
    expect(savedCount).toBe(1);
  });

  it('addCountryOption 默认值不重复写入自定义段', async () => {
    await addCountryOption('美国');
    expect(settings['entertainmentCountries']).toBeUndefined();
    expect(savedCount).toBe(0);
  });
});
