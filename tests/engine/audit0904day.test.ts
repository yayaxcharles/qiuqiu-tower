// 2026-09-04 白天稽核（docs/審查報告/程式稽核_2026-09-04白天.md）修掉的問題，各釘一個回歸
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { encounterById, encounters, encountersOfPool } from '../../src/content/enemies';
import { damagePlayer, gainStealth } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import { applyRunEffects, buyCard, makeShop, newRun, reshuffleShop, resolvePendingAfterFight } from '../../src/engine/run';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { enemyIdsForAct } from '../../src/ui/preload';
import { inst } from '../helpers';

function start(encounterId: string, seed = 's') {
  return startCombat({ hp: 76, maxHp: 76, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId, rng: new Rng(seedFromString(seed)) });
}

describe('稽核 2026-09-04 白天', () => {
  it('中 1：要玩家挑的效果不延後，戰利品才延後', () => {
    const run = newRun('m1');
    const out = applyRunEffects(run, [{ kind: 'relic', pool: '常見' }, { kind: 'chooseCard', pool: '絕學', n: 3 }, { kind: 'fight', encounterId: 'wood_dummy', bonusFish: 0 }]);
    expect(out && 'fight' in out).toBe(true);
    if (out && 'fight' in out) {
      expect(out.fight.afterWin?.length).toBe(1);
      expect(out.fight.afterWin?.[0]?.kind).toBe('relic');
    }
  });
  it('中 3：hidden 遭遇不進預載名單、地圖也抽不到', () => {
    const hiddenOnly = new Set(encounters.filter((e) => e.hidden).flatMap((e) => e.enemies).filter((id) => !encounters.some((e) => !e.hidden && e.enemies.includes(id))));
    // 第三波立繪 2026-09-04 14:18 到齊後 hidden 已全數拿掉，這裡可能是 0；下面的檢查對之後再掛 hidden 的遭遇一樣有效
    for (const act of [1, 2, 3]) for (const id of enemyIdsForAct(act)) expect(hiddenOnly.has(id), `${id} 在第 ${act} 關預載名單`).toBe(false);
    for (let i = 0; i < 60; i++) for (const act of [1, 2, 3]) for (const n of generateMap(new Rng(seedFromString(`h${i}`)), { act, flags: {} }).nodes) if (n.encounterId) expect(encounterById[n.encounterId]!.hidden, `${n.encounterId} 被抽到`).toBeFalsy();
  });
  it('中 4：難度 5 前哨戰有自己的遭遇，不進菁英池、魔氣 4', () => {
    const pre = encounterById['shadow_cat_prefight']!;
    expect(pre.strength).toBe(4); expect(pre.hpScale).toBeUndefined();
    expect(encountersOfPool('大魔物', 3).some((e) => e.id === 'shadow_cat_prefight')).toBe(false);
  });
  it('中 5：波斯喚僕從在僕從都站著時什麼都不做（不灌血）', () => {
    const cs = start('persian_lady');
    const lady = cs.enemies.find((e) => e.enemyId === 'persian_lady')!;
    const hpBefore = cs.enemies.filter((e) => e.enemyId !== 'persian_lady').map((e) => e.maxHp);
    lady.move = { intent: 'summon', label: '喚僕從', effects: [{ kind: 'summon', enemyId: 'butler_cat', n: 1, max: 1, noPour: true }, { kind: 'summon', enemyId: 'maid_cat', n: 1, max: 1, noPour: true }] };
    for (const e of cs.enemies) if (e !== lady) e.move = { intent: 'block', label: '布陣', effects: [{ kind: 'block', amount: 5 }] };
    cs.player.block = 99; endTurn(cs);
    expect(cs.enemies.filter((e) => e.enemyId !== 'persian_lady').map((e) => e.maxHp)).toEqual(hpBefore);
    expect(cs.enemies.filter((e) => !e.dead).length).toBe(3);
  });
  it('低 1：牌全賣光時重整不收錢、回 false', () => {
    const run = newRun('l1'); run.fish = 9999;
    const shop = makeShop(run);
    for (let i = 0; i < shop.cards.length; i++) buyCard(run, shop, i);
    const fish = run.fish;
    expect(reshuffleShop(run, shop)).toBe(false);
    expect(run.fish).toBe(fish); expect(shop.reshuffled).toBeFalsy();
  });
  it('低 8：重整後買到標升級的那格就是升級牌', () => {
    let found = false;
    for (let i = 0; i < 80 && !found; i++) {
      const run = newRun(`l8-${i}`); run.fish = 9999; run.act = 3;
      const shop = makeShop(run); buyCard(run, shop, 0);
      reshuffleShop(run, shop);
      const k = shop.cards.findIndex((c) => c.upgraded && !c.sold);
      if (k >= 0) { buyCard(run, shop, k); expect(run.deck[run.deck.length - 1]!.upgraded).toBe(true); found = true; }
    }
    expect(found).toBe(true);
  });
  it('低 8：蜷縮剛好擋滿時反彈照樣回敬（以前隱身先閃就不會）', () => {
    const cs = start('wood_dummy', 'thorns');
    const p = cs.player; const e = cs.enemies[0]!;
    p.block = 10; gainStealth(cs, 1); addStatus(p, '反彈', 3);
    const ehp = e.hp;
    damagePlayer(cs, e, 8);
    expect(getStatus(p, '隱身')).toBe(1);
    expect(e.hp, '被擋住的攻擊照樣挨反彈').toBe(ehp - 3);
  });
  it('中 2 的守門：pendingAfterFight 打贏才發、輸了清掉（機器人走同一支）', () => {
    const run = newRun('m2');
    run.pendingAfterFight = [{ kind: 'fish', n: 70 }];
    const fish = run.fish; resolvePendingAfterFight(run, true); expect(run.fish).toBe(fish + 70);
    run.pendingAfterFight = [{ kind: 'fish', n: 70 }]; resolvePendingAfterFight(run, false); expect(run.fish).toBe(fish + 70);
  });
});
