// 2026-09-05 全面體檢第二批：文字與規則對不上、職業過濾漏洞、關主戰亂數分岔、獎勵歸因。
import { describe, expect, it } from 'vitest';

import { cardById } from '../../src/content/cards';
import { glossary } from '../../src/content/glossary';
import { potionById } from '../../src/content/potions';
import { BOSS_RAMPAGE_TURN, RAMPAGE_TURN, startCombat } from '../../src/engine/combat';
import { runEnemyEffects } from '../../src/engine/actions';
import { Rng, seedFromString } from '../../src/engine/rng';
import { applyRunEffects, beginCombat, finishCombat, newRun } from '../../src/engine/run';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { DEBUFFS } from '../../src/engine/types';
import { inst } from '../helpers';

describe('名詞表與牌面文字要跟引擎規則同步', () => {
  it('「減益」列出的種類＝引擎 DEBUFFS（五種，含定身）', () => {
    for (const d of DEBUFFS) expect(glossary['減益'], `少了 ${d}`).toContain(d);
  });
  it('「穿透」不再提早就不存在的「縮頭功」', () => {
    expect(glossary['穿透']).not.toContain('縮頭功');
  });
  it('會變的數字不寫死：忍具格數、飯糰數', () => {
    expect(glossary['忍具']).not.toMatch(/3 個|三個/);
    expect(glossary['飯糰']).not.toMatch(/三顆|3 顆/);
  });
  it('「魔氣暴走」寫的回合數跟 RAMPAGE_TURN 一致', () => {
    expect(glossary['魔氣暴走']).toContain(`第 ${RAMPAGE_TURN} 回合`);
    expect(glossary['魔氣暴走'], '關主戰的回合數也要跟常數一致').toContain(`第 ${BOSS_RAMPAGE_TURN} 回合`);
  });
  it('殘破卷軸的文字說的就是它做的事（抽 2、多 2 顆飯糰）', () => {
    const t = potionById['secret_scroll']!.text;
    expect(t).toContain('2 顆飯糰');
    expect(t).not.toContain('不消耗');
  });
});

describe('職業過濾要蓋到起手牌、罐頭鋪補位、事件撿牌', () => {
  const ninjaOnly = (id: string) => cardById[id]?.hero === 'ninja';
  it('武士的起手牌沒有忍者獨占牌，而且還是 10 張', () => {
    const run = newRun('sam-start', 1, 'samurai');
    expect(run.deck.some((c) => ninjaOnly(c.cardId))).toBe(false);
    expect(run.deck).toHaveLength(10);
  });
  it('忍者的起手牌照舊含替身術', () => {
    expect(newRun('nin-start').deck.some((c) => c.cardId === 'kawarimi')).toBe(true);
  });
  it('事件「撿到一張牌」對武士不會撿到忍者獨占牌', () => {
    let seen = 0;
    for (let i = 0; i < 200; i++) {
      const run = newRun(`pick${i}`, 1, 'samurai');
      const before = run.deck.length;
      applyRunEffects(run, [{ kind: 'addRandomCard', pool: '忍術' }]);
      const added = run.deck.slice(before);
      seen += added.length;
      for (const c of added) expect(ninjaOnly(c.cardId), `撿到了 ${c.cardId}`).toBe(false);
    }
    expect(seen).toBeGreaterThan(150);
  });
});

describe('關主戰的戰鬥亂數要寫回整局（不分岔）', () => {
  it('開打之後 cs.rng.state 就是 run.rng 同一個物件——一般戰與關主戰都一樣', () => {
    const run = newRun('rng-boss');
    const boss = run.map.nodes.find((n) => n.type === '塔主')!;
    run.currentNode = boss.id;
    const cs = beginCombat(run);
    expect(cs.rng.state).toBe(run.rng);
  });
});

describe('獎勵畫面要能講出修飾詞的歸因', () => {
  function loot(modifier?: string) {
    const run = newRun('attr');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    node.modifier = modifier; run.currentNode = node.id;
    const cs = beginCombat(run);
    for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
    cs.phase = 'won';
    return finishCombat(run, cs)!;
  }
  it('肥美的：戰利品帶著修飾詞的名字與說明', () => {
    const r = loot('plump');
    expect(r.modifier?.label).toBe('肥美的');
    expect(r.modifier?.desc).toContain('小魚乾');
  });
  it('沒有修飾詞就沒有這一欄', () => {
    expect(loot().modifier).toBeUndefined();
  });
});

describe('看破與破功同一套「減半」規則（重構前先釘住）', () => {
  it('看破把隱身 4 拍成 2、破功把爪力 5 拍成 2', () => {
    const cs = startCombat({ hp: 100, maxHp: 100, deck: ['sanjo'].map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('hv')) });
    const e = cs.enemies[0]!;
    addStatus(cs.player, '隱身', 4); addStatus(cs.player, '爪力', 5);
    runEnemyEffects(cs, e, [{ kind: 'stripPlayer', names: ['隱身'] }], false);
    runEnemyEffects(cs, e, [{ kind: 'purgePlayer', names: ['爪力'] }], false);
    expect(getStatus(cs.player, '隱身')).toBe(2);
    expect(getStatus(cs.player, '爪力')).toBe(2);
  });
});
