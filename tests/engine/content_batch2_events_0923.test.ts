import { describe, expect, it } from 'vitest';
import { cards } from '../../src/content/cards';
import { encounterById } from '../../src/content/enemies';
import { eventById, events } from '../../src/content/events';
import { relicById } from '../../src/content/relics';
import { cardTags, choiceEffectsFor, choiceGate, choiceOrder, deckTagCount, seatTextIndex, visibleChoices } from '../../src/engine/eventcond';
import { generateMap, weightedOrder } from '../../src/engine/map';
import {
  addCard, advanceAct, applyRunEffects, beginCombat, chooseNode, newCoopRun, newRun, potionCapacity, takeRelic,
} from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { me } from '../../src/engine/runplayer';
import { checkRun } from '../../src/engine/save';
import { eventValue } from '../../src/engine/smartbot';
import { coopRun } from '../../src/engine/coopbot';
import { startCombat } from '../../src/engine/combat';
import type { DeckTag, EventDef, RunState } from '../../src/engine/types';
import { runFingerprint } from '../../src/net/hash';

/*
 * 內容擴充第二批的事件機制（2026-09-23，劇本 design2 第一節 新1／新2／新4～新9、事件權重）。
 * 每一條都照「把修正改回壞寫法會紅」寫；怎麼確認會紅寫在報告 `scratchpad/content/b2event.md`。
 */

/** 這一派、不是起手牌、升級前後都算這一派的牌（挑前幾張來塞牌組） */
function tagged(tag: DeckTag, hero = 'ninja'): string[] {
  return cards.filter((c) => c.pool !== '起手' && c.pool !== '壞毛病' && !c.combatOnly && !c.hidden
    && (!c.hero || c.hero === hero) && cardTags(c).has(tag) && cardTags(c, true).has(tag)).map((c) => c.id);
}
function withCards(run: RunState, tag: DeckTag, n: number, seat = 0): void {
  const ids = tagged(tag, run.players[seat]?.hero ?? 'ninja');
  expect(ids.length, `${tag} 的牌不夠挑`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) addCard(run, ids[i % ids.length]!, false, seat);
}
const cond = (id: string): number => eventById[id]!.choices.findIndex((c) => !!c.requires);

