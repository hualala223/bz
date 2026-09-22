/**
 * 影院（cinema）域启动迁移测试（ADR-0127 票 292）：
 * 设置旧默认值平移（cinemaFolderPath/movieDirectory）/ 目录搬迁两分支 / 新旧目录并存不迁移。
 * 目录 renameFile 行为用测试内自装 stub（MockVault.renameFile 只会移动单文件，不搬目录树）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockVault, mockAppWithVault } from '../mock-vault';
import { MockNotice } from '../mock-obsidian-entry';
import { migrateCinemaFolder } from '../../src/cinema/migrate';
import { DEFAULT_FOLDER, OLD_DEFAULT_FOLDER } from '../../src/cinema/state';

/** 带目录 renameFile 的 app stub：把 oldDir 前缀下全部文件搬到 newPath 前缀（对齐真实 TFolder rename 语义） */
function folderRenameApp(vault: MockVault) {
  const base = mockAppWithVault(vault);
  (base.fileManager as any).renameFile = async (file: any, newPath: string) => {
    const oldDir = file.path.endsWith('/') ? file.path : file.path + '/';
    const newDir = newPath.endsWith('/') ? newPath : newPath + '/';
    const moved: [string, string][] = [];
    for (const p of [...vault.files.keys()]) {
      if (p.startsWith(oldDir)) moved.push([p, newDir + p.slice(oldDir.length)]);
    }
    for (const [from, to] of moved) {
      vault.files.set(to, vault.files.get(from)!);
      vault.files.delete(from);
    }
  };
  return base;
}

describe('migrateCinemaFolder（票 292 / ADR-0127）', () => {
  beforeEach(() => {
    MockNotice.instances.length = 0;
  });

  it('设置旧默认值平移：cinemaFolderPath / movieDirectory 均搬到新默认；返回 true', async () => {
    const vault = new MockVault();
    const app = folderRenameApp(vault);
    const settings: Record<string, unknown> = { cinemaFolderPath: OLD_DEFAULT_FOLDER, movieDirectory: OLD_DEFAULT_FOLDER };
    expect(await migrateCinemaFolder(app, settings)).toBe(true);
    expect(settings.cinemaFolderPath).toBe(DEFAULT_FOLDER);
    expect(settings.movieDirectory).toBe(DEFAULT_FOLDER);
  });

  it('用户自定义值不动：非旧默认的设置值原样保留', async () => {
    const vault = new MockVault();
    const app = folderRenameApp(vault);
    const settings: Record<string, unknown> = { cinemaFolderPath: '我的/片库', movieDirectory: '我的/剧集' };
    expect(await migrateCinemaFolder(app, settings)).toBe(false);
    expect(settings.cinemaFolderPath).toBe('我的/片库');
    expect(settings.movieDirectory).toBe('我的/剧集');
  });

  it('旧目录存在且新目录不存在 → 整目录搬迁，文件随迁', async () => {
    const vault = new MockVault();
    vault.files.set('我的/影视/《星际穿越》.md', '---\ntags: [电影]\n评分: 9.6\n---');
    vault.files.set('我的/影视/子目录/《剧》.md', '---\ntags: [国产剧]\n---');
    const app = folderRenameApp(vault);
    const settings: Record<string, unknown> = {};
    expect(await migrateCinemaFolder(app, settings)).toBe(true);
    expect(vault.files.has('我的/娱乐/《星际穿越》.md')).toBe(true);
    expect(vault.files.has('我的/娱乐/子目录/《剧》.md')).toBe(true);
    expect(vault.files.has('我的/影视/《星际穿越》.md')).toBe(false);
  });

  it('新旧目录并存 → 不迁移、弹提示、返回 false（无设置平移时）', async () => {
    const vault = new MockVault();
    vault.files.set('我的/影视/《旧片》.md', '---\ntags: [电影]\n---');
    vault.files.set('我的/娱乐/《新片》.md', '---\ntags: [电影]\n---');
    const app = folderRenameApp(vault);
    const settings: Record<string, unknown> = {};
    expect(await migrateCinemaFolder(app, settings)).toBe(false);
    expect(vault.files.has('我的/影视/《旧片》.md')).toBe(true);
    expect(MockNotice.instances.some((n) => n.message.includes('未自动迁移'))).toBe(true);
  });

  it('两目录都不存在 → 静默无操作（首次使用场景）', async () => {
    const vault = new MockVault();
    const app = folderRenameApp(vault);
    const settings: Record<string, unknown> = {};
    expect(await migrateCinemaFolder(app, settings)).toBe(false);
  });
});
