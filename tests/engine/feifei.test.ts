import { describe, expect, it } from 'vitest';
import { cardById, FEIFEI_STARTER_DECK, starterDeckFor } from '../../src/content/cards';
import { relicById } from '../../src/content/relics';
import { damageEnemy, damagePlayer } from '../../src/engine/actions';
import { canPlay, endTurn, playCard, startCombat } from '../../src/engine/combat';
import { heroName, pickable, startRelicFor } from '../../src/engine/hero';
import { newRun } from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { describeCard } from '../../src/ui/cardtext';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/*
 * 菲菲（2026-09-12）：距離、中毒、以及那六種新效果。
 *
 * 這一整份守的是「**數字真的算對了**」，不是「有沒有跑到那一行」——
 * 每一條都把預期值自己算一遍寫在註解裡，之後改平衡時才看得出是故意改的還是弄壞的。
 */

/** 開一場菲菲的戰鬥。`deck` 是牌號陣列，全部發到手上、飽足調大，想打哪張就打哪張 */
function fight(deck: string[], opts: { encounterId?: string; hp?: number } = {}): CombatState {
  const cs = startCombat({
    hp: opts.hp ?? 70, maxHp: opts.hp ?? 70, deck: deck.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: opts.encounterId ?? 'wood_dummy',
    rng: new Rng(seedFromString('feifei')), hero: 'feifei',
  });
  cs.player.drawPile = []; cs.player.hand = deck.map((id, i) => inst(id, i + 1));
  cs.player.energy = 9;
  return cs;
}

const uidOf = (cs: CombatState, id: string): number =>
  (cs.player.hand.find((c) => c.cardId === id) as { uid: number }).uid;
const foe = (cs: CombatState) => cs.enemies[0]!;
const play = (cs: CombatState, id: string): boolean =>
  playCard(cs, uidOf(cs, id), cs.enemies[0]?.uid);

describe('菲菲：她是誰', () => {
  it('起手十張是她自己的那一套，而且**攻擊牌自帶蜷縮**', () => {
    const cs = fight(['feifei_feizhen']);
    const before = cs.player.block;
    play(cs, 'feifei_feizhen');
    expect(cs.player.block - before, '飛針打完自己也擋 2').toBe(2);
    expect(getStatus(foe(cs), '中毒'), '順便下 1 層毒').toBe(1);
  });
  it('起手十張是她自己的那一套，起始秘寶是後撤步', () => {
    expect(FEIFEI_STARTER_DECK.length).toBe(10);
    expect(starterDeckFor('feifei')).toBe(FEIFEI_STARTER_DECK);
    expect(starterDeckFor('ninja')).not.toBe(FEIFEI_STARTER_DECK);
    expect(startRelicFor('feifei')).toBe('backstep');
    expect(startRelicFor('ninja')).toBe('blue_headband');
    const run = newRun('feifei-seed', 1, 'feifei');
    expect(run.players[0]!.relics).toEqual(['backstep']);
    expect(run.players[0]!.deck.map((c) => c.cardId).sort()).toEqual([...FEIFEI_STARTER_DECK].sort());
  });

  it('名字跟球球分得開（連線同框時兩格不能都寫球球）', () => {
    expect(heroName({ hero: 'feifei' })).toBe('菲菲');
    expect(heroName({ hero: 'ninja' })).toBe('球球');
    expect(heroName({})).toBe('球球');
  });

  it('她的牌只有她拿得到，球球的隱身牌她拿不到', () => {
    const feizhen = cardById['feifei_feizhen']!;
    expect(pickable({ ...feizhen, hidden: undefined }, 'feifei')).toBe(true);
    expect(pickable({ ...feizhen, hidden: undefined }, 'ninja')).toBe(false);
    const kawarimi = cardById['kawarimi']!;
    expect(pickable(kawarimi, 'feifei')).toBe(false);
  });
});

