/**
 * AIService / createAI（Q3.js window.__utils 移植，ticket 03）
 * provider：deepseek / opencode-go / zhipu / siliconflow / volcano-ark / zhipu-plan / ollama（插件设置注入，取代 Q3 的 QuickAdd 宏设置）；
 * override 字符串（五家 id 或历史遗留值走 deepseek 兜底）或对象 {endpoint, apiKey, model}。
 * prompt：fetch 流式（stream:true），失败自动 fallback requestUrl 非流式；noCors 直接走 requestUrl。
 * opencode-go 须带 x-opencode-session 头（ticket 174：官方端点强制，缺失一律 400 MissingSessionID）；
 * requestUrl 传 throw:false 自判状态码，400+ 报错透出服务端报文（默认 throw 只抛一句 "Request failed, status N"）。
 * thinking 方言（ticket 175）：智谱/方舟要 thinking 对象，其余原生 enable_thinking，prompt 内统一翻译。
 * 思考档位（上游 issue 411/ADR-0179 融合）：per-provider 档位表 thinkingBodyFor，消费 aiThinkingOverrides
 * （auto/档位不在表内一律不注入）；ollama 第七家（本地 OpenAI 兼容层，密钥留空放行）。
 */
import { requestUrl } from 'obsidian';
import { getApp } from './app';
import { toBase64 } from './crypto';
import { resolveModelLimits } from './model-limits';

export interface AISettingsLike {
  aiProvider?: string;
  deepseekApiKey?: string;
  opencodeGoApiKey?: string;
  /** 各服务商可选模型（ticket 175，留空 = 内置默认） */
  deepseekModel?: string;
  opencodeGoModel?: string;
  zhipuApiKey?: string;
  zhipuModel?: string;
  zhipuPlanApiKey?: string;
  zhipuPlanModel?: string;
  /** Ollama（本地）密钥（融合上游 issue 411；本地服务无需密钥，留空放行） */
  ollamaApiKey?: string;
  /** Ollama 模型（留空 = 内置 llama3.1） */
  ollamaModel?: string;
  aiMaxTokensOverrides?: Record<string, number>;
  siliconflowApiKey?: string;
  siliconflowModel?: string;
  volcanoArkApiKey?: string;
  volcanoArkModel?: string;
}

let _settingsProvider: (() => AISettingsLike) | null = null;

/** 注册设置读取器（main.ts onload 时注入） */
export function setAISettingsProvider(fn: () => AISettingsLike): void {
  _settingsProvider = fn;
}

function getQ3Settings(): AISettingsLike {
  return _settingsProvider ? _settingsProvider() : {};
}

// ---------------- provider 解析 ----------------

interface AIProvider {
  /** 注册表身份（思考档位表按它查）；对象 override 无 id = 不注入 */
  id?: string;
  endpoint: string;
  apiKey: string;
  model?: string;
  noCors?: boolean;
  /** 附加请求头（如 opencode-go 的 x-opencode-session），fetch 与 requestUrl 两路都合并 */
  headers?: Record<string, string>;
  /** 思考模式参数方言（ticket 175）：'thinking' = 翻译为 thinking:{type}（智谱/方舟）；缺省 = 原生 enable_thinking */
  thinkingParam?: 'enable_thinking' | 'thinking';
}

let _aiProviderCache: AIProvider | null = null;
let _lastProviderName = 'opencode-go'; // 供 aiMaxTokensOf 取 per-provider 覆盖（融合批）

/** opencode-go 会话标识：进程内懒生成一个 UUID 全程复用（ticket 174：端点强制 x-opencode-session，
 *  缺失一律 400 MissingSessionID；官方要求每会话一个稳定 ID 用于路由/prompt 缓存优化） */
let _opencodeSessionId: string | null = null;
function opencodeSessionId(): string {
  let id = _opencodeSessionId;
  if (!id) {
    const c = (globalThis as any).crypto;
    id = (c && typeof c.randomUUID === 'function')
      ? c.randomUUID() as string
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
          const r = (Math.random() * 16) | 0;
          return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    _opencodeSessionId = id;
  }
  return id;
}

