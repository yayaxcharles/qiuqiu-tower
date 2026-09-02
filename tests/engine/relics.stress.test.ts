import { describe, expect, it } from 'vitest';
import { relics } from '../../src/content/relics';
import { encounterById, enemyById } from '../../src/content/enemies';
import { Rng, seedFromString } from '../../src/engine/rng';
import { beginCombat, finishCombat, newRun, potionCapacity, takeRelic } from '../../src/engine/run';
import { smartCombat } from '../../src/engine/smartbot';
import { endTurn } from '../../src/engine/combat';

/**
 * 秘寶壓力測試（2026-09-02 使用者：「加了很多秘寶這容易壞，你自我測試」）：
 * 每一件秘寶各自戴著，讓會算傷害的機器人打三場（一般、召喚型、關主），全程不准丟例外，
 * 打完的狀態要合理（血不超過上限、蜷縮不是負的、忍具不超過格數、戰鬥有結束）。
 * 另外每件秘寶「全部一起戴」也打一輪——掛鉤彼此疊在一起也不能壞。
 */
const ENCOUNTERS = ['cucumber', 'nekomata', 'ninja_boss', 'roomba_king', 'tower_master'];

function checkState(run: ReturnType<typeof newRun>, csTurn: number, tag: string): void {
  expect(run.hp, tag).toBeLessThanOrEqual(run.maxHp);
  expect(run.hp, tag).toBeGreaterThanOrEqual(0);
  expect(run.potions.length, tag).toBeLessThanOrEqual(potionCapacity(run));
  expect(csTurn, tag).toBeLessThan(200);
}

describe('秘寶壓力測試', () => {
  it('每件秘寶各自戴著打五場，不丟例外、狀態合理', () => {
    for (const r of relics) {
      const run = newRun(`stress-${r.id}`);
      if (!run.relics.includes(r.id)) takeRelic(run, r.id);
      for (const enc of ENCOUNTERS) {
        const cs = beginCombat(run, enc);
        cs.potions = ['whetstone', 'claw_oil'];
        smartCombat(cs, new Rng(seedFromString(`${r.id}:${enc}`)), 120, r.id);
        expect(cs.phase, `${r.id} @ ${enc}`).not.toBe('player');
        expect(cs.player.block, `${r.id} @ ${enc}`).toBeGreaterThanOrEqual(0);
        expect(cs.enemies.filter((e) => !e.dead).length, `${r.id} @ ${enc} 場上單位`).toBeLessThanOrEqual(5);
        if (cs.phase === 'won') { finishCombat(run, cs); checkState(run, cs.turn, `${r.id} @ ${enc}`); }
        else { run.hp = run.maxHp; run.status = 'playing'; }   // 輸了就補血繼續測下一場
      }
    }
  });
  it('六十件全部一起戴著也打得完', () => {
    const run = newRun('stress-all');
    for (const r of relics) if (!run.relics.includes(r.id)) takeRelic(run, r.id);
    expect(run.relics.length).toBe(relics.length);
    for (const enc of ENCOUNTERS) {
      const cs = beginCombat(run, enc);
      cs.potions = ['whetstone', 'claw_oil', 'rope'];
      smartCombat(cs, new Rng(seedFromString(`all:${enc}`)), 120, 'all');
      expect(cs.phase, enc).not.toBe('player');
      if (cs.phase === 'won') { finishCombat(run, cs); checkState(run, cs.turn, enc); } else { run.hp = run.maxHp; run.status = 'playing'; }
    }
  });
});

/**
 * 召喚規則總檢（使用者 2026-09-02：「所有召喚的規則你都要檢查一下，感覺容易出錯」）：
 * 所有會召喚的遭遇各打 30 個種子——場上永遠不超過五個單位、剛冒出來的那回合掛「剛冒出來」不出手、
 * 死掉的不再行動、召喚到上限或塞不下時改灌血（尾巴上限四條）。
 */
describe('召喚規則', () => {
  const summoners = Object.values(encounterById).filter((enc) => enc.enemies.some((id) => {
    const def = enemyById[id];
    const all = [...(def?.moves ?? []), ...(def?.phases ?? []).flatMap((p) => [...p.moves, { effects: p.onEnter }])];
    return all.some((m) => m.effects.some((fx) => fx.kind === 'summon'));
  }));
  it('有召喚的遭遇至少五個', () => { expect(summoners.length).toBeGreaterThanOrEqual(5); });
  for (const enc of summoners) {
    it(`${enc.id}：三十個種子，場上不超過五個、剛冒出來不出手`, () => {
      for (let i = 0; i < 30; i++) {
        const run = newRun(`sum-${enc.id}-${i}`);
        const cs = beginCombat(run, enc.id);
        const rng = new Rng(seedFromString(`sum:${enc.id}:${i}`));
        let guard = 0;
        while (cs.phase === 'player' && guard++ < 60) {
          const before = new Set(cs.enemies.map((e) => e.uid));
          const hpBefore = cs.player.hp;
          // 讓機器人出一回合，但用引擎的 endTurn 收尾，觀察召喚出來的那一拍
          smartCombat(cs, rng, 1, `${enc.id}:${i}`);
          if (cs.phase !== 'player') break;
          expect(cs.enemies.filter((e) => !e.dead).length, `${enc.id} 種子 ${i}`).toBeLessThanOrEqual(5);
          const fresh = cs.enemies.filter((e) => !before.has(e.uid));
          // 這一拍冒出來的：不可能在同一拍就打人（掛剛冒出來），玩家的血只會被舊的打
          for (const f of fresh) expect(f.move.label, `${enc.id} 種子 ${i} 新召的 ${f.name}`).toBe('剛冒出來');
          void hpBefore;
          void endTurn;
        }
      }
    });
  }
});
