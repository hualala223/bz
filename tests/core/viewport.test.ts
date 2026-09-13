// tests/core/viewport.test.ts —— issue 260：--bz-vvh 视口令牌模块（剥离吸收上游 ADR-0120）
// 只断言外部可观察行为：变量写入的值/时机、幂等绑定、解绑清理、异常帧夹取。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VVH_VAR,
  bindMobileViewport,
  isViewportBound,
  syncMobileViewport,
  unbindMobileViewport,
} from '../../src/core/viewport';

const VAR = '--bz-vvh';

const getVar = (): string => document.documentElement.style.getPropertyValue(VAR);

function stubVisualViewport(height: number): EventTarget {
  const target = new EventTarget();
  Object.defineProperty(window, 'visualViewport', {
    value: target,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window.visualViewport as EventTarget, 'height', {
    value: height,
    configurable: true,
    writable: true,
  });
  return target;
}

function clearVisualViewport(): void {
  const w = window as unknown as { visualViewport?: unknown };
  delete w.visualViewport;
}

describe('issue 260：视口令牌模块（core/viewport）', () => {
  beforeEach(() => {
    unbindMobileViewport();
    document.documentElement.style.removeProperty(VAR);
  });
  afterEach(() => {
    unbindMobileViewport();
    clearVisualViewport();
  });

  it('导出面与上游一致', () => {
    expect(VVH_VAR).toBe(VAR);
    expect(typeof syncMobileViewport).toBe('function');
    expect(typeof bindMobileViewport).toBe('function');
    expect(typeof unbindMobileViewport).toBe('function');
    expect(typeof isViewportBound).toBe('function');
  });

  it('sync：visualViewport.height 写进变量（round 后的 px）', () => {
    stubVisualViewport(500.4);
    syncMobileViewport();
    expect(getVar()).toBe('500px');
  });

  it('sync：无 visualViewport 时回落 innerHeight', () => {
    clearVisualViewport();
    Object.defineProperty(window, 'innerHeight', { value: 640, configurable: true, writable: true });
    syncMobileViewport();
    expect(getVar()).toBe('640px');
  });

  it('sync：低于 120px 的异常帧忽略，变量保持旧值', () => {
    stubVisualViewport(500);
    syncMobileViewport();
    expect(getVar()).toBe('500px');
    (window.visualViewport as unknown as { height: number }).height = 80;
    syncMobileViewport();
    expect(getVar()).toBe('500px');
  });

  it('bind：幂等——重复绑定返回同一解绑器，接管状态为真', () => {
    stubVisualViewport(600);
    const c1 = bindMobileViewport();
    const c2 = bindMobileViewport();
    expect(c2).toBe(c1);
    expect(isViewportBound()).toBe(true);
  });

  it('bind：visualViewport resize 触发重算', () => {
    const vv = stubVisualViewport(600);
    bindMobileViewport();
    expect(getVar()).toBe('600px');
    (vv as unknown as { height: number }).height = 380;
    vv.dispatchEvent(new Event('resize'));
    expect(getVar()).toBe('380px');
  });

  it('unbind：清掉变量并退出接管态；可重新绑定', () => {
    stubVisualViewport(600);
    bindMobileViewport();
    expect(getVar()).toBe('600px');
    unbindMobileViewport();
    expect(getVar()).toBe('');
    expect(isViewportBound()).toBe(false);
    bindMobileViewport();
    expect(getVar()).toBe('600px');
    unbindMobileViewport();
  });

  it('unbind：未绑定时安全 no-op', () => {
    expect(() => unbindMobileViewport()).not.toThrow();
  });
});
