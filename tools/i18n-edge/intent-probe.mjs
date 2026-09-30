#!/usr/bin/env node
/*
 * 意圖牌省略號實測：三隻魔物各換一招最長的（英文「肚皮鼓（看破）」等），量牌子本身有沒有被裁切（overflow 要是 visible）、
 * 省略號那層 `.ell` 在哪、攻擊牌的偽元素（紅光圈）還在不在。
 *   node tools/i18n-edge/intent-probe.mjs [en] [desk|phone]
 */
import { openPage, bootRun, sleep, shotPath, waitScreen } from './lib.mjs';

const lang = process.argv[2] ?? 'en', vp = process.argv[3] ?? 'phone';
const c = await openPage(lang, vp, 'intentp');
const { page } = c;
await bootRun(page, 'ninja', 'intentp');
await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('rats3'); });
await waitScreen(page, 'combat', 30000);
await sleep(2500);
await page.evaluate(async () => {
  const { enemyById } = await import('/qiuqiu-tower/src/content/enemies.ts');
  const mv = (id, label) => JSON.parse(JSON.stringify((enemyById[id].moves.find((m) => m.label === label) ?? enemyById[id].moves[0])));
  const cs = window.__app.cs;
  cs.enemies[0].move = mv('tanuki_lord', '肚皮鼓');
  cs.enemies[1].move = mv('persian_lady', '尖叫');
  cs.enemies[2].move = mv('tower_master', '看破');
  window.__app.show('combat');
});
await sleep(700);
const out = await page.evaluate(() => [...document.querySelectorAll('.combat .unit.enemy .intent')].map((n) => {
  const cs = getComputedStyle(n);
  const ell = n.querySelector(':scope > .ell');
  return { text: n.textContent, cls: n.className, w: n.offsetWidth, fs: cs.fontSize, overflow: cs.overflow, ell: !!ell, ellClipped: ell ? ell.scrollWidth > ell.clientWidth : null, before: getComputedStyle(n, '::before').content, after: getComputedStyle(n, '::after').content };
}));
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: shotPath(`intentprobe_${lang}_${vp}.png`) });
await c.close();