/** 重置 provider 缓存（设置变更后调用） */
export function resetAIProviderCache(): void {
  _aiProviderCache = null;
}

/** 解析 AI provider（override 优先级最高），逻辑与 Q3 getAIProvider 逐字一致 */

/** 输出上限融合（上游 ADR-0148/0151）：per-provider 覆盖（aiMaxTokensOverrides）> 模型档位表
 *  （model-limits 官方最大档）> 4096 兜底。调用方显式传值仍最优先（prompt mo.max_tokens）。 */
function aiMaxTokensOf(model?: string): number {
  try {
    const s = getQ3Settings() as Record<string, unknown>;
    const ov = s.aiMaxTokensOverrides as Record<string, number> | undefined;
    if (ov && typeof ov[_lastProviderName] === 'number' && ov[_lastProviderName] > 0) return ov[_lastProviderName];
    return resolveModelLimits(model)?.maxOutput || 4096;
  } catch {
    return 4096;
  }
}


export async function getAIProvider(override?: string | { endpoint?: string; apiKey?: string; model?: string }): Promise<AIProvider> {
  if (!override && _aiProviderCache) return _aiProviderCache;
  const s = getQ3Settings();
  // 调用方直接给完整配置（如脚本内指定第三方端点/key）
  if (override && typeof override === 'object' && (override as any).apiKey) {
    return {
      endpoint: String((override as any).endpoint || 'https://api.deepseek.com').replace(/\/+$/, ''),
      apiKey: (override as any).apiKey,
      model: (override as any).model || undefined,
    };
  }
  const name = (typeof override === 'string' && override) || s.aiProvider || 'opencode-go';
  _lastProviderName = name;
  if (name === 'opencode-go') {
    if (!s.opencodeGoApiKey) {
      throw new Error('未配置 OpenCode Go API Key：插件设置 → AI 配置 → OpenCode Go API Key');
    }
    _aiProviderCache = {
      id: 'opencode-go',
      endpoint: 'https://opencode.ai/zen/go/v1',
      apiKey: s.opencodeGoApiKey,
      model: s.opencodeGoModel || 'deepseek-v4-flash',
      noCors: true, // opencode.ai 无 CORS 头，fetch 必败 → 直接走 requestUrl
      headers: { 'x-opencode-session': opencodeSessionId() }, // ticket 174：端点强制，缺失 400
    };
    return _aiProviderCache;
  }
  // 智谱 Plan（上游 issue 411 融合批：Coding 套餐专用端点——Lite/Pro/Max 额度只在此端点生效，
  // 走标准 paas/v4 会按量计费报余额不足）。思考方言沿用智谱 thinking:{type}（ticket 175 同款）
  if (name === 'zhipu-plan') {
    if (!s.zhipuPlanApiKey) {
      throw new Error('未配置智谱 Plan API Key：插件设置 → AI 配置 → 智谱 Plan 密钥');
    }
    _aiProviderCache = {
      id: 'zhipu-plan',
      endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4',
      apiKey: s.zhipuPlanApiKey,
      model: s.zhipuPlanModel || 'glm-5.3-flash',
      thinkingParam: 'thinking',
    };
    return _aiProviderCache;
  }
  // 智谱 / 硅基流动 / 火山方舟（ticket 175）：均 OpenAI 兼容 + CORS 放行 Obsidian，走流式 fetch；
  // 默认模型内置（ticket 175 对齐：够用低价档），设置里可选模型行留空即用内置
  if (name === 'zhipu') {
    if (!s.zhipuApiKey) {
      throw new Error('未配置智谱 API Key：插件设置 → AI 配置 → 智谱密钥');
    }
    _aiProviderCache = {
      id: 'zhipu',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: s.zhipuApiKey,
      model: s.zhipuModel || 'glm-4.7-flash',
      thinkingParam: 'thinking', // 智谱 thinking:{type} 方言
    };
    return _aiProviderCache;
  }
  if (name === 'siliconflow') {
    if (!s.siliconflowApiKey) {
      throw new Error('未配置硅基流动 API Key：插件设置 → AI 配置 → 硅基流动密钥');
    }
    _aiProviderCache = {
      id: 'siliconflow',
      endpoint: 'https://api.siliconflow.cn/v1',
      apiKey: s.siliconflowApiKey,
      model: s.siliconflowModel || 'deepseek-ai/DeepSeek-V3', // 平台对 V3 系列升级不换 ID
    };
    return _aiProviderCache;
  }
  if (name === 'volcano-ark') {
    if (!s.volcanoArkApiKey) {
      throw new Error('未配置火山方舟 API Key：插件设置 → AI 配置 → 火山方舟密钥');
    }
    _aiProviderCache = {
      id: 'volcano-ark',
      endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: s.volcanoArkApiKey,
      model: s.volcanoArkModel || 'doubao-seed-1-6-flash-250828', // 方舟 Model ID 带日期后缀
      thinkingParam: 'thinking', // 豆包 thinking:{type} 方言
    };
    return _aiProviderCache;
  }
  // 本地 Ollama（融合上游 issue 411/ADR-0179）：OpenAI 兼容层；本地服务无需密钥，留空放行。
  // fetch 优先（用户设 OLLAMA_ORIGINS 放行时可流式），CORS 拦截自动落 requestUrl 非流式
  if (name === 'ollama') {
    _aiProviderCache = {
      id: 'ollama',
      endpoint: 'http://localhost:11434/v1',
      apiKey: s.ollamaApiKey || '',
      model: s.ollamaModel || 'llama3.1',
    };
    return _aiProviderCache;
  }
  // deepseek：settings 里配的 key 优先，其次 QuickAdd data.json（未知 provider 名也落到此处，历史行为）
  if (s.deepseekApiKey) {
    _aiProviderCache = {
      id: 'deepseek',
      endpoint: 'https://api.deepseek.com',
      apiKey: s.deepseekApiKey,
      model: s.deepseekModel || undefined,
    };
    return _aiProviderCache;
  }
  try {
    const raw = await getApp().vault.adapter.read('.obsidian/plugins/quickadd/data.json');
    const cfg = JSON.parse(raw);
    const provider = cfg.ai && cfg.ai.providers && cfg.ai.providers[0];
    if (provider && provider.endpoint && provider.apiKey) {
      _aiProviderCache = { endpoint: String(provider.endpoint).replace(/\/+$/, ''), apiKey: provider.apiKey };
      return _aiProviderCache;
    }
  } catch (e) { /* 读取失败由调用方提示 */ }
  throw new Error('未找到 AI 配置：请在插件设置中配置 API Key（DeepSeek / OpenCode Go / 智谱 / 硅基流动 / 火山方舟 / Ollama）');
}

