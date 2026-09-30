#!/usr/bin/env node
/*
 * 魔物意圖標籤（頭上那塊「攻 X」牌子）與魔物名稱、提示框的極端量測。
 *   node tools/i18n-edge/intents.mjs [en,ja,zh] [desk,phone] [hero,…] [步驟,…]
 * 步驟：
 *   moves   每隻魔物的每一招（含各階段），三隻一組塞進「三隻老鼠」那場，各量一次原樣、一次數字灌到三位數（傷害 188×5、多段、蜷縮 150、回復 999）
 *   enc     每場遭遇（一般、菁英、大魔物、塔主、鏡中）原樣開戰，量名字、血條、意圖、提示框、對白泡泡
 * 只有球球跑 moves（招式與主角無關）；enc 與鏡中學招每位主角都跑。
 */
import { HEROES, openPage, bootRun, sleep, saveJson, shotPath, scan, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');
const steps = (process.argv[5] ?? 'moves,enc').split(',');
const TAG = process.env.EDGE_TAG ?? 'intents';

const GEOM = () => {
  const stage = document.querySelector('#stage');
  const sr = stage.getBoundingClientRect();
  const k = sr.width / 1280;
  const S = (r) => ({ l: Math.round(((r.left - sr.left) / k) * 10) / 10, r: Math.round(((r.right - sr.left) / k) * 10) / 10, t: Math.round(((r.top - sr.top) / k) * 10) / 10, b: Math.round(((r.bottom - sr.top) / k) * 10) / 10 });
  const lines = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return new Set([...rg.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top / (4 * k)))).size; };
  return [...document.querySelectorAll('.combat .unit.enemy')].map((u) => {
    const it = u.querySelector('.intent');
    const nm = u.querySelector(':scope > .name');
    const hp = u.querySelector(':scope > .hpbar');
    return {
      id: u.dataset.id,
      unit: S(u.getBoundingClientRect()),
      intent: it ? S(it.getBoundingClientRect()) : null,
      intentText: it?.textContent ?? null,
      intentLines: it ? lines(it) : 0,
      intentOver: it ? Math.round(it.scrollWidth - it.clientWidth) : 0,
      name: nm ? S(nm.getBoundingClientRect()) : null,
      nameText: nm?.textContent ?? null,
      nameLines: nm ? lines(nm) : 0,
      nameOver: nm ? Math.round(nm.scrollWidth - nm.clientWidth) : 0,
      hp: hp ? S(hp.getBoundingClientRect()) : null,
    };
  });
};

const TIP = () => {
  const stage = document.querySelector('#stage');
  const sr = stage.getBoundingClientRect();
  const k = sr.width / 1280;
  const t = document.querySelector('#overlay .tooltip');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  return { l: Math.round((r.left - sr.left) / k), r: Math.round((r.right - sr.left) / k), t: Math.round((r.top - sr.top) / k), b: Math.round((r.bottom - sr.top) / k), text: t.innerText.slice(0, 200) };
};

const rects = (a, b) => a && b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;