describe('菲菲：中毒', () => {
  it('N 層中毒的總傷害是 N(N+1)/2——改平衡前一定要記著這條', () => {
    const cs = fight([], { hp: 999, encounterId: 'wood_dummy' });
    const e = foe(cs);
    e.hp = 999; e.maxHp = 999;
    addStatus(e, '中毒', 5);
    const before = e.hp;
    for (let i = 0; i < 8; i++) endTurn(cs);   // 每回合開始扣層數的血，然後少 1 層
    expect(before - e.hp, '5+4+3+2+1').toBe(15);
    expect(getStatus(e, '中毒')).toBe(0);
  });

  /*
   * 散毒（原本是「催化」，跟共用的「絕學·催噎」撞牌所以砍掉重做——稽核 2026-09-12 中-13）。
   * 這張解的是「一排魔物」的場面：機器人實測她第二關陣亡 206、球球只有 131。
   */
  it('散毒：把目標的毒分給其他每一隻，目標自己那份不動', () => {
    const cs = fight(['feifei_sandu'], { encounterId: 'rats3' });
    const [a, b, c] = cs.enemies as [typeof cs.enemies[0], typeof cs.enemies[0], typeof cs.enemies[0]];
    addStatus(a, '中毒', 9);
    playCard(cs, uidOf(cs, 'feifei_sandu'), a.uid);
    expect(getStatus(a, '中毒'), '目標自己不動').toBe(9);
    expect(getStatus(b, '中毒'), '基礎版各拿一半（9 的一半無條件捨去＝4）').toBe(4);
    expect(getStatus(c, '中毒')).toBe(4);
    expect(cs.player.exhaustPile.some((x) => x.cardId === 'feifei_sandu'), '消耗').toBe(true);
  });

  /*
   * 升級版才整份擴散——那是這張的成長曲線。
   * 2026-09-12 一度把基礎版也改成整份，當天還原：**看起來弱的基礎版，要先看升級版給了什麼**。
   */
  it('散毒升級版：每隻都拿全額；只剩一隻時什麼都不會發生', () => {
    const up = fight([], { encounterId: 'rats3' });
    up.player.hand = [inst('feifei_sandu', 1, true)];
    const [a, b] = up.enemies as [typeof up.enemies[0], typeof up.enemies[0]];
    addStatus(a, '中毒', 7);
    playCard(up, 1, a.uid);
    expect(getStatus(b, '中毒')).toBe(7);

    const solo = fight(['feifei_sandu']);
    addStatus(foe(solo), '中毒', 9);
    play(solo, 'feifei_sandu');
    expect(getStatus(foe(solo), '中毒'), '旁邊沒人，層數原樣').toBe(9);
    expect(solo.log.some((l) => l.includes('旁邊沒有別的魔物'))).toBe(true);
  });

  it('見血封喉：打出等同層數的傷害，基礎版打完把毒清掉、升級版留著', () => {
    const base = fight(['feifei_jianxue']);
    addStatus(foe(base), '中毒', 9);
    const bh = foe(base).hp;
    play(base, 'feifei_jianxue');
    expect(bh - foe(base).hp).toBe(9);
    expect(getStatus(foe(base), '中毒'), '基礎版清掉').toBe(0);

    const up = fight([]);
    up.player.hand = [inst('feifei_jianxue', 1, true)];
    addStatus(foe(up), '中毒', 9);
    const uh = foe(up).hp;
    playCard(up, 1, foe(up).uid);
    expect(uh - foe(up).hp).toBe(9);
    expect(getStatus(foe(up), '中毒'), '升級版留著').toBe(9);
  });

  it('見血封喉**無視蜷縮**（引爆毒還被擋住講不通）', () => {
    const cs = fight(['feifei_jianxue']);
    foe(cs).block = 20;
    addStatus(foe(cs), '中毒', 7);
    const before = foe(cs).hp;
    play(cs, 'feifei_jianxue');
    expect(before - foe(cs).hp).toBe(7);
    expect(foe(cs).block, '蜷縮一點都沒掉').toBe(20);
  });

  it('一針斃命：毒 ≥ 現在的生命才殺得掉', () => {
    const no = fight(['feifei_yizhen']);
    foe(no).hp = 30; addStatus(foe(no), '中毒', 29);
    play(no, 'feifei_yizhen');
    expect(foe(no).dead, '差一層就殺不掉').toBe(false);

    const yes = fight(['feifei_yizhen']);
    foe(yes).hp = 30; addStatus(foe(yes), '中毒', 30);
    play(yes, 'feifei_yizhen');
    expect(foe(yes).dead).toBe(true);
  });
});

