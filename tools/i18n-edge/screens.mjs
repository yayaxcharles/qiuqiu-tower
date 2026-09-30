#!/usr/bin/env node
/*
 * 各畫面極端版面檢查（英／日 × 桌機／手機橫拿 × 四位主角）。
 *   node tools/i18n-edge/screens.mjs [en,ja] [desk,phone] [hero,…] [場景,…]
 * 每個場景截圖、掃描「文字被切／跑出舞台／省略號」；結果寫進 docs 資料夾的 screens_*.json。
 * 桌機 1280×800；手機橫拿 844×390 開觸控模擬（phone.css 才會生效）。
 */
import { HEROES, openPage, gotoGame, bootRun, sleep, saveJson, shotPath, scan, settle, waitScreen, imp } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');
const only = process.argv[5] ? process.argv[5].split(',') : null;
const TAG = process.env.EDGE_TAG ?? 'screens';

const M = (p) => `/qiuqiu-tower/src/${p}`;

const rows = [];
const errors = [];

function mk(page, ctx) {
  return async function cap(name, o = {}) {
    await sleep(o.wait ?? 450);
    const sc = await scan(page, { root: o.root });
    const bad = sc.clipped.filter((c) => !c.scroll).length + sc.outside.length + sc.ellipsis.length;
    const row = { lang: ctx.lang, vp: ctx.vp, hero: ctx.hero, name, bad, ...sc };
    if (o.extra) row.extra = await page.evaluate(o.extra.fn, o.extra.arg).catch((e) => ({ err: String(e).slice(0, 100) }));
    const file = `${TAG}_${name}_${ctx.lang}_${ctx.vp}_${ctx.hero}.jpg`;
    if (o.shot ?? (bad > 0 || ctx.hero === 'ninja')) {
      await page.screenshot({ path: shotPath(file), type: 'jpeg', quality: 72 }).catch(() => {});
      row.shot = file;
    }
    rows.push(row);
    console.log(`  ${ctx.lang}/${ctx.vp}/${ctx.hero} ${name}: bad=${bad} (切${sc.clipped.filter((c) => !c.scroll).length} 出界${sc.outside.length} 省略${sc.ellipsis.length})`);
    return row;
  };
}

const closeModal = (page) => page.evaluate(() => {
  for (const sel of ['.comp-close', '.modal-foot .btn', '.modal-overlay .btn']) { const b = document.querySelector('#overlay ' + sel); if (b) { b.click(); return true; } }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  return false;
});

