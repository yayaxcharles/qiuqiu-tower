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

/** 1F 在最底、15F 在最頂：往上捲＝往上爬 */
function floorY(floor: number): number { return PAD + (FLOORS - floor) * SPACING; }

/** 匯合層（8／14／15）只有一個節點、lane 固定是 1，同一條公式就會落在正中間，不用特判 */
function pos(n: MapNode): { x: number; y: number } {
  return { x: 640 + (n.lane - 1) * 220, y: floorY(n.floor) };
}

registerScreen('map', (app, root) => {
  const run = app.run;
  if (!run) { app.show('title'); return; }

  // 底圖固定不跟著捲：整張圖是「下面地牢、上面月夜」的完整構圖，
  // 硬拉成內容那麼高會變形。改成隨捲動微調背景位置，爬高時多露一點天空。
  const bg = el('div', { class: 'map-bg', style: `background-image:url(${artUrl('bg', 'bg/map')})` });
  root.append(bg);

  const inner = el('div', { class: 'map-inner', style: `height:${INNER_H}px` });
  const scroll = el('div', { class: 'map-scroll' }, inner);

  // 路線：一層 SVG 畫線，不吃滑鼠
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-edges');
  svg.setAttribute('viewBox', `0 0 1280 ${INNER_H}`);
  svg.setAttribute('height', String(INNER_H));
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  for (const n of run.map.nodes) {
    const a = pos(n);
    for (const id of n.next) {
      const m = byId.get(id);
      if (!m) continue;
      const b = pos(m);
      // 兩端各縮 R+6：節點是去背圖示、沒有底盤，線若畫到圓心就會從圖示的透明處穿出來。
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const t = (R + 6) / len;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(a.x + dx * t));
      line.setAttribute('y1', String(a.y + dy * t));
      line.setAttribute('x2', String(b.x - dx * t));
      line.setAttribute('y2', String(b.y - dy * t));
      svg.append(line);
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
    const { x, y } = pos(n);
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

  // 打開時捲到「你現在站的那一層」，並讓它落在畫面偏下的位置——接下來要走的路在上方看得見。
  // 開局還沒進塔（currentNode 是 null）就對到 1F，等於捲到最底。
  const here = run.currentNode ? byId.get(run.currentNode)?.floor ?? 1 : 1;
  const want = floorY(here) - VIEW_H * 0.68;
  scroll.scrollTop = Math.max(0, Math.min(INNER_H - VIEW_H, want));

  // 背景微幅反向位移：捲到頂時露出上緣（天空），捲到底時露出下緣（地牢石板）。
  // 幅度就是背景圖蓋滿畫面後多出來的那一點，不會拉伸變形。
  const syncBg = (): void => {
    const max = INNER_H - VIEW_H;
    const p = max > 0 ? scroll.scrollTop / max : 0;
    bg.style.backgroundPosition = `center ${(p * 100).toFixed(1)}%`;
  };
  scroll.addEventListener('scroll', syncBg);
  syncBg();

  renderHud(app, root);
  root.append(el('div', { class: 'map-hint' }, run.currentNode ? '選下一層要去哪' : '從 1F 選一條路進塔'));
});
