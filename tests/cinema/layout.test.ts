/**
 * 影院（cinema）午夜场布局：rail/chips 视图切换高亮口径（票 271 吸收）
 * ai/stat 页 rail 整体熄灭（含「全部」）——筛选控件非列表页不表达选中；返回列表原高亮恢复。
 */
import { describe, it, expect } from 'vitest';
import { railHtml, chipsHtml } from '../../src/cinema/layouts/midnight/render';

const items = [
  { name: '甲', group: '电影', status: 0, typeTag: '电影' },
  { name: '乙', group: '剧集', status: 2, typeTag: '美剧' },
] as any;

function viewOf(over: Record<string, unknown> = {}) {
  return { view: 'list', typeFilter: null, statusFilter: null, searchKeyword: '', sortMode: 'date', ...over } as any;
}

describe('影院 rail/chips 视图切换高亮口径（票 271）', () => {
  it('列表页：无筛选时「全部」高亮', () => {
    const r = railHtml(items, viewOf());
    expect(r.groups).toContain('is-on" data-g="全部"');
    expect(r.status).not.toContain('is-on');
    expect(chipsHtml(viewOf())).toContain('chip is-on" data-c="all"');
  });

  it('列表页：选中类型/状态时各高亮自身（「全部」熄灭）', () => {
    const r = railHtml(items, viewOf({ typeFilter: '剧集' }));
    expect(r.groups).toContain('is-on" data-g="剧集"');
    expect(r.groups).not.toContain('is-on" data-g="全部"');
    expect(railHtml(items, viewOf({ statusFilter: '已看' })).status).toContain('is-on" data-s="已看"');
    expect(chipsHtml(viewOf({ typeFilter: '电影' }))).toContain('chip is-on" data-c="电影"');
  });

  it('ai/stat 页：rail 与 chips 整组熄灭（含「全部」），筛选状态本身保留', () => {
    for (const v of ['ai', 'stat'] as const) {
      const view = viewOf({ view: v, typeFilter: '剧集' });
      expect(railHtml(items, view).groups).not.toContain('is-on');
      expect(railHtml(items, view).status).not.toContain('is-on');
      expect(chipsHtml(view)).not.toContain('is-on');
      expect(view.typeFilter).toBe('剧集'); // 筛选状态未被渲染层清掉
    }
  });

  it('返回列表：先前选中的高亮原样恢复', () => {
    expect(railHtml(items, viewOf({ view: 'ai', typeFilter: '剧集' })).groups).not.toContain('is-on');
    expect(railHtml(items, viewOf({ view: 'list', typeFilter: '剧集' })).groups).toContain('is-on" data-g="剧集"');
  });
});
