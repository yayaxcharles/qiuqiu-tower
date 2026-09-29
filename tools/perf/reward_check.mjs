#!/usr/bin/env node
/*
 * 獎勵畫面牌面到位檢查（2026-09-29）：慢網路（1.6 Mbps／150 毫秒）、冷快取，開局後很快打贏第一場，
 * 看獎勵畫面**一出現的那一刻**三張牌面是不是已經載好。無頭、只開本機網址。
 *
 *   npm run build && node tools/perf/reward_check.mjs
 */
import { resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
let bad = 0;
for (const hero of ['feifei', 'fengfeng', 'dangdang']) {
  const c = await newContext('perf', 'reward-' + hero);
  const { page } = c;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 94000 });
  await bootRun(page, server.url, hero, 'reward-' + hero);   // 全程慢網路：開局後背景才開始抓這一位的牌面
  await page.evaluate(() => { const app = window.__app; const r = app.run; for (const p of r.players) p.bless = undefined; r.flags['tut:combat'] = true;
    const orig = app.show.bind(app); let done = false;
    app.show = (nm, ...x) => { if (nm === 'combat' && app.cs && !done) { done = true; for (const e of app.cs.enemies) e.hp = 1; } return orig(nm, ...x); };
    app.startFight('cucumber_yarn'); });
  await waitScreen(page, 'combat', 120000);
  // 把魔物全部打掉：直接結束戰鬥比出牌穩（這裡量的是獎勵畫面的圖，不是出牌）
  await sleep(Number(process.env.FIGHT_MS ?? 800));   // 這一場打多久（實際玩大約二三十秒）
  const t0 = Date.now();
  await page.evaluate(() => { const cs = window.__app.cs; for (const e of cs.enemies) { e.hp = 0; e.dead = true; } cs.phase = 'won'; window.__app.afterCombat(); });
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen === 'reward', null, { timeout: 30000, polling: 16 });
  const at = (Date.now() - t0) / 1000;
  const all = await page.evaluate(() => [...document.querySelectorAll('#screen img')].map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: (i.getAttribute('src') || '').split('/').slice(-2).join('/'), card: !!i.closest('.card') })));
  const st = all.filter((x) => x.card).map((x) => x.ok);
  console.log('   沒到：', all.filter((x) => !x.ok).map((x) => x.src).join(' '));
  const miss = st.filter((x) => !x).length;
  await sleep(150);
  const later = await page.evaluate(() => [...document.querySelectorAll('#screen .card img')].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => (i.getAttribute('src') || '').split('/').pop()));
  console.log('   0.15 秒後還沒到：', later.join(' ') || '無');
  if (later.length) bad++;
  console.log(hero, `獎勵畫面 ${at.toFixed(2)} 秒出現；牌面 ${st.length} 張、出現當下沒到 ${miss} 張`);
  await c.close();
}
server.close?.();
process.exit(bad ? 1 : 0);
