#!/usr/bin/env node
/*
 * 上方狀態列（HUD）擠不擠：關名（塔下／塔中／塔頂）× 難度牌子 × 秘寶件數 × 忍具格數 × 小魚乾位數 × 生命三位數。
 * 量每一格的外框有沒有跑出舞台、生命條被擠成多窄、有沒有換行。
 *   node tools/i18n-edge/hud-check.mjs [en,ja,zh] [desk,phone] [hero,…]
 */
import { HEROES, openPage, bootRun, sleep, saveJson, shotPath, scan, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');

const SCREEN = process.env.HUD_SCREEN ?? 'map';   // map（預設）或 combat：戰鬥整頁重畫時狀態列是先在游離節點裡組好再掛上去，要另外量
const CASES = [];
for (const act of [1, 2, 3]) for (const diff of [1, 5]) for (const relics of [0, 8, 12]) for (const fish of (SCREEN === 'combat' ? [999] : [30, 999])) CASES.push({ act, diff, relics, fish });

const MEASURE = () => {
  const stage = document.querySelector('#stage');
  const sr = stage.getBoundingClientRect();
  const k = sr.width / 1280;
  const S = (r) => ({ l: Math.round((r.left - sr.left) / k), r: Math.round((r.right - sr.left) / k), t: Math.round((r.top - sr.top) / k), b: Math.round((r.bottom - sr.top) / k) });
  const hud = document.querySelector('.hud');
  if (!hud) return { err: 'no hud' };
  const kids = [...hud.children].map((c) => {
    const r = c.getBoundingClientRect();
    const tx = c.querySelector('span') ?? c;
    const lines = (() => { const rg = document.createRange(); rg.selectNodeContents(c); return new Set([...rg.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top / 3))).size; })();
    return { cls: c.className.replace(/\s+/g, '.').slice(0, 40), text: (c.textContent || '').trim().slice(0, 30), box: S(r), w: Math.round(r.width / k), sw: c.scrollWidth, cw: c.clientWidth, lines };
  });
  const hp = hud.querySelector('.hud-hp');
  const hpSpan = hp?.querySelector('span');
  return {
    hudBox: S(hud.getBoundingClientRect()), hudCls: hud.className, kids,
    hpW: hp ? Math.round(hp.getBoundingClientRect().width / k) : null,
    hpTextW: hpSpan ? Math.round(hpSpan.getBoundingClientRect().width / k) : null,
    hpClipped: hp ? hp.scrollWidth > hp.clientWidth + 1 || (hpSpan && hpSpan.getBoundingClientRect().right > hp.getBoundingClientRect().right + 1) : null,
    maxRight: Math.max(...kids.map((c) => c.box.r)),
    overStage: kids.filter((c) => c.w > 0 && (c.box.r > 1280 + 1 || c.box.l < -1)).map((c) => ({ cls: c.cls, text: c.text, r: c.box.r, l: c.box.l })),
    hudScroll: { sw: hud.scrollWidth, cw: hud.clientWidth },
  };
};

const results = [];
for (const lang of langs) for (const vp of vps) for (const hero of heroes) {
  const c = await openPage(lang, vp, 'hud');
  const { page } = c;
  try {
    await bootRun(page, hero, 'hud');
    const allRelics = await page.evaluate(async () => (await import('/qiuqiu-tower/src/content/relics.ts')).relics.filter((r) => r.pool !== '起始').map((r) => r.id));
    for (const cs of CASES) {
      await page.evaluate(([cse, ids, screen]) => {
        const app = window.__app; const r = app.run; const p = r.players[0];
        r.act = cse.act; r.floor = 2; r.difficulty = cse.diff; r.currentNode = null;
        p.relics = ids.slice(0, cse.relics); p.fish = cse.fish; p.maxHp = 176; p.hp = 176;
        p.potions = [];
        if (screen === 'map') app.show('map');
      }, [cs, allRelics, SCREEN]);
      if (SCREEN === 'combat') {
        await page.evaluate(() => { const r = window.__app.run; r.flags['tut:combat'] = true; window.__app.cs = null; window.__app.startFight('rats3'); });
        await waitScreen(page, 'combat', 30000);
        await sleep(2600);
      }
      await sleep(350);
      await settle(page);
      const m = await page.evaluate(MEASURE);
      const sc = await scan(page, { root: '.hud' });
      const row = { lang, vp, hero, ...cs, m, clipped: sc.clipped, outside: sc.outside };
      results.push(row);
      const worst = m.overStage?.length || m.hpClipped;
      if (worst && !(results.some((r) => r.shot && r.lang === lang && r.vp === vp && r.hero === hero))) {
        row.shot = `hud_${lang}_${vp}_${hero}_a${cs.act}_d${cs.diff}_r${cs.relics}_f${cs.fish}.jpg`;
        await page.screenshot({ path: shotPath(row.shot), type: 'jpeg', quality: 75 });
      }
    }
    const bad = results.filter((r) => r.lang === lang && r.vp === vp && r.hero === hero && (r.m.overStage?.length || r.m.hpClipped));
    console.log(lang, vp, hero, 'cases', CASES.length, 'bad', bad.length, 'minHpW', Math.min(...results.filter((r) => r.lang === lang && r.vp === vp && r.hero === hero).map((r) => r.m.hpW)));
  } catch (e) { console.log('ERR', lang, vp, hero, String(e?.message ?? e).slice(0, 300)); }
  finally { await c.close(); }
}
saveJson(`hud${SCREEN === 'map' ? '' : '-' + SCREEN}_${langs.join('')}_${vps.join('')}_${heroes.join('-')}.json`, results);
