#!/usr/bin/env node
/*
 * 提示框（滑過去的說明）逐條量測：名詞表每一條、每件秘寶（含套組與淨化說明）、每支忍具，掛在四個錨點位置各量一次。
 *   node tools/i18n-edge/tooltips.mjs [en,ja,zh] [desk,phone]
 * 量：框寬高、有沒有跑出舞台（上／下／左／右）、行數；再列最高的前十條。
 */
import { openPage, bootRun, sleep, saveJson, shotPath, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const TAG = process.env.EDGE_TAG ?? 'tips';

const MEASURE = async () => {
  const M = (p) => import('/qiuqiu-tower/src/' + p);
  const tip = await M('ui/tooltip.ts');
  const idx = await M('i18n/index.ts');
  const names = await M('i18n/names.ts');
  const relicsM = await M('content/relics.ts');
  const potionsM = await M('content/potions.ts');
  const layer = document.querySelector('#overlay');
  const stage = document.querySelector('#stage');
  const sr = () => stage.getBoundingClientRect();
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const anchors = { hudRelic: [350, 70], potionSlot: [60, 545], playerChips: [60, 470], enemyChips: [1100, 470], handKw: [500, 600], handKwRight: [1000, 640], intent: [770, 175] };
  const out = [];
  const glossKeys = Object.keys(idx.zhGlossary());
  const cases = [];
  for (const g of glossKeys) cases.push({ kind: 'gloss', id: g, mk: (n) => tip.attachTooltip(n, g) });
  for (const r of relicsM.relics) cases.push({ kind: 'relic', id: r.id, mk: (n) => tip.attachTextTooltip(n, names.relicName(r), names.relicLong(r, [])) });
  for (const p of potionsM.potions) cases.push({ kind: 'potion', id: p.id, mk: (n) => tip.attachTextTooltip(n, names.potionName(p), names.potionText(p)) });
  for (const cs of cases) {
    for (const [an, [x, y]] of Object.entries(anchors)) {
      const node = document.createElement('div');
      node.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:40px;height:30px;z-index:5`;
      layer.append(node);
      cs.mk(node);
      node.dispatchEvent(new MouseEvent('mouseenter'));
      await raf();
      const t = document.querySelector('#overlay .tooltip');
      if (t) {
        const k = sr().width / 1280;
        const r = t.getBoundingClientRect();
        const S = (v, o) => (v - o) / k;
        const rg = document.createRange(); rg.selectNodeContents(t);
        const lines = new Set([...rg.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / (4 * k)))).size;
        out.push({ kind: cs.kind, id: cs.id, anchor: an, l: Math.round(S(r.left, sr().left)), r: Math.round(S(r.right, sr().left)), t: Math.round(S(r.top, sr().top)), b: Math.round(S(r.bottom, sr().top)), w: Math.round(r.width / k), h: Math.round(r.height / k), lines, len: t.innerText.length, head: t.innerText.slice(0, 40) });
      }
      node.dispatchEvent(new MouseEvent('mouseleave'));
      node.remove();
    }
  }
  return out;
};

const results = [];
for (const lang of langs) for (const vp of vps) {
  const c = await openPage(lang, vp, TAG);
  const { page } = c;
  try {
    await bootRun(page, 'ninja', 'tips');
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('rats3'); });
    await waitScreen(page, 'combat', 30000);
    await sleep(2200);
    const out = await page.evaluate(MEASURE);
    for (const o of out) results.push({ lang, vp, ...o });
    const tall = [...out].sort((a, b) => b.h - a.h)[0];
    console.log(lang, vp, 'tips', out.length, 'tallest', tall?.h, tall?.kind, tall?.id, 'outside', out.filter((o) => o.t < 0 || o.b > 720 || o.l < 0 || o.r > 1280).length);
  } catch (e) { console.log('ERR', lang, vp, String(e?.message ?? e).slice(0, 300)); }
  finally { await c.close(); }
}
saveJson(`${TAG}_${langs.join('')}_${vps.join('')}.json`, results);
