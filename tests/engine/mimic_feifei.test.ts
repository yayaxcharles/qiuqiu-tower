import { describe, expect, it } from 'vitest';
import { FEIFEI_STARTER_DECK, cardById, cardNameFor, cards } from '../../src/content/cards';
import { enemyNameFor } from '../../src/content/enemies';
import { runEnemyEffects } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { learnCard, learnPool, learnedMove } from '../../src/engine/mimic';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CombatState, EnemyEffect, PlayerCombat } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/*
 * 鏡中球球照著學**菲菲的牌**（2026-09-15）。
 *
 * 在這批之前，她 29 張裡有 14 張整張學不會——招牌的那幾張（手滑、淬毒·改、毒霧、見血封喉、
 * 一針斃命、不要過來！）全在裡面，所以玩她的時候鏡子常常沒東西可學、退回招式表的「照著學」只會普攻。
 * 這一支把**每一張的翻譯結果釘死**：學得會的要翻成什麼、學不會的為什麼學不會，
 * 之後有人動 `mimic.ts` 的略過清單就會在這裡看到差別，而不是等玩家回報「鏡子又不會打了」。
 */

const fight = (enc: string, seed = 'mimic-feifei', deck: readonly string[] = FEIFEI_STARTER_DECK): CombatState =>
  startCombat({
    hp: 80, maxHp: 80, deck: deck.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: enc, rng: new Rng(seedFromString(seed)), hero: 'feifei',
  });

/** 她的全部 29 張（含兩張連線專用）；少一張就表示牌表動過了，這支要跟著更新 */
const HERS = cards.filter((c) => c.hero === 'feifei').map((c) => c.id);

/**
 * 每一張翻出來該長什麼樣。`null`＝整張學不會、不進池子。
 * 數字是**未升級**那一版；升級版另外驗幾張代表。
 */
const EXPECT: Record<string, EnemyEffect[] | null> = {
  // ---- 學不會的八張：純能力（長效旗標）與連線專用 ----
  biepengzhenjian: null,   // 別碰針尖喔：幫隊友擋＋幫隊友的下一擊附毒，鏡子只有一隻，沒有隊友
  woyouxianbeihao: null,   // 一起準備好：看隊友有沒有打中
  feifei_yingzi: null,     // 影子分身：長效旗標（每回合第一張再打一次），魔物沒有出牌這回事
  feifei_qianzhen: null,   // 千針萬毒：長效旗標
  feifei_juma: null,       // 拒馬：長效旗標
  feifei_yudu: null,       // 餘毒：長效旗標（屍爆）
  feifei_sandu: null,      // 散毒：把毒分給「其他魔物」，鏡子那邊沒有其他魔物
  feifei_fenshen: null,    // 分身術：成長牌（打一次多兩層），魔物沒有「這張打過幾次」可以記

  // ---- 這批新學會的六張（她的招牌全在這裡）----
  feifei_shouhua: [{ kind: 'damage', amount: 9 }, { kind: 'block', amount: 2 }],            // 手滑：自傷那段略過
  feifei_buyaoguolai: [{ kind: 'damage', amount: 25 }, { kind: 'block', amount: 12 }],      // 不要過來！：同上
  feifei_cuidugai: [{ kind: 'statusPlayer', name: '中毒', amount: 7 }],                      // 淬毒·改：自傷那段略過
  feifei_duwu: [{ kind: 'statusPlayer', name: '中毒', amount: 1 }],                          // 毒霧：能力段裡掛在你身上的那層毒
  feifei_jianxue: [{ kind: 'damageByPlayerStatus', name: '中毒' }, { kind: 'block', amount: 3 }],   // 見血封喉
  feifei_yizhen: [{ kind: 'damageByPlayerStatus', name: '中毒' }],                            // 一針斃命：不秒殺，照層數打

  // ---- 本來就學得會的，這批不准變 ----
  feifei_feizhen: [{ kind: 'damage', amount: 3 }, { kind: 'statusPlayer', name: '中毒', amount: 1 }, { kind: 'block', amount: 2 }],
  feifei_tuikai: [{ kind: 'block', amount: 5 }],
  feifei_cuidu: [{ kind: 'statusPlayer', name: '中毒', amount: 4 }],
  feifei_lianzhen: [{ kind: 'damage', amount: 2, times: 2 }, { kind: 'statusPlayer', name: '中毒', amount: 2 }, { kind: 'block', amount: 2 }],
  feifei_sazhen: [{ kind: 'damage', amount: 2 }, { kind: 'statusPlayer', name: '中毒', amount: 1 }, { kind: 'block', amount: 3 }],
  feifei_lakai: [{ kind: 'statusSelf', name: '隱身', amount: 1 }],
  feifei_tieqiang: [{ kind: 'block', amount: 9 }],
  feifei_moyao: [{ kind: 'statusPlayer', name: '中毒', amount: 5 }],
  feifei_tanlu: [{ kind: 'block', amount: 2 }],                       // 抽牌那段略過
  feifei_suoshou: [{ kind: 'block', amount: 5 }],                     // 下回合多抽那段略過
  feifei_zhenyu: [{ kind: 'damage', amount: 3 }, { kind: 'statusPlayer', name: '中毒', amount: 3 }, { kind: 'block', amount: 5 }],
  feifei_taoshengsuo: [{ kind: 'block', amount: 12 }],
  feifei_banxian: [{ kind: 'statusPlayer', name: '定身', amount: 1 }, { kind: 'block', amount: 4 }],
  feifei_tianzhen: [{ kind: 'statusPlayer', name: '中毒', amount: 10 }],   // 給自己的那 3 層毒不學（鏡貓不自傷）
  feifei_quansale: [{ kind: 'damage', amount: 12 }, { kind: 'statusPlayer', name: '中毒', amount: 2 }],
};

