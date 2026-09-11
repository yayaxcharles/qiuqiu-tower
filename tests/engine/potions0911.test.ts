// 2026-09-11 那批戰術型忍具與三個新事件的**引擎行為**。
// `tests/content/potions2.test.ts` 只驗資料齊不齊、進不進得了池子；這一支驗真的跑起來對不對
//（稽核 2026-09-11：那批最容易錯的六件原本一條都沒被驗到）。
import { describe, expect, it } from 'vitest';
import { STARTER_DECK, cardById } from '../../src/content/cards';
import { eventById } from '../../src/content/events';
import { relicById } from '../../src/content/relics';
import { playCard, startCombat, usePotion } from '../../src/engine/combat';
import { endTurn } from '../../src/engine/combat';
import { applyRunEffects, newRun, potionCapacity, takeRelic } from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';
import { me } from '../../src/engine/runplayer';

function fight(encounterId: string, potions: string[], hp = 999, maxHp = 999) {
  return startCombat({
    hp, maxHp, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions,
    encounterId, rng: new Rng(seedFromString('p0911')),
  });
}

describe('起死回生丹的使用條件', () => {
  it('生命高於三成時 `usePotion` 直接回 false，忍具不會被吃掉', () => {
    const cs = fight('kappa', ['revive_pill'], 50, 100);   // 五成血
    expect(usePotion(cs, 'revive_pill')).toBe(false);
    expect(cs.potions).toContain('revive_pill');
    expect(cs.player.hp).toBe(50);
  });
  it('生命低於三成時用得出來，回的是**最大生命**的一半（不是缺的血的一半）', () => {
    const cs = fight('kappa', ['revive_pill'], 20, 100);   // 兩成血
    expect(usePotion(cs, 'revive_pill')).toBe(true);
    expect(cs.player.hp).toBe(70);   // 20 + 100×50%
    expect(cs.potions).not.toContain('revive_pill');
  });
  it('回滿了不會溢出最大生命', () => {
    const cs = fight('kappa', ['revive_pill'], 25, 100);
    usePotion(cs, 'revive_pill');
    expect(cs.player.hp).toBe(75);
    const cs2 = fight('kappa', ['revive_pill'], 29, 100);
    usePotion(cs2, 'revive_pill');
    expect(cs2.player.hp).toBeLessThanOrEqual(100);
  });
});

describe('貓爪雷（damageScatter）', () => {
  it('三下加起來就是 30 點，分散在還活著的魔物身上', () => {
    const cs = fight('kappa', ['claw_bolt']);
    // 這條會跟遭遇的血量綁在一起：血不夠時最後一下過殺，溢出的部分不會算進差值。
    // 所以先確認這場撐得住 30 點，之後有人調血量會在這裡看到原因，不是看到一個莫名其妙的數字（複核 低-7）
    const before = cs.enemies.reduce((s, e) => s + e.hp + e.block, 0);
    expect(before, '這場總血量要大於 30 才驗得出總量').toBeGreaterThan(30);
    expect(usePotion(cs, 'claw_bolt')).toBe(true);
    const after = cs.enemies.reduce((s, e) => s + e.hp + e.block, 0);
    expect(before - after).toBe(30);
  });
  it('**不會空砍在打不到的目標上**：調息中的那幾隻不該被抽中（稽核 2026-09-11 中-2）', () => {
    /*
     * 三隻老鼠、**前兩隻在調息**（`invulnIn`＝血條式關主變身的無敵過場，活著但完全吃不到傷害）。
     * 盲抽的話每一下有三分之二機率浪費掉，三下全避開的機率不到 4%——
     * 所以掃三十個種子，只要有一個種子出現「毫髮無傷」就代表沒避開。
     * 一個種子驗不出來：這條測試第一版就是只跑一個種子，剛好抽中沒浪費，改壞了也照樣綠。
     */
    for (let k = 0; k < 30; k++) {
      const cs = startCombat({
        hp: 999, maxHp: 999, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)),
        relics: [], potions: ['claw_bolt'], encounterId: 'rats3', rng: new Rng(seedFromString(`scatter${k}`)),
      });
      expect(cs.enemies.length).toBe(3);
      cs.enemies[0]!.invulnIn = 3;
      cs.enemies[1]!.invulnIn = 3;
      const frozen = cs.enemies.slice(0, 2).map((e) => e.hp + e.block);
      usePotion(cs, 'claw_bolt');
      expect(cs.enemies.slice(0, 2).map((e) => e.hp + e.block), `種子 scatter${k}`).toEqual(frozen);
      // 最直接的證據：`damageEnemy` 打在調息中的目標身上會留下「毫髮無傷」那一行
      expect(cs.log.some((l) => l.includes('毫髮無傷')), `種子 scatter${k}：有一下砍在打不到的目標上`).toBe(false);
    }
  });
});

