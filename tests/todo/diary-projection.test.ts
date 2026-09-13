// @vitest-environment node
/**
 * 待办日记投影纯函数层测试（todo/diary-projection，ADR-0122）：
 * - 投影行解析/构建：`- [x] 3. 标题-HH:mm`；无号捕获行/缺时间/非列表行 → null；
 * - 匹配键：`标题-HH:mm`（created 第 11..16 位）；
 * - maxSeq / appendLine（尾部空行结构不动）；
 * - 小节行变换 tfSetChecked / tfSetTitle / tfRemove（无命中/状态一致 → null 无改动）。
 */
import { describe, expect, it } from 'vitest';
import {
  parseProjectionLine,
  buildProjectionLine,
  projectionKey,
  itemKey,
  collectProjections,
  maxSeq,
  maxWrittenSeq,
  appendLine,
  tfSetChecked,
  tfSetTitle,
  tfRemove,
} from '../../src/todo/diary-projection';

describe('parseProjectionLine', () => {
  it('未完成行解析', () => {
    expect(parseProjectionLine('- [ ] 3. 买牛奶-10:30')).toEqual({
      checked: false, seq: 3, title: '买牛奶', time: '10:30',
    });
  });

  it('完成行解析（大写 X 也认）', () => {
    expect(parseProjectionLine('- [X] 1. 写报告-08:05')!.checked).toBe(true);
    expect(parseProjectionLine('- [x] 1. 写报告-08:05')!.seq).toBe(1);
  });

  it('标题含连字符不误切', () => {
    expect(parseProjectionLine('- [ ] 2. 复盘-A/B-23:59')!.title).toBe('复盘-A/B');
  });

  it('点号后无空格也认（用户手打形态 `1.标题-HH:mm`）', () => {
    expect(parseProjectionLine('- [x] 1.折腾股票做Tskills-08:20')).toEqual({
      checked: true, seq: 1, title: '折腾股票做Tskills', time: '08:20',
    });
  });

  it('无号捕获行（ADR-0122 前冻结格式）不匹配', () => {
    expect(parseProjectionLine('- [ ] 买牛奶-10:30')).toBeNull();
  });

  it('缺时间后缀 / 非列表行 / 空行不匹配', () => {
    expect(parseProjectionLine('- [ ] 1. 买牛奶')).toBeNull();
    expect(parseProjectionLine('- 买牛奶-10:30')).toBeNull();
    expect(parseProjectionLine('')).toBeNull();
    expect(parseProjectionLine('普通文本')).toBeNull();
  });
});

describe('buildProjectionLine / 匹配键', () => {
  it('构建行往返一致', () => {
    const line = buildProjectionLine(1, '买牛奶', '10:30', false);
    expect(line).toBe('- [ ] 1. 买牛奶-10:30');
    expect(projectionKey(parseProjectionLine(line)!)).toBe('买牛奶-10:30');
  });

  it('itemKey 取 created 的 HH:mm', () => {
    expect(itemKey('买牛奶', '2026-09-13 10:00:00')).toBe('买牛奶-10:00');
  });
});

describe('maxSeq / maxWrittenSeq / appendLine', () => {
  it('最大序号（空小节 0）', () => {
    expect(maxSeq(['- [ ] 1. a-10:00', '', '- [x] 4. b-11:00'])).toBe(4);
    expect(maxSeq(['- [ ] 买牛奶-10:30', ''])).toBe(0); // 无号行不计
  });

  it('maxWrittenSeq：手打编号行（无空格/无时间后缀）也占号，续号不撞车', () => {
    // 复刻 2026-09-13 实测日记形态：手打 1-10（点号后无空格、9/10 无时间后缀）
    const lines = [
      '- [x] 1.折腾股票做Tskills-08:20',
      '- [ ] 9.给添加代办事项添加自动添加序号功能',
      '- [ ] 10.给todo和添加代办事项打通',
    ];
    expect(maxWrittenSeq(lines)).toBe(10);
    expect(maxSeq(lines)).toBe(1); // 严格投影行只认出第 1 行
    expect(maxWrittenSeq(['- [ ] 买牛奶-10:30', ''])).toBe(0);
    expect(maxWrittenSeq([])).toBe(0);
  });

  it('appendLine 插在最后一个非空行之后（尾部空行结构不动）', () => {
    const out = appendLine(['- [ ] 1. a-10:00', '', ''], '- [ ] 2. b-11:00');
    expect(out).toEqual(['- [ ] 1. a-10:00', '- [ ] 2. b-11:00', '', '']);
  });
});

describe('小节行变换', () => {
  const section = ['- [ ] 1. a-10:00', '- [x] 2. b-11:00', ''];

  it('tfSetChecked 勾/退钩', () => {
    expect(tfSetChecked('a-10:00', true)(section)).toEqual(['- [x] 1. a-10:00', '- [x] 2. b-11:00', '']);
    expect(tfSetChecked('a-10:00', false)(section)).toBeNull(); // 已是未勾 → 无改动
    expect(tfSetChecked('不存在-00:00', true)(section)).toBeNull();
  });

  it('tfSetTitle 改标题保留序号/勾选态/时间', () => {
    expect(tfSetTitle('b-11:00', 'bb')(section)).toEqual(['- [ ] 1. a-10:00', '- [x] 2. bb-11:00', '']);
    expect(tfSetTitle('不存在-00:00', 'x')(section)).toBeNull();
  });

  it('tfRemove 删行（无号行不受影响）', () => {
    expect(tfRemove('a-10:00')(section)).toEqual(['- [x] 2. b-11:00', '']);
    expect(tfRemove('- [ ] 买牛奶-10:30' as any)(section)).toBeNull();
    expect(tfRemove('不存在-00:00')(section)).toBeNull();
  });

  it('collectProjections 跳过无号行', () => {
    const lines = ['- [ ] 买牛奶-10:30', '- [ ] 1. a-10:00', '', '- [x] 2. b-11:00'];
    expect(collectProjections(lines).map((p) => p.seq)).toEqual([1, 2]);
  });
});