describe('條件選項（新1）：達成才出現、差一點就不出現', () => {
  it('流派牌不算起手牌：菲菲起手六張上毒，一開局看不到【毒】那條', () => {
    const run = newRun('b2-feifei-start', 1, 'feifei');
    expect(run.players[0]!.deck.filter((c) => cardTags(cards.find((d) => d.id === c.cardId)!).has('毒')).length,
      '布置：她的起手牌裡本來就有上毒的').toBeGreaterThanOrEqual(3);
    expect(deckTagCount(run, 0, '毒')).toBe(0);
    expect(visibleChoices(run, eventById['medicine_cat']!)).toEqual([0, 1, 2]);
  });

  it('同一張牌升級前後算一張（不會因為升級多算）', () => {
    const run = newRun('b2-upg', 1, 'feifei');
    withCards(run, '毒', 2);
    for (const c of me(run).deck) c.upgraded = true;
    expect(deckTagCount(run, 0, '毒')).toBe(2);
  });

  const cases: { id: string; tag: string; hero?: string; yes: (r: RunState) => void; no: (r: RunState) => void }[] = [
    { id: 'sleeping_guard', tag: '隱身', yes: (r) => withCards(r, '隱身', 3), no: (r) => withCards(r, '隱身', 2) },
    { id: 'medicine_cat', tag: '毒', hero: 'feifei', yes: (r) => withCards(r, '毒', 3), no: (r) => withCards(r, '毒', 2) },
    { id: 'sparring_cat', tag: '反彈', hero: 'dangdang', yes: (r) => withCards(r, '反彈', 3), no: (r) => withCards(r, '反彈', 2) },
    { id: 'heavy_door', tag: '蓄氣', hero: 'fengfeng', yes: (r) => withCards(r, '蓄氣', 3), no: (r) => withCards(r, '蓄氣', 2) },
    { id: 'greedy_merchant', tag: '小魚乾 150', yes: (r) => { me(r).fish = 150; }, no: (r) => { me(r).fish = 149; } },
    { id: 'old_master_ghost', tag: '師門', yes: (r) => { takeRelic(r, 'master_hat'); }, no: (r) => { takeRelic(r, 'master_gourd'); } },
    { id: 'lost_kitten', tag: '鈴鐺', yes: (r) => { takeRelic(r, 'bell'); }, no: () => {} },
    { id: 'noisy_kitchen', tag: '忍具滿了',
      yes: (r) => { while (me(r).potions.length < potionCapacity(r)) me(r).potions.push('onigiri'); },
      no: (r) => { while (me(r).potions.length < potionCapacity(r) - 1) me(r).potions.push('onigiri'); } },
  ];
  it.each(cases)('$id【$tag】：達成看得到、差一點看不到', ({ id, tag, hero, yes, no }) => {
    const ev = eventById[id]!;
    const i = cond(id);
    expect(i, '條件選項加在最後').toBe(ev.choices.length - 1);
    expect(ev.choices[i]!.requiresLabel).toBe(tag);
    const a = newRun(`b2-yes-${id}`, 1, (hero ?? 'ninja') as never); yes(a);
    const b = newRun(`b2-no-${id}`, 1, (hero ?? 'ninja') as never); no(b);
    expect(visibleChoices(a, ev), '達成了卻看不到').toContain(i);
    expect(visibleChoices(b, ev), '差一點卻看得到').not.toContain(i);
    // 既有選項一個都不能少
    for (let k = 0; k < i; k++) { expect(visibleChoices(a, ev)).toContain(k); expect(visibleChoices(b, ev)).toContain(k); }
  });

  it('白貓【反彈】：身上有銅鏡、龜甲、鐵砧任一件也算（起始的銅護臂不算）', () => {
    const ev = eventById['sparring_cat']!;
    const dd = newRun('b2-dd-start', 1, 'dangdang');
    expect(visibleChoices(dd, ev), '噹噹一開局就有銅護臂，不能算').not.toContain(2);
    takeRelic(dd, 'anvil');
    expect(visibleChoices(dd, ev)).toContain(2);
    expect(choiceGate(dd, ev.choices[2]!).why).toEqual({ kind: 'relic', id: 'anvil' });
  });

  it('鏈的第三集：旗標型條件（寫過回信、躲著看過它練）', () => {
    const run = newRun('b2-flag', 1, 'ninja');
    expect(visibleChoices(run, eventById['pigeon_reply']!)).toEqual([0, 1]);
    run.flags['chain:pigeon_wrote'] = true;
    expect(visibleChoices(run, eventById['pigeon_reply']!)).toEqual([0, 1, 2]);
    run.flags['chain:shadow_2_fought'] = true;
    expect(visibleChoices(run, eventById['shadow_truth']!), '追上去打的那一條沒有這條路').toEqual([0, 1]);
    run.flags['chain:shadow_2_watched'] = true;
    expect(visibleChoices(run, eventById['shadow_truth']!)).toEqual([0, 1, 2]);
  });

  it('連線：養成型任一位符合就出現（標籤寫是誰的）；付錢型要每一位都符合', () => {
    const run = newCoopRun('b2-coop-cond', 1, 'ninja', 'feifei');
    takeRelic(run, 'bell', 1);   // 同伴帶鈴鐺
    const kitten = eventById['lost_kitten']!.choices[2]!;
    expect(choiceGate(run, kitten, 0)).toMatchObject({ shown: true, by: 1 });
    takeRelic(run, 'bell', 0);
    expect(choiceGate(run, kitten, 0).by, '兩個人都有，標籤寫自己').toBe(0);
    const buy = eventById['greedy_merchant']!.choices[3]!;
    me(run, 0).fish = 200; me(run, 1).fish = 149;
    expect(choiceGate(run, buy, 0).shown, '同伴錢不夠').toBe(false);
    me(run, 1).fish = 150;
    expect(choiceGate(run, buy, 0).shown).toBe(true);
    // 倒下的人不算：他錢不夠也照樣出現
    me(run, 1).fish = 0; run.players[1]!.down = true; run.players[1]!.hp = 0;
    expect(choiceGate(run, buy, 0).shown).toBe(true);
  });
});

