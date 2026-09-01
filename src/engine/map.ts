import { encounterById, encountersOfPool } from '../content/enemies';
import { FIXED_EVENT_FLOOR_5, eventById, events } from '../content/events';
import type { Rng } from './rng';
import type { GameMap, MapNode, NodeType } from './types';

export const FLOORS = 15;
/**
 * 五條車道、三條路線（類殺戮尖塔）。
 *
 * 舊版是「每層固定三格、排成整齊的三行」，看起來像表格而不是一座塔。
 * 改成先走出三條由下往上的路線，**只有路線經過的格子才生節點**——
 * 於是每層會有 1～3 格、落在五個位置中的哪幾個都不一定，很多格子是空的。
 * 開局仍是三選一（三條路線的起點各不相同），這點沒變。
 */
const LANES = 5;
const PATHS = 3;
const CONVERGED: Record<number, NodeType> = { 8: '紙箱', 14: '貓窩', 15: '塔主' };

/** 這一層有哪些車道可以站：匯合層只有正中間那格 */
function lanesOn(floor: number): number[] {
  if (CONVERGED[floor]) return [(LANES - 1) / 2];
  return Array.from({ length: LANES }, (_, i) => i);
}

/**
 * 走出 PATHS 條路線，回傳「每條路線在每一層站哪個車道」。
 *
 * 每條路線每一層只能往左右移動一格（或原地），**路線之間允許重疊**——重疊的那一層
 * 就只生一個節點，於是有些樓層只有一格、有些兩格、有些三格，位置也各不相同。
 * 這正是要的效果；一開始加了「優先挑沒人佔的車道」，結果三條路線永遠不相遇，
 * 每層還是滿滿三格，跟舊版沒兩樣。
 * 起點強制三條不同（開局仍是三選一）。匯合層強制走中間；剛離開匯合層時放行到
 * 任何車道，讓那一格往外散開。
 */
function walkPaths(rng: Rng): number[][] {
  // 起點固定由左到右排好，之後每一層都維持這個左右順序（見下面的不交叉規則）
  const starts = rng.shuffle(lanesOn(1)).slice(0, PATHS).sort((a, b) => a - b);
  const lanes: number[][] = starts.map((l) => [l]);
  for (let f = 2; f <= FLOORS; f++) {
    const allowed = lanesOn(f);
    const fromConverged = CONVERGED[f - 1] !== undefined;
    // **不交叉**：左邊的路線永遠不能跑到右邊路線的右邊。
    // 兩條路線會交叉，就是因為這一層互換了左右位置（A 往右、B 往左）；
    // 只要規定「這一層選的車道不能小於左邊那條剛選的」，順序就永遠保持住，線也就不會打架。
    // 允許相等（併成同一格）——那是設計要的疏密變化，不是交叉。
    let floor = Math.min(...allowed);
    for (let p = 0; p < PATHS; p++) {
      const cur = lanes[p]![f - 2]!;
      const near = allowed.filter((l) => fromConverged || Math.abs(l - cur) <= 1);
      const ok = near.filter((l) => l >= floor);
      const pool = ok.length ? ok : near.filter((l) => l >= Math.min(...near));
      const chosen = pool.length ? rng.pick(pool) : (near[near.length - 1] ?? allowed[0]!);
      lanes[p]!.push(chosen);
      floor = chosen;
    }
  }
  return lanes;
}

/**
 * 這一層抽哪個強度的遭遇池。`floor` 是**關內**樓層（1～15）。
 * 第二、三關還沒有專屬魔物（立繪要另外生），骨架先把現有的池子整段往上移：
 * 第二關開場就是中等、第三關全程都是強的。之後做了新魔物再把這裡換成各關自己的池。
 */
