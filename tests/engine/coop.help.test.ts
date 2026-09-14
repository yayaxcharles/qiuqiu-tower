import { describe, expect, it } from 'vitest';
import { playCard, startCombat, startPlayerTurn } from '../../src/engine/combat';
import { damagePlayer, pickVictim } from '../../src/engine/actions';
import { applyEffects } from '../../src/engine/effects';
import { coopHpMul } from '../../src/engine/coopscale';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { cardById } from '../../src/content/cards';
import { relics } from '../../src/content/relics';
import { pickable } from '../../src/engine/hero';
import { encounterById } from '../../src/content/enemies';
import { addCard, newRun, upgradeCard } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import type { CombatState, Effect, PlayerCombat } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/*
 * 兩個人一起打時的兩件事（2026-09-11）：
 *   一、魔物的血量放大（只放大血量，傷害一點都不動——抄二代的規則）
 *   二、三張幫隊友的牌（分你一半、幫你一把、我來擋）
 */

function combat(players = 1, deck = [inst('tanding', 1)]): CombatState {
  const cs = startCombat({
    hp: 70, maxHp: 70, deck, relics: [], potions: [],
    encounterId: 'rats3', rng: new Rng(seedFromString('help')), players,
  });
  cs.player.drawPile = []; cs.player.hand = [...deck]; cs.player.energy = 9;
  return cs;
}

function addSecond(cs: CombatState): PlayerCombat {
  const p2 = blankPlayer([], 1);
  p2.energy = 3;
  cs.players.push(p2);
  return p2;
}

describe('雙人的魔物血量：只放大血量，傷害不動', () => {
  it('一個人玩時倍率一定是 1（單機一個位元都不能變）', () => {
    for (const pool of ['弱', '中', '強', '大魔物', '塔主', '召喚'] as const) {
      expect(coopHpMul(pool, 1), pool).toBe(1);
    }
  });

  it('兩個人：一般怪 1.5 倍、菁英 1.65、關主 1.75（抄二代的數字）', () => {
    expect(coopHpMul('弱', 2)).toBe(1.5);
    expect(coopHpMul('中', 2)).toBe(1.5);
    expect(coopHpMul('大魔物', 2)).toBe(1.65);
    expect(coopHpMul('塔主', 2)).toBe(1.75);
  });

  it('人數給奇怪的值也不會爆（0、負的、超出表格）', () => {
    expect(coopHpMul('弱', 0)).toBe(1);
    expect(coopHpMul('弱', -3)).toBe(1);
    expect(coopHpMul('弱', 99)).toBe(coopHpMul('弱', 3));
  });

  it('實際開一場：兩個人的魔物血真的比較多，而且是同一個倍率', () => {
    const solo = combat(1);
    const duo = combat(2);
    expect(solo.enemies.length).toBe(duo.enemies.length);
    const mul = coopHpMul(encounterById['rats3']!.pool, 2);
    for (let i = 0; i < solo.enemies.length; i++) {
      const a = solo.enemies[i]!; const b = duo.enemies[i]!;
      expect(b.maxHp, `第 ${i} 隻`).toBeGreaterThan(a.maxHp);
      // 血量是「基礎值 × 倍率」四捨五入，所以比值會落在倍率附近（基礎值本身有亂數）
      expect(b.maxHp / a.maxHp, `第 ${i} 隻的倍率`).toBeCloseTo(mul, 1);
    }
  });

  it('**傷害一點都不動**：同一招在一人場與兩人場打出來一樣痛', () => {
    const hit = (players: number): number => {
      const cs = combat(players);
      const p = cs.player;
      p.hp = 60; p.block = 0; p.statuses = {};
      const foe = cs.enemies[0]!;
      foe.statuses = {};   // 排掉魔氣之類的干擾
      const before = p.hp;
      damagePlayer(cs, foe, 12, { victim: p });
      return before - p.hp;
    };
    expect(hit(2)).toBe(hit(1));
  });
});

