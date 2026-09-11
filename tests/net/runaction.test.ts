import { describe, expect, it } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { applyRunAction, canApplyRun, type RunCtx } from '../../src/net/runaction';
import { advanceAct, applyRunEffects, beginCombat, finishCombat, makeShop, newCoopRun, priceFor } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import type { RunState } from '../../src/engine/types';
import { onlyStanding, settleVotes } from '../../src/engine/vote';
import { Rng, seedFromString } from '../../src/engine/rng';

const rng = (seed: string): Rng => new Rng(seedFromString(seed));

/** 兩台機器各自跑同一顆種子，算出來一模一樣的整局（鎖步的前提） */
function twoRuns(seed = 'shop'): [RunState, RunState] {
  return [newCoopRun(seed, 1), newCoopRun(seed, 1)];
}

/** 整局的指紋：錢、牌組、秘寶、忍具都要對得上 */
function runPrint(run: RunState): string {
  return run.players.map((p) => [
    p.hp, p.fish, p.removeCost,
    p.deck.map((c) => `${c.uid}.${c.cardId}${c.upgraded ? '+' : ''}`).join(','),
    [...p.relics].sort().join(','), p.potions.join(','),
  ].join('|')).join(' / ') + ` #${run.nextUid}`;
}

describe('整局動作也要照號碼排序', () => {
  it('兩台機器餵同一顆種子，開出來的商店一模一樣', () => {
    const [a, b] = twoRuns();
    expect(JSON.stringify(makeShop(a))).toBe(JSON.stringify(makeShop(b)));
  });

  it('兩個人同時點同一格，只有一個人買得到，而且兩邊都同意是誰', () => {
    const [a, b] = twoRuns();
    const shopA = makeShop(a);
    const shopB = makeShop(b);
    // 兩個人都買得起第一張牌
    const price = priceFor(a, shopA.cards[0]!, 0);
    for (const r of [a, b]) for (const p of r.players) p.fish = price + 5;

    const pair = new LoopbackPair();
    const host = new CoopSession(pair.a, { isHost: true, seat: 0 });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1 });
    host.useRun(a); host.attachShop(shopA);
    guest.useRun(b); guest.attachShop(shopB);

    // 兩邊同時按下去（客戶端的是請求，主機的立刻編號）
    pair.hold = true;
    expect(guest.submitRun({ t: 'buy', seat: 1, k: 'card', i: 0 })).toBe(true);
    expect(host.submitRun({ t: 'buy', seat: 0, k: 'card', i: 0 })).toBe(true);
    pair.hold = false;
    pair.flush();

    expect(runPrint(a), '兩台算出來的整局必須一模一樣').toBe(runPrint(b));
    const got = a.players.filter((p) => p.deck.length > 10).length;
    expect(got, '同一格只賣得掉一次').toBe(1);
    expect(shopA.cards[0]!.sold).toBe(true);
  });

  it('封包倒過來到，結果照樣一樣（照號碼套用，不照到達順序）', () => {
    const mk = (): { run: RunState; ctx: RunCtx } => {
      const run = newCoopRun('order', 1);
      const shop = makeShop(run);
      for (const p of run.players) p.fish = 999;
      return { run, ctx: { run, shop } };
    };
    const x = mk(); const y = mk();
    const pair = new LoopbackPair();
    const host = new CoopSession(pair.a, { isHost: true, seat: 0 });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1 });
    host.useRun(x.run); host.attachShop(x.ctx.shop ?? null);
    guest.useRun(y.run); guest.attachShop(y.ctx.shop ?? null);

    pair.hold = true;
    guest.submitRun({ t: 'buy', seat: 1, k: 'card', i: 1 });
    host.submitRun({ t: 'buy', seat: 0, k: 'card', i: 2 });
    pair.hold = false;
    pair.flush({ reverse: true, duplicate: true });   // 亂序又重送

    expect(runPrint(x.run)).toBe(runPrint(y.run));
    expect(x.run.players[0]!.deck.length, '重送不該買到兩張').toBe(11);
    expect(x.run.players[1]!.deck.length).toBe(11);
  });

  it('錢不夠就連送都不送', () => {
    const run = newCoopRun('poor', 1);
    const shop = makeShop(run);
    run.players[1]!.fish = 0;
    const ctx: RunCtx = { run, shop };
    expect(canApplyRun(ctx, { t: 'buy', seat: 1, k: 'card', i: 0 })).toBe(false);
  });

  it('忍具帶滿又沒說要換哪一支：不賣，錢也不扣', () => {
    const run = newCoopRun('full', 1);
    const shop = makeShop(run);
    const p = me(run, 1);
    p.fish = 999;
    p.potions = ['smoke_bomb', 'shuriken', 'onigiri'];
    const ctx: RunCtx = { run, shop };
    const full = p.potions.length >= 3;
    if (full) {
      expect(canApplyRun(ctx, { t: 'buy', seat: 1, k: 'potion', i: 0 })).toBe(false);
      expect(canApplyRun(ctx, { t: 'buy', seat: 1, k: 'potion', i: 0, r: 0 })).toBe(true);
    }
  });

  it('倒下的人不逛街也不打盹，但可以說「我好了」', () => {
    const run = newCoopRun('down', 1);
    const shop = makeShop(run);
    run.players[1]!.down = true;
    const ctx: RunCtx = { run, shop };
    expect(canApplyRun(ctx, { t: 'buy', seat: 1, k: 'card', i: 0 })).toBe(false);
    expect(canApplyRun(ctx, { t: 'rest', seat: 1, c: '打盹' })).toBe(false);
    expect(canApplyRun(ctx, { t: 'done', seat: 1 })).toBe(true);
  });

  it('扶人：只扶得起真的倒下的那位，扶完回三成血', () => {
    const run = newCoopRun('revive', 1);
    const p = run.players[1]!;
    p.down = true; p.hp = 0;
    const ctx: RunCtx = { run };
    expect(canApplyRun(ctx, { t: 'revive', seat: 0, w: 1 })).toBe(true);
    expect(applyRunAction(ctx, { t: 'revive', seat: 0, w: 1 })).toBe(true);
    expect(p.down).toBe(false);
    expect(p.hp).toBe(Math.max(1, Math.floor(p.maxHp * 0.3)));
    expect(canApplyRun(ctx, { t: 'revive', seat: 0, w: 1 }), '扶過了就不能再扶').toBe(false);
  });

  it('沒有商店的地方收到買東西：擋下來（那代表兩邊的畫面對不上）', () => {
    const run = newCoopRun('noshop', 1);
    const ctx: RunCtx = { run };
    expect(canApplyRun(ctx, { t: 'buy', seat: 0, k: 'card', i: 0 })).toBe(false);
    expect(applyRunAction(ctx, { t: 'buy', seat: 0, k: 'card', i: 0 })).toBe(false);
  });

  it('打盹是各睡各的：一個人睡，另一個人的血不動', () => {
    const run = newCoopRun('nap', 1);
    for (const p of run.players) p.hp = 30;
    const ctx: RunCtx = { run };
    expect(applyRunAction(ctx, { t: 'rest', seat: 1, c: '打盹' })).toBe(true);
    expect(run.players[0]!.hp, '沒睡的那位不該回血').toBe(30);
    expect(run.players[1]!.hp).toBeGreaterThan(30);
  });
});

