// 逐格膠卷：一邊用 CDP 錄畫面（玩家看到的每一格），一邊在頁面裡每一格（requestAnimationFrame）量角色畫在哪、多大。
// 錄完：畫面格拿去算亮度（抓整格閃白、整格空白），角色外框拿去算跳位、忽大忽小、角色不見、露出靜態立繪。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, sleep } from './util.mjs';

/**
 * 頁面裡的取樣器。每一格找「本機這一位角色」現在畫在哪：
 *   過關走路疊層的畫布／靜態圖 → 戰鬥裡自己那一格的逐格畫布 → 戰鬥裡的靜態立繪。
 * 畫布量「不透明像素的外框」（getImageData），靜態圖量圖本身的不透明外框（依網址快取）。座標一律換成舞台座標（CSS 像素）。
 */
export const INSTALL_SAMPLER = () => {
  const S = window.__vgSamp = { t0: performance.now(), epoch0: performance.timeOrigin + performance.now(), samples: [], stop: false };
  const stageEl = document.getElementById('stage');
  const boxCache = (window.__vgBoxSync ??= {});
  const imgBox = (img) => {
    const src = img.getAttribute('src');
    if (!(src in boxCache)) {
      if (!img.complete || !img.naturalWidth) return null;
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      boxCache[src] = x1 < 0 ? null : [x0, y0, x1, y1];
    }
    const bb = boxCache[src];
    if (!bb) return null;
    const r = img.getBoundingClientRect();
    const st = getComputedStyle(img);
    const nw = img.naturalWidth, nh = img.naturalHeight;
    let sx, sy;
    if (st.objectFit === 'contain' || st.objectFit === 'scale-down') { sx = sy = Math.min(r.width / nw, r.height / nh); }
    else if (st.objectFit === 'cover') { sx = sy = Math.max(r.width / nw, r.height / nh); }
    else { sx = r.width / nw; sy = r.height / nh; }
    const pos = st.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
    const ox = r.left + (r.width - nw * sx) * (isNaN(pos[0]) ? 0.5 : pos[0]);
    const oy = r.top + (r.height - nh * sy) * (isNaN(pos[1]) ? 0.5 : pos[1]);
    return [ox + bb[0] * sx, oy + bb[1] * sy, (bb[2] - bb[0] + 1) * sx, (bb[3] - bb[1] + 1) * sy];
  };
  const canvasBox = (cv) => {
    if (!cv.width || !cv.height) return null;
    let d;
    try { d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data; } catch (e) { return null; }
    const w = cv.width, h = cv.height;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 1) { const row = y * w * 4; for (let x = 0; x < w; x += 1) if (d[row + x * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) return 'empty';
    const r = cv.getBoundingClientRect();
    const kx = r.width / w, ky = r.height / h;
    return [r.left + x0 * kx, r.top + y0 * ky, (x1 - x0 + 1) * kx, (y1 - y0 + 1) * ky];
  };
  const visible = (el) => !!el && el.isConnected && (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : el.offsetParent !== null);
  const tick = () => {
    if (S.stop) return;
    const t = Math.round((performance.now() - S.t0) * 10) / 10;
    const k = stageEl.getBoundingClientRect();
    const scale = k.width / 1280;
    const screen = stageEl.dataset.screen;
    let mode = 'none', box = null, src = null;
    const walk = stageEl.querySelector('.actwalk-overlay');
    if (walk) {
      const cv = [...walk.querySelectorAll('canvas')].find(visible);
      const img = walk.querySelector('.actwalk-cat');
      if (cv) { const b = canvasBox(cv); mode = b === 'empty' ? 'walk-empty' : 'walk-canvas'; box = b === 'empty' ? null : b; }
      else if (visible(img)) { mode = 'walk-img'; box = imgBox(img); src = (img.getAttribute('src') || '').split('/').pop(); }
    } else if (screen === 'combat') {
      const seat = window.__app?.seat ?? 0;
      const unit = document.querySelector(`#screen .unit.player[data-seat="${seat}"]`) || document.querySelector('#screen .unit.player');
      const sbox = unit?.querySelector('.sprite-box');
      const cv = sbox ? [...sbox.querySelectorAll('canvas')].find(visible) : null;
      const img = sbox?.querySelector('.sprite');
      const motionOn = !!sbox && [...sbox.classList].some((c) => /^has-.*motion$/.test(c));
      if (cv) { const b = canvasBox(cv); mode = b === 'empty' ? 'canvas-empty' : 'canvas'; box = b === 'empty' ? null : b; }
      if (visible(img) && (!cv || !motionOn)) { mode = cv ? 'both' : 'static'; box = box ?? imgBox(img); src = (img.getAttribute('src') || '').split('/').pop(); }
    }
    const s = { t, scr: screen, mode };
    if (box) s.b = box.map((v, i) => Math.round(((v - (i === 0 ? k.left : i === 1 ? k.top : 0)) / scale) * 10) / 10);
    if (src) s.src = src.replace(/-[A-Za-z0-9_-]{8}\.webp$/, '');
    if (document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay')) s.ov = 1;
    S.samples.push(s);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return S.epoch0;
};

export const COLLECT_SAMPLER = () => { const S = window.__vgSamp; S.stop = true; return { epoch0: S.epoch0, samples: S.samples }; };

/**
 * 錄一段：開始錄影與取樣 → 做動作（`act`，回傳動作那一刻的頁面時間）→ 錄 durMs → 停。
 * 回傳 { samples（時間以動作那一刻為 0）, frames（CDP 畫面格，時間同上）}
 */
export async function film(page, act, durMs) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const onFrame = async (f) => {
    frames.push({ ts: f.metadata.timestamp * 1000, data: f.data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* 已經停了 */ }
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 640, maxHeight: 360, everyNthFrame: 1 });
  await page.evaluate(INSTALL_SAMPLER);
  await sleep(250);
  const actAt = await page.evaluate(() => performance.timeOrigin + performance.now());
  const actRes = await act();
  await sleep(durMs);
  const { epoch0, samples } = await page.evaluate(COLLECT_SAMPLER);
  await cdp.send('Page.stopScreencast').catch(() => {});
  await sleep(60);
  cdp.off('Page.screencastFrame', onFrame);
  await cdp.detach().catch(() => {});
  const shift = actAt - epoch0;   // 取樣器時間軸 → 以動作那一刻為 0
  return {
    actRes,
    samples: samples.map((s) => ({ ...s, t: Math.round((s.t - shift) * 10) / 10 })),
    frames: frames.map((f) => ({ t: Math.round(f.ts - actAt), data: f.data })),
  };
}

/** 在一個空白頁裡把 JPEG 畫面格解開，算每一格的平均亮度與標準差（縮成 64×36 算，夠用也快） */
export async function frameStats(analysisPage, frames) {
  const out = [];
  const CH = 40;
  for (let i = 0; i < frames.length; i += CH) {
    const part = frames.slice(i, i + CH).map((f) => f.data);
    const r = await analysisPage.evaluate(async (list) => {
      const c = new OffscreenCanvas(64, 36);
      const g = c.getContext('2d', { willReadFrequently: true });
      const res = [];
      for (const b64 of list) {
        const bin = atob(b64); const u = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j);
        const bmp = await createImageBitmap(new Blob([u], { type: 'image/jpeg' }));
        g.drawImage(bmp, 0, 0, 64, 36); bmp.close();
        const d = g.getImageData(0, 0, 64, 36).data;
        let s = 0, s2 = 0; const n = 64 * 36;
        for (let j = 0; j < d.length; j += 4) { const l = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; s += l; s2 += l * l; }
        const m = s / n;
        res.push([Math.round(m * 10) / 10, Math.round(Math.sqrt(Math.max(0, s2 / n - m * m)) * 10) / 10]);
      }
      return res;
    }, part);
    out.push(...r);
  }
  return out;
}

/** 每 step 毫秒挑一張「那一刻畫面上看到的」格子存成 jpg（給人看的膠卷）。回傳 [{t, file}] */
export function saveGrid(frames, from, to, step, dir, prefix) {
  mkdirSync(dir, { recursive: true });
  const out = [];
  let j = 0;
  for (let t = from; t <= to; t += step) {
    while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
    const f = frames[j];
    if (!f || f.t > t) continue;
    const file = join(dir, `${prefix}_${String(t + 10000).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    out.push({ t, file });
  }
  return out;
}
