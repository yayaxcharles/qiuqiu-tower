import { describe, expect, it } from 'vitest';
import { enemyById } from '../../src/content/enemies';
import { damageEnemy, runEnemyEffects } from '../../src/engine/actions';
import { endTurn, playCard, resolveChoice, setReady } from '../../src/engine/combat';
import { logEvent } from '../../src/engine/logfmt';
import { beginCombat, newCoopRun, newRun, takeRelic } from '../../src/engine/run';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState } from '../../src/engine/types';

/**
 * 2026-10-17 雲端審查（戰鬥範圍）修的五條：中-1、中-2、中-3、中-5、低-1、低-2。
 * 每一條都先寫成會重現問題的樣子，修之前是紅的。
 */

function toHand(cs: CombatState, id: string, uid: number, seat = 0): number {
  cs.players[seat]!.hand.push({ uid, cardId: id, upgraded: false });
  return uid;
}

describe('中-1 影子分身重播不重發「打倒才給」的獎勵', () => {
  it('順手牽羊第一次打死目標，重播打不到東西，小魚乾只給一次', () => {
    const run = newRun('audit1017-echo', 1, 'ninja');
    const cs = beginCombat(run, 'onigiri_monster');
    const p = cs.players[0]!;
    p.energy = 99;
    const e = cs.enemies[0]!;
    // 第二隻：場上還有活的，戰鬥才不會在第一下就結束、重播才跑得到
    cs.enemies.push({ ...structuredClone(e), uid: 999 });
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'feifei_yingzi', 900));
    p.cardsPlayedThisTurn = 0;
    e.hp = 1; e.block = 0;
    const before = p.fishDelta;
    playCard(cs, toHand(cs, 'shunshou', 901), e.uid);
    expect(e.dead).toBe(true);
    expect(p.fishDelta - before).toBe(15);
  });
});

describe('中-2 牌組很薄時，0 費抽牌的牌抽不回自己', () => {
  it('抽牌堆空、棄牌堆只有剛打出的探路：洗牌不洗它，手上不會再出現它', () => {
    const run = newRun('audit1017-thin', 1, 'feifei');
    const cs = beginCombat(run, 'onigiri_monster');
    const p = cs.players[0]!;
    p.hand.length = 0; p.drawPile = []; p.discardPile = [];
    const uid = toHand(cs, 'feifei_tanlu', 900);
    playCard(cs, uid);
    expect(p.hand.some((c) => c.uid === uid)).toBe(false);
    expect(p.discardPile.some((c) => c.uid === uid)).toBe(true);
  });

  it('打完之後再抽牌，照常把它洗回來', () => {
    const run = newRun('audit1017-thin2', 1, 'feifei');
    const cs = beginCombat(run, 'onigiri_monster');
    const p = cs.players[0]!;
    p.hand.length = 0; p.drawPile = []; p.discardPile = [];
    const uid = toHand(cs, 'feifei_tanlu', 900);
    playCard(cs, uid);
    const uid2 = toHand(cs, 'feifei_tanlu', 901);
    playCard(cs, uid2);   // 第二張探路抽牌時，第一張已經打完了，可以洗回來
    expect(p.hand.some((c) => c.uid === uid)).toBe(true);
  });
});

describe('中-2 補：選牌暫停後的補抽也抽不回自己（審查員 低-B）', () => {
  it('讀心術把抽牌堆兩張都丟掉，再補抽 1：抽到的不是讀心術自己', () => {
    for (let i = 0; i < 30; i++) {
      const run = newRun(`audit1017-scry-${i}`, 1, 'ninja');
      const cs = beginCombat(run, 'onigiri_monster');
      const p = cs.players[0]!;
      p.energy = 99; p.hand.length = 0; p.discardPile = [];
      p.drawPile = [{ uid: 801, cardId: 'sanjo', upgraded: false }, { uid: 802, cardId: 'sanjo', upgraded: false }];
      const uid = toHand(cs, 'duxin', 900);
      playCard(cs, uid);
      expect(cs.pending, '讀心術要先選牌').toBeTruthy();
      resolveChoice(cs, [801, 802]);
      expect(p.hand.some((c) => c.uid === uid), `種子 ${i}`).toBe(false);
    }
  });
});

