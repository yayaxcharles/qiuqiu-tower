// 2026-09-11 第二批忍具（五支對敵）的引擎行為。
// 五支用的都是引擎既有的效果，但**那些效果以前從來沒有忍具走過**——
// 忍具這條路跟牌不一樣（`source: 'potion'` 會關掉爪力加成、目標要另外傳），所以要各驗一次。
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { potionById } from '../../src/content/potions';
import { endTurn, startCombat, usePotion } from '../../src/engine/combat';
import { encounterById, enemyById } from '../../src/content/enemies';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { DEBUFFS } from '../../src/engine/types';
import { inst } from '../helpers';

function fight(encounterId: string, potions: string[], hp = 999, maxHp = 999) {
  return startCombat({
    hp, maxHp, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions,
    encounterId, rng: new Rng(seedFromString('p0911b')),
  });
}

describe('順手牽羊爪（stealBlock）', () => {
  it('目標的防禦整個搬到自己身上，不是清掉', () => {
    const cs = fight('kappa', ['steal_claw']);
    const e = cs.enemies[0]!;
    e.block = 23;
    cs.player.block = 4;
    expect(usePotion(cs, 'steal_claw', e.uid)).toBe(true);
    expect(e.block, '目標的防禦要歸零').toBe(0);
    expect(cs.player.block, '原本的 4 點要留著，再加 23').toBe(27);
  });
  it('目標沒有防禦時不會爆，也不會憑空生出蜷縮', () => {
    const cs = fight('kappa', ['steal_claw']);
    const e = cs.enemies[0]!;
    e.block = 0;
    cs.player.block = 5;
    expect(usePotion(cs, 'steal_claw', e.uid)).toBe(true);
    expect(cs.player.block).toBe(5);
  });
  it('**沒指目標就用不出來**：`usePotion` 會擋下，不會靜靜浪費掉一支', () => {
    // 資料寫成 target: 'self' 的話 `usePotion` 不會要 targetUid，效果就會拿到空陣列、
    // 什麼都沒發生卻把忍具吃掉。這裡驗的是「引擎真的擋得住」，不只是資料長得對
    const cs = fight('kappa', ['steal_claw']);
    cs.enemies[0]!.block = 10;
    expect(usePotion(cs, 'steal_claw'), '沒傳目標就不該成功').toBe(false);
    expect(cs.potions, '擋下來的話忍具要留著').toContain('steal_claw');
    expect(cs.player.block, '也不該憑空拿到蜷縮').toBe(0);
    expect(potionById['steal_claw']!.target).toBe('enemy');
  });
});

describe('破功散（removeStatuses）', () => {
  it('爪力、貓步、鱗甲、不壞身一起拔光', () => {
    const cs = fight('kappa', ['break_art']);
    const e = cs.enemies[0]!;
    addStatus(e, '爪力', 6); addStatus(e, '貓步', 4); addStatus(e, '鱗甲', 3); addStatus(e, '不壞身', 2);
    expect(usePotion(cs, 'break_art', e.uid)).toBe(true);
    expect(getStatus(e, '爪力')).toBe(0);
    expect(getStatus(e, '貓步')).toBe(0);
    expect(getStatus(e, '鱗甲')).toBe(0);
    expect(getStatus(e, '不壞身')).toBe(0);
  });
  it('只拔這三個，不誤傷別的狀態（減益要留著）', () => {
    const cs = fight('kappa', ['break_art']);
    const e = cs.enemies[0]!;
    addStatus(e, '爪力', 4); addStatus(e, '中毒', 5); addStatus(e, '翻肚', 2); addStatus(e, '隱身', 1);
    usePotion(cs, 'break_art', e.uid);
    expect(getStatus(e, '爪力')).toBe(0);
    expect(getStatus(e, '中毒'), '減益是好事，不該被拔').toBe(5);
    expect(getStatus(e, '翻肚')).toBe(2);
    expect(getStatus(e, '隱身'), '隱身不在名單上').toBe(1);
  });
  it('**每種最多拔 10 層**（使用者 2026-09-11 拍板的平衡上限）', () => {
    // 現有那幾條測試用的層數是 6/4/3/2，全在 10 以下，加不加 `max` 結果一模一樣——
    // 誰把上限刪掉或改成 5，整套測試照樣綠（稽核 2026-09-11 中-3）。這條專門釘它
    const cs = fight('kappa', ['break_art']);
    const e = cs.enemies[0]!;
    addStatus(e, '爪力', 25); addStatus(e, '鱗甲', 14); addStatus(e, '不壞身', 10);
    expect(usePotion(cs, 'break_art', e.uid)).toBe(true);
    expect(getStatus(e, '爪力'), '25 − 10 = 15').toBe(15);
    expect(getStatus(e, '鱗甲'), '14 − 10 = 4').toBe(4);
    expect(getStatus(e, '不壞身'), '剛好 10 層＝拔光').toBe(0);
  });
  it('目標身上乾乾淨淨時也不會爆，而且**確實用得出去**', () => {
    // 只寫 not.toThrow 是不夠的：`usePotion` 靜靜回 false 也照樣不丟例外（稽核 2026-09-11 低-6）
    const cs = fight('kappa', ['break_art']);
    expect(usePotion(cs, 'break_art', cs.enemies[0]!.uid)).toBe(true);
    expect(cs.potions).not.toContain('break_art');
  });
});

