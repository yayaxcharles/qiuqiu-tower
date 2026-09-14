import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/net/action';
import { ActionQueue, Sequencer, diffOf, syncCheckOf } from '../../src/net/lockstep';
import type { SequencedAction } from '../../src/net/lockstep';
import type { CoopAction } from '../../src/net/action';
import { combatFingerprint } from '../../src/net/hash';
import { allReady, endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';
import type { CombatState, PlayerCombat } from '../../src/engine/types';

/*
 * 主機排序（使用者 2026-09-11 拍板）：只有主機發號碼，兩邊一律照號碼套用。
 *
 * 這一支模擬的是**最會出事的那個情境**：兩個人同時出牌、封包到達的順序相反。
 * 沒有主機排序的話，那正是兩邊當場分岔的時刻。
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

/** 一台機器：自己的引擎＋自己的佇列 */
function peer(seed: string): { cs: CombatState; q: ActionQueue } {
  const cs = twoPlayerCombat(seed);
  return { cs, q: new ActionQueue((a) => applyAction(cs, a)) };
}

describe('主機排序：號碼只有一份，兩邊照號碼套用', () => {
  it('編號從 1 開始、只增不減', () => {
    const s = new Sequencer();
    const a: CoopAction = { t: 'ready', seat: 0, on: true };
    expect(s.assign(a).seq).toBe(1);
    expect(s.assign(a).seq).toBe(2);
    expect(s.assign(a).seq).toBe(3);
    expect(s.issued).toBe(3);
  });

  /**
   * 挑一個**順序真的有差**的情境：把怪打到一擊斃命的血量，兩個人同時攻擊同一隻。
   * 先打的那個拿到擊倒、後打的那張根本打不出去（目標已經不在了）。
   *
   * 為什麼要這麼講究：第一版我隨手拿兩張牌打同一隻怪，換順序算出來的指紋**完全一樣**
   * ——那條測試就算把排序機制整個拿掉也會過，等於什麼都沒證明。
   * 反向驗證（刻意照到達順序套一次）才抓到這件事。
   */
  function killRace(cs: CombatState): { m: (seq: Sequencer) => [SequencedAction, SequencedAction] } {
    const foe = cs.enemies.find((e) => !e.dead)!;
    foe.hp = 1; foe.block = 0;   // 誰先打誰就拿到擊倒
    const u0 = (cs.players[0] as PlayerCombat).hand.find((c) => c.cardId === 'sanjo')!.uid;
    const u1 = (cs.players[1] as PlayerCombat).hand.find((c) => c.cardId === 'sanjo')!.uid;
    return {
      m: (seq) => [
        seq.assign({ t: 'card', seat: 0, u: u0, g: foe.uid }),
        seq.assign({ t: 'card', seat: 1, u: u1, g: foe.uid }),
      ],
    };
  }

  it('先確認這個情境真的吃順序（不然下一條測試等於什麼都沒測）', () => {
    const a = twoPlayerCombat('race');
    const b = twoPlayerCombat('race');
    const [m1, m2] = killRace(a).m(new Sequencer());
    killRace(b);   // 讓 b 也是一擊斃命的血量

    const qa = new ActionQueue((act) => applyAction(a, act));
    qa.receive(m1); qa.receive(m2);
    // b 這邊**不照號碼**，照到達順序硬套（模擬「沒有主機排序」）
    applyAction(b, m2.a); applyAction(b, m1.a);

    expect(combatFingerprint(a), '順序不同就該算出不同的結果').not.toBe(combatFingerprint(b));
  });

  it('**兩台機器收到的順序相反，結果還是一模一樣**（這就是主機排序在解的問題）', () => {
    const host = peer('ho');
    const client = peer('ho');
    const seq = new Sequencer();
    killRace(host.cs);
    const [m1, m2] = killRace(client.cs).m(seq);

    // 主機那邊照 1、2 到；客戶端那邊**反過來**先收到 2
    host.q.receive(m1);
    host.q.receive(m2);
    client.q.receive(m2);
    client.q.receive(m1);

    expect(combatFingerprint(client.cs), '收到的順序相反也不影響').toBe(combatFingerprint(host.cs));
    expect(diffOf(syncCheckOf(host.cs), syncCheckOf(client.cs))).toBeNull();
  });

  it('缺號就等，不會先套後面的', () => {
    const p = peer('gap');
    const seq = new Sequencer();
    const foe = p.cs.enemies.find((e) => !e.dead)!;
    const m1 = seq.assign({ t: 'card', seat: 0, u: (p.cs.players[0] as PlayerCombat).hand[0]!.uid, g: foe.uid });
    const m2 = seq.assign({ t: 'ready', seat: 1, on: true });

    const before = combatFingerprint(p.cs);
    const r = p.q.receive(m2);
    expect(r.applied, '2 號先到，但 1 號還沒來：一個都不套').toEqual([]);
    expect(r.waitingFor, '等的是 1 號').toBe(1);
    expect(combatFingerprint(p.cs), '狀態動都沒動').toBe(before);

    const r2 = p.q.receive(m1);
    expect(r2.applied.map((x) => x.seq), '1 號到了就一口氣補上 1、2').toEqual([1, 2]);
    expect(p.q.waiting).toBe(0);
  });

  it('同一個號碼來兩次只算一次（重送、回聲都可能）', () => {
    const p = peer('dup');
    const seq = new Sequencer();
    const card = seq.assign({ t: 'card', seat: 0, u: (p.cs.players[0] as PlayerCombat).hand[0]!.uid, g: p.cs.enemies[0]!.uid });

    p.q.receive(card);
    const fp = combatFingerprint(p.cs);
    const again = p.q.receive(card);

    expect(again.applied, '第二次什麼都不做').toEqual([]);
    expect(combatFingerprint(p.cs), '不會多打一張牌').toBe(fp);
    expect(p.q.applied).toBe(1);
  });

  it('引擎拒絕的動作會**停在那個號碼**，不會默默跳過', () => {
    const p = peer('bad');
    const seq = new Sequencer();
    // 一號去打二號手上的牌：引擎一定擋（uid 不在自己手牌裡）
    const bad = seq.assign({ t: 'card', seat: 0, u: (p.cs.players[1] as PlayerCombat).hand[0]!.uid, g: p.cs.enemies[0]!.uid });
    const good = seq.assign({ t: 'ready', seat: 1, on: true });

    const r = p.q.receive(bad);
    expect(r.failed?.seq, '卡在 1 號').toBe(1);
    expect(r.applied).toEqual([]);
    expect(p.q.applied, '號碼不往前推，才看得出來是卡在哪').toBe(0);

    // 後面的動作也不會偷跑
    const r2 = p.q.receive(good);
    expect(r2.applied).toEqual([]);
  });

  it('跑完一整場：兩台機器一路對帳都對得上', () => {
    const host = peer('full');
    const client = peer('full');
    const seq = new Sequencer();

    /** 主機替一個動作編號，然後廣播給兩邊（客戶端刻意晚一步、順序打亂） */
    const broadcast = (a: CoopAction): void => {
      const m = seq.assign(a);
      host.q.receive(m);
      pendingToClient.push(m);
    };
    const pendingToClient: SequencedAction[] = [];
    const flushToClient = (): void => {
      // 故意反過來送，證明順序真的無所謂
      for (const m of pendingToClient.reverse()) client.q.receive(m);
      pendingToClient.length = 0;
    };

    for (let round = 0; round < 5 && host.cs.phase === 'player'; round++) {
      const foe = host.cs.enemies.find((e) => !e.dead);
      for (const p of host.cs.players) {
        for (const c of p.hand.slice(0, 2)) broadcast({ t: 'card', seat: p.seat, u: c.uid, g: foe?.uid });
        broadcast({ t: 'ready', seat: p.seat, on: true });
      }
      flushToClient();
      expect(client.q.waiting, '全部接得上，沒有卡住的').toBe(0);
      expect(diffOf(syncCheckOf(host.cs), syncCheckOf(client.cs)), `第 ${round} 輪出牌後`).toBeNull();

      if (allReady(host.cs)) { endTurn(host.cs); endTurn(client.cs); }
      expect(diffOf(syncCheckOf(host.cs), syncCheckOf(client.cs)), `第 ${round} 輪收完回合`).toBeNull();
    }
    expect(seq.issued, '要真的傳了不少動作才有意義').toBeGreaterThan(15);
  });
});

describe('對帳：分岔了要當場停，不要繼續跑', () => {
  it('對得上就回 null', () => {
    const a = twoPlayerCombat('sync');
    const b = twoPlayerCombat('sync');
    expect(diffOf(syncCheckOf(a), syncCheckOf(b))).toBeNull();
  });

  it('回合數對不上，講得出是誰在第幾回合', () => {
    const a = twoPlayerCombat('sync');
    const b = twoPlayerCombat('sync');
    b.turn += 1;
    expect(diffOf(syncCheckOf(a), syncCheckOf(b))).toContain('回合對不上');
  });

  it('戰況對不上，把兩邊的指紋都寫出來（要回報才查得下去）', () => {
    const a = twoPlayerCombat('sync');
    const b = twoPlayerCombat('sync');
    b.players[0]!.hp -= 1;
    const msg = diffOf(syncCheckOf(a), syncCheckOf(b));
    expect(msg).toContain('戰況對不上');
    expect(msg).toContain(combatFingerprint(a));
    expect(msg).toContain(combatFingerprint(b));
  });

  it('**亂數走岔也抓得到**：畫面上完全看不出來，下一次抽牌才會爆開', () => {
    const a = twoPlayerCombat('sync');
    const b = twoPlayerCombat('sync');
    b.rng.next();
    expect(diffOf(syncCheckOf(a), syncCheckOf(b))).not.toBeNull();
  });
});
