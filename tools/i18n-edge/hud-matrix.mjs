#!/usr/bin/env node
/*
 * 狀態列前後對照矩陣（審查後加）：關卡 × 秘寶件數 × 難度 × 小魚乾 × 真實血量，每一種擺好、量每一格的外框、類別、生命條與字寬，
 * 並截狀態列那一條。同一支腳本在 base（埠 5251）與修正後（埠 5241）各跑一次，再用 hud-matrix-compare.py 比對。
 *   EDGE_PORT=5241 EDGE_OUT=<資料夾> node tools/i18n-edge/hud-matrix.mjs <語系> <desk|phone> [標籤]
 * 輸出 hudm_<標籤>_<語系>_<畫面>.json 與 hudm_<標籤>_<語系>_<畫面>/<鍵>.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openPage, bootRun, sleep, OUT, settle } from './lib.mjs';

const lang = process.argv[2] ?? 'zh', vp = process.argv[3] ?? 'desk', tag = process.argv[4] ?? 'after';
const dir = `${OUT}/hudm_${tag}_${lang}_${vp}`;
mkdirSync(dir, { recursive: true });

const MEASURE = () => {
  const stage = document.querySelector('#stage');
  const sr = stage.getBoundingClientRect(); const k = sr.width / 1280;
  const hud = document.querySelector('.hud');
  const kids = [...hud.children].map((c) => { const r = c.getBoundingClientRect(); return [c.className.replace(/\s+/g, '.').slice(0, 30), Math.round((r.left - sr.left) / k), Math.round((r.right - sr.left) / k), Math.round(r.width / k)]; });
  const hp = hud.querySelector('.hud-hp'); const span = hp?.querySelector('span');
  let need = 0;
  if (span) { const was = span.style.whiteSpace; span.style.whiteSpace = 'nowrap'; need = Math.round(span.getBoundingClientRect().width / k); span.style.whiteSpace = was; }
  const hpW = hp ? Math.round(hp.getBoundingClientRect().width / k) : 0;
  const visible = kids.filter((c) => c[3] > 0);
  const maxRight = Math.max(...visible.map((c) => c[2]));
  return { cls: hud.className, kids, hpW, need, maxRight, broken: maxRight > 1281 || (hpW > 0 && hpW < need + 4) };
};

const c = await openPage(lang, vp, 'hudm');
const { page } = c;
const rows = [];
try {
  await bootRun(page, 'ninja', 'hudm');
  const ids = await page.evaluate(async () => (await import('/qiuqiu-tower/src/content/relics.ts')).relics.filter((r) => r.pool !== '起始').map((r) => r.id));
  for (const act of [1, 2, 3]) for (const relics of [1, 2, 3, 4, 5, 6, 7]) for (const diff of [1, 3]) for (const fish of [50, 500]) for (const [hp, max] of [[76, 76], [176, 176], [23, 76]]) {
    const key = `a${act}_r${relics}_d${diff}_f${fish}_h${hp}`;
    await page.evaluate(([a, n, d, f, h, m, list]) => { const app = window.__app; const r = app.run; const p = r.players[0]; r.act = a; r.floor = 2; r.difficulty = d; r.currentNode = null; p.relics = list.slice(0, n); p.fish = f; p.maxHp = m; p.hp = h; p.potions = []; app.show('map'); }, [act, relics, diff, fish, hp, max, ids]);
    await sleep(120);
    await settle(page);
    const m = await page.evaluate(MEASURE);
    const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: vp === 'desk' ? 40 : 0, width: vp === 'desk' ? 1280 : 844, height: vp === 'desk' ? 60 : 52 } });
    const md5 = createHash('md5').update(buf).digest('hex');
    writeFileSync(`${dir}/${key}.png`, buf);
    rows.push({ key, ...m, md5 });
  }
} finally { await c.close(); }
writeFileSync(`${OUT}/hudm_${tag}_${lang}_${vp}.json`, JSON.stringify(rows));
console.log(tag, lang, vp, 'states', rows.length, 'broken', rows.filter((r) => r.broken).length);
