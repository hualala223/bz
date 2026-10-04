import { describe, it, expect } from 'vitest';
import { formAllTags, GROUP_SUBS_OF } from '../../src/cinema/shared';
import { GROUP_ORDER } from '../../src/cinema/constants';

/** 守卫（上游吸收批 4 引入）：GROUP_SUBS_OF 键集合必须覆盖 GROUP_ORDER 全部顶级类型——
 *  批 5cine 与批 4 两次被上游「剧集」口径覆盖，formAllTags 查到 undefined 当场崩（编辑/添加表单全灭）。
 *  此测试就是抓这个回归的（票 309 审计实测后转正）。 */
describe('GROUP_SUBS_OF 键兼容守卫（票 293 七项）', () => {
  it('GROUP_ORDER 每一项（除其他）都在 GROUP_SUBS_OF 且不为 undefined', () => {
    const bad = GROUP_ORDER.filter((g) => g !== '其他' && !Array.isArray(GROUP_SUBS_OF[g]));
    expect(bad, `GROUP_SUBS_OF 缺键: ${bad.join(', ')}`).toEqual([]);
  });
  it('formAllTags 可运行', () => {
    const tags = formAllTags();
    console.log('formAllTags 输出:', tags.join(' / '));
    expect(tags.length).toBeGreaterThan(0);
  });
});
