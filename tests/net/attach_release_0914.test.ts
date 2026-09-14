import { describe, expect, it } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';

/*
 * 總稽核 2026-09-14 B 中-3：魔物回合演到一半這一場就結束（有人倒下，畫面被 `afterCombat` 接手），
 * `runEnemyTurn` 跑不到尾巴的 `release()`，會話停在「暫停套用」。這一場結束（`attach(null)`）就該把暫停放掉，
 * 不能靠下一場 `attach(cs)` 順便復原。
 */
describe('這一場結束就放掉演出暫停', () => {
  it('hold() 之後 attach(null)，held 回到 false', () => {
    const pair = new LoopbackPair();
    const s = new CoopSession(pair.a, { isHost: true, seat: 0 });
    const inner = s as unknown as { held: boolean };
    s.hold();
    expect(inner.held).toBe(true);
    s.attach(null);
    expect(inner.held).toBe(false);
  });
});
