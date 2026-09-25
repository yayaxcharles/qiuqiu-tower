import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import COMBAT from '../../src/ui/screens/combat.ts?raw';
import MAP from '../../src/ui/screens/map.ts?raw';
import APP from '../../src/ui/app.ts?raw';
import DRAG from '../../src/ui/dragplay.ts?raw';

/*
 * 流暢度四件（2026-09-25 流暢度盤點，使用者：「打磨劇情、流暢度」）。畫面層不能用 DOM 測（雲端沒有 happy-dom），
 * 照慣例讀原始碼釘住；實際時間是本機無頭瀏覽器量的：按結束回合到第一張牌點得動，一隻黃瓜怪 2.08→1.33 秒、三隻老鼠 3.53→2.78 秒。
 */
const lf = (s: string): string => s.replace(/\r\n/g, '\n');
// 樣式表用 readFileSync 讀（`.css?raw` 在測試裡會被樣式外掛吃成空字串，同 layout5_0924）
const COMBAT_CSS = readFileSync('src/ui/styles/combat.css', 'utf8');
const PHONE_CSS = readFileSync('src/ui/styles/phone.css', 'utf8');
const MAP_CSS = readFileSync('src/ui/styles/map.css', 'utf8');

describe('一、魔物回合收尾不空等', () => {
  const src = lf(COMBAT);
  it('最後一隻出完手只留 0.56 秒看結果（夠靜態前撲 0.52 秒演完），不再多等下一隻預告', () => {
    expect(src).toContain('const last = !(cs.enemyQueue?.length);');
    expect(src).toContain("const gap = cs.phase !== 'player' ? 400 : last ? 560 : 720;");
    expect(src).toContain("if (cs.phase === 'player' && !last) {");
  });
  it('逐隻演完的收尾，新手牌只等 0.15 秒；其他發牌照舊 0.46 秒', () => {
    expect(src).toContain('settle(b, { deal: true, dealDelay: 150 });');
    expect(src).toContain("dealDelay = opts.deal && cs.phase === 'player' ? (opts.dealDelay ?? 460) : 0;");
  });
  it('發牌飛行 0.32 秒，程式的 DEAL_FLY 跟樣式的 card-deal 一樣長（不一樣的話解鎖時間會對不上）', () => {
    const fly = Number(/const DEAL_FLY = (\d+);/.exec(src)?.[1]);
    const css = /card-deal \.(\d+)s/.exec(lf(COMBAT_CSS))?.[1];
    expect(fly).toBe(320);
    expect(Math.round(Number(`0.${css}`) * 1000)).toBe(fly);
  });
});

describe('二、拖出去打不再「彈回手上再飛出去」', () => {
  const drag = lf(DRAG), src = lf(COMBAT);
  it('清掉拖曳位移之前先記下牌的位置，打出去時交給 onPlay', () => {
    const at = drag.indexOf('const dropped = node.getBoundingClientRect();');
    expect(at).toBeGreaterThan(0);
    expect(drag.indexOf('reset();', at)).toBeGreaterThan(at);
    expect(drag).toContain("if (act.kind === 'play') hooks.onPlay(act.targetUid, dropped);");
  });
  it('飛的那張從放手處起飛、手上那張先藏起來；反悔時滑回去（不是一格跳回）', () => {
    expect(src).toContain('const r = dropped ?? from.getBoundingClientRect();');
    // 推前審查 2026-09-25 高：分身不能帶著 hidden 飛（原本先藏再複製，整段飛行看不見；舊測試把錯的順序釘成綠燈）
    const fly = src.slice(src.indexOf('function flyCard('), src.indexOf('function play('));
    expect(fly).not.toContain("from.style.visibility = 'hidden'");
    expect(fly.indexOf("ghost.style.visibility = '';")).toBeGreaterThan(fly.indexOf('from.cloneNode(true)'));
    // 路上那張：重畫手牌時藏起來，回來／被退回／保險絲都會清掉
    expect(src).toContain("if (c.uid === travelingUid) node.style.visibility = 'hidden';");
    expect(src).toMatch(/function unlockSend\(\): void \{\n\s*inflight = false;\n\s*travelingUid = null;/);
    expect(src).toContain('play(c.uid, targetUid, dropped)');
    expect(drag).toMatch(/node\.animate\(\[\{ translate: held \}, \{ translate: '0px 0px' \}\]/);
  });
});

describe('三、手機橫拿時狀態牌子多的時候字看得到', () => {
  it('手機專用規則蓋過電腦版的 11 像素（實際約 8 像素，原本約 6）', () => {
    const m = /html\[data-device="phone"\]\[data-orient="landscape"\] \.combat \.unit\.player \.chips\.many \.chip \{ font-size: (\d+)px;/.exec(lf(PHONE_CSS));
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(14);
  });
});

describe('四、地圖點格子當下就有反應', () => {
  it('點了就亮起來；按著縮一點', () => {
    // 連線要過了「投過票就不能改」的防呆才亮（推前審查 中）
    const click = lf(MAP).slice(lf(MAP).indexOf("play('step');"));
    expect(click.indexOf("if (votes[app.seat]) return;")).toBeLessThan(click.lastIndexOf("btn.classList.add('picked');"));
    expect(click).toContain("if (!app.coop) { btn.classList.add('picked'); app.enterNode(n.id); return; }");
    expect(lf(MAP_CSS)).toContain('.map-node.choice.picked {');
    expect(lf(MAP_CSS)).toContain('.map-node.choice:active { scale: .92; }');
  });
  it('進戰鬥等超過 0.4 秒就提示一行（比照事件格）', () => {
    const start = lf(APP).slice(lf(APP).indexOf('startFight(encounterId: string'));
    expect(start).toContain("if (hint) hint.textContent = '正在準備戰鬥……';");
    expect(start).toContain('window.clearTimeout(slow);');
  });
});
