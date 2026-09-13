/**
 * 影院（cinema）AI 荐片测试：画像/提示词/解析/加入想看/页内化真实调用链路（不弹窗）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { resetObsidianMocks } from '../mock-obsidian-entry';
import { M, resetCinemaState } from '../../src/cinema/state';
import { rebuildItems } from '../../src/cinema/data';
import {
  buildTasteProfile, buildRecommendPrompt, buildFollowupPrompt, quickAddWant, parseRecommendJson,
  runAIRecommend, runSimilarRecommend, buildSimilarPrompt,
} from '../../src/cinema/recommend';
import { setAISettingsProvider, resetAIProviderCache } from '../../src/core/ai';
import { setApp } from '../../src/core/app';

function seedProfile(vault: MockVault) {
  vault.files.set('我的/影视/《A》.md', '---\ntags: [电影]\n评分: 5\n观影日期: 2025-06-01T10:00:00\n类型: 剧情/悬疑\n导演: 诺兰\n主演: A/B\n---');
  vault.files.set('我的/影视/《B》.md', '---\ntags: [电影]\n评分: 4\n观影日期: 2025-05-01T10:00:00\n类型: 科幻\n导演: 诺兰\n---');
  vault.files.set('我的/影视/《C》.md', '---\ntags: [美剧]\n评分: -1\n---');
}

describe('cinema buildTasteProfile / prompt / parse', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    M.folderPath = '我的/影视';
    const vault = new MockVault();
    seedProfile(vault);
    rebuildItems(mockAppWithVault(vault));
  });

  it('画像：只看已看且评分>0；加权 top10；recent 最近10部', () => {
    const p = buildTasteProfile();
    expect(p.total).toBe(2);
    expect(p.groups).toContain('电影×9.0');
    expect(p.directors).toContain('诺兰×9.0');
    expect(p.genres).toContain('剧情×5.0');
    expect(p.recent.length).toBe(2);
    expect(p.recent[0]).toContain('A');
  });

  it('提示词（方案 A）：只发画像不打包全量片名，要 20 部按匹配度排序', () => {
    const p = buildTasteProfile();
    const prompt = buildRecommendPrompt(p, p.recent);
    expect(prompt).toContain('资深影视推荐官');
    expect(prompt).toContain('诺兰×9.0');
    expect(prompt).toContain('推荐 20 部');
    expect(prompt).toContain('匹配度从高到低');
    // 方案 A 要点：token 从随库规模线性降为常量级——库内片名不再进 prompt
    expect(prompt).not.toContain('排除清单');
    expect(prompt).not.toContain('《A》');
    expect(prompt).toContain('"recommendations"');
  });

  it('补问提示词：只带「已推荐过的名字」做排除（常量级），语义与首轮不同', () => {
    const p = buildTasteProfile();
    const s = buildFollowupPrompt(p, p.recent, ['X', 'Y']);
    expect(s).toContain('资深影视推荐官');
    expect(s).toContain('不要重复推荐');
    expect(s).toContain('X、Y');
    expect(s).toContain('再推荐 10 部');
    expect(s).toContain('"recommendations"');
  });

  it('解析：裸数组 / recommendations 键 / 代码块 / 非法返回 null', () => {
    expect(parseRecommendJson('[{"title":"X"}]')?.length).toBe(1);
    expect(parseRecommendJson('{"recommendations":[{"title":"X"}]}')?.length).toBe(1);
    expect(parseRecommendJson('```json\n{"similar":[{"title":"Y"}]}\n```')?.length).toBe(1);
    expect(parseRecommendJson('not json')).toBeNull();
    expect(parseRecommendJson('{"foo":[]}')).toBeNull();
  });
});

describe('cinema quickAddWant', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    document.body.innerHTML = '';
    M.folderPath = '我的/影视';
    const vault = new MockVault();
    seedProfile(vault);
    M.appRef = mockAppWithVault(vault);
    rebuildItems(M.appRef as any);
  });

  it('加入想看：建笔记（评分 -1）；重复名提示不建', async () => {
    const app = M.appRef as any;
    await quickAddWant(app, '新片', '电影');
    const created = (app.vault as any).files.get('我的/影视/《新片》.md');
    expect(created).toContain('评分: -1');
    expect(created).toContain('- 电影');
    // 重复
    const before = (app.vault as any).files.size;
    await quickAddWant(app, '新片', '电影');
    expect((app.vault as any).files.size).toBe(before);
  });
});

describe('cinema runAIRecommend（页内化：等待 → 结果列表 / 失败，不弹窗）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    document.body.innerHTML = '';
    M.folderPath = '我的/影视';
    const vault = new MockVault();
    seedProfile(vault);
    M.appRef = mockAppWithVault(vault);
    M.renderFn = vi.fn();
    rebuildItems(M.appRef as any);
  });

  it('AI 成功 → 页内运行态 → aiResult 就绪（不弹窗/无通知）', async () => {
    const raw = '{"recommendations":[{"title":"星际穿越","year":"2014","director":"诺兰","type":"电影","reason":"你偏爱诺兰导演的科幻风格"}]}';
    setAISettingsProvider(() => ({ aiProvider: 'deepseek', deepseekApiKey: 'test-key' }));
    resetAIProviderCache();
    setApp(M.appRef as any);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no net')));
    const { requestUrl } = await import('obsidian');
    (requestUrl as any).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ message: { content: raw } }] }) });

    // 触发后同步应处于运行中且切到 ai 视图
    const promise = runAIRecommend(M.appRef as any);
    expect(M.aiRunning).toBe(true);
    expect(M.view).toBe('ai');
    expect(M.aiWaitMsg).toContain('已分析 2 部观影历史');
    expect(M.renderFn).toHaveBeenCalled();
    await promise;
    expect(M.aiRunning).toBe(false);
    expect(M.aiResult?.length).toBe(1);
    expect(M.aiResult?.[0].title).toBe('星际穿越');
    expect(M.aiError).toBeNull();
    // 无任何弹窗/通知
    expect(document.querySelector('.bz-overlay-mask')).toBeNull();
    expect(document.querySelector('.bz-notice--progress')).toBeNull();
  });

  it('AI 失败 → aiError 就绪（无结果、无弹窗）', async () => {
    setAISettingsProvider(() => ({ aiProvider: 'deepseek', deepseekApiKey: 'test-key' }));
    resetAIProviderCache();
    setApp(M.appRef as any);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no net')));
    const { requestUrl } = await import('obsidian');
    (requestUrl as any).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ message: { content: 'not json' } }] }) });
    await runAIRecommend(M.appRef as any);
    expect(M.aiRunning).toBe(false);
    expect(M.aiResult).toBeNull();
    expect(M.aiError).toContain('AI 分析失败');
    expect(document.querySelector('.bz-overlay-mask')).toBeNull();
  });

  it('重入防护：运行中再次触发 runAIRecommend → 直接 return（AI 只调一次，结果不被并发覆盖）', async () => {
    setAISettingsProvider(() => ({ aiProvider: 'deepseek', deepseekApiKey: 'test-key' }));
    resetAIProviderCache();
    setApp(M.appRef as any);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no net')));
    const { requestUrl } = await import('obsidian');
    (requestUrl as any).mockClear(); // 前面用例的调用计数清零
    let release!: (v: any) => void;
    const gate = new Promise<any>((r) => { release = r; }); // 第一轮 AI 挂起
    (requestUrl as any).mockReturnValue(gate);

    const p1 = runAIRecommend(M.appRef as any);
    expect(M.aiRunning).toBe(true);
    // 运行中重复点击（工具钮/开始按钮）→ 重入直接 return，不发第二发 AI 请求
    await runAIRecommend(M.appRef as any);
    expect(M.aiRunning).toBe(true); // 仍由第一轮占用
    // 首轮即凑满 5 部库外新片（不触发补问轮）→ 本轮 AI 只应被调一次
    release({ status: 200, text: JSON.stringify({ choices: [{ message: { content: '{"recommendations":[{"title":"星际穿越"},{"title":"盗梦空间"},{"title":"记忆碎片"},{"title":"致命魔术"},{"title":"敦刻尔克"}]}' } }] }) });
    await p1;
    expect(requestUrl).toHaveBeenCalledTimes(1);
    expect(M.aiRunning).toBe(false);
    expect(M.aiResult?.length).toBe(5);
  });

  it('重入防护：AI 运行中触发找同类 → 直接 return（共用 aiRunning 状态机，不发请求）', async () => {
    const { requestUrl } = await import('obsidian');
    (requestUrl as any).mockClear();
    M.aiRunning = true; // 模拟荐片进行中
    const base = M.items.find((i) => i.name === 'A')!;
    await runSimilarRecommend(base, M.appRef as any);
    expect(requestUrl).not.toHaveBeenCalled();
    expect(M.aiTitle).toBe('AI 荐片'); // 未被找同类改写
  });

  it('增强包（换一批）：找同类记录基准影片 aiBase；荐片清空基准（按模式重跑）', async () => {
    const base = M.items.find((i) => i.name === 'A')!;
    // 找同类（无 provider → aiError，但基准影片在进入 try 前已记录）
    await runSimilarRecommend(base, M.appRef as any);
    expect(M.aiBase?.name).toBe('A');
    expect(M.aiTitle).toContain('找同类');
    // 荐片重跑：清空基准 → 「换一批」回到荐片模式
    await runAIRecommend(M.appRef as any);
    expect(M.aiBase).toBeNull();
    expect(M.aiTitle).toBe('AI 荐片');
  });
});

describe('cinema 找同类（ADR-0087 迁入 runSimilarRecommend/buildSimilarPrompt）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    document.body.innerHTML = '';
    M.folderPath = '我的/影视';
    const vault = new MockVault();
    seedProfile(vault);
    M.appRef = mockAppWithVault(vault);
    M.renderFn = vi.fn();
    rebuildItems(M.appRef as any);
  });

  it('提示词：以基准影片 + 已看清单为输入，要求 JSON 输出', () => {
    const base = M.items.find((i) => i.name === 'A')!;
    const watched = M.items.filter((i) => i.status === 2 && i.name !== 'A'); // B 已看
    const prompt = buildSimilarPrompt(base, watched);
    expect(prompt).toContain('基准影片');
    expect(prompt).toContain('《A》');
    expect(prompt).toContain('B');
    expect(prompt).toContain('"recommendations"');
    expect(prompt).toContain('资深影视推荐官');
  });

  it('AI 成功 → 页内 aiResult 就绪，标题为「找同类 ·《A》」（不弹窗）', async () => {
    const base = M.items.find((i) => i.name === 'A')!;
    const raw = '{"recommendations":[{"title":"禁闭岛","year":"2010","director":"马丁","type":"电影","reason":"同导演悬疑风格"}]}';
    setAISettingsProvider(() => ({ aiProvider: 'deepseek', deepseekApiKey: 'test-key' }));
    resetAIProviderCache();
    setApp(M.appRef as any);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no net')));
    const { requestUrl } = await import('obsidian');
    (requestUrl as any).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ message: { content: raw } }] }) });

    const promise = runSimilarRecommend(base, M.appRef as any);
    expect(M.aiRunning).toBe(true);
    expect(M.aiTitle).toContain('找同类');
    expect(M.aiTitle).toContain('A');
    expect(M.view).toBe('ai');
    await promise;
    expect(M.aiRunning).toBe(false);
    expect(M.aiResult?.length).toBe(1);
    expect(M.aiResult?.[0].title).toBe('禁闭岛');
    expect(M.aiError).toBeNull();
    expect(document.querySelector('.bz-overlay-mask')).toBeNull();
  });

  it('AI 失败 → aiError（无结果）', async () => {
    const base = M.items.find((i) => i.name === 'A')!;
    setAISettingsProvider(() => ({ aiProvider: 'deepseek', deepseekApiKey: 'test-key' }));
    resetAIProviderCache();
    setApp(M.appRef as any);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no net')));
    const { requestUrl } = await import('obsidian');
    (requestUrl as any).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ message: { content: 'nope' } }] }) });
    await runSimilarRecommend(base, M.appRef as any);
    expect(M.aiRunning).toBe(false);
    expect(M.aiResult).toBeNull();
    expect(M.aiError).toContain('AI 分析失败');
  });
});

describe('cinema AI 荐片方案 A（20 部 → 去重取 5 → 不足补问一轮）', () => {
  beforeEach(() => {
    resetObsidianMocks();
    resetCinemaState();
    document.body.innerHTML = '';
    M.folderPath = '我的/影视';
    const vault = new MockVault();
    seedProfile(vault);
    M.appRef = mockAppWithVault(vault);
    M.renderFn = vi.fn();
    rebuildItems(M.appRef as any);
  });

  /** AI 返回体（recommendations 键） */
  const recJson = (recs: any[]) => JSON.stringify({ recommendations: recs });

  /** 按顺序武装 AI 响应（每次 requestUrl 调用消费一条） */
  async function armAI(contents: string[]) {
    setAISettingsProvider(() => ({ aiProvider: 'deepseek', deepseekApiKey: 'test-key' }));
    resetAIProviderCache();
    setApp(M.appRef as any);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no net')));
    const { requestUrl } = await import('obsidian');
    const mock = requestUrl as any;
    mock.mockReset();
    for (const c of contents) {
      mock.mockResolvedValueOnce({ status: 200, text: JSON.stringify({ choices: [{ message: { content: c } }] }) });
    }
    return mock;
  }

  it('首轮去重：在库/重复/空名剔除后取前 5；凑满 5 部不再补问（AI 只调一次）', async () => {
    const mock = await armAI([
      recJson([
        { title: 'A' }, // 在库（seedProfile 有 A）
        { title: '新1' }, { title: '新2' }, { title: '新3' }, { title: '新4' }, { title: '新5' }, { title: '新6' },
        { title: '新6' }, // 重复名
        { title: '' }, // 空名
        { name: '新7' }, // title 缺失 → name 兜底（序位在截断线后）
      ]),
    ]);
    await runAIRecommend(M.appRef as any);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(M.aiError).toBeNull();
    expect(M.aiResult?.map((r: any) => r.title)).toEqual(['新1', '新2', '新3', '新4', '新5']);
  });

  it('不足 5 部 → 带已见名单补问一轮并补足前 5（第二轮 prompt 含首轮已荐名）', async () => {
    const mock = await armAI([
      recJson([{ title: 'A' }, { title: '新1' }, { title: '新2' }]), // 去重后在库外仅 2 部
      recJson([{ title: '新3' }, { title: '新4' }, { title: '新5' }, { title: '新6' }]),
    ]);
    await runAIRecommend(M.appRef as any);
    expect(mock).toHaveBeenCalledTimes(2);
    // 第二轮 prompt 的排除名单 = 见过名的集合（含首轮在库命中的 A）
    const secondBody = JSON.stringify(mock.mock.calls[1]);
    expect(secondBody).toContain('不要重复推荐');
    expect(secondBody).toContain('新1');
    expect(secondBody).toContain('A');
    expect(M.aiError).toBeNull();
    expect(M.aiResult?.map((r: any) => r.title)).toEqual(['新1', '新2', '新3', '新4', '新5']);
  });

  it('补问轮期间 aiRunning 保持 true：重入守卫不失效、两轮结果不互相覆盖', async () => {
    let release2!: (v: any) => void;
    const gate = new Promise<any>((r) => { release2 = r; });
    const mock = await armAI([recJson([{ title: '新1' }, { title: '新2' }])]);
    mock.mockReturnValueOnce(gate); // 第二轮挂起
    const p = runAIRecommend(M.appRef as any);
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    expect(M.aiRunning).toBe(true); // 补问轮进行中仍占用（提前翻 false 会落三空态）
    expect(M.aiWaitMsg).toContain('补充推荐');
    await runAIRecommend(M.appRef as any); // 重入被守卫拦下，不发第三发请求
    expect(mock).toHaveBeenCalledTimes(2);
    release2({ status: 200, text: JSON.stringify({ choices: [{ message: { content: recJson([{ title: '新3' }, { title: '新4' }, { title: '新5' }]) } }] }) });
    await p;
    expect(M.aiRunning).toBe(false);
    expect(M.aiResult?.length).toBe(5);
  });

  it('两轮均无库外新片 → aiError 文案（不落空结果列表）', async () => {
    const mock = await armAI([recJson([{ title: 'A' }, { title: 'B' }]), recJson([{ title: 'C' }])]);
    await runAIRecommend(M.appRef as any);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(M.aiResult).toBeNull();
    expect(M.aiError).toContain('没有凑齐可推荐的库外新片');
  });

  it('补问轮失败（第二轮抛错）→ 保留首轮所得，不落错误页', async () => {
    const mock = await armAI([recJson([{ title: '新1' }, { title: '新2' }])]);
    mock.mockRejectedValueOnce(new Error('boom'));
    await runAIRecommend(M.appRef as any);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(M.aiError).toBeNull();
    expect(M.aiResult?.map((r: any) => r.title)).toEqual(['新1', '新2']);
  });
});
