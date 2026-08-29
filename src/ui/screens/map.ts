import { FLOORS, nextChoices } from '../../engine/map';
import type { MapNode } from '../../engine/types';
import { registerScreen } from '../app';
import { el } from '../dom';
import { renderHud } from '../hud';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GLYPH: Record<MapNode['type'], string> = {
  戰鬥: '戰', 大魔物: '魔', 事件: '？', 罐頭鋪: '鋪', 貓窩: '窩', 紙箱: '箱', 塔主: '主',
};
const R = 17;   // 節點半徑（直徑 34）

function floorY(floor: number): number { return 690 - (floor - 1) * 42; }

/** 匯合層（8／14／15）只有一個節點、lane 固定是 1，同一條公式就會落在正中間，不用特判 */
function pos(n: MapNode): { x: number; y: number } {
  return { x: 640 + (n.lane - 1) * 220, y: floorY(n.floor) };
}

registerScreen('map', (app, root) => {
  const run = app.run;
  if (!run) { app.show('title'); return; }
  root.append(el('div', { class: 'map-bg' }));

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
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
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
    }, GLYPH[n.type]);
    // 地圖不存檔：進節點只呼叫 enterNode，存檔要等該節點結算完（見 app.ts 的 save() 註解）
    if (choices.has(n.id)) btn.addEventListener('click', () => app.enterNode(n.id));
    root.append(btn);
  }

  renderHud(app, root);
  root.append(el('div', { class: 'map-hint' }, run.currentNode ? '選下一層要去哪' : '從 1F 選一條路進塔'));
});
