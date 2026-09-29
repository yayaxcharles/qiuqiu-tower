#!/usr/bin/env node
/*
 * 狀態牌（角色腳下那排）壓力測試（2026-09-29 使用者：「英文狀態列會不會太多狀態時文字爆炸」）：
 * 給球球（我方）與一隻魔物掛滿全部狀態，三種語言 × 桌機／手機橫拿，量牌子有沒有超出舞台、互相重疊、被截；並截圖。
 *   npm run build && node tools/i18n-chips-check.mjs [輸出資料夾]
 */
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { startServer } from './visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, openGame, settle, waitScreen } from './visual-gate/lib/browser.mjs';
import { sleep } from './visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? '../qiuqiu-gate-reports/chips-check');
mkdirSync(OUT, { recursive: true });
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
const VIEWPORTS = { desk: { width: 1280, height: 720 }, phone: { width: 844, height: 390 } };
const problems = [];
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  for (const lang of ['zh', 'en', 'ja']) {
    const tag = `${lang}-${vp}`;
    const c = await newContext('i18n', `chips-${tag}`, { viewport });
    const { page } = c;
    await page.addInitScript((l) => { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.lang', l); } catch { /* */ } } }, lang);
    await openGame(page, server.url);
    await sleep(800);
    await page.evaluate(() => window.__app.newRun('chips', 1, 'ninja'));
    const run = await page.evaluate(() => JSON.stringify(window.__app.run));
    await openGame(page, server.url);
    await page.evaluate((r) => { const x = JSON.parse(r); x.flags.prologue = true; window.__app.continueRun(x); }, run);
    await page.waitForFunction(() => ['map', 'blessing'].includes(document.querySelector('#stage')?.dataset.screen), null, { timeout: 30000 });
    await page.evaluate(() => { for (const p of window.__app.run.players) p.bless = undefined; });
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('cucumber_yarn'); });
    await waitScreen(page, 'combat', 30000);
    await sleep(2500);
    // 掛滿全部狀態（我方＋每隻魔物），再重畫
    await page.evaluate(() => {
      const cs = window.__app.cs;
      const names = ['爪力', '貓步', '翻肚', '懶洋洋', '炸毛', '中毒', '隱身', '定身', '反彈', '潛水', '縮殼', '飛行', '鱗甲', '沉睡', '消散', '虛化', '不壞身', '鐵布衫', '迷魂', '蓄氣', '蜷縮', '防禦'];
      for (const u of [cs.players[0], ...cs.enemies]) { u.statuses = u.statuses ?? {}; for (const n of names) u.statuses[n] = 3; u.block = 12; }
      window.__app.show('combat');
    });
    await sleep(1200);
    await settle(page);
    await page.screenshot({ path: join(OUT, `${tag}.png`) });
    const rep = await page.evaluate(() => {
      const stage = document.querySelector('#stage')?.getBoundingClientRect();
      const out = [];
      for (const row of document.querySelectorAll('.combat .chips')) {
        const r = row.getBoundingClientRect();
        const chips = [...row.querySelectorAll('.chip')].map((x) => x.getBoundingClientRect());
        const unit = row.closest('.unit')?.className ?? '?';
        const outside = chips.filter((b) => b.right > stage.right + 1 || b.left < stage.left - 1 || b.bottom > stage.bottom + 1).length;
        const clipped = [...row.querySelectorAll('.chip')].filter((x) => x.scrollWidth > x.clientWidth + 1).length;
        out.push({ unit, n: chips.length, w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), outside, clipped, cls: row.className });
      }
      return { stage: stage && { w: Math.round(stage.width), h: Math.round(stage.height) }, rows: out };
    });
    console.log(tag, JSON.stringify(rep));
    for (const r of rep.rows) if (r.outside || r.clipped) problems.push(`${tag} ${r.unit}: 超出舞台 ${r.outside}、字被截 ${r.clipped}`);
    await c.close?.();
  }
}
await server.close?.();
console.log(problems.length ? `有 ${problems.length} 處：\n${problems.join('\n')}` : '全部沒問題');
process.exit(problems.length ? 1 : 0);
