import { describe, expect, it } from 'vitest';
import { FIXED_EVENT_FLOOR_5 } from '../../src/content/events';
import { generateMap, nextChoices, nodesOnFloor, validateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { GameMap } from '../../src/engine/types';

describe('地圖', () => {
  it('200 個種子全部合法', () => {
    for (let i = 0; i < 200; i++) {
      const m = generateMap(new Rng(seedFromString(`map-${i}`)));
      expect(validateMap(m), `seed map-${i}`).toEqual([]);
    }
  });
  it('同種子同地圖', () => {
    const a = generateMap(new Rng(seedFromString('m'))); const b = generateMap(new Rng(seedFromString('m')));
    expect(a).toEqual(b);
  });
  it('固定層', () => {
    const m = generateMap(new Rng(seedFromString('fixed')));
    expect(nodesOnFloor(m, 1).every((n) => n.type === '戰鬥')).toBe(true);
    expect(nodesOnFloor(m, 5).every((n) => n.type === '事件' && n.eventId === FIXED_EVENT_FLOOR_5)).toBe(true);
    expect(nodesOnFloor(m, 7).some((n) => n.type === '大魔物')).toBe(true);
    expect(nodesOnFloor(m, 8).map((n) => n.type)).toEqual(['紙箱']);
    expect(nodesOnFloor(m, 14).map((n) => n.type)).toEqual(['貓窩']);
    expect(nodesOnFloor(m, 15).map((n) => n.type)).toEqual(['塔主']);
    expect(nodesOnFloor(m, 15)[0]?.encounterId).toBe('tower_master');
  });
  it('走法：入口 3 選、匯合層 1 選、匯合後 3 選', () => {
    const m = generateMap(new Rng(seedFromString('walk')));
    expect(nextChoices(m, null).length).toBe(3);
    expect(nextChoices(m, 'f7-l0').map((n) => n.id)).toEqual(['f8-l1']);
    expect(nextChoices(m, 'f8-l1').length).toBe(3);
    expect(nextChoices(m, 'f2-l0').map((n) => n.lane)).toEqual([0, 1]);
    expect(nextChoices(m, 'f2-l1').map((n) => n.lane)).toEqual([0, 1, 2]);
    expect(nextChoices(m, 'f15-l1')).toEqual([]);
  });
  it('比例大致合理（200 張地圖）', () => {
    let fight = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      const m = generateMap(new Rng(seedFromString(`ratio-${i}`)));
      for (const f of [2, 3, 4]) for (const n of nodesOnFloor(m, f)) { total++; if (n.type === '戰鬥') fight++; }
    }
    expect(fight / total).toBeGreaterThan(0.5); expect(fight / total).toBeLessThan(0.75);
  });
  it('validateMap 抓得到動過手腳的地圖', () => {
    const good = generateMap(new Rng(seedFromString('tamper')));
    expect(validateMap(good)).toEqual([]);
    const bad: GameMap = structuredClone(good);
    nodesOnFloor(bad, 1)[0]!.type = '事件';                              // 1F 不該有事件，且它沒有 eventId
    bad.nodes.find((n) => n.type === '戰鬥')!.encounterId = 'no_such_encounter';   // 遭遇 id 不存在
    nodesOnFloor(bad, 13)[0]!.type = '貓窩';                             // 13F 不可放貓窩
    const problems = validateMap(bad);
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(validateMap(good)).toEqual([]);                               // 原圖沒被改到
  });
});
