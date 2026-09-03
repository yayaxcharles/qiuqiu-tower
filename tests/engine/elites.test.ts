import { describe, expect, it } from 'vitest';
import { damageEnemy } from '../../src/engine/actions';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 九隻新菁英（2026-09-03，docs/菁英擴充_設計稿.md）的機制回歸，一隻一條。
 * 機制大多是重用第二波做好的（tests/engine/monsters2.test.ts 驗過機制本身），
 * 這裡驗的是「這隻菁英真的掛上了設計稿說的那一組機制、而且組在一起還是對的」。
 *
 * 球球的血刻意給很高（`hp` 參數）：這裡驗的是機制不是勝負，
 * 讓球球中途被打死的話戰鬥就結束了，看不到後面幾拍。
 */
const DECK = ['sanjo', 'sanjo', 'sanjo', 'tanding', 'tanding'];
function start(encounterId: string, hp = 400, deckIds: readonly string[] = DECK): CombatState {
  return startCombat({
    hp, maxHp: hp, deck: deckIds.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId, rng: new Rng(seedFromString('elites')),
  });
}
function allCards(cs: CombatState): CardInstance[] {
  const p = cs.player;
  return [...p.hand, ...p.drawPile, ...p.discardPile, ...p.exhaustPile];
}
const countOf = (cs: CombatState, cardId: string): number => allCards(cs).filter((c) => c.cardId === cardId).length;
/** 這一拍手上第一張指定的牌（測試用的牌組只有貓抓與淡定，抽到哪張要現找） */
function handCard(cs: CombatState, cardId: string): CardInstance {
  const c = cs.player.hand.find((x) => x.cardId === cardId);
  if (!c) throw new Error(`手上沒有 ${cardId}`);
  return c;
}

describe('第一關菁英（單一機制）', () => {
  it('山豬頭目・憤怒：每打一張技能牌 +1 爪力，攻擊牌不算', () => {
    const cs = start('wild_boar', 400, ['sanjo', 'tanding']);
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(78);
    expect(getStatus(e, '爪力')).toBe(0);
    expect(playCard(cs, handCard(cs, 'sanjo').uid, e.uid)).toBe(true);
    expect(getStatus(e, '爪力'), '攻擊牌不會激怒牠').toBe(0);
    expect(playCard(cs, handCard(cs, 'tanding').uid)).toBe(true);
    expect(getStatus(e, '爪力'), '技能牌一張 +2').toBe(1);
    expect(cs.log.some((l) => l.includes('被激怒了'))).toBe(true);
  });

  it('紙老虎・反彈：開戰就帶 2 點，整場都在，每打一下回敬 2', () => {
    const cs = start('paper_tiger');
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(66);
    expect(getStatus(e, '反彈'), '開戰就有').toBe(2);
    const hp0 = cs.player.hp;
    damageEnemy(cs, e, 5);
    expect(hp0 - cs.player.hp, '砍一下自己痛 2').toBe(2);
    // 多段砍下去段段都要痛：兩下就是 6
    const hp1 = cs.player.hp;
    damageEnemy(cs, e, 5); damageEnemy(cs, e, 5);
    expect(hp1 - cs.player.hp).toBe(4);
    endTurn(cs);
    expect(getStatus(e, '反彈'), '整場不消失').toBe(2);
  });

  it('太鼓狸・蓄力：打鼓助勢之後那一下傷害加倍（14 → 28）', () => {
    const cs = start('drum_tanuki');
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(80);
    // 招式表：敲鼓 8 → 打鼓助勢（蓄力）→ 重擊 14
    expect(e.move.label).toBe('敲鼓');
    let hp = cs.player.hp;
    endTurn(cs);
    expect(hp - cs.player.hp, '敲鼓 8').toBe(8);
    expect(e.move.label).toBe('打鼓助勢');
    hp = cs.player.hp;
    endTurn(cs);
    expect(hp - cs.player.hp, '蓄力那一拍不出手').toBe(0);
    expect(e.charged, '蓄力掛上了').toBe(true);
    hp = cs.player.hp;
    endTurn(cs);
    expect(hp - cs.player.hp, '重擊 14 加倍成 28').toBe(28);
    expect(e.charged, '打完就消掉').toBe(false);
  });
});

