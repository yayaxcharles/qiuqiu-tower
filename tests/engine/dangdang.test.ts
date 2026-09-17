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
    play(cs, 'dangdang_xieli', e.uid);
    expect(p.block, '卸掉 6 點').toBe(4);
    expect(hp0 - e.hp, '打出去也是 6 點').toBe(6);
  });

  it('蜷縮不夠不是打不出來，是吃多少打多少', () => {
    const { cs, p } = setup();
    p.block = 2;
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dangdang_xieli', e.uid);
    expect(p.block).toBe(0);
    expect(hp0 - e.hp, '只剩 2 點就打 2 點').toBe(2);
  });

  it('蜷縮是 0 的時候打出去不會倒扣，也不會打到人', () => {
    const { cs, p } = setup();
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dangdang_bengshan', e.uid);
    expect(p.block).toBe(0);
    expect(e.hp).toBe(hp0);
  });

  it('鐵山靠卸光全部，而且無視防禦', () => {
    const { cs, p } = setup();
    p.block = 14;
    const e = cs.enemies[0]!;
    e.block = 30;                 // 防禦比傷害還高：擋得住的話血一點都不會少
    const hp0 = e.hp;
    play(cs, 'dangdang_tieshan', e.uid);
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
    play(cs, 'dangdang_sheshen', e.uid);
    expect(p.block).toBe(0);
    expect(ehp0 - e.hp, '9 點蜷縮打出 18 點').toBe(18);
    expect(hp0 - p.hp, '自傷 10 點').toBe(10);
  });

  it('銅牆鐵壁只減「卸掉的量」，打出去的力道不變', () => {
    const { cs, p } = setup();
    play(cs, 'dangdang_tongqiang');       // 之後消耗蜷縮的牌只卸一半
    p.block = 10;
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dangdang_xieli', e.uid);
    expect(hp0 - e.hp, '還是打 6 點').toBe(6);
    expect(p.block, '只卸掉 3 點（6 的一半）').toBe(7);
  });

  it('銅牆鐵壁：奇數無條件進位，不會靠它憑空多打', () => {
    const { cs, p } = setup();
    play(cs, 'dangdang_tongqiang');
    p.block = 3;
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    play(cs, 'dangdang_xieli', e.uid);
    // 3 點蜷縮在半價下最多撐 6 點的招，卸掉 ceil(6/2)=3
    expect(hp0 - e.hp).toBe(6);
    expect(p.block).toBe(0);
  });
});

describe('噹噹：反彈那條路', () => {
  it('借勢把反彈墊到身前，反彈不會因此減少', () => {
    const { cs, p } = setup();
    addStatus(p, '反彈', 7);
    play(cs, 'dangdang_jieshi');
    expect(p.block, '反彈值加到蜷縮上').toBe(7);
    expect(getStatus(p, '反彈'), '反彈原封不動').toBe(7);
  });

  it('原樣奉還照自己的反彈打，反彈一樣不減', () => {
    const { cs, p } = setup();
    addStatus(p, '反彈', 5);
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    e.block = 0;
    play(cs, 'dangdang_yibi', e.uid);
    expect(hp0 - e.hp, '5 點反彈打出兩倍').toBe(10);
    expect(getStatus(p, '反彈')).toBe(5);
  });

  it('以傷還傷：反彈回敬時多打幾點，而且要先有反彈才算數', () => {
    const { cs, p } = setup();
    play(cs, 'dangdang_yishang');       // 之後反彈回敬時額外 4 點
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
    play(cs, 'dangdang_qianjin');       // 之後每次被打到獲得 3 點蜷縮
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
    play(cs, 'dangdang_yingpeng', e.uid);
    expect(getStatus(p, '反彈'), '蜷縮是 0，條件不成立').toBe(0);
    p.block = 1;
    play(cs, 'dangdang_yingpeng', e.uid);
    expect(getStatus(p, '反彈')).toBe(2);
  });

  it('硬碰硬：身上有蜷縮才給反彈（`ifBlock` 的門檻）', () => {
    // 原本這條驗的是連環撞（門檻 11），2026-09-17 那張被橋接牌換掉了；
    // `ifBlock` 這個效果還在用（硬碰硬），所以改成驗它
    const { cs, p } = setup();
    const e = cs.enemies[0]!;
    play(cs, 'dangdang_yingpeng', e.uid);
    expect(getStatus(p, '反彈'), '蜷縮 0，條件不成立').toBe(0);
    p.block = 1;
    play(cs, 'dangdang_yingpeng', e.uid);
    expect(getStatus(p, '反彈')).toBe(2);
  });

  it('借力：卸蜷縮換血，蜷縮真的少掉', () => {
    const { cs, p } = setup();
    p.hp = p.maxHp - 20;
    p.block = 8;
    play(cs, 'dangdang_jieliqi');
    expect(p.block, '卸掉 6 點').toBe(2);
    expect(p.hp, '回 6 點').toBe(p.maxHp - 14);
  });

  it('穩住：這一回合結束多留 4 點，下一回合就沒了', () => {
    const { cs, p } = setup();
    play(cs, 'dangdang_wenzhu');         // 4 點蜷縮 ＋ 這回合留 4 點
    p.block = 20;                  // 手動墊高，驗上限真的是 4 不是 20
    endTurn(cs);
    expect(p.block, '只留下 4 點').toBe(4);
    expect(p.blockKeepThisTurn, '用完就清掉，不會賴著').toBeFalsy();
  });
});

