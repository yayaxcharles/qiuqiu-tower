// 門檻一（角色大小）的實機擷取：每個畫面用遊戲自己的程式畫出來，量圖在舞台上實際畫多大、畫在哪，截圖給人看。
// 量的東西（每隻、兩版各一份）：
//   地圖頭像三關、對白頭像、過關亮相、戰鬥待機（逐格畫布）、戰鬥靜態立繪（`?motion=0`，每一張姿勢換上去量）、選角。
// 做法照 2026-09-23 實機驗收 gate12/capture.js（那次新舊比對 180 組貓窩差 0 像素、靜態 96 張都對得上）。
import { join } from 'node:path';
import { bootRun, clampClip, jpg, MEASURE_IMG, openGame, settle, waitImg, waitScreen } from './browser.mjs';
import { HERO_NAME, sleep } from './util.mjs';

const PREFIX = { ninja: 'ninja', feifei: 'feifei', dangdang: 'dangdang', fengfeng: 'fengfeng' };

/** 這隻貓在素材清單裡的全部立繪鍵（`hero/ninja`、`hero/ninja_attack`…；封面圖另外算） */
export function heroSpriteKeys(manifest, hero) {
  const re = new RegExp(`^hero/${PREFIX[hero]}(?:_|$)`);
  return Object.keys(manifest.sprites).filter((k) => re.test(k) && !/_cover$/.test(k)).sort();
}

const clipAround = (m, pad = 40, minW = 200, minH = 200) => {
  const b = m?.cat ?? m?.el;
  if (!b) return null;
  const w = Math.max(minW, b.w + pad * 2), h = Math.max(minH, b.h + pad * 2);
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, width: w, height: h };
};

