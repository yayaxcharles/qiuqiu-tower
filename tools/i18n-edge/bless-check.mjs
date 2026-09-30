#!/usr/bin/env node
/*
 * 開局祝福：旁白有沒有蓋住卡片（16 種祝福、四張一組共 4 組 × 四位主角）。
 *   node tools/i18n-edge/bless-check.mjs [en,ja,zh] [desk,phone] [hero,…]
 * 量法同檢查報告 H-4：旁白第一行字的上緣減卡片框的下緣（負數＝蓋住），並記旁白行數、是否有字被卡片框以外的東西切掉。
 */
import { HEROES, openPage, bootRun, sleep, saveJson, shotPath, scan, settle } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja,zh').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');
const rows = [];
for (const lang of langs) for (const vp of vps) for (const hero of heroes) {
  const c = await openPage(lang, vp, 'blessck');
  const { page } = c;
  try {
    await bootRun(page, hero, `bl-${hero}`);
    const ids = await page.evaluate(async () => (await import('/qiuqiu-tower/src/content/blessings.ts')).BLESSINGS.map((b) => b.id));
    for (let i = 0; i < ids.length; i += 4) {
      const offer = ids.slice(i, i + 4);
      await page.evaluate((o) => { const p = window.__app.run.players[0]; p.bless = { offer: o }; window.__app.show('blessing'); }, offer);
      await sleep(1000);
      await settle(page);
      const m = await page.evaluate(() => {
        const stage = document.querySelector('#stage'); const sr = stage.getBoundingClientRect(); const k = sr.width / 1280;
        const cards = [...document.querySelectorAll('#stage .bless-card')];
        const txt = document.querySelector('#stage .scene-box .scene-text');
        const rg = document.createRange(); rg.selectNodeContents(txt);
        const rects = [...rg.getClientRects()].filter((x) => x.width > 1);
        const top = Math.min(...rects.map((r) => r.top));
        const lines = new Set(rects.map((x) => Math.round(x.top / (4 * k)))).size;
        const cardsB = Math.max(...cards.map((x) => x.getBoundingClientRect().bottom));
        const row = document.querySelector('.bless-row');
        const inner = cards.map((cd) => { const s = cd.querySelector('.small'); return s ? s.scrollHeight - s.clientHeight : 0; });
        return { gap: Math.round((top - cardsB) / k * 10) / 10, lines, fit: [...document.querySelector('.scene').classList].filter((x) => x.startsWith('bless-fit')).join(' '), rowScale: row?.style.scale || '', innerCut: Math.max(...inner) };
      });
      rows.push({ lang, vp, hero, group: i / 4, ...m });
      if (m.gap < 0 || i === 8) await page.screenshot({ path: shotPath(`bless_${i / 4}_${lang}_${vp}_${hero}.jpg`), type: 'jpeg', quality: 72 });
    }
    const mine = rows.filter((r) => r.lang === lang && r.vp === vp && r.hero === hero);
    console.log(lang, vp, hero, 'cover', mine.filter((r) => r.gap < 0).length, '/', mine.length, 'worst', Math.min(...mine.map((r) => r.gap)), 'lines', Math.max(...mine.map((r) => r.lines)), 'fit', [...new Set(mine.map((r) => r.fit))].join('|'));
  } catch (e) { console.log('ERR', lang, vp, hero, String(e?.message ?? e).slice(0, 300)); }
  await c.close();
}
saveJson(`bless_${langs.join('')}_${vps.join('')}_${heroes.join('-')}.json`, rows);