describe('鏡中球球學菲菲的牌', () => {
  it('她的 29 張逐張翻，一張都不漏', () => {
    expect(HERS.length, '她的牌變多或變少了，EXPECT 要跟著更新').toBe(29);
    for (const id of HERS) {
      expect(Object.hasOwn(EXPECT, id), `${id} 沒寫在 EXPECT 裡`).toBe(true);
      expect(learnCard(inst(id, 1)), `${cardById[id]?.name ?? id}（${id}）`).toEqual(EXPECT[id]);
    }
  });

  it('學得會的從 15 張變成 21 張，學不會的只剩純能力與連線牌', () => {
    const ok = HERS.filter((id) => learnCard(inst(id, 1)) !== null);
    expect(ok.length).toBe(21);
    const no = HERS.filter((id) => learnCard(inst(id, 1)) === null);
    expect(no.sort()).toEqual(['biepengzhenjian', 'feifei_fenshen', 'feifei_juma', 'feifei_qianzhen',
      'feifei_sandu', 'feifei_yingzi', 'feifei_yudu', 'woyouxianbeihao'].sort());
    // 招牌的六張一張都不能少（這批要修的就是它們）
    for (const id of ['feifei_shouhua', 'feifei_buyaoguolai', 'feifei_cuidugai', 'feifei_duwu', 'feifei_jianxue', 'feifei_yizhen']) {
      expect(learnCard(inst(id, 1)), id).not.toBeNull();
    }
  });

  it('升級版照升級後的數字；見血封喉的兩倍要帶過去', () => {
    expect(learnCard(inst('feifei_shouhua', 1, true))).toEqual([{ kind: 'damage', amount: 13 }, { kind: 'block', amount: 3 }]);
    expect(learnCard(inst('feifei_cuidugai', 1, true))).toEqual([{ kind: 'statusPlayer', name: '中毒', amount: 9 }]);
    expect(learnCard(inst('feifei_duwu', 1, true))).toEqual([{ kind: 'statusPlayer', name: '中毒', amount: 2 }]);
    expect(learnCard(inst('feifei_jianxue', 1, true)))
      .toEqual([{ kind: 'damageByPlayerStatus', name: '中毒', mul: 2 }, { kind: 'block', amount: 3 }]);
    // 一針斃命升級只是拿掉消耗，效果一樣——翻出來也要一樣（1 倍、不清毒）
    expect(learnCard(inst('feifei_yizhen', 1, true))).toEqual([{ kind: 'damageByPlayerStatus', name: '中毒' }]);
  });

  it('一針斃命不會翻成秒殺：鏡子只能照層數打', () => {
    const fx = learnCard(inst('feifei_yizhen', 1))!;
    expect(fx.some((f) => f.kind === 'execByStatus' as string)).toBe(false);
    expect(fx).toEqual([{ kind: 'damageByPlayerStatus', name: '中毒' }]);
  });

  it('毒霧學的是「給你一層毒」，結界那種給自己的能力段照舊不學', () => {
    expect(learnCard(inst('feifei_duwu', 1))).toEqual([{ kind: 'statusPlayer', name: '中毒', amount: 1 }]);
    expect(learnCard(inst('jiejie', 1)), '結界：每回合給自己 3 點蜷縮，魔物沒有這種引擎').toBeNull();
    expect(learnCard(inst('huxin', 1)), '護心：同上').toBeNull();
    expect(learnCard(inst('wanhua', 1)), '萬花筒：每回合抽一張').toBeNull();
  });
});