// ---------------- 思考档位（上游 issue 411/ADR-0179 融合） ----------------

/** 档位一项：面板档位 → 请求体片段（body = null 表示不注入任何思考参数 = 跟随模型默认） */
export interface AIThinkingLevel {
  /** 档位值（存设置 aiThinkingOverrides；auto = 跟随默认不注入） */
  value: string;
  /** 设置面板展示名 */
  label: string;
  /** 该档位注入的请求体键值；null = 不注入 */
  body: Record<string, unknown> | null;
}

/** 存档/注入共用的档位动词表（逐家档位表由此取项，避免各写一份字面量） */
const THINK_AUTO: AIThinkingLevel = { value: 'auto', label: '跟随模型默认', body: null };
const THINK_OFF: AIThinkingLevel = { value: 'off', label: '关闭（省 token）', body: null };
const THINK_LOW: AIThinkingLevel = { value: 'low', label: '低', body: null };
const THINK_MEDIUM: AIThinkingLevel = { value: 'medium', label: '中', body: null };
const THINK_HIGH: AIThinkingLevel = { value: 'high', label: '高', body: null };
const THINK_MAX: AIThinkingLevel = { value: 'max', label: '最高', body: null };
const THINK_ON: AIThinkingLevel = { value: 'on', label: '开启', body: null };

