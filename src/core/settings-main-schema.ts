/**
 * 主设置页 schema（ticket 131，ADR-0064）：BzSettingTab.display() 两区块（🤖 AI / 📂 数据存储
 * 路径）的声明式定义。归属 core 的理由：两区块均为跨域全局项（ADR-0009 设置所有权），且文案
 * lint（ticket 100）需以纯数据方式全量断言（本模块只依赖 core 与设置类型，node 环境可安全加载）。
 *
 * 行为零变化锚点：
 * - AI 服务商切换 → 密钥/模型行显隐由 visibleWhen 按所选服务商声明（ticket 175 扩为五家统一
 *   「密钥行 + 可选模型行」模式；opencode 行显隐由「非 deepseek」收窄为「=== opencode-go」，
 *   两选项时代的宽口径在扩容后会错显，必须收窄）；
 * - 存储路径行 onCommit 的 warning 提示文案逐字保留（f1 防错提示，正文不带 emoji，铁律 7）；
 * - 区块标题 DOM 契约 .bz-setting-section-title 不破（无 icon 分组 = 区块标题平铺形态）。
 * - ticket 100 文案修正（键名/行为不动）：两个 API Key 行标题收短为「DeepSeek 密钥」「OpenCode 密钥」，
 *   全部描述改写为约 20 字自然句、去符号花样（原描述含括号/斜杠/域名/超长枚举，lint 不过）。
 * - ticket 175：新增智谱/硅基流动/火山方舟三家（默认模型内置，模型行留空即内置默认）。
 */
import { notice } from './notice';
import { getSettings, saveSettings, tryGetSettings } from './settings-provider';
import type { SettingsSchema } from './settings-schema';

/** 存储路径改动防错提示（f1；正文不带 emoji，铁律 7）——文案逐字冻结，勿改 */
export const STORAGE_PATH_COMMIT_NOTICE = '存储路径已修改：仅改路径，文件不会自动迁移，旧数据需自行迁移；重载插件后生效。';

/** 构造主设置页 schema（每次 display 重建；visibleWhen 在渲染器内随变更重求值） */
export function mainSettingsSchema(): SettingsSchema {
  return {
    groups: [
      {
        name: '🤖 AI',
        rows: [
          {
            type: 'select',
            name: 'AI 服务商',
            desc: '切换服务商后显示对应的密钥配置',
            binding: { key: 'aiProvider' },
            options: [
              { value: 'deepseek', label: 'DeepSeek' },
              { value: 'opencode-go', label: 'OpenCode Go' },
              { value: 'zhipu', label: '智谱' },
              { value: 'siliconflow', label: '硅基流动' },
              { value: 'volcano-ark', label: '火山方舟' },
            ],
          },
          {
            type: 'text',
            name: 'DeepSeek 密钥',
            desc: '留空则自动回退读取外部配置密钥',
            binding: { key: 'deepseekApiKey' },
            visibleWhen: (snapshot) => snapshot.aiProvider === 'deepseek',
          },
          {
            type: 'text',
            name: 'DeepSeek 模型',
            desc: '留空使用默认模型，可填其他模型名',
            binding: { key: 'deepseekModel' },
            placeholder: '默认 deepseek-v4-flash',
            visibleWhen: (snapshot) => snapshot.aiProvider === 'deepseek',
          },
          {
            type: 'text',
            name: 'OpenCode 密钥',
            desc: '在订阅官网获取后填入这里',
            binding: { key: 'opencodeGoApiKey' },
            visibleWhen: (snapshot) => snapshot.aiProvider === 'opencode-go',
          },
          {
            type: 'text',
            name: 'OpenCode 模型',
            desc: '留空使用默认模型，可填其他模型名',
            binding: { key: 'opencodeGoModel' },
            placeholder: '默认 deepseek-v4-flash',
            visibleWhen: (snapshot) => snapshot.aiProvider === 'opencode-go',
          },
          {
            type: 'text',
            name: '智谱密钥',
            desc: '在智谱开放平台获取后填入这里',
            binding: { key: 'zhipuApiKey' },
            visibleWhen: (snapshot) => snapshot.aiProvider === 'zhipu',
          },
          {
            type: 'text',
            name: '智谱模型',
            desc: '留空使用内置免费模型，可填其他模型',
            binding: { key: 'zhipuModel' },
            placeholder: '默认 glm-4.7-flash',
            visibleWhen: (snapshot) => snapshot.aiProvider === 'zhipu',
          },
          {
            type: 'text',
            name: '硅基流动密钥',
            desc: '在硅基流动官网获取后填入这里',
            binding: { key: 'siliconflowApiKey' },
            visibleWhen: (snapshot) => snapshot.aiProvider === 'siliconflow',
          },
          {
            type: 'text',
            name: '硅基流动模型',
            desc: '留空使用内置模型，可填平台模型名',
            binding: { key: 'siliconflowModel' },
            placeholder: '默认 deepseek-ai/DeepSeek-V3',
            visibleWhen: (snapshot) => snapshot.aiProvider === 'siliconflow',
          },
          {
            type: 'text',
            name: '火山方舟密钥',
            desc: '在火山方舟控制台获取后填入这里',
            binding: { key: 'volcanoArkApiKey' },
            visibleWhen: (snapshot) => snapshot.aiProvider === 'volcano-ark',
          },
          {
            type: 'text',
            name: '火山方舟模型',
            desc: '留空用内置模型，接入点 ID 也填这里',
            binding: { key: 'volcanoArkModel' },
            placeholder: '默认 doubao-seed-1-6-flash-250828',
            visibleWhen: (snapshot) => snapshot.aiProvider === 'volcano-ark',
          },
          // 上游线 P5（ticket 173「获取模型名」本地适配）：按当前服务商拉取 /models 列表，
          // 弹选择器回填该服务商的模型行。端点/密钥键名与 core/ai.ts getAIProvider 逐字对齐。
          {
            type: 'button',
            name: '获取模型名',
            buttonText: '获取当前服务商模型',
            desc: '拉取当前 AI 服务商的可用模型列表，选择后写入上方该服务商的模型行',
            onClick: () => {
              void (async () => {
                const { fetchProviderModels, providerDescriptorOf } = await import('./ai-models');
                const { openModelPicker } = await import('./settings-model-picker');
                try {
                  const providerId = String((tryGetSettings() as any).aiProvider || 'opencode-go');
                  const desc = providerDescriptorOf(providerId);
                  const models = await fetchProviderModels(providerId);
                  const modelKey = `${providerId === 'opencode-go' ? 'opencodeGo' : providerId}Model`;
                  openModelPicker({
                    providerLabel: desc.label,
                    current: String((tryGetSettings() as any)[modelKey] || ''),
                    models,
                    onPick: (m) => {
                      (getSettings() as any)[modelKey] = m.id;
                      void saveSettings();
                      notice(`模型已设为 ${m.id}`, 'success');
                    },
                  });
                } catch (e) {
                  notice(e instanceof Error ? e.message : String(e), 'error');
                }
              })();
            },
          },
        ],
      },
      {
        name: '📂 数据存储路径',
        rows: [
          {
            type: 'path',
            mode: 'single',
            name: '数据存储路径',
            desc: '全部 JSON 数据文件统一存放的目录',
            binding: { key: 'storagePath' },
            onCommit: () => {
              notice(STORAGE_PATH_COMMIT_NOTICE, 'warning');
            },
          },
        ],
      },
    ],
  };
}
