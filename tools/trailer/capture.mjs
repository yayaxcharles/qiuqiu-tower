#!/usr/bin/env node
/*
 * 爪破魔塔介紹片：實機錄影（2026-09-29）。只開本機網址（沿用畫面比對閘門的本機伺服器與獨立 Chrome 設定資料夾）。
 * 1920×1080、CDP 每一格（JPEG 品質 90），存成 <輸出夾>/<片名>.mp4（30 fps）。
 *
 *   npm run build && node tools/trailer/capture.mjs <輸出夾> [片名,片名…]
 *
 * 片：title、heroselect、combat_ninja、combat_feifei、combat_dangdang、combat_fengfeng、boss、map、event、shop、lang_en
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, openGame, bootRun, realClick, waitScreen, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? '../爪破介紹片/clips');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 1920, height: 1080 };
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();

const MELEE = { ninja: 'sanjo', feifei: 'feifei_feizhen', dangdang: 'dangdang_zhengquan', fengfeng: 'fengfeng_pingzhan' };
const BLOCK = { ninja: 'tanding', feifei: 'feifei_tuikai', dangdang: 'dangdang_jiapan', fengfeng: 'fengfeng_hushen' };
const CAN_ACT = () => {
  const cs = window.__app && window.__app.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false;
  const b = document.querySelector('.end-turn'); if (!b || b.disabled || b.classList.contains('disabled')) return false;
  if (document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay, .slide-overlay')) return false;
  if (document.querySelector('.hand .card.flying')) return false;
  return true;
};
const waitCanAct = (page, t = 25000) => page.waitForFunction(CAN_ACT, null, { timeout: t, polling: 60 });
const uidOf = (page, id) => page.evaluate((cid) => {
  const p = window.__app.cs.players[window.__app.seat];
  const inHand = p.hand.filter((c) => c.cardId === cid).map((c) => c.uid);
  const clickable = [...document.querySelectorAll('.hand .card.clickable')].map((n) => Number(n.dataset.uid));
  return inHand.find((u) => clickable.includes(u)) ?? null;
}, id);
async function playCard(page, id) {
  const uid = await uidOf(page, id);
  if (uid === null) return false;
  const pt = await page.evaluate(({ uid, POINT_FN }) => { const f = eval(POINT_FN); const n = document.querySelector(`.hand .card[data-uid="${uid}"]`); return n ? f(n) : null; }, { uid, POINT_FN });
  if (!pt) return false;
  await page.mouse.move(pt.x, pt.y, { steps: 6 });
  await sleep(180);
  await page.mouse.click(pt.x, pt.y);
  await sleep(140);
  if (await page.evaluate(() => !!document.querySelector('.target-catcher'))) {
    const tp = await page.evaluate(({ POINT_FN }) => {
      const f = eval(POINT_FN); const e = window.__app.cs.enemies.find((x) => !x.dead);
      const n = document.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite-box`) || document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`);
      return n ? f(n) : null;
    }, { POINT_FN });
    if (tp) { await page.mouse.move(tp.x, tp.y, { steps: 8 }); await sleep(120); await page.mouse.click(tp.x, tp.y); }
  }
  await page.mouse.move(900, 230, { steps: 4 });   // 滑鼠停在空牆上，不要壓著魔物跳出意圖提示
  return true;
}
const energy = (page) => page.evaluate(() => { window.__app.cs.players[0].energy = 9; });

/** 錄：開始螢幕擷取 → 做事 → 結束，回傳存好的 mp4 路徑 */
async function record(name, page, act) {
  const dir = join(OUT, `_${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const file = `f${String(n++).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, file), Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* 停了 */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await sleep(200);
  await act();
  await cdp.send('Page.stopScreencast').catch(() => {});
  await sleep(150);
  await cdp.detach().catch(() => {});
  // 依真實時間戳組 30 fps
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 0.033;
    lines.push(`file '${frames[i].file}'`, `duration ${Math.max(0.001, d).toFixed(4)}`);
  }
  lines.push(`file '${frames.at(-1).file}'`);
  writeFileSync(join(dir, 'list.txt'), lines.join('\n'));
  const mp4 = join(OUT, `${name}.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', mp4], { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`ffmpeg 失敗：${r.stderr}`);
  rmSync(dir, { recursive: true, force: true });
  console.log('  ✓', name, `${frames.length} 格`, `${(frames.at(-1).ts - frames[0].ts).toFixed(1)}s`);
  return mp4;
}

async function fresh(tag, lang = 'zh') {
  const c = await newContext('trailer', tag, { viewport: VIEWPORT });
  await c.page.addInitScript((l) => { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.lang', l); } catch { /* */ } } }, lang);
  return c;
}

/** 戰鬥錄影：固定手牌、飯糰 9、魔物血加厚，依序出牌，最後結束回合讓魔物打一下 */
async function combat(name, hero, enc, plays, { endTurn = true, lang = 'zh', bossLine = false } = {}) {
  const c = await fresh(name, lang);
  const { page } = c;
  await bootRun(page, server.url, hero, `trailer-${hero}`);
  const cards = [...plays, MELEE[hero], BLOCK[hero], MELEE[hero], BLOCK[hero]];
  await page.evaluate(({ cards, enc }) => {
    const app = window.__app; const orig = app.show.bind(app); let done = false;
    app.show = (nm, ...r) => {
      if (nm === 'combat' && app.cs && !done) {
        done = true;
        const p = app.cs.players[0]; let u = 97501;
        p.hand.splice(0, p.hand.length, ...cards.slice(0, 5).map((id) => ({ uid: u++, cardId: id, upgraded: false })));
        p.drawPile.splice(0, p.drawPile.length, ...cards.slice(0, 8).map((id) => ({ uid: u++, cardId: id, upgraded: false })));
        p.discardPile.splice(0, p.discardPile.length);
        p.energy = 9;
        for (const e of app.cs.enemies) { e.maxHp *= 4; e.hp = e.maxHp; }
      }
      return orig(nm, ...r);
    };
    const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true;
    app.startFight(enc);
  }, { cards, enc });
  await waitScreen(page, 'combat', 30000);
  await waitCanAct(page);
  await sleep(600);
  await record(name, page, async () => {
    await sleep(1400);   // 開場泡泡
    for (const id of plays) {
      await energy(page);
      await playCard(page, id);
      await sleep(1500);
      await waitCanAct(page).catch(() => {});
      await sleep(250);
    }
    if (endTurn) { await realClick(page, '.end-turn'); await sleep(2600); }
  });
  await c.close();
}

const want = (n) => !ONLY || ONLY.includes(n);
try {
  if (want('title')) {
    const c = await fresh('title');
    await openGame(c.page, server.url);
    await sleep(1500);
    await record('title', c.page, async () => { await sleep(3500); });
    await c.close();
  }
  if (want('heroselect')) {
    const c = await fresh('heroselect');
    const { page } = c;
    await openGame(page, server.url);
    await sleep(1200);
    await realClick(page, 'button.primary', { index: 0 });   // 新的一局
    await sleep(900);
    await record('heroselect', page, async () => {
      for (const h of ['ninja', 'feifei', 'dangdang', 'fengfeng']) {
        await realClick(page, `.hero-card[data-hero="${h}"]`);
        await sleep(1100);
      }
    });
    await c.close();
  }
  if (want('combat_ninja')) await combat('combat_ninja', 'ninja', 'cucumber_yarn', ['sanjo', 'maoqiudan']);
  if (want('combat_feifei')) await combat('combat_feifei', 'feifei', 'cucumber_yarn', ['feifei_feizhen', 'maoqiudan']);
  if (want('combat_dangdang')) await combat('combat_dangdang', 'dangdang', 'cucumber_yarn', ['dangdang_zhengquan', 'maoqiudan']);
  if (want('combat_fengfeng')) await combat('combat_fengfeng', 'fengfeng', 'cucumber_yarn', ['fengfeng_pingzhan', 'maoqiudan']);
  if (want('boss')) await combat('boss', 'ninja', 'nekomata', ['sanjo', 'maoqiudan'], { endTurn: true });
  // 地圖、罐頭鋪、貓窩、事件、戰利品：各自靜態畫面停幾秒（剪輯時用推拉鏡頭）
  const nodeScene = async (name, hero, type, waitMs = 1800) => {
    const c = await fresh(name);
    const { page } = c;
    await bootRun(page, server.url, hero, `trailer-${name}`);
    await page.evaluate(() => { for (const p of window.__app.run.players) p.bless = undefined; });
    await sleep(600);
    if (name === 'map') { await page.evaluate(() => window.__app.show('map')); await sleep(2200); await page.mouse.move(900, 90); await record(name, page, async () => { await sleep(3500); }); await c.close(); return; }
    const ok = await page.evaluate((ty) => { const r = window.__app.run; const n = r.map.nodes.find((x) => x.type === ty && r.map.nodes.some((p) => p.next.includes(x.id))); if (!n) return false; r.currentNode = r.map.nodes.find((p) => p.next.includes(n.id)).id; window.__app.enterNode(n.id); return true; }, type);
    if (!ok) { console.log('  ✗', name, '地圖沒有', type); await c.close(); return; }
    await sleep(waitMs);
    await page.mouse.move(900, 230);
    await record(name, page, async () => { await sleep(3500); });
    await c.close();
  };
  if (want('map')) await nodeScene('map', 'fengfeng', '事件');
  if (want('shop')) await nodeScene('shop', 'dangdang', '罐頭鋪');
  if (want('rest')) await nodeScene('rest', 'feifei', '貓窩', 4200);
  if (want('event')) await nodeScene('event', 'ninja', '事件', 2600);
  if (want('lang')) {
    const c = await fresh('lang');
    const { page } = c;
    await openGame(page, server.url);
    await sleep(1200);
    await record('lang', page, async () => {
      await sleep(900);
      await realClick(page, '.lang-picker button', { textRe: 'English' });
      await sleep(1600);
      await realClick(page, '.lang-picker button', { textRe: '日本語' });
      await sleep(1600);
    });
    await c.close();
  }
} finally {
  await server.close?.();
}
console.log('完成 →', OUT);
process.exit(0);