/** 逐家档位表（参数名与被支持的档逐家不同，核对口径随上游 2026-09-23）：
 *  - deepseek：开关 thinking:{type} + 强度 reasoning_effort（官方无 medium 档）；
 *  - zhipu-plan：glm-5.3 系强制思考（无关闭档），仅 reasoning_effort low/high/max；
 *  - ollama：兼容层把 reasoning_effort 映射为内部 Think（none = 关）；
 *  - 智谱/方舟（ticket 175 方言）：thinking:{type} 二档；opencode-go/硅基流动：enable_thinking 二档。
 *  未表内的 provider 无档位表 = 不注入（保守，不冒进发参数）。 */
const AI_THINKING_LEVELS: Record<string, AIThinkingLevel[]> = {
  'deepseek': [
    THINK_AUTO,
    { ...THINK_OFF, body: { thinking: { type: 'disabled' } } },
    { ...THINK_LOW, body: { thinking: { type: 'enabled' }, reasoning_effort: 'low' } },
    { ...THINK_HIGH, body: { thinking: { type: 'enabled' }, reasoning_effort: 'high' } },
    { ...THINK_MAX, body: { thinking: { type: 'enabled' }, reasoning_effort: 'max' } },
  ],
  'zhipu-plan': [
    THINK_AUTO,
    { ...THINK_LOW, body: { reasoning_effort: 'low' } },
    { ...THINK_HIGH, body: { reasoning_effort: 'high' } },
    { ...THINK_MAX, body: { reasoning_effort: 'max' } },
  ],
  'ollama': [
    THINK_AUTO,
    { ...THINK_OFF, body: { reasoning_effort: 'none' } },
    { ...THINK_LOW, body: { reasoning_effort: 'low' } },
    { ...THINK_MEDIUM, body: { reasoning_effort: 'medium' } },
    { ...THINK_HIGH, body: { reasoning_effort: 'high' } },
  ],
  'zhipu': [
    THINK_AUTO,
    { ...THINK_OFF, body: { thinking: { type: 'disabled' } } },
    { ...THINK_ON, body: { thinking: { type: 'enabled' } } },
  ],
  'volcano-ark': [
    THINK_AUTO,
    { ...THINK_OFF, body: { thinking: { type: 'disabled' } } },
    { ...THINK_ON, body: { thinking: { type: 'enabled' } } },
  ],
  'opencode-go': [
    THINK_AUTO,
    { ...THINK_OFF, body: { enable_thinking: false } },
    { ...THINK_ON, body: { enable_thinking: true } },
  ],
  'siliconflow': [
    THINK_AUTO,
    { ...THINK_OFF, body: { enable_thinking: false } },
    { ...THINK_ON, body: { enable_thinking: true } },
  ],
};

/** 该 provider 的档位表（设置面板选项与请求注入同源；未表内 id 回空表） */
export function thinkingLevelsOf(providerId?: string): AIThinkingLevel[] {
  return (providerId && AI_THINKING_LEVELS[providerId]) || [];
}

/** 档位值 → 应注入的请求体键值对；null = 不注入（auto/空/档位不在表内一律不注入——
 *  「不认识的档位宁可不动」优先于「尽力翻译」，避免给端点发它不认识的参数） */
export function thinkingBodyFor(providerId: string | undefined, level: string | undefined): Record<string, unknown> | null {
  if (!providerId || !level || level === 'auto') return null;
  const hit = thinkingLevelsOf(providerId).find((l) => l.value === level);
  return hit?.body ?? null;
}

/** 设置面板选项面（settings-main-schema 消费；auto 恒在首位） */
export function thinkingOptionsOf(providerId?: string): { value: string; label: string }[] {
  return thinkingLevelsOf(providerId).map((l) => ({ value: l.value, label: l.label }));
}

/** modelOptions 是否显式带了思考键（显式优先：调用方直给的思考参数不被面板档位改写——
 *  域内确有「与面板档位不同」的实测语义，如 knowledge/mount-suggest 的 low 档） */