describe('噹噹：牌面文字唸得通', () => {
  it('消耗類的牌面寫「卸掉」，而且說得出卸幾點', () => {
    expect(describeCard(cardById['dangdang_xieli']!, false)).toContain('最多卸掉 6 點蜷縮');
    // 「身上的」不寫「全部」：帶著銅牆鐵壁時只卸一半，寫「全部」跟實際對不上（審查 2026-09-17 低-1）
    expect(describeCard(cardById['dangdang_tieshan']!, false)).toContain('卸掉身上的蜷縮');
    expect(describeCard(cardById['dangdang_tieshan']!, false)).toContain('無視防禦');
    expect(describeCard(cardById['dangdang_sheshen']!, false)).toContain('兩倍');
    expect(describeCard(cardById['dangdang_jieshi']!, false)).toContain('反彈不會因此減少');
    expect(describeCard(cardById['dangdang_jianzhao']!, false)).toContain('魔物這回合要攻擊');
  });

  it('條件牌的另一邊是空的時候，不會印出沒講完的「否則。」', () => {
    /*
     * 2026-09-17 抓到：`ifSelfStatus` 原本一律接「；否則」加另一組的內容，
     * 而護臂格擋沒有另一組，印出來變成「……獲得 4 點蜷縮；**否則。**」。
     * 全牌池只有這一張中招，因為在那之前每一張用這個效果的牌兩邊都有東西。
     */
    for (const up of [false, true]) {
      const t = describeCard(cardById['dangdang_huben']!, up);
      expect(t, `護臂格擋${up ? '（升級）' : ''}`).not.toContain('否則。');
      expect(t).toContain('自己身上有反彈的話');
    }
    // 兩邊都有東西的那幾張照舊會接「否則」
    const both = Object.values(cardById).find((c) => c.effects.some(
      (e) => e.kind === 'ifSelfStatus' && e.otherwise.length > 0));
    if (both) expect(describeCard(both, false)).toContain('否則');
  });

  it('每一張都印得出文字，沒有空白的牌面', () => {
    const his = Object.values(cardById).filter((x) => x.hero === 'dangdang');
    // 30 張專屬牌，再加一張 2026-09-17 從共用池收歸他專屬的絕學太極
    //（使用者：球球與菲菲拿到太強）。他堆蜷縮有代價，另外兩位沒有，所以只有他拿著剛好
    expect(his.length, '他的專屬牌 30 張＋絕學太極').toBe(31);
    for (const c of his) {
      expect(describeCard(c, false).length, c.name).toBeGreaterThan(3);
      expect(describeCard(c, true).length, `${c.name}（升級）`).toBeGreaterThan(3);
    }
  });
});

/**
 * 兩條路互相加分的四張（2026-09-17 使用者拍板）。
 *
 * 他本來的卸力流（卸蜷縮打人）跟反彈流（挨打回敬）各走各的，
 * 中間只有借勢一座單向橋。這四張把兩條路接起來，所以每一條都在驗
 *「**另一半真的有幫到忙**」——哪天有人把橋拆掉，這幾條會紅。
 */
