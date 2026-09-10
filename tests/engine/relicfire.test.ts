import { describe, expect, it } from 'vitest';
import { damagePlayer } from '../../src/engine/actions';
import { canPlay, endTurn, playCard, startCombat, usePotion } from '../../src/engine/combat';
import { relicById, relics } from '../../src/content/relics';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CardInstance } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 秘寶發動的回饋（2026-09-10，使用者：「秘寶發動時完全沒感覺」）。
 *
 * 引擎只負責記一筆進 `cs.relicFired` ＋印一行戰報；閃格子與浮名字是畫面的事
 *（`ui/screens/combat.ts` 的 `flashRelics`）。這裡守的是「該記的有記、不該記的沒亂記」——
 * 記漏了畫面就永遠不會閃，記多了玩家會被閃到眼花。
 */
function combat(opts: { relics?: string[]; deck?: CardInstance[]; potions?: string[] } = {}) {
  const deck = opts.deck ?? [inst('sanjo', 1)];
  const cs = startCombat({
    hp: 80, maxHp: 80, deck, relics: opts.relics ?? [], potions: opts.potions ?? [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('relicfire')),
  });
  cs.player.drawPile = []; cs.player.hand = [...deck]; cs.player.energy = 9;
  return cs;
}

/** 有這個掛鉤的第一件秘寶 id。不寫死 id：秘寶表一直在動，寫死會在改資料時無聲失效 */
function firstWith(hook: keyof (typeof relics)[number]['hooks']): string {
  const r = relics.find((x) => x.hooks[hook] !== undefined);
  if (!r) throw new Error(`沒有任何秘寶帶 ${String(hook)} 掛鉤`);
  return r.id;
}