const SCEN = {
  async title({ page, cap, ctx }) {
    if (ctx.hero !== 'ninja') return;
    await gotoGame(page);
    await cap('title');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.diff-btn, .difficulty button, button')].find((x) => /^5/.test(x.textContent.trim())); b?.click(); });
    await cap('title_diff5', { wait: 300 });
  },
  async compendium({ page, cap, ctx }) {
    if (ctx.hero !== 'ninja') return;
    await gotoGame(page);
    await page.evaluate(async () => { (await import('/qiuqiu-tower/src/ui/compendium.ts')).showCompendium(); });
    await sleep(500);
    for (const h of HEROES) {
      await page.evaluate((hh) => { const idx = ['ninja', 'feifei', 'dangdang', 'fengfeng'].indexOf(hh); document.querySelectorAll('#overlay .comp-hero')[idx]?.click(); }, h);
      await sleep(300);
      await cap(`compendium_${h}`, { root: '#overlay .compendium' });
    }
    await page.evaluate(() => { const c = document.querySelector('#comp-upg'); if (c) { c.checked = true; c.dispatchEvent(new Event('change')); } });
    await sleep(300);
    await cap('compendium_upg', { root: '#overlay .compendium' });
    await closeModal(page);
    await page.evaluate(async () => { (await import('/qiuqiu-tower/src/ui/itemcompendium.ts')).showItemCompendium([]); });
    await sleep(500);
    // 滾動整份圖鑑，每屏各掃一次（清單很長）
    const total = await page.evaluate(() => { const b = document.querySelector('#overlay .comp-body'); return b ? { sh: b.scrollHeight, ch: b.clientHeight } : null; });
    const pages = total ? Math.ceil(total.sh / Math.max(1, total.ch)) : 1;
    for (let i = 0; i < Math.min(pages, 30); i++) {
      await page.evaluate((n) => { const b = document.querySelector('#overlay .comp-body'); if (b) b.scrollTop = n * b.clientHeight * 0.95; }, i);
      await sleep(150);
      await cap(`itemcomp_p${String(i).padStart(2, '0')}`, { root: '#overlay .compendium', shot: i === 0, wait: 120 });
    }
    await closeModal(page);
  },
  async heroselect({ page, cap, ctx }) {
    if (ctx.hero !== 'ninja') return;
    await gotoGame(page);
    await page.evaluate(() => window.__app.show('heroselect', { seed: 'x', difficulty: 1 }));
    await waitScreen(page, 'heroselect');
    for (const h of HEROES) {
      await page.evaluate((hh) => document.querySelector(`.hero-card[data-hero="${hh}"]`)?.click(), h);
      await sleep(300);
      await cap(`heroselect_${h}`, { shot: true });
    }
  },
  async map({ page, cap }) {
    await page.evaluate(() => window.__app.show('map'));
    await cap('map');
  },
  async relics({ page, cap, ctx }) {
    if (ctx.hero !== 'ninja') return;   // 秘寶說明與主角無關，只用球球跑一次
    // 全部秘寶掛在身上：狀態列、秘寶清單視窗、滑過提示
    await page.evaluate(async () => {
      const { relics } = await import('/qiuqiu-tower/src/content/relics.ts');
      window.__relicsBackup = [...window.__app.run.players[0].relics];
      window.__app.run.players[0].relics = relics.map((r) => r.id);
      window.__app.show('map');
    });
    await cap('hud_allrelics');
    await page.evaluate(async () => { const m = await import('/qiuqiu-tower/src/ui/reliclist.ts'); m.showRelicList(window.__app.run, 0); });
    await sleep(400);
    const dim = await page.evaluate(() => { const l = document.querySelector('#overlay .relic-list'); return l ? { sh: l.scrollHeight, ch: l.clientHeight } : null; });
    const pages = dim ? Math.ceil(dim.sh / Math.max(1, dim.ch)) : 1;
    for (let i = 0; i < Math.min(pages, 30); i++) {
      await page.evaluate((n) => { const b = document.querySelector('#overlay .relic-list'); if (b) b.scrollTop = n * b.clientHeight * 0.95; }, i);
      await sleep(120);
      await cap(`relic_list_p${String(i).padStart(2, '0')}`, { root: '#overlay .relic-modal', shot: i === 0, wait: 100 });
    }
    await closeModal(page);
    await page.evaluate(() => { const app = window.__app; app.run.players[0].relics = window.__relicsBackup; app.show('map'); });
  },
  async potions({ page, cap, ctx }) {
    if (ctx.hero !== 'ninja') return;
    await page.evaluate(async () => {
      const { potions } = await import('/qiuqiu-tower/src/content/potions.ts');
      window.__potBackup = [...window.__app.run.players[0].potions];
      const longest = [...potions].sort((a, b) => b.text.length - a.text.length).slice(0, 3).map((p) => p.id);
      window.__app.run.players[0].potions = longest;
      window.__app.show('map');
    });
    await cap('hud_potions');
    await page.evaluate(() => { const app = window.__app; app.run.players[0].potions = window.__potBackup; app.show('map'); });
  },
  async rest({ page, cap }) {
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 9; r.players[0].hp = Math.max(1, r.players[0].maxHp - 30); window.__app.show('rest'); });
    await waitScreen(page, 'rest');
    await cap('rest');
    const n = await page.evaluate(() => document.querySelectorAll('#stage .scene-actions .btn').length);
    for (let i = 0; i < Math.min(n, 4); i++) {
      await page.evaluate(() => { const r = window.__app.run; r.players[0].hp = Math.max(1, r.players[0].maxHp - 30); window.__app.show('rest'); });
      await sleep(500);
      await page.evaluate((k) => { [...document.querySelectorAll('#stage .scene-actions .btn')].filter((b) => !b.disabled)[k]?.click(); }, i);
      await cap(`rest_btn${i}`, { wait: 700 });
      await closeModal(page);
    }
  },
  async chest({ page, cap }) {
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 8; window.__app.show('chest'); });
    await waitScreen(page, 'chest');
    await cap('chest_closed');
    await page.evaluate(() => { const b = document.querySelector('#stage .chest, #stage .chest-box, #stage [class*="chest"]'); (b ?? document.querySelector('#stage .scene-actions .btn'))?.click(); });
    await cap('chest_opened', { wait: 900 });
  },
  async shop({ page, cap }) {
    for (const keeper of ['orange', 'tortoise', 'curio', 'junk']) {
      await page.evaluate(async (kp) => {
        const { makeShops } = await import('/qiuqiu-tower/src/engine/run.ts');
        const run = window.__app.run; run.act = 2; run.floor = 20;
        run.players[0].fish = 9999;
        const shops = makeShops(run);
        shops[0].keeper = kp;
        window.__app.show('shop', { shops });
      }, keeper);
      await waitScreen(page, 'shop');
      await cap(`shop_${keeper}`, { wait: 900 });
    }
    // 行腳商
    await page.evaluate(async () => {
      const { makeMerchants } = await import('/qiuqiu-tower/src/engine/run.ts');
      const run = window.__app.run;
      window.__app.show('shop', { shops: makeMerchants(run), merchant: { opening: '路邊的行腳商', lines: undefined } });
    });
    await cap('shop_merchant', { wait: 900 });
  },
  async reward({ page, cap }) {
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('cucumber'); });
    await waitScreen(page, 'combat', 30000);
    await sleep(1800);
    await page.evaluate(() => { const cs = window.__app.cs; for (const e of cs.enemies) { e.hp = 0; e.dead = true; } cs.phase = 'won'; window.__app.afterCombat(); });
    await waitScreen(page, 'reward', 20000).catch(() => {});
    await cap('reward', { wait: 1400 });
  },
  async reward_elite({ page, cap }) {
    for (const enc of ['wild_boar', 'oni_general']) {
      await page.evaluate((id) => { const r = window.__app.run; r.act = id === 'oni_general' ? 3 : 1; r.floor = 6; r.flags['tut:combat'] = true; r.flags['firstElite'] = true; window.__app.startFight(id); }, enc);
      await waitScreen(page, 'combat', 30000);
      await sleep(1800);
      await page.evaluate(() => { const cs = window.__app.cs; for (const e of cs.enemies) { e.hp = 0; e.dead = true; } cs.phase = 'won'; window.__app.afterCombat(); });
      await waitScreen(page, 'reward', 20000).catch(() => {});
      await cap(`reward_elite_${enc}`, { wait: 1500 });
      await page.evaluate(() => { document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); window.__app.cs = null; window.__app.show('map'); });
      await sleep(300);
    }
  },
  async bossdoor({ page, cap }) {
    for (const act of [1, 2, 3]) {
      const enc = await page.evaluate(async (a) => {
        const { encounters } = await import('/qiuqiu-tower/src/content/enemies.ts');
        return encounters.filter((e) => e.pool === '塔主' && (!e.acts || e.acts.includes(a))).map((e) => e.id);
      }, act);
      await page.evaluate(([a, id]) => { const r = window.__app.run; r.act = a; window.__app.show('bossdoor', { encounterId: id }); }, [act, enc[0] ?? 'boss1']);
      await cap(`bossdoor_a${act}`, { wait: 700 });
    }
  },
  async actclear({ page, cap }) {
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; window.__app.show('actclear', {}); });
    await cap('actclear', { wait: 1000 });
  },
  async result({ page, cap }) {
    await page.evaluate(() => { const r = window.__app.run; r.status = 'won'; r.stats.kills = 999; r.stats.turns = 9999; r.stats.cardsPlayed = 9999; r.floor = 45; window.__app.show('result'); });
    await waitScreen(page, 'result');
    await cap('result_won', { wait: 800 });
    await page.evaluate(() => { const r = window.__app.run; r.status = 'lost'; window.__app.show('result'); });
    await cap('result_lost', { wait: 800 });
    await page.evaluate(() => { const r = window.__app.run; r.status = 'playing'; });
  },
  async modals({ page, cap, ctx }) {
    if (ctx.hero !== 'ninja') return;
    await page.evaluate(() => window.__app.show('map'));
    await sleep(300);
    // 換忍具視窗（帶滿了又拿一支：三支最長說明）
    await page.evaluate(async () => {
      const { potions } = await import('/qiuqiu-tower/src/content/potions.ts');
      const m = await import('/qiuqiu-tower/src/ui/potionswap.ts');
      const long = [...potions].sort((a, b) => b.text.length - a.text.length).map((p) => p.id);
      const run = window.__app.run; run.players[0].potions = long.slice(1, 4);
      m.showPotionSwap(run, long[0], () => {}, { apply: false, progress: '1／2' });
    });
    await cap('modal_potionswap', { root: '#overlay' });
    await page.evaluate(async () => { (await import('/qiuqiu-tower/src/ui/overlay.ts')).closeStoryOverlays(); document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); });
    // 淨化挑選
    await page.evaluate(async () => {
      const { MIASMA_PURE } = await import('/qiuqiu-tower/src/content/relics.ts');
      const m = await import('/qiuqiu-tower/src/ui/purifypick.ts');
      m.showPurifyPick(Object.keys(MIASMA_PURE), () => {}, { cancellable: true });
    });
    await cap('modal_purifypick', { root: '#overlay' });
    await page.evaluate(async () => { (await import('/qiuqiu-tower/src/ui/overlay.ts')).closeStoryOverlays(); document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); });
    // 牌組視窗（點狀態列「牌組」）
    await page.evaluate(() => { const b = [...document.querySelectorAll('.hud .btn')].find((x) => /Deck|牌組|デッキ/.test(x.textContent)); b?.click(); });
    await cap('modal_deck', { root: '#overlay' });
    await page.evaluate(async () => { (await import('/qiuqiu-tower/src/ui/overlay.ts')).closeStoryOverlays(); document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); window.__app.show('map'); });
    // 升級確認／移除確認（最長牌名的牌）
    await page.evaluate(async () => {
      const { cards } = await import('/qiuqiu-tower/src/content/cards.ts');
      const { cardName } = await import('/qiuqiu-tower/src/i18n/names.ts');
      const { describeCardText } = await import('/qiuqiu-tower/src/i18n/index.ts');
      const m = await import('/qiuqiu-tower/src/ui/confirm.ts');
      const pool = cards.filter((c) => !c.hidden && !c.combatOnly && c.pool !== '壞毛病');
      const long = [...pool].sort((a, b) => describeCardText(b, false).length + cardName(b, 'ninja').length - describeCardText(a, false).length - cardName(a, 'ninja').length)[0];
      m.showUpgradeConfirm({ uid: 1, cardId: long.id, upgraded: false }, () => {});
    });
    await cap('modal_upgrade_confirm', { root: '#overlay' });
    await page.evaluate(async () => { (await import('/qiuqiu-tower/src/ui/overlay.ts')).closeStoryOverlays(); document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); });
    await page.evaluate(async () => {
      const { cards } = await import('/qiuqiu-tower/src/content/cards.ts');
      const m = await import('/qiuqiu-tower/src/ui/confirm.ts');
      const c = cards.find((x) => x.id === 'fanpu') ?? cards[0];
      m.showRemoveConfirm({ uid: 2, cardId: c.id, upgraded: true }, 9999, () => {});
    });
    await cap('modal_remove_confirm', { root: '#overlay' });
    await page.evaluate(async () => { (await import('/qiuqiu-tower/src/ui/overlay.ts')).closeStoryOverlays(); document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); });
  },
  async blessing({ page, cap }) {
    const ids = await page.evaluate(async () => (await import('/qiuqiu-tower/src/content/blessings.ts')).BLESSINGS.map((b) => b.id));
    for (let i = 0; i < ids.length; i += 4) {
      const offer = ids.slice(i, i + 4);
      await page.evaluate((o) => { const p = window.__app.run.players[0]; p.bless = { offer: o }; window.__app.show('blessing'); }, offer);
      await sleep(300);
      await cap(`blessing_${i / 4}`, { wait: 900, extra: { fn: () => {
        const stage = document.querySelector('#stage'); const sr = stage.getBoundingClientRect(); const k = sr.width / 1280;
        const B = (e) => { const r = e.getBoundingClientRect(); return { t: Math.round((r.top - sr.top) / k), b: Math.round((r.bottom - sr.top) / k), l: Math.round((r.left - sr.left) / k), r: Math.round((r.right - sr.left) / k) }; };
        const cards = [...document.querySelectorAll('#stage .bless-card')];
        const box = document.querySelector('#stage .scene-box');
        const txt = document.querySelector('#stage .scene-box .dialogue-text');
        const rg = document.createRange(); if (txt) rg.selectNodeContents(txt);
        const lines = txt ? new Set([...rg.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top / (4 * k)))).size : 0;
        const inner = cards.map((c) => { const t = c.querySelector('.small'); return t ? { sh: t.scrollHeight, ch: t.clientHeight } : null; });
        return { cardsB: cards.length ? Math.max(...cards.map((c) => B(c).b)) : null, cardsT: cards.length ? Math.min(...cards.map((c) => B(c).t)) : null, boxT: box ? B(box).t : null, textT: txt ? B(txt).t : null, textB: txt ? B(txt).b : null, lines, len: (box?.innerText ?? '').length, inner };
      } } });
    }
    await page.evaluate(() => { window.__app.run.players[0].bless = undefined; });
  },
};

