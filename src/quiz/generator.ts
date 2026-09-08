/**
 * 做题家题目生成器（ticket 176 单篇化重构：批量协议随「更新题库」入口退役删除；
 * 请求带超时 + 瞬时失败退避重试 + 出题显式关思考 + 选项打乱重映射 + 逐题过滤校验）
 */
import type { AIService } from '../core/ai';
import type { QuizQuestion } from './manager';

/** 单篇笔记内容截断上限（ticket 176：3000→10000，长笔记后半段也能出题） */
export const NOTE_CONTENT_LIMIT = 10000;

/** 单次 AI 出题请求超时（ticket 176：此前无超时，请求挂死时复习循环永久卡住且不可取消） */
const AI_TIMEOUT_MS = 90_000;
/** 瞬时失败（限流/5xx/网络抖动）重试次数与退避基数（1s、2s）；配置类错误与超时不重试 */
const AI_RETRY_MAX = 2;
const AI_RETRY_BASE_MS = 1000;

/** generate 可选调参（测试注入用；缺省用上方常量） */
export interface GenerateOptions {
  timeoutMs?: number;
  retryMax?: number;
  retryBaseMs?: number;
}

/** 超时 signal（AbortSignal.timeout 不可用——老 WebView——退化为无超时，与旧行为一致） */
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return typeof (AbortSignal as any).timeout === 'function' ? (AbortSignal as any).timeout(ms) : undefined;
  } catch {
    return undefined;
  }
}

/** 选项乱序 + correctIndices 重映射（ticket 176：消除模型正确答案位置偏好）。
 *  在生成落盘前执行——存储与会话同源，removeQuestion 按内容定位不受影响。 */
function shuffleOptions(q: QuizQuestion): QuizQuestion {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndices: q.correctIndices.map((ci) => order.indexOf(ci)).sort((a, b) => a - b),
  };
}

export class QuestionGenerator {
  /** 构建提示词（ticket 176：开头随题型变化不再与多选矛盾；追加选项卫生与内容依据约束） */
  buildPrompt(content: string, enableMultipleChoice: boolean, questionsPerNote: number, difficulty: string): string {
    const truncated = content.slice(0, NOTE_CONTENT_LIMIT);
    let typeHint = '单选题（四选一）';
    let structure = `{ "question": "题目文本", "options": ["A选项","B选项","C选项","D选项"], "correctIndices": [0] }`;
    if (enableMultipleChoice) {
      typeHint = '可以是单选题或多选题（正确选项数量不限）';
      structure = `{ "question": "题目文本", "options": ["A选项","B选项","C选项","D选项"], "correctIndices": [0, 2] }（数组内为正确选项的索引）`;
    }
    let countHint = '';
    if (questionsPerNote > 0) {
      countHint = `请生成恰好 ${questionsPerNote} 道题目。`;
    } else {
      countHint = '生成若干道题目（数量适中，建议 3~6 道）。';
    }

    let difficultyHint = '';
    if (difficulty === 'easy') {
      difficultyHint = '请生成基础概念题，选项区分度明显，避免陷阱，难度较低。';
    } else if (difficulty === 'medium') {
      difficultyHint = '生成中等难度题目，可包含细节辨析，选项有一定迷惑性。';
    } else if (difficulty === 'hard') {
      difficultyHint = '生成高难度题目，可涉及推理、多知识点交叉，选项具有较强迷惑性。';
    }
    // random 或不合法：不添加难度提示，让 AI 自由决定

    const opening = enableMultipleChoice
      ? '根据以下笔记内容，生成若干道选择题，以便复习。'
      : '根据以下笔记内容，生成若干道四选一的选择题（每题一个正确答案），以便复习。';
    return `${opening}请仅返回一个合法的 JSON 对象，结构如下：
{
  "questions": [
    ${structure}
  ]
}
注意：题目类型为 ${typeHint}，${countHint}
${difficultyHint}
- 选项不要带「A.」「A、」等编号前缀，四个选项内容互不相同
- 题目和答案必须依据笔记内容，不要编造笔记中没有的信息
笔记内容：
${truncated}`;
  }

  /** 提取 JSON（源码 L129-138 逐字） */
  extractJSON(text: string): any {
    const code = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (code) {
      try {
        return JSON.parse(code[1].trim());
      } catch {
        /* 继续尝试 */
      }
    }
    try {
      return JSON.parse(text.trim());
    } catch {
      /* 继续尝试 */
    }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(text.substring(first, last + 1));
      } catch {
        /* 继续尝试 */
      }
    }
    throw new Error('无法从 AI 响应中提取有效的 JSON');
  }

  /** 请求 + 重试（ticket 176）：单次请求带超时 signal；瞬时错误（限流/5xx/网络）退避重试，
   *  配置类错误（发请求前即失败）与 AbortError（超时/取消）不重试；出题显式关思考
   *  （enable_thinking:false，智谱/方舟由 core 层方言翻译为 thinking:{type:'disabled'}——
   *  防豆包自适应思考吃掉 max_tokens 截断 JSON，且出题不需要思考）。 */
  private async requestJSON(prompt: string, aiService: AIService, opts?: GenerateOptions): Promise<string> {
    const timeoutMs = opts?.timeoutMs ?? AI_TIMEOUT_MS;
    const retryMax = opts?.retryMax ?? AI_RETRY_MAX;
    const baseMs = opts?.retryBaseMs ?? AI_RETRY_BASE_MS;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retryMax; attempt++) {
      if (attempt > 0) await new Promise<void>((r) => setTimeout(r, baseMs * attempt));
      try {
        return await aiService.json(prompt, {
          signal: timeoutSignal(timeoutMs),
          modelOptions: { enable_thinking: false },
        });
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || '');
        if (e?.name === 'AbortError') throw e;
        if (/^未配置|^未找到 AI 配置/.test(msg)) throw e;
      }
    }
    throw lastErr;
  }

  /** 生成题目（单篇，ticket 176 重构）：逐题过滤校验（与原批量口径对齐——一题坏不再毁整篇），
   *  索引越界剔除，全部无效才报错；返回前选项打乱。 */
  async generate(noteContent: string, aiService: AIService, enableMultipleChoice: boolean, questionsPerNote: number, difficulty: string, opts?: GenerateOptions): Promise<QuizQuestion[]> {
    const prompt = this.buildPrompt(noteContent, enableMultipleChoice, questionsPerNote, difficulty);
    const result = await this.requestJSON(prompt, aiService, opts);
    const parsed = this.extractJSON(result);
    const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const valid: QuizQuestion[] = [];
    for (const q of list) {
      if (!q?.question || !Array.isArray(q.options) || q.options.length !== 4) continue;
      if (!Array.isArray(q.correctIndices)) continue;
      const indices = q.correctIndices.filter((idx: any) => typeof idx === 'number' && idx >= 0 && idx <= 3);
      if (!indices.length) continue;
      valid.push({ ...q, correctIndices: indices });
    }
    if (!valid.length) throw new Error('AI 未返回有效题目数组。');
    return valid.map(shuffleOptions);
  }
}
