/**
 * 連線牌的混搭牌面（2026-09-23，批次 coopcards；美術盤點 C4，工具 `tools/gen_coop_card_art.py`）。
 *
 * 連線兩位不同角色時，互助牌要畫這兩位；原本 33 張裡只有「分你一半」「一起喘口氣」有，
 * 其餘 31 張退回「兩隻一樣的我」（兩隻噹噹互相幫忙，同伴明明是封封）。這一批補了 159 張。這裡守：
 *  1. 每張連線牌、每個拿得到它的人跟另外三位湊成的每一組，都有混搭牌面，兩個席位看到同一張
 *    （鍵是排序過的兩位，程式照舊，主控裁決「對稱構圖、程式不動」）；
 *  2. 圖檔跟紀錄一致、是 299×240 的透明圖（同現有牌面）。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cards } from '../../src/content/cards';
import { pickable } from '../../src/engine/hero';
import { _setManifestForTest, cardArtKey, coopArtUrlsFor, setLocalHero, type Manifest } from '../../src/ui/assets';

const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const RECORD = JSON.parse(readFileSync('docs/coop-card-art.json', 'utf8')) as {
  assets: { key: string; path: string; pair: [string, string]; card: string; sha256: string }[];
};
const HEROES = ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const;
beforeEach(() => { _setManifestForTest(MANIFEST); });
afterEach(() => { setLocalHero(undefined); });

/** 每張連線牌的牌面鍵 → 會用到的搭檔組（排序過） */
const NEED = new Map<string, Set<string>>();
for (const c of cards) {
  if (!c.coop) continue;
  const holders = HEROES.filter((h) => pickable(c, h, 2));
  for (const a of holders) {
    for (const b of HEROES) {
      if (a === b) continue;
      const set = NEED.get(c.art) ?? new Set<string>();
      set.add([a, b].sort().join('_'));
      NEED.set(c.art, set);
    }
  }
}

/** WebP（VP8X）表頭：畫布大小與有沒有透明度 */
const header = (file: string): { size: [number, number]; alpha: boolean } => {
  const b = readFileSync(file);
  expect(new TextDecoder().decode(b.subarray(12, 16)), file).toBe('VP8X');
  const read24 = (at: number): number => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
  return { size: [1 + read24(24), 1 + read24(27)], alpha: (b[20]! & 0x10) !== 0 };
};

describe('連線牌的混搭牌面', () => {
  it('33 張連線牌、每一組搭檔都有自己的牌面（合計 171 張：原本 12、這批 159）', () => {
    expect(NEED.size).toBe(33);
    const missing: string[] = [];
    let total = 0;
    for (const [art, pairs] of NEED) {
      for (const pair of pairs) {
        total++;
        const key = art.replace(/^card\//, `card/coop_${pair}_`);
        if (MANIFEST.cards[key] !== `assets/cards/${key}.webp` || !existsSync(`public/assets/cards/${key}.webp`)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
    expect(total).toBe(171);
    expect(RECORD.assets.length).toBe(159);
  });

  it('兩個席位（誰當本機都一樣）拿到同一張混搭牌面，不是自己那張「兩隻一樣的我」', () => {
    for (const [art, pairs] of NEED) {
      for (const pair of pairs) {
        const [a, b] = pair.split('_') as [string, string];
        const key = art.replace(/^card\//, `card/coop_${pair}_`);
        expect(cardArtKey(art, a, b), `${a}＋${b} ${art}`).toBe(key);
        expect(cardArtKey(art, b, a), `${b}＋${a} ${art}`).toBe(key);
      }
    }
  });

  it('圖檔跟紀錄一致、是 299×240 的透明圖', () => {
    for (const r of RECORD.assets) {
      const file = `public/${r.path}`;
      expect(createHash('sha256').update(readFileSync(file)).digest('hex'), r.key).toBe(r.sha256);
      expect(header(file), r.key).toEqual({ size: [299, 240], alpha: true });
      expect(r.key, r.key).toBe(r.card.replace(/^card\//, `card/coop_${r.pair.join('_')}_`));
    }
  });

  it('混搭牌面只在那一組搭檔的連線預載裡（單人開場不下載、別組也不抓）', () => {
    // 2026-09-23 批次 coopload：連線預載改成只抓這一組搭檔的（`coopArtUrlsFor`）
    for (const r of RECORD.assets) {
      const mine = coopArtUrlsFor(r.pair);
      expect(mine.some((u) => u.endsWith(r.path)), r.key).toBe(true);
      const other = HEROES.filter((h) => !r.pair.includes(h));
      expect(coopArtUrlsFor(other).some((u) => u.endsWith(r.path)), `${other.join('+')} 不該抓 ${r.key}`).toBe(false);
    }
  });
});
