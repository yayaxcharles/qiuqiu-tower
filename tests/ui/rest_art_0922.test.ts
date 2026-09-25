import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { relics } from '../../src/content/relics';

/**
 * 批次 rest（2026-09-22）：貓窩立繪、地圖小頭像、噹噹「銅護臂」圖示換新版畫風，封封幾張插圖去殘渣。
 *
 * 圖是 `tools/build_rest_art.py` 算的：全部過閘門（真透明、單一角色、沒被切到、面向右、
 * 頭的大小跟新版待機差 ±6% 內、十二顆地圖頭像同一個比例）才一起寫檔，並把每個檔的雜湊與量到的數字
 * 記在 `tools/motion-art-source/rest/record.json`。這裡守兩件事：
 *   1. 線上放的就是閘門量過的那一版（換回舊圖、或有人重畫沒重跑閘門，雜湊就對不上）；
 *   2. 紀錄裡的數字本身合格（頭的大小、地圖上的高度、清掉的碎片）。
 */
interface Entry {
  file: string; sha256: string; canvas?: number[]; head?: number; headCorr?: number; headCheck?: string;
  sizeCheck?: string; heightOnMap?: number; cleared?: { area: number }[]; sha256Before?: string; bbox?: [number, number, number, number];
}
const RECORD = JSON.parse(readFileSync('tools/motion-art-source/rest/record.json', 'utf8')) as Record<string, Entry>;
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as { icons: Record<string, string>; sprites: Record<string, string> };
const STATICS = JSON.parse(readFileSync('docs/static-from-motion-assets.json', 'utf8')) as { assets: unknown[] };
const HEROES = ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const;
const REST_POSES = ['curl', 'nap', 'sharpen', 'helpup', 'down'] as const;
const GENERATED = new Set(['nap', 'sharpen', 'helpup']);
const TIERS = ['low', 'mid', 'top'] as const;
const restFile = (hero: string, pose: string): string => `public/assets/sprites/hero/${hero}_${pose}.webp`;
const mapFile = (hero: string, tier: string): string => `public/assets/icons/map_hero_${hero === 'ninja' ? '' : `${hero}_`}${tier}.webp`;
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
/** WebP（VP8X）表頭裡的畫布大小 */
const canvasOf = (path: string): [number, number] => {
  const b = readFileSync(path);
  expect(new TextDecoder().decode(b.subarray(12, 16)), path).toBe('VP8X');
  const read24 = (at: number): number => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
  return [1 + read24(24), 1 + read24(27)];
};

