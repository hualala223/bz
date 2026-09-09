/**
 * 快速复制密码（命令 bz-encrypt-copy-password；上游线 P3 移植）：
 * 轻量 fuzzy 选择器选中即复制（60s 自动清空剪贴板），未解锁先弹主密码；
 * 全程不打开密码本主面板。数据源 = 本地 password 域 DataManager（.safe.enc 密码镜像，P3 裁决）。
 */
import { notice } from '../core/notice';
import { ensureSafeUnlocked } from '../encrypt';
import { openPasswordQuickPicker } from '../encrypt/pw-picker';
import { DataManager } from './data';
import { copySensitiveText } from './ui';

/** 打开快速取密选择器（main.ts 命令回调）：解锁 → 整表加载 → 选择即复制 */
export async function quickCopyPassword(): Promise<void> {
  if (!(await ensureSafeUnlocked())) return;
  const dm = new DataManager();
  try {
    await dm.load();
  } catch {
    /* 载荷损坏等：按空态处理，由下方「还没有密码」兜底提示 */
  }
  const entries = dm.pwData;
  if (!entries.length) {
    notice('密码本还没有密码，打开面板后可新增');
    return;
  }
  openPasswordQuickPicker(entries, (d) => {
    copySensitiveText(d.password).then(
      () => notice(`已复制「${d.platform}」${d.account ? `（${d.account}）` : ''}的密码，60 秒后自动清空`, 'success'),
      () => notice('复制失败，请手动复制', 'error')
    );
  });
}
