import { describe, expect, it } from 'vitest';
import { playCombat, playRun } from '../../src/engine/bot';
import { STARTER_DECK } from '../../src/content/cards';
import { startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';

describe('隨機試玩', () => {
  it('200 局不當、不卡死、每局都有結果', () => {
    const results = [];
    for (let i = 0; i < 200; i++) results.push(playRun(`bot-${i}`));
    for (const r of results) {
      expect(r.floor).toBeGreaterThanOrEqual(1);
      expect(r.turns).toBeGreaterThan(0);
      expect(typeof r.won).toBe('boolean');
    }
    const wins = results.filter((r) => r.won).length;
    console.log(`隨機亂打：通關 ${wins}/200，平均到達 ${(results.reduce((s, r) => s + r.floor, 0) / 200).toFixed(1)}F`);
  }, 120_000);
  it('同種子同結果', () => {
    expect(playRun('same')).toEqual(playRun('same'));
  });
  // 回歸：這兩個種子在戰鬥上限 60 回合時會爆掉（bal-369 是「告退」把牌組消耗光後的僵持，
  // 已於改成消耗牌後解掉；bal-453 是龜縮拖塔主）。釘住精確統計值，順便涵蓋「不丟例外」。
  // 2026-08-30 地圖兩度改版（先改路線式產生、再加不交叉規則、又新增 20 張牌），同種子的牌與路線都變了，數值重錄過三次。
  // 2026-08-31 依 Word 對照表的批改調了 27 張牌的費用／名稱／稀有度，又重錄一次。
  // 同日再補 14 隻魔物與 23 組遭遇、2 個塔主、20 個事件、20 個秘寶、12 個忍具、16 張牌，
  // 每加一批內容擲骰就全變，所以最後統一重錄一次。
  it('曾經打超過 60 回合的種子照樣跑得完，而且結果不變', () => {
    // 2026-09-01 地圖規則改動（5F 匯合、分岔與直向查重）後同種子的走向跟著變，錨值更新
    // 2026-09-02 遭遇改成整關洗牌佇列（不重複抽）＋塔中塔頂各補四組雙人遭遇，擲骰順序又變，錨值重錄
    // 2026-09-02 晚：起始血 70→76、師父第二階段段數 7→6／4→3，錨值重錄；再晚：敵方回合召喚的不再多發呆一回合，再重錄
    // 2026-09-02 第二波怪（12 隻新怪、18 組新遭遇、4 個新關主進池）：抽到的怪與擲骰順序全變，錨值重錄
    // 2026-09-03 菁英擴充（9 隻新菁英、9 組新遭遇；第一關開放大魔物節點）：
    // 第一關的地圖多了大魔物節點，路線與遭遇的擲骰順序整個位移，錨值重錄一次
    // 2026-09-03 晚地圖優化（每層至少兩格、分岔要有非戰鬥、大魔物避得開、不連四戰）：路線與擲骰順序又變，錨值重錄
    // 2026-09-03 晚：罐頭鋪改依關數配稀有度＋絕學低機率、同生共死躺兩回合且爬起來那拍不出手：擲骰與戰局變了，錨值重錄
    // 2026-09-04 凌晨：稀有保底改隨機格（多吃一次洗牌擲骰），錨值重錄
    // 2026-09-04 夜：關主前綴多吃一次擲骰、魔氣暴走、事件後集，錨值重錄
    // 2026-09-04 早：第一關獎勵也有一成升級牌（多吃一次擲骰），錨值重錄
    // 2026-09-04 早：地圖怪物冷卻（相鄰兩層不重複）改了抽法，錨值重錄
    // 2026-09-04：隱身改成蜷縮先擋（無上限）、殘影與幻影分身調整，錨值重錄
    // 2026-09-11 一批改動（忍具 20→27 支、事件 35→38 個、迴旋踢升級版改單段）：
    // 忍具池、事件池、牌效果三者都動了，罐頭鋪進貨與各種擲骰全部位移，錨值重錄
    // 2026-09-11 第二批（忍具 27→32 支，五支對敵）：忍具池變大＝抽到的忍具不同＝戰局不同，錨值重錄
    expect(playRun('bal-369')).toEqual({ seed: 'bal-369', won: false, floor: 15, turns: 45, kills: 8, deckSize: 22 });
    expect(playRun('bal-453')).toEqual({ seed: 'bal-453', won: false, floor: 13, turns: 33, kills: 3, deckSize: 13 });
  });

  /**
   * **一條不會因為加內容而位移的錨**（2026-09-11）。
   *
   * 上面那兩條每加一批東西就得重錄——十幾次了，看檔頭那串註解就知道。
   * 重錄本身沒錯（池子變大，抽到的東西就是不一樣），但重錄完那兩條對「這批有沒有做歪」
   * 等於零資訊量：改壞了也只要把數字換成新的實際輸出就會變綠（稽核 2026-09-11 點名過）。
   *
   * 這一條**不碰地圖、不碰獎勵、不碰忍具池**：固定一場遭遇、固定一副牌、身上不帶忍具與秘寶，
   * 直接跑 `playCombat`。它只在「戰鬥引擎本身的行為變了」時才會紅——
   * 加一百支忍具、加一千個事件都動不到它。
   */
  it('固定戰鬥的錨：不吃地圖、獎勵、忍具池，加內容也不會位移', () => {
    const cs = startCombat({
      hp: 80, maxHp: 80, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)),
      relics: [], potions: [], encounterId: 'rats3', rng: new Rng(seedFromString('anchor-fixed')),
    });
    playCombat(cs, new Rng(seedFromString('anchor-fixed-bot')), 60, 'anchor-fixed');
    expect({ phase: cs.phase, turn: cs.turn, hp: cs.player.hp, kills: cs.kills })
      .toEqual({ phase: 'won', turn: 10, hp: 54, kills: 3 });
  });
});