describe('照你身上的毒打（damageByPlayerStatus）', () => {
  const JIANXUE = (): EnemyEffect[] => learnCard(inst('feifei_jianxue', 1))!;

  it('層數就是傷害，而且蜷縮擋得住', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    const p = cs.player;
    p.hp = 80; p.block = 0; p.statuses = {};
    addStatus(p, '中毒', 6);
    runEnemyEffects(cs, e, JIANXUE(), false);
    expect(p.hp, '6 層毒＝打 6 點').toBe(74);
    expect(e.block, '同一招的 3 點蜷縮照學').toBe(3);

    // 蜷縮擋得住（跟一般攻擊同一條路，刻意不給穿透）
    p.block = 4; p.hp = 80;
    runEnemyEffects(cs, e, JIANXUE(), false);
    expect(p.hp, '6 點打在 4 點蜷縮上，只掉 2').toBe(78);
    expect(p.block).toBe(0);
  });

  it('身上沒有毒就打不痛人；層數不會因此被清掉', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    const p = cs.player;
    p.hp = 80; p.block = 0; p.statuses = {};
    runEnemyEffects(cs, e, JIANXUE(), false);
    expect(p.hp, '沒毒＝一點都不痛').toBe(80);
    expect(cs.log.some((l) => l.includes('撲了個空'))).toBe(true);
  });

  it('升級版的兩倍、蓄力的兩倍會疊起來；蓄力只用掉一次', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    const p = cs.player;
    p.hp = 80; p.block = 0; p.statuses = {};
    addStatus(p, '中毒', 5);
    e.charged = true;
    runEnemyEffects(cs, e, learnCard(inst('feifei_jianxue', 1, true))!, true);
    expect(p.hp, '5 層 × 2 倍 × 蓄力 2 ＝ 20').toBe(60);
    expect(e.charged).toBe(false);
  });

  it('隱身閃得掉、反彈照回（跟一般攻擊同一條結算路）', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    const p = cs.player;
    p.hp = 80; p.block = 0; p.statuses = {};
    addStatus(p, '中毒', 6); addStatus(p, '隱身', 1);
    runEnemyEffects(cs, e, [{ kind: 'damageByPlayerStatus', name: '中毒' }], false);
    expect(p.hp, '隱身閃掉了').toBe(80);
    expect(getStatus(p, '隱身'), '閃掉一層').toBe(0);

    const before = e.hp;
    addStatus(p, '反彈', 3);
    runEnemyEffects(cs, e, [{ kind: 'damageByPlayerStatus', name: '中毒' }], false);
    expect(p.hp, '6 層毒照打').toBe(74);
    expect(e.hp, '反彈 3 點回敬').toBe(before - 3);
  });

  it('一招打兩個人時各算各的層數（不是誰的毒多就照誰算）', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    const p1 = cs.player;
    const p2 = blankPlayer([], 1) as PlayerCombat;
    cs.players.push(p2);
    p1.hp = 80; p1.block = 0; p1.statuses = {};
    p2.hp = 70; p2.block = 0; p2.statuses = {};
    addStatus(p1, '中毒', 7); addStatus(p2, '中毒', 2);
    runEnemyEffects(cs, e, [{ kind: 'damageByPlayerStatus', name: '中毒' }], false);
    expect(p1.hp).toBe(73);
    expect(p2.hp).toBe(68);
  });

  it('consume 為真時打完把層數清掉', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    const p = cs.player;
    p.hp = 80; p.block = 0; p.statuses = {};
    addStatus(p, '中毒', 5);
    runEnemyEffects(cs, e, [{ kind: 'damageByPlayerStatus', name: '中毒', consume: true }], false);
    expect(p.hp).toBe(75);
    expect(getStatus(p, '中毒')).toBe(0);
  });
});

