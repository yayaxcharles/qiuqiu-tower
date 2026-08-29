import { encounterById, encountersOfPool } from '../content/enemies';
import { FIXED_EVENT_FLOOR_5, eventById, events } from '../content/events';
import type { Rng } from './rng';
import type { GameMap, MapNode, NodeType } from './types';

export const FLOORS = 15;
const LANES = 3;
const CONVERGED: Record<number, NodeType> = { 8: '紙箱', 14: '貓窩', 15: '塔主' };

export function poolForFloor(floor: number): '弱' | '中' | '強' {
  return floor <= 4 ? '弱' : floor <= 10 ? '中' : '強';
}

function roll(rng: Rng, table: [NodeType, number][]): NodeType {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [t, w] of table) { r -= w; if (r < 0) return t; }
  return table[table.length - 1]![0];
}

function tableFor(floor: number): [NodeType, number][] {
  if (floor >= 2 && floor <= 4) return [['戰鬥', 60], ['事件', 30], ['罐頭鋪', 10]];
  if (floor === 6) return [['戰鬥', 50], ['事件', 35], ['罐頭鋪', 15]];
  if (floor === 7) return [['戰鬥', 60], ['事件', 40]];
  return [['戰鬥', 45], ['事件', 25], ['罐頭鋪', 10], ['貓窩', 10], ['大魔物', 10]];   // 9–13
}

export function generateMap(rng: Rng): GameMap {
  const nodes: MapNode[] = [];
  const byFloor: MapNode[][] = [];
  for (let f = 1; f <= FLOORS; f++) {
    const row: MapNode[] = [];
    const conv = CONVERGED[f];
    if (conv) row.push({ id: `f${f}-l1`, floor: f, lane: 1, type: conv, next: [] });
    else for (let l = 0; l < LANES; l++) row.push({ id: `f${f}-l${l}`, floor: f, lane: l, type: '戰鬥', next: [] });
    byFloor[f] = row;
    nodes.push(...row);
  }
  // 類型
  for (let f = 2; f <= 13; f++) {
    if (CONVERGED[f]) continue;
    const row = byFloor[f]!;
    if (f === 5) { for (const n of row) n.type = '事件'; continue; }
    let shops = 0, elites = 0;
    for (const n of row) {
      let t = roll(rng, tableFor(f));
      if (t === '罐頭鋪' && shops >= 1) t = '戰鬥';
      if (t === '大魔物' && elites >= 1) t = '戰鬥';
      if (t === '貓窩' && f === 13) t = '戰鬥';
      if (t === '罐頭鋪') shops++;
      if (t === '大魔物') elites++;
      n.type = t;
    }
    if (f === 7 && elites === 0) rng.pick(row).type = '大魔物';
  }
  // 9–13F 保證至少一個罐頭鋪、一個貓窩
  const mid = [9, 10, 11, 12, 13].flatMap((f) => byFloor[f]!);
  if (!mid.some((n) => n.type === '罐頭鋪')) {
    const cands = mid.filter((n) => n.type === '戰鬥'); (cands.length ? rng.pick(cands) : mid[0]!).type = '罐頭鋪';
  }
  if (!mid.some((n) => n.type === '貓窩')) {
    const cands = mid.filter((n) => n.type === '戰鬥' && n.floor !== 13); (cands.length ? rng.pick(cands) : mid[0]!).type = '貓窩';
  }
  // 內容：遭遇與事件
  const eventQueue = rng.shuffle(events.filter((e) => e.fixedFloor === undefined).map((e) => e.id));
  let eventIdx = 0;
  for (const n of nodes) {
    if (n.type === '戰鬥') n.encounterId = rng.pick(encountersOfPool(poolForFloor(n.floor))).id;
    else if (n.type === '大魔物') n.encounterId = rng.pick(encountersOfPool('大魔物')).id;
    else if (n.type === '塔主') n.encounterId = 'tower_master';
    else if (n.type === '事件') {
      if (n.floor === 5) n.eventId = FIXED_EVENT_FLOOR_5;
      else { n.eventId = eventQueue[eventIdx % eventQueue.length]; eventIdx++; }
    }
  }
  // 邊
  for (let f = 1; f < FLOORS; f++) {
    const cur = byFloor[f]!, nxt = byFloor[f + 1]!;
    for (const n of cur) {
      if (nxt.length === 1 || cur.length === 1) n.next = nxt.map((m) => m.id);
      else n.next = nxt.filter((m) => Math.abs(m.lane - n.lane) <= 1).map((m) => m.id);
    }
  }
  return { nodes, start: byFloor[1]!.map((n) => n.id) };
}

