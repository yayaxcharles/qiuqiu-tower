#!/usr/bin/env node
/*
 * 事件畫面掃描（多語系第三片，2026-09-29）：英文／日文下，把每一篇事件 × 每位主角的開場、每個選項按下去的結果畫面都跑一遍，
 * 抓畫面上殘留的中文（英文）或台灣字形（日文），列出來。只開本機網址，不碰線上存檔。
 *
 *   npm run build && node tools/i18n-event-sweep.mjs [en|ja] [主角,主角…] [輸出檔]
 *
 * 離開碼 0＝沒有殘留、1＝有殘留（清單寫進輸出檔）。
 */
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { startServer } from './visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, openGame } from './visual-gate/lib/browser.mjs';
import { sleep } from './visual-gate/lib/util.mjs';

const lang = process.argv[2] ?? 'en';
const heroes = (process.argv[3] ?? 'ninja,feifei,dangdang,fengfeng').split(',');
const OUT = process.argv[4] ?? `../qiuqiu-gate-reports/event-sweep-${lang}.txt`;
const CJK = /[㐀-鿿]/g;
const ZH_ONLY = /[貓鋪寶獲彈數體們點雙對從與闆噹糰]/g;
const bad = (s) => (lang === 'en' ? (s.match(/[㐀-鿿][㐀-鿿，。！？「」…、：；（）]*/g) ?? []) : (s.match(/[貓鋪寶獲彈數體們點雙對從與闆噹糰][^s]{0,6}/g) ?? []));

const eventIds = JSON.parse(readFileSync('tools/i18n/source/event_ids.json', 'utf-8'));   // I18N_EXTRACT=1 npx vitest run tools/i18n_extract.test.ts 產生
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
const findings = [];
let renders = 0;

for (const hero of heroes) {
  const c = await newContext('i18n', `sweep-${lang}-${hero}`, { viewport: { width: 1280, height: 720 } });
  const { page } = c;
  await page.addInitScript((l) => { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.lang', l); } catch { /* */ } } }, lang);
  await openGame(page, server.url);
  await sleep(800);
  await page.evaluate((h) => window.__app.newRun('sweep', 1, h), hero);
  const run = await page.evaluate(() => JSON.stringify(window.__app.run));
  await openGame(page, server.url);
  const enter = async (eventId) => {
    await page.evaluate((r) => { const x = JSON.parse(r); x.flags.prologue = true; window.__app.continueRun(x); }, run);
    await page.waitForFunction(() => ['map', 'blessing'].includes(document.querySelector('#stage')?.dataset.screen), null, { timeout: 30000 });
    await page.evaluate(() => { const r = window.__app.run; for (const p of r.players) p.bless = undefined; });
    await page.evaluate((id) => { window.__app.enterEvent(id); }, eventId);
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen === 'event', null, { timeout: 15000 }).catch(() => {});
    await sleep(350);
  };
  for (const id of eventIds) {
    await enter(id);
    const text0 = await page.evaluate(() => document.querySelector('#stage')?.innerText ?? '');
    renders++;
    for (const m of new Set(bad(text0))) findings.push(`${lang} ${hero} ${id} 開場：${m}｜${text0.replace(/\s+/g, ' ').slice(0, 160)}`);
    const n = await page.evaluate(() => document.querySelectorAll('#stage .scene-actions .btn, #stage .btn').length);
    for (let i = 0; i < Math.min(n, 5); i++) {
      await enter(id);
      const clicked = await page.evaluate((k) => {
        const bs = [...document.querySelectorAll('#stage .scene-actions .btn')].filter((b) => !b.disabled);
        const b = bs[k]; if (!b) return false; b.click(); return true;
      }, i);
      if (!clicked) break;
      await sleep(450);
      const t = await page.evaluate(() => document.querySelector('#stage')?.innerText ?? '');
      renders++;
      for (const m of new Set(bad(t))) findings.push(`${lang} ${hero} ${id} 選項${i}：${m}｜${t.replace(/\s+/g, ' ').slice(0, 200)}`);
    }
  }
  await c.close?.();
}
await server.close?.();
writeFileSync(OUT, findings.join('\n') + '\n', 'utf-8');
console.log(`跑了 ${renders} 個畫面，殘留 ${findings.length} 處 → ${OUT}`);
process.exit(findings.length ? 1 : 0);