describe('整局的對帳：走格子時就抓得到分岔', () => {
  it('兩邊的整局狀態不一樣，走進下一格當場發現', () => {
    const [a, b] = twoRuns('desync');
    b.players[1]!.fish += 1;   // 只差一條小魚乾
    const pair = new LoopbackPair();
    const bad: string[] = [];
    const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
    host.useRun(a); guest.useRun(b);

    host.syncRun(a, 'n1');
    guest.syncRun(b, 'n1');   // 兩邊都走到同一格才比得起來
    expect(bad.length, '湊成一對就發現了').toBe(1);
    expect(bad[0]).toContain('整局的狀態對不上');
    expect(guest.stopped).toBe(true);
  });

  it('一樣就什麼都不做（不要沒事亂停）', () => {
    const [a, b] = twoRuns('same');
    const pair = new LoopbackPair();
    const bad: string[] = [];
    const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
    host.useRun(a); guest.useRun(b);

    host.syncRun(a, 'n1');
    guest.syncRun(b, 'n1');
    expect(bad).toEqual([]);
    expect(host.stopped).toBe(false);
    expect(guest.stopped).toBe(false);
  });

  it('買了東西之後兩邊還是對得上（買賣有走同一條通道）', () => {
    const [a, b] = twoRuns('buysync');
    const shopA = makeShop(a); const shopB = makeShop(b);
    for (const r of [a, b]) for (const p of r.players) p.fish = 999;
    const pair = new LoopbackPair();
    const bad: string[] = [];
    const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
    host.useRun(a); host.attachShop(shopA);
    guest.useRun(b); guest.attachShop(shopB);

    guest.submitRun({ t: 'buy', seat: 1, k: 'card', i: 0 });
    host.submitRun({ t: 'buy', seat: 0, k: 'card', i: 1 });
    host.syncRun(a, 'n1');
    guest.syncRun(b, 'n1');
    expect(bad).toEqual([]);
  });

  it('對方還沒走到那一格：先存著，不可以誤判成分岔', () => {
    const [a, b] = twoRuns('race');
    const pair = new LoopbackPair();
    const bad: string[] = [];
    const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
    host.useRun(a); guest.useRun(b);

    // 主機先走到 n2，客戶端還停在原地——這時候兩邊的整局狀態本來就不一樣
    a.currentNode = 'n2';
    host.syncRun(a, 'n2');
    expect(bad, '對方還沒走到，不能算分岔').toEqual([]);
    expect(guest.stopped).toBe(false);

    // 客戶端也走到了，這時才比
    b.currentNode = 'n2';
    guest.syncRun(b, 'n2');
    expect(bad, '走到同一格、狀態一樣：沒事').toEqual([]);
  });
});

