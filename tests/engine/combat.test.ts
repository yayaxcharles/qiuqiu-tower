import { describe, expect, it } from 'vitest';
import { damageEnemy } from '../../src/engine/actions';
import { STARTER_DECK } from '../../src/content/cards';
import { canPlay, combatResult, endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function deck(ids: readonly string[]): CardInstance[] { return ids.map((id, i) => inst(id, i + 1)); }
function start(encounterId: string, ids: readonly string[] = STARTER_DECK, seed = 's', relics = ['blue_headband'], hp = 70): CombatState {
  return startCombat({ hp, maxHp: 70, deck: deck(ids), relics, potions: [], encounterId, rng: new Rng(seedFromString(seed)) });
}
/** 把指定牌放到手牌最前面（測試用） */
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) {
    const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1);
  }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('開戰與回合開始', () => {
  it('魔物生命在區間內、同種第 k 隻從第 k 個動作開始', () => {
    const cs = start('rats3');
    expect(cs.enemies.length).toBe(3);
    for (const e of cs.enemies) { expect(e.hp).toBeGreaterThanOrEqual(12); expect(e.hp).toBeLessThanOrEqual(15); }
    expect(cs.enemies.map((e) => e.move.label)).toEqual(['啃', '啃', '躲']);
  });
  it('第一回合：3 顆飯糰、抽 5＋藍頭巾 1', () => {
    const cs = start('cucumber');
    expect(cs.turn).toBe(1);
    expect(cs.player.energy).toBe(3);
    expect(cs.player.hand.length).toBe(6);
    expect(cs.player.drawPile.length).toBe(4);
  });
  it('同種子同結果', () => {
    const a = start('rats2', STARTER_DECK, 'same'); const b = start('rats2', STARTER_DECK, 'same');
    expect(a.player.hand.map((c) => c.uid)).toEqual(b.player.hand.map((c) => c.uid));
    expect(a.enemies.map((e) => e.hp)).toEqual(b.enemies.map((e) => e.hp));
  });
  it('紙袋加成算得到潛水轉隱身', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'qianshui'], 's', ['paper_bag']);
    playCard(cs, toHand(cs, 'qianshui'));   // 隱身 1＋紙袋 1 → 2，同時拿 1 層潛水
    expect(getStatus(cs.player, '隱身')).toBe(2);
    endTurn(cs);                            // 黃瓜怪第一手是嚇人，不會吃掉隱身
    // 新回合開始潛水轉隱身：1＋紙袋 1 → 再加 2，合計 4
    expect(getStatus(cs.player, '潛水')).toBe(0);
    expect(getStatus(cs.player, '隱身')).toBe(4);
  });
});

