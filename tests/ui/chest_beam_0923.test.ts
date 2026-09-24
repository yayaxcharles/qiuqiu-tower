import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * 紙箱開出的秘寶要站在光柱正中間（使用者 2026-09-23：「紙箱開出寶物的位置歪掉了……偏左邊，沒有在光的正中間」）。
 *
 * 秘寶座標是對插圖算百分比的（`left: 33%` 照球球那張量），四隻的開箱插圖各自生、光柱不在同一處：
 * 用透明度掃高度 8～36% 每一列的光柱左右緣取中心，球球 34、菲菲 32、噹噹 29、封封 41。
 * 封封照 33% 放會偏左約 8%（三十幾像素）。換圖或加角色時重量一次、改這張表與 screens.css。
 */
const BEAM_CENTER = { ninja: 34, feifei: 32, dangdang: 29, fengfeng: 41 } as const;
const CSS = readFileSync('src/ui/styles/screens.css', 'utf8').replace(/\r\n/g, '\n');
const BASE = Number(/\.scene-art img\.chest-loot\.in-beam \{[^}]*left: (\d+)%/.exec(CSS)?.[1]);

function leftFor(hero: string): number {
  const m = new RegExp(`\\[data-hero="${hero}"\\] \\.scene-art :is\\(img\\.chest-loot, \\.chest-loot-missing\\)\\.in-beam \\{ left: (\\d+)%; \\}`).exec(CSS);
  return m ? Number(m[1]) : BASE;
}

describe('紙箱：秘寶站在各自插圖的光柱中間', () => {
  it('四隻的落點都在量到的光柱中心 ±1% 內', () => {
    expect(BASE).toBe(33);
    for (const [hero, center] of Object.entries(BEAM_CENTER)) {
      expect(Math.abs(leftFor(hero) - center), `${hero}：落在 ${leftFor(hero)}%、光柱中心 ${center}%`).toBeLessThanOrEqual(1);
    }
  });

  it('每一隻都有自己的開箱插圖（新角色沒量光柱就上線，這裡要記得補）', () => {
    for (const hero of Object.keys(BEAM_CENTER)) {
      const file = hero === 'ninja' ? 'event_chest_open' : `event_${hero}_chest_open`;
      expect(() => readFileSync(`public/assets/bg/${file}.webp`), file).not.toThrow();
    }
  });
});
