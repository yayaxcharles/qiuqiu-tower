import { describe, expect, it } from 'vitest';
import { fireRelic } from '../../src/engine/actions';
import { beginCombat, newCoopRun } from '../../src/engine/run';

/*
 * **戰報只靠最後一行就能摺對**（2026-09-21 稽核第 4 點的後盾）。
 *
 * 連線每收到一個動作，`screens/combat.ts` 的 `beforeApply` 都會深複製一份戰鬥狀態，
 * 供「一次補多張」時重播出演出。原本連 `cs.log` 一起複製，而那份日誌整場從不修剪，
 * 所以打越久、每出一張牌就越頓。現在改成複本只帶日誌的最後一行。
 *
 * 能這樣砍，靠的是 `fireRelic` 的摺行規則**只讀最後一行**（`engine/actions.ts`）。
 * 哪天有人把規則改成往回看好幾行，這支測試要先紅，否則連線重播的戰報會跟本機不一樣，
 * 而且只有連線、只有補牌那條路徑才看得出來——正是最難發現的那種。
 */
function freshCombat(seed: string) {
  const run = newCoopRun(seed, 1, 'ninja', 'ninja');
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  return beginCombat(run);
}

describe('秘寶摺行只依賴最後一行', () => {
  it('把日誌砍到只剩最後一行，接下來摺出來的字一模一樣', () => {
    // 同一個種子開兩份，才比得出差別只來自「砍掉日誌」這件事。
    const full = freshCombat('fold-same');
    const cut = freshCombat('fold-same');
    expect(full.log).toEqual(cut.log);

    // 先讓兩邊都長出一行「秘寶發動：…」，後續才有東西可以摺。
    for (const cs of [full, cut]) fireRelic(cs, 'sand_bag', cs.players[0]);
    const seeded = full.log.at(-1);
    expect(seeded, '沒長出秘寶那一行，測試前提就不成立').toBeTruthy();

    // 複本的作法：日誌只留最後一行。
    cut.log = cut.log.slice(-1);
    expect(cut.log).toHaveLength(1);

    for (const cs of [full, cut]) {
      fireRelic(cs, 'straw_hat', cs.players[0]);
      fireRelic(cs, 'iron_collar', cs.players[0]);
    }

    expect(cut.log.at(-1), '砍掉前面之後摺出來的字不一樣了').toBe(full.log.at(-1));
    expect(full.log.at(-1)).not.toBe(seeded);   // 確定真的有摺進去，不是兩邊都沒動
  });

  it('同一件不會在摺行裡重複，砍過的日誌也一樣', () => {
    const cs = freshCombat('fold-dup');
    fireRelic(cs, 'sand_bag', cs.players[0]);
    cs.log = cs.log.slice(-1);
    const before = cs.log.at(-1)!;
    fireRelic(cs, 'sand_bag', cs.players[0]);
    expect(cs.log.at(-1), '同一件被寫進去兩次').toBe(before);
  });
});
