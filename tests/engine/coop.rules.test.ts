import { describe, expect, it } from 'vitest';
import { IDLE_FORCE_MS, allReady, beginEnemyTurn, canPlay, finishEnemyTurn, forceReady, playCard, setReady, startCombat, startPlayerTurn, usePotion, waitingFor } from '../../src/engine/combat';
import { damagePlayer, pickVictim, runEnemyEffects } from '../../src/engine/actions';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';
import { relics } from '../../src/content/relics';
import type { CombatState, PlayerCombat } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/*
 * 兩人玩的四條規則（使用者 2026-09-11 拍板），這一支管其中兩條：
 *   規則二：魔物一招**隨機挑一位還站著的**打
 *   規則四：一個人倒下不算輸，另一個繼續打到自己也倒為止
 * 另外兩條（秘寶忍具各帶各的、獎勵分開給）在別的地方。
 */

function combat(): CombatState {
  const cs = startCombat({
    hp: 60, maxHp: 80, deck: [inst('tanding', 1)], relics: [], potions: [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('coop-rules')),
  });
  cs.player.drawPile = []; cs.player.hand = [inst('tanding', 1)]; cs.player.energy = 9;
  return cs;
}

function addSecond(cs: CombatState, deckIds: string[] = []): PlayerCombat {
  const p2 = blankPlayer(deckIds, 1);
  cs.players.push(p2);
  return p2;
}

describe('規則四：一個人倒下不算輸', () => {
  it('一號倒下，二號還站著，戰鬥繼續', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 5; p1.block = 0; p2.hp = 50;
    const foe = cs.enemies[0]!;

    damagePlayer(cs, foe, 99, { victim: p1 });

    expect(p1.hp).toBe(0);
    expect(p1.down, '一號倒下了').toBe(true);
    expect(cs.phase, '但戰鬥還在打').toBe('player');
    expect(cs.log.some((l) => l.includes('另一位還站著'))).toBe(true);
  });

  it('兩個都倒下才算輸', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 5; p1.block = 0; p2.hp = 5; p2.block = 0;
    const foe = cs.enemies[0]!;

    damagePlayer(cs, foe, 99, { victim: p1 });
    expect(cs.phase).toBe('player');
    damagePlayer(cs, foe, 99, { victim: p2 });
    expect(cs.phase, '最後一位也倒了').toBe('lost');
  });

  it('單機一位玩家：倒下就是輸，跟以前一模一樣', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    p1.hp = 5; p1.block = 0;
    damagePlayer(cs, cs.enemies[0]!, 99, { victim: p1 });
    expect(cs.phase).toBe('lost');
  });

  it('倒下的人不再挨打、不抽牌、也打不出牌', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs, ['sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo']);
    p1.hp = 5; p1.block = 0; p2.hp = 50;
    const foe = cs.enemies[0]!;

    damagePlayer(cs, foe, 99, { victim: p1 });
    expect(p1.down).toBe(true);

    // 再打也不會有事（血條已經是 0，不該再往下掉）
    expect(damagePlayer(cs, foe, 20, { victim: p1 }), '倒下的人吃不到傷害').toBe(0);
    expect(p1.hp).toBe(0);

    // 回合開始：倒下的不抽牌，站著的照抽
    p1.hand = []; p2.hand = [];
    startPlayerTurn(cs);
    expect(p1.hand.length, '倒下的人不抽牌').toBe(0);
    expect(p2.hand.length, '站著的照抽五張').toBe(5);

    expect(canPlay(cs, 1, undefined, 0).ok, '倒下的人打不出牌').toBe(false);
  });

  it('倒下的人回合結束不會再被詛咒或減益結算', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 5; p1.block = 0; p2.hp = 50;
    damagePlayer(cs, cs.enemies[0]!, 99, { victim: p1 });

    p1.hand = [inst('sanjo', 11)];
    beginEnemyTurn(cs);
    expect(p1.hand.length, '倒下的人手牌留在原地，沒被結算').toBe(1);
  });
});