describe('菲菲：三個長效旗標', () => {
  it('餘毒（屍爆）：牠倒下時剩下的毒分給其他人；升級版每隻都拿全額', () => {
    const cs = fight(['feifei_yudu'], { encounterId: 'rats3' });
    expect(cs.enemies.length, '這一場要有三隻以上才測得出來').toBeGreaterThanOrEqual(3);
    play(cs, 'feifei_yudu');
    expect(cs.player.poisonBurst).toBe('split');
    const [a, b, c] = cs.enemies as [typeof cs.enemies[0], typeof cs.enemies[0], typeof cs.enemies[0]];
    addStatus(a, '中毒', 9);
    damageEnemy(cs, a, 999, { direct: true });
    expect(a.dead).toBe(true);
    // 9 層、還站著兩隻 → 各 4（無條件捨去）
    expect(getStatus(b, '中毒')).toBe(4);
    expect(getStatus(c, '中毒')).toBe(4);
  });

  it('餘毒升級版：每隻都拿全額', () => {
    const cs = fight([], { encounterId: 'rats3' });
    cs.player.hand = [inst('feifei_yudu', 1, true)];
    playCard(cs, 1);
    expect(cs.player.poisonBurst).toBe('full');
    const [a, b, c] = cs.enemies as [typeof cs.enemies[0], typeof cs.enemies[0], typeof cs.enemies[0]];
    addStatus(a, '中毒', 9);
    damageEnemy(cs, a, 999, { direct: true });
    expect(getStatus(b, '中毒')).toBe(9);
    expect(getStatus(c, '中毒')).toBe(9);
  });

  /*
   * 拒馬：之後**每次**獲得蜷縮都多幾點。這是她整套的放大器——
   * 她的攻擊牌本來就自帶蜷縮，所以「打一張＝擋更多」。
   */
  it('拒馬：之後每次獲得蜷縮都多 2 點，攻擊牌自帶的那份也算', () => {
    const cs = fight(['feifei_juma', 'feifei_tuikai', 'feifei_feizhen']);
    playCard(cs, uidOf(cs, 'feifei_juma'));
    expect(cs.player.blockBonus).toBe(2);
    play(cs, 'feifei_tuikai');
    expect(cs.player.block, '退開 5 ＋ 2').toBe(7);
    play(cs, 'feifei_feizhen');
    expect(cs.player.block, '再加上飛針自帶的 2 ＋ 2').toBe(11);
  });

  it('拒馬疊兩張會累加（升級版跟基礎版一起帶也不會互相蓋掉）', () => {
    const cs = fight(['feifei_juma', 'feifei_tuikai']);
    playCard(cs, uidOf(cs, 'feifei_juma'));
    cs.player.hand.push(inst('feifei_juma', 99, true));
    playCard(cs, 99);
    expect(cs.player.blockBonus, '2 ＋ 3').toBe(5);
    play(cs, 'feifei_tuikai');
    expect(cs.player.block).toBe(10);
  });

  it('千針萬毒：每打出一張攻擊牌就補 1 層，技能牌不算', () => {
    const cs = fight(['feifei_qianzhen', 'feifei_feizhen', 'feifei_moyao']);
    playCard(cs, uidOf(cs, 'feifei_qianzhen'));
    expect(cs.player.poisonOnAttack).toBe(1);
    play(cs, 'feifei_feizhen');
    expect(getStatus(foe(cs), '中毒'), '飛針本身 1 層 ＋ 千針萬毒 1 層').toBe(2);
    play(cs, 'feifei_moyao');
    expect(getStatus(foe(cs), '中毒'), '抹藥是技能牌，只有它自己的 5 層').toBe(7);
  });

  it('千針萬毒補的那一層**不會被同一張見血封喉吃到**（不然它會自己餵自己）', () => {
    const cs = fight(['feifei_qianzhen', 'feifei_jianxue']);
    playCard(cs, uidOf(cs, 'feifei_qianzhen'));
    addStatus(foe(cs), '中毒', 5);
    const before = foe(cs).hp;
    play(cs, 'feifei_jianxue');
    expect(before - foe(cs).hp, '引爆的是打之前的 5 層').toBe(5);
    expect(getStatus(foe(cs), '中毒'), '清掉之後才補上千針萬毒那 1 層').toBe(1);
  });
});

