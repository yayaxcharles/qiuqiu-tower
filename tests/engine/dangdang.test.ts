import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { beginCombat, newRun } from '../../src/engine/run';
import { endTurn, playCard } from '../../src/engine/combat';
import { damagePlayer } from '../../src/engine/actions';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { describeCard } from '../../src/ui/cardtext';

/**
 * 噹噹：蜷縮是彈藥（2026-09-17 使用者裁定「出招消耗蜷縮」）。
 *
 * 這一份盯的是**那個裁定本身**：原本的提案是「按蜷縮值出招、不消耗」，
 * 那樣疊蜷縮同時就是疊傷害，他永遠不用在打與擋之間選。
 * 所以下面每一條都在驗「打完之後蜷縮真的變少了」——
 * 哪天有人把 `damageSpendBlock` 改回不扣，這一份會整排變紅。
 */
function setup() {
  const run = newRun('dangdang-test', 1, 'dangdang');
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  const cs = beginCombat(run);
  const p = cs.players[0]!;
  p.energy = 99;
  p.hand.length = 0;
  // 銅護臂開場給 4 點蜷縮與 2 點反彈，先清乾淨，每一條自己擺自己的數字
  p.block = 0;
  p.statuses['反彈'] = 0;
  return { cs, p };
}

let uid = 7000;
/** 把一張牌直接塞到手上再打，繞開抽牌的隨機 */
function play(cs: ReturnType<typeof beginCombat>, id: string, target?: number, upgraded = false): void {
  const u = uid++;
  cs.players[0]!.hand.push({ uid: u, cardId: id, upgraded });
  playCard(cs, u, target);
}

describe('噹噹：卸蜷縮出招', () => {
  it('卸力掌把蜷縮打出去，蜷縮真的變少', () => {
    const { cs, p } = setup();
    p.block = 10;
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dd_xieli', e.uid);
    expect(p.block, '卸掉 6 點').toBe(4);
    expect(hp0 - e.hp, '打出去也是 6 點').toBe(6);
  });

  it('蜷縮不夠不是打不出來，是吃多少打多少', () => {
    const { cs, p } = setup();
    p.block = 2;
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dd_xieli', e.uid);
    expect(p.block).toBe(0);
    expect(hp0 - e.hp, '只剩 2 點就打 2 點').toBe(2);
  });

  it('蜷縮是 0 的時候打出去不會倒扣，也不會打到人', () => {
    const { cs, p } = setup();
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dd_bengshan', e.uid);
    expect(p.block).toBe(0);
    expect(e.hp).toBe(hp0);
  });

  it('鐵山靠卸光全部，而且無視防禦', () => {
    const { cs, p } = setup();
    p.block = 14;
    const e = cs.enemies[0]!;
    e.block = 30;                 // 防禦比傷害還高：擋得住的話血一點都不會少
    const hp0 = e.hp;
    play(cs, 'dd_tieshan', e.uid);
    expect(p.block, '全部卸光').toBe(0);
    expect(hp0 - e.hp, '穿過防禦直接進血條').toBe(14);
    expect(e.block, '防禦沒被扣').toBe(30);
  });

  it('捨身撞兩倍傷害，自己也要付 10 點血', () => {
    const { cs, p } = setup();
    p.block = 9;
    const hp0 = p.hp;
    const e = cs.enemies[0]!;
    const ehp0 = e.hp;
    play(cs, 'dd_sheshen', e.uid);
    expect(p.block).toBe(0);
    expect(ehp0 - e.hp, '9 點蜷縮打出 18 點').toBe(18);
    expect(hp0 - p.hp, '自傷 10 點').toBe(10);
  });

  it('銅牆鐵壁只減「卸掉的量」，打出去的力道不變', () => {
    const { cs, p } = setup();
    play(cs, 'dd_tongqiang');       // 之後消耗蜷縮的牌只卸一半
    p.block = 10;
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dd_xieli', e.uid);
    expect(hp0 - e.hp, '還是打 6 點').toBe(6);
    expect(p.block, '只卸掉 3 點（6 的一半）').toBe(7);
  });

  it('銅牆鐵壁：奇數無條件進位，不會靠它憑空多打', () => {
    const { cs, p } = setup();
    play(cs, 'dd_tongqiang');
    p.block = 3;
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dd_xieli', e.uid);
    // 3 點蜷縮在半價下最多撐 6 點的招，卸掉 ceil(6/2)=3
    expect(hp0 - e.hp).toBe(6);
    expect(p.block).toBe(0);
  });
});

