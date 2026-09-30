#!/usr/bin/env node
/*
 * 狀態列截圖（修正前後對照用）：三種情境（8 件秘寶難度 1、0 件秘寶難度 5、12 件秘寶難度 5）× 語言 × 畫面。
 *   node tools/i18n-edge/hud-shot.mjs [en,ja,zh] [desk,phone]
 * 輸出 fig_hud_<語言>_<畫面>_relics<N>_diff<D>.jpg 到 EDGE_OUT。
 */
import { openPage, bootRun, sleep, shotPath, settle } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja,zh').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
for (const lang of langs) for (const vp of vps) {
  const c = await openPage(lang, vp, 'hudshot');
  const { page } = c;
  try {
    await bootRun(page, 'ninja', 'fig');
    const ids = await page.evaluate(async () => (await import('/qiuqiu-tower/src/content/relics.ts')).relics.filter((r) => r.pool !== '起始').map((r) => r.id));
    const set = async (relics, diff) => {
      await page.evaluate(([n, d, ids2]) => { const r = window.__app.run; r.act = 2; r.difficulty = d; r.currentNode = null; const p = r.players[0]; p.relics = ids2.slice(0, n); p.fish = 120; p.maxHp = 176; p.hp = 176; window.__app.show('map'); }, [relics, diff, ids]);
      await sleep(500);
    };
    const w = vp === 'desk' ? 1280 : 844;
    const h = vp === 'desk' ? 90 : 52;
    for (const [n, d] of [[8, 1], [0, 5], [12, 5]]) {
      await set(n, d);
      await settle(page);
      const file = `fig_hud_${lang}_${vp}_relics${n}_diff${d}.jpg`;
      await page.screenshot({ path: shotPath(file), type: 'jpeg', quality: 80, clip: { x: 0, y: vp === 'desk' ? 40 : 0, width: w, height: h } });
      console.log('shot', file);
    }
  } catch (e) { console.log('ERR', lang, vp, String(e?.message ?? e).slice(0, 200)); }
  await c.close();
}