describe('中-3 連線：牌造成的舉手收不回來', () => {
  it('打「先睡了」之後按再想想，還是舉著手、牌打不出', () => {
    const run = newCoopRun('audit1017-sleep', 1);
    const cs = beginCombat(run, 'wood_dummy');
    const p = cs.players[0]!;
    p.energy = 99;
    playCard(cs, toHand(cs, 'xianshuile', 900));
    expect(p.ready).toBe(true);
    setReady(cs, 0, false);
    expect(p.ready).toBe(true);
    expect(playCard(cs, toHand(cs, 'xianshuile', 901))).toBe(false);
  });

  it('自己按的舉手照樣收得回來', () => {
    const run = newCoopRun('audit1017-sleep2', 1);
    const cs = beginCombat(run, 'wood_dummy');
    setReady(cs, 0, true);
    setReady(cs, 0, false);
    expect(cs.players[0]!.ready).toBe(false);
  });
});

describe('中-4 爬起來的血量照這場的血量倍率放大', () => {
  it('雙人打鬼將：小鬼爬起來的血＝8 × 這場的倍率', () => {
    const run = newCoopRun('audit1017-imps', 1);
    const cs = beginCombat(run, 'oni_general');
    for (const p of cs.players) { p.hp = 9999; p.maxHp = 9999; }
    const imp = cs.enemies.find((e) => e.enemyId === 'imp')!;
    const mul = cs.mods!.hpMul!;
    expect(mul).toBeGreaterThan(1);
    damageEnemy(cs, imp, 9999, { direct: true });
    expect(imp.dead).toBe(true);
    for (let t = 0; t < 6 && imp.dead; t++) endTurn(cs);
    expect(imp.dead).toBe(false);
    expect(imp.hp).toBe(Math.round(8 * mul));
  });
});

describe('中-5 連線：座位 0 上一場倒下，這一場開場秘寶不發', () => {
  it('帶毒針袋倒著進場：魔物沒中毒；暖毯的蜷縮留到下一場', () => {
    const run = newCoopRun('audit1017-down0', 1, 'feifei', 'ninja');
    takeRelic(run, 'backstep', 0);
    run.players[0]!.down = true; run.players[0]!.hp = 0;
    run.players[0]!.restBlock = 6;
    const cs = beginCombat(run, 'wood_dummy');
    for (const e of cs.enemies) expect(getStatus(e, '中毒')).toBe(0);
    const p0 = cs.players[0]!;
    expect(p0.down).toBe(true);
    expect(p0.hand).toEqual([]);
    expect(p0.energy).toBe(0);
    expect(p0.block).toBe(0);
    expect(run.players[0]!.restBlock).toBe(6);
  });
});

describe('低-1 連線：山賊偷的小魚乾退給被偷的人', () => {
  it('偷座位 1、座位 0 打倒：錢回到座位 1，座位 0 不會憑空多', () => {
    const run = newCoopRun('audit1017-bandit', 1);
    const cs = beginCombat(run, 'wood_dummy');
    const e = cs.enemies[0]!;
    runEnemyEffects(cs, e, [{ kind: 'stealFish', n: 10 }], false, cs.players[1]!);
    expect(cs.players[1]!.fishDelta).toBe(-10);
    e.hp = 1; e.block = 0;
    cs.players[0]!.energy = 99;
    playCard(cs, toHand(cs, 'sanjo', 900), e.uid);
    expect(e.dead).toBe(true);
    expect(cs.players[1]!.fishDelta).toBe(0);
    expect(cs.players[0]!.fishDelta).toBe(0);
  });
});

describe('低-2 關主前綴改寫過的開場白查得到事件', () => {
  it('前綴生效時，改寫後那一行登記在對照表裡、名字是新名字', () => {
    let checked = false;
    for (let i = 0; i < 80 && !checked; i++) {
      const run = newRun(`audit1017-pfx-${i}`, 1);
      const cs = beginCombat(run, 'nekomata');
      const boss = cs.enemies.find((e) => e.enemyId === 'nekomata')!;
      if (boss.name === enemyById['nekomata']!.name) continue;
      const line = cs.log.find((l) => l.startsWith(boss.name + '：'))!;
      const ev = logEvent(line);
      expect(ev, line).toBeDefined();
      expect((ev!.p!['e'] as { nm: string }).nm).toBe(boss.name);
      checked = true;
    }
    expect(checked, '80 個種子都沒抽到前綴').toBe(true);
  });
});