describe('規則二：魔物一招隨機挑一位還站著的打', () => {
  it('**只剩一位候選就完全不擲骰**：單機的亂數順序一格都不能位移', () => {
    const cs = combat();
    const before = { ...cs.rng.state };
    pickVictim(cs);
    expect(cs.rng.state, '一個人的時候 pickVictim 不准動到亂數').toEqual(before);

    // 兩位但其中一位倒下：候選還是只有一位，一樣不擲骰
    const p2 = addSecond(cs);
    p2.down = true;
    const before2 = { ...cs.rng.state };
    expect(pickVictim(cs)).toBe(cs.players[0]);
    expect(cs.rng.state).toEqual(before2);
  });

  it('兩位都站著就真的隨機，而且兩位都挑得到', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    const seen = new Set<PlayerCombat>();
    for (let i = 0; i < 50; i++) seen.add(pickVictim(cs));
    expect(seen.has(p1), '一號被挑到過').toBe(true);
    expect(seen.has(p2), '二號被挑到過').toBe(true);
  });

  it('倒下的人不會被挑中', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.down = true;
    for (let i = 0; i < 30; i++) expect(pickVictim(cs)).toBe(p2);
  });

  it('挑的單位是「一招」不是「一個效果」：同一招的傷害與減益落在同一個人身上', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 50; p2.hp = 50;
    const foe = cs.enemies[0]!;

    // 不指定對象，讓它自己挑；挑中誰不重要，重要的是**兩個效果落在同一個人身上**
    for (let i = 0; i < 20; i++) {
      p1.hp = 50; p2.hp = 50;
      p1.statuses = {}; p2.statuses = {};
      runEnemyEffects(cs, foe, [
        { kind: 'damage', amount: 6 },
        { kind: 'statusPlayer', name: '翻肚', amount: 2 },
      ], false);
      const hurt = [p1, p2].filter((p) => p.hp < 50);
      const debuffed = [p1, p2].filter((p) => getStatus(p, '翻肚') > 0);
      expect(hurt.length, '只有一個人挨打').toBe(1);
      expect(debuffed, '挨打的跟中減益的是同一位').toEqual(hurt);
    }
  });
});

describe('規則一：秘寶與忍具各帶各的', () => {
  it('cs.relics / cs.potions 是指向第一位的別名，splice 改得動真正的資料', () => {
    const cs = startCombat({
      hp: 60, maxHp: 80, deck: [inst('tanding', 1)],
      relics: ['nekomata_bell'], potions: ['whetstone', 'claw_oil'],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('coop-relic')),
    });
    expect(cs.relics).toBe(cs.player.relics);
    expect(cs.potions).toBe(cs.player.potions);
    cs.potions.splice(0, 1);
    expect(cs.player.potions, '別名上的 splice 動到的是真正的那一份').toEqual(['claw_oil']);
  });

  it('二號喝的是自己袋子裡的忍具，一號的袋子沒被動', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.potions = ['whetstone']; p2.potions = ['whetstone']; p2.hp = 50; p2.maxHp = 80;

    expect(usePotion(cs, 'whetstone', undefined, 1), '二號喝得下去').toBe(true);
    expect(p2.potions, '扣的是二號的').toEqual([]);
    expect(p1.potions, '一號的還在').toEqual(['whetstone']);

    // 二號袋子空了就喝不到，即使一號還有
    expect(usePotion(cs, 'whetstone', undefined, 1), '二號沒了就是沒了，借不到一號的').toBe(false);
  });

  it('留蜷縮的守護符只保護帶著它的那一位', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    const guard = relics.find((r) => (r.hooks.blockKeep ?? 0) > 0);
    expect(guard, '得有一件留蜷縮的秘寶才測得下去').toBeDefined();

    p1.relics = [guard!.id]; p2.relics = [];
    p1.block = 20; p2.block = 20;
    p1.drawPile = [inst('sanjo', 21)]; p2.drawPile = [inst('sanjo', 22)];

    finishEnemyTurn(cs);

    expect(p1.block, '帶守護符的留下一些').toBeGreaterThan(0);
    expect(p2.block, '沒帶的歸零').toBe(0);
  });

  it('開場秘寶只發動帶著它的那一位的', () => {
    const cs = startCombat({
      hp: 60, maxHp: 80, deck: [inst('tanding', 1)],
      relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('coop-relic2')),
    });
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    // 一號帶最後一口氣、二號沒帶：兩個人都被打到 0，只有一號被救起來
    const saver = relics.find((r) => r.hooks.preventLethal);
    expect(saver).toBeDefined();
    p1.relics = [saver!.id]; p2.relics = [];
    p1.hp = 5; p1.block = 0; p2.hp = 5; p2.block = 0;
    const foe = cs.enemies[0]!;

    damagePlayer(cs, foe, 99, { victim: p1 });
    damagePlayer(cs, foe, 99, { victim: p2 });

    expect(p1.hp, '一號被自己的秘寶救起來').toBe(1);
    expect(p1.down).toBeFalsy();
    expect(p2.down, '二號沒帶就是倒了').toBe(true);
    expect(cs.phase, '還有一位站著，戰鬥繼續').toBe('player');
  });
});

