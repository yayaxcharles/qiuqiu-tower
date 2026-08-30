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
const R = 23;   // 節點半徑（直徑 46）

// 樓層間距 43：十五層要塞進狀態列（高 56）到畫面底之間，又要讓 46 像素的圖示不互相疊到。
// 1F 放 690、15F 就落在 88，圖示上緣 65，離狀態列還有 9 像素。
function floorY(floor: number): number { return 690 - (floor - 1) * 43; }

/** 匯合層（8／14／15）只有一個節點、lane 固定是 1，同一條公式就會落在正中間，不用特判 */
function pos(n: MapNode): { x: number; y: number } {
  return { x: 640 + (n.lane - 1) * 220, y: floorY(n.floor) };
}

registerScreen('map', (app, root) => {
  const run = app.run;
  if (!run) { app.show('title'); return; }
  root.append(el('div', { class: 'map-bg', style: `background-image:url(${artUrl('bg', 'bg/map')})` }));

  // 路線：一層 SVG 畫線，不吃滑鼠
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-edges');
  svg.setAttribute('viewBox', '0 0 1280 720');
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  for (const n of run.map.nodes) {
    const a = pos(n);
    for (const id of n.next) {
      const m = byId.get(id);
      if (!m) continue;
      const b = pos(m);
      // 兩端各縮 R+4：節點是去背圖示、沒有底盤，線若畫到圓心就會從圖示的透明處穿出來。
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const t = (R + 4) / len;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(a.x + dx * t));
      line.setAttribute('y1', String(a.y + dy * t));
      line.setAttribute('x2', String(b.x - dx * t));
      line.setAttribute('y2', String(b.y - dy * t));
      svg.append(line);
    }
  }
  root.append(svg);

  // 樓層標
  for (let f = 1; f <= FLOORS; f++) {
    root.append(el('div', { class: 'map-floor-label', style: `top:${floorY(f) - 11}px` }, `${f}F`));
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
    root.append(btn);
  }

  renderHud(app, root);
  root.append(el('div', { class: 'map-hint' }, run.currentNode ? '選下一層要去哪' : '從 1F 選一條路進塔'));
});
