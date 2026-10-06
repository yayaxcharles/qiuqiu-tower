// 把爪破魔塔各畫面截下來看美術：用 9/29 打包好的 dist、本機埠、無頭 Chrome（獨立設定檔），不碰線上網址。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'F:/ClaudeWork/qiuqiu-coop';
const LIB = (f) => pathToFileURL(join(REPO, 'tools/visual-gate/lib', f)).href;
const { startServer } = await import(LIB('server.mjs'));
const { loadPlaywright, newContext, openGame, bootRun, waitScreen, settle, jpg, killOwnChrome } = await import(LIB('browser.mjs'));
await loadPlaywright();
const { sleep } = await import(LIB('util.mjs'));

const OUT = 'C:/Users/yayax/AppData/Local/Temp/claude/C--Users-yayax/7e705c68-70b3-4db4-ad41-f7a1f98c7598/scratchpad/art/shots';
mkdirSync(OUT, { recursive: true });
const SITE = 'qiuqiu-tower';
const srv = await startServer(join(REPO, 'dist'), SITE);
const url = `http://127.0.0.1:${srv.port}/${SITE}/`;
console.log('伺服器', url);

const shot = async (page, name, ms = 600) => { await sleep(ms); await settle(page); await jpg(page, join(OUT, name + '.jpg'), null, 88); console.log('存', name); };
const tag = 'artshots';
let ctx;
try {
  ctx = await newContext(tag, 'a', { viewport: { width: 1280, height: 720 } });
  const page = ctx.page;
  await openGame(page, url);
  if (!process.env.SKIP_DONE) await shot(page, '01_title', 1200);
  await page.evaluate(() => window.__app.show('heroselect'));
  await waitScreen(page, 'heroselect');
  await shot(page, '02_heroselect', 1200);

  for (const hero of ['ninja', 'feifei']) {
    await bootRun(page, url, hero, `art-${hero}`);
    const run = await page.evaluate(() => JSON.stringify({ screen: document.querySelector('#stage').dataset.screen, nodes: window.__app.run.map.nodes.map((n) => ({ id: n.id, type: n.type, floor: n.floor, eventId: n.eventId, encounterId: n.encounterId, next: n.next })) }));
    const info = JSON.parse(run);
    if (info.screen === 'blessing') await shot(page, `03_${hero}_blessing`, 800);
    for (const act of [1, 2, 3]) {
      await page.evaluate((a) => { const r = window.__app.run; r.act = a; r.currentNode = r.map.nodes.find((n) => n.floor === 1)?.id ?? r.currentNode; window.__app.show('map'); }, act);
      await waitScreen(page, 'map');
      await shot(page, `04_${hero}_map_act${act}`, 900);
    }
    if (hero === 'ninja') {
      for (const act of [1, 2, 3]) {
        await page.evaluate((a) => { const r = window.__app.run; r.act = a; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('wood_dummy'); }, act);
        await page.waitForFunction(() => window.__app.cs?.phase === 'player' && !window.__app.cs.enemyActing, null, { timeout: 30000 });
        await shot(page, `05_combat_act${act}`, 1500);
        if (act === 1) {
          await page.evaluate(() => document.querySelector('button.hud-deck')?.click());
          await shot(page, '06_deckview', 900);
          await page.keyboard.press('Escape');
          await sleep(300);
          await page.evaluate(() => { const r = window.__app.run; window.__app.show('reward', { gold: 30, cards: true }); }).catch(() => {});
          await sleep(900);
          await shot(page, '07_reward_try', 400);
        }
      }
      const ev = info.nodes.find((n) => n.type === '事件' && n.eventId);
      const sh = info.nodes.find((n) => n.type === '罐頭鋪');
      await page.evaluate(() => { const r = window.__app.run; r.act = 1; window.__app.show('map'); });
      await waitScreen(page, 'map');
      if (ev) { await page.evaluate((id) => { const r = window.__app.run; const prev = r.map.nodes.find((n) => n.next.includes(id)); if (prev) r.currentNode = prev.id; window.__app.enterNode(id); }, ev.id); await waitScreen(page, 'event', 20000).catch(() => {}); await shot(page, '08_event_' + ev.eventId, 1500); }
      await page.evaluate(() => { window.__app.show('map'); }); await waitScreen(page, 'map');
      if (sh) { await page.evaluate((id) => { const r = window.__app.run; const prev = r.map.nodes.find((n) => n.next.includes(id)); if (prev) r.currentNode = prev.id; window.__app.enterNode(id); }, sh.id); await waitScreen(page, 'shop', 20000).catch(() => {}); await shot(page, '09_shop', 1500); }
      await page.evaluate(() => { window.__app.show('rest'); }); await waitScreen(page, 'rest'); await shot(page, '10_rest', 1200);
      await page.evaluate(() => { window.__app.show('chest'); }); await waitScreen(page, 'chest'); await shot(page, '11_chest', 1200);
      await page.evaluate(() => { const r = window.__app.run; window.__app.show('actclear', { bossRelic: r.players[0].relics[0] ?? null }); }); await waitScreen(page, 'actclear'); await shot(page, '12_actclear', 1200);
      await page.evaluate(() => window.__app.show('debug')); await waitScreen(page, 'debug'); await sleep(800);
      await page.evaluate(() => { for (const b of document.querySelectorAll('.debug-screen button')) if (b.textContent.trim() === '牌') b.click(); });
      await shot(page, '13_debug_cards', 1500);
      await page.evaluate(() => window.scrollBy(0, 700)); await shot(page, '13_debug_cards_2', 500);
      await page.evaluate(() => { for (const b of document.querySelectorAll('.debug-screen button')) if (b.textContent.trim() === '場景') b.click(); });
      await shot(page, '14_debug_scenes', 1500);
    }
  }
} finally {
  await ctx?.close().catch(() => {});
  killOwnChrome(tag);
  await srv.close();
}
console.log('完成');
process.exit(0);
