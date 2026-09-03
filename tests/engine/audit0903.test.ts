import { describe, expect, it } from 'vitest';
import { enemyById } from '../../src/content/enemies';
import { damageEnemy, damagePlayer } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/** 2026-09-03 稽核修正的回歸：狸大人的成長欄位、蛙大名不自己復活、召滿只灌一次血。 */
const DECK = ['sanjo', 'sanjo', 'sanjo', 'tanding', 'tanding'];
function start(encounterId: string, hp = 400): CombatState {
  return startCombat({
    hp, maxHp: hp, deck: DECK.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId, rng: new Rng(seedFromString('audit0903')),
  });
}

describe('稽核 2026-09-03', () => {
  it('狸大人：每三回合 +1 爪力真的有掛上（原本被同一行的註解吃掉）', () => {
    expect(enemyById['tanuki_lord']?.strengthEveryNTurns).toBe(3);
    const cs = start('tanuki_lord');
    const e = cs.enemies[0]!;
    const before = getStatus(e, '爪力');
    for (let i = 0; i < 6; i++) endTurn(cs);
    expect(getStatus(e, '爪力')).toBeGreaterThanOrEqual(before + 2);
  });

  it('蛙大名：蝌蚪兵還在，本體倒下也不會爬起來（只有蝌蚪會）', () => {
    const cs = start('frog_daimyo');
    const frog = cs.enemies[0]!;
    frog.move = { intent: 'summon', label: '喚蝌蚪', effects: [{ kind: 'summon', enemyId: 'tadpole', n: 2, max: 2 }] };
    endTurn(cs);
    const tadpoles = cs.enemies.filter((x) => x.enemyId === 'tadpole');
    expect(tadpoles.length).toBe(2);
    damageEnemy(cs, frog, 999, { direct: true });
    expect(frog.dead).toBe(true);
    // 蝌蚪也打倒一隻：牠會爬起來（另一隻蝌蚪還活著），蛙大名不會
    damageEnemy(cs, tadpoles[0]!, 999, { direct: true });
    endTurn(cs);
    expect(frog.dead, '蛙大名不該復活').toBe(true);
    expect(tadpoles[0]!.dead, '蝌蚪兵要躺兩回合').toBe(true);   // 2026-09-03 改：預設躺兩回合才爬起來
    endTurn(cs);
    expect(frog.dead, '蛙大名不該復活').toBe(true);
    expect(tadpoles[0]!.dead, '蝌蚪兵該爬起來').toBe(false);
  });

  it('召喚：場上已滿時一招只灌一次血，不會照 n 灌兩次', () => {
    const cs = start('tanuki_lord');
    const lord = cs.enemies[0]!;
    const summon = { intent: 'summon' as const, label: '喚小弟', effects: [{ kind: 'summon' as const, enemyId: 'tanuki_kid', n: 2, max: 2 }] };
    lord.move = summon; endTurn(cs);
    const kids = cs.enemies.filter((x) => x.enemyId === 'tanuki_kid');
    expect(kids.length).toBe(2);
    const hpBefore = kids.map((k) => k.maxHp);
    lord.move = summon; endTurn(cs);
    const grown = kids.filter((k, i) => k.maxHp > hpBefore[i]!);
    expect(grown.length, '只有一隻被灌血').toBe(1);
  });

  it('反彈先扣蜷縮：球球蜷縮 4 打有反彈 2 的魔物，血不掉、蜷縮剩 2；魔物有防禦時被球球的反彈也先扣防禦', () => {
    const cs = start('cucumber');
    const e = cs.enemies[0]!;
    addStatus(e, '反彈', 2);
    cs.player.block = 4;
    const hp = cs.player.hp;
    damageEnemy(cs, e, 5);
    expect(cs.player.hp).toBe(hp);
    expect(cs.player.block).toBe(2);
    // 反過來：球球身上反彈 3，魔物帶 5 點防禦打過來，反彈先扣牠的防禦
    addStatus(cs.player, '反彈', 3);
    e.block = 5; const ehp = e.hp;
    damagePlayer(cs, e, 3);
    expect(e.hp).toBe(ehp);
    expect(e.block).toBe(2);
  });

  it('師父換血條：身上的減益全部化掉，增益留著（使用者 2026-09-03）', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    addStatus(e, '翻肚', 2); addStatus(e, '噎到', 3); addStatus(e, '定身', 1); addStatus(e, '爪力', 4);
    e.hp = 1; e.invulnIn = 0;
    damageEnemy(cs, e, 10, { direct: true });
    expect(e.phase).toBe(1);
    expect(getStatus(e, '翻肚')).toBe(0);
    expect(getStatus(e, '噎到')).toBe(0);
    expect(getStatus(e, '定身')).toBe(0);
    expect(getStatus(e, '爪力'), '增益要留著').toBe(4);
    expect(cs.log.some((l) => l.includes('全化掉了'))).toBe(true);
  });
});
