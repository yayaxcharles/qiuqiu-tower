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
// 5F 也是匯合層：大俠傳功是固定劇情，之前整層都放同一個事件，
// 畫面上三顆毛線球看起來是分岔、其實選哪顆都一樣（使用者附截圖抓到的假分岔）
const CONVERGED: Record<number, NodeType> = { 5: '事件', 8: '紙箱', 14: '貓窩', 15: '塔主' };

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
  // 二、三關都給四層「該關中池」緩衝再進強池；池內容依 acts 標籤換成該關專屬怪
  if (act >= 2) return floor <= 4 ? '中' : '強';
  // 弱怪陪到 5F：實測 300 局最常死在 6～7F——弱換中的斷層太早，
  // 牌組才十二三張就撞上 36～52 血的中型怪
  return floor <= 5 ? '弱' : floor <= 10 ? '中' : '強';
}

function roll(rng: Rng, table: [NodeType, number][]): NodeType {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [t, w] of table) { r -= w; if (r < 0) return t; }
  return table[table.length - 1]![0];
}

/**
 * 各層抽節點型別的權重表，**依關數不同**。
 *
 * 第一關的 2～7F 戰鬥比重比較高：牌組要靠戰鬥獎勵長大，事件與商店太密會
 * 「牌還沒湊好就一直逛街」。9–13F 三關一律同一張表（含大魔物）。
 *
 * 2026-09-03 菁英擴充：第一關也開放大魔物，規則跟第二、三關一模一樣。
 * 以前不開是因為當時的菁英只有一批「照牌組已經成形」設計的（使用者實玩：「菁英怪太強」）；
 * 現在第一關有自己的三隻（山豬頭目、紙老虎、太鼓狸，血 72～84、單一機制），強度對得上初期牌組。
 */
function tableFor(floor: number, act: number, eliteMul = 1): [NodeType, number][] {
  if (act <= 1) {
    if (floor >= 2 && floor <= 4) return [['戰鬥', 70], ['事件', 22], ['罐頭鋪', 8]];
    if (floor === 6) return [['戰鬥', 62], ['事件', 26], ['罐頭鋪', 12]];
    if (floor === 7) return [['戰鬥', 68], ['事件', 32]];
  } else {
    if (floor >= 2 && floor <= 4) return [['戰鬥', 60], ['事件', 30], ['罐頭鋪', 10]];
    if (floor === 6) return [['戰鬥', 50], ['事件', 35], ['罐頭鋪', 15]];
    if (floor === 7) return [['戰鬥', 60], ['事件', 40]];
  }
  return [['戰鬥', 45], ['事件', 25], ['罐頭鋪', 10], ['貓窩', 10], ['大魔物', Math.round(10 * eliteMul)]];   // 9–13
}

export interface MapOpts {
  /** 大魔物節點的權重倍率（難度 2 起 1.6）：>1 時二、三關每關最多兩個、第一關也開放一個 */
  eliteMul?: number;
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
  const eliteMul = opts.eliteMul ?? 1;
  const eliteCap = eliteMul > 1 ? 2 : 1;   // 難度 2 起每一層可以兩個大魔物（2026-09-03 起三關都適用）
  for (let f = 2; f <= 13; f++) {
    if (CONVERGED[f]) continue;
    const row = byFloor[f]!;
    let shops = 0, elites = 0;
    for (const n of row) {
      let t = roll(rng, tableFor(f, act, eliteMul));
      if (t === '罐頭鋪' && shops >= 1) t = '戰鬥';
      if (t === '大魔物' && elites >= eliteCap) t = '戰鬥';
      if (t === '貓窩' && f === 13) t = '戰鬥';
      if (t === '罐頭鋪') shops++;
      if (t === '大魔物') elites++;
      n.type = t;
    }
    // 整關至少一個大魔物：7F 沒抽到就直接放一個（2026-09-03 起第一關也照這條，見 tableFor）
    if (f === 7 && elites === 0) rng.pick(row).type = '大魔物';
    // 難度 2 起（eliteMul > 1）11F 再保證一個：只靠權重抽，整關平均只多兩成，湊不到「多六成」
    if (eliteMul > 1 && f === 11 && elites === 0) rng.pick(row).type = '大魔物';
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
  // 同一個分岔出去的路，不可以是同一種非戰鬥節點。
  // 兩條都是事件（或都是貓窩）的分岔等於沒得選，走哪邊都一樣——分岔的意義就是選擇。
  // 撞到就把多的那條改成戰鬥；戰鬥本來就是預設的填充節點，重複沒關係（遭遇還會不一樣）。
  // 5F 不動（整層都是大俠傳功的固定事件，那是刻意的劇情層）；匯合層是單格，撞不到。
  // 排在保底之後：保底可能把戰鬥改成貓窩，反而製造出重複的分岔，先保底再查重。
  // 罐頭鋪與大魔物每層最多一個（擲型別時就擋了），不會在這裡撞到。
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (n.next.length < 2) continue;
    const seen = new Set<NodeType>();
    for (const id of n.next) {
      const kid = byId.get(id);
      if (!kid || CONVERGED[kid.floor] || kid.type === '戰鬥') continue;
      if (seen.has(kid.type)) kid.type = '戰鬥';
      else seen.add(kid.type);
    }
  }
  // 直向也查：下一層不能跟上一層同一種非戰鬥節點——
  // 一條路連吃兩三層事件跟連抽兩間店一樣無聊（使用者截圖：4F 事件→5F 事件→6F 事件）。
  // 匯合層是固定的不動；被改成戰鬥的節點之後照常抽遭遇。
  for (const n of nodes) {
    for (const id of n.next) {
      const kid = byId.get(id);
      if (!kid || CONVERGED[kid.floor] || kid.type === '戰鬥') continue;
      if (kid.type === n.type) kid.type = '戰鬥';
    }
  }

