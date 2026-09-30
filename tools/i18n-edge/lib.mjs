// 英日極端版面檢查（2026-09-30）共用零件。
// 只開本機網址（vite 開發伺服器，埠由環境變數 EDGE_PORT 決定，預設 5231）；瀏覽器一律走閘門的 browser.mjs（獨立 user-data-dir）。
// 用開發伺服器而不是 dist：頁面裡可以直接 import('/qiuqiu-tower/src/…') 拿到牌表、劇本、畫面函式，逐張逐句量。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync, mkdirSync as mk2, rmSync } from 'node:fs';
import { loadPlaywright, killOwnChrome, PROFILE_ROOT, settle, waitScreen } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

export { sleep, settle, waitScreen, mkdirSync, writeFileSync, join };

export const PORT = process.env.EDGE_PORT ?? '5241';
export const BASE = `http://127.0.0.1:${PORT}/qiuqiu-tower/`;
export const OUT = process.env.EDGE_OUT ?? 'F:/ClaudeWork/qiuqiu-wt-i18nfix0930/docs/i18nfix_0930/after';
export const HEROES = ['ninja', 'feifei', 'dangdang', 'fengfeng'];

/** 三種畫面：桌機 1280×800、手機橫拿 844×390（模擬觸控，phone.css 才會生效）、手機直立 390×844（遊戲只顯示「請橫過來玩」） */
export const VIEWPORTS = {
  desk: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 844, height: 390 }, ctx: { isMobile: true, hasTouch: true, screen: { width: 844, height: 390 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' } },
  portrait: { viewport: { width: 390, height: 844 }, ctx: { isMobile: true, hasTouch: true, screen: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' } },
};

let chromium = null;
export async function init() { if (!chromium) chromium = await loadPlaywright(); return chromium; }

/** 閘門的 newContext 不收手機模擬參數，這裡照它的做法（獨立 user-data-dir 放 C:/pwsw/、結束一律關）自己開 */
async function newContext(runTag, tag, opts = {}) {
  await init();
  const dir = `${PROFILE_ROOT}/${runTag}-${tag}`;
  rmSync(dir, { recursive: true, force: true });
  mk2(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chrome', headless: true, viewport: opts.viewport, deviceScaleFactor: 1, ...(opts.ctx ?? {}),
    serviceWorkers: 'block',
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push({ kind: 'console.error', text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => logs.push({ kind: 'pageerror', text: String(e?.stack || e).slice(0, 500) }));
  let closed = false;
  return {
    ctx, page, logs, dir,
    async close() {
      if (closed) return; closed = true;
      try { await ctx.close(); } catch { killOwnChrome(`${runTag}-${tag}`); }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
    },
  };
}

/** 開一個語言＋畫面的瀏覽器分頁（語言寫在本機開發伺服器自己的 localStorage） */
export async function openPage(lang, vp, tag, extraInit) {
  await init();
  const c = await newContext('edge', `${tag}-${lang}-${vp}`, VIEWPORTS[vp]);
  const { page } = c;
  await page.addInitScript((l) => { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.lang', l); } catch { /* */ } } }, lang);
  if (extraInit) await page.addInitScript(extraInit);
  await gotoGame(page);
  return c;
}

export async function gotoGame(page) {
  await page.goto(BASE + '?debug', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__app && !!document.querySelector('#stage')?.dataset.screen, null, { timeout: 90000 });
  await sleep(600);
}

/** 動態載入遊戲模組（開發伺服器上與遊戲共用同一份模組實例） */
export const imp = (page, path) => page.evaluate((p) => import(/* @vite-ignore */ p).then(() => true), `/qiuqiu-tower/src/${path}`);

/** 開一局並跳過序章（同閘門的 bootRun），拿掉開局祝福 */
export async function bootRun(page, hero, seed = 'edge', keepBless = false) {
  await page.evaluate(([s, h]) => window.__app.newRun(s, 1, h), [seed, hero]);
  await sleep(200);
  const run = await page.evaluate(() => JSON.stringify(window.__app.run));
  await gotoGame(page);
  await page.evaluate((r) => { const x = JSON.parse(r); x.flags.prologue = true; window.__app.continueRun(x); }, run);
  await page.waitForFunction(() => ['map', 'blessing'].includes(document.querySelector('#stage')?.dataset.screen), null, { timeout: 30000 });
  await sleep(300);
  if (!keepBless) await page.evaluate(() => { for (const p of window.__app.run.players) p.bless = undefined; });
}

/**
 * 頁面內量測：文字有沒有被容器切掉／跑出舞台。回傳的座標一律換算成舞台的 1280×720 座標（除以縮放）。
 * 做法：每個文字節點往上找有 overflow（hidden/clip/auto/scroll）的祖先，文字的實際外框超出那個祖先的可視框就記一筆；
 * 沒被切、但跑出舞台外框的也記。呼叫前先 settle()，避免量到進場動畫的半途。
 */
export const SCAN_FN = (opts) => {
  const o = opts ?? {};
  const stage = document.querySelector('#stage');
  const sr = stage.getBoundingClientRect();
  const k = sr.width / 1280;
  const R = (n) => Math.round((n / k) * 10) / 10;
  const root = o.root ? document.querySelector(o.root) : stage;
  if (!root) return { err: 'no root ' + o.root };
  const desc = (e) => {
    const cls = (e.className && typeof e.className === 'string') ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${cls}`;
  };
  const hidden = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true; } return false; };
  const clipped = [], outside = [], ellipsis = [];
  let skippedWarped = 0;
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  const stageClip = { l: sr.left, t: sr.top, r: sr.right, b: sr.bottom };
  while ((n = walker.nextNode())) {
    const txt = n.textContent.replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    const p = n.parentElement;
    if (!p || hidden(p)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;
    const tb = { l: Math.min(...rects.map((r) => r.left)), t: Math.min(...rects.map((r) => r.top)), r: Math.max(...rects.map((r) => r.right)), b: Math.max(...rects.map((r) => r.bottom)) };
    let hit = false;
    // 手牌扇形、歪著晃、被縮放的東西：外框是變形過的，軸對齊的量法會量出假的溢出，跳過（另外計數，不算問題）
    let warped = false;
    for (let a = p; a && a !== stage; a = a.parentElement) {
      const tf = getComputedStyle(a).transform;
      if (tf && tf !== 'none') {
        const m = /matrix\(([^)]+)\)/.exec(tf);
        if (m) { const v = m[1].split(',').map(Number); if (Math.abs(v[1]) > 0.002 || Math.abs(v[2]) > 0.002 || Math.abs(v[0] - 1) > 0.01 || Math.abs(v[3] - 1) > 0.01) { warped = true; break; } }
      }
    }
    if (warped) skippedWarped++;
    for (let a = p; a && a !== stage && !warped; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const ox = cs.overflowX, oy = cs.overflowY;
      const clipX = ox !== 'visible', clipY = oy !== 'visible';
      if (!clipX && !clipY) continue;
      if (a === stage || a.id === 'screen' || a.id === 'overlay') continue;
      const br = a.getBoundingClientRect();
      const bw = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
      const box = { l: br.left + bw, t: br.top + bt, r: br.left + bw + a.clientWidth * k, b: br.top + bt + a.clientHeight * k };
      const ex = { left: clipX ? box.l - tb.l : 0, right: clipX ? tb.r - box.r : 0, top: clipY ? box.t - tb.t : 0, bottom: clipY ? tb.b - box.b : 0 };
      const m = Math.max(ex.left, ex.right, ex.top, ex.bottom);
      if (m > 1.5 * k) {
        const key = desc(a) + '|' + Math.round(box.l) + '|' + Math.round(box.t);
        const scroll = ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll';
        if (!seen.has(key + txt.slice(0, 12))) {
          seen.add(key + txt.slice(0, 12));
          clipped.push({ el: desc(a), scroll, text: txt.slice(0, 60), over: { l: R(Math.max(0, ex.left)), r: R(Math.max(0, ex.right)), t: R(Math.max(0, ex.top)), b: R(Math.max(0, ex.bottom)) }, box: { w: R(box.r - box.l), h: R(box.b - box.t) } });
        }
        hit = true;
        break;
      }
    }
    if (!hit) {
      const ex = { left: stageClip.l - tb.l, right: tb.r - stageClip.r, top: stageClip.t - tb.t, bottom: tb.b - stageClip.b };
      const m = Math.max(ex.left, ex.right, ex.top, ex.bottom);
      if (m > 1.5 * k) outside.push({ el: desc(p), text: txt.slice(0, 60), over: { l: R(Math.max(0, ex.left)), r: R(Math.max(0, ex.right)), t: R(Math.max(0, ex.top)), b: R(Math.max(0, ex.bottom)) } });
    }
  }
  for (const e of root.querySelectorAll('*')) {
    if (!(e instanceof HTMLElement) || hidden(e)) continue;
    const cs = getComputedStyle(e);
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) ellipsis.push({ el: desc(e), text: (e.textContent || '').trim().slice(0, 60), over: Math.round(e.scrollWidth - e.clientWidth) });
  }
  return { k: Math.round(k * 1000) / 1000, clipped, outside, ellipsis, skippedWarped };
};

export async function scan(page, opts) { await settle(page); return page.evaluate(SCAN_FN, opts ?? {}); }

/** 一個元素的文字有幾行（用文字外框的不同上緣數） */
export const LINES_FN = (sel) => {
  const e = document.querySelector(sel);
  if (!e) return null;
  const range = document.createRange();
  range.selectNodeContents(e);
  const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top / 4)));
  return tops.size;
};

export function saveJson(name, data) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 1), 'utf-8');
}
export function shotPath(name) { mkdirSync(OUT, { recursive: true }); return join(OUT, name); }
