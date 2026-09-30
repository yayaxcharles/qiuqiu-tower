#!/usr/bin/env node
/*
 * 戰鬥畫面壓力測試：主角與三隻魔物同時掛滿全部狀態（三位數）、全部能力牌、蜷縮三位數；量狀態列、提示框、血條、手牌有沒有互相蓋住或跑出舞台。
 *   node tools/i18n-edge/combat-stress.mjs [en,ja] [desk,phone] [hero,…]
 */
import { HEROES, openPage, bootRun, sleep, saveJson, shotPath, scan, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');

const GEOM = () => {
  const stage = document.querySelector('#stage');
  const sr = stage.getBoundingClientRect();
  const k = sr.width / 1280;
  const S = (r) => ({ l: (r.left - sr.left) / k, t: (r.top - sr.top) / k, r: (r.right - sr.left) / k, b: (r.bottom - sr.top) / k });
  const units = [...document.querySelectorAll('.combat .unit')].map((u) => ({
    cls: u.className.replace(/\s+/g, '.'),
    unit: S(u.getBoundingClientRect()),
    chips: u.querySelector(':scope > .chips') ? S(u.querySelector(':scope > .chips').getBoundingClientRect()) : null,
    nChips: u.querySelectorAll(':scope > .chips > .chip').length,
    chipRows: (() => { const tops = new Set([...u.querySelectorAll(':scope > .chips > .chip')].map((c) => Math.round(c.getBoundingClientRect().top / (3 * k)))); return tops.size; })(),
    chipsMany: u.querySelector(':scope > .chips')?.classList.contains('many') ?? false,
    hp: u.querySelector('.hpbar') ? S(u.querySelector('.hpbar').getBoundingClientRect()) : null,
    intent: u.querySelector('.intent') ? S(u.querySelector('.intent').getBoundingClientRect()) : null,
    intentText: u.querySelector('.intent')?.textContent ?? null,
    name: u.querySelector('.name, .unit-name') ? S(u.querySelector('.name, .unit-name').getBoundingClientRect()) : null,
    sprite: u.querySelector('.sprite') ? S(u.querySelector('.sprite').getBoundingClientRect()) : null,
  }));
  const cards = [...document.querySelectorAll('.combat .hand .card')].map((c) => S(c.getBoundingClientRect()));
  const chipSmall = [...document.querySelectorAll('.combat .chip')].map((c) => parseFloat(getComputedStyle(c).fontSize));
  return { units, handTop: cards.length ? Math.min(...cards.map((c) => c.t)) : null, nCards: cards.length, minChipFont: Math.min(...chipSmall), maxChipFont: Math.max(...chipSmall) };
};

const results = [];
const problems = [];
for (const lang of langs) for (const vp of vps) for (const hero of heroes) {
  const tag = `${lang}_${vp}_${hero}`;
  const c = await openPage(lang, vp, 'cstress');
  const { page } = c;
  try {
    await bootRun(page, hero, 'cstress');
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('rats3'); });
    await waitScreen(page, 'combat', 30000);
    await sleep(2600);
    // 基準：沒掛狀態的樣子
    await settle(page);
    const base = await page.evaluate(GEOM);
    await page.screenshot({ path: shotPath(`combat_base_${tag}.png`) });
    // 掛滿
    await page.evaluate(async (h) => {
      const app = window.__app;
      const cs = app.cs;
      const { STATUS_ORDER } = await import('/qiuqiu-tower/src/ui/status-kind.ts');
      const { cards } = await import('/qiuqiu-tower/src/content/cards.ts');
      const powerIds = cards.filter((c) => c.type === 'power' && (!c.hero || c.hero === h) && !c.hidden && !c.combatOnly).map((c) => c.id);
      const units = [cs.players[0], ...cs.enemies];
      let i = 0;
      for (const u of units) {
        u.statuses = {};
        for (const n of STATUS_ORDER) u.statuses[n] = i % 2 === 0 ? 137 : 88;
        u.block = 999;
        i++;
      }
      const p = cs.players[0];
      p.powers = powerIds.flatMap((id, j) => Array.from({ length: j % 3 === 0 ? 12 : 1 }, () => ({ cardId: id, upgraded: j % 2 === 0, trigger: 'passive', effects: [] })));
      p.poisonNextAttack = { amount: 150, anyDamage: true };
      p.energyNextTurn = 99;
      p.guardLethal = true;
      if (p.qi !== undefined || p.hero === 'fengfeng') p.qi = 12;
      app.show('combat');
    }, hero);
    await sleep(1400);
    await settle(page);
    const stress = await page.evaluate(GEOM);
    const sc = await scan(page);
    await page.screenshot({ path: shotPath(`combat_stress_${tag}.png`) });
    results.push({ tag, lang, vp, hero, base, stress, scan: sc });
    console.log(tag, 'ok chips', stress.units.map((u) => u.nChips + '/' + u.chipRows).join(' '), 'clipped', sc.clipped.length, 'outside', sc.outside.length);
  } catch (e) {
    problems.push(`${tag}: ${String(e?.message ?? e).slice(0, 300)}`);
    console.log(tag, 'ERR', String(e?.message ?? e).slice(0, 300));
  } finally {
    for (const l of c.logs) problems.push(`${tag}: ${l.kind} ${l.text}`);
    await c.close();
  }
}
saveJson(`combat_stress_${langs.join('')}_${vps.join('')}_${heroes.join('-')}.json`, { results, problems });
