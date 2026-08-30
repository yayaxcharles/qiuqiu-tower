import { FLOORS, nextChoices } from '../../engine/map';
import type { MapNode } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { el } from '../dom';
import { renderHud } from '../hud';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON: Record<MapNode['type'], string> = {
  戰鬥: 'icon/node_fight', 大魔物: 'icon/node_elite', 事件: 'icon/node_event',
  罐頭鋪: 'icon/node_shop', 貓窩: 'icon/node_rest', 紙箱: 'icon/node_chest', 塔主: 'icon/node_boss',
};

// 地圖改成「一條往上爬的長捲軸」（類殺戮尖塔），不再把十五層硬塞進一個畫面。
// 一次看得到的高度 = 720 減掉狀態列的 56；捲軸內容比它高，用滑鼠滾輪往上爬。
const VIEW_H = 664;
const SPACING = 108;               // 樓層間距。放得開才不會擠成一團
const PAD = 96;                    // 內容上下的留白，最上與最下那層不會貼著邊
const R = 32;                      // 節點半徑（直徑 64）
const INNER_H = PAD * 2 + (FLOORS - 1) * SPACING;

/** 1F 在最底、15F 在最頂：往上捲＝往上爬。樓層標籤用這個「名目高度」，節點會再各自偏一點 */
function floorY(floor: number): number { return PAD + (FLOORS - floor) * SPACING; }

/**
 * 由字串算出 0～1 的定值（FNV-1a）。用它來決定節點要偏多少、路徑要彎多少。
 * 關鍵是**同一組種子永遠算出同一張地圖**——種子是這款遊戲的功能之一，不能用 Math.random。
 */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100003) / 100003;
}

const JITTER_X = 26;   // 左右最多偏這麼多（車道間距 150、節點 64，偏 26 相鄰兩格最近仍留 34）
const JITTER_Y = 18;   // 上下最多偏這麼多（樓層間距 108、節點 64，最壞情況還留 8 像素）

/**
 * 節點座標。五條車道（引擎的 LANES），中間那條是 2，所以車道 2 落在畫面正中央；
 * 匯合層（8／14／15）的唯一一格 lane 就是 2，同一條公式算下來就在正中間，不用特判。
 * 每個節點再依種子各自偏一點，免得路線排成整齊的直行、看起來像表格。
 */
const LANE_STEP = 150;

function pos(n: MapNode, seed: string, centre: number): { x: number; y: number } {
  const jx = (hash01(`${seed}|${n.id}|x`) - 0.5) * 2 * JITTER_X;
  const jy = (hash01(`${seed}|${n.id}|y`) - 0.5) * 2 * JITTER_Y;
  return { x: 640 + (n.lane - centre) * LANE_STEP + jx, y: floorY(n.floor) + jy };
}

/**
 * 這張地圖實際用到哪些車道的中心點。
 * 五條車道但只走三條路線，用到的車道常常整片偏一邊；固定以第 2 道置中的話，
 * 另一邊就空出一大塊、樓層標籤也離節點很遠。改成照這一局真正用到的範圍置中。
 */
function centreLane(nodes: readonly MapNode[]): number {
  const lanes = nodes.map((n) => n.lane);
  return (Math.min(...lanes) + Math.max(...lanes)) / 2;
}