/** 戰鬥裡本機這一位的逐格畫布：量元素框，再連續取樣一段時間，把每一格「不透明像素的外框」聯集起來（跟時間點無關） */
const SAMPLE_CANVAS = async (ms) => {
  const box = document.querySelector('#screen .unit.player .sprite-box');
  const cv = box && [...box.querySelectorAll('canvas')].find((c) => c.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true);
  if (!cv) return { err: 'no canvas', classes: box?.className };
  const stage = document.querySelector('#stage').getBoundingClientRect();
  const k = stage.width / 1280;
  let u = null; let hMin = Infinity, hMax = 0, n = 0;
  const t0 = performance.now();
  await new Promise((done) => {
    const tick = () => {
      const w = cv.width, h = cv.height;
      const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) { const row = y * w * 4; for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      if (x1 >= 0) {
        const r = cv.getBoundingClientRect();
        const kx = r.width / w, ky = r.height / h;
        const b = [(r.left + x0 * kx - stage.left) / k, (r.top + y0 * ky - stage.top) / k, (r.left + (x1 + 1) * kx - stage.left) / k, (r.top + (y1 + 1) * ky - stage.top) / k];
        u = u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b;
        hMin = Math.min(hMin, b[3] - b[1]); hMax = Math.max(hMax, b[3] - b[1]); n++;
      }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  const st = getComputedStyle(cv);
  const r = cv.getBoundingClientRect();
  const R = (v) => Math.round(v * 10) / 10;
  return {
    canvas: { x: R((r.left - stage.left) / k), y: R((r.top - stage.top) / k), styleW: cv.style.width, styleH: cv.style.height, bottom: cv.style.bottom, transform: cv.style.transform, cls: cv.className },
    union: u ? { x: R(u[0]), y: R(u[1]), w: R(u[2] - u[0]), h: R(u[3] - u[1]), bottom: R(u[3]) } : null,
    hMin: R(hMin), hMax: R(hMax), n, boxClass: box.className, width: st.width, height: st.height,
  };
};

async function startWoodDummy(page) {
  await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('wood_dummy'); });
  await waitScreen(page, 'combat', 30000);
  await page.waitForFunction(() => window.__app.cs?.phase === 'player', null, { timeout: 30000 });
}

/** 一隻貓、一個版本的門檻一擷取 */
export async function captureSize({ page, url, hero, manifest, shotDir, heroSelect }) {
  const res = { hero, map: [], portrait: null, actclear: null, combatMotion: null, combatStatic: {}, heroSelect: null, notes: [] };
  /** 截圖並把截的範圍記在量測結果上（報告要在圖上畫新舊外框） */
  const shot = async (m, name, clip) => { m.clip = clampClip(clip); m.shot = await jpg(page, join(shotDir, `${hero}_${name}.jpg`), m.clip); return m.shot; };

  // ---- A：逐格開著（預設）：地圖頭像、對白頭像、過關亮相、戰鬥待機 ----
  await bootRun(page, url, hero, `vg-size-${hero}`);
  for (const act of [1, 2, 3]) {
    await page.evaluate((a) => { const r = window.__app.run; r.act = a; r.currentNode = r.map.nodes.find((n) => n.floor === 1)?.id ?? r.currentNode; window.__app.show('map'); }, act);
    await waitImg(page, '.map-hero');
    await sleep(250);
    await settle(page);
    const m = await page.evaluate(MEASURE_IMG, '.map-hero');
    await shot(m, `map_act${act}`, clipAround(m, 30, 160, 160));
    res.map.push({ act, ...m });
  }
  await page.evaluate(() => { const r = window.__app.run; r.act = 1; });
  // 對白頭像：照字面播一句這隻貓自己講的話
  await page.evaluate((name) => window.__app.playOnce('vg:portrait', [{ speaker: name, text: '量頭用的一句。' }], () => {}, true), HERO_NAME[hero]);
  await waitImg(page, '.dialogue-overlay .dialogue-portrait');
  await sleep(200);
  await settle(page);
  res.portrait = await page.evaluate(MEASURE_IMG, '.dialogue-overlay .dialogue-portrait');
  await shot(res.portrait, 'portrait', clipAround(res.portrait, 30, 300, 320));
  for (let i = 0; i < 6 && await page.evaluate(() => !!document.querySelector('.dialogue-overlay')); i++) { await page.mouse.click(640, 200); await sleep(250); }
  // 過關亮相：帶關主信物進過關畫面（左邊站的是勝利圖）
  await page.evaluate(() => { const r = window.__app.run; window.__app.show('actclear', { bossRelic: r.players[0].relics[0] ?? null }); });
  await waitScreen(page, 'actclear');
  await waitImg(page, '.scene-portrait');
  await sleep(200);
  await settle(page);
  res.actclear = await page.evaluate(MEASURE_IMG, '.scene-portrait');
  await shot(res.actclear, 'actclear', clipAround(res.actclear, 30, 300, 360));
  // 戰鬥待機（逐格畫布）
  await startWoodDummy(page);
  await page.waitForFunction(() => !!document.querySelector('#screen .unit.player .sprite-box canvas'), null, { timeout: 20000 }).catch(() => {});
  await sleep(1800);
  res.combatMotion = await page.evaluate(SAMPLE_CANVAS, 1600);
  if (res.combatMotion.union) await shot(res.combatMotion, 'combat_motion', clipAround({ cat: res.combatMotion.union }, 40, 300, 360));

  // ---- B：`?motion=0`：戰鬥靜態立繪，每一張換上去量 ----
  await bootRun(page, url, hero, `vg-size-${hero}`, '?debug&motion=0');
  await startWoodDummy(page);
  await sleep(1500);
  await settle(page);
  const sel = '#screen .unit.player .sprite';
  const native = await page.evaluate(MEASURE_IMG, sel);
  res.combatStatic.__native = native;
  for (const key of heroSpriteKeys(manifest, hero)) {
    const src = url + manifest.sprites[key];
    await page.evaluate(([s, u]) => { const i = document.querySelector(s); if (i) i.src = u; }, [sel, src]);
    await waitImg(page, sel, 5000);
    await settle(page);
    const m = await page.evaluate(MEASURE_IMG, sel);
    m.key = key;
    await shot(m, `static_${key.replace(/^hero\//, '')}`, { x: 0, y: 40, width: 440, height: 420 });
    res.combatStatic[key] = m;
  }

  // ---- 選角（只在其中一隻的工作裡做一次，四隻一起量） ----
  if (heroSelect) {
    await openGame(page, url, '?debug');
    await page.evaluate(() => window.__app.show('heroselect'));
    await waitScreen(page, 'heroselect');
    await sleep(800);
    await settle(page);
    const out = {};
    for (const h of Object.keys(HERO_NAME)) {
      const s = `.hero-card[data-hero="${h}"] .hero-portrait img`;
      await waitImg(page, s);
      out[h] = await page.evaluate(MEASURE_IMG, s);
      if (out[h] && !out[h].err) { out[h].clip = clampClip(clipAround(out[h], 20, 220, 260)); out[h].shot = await jpg(page, join(shotDir, `heroselect_${h}.jpg`), out[h].clip); }
    }
    res.heroSelect = out;
  }
  return res;
}
