#!/usr/bin/env node
/*
 * 提示框「真實位置」量測：戰鬥裡真的把滑鼠移到忍具格、手牌上的名詞、狀態牌子、飯糰、意圖上（不是假錨點），量提示框有沒有出舞台。
 *   node tools/i18n-edge/tips-real.mjs [en,ja,zh] [desk,phone] [hero,…]
 */
import { HEROES, openPage, bootRun, sleep, saveJson, shotPath, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja,zh').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? 'ninja,feifei,dangdang,fengfeng').split(',');

const HOVER = async () => {
  const stage = document.querySelector('#stage');
  const sr = () => stage.getBoundingClientRect();
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const out = [];
  const one = async (kind, node, label) => {
    node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await raf();
    const t = document.querySelector('#overlay .tooltip');
    if (t) {
      const k = sr().width / 1280; const r = t.getBoundingClientRect(); const a = node.getBoundingClientRect();
      out.push({ kind, label, l: Math.round((r.left - sr().left) / k), r: Math.round((r.right - sr().left) / k), t: Math.round((r.top - sr().top) / k), b: Math.round((r.bottom - sr().top) / k), anchorT: Math.round((a.top - sr().top) / k), anchorB: Math.round((a.bottom - sr().top) / k), h: Math.round(r.height / k), head: t.innerText.slice(0, 40).replace(/\n/g, ' / ') });
    }
    node.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
  };
  for (const [i, s] of [...document.querySelectorAll('.combat .potions .potion.usable, .combat .potions .potion:not(.empty):not(.locked)')].entries()) await one('potion', s, 'slot' + i);
  const seenKw = new Set();
  for (const kw of document.querySelectorAll('.combat .hand .card .kw')) { if (seenKw.has(kw.textContent)) continue; seenKw.add(kw.textContent); await one('handKw', kw, kw.textContent); }
  const seenChip = new Set();
  for (const ch of document.querySelectorAll('.combat .chip.has-tip')) { const key = ch.className + ch.textContent; if (seenChip.has(key)) continue; seenChip.add(key); await one('chip', ch, ch.textContent.slice(0, 20)); }
  for (const e of document.querySelectorAll('.combat .energy')) await one('energy', e, 'energy');
  return out;
};

const results = [];
for (const lang of langs) for (const vp of vps) for (const hero of heroes) {
  const c = await openPage(lang, vp, 'tipr');
  const { page } = c;
  try {
    await bootRun(page, hero, 'tipr');
    // 手牌塞含名詞的牌、忍具塞說明最長的幾支、身上掛滿狀態
    await page.evaluate(async (h) => {
      const app = window.__app;
      const { cards, inHeroCollection } = await import('/qiuqiu-tower/src/content/cards.ts');
      const { describeCardText } = await import('/qiuqiu-tower/src/i18n/index.ts');
      const { potions } = await import('/qiuqiu-tower/src/content/potions.ts');
      const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true;
      r.players[0].potions = ['demon_mirror', 'rope', 'dive_straw'].filter((id) => potions.some((p) => p.id === id)).slice(0, 3);
      const orig = app.show.bind(app); let done = false;
      app.show = (name, ...rest) => {
        if (name === 'combat' && app.cs && !done) {
          done = true;
          const pool = cards.filter((c) => inHeroCollection(c, h) && !c.hidden && !c.combatOnly && c.type !== 'power');
          // 每個名詞各挑最長文字的牌，湊五張
          const pick = [...pool].sort((a, b) => describeCardText(b, false).length - describeCardText(a, false).length).slice(0, 5);
          let u = 97501;
          app.cs.players[0].hand.splice(0, app.cs.players[0].hand.length, ...pick.map((c) => ({ uid: u++, cardId: c.id, upgraded: false })));
          const p = app.cs.players[0]; p.statuses = { 爪力: 5, 隱身: 2, 蓄氣: 3, 中毒: 4 };
        }
        return orig(name, ...rest);
      };
      app.startFight('rats3');
    }, hero);
    await waitScreen(page, 'combat', 30000);
    await sleep(3000);
    await page.evaluate(() => { const cs = window.__app.cs; for (const e of cs.enemies) e.statuses = { 隱身: 2, 潛水: 1, 定身: 1, 反彈: 3 }; window.__app.show('combat'); });
    await sleep(900);
    await settle(page);
    const out = await page.evaluate(HOVER);
    for (const o of out) results.push({ lang, vp, hero, ...o });
    const bad = out.filter((o) => o.t < 0 || o.b > 720 || o.l < 0 || o.r > 1280);
    console.log(lang, vp, hero, 'tips', out.length, 'bad', bad.length, bad.slice(0, 3).map((o) => `${o.kind}:${o.label} b${o.b}`).join(' '));
  } catch (e) { console.log('ERR', lang, vp, hero, String(e?.message ?? e).slice(0, 250)); }
  finally { await c.close(); }
}
saveJson(`tipr_${langs.join('')}_${vps.join('')}_${heroes.join('-')}.json`, results);
