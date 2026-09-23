import { describe, expect, it } from 'vitest';
import { events } from '../../src/content/events';
import { eventTextFor } from '../../src/content/event-text';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';

describe('菲菲的事件', () => {
  it('她的專屬事件只排給她，球球的地圖裡不會有', () => {
    const hers = events.filter((e) => e.hero === 'feifei').map((e) => e.id);
    expect(hers.length, '至少兩個專屬事件').toBeGreaterThanOrEqual(2);
    const idsOn = (hero: string) => {
      const set = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const m = generateMap(new Rng(seedFromString(`ev-${i}`)), { act: 1, bossIds: ['nekomata'], flags: {}, hero });
        for (const n of m.nodes) if (n.eventId) set.add(n.eventId);
      }
      return set;
    };
    const ninja = idsOn('ninja');
    for (const id of hers) expect(ninja.has(id), `${id} 排進球球的地圖了`).toBe(false);
    const feifei = idsOn('feifei');
    expect(hers.some((id) => feifei.has(id)), '四十張地圖裡一次都沒排到她的事件').toBe(true);
  });

  it('共用事件的文案：敘述換名字、引號裡句尾的喵拿掉；球球那邊一個字不動', () => {
    const shared = events.filter((e) => !e.hero);
    for (const e of shared) {
      const texts = [e.text, ...e.choices.map((c) => c.result), ...e.choices.map((c) => c.label)];
      for (const t of texts) {
        expect(eventTextFor('ninja', t), `${e.title} 球球那邊被動到了`).toBe(t);
        const hers = eventTextFor('feifei', t);
        expect(hers.includes('球球'), `${e.title} 還寫著球球：${hers.slice(0, 40)}`).toBe(false);
      }
    }
  });

  it('她的專屬事件裡不會出現球球的口氣（句尾的喵）', () => {
    for (const e of events.filter((x) => x.hero === 'feifei')) {
      const texts = [e.text, ...e.choices.map((c) => c.result)];
      for (const t of texts) expect(/喵[。！？…]/.test(t), `${e.title}：${t.slice(0, 30)}`).toBe(false);
    }
  });
});

describe('連線局不排職業獨占事件', () => {
  it('兩個人的局一次都不會遇到「師兄的痕跡」那類', async () => {
    const { newCoopRun } = await import('../../src/engine/run');
    const hers = new Set(events.filter((e) => e.hero).map((e) => e.id));
    /*
     * 那幾個是寫給單人故事的：「師兄不見了、我沿著痕跡追」——
     * 連線時球球就站在她旁邊，故事整個不成立。
     */
    for (let i = 0; i < 30; i++) {
      const run = newCoopRun(`coop-${i}`, 1, 'feifei');
      for (const n of run.map.nodes) {
        if (n.eventId) expect(hers.has(n.eventId), `${n.eventId} 排進連線局了`).toBe(false);
      }
    }
  });

  it('單人局照樣排得到', async () => {
    const { newRun } = await import('../../src/engine/run');
    const hers = new Set(events.filter((e) => e.hero === 'feifei').map((e) => e.id));
    let seen = false;
    for (let i = 0; i < 30 && !seen; i++) {
      const run = newRun(`solo-${i}`, 1, 'feifei');
      seen = run.map.nodes.some((n) => !!n.eventId && hers.has(n.eventId));
    }
    expect(seen, '三十張單人地圖裡一次都沒排到她的事件').toBe(true);
  });
});