describe('秘寶發動要留下痕跡', () => {
  it('沒帶秘寶就一筆都不記', () => {
    const cs = combat();
    endTurn(cs);
    expect(cs.relicFired).toEqual([]);
  });

  it('開戰就發動的（combatStart）在戰鬥一開始就記好', () => {
    const id = firstWith('combatStart');
    const cs = combat({ relics: [id] });
    expect(cs.relicFired).toContain(id);
    // 戰報也要有那一行，玩家才知道是哪一件
    expect(cs.log.some((l) => l.includes(relicById[id]!.name))).toBe(true);
  });

  it('每回合開始的（turnStart）每回合各記一筆，不是只記第一次', () => {
    const id = firstWith('turnStart');
    const cs = combat({ relics: [id] });
    const before = cs.relicFired.filter((x) => x === id).length;
    endTurn(cs);
    endTurn(cs);
    expect(cs.relicFired.filter((x) => x === id).length).toBe(before + 2);
  });

  it('沒出攻擊牌才發動的（turnEndNoAttack）：出了攻擊牌就不記', () => {
    const id = firstWith('turnEndNoAttack');
    const quiet = combat({ relics: [id], deck: [inst('tanding', 1)] });
    endTurn(quiet);
    expect(quiet.relicFired).toContain(id);

    const loud = combat({ relics: [id], deck: [inst('sanjo', 1)] });
    playCard(loud, loud.player.hand[0]!.uid, loud.enemies[0]!.uid);
    endTurn(loud);
    expect(loud.relicFired).not.toContain(id);
  });

  it('用忍具才發動的（onPotionUse）：沒用就不記', () => {
    const id = firstWith('onPotionUse');
    const cs = combat({ relics: [id], potions: ['catgrass_tea'] });
    expect(cs.relicFired).not.toContain(id);
    usePotion(cs, 'catgrass_tea');
    expect(cs.relicFired).toContain(id);
  });

  it('擋一次致命傷的（preventLethal）只記一次，而且用它自己那句紀錄', () => {
    const id = firstWith('preventLethal');
    const cs = combat({ relics: [id] });
    cs.player.hp = 1;
    damagePlayer(cs, cs.player, 99, { direct: true });
    expect(cs.player.hp).toBe(1);                                  // 擋下來了
    expect(cs.relicFired.filter((x) => x === id).length).toBe(1);
    // 這條有專屬句子（比「發動」講得清楚），所以不該再多印一行「發動」
    expect(cs.log.filter((l) => l === `「${relicById[id]!.name}」發動`).length).toBe(0);
    expect(cs.log.some((l) => l.includes(relicById[id]!.name))).toBe(true);
    // 只擋一次：第二下就真的倒下，也不會再記第二筆
    damagePlayer(cs, cs.player, 99, { direct: true });
    expect(cs.phase).toBe('lost');
    expect(cs.relicFired.filter((x) => x === id).length).toBe(1);
  });

  it('記的都是真的存在的秘寶 id（畫面要拿它去查名字與圖）', () => {
    const cs = combat({ relics: [firstWith('combatStart'), firstWith('turnStart')] });
    endTurn(cs);
    expect(cs.relicFired.length).toBeGreaterThan(0);
    for (const id of cs.relicFired) expect(relicById[id]).toBeTruthy();
  });

  it('一場一份：新的戰鬥從零開始數', () => {
    const id = firstWith('combatStart');
    const a = combat({ relics: [id] });
    const n = a.relicFired.length;
    const b = combat({ relics: [id] });
    expect(b.relicFired.length).toBe(n);
  });

  it('連著發動的併成一行：紀錄框只有四行，不能被「發動」洗光', () => {
    // 稽核 2026-09-10 中-4：實測開場帶六件 combatStart 時，看得到的四行全是「發動」，
    // 三隻魔物的開場台詞一句都不剩。開場那批、回合開始那批各自要收成一行
    const many = relics.filter((r) => r.hooks.combatStart).slice(0, 6).map((r) => r.id);
    expect(many.length).toBeGreaterThanOrEqual(4);
    const cs = combat({ relics: many });
    const fireLines = cs.log.filter((l) => l.startsWith('秘寶發動：'));
    expect(fireLines.length).toBe(1);                       // 六件收成一行
    expect(cs.relicFired.length).toBeGreaterThanOrEqual(6);  // 但畫面那側六件都要閃
    // 魔物的開場台詞還在看得到的最後四行裡
    expect(cs.log.slice(-4).some((l) => !l.startsWith('秘寶發動：'))).toBe(true);
  });

  it('中間插進別的紀錄就另起一行，順序讀起來才是對的', () => {
    // 鐵砂衣的開場自傷會自己印一行，夾在中間的話後面那件不能被接到前面那行去
    const vest = relics.find((r) => r.hooks.combatStart?.some((e) => e.kind === 'selfDamage'));
    if (!vest) return;
    const other = relics.find((r) => r.hooks.combatStart && r.id !== vest.id)!;
    const cs = combat({ relics: [vest.id, other.id] });
    const idx = cs.log.findIndex((l) => l.includes('秘寶的代價'));
    expect(idx).toBeGreaterThan(-1);
    // 代價那行之後還有一行發動＝沒有被錯誤地併進前面那行
    expect(cs.log.slice(idx + 1).some((l) => l.startsWith('秘寶發動：'))).toBe(true);
  });

  it('同一件在同一拍只記一筆：金爪套兩個掛鉤不能算成兩次', () => {
    // 稽核 2026-09-10 中-2：金爪套同時掛 drawOnNthCard 與 energyOnNthCard，分開叫會連印兩行
    const both = relics.find((r) => r.hooks.drawOnNthCard && r.hooks.energyOnNthCard);
    if (!both) return;
    const n = both.hooks.drawOnNthCard!.n;
    const deck = Array.from({ length: n }, (_, i) => inst('sanjo', i + 1));
    const cs = combat({ relics: [both.id], deck });
    for (const c of [...cs.player.hand]) playCard(cs, c.uid, cs.enemies[0]!.uid);
    expect(cs.relicFired.filter((x) => x === both.id).length).toBe(1);
    expect(cs.log.filter((l) => l.includes(both.name)).length).toBe(1);
  });

  it('純被動不進清單：一直生效的東西沒有「發動」這個時刻', () => {
    // 鮪魚罐頭只加最大生命、忍具袋只多一格、罐頭鋪打折只在店裡有用——打一整場都不該閃
    const passive = relics
      .filter((r) => (r.hooks.maxHp ?? r.hooks.potionSlots ?? r.hooks.shopDiscount ?? r.hooks.restMultiplier ?? r.hooks.rewardChoices ?? r.hooks.winGold) !== undefined
        && Object.keys(r.hooks).length === 1)
      .map((r) => r.id);
    expect(passive.length).toBeGreaterThan(0);
    const cs = combat({ relics: passive, deck: [inst('sanjo', 1)] });
    playCard(cs, cs.player.hand[0]!.uid, cs.enemies[0]!.uid);
    endTurn(cs);
    endTurn(cs);
    expect(cs.relicFired).toEqual([]);
  });

  it('滿血時擊倒回血的秘寶什麼都沒做，不該閃也不該佔紀錄', () => {
    const id = firstWith('killHeal');
    const cs = combat({ relics: [id], deck: [inst('sanjo', 1)] });
    cs.player.hp = cs.player.maxHp;
    const foe = cs.enemies[0]!;
    foe.hp = 1;
    playCard(cs, cs.player.hand[0]!.uid, foe.uid);
    expect(foe.dead).toBe(true);
    expect(cs.relicFired).not.toContain(id);
  });

  it('同一件在同一行裡不重複寫名字（一拍打死三隻、或同掛兩個第一回合的掛鉤）', () => {
    // 稽核 2026-09-10 複核 中-2：紙鶴書籤同掛 firstTurnDraw 與 firstTurnEnergy，
    // 兩處之間沒有別的紀錄，會印成「秘寶發動：紙鶴書籤、紙鶴書籤」
    const both = relics.find((r) => r.hooks.firstTurnDraw && r.hooks.firstTurnEnergy);
    if (both) {
      const cs = combat({ relics: [both.id] });
      const line = cs.log.find((l) => l.startsWith('秘寶發動：'));
      expect(line).toBeTruthy();
      expect(line!.split(both.name).length - 1).toBe(1);   // 名字只出現一次
    }
    // 擊倒獎勵是每隻各叫一次：一拍打死兩隻也只能寫一次名字
    const killer = relics.find((r) => r.hooks.killFish);
    if (killer) {
      const cs = combat({ relics: [killer.id], deck: [inst('diliezhen', 1)] });
      for (const e of cs.enemies) e.hp = 1;
      if (cs.enemies.length >= 2 && cs.player.hand[0]) {
        playCard(cs, cs.player.hand[0].uid);
        const line = [...cs.log].reverse().find((l) => l.startsWith('秘寶發動：'));
        if (line) expect(line.split(killer.name).length - 1).toBe(1);
      }
    }
  });

  it('第四件起收成「…等 N 件」，那一行才不會折行把紀錄框吃掉', () => {
    // 稽核 2026-09-10 複核 低-2：紀錄框只有 216 像素寬、約放得下五個視覺行，
    // 併成一行解掉了「四筆都是發動」，但一筆太長會自己折成三四行，一樣把台詞擠出去
    const many = relics.filter((r) => r.hooks.combatStart).slice(0, 6).map((r) => r.id);
    const cs = combat({ relics: many });
    const line = cs.log.find((l) => l.startsWith('秘寶發動：'))!;
    expect(line).toMatch(/…等 \d+ 件$/);
    expect(line.slice('秘寶發動：'.length).split('…')[0]!.split('、').length).toBe(3);   // 只列前三件
    expect(line.length).toBeLessThanOrEqual(30);   // 一筆放得進兩個視覺行
  });

  it('球球倒下那一拍不該還在演秘寶', () => {
    // 稽核 2026-09-10 複核 低-5：被穿透打死但身上還有蜷縮時，留蜷縮那件會照樣印
    const id = firstWith('blockKeep');
    const cs = combat({ relics: [id], deck: [inst('tanding', 1)] });
    cs.player.block = 20;
    cs.player.hp = 1;
    damagePlayer(cs, cs.player, 99, { direct: true });
    expect(cs.phase).toBe('lost');
    const n = cs.relicFired.filter((x) => x === id).length;
    endTurn(cs);
    expect(cs.relicFired.filter((x) => x === id).length).toBe(n);
  });

  it('常駐的飯糰上限加成不算發動（沒有那個時刻，而且會跟開場的代價撞色）', () => {
    // 稽核 2026-09-10 複核 低-6
    const only = relics.find((r) => r.hooks.energyPerTurn && !r.hooks.combatStart
      && !r.hooks.firstTurnEnergy && !r.hooks.firstTurnDraw);
    if (!only) return;
    const cs = combat({ relics: [only.id] });
    expect(cs.relicFired).not.toContain(only.id);
  });

  it('折價的那兩件只在真的出牌時記，不會被「這張打不打得出來」的查詢問爆', () => {
    const id = firstWith('firstCardDiscountCombat');
    const deck = [inst('sanjo', 1), inst('sanjo', 2)];
    const cs = combat({ relics: [id], deck });
    // 畫面每重畫一次就會為手上每張牌各查一次，查再多次都不該記
    for (let i = 0; i < 20; i++) canPlay(cs, deck[0]!.uid, cs.enemies[0]!.uid);
    expect(cs.relicFired).not.toContain(id);
    playCard(cs, deck[0]!.uid, cs.enemies[0]!.uid);
    expect(cs.relicFired.filter((x) => x === id).length).toBe(1);
    // 整場只有第一張：第二張不再記
    playCard(cs, deck[1]!.uid, cs.enemies[0]!.uid);
    expect(cs.relicFired.filter((x) => x === id).length).toBe(1);
  });
});