describe('噹噹：反彈那條路', () => {
  it('借勢把反彈墊到身前，反彈不會因此減少', () => {
    const { cs, p } = setup();
    addStatus(p, '反彈', 7);
    play(cs, 'dd_jieshi');
    expect(p.block, '反彈值加到蜷縮上').toBe(7);
    expect(getStatus(p, '反彈'), '反彈原封不動').toBe(7);
  });

  it('原樣奉還照自己的反彈打，反彈一樣不減', () => {
    const { cs, p } = setup();
    addStatus(p, '反彈', 5);
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    e.block = 0;
    play(cs, 'dd_yibi', e.uid);
    expect(hp0 - e.hp, '5 點反彈打出兩倍').toBe(10);
    expect(getStatus(p, '反彈')).toBe(5);
  });

  it('以傷還傷：反彈回敬時多打幾點，而且要先有反彈才算數', () => {
    const { cs, p } = setup();
    play(cs, 'dd_yishang');       // 之後反彈回敬時額外 4 點
    addStatus(p, '反彈', 3);
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    e.block = 0;
    // 讓魔物打他一下：反彈回敬 3＋4
    damagePlayer(cs, e, 5);
    expect(hp0 - e.hp, '3 點反彈加 4 點加成').toBe(7);
  });

  it('千斤墜：挨打就蹲得更穩，擋滿也照樣觸發', () => {
    const { cs, p } = setup();
    play(cs, 'dd_qianjin');       // 之後每次被打到獲得 3 點蜷縮
    p.block = 50;                 // 蜷縮遠高於傷害：整下被擋掉，還是要給
    const e = cs.enemies[0]!;
    damagePlayer(cs, e, 4);
    expect(p.block, '擋掉 4 點再拿 3 點').toBe(49);
  });
});

describe('噹噹：條件與收尾', () => {
  it('硬碰硬：身上有蜷縮才拿反彈', () => {
    const { cs, p } = setup();
    const e = cs.enemies[0]!;
    play(cs, 'dd_yingpeng', e.uid);
    expect(getStatus(p, '反彈'), '蜷縮是 0，條件不成立').toBe(0);
    p.block = 1;
    play(cs, 'dd_yingpeng', e.uid);
    expect(getStatus(p, '反彈')).toBe(2);
  });

  it('連環撞：蜷縮要大於 10 才補第二下', () => {
    const { cs, p } = setup();
    const e = cs.enemies[0]!;
    e.block = 0;
    p.block = 10;
    let hp0 = e.hp;
    play(cs, 'dd_lianhuan', e.uid);
    expect(hp0 - e.hp, '剛好 10 不算').toBe(6);
    p.block = 11;
    hp0 = e.hp;
    play(cs, 'dd_lianhuan', e.uid);
    expect(hp0 - e.hp, '11 點才補第二下').toBe(12);
  });

  it('借力：卸蜷縮換血，蜷縮真的少掉', () => {
    const { cs, p } = setup();
    p.hp = p.maxHp - 20;
    p.block = 8;
    play(cs, 'dd_jieli');
    expect(p.block, '卸掉 6 點').toBe(2);
    expect(p.hp, '回 6 點').toBe(p.maxHp - 14);
  });

  it('穩住：這一回合結束多留 4 點，下一回合就沒了', () => {
    const { cs, p } = setup();
    play(cs, 'dd_wenzhu');         // 4 點蜷縮 ＋ 這回合留 4 點
    p.block = 20;                  // 手動墊高，驗上限真的是 4 不是 20
    endTurn(cs);
    expect(p.block, '只留下 4 點').toBe(4);
    expect(p.blockKeepThisTurn, '用完就清掉，不會賴著').toBeFalsy();
  });
});

describe('噹噹：牌面文字唸得通', () => {
  it('消耗類的牌面寫「卸掉」，而且說得出卸幾點', () => {
    expect(describeCard(cardById['dd_xieli']!, false)).toContain('最多卸掉 6 點蜷縮');
    expect(describeCard(cardById['dd_tieshan']!, false)).toContain('卸掉全部的蜷縮');
    expect(describeCard(cardById['dd_tieshan']!, false)).toContain('無視防禦');
    expect(describeCard(cardById['dd_sheshen']!, false)).toContain('兩倍');
    expect(describeCard(cardById['dd_jieshi']!, false)).toContain('反彈不會因此減少');
    expect(describeCard(cardById['dd_jianzhao']!, false)).toContain('魔物這回合要攻擊');
  });

  it('每一張都印得出文字，沒有空白的牌面', () => {
    const his = Object.values(cardById).filter((x) => x.hero === 'dangdang');
    expect(his.length, '他的專屬牌是 29 張').toBe(29);
    for (const c of his) {
      expect(describeCard(c, false).length, c.name).toBeGreaterThan(3);
      expect(describeCard(c, true).length, `${c.name}（升級）`).toBeGreaterThan(3);
    }
  });
});