describe('幫隊友的九張牌', () => {
  it('分你一半：兩個人各自拿到自己那一份（各照各的貓步算）', () => {
    const cs = combat(1, [inst('fenyiban', 1)]);
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.block = 0; p2.block = 0;

    playCard(cs, 1);
    expect(p1.block, '自己拿到').toBe(5);
    expect(p2.block, '同伴也拿到').toBe(5);
  });

  it('分你一半：一個人玩就只有自己拿到（不會憑空多一份）', () => {
    const cs = combat(1, [inst('fenyiban', 1)]);
    cs.player.block = 0;
    playCard(cs, 1);
    expect(cs.player.block).toBe(5);
    expect(cs.players.length).toBe(1);
  });

  it('幫你一把：爪力加在**同伴**身上，自己沒有', () => {
    const cs = combat(1, [inst('bangnisheme', 1)]);
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);

    playCard(cs, 1);
    expect(getStatus(p2, '爪力'), '同伴拿到 2 層').toBe(2);
    expect(getStatus(p1, '爪力'), '自己沒有').toBe(0);
  });

  it('幫你一把：一個人玩時退化成掛在自己身上（不會白打一張）', () => {
    const cs = combat(1, [inst('bangnisheme', 1)]);
    playCard(cs, 1);
    expect(getStatus(cs.player, '爪力')).toBe(2);
  });

  it('幫你一把：同伴倒下就退回自己（不會加在倒下的人身上白費）', () => {
    const cs = combat(1, [inst('bangnisheme', 1)]);
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p2.down = true;
    playCard(cs, 1);
    expect(getStatus(p2, '爪力'), '倒下的人不該拿到').toBe(0);
    expect(getStatus(p1, '爪力'), '退回自己').toBe(2);
  });

  it('我來擋：這一輪魔物全部打喊的那個人，**而且不擲骰**', () => {
    const cs = combat(1, [inst('wolaidang', 1)]);
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);

    playCard(cs, 1);
    expect(p1.taunt).toBe(true);
    expect(p1.block, '配的那份蜷縮也要有，不然這張是純自殺').toBe(10);

    const before = { ...cs.rng.state };
    for (let i = 0; i < 20; i++) expect(pickVictim(cs)).toBe(p1);
    expect(cs.rng.state, '指定目標就不該擲骰——擲了「都打我」會變成「一半機率打我」').toEqual(before);
    void p2;
  });

  it('我來擋：只保護一輪，下一回合開始就沒了', () => {
    const cs = combat(1, [inst('wolaidang', 1)]);
    const p1 = cs.players[0] as PlayerCombat;
    addSecond(cs);
    playCard(cs, 1);
    expect(p1.taunt).toBe(true);

    // 回合開始會清掉（`startSeatTurn`）
    startPlayerTurn(cs);
    expect(p1.taunt).toBeFalsy();
  });

  it('我來擋：喊的人倒下之後就不再吸引攻擊', () => {
    const cs = combat(1, [inst('wolaidang', 1)]);
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    playCard(cs, 1);
    p1.down = true;
    expect(pickVictim(cs), '倒下的人不在候選裡').toBe(p2);
  });

  it('你拿去擋：整份給同伴，自己一點都沒有', () => {
    const cs = combat(1, [inst('ninaqudang', 1)]);
    const p1 = cs.players[0] as PlayerCombat; const p2 = addSecond(cs);
    p1.block = 0; p2.block = 0;
    playCard(cs, 1);
    expect(p2.block).toBe(12);
    expect(p1.block, '這張是整份給出去，不是分一半').toBe(0);
  });

  it('你先躲：隱身走 gainStealth，吃的是**收禮那一方**的秘寶加成', () => {
    const cs = combat(1, [inst('nixianduo', 1)]);
    const p1 = cs.players[0] as PlayerCombat; const p2 = addSecond(cs);
    // 紙袋那類「每回合第一次拿隱身多幾層」的加成掛在收禮的人身上才算數
    const bonus = relics.find((r) => (r.hooks.stealthBonus ?? 0) > 0);
    expect(bonus, '要有一件加隱身的秘寶才測得下去').toBeDefined();
    p2.relics = [bonus!.id];
    playCard(cs, 1);
    expect(getStatus(p2, '隱身'), '2 層再加上他自己那件秘寶的加成').toBeGreaterThan(2);
    expect(getStatus(p1, '隱身')).toBe(0);
    expect(cardById['nixianduo']?.hero, '給隱身的牌只有忍者開得到').toBe('ninja');
  });

  it('借你踩兩步：貓步加在同伴身上，他之後的蜷縮才會變多', () => {
    const cs = combat(1, [inst('jienicailiangbu', 1)]);
    const p2 = addSecond(cs);
    playCard(cs, 1);
    expect(getStatus(p2, '貓步')).toBe(2);
  });

  it('你也抽一張：同伴抽自己的牌堆，我的手牌一張都沒動', () => {
    const cs = combat(1, [inst('niyechouyizhang', 1)]);
    const p1 = cs.players[0] as PlayerCombat; const p2 = addSecond(cs);
    p2.drawPile = [inst('sanjo', 1001), inst('sanjo', 1002)];
    const mine = p1.hand.length;
    playCard(cs, 1);
    expect(p2.hand.length).toBe(1);
    expect(p1.hand.length, '我只是打了那張牌，沒有多抽').toBe(mine - 1);
  });

  it('我幫你拍掉：清同伴的減益，我自己的留著', () => {
    const cs = combat(1, [inst('wobangnipaidiao', 1)]);
    const p1 = cs.players[0] as PlayerCombat; const p2 = addSecond(cs);
    addStatus(p1, '翻肚', 3); addStatus(p2, '翻肚', 3); addStatus(p2, '懶洋洋', 2);
    playCard(cs, 1);
    expect(getStatus(p2, '翻肚'), '同伴清乾淨').toBe(0);
    expect(getStatus(p2, '懶洋洋')).toBe(0);
    expect(getStatus(p1, '翻肚'), '基礎版不清自己的').toBe(3);
  });

  it('飯糰分你：飯糰給同伴，而且算進「多出來的」讓畫面演得出來', () => {
    const cs = combat(1, [inst('fantuanfenni', 1)]);
    const p1 = cs.players[0] as PlayerCombat; const p2 = addSecond(cs);
    p2.energy = 3;
    const before = cs.energyGain;
    playCard(cs, 1);
    expect(p2.energy, '同伴多一顆').toBe(4);
    expect(cs.energyGain - before, '要記成「憑空多出來的」，不然畫面上飯糰變多沒人知道是誰給的').toBe(1);
    void p1;
  });

  it('九張牌都標成連線牌，而且圖都到齊了（`hidden` 已經拿掉）', () => {
    const ids = ['fenyiban', 'ninaqudang', 'nixianduo', 'wolaidang', 'bangnisheme',
      'jienicailiangbu', 'niyechouyizhang', 'wobangnipaidiao', 'fantuanfenni'];
    for (const id of ids) {
      expect(cardById[id], id).toBeDefined();
      expect(cardById[id]?.coop, `${id} 要標成連線牌`).toBe(true);
      expect(cardById[id]?.hidden, `${id} 的圖已經生好了，不該再掛待圖旗標`).toBeUndefined();
    }
    expect(ids.length).toBe(9);
  });

  it('**只有雙人局才進池**：同一張牌單機開不到、兩個人開得到', () => {
    const card = cardById['fenyiban']!;
    // `hidden` 會先擋掉，所以測的是拿掉待圖旗標之後的行為
    const asIfDrawn = { ...card, hidden: undefined } as typeof card;
    expect(pickable(asIfDrawn, 'ninja', 1), '一個人玩不該開出連線牌').toBe(false);
    expect(pickable(asIfDrawn, 'ninja', 2), '兩個人就開得到').toBe(true);
    // 一般牌不受人數影響
    const normal = cardById['tanding']!;
    expect(pickable(normal, 'ninja', 1)).toBe(true);
    expect(pickable(normal, 'ninja', 2)).toBe(true);
  });

  it('牌面說明講的是做得到的事（單機也抽得到，不能寫「給隊友」就跑掉）', () => {
    const cs = combat(1);
    applyEffects(cs, [{ kind: 'taunt' }], { self: cs.player, source: 'card' });
    expect(cs.log.some((l) => l.includes('架式')), '一個人時的紀錄不該說「魔物都衝著他來」').toBe(true);
  });
});

