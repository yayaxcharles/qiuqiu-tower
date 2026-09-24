import type { KeeperId } from '../engine/types';

/**
 * 罐頭鋪的四位店主（2026-09-23 內容擴充第三批 新J，design3 第四節；店長私藏的規則照主控裁決第 1 條）。
 *
 * 這四位是同一家罐頭鋪的合夥人、輪流顧店：橘貓老闆一半機率（常駐），另外三位客座各六分之一，
 * 一關裡同一位客座最多一間（`run.ts` 的 `assignKeepers`）。三位各對一種需求（忍具、秘寶、瘦牌組），
 * 沒有一位永遠最好：掌櫃秘寶多但貴、婆婆便宜但只有忍具、阿福只省放生。
 *
 * 這一份只放**引擎要的數字**與畫面要的幾個短字（名字、木牌、地圖說明、頭像框），開場就載；
 * 店主碎念、四隻對店主的台詞放 `shop-text.ts`（延後載入，進地圖才在背景抓）。
 * 橘貓老闆那一列就是改版前寫死在 `makeShop` 裡的數字，**一個都不能動**——沒有店主欄位的舊存檔、一半的店都走它。
 */
export interface KeeperDef {
  id: KeeperId;
  /** 對白框的名牌 */
  name: string;
  /** 招呼立繪的鍵；成交、錢不夠是 `<鍵>_happy`、`<鍵>_no`（照 `batch3_art_keys.md` 的命名，沒有就退回招呼那張） */
  art: string;
  /** 貨架上方的木牌（橘貓老闆沒有，維持原樣） */
  sign?: string;
  /** 地圖上滑到這一間時的說明（橘貓老闆那間不疊頭像、不掛說明，design3 4-4） */
  tip?: string;
  /** 牌幾格：第一關、第二關起 */
  cards: readonly [number, number];
  /** 常見池秘寶幾格 */
  common: number;
  /** 大魔物池秘寶幾格：第一關、第二關起（橘貓老闆的珍品架第二關起才有） */
  big: readonly [number, number];
  /** 店長私藏（罐頭鋪限定池）：`chance`＝一半的店（橘貓老闆）、`always`＝一定有（長毛掌櫃；抽乾了改一件大魔物）、`none`＝不擺 */
  limited: 'chance' | 'always' | 'none';
  /** 忍具幾格 */
  potions: number;
  /** 忍具的稀有度保底（婆婆：至少 1 支稀有、2 支罕見；重整貨架照樣保證） */
  potionFloor?: { 稀有: number; 罕見: number };
  /** 牌格一定有一張升級版（阿福）；沒寫＝照關數機率（`upgradeChanceFor`） */
  upgradedCard?: 'always';
  /** 各類倍率：只乘那一類（婆婆的忍具七五折、掌櫃的秘寶貴一成） */
  mul: { card: number; relic: number; potion: number };
  /** 放生價倍率（阿福半價，進位到 5 的倍數） */
  removeMul: number;
  /** 服務（一間一次、寫死的手續費，不吃任何折扣與加價，design3 4-3） */
  service?: { kind: 'purify' | 'swap'; cost: number; label: string };
  /**
   * 地圖小頭像從招呼立繪裁哪一塊（原圖 332×420 的座標、正方形邊長）：`x, y, 邊長`。
   * 2026-09-23 量過三位的招呼圖（`b3shop` 報告），框住臉與耳朵、不含身體；阿福的耳尖長毛頂到上緣。
   */
  head?: readonly [number, number, number];
}

export const KEEPERS: Readonly<Record<KeeperId, KeeperDef>> = {
  orange: {
    id: 'orange', name: '橘貓老闆', art: 'shop/keeper',
    cards: [5, 6], common: 2, big: [0, 1], limited: 'chance', potions: 3,
    mul: { card: 1, relic: 1, potion: 1 }, removeMul: 1,
  },
  tortoise: {
    id: 'tortoise', name: '玳瑁婆婆', art: 'shop/keeper_tortoise',
    sign: '忍具專賣・七五折', tip: '忍具專賣，忍具七五折；可以花錢請婆婆淨化沾了魔氣的秘寶',
    cards: [3, 3], common: 1, big: [0, 0], limited: 'none', potions: 6, potionFloor: { 稀有: 1, 罕見: 2 },
    mul: { card: 1, relic: 1, potion: 0.75 }, removeMul: 1,
    service: { kind: 'purify', cost: 90, label: '請婆婆淨化' },
    head: [86, 76, 156],
  },
  curio: {
    id: 'curio', name: '長毛掌櫃', art: 'shop/keeper_curio',
    sign: '秘寶專賣', tip: '秘寶專賣：秘寶多、一定有店長私藏，但貴一成',
    cards: [3, 3], common: 2, big: [1, 2], limited: 'always', potions: 1,
    mul: { card: 1, relic: 1.1, potion: 1 }, removeMul: 1,
    head: [68, 92, 156],
  },
  junk: {
    id: 'junk', name: '阿福', art: 'shop/keeper_junk',
    sign: '放生半價', tip: '舊貨攤：放生半價；可以花錢把一招換成新的',
    cards: [5, 6], common: 1, big: [0, 0], limited: 'none', potions: 2, upgradedCard: 'always',
    mul: { card: 1, relic: 1, potion: 1 }, removeMul: 0.5,
    service: { kind: 'swap', cost: 40, label: '舊招換新招' },
    head: [92, 18, 162],
  },
};

/** 三位客座店主（擲骰的順序就是這個順序，改了會換掉每一局的店主） */
export const GUEST_KEEPERS: readonly KeeperId[] = ['tortoise', 'curio', 'junk'];

/** 認得的店主代號（存檔驗證用：認不得的值丟掉、當橘貓老闆） */
export function isKeeperId(v: unknown): v is KeeperId {
  return typeof v === 'string' && Object.hasOwn(KEEPERS, v);
}
