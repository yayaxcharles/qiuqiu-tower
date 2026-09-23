import { describe, expect, it } from 'vitest';
import { beginCombat, finishCombat, makeShops, newCoopRun, notMyCard, rollActCardsPerSeat, rollActRelics, takeRelic } from '../../src/engine/run';
import { beginEnemyTurn, playCard, startPlayerTurn, stepEnemyTurn } from '../../src/engine/combat';
import { damageEnemy } from '../../src/engine/actions';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { enemies } from '../../src/content/enemies';
import { cardById } from '../../src/content/cards';
import { applyRunAction, canApplyRun } from '../../src/net/runaction';
import type { CombatState, PlayerCombat, RunState } from '../../src/engine/types';

/*
 * 2026-09-14 夜間連線稽核（混搭角色專查）抓到的**寫死座位 0** 那一批。
 *
 * 共同點：單機只有座位 0，怎麼寫都對，所以一千多條單機測試全綠；
 * 只有「座位 1 做了某件事」時，效果落到座位 0 身上。每一條都照「把修正改回去要紅」寫。
 */

function fight(run: RunState): CombatState {
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  return beginCombat(run);
}
const seat = (cs: CombatState, i: number): PlayerCombat => cs.players[i]!;

describe('戰鬥裡寫死 cs.player 的六處', () => {
  it('高-1：座位 1 的攻擊吃自己的爪力，不吃座位 0 的', () => {
    const cs = fight(newCoopRun('seat-str', 1, 'ninja', 'feifei'));
    const e = cs.enemies[0]!;
    e.block = 0; e.hp = 999;
    addStatus(seat(cs, 1), '爪力', 10);
    expect(damageEnemy(cs, e, 3, { by: seat(cs, 1) }).dealt, '座位 1 自己的 10 爪力沒算進去').toBe(13);

    const cs2 = fight(newCoopRun('seat-str2', 1, 'ninja', 'feifei'));
    const e2 = cs2.enemies[0]!;
    e2.block = 0; e2.hp = 999;
    addStatus(seat(cs2, 0), '爪力', 10);
    expect(damageEnemy(cs2, e2, 3, { by: seat(cs2, 1) }).dealt, '座位 1 打出去吃到了座位 0 的爪力').toBe(3);
  });

  it('高-2：座位 1 打到反彈的魔物，被刺的是座位 1', () => {
    const cs = fight(newCoopRun('seat-thorns', 1, 'ninja', 'feifei'));
    const e = cs.enemies[0]!;
    e.block = 0; e.hp = 999;
    addStatus(e, '反彈', 3);
    const [a, b] = [seat(cs, 0), seat(cs, 1)];
    a.block = 0; b.block = 0;
    const hpA = a.hp; const hpB = b.hp;
    damageEnemy(cs, e, 3, { by: b });
    expect(b.hp, '座位 1 打的，刺卻沒刺到他').toBe(hpB - 3);
    expect(a.hp, '座位 0 沒出手卻被刺').toBe(hpA);
  });

  it('高-13：座位 1 的算盤珠補抽，抽進座位 1 的手裡', () => {
    const run = newCoopRun('seat-beads', 1, 'ninja', 'ninja');
    takeRelic(run, 'counting_beads', 1);
    const cs = fight(run);
    const b = seat(cs, 1); const a = seat(cs, 0);
    b.energy = 99;
    for (const e of cs.enemies) { e.hp = 999; e.block = 0; }   // 別在第三張之前就打贏
    const handA = a.hand.length;
    const handB = b.hand.length;   // 藍頭巾第一回合多抽一張，所以不寫死 5
    // 隨便打兩張，第二張觸發補抽 3 張（2026-09-23 平衡 bal：原本第三張抽一張）
    for (let k = 0; k < 2; k++) {
      const c = b.hand[0];
      expect(c, '手上沒牌了，這條在測空氣').toBeDefined();
      const tgt = cardById[c!.cardId]?.target === 'enemy' ? cs.enemies[0]!.uid : undefined;
      expect(playCard(cs, c!.uid, tgt, 1)).toBe(true);
    }
    expect(a.hand.length, '補抽的牌跑進了座位 0 手裡').toBe(handA);
    expect(b.hand.length, '座位 1 打了兩張、補抽三張').toBe(handB - 2 + 3);
  });

  it('高-14：座位 1 打技能牌，詛咒魔物的爛牌塞進座位 1 的牌堆', () => {
    const hexer = enemies.find((d) => d.hexOnSkill)!;
    const cs = fight(newCoopRun('seat-hex', 1, 'ninja', 'ninja'));
    cs.enemies[0]!.enemyId = hexer.id;
    const a = seat(cs, 0); const b = seat(cs, 1);
    const pileA = a.drawPile.length; const pileB = b.drawPile.length;
    const skill = b.hand.find((x) => cardById[x.cardId]?.type === '技能' && cardById[x.cardId]?.target !== 'enemy')!;
    expect(skill, '手上沒有技能牌，這條在測空氣').toBeDefined();
    expect(playCard(cs, skill.uid, undefined, 1)).toBe(true);
    expect(a.drawPile.length, '爛牌塞進了座位 0 的牌堆').toBe(pileA);
    expect(b.drawPile.length).toBe(pileB + hexer.hexOnSkill!.n);
  });

  it('高-15：師父第三條血的震散，兩位站著的都要震', () => {
    const master = enemies.find((d) => d.phases?.some((ph) => ph.drainPlayerPerTurn))!;
    const idx = master.phases!.findIndex((ph) => ph.drainPlayerPerTurn);
    const cs = fight(newCoopRun('seat-drain', 1, 'ninja', 'feifei'));
    for (const e of cs.enemies.slice(1)) { e.dead = true; e.hp = 0; }
    const e = cs.enemies[0]!;
    e.enemyId = master.id; e.phase = idx + 1; e.hp = 999;
    for (const p of cs.players) { addStatus(p, '爪力', 5); addStatus(p, '貓步', 5); }
    expect(beginEnemyTurn(cs)).toBe(true);
    stepEnemyTurn(cs);
    expect(getStatus(seat(cs, 1), '爪力'), '座位 1 的爪力沒被震到').toBeLessThan(5);
    expect(getStatus(seat(cs, 0), '爪力')).toBeLessThan(5);
  });

  it('高-16：座位 1 打倒飯糰怪，血回到座位 1 身上', () => {
    const onigiri = enemies.find((d) => d.onDeathHealPlayer)!;
    const cs = fight(newCoopRun('seat-heal', 1, 'ninja', 'feifei'));
    const e = cs.enemies[0]!;
    e.enemyId = onigiri.id; e.hp = 1; e.block = 0;
    const [a, b] = [seat(cs, 0), seat(cs, 1)];
    a.hp = 10; b.hp = 10;
    damageEnemy(cs, e, 50, { by: b, direct: true });
    expect(b.hp, '打倒飯糰怪的座位 1 沒回血').toBe(10 + onigiri.onDeathHealPlayer!);
    expect(a.hp, '血回到了沒出手的座位 0').toBe(10);
  });

  it('低-1：被毒倒的那一位不再抽牌、不拿飯糰', () => {
    const cs = fight(newCoopRun('seat-poison', 1, 'ninja', 'feifei'));
    const b = seat(cs, 1);
    b.hp = 2; addStatus(b, '中毒', 5);
    b.hand = []; b.energy = 0;
    cs.turn += 1;
    startPlayerTurn(cs);
    expect(b.down, '這條的前提是她被毒倒').toBe(true);
    expect(b.hand.length, '倒下的人照樣抽了牌').toBe(0);
    expect(b.energy, '倒下的人照樣拿了飯糰').toBe(0);
  });
});

