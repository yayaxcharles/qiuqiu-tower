// 2026-09-05 全面體檢（docs/審查報告/全面體檢_2026-09-05.md）確認的引擎錯，每條先用測試釘住再修。
import { describe, expect, it } from 'vitest';

import { enemyById } from '../../src/content/enemies';
import { damageEnemy, runEnemyEffects } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { newRun } from '../../src/engine/run';
import { loadRun, saveRun, setStore } from '../../src/engine/save';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function fight(encounterId: string, relics: string[] = [], seed = 'a0905'): CombatState {
  return startCombat({
    hp: 300, maxHp: 300, deck: ['sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics, potions: [], encounterId, rng: new Rng(seedFromString(seed)),
  });
}

describe('蛙大名：標了 neverRevive 的關主倒下就是倒下', () => {
  it('蝌蚪兵還活著時打倒蛙大名：不進「重生中」、擊倒秘寶照發', () => {
    const cs = fight('frog_daimyo', ['coin_sword', 'sardine_tin']);
    const frog = cs.enemies[0]!;
    runEnemyEffects(cs, frog, [{ kind: 'summon', enemyId: 'tadpole', n: 2 }], false);
    expect(cs.enemies.filter((e) => e.enemyId === 'tadpole' && !e.dead)).toHaveLength(2);
    cs.player.hp = 250;
    damageEnemy(cs, frog, 9999);
    expect(frog.dead).toBe(true);
    expect(frog.reviveIn, '牠自己倒了就倒了，不該掛「重生中」').toBe(0);
    expect(cs.fishDelta, '銅錢劍的 8 條小魚乾要發').toBe(8);
    expect(cs.player.hp, '沙丁魚罐的回血要發').toBe(252);
  });

  it('對照：蝌蚪兵倒下時蛙大名還在，照樣「重生中」、秘寶不發', () => {
    const cs = fight('frog_daimyo', ['coin_sword']);
    const frog = cs.enemies[0]!;
    runEnemyEffects(cs, frog, [{ kind: 'summon', enemyId: 'tadpole', n: 1 }], false);
    const tad = cs.enemies.find((e) => e.enemyId === 'tadpole')!;
    damageEnemy(cs, tad, 9999);
    expect(tad.reviveIn).toBeGreaterThan(0);
    expect(cs.fishDelta).toBe(0);
  });
});

describe('狸小弟：蓄力只加倍下一次傷害，不看那招的意圖', () => {
  const move = (label: string) => enemyById['tanuki_kid']!.moves.find((m) => m.label === label)!;
  it('蓄力後接「裝可愛」（防禦意圖但帶 5 傷）：這一下加倍成 10，蓄力就用掉', () => {
    const cs = fight('tanuki_kid');
    const e = cs.enemies[0]!;
    e.charged = true; e.move = move('裝可愛'); cs.player.block = 0;
    const hp = cs.player.hp;
    endTurn(cs);
    expect(hp - cs.player.hp).toBe(10);
    expect(e.charged, '加倍套過一次就該清掉').toBe(false);
  });

  it('連著三招只有第一招加倍（原本 10＋12＋26＝48，該是 10＋6＋13＝29）', () => {
    const cs = fight('tanuki_kid');
    const e = cs.enemies[0]!;
    e.charged = true;
    let lost = 0;
    for (const label of ['裝可愛', '搗蛋', '葉子彈']) {
      e.move = move(label); cs.player.block = 0;
      const hp = cs.player.hp; endTurn(cs); lost += hp - cs.player.hp;
    }
    expect(lost).toBe(10 + 6 + 13);
  });
});

describe('反彈：打 0 傷不該被刺（跟球球側同一條規則）', () => {
  it('對掛軸墨貓造成 0 傷，球球不掉血；造成 5 傷才被刺 2', () => {
    const cs = fight('ink_cat');
    const e = cs.enemies[0]!;
    const hp = cs.player.hp;
    damageEnemy(cs, e, 0);
    expect(cs.player.hp, '0 傷不該觸發反彈').toBe(hp);
    damageEnemy(cs, e, 5);
    expect(hp - cs.player.hp).toBe(2);
  });
});

describe('存檔：地圖上的遭遇、事件與身上的秘寶、忍具 id 對不上就當不相容', () => {
  function store() {
    const m = new Map<string, string>();
    setStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } });
    return m;
  }
  it('戰鬥節點的遭遇 id 不存在 → 讀檔回 null 並清掉，不會留到開戰才炸', () => {
    const m = store(); const run = newRun('bad-enc');
    run.map.nodes.find((n) => n.type === '戰鬥')!.encounterId = '沒有這場';
    saveRun(run);
    expect(loadRun()).toBeNull();
    expect(m.has('qiuqiu-tower/run'), '不相容的檔要清掉').toBe(false);
  });
  it('事件 id 不存在 → null', () => {
    store(); const run = newRun('bad-ev');
    run.map.nodes.find((n) => n.type === '事件')!.eventId = '沒有這件事';
    saveRun(run); expect(loadRun()).toBeNull();
  });
  it('秘寶或忍具 id 不存在 → null', () => {
    store(); const a = newRun('bad-relic'); a.relics.push('沒有這件秘寶'); saveRun(a); expect(loadRun()).toBeNull();
    store(); const b = newRun('bad-potion'); b.potions.push('沒有這個忍具'); saveRun(b); expect(loadRun()).toBeNull();
  });
  it('對照：正常的檔讀得起來', () => {
    store(); const run = newRun('ok'); saveRun(run); expect(loadRun()).not.toBeNull();
  });
});
