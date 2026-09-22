/**
 * 影院（cinema）午夜场布局：rail/chips 视图切换高亮口径（票 271 吸收）
 * ai/stat 页 rail 整体熄灭（含「全部」）——筛选控件非列表页不表达选中；返回列表原高亮恢复。
 */
import { describe, it, expect } from 'vitest';
import { railHtml, chipsHtml } from '../../src/cinema/layouts/midnight/render';

const items = [
  { name: '甲', group: '电影', status: 0, typeTag: '电影', country: '内地' },
  { name: '乙', group: '电视剧', status: 2, typeTag: '美剧', country: '美国' },
  { name: '丙', group: '电影', status: 1, typeTag: '电影', country: null },
] as any;

function viewOf(over: Record<string, unknown> = {}) {
  return { view: 'list', typeFilter: null, statusFilter: null, countryFilter: null, searchKeyword: '', sortMode: 'date', ...over } as any;
}

describe('影院 rail/chips 视图切换高亮口径（票 271）', () => {
  it('列表页：无筛选时「全部」高亮', () => {
    const r = railHtml(items, viewOf());
    expect(r.groups).toContain('is-on" data-g="全部"');
    expect(r.status).not.toContain('is-on');
    expect(chipsHtml(viewOf())).toContain('chip is-on" data-c="all"');
  });

  it('列表页：选中类型/状态时各高亮自身（「全部」熄灭）', () => {
    const r = railHtml(items, viewOf({ typeFilter: '电视剧' }));
    expect(r.groups).toContain('is-on" data-g="电视剧"');
    expect(r.groups).not.toContain('is-on" data-g="全部"');
    expect(railHtml(items, viewOf({ statusFilter: '已看' })).status).toContain('is-on" data-s="已看"');
    expect(chipsHtml(viewOf({ typeFilter: '电影' }))).toContain('chip is-on" data-c="电影"');
  });

  it('ai/stat 页：rail 与 chips 整组熄灭（含「全部」），筛选状态本身保留', () => {
    for (const v of ['ai', 'stat'] as const) {
      const view = viewOf({ view: v, typeFilter: '电视剧' });
      expect(railHtml(items, view).groups).not.toContain('is-on');
      expect(railHtml(items, view).status).not.toContain('is-on');
      expect(chipsHtml(view)).not.toContain('is-on');
      expect(view.typeFilter).toBe('电视剧'); // 筛选状态未被渲染层清掉
    }
  });

  it('返回列表：先前选中的高亮原样恢复', () => {
    expect(railHtml(items, viewOf({ view: 'ai', typeFilter: '电视剧' })).groups).not.toContain('is-on');
    expect(railHtml(items, viewOf({ view: 'list', typeFilter: '电视剧' })).groups).toContain('is-on" data-g="电视剧"');
  });
});

describe('国家筛选条（票 294）', () => {
  it('rail 国家组：只列数据里出现过的国家 + 未填桶，计数正确', () => {
    const r = railHtml(items, viewOf());
    expect(r.countries).toContain('data-cn="内地"');
    expect(r.countries).toContain('data-cn="美国"');
    expect(r.countries).toContain('data-cn="未填"');
    expect(r.countries).not.toContain('data-cn="韩国"');
  });

  it('rail：点国家/未填高亮自身，「全部」熄灭', () => {
    const r = railHtml(items, viewOf({ countryFilter: '内地' }));
    expect(r.countries).toContain('is-on" data-cn="内地"');
    expect(r.groups).not.toContain('is-on" data-g="全部"');
    expect(railHtml(items, viewOf({ countryFilter: '未填' })).countries).toContain('is-on" data-cn="未填"');
  });

  it('无条目缺国家时不出「未填」桶', () => {
    const noEmpty = [{ name: '甲', group: '电影', status: 0, typeTag: '电影', country: '内地' }] as any;
    expect(railHtml(noEmpty, viewOf()).countries).not.toContain('data-cn="未填"');
  });

  it('chips：国家片与未填桶出现且可高亮', () => {
    expect(chipsHtml(viewOf(), items)).toContain('data-cn="内地"');
    expect(chipsHtml(viewOf(), items)).toContain('data-cn="未填"');
    expect(chipsHtml(viewOf({ countryFilter: '美国' }), items)).toContain('is-on" data-cn="美国"');
  });

  it('chips 未传 items（缺省）时无国家片', () => {
    expect(chipsHtml(viewOf())).not.toContain('data-cn');
  });
});
