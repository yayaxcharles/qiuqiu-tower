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
/**
 * 找一支**跑得動 `check_haze.py`** 的 python。
 *
 * **`--version` 過了不代表跑得動**（2026-09-13 這條讓線上停更了一整天）：
 * GitHub Actions 的 ubuntu-latest 有 python3，但**沒有 Pillow**。
 * 第一版只問 `--version`，於是 CI 上腳本一 import 就當掉、離開碼非 0，
 * 被這支測試當成「抓到灰膜」判紅 → `npm test` 紅 → 部署整個不跑。
 * 連續六次推上去都是這樣，而我每次只看 `git push` 成功就說「上線了」，
 * 線上其實一直停在凌晨那一版。
 *
 * 所以這裡要連套件一起試。**裝不起來就是跳過，不是判紅**——
 * 「這台機器跑不了這個檢查」跟「圖有問題」是兩件事，混在一起會擋掉部署。
 *
 * **而且不要自己列依賴清單**：第一次修的時候我只補了 `import PIL`，
 * 結果 CI 換成缺 numpy 又紅一次——真正的鏈是
 * `check_haze` → `add_event_art` → `build_art_inbox` → numpy。
 * 猜依賴猜不完，所以這裡直接跑**腳本自己那一行匯入**，
 * 以後那幾支再多拉什麼套件進來，這個探測也會自動跟著對。
 */
const PROBE = "import sys; sys.path.insert(0, 'tools'); import add_event_art";

function python(): string | null {
  for (const cmd of ['python', 'python3', 'py']) {
    try {
      execFileSync(cmd, ['-c', PROBE], { stdio: 'pipe' });
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
    // 掃的是 574 張圖的像素，冷開機要六七秒；預設 5 秒會逾時判紅（同上，也會擋掉部署）
  }, 120_000);

  it.runIf(!py)('這台機器沒有 python 或沒裝 Pillow，這條沒跑', () => {
    // eslint-disable-next-line no-console
    console.log('  ⚠ 跑不了灰膜檢查（缺 python 或 Pillow），跳過了——要自己跑 python tools/check_haze.py');
    expect(true).toBe(true);
  });
});
