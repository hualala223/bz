/**
 * 主设置页 schema（ticket 131，ADR-0064）：BzSettingTab.display() 的区块声明（🤖 AI / 📂 数据存储
 * 路径，issue 258 起追加「🔔 通知」组）。归属 core 的理由：各区块均为跨域全局项（ADR-0009 设置
 * 所有权），且文案 lint（ticket 100）需以纯数据方式全量断言（本模块只依赖 core 与设置类型，
 * node 环境可安全加载）。
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
import type { RowAction, SettingsRow, SettingsSchema } from './settings-schema';
import { thinkingOptionsOf, testAIConnectivity } from './ai';
import { DEFAULT_JEV_PROVIDER, JEV_PROVIDER_REGISTRY, fetchJevModels, getJevProviderDescriptor, testJevConnectivity } from './jev';
import { isQwen3Embedding8b } from './ai-models';

/** 存储路径改动防错提示（f1；正文不带 emoji，铁律 7）——文案逐字冻结，勿改 */
export const STORAGE_PATH_COMMIT_NOTICE = '存储路径已修改：仅改路径，文件不会自动迁移，旧数据需自行迁移；重载插件后生效。';

/** 思考档位行（上游 issue 411/ADR-0179 融合）：per-provider 档位下拉，选项与请求注入同源 core/ai。
 *  aiThinkingOverrides 是 per-provider 记录键，走三函数逃生口读写；选「跟随模型默认」即删键不注入。 */
function thinkingRow(providerId: string, name: string, desc: string): SettingsRow {
  return {
    type: 'select',
    name,
    desc,
    binding: {
      get: () => ((tryGetSettings() as any).aiThinkingOverrides || {})[providerId] || 'auto',
      set: (v: string) => {
        const s = getSettings() as any;
        const rec = { ...(s.aiThinkingOverrides || {}) };
        if (v === 'auto') delete rec[providerId];
        else rec[providerId] = v;
        s.aiThinkingOverrides = rec;
      },
      save: () => saveSettings(),
    },
    options: thinkingOptionsOf(providerId),
    visibleWhen: (snapshot) => snapshot.aiProvider === providerId,
  };
}


/** 最大输出 token 行（上游 ticket 172/issue 342 融合）：per-provider number 行，写 aiMaxTokensOverrides。
 *  0 = 删键回落 model-limits 官方档（与 aiMaxTokensOf 消费口径自洽）。上游为单行 refreshKey 随服务商
 *  联动，本地渲染器无该联动，落成 per-provider 静态行（visibleWhen 显隐，与思考档位行同范式）。 */
function maxTokensRow(providerId: string): SettingsRow {
  return {
    type: 'number',
    name: '最大输出 token',
    desc: '留空时取该模型官方上限',
    min: 0,
    max: 200000, // 上界拦手滑多打的 0（上游同款量级）
    binding: {
      get: () => {
        const rec = ((tryGetSettings() as any).aiMaxTokensOverrides || {}) as Record<string, number>;
        const n = Number(rec[providerId]);
        return Number.isFinite(n) && n > 0 ? n : 0;
      },
      set: (v: number) => {
        const s = getSettings() as any;
        const rec = { ...(s.aiMaxTokensOverrides || {}) };
        if (!v || v <= 0) delete rec[providerId];
        else rec[providerId] = v;
        s.aiMaxTokensOverrides = rec;
      },
      save: () => saveSettings(),
    },
    placeholder: '默认上限',
    visibleWhen: (snapshot) => snapshot.aiProvider === providerId,
  };
}

// ---------------- 行内「测试」钮 + Jev 按服务商分存（issue 433/434，上游吸收批 3） ----------------

/** 当前 Jev 服务商 id（设置未显式时取注册表缺省；口径同 core/jev 的 resolveJevConfig） */
function currentJevProviderId(): string {
  const s = tryGetSettings() as any;
  return String(s.jevProvider || '') || DEFAULT_JEV_PROVIDER;
}

/** 读当前服务商的分存槽位（keys = 密钥 map，model = 模型 map；空 = 显示空，回落逻辑在消费侧） */
function jevScopedValue(kind: 'keys' | 'model'): string {
  const s = tryGetSettings() as any;
  const map = kind === 'keys' ? s.jevApiKeys : s.jevModels;
  return String(map?.[currentJevProviderId()] ?? '');
}

