/**
 * 待機時的狀態立繪 → 新版逐格動作（四隻貓共用這一張表）。
 *
 * 鍵＝戰鬥畫面 `restMotionAction` 傳進來的欄位名（對應 `combat.ts` 的 `POSE`），值＝動作名。
 * 2026-09-21 補齊：掛彩（hurt 立繪 → `wounded` 動作，因為 `hurt` 動作已經是「挨打那一下」的反應）、
 * 氣勢、肚子餓、定身、懶洋洋、鐵布衫、蜷縮，同伴另外補翻肚、隱身、炸毛。原本這些狀態沒有逐格圖，
 * 動作畫布一收就退回舊版靜態立繪，同一場戰鬥畫風跳來跳去。
 */
export const REST_STATE_ACTIONS = {
  poison: 'poison', belly: 'belly', puff: 'puff', stealth: 'stealth',
  hurt: 'wounded', power: 'power', hungry: 'hungry', dizzy: 'dizzy', lazy: 'lazy', iron: 'iron', curl: 'curl',
} as const;
export type RestStatePose = keyof typeof REST_STATE_ACTIONS;

/** 2026-09-21 新補的待機狀態動作：不解碼預載，預載完才在背景下載、畫到才解碼（見 frame-motion 的 `deferred`）。 */
export const DEFERRED_REST_ACTIONS: ReadonlySet<string> = new Set(['wounded', 'power', 'hungry', 'dizzy', 'lazy', 'iron', 'curl']);
/** 同伴另外新補了翻肚、隱身、炸毛（球球這三種原本就有、原本就預載，不改）。 */
export const DEFERRED_COMPANION_REST_ACTIONS: ReadonlySet<string> = new Set([...DEFERRED_REST_ACTIONS, 'belly', 'stealth', 'puff']);
export type RestStateAction = (typeof REST_STATE_ACTIONS)[RestStatePose];
export type RestStatePoses = Readonly<{ idle: string } & Partial<Record<RestStatePose, string>>>;

/**
 * 顯示中的立繪是哪一種待機狀態，就回傳對應的動作名；`has` 說這個角色的這個動作素材在不在。
 * 素材不在（或這個狀態沒傳進來）就回傳 undefined，交還既有立繪——
 * 不能退成一般站姿，那樣狀態外觀會整個消失，玩家看不出自己身上掛著什麼。
 */
export function restStateAction(
  displayedPose: string,
  poses: RestStatePoses,
  has: (action: RestStateAction) => boolean,
): RestStateAction | 'idle' | undefined {
  for (const [pose, action] of Object.entries(REST_STATE_ACTIONS) as [RestStatePose, RestStateAction][]) {
    const key = poses[pose];
    if (key !== undefined && displayedPose === key && has(action)) return action;
  }
  return displayedPose === poses.idle ? 'idle' : undefined;
}