  // 內容：遭遇與事件
  const eventQueue = rng.shuffle(events.filter((e) => e.fixedFloor === undefined).map((e) => e.id));
  let eventIdx = 0;
  // 遭遇也排成洗好的佇列、一池一條：整關抽完一輪才會重複（本來每格獨立亂抽，塔頂強池只有三組，
  // 九場架平均每組遇三次；使用者：「怎麼一直遇到重複的」）。佇列用完就重洗再來一輪。
  const encQueues = new Map<string, { list: string[]; at: number }>();
  const nextEncounter = (key: string, ids: string[]): string => {
    let q = encQueues.get(key);
    if (!q || q.at >= q.list.length) {
      const list = rng.shuffle(ids);
      // 重洗的第一個不能跟上一輪最後一個一樣，不然銜接處還是會連兩場同一組
      const last = q?.list[q.list.length - 1];
      if (list.length > 1 && list[0] === last) { const j = 1 + Math.floor(rng.next() * (list.length - 1)); [list[0], list[j]] = [list[j]!, list[0]!]; }
      q = { list, at: 0 };
      encQueues.set(key, q);
    }
    return q.list[q.at++]!;
  };
  for (const n of nodes) {
    if (n.type === '戰鬥') {
      let pool = encountersOfPool(poolForFloor(n.floor, act), act);
      // 第一關前三層只抽單隻怪：牌組還是初始十張，兩隻一起上打不動
      // （實測 200 張圖，前三層 45% 的戰鬥是多隻）。4F 起照常。
      if (act <= 1 && n.floor <= 3) {
        const solo = pool.filter((enc) => enc.enemies.length === 1);
        if (solo.length) pool = solo;
      }
      n.encounterId = nextEncounter(`${poolForFloor(n.floor, act)}:${pool.length}`, pool.map((e) => e.id));
    }
    else if (n.type === '大魔物') {
      // 三關各有自己的菁英池（2026-09-03 起第一關也有三隻）；萬一某關的池是空的就退回塔中的
      const pool = encountersOfPool('大魔物', act);
      n.encounterId = rng.pick(pool.length ? pool : encountersOfPool('大魔物', 2)).id;
    }
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

export function validateMap(map: GameMap, act = 1): string[] {
  const p: string[] = [];
  const top = nodesOnFloor(map, FLOORS);
  const bossIds = new Set(encountersOfPool('塔主').map((e) => e.id));
  if (top.length !== 1 || top[0]?.type !== '塔主' || !bossIds.has(top[0]?.encounterId ?? '')) p.push('15F 必須是唯一的塔主');
  if (nodesOnFloor(map, 8).map((n) => n.type).join() !== '紙箱') p.push('8F 必須是唯一的紙箱');
  if (nodesOnFloor(map, 14).map((n) => n.type).join() !== '貓窩') p.push('14F 必須是唯一的貓窩');
  if (!nodesOnFloor(map, 1).every((n) => n.type === '戰鬥')) p.push('1F 必須全是戰鬥');
  const f5 = nodesOnFloor(map, 5);
  if (f5.length !== 1 || !f5.every((n) => n.type === '事件' && n.eventId === FIXED_EVENT_FLOOR_5)) p.push('5F 必須是唯一的大俠傳功');
  // 7F 的精英保底三關都適用（2026-09-03 起第一關也開放菁英），驗證函式不必再分關數
  if (!nodesOnFloor(map, 7).some((n) => n.type === '大魔物')) p.push('7F 必須有一個大魔物');

  for (let f = 1; f <= FLOORS; f++) {
    const row = nodesOnFloor(map, f);
    // 非匯合層的格數由路線決定（1～PATHS 都合法），只要不是空的、也沒超過路線數就行
    if (CONVERGED[f] ? row.length !== 1 : row.length < 1 || row.length > PATHS) p.push(`${f}F 節點數錯誤`);
    if (row.filter((n) => n.type === '罐頭鋪').length > 1) p.push(`${f}F 罐頭鋪超過一個`);
    // 難度 2 起（eliteMul > 1）同一層允許兩個大魔物——見 generateMap 的 eliteCap。
    // 本來這裡寫死「超過一個就是錯」，跟產生器不一致：難度 2 的圖每 200 張約有 10 張被誤判成壞圖
    // （2026-09-03 菁英擴充時量到的；當時還沒有任何測試拿難度 2 的圖來驗，所以一直沒被抓到）
    if (row.filter((n) => n.type === '大魔物').length > 2) p.push(`${f}F 大魔物超過兩個`);
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
      else if (n.type === '戰鬥' && enc.pool !== poolForFloor(n.floor, act)) p.push(`${n.id} 遭遇池不符`);
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
