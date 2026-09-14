import { describe, expect, it } from 'vitest';
import { applyRunEffects, newCoopRun, newRun } from '../../src/engine/run';
import { relicById, relics } from '../../src/content/relics';
import { me } from '../../src/engine/runplayer';

/*
 * 事件直接給秘寶時，只看拿到的那一位的角色（使用者 2026-09-14：雙人混搭時不要給菲菲紙袋、影披風）。
 */
describe('事件直接給的秘寶照拿到的那一位抽', () => {
  const notForFeifei = relics.filter((r) => r.notFor?.includes('feifei')).map((r) => r.id);

  it('混搭雙人（球球＋菲菲）：菲菲那一位從事件拿到的秘寶，永遠不會是排除她的那幾件', () => {
    const got: string[] = [];
    for (let i = 0; i < 400; i++) {
      const run = newCoopRun(`ev-relic-${i}`, 1, 'ninja', 'feifei');
      applyRunEffects(run, [{ kind: 'relic', pool: i % 2 ? '大魔物' : '塔主' }], [], [], 1);
      got.push(...me(run, 1).relics);
    }
    const bad = got.filter((id) => notForFeifei.includes(id));
    expect(bad, `菲菲拿到了：${[...new Set(bad)].map((id) => relicById[id]?.name).join('、')}`).toEqual([]);
  });

  it('同一局裡球球那一位照樣抽得到紙袋、影披風（兩人一起的清單不受影響，這一條只是確認沒有整個擋掉）', () => {
    const got = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const run = newCoopRun(`ev-relic-ninja-${i}`, 1, 'ninja', 'feifei');
      applyRunEffects(run, [{ kind: 'relic', pool: i % 2 ? '大魔物' : '塔主' }], [], [], 0);
      for (const id of me(run, 0).relics) got.add(id);
    }
    expect(notForFeifei.some((id) => got.has(id)), '球球抽了 400 次一次都沒抽到，代表整個被擋掉了').toBe(true);
  });

  // 單機只有她一位，「看這一位」跟「看全員」的候選本來就一樣，所以單機的結果不會變；這條只盯她照舊抽不到
  it('單機的菲菲照舊從事件抽不到排除她的秘寶', () => {
    for (let i = 0; i < 50; i++) {
      const a = newRun(`single-relic-${i}`, 1, 'feifei');
      applyRunEffects(a, [{ kind: 'relic', pool: '大魔物' }], [], [], 0);
      expect(me(a, 0).relics.some((id) => notForFeifei.includes(id)), '單機菲菲本來就抽不到').toBe(false);
    }
  });
});