describe('新的事件結果（新2／新4／新5／新6）', () => {
  it('relicId：沒有就給那一件、已經有了改給小魚乾', () => {
    const run = newRun('b2-relicid');
    const fish0 = me(run).fish;
    applyRunEffects(run, [{ kind: 'relicId', id: 'wind_chime', fallbackFish: 60 }]);
    expect(me(run).relics).toContain('wind_chime');
    expect(me(run).fish).toBe(fish0);
    const notes: string[] = [];
    applyRunEffects(run, [{ kind: 'relicId', id: 'wind_chime', fallbackFish: 60 }], notes);
    expect(me(run).relics.filter((r) => r === 'wind_chime').length).toBe(1);
    expect(me(run).fish).toBe(fish0 + 60);
    expect(notes.join()).toContain('改拿 60 條小魚乾');
  });

  it('loseRelicId：交出指定那一件、還原生命上限；沒有就什麼都不做', () => {
    const run = newRun('b2-lose');
    takeRelic(run, 'tuna_can');
    const max = me(run).maxHp;
    applyRunEffects(run, [{ kind: 'loseRelicId', id: 'tuna_can' }]);
    expect(me(run).relics).not.toContain('tuna_can');
    expect(me(run).maxHp).toBe(max - 10);
    const before = JSON.stringify(run.players[0]);
    applyRunEffects(run, [{ kind: 'loseRelicId', id: 'bell' }]);
    expect(JSON.stringify(run.players[0]), '身上沒有鈴鐺：一件都不該少').toBe(before);
  });

  it('losePotion：交出最便宜的那一支，同價取最後拿到的；沒有就沒少', () => {
    const run = newRun('b2-potion');
    me(run).potions = ['onigiri', 'smoke_bomb', 'shuriken'];   // 飯糰 30、煙霧彈 45、手裡劍 30
    applyRunEffects(run, [{ kind: 'losePotion' }]);
    expect(me(run).potions).toEqual(['onigiri', 'smoke_bomb']);
    me(run).potions = [];
    const notes: string[] = [];
    expect(() => applyRunEffects(run, [{ kind: 'losePotion' }], notes)).not.toThrow();
    expect(notes.join()).toContain('沒被拿走什麼');
  });

  it('nextFight：記在身上、下一場開打那一拍套上（爪力、蜷縮）、用完就清掉', () => {
    const run = newRun('b2-bento');
    applyRunEffects(run, eventById['tower_kitchen']!.choices[1]!.outcome);
    expect(me(run).nextFight?.length).toBe(1);
    const cs = beginCombat(run, 'cucumber');
    expect(cs.players[0]!.statuses['爪力']).toBe(2);
    expect(cs.players[0]!.block).toBeGreaterThanOrEqual(8);
    expect(cs.log.some((l) => l.includes('便當')), '紀錄要寫是誰吃了便當').toBe(true);
    expect(me(run).nextFight, '只帶一場').toBeUndefined();
    const cs2 = beginCombat(run, 'cucumber');
    expect(cs2.players[0]!.statuses['爪力'] ?? 0).toBe(0);
  });

  it('nextFight：倒下的人這一場不吃，留到站起來那一場', () => {
    const run = newCoopRun('b2-bento-down', 1, 'ninja', 'feifei');
    applyRunEffects(run, eventById['tower_kitchen']!.choices[1]!.outcome, undefined, undefined, 1);
    run.players[1]!.down = true; run.players[1]!.hp = 0;
    beginCombat(run, 'cucumber');
    expect(me(run, 1).nextFight?.length, '倒著的人不該吃掉便當').toBe(1);
  });

  it('nextFight 進整局指紋、跟著存檔走；舊存檔沒有這欄照樣讀得回來', () => {
    const a = newRun('b2-fp'); const b = newRun('b2-fp');
    expect(runFingerprint(a)).toBe(runFingerprint(b));
    applyRunEffects(a, eventById['tower_kitchen']!.choices[1]!.outcome);
    expect(runFingerprint(a), '帶了便當的那一台指紋要不一樣').not.toBe(runFingerprint(b));
    const back = checkRun(JSON.parse(JSON.stringify(a)))!;
    expect(back.players[0]!.nextFight).toEqual(a.players[0]!.nextFight);
    const old = JSON.parse(JSON.stringify(b)); delete old.players[0].nextFight;
    expect(checkRun(old), '舊存檔（沒有 nextFight）').not.toBeNull();
    const bad = JSON.parse(JSON.stringify(a)); bad.players[0].nextFight = [{ note: 1 }];
    expect(checkRun(bad), '壞掉的 nextFight 不能讀進來（開打那一拍才炸）').toBeNull();
  });

  it('「從 3 張絕學牌中選 1 張、自選升級至多 1 張」：學完招接著挑牌升級，兩件都在（不會後寫蓋前寫）', () => {
    const run = newRun('b2-then');
    const o = applyRunEffects(run, [{ kind: 'chooseCard', pool: '絕學', n: 3 }, { kind: 'upgradeCard' }]);
    expect(o && 'chooseCard' in o ? o.then : null).toEqual({ needs: 'upgradeCard', n: 1 });
    const o2 = applyRunEffects(run, [{ kind: 'upgradeCard' }, { kind: 'chooseCard', pool: '絕學', n: 3 }]);
    expect(o2 && 'chooseCard' in o2 ? o2.then : null, '寫的順序反過來也一樣').toEqual({ needs: 'upgradeCard', n: 1 });
    const o3 = applyRunEffects(run, [{ kind: 'chooseCard', pool: '絕學', n: 3 }]);
    expect(o3 && 'chooseCard' in o3 ? o3.then : 'x', '只有學招的照舊沒有 then').toBeUndefined();
  });
});