describe('先手香（skipEnemyTurn）', () => {
  it('用掉那一輪魔物整排不動手，而且只擋一輪', () => {
    const cs = fight('kappa', ['first_incense'], 200, 200);
    expect(usePotion(cs, 'first_incense')).toBe(true);
    const hp0 = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hp, '這一輪不該掉血').toBe(hp0);
    expect(cs.enemies.every((e) => e.turnCount === 0), '一隻都沒動過').toBe(true);
    expect(cs.skipEnemies, '旗標要清掉，不能連擋兩輪').toBeFalsy();
    cs.player.block = 0;
    endTurn(cs);
    expect(cs.enemies.some((e) => e.turnCount > 0), '下一輪就照樣動').toBe(true);
  });
  it('**援軍那一輪用先手香，伏兵照樣要出現**（稽核 2026-09-11 中-1：原本整波被永久吃掉）', () => {
    const cs = fight('kappa', ['first_incense', 'first_incense'], 999, 999);
    const tadpoles = () => cs.enemies.filter((e) => e.enemyId === 'tadpole');
    cs.player.block = 999; endTurn(cs);   // 第 1 回合
    cs.player.block = 999; endTurn(cs);   // 第 2 回合
    expect(tadpoles().length).toBe(0);
    expect(usePotion(cs, 'first_incense')).toBe(true);   // 第 3 回合＝河童叫援軍那一輪
    cs.player.block = 999; endTurn(cs);
    expect(tadpoles().length, '援軍要照樣跳出來').toBe(2);
    expect(cs.log.some((l) => l.includes('這一輪沒動手')), '同時魔物確實沒出手').toBe(true);
    // 再走幾回合，確認那批援軍是真的在場上、會動
    cs.player.block = 999; endTurn(cs);
    expect(tadpoles().every((e) => e.turnCount >= 1)).toBe(true);
  });
});

describe('鐵布衫膏與分身油', () => {
  it('鐵布衫膏這回合完全不掉血', () => {
    const cs = fight('kappa', ['iron_salve'], 200, 200);
    expect(usePotion(cs, 'iron_salve')).toBe(true);
    expect(cs.player.immune).toBe(true);
    const hp0 = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hp).toBe(hp0);
  });
  it('分身油：不只掛旗標，下一張攻擊牌真的打兩倍', () => {
    const base = fight('kappa', []);
    const cs = fight('kappa', ['clone_oil']);
    const atk = cs.player.hand.find((c) => cardById[c.cardId]?.type === '攻擊');
    expect(atk, '手上要有攻擊牌才驗得出來').toBeTruthy();
    const baseAtk = base.player.hand.find((c) => c.cardId === atk!.cardId)!;
    const hp0 = base.enemies[0]!.hp + base.enemies[0]!.block;
    playCard(base, baseAtk.uid, base.enemies[0]!.uid);
    const plain = hp0 - (base.enemies[0]!.hp + base.enemies[0]!.block);

    expect(usePotion(cs, 'clone_oil')).toBe(true);
    expect(cs.player.doubleNext).toBe(1);
    const hp1 = cs.enemies[0]!.hp + cs.enemies[0]!.block;
    playCard(cs, atk!.uid, cs.enemies[0]!.uid);
    const doubled = hp1 - (cs.enemies[0]!.hp + cs.enemies[0]!.block);
    expect(doubled, `同一張牌加倍前 ${plain}、加倍後 ${doubled}`).toBe(plain * 2);
  });
});

