// @vitest-environment node
/**
 * 日记隐私门（ADR-0100）数据层测试：
 *  - guard 开启（含缺省未设置键）时 diary 来源整条豁免——不落行为/记忆任何流，新旧签名一体适用；
 *  - 显式 diaryPrivacyGuard=false 放行（恢复原行为：diary:created 落行为流）；
 *  - 其他来源不受影响（memo 行为流照写）。
 * AI 调用不触达（guard 拦截在打分之前）；向量模块 mock，不碰网络。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySystem } from '../../src/smartcat/memory';
import { defaultSmartCatData } from '../../src/smartcat/data';
import { setAISettingsProvider, resetAIProviderCache } from '../../src/core/ai';
import type { SmartCatData } from '../../src/smartcat/types';

// mock settings-provider（隐私门键可改值；tryGetSettings 缺键 = 缺省开启语义）
const mockSettings: Record<string, any> = {
  storagePath: 'CONFIG/STORAGE',
  behaviorMaxDays: 30,
  behaviorMaxCount: 2000,
};
vi.mock('../../src/core/settings-provider', () => ({
  tryGetSettings: () => mockSettings,
}));

vi.mock('../../src/secondbrain/ollama', () => ({
  getEmbedding: vi.fn(),
  checkRemoteOllama: vi.fn(async () => true),
  SEARCH_TIMEOUT_MS: 10000,
}));

let data: SmartCatData;

function make(): MemorySystem {
  data = defaultSmartCatData();
  const saver = vi.fn(async (d: SmartCatData) => { data = d; });
  resetAIProviderCache();
  setAISettingsProvider(() => ({ aiProvider: 'deepseek', deepseekApiKey: '' }));
  const m = new MemorySystem({ vault: { adapter: {} } } as any, () => data, saver);
  (m as any).ollamaAvailable = false;
  return m;
}

beforeEach(() => {
  (globalThis as any).fetch = undefined;
  mockSettings.storagePath = 'CONFIG/STORAGE';
  mockSettings.behaviorMaxDays = 30;
  mockSettings.behaviorMaxCount = 2000;
  delete mockSettings.diaryPrivacyGuard;
});

describe('日记隐私门（ADR-0100）', () => {
  it('缺省（未设置键）视为开启：diary 新签名整条豁免，不落任何流', async () => {
    const m = make();
    const r = await m.addObservation('diary', { structured: { entityType: 'diary', action: 'created', name: '2026-09-09' } });
    expect(r).toBeNull();
    expect(data.memory.memoryStream.length).toBe(0);
    expect(data.memory.behaviorStream.length).toBe(0);
  });

  it('开启时 legacy 签名同样豁免', async () => {
    const m = make();
    const r = await m.addObservation('写了一篇日记，心情不错', { source: 'diary', importance: 5 });
    expect(r).toBeNull();
    expect(data.memory.memoryStream.length).toBe(0);
    expect(data.memory.behaviorStream.length).toBe(0);
  });

  it('显式 false 放行：diary:created 落行为流（原行为）', async () => {
    mockSettings.diaryPrivacyGuard = false;
    const m = make();
    await m.addObservation('diary', { structured: { entityType: 'diary', action: 'created', name: '2026-09-09' } });
    expect(data.memory.behaviorStream.length).toBe(1);
    expect(data.memory.behaviorStream[0].source).toBe('diary');
  });

  it('开启时其他来源不受影响（memo 行为流照写）', async () => {
    const m = make();
    await m.addObservation('memo', { structured: { entityType: 'task', action: 'completed', name: '买菜' } });
    expect(data.memory.behaviorStream.length).toBe(1);
    expect(data.memory.behaviorStream[0].source).toBe('memo');
  });
});
