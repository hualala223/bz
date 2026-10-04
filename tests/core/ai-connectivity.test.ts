// @vitest-environment node
/**
 * testAIConnectivity 测试（issue 433/434，上游吸收批 3）：真实链路 mock——SSE 正常回复返回
 * {label, model, ms, reply}；空回复视为不通；网络失败上抛。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { testAIConnectivity, setAISettingsProvider, resetAIProviderCache } from '../../src/core/ai';
import { setApp } from '../../src/core/app';
import { MockVault } from '../mock-vault';

/** 构造 SSE 流式响应体（照 ai.test.ts 范式） */
function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
}

describe('testAIConnectivity（连通性测试）', () => {
  let fetchMock: any;

  beforeEach(() => {
    setApp({ vault: new MockVault(), adapter: { read: vi.fn() } } as any);
    setAISettingsProvider(() => ({ aiProvider: 'deepseek', deepseekApiKey: 'sk-deepseek-test', deepseekModel: 'deepseek-chat-test' } as any));
    resetAIProviderCache();
    fetchMock = vi.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('正常回复：返回 label/model/ms/reply，回复取 SSE 增量拼接', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseBody([
        'data: {"choices":[{"delta":{"content":"OK"}}]}\n',
        'data: [DONE]\n',
      ]),
    });
    const r = await testAIConnectivity('deepseek');
    expect(r.label).toBe('DeepSeek');
    expect(r.model).toBe('deepseek-chat-test');
    expect(r.reply).toBe('OK');
    expect(r.ms).toBeGreaterThanOrEqual(0);
    // 测试题面 = 极小固定题，走当前服务商请求
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.messages[0].content).toBe('这是一次连通性测试。请只回复两个字母：OK');
  });

  it('空回复视为不通：抛「回复为空」', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseBody(['data: [DONE]\n']),
    });
    await expect(testAIConnectivity('deepseek')).rejects.toThrow(/回复为空/);
  });

  it('网络失败一律上抛', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));
    await expect(testAIConnectivity('deepseek')).rejects.toThrow('Failed to fetch');
  });
});