describe('菲菲：戰報用她的名字', () => {
  /*
   * 引擎的紀錄本來整排寫死「球球」（2026-09-12 實機測到「球球打出『退開』」）。
   * 這一組同時守兩件事：名字換對了，而且**畫面比對紀錄的那幾行也跟著改了**——
   * 那才是會安靜壞掉的地方（菲菲閃過去，閃避動畫不演）。
   */
  it('打牌、用忍具、閃過都寫她的名字', () => {
    const cs = fight(['feifei_feizhen']);
    play(cs, 'feifei_feizhen');
    expect(cs.log.some((l) => l.startsWith('菲菲打出「飛針」'))).toBe(true);
    expect(cs.log.some((l) => l.includes('球球')), '一行都不該有球球').toBe(false);

    addStatus(cs.player, '隱身', 1);
    damagePlayer(cs, foe(cs), 8);
    expect(cs.log.some((l) => l === '菲菲閃過了')).toBe(true);
  });

  it('球球那邊照舊', () => {
    const cs = startCombat({
      hp: 70, maxHp: 70, deck: [inst('sanjo', 1)], relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('n2')),
    });
    cs.player.hand = [inst('sanjo', 1)]; cs.player.energy = 3;
    playCard(cs, 1, cs.enemies[0]!.uid);
    expect(cs.log.some((l) => l.startsWith('球球打出「貓抓」'))).toBe(true);
  });
});

describe('菲菲：牌面文字讀得懂', () => {
  it('毒、屍爆、斬殺、蜷縮加成都寫得出人話', () => {
    expect(describeCard(cardById['feifei_feizhen']!, false)).toContain('點蜷縮');
    expect(describeCard(cardById['feifei_cuidu']!, false)).toContain('4 層中毒');
    expect(describeCard(cardById['feifei_juma']!, false)).toContain('每次獲得蜷縮都多 2 點');
    expect(describeCard(cardById['feifei_sandu']!, false)).toContain('分給其他魔物');
    expect(describeCard(cardById['feifei_yudu']!, false)).toContain('分給其他魔物');
    expect(describeCard(cardById['feifei_yizhen']!, false)).toContain('直接打倒牠');
  });

  it('每一張的說明都不是空的，也沒有把樣板字漏在裡面', () => {
    for (const c of Object.values(cardById)) {
      if (c.hero !== 'feifei') continue;
      const t = describeCard(c, false);
      expect(t.length, c.name).toBeGreaterThan(3);
      expect(t, c.name).not.toContain('${');
      expect(t, c.name).not.toContain('undefined');
      const up = describeCard(c, true);
      expect(up, c.name + '（升級）').not.toContain('${');
    }
  });

  it('後撤步的說明跟它真的做的事對得上', () => {
    expect(relicById['backstep']!.text).toContain('5 點蜷縮');
  });
});
