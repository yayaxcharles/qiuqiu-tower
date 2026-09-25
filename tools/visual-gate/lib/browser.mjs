// 瀏覽器：本機裝好的 Chrome（playwright-core＋channel: 'chrome'，不另外下載瀏覽器），
// 每個工作一個**獨立的設定資料夾**（放在短路徑 C:/pwsw/<標籤>，長路徑會撞 Windows 260 字元上限），
// 結束一律關掉；關不掉的，照命令列裡有沒有這次的標籤確認是自己開的才殺。
//
// **只開本機網址**：兩份遊戲都是閘門自己的本機伺服器。這支工具不需要、也不准碰線上網址
//（2026-09-14 曾在線上網址寫 localStorage 蓋掉玩家存檔）。`assertLocal` 每次開頁都檢查一次。
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, sleep } from './util.mjs';

let chromium;
export async function loadPlaywright() {
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error('找不到 playwright-core。先在這個資料夾跑一次 `npm install`（或 `npm ci`），它列在 optionalDependencies。');
  }
  return chromium;
}

export const PROFILE_ROOT = 'C:/pwsw';

export function assertLocal(url) {
  const u = new URL(url);
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') throw new Error(`畫面比對閘門只准開本機網址，這個不是：${url}`);
}

/** 每一頁最早執行的腳本：UI 的隨機數固定種子（兩版演出一樣）、跳過新手教學（只在本機網址上寫） */
const INIT = `(() => {
  if (!/^(127\\.0\\.0\\.1|localhost)$/.test(location.hostname)) return;
  let s = 0x9e3779b9 >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { localStorage.setItem('qiuqiu.tutorial', 'done'); } catch (e) {}
})();`;

