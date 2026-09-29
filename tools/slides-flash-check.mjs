#!/usr/bin/env node
/*
 * 序章幻燈片「閃回上一張圖」驗證（2026-09-29 使用者回報）：把序章的圖請求各拖慢 700 毫秒（模擬慢網路），
 * 真的點「新的一局」→ 選角色 → 「出發」，逐幀（requestAnimationFrame）記下幻燈片框裡看得見的圖，然後連點推進。
 * 過關條件：①按下出發後、第一張圖到之前，幻燈片框不可見（不露出選角畫面）
 *          ②任何一幀看得見的圖都只能是「現在這張」或「前一張」，不可以出現更早的圖。
 *   npm run build && node tools/slides-flash-check.mjs [ninja|feifei|dangdang|fengfeng]
 */
import { resolve } from 'node:path';
import { startServer } from './visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, openGame } from './visual-gate/lib/browser.mjs';
import { sleep } from './visual-gate/lib/util.mjs';

const hero = process.argv[2] ?? 'ninja';
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
const c = await newContext('slides', `flash-${hero}`, { viewport: { width: 1280, height: 720 } });
const { page } = c;
await page.route(/\/assets\/bg\/.*(still|story|prologue|_p0)/, async (route) => { await sleep(700); await route.continue(); });
await openGame(page, server.url);
await sleep(1200);
await page.evaluate(() => {
  window.__log = [];
  const tick = () => {
    const box = document.querySelector('.slide-overlay');
    const imgs = box ? [...box.querySelectorAll('.slide-img')] : [];
    const seen = imgs.filter((im) => getComputedStyle(im).opacity > 0.05 && im.getAttribute('src')).map((im) => im.getAttribute('src').split('/').pop());
    window.__log.push({ box: !!box, visible: box ? getComputedStyle(box).visibility !== 'hidden' : false, seen, text: box?.querySelector('.dialogue-text')?.textContent ?? '' });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.locator('button.primary').first().click();      // 新的一局
await sleep(500);
await page.locator(`.hero-card[data-hero="${hero}"]`).click();
await sleep(800);
await page.locator('button.primary').last().click();       // 就○○了，出發
const t0 = Date.now();
// 連點推進（每 150 毫秒一下，比圖到得快）
for (let k = 0; k < 40; k++) {
  await sleep(150);
  await page.mouse.click(640, 400);
}
await sleep(1500);
const log = await page.evaluate(() => window.__log);
const frames = log.filter((f) => f.box);
console.log('幻燈片框出現的幀數', frames.length, '共', log.length, '幀', `${Date.now() - t0}ms`);
const problems = [];
const order = [];
for (const f of frames) for (const s of f.seen) if (!order.includes(s)) order.push(s);
console.log('看到的圖（依出現順序）', order.join(' → '));
// ①框可見但沒有任何圖（露出底下畫面）
const emptyVisible = frames.filter((f) => f.visible && f.seen.length === 0).length;
if (emptyVisible) { const idx = frames.map((f, i) => (f.visible && f.seen.length === 0 ? i : -1)).filter((i) => i >= 0); console.log('空幀位置', idx.join(','), '共', frames.length, '文字', JSON.stringify(idx.slice(0, 3).map((i) => frames[i].text.slice(0, 20)))); problems.push(`框已可見卻沒有圖的幀：${emptyVisible}`); }
// ②不可回頭看到更早的圖
let maxIdx = -1;
let back = 0;
for (const f of frames) {
  for (const s of f.seen) {
    const idx = order.indexOf(s);
    if (idx > maxIdx) maxIdx = idx;
    else if (idx < maxIdx - 1) back++;
  }
}
if (back) problems.push(`回頭看到兩張以前的圖的幀：${back}`);
console.log(problems.length ? `✗ ${problems.join('；')}` : '✓ 沒有閃回、沒有露出底下畫面');
await server.close?.();
await c.close?.();
process.exit(problems.length ? 1 : 0);
