#!/usr/bin/env node
/*
 * 戰鬥畫面左下角：戰鬥紀錄框（最後四行）與抽牌堆／棄牌堆／消耗堆計數、飯糰、回合數的關係。
 *   node tools/i18n-edge/combat-log.mjs [en,ja,zh] [desk,phone] [hero,…]
 * 開戰後往紀錄裡塞四行真實的長句（各語言 logfmt 重組過的），量紀錄框有沒有蓋到計數、最舊那行被切掉多少。
 */
import { HEROES, openPage, bootRun, sleep, saveJson, shotPath, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja,zh').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');

const MEASURE = () => {
  const stage = document.querySelector('#stage');
  const sr = stage.getBoundingClientRect();
  const k = sr.width / 1280;
  const S = (r) => ({ l: Math.round((r.left - sr.left) / k), r: Math.round((r.right - sr.left) / k), t: Math.round((r.top - sr.top) / k), b: Math.round((r.bottom - sr.top) / k) });
  const q = (s) => document.querySelector('.combat ' + s);
  const log = q('.log');
  const piles = q('.piles');
  const kids = log ? [...log.children].map((c) => ({ text: c.textContent.slice(0, 50), box: S(c.getBoundingClientRect()) })) : [];
  const logBox = log ? S(log.getBoundingClientRect()) : null;
  const cut = kids.filter((c) => c.box.t < logBox.t - 1).map((c) => Math.round(logBox.t - c.box.t));
  const rows = piles ? [...piles.children].map((c) => ({ text: c.textContent.slice(0, 20), box: S(c.getBoundingClientRect()) })) : [];
  return {
    log: logBox, piles: piles ? S(piles.getBoundingClientRect()) : null, kids: kids.length,
    cutTop: cut, cutLines: kids.filter((c) => c.box.t < logBox.t - 1 || c.box.b > logBox.b + 1).length,
    coverPiles: piles && logBox ? Math.max(0, S(piles.getBoundingClientRect()).b - logBox.t) : 0,
    rows,
  };
};

const results = [];
for (const lang of langs) for (const vp of vps) for (const hero of heroes) {
  const c = await openPage(lang, vp, 'clog');
  const { page } = c;
  try {
    await bootRun(page, hero, 'clog');
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('rats3'); });
    await waitScreen(page, 'combat', 30000);
    await sleep(2500);
    await settle(page);
    const m = await page.evaluate(MEASURE);
    results.push({ lang, vp, hero, m });
    if (hero === 'ninja') await page.screenshot({ path: shotPath(`clog_${lang}_${vp}_${hero}.jpg`), type: 'jpeg', quality: 72 });
    console.log(lang, vp, hero, JSON.stringify({ cutTop: m.cutTop, cover: m.coverPiles, log: m.log, piles: m.piles }));
  } catch (e) { console.log('ERR', lang, vp, hero, String(e?.message ?? e).slice(0, 200)); }
  finally { await c.close(); }
}
saveJson(`clog_${langs.join('')}_${vps.join('')}.json`, results);
