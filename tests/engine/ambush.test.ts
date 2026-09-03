// 伏兵（2026-09-04）：指定回合的敵方回合從煙裡跳出來、那一拍不出招、下回合才動
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { encounterById } from '../../src/content/enemies';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';

describe('伏兵', () => {
  it('河童第 3 回合叫出兩隻蝌蚪兵：之前沒有、當拍不出手、下回合才動', () => {
    const cs = startCombat({ hp: 999, maxHp: 999, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: 'kappa', rng: new Rng(seedFromString('amb')) });
    const tadpoles = () => cs.enemies.filter((e) => e.enemyId === 'tadpole');
    cs.player.block = 999; endTurn(cs);   // 第 1 回合
    cs.player.block = 999; endTurn(cs);   // 第 2 回合
    expect(tadpoles().length).toBe(0);
    cs.player.block = 999; endTurn(cs);   // 第 3 回合：伏兵
    expect(tadpoles().length).toBe(2);
    expect(tadpoles().every((e) => e.turnCount === 0), '那一拍不出手').toBe(true);
    expect(tadpoles().every((e) => e.move.intent !== 'idle'), '意圖先亮').toBe(true);
    expect(cs.log.some((l) => l.startsWith('伏兵'))).toBe(true);
    cs.player.block = 999; endTurn(cs);   // 第 4 回合：牠們動了
    expect(tadpoles().every((e) => e.turnCount === 1)).toBe(true);
  });
  it('掛伏兵的遭遇只有三組，援軍都是存在的魔物', () => {
    const withAmbush = Object.values(encounterById).filter((e) => e.reinforce?.length);
    expect(withAmbush.length).toBe(3);
  });
});
