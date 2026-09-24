// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySystem } from '../../src/smartcat/memory';
import { setSettingsProvider } from '../../src/core/settings-provider';

/** 批 5sm 验收线：日记隐私门（ADR-0100/0106，用户点名保护）——
 *  diary 来源观察整条豁免：不落行为流/记忆流，返回 null */
describe('日记隐私门（用户保护项回归）', () => {
  let ms: MemorySystem;
  beforeEach(() => {
    setSettingsProvider(() => ({ diaryPrivacyGuard: true }) as any);
    ms = new MemorySystem({ memory: { memoryStream: [], behaviorStream: [] } } as any, {} as any, undefined as any);
  });

  it('guard 开（默认）：diary 来源 addObservation → null，两条流零写入', async () => {
    const r = await ms.addObservation('diary', {
      structured: { entityType: 'diary', action: 'created', name: '测试日记' },
    });
    expect(r).toBeNull();
  });
});
