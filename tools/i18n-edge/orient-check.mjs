#!/usr/bin/env node
/*
 * 轉向重量實測（審查後加）：手機先直拿畫好畫面、再轉橫，退讓的結果要跟「一開始就橫拿」完全一樣。
 *   node tools/i18n-edge/orient-check.mjs [en,ja,zh]
 * 情境：狀態列（極端：12 件秘寶難度 5；平常：4 件秘寶難度 1）、事件長文（貪心商人開場）、開局祝福（第三組）、獲得物展示（貪心商人結果）。
 * 每個情境各跑兩條路：A＝直拿開場→畫好→轉橫；B＝橫拿開場→畫好。比對狀態列右緣與類別、對白框類別、祝福類別、獲得物類別。
 */
import { openPage, bootRun, sleep, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja,zh').split(',');

const HUD = () => {
  const stage = document.querySelector('#stage'); const sr = stage.getBoundingClientRect(); const k = sr.width / 1280;
  const hud = document.querySelector('.hud');
  const vis = [...hud.children].filter((c) => c.getBoundingClientRect().width > 0);
  return { cls: hud.className, maxRight: Math.max(...vis.map((c) => Math.round((c.getBoundingClientRect().right - sr.left) / k))), relics: hud.querySelectorAll('.hud-relic').length, more: hud.querySelector('.hud-relic-more')?.textContent ?? '' };
};
const SCENE = () => { const sc = document.querySelector('#stage .scene'); return sc ? [...sc.classList].filter((c) => /fit|scroll/.test(c)).sort().join(' ') : ''; };
const LOOT = () => { const b = document.querySelector('#stage .scene-art .showcase.icons'); return b ? [...b.classList].filter((c) => /fit/.test(c)).join(' ') : ''; };

async function scenario(lang, startPortrait, name) {
  const c = await openPage(lang, startPortrait ? 'portrait' : 'phone', 'orient');
  const { page } = c;
  try {
    await bootRun(page, 'fengfeng', 'orient', name === 'bless');
    const ids = await page.evaluate(async () => (await import('/qiuqiu-tower/src/content/relics.ts')).relics.filter((r) => r.pool !== '起始').map((r) => r.id));
    const setHud = (n, d) => page.evaluate(([n2, d2, l]) => { const r = window.__app.run; const p = r.players[0]; r.act = 2; r.difficulty = d2; r.currentNode = null; p.relics = l.slice(0, n2); p.fish = 120; p.maxHp = 176; p.hp = 176; p.potions = []; }, [n, d, ids]);
    if (name === 'hud-heavy' || name === 'hud-mid') {
      await setHud(name === 'hud-heavy' ? 12 : 4, name === 'hud-heavy' ? 5 : 1);
      await page.evaluate(() => window.__app.show('map'));
    } else if (name === 'event') {
      await page.evaluate(() => { window.__app.run.players[0].fish = 500; window.__app.enterEvent('greedy_merchant'); });
      await waitScreen(page, 'event', 20000);
    } else if (name === 'loot') {
      await page.evaluate(() => { window.__app.run.players[0].fish = 500; window.__app.enterEvent('greedy_merchant'); });
      await waitScreen(page, 'event', 20000);
      await sleep(900);
      await page.evaluate(() => { const bs = [...document.querySelectorAll('#stage .scene-actions .btn')].filter((b) => !b.disabled); bs[3]?.click(); });
    } else if (name === 'bless') {
      await page.evaluate(async () => { const ids = (await import('/qiuqiu-tower/src/content/blessings.ts')).BLESSINGS.map((b) => b.id); window.__app.run.players[0].bless = { offer: ids.slice(8, 12) }; window.__app.show('blessing'); });
    }
    await sleep(1200);
    if (startPortrait) {
      await page.setViewportSize({ width: 844, height: 390 });
      await sleep(1500);
    }
    await settle(page);
    return { hud: await page.evaluate(HUD), scene: await page.evaluate(SCENE), loot: await page.evaluate(LOOT) };
  } finally { await c.close(); }
}

let bad = 0;
for (const lang of langs) for (const name of ['hud-heavy', 'hud-mid', 'event', 'loot', 'bless']) {
  const a = await scenario(lang, true, name);
  const b = await scenario(lang, false, name);
  const same = JSON.stringify(a) === JSON.stringify(b) && a.hud.maxRight <= 1281;
  if (!same) bad++;
  console.log(lang, name, same ? '一致' : '不一致', '\n   直拿→橫拿', JSON.stringify(a), '\n   橫拿開場  ', JSON.stringify(b));
}
console.log('不一致', bad);