describe('整局裡寫死座位 0 的那幾處', () => {
  it('高-12：幸運錢幣在座位 1 身上，加成給座位 1、不給座位 0', () => {
    const run = newCoopRun('seat-coin', 1, 'ninja', 'ninja');
    takeRelic(run, 'lucky_coin', 1);
    const cs = fight(run);
    for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
    cs.kills = cs.enemies.length;
    cs.phase = 'won';
    const fish0 = run.players[0]!.fish; const fish1 = run.players[1]!.fish;
    const r = finishCombat(run, cs)!;
    const got0 = run.players[0]!.fish - fish0; const got1 = run.players[1]!.fish - fish1;
    expect(got1 - got0, '幸運錢幣放在座位 1 身上完全沒作用').toBe(20);
    expect(r.fishPerSeat?.[1]).toBe(got1);
  });

  it('高-9：過關三選一每一位照自己的角色開', () => {
    let feifeiOnly = 0; let ninjaOnlyToHer = 0;
    for (let i = 0; i < 60; i++) {
      const run = newCoopRun(`seat-act-${i}`, 1, 'ninja', 'feifei');
      const per = rollActCardsPerSeat(run);
      for (const c of per[1]!) {
        if (c.hero === 'feifei') feifeiOnly += 1;
        if (c.hero === 'ninja') ninjaOnlyToHer += 1;
      }
    }
    expect(ninjaOnlyToHer, '菲菲過關看到了球球專屬的牌').toBe(0);
    expect(feifeiOnly, '菲菲過關一張自己的專屬牌都沒看到').toBeGreaterThan(0);
  });

  it('高-10：過關秘寶不會開出座位 1 已經有的', () => {
    let hit = 0;
    for (let i = 0; i < 60; i++) {
      const run = newCoopRun(`seat-actrelic-${i}`, 1, 'ninja', 'feifei');
      const first = rollActRelics(run);
      for (const id of first) takeRelic(run, id, 1);   // 座位 1 第一關把三件都拿走（最壞情況）
      // 清掉「開過的不再開」的記號（2026-09-15 起）：不清的話那條規則會代替這條擋掉，排除名單退化成只看座位 0 也照樣綠（總稽核 2026-09-16 乙 低-1）
      for (const k of Object.keys(run.flags)) if (k.startsWith('relic_seen:')) delete run.flags[k];
      if (rollActRelics(run).some((id) => run.players[1]!.relics.includes(id))) hit += 1;
    }
    expect(hit, '第二次過關開出了座位 1 已經有的秘寶').toBe(0);
  });

  it('高-8 → 各逛各的（使用者 2026-09-15）：每個座位一份貨架、只擺自己用得到的牌，買賣只動自己那份', () => {
    let herCards = 0; let hisCards = 0;
    for (let i = 0; i < 80; i++) {
      const run = newCoopRun(`seat-shop-${i}`, 1, 'ninja', 'feifei');
      run.players[0]!.fish = 9999; run.players[1]!.fish = 9999;
      const shops = makeShops(run);
      expect(shops.length, '兩個人就兩份').toBe(2);
      for (const it of shops[0]!.cards) { expect(notMyCard(run, it.def, 0), `球球的貨架擺了 ${it.def.name}`).toBe(false); if (it.def.hero === 'ninja') hisCards += 1; }
      for (const it of shops[1]!.cards) { expect(notMyCard(run, it.def, 1), `菲菲的貨架擺了 ${it.def.name}`).toBe(false); if (it.def.hero === 'feifei') herCards += 1; }
      // 各買各的：球球買自己貨架第 0 格，菲菲那份一格都不動；同一格菲菲照樣買得到自己的
      expect(canApplyRun({ run, shops }, { t: 'buy', seat: 0, k: 'card', i: 0 })).toBe(true);
      expect(applyRunAction({ run, shops }, { t: 'buy', seat: 0, k: 'card', i: 0 })).toBe(true);
      expect(shops[0]!.cards[0]!.sold).toBe(true);
      expect(shops[1]!.cards.some((it) => it.sold), '菲菲的貨架被球球買走了一格').toBe(false);
      expect(canApplyRun({ run, shops }, { t: 'buy', seat: 1, k: 'card', i: 0 })).toBe(true);
    }
    expect(herCards, '菲菲的貨架 80 間店一張她的專屬牌都沒擺').toBeGreaterThan(0);
    expect(hisCards).toBeGreaterThan(0);
  });

  it('高-17：重整貨架錢不夠或架上全賣光，連送都不該送', () => {
    const run = newCoopRun('seat-shuffle', 1, 'ninja', 'feifei');
    const shops = makeShops(run);
    const shop = shops[1]!;
    run.players[1]!.fish = 10;
    expect(canApplyRun({ run, shops }, { t: 'shuffle', seat: 1 }), '錢不夠還發號碼').toBe(false);
    run.players[1]!.fish = 999;
    expect(canApplyRun({ run, shops }, { t: 'shuffle', seat: 1 })).toBe(true);
    for (const it of [...shop.cards, ...shop.relics, ...shop.potions]) it.sold = true;
    expect(canApplyRun({ run, shops }, { t: 'shuffle', seat: 1 }), '架上沒東西可換還發號碼').toBe(false);
  });
});