describe('加倍奉還（doubleStatus）', () => {
  it('有中毒就翻倍，再加 2 層', () => {
    const cs = fight('kappa', ['double_back']);
    const e = cs.enemies[0]!;
    addStatus(e, '中毒', 5);
    expect(usePotion(cs, 'double_back', e.uid)).toBe(true);
    expect(getStatus(e, '中毒'), '5 → 翻倍 10 再 +2').toBe(12);
  });
  it('**0 層時不會變成一行「催不動」**：保底給 2 層（2026-09-11 刻意加的 `add`）', () => {
    // 牌（絕學·催噎）沒有保底沒關係——牌每場都能再打一次；
    // 忍具是一次性的，花 40 條買到「什麼都沒發生」太傷
    const cs = fight('kappa', ['double_back']);
    const e = cs.enemies[0]!;
    expect(getStatus(e, '中毒')).toBe(0);
    expect(usePotion(cs, 'double_back', e.uid)).toBe(true);
    expect(getStatus(e, '中毒')).toBe(2);
    expect(cs.log.some((l) => l.includes('催不動')), '不該印催不動').toBe(false);
  });
});

describe('亂石包（damageRandom）', () => {
  it('傷害落在 6～22 之間，而且**不吃爪力**（忍具同口徑）', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 40; k++) {
      const cs = startCombat({
        hp: 999, maxHp: 999, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)),
        relics: [], potions: ['rubble_bag'], encounterId: 'kappa', rng: new Rng(seedFromString(`rub${k}`)),
      });
      const e = cs.enemies[0]!;
      addStatus(cs.player, '爪力', 20);   // 爪力拉到 20：忍具若吃爪力，傷害會遠超過 22
      const before = e.hp + e.block;
      usePotion(cs, 'rubble_bag', e.uid);
      const dealt = before - (e.hp + e.block);
      expect(dealt, `種子 rub${k} 打出 ${dealt}`).toBeGreaterThanOrEqual(6);
      expect(dealt, `種子 rub${k} 打出 ${dealt}，爪力被算進去了`).toBeLessThanOrEqual(22);
      seen.add(dealt);
    }
    expect(seen.size, '四十個種子全打同一個數字＝亂數沒在動').toBeGreaterThan(5);
  });
});

describe('以彼之道（damageEqualBlock）', () => {
  it('傷害等同目前的蜷縮，而且**用完蜷縮還在**（不是消耗掉）', () => {
    const cs = fight('kappa', ['your_way']);
    const e = cs.enemies[0]!;
    cs.player.block = 18;
    const before = e.hp + e.block;
    expect(usePotion(cs, 'your_way', e.uid)).toBe(true);
    expect(before - (e.hp + e.block), '打出 18 點').toBe(18);
    expect(cs.player.block, '蜷縮不該被花掉').toBe(18);
  });
  it('沒有蜷縮時就是 0 點，不會爆', () => {
    const cs = fight('kappa', ['your_way']);
    cs.player.block = 0;
    const e = cs.enemies[0]!;
    const before = e.hp + e.block;
    expect(usePotion(cs, 'your_way', e.uid)).toBe(true);
    expect(before - (e.hp + e.block)).toBe(0);
  });
});

/*
 * 2026-09-11 第三批（使用者從新提案挑的「剋具體麻煩」三支）。
 * 三支各剋一種以前完全沒解法的狀況，所以每一條都驗「那個麻煩真的被解掉了」，
 * 不是只驗數字有沒有動。
 */
