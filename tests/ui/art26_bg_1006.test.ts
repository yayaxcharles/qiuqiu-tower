import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { _setManifestForTest, type Manifest } from '../../src/ui/assets';
import { art26Keys } from '../../src/ui/bgacts';
import { tierBgKey } from '../../src/ui/screenbg';
import { BG_FX, breatheScale } from '../../src/ui/ambient';

// 2026-10-06 美術改版（背景線）：新戰鬥背景一起輪、地圖中層、輕量動效
const src = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const real = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as Manifest;

describe('新戰鬥背景跟舊的一起輪', () => {
  it('舊三張照舊在，新圖排在後面；第 1、2 層輪到的一定是舊的（新圖進入一局才抓，見 bgacts.ts 的 art26Keys）', () => {
    _setManifestForTest(real);
    for (const [first, tier] of [[1, 'low'], [16, 'mid'], [31, 'top']] as const) {
      const seen = new Set<string>();
      for (let f = first; f < first + 15; f++) seen.add(tierBgKey(f));
      for (const v of ['', '_b', '_c']) expect(seen.has(`bg/${tier}${v}`), `${tier}${v}`).toBe(true);
      const fresh = art26Keys(tier).filter((k) => real.bg[k]);
      expect(fresh.length, `${tier} 至少兩張新圖`).toBeGreaterThanOrEqual(2);
      for (const k of fresh) expect(seen.has(k), k).toBe(true);
    }
    // 每一關的第 1、2 層（含過關動畫用的 16、31 層）都是舊圖：新圖排在進關預載的最後面，慢網路下最晚到
    for (const f of [1, 2, 16, 17, 31, 32]) expect(tierBgKey(f).startsWith('bg/art26_'), `${f} 層`).toBe(false);
    // 舊三張在原本輪到的樓層照舊（關內樓層取餘數，15 是 3 的倍數）
    expect(tierBgKey(16)).toBe('bg/mid_b');
    expect(tierBgKey(31)).toBe('bg/top_b');
    expect(tierBgKey(18)).toBe('bg/art26_mid_1');
  });

  it('新圖沒進倉的號碼會被跳過，全都沒有就退回原本三張輪', () => {
    const bg = { ...real.bg };
    for (const t of ['low', 'mid', 'top']) for (const k of art26Keys(t)) delete bg[k];
    _setManifestForTest({ ...real, bg });
    for (let f = 1; f <= 45; f++) expect(tierBgKey(f)).not.toContain('art26');
    expect(tierBgKey(3)).toBe('bg/low');
    expect(tierBgKey(4)).toBe('bg/low_b');
    _setManifestForTest(real);
  });

  it('關主戰場、舊背景的放大率沒被動到（新圖 100% 鋪，進倉時就裁好牆腳）', () => {
    const sb = src('src/ui/screenbg.ts');
    expect(sb).toContain("'bg/boss1': 127, 'bg/boss2': 124, 'bg/boss3': 124,");
    expect(sb).toContain("'bg/low': 106, 'bg/low_b': 109, 'bg/low_c': 111,");
  });
});

describe('背景動效：只動 transform 與 opacity、每張可關', () => {
  it('每一份設定都對得到倉裡的一張新背景', () => {
    const keys = Object.keys(BG_FX);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.startsWith('bg/art26_'), k).toBe(true);
      expect(real.bg[k], k).toBeTruthy();
    }
  });

  it('呼吸縮放 1.00～1.015、20 秒一輪', () => {
    let lo = 9, hi = 0;
    for (let ms = 0; ms <= 20000; ms += 250) { const s = breatheScale(ms); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    expect(lo).toBeCloseTo(1, 4);
    expect(hi).toBeCloseTo(1.015, 4);
    expect(breatheScale(0)).toBeCloseTo(breatheScale(20000), 6);
  });

  it('程式裡不碰 filter、box-shadow，背景那一層只寫 transform', () => {
    const amb = src('src/ui/ambient.ts');
    expect(amb).not.toMatch(/\.filter\s*=|boxShadow|box-shadow|backgroundPosition/);
    expect(amb).toContain('bgEl!.style.transform = `scale(${v})`');
    // 不另開畫布：整支只有環境光那一張＋霧帶貼圖（離屏、只畫一次）
    expect(amb.match(/document\.createElement\('canvas'\)/g)?.length).toBe(2);
  });

  it('地圖中層不動、不擋點擊', () => {
    const css = src('src/ui/styles/map.css');
    const i = css.indexOf('.map-mid {');
    expect(i).toBeGreaterThan(-1);
    const body = css.slice(i, css.indexOf('}', i));
    expect(body).toContain('pointer-events: none');
    expect(body).not.toContain('animation');
  });
});