describe('排地圖（新7／新8／新9、事件權重）', () => {
  const idsOn = (opts: { hero?: string | null; flags?: Record<string, boolean> }, act: number, n = 60): Set<string> => {
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const m = generateMap(new Rng(seedFromString(`b2-map-${act}-${i}`)), { act, bossIds: ['nekomata'], flags: opts.flags ?? {}, hero: opts.hero });
      for (const nd of m.nodes) if (nd.eventId) seen.add(nd.eventId);
    }
    return seen;
  };

  it('影子鏈只在單人排（soloOnly）', () => {
    expect(idsOn({ hero: 'feifei' }, 1).has('shadow_loose')).toBe(true);
    expect(idsOn({ hero: null }, 1).has('shadow_loose'), '連線局排到影子鏈').toBe(false);
  });

  it('連線限定三篇只在連線排（coopOnly）', () => {
    for (const [id, act] of [['coop_rope_bridge', 1], ['coop_seesaw', 2], ['coop_shooting_star', 3]] as const) {
      expect(idsOn({ hero: null }, act).has(id), `連線第 ${act} 關排不到 ${id}`).toBe(true);
      for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng']) expect(idsOn({ hero }, act).has(id), `${hero} 單人排到 ${id}`).toBe(false);
    }
  });

  it('單人球球的影子鏈第二集換成屋頂上的影子（soloHeroSwap）；其他三隻照常是偷練的影子', () => {
    const flags = { 'chain:shadow_1': true };
    expect(idsOn({ hero: 'ninja', flags }, 2).has('shadow_study'), '球球地圖排到偷練的影子').toBe(false);
    expect(idsOn({ hero: 'feifei', flags }, 2).has('shadow_study')).toBe(true);
    const ninja = newRun('b2-swap-ninja', 1, 'ninja');
    ninja.flags['chain:shadow_1'] = true;
    advanceAct(ninja);
    expect(ninja.flags['sequel:ninja_roof_shadow'], '球球換關時要改標屋頂那篇').toBe(true);
    expect(ninja.flags['sequel:shadow_study']).toBeUndefined();
    const feifei = newRun('b2-swap-feifei', 1, 'feifei');
    feifei.flags['chain:shadow_1'] = true;
    advanceAct(feifei);
    expect(feifei.flags['sequel:shadow_study']).toBe(true);
  });

  it('事件權重：整批都是 1 時跟原本的洗牌一模一樣（亂數走向不變）', () => {
    const ids = events.filter((e) => !e.weight).slice(0, 20).map((e) => e.id);
    expect(weightedOrder(new Rng(seedFromString('w1')), ids)).toEqual(new Rng(seedFromString('w1')).shuffle(ids));
  });

  it('事件權重：權重高的比較常排在前面', () => {
    const ev = eventById['toll']!;
    const ids = events.filter((e) => !e.hero && !e.fixedFloor && !e.requiresFlag).slice(0, 12).map((e) => e.id);
    const first = (w: number | undefined): number => {
      (ev as EventDef).weight = w;
      try {
        let n = 0;
        for (let i = 0; i < 400; i++) if (weightedOrder(new Rng(seedFromString(`w-${i}`)), ids).indexOf('toll') < 3) n++;
        return n;
      } finally { delete (ev as EventDef).weight; }
    };
    expect(ids).toContain('toll');
    expect(first(4), '權重 4 排進前三的次數要明顯比權重 1 多').toBeGreaterThan(first(undefined) * 1.8);
  });
});

