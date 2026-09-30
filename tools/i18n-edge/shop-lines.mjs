#!/usr/bin/env node
/*
 * 罐頭鋪店主台詞（橘貓老闆、三位客座店主）逐句量：把每一句放進真的罐頭鋪畫面的對白框，叫遊戲自己的 refitGoods 縮貨架，
 * 量價錢有沒有被字蓋住、貨架縮到多小、對白行數；第一次見面的旁白另外用公告條量。
 *   node tools/i18n-edge/shop-lines.mjs [en,ja,zh] [desk,phone] [hero,…]
 */
import { HEROES, openPage, bootRun, sleep, saveJson, shotPath, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja,zh').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');
const INITVOICE = `(() => { if (/^(127\\.0\\.0\\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.voice', 'off'); } catch (e) {} } })();`;

const RUN = async ({ keeper, hero, lines }) => {
  const M = (p) => import('/qiuqiu-tower/src/' + p);
  const { makeShops } = await M('engine/run.ts');
  const sc = await M('ui/scene.ts');
  const sp = await M('i18n/speech.ts');
  const app = window.__app;
  const run = app.run; run.act = 2; run.floor = 20; run.players[0].fish = 999;
  const shops = makeShops(run); shops[0].keeper = keeper;
  app.show('shop', { shops });
  await new Promise((r) => setTimeout(r, 900));
  const stage = document.querySelector('#stage');
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = [];
  for (const ln of lines) {
    const scene = document.querySelector('#stage .scene');
    const box = scene?.querySelector('.scene-box');
    if (!scene || !box) { out.push({ ...ln, err: 'no scene' }); continue; }
    const text = box.querySelector('.scene-text');
    const reply = box.querySelector('.shop-reply');
    if (ln.kind === 'talk') { text.textContent = sp.lineDisplay(ln.a); if (reply) reply.textContent = ln.b ? sp.lineDisplay(ln.b) : ''; }
    else if (ln.kind === 'notice') {
      // 第一次見面旁白：走真的公告條
      const dlg = await M('ui/dialogue.ts');
      dlg.notice(ln.a);
    }
    for (const a of box.getAnimations?.() ?? []) { try { a.finish(); } catch { /* */ } }
    sc.refitGoods(scene);
    await raf2();
    for (const a of box.getAnimations?.() ?? []) { try { a.finish(); } catch { /* */ } }
    sc.refitGoods(scene);
    await raf2();
    const sr = stage.getBoundingClientRect(); const k = sr.width / 1280;
    const S = (r) => ({ l: (r.left - sr.left) / k, r: (r.right - sr.left) / k, t: (r.top - sr.top) / k, b: (r.bottom - sr.top) / k });
    const goods = scene.querySelector('.scene-goods');
    const scale = goods ? parseFloat(getComputedStyle(goods).scale) || 1 : 1;
    const prices = [...(goods?.querySelectorAll('.price') ?? [])].map((p) => S(p.getBoundingClientRect()));
    const covers = [];
    for (const e of box.querySelectorAll('.dialogue-speaker, .scene-text, .shop-reply')) { const rg = document.createRange(); rg.selectNodeContents(e); for (const r of rg.getClientRects()) if (r.width > 1 && r.height > 1) covers.push(S(r)); }
    for (const b of box.querySelectorAll('.scene-actions .btn')) covers.push(S(b.getBoundingClientRect()));
    let worst = 999;
    for (const p of prices) for (const c of covers) { const side = Math.min(p.r, c.r) - Math.max(p.l, c.l); if (side > 0.5 && c.b > p.t) worst = Math.min(worst, c.t - p.b); }
    const tl = text ? (() => { const rg = document.createRange(); rg.selectNodeContents(text); return new Set([...rg.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top / (4 * k)))).size; })() : 0;
    const nt = ln.kind === 'notice' ? document.querySelector('#overlay .notice') : null;
    const nrect = nt ? S(nt.getBoundingClientRect()) : null;
    out.push({ ...ln, scale, gapMin: worst === 999 ? null : Math.round(worst), lines: tl, boxT: S(box.getBoundingClientRect()).t, notice: nrect ? { l: nrect.l, r: nrect.r, w: nrect.r - nrect.l, h: nrect.b - nrect.t } : null, shown: (nt?.textContent ?? text?.textContent ?? '').slice(0, 80), replyLines: reply ? (() => { const rg = document.createRange(); rg.selectNodeContents(reply); return new Set([...rg.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top / (4 * k)))).size; })() : 0 });
    if (nt) nt.remove();
  }
  return out;
};

const COLLECT = async (hero) => {
  const st = await import('/qiuqiu-tower/src/content/shop-text.ts');
  const dl = await import('/qiuqiu-tower/src/content/dialogue.ts');
  const per = {};
  per.orange = (dl.dialogue.shopkeeper ?? []).map((t) => ({ kind: 'talk', a: t, b: '', src: 'orange:shopkeeper' }));
  for (const [id, kt] of Object.entries(st.KEEPER_TEXT)) {
    const h = kt.byHero[hero];
    const arr = [];
    for (const c of kt.chatter) arr.push({ kind: 'talk', a: c, b: '', src: `${id}:chatter` });
    arr.push({ kind: 'talk', a: h.enter[0], b: h.enter[1], src: `${id}:enter` });
    arr.push({ kind: 'talk', a: h.tooMuch[0], b: h.tooMuch[1], src: `${id}:tooMuch` });
    arr.push({ kind: 'talk', a: kt.debt, b: '', src: `${id}:debt` });
    arr.push({ kind: 'notice', a: kt.firstMeet, src: `${id}:firstMeet` });
    per[id] = arr;
  }
  return per;
};

const results = [];
for (const lang of langs) for (const vp of vps) {
  const c = await openPage(lang, vp, 'shoplines', INITVOICE);
  const { page } = c;
  for (const hero of heroes) {
    try {
      await bootRun(page, hero, `sl-${hero}`);
      const per = await page.evaluate(COLLECT, hero);
      for (const [keeper, lines] of Object.entries(per)) {
        const out = await page.evaluate(RUN, { keeper, hero, lines });
        for (const o of out) results.push({ lang, vp, hero, keeper, ...o });
        const bad = out.filter((o) => o.gapMin !== null && o.gapMin < 0);
        console.log(lang, vp, hero, keeper, 'lines', out.length, 'overlap', bad.length, 'minScale', Math.min(...out.map((o) => o.scale)).toFixed(2));
        if (hero === 'ninja' || bad.length) {
          const worst = [...out].sort((a, b) => (a.gapMin ?? 999) - (b.gapMin ?? 999))[0];
          await page.evaluate(RUN, { keeper, hero, lines: [worst] });
          await settle(page);
          await page.screenshot({ path: shotPath(`shoplines_${keeper}_${lang}_${vp}_${hero}.jpg`), type: 'jpeg', quality: 70 });
        }
      }
    } catch (e) { console.log('ERR', lang, vp, hero, String(e?.message ?? e).slice(0, 250)); }
  }
  await c.close();
  saveJson(`shoplines_${langs.join('')}_${vps.join('')}_${heroes.join('-')}.json`, results);
}
