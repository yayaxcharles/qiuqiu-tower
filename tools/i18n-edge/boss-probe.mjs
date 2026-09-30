import { openPage, bootRun, sleep, shotPath } from './lib.mjs';
const c = await openPage(process.argv[2] ?? 'en', 'desk', 'bp');
const { page } = c;
await bootRun(page, 'ninja', 'bp');
await page.evaluate((id) => { const r = window.__app.run; r.act = 3; r.floor = 40; r.flags['tut:combat'] = true; window.__app.startFight(id, true); }, process.argv[3] ?? 'iron_claw');
for (let i = 0; i < 8; i++) {
  await sleep(1500);
  console.log(i, await page.evaluate(() => ({ screen: document.querySelector('#stage').dataset.screen, ov: [...document.querySelectorAll('#overlay > *')].map((n) => n.className), pending: window.__app.fightPending })));
}
await page.screenshot({ path: shotPath('_bossprobe.png') });
console.log(c.logs.slice(0, 5));
await c.close();