describe('兩條事件鏈走得完（後集優先、一關一集）', () => {
  /** 走進這一關第一個事件格（不管地圖上排的是哪篇，後集優先會換成它） */
  function enterFirstEvent(run: RunState): string {
    const node = run.map.nodes.find((n) => n.type === '事件' && n.floor !== 5)!;
    const parent = run.map.nodes.find((n) => n.next.includes(node.id));
    run.currentNode = parent ? parent.id : null;
    if (!parent) run.map.start = [node.id];
    return chooseNode(run, node.id).eventId!;
  }

  it('郵差鴿：第一關放下來 → 第二關第一個事件格就是給爺爺的信 → 第三關是風裡的回信（寫過信多一條）', () => {
    const run = newRun('b2-chain-pigeon', 1, 'dangdang');
    applyRunEffects(run, eventById['pigeon_lost']!.choices[0]!.outcome);
    advanceAct(run);
    expect(enterFirstEvent(run)).toBe('pigeon_grandpa');
    applyRunEffects(run, eventById['pigeon_grandpa']!.choices[1]!.outcome);   // 替爺爺寫回信
    advanceAct(run);
    expect(enterFirstEvent(run)).toBe('pigeon_reply');
    expect(visibleChoices(run, eventById['pigeon_reply']!)).toEqual([0, 1, 2]);
  });

  it('郵差鴿第一集沒幫忙（勾斷背帶）：鏈就斷了', () => {
    const run = newRun('b2-chain-pigeon-no', 1, 'ninja');
    applyRunEffects(run, eventById['pigeon_lost']!.choices[1]!.outcome);
    advanceAct(run);
    expect(run.flags['sequel:pigeon_grandpa']).toBeUndefined();
  });

  it('影子鏈（單人菲菲）：追上去 → 偷練的影子 → 影子的真面目；球球走屋頂那篇也接得到第三集', () => {
    const run = newRun('b2-chain-shadow', 1, 'feifei');
    applyRunEffects(run, eventById['shadow_loose']!.choices[0]!.outcome);
    advanceAct(run);
    expect(enterFirstEvent(run)).toBe('shadow_study');
    applyRunEffects(run, eventById['shadow_study']!.choices[1]!.outcome);   // 躲在門外看
    advanceAct(run);
    expect(enterFirstEvent(run)).toBe('shadow_truth');
    expect(visibleChoices(run, eventById['shadow_truth']!)).toEqual([0, 1, 2]);

    const nj = newRun('b2-chain-shadow-ninja', 1, 'ninja');
    applyRunEffects(nj, eventById['shadow_loose']!.choices[0]!.outcome);
    advanceAct(nj);
    expect(enterFirstEvent(nj)).toBe('ninja_roof_shadow');
    applyRunEffects(nj, eventById['ninja_roof_shadow']!.choices[1]!.outcome);   // 躲著看
    advanceAct(nj);
    expect(enterFirstEvent(nj)).toBe('shadow_truth');
    expect(visibleChoices(nj, eventById['shadow_truth']!)).toEqual([0, 1, 2]);
  });

  it('鏈的旗標進整局指紋', () => {
    const a = newRun('b2-chain-fp'); const b = newRun('b2-chain-fp');
    a.flags['chain:pigeon_wrote'] = true;
    expect(runFingerprint(a)).not.toBe(runFingerprint(b));
  });
});

