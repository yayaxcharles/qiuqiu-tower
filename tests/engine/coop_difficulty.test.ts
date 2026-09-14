import { describe, expect, it } from 'vitest';
import { newCoopRun, potionCapacity } from '../../src/engine/run';
import { difficultyMods } from '../../src/content/difficulty';
import { me } from '../../src/engine/runplayer';

/*
 * 連線局照開房的人選的難度開（使用者 2026-09-14：「雙人模式的難度寫死在 1……可以修正嗎？難度也加上去」）。
 * 大廳那一半在 `tools/coop_screen_flow.test.ts` 掃原始碼；這裡盯引擎這一半。
 */
describe('連線局的難度', () => {
  const curse = difficultyMods(4).startCurse!;
  const curses = (run: ReturnType<typeof newCoopRun>, seat: number): number =>
    me(run, seat).deck.filter((c) => c.cardId === curse).length;

  it('難度 4 起兩位都背開局壞毛病——混搭那條原本漏了第二位（以前難度寫死 1 走不到）', () => {
    const run = newCoopRun('coop-d4-mixed', 4, 'ninja', 'feifei');
    expect(run.difficulty).toBe(4);
    expect(curses(run, 0), '開房的那位').toBe(1);
    expect(curses(run, 1), '加入的那位（菲菲）').toBe(1);
  });

  it('同角色那條本來就照抄整副牌，照舊一人一張', () => {
    const run = newCoopRun('coop-d4-same', 4, 'feifei', 'feifei');
    expect(curses(run, 0)).toBe(1);
    expect(curses(run, 1)).toBe(1);
  });

  it('難度 1 誰都不背；難度 5 兩位的最大生命、忍具格數都照難度算', () => {
    const easy = newCoopRun('coop-d1', 1, 'ninja', 'feifei');
    expect(curses(easy, 0) + curses(easy, 1)).toBe(0);
    const hard = newCoopRun('coop-d5', 5, 'feifei', 'ninja');
    for (const seat of [0, 1]) {
      expect(me(hard, seat).maxHp, `座位 ${seat} 的最大生命`).toBe(difficultyMods(5).maxHp);
      expect(potionCapacity(hard, seat), `座位 ${seat} 的忍具格數`).toBe(difficultyMods(5).potionSlots);
    }
  });
});
