#!/usr/bin/env node
/*
 * 語言鈕真點擊驗證（審查修正 2026-09-29）：用真的滑鼠座標點封面左上角三顆鈕（不是叫程式直接換語言），
 * 確認 ①點得到（不被整片封面蓋住）②換完語言、存進裝置 ③快速連點以最後一次為準 ④載完不把人拉回封面。
 *
 *   npm run build && node tools/i18n-click-check.mjs
 *
 * 只開本機網址（沿用畫面比對閘門的本機伺服器與獨立 Chrome 設定資料夾），離開碼 0＝全過、1＝有一項沒過。
 */
import { resolve } from 'node:path';
import { startServer } from './visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, openGame } from './visual-gate/lib/browser.mjs';
import { sleep } from './visual-gate/lib/util.mjs';

const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what); };

const c = await newContext('i18n', 'clickcheck', { viewport: { width: 1280, height: 720 } });
const { page } = c;
await openGame(page, server.url);
await sleep(800);

const state = () => page.evaluate(() => ({
  html: document.documentElement.lang,
  saved: (() => { try { return localStorage.getItem('qiuqiu.lang'); } catch { return 'ERR'; } })(),
  screen: document.querySelector('#stage')?.dataset.screen ?? null,
}));
const centerOf = async (label) => {
  const b = await page.locator('.lang-picker button', { hasText: label }).first();
  const box = await b.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const topAt = async (pt) => page.evaluate(({ x, y }) => {
  const e = document.elementFromPoint(x, y);
  return e ? `${e.tagName}.${(e.className || '').toString().split(' ')[0]}` : null;
}, pt);

// ① 三顆鈕的中心點，最上層的元素要是鈕本身
for (const label of ['繁中', 'English', '日本語']) {
  const pt = await centerOf(label);
  const top = await topAt(pt);
  check(top === 'BUTTON.btn', `「${label}」鈕中心最上層是鈕（實際：${top}）`);
}

// ② 真點 English
let pt = await centerOf('English');
await page.mouse.click(pt.x, pt.y);
await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 15000 }).catch(() => {});
let s = await state();
check(s.html === 'en' && s.saved === 'en' && s.screen === 'title', `點 English：文件語言 ${s.html}、已存 ${s.saved}、還在封面 ${s.screen}`);

// ③ 快速連點：先點日本語、馬上點繁中 → 三顆鈕在載入中都停用，第二下點不到；最後語言要是第一下的結果，且不亂
pt = await centerOf('日本語');
await page.mouse.click(pt.x, pt.y);
await page.waitForFunction(() => document.documentElement.lang === 'ja', null, { timeout: 15000 }).catch(() => {});
s = await state();
check(s.html === 'ja' && s.saved === 'ja', `點日本語：文件語言 ${s.html}、已存 ${s.saved}`);
pt = await centerOf('繁中');
await page.mouse.click(pt.x, pt.y);
await page.waitForFunction(() => document.documentElement.lang === 'zh-Hant', null, { timeout: 15000 }).catch(() => {});
s = await state();
check(s.html === 'zh-Hant' && s.saved === 'zh', `點繁中：文件語言 ${s.html}、已存 ${s.saved}`);

// ④ 慢載入中離開封面：全新的頁面（英文包還沒載過），把英文包的請求拖慢 1.5 秒，點 English 後立刻進「新的一局」，載完不能被拉回封面
const c2 = await newContext('i18n', 'clickcheck-slow', { viewport: { width: 1280, height: 720 } });
const page2 = c2.page;
await page2.route(/\/assets\/en-[^/]*\.js/, async (route) => { await sleep(1500); await route.continue(); });
await openGame(page2, server.url);
await sleep(800);
const b2 = await page2.locator('.lang-picker button', { hasText: 'English' }).first().boundingBox();
await page2.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
await page2.locator('button', { hasText: '新的一局' }).first().click();   // 語言包還在路上，封面還是繁中
await sleep(300);
const st2 = () => page2.evaluate(() => ({ html: document.documentElement.lang, screen: document.querySelector('#stage')?.dataset.screen ?? null }));
check((await st2()).screen === 'heroselect', '點完語言鈕馬上進角色選擇（載入還沒完成）');
await sleep(2800);
const s2 = await st2();
check(s2.screen === 'heroselect', `載入完成後畫面仍在角色選擇（實際：${s2.screen}）`);
check(s2.html === 'en', `語言仍然換成功（${s2.html}）`);

await server.close?.();
await c.close?.();
await c2.close?.();
process.exit(fails.length ? 1 : 0);