describe('出牌', () => {
  it('參上打 6、扣飯糰、牌進棄牌堆', () => {
    const cs = start('cucumber');
    const uid = toHand(cs, 'sanjo');
    const e = cs.enemies[0]!; const hp = e.hp;
    expect(playCard(cs, uid, e.uid)).toBe(true);
    expect(e.hp).toBe(hp - 6);
    expect(cs.player.energy).toBe(2);
    expect(cs.player.discardPile.some((c) => c.uid === uid)).toBe(true);
    expect(cs.player.cardsPlayedThisTurn).toBe(1);
  });
  it('飯糰不夠不能出；0 費可以出', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'taxue']);
    cs.player.energy = 0;
    const uid = toHand(cs, 'sanjo');
    expect(canPlay(cs, uid, cs.enemies[0]!.uid)).toEqual({ ok: false, reason: '餓扁了' });
    expect(playCard(cs, uid, cs.enemies[0]!.uid)).toBe(false);
    // 這裡要的是「0 費的牌在沒飯糰時照樣打得出來」。
    // 本來用替身術，牠 2026-08-31 漲到 2 飯糰了，改用同樣給隱身、還是 0 費的踏雪無痕。
    const k = toHand(cs, 'taxue');
    expect(playCard(cs, k)).toBe(true);
    expect(getStatus(cs.player, '隱身')).toBe(1);
  });
  it('淡定給蜷縮 5；蜷縮先扛魔物攻擊', () => {
    const cs = start('cucumber');
    playCard(cs, toHand(cs, 'tanding'));
    expect(cs.player.block).toBe(5);
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.player.hp).toBe(68);
  });
  it('能力牌與消耗牌進消耗堆', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'jiejie', 'youcike']);
    cs.player.energy = 3;
    const j = toHand(cs, 'jiejie'); playCard(cs, j);
    const y = toHand(cs, 'youcike'); playCard(cs, y);
    expect(cs.player.exhaustPile.map((c) => c.uid).sort()).toEqual([j, y].sort());
    expect(cs.player.powers.length).toBe(1);
  });
  it('攻擊牌被戰術撤退鎖住', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'zhanshu']);
    playCard(cs, toHand(cs, 'zhanshu'));
    expect(canPlay(cs, toHand(cs, 'sanjo'), cs.enemies[0]!.uid).ok).toBe(false);
  });
  it('分身術：3 點起、這場戰鬥同一張每打出一次就 +3；升級 5／+5 且 2 費；換一場歸零（2026-09-03 改效果）', () => {
    const cs = start('wood_dummy', [...STARTER_DECK, 'bunshin']);
    cs.player.energy = 9;
    const e = cs.enemies[0]!; e.block = 0;
    let hp = e.hp;
    playCard(cs, toHand(cs, 'bunshin'), e.uid); expect(hp - e.hp).toBe(3); hp = e.hp;      // 第一次 3
    e.block = 0; playCard(cs, toHand(cs, 'bunshin'), e.uid); expect(hp - e.hp).toBe(6); hp = e.hp;   // 第二次 6
    e.block = 0; playCard(cs, toHand(cs, 'bunshin'), e.uid); expect(hp - e.hp).toBe(9);              // 第三次 9
    // 升級版：2 費、5 點起、每次 +5（同一張牌，這場已打三次 → 5 + 5×3 = 20）
    const uid = toHand(cs, 'bunshin');
    const ci = cs.player.hand.find((c) => c.uid === uid)!; ci.upgraded = true;
    const energy = cs.player.energy; hp = e.hp; e.block = 0;
    expect(playCard(cs, uid, e.uid)).toBe(true);
    expect(energy - cs.player.energy).toBe(2);
    expect(hp - e.hp).toBe(20);
    // 換一場戰鬥從頭算
    const cs2 = start('wood_dummy', [...STARTER_DECK, 'bunshin']);
    const e2 = cs2.enemies[0]!; e2.block = 0; const hp2 = e2.hp;
    playCard(cs2, toHand(cs2, 'bunshin'), e2.uid); expect(hp2 - e2.hp).toBe(3);
  });
  it('擊倒最後一隻就勝利，飯糰怪回血', () => {
    const cs = start('onigiri_monster', STARTER_DECK, 's', [], 50);
    const e = cs.enemies[0]!; e.hp = 3;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(1);
    expect(cs.player.hp).toBe(53);
    expect(combatResult(cs).kills).toBe(1);
  });
  it('打倒最後一隻之後，同一張牌剩下的效果照樣結算', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'shunshou']);
    const e = cs.enemies[0]!; e.hp = 3;
    playCard(cs, toHand(cs, 'shunshou'), e.uid);   // 打 6 擊倒 → 再結算「擊倒就 +15 小魚乾」
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(1);
    expect(cs.fishDelta).toBe(15);
    expect(combatResult(cs).fishDelta).toBe(15);
  });
  it('判贏之後不會被自傷打死', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'tietou'], 's', [], 2);
    const e = cs.enemies[0]!; e.hp = 3;
    playCard(cs, toHand(cs, 'tietou'), e.uid);   // 打 16 擊倒 → 後面的自傷 2 不該把球球打死
    expect(cs.phase).toBe('won');
    expect(cs.player.hp).toBe(1);
    expect(cs.kills).toBe(1);
  });
});