describe('噹噹：兩條路互相加分', () => {
  it('借力打力：反彈越高，卸出去的那一掌越痛', () => {
    const { cs, p } = setup();
    const e = cs.enemies[0]!;
    e.block = 0;
    p.block = 6;
    let hp0 = e.hp;
    play(cs, 'dangdang_jielidali', e.uid);
    expect(hp0 - e.hp, '沒有反彈時就是卸多少打多少').toBe(6);

    p.block = 6;
    addStatus(p, '反彈', 5);
    hp0 = e.hp;
    play(cs, 'dangdang_jielidali', e.uid);
    expect(hp0 - e.hp, '6 點蜷縮＋5 點反彈').toBe(11);
    expect(getStatus(p, '反彈'), '反彈不會被這張吃掉').toBe(5);
  });

  it('順勢：挨打回敬的同時把彈藥補回來', () => {
    const { cs, p } = setup();
    play(cs, 'dangdang_shunshi');      // 之後每次反彈回敬，獲得 2 點蜷縮
    addStatus(p, '反彈', 3);
    const e = cs.enemies[0]!;
    e.block = 0;
    p.block = 0;
    damagePlayer(cs, e, 4);
    expect(p.block, '回敬完補 2 點蜷縮').toBe(2);
    // 沒有反彈就不會觸發——回敬都沒發生，補給也不該發生
    p.statuses['反彈'] = 0;
    p.block = 0;
    damagePlayer(cs, e, 4);
    expect(p.block, '沒有反彈卻補了蜷縮').toBe(0);
  });

  it('反震：回合末本來要歸零的蜷縮，換成不會消失的反彈', () => {
    const { cs, p } = setup();
    play(cs, 'dangdang_fanzhen');      // 這回合結束時，剩下的蜷縮每 2 點換 1 點反彈
    p.block = 9;
    endTurn(cs);
    expect(getStatus(p, '反彈'), '9 點換 4 點（無條件捨去）').toBe(4);
    expect(p.blockToThornsThisTurn, '用完就清掉，不會賴著下一回合').toBeFalsy();
    // 下一回合沒再打這張，就不該再換
    const before = getStatus(p, '反彈');
    p.block = 9;
    endTurn(cs);
    expect(getStatus(p, '反彈'), '只撐一回合').toBeLessThanOrEqual(before);
  });

  it('以身作盾：卸出去的力道自己養出反彈', () => {
    const { cs, p } = setup();
    play(cs, 'dangdang_yishenzuodun');   // 之後卸蜷縮打人時，拿等同卸掉點數一半的反彈
    p.block = 12;
    const e = cs.enemies[0]!;
    e.block = 0;
    play(cs, 'dangdang_bengshan', e.uid);   // 最多卸 12 點
    expect(p.block, '12 點全卸出去').toBe(0);
    expect(getStatus(p, '反彈'), '卸 12 點拿 6 點反彈').toBe(6);
  });

  it('以身作盾配借力打力：這一掌不能用自己剛長出來的反彈再加一次', () => {
    /*
     * 順序的坑：以身作盾在同一張牌裡先給反彈，借力打力又照反彈加傷害。
     * 兩個都掛著的時候，如果先給反彈再算傷害，等於卸出去的力道被算了兩次。
     */
    const { cs, p } = setup();
    play(cs, 'dangdang_yishenzuodun');
    p.block = 6;
    const e = cs.enemies[0]!;
    e.block = 0;
    const hp0 = e.hp;
    play(cs, 'dangdang_jielidali', e.uid);
    expect(hp0 - e.hp, '打之前身上沒有反彈，就只該打 6 點').toBe(6);
    expect(getStatus(p, '反彈'), '打完才拿到 3 點反彈').toBe(3);
  });

  it('四張的牌面都講得出另一半', () => {
    expect(describeCard(cardById['dangdang_jielidali']!, false)).toContain('每有 1 點反彈再多打 1 點');
    expect(describeCard(cardById['dangdang_shunshi']!, false)).toContain('每次反彈回敬');
    expect(describeCard(cardById['dangdang_fanzhen']!, false)).toContain('換成');
    expect(describeCard(cardById['dangdang_yishenzuodun']!, false)).toContain('卸掉點數一半的反彈');
    expect(describeCard(cardById['dangdang_yishenzuodun']!, true)).not.toContain('一半');
  });
});