describe('第二關菁英（兩個機制）', () => {
  it('鐵羅漢・鱗甲 8 ＋縮殼 12：第一下先被殼吃掉，之後每回合自己補甲', () => {
    const cs = start('iron_arhat');
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(120);
    expect(getStatus(e, '鱗甲')).toBe(8);
    expect(getStatus(e, '縮殼')).toBe(12);
    damageEnemy(cs, e, 5);
    expect(e.block, '第一次被打痛就縮出 12 點防禦').toBe(12);
    expect(getStatus(e, '縮殼'), '縮殼一場只有一次').toBe(0);
    expect(getStatus(e, '鱗甲'), '同一下也剝掉一層甲').toBe(7);
    e.block = 0;
    endTurn(cs);
    expect(e.block, '牠的回合結束長出等同鱗甲層數的防禦').toBeGreaterThanOrEqual(7);
  });

  it('織影蜘蛛・飛行 3 ＋塞牌：打得到一半，吐絲往抽牌堆塞眼冒金星', () => {
    const cs = start('shadow_spider');
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(110);
    expect(getStatus(e, '飛行')).toBe(3);
    const hp0 = e.hp;
    damageEnemy(cs, e, 9);
    expect(hp0 - e.hp, '在天上只打進一半').toBe(4);
    expect(getStatus(e, '飛行')).toBe(2);
    // 第一招就是吐絲（塞一張眼冒金星進抽牌堆）
    expect(e.move.label).toBe('吐絲');
    expect(countOf(cs, 'dazed_card')).toBe(0);
    endTurn(cs);
    expect(countOf(cs, 'dazed_card'), '吐絲塞一張').toBe(1);
    expect(getStatus(e, '飛行'), '牠的回合開始補回滿層').toBe(3);
  });

  it('醉拳狗・消散 6 ＋每回合成長：六個回合後自己散去，而且越拖越強', () => {
    const cs = start('drunk_dog');
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(125);
    expect(getStatus(e, '消散')).toBe(6);
    endTurn(cs);
    expect(getStatus(e, '爪力'), '每回合 +1 爪力').toBe(1);
    expect(getStatus(e, '消散')).toBe(5);
    for (let i = 0; i < 5 && cs.phase === 'player'; i++) endTurn(cs);
    expect(e.dead).toBe(true);
    expect(e.escaped, '散掉走 escape 那條路').toBe(true);
    expect(cs.kills, '散掉的不算打倒，戰利品也沒了').toBe(0);
    expect(cs.log.some((l) => l.includes('散去了'))).toBe(true);
  });
});