export function nodeById(map: GameMap, id: string): MapNode {
  const n = map.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`未知的節點：${id}`);
  return n;
}

export function nodesOnFloor(map: GameMap, floor: number): MapNode[] {
  return map.nodes.filter((n) => n.floor === floor);
}

export function nextChoices(map: GameMap, currentNodeId: string | null): MapNode[] {
  if (currentNodeId === null) return map.start.map((id) => nodeById(map, id));
  return nodeById(map, currentNodeId).next.map((id) => nodeById(map, id));
}

export function validateMap(map: GameMap): string[] {
  const p: string[] = [];
  const top = nodesOnFloor(map, FLOORS);
  if (top.length !== 1 || top[0]?.type !== '塔主' || top[0]?.encounterId !== 'tower_master') p.push('15F 必須是唯一的塔主');
  if (nodesOnFloor(map, 8).map((n) => n.type).join() !== '紙箱') p.push('8F 必須是唯一的紙箱');
  if (nodesOnFloor(map, 14).map((n) => n.type).join() !== '貓窩') p.push('14F 必須是唯一的貓窩');
  if (!nodesOnFloor(map, 1).every((n) => n.type === '戰鬥')) p.push('1F 必須全是戰鬥');
  if (!nodesOnFloor(map, 5).every((n) => n.type === '事件' && n.eventId === FIXED_EVENT_FLOOR_5)) p.push('5F 必須全是大俠傳功');
  if (!nodesOnFloor(map, 7).some((n) => n.type === '大魔物')) p.push('7F 至少一個大魔物');
  for (let f = 1; f <= FLOORS; f++) {
    const row = nodesOnFloor(map, f);
    if (row.length !== (CONVERGED[f] ? 1 : 3)) p.push(`${f}F 節點數錯誤`);
    if (row.filter((n) => n.type === '罐頭鋪').length > 1) p.push(`${f}F 罐頭鋪超過一個`);
    if (row.filter((n) => n.type === '大魔物').length > 1) p.push(`${f}F 大魔物超過一個`);
    if (f === 13 && row.some((n) => n.type === '貓窩')) p.push('13F 不可放貓窩');
    if (f >= 2 && f <= 6 && row.some((n) => n.type === '貓窩' || n.type === '大魔物')) p.push(`${f}F 不該有貓窩或大魔物`);
  }
  const mid = map.nodes.filter((n) => n.floor >= 9 && n.floor <= 13);
  if (!mid.some((n) => n.type === '罐頭鋪')) p.push('9–13F 至少一個罐頭鋪');
  if (!mid.some((n) => n.type === '貓窩')) p.push('9–13F 至少一個貓窩');
  for (const n of map.nodes) {
    if ((n.type === '戰鬥' || n.type === '大魔物' || n.type === '塔主')) {
      const enc = n.encounterId ? encounterById[n.encounterId] : undefined;
      if (!enc) p.push(`${n.id} 缺遭遇`);
      else if (n.type === '戰鬥' && enc.pool !== poolForFloor(n.floor)) p.push(`${n.id} 遭遇池不符`);
      else if (n.type === '大魔物' && enc.pool !== '大魔物') p.push(`${n.id} 應為大魔物池`);
    }
    if (n.type === '事件' && !(n.eventId && eventById[n.eventId])) p.push(`${n.id} 缺事件`);
    if (n.floor < FLOORS && n.next.length === 0) p.push(`${n.id} 沒有下一步`);
    for (const id of n.next) if (nodeById(map, id).floor !== n.floor + 1) p.push(`${n.id} 的邊跨層`);
  }
  // 每個節點都到得了 15F
  const reach = new Set<string>();
  const stack = map.nodes.filter((n) => n.floor === FLOORS).map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!; if (reach.has(id)) continue; reach.add(id);
    for (const m of map.nodes) if (m.next.includes(id)) stack.push(m.id);
  }
  for (const n of map.nodes) if (!reach.has(n.id)) p.push(`${n.id} 到不了 15F`);
  return p;
}
