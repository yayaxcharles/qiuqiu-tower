import type { Pool, Rarity, RunEffect } from '../engine/types';

/**
 * 開局祝福：大俠貓留下的包袱（2026-09-23 內容擴充第三批 新A，設計稿 design3 第二節）。
 *
 * 序章播完、走第一格之前，包袱裡摸得到四樣：安全、換牌、代價、賭運氣四類各抽一種（`engine/blessing.ts` 的 `rollBlessings`），
 * 點一張就生效。這裡只放**規則**（代號、類別、圖示、效果）；名稱、卡面說明、四隻的台詞放延後載入的 `blessing-text.ts`，
 * 首載不背那些字（設計稿 2-1「首載」）。
 *
 * 效果照 `applyRunEffects` 的規矩寫，要玩家自己挑的（移除、升級、換牌、三選一）與兩種只有這裡用的（交出起始秘寶、擲骰）
 * 另外寫成欄位，由 `engine/blessing.ts` 處理——**沒有加新的 `RunEffect` 種類**：事件畫面認得的挑牌只有移除與升級，
 * 多一種挑牌它會當成移除（`event.ts` 的 `settle`），而這幾種今天只有祝福在用。
 */
export type BlessClass = '安全' | '換牌' | '代價' | '賭運氣';
/** 類別的順序＝卡片排的順序（設計稿 2-1：照 安全→換牌→代價→賭運氣 排） */
export const BLESS_CLASSES: readonly BlessClass[] = ['安全', '換牌', '代價', '賭運氣'];

export type BlessPickKind = 'remove' | 'upgrade' | 'transform';
export interface BlessingDef {
  id: string;
  cls: BlessClass;
  /** 物品圖示（`icons` 分類的鍵；舊護腕直接用那件秘寶的圖示） */
  art: string;
  /** 點下去就套的效果（不用挑的那幾種） */
  effects: RunEffect[];
  /**
   * 要自己挑的：`remove`／`upgrade`／`transform` 是從牌組挑 n 張（`upTo`＝可以少挑，寫「至多」的那種）；
   * `choose` 是從 n 張指定稀有度的牌裡選一張（一疊招式圖）。挑好了才一起送出（連線一個動作就結案，見 `engine/blessing.ts`）
   */
  pick?: { kind: BlessPickKind; n: number; upTo?: true } | { kind: 'choose'; n: number; pool: Pool; rarity: Rarity; upgraded?: true };
  /** 交出自己的起始秘寶（空的寶盒，新E）。照 `loseRelicId` 還原最大生命與忍具格 */
  loseStarter?: true;
  /** 擲一顆骰子（一顆骰子，新F）：擲出的點數 ≤ `max` 的第一格生效 */
  dice?: { max: number; effects: RunEffect[] }[];
  /**
   * 要有這件秘寶才放進包袱。舊護腕 `master_bracer` 是第七節的新秘寶（稀有事件那條線 b3rare 做），
   * 那件還沒進池子時這一張不發——發了只會變成「已經有了，改拿小魚乾」，圖文對不上。進池之後自動放行。
   */
  needsRelic?: string;
}

/**
 * 十六種，每類四種（設計稿 2-2）。估值、量尺見 `engine/blessing.ts` 與 `docs/祝福量尺.md`。
 * **改了數字要重跑祝福量尺**（`RULER=bless npx vitest run tools/relic_ruler.test.ts`），卡面說明在 `blessing-text.ts`（`blessing.test.ts` 對數字）。
 *
 * 2026-09-23 第一輪量尺（四隻各 600 局、開局強制拿）之後調的七處（設計稿原值 → 現值，理由：同類最強與最弱差超過 2 層）：
 * 乾糧袋 +8→+6（安全類裡一枝獨秀）、護身符 3 場→5 場（量不出效果）、舊剪刀移除 2→3 張、一疊招式圖選到的改成升級版（兩張都量不出效果）、
 * 包得很緊的寶貝「失手了」1→2 張（代價太輕，是代價類最強）、私房錢 150 條／−8→200 條／−6（量出來是虧的）、
 * 舊護腕多一條生命上限 −5（那件秘寶本身比同類強一截）。量尺數字見 `docs/祝福量尺.md`。
 *
 * **2026-09-24 b3int 主控裁決：整體減半**。第三批合完後機器人開局挑祝福一項就多爬 2～3 層，整局比「內容擴充前的遊戲＋現在的機器人」
 * 簡單 1.4～2.9 層；各類同比例收（每一樣照量尺目標收到原本約一半，四類之間的差距與「賭運氣期望值不高於安全類」照舊）。
 * 原值：乾糧袋 +6、零錢袋 90、舊忍具袋 3 個、護身符 5 場 2 層、舊剪刀 3 張、練功筆記 2 張、一疊招式圖稀有、塗鴉本 2 張、
 * 包得很緊的寶貝塔主秘寶＋2 張壞毛病、私房錢 200／−6、空的寶盒塔主秘寶、舊護腕 −5、包袱最底下大魔物秘寶、骰子 50 條／常見／大魔物、藥酒 +15／−5。
 * 量尺四類平均：安全 +1.22→+0.70、換牌 +1.54→+1.07、代價 +1.93→+0.61、賭運氣 +1.30→+0.55（賭運氣照舊不高於安全）。
 * 代價類收得比一半多：空的寶盒、舊護腕只對球球划算（交出的起始秘寶弱、那件護腕合他），收一半時球球整局還比基準高快兩層，
 * 這兩樣多收一點，另外三隻本來就不選它們、不受影響。練功筆記只剩升級 1 張仍是換牌類最強（+2.1，量尺上升一張就吃到大半的好處）。
 */
