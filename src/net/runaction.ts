import { buyCard, buyPotion, buyRelic, buyRemove, notMyCard, priceFor, potionCapacity, removePrice, replacePotion, reshuffleShop, rest, revivePartner, RESHUFFLE_COST, shopClosed, takeRelic, type ShopStock } from '../engine/run';
import type { RunState } from '../engine/types';
import { canTakeBlessing, takeBlessing, type BlessPick } from '../engine/blessing';

/**
 * 戰鬥**以外**的動作——商店、打盹、紙箱那些（連線版 2026-09-11）。
 *
 * 為什麼也要編號排序，明明不是在打架：因為那些地方一樣有**共用的東西**。
 * 罐頭鋪的貨架雖然每人一份（各逛各的），買賣還是動到錢與牌組；重整貨架會動到整局的亂數，
 * 兩邊跑的次數與順序不一樣，之後所有的地圖、戰利品、商店全部位移。
 * 跟戰鬥同一套答案：主機發號碼，兩邊照號碼套用（見 `lockstep.ts`）。
 *
 * 跟 `CoopAction` 分開成兩條通道，是因為它們**套用的對象不同**（一個是這一場戰鬥、
 * 一個是整局）。混在一條的話，每個處理的地方都要先問一次「現在是哪一種」，
 * 而戰鬥中途收到商店動作那種錯，混在一起就看不出來了。
 */
export type RunAction =
  /** 買東西。`k`＝哪一區、`i`＝第幾格、`r`＝忍具帶滿時要換掉第幾支 */
  | { t: 'buy'; seat: number; k: 'card' | 'relic' | 'potion'; i: number; r?: number }
  /** 花錢移除一張自己的牌 */
  | { t: 'scrub'; seat: number; u: number }
  /** 重整貨架（每店一次，動到整局亂數，所以一定要排序） */
  | { t: 'shuffle'; seat: number }
  /** 打盹點：`c`＝選了哪一種、`u`＝要升級哪一張 */
  | { t: 'rest'; seat: number; c: '打盹' | '磨爪' | '全力準備'; u?: number }
  /** 打盹點扶起倒下的同伴。`w`＝扶誰 */
  | { t: 'revive'; seat: number; w: number }
  /** 收下一件秘寶（紙箱、大魔物戰利品：兩件裡挑完之後由結算送出） */
  | { t: 'relic'; seat: number; id: string }
  /** 忍具帶滿時換掉第 `i` 支 */
  | { t: 'swap'; seat: number; i: number; id: string }
  /**
   * 開局祝福選第 `i` 樣（2026-09-23 第三批 新A）。要挑牌的那幾樣挑好了才一起送（`u`＝牌號、`c`＝三選一那張），
   * 一個動作就結案：效果用這一位自己的分支亂數，兩人誰先繞回來都一樣（見 `engine/blessing.ts`）
   */
  | { t: 'bless'; seat: number; i: number; u?: number[]; c?: string }
  /**
   * 我這一格弄完了，可以上樓。
   *
   * **不是「我按了離開」而是「我這邊結束了」**：兩個人都送出這個才真的離開，
   * 不然先按的那位會把還在逛商店的人一起拖走。
   */
  | { t: 'done'; seat: number };

/**
 * 套用的對象。`shops` 只有在罐頭鋪那一格才有——**用可選欄位而不是另開一條通道**，
 * 是因為「在沒有商店的地方收到買東西的動作」本身就是要抓的錯（代表兩邊的畫面對不上），
 * 有欄位才問得出這句話。每個座位一份貨架（各逛各的，使用者 2026-09-15），動作只動自己那份。
 */
export interface RunCtx { run: RunState; shops?: ShopStock[] | undefined }
/** 祝福動作裡挑的那一步（沒有的欄位不帶，送出去的字串才短） */
function blessPickOf(a: { u?: number[]; c?: string }): BlessPick {
  return { ...(a.u ? { u: a.u } : {}), ...(a.c !== undefined ? { c: a.c } : {}) };
}
const shopOf = (ctx: RunCtx, seat: number): ShopStock | undefined => ctx.shops?.[seat];

