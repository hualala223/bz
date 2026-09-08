// @vitest-environment node
/**
 * 做题家生成器测试（ticket 176 单篇化重构）：提示词（题型一致/截断/卫生约束）、
 * extractJSON、generate（逐题过滤/选项打乱/超时+重试/关思考）；批量协议已随
 * 「更新题库」入口退役删除（原 buildBatchPrompt/generateBatch 用例一并移除）。
 */
import { describe, it, expect, vi } from 'vitest';
import { QuestionGenerator, NOTE_CONTENT_LIMIT } from '../../src/quiz/generator';

function mkGen() {
  return new QuestionGenerator();
}

describe('buildPrompt', () => {
  it('单选：开头四选一语义 + 模板逐字', () => {
    const g = mkGen();
    const p = g.buildPrompt('内容内容', false, 5, 'random');
    expect(p).toContain('根据以下笔记内容，生成若干道四选一的选择题（每题一个正确答案），以便复习。请仅返回一个合法的 JSON 对象');
    expect(p).toContain('"questions"');
    expect(p).toContain('注意：题目类型为 单选题（四选一），请生成恰好 5 道题目。');
    expect(p).toContain('"correctIndices": [0] }');
    expect(p).toContain('笔记内容：\n内容内容');
  });

  it('多选：开头不再宣称「每题一个正确答案」+ typeHint/structure 变化（ticket 176 修矛盾）', () => {
    const g = mkGen();
    const p = g.buildPrompt('x', true, 0, 'random');
    expect(p).toContain('根据以下笔记内容，生成若干道选择题，以便复习。');
    expect(p).not.toContain('每题一个正确答案');
    expect(p).toContain('可以是单选题或多选题（正确选项数量不限）');
    expect(p).toContain('"correctIndices": [0, 2] }（数组内为正确选项的索引）');
  });

  it('按篇幅自适应出题数量（ticket 176 追加）：四档区间 + 提示词分档 + 显式数量优先', () => {
    expect(QuestionGenerator.countRangeForLength(0)).toEqual([2, 3]);
    expect(QuestionGenerator.countRangeForLength(499)).toEqual([2, 3]);
    expect(QuestionGenerator.countRangeForLength(500)).toEqual([3, 5]);
    expect(QuestionGenerator.countRangeForLength(1999)).toEqual([3, 5]);
    expect(QuestionGenerator.countRangeForLength(2000)).toEqual([5, 8]);
    expect(QuestionGenerator.countRangeForLength(4999)).toEqual([5, 8]);
    expect(QuestionGenerator.countRangeForLength(5000)).toEqual([8, 12]);
    expect(QuestionGenerator.countRangeForLength(NOTE_CONTENT_LIMIT)).toEqual([8, 12]);

    const g = mkGen();
    // 留空（0）：按截断后篇幅分档提示
    expect(g.buildPrompt('短内容', false, 0, 'random')).toContain('建议 2~3 道');
    expect(g.buildPrompt('x'.repeat(6000), false, 0, 'random')).toContain('约 6000 字，建议 8~12 道');
    // 显式数量：恰好 N 道，无分档建议
    const fixed = g.buildPrompt('x'.repeat(6000), false, 7, 'random');
    expect(fixed).toContain('请生成恰好 7 道题目');
    expect(fixed).not.toContain('建议');
  });

  it('三难度提示逐字', () => {
    const g = mkGen();
    expect(g.buildPrompt('x', false, 0, 'easy')).toContain('请生成基础概念题，选项区分度明显，避免陷阱，难度较低。');
    expect(g.buildPrompt('x', false, 0, 'medium')).toContain('生成中等难度题目，可包含细节辨析，选项有一定迷惑性。');
    expect(g.buildPrompt('x', false, 0, 'hard')).toContain('生成高难度题目，可涉及推理、多知识点交叉，选项具有较强迷惑性。');
    expect(g.buildPrompt('x', false, 0, 'random')).not.toContain('请生成基础');
  });

  it('内容截断上限 NOTE_CONTENT_LIMIT=10000（ticket 176 放宽，3000→10000）', () => {
    const g = mkGen();
    const long = 'x'.repeat(NOTE_CONTENT_LIMIT + 500);
    const p = g.buildPrompt(long, false, 0, 'random');
    expect(p.endsWith('x'.repeat(NOTE_CONTENT_LIMIT))).toBe(true);
    expect(p).not.toContain('x'.repeat(NOTE_CONTENT_LIMIT + 1));
  });

  it('选项卫生与内容依据约束（ticket 176）', () => {
    const g = mkGen();
    const p = g.buildPrompt('x', false, 0, 'random');
    expect(p).toContain('选项不要带「A.」「A、」等编号前缀，四个选项内容互不相同');
    expect(p).toContain('题目和答案必须依据笔记内容，不要编造笔记中没有的信息');
  });
});

describe('extractJSON', () => {
  const valid = '{"questions":[{"question":"Q","options":["a","b","c","d"],"correctIndices":[0]}]}';
  it('code block / 纯 JSON / {..} 截取', () => {
    const g = mkGen();
    expect(g.extractJSON('```json\n' + valid + '\n```').questions.length).toBe(1);
    expect(g.extractJSON(valid).questions.length).toBe(1);
    expect(g.extractJSON('前缀文本' + valid + '后缀').questions.length).toBe(1);
  });

  it('无法提取 → 抛「无法从 AI 响应中提取有效的 JSON」', () => {
    const g = mkGen();
    expect(() => g.extractJSON('纯文本')).toThrow('无法从 AI 响应中提取有效的 JSON');
  });
});