const results = [];
for (const lang of langs) for (const vp of vps) for (const hero of heroes) {
  const c = await openPage(lang, vp, TAG);
  const { page } = c;
  const label = `${lang}/${vp}/${hero}`;
  try {
    await bootRun(page, hero, 'intent');
    // ---------------- moves ----------------
    if (steps.includes('moves') && hero === 'ninja') {
      await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('rats3'); });
      await waitScreen(page, 'combat', 30000);
      await sleep(2600);
      const moves = await page.evaluate(async () => {
        const { enemies } = await import('/qiuqiu-tower/src/content/enemies.ts');
        const out = [];
        const seen = new Set();
        for (const e of enemies) {
          const lists = [e.moves, ...(e.phases ?? []).map((p) => p.moves), ...(e.phases ?? []).map((p) => (p.onEnterMove ? [p.onEnterMove] : []))];
          for (const l of lists) for (const m of l ?? []) { const key = e.id + '|' + m.label + '|' + JSON.stringify(m.effects); if (seen.has(key)) continue; seen.add(key); out.push({ enemyId: e.id, move: m }); }
        }
        return out;
      });
      console.log(label, 'moves', moves.length);
      for (let i = 0; i < moves.length; i += 3) {
        for (const variant of ['plain', 'big']) {
          const batch = moves.slice(i, i + 3);
          await page.evaluate(([bt, v]) => {
            const app = window.__app; const cs = app.cs;
            cs.enemies.forEach((e, j) => {
              const src = bt[j]; if (!src) return;
              const m = JSON.parse(JSON.stringify(src.move));
              if (v === 'big') for (const fx of m.effects) {
                if (fx.kind === 'damage') { fx.amount = 188; if ((fx.times ?? 1) > 1) fx.times = 5; }
                else if (fx.kind === 'damageRandom') { fx.min = 100; fx.max = 199; }
                else if (fx.kind === 'block' || fx.kind === 'blockAllies') fx.amount = 150;
                else if (fx.kind === 'heal') { if (fx.n !== undefined) fx.n = 999; }
                else if (fx.kind === 'stealFish') fx.n = 999;
                else if (fx.kind === 'summon') fx.n = 3;
                else if (fx.kind === 'statusPlayer' || fx.kind === 'statusSelf' || fx.kind === 'statusAllies') fx.amount = 137;
              }
              e.move = m; e.statuses = {}; e.charged = false; e.invulnIn = 0;
            });
            app.show('combat');
          }, [batch, variant]);
          await sleep(220);
          await settle(page);
          const g = await page.evaluate(GEOM);
          // 滑過第一隻的意圖看提示框
          const tips = [];
          for (let j = 0; j < Math.min(3, batch.length); j++) {
            await page.evaluate((jj) => { const it = document.querySelectorAll('.combat .unit.enemy .intent')[jj]; it?.dispatchEvent(new MouseEvent('mouseenter')); }, j);
            await sleep(60);
            tips.push(await page.evaluate(TIP));
            await page.evaluate(() => { document.querySelectorAll('.combat .unit.enemy .intent').forEach((n) => n.dispatchEvent(new MouseEvent('mouseleave'))); });
          }
          batch.forEach((b, j) => {
            const u = g[j]; if (!u) return;
            const over = [];
            if (u.intent) {
              if (u.intent.r > 1280 || u.intent.l < 0) over.push('出舞台');
              g.forEach((o, q) => { if (q !== j && rects(u.intent, o.intent)) over.push('與第' + q + '隻意圖重疊'); });
              g.forEach((o, q) => { if (q !== j && rects(u.intent, o.name)) over.push('壓到第' + q + '隻名字'); });
            }
            results.push({ step: 'moves', variant, lang, vp, hero, enemyId: b.enemyId, label: b.move.label, text: u.intentText, w: u.intent ? Math.round(u.intent.r - u.intent.l) : 0, lines: u.intentLines, ov: u.intentOver, over, tip: tips[j] ? { w: tips[j].r - tips[j].l, h: tips[j].b - tips[j].t, l: tips[j].l, r: tips[j].r, t: tips[j].t, b: tips[j].b, text: tips[j].text } : null });
          });
          if (i === 0 && variant === 'big') await page.screenshot({ path: shotPath(`${TAG}_moves_${lang}_${vp}.jpg`), type: 'jpeg', quality: 72 });
        }
      }
    }
    // ---------------- enc ----------------
    if (steps.includes('enc')) {
      const encs = await page.evaluate(async () => {
        const { encounters } = await import('/qiuqiu-tower/src/content/enemies.ts');
        return encounters.map((e) => ({ id: e.id, pool: e.pool, n: e.enemies.length }));
      });
      let pick = encs.filter((e) => ['大魔物', '塔主', '召喚', '強'].includes(e.pool) || e.n >= 2);
      // 其他三位主角只補跑「會因主角而不同」的：鏡中對手／影子（學牌組、換皮）與塔主（名稱、台詞泡泡），其餘與球球那輪相同
      if (hero !== 'ninja') pick = pick.filter((e) => /^(mirror|shadow)/.test(e.id) || e.pool === '塔主');
      console.log(label, 'enc', pick.length);
      let shots = 0;
      for (const e of pick) {
        try {
          await page.evaluate(() => { try { document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); window.__app.cs = null; } catch { /* */ } });
          await page.evaluate(([id, pool]) => { const r = window.__app.run; r.act = 3; r.floor = 40; r.flags['tut:combat'] = true; window.__app.show('map'); window.__app.startFight(id, false); }, [e.id, e.pool]);
          // 關主開場有一段對白蓋在地圖上：真的點掉它（連點保護要掛上 0.7 秒以上）才會進戰鬥畫面
          for (let w = 0; w < 60; w++) {
            const st = await page.evaluate(() => ({ s: document.querySelector('#stage').dataset.screen, d: !!document.querySelector('#overlay .dialogue-overlay, #overlay .slide-overlay') }));
            if (st.s === 'combat' && !st.d) break;
            if (st.d) { await sleep(950); await page.mouse.click(640, 420); await sleep(300); } else await sleep(400);
          }
          await waitScreen(page, 'combat', 5000);
          await sleep(2300);
          await settle(page);
          const g = await page.evaluate(GEOM);
          const sc = await scan(page, { root: '.combat' });
          const tips = [];
          for (let j = 0; j < g.length; j++) {
            await page.evaluate((jj) => { const it = document.querySelectorAll('.combat .unit.enemy .intent')[jj]; it?.dispatchEvent(new MouseEvent('mouseenter')); }, j);
            await sleep(60);
            tips.push(await page.evaluate(TIP));
            await page.evaluate(() => { document.querySelectorAll('.combat .unit.enemy .intent').forEach((n) => n.dispatchEvent(new MouseEvent('mouseleave'))); });
          }
          const bad = sc.clipped.filter((c2) => !c2.scroll).length + sc.outside.length + sc.ellipsis.length;
          const row = { step: 'enc', lang, vp, hero, enc: e.id, pool: e.pool, units: g, tips, clipped: sc.clipped.filter((c2) => !c2.scroll), outside: sc.outside, ellipsis: sc.ellipsis };
          results.push(row);
          if (bad || ((e.pool === '塔主' || e.n >= 3) && hero === 'ninja') || e.id.startsWith('mirror')) {
            row.shot = `${TAG}_enc_${e.id}_${lang}_${vp}_${hero}.jpg`;
            await page.screenshot({ path: shotPath(row.shot), type: 'jpeg', quality: 70 });
            shots++;
          }
        } catch (err) { console.log('  enc ERR', e.id, String(err?.message ?? err).slice(0, 160)); }
      }
      console.log(label, 'enc done shots', shots);
    }
  } catch (e) { console.log('ERR', label, String(e?.message ?? e).slice(0, 300)); }
  finally { await c.close(); }
  saveJson(`${TAG}_${langs.join('')}_${vps.join('')}_${heroes.join('-')}.json`, results);
}