describe('批次 rest：換新畫風的圖都是閘門量過的那一版', () => {
  it('貓窩五張 × 四隻、地圖頭像十二顆、銅護臂、封封去殘渣十一張，全部有紀錄且雜湊對得上', () => {
    const want = [
      ...HEROES.flatMap((h) => REST_POSES.map((p) => restFile(h, p))),
      ...HEROES.flatMap((h) => TIERS.map((t) => mapFile(h, t))),
      'public/assets/icons/relic_copper_bracer.webp',
    ];
    for (const file of want) expect(RECORD[file], file).toBeDefined();
    // 封封去殘渣那三張立繪（出招、閃避、輕功）2026-09-23 被批次 statics 整張換成新畫風，改由 static_from_motion.test.ts 守雜湊
    const replaced = new Set((STATICS.assets as { file: string }[]).map((a) => `public/${a.file}`));
    // 2026-09-24 事件圖重生（`tools/regen_event_art.py`，圖文對不上的整張重畫）又換掉幾張封封插圖，改由 event_regen_0924.test.ts 守雜湊
    // 2026-09-25 第二輪重審（regen0925）再換的也一樣
    const regenerated = new Set(['tools/motion-art-source/regen0924', 'tools/motion-art-source/regen0925']
      .flatMap((REGEN) => (existsSync(REGEN) ? readdirSync(REGEN) : []).filter((f) => /^picks(_\w+)?\.json$/.test(f))
        .flatMap((f) => Object.values(JSON.parse(readFileSync(`${REGEN}/${f}`, 'utf8')) as Record<string, { file: string }>).map((p) => p.file))));
    for (const entry of Object.values(RECORD)) {
      if (replaced.has(entry.file) || regenerated.has(entry.file)) continue;
      expect(sha(entry.file), entry.file).toBe(entry.sha256);
    }
    expect([...replaced].filter((file) => RECORD[file]).sort()).toEqual([
      'public/assets/sprites/hero/fengfeng_claw.webp',
      'public/assets/sprites/hero/fengfeng_dodge.webp',
      'public/assets/sprites/hero/fengfeng_qinggong.webp',
    ]);
    expect(Object.keys(RECORD).length).toBe(want.length + 11);
  });

  it('貓窩立繪畫布照舊，生圖那三張的頭跟新版待機一樣大（±6%）', () => {
    for (const hero of HEROES) {
      for (const pose of REST_POSES) {
        const e = RECORD[restFile(hero, pose)]!;
        expect(canvasOf(e.file), e.file).toEqual(hero === 'fengfeng' ? [560, 560] : [560, 547]);
        if (GENERATED.has(pose)) {
          if (e.headCheck !== 'eye') expect(Math.abs(e.head! - 1), `${e.file} 頭 ${e.head}`).toBeLessThanOrEqual(0.06);
        } else {
          // 蜷縮與倒地直接取新版逐格動作那一格，照戰鬥的比例放（頭縮著、趴著，量頭不準，靠同一張圖集保證）
          expect(e.sizeCheck, e.file).toBe('同一張逐格圖、同戰鬥比例');
        }
      }
    }
  });

  it('封封按下打盹不再縮成一小團：打盹那張的頭跟待機一樣大、身體站進畫布的高度不再只有兩成多', () => {
    const nap = RECORD[restFile('fengfeng', 'nap')]!;
    expect(sha(nap.file)).toBe(nap.sha256);
    expect(Math.abs(nap.head! - 1)).toBeLessThanOrEqual(0.06);
    // 原本 212/560（進貓窩那張 511/560，按下打盹只剩四成）；現在跟同一隻的蜷縮圖同一個比例、貼同一條底線
    const [, y0, , y1] = nap.bbox!;
    const [, cy0, , cy1] = RECORD[restFile('fengfeng', 'curl')]!.bbox!;
    expect(y1).toBe(cy1);
    expect((y1 - y0) / (cy1 - cy0)).toBeGreaterThan(0.75);
  });

  it('地圖頭像十二顆畫布照舊，在地圖上（52 框）站出來一樣高', () => {
    const heights = HEROES.flatMap((h) => TIERS.map((t) => {
      const e = RECORD[mapFile(h, t)]!;
      const side = h === 'ninja' ? 96 : 128;
      expect(canvasOf(e.file), e.file).toEqual([side, side]);
      return e.heightOnMap!;
    }));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(46);   // 封封第二關那顆原本只有 59/128 高（地圖上 24 像素）
  });

  it('封封插圖的殘渣清掉了（只換透明度，其餘不動）', () => {
    const cleaned = Object.values(RECORD).filter((e) => e.cleared);
    expect(cleaned.map((e) => e.file).sort()).toEqual([
      'public/assets/bg/event_fengfeng_chest_closed.webp',
      'public/assets/bg/event_fengfeng_chest_empty.webp',
      'public/assets/bg/event_fengfeng_chest_open.webp',
      'public/assets/bg/event_fengfeng_hidden_box_r0.webp',
      'public/assets/bg/event_fengfeng_lost_scroll_r1.webp',
      'public/assets/bg/event_fengfeng_old_master_ghost.webp',
      'public/assets/bg/event_fengfeng_rescue_return_fish.webp',
      'public/assets/bg/event_fengfeng_robin_r0.webp',
      'public/assets/sprites/hero/fengfeng_claw.webp',
      'public/assets/sprites/hero/fengfeng_dodge.webp',
      'public/assets/sprites/hero/fengfeng_qinggong.webp',
    ]);
    for (const e of cleaned) {
      expect(e.cleared!.length, e.file).toBeGreaterThan(0);
      expect(e.sha256, e.file).not.toBe(e.sha256Before);
    }
  });
});

describe('噹噹的起始秘寶「銅護臂」有圖示', () => {
  it('每一件秘寶的圖示鍵都在清單裡、檔案也在（銅護臂原本缺，狀態列只寫「銅護」兩個字）', () => {
    const missing = relics.filter((r) => !MANIFEST.icons[r.art] || !existsSync(`public/${MANIFEST.icons[r.art]}`)).map((r) => r.art);
    expect(missing).toEqual([]);
    expect(MANIFEST.icons['codex/relic_copper_bracer']).toBe('assets/icons/relic_copper_bracer.webp');
    expect(canvasOf('public/assets/icons/relic_copper_bracer.webp')).toEqual([128, 128]);   // 同舊劍穗、藍頭巾、毒針袋
  });
});

describe('貓窩立繪的樣式表', () => {
  it('新圖四隻都照戰鬥比例畫，樣式表不能再把噹噹縮到 0.87（原本是為了塞進舊圖的大蜷縮）', () => {
    // 換行先統一（本機取出是 CRLF、雲端是 LF），再拿掉註解
    const css = readFileSync('src/ui/styles/screens.css', 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => m[1]!.includes('data-screen="rest"') && m[1]!.includes('.scene-portrait'));
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.filter((m) => /(^|[;\s])(scale|transform)\s*:/.test(m[2]!)).map((m) => m[1]!.trim())).toEqual([]);
  });

  it('第三關原版底圖（窩在比較右邊）四隻都有自己往右挪的那一條（封封原本漏了，坐在窩邊上）', () => {
    const css = readFileSync('src/ui/styles/screens.css', 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const hero of HEROES) {
      // 2026-09-23 M-2 起選擇器前綴是 `:is(#stage, .screen-leaving)`：換場時墊在底下的舊貓窩也吃得到同一條（特異度不變）
      const rule = new RegExp(`:is\\(#stage, \\.screen-leaving\\)\\[data-screen="rest"\\]\\[data-act="3"\\]\\[data-hero="${hero}"\\]\\[data-restbg="screen_rest_top"\\] \\.scene-portrait \\{ left: 78px; \\}`);
      expect(css, hero).toMatch(rule);
    }
  });
});