describe('倒下的人跨場也是倒著的', () => {
  it('上一場倒下，下一場一開始就是倒著、不發牌、魔物也不會挑他', () => {
    const run = newCoopRun('downcarry', 1);
    run.players[1]!.down = true;
    run.players[1]!.hp = 0;
    run.currentNode = null;
    const node = run.map.nodes.find((n) => n.floor === 1 && n.encounterId);
    const cs = beginCombat(run, node!.encounterId as string);
    const p1 = cs.players[1]!;
    expect(p1.down, '進場就是倒著的').toBe(true);
    expect(p1.hp).toBe(0);
    expect(p1.hand.length, '倒下的人不發牌').toBe(0);
    expect(p1.energy, '也不給飯糰').toBe(0);
    // 只剩一個人站著：魔物一定打他（`pickVictim` 不會擲骰）
    expect(cs.players.filter((p) => !p.down).length).toBe(1);
  });

  it('打完之後，倒下的狀態要寫回整局（不會自己站起來）', () => {
    const run = newCoopRun('downback', 1);
    run.players[1]!.down = true;
    run.players[1]!.hp = 0;
    const node = run.map.nodes.find((n) => n.floor === 1 && n.encounterId);
    const cs = beginCombat(run, node!.encounterId as string);
    for (const e of cs.enemies) e.dead = true;
    cs.phase = 'won';
    cs.kills = cs.enemies.length;
    finishCombat(run, cs);
    expect(run.players[1]!.down, '打完還是倒著的').toBe(true);
    expect(run.players[1]!.hp).toBe(0);
    expect(run.players[0]!.down, '站著的那位不受影響').toBe(false);
  });
});

describe('稽核 2026-09-11 修掉的三個高優先', () => {
  it('換忍具是走通道的，而且換到正確的座位', () => {
    const run = newCoopRun('swap', 1);
    const p = me(run, 1);
    p.potions = ['smoke_bomb', 'shuriken'];
    const ctx: RunCtx = { run };
    expect(canApplyRun(ctx, { t: 'swap', seat: 1, i: 0, id: 'onigiri' })).toBe(true);
    expect(applyRunAction(ctx, { t: 'swap', seat: 1, i: 0, id: 'onigiri' })).toBe(true);
    expect(p.potions[0]).toBe('onigiri');
    expect(me(run, 0).potions, '不可以動到另一個人的背包').toEqual([]);
    expect(canApplyRun(ctx, { t: 'swap', seat: 1, i: 5, id: 'onigiri' }), '沒有第 6 支').toBe(false);
  });

  it('事件的「三選一學招」：兩個座位開出來的清單本來就不一樣', () => {
    /*
     * 這是那個高優先問題的**前提**，不是 bug：效果一位跑一次，每跑一次就重抽，
     * 所以兩份清單不同是正常的。畫面那邊因此**必須拿對方那一份去找他挑的那張**，
     * 拿自己這一份找會找不到、他那張就靜靜落空，兩邊的牌組當場差一張。
     */
    const run = newCoopRun('teach', 1);
    const fx = [{ kind: 'chooseCard' as const, pool: '絕學' as const, n: 3 }];
    const a = applyRunEffects(run, fx, undefined, undefined, 0);
    const b = applyRunEffects(run, fx, undefined, undefined, 1);
    expect(a && 'chooseCard' in a).toBe(true);
    expect(b && 'chooseCard' in b).toBe(true);
    const ids = (o: typeof a): string[] => (o && 'chooseCard' in o ? o.chooseCard.map((c) => c.id) : []);
    expect(ids(a).length).toBe(3);
    expect(ids(b).length).toBe(3);
    expect(ids(a).join(','), '兩份是分開抽的').not.toBe(ids(b).join(','));
  });

  it('過關回血是每個人都回，不是只回第一位', () => {
    const run = newCoopRun('adv', 1);
    for (const p of run.players) p.hp = 20;
    advanceAct(run);
    expect(run.players[0]!.hp).toBeGreaterThan(20);
    expect(run.players[1]!.hp, '第二位也要回').toBeGreaterThan(20);
  });
});