describe('連線限定事件（新7）：一人得一人付', () => {
  const coopIds = ['coop_rope_bridge', 'coop_seesaw', 'coop_shooting_star'];

  it('①② 的 bySeat 互為鏡像、③ 是兩人一樣；有 bySeat 就不看 outcome', () => {
    for (const id of coopIds) {
      const [c0, c1, c2] = eventById[id]!.choices;
      expect(eventById[id]!.coopOnly).toBe(true);
      expect(c0!.bySeat![0]).toEqual(c1!.bySeat![1]);
      expect(c0!.bySeat![1]).toEqual(c1!.bySeat![0]);
      expect(c2!.bySeat).toBeUndefined();
      expect(choiceEffectsFor(c0!, 1)).toBe(c0!.bySeat![1]);
      expect(choiceEffectsFor(c2!, 1)).toBe(c2!.outcome);
    }
  });

  it('座位 1 看到的文字對調、「我拿」排第一；座位 0 照原本的', () => {
    const run = newCoopRun('b2-coop-order', 1, 'ninja', 'feifei');
    const ev = eventById['coop_rope_bridge']!;
    expect(choiceOrder(run, ev, 0)).toEqual([0, 1, 2]);
    expect(choiceOrder(run, ev, 1)).toEqual([1, 0, 2]);
    expect([0, 1, 2].map((i) => seatTextIndex(ev, i, 0))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((i) => seatTextIndex(ev, i, 1))).toEqual([1, 0, 2]);
    expect(ev.choices[0]!.label.startsWith('我'), '「我拿」那個標籤以「我」開頭').toBe(true);
  });

  it('任一位倒下時，①② 不出現、只剩 ③', () => {
    const run = newCoopRun('b2-coop-down', 1, 'ninja', 'feifei');
    for (const id of coopIds) expect(visibleChoices(run, eventById[id]!)).toEqual([0, 1, 2]);
    run.players[1]!.down = true; run.players[1]!.hp = 0;
    for (const id of coopIds) expect(visibleChoices(run, eventById[id]!), id).toEqual([2]);
  });

  it('套效果：座位 0 拿秘寶、座位 1 扣血（① 過橋）', () => {
    const run = newCoopRun('b2-coop-apply', 1, 'ninja', 'feifei');
    const c = eventById['coop_rope_bridge']!.choices[0]!;
    const hp1 = me(run, 1).hp, rel0 = me(run, 0).relics.length;
    for (const i of [0, 1]) applyRunEffects(run, choiceEffectsFor(c, i), undefined, undefined, i);
    expect(me(run, 0).relics.length).toBe(rel0 + 1);
    expect(me(run, 1).hp).toBeLessThan(hp1);
  });
});

