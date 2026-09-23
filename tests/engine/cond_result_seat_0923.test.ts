import { describe, expect, it } from 'vitest';
import { cards } from '../../src/content/cards';
import { eventTextFor } from '../../src/content/event-text';
import { eventById } from '../../src/content/events';
import { heroName } from '../../src/engine/hero';
import { cardTags, choiceEffectsFor, resultSeat } from '../../src/engine/eventcond';
import { addCard, applyRunEffects, newCoopRun, newRun, takeRelic } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import type { DeckTag, EventChoice, RunState } from '../../src/engine/types';

/*
 * 連線時由同伴達成條件的條件選項，結果文字寫同伴做的事（2026-09-23 b2fin，主控裁定 b2event 待決第 2 條）。
 * `resultSeat` 挑「照哪一位的版本寫」；畫面接線（套效果之前問、三條結果路都傳下去）在 `tests/ui/b2fin_event_0923.test.ts`。
 */

/** 這一派、不是起手牌、升級前後都算這一派的牌（照 content_batch2_events_0923 那支的挑法） */
function withCards(run: RunState, tag: DeckTag, n: number, seat: number): void {
  const hero = run.players[seat]?.hero ?? 'ninja';
  const ids = cards.filter((c) => c.pool !== '起手' && c.pool !== '壞毛病' && !c.combatOnly && !c.hidden
    && (!c.hero || c.hero === hero) && cardTags(c).has(tag) && cardTags(c, true).has(tag)).map((c) => c.id);
  expect(ids.length, `${hero} 的${tag}牌不夠挑`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) addCard(run, ids[i % ids.length]!, false, seat);
}
const condChoice = (id: string): EventChoice => eventById[id]!.choices.find((c) => !!c.requires)!;

describe('條件選項的結果照誰的版本寫（resultSeat）', () => {
  it('連線、只有同伴養出【毒】：兩台都寫同伴（座位 1）做的事', () => {
    const run = newCoopRun('b2fin-rs-poison', 1, 'ninja', 'feifei');
    withCards(run, '毒', 3, 1);
    const c = condChoice('medicine_cat');
    expect(resultSeat(run, c, 0)).toBe(1);
    expect(resultSeat(run, c, 1)).toBe(1);
  });

  it('兩個人都符合：各寫各自的（本機這一位優先，跟按鈕上的標籤同一套）', () => {
    const run = newCoopRun('b2fin-rs-both', 1, 'ninja', 'feifei');
    withCards(run, '毒', 3, 0);
    withCards(run, '毒', 3, 1);
    const c = condChoice('medicine_cat');
    expect(resultSeat(run, c, 0)).toBe(0);
    expect(resultSeat(run, c, 1)).toBe(1);
  });

  it('同伴帶著鈴鐺：寫同伴；**套完效果鈴鐺交出去了就問不出來**——所以畫面要在套效果之前問', () => {
    const run = newCoopRun('b2fin-rs-bell', 1, 'dangdang', 'fengfeng');
    takeRelic(run, 'bell', 1);
    const c = condChoice('lost_kitten');
    expect(resultSeat(run, c, 0)).toBe(1);
    for (const s of [0, 1]) applyRunEffects(run, choiceEffectsFor(c, s), undefined, undefined, s);
    expect(me(run, 1).relics).not.toContain('bell');
    expect(resultSeat(run, c, 0), '套完才問就退回本機這一位').toBe(0);
  });

  it('我倒下了、同伴符合：寫同伴', () => {
    const run = newCoopRun('b2fin-rs-down', 1, 'ninja', 'dangdang');
    withCards(run, '反彈', 3, 1);
    run.players[0]!.down = true; run.players[0]!.hp = 0;
    expect(resultSeat(run, condChoice('sparring_cat'), 0)).toBe(1);
  });

  it('單人、付錢型、旗標、一般選項：都照本機這一位', () => {
    const solo = newRun('b2fin-rs-solo', 1, 'feifei');
    withCards(solo, '毒', 3, 0);
    expect(resultSeat(solo, condChoice('medicine_cat'), 0)).toBe(0);
    const coop = newCoopRun('b2fin-rs-pay', 1, 'ninja', 'feifei');
    me(coop, 0).fish = 150; me(coop, 1).fish = 150;
    expect(resultSeat(coop, condChoice('greedy_merchant'), 1)).toBe(1);
    coop.flags['chain:pigeon_wrote'] = true;
    expect(resultSeat(coop, condChoice('pigeon_reply'), 1)).toBe(1);
    expect(resultSeat(coop, eventById['medicine_cat']!.choices[0]!, 1)).toBe(1);
  });
});

describe('同伴那一版寫的是同伴自己做的事（拿它給本機看才講得通）', () => {
  // 養成型（連線時才可能是同伴讓它出現的）：流派牌、秘寶、忍具滿了
  const grown = ['lost_kitten', 'sparring_cat', 'noisy_kitchen', 'sleeping_guard', 'medicine_cat', 'heavy_door', 'old_master_ghost'];
  it('七條養成型條件選項，另外三隻都有自己的結果、主角是那一位', () => {
    // 球球那份延後載入、`event-text` 一載入才填回（上面匯入 `eventTextFor` 時就填好了）
    for (const id of grown) {
      const raw = condChoice(id).result;
      expect(raw.length, `${id} 球球那份還沒填回`).toBeGreaterThan(10);
      for (const h of ['feifei', 'dangdang', 'fengfeng'] as const) {
        const his = eventTextFor(h, raw);
        expect(his, `${id}：${h} 沒有自己的版本（會退回球球那段）`).not.toBe(raw);
        expect(his.startsWith(heroName({ hero: h })), `${id}：${h} 那版的主角不是他`).toBe(true);
      }
    }
  });
});