registerScreen('map', (app, root) => {
  const run = app.run;
  if (!run) { app.show('title'); return; }

  const centre = centreLane(run.map.nodes);
  const inner = el('div', { class: 'map-inner', style: `height:${INNER_H}px` });
  const scroll = el('div', { class: 'map-scroll' }, inner);

  // 底圖是直式長條圖，尺寸就照捲軸內容做（1280×INNER_H），所以放進捲軸裡跟著捲：
  // 爬到下面是地牢石造、中段木造樓層、爬到頂真的看得到夜空。
  // 第一版用 16:9 的底圖，拉長會變形，只能固定不動再疊一層漸層假裝高度——已經拿掉。
  inner.append(el('div', { class: 'map-bg', style: `background-image:url(${artUrl('bg', 'bg/map_tall')})` }));

  // 路線：每條邊一條 SVG 曲線，控制點往側邊推一點，線就會彎（直線排在一起太像電路圖）。
  // 腳印等一下沿著曲線鋪上去——鋪的時候要量曲線長度，所以得等 SVG 進到文件裡才做。
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-edges');
  svg.setAttribute('viewBox', `0 0 1280 ${INNER_H}`);
  svg.setAttribute('height', String(INNER_H));
  const paths: SVGPathElement[] = [];
  for (const n of run.map.nodes) {
    const a = pos(n, run.seed, centre);
    for (const id of n.next) {
      const m = byId.get(id);
      if (!m) continue;
      const b = pos(m, run.seed, centre);
      const dx = b.x - a.x, dy = b.y - a.y;
      const full = Math.hypot(dx, dy) || 1;
      // 兩端各讓開 R+6：節點是去背圖示、沒有底盤，線畫到圓心就會從圖示的透明處穿出來
      const t = (R + 6) / full;
      const p0 = { x: a.x + dx * t, y: a.y + dy * t };
      const p1 = { x: b.x - dx * t, y: b.y - dy * t };
      // 控制點放中點、再沿著法線推開；推多少與往哪邊由種子決定，同一張地圖每次都一樣。
      // 彎曲量要跟著邊長縮放：同車道直上直下那種短邊（扣掉兩端讓位只剩四十幾像素）
      // 若照對角線的幅度去彎，會彎成一個小勾勾。
      const span = Math.max(1, full - 2 * (R + 6));
      const bend = (hash01(`${run.seed}|${n.id}>${id}`) - 0.5) * 2 * Math.min(30, span * 0.14);
      const cx = (p0.x + p1.x) / 2 - (dy / full) * bend;
      const cy = (p0.y + p1.y) / 2 + (dx / full) * bend;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M ${p0.x} ${p0.y} Q ${cx} ${cy} ${p1.x} ${p1.y}`);
      svg.append(path);
      paths.push(path);
    }
  }
  inner.append(svg);

  // 樓層標
  for (let f = 1; f <= FLOORS; f++) {
    inner.append(el('div', { class: 'map-floor-label', style: `top:${floorY(f) - 12}px` }, `${f}F`));
  }

  // 可走的下一步：開局 currentNode 是 null，nextChoices 會回 1F 的三個節點
  const choices = new Set(nextChoices(run.map, run.currentNode).map((n) => n.id));
  for (const n of run.map.nodes) {
    const { x, y } = pos(n, run.seed, centre);
    const cls = ['map-node', `t-${n.type}`];
    if (n.id === run.currentNode) cls.push('current');
    if (choices.has(n.id)) cls.push('choice');
    if (n.floor < run.floor) cls.push('past');
    const btn = el('button', {
      class: cls.join(' '),
      style: `left:${x - R}px;top:${y - R}px`,
      title: `${n.floor}F ${n.type}${n.encounterId ? '：' + app.nodeTitle(n.id) : ''}`,
    }, el('img', { src: artUrl('icons', ICON[n.type]), alt: n.type, draggable: 'false' }));
    // 地圖不存檔：進節點只呼叫 enterNode，存檔要等該節點結算完（見 app.ts 的 save() 註解）
    if (choices.has(n.id)) btn.addEventListener('click', () => app.enterNode(n.id));
    inner.append(btn);
  }

  root.append(scroll);

  // 腳印沿著曲線鋪。要用 getPointAtLength 量位置與切線，路徑得先在文件裡才量得到，
  // 所以排在 append 之後。每隻腳印各自轉到那一點的切線方向，看起來才像沿著路走。
  const pawUrl = artUrl('icons', 'icon/paw');
  if (!pawUrl.startsWith('data:')) {
    for (const path of paths) {
      const len = path.getTotalLength();
      const step = 46;
      const count = Math.max(1, Math.round(len / step));
      for (let i = 0; i < count; i++) {
        const d = ((i + 0.5) / count) * len;
        const pt = path.getPointAtLength(d);
        const nx = path.getPointAtLength(Math.min(len, d + 1));
        const deg = Math.atan2(nx.y - pt.y, nx.x - pt.x) * 180 / Math.PI;
        const img = document.createElementNS(SVG_NS, 'image');
        img.setAttribute('href', pawUrl);
        img.setAttribute('width', '21');
        img.setAttribute('height', '21');
        img.setAttribute('x', String(pt.x - 10.5));
        img.setAttribute('y', String(pt.y - 10.5));
        img.setAttribute('transform', `rotate(${deg.toFixed(1)} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
        img.setAttribute('class', 'map-paw');
        svg.append(img);
      }
    }
  }

  // 打開時捲到「你現在站的那一層」，並讓它落在畫面偏下的位置——接下來要走的路在上方看得見。
  // 開局還沒進塔（currentNode 是 null）就對到 1F，等於捲到最底。
  const here = run.currentNode ? byId.get(run.currentNode)?.floor ?? 1 : 1;
  const want = floorY(here) - VIEW_H * 0.68;
  scroll.scrollTop = Math.max(0, Math.min(INNER_H - VIEW_H, want));

  renderHud(app, root);
  root.append(el('div', { class: 'map-hint' }, run.currentNode ? '選下一層要去哪' : '從 1F 選一條路進塔'));
});
