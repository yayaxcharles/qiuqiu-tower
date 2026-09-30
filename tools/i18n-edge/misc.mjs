#!/usr/bin/env node
/*
 * 雜項：連線大廳各步驟（不真的連線：只走「不碰網路」的那幾步）、手機直立的「請橫過來玩」提示卡。
 *   node tools/i18n-edge/misc.mjs [en,ja,zh]
 */
import { openPage, gotoGame, sleep, saveJson, shotPath, scan, settle, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const rows = [];

for (const lang of langs) {
  // ---- 連線大廳（桌機、手機橫拿）----
  for (const vp of ['desk', 'phone']) {
    const c = await openPage(lang, vp, 'misc');
    const { page } = c;
    try {
      await page.evaluate(() => window.__app.show('lobby'));
      await waitScreen(page, 'lobby');
      const shots = [];
      const cap = async (name) => {
        await sleep(350);
        const sc = await scan(page);
        const bad = sc.clipped.filter((x) => !x.scroll).length + sc.outside.length + sc.ellipsis.length;
        const file = `misc_${name}_${lang}_${vp}.jpg`;
        await page.screenshot({ path: shotPath(file), type: 'jpeg', quality: 72 });
        rows.push({ lang, vp, name, bad, clipped: sc.clipped.filter((x) => !x.scroll), outside: sc.outside, ellipsis: sc.ellipsis, shot: file });
        console.log(lang, vp, name, 'bad', bad);
      };
      await cap('lobby_pick');
      // 切「貼碼直連」模式（畫面上第二顆小按鈕）
      await page.evaluate(() => { const b = [...document.querySelectorAll('.lobby button')].find((x) => x.classList.contains('small') && !x.classList.contains('lobby-back') && !x.classList.contains('diff-btn') && !x.closest('.lobby-hero-row')); b?.click(); });
      await cap('lobby_pick_direct');
      await page.evaluate(() => { const b = [...document.querySelectorAll('.lobby button')].find((x) => x.classList.contains('small') && !x.classList.contains('lobby-back') && !x.classList.contains('diff-btn') && !x.closest('.lobby-hero-row')); b?.click(); });
      await sleep(200);
      // 我要加入（第二顆大按鈕）
      await page.evaluate(() => { const bs = [...document.querySelectorAll('.lobby .lobby-row .btn')]; bs[1]?.click(); });
      await cap('lobby_join');
      // 不輸入直接按加入 → 「房號是六位數字…」失敗訊息（不碰網路）
      await page.evaluate(() => { document.querySelector('.lobby .lobby-row .btn.primary')?.click(); });
      await sleep(400);
      await cap('lobby_failed');
      await page.evaluate(() => { const b = [...document.querySelectorAll('.lobby button')].find((x) => x.classList.contains('btn') && !x.classList.contains('small')); b?.click(); });
      await sleep(300);
      // 貼碼直連的「我要加入」
      await page.evaluate(() => { const b = [...document.querySelectorAll('.lobby button')].find((x) => x.classList.contains('small') && !x.classList.contains('lobby-back') && !x.classList.contains('diff-btn') && !x.closest('.lobby-hero-row')); b?.click(); });
      await sleep(200);
      await page.evaluate(() => { const bs = [...document.querySelectorAll('.lobby .lobby-row .btn')]; bs[1]?.click(); });
      await cap('lobby_join_direct');
    } catch (e) { console.log('ERR lobby', lang, vp, String(e?.message ?? e).slice(0, 200)); }
    finally { await c.close(); }
  }
  // ---- 手機直立 ----
  {
    const c = await openPage(lang, 'portrait', 'misc');
    const { page } = c;
    try {
      await sleep(600);
      const m = await page.evaluate(() => {
        const h = document.querySelector('#rotate-hint');
        const card = h?.querySelector('.rotate-card');
        const r = card?.getBoundingClientRect();
        const cs = h ? getComputedStyle(h) : null;
        const lines = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return new Set([...rg.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top / 4))).size; };
        return { display: cs?.display, orient: document.documentElement.dataset.orient, device: document.documentElement.dataset.device, card: r ? { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) } : null, vw: innerWidth, vh: innerHeight, text: card?.innerText.replace(/\s+/g, ' '), lines: card ? lines(card) : 0, sw: card ? card.scrollWidth - card.clientWidth : 0 };
      });
      const file = `misc_portrait_${lang}.jpg`;
      await page.screenshot({ path: shotPath(file), type: 'jpeg', quality: 72 });
      rows.push({ lang, vp: 'portrait', name: 'rotate_hint', m, shot: file });
      console.log(lang, 'portrait', JSON.stringify(m));
    } catch (e) { console.log('ERR portrait', lang, String(e?.message ?? e).slice(0, 200)); }
    finally { await c.close(); }
  }
}
saveJson(`misc_${langs.join('')}.json`, rows);