describe('玩菲菲時鏡子照的是她', () => {
  it('開戰第一動就從她的牌組學，牌名印她那版', () => {
    // 牌組刻意塞她的針類牌：起手十張學得會的只有飛針與退開，看不出這批修好的東西
    const deck = ['feifei_jianxue', 'feifei_cuidugai', 'feifei_shouhua', 'feifei_moyao'];
    const cs = fight('mirror_duel_a2', 'needles', deck);
    const e = cs.enemies[0]!;
    expect(e.move.learned, '有得學就不該退回招式表的「照著學」').toBeTruthy();
    for (const l of e.move.learned!) {
      expect(deck, `學到了不在她牌組裡的 ${l.cardId}`).toContain(l.cardId);
      expect(e.move.label).toContain(cardNameFor(cardById[l.cardId]!, 'feifei'));
    }
    expect(cs.player.drawPile.length + cs.player.hand.length, '她的牌一張都沒被拿走').toBe(deck.length);
  });

  it('整副招牌牌組全部進得了池子（改之前這四張一張都進不去）', () => {
    const deck = ['feifei_jianxue', 'feifei_yizhen', 'feifei_duwu', 'feifei_buyaoguolai'];
    const cs = fight('mirror_duel', 'pool', deck);
    expect(learnPool(cs).map((c) => c.cardId).sort()).toEqual([...deck].sort());
  });

  it('真的打一回合：鏡子打出學來的針，照她身上的毒扣血', () => {
    const cs = fight('mirror_duel', 'real', ['feifei_jianxue']);
    const e = cs.enemies[0]!;
    const p = cs.player;
    // 開戰第一動就是學來的見血封喉（池子裡只有這一張）
    expect(e.move.learned?.[0]?.cardId).toBe('feifei_jianxue');
    expect(e.move.intent, '照層數打算攻擊意圖，牌子才會是紅的').toBe('attack');
    p.hp = 80; p.block = 0; p.statuses = {};
    addStatus(p, '中毒', 4);
    const hpBefore = p.hp;
    endTurn(cs);
    /*
     * 走完一整拍：魔物打 4 點（毒 4 層），接著換她的回合、毒自己發作一次。
     * 毒的結算不是這一支要守的東西，所以只驗**至少**被魔物打掉那 4 點，
     * 外加紀錄裡有她那張牌的名字（玩家看得到鏡子打了什麼）。
     */
    expect(hpBefore - p.hp).toBeGreaterThanOrEqual(4);
    expect(cs.log.some((l) => l.includes(cardNameFor(cardById['feifei_jianxue']!, 'feifei')))).toBe(true);
  });

  it('牠在她面前叫「鏡中菲菲」，球球那邊還是「鏡中球球」', () => {
    expect(fight('mirror_duel').enemies[0]!.name).toBe('鏡中菲菲');
    expect(enemyNameFor('mirror_qiuqiu', 'feifei')).toBe('鏡中菲菲');
    expect(enemyNameFor('mirror_qiuqiu', 'ninja')).toBe('鏡中球球');
    expect(enemyNameFor('mirror_qiuqiu', undefined)).toBe('鏡中球球');
    // 變裝不換 id：鎖步指紋收的是 id，換了兩台就得各自算對，是一條多餘的規矩
    expect(fight('mirror_duel').enemies[0]!.enemyId).toBe('mirror_qiuqiu');
  });

  it('她那場的開場白是她的版本，不是「那是我的影子」', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    expect(e.line, '開場白要從變裝那份挑').toBeTruthy();
    expect(e.line).not.toContain('影子怎麼會自己動');
    expect(cs.log.some((l) => l.startsWith('鏡中菲菲：'))).toBe(true);
  });

  /*
   * 這批在球球那邊的**副作用**，全部釘死。
   *
   * 「自傷略過」與「能力段略過」是使用者指定的規則，套下去球球的自傷牌與升級版能力牌
   * 就跟著變得學得會——那不是漏改，是同一條規則的結果。釘在這裡是為了讓下一個人一眼看到
   * 有哪幾張跟著變了，而不是靠讀 `mimic.ts` 的略過清單自己推。
   * （固定戰鬥與整局的錨值測試都沒有位移，見 `tests/smart.report.test.ts`）
   */
  it('副作用：球球的自傷牌、雙人支援牌、升級版能力牌現在學得會（刻意的）', () => {
    expect(learnCard(inst('tietou', 1)), '鐵頭功：只學傷害那 16 點').toEqual([{ kind: 'damage', amount: 16 }]);
    expect(learnCard(inst('wangming', 1)), '亡命：同上').toEqual([{ kind: 'damage', amount: 20 }]);
    expect(learnCard(inst('boming', 1)), '拼命只有自傷＋飯糰，兩段都略過＝整張還是學不會').toBeNull();
    expect(learnCard(inst('bangnidianyixia', 1)), '幫你墊一下：幫隊友擋那段略過，傷害照學')
      .toEqual([{ kind: 'damage', amount: 6 }]);
    expect(learnCard(inst('tiexin', 1)), '鐵心未升級只有能力段（給自己的爪力）＝學不會').toBeNull();
    expect(learnCard(inst('tiexin', 1, true)), '升級版打出時先給自己 2 點爪力，那一段學得會')
      .toEqual([{ kind: 'statusSelf', name: '爪力', amount: 2 }]);
    expect(learnCard(inst('fengyin', 1)), '封印解除未升級只有能力段').toBeNull();
    expect(learnCard(inst('fengyin', 1, true)))
      .toEqual([{ kind: 'statusSelf', name: '爪力', amount: 2 }, { kind: 'statusSelf', name: '貓步', amount: 2 }]);
  });

  it('球球那邊的翻譯沒被動到（原本學得會的照舊）', () => {
    expect(learnCard(inst('sanjo', 1))).toEqual([{ kind: 'damage', amount: 6 }]);
    expect(learnCard(inst('tanding', 1))).toEqual([{ kind: 'block', amount: 5 }]);
    expect(learnCard(inst('tieshazhang', 1))).toEqual([{ kind: 'damage', amount: 7 }, { kind: 'statusPlayer', name: '中毒', amount: 3 }]);
    expect(learnCard(inst('beici', 1)), '背刺只學無條件那段').toEqual([{ kind: 'damage', amount: 6 }]);
    expect(learnCard(inst('qianliyan', 1))).toBeNull();
    expect(learnCard(inst('sashoujian', 1))).toBeNull();
    const cs = fight('mirror_duel', 'ninja-side', ['sanjo', 'tanding']);
    expect(learnedMove(cs)).toBeTruthy();
  });
});