describe('稽核第二輪：倒下的人不能影響結算', () => {
  it('倒下的那一票結算前要洗掉，結果才跟票到達的順序無關', () => {
    /*
     * 高-5：`allVoted` 跳過倒下的座位，所以站著的人一投完就立刻結算；
     * 但結算用的是整個票面陣列，倒下那一票**照到達的時機**可能在裡面也可能不在。
     * 兩台於是發出不一樣的東西（牌組、nextUid 差一個），下一格對帳就炸。
     */
    const standing = [true, false];
    const 站著先到 = onlyStanding(['A', null], standing);
    const 倒下的先到 = onlyStanding(['A', 'B'], standing);
    expect(站著先到, '洗過之後兩種到達順序完全一樣').toEqual(倒下的先到);
    expect(倒下的先到[1], '倒下那一票要被洗成 null').toBe(null);
  });

  it('選路線：倒下的人投的那一票不可以害兩邊擲骰', () => {
    const standing = [true, false];
    const votes = onlyStanding(['n1', 'n2'], standing);
    // 洗過之後只剩一票，`settleVotes` 就不會擲骰（擲了兩邊的亂數會差一步）
    const before = { ...rng('dice').state };
    const got = settleVotes(rng('dice'), votes);
    expect(got).toBe('n1');
    const after = rng('dice');
    settleVotes(after, votes);
    expect(after.state, '沒擲骰＝亂數沒動').toEqual(before);
  });

  it('主機倒下進下一場：不發牌、不給飯糰（畫面上不會擺著點不動的牌）', () => {
    const run = newCoopRun('host-down', 1);
    run.players[0]!.down = true;
    run.players[0]!.hp = 0;
    const node = run.map.nodes.find((n) => n.floor === 1 && n.encounterId);
    const cs = beginCombat(run, node!.encounterId as string);
    const p0 = cs.players[0]!;
    expect(p0.down).toBe(true);
    expect(p0.hand.length, '倒下的主機不發牌').toBe(0);
    expect(p0.energy, '也不給飯糰').toBe(0);
    expect(p0.drawPile.length, '牌要還回抽牌堆，不是憑空消失').toBe(run.players[0]!.deck.length);
  });

  it('過關回血跳過倒下的人（不然血條會顯示假的滿血）', () => {
    const run = newCoopRun('adv-down', 1);
    run.players[0]!.hp = 20;
    run.players[1]!.hp = 20;
    run.players[1]!.down = true;
    advanceAct(run);
    expect(run.players[0]!.hp).toBeGreaterThan(20);
    expect(run.players[1]!.hp, '倒下的人不回血').toBe(20);
  });
});

describe('稽核第三輪：賭局的結果要算在賭的那個人身上', () => {
  it('第二位賭贏的小魚乾不可以進第一位的包包', () => {
    /*
     * `gamble` 是遞迴呼叫 `applyRunEffects`，原本掉了第五個參數 `seat`，
     * 於是座位 1 擲出來的結果一律套到座位 0 身上——兩台錯得一模一樣所以不會分岔，
     * 但那是實打實的資料錯亂，而且畫面還會對受害者說「中了！」。
     */
    const run = newCoopRun('gamble', 1);
    const before = run.players.map((p) => p.fish);
    // 賭一定會中的（成功率 100%）：贏 50 條
    const fx = [{ kind: 'gamble' as const, p: 100,
      win: [{ kind: 'fish' as const, n: 50 }], lose: [] }];
    applyRunEffects(run, fx, undefined, undefined, 1);
    expect(run.players[0]!.fish, '第一位的錢不該動').toBe(before[0]);
    expect(run.players[1]!.fish, '賭的人才拿得到').toBe((before[1] as number) + 50);
  });

  it('第二位賭輸塞的壞毛病不可以進第一位的牌組', () => {
    const run = newCoopRun('gamble2', 1);
    const n0 = run.players[0]!.deck.length;
    const n1 = run.players[1]!.deck.length;
    const fx = [{ kind: 'gamble' as const, p: 0,
      win: [], lose: [{ kind: 'addCard' as const, cardId: 'shishou' }] }];
    applyRunEffects(run, fx, undefined, undefined, 1);
    expect(run.players[0]!.deck.length, '第一位的牌組不該多一張').toBe(n0);
    expect(run.players[1]!.deck.length).toBe(n1 + 1);
  });
});
