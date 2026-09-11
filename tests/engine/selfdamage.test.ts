// 自傷（鐵頭功、拼命、亡命、鐵砂衣的開場代價）先扣蜷縮再扣血。
//
// 使用者 2026-09-11 回報：「用鐵頭功的時候我身上有蜷縮值卻還是扣血了」。
// 查下去發現 2026-09-03 那次「被打到的人都應該優先扣蜷縮」只改了**反彈**，自傷漏掉了，
// 而且**整條路徑一條測試都沒有**——所以它壞了一個多星期沒人發現。這支就是補那個洞。
import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { relicById } from '../../src/content/relics';
import { startCombat } from '../../src/engine/combat';
import { applyEffects } from '../../src/engine/effects';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';

function fight(potions: string[] = []) {
  return startCombat({
    hp: 100, maxHp: 100, deck: [inst('canshang', 1)], relics: [], potions,
    encounterId: 'kappa', rng: new Rng(seedFromString('selfdmg')),
  });
}

describe('自傷先扣蜷縮', () => {
  it('蜷縮夠多：一點血都不掉', () => {
    const cs = fight();
    cs.player.block = 10;
    applyEffects(cs, [{ kind: 'selfDamage', amount: 6 }], { source: 'card' });
    expect(cs.player.hp, '血一點都不該掉').toBe(100);
    expect(cs.player.block, '蜷縮扣 6 剩 4').toBe(4);
  });

  it('蜷縮不夠：擋掉多少算多少，剩下的才進血', () => {
    const cs = fight();
    cs.player.block = 2;
    applyEffects(cs, [{ kind: 'selfDamage', amount: 6 }], { source: 'card' });
    expect(cs.player.block).toBe(0);
    expect(cs.player.hp, '2 被擋掉、剩 4 點進血').toBe(96);
  });

  it('沒有蜷縮：照舊全部進血', () => {
    const cs = fight();
    cs.player.block = 0;
    applyEffects(cs, [{ kind: 'selfDamage', amount: 6 }], { source: 'card' });
    expect(cs.player.hp).toBe(94);
  });

  it('**三張會自傷的牌都吃得到**（鐵頭功 2、拼命 3、亡命 6）', () => {
    for (const id of ['tietou', 'boming', 'wangming']) {
      const def = cardById[id];
      expect(def, id).toBeTruthy();
      const self = def!.effects.find((f) => f.kind === 'selfDamage');
      expect(self, `${id} 應該要有自傷`).toBeTruthy();
      const cs = fight();
      cs.player.block = 99;
      applyEffects(cs, [self!], { source: 'card' });
      expect(cs.player.hp, `${def!.name} 的自傷應該被蜷縮擋掉`).toBe(100);
    }
  });

  it('鐵砂衣的開場代價也走同一條，而且不會把球球打死', () => {
    // 開戰第一拍蜷縮是 0，所以它的代價實質不變——但規則要一致
    const iron = Object.values(relicById).find((r) => r.hooks.combatStart?.some((f) => f.kind === 'selfDamage'));
    expect(iron, '應該有一件開場自傷的秘寶').toBeTruthy();
    const fx = iron!.hooks.combatStart!.find((f) => f.kind === 'selfDamage')!;
    const cs = fight();
    cs.player.block = 99;
    applyEffects(cs, [fx], { source: 'relic' });
    expect(cs.player.hp, '有蜷縮就擋掉').toBe(100);

    const cs2 = fight();
    cs2.player.hp = 2; cs2.player.block = 0;
    applyEffects(cs2, [fx], { source: 'relic' });
    expect(cs2.player.hp, '秘寶的代價至少留 1 血').toBeGreaterThanOrEqual(1);
  });
});