/** 写当前服务商的分存槽位（空值 = 删键：密钥删即回落 LLM，模型删即回落该家缺省）；持久化走 binding.save */
function setJevScopedValue(kind: 'keys' | 'model', raw: string): void {
  const s = getSettings() as any;
  const field = kind === 'keys' ? 'jevApiKeys' : 'jevModels';
  if (!s[field] || typeof s[field] !== 'object') s[field] = {};
  const map = s[field] as Record<string, string>;
  const v = String(raw ?? '').trim();
  if (v === '') delete map[currentJevProviderId()];
  else map[currentJevProviderId()] = v;
}

/** Jev「测试」钮（issue 434 拍板：状态长在按钮上——点击转圈、成功绿框「已连通」、失败红框简短
 *  原因，不弹通知）。先落盘防抖中的手输值——所配即所测；失败经 reject 交给渲染器翻红。 */
function jevTestAction(): RowAction {
  return {
    text: '测试',
    stateful: true,
    onClick: async () => {
      await saveSettings();
      await testJevConnectivity(); // 抛错 = 红✕；成功 = 绿✓
    },
  };
}

/** LLM 密钥行「测试」钮（issue 433/434）：对该行所属服务商发一次真实极小请求验证连通
 *  （testAIConnectivity 按 id 解析该家设置，不受当前下拉选中影响）；三态同 jevTestAction。 */
