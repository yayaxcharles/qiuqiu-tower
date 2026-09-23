import { describe, expect, it } from 'vitest';
import { eventById } from '../../src/content/events';
import { choiceEffectsFor, choiceOrder, visibleChoices } from '../../src/engine/eventcond';
import { applyRunEffects, newCoopRun, runRng } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { settleVotes } from '../../src/engine/vote';
import type { RunState } from '../../src/engine/types';
import { runFingerprint } from '../../src/net/hash';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';

/*
 * 連線限定事件的「一人得一人付」（2026-09-23 內容擴充第二批，劇本 design2 新7）在兩台上不分岔。
 *
 * 用 `LoopbackPair.hold` 做出「一台先一台後」：票照真的順序送，兩台各掛一個跟事件畫面一樣的處理——
 * 票湊齊那一拍擲骰（兩人選得不一樣時）、每一位跑自己那一串（`choiceEffectsFor`）。
 * 投的票是**絕對的索引**：座位 1 的畫面把「我拿」排第一（那是原本的 ①），但他按下去投的是 "1"。
 */
function setup(seed: string) {
  const a = newCoopRun(seed, 1, 'ninja', 'feifei');
  const b = newCoopRun(seed, 1, 'ninja', 'feifei');
  const link = new LoopbackPair();
  const desync: string[] = [];
  const host = new CoopSession(link.a, { isHost: true, seat: 0, onDesync: (w) => desync.push(`主機：${w}`) });
  const guest = new CoopSession(link.b, { isHost: false, seat: 1, onDesync: (w) => desync.push(`加入方：${w}`) });
  host.useRun(a); guest.useRun(b);
  const chosen: (number | null)[] = [null, null];
  const onSettled = (s: CoopSession, run: RunState, k: number) => (kind: string): void => {
    if (kind !== 'event') return;
    const votes = s.picks('event', 2);
    if (votes.some((v) => v === null)) return;
    const pick = settleVotes(runRng(run), votes);
    s.clearPicks('event');
    const c = eventById['coop_rope_bridge']!.choices[Number(pick)]!;
    for (const i of [0, 1]) applyRunEffects(run, choiceEffectsFor(c, i), undefined, undefined, i);
    chosen[k] = Number(pick);
  };
  host.onPick(onSettled(host, a, 0));
  guest.onPick(onSettled(guest, b, 1));
  return { a, b, link, host, guest, desync, chosen };
}

describe('連線限定事件：兩台一台先一台後，結果一樣', () => {
  it('座位 1 的畫面把「我拿」排第一，但投出去的是原本的索引', () => {
    const { b } = setup('byseat-order');
    const order = choiceOrder(b, eventById['coop_rope_bridge']!, 1);
    expect(order[0], '第一顆按鈕是原本的 ②（座位 1 拿）').toBe(1);
    expect(eventById['coop_rope_bridge']!.choices[1]!.bySeat![1].some((o) => o.kind === 'relic')).toBe(true);
  });

  it.each([['主機先投', true], ['加入方先投', false]] as const)('兩人都投「座位 1 過橋」（%s）：座位 1 拿秘寶、座位 0 扣血，兩台一樣', (_l, hostFirst) => {
    const { a, b, link, host, guest, desync, chosen } = setup('byseat-same');
    const rel1 = me(a, 1).relics.length, hp0 = me(a, 0).hp;
    link.hold = true;
    if (hostFirst) { host.pick('event', '1'); link.flush(); guest.pick('event', '1'); link.flush(); }
    else { guest.pick('event', '1'); link.flush(); host.pick('event', '1'); link.flush(); }
    link.flush();
    expect(chosen).toEqual([1, 1]);
    for (const run of [a, b]) {
      expect(me(run, 1).relics.length).toBe(rel1 + 1);
      expect(me(run, 0).hp).toBeLessThan(hp0);
    }
    expect(desync).toEqual([]);
    expect(runFingerprint(a)).toBe(runFingerprint(b));
  });

  it('兩人都搶著拿（投的索引不一樣）：擲骰，兩台擲出同一個', () => {
    for (let s = 0; s < 6; s++) {
      const { a, b, link, host, guest, desync, chosen } = setup(`byseat-dice-${s}`);
      link.hold = true;
      host.pick('event', '0'); link.flush();    // 主機：我過橋
      guest.pick('event', '1'); link.flush();   // 加入方：我過橋（原本的 ②）
      link.flush();
      expect(chosen[0], '兩台擲到不同的選項').toBe(chosen[1]);
      expect(desync).toEqual([]);
      expect(runFingerprint(a)).toBe(runFingerprint(b));
    }
  });

  it('有人倒下：兩台都只剩 ③（一起拆橋板），不會有一台多一顆按鈕', () => {
    const { a, b } = setup('byseat-down');
    for (const run of [a, b]) { run.players[1]!.down = true; run.players[1]!.hp = 0; }
    expect(visibleChoices(a, eventById['coop_rope_bridge']!, 0)).toEqual([2]);
    expect(visibleChoices(b, eventById['coop_rope_bridge']!, 1)).toEqual([2]);
  });
});