describe('換家的老鼠（loseRelic）', () => {
  it('交出去的是非起始秘寶，最大生命跟著扣回去、不會順便補血', () => {
    const run = newRun('lose1');
    takeRelic(run, 'tuna_can');   // 最大生命 +10 並補血
    const maxBefore = me(run).maxHp;
    me(run).hp = me(run).maxHp - 30;
    const hpBefore = me(run).hp;
    const notes: string[] = [];
    applyRunEffects(run, [{ kind: 'loseRelic' }], notes);
    expect(me(run).relics).not.toContain('tuna_can');
    expect(me(run).relics, '起始秘寶留著').toContain('blue_headband');
    expect(me(run).maxHp).toBe(maxBefore - 10);
    expect(me(run).hp, '只往下夾、不補血').toBeLessThanOrEqual(hpBefore);
    expect(notes.some((n) => n.includes('交出了'))).toBe(true);
  });
  it('身上只有起始秘寶時不會爆，會留一行說明', () => {
    const run = newRun('lose2');
    const notes: string[] = [];
    expect(() => applyRunEffects(run, [{ kind: 'loseRelic' }], notes)).not.toThrow();
    expect(notes.some((n) => n.includes('沒有可以交出去'))).toBe(true);
  });
  it('**交出去的那件不會被立刻換回來**（稽核 2026-09-11 低-1）', () => {
    // 交一件、換兩件常見；跑很多種子，同一件不該出現在換回來的兩件裡
    for (let i = 0; i < 60; i++) {
      const run = newRun(`swap${i}`);
      takeRelic(run, 'tuna_can');
      const notes: string[] = [];
      applyRunEffects(run, [{ kind: 'loseRelic' }, { kind: 'relic', pool: '常見' }, { kind: 'relic', pool: '常見' }], notes);
      const gone = notes.find((n) => n.startsWith('交出了'));
      if (!gone) continue;
      const name = gone.slice('交出了「'.length, -1);
      const backAgain = me(run).relics.some((id) => relicById[id]?.name === name);
      expect(backAgain, `種子 swap${i}：${name} 又換回來了`).toBe(false);
    }
  });
  it('**交出加忍具格的秘寶時，放不下的忍具要講明白**（稽核 2026-09-11 中-5）', () => {
    const run = newRun('bag1');
    takeRelic(run, 'potion_bag');   // 忍具格 +1
    const cap = potionCapacity(run);
    me(run).potions = Array.from({ length: cap }, () => 'milk');
    const notes: string[] = [];
    applyRunEffects(run, [{ kind: 'loseRelic' }], notes);
    expect(me(run).potions.length, '不能超過新的格數').toBeLessThanOrEqual(potionCapacity(run));
    if (!me(run).relics.includes('potion_bag')) {
      expect(notes.some((n) => n.includes('放不下')), '要告訴玩家掉了什麼').toBe(true);
    }
  });
});

describe('三個新事件的結果真的會生效', () => {
  it('磨到只剩一把刀：**整組結果一起跑**，要回「還欠三張」而不是一張', () => {
    const ev = eventById['grindstone'];
    expect(ev, '事件要存在').toBeTruthy();
    const grind = ev!.choices[0]!;
    const run = newRun('grind');
    const before = me(run).maxHp;
    // 只餵一半（挑出 maxHp 那項）等於沒驗到真正會壞的地方：`applyRunEffects` 的待辦累加器
    // 是「換一種 kind 就重算」，三個 removeCard 中間夾了別的就會只回 n: 1（複核 2026-09-11 低-6）
    const outcome = applyRunEffects(run, grind.outcome, []);
    expect(outcome, '三張要併成同一筆待辦').toEqual({ needs: 'removeCard', n: 3 });
    expect(me(run).maxHp, '最大生命 −8 也要同時生效').toBe(before - 8);
  });
  it('速成的卷軸：兩張升級併成一筆待辦，而且真的塞一張**壞毛病**', () => {
    const ev = eventById['shortcut_scroll']!;
    const train = ev.choices[0]!;
    const run = newRun('scroll');
    const before = me(run).deck.length;
    const outcome = applyRunEffects(run, train.outcome, []);
    expect(outcome, '兩張升級要併成同一筆').toEqual({ needs: 'upgradeCard', n: 2 });
    expect(me(run).deck.length, '真的多一張').toBe(before + 1);
    const added = me(run).deck[me(run).deck.length - 1]!;
    expect(cardById[added.cardId]?.pool, '多的那張要是壞毛病，不是隨便一張牌').toBe('壞毛病');
  });
  it('三個事件都留得起「不做」那條路', () => {
    for (const id of ['moving_rat', 'grindstone', 'shortcut_scroll']) {
      const ev = eventById[id];
      expect(ev, id).toBeTruthy();
      expect(ev!.choices.some((c) => c.outcome.length === 0), `${id} 沒有拒絕的選項`).toBe(true);
    }
  });
});
