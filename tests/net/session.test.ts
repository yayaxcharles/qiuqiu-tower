import { describe, expect, it } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { combatFingerprint } from '../../src/net/hash';
import { allReady, endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';
import type { CombatState, PlayerCombat } from '../../src/engine/types';

/*
 * 會話層：把傳輸、號碼機、動作佇列黏起來的那一層。
 *
 * WebRTC 本身在測試環境跑不起來，所以傳輸抽成介面、這裡用對接的假傳輸。
 * **會出錯的從來不是傳輸**（那是別人寫好的東西），是「誰發號碼、缺號怎麼補、
 * 對帳對不上怎麼辦」這些黏合邏輯——把它們切出來，就全部測得到了。
 */

function twoPlayerCombat(seed: string): CombatState {
  const cs = startCombat({
    hp: 70, maxHp: 70,
    deck: ['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics: [], potions: [],
    encounterId: 'rats3', rng: new Rng(seedFromString(seed)),
  });
  const p2 = blankPlayer(['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'], 1);
  p2.energy = 3;
  p2.hand = p2.drawPile.splice(0, 5);
  cs.players.push(p2);
  return cs;
}

interface Table {
  link: LoopbackPair;
  host: { cs: CombatState; s: CoopSession; desync: string[] };
  guest: { cs: CombatState; s: CoopSession; desync: string[] };
}

/** 開一桌：兩份獨立的戰鬥、兩個會話、一條對接的線 */
function table(seed = 'sess'): Table {
  const link = new LoopbackPair();
  const hostCs = twoPlayerCombat(seed);
  const guestCs = twoPlayerCombat(seed);
  const hostDesync: string[] = [];
  const guestDesync: string[] = [];
  const host = new CoopSession(link.a, { isHost: true, seat: 0, onDesync: (w) => hostDesync.push(w) });
  const guest = new CoopSession(link.b, { isHost: false, seat: 1, onDesync: (w) => guestDesync.push(w) });
  host.attach(hostCs);
  guest.attach(guestCs);
  return {
    link,
    host: { cs: hostCs, s: host, desync: hostDesync },
    guest: { cs: guestCs, s: guest, desync: guestDesync },
  };
}

const firstCard = (cs: CombatState, seat: number): number =>
  (cs.players[seat] as PlayerCombat).hand[0]!.uid;

describe('會話：主機發號碼，客戶端的動作繞一圈才生效', () => {
  it('主機打一張牌，兩邊都套上了', () => {
    const t = table();
    const foe = t.host.cs.enemies[0]!;
    expect(t.host.s.submit({ t: 'card', seat: 0, u: firstCard(t.host.cs, 0), g: foe.uid })).toBe(true);
    expect(combatFingerprint(t.guest.cs), '客戶端跟上了').toBe(combatFingerprint(t.host.cs));
  });

  it('客戶端打一張牌：**自己不先套**，等主機編號繞回來', () => {
    const t = table();
    const foe = t.guest.cs.enemies[0]!;
    t.link.hold = true;   // 把訊息留在手上，模擬還在路上

    const before = combatFingerprint(t.guest.cs);
    expect(t.guest.s.submit({ t: 'card', seat: 1, u: firstCard(t.guest.cs, 1), g: foe.uid })).toBe(true);
    expect(combatFingerprint(t.guest.cs), '請求還在路上，自己這邊什麼都沒動').toBe(before);

    t.link.flush();   // 請求送到主機
    t.link.flush();   // 主機編號後廣播回來
    expect(combatFingerprint(t.guest.cs), '繞回來才真的生效').not.toBe(before);
    expect(combatFingerprint(t.guest.cs)).toBe(combatFingerprint(t.host.cs));
  });

  it('只能替自己做決定，不能冒名頂替（強制收回合除外）', () => {
    const t = table();
    expect(t.guest.s.submit({ t: 'card', seat: 0, u: firstCard(t.guest.cs, 0), g: t.guest.cs.enemies[0]!.uid }),
      '客戶端不能用主機的座位出牌').toBe(false);
    expect(t.guest.s.submit({ t: 'force', seat: 1, w: 0 }), '但可以替走開的主機收回合').toBe(true);
  });

  it('自己這邊就做不出來的動作連送都不送', () => {
    const t = table();
    // 拿一個不存在的牌號
    expect(t.host.s.submit({ t: 'card', seat: 0, u: 999999, g: t.host.cs.enemies[0]!.uid })).toBe(false);
    expect(combatFingerprint(t.guest.cs), '對方那邊完全沒動靜').toBe(combatFingerprint(t.host.cs));
  });

  it('**封包亂序也照樣一致**：留一批訊息再倒過來送', () => {
    const t = table('order');
    const foe = t.host.cs.enemies[0]!;
    t.link.hold = true;
    const hand = (t.host.cs.players[0] as PlayerCombat).hand;
    t.host.s.submit({ t: 'card', seat: 0, u: hand[0]!.uid, g: foe.uid });
    t.host.s.submit({ t: 'card', seat: 0, u: hand[1]!.uid, g: foe.uid });
    t.host.s.submit({ t: 'ready', seat: 0, on: true });

    t.link.flush({ reverse: true });
    expect(combatFingerprint(t.guest.cs), '倒過來送也追得上').toBe(combatFingerprint(t.host.cs));
    expect(t.guest.desync, '不該被誤判成分岔').toEqual([]);
  });

  it('**同一則訊息送兩次也不會多打一張牌**', () => {
    const t = table('dup');
    const foe = t.host.cs.enemies[0]!;
    t.link.hold = true;
    t.host.s.submit({ t: 'card', seat: 0, u: firstCard(t.host.cs, 0), g: foe.uid });

    t.link.flush({ duplicate: true });
    expect(combatFingerprint(t.guest.cs)).toBe(combatFingerprint(t.host.cs));
    expect(t.guest.desync).toEqual([]);
  });

  it('跑完一整場：一路對帳都對得上', () => {
    const t = table('full');
    for (let round = 0; round < 5 && t.host.cs.phase === 'player'; round++) {
      const foe = t.host.cs.enemies.find((e) => !e.dead);
      for (const c of [...(t.host.cs.players[0] as PlayerCombat).hand].slice(0, 2)) {
        t.host.s.submit({ t: 'card', seat: 0, u: c.uid, g: foe?.uid });
      }
      for (const c of [...(t.guest.cs.players[1] as PlayerCombat).hand].slice(0, 2)) {
        t.guest.s.submit({ t: 'card', seat: 1, u: c.uid, g: foe?.uid });
      }
      t.host.s.submit({ t: 'ready', seat: 0, on: true });
      t.guest.s.submit({ t: 'ready', seat: 1, on: true });

      expect(combatFingerprint(t.guest.cs), `第 ${round} 輪出牌後`).toBe(combatFingerprint(t.host.cs));
      if (allReady(t.host.cs)) {
        endTurn(t.host.cs); endTurn(t.guest.cs);
        t.host.s.endOfTurn(); t.guest.s.endOfTurn();
      }
      expect(t.host.desync.concat(t.guest.desync), `第 ${round} 輪收完回合`).toEqual([]);
    }
    expect(t.host.cs.turn, '真的打了幾回合').toBeGreaterThan(2);
  });
});

describe('分岔：抓到就停，不要繼續玩兩份不一樣的遊戲', () => {
  it('對帳對不上就停掉，而且兩邊都停', () => {
    const t = table('bad');
    t.guest.cs.players[0]!.hp -= 1;   // 硬把一邊弄歪（模擬真的算出不同結果）

    t.host.s.endOfTurn();
    expect(t.guest.desync.length, '客戶端收到對帳單就發現了').toBe(1);
    expect(t.guest.desync[0]).toContain('戰況對不上');
    expect(t.guest.s.stopped).toBe(true);
    expect(t.host.s.stopped, '它關掉連線，主機也跟著停').toBe(true);
  });

  it('停掉之後什麼都不再做', () => {
    const t = table('bad2');
    t.guest.cs.players[0]!.hp -= 1;
    t.host.s.endOfTurn();

    const fp = combatFingerprint(t.host.cs);
    expect(t.host.s.submit({ t: 'ready', seat: 0, on: true }), '停掉就不收動作了').toBe(false);
    expect(combatFingerprint(t.host.cs)).toBe(fp);
  });

  it('對方送來一個這邊做不出來的動作＝已經對不上了，**不可以默默丟掉**', () => {
    const t = table('mismatch');
    // 繞過 submit 的自我檢查，直接把一個非法請求塞進線裡（模擬對方那邊狀態不同）
    t.link.b.send({ m: 'req', a: { t: 'card', seat: 1, u: 987654, g: t.host.cs.enemies[0]!.uid } });
    expect(t.host.desync.length, '主機當場發現').toBe(1);
    expect(t.host.desync[0]).toContain('做不出來');
    expect(t.host.s.stopped).toBe(true);
  });

  it('斷線會通知，而且之後不再收動作', () => {
    const link = new LoopbackPair();
    const cs = twoPlayerCombat('close');
    const closed: string[] = [];
    const s = new CoopSession(link.a, { isHost: true, seat: 0, onClose: (w) => closed.push(w) });
    s.attach(cs);

    link.b.close();
    expect(closed).toEqual(['對方離線']);
    expect(s.stopped).toBe(true);
    expect(s.submit({ t: 'ready', seat: 0, on: true })).toBe(false);
  });
});
