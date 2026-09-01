/**
 * 小橘电源设置（ticket 103 回归恢复）：关闭方式类型/归一（index 与主设置页共用）+
 * 主设置页「🐱 小橘」区块 schema。leaf 模块（无域内引用），职责单一：
 * - 主设置页 LAYOUT 由 core 渲染器（ADR-0064）驱动，本模块只声明「有什么设置」——
 *   归属 smartcat 域以守 ADR-0002 依赖方向（core 不反向依赖域）；
 * - index.ts 的 isSmartcatStopped/applySmartcatPowerState 与 main.ts 的启动门控
 *   共用同一 normalize（旧数据/未知值 → stop，零迁移兼容）。
 */
import type { SettingsSchema, ToggleRow, SelectRow } from '../core/settings-schema';
import { getSettings } from '../core/settings-provider';

/** 关闭方式（ticket 103）：stop 彻底停机 / hide 仅隐藏（后台仍感知）/ lazy 仅不自动启动 */
export type SmartcatOffMode = 'stop' | 'hide' | 'lazy';

/** 关闭方式归一（设置页与守卫共用，旧数据/未知值 → stop） */
export function normalizeSmartcatOffMode(v: unknown): SmartcatOffMode {
  return v === 'hide' || v === 'lazy' ? v : 'stop';
}

/** 电源对账回调（main.ts 组合设置页时注入：接线 applySmartcatPowerState，立即生效） */
export type SmartcatPowerStateChange = (enabled: boolean, offMode: string) => void | Promise<void>;

/** 主设置页「🐱 小橘」区块（启用开关 + 关闭方式三档；关闭方式仅开关关闭时显示）。
 *  文案与 ⚙️ 弹窗电源组对齐（ticket 100 文案规范逐字合规）；按键直绑 data.json（smartcatEnabled/
 *  smartcatOffMode 为 BzSettings 键，随设置页统一 saveSettings 落盘）。 */
export function smartcatMainSettingsSchema(opts: { onPowerStateChange?: SmartcatPowerStateChange } = {}): SettingsSchema {
  const rows: (ToggleRow | SelectRow)[] = [
    {
      type: 'toggle',
      name: '启用小橘',
      desc: '关闭后按关闭方式处理，停机期间笔记活动不进入记忆，重开不补记',
      binding: { key: 'smartcatEnabled' },
      onChange: (v, ctx) => {
        ctx.refreshVisibility();
        void opts.onPowerStateChange?.(v, normalizeSmartcatOffMode(getSettings().smartcatOffMode));
      },
    },
    {
      type: 'select',
      name: '关闭方式',
      desc: '停机猫与后台全停，仅隐藏猫消失但后台仍感知，不自动启动则本次照旧',
      binding: { key: 'smartcatOffMode' },
      options: [
        { value: 'stop', label: '彻底停机（后台全部停止）' },
        { value: 'hide', label: '仅隐藏（后台仍感知）' },
        { value: 'lazy', label: '仅不自动启动（召唤可用）' },
      ],
      visibleWhen: (snap) => snap.smartcatEnabled === false,
      onChange: (v, ctx) => {
        ctx.refreshVisibility();
        // 关闭状态下切换关闭方式 → 立即按新档对账（开启状态下切换仅留待下次关闭）
        if (!getSettings().smartcatEnabled) void opts.onPowerStateChange?.(false, v);
      },
    },
  ];
  return { groups: [{ name: '🐱 小橘', rows }] };
}