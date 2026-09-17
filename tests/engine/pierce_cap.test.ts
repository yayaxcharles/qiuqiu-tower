import { describe, expect, it } from 'vitest';
import { beginCombat, newRun } from '../../src/engine/run';
import { runEnemyEffects } from '../../src/engine/actions';
import { previewEnemyHits } from '../../src/engine/intentpreview';
import { enemyById } from '../../src/content/enemies';

/**
 * 穿透的傷害上限（使用者 2026-09-17 裁定）。
 *
 * 穿透跳過蜷縮，所以擋不住的那一下配上「下一招加倍」就是「不閃就死」——
 * 而閃避是球球與菲菲才有的東西，噹噹整套沒有隱身，等於沒有答案。
 * 橘皮大王與狸大人剛好兩樣都有：狸大人的泰山鼓壓 36 加倍之後破 80，
 * 而難度 5 的最大生命只有 70。
 *
 * 規則是「蓄力照樣被用掉，但不加倍穿透招」。
 */
function setup() {
  const run = newRun('pierce-cap', 1, 'ninja');
  run.currentNode = run.map.nodes.find((n) => n.type === '戰鬥')!.id;
  const cs = beginCombat(run);
  const p = cs.players[0]!;
  p.hp = 200; p.block = 0;
  return { cs, p, e: cs.enemies[0]! };
}

describe('蓄力不加倍穿透招', () => {
  it('一般攻擊照樣加倍，穿透招不加倍', () => {
    const { cs, p, e } = setup();
    p.hp = 200;
    let hp0 = p.hp;
    runEnemyEffects(cs, e, [{ kind: 'damage', amount: 10 }], true);
    expect(hp0 - p.hp, '一般攻擊要加倍').toBe(20);

    p.hp = 200; hp0 = p.hp;
    runEnemyEffects(cs, e, [{ kind: 'damage', amount: 10, pierce: true }], true);
    expect(hp0 - p.hp, '穿透招不該被加倍').toBe(10);
  });

  it('蓄力照樣被用掉——不會留到下一招突然變兩倍', () => {
    const { cs, p, e } = setup();
    e.charged = true;
    p.hp = 200;
    const hp0 = p.hp;
    // 同一串裡先穿透、再一般：蓄力被前面那下用掉，後面就不該加倍
    runEnemyEffects(cs, e, [{ kind: 'damage', amount: 10, pierce: true }, { kind: 'damage', amount: 10 }], true);
    expect(hp0 - p.hp, '10（穿透不加倍）＋10（蓄力已用掉）').toBe(20);
    expect(e.charged, '蓄力要被清掉').toBe(false);
  });

  it('意圖預告印的數字跟實際打出來的一樣', () => {
    const { cs, p, e } = setup();
    const fx = [{ kind: 'damage' as const, amount: 10, pierce: true as const }];
    const preview = previewEnemyHits(e, fx, p, true).reduce((n, h) => n + h.dmg, 0);
    p.hp = 200;
    const hp0 = p.hp;
    runEnemyEffects(cs, e, [...fx], true);
    expect(preview, '預告跟實際對不起來').toBe(hp0 - p.hp);
  });

  it('師父的亡命一擊壓到 20×2 ＝ 40', () => {
    const master = enemyById['tower_master']!;
    const all = [...master.moves, ...(master.phases ?? []).flatMap((ph) => ph.moves)];
    const mv = all.find((m) => m.label === '亡命一擊')!;
    const dmg = mv.effects.find((f) => f.kind === 'damage')!;
    expect(dmg.kind === 'damage' && dmg.amount).toBe(20);
    expect(dmg.kind === 'damage' && dmg.times).toBe(2);
    expect(dmg.kind === 'damage' && dmg.pierce).toBe(true);
  });

  it('全遊戲沒有一招穿透的底值超過 40', () => {
    // 這條是上限本身：以後有人加新的穿透招，超過就會紅
    const bad: string[] = [];
    for (const e of Object.values(enemyById)) {
      const all = [...e.moves, ...(e.phases ?? []).flatMap((ph) => ph.moves)];
      for (const m of all) {
        for (const f of m.effects) {
          if (f.kind !== 'damage' || !f.pierce) continue;
          const total = f.amount * (f.times ?? 1);
          if (total > 40) bad.push(`${e.name}／${m.label}：${f.amount}×${f.times ?? 1} ＝ ${total}`);
        }
      }
    }
    expect(bad, `這幾招穿透超過 40：\n  ${bad.join('\n  ')}`).toEqual([]);
  });
});
