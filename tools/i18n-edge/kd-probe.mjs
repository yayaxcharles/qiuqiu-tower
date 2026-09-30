#!/usr/bin/env node
/*
 * 只留圖示時三顆開關的關閉狀態：三顆都關掉，量每顆的可見字（🔇＋一字短標）與可點區大小。
 *   node tools/i18n-edge/kd-probe.mjs [en|ja|zh] [phone|desk]
 */
import { openPage, bootRun, sleep, shotPath } from './lib.mjs';

const lang = process.argv[2] ?? 'en', vp = process.argv[3] ?? 'phone';
const c = await openPage(lang, vp, 'kdp');
const { page } = c;
await bootRun(page, 'ninja', 'kdp');
const ids = await page.evaluate(async () => (await import('/qiuqiu-tower/src/content/relics.ts')).relics.filter((r) => r.pool !== '起始').map((r) => r.id));
await page.evaluate((l) => { const r = window.__app.run; r.act = 2; r.difficulty = 5; r.currentNode = null; r.players[0].relics = l.slice(0, 12); window.__app.show('map'); }, ids);
await sleep(600);
for (const b of await page.$$('.hud .hud-sound')) await b.click();   // 三顆都關
await sleep(300);
const out = await page.evaluate(() => {
  const st = document.querySelector('#stage').getBoundingClientRect(); const k = st.width / 1280;
  return { cls: document.querySelector('.hud').className, btns: [...document.querySelectorAll('.hud .hud-sound')].map((b) => { const r = b.getBoundingClientRect(); return { seen: [...b.children].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.textContent.trim()).join(''), w: Math.round(r.width / k), h: Math.round(r.height / k) }; }), seed: (() => { const s = document.querySelector('.hud .hud-seed'); const r = s.getBoundingClientRect(); return { w: Math.round(r.width / k), h: Math.round(r.height / k) }; })() };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: shotPath(`kdprobe_${lang}_${vp}.png`), clip: { x: 0, y: vp === 'desk' ? 40 : 0, width: vp === 'desk' ? 1280 : 844, height: vp === 'desk' ? 60 : 52 } });
await c.close();