describe('generate', () => {
  const raw1 = '{"questions":[{"question":"Q1","options":["a","b","c","d"],"correctIndices":[0]}]}';

  it('正常流程：题目保留 + 选项打乱后集合一致 + 正确索引仍指向原正确文本', async () => {
    const g = mkGen();
    const ai = { json: vi.fn().mockResolvedValue(raw1) };
    const r = await g.generate('内容', ai as any, false, 1, 'random');
    expect(r).toHaveLength(1);
    expect(r[0].question).toBe('Q1');
    expect([...r[0].options].sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const ci of r[0].correctIndices) {
      expect(r[0].options[ci]).toBe('a'); // 原正确答案文本 "a" 打乱后仍被正确索引指到
    }
  });

  it('多选：打乱重映射后正确索引集合仍指向原正确文本集合', async () => {
    const g = mkGen();
    const raw = '{"questions":[{"question":"Q","options":["a","b","c","d"],"correctIndices":[0,2]}]}';
    const ai = { json: vi.fn().mockResolvedValue(raw) };
    const r = await g.generate('x', ai as any, true, 1, 'random');
    const texts = r[0].correctIndices.map((ci) => r[0].options[ci]).sort();
    expect(texts).toEqual(['a', 'c']);
  });

  it('逐题过滤（ticket 176 A4：一题坏不再毁整篇）；全坏 → 抛「AI 未返回有效题目数组。」', async () => {
    const g = mkGen();
    const raw = JSON.stringify({
      questions: [
        { question: 'OK', options: ['a', 'b', 'c', 'd'], correctIndices: [1] },
        { question: '坏选项', options: ['a'], correctIndices: [0] },
        { question: '坏索引', options: ['a', 'b', 'c', 'd'], correctIndices: [9, 2] }, // 剔除越界后保留 [2]
        { question: '全越界', options: ['a', 'b', 'c', 'd'], correctIndices: [7] },
        { question: '空索引', options: ['a', 'b', 'c', 'd'], correctIndices: [] },
        { options: ['a', 'b', 'c', 'd'], correctIndices: [0] }, // 缺题干
      ],
    });
    const ai = { json: vi.fn().mockResolvedValue(raw) };
    const r = await g.generate('x', ai as any, false, 1, 'random');
    expect(r.map((q) => q.question)).toEqual(['OK', '坏索引']);
    // 选项打乱后索引数值随机，按「索引 → 原正确文本」映射断言（OK 原正确项 'b'，坏索引剔除越界后原正确项 'c'）
    expect(r[0].options[r[0].correctIndices[0]]).toBe('b');
    expect(r[1].options[r[1].correctIndices[0]]).toBe('c');

    const aiBad = { json: vi.fn().mockResolvedValue('{"questions":[{"question":"Q","options":["a"],"correctIndices":[0]}]}') };
    await expect(g.generate('x', aiBad as any, false, 1, 'random')).rejects.toThrow('AI 未返回有效题目数组。');
    await expect(g.generate('x', { json: vi.fn().mockResolvedValue('{"foo":1}') } as any, false, 1, 'random')).rejects.toThrow(
      'AI 未返回有效题目数组。'
    );
  });

  it('JSON 提取失败（提取层错误）不重试，抛「无法从 AI 响应中提取有效的 JSON」', async () => {
    const g = mkGen();
    const ai = { json: vi.fn().mockResolvedValue('纯文本无 JSON') };
    await expect(g.generate('x', ai as any, false, 1, 'random', { retryBaseMs: 1 })).rejects.toThrow('无法从 AI 响应中提取有效的 JSON');
    expect(ai.json).toHaveBeenCalledTimes(1);
  });

  it('瞬时失败退避重试：第一次 API 429，第二次成功（ticket 176 A2）', async () => {
    const g = mkGen();
    const ai = { json: vi.fn().mockRejectedValueOnce(new Error('API 429: rate limited')).mockResolvedValue(raw1) };
    const r = await g.generate('x', ai as any, false, 1, 'random', { retryBaseMs: 1 });
    expect(r).toHaveLength(1);
    expect(ai.json).toHaveBeenCalledTimes(2);
  });

  it('重试达上限后抛最后错误（retryMax+1 次调用）', async () => {
    const g = mkGen();
    const ai = { json: vi.fn().mockRejectedValue(new Error('API 502: Bad Gateway')) };
    await expect(g.generate('x', ai as any, false, 1, 'random', { retryMax: 2, retryBaseMs: 1 })).rejects.toThrow('API 502');
    expect(ai.json).toHaveBeenCalledTimes(3);
  });

  it('配置类错误不重试（发请求前即失败）', async () => {
    const g = mkGen();
    const ai = { json: vi.fn().mockRejectedValue(new Error('未配置 OpenCode Go API Key：插件设置 → AI 配置')) };
    await expect(g.generate('x', ai as any, false, 1, 'random', { retryBaseMs: 1 })).rejects.toThrow('未配置');
    expect(ai.json).toHaveBeenCalledTimes(1);
  });

  it('超时 AbortError 不重试，直接抛出', async () => {
    const g = mkGen();
    const err = new Error('请求已取消');
    err.name = 'AbortError';
    const ai = { json: vi.fn().mockRejectedValue(err) };
    await expect(g.generate('x', ai as any, false, 1, 'random', { retryBaseMs: 1 })).rejects.toThrow('请求已取消');
    expect(ai.json).toHaveBeenCalledTimes(1);
  });

  it('请求参数：单次调用带超时 signal + enable_thinking:false 关思考（ticket 176 B3）', async () => {
    const g = mkGen();
    const ai = { json: vi.fn().mockResolvedValue(raw1) };
    await g.generate('x', ai as any, false, 1, 'random');
    expect(ai.json).toHaveBeenCalledTimes(1);
    const opts = ai.json.mock.calls[0][1];
    expect(opts.modelOptions.enable_thinking).toBe(false);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});
