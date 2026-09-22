/**
 * 影院（cinema）域启动迁移（ADR-0127 票 292）：门面正名「娱乐」的数据侧配套——
 * ① 设置值平移：cinemaFolderPath / movieDirectory 存的仍是旧默认「我的/影视」时平移到新默认
 *   「我的/娱乐」（用户自定义值不动）；
 * ② 目录搬迁：旧目录存在且新目录不存在 → 整目录 renameFile（Obsidian 自动更新双链）；
 *   新目录已存在则不动并提示（避免同名合并歧义）。
 * 只搬家不改内容：文件 frontmatter 零改写（数据格式变更已由 ADR-0127 授权）。
 */
import { TFolder, type App, Notice } from 'obsidian';
import { DEFAULT_FOLDER, OLD_DEFAULT_FOLDER } from './state';

/** 迁移设置键白名单（均为「目录指向」键：值等于旧默认才平移，自定义值尊重不动） */
const MIGRATE_KEYS = ['cinemaFolderPath', 'movieDirectory'] as const;

/** 目录判定：真实环境 getAbstractFileByPath 返回 TFolder 实例；mock（测试）回退 isFolder/children 鸭子判定 */
function isFolder(f: unknown): boolean {
  if (!f) return false;
  if (f instanceof TFolder) return true;
  const anyF = f as { isFolder?: unknown; children?: unknown };
  return anyF.isFolder === true || Array.isArray(anyF.children);
}

/** 执行迁移；有改动返回 true（调用方据此落盘设置） */
export async function migrateCinemaFolder(app: App, settings: Record<string, unknown>): Promise<boolean> {
  let changed = false;
  for (const key of MIGRATE_KEYS) {
    if (settings[key] === OLD_DEFAULT_FOLDER) {
      settings[key] = DEFAULT_FOLDER;
      changed = true;
    }
  }
  const oldDir = app.vault.getAbstractFileByPath(OLD_DEFAULT_FOLDER);
  const newDir = app.vault.getAbstractFileByPath(DEFAULT_FOLDER);
  if (oldDir && isFolder(oldDir)) {
    if (newDir) {
      // 新目录已存在：不自动合并，提示人工处理
      new Notice('检测到旧影视目录「我的/影视」与新娱乐目录并存，未自动迁移，请手动合并');
      return changed;
    }
    await app.fileManager.renameFile(oldDir as never, DEFAULT_FOLDER);
    changed = true;
  }
  return changed;
}
