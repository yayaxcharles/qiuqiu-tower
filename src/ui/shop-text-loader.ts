/**
 * 客座店主台詞（`content/shop-text.ts`）的延後載入（2026-09-23 內容擴充第三批 新J，design3 4-4）。
 *
 * 罐頭鋪畫面是首載的，三位店主六十幾句台詞不是：地圖上排到客座店主那一間時，地圖畫面就在背景叫一次（`screens/map.ts`），
 * 走進店門時多半早就到了。同一時間只抓一次；失敗了下一次叫會重來（不會永遠卡在上一次的失敗，同 `event-loader.ts` 的做法）。
 */
type ShopText = typeof import('../content/shop-text');

let loaded: ShopText | null = null;
let pending: Promise<ShopText> | null = null;
let importer: () => Promise<ShopText> = () => import('../content/shop-text');

export function loadShopText(): Promise<ShopText> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= importer().then((m) => { loaded = m; return m; }, (e: unknown) => { pending = null; throw e; });
  return pending;
}

/** 已經到了就給，還沒到回 null（畫面先只放名字與木牌，到了再補對白） */
export function shopTextNow(): ShopText | null { return loaded; }

/** 測試用 */
export function _setShopTextImporterForTest(fn: () => Promise<ShopText>): void {
  importer = fn;
  loaded = null;
  pending = null;
}
