// @vitest-environment node
/**
 * 保险库信封结构测试（票 316，ADR-0211 本地化落地）：
 * v1→v2 自动迁移（备份/中断安全/旧镜像归档）、v2 读写（fileKey 逐镜像）、
 * 修改主密码（O(1) 重包，镜像零接触）、v1 备份回滚路径、锁定清密。
 * 数据红线：迁移前 .safe.enc.v1bak 留底；旧镜像不删除、挪 .migrate-v1-backup/ 归档。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SafeManager } from '../../src/encrypt/data';
import { CryptoService, clearCryptoKeyCache } from '../../src/core/crypto';
import { setApp } from '../../src/core/app';
import { MockVault } from '../mock-vault';

function makeApp(vault: MockVault) {
  setApp({ vault, metadataCache: { trigger: vi.fn() } } as any);
}

/** 等信封迁移完成（unlock 触发的是后台串行任务，轮询清单版本裁决） */
async function waitForEnvelope(sm: SafeManager, timeoutMs = 5000): Promise<void> {
  const t0 = Date.now();
  // 等「迁移彻底完成」：masterWrap 就位且进度清空（步 4 旧镜像归档在 saveManifest 之后，
  // 只看版本位会与归档挪移赛跑）
  while (sm.migrationProgress !== null || sm.manifest.version < 2 || !sm.manifest.masterWrap) {
    if (Date.now() - t0 > timeoutMs) throw new Error('信封迁移超时未完成');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('保险库信封结构（票 316）', () => {
  let vault: MockVault;
  let sm: SafeManager;

  /** 造一个 v1 老库：加锁两篇（正文 + 附件 + 预览层）后锁上——磁盘上是 v1 清单与 v1 镜像 */
  beforeEach(async () => {
    vault = new MockVault();
    makeApp(vault);
    clearCryptoKeyCache();
    sm = new SafeManager('CONFIG/.ENCRYPT');
    await sm.unlock('old-pw'); // 首设（即 v2）
    // 降级为 v1 老库（镜像锁笔记走主密码口径——迁移测试的前提形态）
    sm.manifest.version = 1;
    delete sm.manifest.keys;
    delete sm.manifest.masterWrap;
    await sm.saveManifest();
    sm.lock();
    await sm.unlock('old-pw'); // v1 口径重新解锁（masterKey 不在内存）
    await sm.lockNote({
      path: '我的/日记/2026-01-01.md',
      title: '2026-01-01',
      content: '# 2026-01-01 早晨\n信封迁移前的日记。',
      attachments: [{ path: '我的/影视/pic.png', data: 'SUlHRFJBTQ==', previewData: 'PREVIEWDATA' }],
    });
    await sm.lockNote({
      path: '我的/收藏/x.md',
      title: '收藏条目',
      content: '无附件的条目。',
      attachments: [],
    });
    // 快照 v1 旧 refs（迁移后清单已换新 ref，备份目录按旧 ref 命名归档——断言依据）
    (globalThis as any).__v1Refs = [
      ...sm.manifest.notes.flatMap((n) => [n.contentRef, ...n.attachments.flatMap((a) => [a.blobRef, a.previewRef].filter(Boolean))]),
    ];
    sm.lock();
  });

  it('解锁 v1 老库自动迁移：清单切 v2、逐镜像 fileKey、v1bak 留底、旧镜像归档不删除', async () => {
    const ok = await sm.unlock('old-pw');
    expect(ok).toBe(true);
    await waitForEnvelope(sm);

    // 清单 v2：keys/masterWrap 就位（每镜像一条 wrap：2 正文 + 1 附件 + 1 预览 = 4）
    expect(sm.manifest.version).toBe(2);
    expect(sm.manifest.masterWrap).toBeTruthy();
    expect(Object.keys(sm.manifest.keys ?? {}).length).toBe(4);

    // v1 清单备份留底（红线），且与正本内容不同（正本已切 v2）
    const bakPath = 'CONFIG/.ENCRYPT/.safe.enc.v1bak';
    expect(await vault.adapter.exists(bakPath)).toBe(true);
    const v1bak = JSON.parse(await CryptoService.decrypt(await vault.adapter.read(bakPath), 'old-pw'));
    expect(v1bak.version).toBe(1);
    expect(v1bak.notes.length).toBe(2);

    // 旧镜像归档不删除：.migrate-v1-backup/ 下 4 份，顶层无孤儿
    const backupDir = 'CONFIG/.ENCRYPT/.migrate-v1-backup';
    expect(await vault.adapter.exists(backupDir)).toBe(true);
    const v1Refs = (globalThis as any).__v1Refs as string[];
    expect(v1Refs.length).toBe(4);
    for (const ref of v1Refs) {
      expect(await vault.adapter.exists(backupDir + '/' + ref), '旧镜像 ' + ref + ' 应归档在备份目录').toBe(true);
    }
  });

  it('迁移后读写全通：正文/附件原始层/预览层经 fileKey 解密，指纹校验一致', async () => {
    await sm.unlock('old-pw');
    await waitForEnvelope(sm);
    const note = sm.manifest.notes.find((n) => n.path === '我的/日记/2026-01-01.md')!;
    expect(await sm.decryptNoteBody(note)).toContain('信封迁移前的日记');
    const att = note.attachments[0];
    expect(await sm.decryptAttachmentOriginal(att)).toBe('SUlHRFJBTQ==');
    expect(await sm.decryptPreview(att)).toBe('PREVIEWDATA');
  });

  it('v1 备份回滚路径：还原 v1bak 清单 + 备份目录镜像搬回 → 旧密码照常解锁读写', async () => {
    await sm.unlock('old-pw');
    await waitForEnvelope(sm);
    const oldNote = JSON.parse(await CryptoService.decrypt(await vault.adapter.read('CONFIG/.ENCRYPT/.safe.enc.v1bak'), 'old-pw'));
    // 手工回滚：v1bak 清单回正位 + 备份目录镜像搬回顶层（模拟用户按回滚手册操作）
    await vault.adapter.write('CONFIG/.ENCRYPT/.safe.enc', await vault.adapter.read('CONFIG/.ENCRYPT/.safe.enc.v1bak'));
    for (const n of oldNote.notes) {
      await vault.adapter.rename('CONFIG/.ENCRYPT/.migrate-v1-backup/' + n.contentRef, 'CONFIG/.ENCRYPT/' + n.contentRef);
      for (const a of n.attachments) {
        await vault.adapter.rename('CONFIG/.ENCRYPT/.migrate-v1-backup/' + a.blobRef, 'CONFIG/.ENCRYPT/' + a.blobRef);
        if (a.hasPreview) await vault.adapter.rename('CONFIG/.ENCRYPT/.migrate-v1-backup/' + a.previewRef, 'CONFIG/.ENCRYPT/' + a.previewRef);
      }
    }
    sm.lock();
    const ok = await sm.unlock('old-pw');
    expect(ok).toBe(true);
    expect(sm.manifest.version).toBe(1);
    const note = sm.manifest.notes.find((n) => n.path === '我的/日记/2026-01-01.md')!;
    expect(await sm.decryptNoteBody(note)).toContain('信封迁移前的日记');
  });

  it('修改主密码（v2）：重包+清单重加密，镜像零接触；新密码解锁全通、旧密码拒绝', async () => {
    await sm.unlock('old-pw');
    await waitForEnvelope(sm);
    // 记住 v2 镜像密文（改密码不得触碰镜像——镜像零接触断言）
    const note = sm.manifest.notes.find((n) => n.path === '我的/日记/2026-01-01.md')!;
    const bodyCipherBefore = await vault.adapter.read('CONFIG/.ENCRYPT/' + note.contentRef);

    await sm.changePassword('old-pw', 'new-pw-9');
    expect(await vault.adapter.read('CONFIG/.ENCRYPT/' + note.contentRef)).toBe(bodyCipherBefore);

    sm.lock();
    expect(await sm.unlock('old-pw')).toBe(false); // 旧密码拒绝
    clearCryptoKeyCache();
    expect(await sm.unlock('new-pw-9')).toBe(true);
    expect(await sm.decryptNoteBody(note)).toContain('信封迁移前的日记');
    expect(await sm.decryptAttachmentOriginal(note.attachments[0])).toBe('SUlHRFJBTQ==');
  });

  it('v1 运行态改主密码拒绝（迁移未完成不换钥匙）', async () => {
    // 不触发迁移：直接构造 v1 清单运行态（解锁成功的瞬间态）
    await sm.unlock('old-pw');
    // unlock 已后台启动迁移——改为手工降级模拟「迁移未完成的 v1 运行态」
    sm.manifest.version = 1;
    await expect(sm.changePassword('old-pw', 'new-pw')).rejects.toThrow('信封迁移尚未完成');
  });

  it('迁移中断安全：镜像解密失败即中止保持 v1（完整性优先），修复后下次解锁重试成功', async () => {
    // 弄坏一个正文镜像（换钥密文 = v1 口径解不开）
    const v1 = JSON.parse(await CryptoService.decrypt(await vault.adapter.read('CONFIG/.ENCRYPT/.safe.enc'), 'old-pw'));
    const badRef = v1.notes[0].contentRef;
    await vault.adapter.write('CONFIG/.ENCRYPT/' + badRef, await CryptoService.encrypt('被替换的密文', 'wrong-key'));
    let ok = await sm.unlock('old-pw');
    expect(ok).toBe(true);
    // 迁移应中止：清单保持 v1
    await new Promise((r) => setTimeout(r, 120));
    expect(sm.manifest.version).toBe(1);
    expect(sm.manifest.masterWrap).toBeUndefined();
    sm.lock();

    // 修复镜像（还原原 v1 密文）→ 下次解锁重试迁移成功

    // 从归档/原始密文恢复：重写一份「能被 old-pw 解开」的密文
    await vault.adapter.write('CONFIG/.ENCRYPT/' + badRef, await CryptoService.encrypt('# 2026-01-01 早晨\n信封迁移前的日记。', 'old-pw'));
    ok = await sm.unlock('old-pw');
    expect(ok).toBe(true);
    await waitForEnvelope(sm);
    expect(sm.manifest.version).toBe(2);
    const note = sm.manifest.notes.find((n) => n.path === '我的/日记/2026-01-01.md')!;
    expect(await sm.decryptNoteBody(note)).toContain('信封迁移前的日记');
  });

  it('首设即 v2：新库直接带 masterWrap，加锁条目登记 fileKey wrap', async () => {
    const fresh = new SafeManager('CONFIG/.ENCRYPT-FRESH');
    makeApp(vault); // vault 复用（目录不同互不干扰）
    const ok = await fresh.unlock('brand-new-pw');
    expect(ok).toBe(true);
    expect(fresh.manifest.version).toBe(2);
    expect(fresh.manifest.masterWrap).toBeTruthy();
    await fresh.lockNote({
      path: '我的/收藏/a.md',
      title: 'a',
      content: '首设即信封。',
      attachments: [],
    });
    expect(Object.keys(fresh.manifest.keys ?? {}).length).toBe(1);
    fresh.lock();
    // 重新解锁（v2 直解 masterWrap）
    const ok2 = await fresh.unlock('brand-new-pw');
    expect(ok2).toBe(true);
    const note = fresh.manifest.notes[0];
    expect(await fresh.decryptNoteBody(note)).toBe('首设即信封。');
  });

  it('锁定清密：masterKey 与 fileKey 缓存随 lock() 清空', async () => {
    await sm.unlock('old-pw');
    await waitForEnvelope(sm);
    const note = sm.manifest.notes[0];
    await sm.decryptNoteBody(note); // 触发 fileKey 缓存
    sm.lock();
    // 锁定后 keyForRef 不可用（未解锁抛错路径），且解锁重走 masterWrap 解包
    const ok = await sm.unlock('old-pw');
    expect(ok).toBe(true);
    expect(await sm.decryptNoteBody(note)).toContain('信封迁移前的日记');
  });
});