export function hasExplicitThinkingOption(mo: Record<string, any>): boolean {
  return 'enable_thinking' in mo || 'reasoning_effort' in mo || 'thinking' in mo;
}

// ---------------- 请求实现 ----------------

/** 取消异常（AbortError 语义；调用方以 signal.aborted 判定取消路径，ticket 141 对话可取消） */
function abortError(): Error {
  const e = new Error('请求已取消');
  e.name = 'AbortError';
  return e;
}

/** SSE 流式解析（fetch + ReadableStream）；signal 可中止，onDelta 逐段增量回调（ticket 141） */
async function streamChatCompletions(provider: AIProvider, body: any, signal?: AbortSignal, onDelta?: (delta: string) => void): Promise<string> {
  const resp = await fetch(`${provider.endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}`, ...(provider.headers || {}) },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    let msg = `API ${resp.status}`;
    try {
      const err = await resp.json();
      if (err.error && err.error.message) msg = err.error.message;
    } catch (e) { /* 保留状态码 */ }
    throw new Error(msg);
  }
  // 响应无流（老 WebView / 非 SSE）→ 直接读完整 JSON
  if (!resp.body || typeof (resp.body as any).getReader !== 'function') {
    const data: any = await resp.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }
  const reader = (resp.body as any).getReader();
  const decoder = new TextDecoder();
  let full = '', buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') { try { reader.cancel(); } catch (e) { /* 忽略 */ } return full; }
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
        if (delta) {
          full += delta;
          try {
            onDelta?.(delta); // 增量回调异常不影响流式解析
          } catch (e) { /* 忽略 */ }
        }
      } catch (e) { /* 忽略坏 chunk */ }
    }
  }
  return full;
}

/** 非流式（requestUrl：Obsidian 官方 API，无 CORS 限制）；requestUrl 不支持中止 → 前后查 signal，已取消按丢弃处理。
 *  throw:false 自判状态码：默认 throw 在 400+ 直接抛 "Request failed, status N"，服务端报文被吞（ticket 174 排查即栽在这） */
