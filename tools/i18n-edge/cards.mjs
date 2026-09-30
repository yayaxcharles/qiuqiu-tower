#!/usr/bin/env node
/*
 * 卡牌逐張量測（英／日 × 桌機／手機橫拿 × 四位主角 × 一般／升級 × 大牌／小牌）。
 *   node tools/i18n-edge/cards.mjs [en,ja] [desk,phone] [ninja,feifei,dangdang,fengfeng]
 * 每張牌：縮字之後的字級、縮完是否還溢出（被截）、是否縮到下限（文字 10、牌名 9）、牌名是否被截。
 * 先用一個一定溢出的假元素驗證掃描函式抓得到，再跑正式量測。
 */
import { HEROES, openPage, imp, sleep, saveJson, shotPath, scan, settle } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');

const MEASURE = async ({ hero, small, upgraded, plays, onlyRamp }) => {
  const { cards, inHeroCollection } = await import('/qiuqiu-tower/src/content/cards.ts');
  const { cardNode } = await import('/qiuqiu-tower/src/ui/cardview.ts');
  const { cardName } = await import('/qiuqiu-tower/src/i18n/names.ts');
  let list = cards.filter((c) => inHeroCollection(c, hero) || c.combatOnly || c.hidden || (c.coop && (!c.hero || c.hero === hero)));
  if (onlyRamp) list = list.filter((c) => c.effects.some((e) => e.kind === 'damageRamp'));
  const host = document.createElement('div');
  host.id = 'edge-cards';
  host.style.cssText = 'position:absolute;left:0;top:0;width:1280px;display:flex;flex-wrap:wrap;gap:6px;z-index:99999;background:#3b2a1a;padding:6px;box-sizing:border-box';
  document.querySelector('#overlay').append(host);
  const items = [];
  for (const def of list) {
    const p = def.effects.some((e) => e.kind === 'damageRamp') ? plays : 0;
    const node = cardNode(def, { small, upgraded, hero, plays: p });
    node.dataset.cid = def.id;
    host.append(node);
    items.push({ def, node, p });
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 120));
  const out = [];
  for (const { def, node, p } of items) {
    const t = node.querySelector('.card-text');
    const n = node.querySelector('.card-name');
    const ty = node.querySelector('.card-type');
    const fsT = parseFloat(getComputedStyle(t).fontSize);
    const fsN = parseFloat(getComputedStyle(n).fontSize);
    const baseT = small ? 13 : 15, baseN = small ? 14 : 17;
    // 行數：文字節點外框的不同上緣
    const rg = document.createRange(); rg.selectNodeContents(t);
    const rects = [...rg.getClientRects()].filter((r) => r.width > 0.5);
    const tops = new Set(rects.map((r) => Math.round(r.top / 3)));
    const lastBottom = rects.length ? Math.max(...rects.map((r) => r.bottom)) : 0;
    const boxBottom = t.getBoundingClientRect().bottom;
    out.push({
      id: def.id, name: n.textContent, pool: def.pool, rarity: def.rarity, coop: !!def.coop, combatOnly: !!def.combatOnly, hidden: !!def.hidden,
      p, text: t.textContent,
      fsT, fsN, baseT, baseN,
      textOver: Math.round((t.scrollHeight - t.clientHeight) * 10) / 10,
      textClip: Math.round((lastBottom - boxBottom) * 10) / 10,
      lines: tops.size,
      nameOver: Math.round((n.scrollWidth - n.clientWidth) * 10) / 10,
      typeOver: ty ? Math.round((ty.scrollWidth - ty.clientWidth) * 10) / 10 : 0,
      typeText: ty?.textContent,
      nameWrap: n.classList.contains('wrap'),
      artH: Math.round(node.querySelector('.card-art').offsetHeight * 10) / 10,
      typeClip: Math.round((ty.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom) * 10) / 10,
    });
  }
  // 有問題（被截或縮到下限）的牌留著截一張聯絡表，其餘拿掉
  const bad = new Set(out.filter((o) => o.textOver > 0.5 || o.nameOver > 0.5 || o.fsT <= 10.01 || o.fsN <= 9.01 || o.typeOver > 0.5).map((o) => o.id));
  for (const { def, node } of items) if (!bad.has(def.id)) node.remove();
  return { out, nBad: bad.size };
};

const results = [];
for (const lang of langs) {
  for (const vp of vps) {
    const c = await openPage(lang, vp, 'cards');
    const { page } = c;
    // 驗證掃描函式：塞一個一定被切、一個一定跑出舞台的假元素，抓不到就整個作廢
    if (lang === langs[0] && vp === vps[0]) {
      await page.evaluate(() => {
        const h = document.createElement('div');
        h.id = 'edge-probe';
        h.innerHTML = '<div style="position:absolute;left:100px;top:100px;width:80px;height:20px;overflow:hidden;font-size:16px;background:#fff;color:#000">this is a very long probe text that must be clipped</div>'
          + '<div style="position:absolute;left:1200px;top:300px;font-size:20px;white-space:nowrap;color:#fff">probe outside the stage edge</div>';
        document.querySelector('#overlay').append(h);
      });
      const r = await scan(page);
      const okClip = r.clipped.some((x) => /probe text/.test(x.text));
      const okOut = r.outside.some((x) => /probe outside/.test(x.text));
      console.log('掃描函式自我驗證：切掉', okClip, '出界', okOut);
      if (!okClip || !okOut) throw new Error('掃描函式驗證失敗');
      await page.evaluate(() => document.querySelector('#edge-probe').remove());
    }
    for (const hero of heroes) {
      for (const small of [true, false]) {
        for (const upgraded of [false, true]) {
          for (const plays of [0, 8]) {
            const key = `${lang}_${vp}_${hero}_${small ? 'small' : 'big'}_${upgraded ? 'up' : 'base'}_p${plays}`;
            if (plays > 0 && false) continue;
            const r = await page.evaluate(MEASURE, { hero, small, upgraded, plays, onlyRamp: plays > 0 });
            for (const o of r.out) results.push({ lang, vp, hero, size: small ? 'small' : 'big', upgraded, ...o });
            if (r.nBad && plays === 0) {
              await settle(page);
              const h = await page.$('#edge-cards');
              await h.screenshot({ path: shotPath(`cards_${key}.png`) }).catch(() => {});
            }
            await page.evaluate(() => document.querySelector('#edge-cards')?.remove());
          }
        }
      }
    }
    await c.close();
    console.log('done', lang, vp);
  }
}
saveJson(`cards_raw_${langs.join('')}_${vps.join('')}.json`, results);
