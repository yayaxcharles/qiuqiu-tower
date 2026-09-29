#!/usr/bin/env node
/*
 * 主角動作實戰錄影（2026-09-29，使用者：「封封的不太流暢」）：無頭 Chrome、只開本機網址、不跳視窗。
 * 固定手牌打一輪、結束回合讓魔物打回來（受傷／格擋），CDP 螢幕擷取逐格存 jpg＋時間戳，另記每次出牌的時間點。
 * 之後用 scratchpad 的分析腳本找「畫面突然跳一下」的格。
 *
 *   npm run build && node tools/perf/motion_record.mjs <輸出夾> <角色> <牌,牌,…>[;<牌,…>]
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen, realClick, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? 'tmp-motion');
const HERO = process.argv[3] ?? 'fengfeng';
const HANDS = (process.argv[4] ?? 'fengfeng_pingzhan,fengfeng_tanbu,fengfeng_hengsao,fengfeng_tabu,fengfeng_hushen').split(';').map((h) => h.split(','));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
const CAN_ACT = () => { const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false; const b = document.querySelector('.end-turn'); return !!b && !b.disabled && !document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay') && !document.querySelector('.hand .card.flying'); };
const log = [];
let n = 0;
for (let hi = 0; hi < HANDS.length; hi++) {
  const hand = HANDS[hi];
  const c = await newContext('motion', `${HERO}-${hi}`);
  const { page } = c;
  await bootRun(page, server.url, HERO, `motion-${HERO}`);
  await page.evaluate(({ hand }) => {
    const app = window.__app; const orig = app.show.bind(app); let done = false;
    app.show = (nm, ...r) => {
      if (nm === 'combat' && app.cs && !done) {
        done = true; const p = app.cs.players[0]; let u = 88001;
        p.hand.splice(0, p.hand.length, ...hand.map((id) => ({ uid: u++, cardId: id, upgraded: false })));
        p.drawPile.splice(0, p.drawPile.length, ...hand.map((id) => ({ uid: u++, cardId: id, upgraded: false })));
        p.energy = 9; for (const e of app.cs.enemies) { e.maxHp *= 10; e.hp = e.maxHp; }
      }
      return orig(nm, ...r);
    };
    const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true;
    app.startFight('cucumber_yarn');
  }, { hand });
  await waitScreen(page, 'combat', 60000);
  await page.waitForFunction(CAN_ACT, null, { timeout: 60000 });
  await sleep(2500);
  await page.mouse.move(640, 60);
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async (f) => {
    const file = `f${String(n++).padStart(5, '0')}.jpg`;
    writeFileSync(join(OUT, file), Buffer.from(f.data, 'base64'));
    log.push({ file, t: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* */ }
  });
  const mark = async (what) => log.push({ event: what, t: await page.evaluate(() => Date.now() / 1000) });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  await sleep(2000);
  await mark('待機結束');
  for (const id of hand) {
    await page.evaluate(() => { window.__app.cs.players[0].energy = 9; });
    const pt = await page.evaluate(({ id, POINT_FN }) => {
      const f = eval(POINT_FN); const p = window.__app.cs.players[0];
      const card = p.hand.find((x) => x.cardId === id); if (!card) return null;
      const node = document.querySelector(`.hand .card[data-uid="${card.uid}"]`); return node ? f(node) : null;
    }, { id, POINT_FN });
    if (!pt) { await mark('找不到 ' + id); continue; }
    await page.mouse.move(pt.x, pt.y, { steps: 4 }); await sleep(150);
    await mark('出 ' + id);
    await page.mouse.click(pt.x, pt.y); await sleep(150);
    if (await page.evaluate(() => !!document.querySelector('.target-catcher'))) {
      const tp = await page.evaluate(({ POINT_FN }) => { const f = eval(POINT_FN); const e = window.__app.cs.enemies.find((x) => !x.dead); const node = document.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite-box`) || document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`); return node ? f(node) : null; }, { POINT_FN });
      if (tp) { await page.mouse.move(tp.x, tp.y, { steps: 5 }); await page.mouse.click(tp.x, tp.y); }
    }
    await page.mouse.move(640, 60, { steps: 3 });
    await sleep(1600);
    await page.waitForFunction(CAN_ACT, null, { timeout: 20000 }).catch(() => {});
    await sleep(400);
  }
  await mark('結束回合');
  await realClick(page, '.end-turn');
  await sleep(4500);
  await page.waitForFunction(CAN_ACT, null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await mark('錄完');
  await cdp.send('Page.stopScreencast').catch(() => {});
  await sleep(300);
  await c.close();
}
writeFileSync(join(OUT, 'log.json'), JSON.stringify(log));
server.close?.();
console.log('格數', n);
process.exit(0);