export async function newContext(runTag, tag, opts = {}) {
  const dir = `${PROFILE_ROOT}/${runTag}-${tag}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: true,
    viewport: opts.viewport ?? { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',   // 圖片離線快取的服務工作者：背景搬圖會干擾逐格計時，兩版都擋掉
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push({ kind: 'console.error', text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => logs.push({ kind: 'pageerror', text: String(e?.stack || e).slice(0, 500) }));
  page.on('response', (r) => { if (r.status() >= 400) logs.push({ kind: 'http' + r.status(), text: r.url() }); });
  await page.addInitScript(INIT);
  let closed = false;
  return {
    ctx, page, logs, dir,
    async close() {
      if (closed) return;
      closed = true;
      // 正常關得掉就不用再查行程；關不掉才照命令列找自己開的那幾個殺掉
      try { await ctx.close(); } catch { killOwnChrome(`${runTag}-${tag}`); }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* 被佔用就算了，下次同標籤會先清 */ }
    },
  };
}

/**
 * 保險：找命令列裡帶著這次設定資料夾的 chrome.exe，確認是自己開的才殺。
 * 正常情況 `ctx.close()` 已經關乾淨，這裡什麼都找不到。
 */
export function killOwnChrome(profileTag) {
  if (process.platform !== 'win32') return [];
  const needle = `pwsw/${profileTag}`.toLowerCase();
  const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const killed = [];
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const [pid, cmd] = line.split('\t');
    if (!pid || !cmd) continue;
    const c = cmd.replace(/\\/g, '/').toLowerCase();
    if (!c.includes(needle)) continue;   // 不是這次開的，碰都不碰
    spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { windowsHide: true });
    killed.push(pid);
  }
  return killed;
}

export async function openGame(page, url, query = '?debug') {
  assertLocal(url);
  await page.goto(url + query, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__app && !!document.querySelector('#stage')?.dataset.screen, null, { timeout: 60000 });
}

export async function waitScreen(page, want, timeout = 30000) {
  await page.waitForFunction((w) => document.querySelector('#stage')?.dataset.screen === w, want, { timeout });
}

/**
 * 開一局並跳過序章：先開局拿到局面，重新載入頁面，再把局面（標好「序章看過了」）接回來。
 * 這樣不用等影片、幻燈片，也不會留下還在跑的劇情計時器。
 */
export async function bootRun(page, url, hero, seed, query = '?debug') {
  await openGame(page, url, query);
  await page.evaluate(([s, h]) => window.__app.newRun(s, 1, h), [seed, hero]);
  await sleep(150);
  const run = await page.evaluate(() => JSON.stringify(window.__app.run));
  await openGame(page, url, query);
  await page.evaluate((r) => { const run = JSON.parse(r); run.flags.prologue = true; window.__app.continueRun(run); }, run);
  await page.waitForFunction(() => ['map', 'blessing'].includes(document.querySelector('#stage')?.dataset.screen), null, { timeout: 30000 });
  await sleep(300);
}

/** 把有限的動畫播完、無限循環的停在第 0 毫秒：量位置時不會量到動畫的半途 */
export async function settle(page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const t = a.effect?.getTiming?.();
      if (!t) continue;
      try {
        if (t.iterations === Infinity) { a.pause(); a.currentTime = 0; } else a.finish();
      } catch { /* 有些動畫不能 finish（例如沒有結束時間），略過 */ }
    }
  });
}

/** 等某個選擇器的圖載好（最多 timeout 毫秒） */
export async function waitImg(page, sel, timeout = 8000) {
  await page.waitForFunction((s) => { const i = document.querySelector(s); return !!i && i.complete && i.naturalWidth > 0; }, sel, { timeout }).catch(() => {});
  await page.evaluate((s) => document.querySelector(s)?.decode?.().catch(() => {}), sel);
}

/**
 * 頁面裡：量一張 <img> 在舞台上畫多大、畫在哪（CSS 像素，舞台座標），連「不透明像素的外框」（貓本身）一起量。
 * 做法照 2026-09-23 實機驗收 capture.js：object-fit 換算、圖畫進畫布找透明度 > 16 的外框。外框依網址快取。
 */
export const MEASURE_IMG = async (sel) => {
  const img = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!img) return { err: 'no element ' + sel };
  try { await img.decode(); } catch (e) { /* 已經載好或載不到都往下走 */ }
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw) return { err: 'not loaded', src: img.getAttribute('src') };
  const cache = (window.__vgBox ??= {});
  const src = img.getAttribute('src');
  let bb = cache[src];
  if (!bb) {
    const c = document.createElement('canvas'); c.width = nw; c.height = nh;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, nw, nh).data;
    let x0 = nw, y0 = nh, x1 = -1, y1 = -1;
    for (let y = 0; y < nh; y++) { const row = y * nw * 4; for (let x = 0; x < nw; x++) if (d[row + x * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    bb = cache[src] = x1 < 0 ? null : [x0, y0, x1, y1];
  }
  const r = img.getBoundingClientRect();
  const st = getComputedStyle(img);
  const stage = document.querySelector('#stage').getBoundingClientRect();
  const k = stage.width / 1280;
  const fit = st.objectFit;
  let sx, sy;
  if (fit === 'contain' || fit === 'scale-down') { sx = sy = Math.min(r.width / nw, r.height / nh); if (fit === 'scale-down') sx = sy = Math.min(1, sx); }
  else if (fit === 'cover') { sx = sy = Math.max(r.width / nw, r.height / nh); }
  else { sx = r.width / nw; sy = r.height / nh; }
  const pos = st.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
  const ox = r.left + (r.width - nw * sx) * (isNaN(pos[0]) ? 0.5 : pos[0]);
  const oy = r.top + (r.height - nh * sy) * (isNaN(pos[1]) ? 0.5 : pos[1]);
  const S = (v, o) => Math.round(((v - o) / k) * 10) / 10;
  return {
    src, nw, nh, fit, pxPerNatural: Math.round((sx / k) * 1e5) / 1e5,
    el: { x: S(r.left, stage.left), y: S(r.top, stage.top), w: Math.round((r.width / k) * 10) / 10, h: Math.round((r.height / k) * 10) / 10 },
    cat: bb ? { x: S(ox + bb[0] * sx, stage.left), y: S(oy + bb[1] * sy, stage.top), w: Math.round(((bb[2] - bb[0] + 1) * sx / k) * 10) / 10, h: Math.round(((bb[3] - bb[1] + 1) * sy / k) * 10) / 10,
      bottom: S(oy + (bb[3] + 1) * sy, stage.top) } : null,
    style: { translate: st.translate, scale: st.scale, transform: st.transform, width: st.width, height: st.height, opacity: st.opacity, visibility: st.visibility, display: st.display },
  };
};

/** 截圖範圍夾進視窗裡（舞台 1280×720、縮放 1，所以這也是舞台座標） */
export function clampClip(clip, vp = { width: 1280, height: 720 }) {
  if (!clip) return null;
  const x = Math.max(0, Math.round(clip.x)), y = Math.max(0, Math.round(clip.y));
  return { x, y, width: Math.max(1, Math.min(vp.width - x, Math.round(clip.width))), height: Math.max(1, Math.min(vp.height - y, Math.round(clip.height))) };
}

export async function jpg(page, file, clip, quality = 80) {
  mkdirSync(join(file, '..'), { recursive: true });
  const c = clampClip(clip, page.viewportSize());
  await page.screenshot({ path: file, type: 'jpeg', quality, ...(c ? { clip: c } : {}) });
  return file;
}

/** 在頁面裡找一個「點下去真的會點到 el」的座標（牌是扇形疊著的） */
export const POINT_FN = `(el) => {
  const r = el.getBoundingClientRect();
  const xs = [0.5, 0.35, 0.65, 0.2, 0.8], ys = [0.5, 0.3, 0.7, 0.15, 0.85];
  for (const fy of ys) for (const fx of xs) { const x = r.left + r.width * fx, y = r.top + r.height * fy; const hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) return { x, y }; }
  return null;
}`;

export async function realClick(page, selector, { index = 0, textRe = null } = {}) {
  const pt = await page.evaluate(({ selector, index, textRe, POINT_FN }) => {
    const f = eval(POINT_FN);
    let list = [...document.querySelectorAll(selector)].filter((x) => x.offsetParent !== null || getComputedStyle(x).position === 'fixed');
    if (textRe) { const re = new RegExp(textRe); list = list.filter((x) => re.test(x.textContent)); }
    const el = list[index];
    return el ? f(el) : null;
  }, { selector, index, textRe, POINT_FN });
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
}

export { existsSync };