describe('魔物回合', () => {
  it('意圖循環前進；隱身閃掉一段', () => {
    const cs = start('rats2');
    addStatus(cs.player, '隱身', 1);
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.turn).toBe(2);
    expect(cs.player.hp).toBe(hp - 4);                       // 第一隻被閃掉，第二隻打中 4
    expect(cs.enemies.map((e) => e.move.label)).toEqual(['啃', '躲']);
  });
  it('定身跳過攻擊並消耗', () => {
    const cs = start('cucumber');
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    addStatus(e, '定身', 1);
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hp).toBe(hp);
    expect(getStatus(e, '定身')).toBe(0);
  });
  it('塔主第三條血：不蓄力，起身就是亡命一擊 26×2 穿透', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    addStatus(cs.player, '爪力', 10);
    e.hp = 16; e.invulnIn = 0;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 第一條打完 → 蹲下，亮 240
    expect(e.phase).toBe(1);
    endTurn(cs);                                // 蹲下調息那回合
    e.hp = 10; e.block = 0;                     // 蹲下那回合已經被震散 1 點爪力，貓抓只剩 15
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 第二條打完 → 亮 300
    expect(e.phase).toBe(2);
    expect(e.hp).toBe(300);
    expect(e.move.label).toBe('蹲下調息');
    endTurn(cs);                                // 蹲下；起身後照表輪到亡命一擊
    expect(e.move.label).toBe('亡命一擊');
    cs.player.hp = 90; cs.player.block = 50;
    const hp = cs.player.hp;
    // 師父爪力累計：二階段蹲下那回合 +1、三階段進場 +2、蹲下那回合 +2、這回合 +2 ＝ 7（第三條血每回合 +2）
    endTurn(cs);                       // 亡命一擊 26×2，各加爪力 7 ＝ 33×2；穿透，50 點蜷縮擋不住
    expect(cs.player.hp).toBe(hp - 66);
    expect(e.charged).toBe(false);
  });
  it('塔主二、三階段每回合震散你的爪力與貓步（1／1、2／2），拍到 0 就停', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    addStatus(cs.player, '爪力', 10);
    e.hp = 16; e.invulnIn = 0;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 進二階段
    addStatus(cs.player, '貓步', 1);
    cs.player.block = 99;
    endTurn(cs);                                // 二階段第一回合：震散 1 爪力、1 貓步
    expect(getStatus(cs.player, '爪力')).toBe(9);
    expect(getStatus(cs.player, '貓步')).toBe(0);
    expect(cs.log.some((l) => l === `${e.name}震散了你 1 點爪力、1 點貓步`)).toBe(true);
    e.hp = 10; e.block = 0;                     // 爪力剩 9，貓抓 15
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 進三階段
    cs.player.block = 99; cs.player.hp = 90;
    endTurn(cs);                                // 三階段：震散 2 爪力（貓步已經 0，不寫進紀錄）
    expect(getStatus(cs.player, '爪力')).toBe(7);
    expect(cs.log.some((l) => l === `${e.name}震散了你 2 點爪力`)).toBe(true);
  });
  it('塔主第一條血打完：蹲下無敵一回合、亮出 240 的第二條', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    cs.player.energy = 3;
    addStatus(cs.player, '爪力', 10);
    e.hp = 10;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 16 傷把第一條打完
    expect(e.phase).toBe(1);
    expect(e.hp).toBe(240);
    expect(e.maxHp).toBe(240);
    expect(e.invulnIn).toBe(1);
    expect(e.move.label).toBe('蹲下調息');
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 無敵中：一滴血都打不掉
    expect(e.hp).toBe(240);
    endTurn(cs);                                // 蹲下那回合過完就站起來（也吃到每回合 +1 爪力）
    expect(e.invulnIn).toBe(0);
    expect(getStatus(e, '爪力')).toBe(1);
    cs.player.energy = 3;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 站起來就打得到了（蹲下那回合震散了你 1 點爪力，所以是 15）
    expect(e.hp).toBe(240 - 15);
  });
  it('召喚小黑貓；木樁人每 3 回合 +1 爪力', () => {
    const cs = start('ninja_boss');
    const e = cs.enemies[0]!;
    e.move = e.move.label === '分身' ? e.move : { intent: 'summon', label: '分身', effects: [{ kind: 'summon', enemyId: 'black_kitten', n: 2 }] };
    endTurn(cs);
    expect(cs.enemies.filter((x) => x.enemyId === 'black_kitten' && !x.dead).length).toBe(2);
    const d = start('wood_dummy');
    for (let i = 0; i < 3; i++) endTurn(d);
    expect(getStatus(d.enemies[0]!, '爪力')).toBe(1);
  });
  it('噎到在魔物回合開始扣血、能殺死魔物', () => {
    const cs = start('rats2');
    const e = cs.enemies[0]!; e.hp = 2; addStatus(e, '噎到', 3);
    endTurn(cs);
    expect(e.dead).toBe(true);
    expect(cs.kills).toBe(1);
  });
  it('山賊逃走：偷走的不退、不算擊倒、剩下沒魔物就結束', () => {
    const cs = start('orange_bandit');
    const e = cs.enemies[0]!;
    for (let i = 0; i < 5 && cs.phase === 'player'; i++) { cs.player.block = 99; endTurn(cs); }
    expect(e.escaped).toBe(true);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(0);
    expect(combatResult(cs).fishDelta).toBe(-20);
  });
  it('自己疊的翻肚當回合不衰減，撐得到魔物那一下', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'chudashi']);
    playCard(cs, toHand(cs, 'chudashi'));            // 抽 2、自己疊 1 層翻肚
    expect(getStatus(cs.player, '翻肚')).toBe(1);
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    const hp = cs.player.hp;
    endTurn(cs);
    expect(hp - cs.player.hp).toBe(10);               // 7 × 1.5 → 10，翻肚 這回合沒被吃掉
    expect(getStatus(cs.player, '翻肚')).toBe(1);
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    const hp2 = cs.player.hp;
    endTurn(cs);
    expect(hp2 - cs.player.hp).toBe(7);               // 下一回合結束才衰減，這一下回到 7
    expect(getStatus(cs.player, '翻肚')).toBe(0);
  });
  it('破功把爪力與貓步拍掉一半（向下取整保留）', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    addStatus(cs.player, '爪力', 7);
    addStatus(cs.player, '貓步', 4);
    e.move = { intent: 'debuff', label: '破功', effects: [{ kind: 'purgePlayer', names: ['爪力', '貓步'] }] };
    endTurn(cs);
    expect(getStatus(cs.player, '爪力')).toBe(3);
    expect(getStatus(cs.player, '貓步')).toBe(2);
  });
  it('噎到把塔主第一條血毒完，一樣蹲下換條不算死', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    e.hp = 3; addStatus(e, '噎到', 3);
    endTurn(cs);
    expect(e.dead).toBe(false);
    expect(e.phase).toBe(1);
    expect(e.hp).toBe(240);
  });
  it('魔物被反彈打死，剩下的段數不再打', () => {
    const cs = start('black_ninja');
    const e = cs.enemies[0]!; e.hp = 1;
    e.move = { intent: 'attack', label: '二連斬', effects: [{ kind: 'damage', amount: 6, times: 2 }] };
    addStatus(cs.player, '反彈', 2);
    const hp = cs.player.hp;
    endTurn(cs);
    expect(e.dead).toBe(true);
    expect(hp - cs.player.hp).toBe(6);       // 只吃到第一段，第二段沒打出來
    expect(cs.phase).toBe('won');
  });
  it('血量剛好等於階段門檻就切換（門檻式：橘皮大王 55）', () => {
    const cs = start('orange_king');
    const e = cs.enemies[0]!;
    e.hp = 56; e.block = 5;                  // 參上打 6：擋掉 5、只掉 1 → 剛好 55
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(e.hp).toBe(55);
    expect(e.phase).toBe(1);
  });
  it('定身擋的是整個動作：偷小魚乾、疊防禦也動不了（使用者 2026-09-02 實玩回報）', () => {
    const cs = start('orange_bandit');
    const e = cs.enemies[0]!;
    e.move = { intent: 'special', label: '搶劫', effects: [{ kind: 'stealFish', n: 20 }] };
    addStatus(e, '定身', 1);
    const fish = cs.fishDelta;
    endTurn(cs);
    expect(cs.fishDelta).toBe(fish);
    expect(cs.log.some((l) => l === `${e.name}被定住了，這回合動不了`)).toBe(true);
    expect(getStatus(e, '定身')).toBe(0);
  });
  it('定身跳掉的那一下，蓄力也一起作廢', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    e.move = { intent: 'special', label: '蓄力', effects: [{ kind: 'chargeNext' }] };
    endTurn(cs);                             // 蓄力
    expect(e.charged).toBe(true);
    e.move = { intent: 'attack', label: '鐵頭功', effects: [{ kind: 'damage', amount: 14 }] };
    addStatus(e, '定身', 1);
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hp).toBe(hp);
    expect(e.charged).toBe(false);
    expect(getStatus(e, '定身')).toBe(0);
  });
  it('貓又照表出招：1 召、4 準備、5 補召；尾巴打死不復活、上限四條、滿了就把血灌給現有的', () => {
    const cs = start('nekomata');
    const neko = cs.enemies[0]!;
    expect(neko.move.label).toBe('放尾巴');
    endTurn(cs);                                    // 第 1 回合：放兩條尾巴
    const tails = () => cs.enemies.filter((e) => e.enemyId === 'nekomata_tail' && !e.dead).length;
    expect(tails()).toBe(2);
    endTurn(cs);                                    // 第 2、3 回合打普通招
    endTurn(cs);
    expect(neko.move.label).toBe('準備放尾巴');
    const tail = cs.enemies.find((e) => e.enemyId === 'nekomata_tail')!;
    tail.hp = 1; cs.player.energy = 3;
    playCard(cs, toHand(cs, 'sanjo'), tail.uid);
    expect(tail.dead).toBe(true);
    endTurn(cs);                                    // 第 4 回合：準備（尾巴不會爬回來）
    expect(tail.dead).toBe(true);
    expect(tails()).toBe(1);
    expect(neko.move.label).toBe('放尾巴');
    endTurn(cs);                                    // 第 5 回合：補召兩條 → 三條（上限 4）
    expect(tails()).toBe(3);
    // 敵方回合召出來的尾巴這回合本來就不動（快照），意圖照表先亮出來，不再掛「剛冒出來」（2026-09-02 稽核 M-2）
    const fresh = cs.enemies.filter((e) => e.enemyId === 'nekomata_tail' && !e.dead && e.turnCount === 0);
    expect(fresh.length).toBe(2);
    expect(fresh.every((e) => e.move.label !== '剛冒出來')).toBe(true);
    // 滿四條之後再放＝把血灌給最弱的那條，不會出現第五條
    neko.move = { intent: 'summon', label: '放尾巴', effects: [{ kind: 'summon', enemyId: 'nekomata_tail', n: 2, max: 4 }] };
    cs.player.block = 99; endTurn(cs);
    expect(tails()).toBe(4);
    neko.move = { intent: 'summon', label: '放尾巴', effects: [{ kind: 'summon', enemyId: 'nekomata_tail', n: 1, max: 4 }] };
    const hpSum = cs.enemies.filter((e) => e.enemyId === 'nekomata_tail' && !e.dead).reduce((a, e) => a + e.maxHp, 0);
    cs.player.block = 99; endTurn(cs);
    expect(tails()).toBe(4);
    expect(cs.enemies.filter((e) => e.enemyId === 'nekomata_tail' && !e.dead).reduce((a, e) => a + e.maxHp, 0)).toBe(hpSum + 8);
  });
  it('貓又換階段不會憑空冒尾巴：先只回血加爪力、頭上亮「放尾巴」，牠的回合才放兩條（使用者 2026-09-03）', () => {
    const cs = start('nekomata');
    const neko = cs.enemies[0]!;
    endTurn(cs);                                    // 第 1 回合放兩條
    const tails = () => cs.enemies.filter((e) => e.enemyId === 'nekomata_tail' && !e.dead).length;
    expect(tails()).toBe(2);
    // 玩家回合中途把牠打到門檻以下：當下尾巴數不變，意圖換成「放尾巴」
    neko.block = 0; neko.hp = 56;
    damageEnemy(cs, neko, 5, { direct: true });
    expect(neko.phase).toBe(1);
    expect(tails(), '換階段當下不該冒尾巴').toBe(2);
    expect(neko.move.label).toBe('放尾巴');
    cs.player.block = 99; endTurn(cs);              // 牠的回合才放：2 → 4（上限四條）
    expect(tails()).toBe(4);
  });
  it('僕從護體：僕從還站著打不動本體，也不消耗她的隱身；清光僕從才打得到', () => {
    const cs = start('persian_lady');
    const lady = cs.enemies.find((e) => e.enemyId === 'persian_lady')!;
    addStatus(cs.player, '爪力', 20);
    playCard(cs, toHand(cs, 'sanjo'), lady.uid);          // 26 傷 → 被護著，一滴血都不掉
    expect(lady.hp).toBe(lady.maxHp);
    for (const e of cs.enemies) if (e.enemyId !== 'persian_lady') { e.hp = 1; playCard(cs, toHand(cs, 'sanjo'), e.uid); }
    expect(cs.enemies.filter((e) => !e.dead)).toHaveLength(1);
    cs.player.energy = 3;
    playCard(cs, toHand(cs, 'sanjo'), lady.uid);          // 僕從清光，這下就痛了
    expect(lady.hp).toBe(lady.maxHp - 26);
  });
  it('多段攻擊：隱身只擋掉第一段，第二段照樣挨', () => {
    const cs = start('cucumber');
    addStatus(cs.player, '隱身', 1);
    cs.enemies[0]!.move = { intent: 'attack', label: '二連踢', effects: [{ kind: 'damage', amount: 6, times: 2 }] };
    const hp = cs.player.hp;
    endTurn(cs);
    expect(hp - cs.player.hp).toBe(6);                 // 第一下閃掉、第二下打中 6
    expect(getStatus(cs.player, '隱身')).toBe(0);
  });
});