describe('影子鏈那一場（取代第一批暫用的鏡子走廊那場）', () => {
  it.each([['ninja', '球球的影子'], ['feifei', '菲菲的影子'], ['dangdang', '噹噹的影子'], ['fengfeng', '封封的影子']] as const)(
    '%s：名牌是「%s」、開場白不是從鏡子裡跨出來', (hero, name) => {
      for (const id of ['shadow_duel', 'shadow_duel_a2', 'shadow_duel_a3']) {
        const cs = startCombat({ hp: 50, maxHp: 50, deck: [], relics: [], potions: [], encounterId: id, rng: new Rng(seedFromString(`sd-${hero}`)), hero });
        expect(cs.enemies[0]!.name).toBe(name);
        expect(cs.enemies[0]!.line ?? '').not.toContain('鏡子');
        expect(cs.log.some((l) => l.startsWith(`${name}：`))).toBe(true);
      }
    });

  it('數值跟鏡子走廊那三筆一樣（只換名牌與開場白）', () => {
    for (const s of ['', '_a2', '_a3']) {
      const a = { ...encounterById[`shadow_duel${s}`]! }, b = { ...encounterById[`mirror_duel${s}`]! };
      delete (a as { skin?: string }).skin;
      expect({ ...a, id: '' }).toEqual({ ...b, id: '' });
    }
  });

  it('鏡子走廊那場照舊（鏡中菲菲、從鏡子裡跨出來那套）', () => {
    const cs = startCombat({ hp: 50, maxHp: 50, deck: [], relics: [], potions: [], encounterId: 'mirror_duel', rng: new Rng(seedFromString('md')), hero: 'feifei' });
    expect(cs.enemies[0]!.name).toBe('鏡中菲菲');
  });

  it('偷練的影子、影子的真面目、屋頂上的影子打的都是它', () => {
    for (const [id, i] of [['shadow_study', 0], ['shadow_truth', 0], ['ninja_roof_shadow', 0]] as const) {
      expect(eventById[id]!.choices[i]!.outcome.some((o) => o.kind === 'fight' && o.encounterId === 'shadow_duel'), id).toBe(true);
    }
  });
});

describe('兩個人的機器人走得完連線限定事件（投票與一人得一人付）', () => {
  it('跑一批連線局：遇得到三篇、選得出「我拿／我付」那兩個、整局跑完不出錯', () => {
    const seen = new Map<string, Set<number>>();
    for (let i = 0; i < 80; i++) {
      const st = coopRun(`b2-coopbot-${i}`, 1, i % 2 ? ['ninja', 'feifei'] : ['dangdang', 'fengfeng']);
      for (const e of st.events) if (e.id.startsWith('coop_')) {
        const s = seen.get(e.id) ?? new Set<number>(); s.add(e.choice); seen.set(e.id, s);
      }
    }
    expect([...seen.keys()].sort(), '八十局連一篇連線限定事件都沒遇到').toContain('coop_rope_bridge');
    const anyBySeat = [...seen.values()].some((s) => s.has(0) || s.has(1));
    expect(anyBySeat, '機器人一次都沒選過一人得一人付的那兩個').toBe(true);
  });
});

