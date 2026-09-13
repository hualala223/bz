// @vitest-environment node
/**
 * 票 277：皮肤例外落地守卫 —— S3-b 全仓遮罩毛玻璃单源 + S1 模型选择器弹窗同皮。
 *
 * 上游 issue 282（ADR-0123 推翻手册 §5.2「毛玻璃明确不采用」）+ issue 265（模型选择器
 * 弹窗挂 --sp-* 同皮）的本地剥离版（纯 CSS，DOM/控件/交互零改动，回滚即还原外观）。
 * jsdom 不解析 css，本用例只读源码文本断言（范式同 tests/bookshelf/flow-dialog-skin.test.ts）。
 *
 * 注意：src/diary/styles.css 三处遮罩随用户在制改动同文件（不单独提交），但守卫照常
 * 断言其盘上内容——若未来误改回硬编码 blur(2px)，此处会红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('票 277 / S3-b：全仓遮罩毛玻璃 token 单源', () => {
  it('core tokens.css 定义 --bz-overlay-blur', () => {
    expect(repo('src/core/ui/tokens.css')).toMatch(/--bz-overlay-blur:\s*[^;]+;/);
  });

  const cases: Array<[string, string[], string]> = [
    ['src/quiz/styles.css', ['#quiz-mask'], 'quiz'],
    ['src/encrypt/styles.css', ['.bz-encrypt-dialog-mask', '.bz-encrypt-health-mask', '.bz-vault-dlg-mask'], 'encrypt×3'],
    ['src/favorites/styles.css', ['.bz-fav-form-mask'], 'favorites（品牌底色保留只加 blur）'],
    ['src/literature/styles.css', ['.bz-lit-mask'], 'literature（--background-modifier-cover 收编 --bz-overlay）'],
    ['src/settings-panel/styles.css', ['.bz-sp-picker-mask'], 'settings-panel（暖黑底色保留只加 blur）'],
    ['src/diary/styles.css', ['#add-diary-mask', '#diary-tag-selector-mask', '#diary-date-filter-mask'], 'diary×3（原 blur(2px) 换 token）'],
  ];

  for (const [file, selectors, label] of cases) {
    it(`${label}：各遮罩规则挂 blur(var(--bz-overlay-blur))`, () => {
      const css = repo(file);
      for (const sel of selectors) {
        const re = new RegExp(`${sel.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
        const block = css.match(re);
        expect(block, `${file} 缺 ${sel} 规则块`).not.toBeNull();
        expect(block![1], `${file} ${sel} 未挂 token 毛玻璃`).toContain('backdrop-filter: blur(var(--bz-overlay-blur))');
      }
    });
  }

  it('六域样式不再有硬编码 blur(2px)', () => {
    for (const [file] of cases) {
      expect(repo(file), `${file} 仍残留 blur(2px)`).not.toContain('blur(2px)');
    }
  });
});

describe('票 277 / S1：模型选择器弹窗与设置面板同皮（纯 CSS）', () => {
  it('亮/暗 token 作用域都挂上 #bz-model-picker-popup，且暗色带 .theme-dark 前缀', () => {
    const css = repo('src/settings-panel/styles.css');
    // 亮皮 token 块：选择器列表含裸 id
    expect(css).toMatch(/\.bz-sp-picker-mask,\r?\n#bz-model-picker-popup \{/);
    // 暗皮 token 块：必须带 .theme-dark 前缀（上游 265 的 bug 根因即丢前缀）
    expect(css).toMatch(/\.theme-dark \.bz-sp-picker-mask,\r?\n\.theme-dark #bz-model-picker-popup \{/);
  });

  it('弹窗内部皮收口：头部描边/内容区/行 hover·选中/空态全消费 --sp-*', () => {
    const css = repo('src/settings-panel/styles.css');
    expect(css).toContain('#bz-model-picker-popup .bz-settings-content');
    expect(css).toContain('#bz-model-picker-popup .bz-model-picker-row:hover');
    expect(css).toContain('#bz-model-picker-popup .bz-model-picker-row.is-current');
    expect(css).toContain('#bz-model-picker-popup .bz-settings-empty');
    // 收口段不得回退到 Obsidian 原生变量
    const seg = css.slice(css.indexOf('#bz-model-picker-popup .bz-settings-title'));
    expect(seg).not.toMatch(/var\(--text-|var\(--background-|var\(--interactive-accent/);
  });
});
