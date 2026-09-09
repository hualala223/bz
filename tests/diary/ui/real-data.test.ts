/**
 * 真实数据集成测试：用 vault 中真实的日记/影视/信文件跑完整 init → 渲染链路。
 * （临时诊断测试，可删除）
 */
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { setApp } from '../../../src/diary/app';
import { resetTagsConfig, applyDirectories } from '../../../src/diary/config';
import { init } from '../../../src/diary/ui/panel';
import { state } from '../../../src/diary/state';
import { MockVault, mockAppWithVault } from '../../mock-vault';
import { resetObsidianMocks } from '../../mock-obsidian-entry';

const VAULT = 'N:/仓库/仓库-新/-0.笔记汇总库';

function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).slice(0, 5);
  } catch {
    return [];
  }
}

// 真实库里可能混有其他模板的日记文件（`# emoji HH:mm` 才是 bz 日记条目格式）——
// 按内容筛选 bz 格式文件再采样，避免字母序前排全是异格式导致解析 0 条；
// 日记目录现为年份子文件夹布局（我的/日记/2026/…），递归行走目录树（ADR-0106 轮修：原平铺扫描在子文件夹布局下必然 0 样本）
function listBzDiaryFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (out.length >= 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= 5) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.md')) {
        try {
          if (/^#\s*\S+\s+\d{2}:\d{2}/m.test(fs.readFileSync(p, 'utf-8'))) out.push(p);
        } catch { /* 不可读文件跳过 */ }
      }
    }
  };
  walk(path.join(VAULT, '我的/日记'));
  return out;
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetTagsConfig();
  applyDirectories({});
  resetObsidianMocks();
  state.data.selectedTags.clear();
  state.data.currentDateFilter = null;
  state.data.currentSearchKeyword = '';
  state.data.originalDiaryEntries = [];
  state.data.currentFilteredEntries = [];
  state.ui.isPopupShown = false;
  state.ui.editingEntryId = null;
});

it('真实日记文件 → 解析 → 渲染卡片', async () => {
  const diaryFiles = listBzDiaryFiles();
  console.log('真实 bz 格式日记文件数（抽样 5）:', diaryFiles);
  // 环境相关诊断测试：本机 vault 无真实日记数据（或路径不存在）时跳过，不构成失败
  if (diaryFiles.length === 0) {
    console.warn('真实 vault 无 bz 格式日记文件，跳过本诊断用例');
    return;
  }
  // 影视/信同样可能不存在——fileNotFound 时静默跳过采样
  const readVaultFile = (rel: string): string | null => {
    try {
      return fs.readFileSync(path.join(VAULT, rel), 'utf-8');
    } catch {
      return null;
    }
  };

  const vault = new MockVault();
  vault.dirs.add('我的/日记');
  vault.dirs.add('我的/影视');
  vault.dirs.add('我的/信');
  for (const abs of diaryFiles) {
    const content = fs.readFileSync(abs, 'utf-8');
    vault.files.set(`我的/日记/${path.basename(abs)}`, content);
  }
  // 抽样影视/信
  for (const f of listFiles(path.join(VAULT, '我的/影视'))) {
    const c = readVaultFile(`我的/影视/${f}`);
    if (c !== null) vault.files.set(`我的/影视/${f}`, c);
  }
  for (const f of listFiles(path.join(VAULT, '我的/信'))) {
    const c = readVaultFile(`我的/信/${f}`);
    if (c !== null) vault.files.set(`我的/信/${f}`, c);
  }
  setApp(mockAppWithVault(vault));

  await init({ registerEvent: () => {} });

  console.log('解析条目数:', state.data.originalDiaryEntries.length);
  console.log('渲染卡片数:', document.querySelectorAll('.diary-entry-card').length);
  console.log('DOM 中第一张卡片:', document.querySelector('.diary-entry-card')?.textContent?.slice(0, 60));

  expect(state.data.originalDiaryEntries.length).toBeGreaterThan(0);
  expect(document.querySelectorAll('.diary-entry-card').length).toBeGreaterThan(0);
}, 30000);
