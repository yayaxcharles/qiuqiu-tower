/**
 * 菲菲飛針的起點要在出手那一格的手上（2026-09-22）。
 *
 * 原本所有招式共用一組起點（腳底右 82、上 118），09-22 針招與丟針重畫後出手的手伸得比較遠、高度也不同，
 * 飛針剛冒出來那一格會出現在手腕、胸口、甚至臉上。現在每一招有自己的起點（`feifei-needle-patterns.ts`），
 * 手的位置由 `tools/measure_feifei_needle_hands.py` 從出手那一格量出來，寫在 `docs/feifei-needle-origins.json`：
 * 一隻手出手＝手掌那一截的外框；兩手一起出手（不要過來、全撒了）＝兩隻手掌外框的聯集。
 *
 * 這裡守：
 *  1. 每一招每一波的起點都落在那一格的手部範圍內——把起點表拿掉、退回共用預設，這裡會紅（下面另外驗證共用預設不在手上）；
 *  2. 程式裡的起點跟量測紀錄一致、紀錄量的是現在這張圖（圖集雜湊、出手那一格）——換了圖沒重量會紅；
 *  3. 會放飛針的招每一招都有量過；戰鬥畫面給的 from 用的是同一個共用預設。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import FLIGHT_SRC from '../../src/ui/projectile-flight.ts?raw';
import mainData from '../../src/ui/feifei-motion-data.json';
import needleData from '../../src/ui/feifei-needle-motion-data.json';
import record from '../../docs/feifei-needle-origins.json';
import {
  FEIFEI_NEEDLE_DEFAULT_ORIGIN, feifeiNeedleOrigin, feifeiNeedleReleaseTimes, isFeifeiNeedleAction,
  type FeifeiNeedleAction,
} from '../../src/ui/feifei-needle-patterns';

type Motion = { texture: string; frames: { duration: number }[] };
type Wave = { wave: number; release: number; frame: number; handRange: number[]; origin: number[] };
type Entry = { texture: string; textureSha256: string; waves: Wave[] };

const motions = { ...mainData.actions, ...needleData.actions } as unknown as Record<string, Motion>;
const entries = record.actions as unknown as Record<string, Entry>;
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const inside = (p: { x: number; y: number }, [x0, y0, x1, y1]: number[]) =>
  p.x >= x0! && p.x <= x1! && p.y >= y0! && p.y <= y1!;

// 會放飛針的招：feifei-needle-patterns.ts 的 FeifeiNeedleAction 全部
const NEEDLE_ACTIONS: FeifeiNeedleAction[] = ['shuriken', 'storm', 'needle_combo', 'needle_backhand', 'needle_venom',
  'needle_pierce', 'needle_retreat', 'needle_fan', 'needle_rain', 'needle_barrage'];

describe('菲菲飛針從出手那一格的手上放出去', () => {
  it('會放飛針的招每一招都量過手的位置', () => {
    for (const action of NEEDLE_ACTIONS) expect(isFeifeiNeedleAction(action)).toBe(true);
    expect(Object.keys(entries).sort()).toEqual([...NEEDLE_ACTIONS].sort());
    expect(record.defaultOrigin).toEqual([FEIFEI_NEEDLE_DEFAULT_ORIGIN.x, FEIFEI_NEEDLE_DEFAULT_ORIGIN.y]);
  });

  for (const action of NEEDLE_ACTIONS) {
    describe(action, () => {
      const entry = entries[action]!;
      const motion = motions[action]!;

      it('紀錄量的是現在這張圖、出手那一格', () => {
        expect(entry.texture).toBe(motion.texture);
        expect(sha(`public/${motion.texture}`)).toBe(entry.textureSha256);
        const starts = motion.frames.map((_, i) => Math.round(motion.frames.slice(0, i).reduce((s, f) => s + f.duration * 1000, 0)));
        // 每一波一次出手（波數跟出手時間一樣多），出手時間落在紀錄那一格的開頭
        expect(entry.waves).toHaveLength(feifeiNeedleReleaseTimes(action).length);
        for (const wave of entry.waves) expect(starts[wave.frame - 1]).toBe(wave.release);
      });

      it('起點落在手部範圍內，而且跟紀錄一致', () => {
        for (const wave of entry.waves) {
          const origin = feifeiNeedleOrigin(action, wave.wave);
          expect(origin, `第 ${wave.wave + 1} 波`).toEqual({ x: wave.origin[0], y: wave.origin[1] });
          expect(inside(origin, wave.handRange), `第 ${wave.wave + 1} 波起點 ${JSON.stringify(origin)} 不在手部範圍 ${wave.handRange}`).toBe(true);
        }
      });

      it('共用預設起點不在這一招的手上（退回共用預設會紅）', () => {
        for (const wave of entry.waves) expect(inside(FEIFEI_NEEDLE_DEFAULT_ORIGIN, wave.handRange)).toBe(false);
      });
    });
  }

  it('連針第 3 波以後照左右手輪流', () => {
    expect(feifeiNeedleOrigin('needle_combo', 2)).toEqual(feifeiNeedleOrigin('needle_combo', 0));
    expect(feifeiNeedleOrigin('needle_combo', 3)).toEqual(feifeiNeedleOrigin('needle_combo', 1));
  });

  it('戰鬥畫面給飛針的 from 是「腳底＋共用預設起點」', () => {
    // 2026-09-22 批次 proj：戰鬥畫面丟東西改走 projectile-flight.ts 的 playThrow，起點的算法搬到那裡
    expect(FLIGHT_SRC).toContain('x: foot.x + FEIFEI_NEEDLE_DEFAULT_ORIGIN.x,');
    expect(FLIGHT_SRC).toContain('y: foot.y + FEIFEI_NEEDLE_DEFAULT_ORIGIN.y,');
  });
});
