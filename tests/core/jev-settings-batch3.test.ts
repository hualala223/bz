// @vitest-environment node
/**
 * 上游吸收批 3（issue 430/433/434）设置面测试：
 * 1) migrateRetiredJevKeys——424 期退役键兜底清除、旧缺省模型名改写、全局 jevApiKey/jevModel
 *    迁入按服务商分存 map 的 typesafe 槽位（幂等、空值不搬）；
 * 2) 主设置 schema——JEV 组密钥/模型行走分存三函数绑定 + refreshKey 联动、「测试」钮 stateful；
 *    七家 LLM 密钥行各挂 stateful「测试」钮。
 */
import { describe, it, expect } from 'vitest';
import { migrateRetiredJevKeys, DEFAULT_SETTINGS } from '../../src/settings';
import { mainSettingsSchema } from '../../src/core/settings-main-schema';
import { JEV_PROVIDER_REGISTRY } from '../../src/core/jev';

describe('migrateRetiredJevKeys（Jev 旧键退役迁移）', () => {
  it('全局密钥/模型迁入 typesafe 槽位并删除旧键', () => {
    const rec: Record<string, unknown> = { jevApiKey: 'sk-old', jevModel: 'jev-latest', jevProvider: 'typesafe' };
    expect(migrateRetiredJevKeys(rec)).toBe(true);
    expect(rec.jevApiKeys).toEqual({ typesafe: 'sk-old' });
    expect(rec.jevModels).toEqual({ typesafe: 'jev-latest' });
    expect(rec.jevApiKey).toBeUndefined();
    expect(rec.jevModel).toBeUndefined();
  });

  it('旧缺省模型名 jev-1.13.0 先改写再迁槽', () => {
    const rec: Record<string, unknown> = { jevModel: 'jev-1.13.0' };
    expect(migrateRetiredJevKeys(rec)).toBe(true);
    expect(rec.jevModels).toEqual({ typesafe: 'jev-latest' });
  });

  it('已有分存值不覆盖：旧键缺失时 map 原样保留', () => {
    const rec: Record<string, unknown> = {
      jevProvider: 'bocha',
      jevApiKeys: { typesafe: 'sk-a', bocha: 'sk-b' },
      jevModels: { bocha: 'bocha-jev-v1' },
    };
    expect(migrateRetiredJevKeys(rec)).toBe(false);
    expect(rec.jevApiKeys).toEqual({ typesafe: 'sk-a', bocha: 'sk-b' });
  });

  it('空值旧键不搬（噪音），退役键兜底清除幂等', () => {
    const rec: Record<string, unknown> = { jevApiKey: '', jevEnabled: false, jevEndpoint: 'x', jevTimeoutMs: 10 };
    expect(migrateRetiredJevKeys(rec)).toBe(true);
    expect(rec.jevApiKeys).toBeUndefined();
    expect(rec.jevEnabled).toBeUndefined();
    expect(rec.jevEndpoint).toBeUndefined();
    expect(rec.jevTimeoutMs).toBeUndefined();
    expect(migrateRetiredJevKeys(rec)).toBe(false);
  });

  it('非法入参安全返回 false；DEFAULT_SETTINGS 缺省即分存形态', () => {
    expect(migrateRetiredJevKeys(null)).toBe(false);
    expect(migrateRetiredJevKeys('x')).toBe(false);
    expect(DEFAULT_SETTINGS.jevApiKeys).toEqual({});
    expect(DEFAULT_SETTINGS.jevModels).toEqual({});
    expect((DEFAULT_SETTINGS as any).jevApiKey).toBeUndefined();
  });
});

describe('主设置 schema（JEV 分存 + 测试钮）', () => {
  const schema = mainSettingsSchema();
  const groupNames = schema.groups.map((g) => g.name);
  const jevGroup = schema.groups.find((g) => g.name === 'JEV')!;
  const aiGroup = schema.groups.find((g) => g.name === '🤖 AI')!;

  it('组结构不破坏（设置面板导航契约）', () => {
    expect(groupNames).toEqual(['🤖 AI', 'Embedding', 'JEV', '语音转写', '数据源凭据', '📂 数据存储路径', '🔔 通知']);
  });

  it('注册表两家：typesafe + 博查（博查缺省模型 bocha-jev-v1）', () => {
    expect(JEV_PROVIDER_REGISTRY.map((p) => p.id)).toEqual(['typesafe', 'bocha']);
    const bocha = JEV_PROVIDER_REGISTRY.find((p) => p.id === 'bocha')!;
    expect(bocha.defaultModel).toBe('bocha-jev-v1');
    expect(bocha.endpoint).toContain('jev.bochaai.com');
  });

  it('JEV 密钥/模型行：三函数分存绑定 + refreshKey + stateful 测试钮', () => {
    const rows = jevGroup.rows as Array<Record<string, any>>;
    const secret = rows.find((r) => r.name === 'Jev 密钥')!;
    expect(secret.type).toBe('secret');
    expect(typeof secret.binding.get).toBe('function');
    expect(typeof secret.binding.set).toBe('function');
    expect(typeof secret.refreshKey).toBe('function');
    expect(secret.actions[0].stateful).toBe(true);
    expect(secret.actions[0].text).toBe('测试');
    const model = rows.find((r) => r.name === 'Jev 模型')!;
    expect(typeof model.binding.get).toBe('function');
    expect(typeof model.refreshKey).toBe('function');
    expect(model.actions.map((a: any) => a.text)).toContain('获取模型');
  });

  it('七家 LLM 密钥行各挂 stateful「测试」钮', () => {
    const keyRows = ['deepseekApiKey', 'opencodeGoApiKey', 'zhipuApiKey', 'zhipuPlanApiKey', 'siliconflowApiKey', 'volcanoArkApiKey', 'ollamaApiKey'];
    const rows = aiGroup.rows as Array<Record<string, any>>;
    for (const key of keyRows) {
      const row = rows.find((r) => r.binding?.key === key);
      expect(row, key).toBeTruthy();
      expect(row!.actions?.[0]?.stateful, key).toBe(true);
      expect(row!.actions?.[0]?.text, key).toBe('测试');
    }
  });

  it('语音转写组：LLM 校对单一开关（ADR-0222，缺省关）', () => {
    const asrGroup = schema.groups.find((g) => g.name === '语音转写')!;
    const rows = asrGroup.rows as Array<Record<string, any>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('LLM 校对');
    expect(rows[0].type).toBe('toggle');
    expect(rows[0].binding).toEqual({ key: 'asrLlmProofread' });
    expect(DEFAULT_SETTINGS.asrLlmProofread).toBe(false);
  });
});
