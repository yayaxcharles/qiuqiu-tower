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
  it('走法：入口三選、匯合層只有一格、每一步都只走到相鄰車道', () => {
    // 節點的位置由路線決定，不再是固定的三行，所以這裡驗結構、不寫死車道編號
    const m = generateMap(new Rng(seedFromString('walk')));
    expect(nextChoices(m, null).length).toBe(3);
    const chest = nodesOnFloor(m, 8);
    expect(chest.length).toBe(1);
    // 7F 的每一格都只能通到 8F 那唯一一格
    for (const n of nodesOnFloor(m, 7)) expect(n.next).toEqual([chest[0]!.id]);
    expect(nextChoices(m, nodesOnFloor(m, 15)[0]!.id)).toEqual([]);
  });
  it('200 個種子：每一步都是相鄰車道（剛離開匯合層除外）', () => {
    for (let i = 0; i < 200; i++) {
      const m = generateMap(new Rng(seedFromString(`step-${i}`)));
      for (const n of m.nodes) {
        // 匯合層只有一格，往上是往外散開，這一步不受相鄰限制
        if (nodesOnFloor(m, n.floor).length === 1) continue;
        for (const id of n.next) {
          const t = m.nodes.find((x) => x.id === id)!;
          if (nodesOnFloor(m, t.floor).length === 1) continue;
          expect(Math.abs(t.lane - n.lane), `seed step-${i} ${n.id}→${id}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  it('200 個種子：確實有樓層是空著幾格的（不再是每層都排滿）', () => {
    let varied = 0;
    for (let i = 0; i < 200; i++) {
      const m = generateMap(new Rng(seedFromString(`sparse-${i}`)));
      // 非匯合層裡，只要有一層不是三格，就算這張地圖有疏密變化
      const rows = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13].map((f) => nodesOnFloor(m, f).length);
      if (rows.some((c) => c < 3)) varied++;
    }
    expect(varied).toBeGreaterThan(150);
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
