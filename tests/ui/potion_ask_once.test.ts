import { describe, expect, it } from 'vitest';
import REWARD from '../../src/ui/screens/reward.ts?raw';
import EVENT from '../../src/ui/screens/event.ts?raw';
import RUN from '../../src/engine/run.ts?raw';

/**
 * 忍具帶滿、按「不換」之後**不能再問第二次**（使用者 2026-09-15 雙人實測：
 *「按我不要之後又會跳出來，A 玩家選東西、B 玩家就會又跳一隻選忍具」）。
 *
 * 病根：獎勵／事件畫面是純函式，同伴一投票整頁重跑；「問過了」只有記在資料上才活得過重畫——
 * 獎勵頁記在 `r.potionDeclined`，事件頁記在 `RunGain.asked`。
 * 這裡讀原始碼盯規矩（真的架 `<video>`／疊層環境成本太高，同 hero_video.test 的理由）。
 */
describe('忍具「不換」只問一次', () => {
  it('獎勵頁：按不換要寫 potionDeclined，重畫時看到它就不再排問話', () => {
    expect(REWARD).toMatch(/if \(idx < 0\) \{ giveUp\(\); return; \}/);
    expect(REWARD).toMatch(/r\.potionDeclined = true/);
    expect(REWARD).toMatch(/if \(r\.potionDeclined\) giveUp\(\);\s*\n\s*else window\.setTimeout/);
  });

  it('事件頁：問過的（asked）不再進待問清單，回答時要寫回 gain', () => {
    expect(EVENT).toMatch(/g\.kind === '忍具' && g\.missed && !g\.asked/);
    expect(EVENT).toMatch(/g\.asked = idx >= 0 \? 'swapped' : 'declined'/);
    // 畫列的時候照 asked 畫，重畫不會變回「收不下」再被問
    expect(EVENT).toMatch(/g\.missed && !g\.asked \? ' missed' : ''/);
  });

  it('RunGain 型別有 asked 欄位（swapped／declined）', () => {
    expect(RUN).toMatch(/asked\?: 'swapped' \| 'declined'/);
  });
});