describe('黏鳥膠（打下飛行）', () => {
  it('飛行歸零，而且**傷害立刻不再砍半**', () => {
    const cs = fight('kappa', ['bird_glue', 'iron_paw']);
    const e = cs.enemies[0]!;
    addStatus(e, '飛行', 4);
    // 先確認飛行真的在砍傷害：鐵爪套 16 點，飛著只會進去 8
    const cs2 = fight('kappa', ['iron_paw']);
    addStatus(cs2.enemies[0]!, '飛行', 4);
    const b2 = cs2.enemies[0]!.hp + cs2.enemies[0]!.block;
    usePotion(cs2, 'iron_paw', cs2.enemies[0]!.uid);
    expect(b2 - (cs2.enemies[0]!.hp + cs2.enemies[0]!.block), '飛著只吃一半').toBe(8);

    expect(usePotion(cs, 'bird_glue', e.uid)).toBe(true);
    expect(getStatus(e, '飛行'), '四層要一次全掉').toBe(0);
    const before = e.hp + e.block;
    usePotion(cs, 'iron_paw', e.uid);
    expect(before - (e.hp + e.block), '落地後吃滿 16').toBe(16);
  });
  it('**過了一個回合也飛不回去**——這才是「打下來」的意思', () => {
    /*
     * 這條是這支忍具真正的規格：清掉層數之後**過幾個回合都不會飛回去**。
     *
     * 一段來回值得留著：我第一版把飛行做成「魔物自己回合開始補回滿層」，
     * 那時這支只擋一拍、跟「打下來」的名字對不上，得靠一個特例旗標才做得到永久；
     * 使用者 2026-09-11 直接把規則改成「打下來就是打下來」，特例整個不用了，
     * 這支也退回單純的 `removeStatuses`。**一致的規則讓道具變簡單**。
     * 不論哪個版本，這條測試都是有效的——它推進回合、看的是玩家真正感受到的結果。
     */
    const enc = Object.values(encounterById).find((e) => e.enemies.some((id) => enemyById[id]?.flying));
    expect(enc, '要有一場真的會飛的遭遇').toBeTruthy();
    const cs = fight(enc!.id, ['bird_glue'], 999, 999);
    const flier = cs.enemies.find((e) => enemyById[e.enemyId]?.flying)!;
    expect(getStatus(flier, '飛行'), '開場就在飛').toBeGreaterThan(0);
    expect(usePotion(cs, 'bird_glue', flier.uid)).toBe(true);
    expect(getStatus(flier, '飛行')).toBe(0);
    cs.player.block = 999; endTurn(cs);
    expect(getStatus(flier, '飛行'), '過了一輪還是不能飛').toBe(0);
    cs.player.block = 999; endTurn(cs);
    expect(getStatus(flier, '飛行'), '過了兩輪還是不能飛').toBe(0);
  });
  it('本來就沒在飛也不會爆', () => {
    const cs = fight('kappa', ['bird_glue']);
    expect(usePotion(cs, 'bird_glue', cs.enemies[0]!.uid)).toBe(true);
  });
});

describe('剪刺鉗（剪掉反彈）', () => {
  it('反彈清掉後，打牠不再扣自己的血', () => {
    const cs = fight('kappa', ['thorn_shears', 'shuriken'], 200, 200);
    const e = cs.enemies[0]!;
    addStatus(e, '反彈', 3);
    // 先確認反彈真的在扎人
    const cs2 = fight('kappa', ['shuriken'], 200, 200);
    addStatus(cs2.enemies[0]!, '反彈', 3);
    const hp2 = cs2.player.hp;
    usePotion(cs2, 'shuriken', cs2.enemies[0]!.uid);
    expect(cs2.player.hp, '沒剪之前打牠會被扎 3').toBe(hp2 - 3);

    expect(usePotion(cs, 'thorn_shears', e.uid)).toBe(true);
    expect(getStatus(e, '反彈')).toBe(0);
    const hp = cs.player.hp;
    usePotion(cs, 'shuriken', e.uid);
    expect(cs.player.hp, '剪掉之後打牠不痛了').toBe(hp);
  });
  it('**反彈不算減益，所以溫牛奶那類清不掉它**——這支才有存在意義', () => {
    /*
     * 直接釘前提（稽核 2026-09-11 中-1）：原本只寫「喝溫牛奶、反彈還在」，
     * 但 `cleanse` 的實作從頭到尾只掃玩家身上的 `DEBUFFS`、根本不碰魔物——
     * 就算哪天真的把「反彈」加進 `DEBUFFS`，那條斷言照樣會綠，攔不住它想攔的那一天。
     */
    expect(DEBUFFS, '反彈一旦變成減益，這支忍具的定位就要重想').not.toContain('反彈');
    // 保留原本的回歸測試：喝溫牛奶不會順手清掉魔物的刺
    const cs = fight('kappa', ['milk']);
    const e = cs.enemies[0]!;
    addStatus(e, '反彈', 3);
    usePotion(cs, 'milk');
    expect(getStatus(e, '反彈')).toBe(3);
  });
});

describe('破甲錐（無視防禦）', () => {
  it('防禦再厚也照打 12 點進血', () => {
    const cs = fight('kappa', ['armor_pick']);
    const e = cs.enemies[0]!;
    e.block = 40;
    const hp = e.hp;
    expect(usePotion(cs, 'armor_pick', e.uid)).toBe(true);
    expect(e.hp, '12 點要真的進到血').toBe(hp - 12);
    expect(e.block, '防禦一點都不該被扣').toBe(40);
  });
  it('**不吃爪力**（跟其他忍具同口徑）', () => {
    const cs = fight('kappa', ['armor_pick']);
    addStatus(cs.player, '爪力', 20);
    const e = cs.enemies[0]!;
    const hp = e.hp;
    usePotion(cs, 'armor_pick', e.uid);
    expect(e.hp, '爪力 20 也還是 12 點').toBe(hp - 12);
  });
});
