import { describe, expect, it } from 'vitest';
import { cardById, FEIFEI_STARTER_DECK, starterDeckFor } from '../../src/content/cards';
import { relicById } from '../../src/content/relics';
import { damageEnemy, damagePlayer } from '../../src/engine/actions';
import { canPlay, endTurn, playCard, startCombat } from '../../src/engine/combat';
import { heroName, pickable, startRange, startRelicFor } from '../../src/engine/hero';
import { newRun } from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { describeCard } from '../../src/ui/cardtext';
import { RANGE_MAX, type CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/*
 * 菲菲（2026-09-12）：距離、中毒、以及那六種新效果。
 *
 * 這一整份守的是「**數字真的算對了**」，不是「有沒有跑到那一行」——
 * 每一條都把預期值自己算一遍寫在註解裡，之後改平衡時才看得出是故意改的還是弄壞的。
 */

/** 開一場菲菲的戰鬥。`deck` 是牌號陣列，全部發到手上、飽足調大，想打哪張就打哪張 */
function fight(deck: string[], opts: { encounterId?: string; hp?: number; range?: number } = {}): CombatState {
  const cs = startCombat({
    hp: opts.hp ?? 70, maxHp: opts.hp ?? 70, deck: deck.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: opts.encounterId ?? 'wood_dummy',
    rng: new Rng(seedFromString('feifei')), hero: 'feifei',
  });
  cs.player.drawPile = []; cs.player.hand = deck.map((id, i) => inst(id, i + 1));
  cs.player.energy = 9;
  if (opts.range !== undefined) cs.player.range = opts.range;
  return cs;
}

const uidOf = (cs: CombatState, id: string): number =>
  (cs.player.hand.find((c) => c.cardId === id) as { uid: number }).uid;
const foe = (cs: CombatState) => cs.enemies[0]!;
const play = (cs: CombatState, id: string): boolean =>
  playCard(cs, uidOf(cs, id), cs.enemies[0]?.uid);

describe('菲菲：她是誰', () => {
  it('開場距離 1，其他職業是 0', () => {
    expect(startRange('feifei')).toBe(1);
    expect(startRange('ninja')).toBe(0);
    expect(startRange(undefined)).toBe(0);
    expect(fight(['feifei_tuikai']).player.range).toBe(1);
    const ninja = startCombat({
      hp: 70, maxHp: 70, deck: [inst('sanjo', 1)], relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('n')),
    });
    expect(ninja.player.range).toBe(0);
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

describe('菲菲：距離', () => {
  it('退開＝擋 4 ＋距離 +1，上限夾在 3', () => {
    const cs = fight(['feifei_tuikai', 'feifei_tuikai', 'feifei_tuikai', 'feifei_tuikai']);
    expect(cs.player.range).toBe(1);
    for (let i = 0; i < 4; i++) play(cs, 'feifei_tuikai');
    expect(cs.player.range, `夾在 ${RANGE_MAX}`).toBe(RANGE_MAX);
    expect(cs.player.block).toBe(16);
  });

  it('逃生索直接補到 3（不是加 3）', () => {
    const cs = fight(['feifei_taoshengsuo'], { range: 0 });
    play(cs, 'feifei_taoshengsuo');
    expect(cs.player.range).toBe(3);
    expect(cs.player.block).toBe(6);
  });

  it('全撒了把距離打回 0（那是它的代價）', () => {
    const cs = fight(['feifei_quansale'], { range: 3 });
    play(cs, 'feifei_quansale');
    expect(cs.player.range).toBe(0);
  });

  it('**真的扣到血**才被逼近；蜷縮擋掉的不算', () => {
    const cs = fight([], { range: 3 });
    cs.player.block = 10;
    damagePlayer(cs, foe(cs), 6);                       // 6 點全被蜷縮吃掉
    expect(cs.player.hp).toBe(70);
    expect(cs.player.range, '沒扣到血就不該被逼近').toBe(3);
    damagePlayer(cs, foe(cs), 9);                       // 剩 4 點蜷縮，破 5 點進血
    expect(cs.player.hp).toBe(65);
    expect(cs.player.range).toBe(2);
  });

  it('隱身閃掉的也不算', () => {
    const cs = fight([], { range: 2 });
    addStatus(cs.player, '隱身', 1);
    damagePlayer(cs, foe(cs), 8);
    expect(cs.player.hp).toBe(70);
    expect(cs.player.range).toBe(2);
  });

  it('自傷也會被逼近（她慌了往前衝，本來就要付這個代價）', () => {
    const cs = fight(['feifei_shouhua'], { range: 2 });
    play(cs, 'feifei_shouhua');
    expect(cs.player.hp).toBe(68);      // 自傷 2
    expect(cs.player.range).toBe(1);
  });

  it('距離 0 時再挨打不會變負數', () => {
    const cs = fight([], { range: 0 });
    damagePlayer(cs, foe(cs), 5);
    expect(cs.player.range).toBe(0);
  });
});

describe('菲菲：傷害隨距離放大', () => {
  it('遠射＝3 ＋ 距離 x2；距離 0 是 3 點、距離 3 是 9 點', () => {
    for (const [range, want] of [[0, 3], [1, 5], [2, 7], [3, 9]] as const) {
      const cs = fight(['feifei_yuanshe'], { range, hp: 200 });
      const before = foe(cs).hp;
      play(cs, 'feifei_yuanshe');
      expect(before - foe(cs).hp, `距離 ${range}`).toBe(want);
    }
  });

  it('**用打出當下的距離算**：先退再射比先射再退痛', () => {
    const a = fight(['feifei_tuikai', 'feifei_yuanshe'], { range: 1 });
    const aBefore = foe(a).hp;
    play(a, 'feifei_tuikai'); play(a, 'feifei_yuanshe');   // 距離 2 才射 → 7
    const b = fight(['feifei_tuikai', 'feifei_yuanshe'], { range: 1 });
    const bBefore = foe(b).hp;
    play(b, 'feifei_yuanshe'); play(b, 'feifei_tuikai');   // 距離 1 就射 → 5
    expect(aBefore - foe(a).hp).toBe(7);
    expect(bBefore - foe(b).hp).toBe(5);
  });

  it('起始秘寶配起手牌：第一回合的遠射是 7 點（比球球的貓抓 6 點高一點）', () => {
    const cs = startCombat({
      hp: 70, maxHp: 70, deck: [inst('feifei_yuanshe', 1)], relics: ['backstep'], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('kit')), hero: 'feifei',
    });
    expect(cs.player.range, '開場 1 ＋ 後撤步 1').toBe(2);
    cs.player.hand = [inst('feifei_yuanshe', 1)]; cs.player.energy = 3;
    const before = foe(cs).hp;
    play(cs, 'feifei_yuanshe');
    expect(before - foe(cs).hp).toBe(7);
    expect(cardById['sanjo']!.effects[0]).toMatchObject({ kind: 'damage', amount: 6 });
  });
});

describe('菲菲：站得夠遠才打得出來 / 才會發生', () => {
  it('淬毒·改要求距離 2：不夠時打不出來，理由講得出來', () => {
    const near = fight(['feifei_cuidugai'], { range: 1 });
    const chk = canPlay(near, uidOf(near, 'feifei_cuidugai'), foe(near).uid);
    expect(chk.ok).toBe(false);
    expect(chk.ok === false && chk.reason).toContain('距離');
    const far = fight(['feifei_cuidugai'], { range: 2 });
    expect(play(far, 'feifei_cuidugai')).toBe(true);
    expect(getStatus(foe(far), '中毒')).toBe(6);
  });

  it('貼牆：距離 2 以上才多 3 點蜷縮', () => {
    const near = fight(['feifei_tieqiang'], { range: 1 });
    play(near, 'feifei_tieqiang');
    expect(near.player.block).toBe(7);
    const far = fight(['feifei_tieqiang'], { range: 2 });
    play(far, 'feifei_tieqiang');
    expect(far.player.block).toBe(10);
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

  it('催化把層數翻倍，而且**用完就沒了**（基礎版消耗）', () => {
    const cs = fight(['feifei_cuihua']);
    addStatus(foe(cs), '中毒', 6);
    play(cs, 'feifei_cuihua');
    expect(getStatus(foe(cs), '中毒')).toBe(12);
    expect(cs.player.exhaustPile.some((c) => c.cardId === 'feifei_cuihua'), '基礎版要消耗').toBe(true);
    expect(cardById['feifei_cuihua']!.upgrade.keywords, '升級版才不消耗').toEqual([]);
  });

  it('見血封喉：打出等同層數的傷害，基礎版打完把毒清掉、升級版留著', () => {
    const base = fight(['feifei_jianxue'], { range: 2 });
    addStatus(foe(base), '中毒', 9);
    const bh = foe(base).hp;
    play(base, 'feifei_jianxue');
    expect(bh - foe(base).hp).toBe(9);
    expect(getStatus(foe(base), '中毒'), '基礎版清掉').toBe(0);

    const up = fight([], { range: 2 });
    up.player.hand = [inst('feifei_jianxue', 1, true)];
    addStatus(foe(up), '中毒', 9);
    const uh = foe(up).hp;
    playCard(up, 1, foe(up).uid);
    expect(uh - foe(up).hp).toBe(9);
    expect(getStatus(foe(up), '中毒'), '升級版留著').toBe(9);
  });

  it('見血封喉**無視蜷縮**（引爆毒還被擋住講不通）', () => {
    const cs = fight(['feifei_jianxue'], { range: 2 });
    foe(cs).block = 20;
    addStatus(foe(cs), '中毒', 7);
    const before = foe(cs).hp;
    play(cs, 'feifei_jianxue');
    expect(before - foe(cs).hp).toBe(7);
    expect(foe(cs).block, '蜷縮一點都沒掉').toBe(20);
  });

  it('一針斃命：毒 ≥ 現在的生命才殺得掉', () => {
    const no = fight(['feifei_yizhen'], { range: 0 });
    foe(no).hp = 30; addStatus(foe(no), '中毒', 29);
    play(no, 'feifei_yizhen');
    expect(foe(no).dead, '差一層就殺不掉').toBe(false);

    const yes = fight(['feifei_yizhen'], { range: 0 });
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

  it('拒馬：距離 ≥ 2 時每一下少 3 點，距離不夠就沒有', () => {
    const far = fight(['feifei_juma'], { range: 2 });
    play(far, 'feifei_juma');
    damagePlayer(far, foe(far), 10);
    expect(far.player.hp, '10 − 3').toBe(63);

    const near = fight(['feifei_juma'], { range: 1 });
    play(near, 'feifei_juma');
    damagePlayer(near, foe(near), 10);
    expect(near.player.hp).toBe(60);
  });

  it('拒馬減到 0 就是 0，不會變成回血', () => {
    const cs = fight(['feifei_juma'], { range: 3 });
    play(cs, 'feifei_juma');
    damagePlayer(cs, foe(cs), 2);
    expect(cs.player.hp).toBe(70);
  });

  it('千針萬毒：每打出一張攻擊牌就補 1 層，技能牌不算', () => {
    const cs = fight(['feifei_qianzhen', 'feifei_feizhen', 'feifei_moyao']);
    playCard(cs, uidOf(cs, 'feifei_qianzhen'));
    expect(cs.player.poisonOnAttack).toBe(1);
    play(cs, 'feifei_feizhen');
    expect(getStatus(foe(cs), '中毒'), '飛針本身 2 層 ＋ 千針萬毒 1 層').toBe(3);
    play(cs, 'feifei_moyao');
    expect(getStatus(foe(cs), '中毒'), '抹藥是技能牌，只有它自己的 4 層').toBe(7);
  });

  it('千針萬毒補的那一層**不會被同一張見血封喉吃到**（不然它會自己餵自己）', () => {
    const cs = fight(['feifei_qianzhen', 'feifei_jianxue'], { range: 2 });
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
  it('距離、隨距離放大、門檻、長效旗標都寫得出人話', () => {
    expect(describeCard(cardById['feifei_tuikai']!, false)).toContain('距離 +1');
    expect(describeCard(cardById['feifei_yuanshe']!, false)).toContain('距離每 1 點再多 2 點');
    expect(describeCard(cardById['feifei_taoshengsuo']!, false)).toContain('距離直接變成 3');
    expect(describeCard(cardById['feifei_cuidugai']!, false)).toContain('距離要有 2 才打得出來');
    expect(describeCard(cardById['feifei_tieqiang']!, false)).toContain('距離有 2 以上');
    expect(describeCard(cardById['feifei_juma']!, false)).toContain('少 3 點');
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
    expect(relicById['backstep']!.text).toContain('距離 +1');
  });
});