/** 這個動作現在做得出來嗎。判準一律問引擎，這裡不另外寫一套規則 */
export function canApplyRun(ctx: RunCtx, a: RunAction): boolean {
  const { run } = ctx;
  const shop = shopOf(ctx, a.seat);
  const p = run.players[a.seat];
  if (!p) return false;
  switch (a.t) {
    case 'done': return true;                      // 隨時可以說「我好了」（包含倒下的人）
    case 'revive': return !!run.players[a.w]?.down && !p.down;
    case 'relic': return !p.down && !p.relics.includes(a.id);
    case 'swap': return !p.down && a.i >= 0 && a.i < p.potions.length;
    case 'bless': return canTakeBlessing(run, a.seat, a.i, blessPickOf(a));
  }
  if (p.down) return false;                        // 倒下的人不逛街也不打盹
  switch (a.t) {
    case 'buy': {
      if (!shop) return false;
      if (shopClosed(shop)) return false;   // 行腳商收攤了（只做一筆生意，2026-09-23 第三批）：不擋的話會發號碼、套用失敗、整場斷線
      const it = a.k === 'card' ? shop.cards[a.i] : a.k === 'relic' ? shop.relics[a.i] : shop.potions[a.i];
      if (!it || it.sold || p.fish < priceFor(run, it, a.seat, shop)) return false;   // 帶貨架：批發箱、帳本的折扣要算進去（2026-09-23 第二批）
      if (a.k === 'relic') return !p.relics.includes((it as { id: string }).id);
      // 別人的專屬招式買不下去（貨架照自己的角色抽、不會擺上來；`buyCard` 擋著，這裡不先擋的話會發號碼、套用失敗、整場斷線）
      if (a.k === 'card' && notMyCard(run, shop.cards[a.i]!.def, a.seat)) return false;
      // 忍具帶滿一定要指定換掉哪一支，不然錢會扣了東西沒進背包
      if (a.k === 'potion' && p.potions.length >= potionCapacity(run, a.seat)) {
        return a.r !== undefined && a.r >= 0 && a.r < p.potions.length;
      }
      return true;
    }
    case 'scrub': return !!shop && !shop.merchant && p.deck.some((c) => c.uid === a.u) && p.fish >= removePrice(run, a.seat);   // 會員卡的固定價（2026-09-23 第二批）；行腳商沒有放生（第三批）
    /*
     * 條件要跟 `reshuffleShop` 自己的判斷**一模一樣**（2026-09-14 連線稽核 高-17）。
     * 原本只看「重整過了沒」：先買一張、動作還沒繞回來又按重整（畫面上錢還夠），
     * 或同伴剛好買走架上最後一件——主機照樣發號碼，兩台套用都失敗，整場斷線。
     * 做不出來的就該在這裡擋下、不發號碼（搶標那條路本來就是這樣設計的）。
     */
    case 'shuffle': return !!shop && !shop.merchant && !shop.reshuffled && p.fish >= RESHUFFLE_COST
      && [...shop.cards, ...shop.relics, ...shop.potions].some((it) => !it.sold);
    case 'rest': return a.c === '磨爪' || a.c === '全力準備' ? a.u !== undefined : true;
  }
}

/**
 * 把一個收到的整局動作套下去。**這是整局那一半進入引擎的唯一入口**
 *（跟戰鬥那半的 `applyAction` 同一個道理：兩邊跑的必須是同一段程式碼）。
 *
 * 回傳 false＝引擎拒絕了，代表兩邊已經對不上，呼叫端要當場停下來報錯。
 */
export function applyRunAction(ctx: RunCtx, a: RunAction): boolean {
  const { run } = ctx;
  const shop = shopOf(ctx, a.seat);
  switch (a.t) {
    case 'done': return true;   // 誰好了由畫面自己記（見各畫面的 `done` 處理）
    case 'revive': return revivePartner(run, a.w);
    case 'relic': return takeRelic(run, a.id, a.seat);
    case 'swap': return replacePotion(run, a.i, a.id, a.seat);
    case 'bless': return takeBlessing(run, a.seat, a.i, blessPickOf(a));
    case 'buy': {
      if (!shop) return false;
      if (a.k === 'card') return buyCard(run, shop, a.i, a.seat);
      if (a.k === 'relic') return buyRelic(run, shop, a.i, a.seat);
      return buyPotion(run, shop, a.i, a.r, a.seat);
    }
    case 'scrub': return !!shop && buyRemove(run, a.u, a.seat);
    case 'shuffle': return !!shop && reshuffleShop(run, shop, a.seat);
    case 'rest': return rest(run, a.c, a.u, a.seat);
  }
}
