// @vitest-environment node
/**
 * 娱乐域选项池（票 294 / ADR-0127；票 299 / ADR-0128 题材池按组隔离 + 同日补充默认池改定）。
 * 国家单选池全局共享；题材多选池按顶级类型分组（影视四组/纪录片/公开课/书籍各有专属默认名单）。
 * 默认项并集去重保序；自定义添加持久化到 data.json 组键并固定进后续待选项；幂等。
 * 旧全局键 entertainmentGenres 在组键缺省时作回落（剔除旧默认三项后为真实存量自定义）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_COUNTRY_OPTIONS, DEFAULT_FILM_GENRE_OPTIONS, DEFAULT_DOCUMENTARY_GENRE_OPTIONS,
  DEFAULT_LECTURE_GENRE_OPTIONS, DEFAULT_BOOK_GENRE_OPTIONS,
  getCountryOptions, getGenreOptions, addCountryOption, addGenreOption,
} from '../../src/cinema/options';
import { setSettingsProvider, setSettingsSaver } from '../../src/core/settings-provider';

describe('选项池（票 294，票 299 按组隔离）', () => {
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

  it('默认待选项：国家四项 / 各组题材名单（票 299 补充改定）/ 书籍体裁=中图法 22 大类', () => {
    expect(DEFAULT_COUNTRY_OPTIONS).toEqual(['内地', '港台', '美国', '韩国']);
    expect(DEFAULT_FILM_GENRE_OPTIONS).toEqual([
      '剧情', '喜剧', '动作', '爱情', '科幻/奇幻', '悬疑/惊悚', '历史/传记', '纪实', '动画', '其他',
    ]);
    expect(DEFAULT_DOCUMENTARY_GENRE_OPTIONS).toEqual([
      '历史', '人物传记', '自然地理', '科学科技', '社会人文', '政治军事', '经济商业', '文化艺术',
      '美食旅行', '体育', '犯罪司法', '灾难危机', '健康医疗', '宗教哲学', '教育亲子', '环境动物',
    ]);
    expect(DEFAULT_LECTURE_GENRE_OPTIONS).toEqual([
      '哲学', '经济学', '法学', '教育学', '文学', '历史学', '理学', '工学', '农学', '医学', '管理学', '艺术学',
    ]);
    expect(DEFAULT_BOOK_GENRE_OPTIONS).toHaveLength(22);
    // 默认项不得含存储分隔符「、」（票 299 grill Q5 约束，含补充名单）
    const allDefaults = [
      ...DEFAULT_FILM_GENRE_OPTIONS, ...DEFAULT_DOCUMENTARY_GENRE_OPTIONS,
      ...DEFAULT_LECTURE_GENRE_OPTIONS, ...DEFAULT_BOOK_GENRE_OPTIONS,
    ];
    expect(allDefaults.every((v) => !v.includes('、'))).toBe(true);
    expect(getCountryOptions()).toEqual(['内地', '港台', '美国', '韩国']);
    expect(getGenreOptions('电影')).toEqual(DEFAULT_FILM_GENRE_OPTIONS);
    expect(getGenreOptions('电视剧')).toEqual(DEFAULT_FILM_GENRE_OPTIONS);
    expect(getGenreOptions('短剧')).toEqual(DEFAULT_FILM_GENRE_OPTIONS);
    expect(getGenreOptions('动漫')).toEqual(DEFAULT_FILM_GENRE_OPTIONS);
    expect(getGenreOptions('纪录片')).toEqual(DEFAULT_DOCUMENTARY_GENRE_OPTIONS);
    expect(getGenreOptions('公开课')).toEqual(DEFAULT_LECTURE_GENRE_OPTIONS);
    expect(getGenreOptions('书籍')).toEqual(DEFAULT_BOOK_GENRE_OPTIONS);
    // 未知组回落影视默认
    expect(getGenreOptions('其他')).toEqual(DEFAULT_FILM_GENRE_OPTIONS);
  });

  it('data.json 已存自定义项：与默认项并集去重，默认在前自定义在后', () => {
    settings['entertainmentCountries'] = '泰国、内地、法国';
    settings['entertainmentGenresByGroup'] = { '电影': '科幻、 武侠 、谍战' };
    expect(getCountryOptions()).toEqual(['内地', '港台', '美国', '韩国', '泰国', '法国']);
    expect(getGenreOptions('电影')).toEqual([...DEFAULT_FILM_GENRE_OPTIONS, '科幻', '武侠', '谍战']);
    // 组隔离：电影组的自定义项不进书籍组，也不进纪录片组
    expect(getGenreOptions('书籍')).toEqual(DEFAULT_BOOK_GENRE_OPTIONS);
    expect(getGenreOptions('纪录片')).toEqual(DEFAULT_DOCUMENTARY_GENRE_OPTIONS);
  });

  it('旧全局键回落（票 299 存量平移语义）：剔除旧默认三项，真实自定义全组可见', () => {
    // 模拟存量 data.json：DEFAULT_SETTINGS 里旧键默认值就是「悬疑、爱情、年代」
    settings['entertainmentGenres'] = '悬疑、爱情、年代';
    expect(getGenreOptions('书籍')).toEqual(DEFAULT_BOOK_GENRE_OPTIONS); // 旧默认不污染书籍池
    settings['entertainmentGenres'] = '悬疑、爱情、年代、科幻、武侠';
    expect(getGenreOptions('电影')).toEqual([...DEFAULT_FILM_GENRE_OPTIONS, '科幻', '武侠']);
    expect(getGenreOptions('书籍')).toEqual([...DEFAULT_BOOK_GENRE_OPTIONS, '科幻', '武侠']);
    // 组键一旦写入即以组键为准，不再回落
    settings['entertainmentGenresByGroup'] = { '书籍': '社会学' };
    expect(getGenreOptions('书籍')).toEqual([...DEFAULT_BOOK_GENRE_OPTIONS, '社会学']);
    expect(getGenreOptions('电影')).toEqual([...DEFAULT_FILM_GENRE_OPTIONS, '科幻', '武侠']);
  });

  it('非法存储值（非字符串/非对象）不炸，回落默认', () => {
    settings['entertainmentCountries'] = 42;
    settings['entertainmentGenresByGroup'] = '垃圾';
    expect(getCountryOptions()).toEqual(['内地', '港台', '美国', '韩国']);
    expect(getGenreOptions('电影')).toEqual(DEFAULT_FILM_GENRE_OPTIONS);
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

  it('addGenreOption（按组）：写入组键、互不串组；空串/纯空白不落盘', async () => {
    await addGenreOption('电影', '谍战');
    const byGroup = settings['entertainmentGenresByGroup'] as Record<string, string>;
    expect(byGroup['电影']).toBe('谍战');
    expect(byGroup['书籍']).toBeUndefined();
    expect(savedCount).toBe(1);
    // 书籍组写入不带走电影组的自定义项
    await addGenreOption('书籍', '社会学');
    const byGroup2 = settings['entertainmentGenresByGroup'] as Record<string, string>;
    expect(byGroup2['电影']).toBe('谍战');
    expect(byGroup2['书籍']).toBe('社会学');
    await addGenreOption('电影', '  ');
    expect(byGroup2['电影']).toBe('谍战');
    expect(savedCount).toBe(2);
  });

  it('addGenreOption 幂等 + 回落中的旧自定义项随首次写入固化进组键', async () => {
    settings['entertainmentGenres'] = '谍战';
    await addGenreOption('电影', '谍战'); // 已在回落池中，幂等跳过
    expect(settings['entertainmentGenresByGroup']).toBeUndefined();
    expect(savedCount).toBe(0);
    await addGenreOption('电影', '武侠');
    // 固化：回落读到的旧自定义（谍战）+ 新值一起进组键
    expect((settings['entertainmentGenresByGroup'] as Record<string, string>)['电影']).toBe('谍战、武侠');
  });

  it('addGenreOption/addCountryOption 默认值不重复写入自定义段（票 299 补充名单口径）', async () => {
    await addGenreOption('电影', '剧情'); // 影视四组默认
    await addGenreOption('纪录片', '历史'); // 纪录片默认（注意：电影组里「历史/传记」是默认，单独「历史」不是）
    await addGenreOption('公开课', '法学'); // 学科门类默认
    await addGenreOption('书籍', '文学'); // 文学是书籍默认体裁
    expect(settings['entertainmentGenresByGroup']).toBeUndefined();
    await addCountryOption('美国');
    expect(settings['entertainmentCountries']).toBeUndefined();
    expect(savedCount).toBe(0);
  });
});