describe('壞毛病與能力牌', () => {
  it('失手了：回合結束還在手上就扣 1 血', () => {
    const cs = start('wood_dummy', [...STARTER_DECK, 'shishou']);
    toHand(cs, 'shishou');
    const hp = cs.player.hp;
    endTurn(cs);                                       // 木樁人第一動是硬撐，不會打人
    expect(hp - cs.player.hp).toBe(1);
  });
  it('走火入魔：回合開始抽到就扣 2 血', () => {
    const cs = start('wood_dummy', [...STARTER_DECK, 'zouhuo']);
    const uid = toHand(cs, 'zouhuo');
    const i = cs.player.hand.findIndex((c) => c.uid === uid);
    cs.player.drawPile.unshift(cs.player.hand.splice(i, 1)[0]!);   // 擺到抽牌堆最上面，下回合一定抽到
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hand.some((c) => c.uid === uid)).toBe(true);
    expect(hp - cs.player.hp).toBe(2);
  });
  it('結界：下一回合一開始就有 3 蜷縮', () => {
    const cs = start('wood_dummy', [...STARTER_DECK, 'jiejie']);
    cs.player.energy = 3;
    playCard(cs, toHand(cs, 'jiejie'));
    expect(cs.player.block).toBe(0);                   // 當回合不給，是下回合開始才給
    endTurn(cs);
    expect(cs.turn).toBe(2);
    expect(cs.player.block).toBe(3);
  });
  it('吸貓大法：本回合擊倒魔物回 4 血', () => {
    const cs = start('rats2', [...STARTER_DECK, 'renwuwancheng'], 's', ['blue_headband'], 50);
    cs.player.energy = 9;
    playCard(cs, toHand(cs, 'renwuwancheng'));
    const e = cs.enemies[0]!; e.hp = 3;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(e.dead).toBe(true);
    expect(cs.player.hp).toBe(54);
  });
});

describe('魔物回合（續）', () => {
  it('生命歸零就輸；最後一口氣擋一次致命傷（木樁 2026-09-02 改成給翻肚）', () => {
    const cs = start('cucumber', STARTER_DECK, 's', ['last_breath'], 5);
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.player.hp).toBe(1); expect(cs.phase).toBe('player');
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.phase).toBe('lost');
  });
});
