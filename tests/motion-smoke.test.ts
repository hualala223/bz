/**
 * 动效层基础契约测试（上游 2026-09-22 动效批，票 318 吸收三域 motion.ts）：
 *  - jsdom / 无 WAAPI 环境**直达终态**（motion.ts 文件头口径：无 matchMedia 按非 RM 走、
 *    无 WAAPI 时编排直达终态，域内测试零感知）——三个域的 motion 全 API 冒烟不抛错；
 *  - 注入件（veil/dust 层）用后即收：调用链跑完 body 无残留 motion 节点；
 *  - teardown 幂等：面板未开时同样安全（unloadSettingsPanel 卸载链口径）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as homeMotion from '../src/home/motion';
import * as encMotion from '../src/encrypt/motion';
import * as spMotion from '../src/settings-panel/motion';

function motionNodeCount(): number {
  return document.querySelectorAll('[data-bz-motion], .bz-vlt-collapse, .bz-vlt-burst, style[id*="motion"]').length;
}

afterEach(() => {
  // home/motion 无 teardown（无泵/长驻循环，编排即抛即清）；enc/sp 有，二连清验幂等
  encMotion.motionTeardown();
  spMotion.motionTeardown();
});

describe('home 动效层（票 318 吸收）', () => {
  it('面板入场/退场/首屏编排/切天/彩条弹跳：jsdom 直达终态不抛错', () => {
    const overlay = document.createElement('div');
    const flow = document.createElement('div');
    flow.innerHTML = '<div class="bz-home-flow-empty">正在汇入今天的痕迹…</div>';
    document.body.appendChild(overlay);
    expect(() => {
      homeMotion.motionPanelIn(overlay, false);
      homeMotion.motionRendered(overlay, true);
      homeMotion.motionPanelOut(overlay, () => {});
      homeMotion.motionDaySwitch(flow, () => { flow.innerHTML = '<div>河</div>'; });
      homeMotion.motionWeekPop(flow);
    }).not.toThrow();
    overlay.remove();
  });
});

describe('encrypt 动效层（票 318 吸收）', () => {
  it('面板/解锁屏/预览/体检全 API 冒烟：null 容错（burst 收 null seal）+ 不抛错', () => {
    const popup = document.createElement('div');
    const ls = document.createElement('div');
    const seal = document.createElement('div');
    seal.dataset.ls = 'seal';
    ls.appendChild(seal);
    document.body.appendChild(popup);
    document.body.appendChild(ls);
    expect(() => {
      encMotion.motionArmBoot();
      encMotion.motionArmSwitch();
      encMotion.motionArmSearch();
      encMotion.motionPanelIn(popup);
      encMotion.motionPanelCollapse(popup);
      encMotion.motionLockScreenIn(ls);
      encMotion.motionUnlockBurst(seal);
      encMotion.motionUnlockBurst(null); // 上游签名即容 null（seal 缺席静默跳过）
      encMotion.motionRejectShake(ls);
      encMotion.motionPreviewIn(popup);
      encMotion.motionRevealBody(ls);
      encMotion.motionOriginalFlash(seal);
      encMotion.motionHealthIn(popup);
      encMotion.motionScanStart(popup);
      encMotion.motionScanStop(popup);
      encMotion.motionReportIn(ls);
      encMotion.motionFindRowIn(seal);
      encMotion.motionStatusbarSpin(seal);
      encMotion.motionLockSealing(popup);
      encMotion.motionRendered(popup);
    }).not.toThrow();
    popup.remove();
    ls.remove();
  });
});

describe('settings-panel 动效层（票 318 吸收）', () => {
  it('开板/导航/控件反馈/移动列表/入睡全 API 冒烟 + teardown 幂等', () => {
    const popup = document.createElement('div');
    const mask = document.createElement('div');
    const nav = document.createElement('div');
    const pane = document.createElement('div');
    const sw = document.createElement('div');
    const input = document.createElement('input');
    const sel = document.createElement('div');
    const card = document.createElement('div');
    const list = document.createElement('div');
    document.body.appendChild(popup);
    expect(() => {
      spMotion.motionPanelIn(popup, mask);
      spMotion.motionEnsureDust(popup);
      spMotion.motionNavSynced(nav);
      spMotion.motionBindNavFeel(nav);
      spMotion.motionBindPressFeel(popup);
      spMotion.motionRendered(pane);
      spMotion.motionMobList(list);
      spMotion.motionSwitchFlip(sw, true);
      spMotion.motionInputSaved(input);
      spMotion.motionInputAdjust(input);
      spMotion.motionInputReject(input);
      spMotion.motionSelectPick(sel);
      spMotion.motionCardChoose(card);
      spMotion.motionSleep();
      spMotion.motionTeardown();
      spMotion.motionTeardown(); // 幂等：二连清不抛
    }).not.toThrow();
    popup.remove();
  });

  it('注入件用后即收：调用链跑完 body 无 motion 残留节点', async () => {
    const popup = document.createElement('div');
    document.body.appendChild(popup);
    encMotion.motionRejectShake(popup);
    await new Promise((r) => setTimeout(r, 30));
    spMotion.motionTeardown();
    encMotion.motionTeardown();
    expect(motionNodeCount()).toBe(0);
    popup.remove();
  });
});
