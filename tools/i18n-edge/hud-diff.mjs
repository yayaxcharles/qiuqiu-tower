#!/usr/bin/env node
/* 難度 1～5 各一：0 件秘寶時，生命條寬與掉出畫面的按鈕（補 hud-check 只量了難度 1、5）。 node tools/i18n-edge/hud-diff.mjs [en,ja,zh] [desk,phone] */
import { openPage, bootRun, sleep, saveJson, settle } from './lib.mjs';
const langs = (process.argv[2] ?? 'en,ja,zh').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const rows = [];
for (const lang of langs) for (const vp of vps) {
  const c = await openPage(lang, vp, 'hudd');
  const { page } = c;
  await bootRun(page, 'ninja', 'hudd');
  for (const act of [1, 2, 3]) for (const diff of [1, 2, 3, 4, 5]) for (const relics of [0, 8]) {
    await page.evaluate(async ([a, d, n]) => {
      const ids = (await import('/qiuqiu-tower/src/content/relics.ts')).relics.filter((r) => r.pool !== '起始').map((r) => r.id);
      const r = window.__app.run; r.act = a; r.floor = 2; r.difficulty = d; r.currentNode = null;
      const p = r.players[0]; p.relics = ids.slice(0, n); p.fish = 30; p.maxHp = 176; p.hp = 176; window.__app.show('map');
    }, [act, diff, relics]);
    await sleep(300); await settle(page);
    const m = await page.evaluate(() => {
      const sr = document.querySelector('#stage').getBoundingClientRect(); const k = sr.width / 1280;
      const hud = document.querySelector('.hud'); const hp = hud.querySelector('.hud-hp');
      const kids = [...hud.children].map((c) => ({ text: (c.textContent || '').trim().slice(0, 12), r: Math.round((c.getBoundingClientRect().right - sr.left) / k) }));
      return { hpW: Math.round(hp.getBoundingClientRect().width / k), out: kids.filter((x) => x.r > 1281 && x.text).map((x) => x.text), maxR: Math.max(...kids.map((x) => x.r)), diffText: hud.querySelector('.hud-diff')?.textContent ?? '' };
    });
    rows.push({ lang, vp, act, diff, relics, ...m });
  }
  await c.close();
  const xs = rows.filter((r) => r.lang === lang && r.vp === vp && r.act === 2);
  console.log(lang, vp, xs.map((r) => `d${r.diff}r${r.relics}: hp${r.hpW} out${r.out.length}`).join(' | '));
}
saveJson(`hud-diff_${langs.join('')}_${vps.join('')}.json`, rows);
