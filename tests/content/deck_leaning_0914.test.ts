import { describe, expect, it } from 'vitest';
import { deckLeaning, dialogue, victoryLinesFor } from '../../src/content/dialogue';
import { FEIFEI_STARTER_DECK, STARTER_DECK, cardById, cards, inHeroCollection } from '../../src/content/cards';
import { Rng, seedFromString } from '../../src/engine/rng';
import { eventById } from '../../src/content/events';

/*
 * 2026-09-14 早上改的結局判定與標籤，審查代理補的三條（改回去要紅）。
 */

/** 改之前那一支（`0ec65c3`）原封不動抄過來，拿來盯「球球的判定一個字都不准變」 */
function oldDeckLeaning(deckIds: readonly string[]): 'strength' | 'stealth' | 'block' | 'plain' {
  const count = { strength: 0, stealth: 0, block: 0 };
  const starter = new Set<string>([...STARTER_DECK, ...FEIFEI_STARTER_DECK]);
  const picked = deckIds.filter((id) => !starter.has(id));
  for (const id of picked) {
    const def = cardById[id];
    if (!def) continue;
    const fx = [...def.effects, ...(def.upgrade?.effects ?? [])];
    const selfStatus = (name: string) => fx.some((e) => e.kind === 'status' && e.target === 'self' && e.name === name);
    if (selfStatus('爪力')) count.strength += 1;
    if (selfStatus('隱身') || selfStatus('潛水')) count.stealth += 1;
    if (fx.some((e) => e.kind === 'block')) count.block += 1;
  }
  const sorted = (Object.entries(count) as ['strength' | 'stealth' | 'block', number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = [sorted[0]!, sorted[1]!];
  if (picked.length === 0 || top[1] < 4 || top[1] < Math.ceil(picked.length / 4) || top[1] - second[1] < 2) return 'plain';
  return top[0];
}

describe('球球的結局判定跟改之前一模一樣', () => {
  it('隨機組 3000 副他拿得到的牌組（含平手、門檻邊界），角色參數怎麼傳都跟舊版相同', () => {
    const pool = cards.filter((c) => inHeroCollection(c, 'ninja')).map((c) => c.id);
    const rng = new Rng(seedFromString('leaning-ninja'));
    let leaned = 0;
    for (let i = 0; i < 3000; i++) {
      const deck = [...STARTER_DECK, ...Array.from({ length: rng.int(0, 16) }, () => rng.pick(pool))];
      const want = oldDeckLeaning(deck);
      if (want !== 'plain') leaned += 1;
      expect(deckLeaning(deck), `牌組 ${i}`).toBe(want);
      expect(deckLeaning(deck, 'ninja'), `牌組 ${i}`).toBe(want);
      expect(deckLeaning(deck, undefined), `牌組 ${i}`).toBe(want);
    }
    expect(leaned, '真的有判到某一派的牌組（不然等於只比了一堆「不明顯」）').toBeGreaterThan(100);
  });
});

describe('菲菲的毒流：能力牌裡的毒也算', () => {
  it('毒霧（每回合開始給全體上毒，毒包在能力牌裡）拿得多，判成毒流、師父講「深藏不露」', () => {
    const deck = [...FEIFEI_STARTER_DECK, ...Array<string>(6).fill('feifei_duwu')];
    expect(deckLeaning(deck, 'feifei'), '審查抓到：原本只看最外層，毒霧數不到').toBe('poison');
    expect(victoryLinesFor(deck, 1, 'feifei')[1]!.text).toBe(dialogue.masterFirstWords.poison);
  });

  it('同一副牌給球球判：他那條不攤開能力牌，照舊不算一派', () => {
    const deck = [...STARTER_DECK, ...Array<string>(6).fill('feifei_duwu')];
    expect(deckLeaning(deck, 'ninja')).toBe(oldDeckLeaning(deck));
  });
});

describe('師兄的痕跡：標籤的數字跟效果綁在一起', () => {
  it('標籤寫的扣血、小魚乾數字，就是效果裡的數字（以後調數值，標籤不會悄悄過期）', () => {
    const c = eventById['feifei_trace']!.choices[1]!;
    const dmg = c.outcome.find((o) => o.kind === 'damage') as { n: number } | undefined;
    const fish = c.outcome.find((o) => o.kind === 'fish') as { n: number } | undefined;
    expect(dmg && fish, '效果裡要有扣血與小魚乾').toBeTruthy();
    expect(c.label).toContain(`${dmg!.n} 點生命`);
    expect(c.label).toContain(`${fish!.n} 條小魚乾`);
  });
});