export function poolForFloor(floor: number, act = 1): '弱' | '中' | '強' {
  if (act >= 3) return '強';
  if (act === 2) return floor <= 4 ? '中' : '強';
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

export interface MapOpts {
  /** 第幾關：決定遭遇池的強度（見 poolForFloor）。 */
  act?: number;
  /** 這一關的關主候選（遭遇 id）。不給就整個塔主池隨機——關主的分配規則在 run.ts。 */
  bossIds?: string[];
}

export function generateMap(rng: Rng, opts: MapOpts = {}): GameMap {
  const act = opts.act ?? 1;
  // 先走路線，再把「路線踩過的格子」變成節點：沒被踩到的格子就是空的
  const paths = walkPaths(rng);
  const cells = new Map<string, MapNode>();
  const byFloor: MapNode[][] = [];
  for (let f = 1; f <= FLOORS; f++) byFloor[f] = [];
  for (const lane of paths) {
    for (let f = 1; f <= FLOORS; f++) {
      const l = lane[f - 1]!;
      const key = `${f}:${l}`;
      if (cells.has(key)) continue;
      const node: MapNode = { id: `f${f}-l${l}`, floor: f, lane: l, type: CONVERGED[f] ?? '戰鬥', next: [] };
      cells.set(key, node);
      byFloor[f]!.push(node);
    }
  }
  for (let f = 1; f <= FLOORS; f++) byFloor[f]!.sort((a, b) => a.lane - b.lane);
  const nodes: MapNode[] = [];
  for (let f = 1; f <= FLOORS; f++) nodes.push(...byFloor[f]!);
  // 邊就是路線的每一步；同一步可能被多條路線走過，去重
  for (const lane of paths) {
    for (let f = 1; f < FLOORS; f++) {
      const a = cells.get(`${f}:${lane[f - 1]!}`)!;
      const bId = `f${f + 1}-l${lane[f]!}`;
      if (!a.next.includes(bId)) a.next.push(bId);
    }
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
    const cands = mid.filter((n) => n.type === '戰鬥' && n.floor !== 13);
    const spare = mid.filter((n) => n.type !== '罐頭鋪' && n.floor !== 13);   // 退路避開剛放上去的罐頭鋪，也避開 13F
    (cands.length ? rng.pick(cands) : spare[0]!).type = '貓窩';
  }
  // 內容：遭遇與事件
  const eventQueue = rng.shuffle(events.filter((e) => e.fixedFloor === undefined).map((e) => e.id));
  let eventIdx = 0;
  for (const n of nodes) {
    if (n.type === '戰鬥') n.encounterId = rng.pick(encountersOfPool(poolForFloor(n.floor, act))).id;
    else if (n.type === '大魔物') n.encounterId = rng.pick(encountersOfPool('大魔物')).id;
    // 塔主：呼叫端會指定這一關的候選（第一、二關不含大俠貓，他是第三關固定的最終頭目）；
    // 沒指定就整池隨機（測試與舊呼叫端用）。
    else if (n.type === '塔主') {
      const pool = encountersOfPool('塔主').filter((e) => !opts.bossIds || opts.bossIds.includes(e.id));
      n.encounterId = rng.pick(pool.length ? pool : encountersOfPool('塔主')).id;
    }
    else if (n.type === '事件') {
      if (n.floor === 5) n.eventId = FIXED_EVENT_FLOOR_5;
      else { n.eventId = eventQueue[eventIdx % eventQueue.length]; eventIdx++; }
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
  const bossIds = new Set(encountersOfPool('塔主').map((e) => e.id));
  if (top.length !== 1 || top[0]?.type !== '塔主' || !bossIds.has(top[0]?.encounterId ?? '')) p.push('15F 必須是唯一的塔主');
  if (nodesOnFloor(map, 8).map((n) => n.type).join() !== '紙箱') p.push('8F 必須是唯一的紙箱');
  if (nodesOnFloor(map, 14).map((n) => n.type).join() !== '貓窩') p.push('14F 必須是唯一的貓窩');
  if (!nodesOnFloor(map, 1).every((n) => n.type === '戰鬥')) p.push('1F 必須全是戰鬥');
  if (!nodesOnFloor(map, 5).every((n) => n.type === '事件' && n.eventId === FIXED_EVENT_FLOOR_5)) p.push('5F 必須全是大俠傳功');
  if (!nodesOnFloor(map, 7).some((n) => n.type === '大魔物')) p.push('7F 至少一個大魔物');
  for (let f = 1; f <= FLOORS; f++) {
    const row = nodesOnFloor(map, f);
    // 非匯合層的格數由路線決定（1～PATHS 都合法），只要不是空的、也沒超過路線數就行
    if (CONVERGED[f] ? row.length !== 1 : row.length < 1 || row.length > PATHS) p.push(`${f}F 節點數錯誤`);
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
  // 反過來也要成立：孤島節點畫得出來卻走不到，玩家會看到一個永遠點不動的格子
  const from = new Set<string>(map.start);
  for (let f = 1; f < FLOORS; f++) {
    for (const n of map.nodes) if (n.floor === f && from.has(n.id)) for (const id of n.next) from.add(id);
  }
  for (const n of map.nodes) if (!from.has(n.id)) p.push(`${n.id} 從 1F 走不到`);
  return p;
}
