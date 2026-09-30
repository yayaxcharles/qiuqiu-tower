#!/usr/bin/env node
/*
 * 牌名換兩行的牌（英文「Secret Art: …」）與連線牌的聯絡表截圖，修正後的樣子。
 *   node tools/i18n-edge/cards-wrap-shot.mjs [en] [desk]
 * 輸出 cardsfix_<語言>_<畫面>_<角色>.png 到 EDGE_OUT。
 */
import { HEROES, openPage, sleep, shotPath, settle } from './lib.mjs';

const lang = process.argv[2] ?? 'en';
const vp = process.argv[3] ?? 'desk';
const c = await openPage(lang, vp, 'cardwrap');
const { page } = c;
for (const hero of HEROES) {
  const n = await page.evaluate(async ({ hero }) => {
    const { cards, inHeroCollection } = await import('/qiuqiu-tower/src/content/cards.ts');
    const { cardNode } = await import('/qiuqiu-tower/src/ui/cardview.ts');
    const list = cards.filter((x) => inHeroCollection(x, hero) || x.combatOnly || x.hidden || (x.coop && (!x.hero || x.hero === hero)));
    const host = document.createElement('div');
    host.id = 'edge-cards';
    host.style.cssText = 'position:absolute;left:0;top:0;width:1280px;display:flex;flex-wrap:wrap;gap:6px;z-index:99999;background:#3b2a1a;padding:6px;box-sizing:border-box';
    document.querySelector('#overlay').append(host);
    const nodes = [];
    for (const def of list) for (const upgraded of [false, true]) { const node = cardNode(def, { small: true, upgraded, hero }); host.append(node); nodes.push(node); }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 300));
    let keep = 0;
    for (const node of nodes) {
      const wrapped = node.querySelector('.card-name.wrap');
      const coop = node.classList.contains('coop');
      if (wrapped) keep++; else node.remove();
    }
    return keep;
  }, { hero });
  await sleep(600);
  await settle(page);
  const h = await page.$('#edge-cards');
  if (n > 0) await h.screenshot({ path: shotPath(`cardsfix_${lang}_${vp}_${hero}.png`) });
  console.log(hero, n);
  await page.evaluate(() => document.querySelector('#edge-cards')?.remove());
}
await c.close();
