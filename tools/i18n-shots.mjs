#!/usr/bin/env node
/*
 * 多語系截圖（2026-09-29 第一片）：三種語言 × 桌機 1280×720／手機橫拿 844×390，
 * 封面（選語系）、地圖、戰鬥（手牌＋名詞提示＋魔物意圖）、戰利品、罐頭鋪、貓窩各一張。
 *
 *   npm run build && node tools/i18n-shots.mjs [輸出資料夾]
 *
 * 只開本機網址（沿用畫面比對閘門的本機伺服器與獨立 Chrome 設定資料夾，不碰線上存檔）。
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from './visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, openGame, settle, waitScreen } from './visual-gate/lib/browser.mjs';
import { sleep } from './visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? '../qiuqiu-gate-reports/i18n-0929');
const SITE = 'qiuqiu-tower';
const LANGS = ['zh', 'en', 'ja'];
const VIEWPORTS = { desk: { width: 1280, height: 720 }, phone: { width: 844, height: 390 } };

const server = await startServer(resolve('dist'), SITE);
const url = server.url;
await loadPlaywright();
mkdirSync(OUT, { recursive: true });
const problems = [];

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('  ', name);
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const lang of LANGS) {
    const tag = `${lang}-${vpName}`;
    const c = await newContext('i18n', tag, { viewport });
    const { page } = c;
    await page.addInitScript((l) => { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.lang', l); } catch (e) { /* */ } } }, lang);
    try {
      await openGame(page, url);
      await sleep(800);
      await shot(page, `${tag}_1_title`);
      // 開一局、跳過序章（同閘門的 bootRun）
      await page.evaluate(() => window.__app.newRun('i18n-shots', 1, 'ninja'));
      await sleep(150);
      const run = await page.evaluate(() => JSON.stringify(window.__app.run));
      await openGame(page, url);
      await page.evaluate((r) => { const x = JSON.parse(r); x.flags.prologue = true; window.__app.continueRun(x); }, run);
      await page.waitForFunction(() => ['map', 'blessing'].includes(document.querySelector('#stage')?.dataset.screen), null, { timeout: 30000 });
      await sleep(600);
      if (await page.evaluate(() => document.querySelector('#stage').dataset.screen) === 'blessing') {
        await shot(page, `${tag}_1b_blessing`);
        await page.evaluate(() => { window.__app.run.players[0].bless = undefined; window.__app.show('map'); });
        await sleep(400);
      }
      await shot(page, `${tag}_2_map`);
      // 戰鬥：挑一場會給減益的遭遇，手牌放幾張代表牌
      await page.evaluate(() => {
        const app = window.__app; const orig = app.show.bind(app); let done = false;
        app.show = (name, ...r) => {
          if (name === 'combat' && app.cs && !done) {
            done = true;
            const p = app.cs.players[0]; let u = 97501;
            p.hand.splice(0, p.hand.length, ...['sanjo', 'shengdong', 'tanding', 'kawarimi', 'shunshou'].map((id) => ({ uid: u++, cardId: id, upgraded: id === 'shengdong' })));
          }
          return orig(name, ...r);
        };
        const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true;
        app.startFight('cucumber_yarn');
      });
      await waitScreen(page, 'combat', 30000);
      await sleep(3000);
      await shot(page, `${tag}_3_combat`);
      const kw = await page.$('.hand .card .kw') ?? await page.$('.card .kw');
      if (kw) { await kw.dispatchEvent('mouseenter'); await sleep(300); await shot(page, `${tag}_4_combat_tip`); } else problems.push(`${tag}: 找不到牌面名詞`);
      const intent = await page.$('.intent') ?? await page.$('[class*="intent"]');
      if (intent) { await intent.dispatchEvent('mouseenter'); await sleep(300); await shot(page, `${tag}_5_intent_tip`); } else problems.push(`${tag}: 找不到意圖`);
      // 戰利品：直接判贏
      await page.mouse.move(5, 5);
      await page.evaluate(() => { const cs = window.__app.cs; for (const e of cs.enemies) { e.hp = 0; e.dead = true; } cs.phase = 'won'; window.__app.afterCombat(); });
      await waitScreen(page, 'reward', 15000).catch(() => problems.push(`${tag}: 沒進戰利品`));
      await sleep(900);
      await shot(page, `${tag}_6_reward`);
      // 罐頭鋪、貓窩：找地圖上第一格那種節點直接進去
      for (const [type, name] of [['罐頭鋪', '7_shop'], ['貓窩', '8_rest']]) {
        const ok = await page.evaluate((ty) => { const r = window.__app.run; const n = r.map.nodes.find((x) => x.type === ty && r.map.nodes.some((p) => p.next.includes(x.id))); if (!n) return false; r.currentNode = r.map.nodes.find((p) => p.next.includes(n.id)).id; window.__app.enterNode(n.id); return true; }, type);
        if (!ok) { problems.push(`${tag}: 地圖沒有${type}`); continue; }
        await sleep(1500);
        await shot(page, `${tag}_${name}`);
      }
    } catch (e) {
      problems.push(`${tag}: ${String(e?.message ?? e).slice(0, 200)}`);
    } finally {
      for (const l of c.logs) problems.push(`${tag}: ${l.kind} ${l.text}`);
      await c.close();
    }
  }
}
await server.close();
console.log(problems.length ? `問題：\n${problems.join('\n')}` : '全部截完');