function providerTestAction(providerId: string): RowAction {
  return {
    text: '测试',
    stateful: true,
    onClick: async () => {
      await saveSettings();
      await testAIConnectivity(providerId);
    },
  };
}
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
              { value: 'zhipu-plan', label: '智谱 Plan' },
              { value: 'siliconflow', label: '硅基流动' },
              { value: 'volcano-ark', label: '火山方舟' },
              { value: 'ollama', label: 'Ollama（本地）' },
            ],
          },
          {
            type: 'text',
            name: 'DeepSeek 密钥',
            desc: '留空则自动回退读取外部配置密钥',
            binding: { key: 'deepseekApiKey' },
            actions: [providerTestAction('deepseek')],
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
            actions: [providerTestAction('opencode-go')],
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
            actions: [providerTestAction('zhipu')],
            visibleWhen: (snapshot) => snapshot.aiProvider === 'zhipu',
          },
            {
              type: 'text',
              name: '智谱 Plan 密钥',
              desc: '智谱 Coding 套餐专用端点，密钥与智谱开放平台相同',
              binding: { key: 'zhipuPlanApiKey' },
              actions: [providerTestAction('zhipu-plan')],
              visibleWhen: (snapshot) => snapshot.aiProvider === 'zhipu-plan',
            },
            {
              type: 'text',
              name: '智谱 Plan 模型',
              desc: '留空则使用内置默认模型',
              binding: { key: 'zhipuPlanModel' },
              placeholder: 'glm-5.3-flash',
              visibleWhen: (snapshot) => snapshot.aiProvider === 'zhipu-plan',
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
            actions: [providerTestAction('siliconflow')],
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
            actions: [providerTestAction('volcano-ark')],
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
          {
            type: 'text',
            name: 'Ollama 密钥',
            desc: '本地服务无需密钥，留空即可',
            binding: { key: 'ollamaApiKey' },
            actions: [providerTestAction('ollama')],
            visibleWhen: (snapshot) => snapshot.aiProvider === 'ollama',
          },
          {
            type: 'text',
            name: 'Ollama 模型',
            desc: '留空使用内置模型，可填已拉取的模型名',
            binding: { key: 'ollamaModel' },
            placeholder: '默认 llama3.1',
            visibleWhen: (snapshot) => snapshot.aiProvider === 'ollama',
          },
          // 思考档位（上游 issue 411/ADR-0179 融合）：逐家档位下拉，选项与注入同源
          thinkingRow('deepseek', '思考档位', '思考强度档位，跟随默认不注入思考参数'),
          thinkingRow('opencode-go', '思考档位', '思考开关档位，跟随默认不注入思考参数'),
          thinkingRow('zhipu', '思考档位', '思考开关档位，跟随默认不注入思考参数'),
          thinkingRow('zhipu-plan', '思考档位', '思考强度档位，跟随默认不注入思考参数'),
          thinkingRow('siliconflow', '思考档位', '思考开关档位，跟随默认不注入思考参数'),
          thinkingRow('volcano-ark', '思考档位', '思考开关档位，跟随默认不注入思考参数'),
          thinkingRow('ollama', '思考档位', '思考强度档位，跟随默认不注入思考参数'),
          // 最大输出 token（上游 ticket 172/issue 342 融合）：per-provider 覆盖，0/清空回落官方档
          maxTokensRow('deepseek'),
          maxTokensRow('opencode-go'),
          maxTokensRow('zhipu'),
          maxTokensRow('zhipu-plan'),
          maxTokensRow('siliconflow'),
          maxTokensRow('volcano-ark'),
          maxTokensRow('ollama'),
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
        // Embedding 组（上游 issue 422/423/ADR-0182/0183 的迁入目的地；本地 panel.ts 注释记载
        // 「迁 AI 面板」而目的地一直缺位，本票补齐）。换模型后打开二脑面板自动全量重建
        // （panel needsModelRebuild，F2 口径：只换模型不碰 .vec 布局，默认仍 bge-m3）。
        name: 'Embedding',
        rows: [
          { type: 'text', name: 'Embedding 模型', desc: '第二大脑向量化模型，更换后自动重建索引', binding: { key: 'secondBrainEmbeddingModel' }, placeholder: '默认 bge-m3' },
          {
            type: 'button',
            name: '获取模型',
            buttonText: '获取已装模型',
            desc: '拉取本机 Ollama 已装模型列表，选择后写入上方模型行',
            onClick: () => {
              void (async () => {
                const { fetchProviderModels } = await import('./ai-models');
                const { openModelPicker } = await import('./settings-model-picker');
                try {
                  const models = await fetchProviderModels('ollama');
                  openModelPicker({
                    providerLabel: 'Ollama',
                    current: String((tryGetSettings() as any).secondBrainEmbeddingModel || ''),
                    models,
                    onPick: (m) => {
                      (getSettings() as any).secondBrainEmbeddingModel = m.id;
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
          { type: 'text', name: 'Ollama 本地 URL', desc: 'Ollama 服务地址，向量嵌入走此连接', binding: { key: 'secondBrainOllamaUrl' }, placeholder: 'http://localhost:11434' },
          // 重排行（issue 431/ADR-0189 双通道二选一，上游吸收批 3）：总闸常显；「重排走 Jev」
          // 总闸开才显示（云端判定不绑 8B 门）；本地「重排模型」行仅 8B 嵌入 ∧ 总闸开 ∧ Jev 关
          //（本地通道专属，行隐藏即通道 off）。运行期判定单源 config.rerankChannel()。
          { type: 'toggle', name: '启用重排', desc: '召回结果再精排，相关笔记排序更准', binding: { key: 'secondBrainRerank' } },
          { type: 'toggle', name: '重排走 Jev', desc: '改用 Jev 模型云端重排，未配密钥自动回落余弦序', binding: { key: 'secondBrainRerankJev' }, visibleWhen: (snapshot) => snapshot.secondBrainRerank !== false },
          { type: 'text', name: '重排模型', desc: '本地重排通道使用的模型，留空用内置 Qwen3-Reranker-4B', binding: { key: 'secondBrainRerankModel' }, placeholder: '默认 Qwen3-Reranker-4B', visibleWhen: (snapshot) => isQwen3Embedding8b(snapshot.secondBrainEmbeddingModel) && snapshot.secondBrainRerank !== false && snapshot.secondBrainRerankJev !== true },
        ],
      },
      {
        // JEV 组（上游 issue 422/ADR-0182）：Jev 判定通道（core/jev），cinema 类型判定与
        // secondbrain 链接代理消费；密钥留空回落生成通道。issue 430/433/434（上游吸收批 3）：
        // 服务商两家（博查与 Typesafe 报文同构、模型缺省各配），密钥/模型按服务商分存
        // （refreshKey 随「Jev 服务商」切换原地换值），行内「测试」钮发真实请求验证连通。
        name: 'JEV',
        rows: [
          { type: 'select', name: 'Jev 服务商', desc: '判定通道的服务商，密钥与模型随服务商各自保存', binding: { key: 'jevProvider' }, options: JEV_PROVIDER_REGISTRY.map((p) => ({ value: p.id, label: p.label })) },
          {
            type: 'secret',
            name: 'Jev 密钥',
            desc: '填写后判定通道即启用，测试按钮会发一次真实请求',
            binding: { get: () => jevScopedValue('keys'), set: (v: string) => setJevScopedValue('keys', v), save: () => saveSettings() },
            placeholder: '粘贴 Jev 密钥',
            refreshKey: () => jevScopedValue('keys'),
            actions: [jevTestAction()],
          },
          {
            type: 'text',
            name: 'Jev 模型',
            desc: '判定使用的模型，留空跟随服务商缺省',
            placeholder: 'jev-latest',
            binding: { get: () => jevScopedValue('model'), set: (v: string) => setJevScopedValue('model', v), save: () => saveSettings() },
            refreshKey: () => jevScopedValue('model'),
            actions: [{
              text: '获取模型',
              onClick: async (_value, ctx) => {
                try {
                  await saveSettings(); // 先落盘防抖中的手输值，再读当前状态拉取
                  const providerId = currentJevProviderId();
                  const models = await fetchJevModels();
                  // 拉取期间服务商仍可能被切——以当前为准，不一致即弃用（照 LLM 模型行口径）
                  if (currentJevProviderId() !== providerId) {
                    notice('服务商已切换，请重新获取', 'warning');
                    return;
                  }
                  const { openModelPicker } = await import('./settings-model-picker');
                  await new Promise<void>((resolve) => {
                    openModelPicker({
                      providerLabel: getJevProviderDescriptor(providerId).label,
                      current: jevScopedValue('model'),
                      models,
                      onPick: (m) => {
                        setJevScopedValue('model', m.id);
                        void saveSettings();
                        // 与手输 onChange 同口径；回填显示值由渲染器动作链负责
                        ctx.refreshVisibility();
                        notice(`Jev 模型已设为 ${m.id}`, 'success');
                        resolve();
                      },
                    });
                  });
                } catch (e) {
                  notice(e instanceof Error ? e.message : String(e), 'error');
                }
              },
            }],
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
      // 通知横切偏好（issue 258，吸收上游 issue 297）：core notice toast 的全局偏好，不建业务域，
      // 因此进主设置页而不进设置面板导航。按本地既有形态接入——无 icon = 区块标题平铺（与 🤖 AI 同），
      // 不引 icon 字段改变既有组头版式；行型全 select，四项缺省值均等于加入偏好之前的既有行为。
      {
        name: '🔔 通知',
        rows: [
          {
            type: 'select',
            name: '通知级别',
            desc: '低档位静默常规通知，带撤销按钮的通知不受影响',
            binding: { key: 'noticeLevel' },
            options: [
              { value: 'all', label: '全部' },
              { value: 'important', label: '仅警告与错误' },
              { value: 'error', label: '仅错误' },
            ],
          },
          {
            type: 'select',
            name: '停留时长',
            desc: '长文案自动延长，撤销类通知不受影响',
            binding: { key: 'noticeDuration' },
            options: [
              { value: 'quick', label: '干脆（2 秒）' },
              { value: 'standard', label: '标准（3 秒）' },
              { value: 'relaxed', label: '从容（5 秒）' },
              { value: 'persistent', label: '常驻（点击才关）' },
            ],
          },
          {
            type: 'select',
            name: '弹出位置',
            desc: '桌面端四角任选，移动端恒顶部居中',
            binding: { key: 'noticePosition' },
            options: [
              { value: 'top-right', label: '右上（默认）' },
              { value: 'bottom-right', label: '右下' },
              { value: 'bottom-left', label: '左下' },
              { value: 'top-left', label: '左上' },
            ],
          },
          {
            type: 'select',
            name: '同屏上限',
            desc: '超出时挤掉最旧的一条',
            binding: { key: 'noticeMaxVisible' },
            options: [
              { value: '3', label: '3 条' },
              { value: '5', label: '5 条（默认）' },
              { value: '8', label: '8 条' },
            ],
          },
        ],
      },
    ],
  };
}
