/**
 * smartcat AI 层（用户拍板：AI 走 bz 内置——core/ai 的 getAIProvider 解析 provider，
 * 不设独立 apiKey 面板）。issue 334/ADR-0148 起迁移到 core AIService 单通道：
 * 多轮经 prompt({messages})（core/ai 同款 fetch 流式 → requestUrl 非流式兜底 + 空闲超时）；
 * 输出上限面板独裁（per-provider 覆盖 > 注册表默认），模型跟随设置；
 * temperature 0.7 / response_format 属任务语义，仍由本域传入（采样参数组 9-08 拍板不进设置）。
 */
import { createAI, getAIProvider } from '../core/ai';
import type { ChatMessage } from './types';

/** ChatMessage → OpenAI 兼容报文（timestamp 等域内扩展字段不进请求体） */
function toAIMessages(messages: ChatMessage[]): { role: ChatMessage['role']; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}


// ===== 本地超时包裹层（P2 融合保留：上游委托 createAI 后仍兜底 60s 超时；测试经 helper 注入窗口） =====
export const AI_CALL_TIMEOUT_MS = 60 * 1000;
let callTimeoutMs = AI_CALL_TIMEOUT_MS;
/** 测试辅助：注入超时窗口（unload 无需恢复——模块级仅测试使用） */
export function __setAICallTimeoutMsForTests(ms: number): void { callTimeoutMs = ms; }

function raceTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时（${Math.round(callTimeoutMs / 1000)}s）`)), callTimeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => { if (timer) clearTimeout(timer); }) as Promise<T>;
}

/** 调小橘多轮对话（走 bz provider，模型/输出上限跟随设置面板） */
export async function callChat(messages: ChatMessage[]): Promise<string> {
  return raceTimeout(createAI().prompt({ messages: toAIMessages(messages) }, undefined, {
    modelOptions: { temperature: 0.7 },
  }), '小橘对话');
}

/**
 * 结构化 JSON 通道（ADR-0021：importance 打分/反思需要 response_format）
 * 返回解析后的对象；解析失败抛错（调用方降级）。输出上限走设置面板（issue 334/ADR-0148）。
 */
export async function callChatJson(messages: ChatMessage[]): Promise<any> {
  const content = await raceTimeout(createAI().prompt({ messages: toAIMessages(messages) }, undefined, {
    modelOptions: { temperature: 0.7, response_format: { type: 'json_object' } },
  }), '小橘结构化通道');
  try {
    const trimmed = (content || '').trim();
    return JSON.parse(trimmed);
  } catch (e: any) {
    throw new Error(`JSON 解析失败: ${e.message}`);
  }
}

/** 是否已配置 AI（data.json 或 QuickAdd 回退可解析）——未配置给引导文案 */
export async function isAIConfigured(): Promise<boolean> {
  try {
    await getAIProvider();
    return true;
  } catch (e) {
    return false;
  }
}
