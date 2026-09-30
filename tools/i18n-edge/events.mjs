#!/usr/bin/env node
/*
 * 事件畫面逐篇量測：每篇事件（該主角遇得到的）開場＋每個選項按下去的結果畫面。
 *   node tools/i18n-edge/events.mjs [en,ja,zh] [desk,phone] [hero,…]
 * 量：對白框上緣有沒有蓋住插圖／跑到狀態列、最後一顆按鈕有沒有掉出舞台、按鈕行數、文字行數，另掃描被切／出界。
 */
import { HEROES, openPage, gotoGame, sleep, saveJson, shotPath, scan, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');
const TAG = process.env.EDGE_TAG ?? 'events';

const METRICS = () => {
  const stage = document.querySelector('#stage');
  const sr = stage.getBoundingClientRect();
  const k = sr.width / 1280;
  const S = (r) => ({ l: Math.round((r.left - sr.left) / k), r: Math.round((r.right - sr.left) / k), t: Math.round((r.top - sr.top) / k), b: Math.round((r.bottom - sr.top) / k) });
  const q = (s) => document.querySelector('#stage ' + s);
  const box = q('.scene-box');
  const art = q('.scene-art');
  const hud = q('.hud');
  const acts = [...document.querySelectorAll('#stage .scene-actions .btn')];
  const lines = (el) => { if (!el) return 0; const rg = document.createRange(); rg.selectNodeContents(el); return new Set([...rg.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top / (4 * k)))).size; };
  const textEl = q('.scene-box .dialogue-text, .scene-box p, .scene-box .event-text');
  return {
    screen: stage.dataset.screen,
    lootTop: (() => { const l = q('.scene-art .showcase.icons'); return l ? S(l.getBoundingClientRect()).t : null; })(),
    scrolled: !!q('.scene.text-scroll'),
    fit: (() => { const sc = q('.scene'); return sc ? [...sc.classList].filter((c) => c.startsWith('text-')).join(' ') : ''; })(),
    box: box ? S(box.getBoundingClientRect()) : null,
    art: art ? S(art.getBoundingClientRect()) : null,
    hudB: hud ? S(hud.getBoundingClientRect()).b : null,
    btns: acts.map((b) => ({ ...S(b.getBoundingClientRect()), lines: lines(b), sw: b.scrollWidth - b.clientWidth, sh: b.scrollHeight - b.clientHeight, dis: b.disabled })),
    boxLines: lines(box),
    textLines: lines(textEl),
    overlay: !!document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay, #overlay .slide-overlay'),
    len: (box?.innerText ?? '').length,
  };
};

const results = [];
for (const lang of langs) for (const vp of vps) for (const hero of heroes) {
  const c = await openPage(lang, vp, TAG);
  const { page } = c;
  const label = `${lang}/${vp}/${hero}`;
  try {
    await page.evaluate((h) => window.__app.newRun('evt', 1, h), hero);
    const run = await page.evaluate(() => JSON.stringify(window.__app.run));
    await gotoGame(page);
    const ids = await page.evaluate(async (h) => (await import('/qiuqiu-tower/src/content/events.ts')).events.filter((e) => !e.hero || e.hero === h).map((e) => e.id), hero);
    const enter = async (id) => {
      await page.evaluate(() => { document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); });
      await page.evaluate((r) => { const x = JSON.parse(r); x.flags.prologue = true; window.__app.continueRun(x); }, run);
      await page.waitForFunction(() => ['map', 'blessing'].includes(document.querySelector('#stage')?.dataset.screen), null, { timeout: 30000 });
      await page.evaluate(() => { for (const p of window.__app.run.players) p.bless = undefined; const r = window.__app.run; r.players[0].fish = 500; });
      await page.evaluate((i) => window.__app.enterEvent(i), id);
      await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen === 'event', null, { timeout: 15000 }).catch(() => {});
      await sleep(260);
    };
    let n = 0;
    for (const id of ids) {
      await enter(id);
      await settle(page);
      const m0 = await page.evaluate(METRICS);
      const s0 = await scan(page);
      results.push({ lang, vp, hero, id, step: 'open', m: m0, clipped: s0.clipped.filter((c) => !c.scroll), outside: s0.outside, ellipsis: s0.ellipsis });
      n++;
      const nb = m0.btns.length;
      for (let i = 0; i < Math.min(nb, 5); i++) {
        await enter(id);
        const clicked = await page.evaluate((k2) => { const bs = [...document.querySelectorAll('#stage .scene-actions .btn')].filter((b) => !b.disabled); const b = bs[k2]; if (!b) return false; b.click(); return true; }, i);
        if (!clicked) break;
        await sleep(380);
        await settle(page);
        const m = await page.evaluate(METRICS);
        const s = await scan(page);
        results.push({ lang, vp, hero, id, step: `opt${i}`, m, clipped: s.clipped.filter((c) => !c.scroll), outside: s.outside, ellipsis: s.ellipsis });
        n++;
      }
    }
    console.log(label, 'events', ids.length, 'renders', n);
  } catch (e) { console.log('ERR', label, String(e?.message ?? e).slice(0, 300)); }
  finally { await c.close(); }
  saveJson(`${TAG}_${langs.join('')}_${vps.join('')}_${heroes.join('-')}.json`, results);
}
