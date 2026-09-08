/**
 * 做题家入口（ticket 17）：ensureQuiz + 单例 re-export。
 * 独立命令入口已退役（ticket 098）；「更新题库」批量入口随单篇化退役（ticket 176）——
 * 做题家只作为复习流程一环，由复习域驱动：
 * review/app.ts ensureQuiz（懒加载）→ regenerateQuestions（出题）→ startReviewSession（做题）。
 */
import type { App } from 'obsidian';
import { createAI } from '../core/ai';
import { getSettings } from '../core/settings-provider';
import { QuizMasterUI, quizUI } from './ui';

let initialized = false;

/** 幂等初始化：AI 注入 + 设置注入 + 样式（源码 entry L739-770） */
export function ensureQuiz(app: App): void {
  if (initialized) return;
  initialized = true;
  QuizMasterUI.ai = createAI();
  quizUI.ai = QuizMasterUI.ai; // 实例镜像：复习域经 quizUI.ai 判断（静态属性不挂实例）
  QuizMasterUI.settings = getSettings();
}

export { QuizMasterUI, quizUI };