export const BLESSINGS: readonly BlessingDef[] = [
  // ===== 安全：穩穩拿一樣 =====
  { id: 'bless_rations', cls: '安全', art: 'codex/bless_rations', effects: [{ kind: 'maxHp', n: 3 }] },
  { id: 'bless_coins', cls: '安全', art: 'codex/bless_coins', effects: [{ kind: 'fish', n: 45 }] },
  { id: 'bless_potions', cls: '安全', art: 'codex/bless_potions', effects: [{ kind: 'potions', n: 2 }] },
  { id: 'bless_charm', cls: '安全', art: 'codex/bless_charm',
    effects: [{ kind: 'nextFight', fights: 5, note: '的護身符閃了一下紅光，魔物們都翻了肚', effects: [{ kind: 'status', name: '翻肚', amount: 1, target: 'all' }] }] },
  // ===== 換牌：改自己的牌組 =====
  { id: 'bless_scissors', cls: '換牌', art: 'codex/bless_scissors', effects: [], pick: { kind: 'remove', n: 2 } },
  { id: 'bless_notes', cls: '換牌', art: 'codex/bless_notes', effects: [], pick: { kind: 'upgrade', n: 1, upTo: true } },
  { id: 'bless_moves', cls: '換牌', art: 'codex/bless_moves', effects: [], pick: { kind: 'choose', n: 3, pool: '忍術', rarity: '罕見' } },
  { id: 'bless_doodle', cls: '換牌', art: 'codex/bless_doodle', effects: [], pick: { kind: 'transform', n: 1 } },
  // ===== 代價：好東西，但要付一樣 =====
  { id: 'bless_treasure', cls: '代價', art: 'codex/bless_treasure',
    effects: [{ kind: 'relic', pool: '常見' }, { kind: 'addCard', cardId: 'shishou' }] },
  { id: 'bless_stash', cls: '代價', art: 'codex/bless_stash', effects: [{ kind: 'fish', n: 120 }, { kind: 'maxHp', n: -3 }] },
  { id: 'bless_box', cls: '代價', art: 'codex/bless_box', effects: [{ kind: 'relic', pool: '大魔物' }], loseStarter: true },
  { id: 'bless_bracer', cls: '代價', art: 'codex/relic_master_bracer',
    effects: [{ kind: 'relicId', id: 'master_bracer', fallbackFish: 60 }, { kind: 'maxHp', n: -8 }], needsRelic: 'master_bracer' },
  // ===== 賭運氣：卡面寫明機率 =====
  // 包袱最底下 2026-09-24 b3int：合併後量到賭運氣同類差 2.28 層（超過設計稿的 2 層），六成 → 五成
  { id: 'bless_bottom', cls: '賭運氣', art: 'codex/bless_bottom',
    effects: [{ kind: 'gamble', p: 0.5, win: [{ kind: 'relic', pool: '常見' }], lose: [{ kind: 'addCard', cardId: 'zhongji' }] }] },
  { id: 'bless_dice', cls: '賭運氣', art: 'codex/bless_dice', effects: [], dice: [
    { max: 2, effects: [{ kind: 'damage', n: 10 }, { kind: 'fish', n: 25 }] },
    { max: 4, effects: [{ kind: 'fish', n: 50 }] },
    { max: 6, effects: [{ kind: 'relic', pool: '常見' }] },
  ] },
  { id: 'bless_scroll', cls: '賭運氣', art: 'codex/bless_scroll', effects: [{ kind: 'addRandomCard', pool: '忍術', rarity: '稀有' }] },
  { id: 'bless_wine', cls: '賭運氣', art: 'codex/bless_wine',
    effects: [{ kind: 'gamble', p: 0.5, win: [{ kind: 'maxHp', n: 8 }], lose: [{ kind: 'maxHp', n: -3 }] }] },
];

export const blessingById: Readonly<Record<string, BlessingDef>> = Object.fromEntries(BLESSINGS.map((b) => [b.id, b]));