describe('機器人估得出每個新選項的值', () => {
  const b2 = ['pigeon_lost', 'pigeon_grandpa', 'pigeon_reply', 'shadow_loose', 'shadow_study', 'shadow_truth',
    'cell_bandit', 'rat_bathhouse', 'bear_cellar', 'library_ladder', 'tower_kitchen', 'wooden_men_alley',
    'fallen_star', 'wind_chimes', 'miasma_crystal', 'coop_rope_bridge', 'coop_seesaw', 'coop_shooting_star'];

  it('十八篇都在，每個「有發生事」的選項估值是有限而且不為 0；什麼都不做的是 0', () => {
    for (const id of b2) expect(eventById[id], id).toBeTruthy();
    const run = newCoopRun('b2-value', 1, 'ninja', 'feifei');
    // 兩位都不滿血（滿血時回血選項估 0 是對的，那不是估不出來）
    for (const s of [0, 1]) me(run, s).hp = Math.floor(me(run, s).maxHp * 0.8);
    for (const id of b2) {
      for (const [i, c] of eventById[id]!.choices.entries()) {
        for (const seat of [0, 1]) {
          const fx = choiceEffectsFor(c, seat);
          const v = eventValue(run, fx, c.costFish ?? 0, seat);
          expect(Number.isFinite(v), `${id} ${i}`).toBe(true);
          const real = fx.filter((o) => o.kind !== 'flag');
          if (real.length) expect(v, `${id} 第 ${i + 1} 個選項（座位 ${seat}）估成 0`).not.toBe(0);
          else expect(v === 0, `${id} 第 ${i + 1} 個選項`).toBe(true);
        }
      }
    }
  });

  it('新種類：指定秘寶、交出指定秘寶、交出忍具、下一場加成都有估值', () => {
    const run = newRun('b2-value-kinds');
    expect(eventValue(run, [{ kind: 'relicId', id: 'wind_chime', fallbackFish: 60 }], 0)).toBeGreaterThan(0);
    takeRelic(run, 'wind_chime');
    expect(eventValue(run, [{ kind: 'relicId', id: 'wind_chime', fallbackFish: 60 }], 0), '已經有了＝60 條').toBeCloseTo(60 * 0.35);
    takeRelic(run, 'bell');
    expect(eventValue(run, [{ kind: 'loseRelicId', id: 'bell' }], 0)).toBeLessThan(0);
    me(run).potions = ['onigiri'];
    expect(eventValue(run, [{ kind: 'losePotion' }], 0)).toBeLessThan(0);
    me(run).potions = [];
    expect(eventValue(run, [{ kind: 'losePotion' }], 0) === 0, '身上沒忍具＝沒損失').toBe(true);
    expect(eventValue(run, eventById['tower_kitchen']!.choices[1]!.outcome, 0)).toBeGreaterThan(0);
  });

  it('鏈的入口有估值：血夠時機器人會幫鴿子、追影子（不然兩條鏈在平衡報告裡等於不存在）', () => {
    const run = newRun('b2-chain-bot', 1, 'feifei');
    const v = (id: string, i: number): number => eventValue(run, eventById[id]!.choices[i]!.outcome, 0);
    expect(v('pigeon_lost', 0), '幫鴿子（扣 4 血＋鏈）要比勾斷背帶（1 個忍具）划算').toBeGreaterThan(v('pigeon_lost', 1));
    expect(v('shadow_loose', 0), '追上去要比照回腳下划算').toBeGreaterThan(v('shadow_loose', 1));
    run.flags['chain:pigeon_1'] = true;
    expect(v('pigeon_lost', 0), '這一局已經記過就不再加分').toBeLessThan(v('pigeon_lost', 1));
    // 只算事件鏈（`chain:`）：舊的前後集旗標照舊不算分，舊事件的挑法一個都不變
    expect(eventValue(run, [{ kind: 'flag', name: 'toll_paid' }], 0) === 0).toBe(true);
    expect(eventValue(run, [{ kind: 'flag', name: 'chain:pigeon_wrote' }], 0) === 0, '只開條件選項、不解鎖後集的旗標不算').toBe(true);
  });

  it('兩條鏈的第一集權重 3（第一集只在第一關，照平均排的話走完三集的局太少）', () => {
    expect(eventById['pigeon_lost']!.weight).toBe(3);
    expect(eventById['shadow_loose']!.weight).toBe(3);
    expect(events.filter((e) => (e.weight ?? 1) !== 1).map((e) => e.id).sort()).toEqual(['pigeon_lost', 'shadow_loose']);
  });

  it('師門：斗笠在身上時機器人看得到那條、也估得出來', () => {
    const run = newRun('b2-bot-hat');
    takeRelic(run, 'master_hat');
    const ev = eventById['old_master_ghost']!;
    expect(visibleChoices(run, ev)).toContain(2);
    expect(relicById['master_hat']).toBeTruthy();
    expect(eventValue(run, ev.choices[2]!.outcome, 0)).toBeGreaterThan(20);
  });
});