async function chatCompletionsNonStream(provider: AIProvider, body: any, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw abortError();
  const resp: any = await requestUrl({
    url: `${provider.endpoint}/chat/completions`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}`, ...(provider.headers || {}) },
    body: JSON.stringify({ ...body, stream: false }),
    throw: false,
  });
  if (signal?.aborted) throw abortError();
  // 400+：透出服务端错误报文（OpenAI {error:{message}} / opencode {type,error:{type,message}}），非 JSON 用原文截断
  if (resp.status >= 400) {
    let detail = '';
    try {
      const errData = JSON.parse(resp.text);
      detail = (errData.error && (errData.error.message || errData.error.type)) || (errData.message && errData.message) || '';
    } catch (e) { /* 非 JSON 报文，用原文 */ }
    if (!detail && resp.text) detail = String(resp.text).slice(0, 300);
    throw new Error(detail ? `API ${resp.status}: ${detail}` : `API ${resp.status}`);
  }
  const data = JSON.parse(resp.text);
  // 兼容 OpenAI 与 opencode 的错误格式（opencode: {type, error:{type,message}}）
  const errMsg = (data.error && (data.error.message || data.error.type)) || (data.message && data.message);
  if (errMsg) throw new Error(`API ${resp.status}: ${errMsg}`);
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (content === undefined || content === null) throw new Error(`API ${resp.status}: 响应缺少 content`);
  return content;
}

// ---------------- AIService ----------------

export interface AIOptions {
  provider?: string | { endpoint?: string; apiKey?: string; model?: string };
  modelOptions?: Record<string, any>;
  [key: string]: any;
}

export class AIService {
  defaultModel: string;
  defaultOptions: any;

  constructor(params?: any, defaultModel = 'deepseek-v4-flash', defaultOptions: any = {}) {
    this.defaultModel = defaultModel;
    this.defaultOptions = defaultOptions;
  }

  /** 通用 AI 请求（fetch 流式，失败自动 fallback requestUrl 非流式）；
   *  options.signal（取消）/ options.onDelta（流式增量回调）为调用方选项（ticket 141），不进请求体，
   *  既有调用（不传这两项）行为零变化 */
  async prompt(promptText: string | { text: string; images?: string[] } | { messages: AIMessage[] }, model: string = this.defaultModel, options: AIOptions = {}): Promise<string> {
    const mergedOptions = this._mergeOptions(options);
    const provider = await getAIProvider(mergedOptions.provider);
    // 调用方未显式指定模型时，用 provider 配置的默认模型（如 OpenCode Go 设置里的模型）
    const effModel = (model === this.defaultModel && provider.model) ? provider.model : model;
    const mo = mergedOptions.modelOptions || {};
    const body: Record<string, any> = {
      model: effModel,
      messages: typeof promptText === 'object' && 'messages' in promptText
        ? promptText.messages
        : [{ role: 'user', content: buildUserContent(promptText) }],
      max_tokens: mo.max_tokens || aiMaxTokensOf(effModel),
      stream: true,
    };
    // 透传其余 modelOptions（response_format / enable_thinking 等，不支持的字段由 API 忽略）
    for (const k of Object.keys(mo)) {
      if (k === 'max_tokens') continue;
      body[k] = mo[k];
    }
    // 思考模式方言翻译（ticket 175）：智谱/豆包收 thinking:{type} 对象，不认 enable_thinking 字段
    if (provider.thinkingParam === 'thinking' && body.enable_thinking !== undefined) {
      body.thinking = { type: body.enable_thinking ? 'enabled' : 'disabled' };
      delete body.enable_thinking;
    }
    // 思考档位注入（上游 issue 411/ADR-0179 融合）：档位与参数名由 per-provider 档位表决定；
    // 调用方显式思考键优先；auto / 档位不在表内 / 对象 override（无注册表身份）一律不注入
    if (!hasExplicitThinkingOption(mo)) {
      const overrides = (getQ3Settings() as Record<string, unknown>).aiThinkingOverrides as Record<string, string> | undefined;
      const thinking = thinkingBodyFor(provider.id, overrides?.[provider.id || '']);
      if (thinking) Object.assign(body, thinking);
    }
    const signal = mergedOptions.signal instanceof AbortSignal ? (mergedOptions.signal as AbortSignal) : undefined;
    const onDelta = typeof mergedOptions.onDelta === 'function' ? (mergedOptions.onDelta as (delta: string) => void) : undefined;
    const stream = (reqBody: Record<string, any>) => streamChatCompletions(provider, reqBody, signal, onDelta);
    const nonStream = (reqBody: Record<string, any>) => chatCompletionsNonStream(provider, reqBody, signal);
    // 主路：无 CORS 头的服务（如 opencode.ai）跳过注定失败的 fetch 直接 requestUrl；兜底恒为非流式
    const main = provider.noCors ? nonStream : stream;
    try {
      return await main(body);
    } catch (streamError: any) {
      if (signal?.aborted) throw streamError; // 用户取消：不再走 requestUrl 兜底
      // fetch 失败（CORS/网络）→ requestUrl 非流式兜底
      try {
        return await nonStream(body);
      } catch (e: any) {
        // response_format 降级（ticket 176）：部分服务商/模型不认该字段直接 400（两路同 body 必双双失败）
        // → 按主路去掉该字段重试一次，非纯 JSON 输出由调用方 extractJSON 兜底
        if (body.response_format && /response_format/i.test(`${streamError.message || ''}${e.message || ''}`)) {
          try {
            const bodyNoRf: any = { ...body };
            delete bodyNoRf.response_format;
            return await main(bodyNoRf);
          } catch (e2: any) {
            e = e2; // 降级也失败：报最终一次的错误
          }
        }
        throw new Error(`AI 请求失败: ${streamError.message}（fallback: ${e.message}）`);
      }
    }
  }

  /** 普通对话模型（deepseek-v4-flash） */
  async chat(promptText: string, extraOptions: AIOptions = {}): Promise<string> {
    return this.prompt(promptText, 'deepseek-v4-flash', extraOptions);
  }

  /** 推理模型，自动开启思考模式 */
  async reason(promptText: string, extraOptions: AIOptions = {}): Promise<string> {
    const options = this._prepareOptions(extraOptions, { enable_thinking: true });
    return this.prompt(promptText, 'deepseek-v4-flash', options);
  }

  /** 联网搜索（实验性，第三方代理平台生效） */
  async search(promptText: string, extraOptions: AIOptions = {}): Promise<string> {
    const options = this._prepareOptions(extraOptions, { search: true });
    return this.prompt(promptText, 'deepseek-v4-flash', options);
  }

  /** 要求 AI 返回 JSON 格式（设置 response_format） */
  async json(input: AIInput, extraOptions: AIOptions = {}): Promise<string> {
    const options = this._prepareOptions(extraOptions, {
      response_format: { type: 'json_object' },
    });
    return this.prompt(input, 'deepseek-v4-flash', options);
  }

  /** 思考 + 联网搜索（实验性） */
  async reasonAndSearch(promptText: string, extraOptions: AIOptions = {}): Promise<string> {
    const options = this._prepareOptions(extraOptions, {
      enable_thinking: true,
      search: true,
    });
    return this.prompt(promptText, 'deepseek-v4-flash', options);
  }

  setDefaultModel(model: string) {
    this.defaultModel = model;
  }

  setDefaultOptions(options: any) {
    this.defaultOptions = options;
  }

  // ---------- 内部辅助方法 ----------

  _mergeOptions(options: AIOptions): any {
    // 浅合并，对于嵌套的 modelOptions 需要特殊处理
    const merged: any = { ...this.defaultOptions, ...options };
    // 如果两者都有 modelOptions，进行合并
    if (this.defaultOptions.modelOptions || options.modelOptions) {
      merged.modelOptions = {
        ...(this.defaultOptions.modelOptions || {}),
        ...(options.modelOptions || {}),
      };
    }
    return merged;
  }

  /** 准备选项：复制 extraOptions，并设置指定的 modelOptions 字段（用户显式传入优先） */
  _prepareOptions(extraOptions: AIOptions, modelSettings: Record<string, any>): AIOptions {
    const options: any = { ...extraOptions };
    if (!options.modelOptions) options.modelOptions = {};
    const userModelOpts = options.modelOptions;
    options.modelOptions = { ...modelSettings, ...userModelOpts };
    return options;
  }
}

/**
 * 工厂函数，快速创建 AIService 实例
 * @param defaultMaxTokens 默认 8192（createAI 内部 max_tokens 默认）
 */
export function createAI(params?: any, defaultModel = 'deepseek-v4-flash', defaultOptions: any = {}, defaultMaxTokens = 8192): AIService {
  const internalDefaultOptions = {
    modelOptions: {
      max_tokens: defaultMaxTokens,
      ...(defaultOptions.modelOptions || {}),
    },
  };
  const mergedOptions: any = { ...internalDefaultOptions, ...defaultOptions };
  if (defaultOptions.modelOptions) {
    mergedOptions.modelOptions = {
      ...internalDefaultOptions.modelOptions,
      ...defaultOptions.modelOptions,
    };
  }
  return new AIService(params, defaultModel, mergedOptions);
}

// ===== 上游移植批 3f 前置：多模态输入基元（知识盒影像录入消费；provider 解析/键集零改动，F3 未动） =====

/** OpenAI 兼容 content 数组的部件（仅带图时才用到） */
export type AIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** 多轮对话消息（上游更智能批：小橘多轮对话走 core AI） */
export type AIMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** 多模态/多轮输入：纯文本，或 文本+图片 URL/数据 URL 数组，或 多轮 messages 数组 */
export type AIInput = string | { text: string; images?: string[] } | { messages: AIMessage[] };

/** DeepSeek Vision 接受的格式（其余如 svg/avif 需先转码）→ MIME */
const AI_IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};

/** 单图字节上限 32 MiB（DeepSeek Vision 文档口径）；超限应在调用方压缩后再发 */
export const AI_IMAGE_MAX_BYTES = 32 * 1024 * 1024;

/** 路径/文件名 → 受支持图片 MIME；非支持格式返回 null */
export function imageMimeOfPath(path: string): string | null {
  const ext = String(path || '').split('.').pop()?.toLowerCase() || '';
  return AI_IMAGE_MIME[ext] || null;
}

/** MIME → 规范扩展名（jpeg 归一 jpg）；未知返回 null */
export function imageExtOfMime(mime: string): string | null {
  const m = String(mime || '').toLowerCase();
  for (const [ext, known] of Object.entries(AI_IMAGE_MIME)) {
    if (known === m && ext !== 'jpeg') return ext;
  }
  return null;
}

/** 字节 → data URL（空内容抛错；超 32MiB 抛错） */
export function imageDataUrl(bytes: ArrayBuffer | Uint8Array, mime: string): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.byteLength === 0) throw new Error('图片内容为空');
  if (u8.byteLength > AI_IMAGE_MAX_BYTES) {
    throw new Error(`图片过大（${Math.round(u8.byteLength / 1024 / 1024)} MiB），上限 ${AI_IMAGE_MAX_BYTES / 1024 / 1024} MiB`);
  }
  return `data:${mime};base64,${toBase64(u8)}`;
}

/** 用户消息内容体：纯文本 → 字符串（旧报文不变）；带图 → 多模态数组（文本在前）；空图项丢弃 */
function buildUserContent(input: string | { text: string; images?: string[] }): string | AIContentPart[] {
  if (typeof input === 'string') return input;
  const text = String(input?.text ?? '');
  const images = (Array.isArray(input?.images) ? input.images : [])
    .map((u) => String(u ?? '').trim())
    .filter((u) => u.length > 0);
  if (!images.length) return text;
  return [
    { type: 'text', text },
    ...images.map<AIContentPart>((url) => ({ type: 'image_url', image_url: { url } })),
  ];
}

// ---------------- 连通性测试（issue 433：设置面板密钥行「测试」按钮；上游吸收批 3） ----------------

export interface AITestResult {
  /** 服务商显示名（如 DeepSeek / 智谱 Plan / Ollama） */
  label: string;
  /** 本次测试实际使用的模型名 */
  model: string;
  /** 全程耗时（毫秒） */
  ms: number;
  /** 模型回复文本（回显用） */
  reply: string;
}

/** 测试题面：诱导极短输出，控制真实调用的费用（deepseek/智谱按 token 计费，ollama 本地零成本） */
const AI_TEST_PROMPT = '这是一次连通性测试。请只回复两个字母：OK';

/**
 * 连通性测试：对指定服务商发一次**真实**的极小对话请求，走完整链路（鉴权 / 端点 / 流式 /
 * 兜底全过一遍才算通）。`providerId` 缺省 = 当前设置的 provider；显式传 id 时按该家设置解析
 * （不受当前下拉选中影响）。失败一律抛错（缺密钥 / 网络 / HTTP 非 2xx），stateful 钮经
 * shortFailReason 翻红、通知链路直接可弹；回复为空也视为不通（哑响应不该被当成「连着」）。
 */
export async function testAIConnectivity(providerId?: string): Promise<AITestResult> {
  const { tryGetSettings } = await import('./settings-provider');
  const { providerDescriptorOf } = await import('./ai-models');
  const id = String(providerId || '').trim();
  const effId = id || String((tryGetSettings() as any)?.aiProvider || '') || 'deepseek';
  const provider = await getAIProvider(id || undefined);
  const model = provider.model || undefined;
  const t0 = Date.now();
  const svc = createAI();
  const reply = (await svc.prompt(AI_TEST_PROMPT, model, id ? { provider: id } : {})).trim();
  if (!reply) throw new Error(`${providerDescriptorOf(effId).label} 连通异常：请求成功但回复为空`);
  return { label: providerDescriptorOf(effId).label, model: model || '默认模型', ms: Date.now() - t0, reply };
}