describe('回合結束：每個人各按各的，都按了才真的結束', () => {
  it('一個人按了不會把對方的回合切掉', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs, ['sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo']);
    p2.hand = [inst('sanjo', 51), inst('sanjo', 52)];

    expect(setReady(cs, 0), '只有一個人舉手，還不能收').toBe(false);
    expect(allReady(cs)).toBe(false);
    expect(waitingFor(cs), '還在等二號').toEqual([1]);
    expect(p2.hand.length, '二號的手牌動都沒動').toBe(2);
    expect(cs.turn, '回合也沒往前走').toBe(1);
    void p1;
  });

  it('兩個人都按了才收得了', () => {
    const cs = combat();
    addSecond(cs);
    expect(setReady(cs, 0)).toBe(false);
    expect(setReady(cs, 1), '最後一個人舉手，可以收了').toBe(true);
    expect(waitingFor(cs)).toEqual([]);
  });

  it('**舉手不等於結算**：對方還沒舉手之前可以再按一次收回，手牌原封不動', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    addSecond(cs);
    p1.hand = [inst('tanding', 61)];

    setReady(cs, 0);
    expect(canPlay(cs, 61, undefined, 0).ok, '舉手之後手牌鎖住').toBe(false);
    expect(p1.hand.length, '但牌還在手上，沒被丟掉').toBe(1);

    setReady(cs, 0, false);
    expect(canPlay(cs, 61, undefined, 0).ok, '收回手就能繼續打').toBe(true);
    expect(allReady(cs)).toBe(false);
  });

  it('倒下的人不算在裡面，不然一個人倒下就再也結不了回合', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 5; p1.block = 0; p2.hp = 50;
    damagePlayer(cs, cs.enemies[0]!, 99, { victim: p1 });
    expect(p1.down).toBe(true);

    expect(setReady(cs, 1), '剩下的那位一舉手就收得了').toBe(true);
    expect(waitingFor(cs), '倒下的人不在等待名單裡').toEqual([]);
  });

  it('收完回合手就放下了，下一回合重新算', () => {
    const cs = combat();
    addSecond(cs);
    setReady(cs, 0); setReady(cs, 1);
    beginEnemyTurn(cs);
    expect(allReady(cs), '手全放下').toBe(false);
    expect(cs.players.every((p) => !p.ready)).toBe(true);
  });

  it('撒手鐧那種「打完就結束回合」的牌，只替**打牌的人**舉手', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p2.hand = [inst('xianshuile', 71)]; p2.energy = 9; p2.hp = 50; p2.maxHp = 80;

    expect(playCard(cs, 71, undefined, 1)).toBe(true);
    expect(p2.ready, '二號自己舉手了').toBe(true);
    expect(p1.ready, '一號沒被連坐').toBeFalsy();
    expect(allReady(cs), '還在等一號').toBe(false);
  });

  it('單機一位玩家：按下去就是所有人都按了，跟以前一模一樣', () => {
    const cs = combat();
    expect(setReady(cs, 0)).toBe(true);
    expect(allReady(cs)).toBe(true);
  });
});

describe('強制收回合：對方走開了，另一人可以按（使用者 2026-09-11）', () => {
  it('替走開的那位收回合，兩邊就都好了', () => {
    const cs = combat();
    const p2 = addSecond(cs);
    setReady(cs, 0);
    expect(allReady(cs), '還在等二號').toBe(false);

    expect(forceReady(cs, 1), '替他收掉之後就可以收回合了').toBe(true);
    expect(p2.ready).toBe(true);
    expect(cs.log.some((l) => l.includes('等太久了')), '要留一行紀錄，他回來才看得懂').toBe(true);
  });

  it('對已經舉手的人按不會重複留紀錄', () => {
    const cs = combat();
    addSecond(cs);
    setReady(cs, 1);
    const before = cs.log.length;
    expect(forceReady(cs, 1), '他本來就好了').toBe(false);   // 一號還沒舉手
    expect(cs.log.length, '不該再印一次').toBe(before);
  });

  it('對倒下的人按沒有作用（他本來就不算在等待名單裡）', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 5; p1.block = 0; p2.hp = 50;
    damagePlayer(cs, cs.enemies[0]!, 99, { victim: p1 });

    const before = cs.log.length;
    expect(forceReady(cs, 0), '只剩二號，他還沒舉手').toBe(false);
    expect(cs.log.length).toBe(before);
  });

  it('**引擎不看時間**：閒置幾秒是畫面那一層的事，這裡只收一個明確的動作', () => {
    // 這條守的是設計本身。引擎裡只要出現「現在幾點」，鎖步連線兩邊的秒差
    // 就會讓結果分岔。時間到只是亮一顆按鈕，按下去才送動作過來。
    // （引擎裡沒有時間相依這件事由 tools/engine_pure.test.ts 掃原始碼守著）
    expect(IDLE_FORCE_MS, '畫面與連線層共用同一個門檻，不要各寫各的').toBe(60_000);
    const cs = combat();
    addSecond(cs);
    const a = forceReady(cs, 1);
    cs.players[1]!.ready = false;
    const b = forceReady(cs, 1);
    expect(b, '同樣的呼叫永遠得到同樣的結果，跟呼叫的時間點無關').toBe(a);
  });
});