const pre = ['title', 'compendium', 'heroselect'];
const order = ['modals', 'map', 'blessing', 'relics', 'potions', 'rest', 'chest', 'shop', 'reward', 'reward_elite', 'bossdoor', 'actclear', 'result'];
for (const lang of langs) for (const vp of vps) for (const hero of heroes) {
  const ctx = { lang, vp, hero };
  const c = await openPage(lang, vp, TAG);
  const { page } = c;
  const cap = mk(page, ctx);
  try {
    for (const name of pre) {
      if (only && !only.includes(name)) continue;
      try { await SCEN[name]({ page, cap, ctx }); }
      catch (e) { errors.push(`${lang}/${vp}/${hero} ${name}: ${String(e?.message ?? e).slice(0, 240)}`); console.log('  ERR', name, String(e?.message ?? e).slice(0, 200)); }
      await page.evaluate(() => document.querySelectorAll('#overlay > *').forEach((n) => n.remove())).catch(() => {});
    }
    await bootRun(page, hero, `scr-${hero}`);
    for (const name of order) {
      if (only && !only.includes(name)) continue;
      try { await SCEN[name]({ page, cap, ctx }); }
      catch (e) { errors.push(`${lang}/${vp}/${hero} ${name}: ${String(e?.message ?? e).slice(0, 240)}`); console.log('  ERR', name, String(e?.message ?? e).slice(0, 200)); }
      // 每個場景做完回到乾淨的地圖
      await page.evaluate(() => { try { document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); window.__app.cs = null; window.__app.show('map'); } catch { /* */ } }).catch(() => {});
      await sleep(200);
    }
  } catch (e) { errors.push(`${lang}/${vp}/${hero}: ${String(e?.message ?? e).slice(0, 300)}`); console.log('FATAL', String(e?.message ?? e).slice(0, 300)); }
  finally {
    for (const l of c.logs) errors.push(`${lang}/${vp}/${hero} page: ${l.kind} ${l.text}`);
    await c.close();
  }
}
saveJson(`${TAG}_${langs.join('')}_${vps.join('')}_${heroes.join('-')}${only ? '_' + only.join('-') : ''}.json`, { rows, errors });
console.log('errors', errors.length);
for (const e of errors.slice(0, 20)) console.log(e);
