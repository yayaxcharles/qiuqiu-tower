import type { MonsterPose } from './assets';

/** 選圖要看的那幾件事。`has` 是「這隻的這個姿勢生好了沒」（`hasMonsterPose`），沒生好就往下退 */
export interface PoseInput {
  /** 這一拍正在出手（`acting` 那張表裡的 `attacked`） */
  attacking: boolean;
  /** 這一拍掉血了 */
  hurt: boolean;
  dead: boolean;
  /** 當下身上的防禦點數 */
  block: number;
  /**
   * 這隻的防禦是**被動長出來的**（鱗甲、不壞身）而不是牠出招擋的。
   *
   * 這種的不畫防禦圖：鱗甲是牠自己回合結束長、防禦要到**牠下一個回合開始**才歸零，
   * 所以整個玩家回合牠身上永遠有防禦，一路蹲到被打死為止，那隻魔物的待機圖等於報廢
   *（稽核 2026-09-10 中-1，實測鎧甲金龜從第二回合起再也看不到待機）。不壞身更絕，防禦根本不歸零。
   */
  passiveBlock: boolean;
  has: (pose: MonsterPose) => boolean;
}

/**
 * 魔物這一拍該畫哪一張。順序是 **出招 → 挨打 → 防禦 → 待機**。
 * 「出招優先於挨打」這一點跟師父那套一致；師父自己還多兩層（倒下排最前、接著調息），
 * 走的是 `combat.ts` 裡另一條路，不共用這支。
 *
 * 為什麼出招排在挨打前面：魔物出招那一拍常常同時掉血（回合開頭的中毒結算、球球的反彈都在
 * 同一步扣血）。挨打圖若優先，中毒流打誰都是「挨打的表情往前撲」，招式圖全看不到
 * （稽核 2026-09-08 中 1）。
 *
 * 為什麼防禦看的是 `block > 0` 而不是「這一拍出的是防禦招」：縮殼是被打痛才觸發，
 * 不在出招那一步。看當下的防禦點數，才跟旁邊那個「防禦 14」的牌子對得起來——
 * 牌子掛幾回合，牠就縮著幾回合。**但被動長出來的防禦（鱗甲、不壞身）除外**，見 `passiveBlock`。
 *
 * **倒下就換成倒地圖**（趴平、眼睛變叉；2026-09-11 只有 16 隻大魔物與 10 隻塔主有這張）。
 * 沒生這張的（一般小怪）照舊回待機，倒下靠 `gone` 淡出——**一場打掉五六隻小怪，
 * 每一隻都演一次倒地會變成過場稅**（使用者的鐵則：拉長節奏的動畫一律不做）。
 * 大魔物與塔主一局只遇得到幾隻，那一下「打贏了」的實感換得起。
 *
 * **不多花任何時間**：`gone` 與 `boss-fall` 本來就要淡出，這裡只是把淡出的那張圖從
 * 「站得直挺挺的待機」換成「趴在地上」。重生中的殘影（`reviving`）也走這條——
 * 倒在那裡等著爬起來，比半透明的站姿更說得通。
 */
export function monsterPose(o: PoseInput): MonsterPose {
  if (o.attacking) return 'attack';
  if (o.dead) return o.has('down') ? 'down' : 'idle';
  if (o.hurt && o.has('hurt')) return 'hurt';
  if (o.block > 0 && !o.passiveBlock && o.has('block')) return 'block';
  return 'idle';
}
