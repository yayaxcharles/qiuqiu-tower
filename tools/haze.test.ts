import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

/**
 * 把 `tools/check_haze.py` 拉進測試（2026-09-13 稽核 低-3）。
 *
 * **為什麼**：那支原本沒有任何東西會叫起它——沒有測試、沒有 `npm test`、
 * 排程也沒跑。純手動腳本跟「印出來的自檢」是同一個等級：你得先想到要跑它。
 * 而它擋的正是「圖進倉了、畫面正常、測試全綠，只有背景多一塊灰斑」那種靜音失效。
 *
 * 它掃的是**圖的像素**，所以找不到 python 就跳過（別台機器、CI 上可能沒有）——
 * 跳過不算通過，訊息會說清楚。
 */
function python(): string | null {
  for (const cmd of ['python', 'python3', 'py']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'pipe' });
      return cmd;
    } catch { /* 試下一個 */ }
  }
  return null;
}

describe('事件插圖沒有半透明的灰膜', () => {
  const py = python();

  it.skipIf(!py)('check_haze.py 掃過沒有新的灰膜', () => {
    let out = '';
    let failed = false;
    try {
      out = execFileSync(py!, ['tools/check_haze.py'], { encoding: 'utf-8', stdio: 'pipe' });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      failed = true;
    }
    expect(failed, `check_haze.py 抓到新的灰膜：\n${out}`).toBe(false);
  });

  it.runIf(!py)('這台機器沒有 python，這條沒跑', () => {
    // eslint-disable-next-line no-console
    console.log('  ⚠ 找不到 python，灰膜檢查跳過了——要自己跑 python tools/check_haze.py');
    expect(true).toBe(true);
  });
});
