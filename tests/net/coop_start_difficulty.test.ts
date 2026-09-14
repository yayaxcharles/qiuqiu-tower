import { describe, expect, it } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { runFingerprint } from '../../src/net/hash';
import { newCoopRun } from '../../src/engine/run';

/*
 * 連線局的難度：**主機宣布、客戶端照宣布的開**（使用者 2026-09-14 要的「難度也加上去」）。
 * 大廳那一半掃原始碼（`tools/coop_screen_flow.test.ts`），這裡走真的會話層，
 * 盯住「客戶端用的是訊息裡的難度，不是它自己的設定」與「難度不同時整局指紋對得出來」。
 */
describe('連線開局帶難度', () => {
  it('主機用難度 4 開局：客戶端收到的就是 4，兩台開出來的整局逐字相同', () => {
    const link = new LoopbackPair();
    const host = new CoopSession(link.a, { isHost: true, seat: 0 });
    const guest = new CoopSession(link.b, { isHost: false, seat: 1 });
    let got: { seed: string; diff: number; heroes?: string[] } | null = null;
    guest.onStartRun((seed, diff, _enc, heroes) => { got = { seed, diff, ...(heroes ? { heroes } : {}) }; });

    host.start('coop-start-d4', 4, '', ['ninja', 'feifei']);
    expect(got, '客戶端沒收到開局').not.toBeNull();
    const g = got as unknown as { seed: string; diff: number; heroes: string[] };
    expect(g.diff).toBe(4);
    const hostRun = newCoopRun('coop-start-d4', 4, 'ninja', 'feifei');
    const guestRun = newCoopRun(g.seed, g.diff, 'ninja', g.heroes[1] === 'feifei' ? 'feifei' : 'ninja');
    expect(runFingerprint(guestRun)).toBe(runFingerprint(hostRun));
  });

  it('客戶端比主機晚註冊（開局訊息先到）：照樣拿到宣布的難度', () => {
    const link = new LoopbackPair();
    const host = new CoopSession(link.a, { isHost: true, seat: 0 });
    const guest = new CoopSession(link.b, { isHost: false, seat: 1 });
    host.start('coop-late', 5, '', ['feifei', 'ninja']);
    let diff = 0;
    guest.onStartRun((_s, d) => { diff = d; });
    expect(diff).toBe(5);
  });

  it('兩台難度不同時，整局指紋在開局就不一樣（走第一格對帳就抓得到）', () => {
    expect(runFingerprint(newCoopRun('coop-fp', 2, 'ninja', 'feifei')))
      .not.toBe(runFingerprint(newCoopRun('coop-fp', 3, 'ninja', 'feifei')));
  });
});