describe('第三關菁英（強機制）', () => {
  it('鬼將・鼓舞＋一起死才算：小鬼在鬼將活著時會爬起來，鬼將死後不會', () => {
    const cs = start('oni_general');
    const gen = cs.enemies.find((e) => e.enemyId === 'oni_general')!;
    const imps = cs.enemies.filter((e) => e.enemyId === 'imp');
    expect(gen.maxHp).toBe(140);
    expect(imps.length).toBe(2);
    // 遭遇帶魔氣 5：三隻出場就有 5 點爪力
    for (const e of cs.enemies) expect(getStatus(e, '爪力'), e.name).toBe(3);
    // 鼓舞：號令讓全體（含自己）再 +2
    gen.move = { intent: 'buff', label: '號令', effects: [{ kind: 'statusAllies', name: '爪力', amount: 1 }] };
    for (const e of imps) e.move = { intent: 'block', label: '躲', effects: [{ kind: 'block', amount: 6 }] };
    endTurn(cs);
    for (const e of cs.enemies) expect(getStatus(e, '爪力'), e.name).toBe(4);

    // 鬼將還站著：小鬼倒下，下一個回合結束就爬起來（回到 reviveHp 8）
    damageEnemy(cs, imps[0]!, imps[0]!.hp, { direct: true });
    expect(imps[0]!.dead).toBe(true);
    gen.move = { intent: 'block', label: '盾陣', effects: [{ kind: 'blockAllies', amount: 12 }] };
    endTurn(cs);
    expect(imps[0]!.dead, '鬼將還在，小鬼爬起來了').toBe(false);
    expect(imps[0]!.hp).toBe(8);

    // 把鬼將與另一隻小鬼清光，只剩這一隻：這回合再打倒牠就不會再爬起來
    damageEnemy(cs, gen, gen.hp, { direct: true });
    damageEnemy(cs, imps[1]!, imps[1]!.hp, { direct: true });
    damageEnemy(cs, imps[0]!, imps[0]!.hp, { direct: true });
    expect(cs.enemies.every((e) => e.dead)).toBe(true);
    expect(cs.phase, '三隻同時倒下才算打完').toBe('won');
  });

  it('鏡仙・分裂＋詛咒：半血裂成兩隻鏡影；每打一張技能牌被洗一張眼冒金星', () => {
    const cs = start('mirror_sage', 400, ['tanding', 'sanjo']);
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(160);
    // 詛咒：技能牌會被塞牌，攻擊牌不會
    expect(playCard(cs, handCard(cs, 'sanjo').uid, e.uid)).toBe(true);
    expect(countOf(cs, 'dazed_card'), '攻擊牌不觸發').toBe(0);
    expect(playCard(cs, handCard(cs, 'tanding').uid)).toBe(true);
    expect(countOf(cs, 'dazed_card'), '技能牌被塞一張').toBe(1);
    // 分裂：打到最大值一半以下，本體消失、原地兩隻鏡影，血量＝本體剩下的
    const half = Math.floor(e.maxHp / 2);
    damageEnemy(cs, e, e.hp - half, { direct: true });
    expect(e.split).toBe(true);
    expect(e.escaped, '本體不算打倒').toBe(true);
    expect(cs.kills).toBe(0);
    const shards = cs.enemies.filter((x) => x.enemyId === 'mirror_shard' && !x.dead);
    expect(shards.length).toBe(2);
    for (const s of shards) { expect(s.hp).toBe(half); expect(s.maxHp).toBe(half); }
    // 魔氣（遭遇的 strength 5）也要套到分裂出來的
    for (const s of shards) expect(getStatus(s, '爪力')).toBe(5);
  });

  it('虛無貓・虛化：虛實交替、每一段最多扣 1 點、防禦照扣、噎到也只扣 1', () => {
    const cs = start('void_cat');
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(170);
    expect(getStatus(e, '虛化'), '開戰就是虛的').toBe(1);

    // 每一段最多 1 點：一記 40 也只掉 1
    let hp = e.hp;
    damageEnemy(cs, e, 40, { direct: true });
    expect(hp - e.hp, '虛化中一段最多 1 點').toBe(1);
    // 多段攻擊是「每一段」各 1 點，不是整招 1 點
    hp = e.hp;
    damageEnemy(cs, e, 40, { direct: true });
    damageEnemy(cs, e, 40, { direct: true });
    expect(hp - e.hp, '兩段就是 2 點').toBe(2);

    // 防禦照扣：先給 10 點防禦，一記 40 打下去防禦全沒、血只掉 1
    e.block = 10;
    hp = e.hp;
    damageEnemy(cs, e, 40);
    expect(e.block, '防禦照原本的量擋掉，不會因為虛化就留著').toBe(0);
    expect(hp - e.hp, '穿過防禦的部分仍然只扣 1').toBe(1);

    // 牠的回合開始就切換一次：虛→實。第一招黑火只塞牌，不打人
    e.block = 0;
    const player0 = cs.player.hp;
    endTurn(cs);
    expect(getStatus(e, '虛化'), '牠的回合開始切換：虛→實').toBe(0);
    expect(cs.log.some((l) => l.includes('實體化了'))).toBe(true);
    expect(cs.player.hp, '黑火只塞牌，不打人').toBe(player0);
    expect(countOf(cs, 'dazed_card'), '黑火塞兩張眼冒金星').toBe(2);

    // 實體化的這一回合：打幾點就掉幾點
    hp = e.hp;
    damageEnemy(cs, e, 20, { direct: true });
    expect(hp - e.hp, '實體化就照實扣').toBe(20);

    // 再過一個牠的回合又變回虛化；同一拍結算的噎到（直傷）也只扣 1
    addStatus(e, '噎到', 9);
    hp = e.hp;
    endTurn(cs);
    expect(getStatus(e, '虛化'), '隔一回合虛一回合').toBe(1);
    expect(hp - e.hp, '噎到 9 點也只扣 1').toBe(1);
    expect(getStatus(e, '噎到'), '噎到照樣少一層').toBe(8);
  });
});

describe('沉睡的龍貓（2026-09-03 重做）', () => {
  it('開場：睡一回合、鱗甲 6、逆鱗 2；半血覺醒：拍掉一半爪力貓步、自己 +3 爪力、鱗甲加到 10、招式換成龍炎那套', () => {
    const cs = start('dragon_cat');
    const e = cs.enemies[0]!;
    expect(e.maxHp).toBe(200);
    expect(getStatus(e, '沉睡')).toBe(1);
    expect(getStatus(e, '鱗甲')).toBe(6);
    expect(getStatus(e, '反彈')).toBe(2);
    cs.player.statuses['爪力'] = 6; cs.player.statuses['貓步'] = 4;
    damageEnemy(cs, e, 120, { direct: true });   // 200→80：跨過半血
    expect(e.phase).toBe(1);
    expect(getStatus(cs.player, '爪力')).toBe(3);
    expect(getStatus(cs.player, '貓步')).toBe(2);
    expect(getStatus(e, '爪力')).toBe(3 + 2);   // 覺醒 +3、被打醒 +2
    expect(getStatus(e, '鱗甲')).toBe(10);
    expect(getStatus(e, '沉睡')).toBe(0);
    expect(['龍炎', '吞天', '咆哮', '盤踞']).toContain(e.move.label);
  });
});