describe('連線牌跟一般牌走完全同一套規則', () => {
  const IDS = ['fenyiban', 'ninaqudang', 'nixianduo', 'wolaidang', 'bangnisheme',
    'jienicailiangbu', 'niyechouyizhang', 'wobangnipaidiao', 'fantuanfenni'];

  it('九張都升得了級，而且升級**真的有變**（不是抄一份一樣的）', () => {
    for (const id of IDS) {
      const def = cardById[id]!;
      expect(def.upgrade, `${id} 要有升級`).toBeDefined();
      const base = JSON.stringify(def.effects);
      const up = JSON.stringify(def.upgrade.effects ?? def.effects);
      const costChanged = def.upgrade.cost !== undefined && def.upgrade.cost !== def.cost;
      expect(up !== base || costChanged, `${id} 的升級跟原版一模一樣，等於沒升`).toBe(true);
    }
  });

  it('升級是往好的方向（量變大、或費用變低）', () => {
    const total = (fx: readonly Effect[]): number =>
      fx.reduce((s, f) => s + ((f as { amount?: number }).amount ?? (f as { n?: number }).n ?? 0), 0);
    for (const id of IDS) {
      const def = cardById[id]!;
      const cheaper = (def.upgrade.cost ?? def.cost) < def.cost;
      const bigger = total(def.upgrade.effects ?? def.effects) > total(def.effects);
      const moreEffects = (def.upgrade.effects ?? def.effects).length > def.effects.length;
      expect(cheaper || bigger || moreEffects, `${id} 升級之後沒有變好`).toBe(true);
    }
  });

  it('在整局裡真的升得起來（走 upgradeCard 那條，跟一般牌同一支）', () => {
    const run = newRun('coop-up', 1);
    for (const id of IDS) {
      const c = addCard(run, id);
      expect(upgradeCard(run, c.uid), `${id} 應該升得了`).toBe(true);
      expect(me(run).deck.find((x) => x.uid === c.uid)?.upgraded).toBe(true);
    }
  });

  it('升級版打出來真的比較強：分你一半 5 → 8', () => {
    const mk = (up: boolean): number => {
      const cs = combat(1, [inst('fenyiban', 1, up)]);
      const p2 = addSecond(cs);
      (cs.players[0] as PlayerCombat).block = 0; p2.block = 0;
      playCard(cs, 1);
      return p2.block;
    };
    expect(mk(false)).toBe(5);
    expect(mk(true)).toBe(8);
  });

  it('九張都標成白紙（畫面靠 `coop` 這個旗標換底色）', () => {
    for (const id of IDS) expect(cardById[id]?.coop, id).toBe(true);
    // 一般牌不該被誤標
    expect(cardById['tanding']?.coop).toBeUndefined();
  });
});
