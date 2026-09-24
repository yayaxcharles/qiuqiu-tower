/**
 * 戰利品頁「忍具帶滿了，要不要換掉一支」問到哪一步（總稽核 2026-09-16 甲 高-1／中-1／中-2）。
 *
 * 記在戰利品物件上（`reward.ts` 的 `r.potionAsk`），因為連線時同伴每動一下整頁就重畫、區域變數會歸零：
 * - `undefined`：還沒問 → 排一次問話
 * - `'asking'`：視窗開著 → **不准再排**（原本每重畫一次就疊一個視窗）
 * - `'swapped'`／`'declined'`：答過了 → 照答案寫那一列，不再問
 *
 * 「換了」要在按下去的當下就記，不能等自己那則動作繞回來再推（客戶端要等主機編號，
 * 那段空檔一重畫就再問一次；上一格事件頁遲到的換忍具也會被誤認成這一頁的回答）。
 */
export type PotionAsk = 'asking' | 'swapped' | 'declined';

/** 這一次畫面要不要排問話 */
export function shouldAskPotion(ask: PotionAsk | undefined): boolean {
  return ask === undefined;
}

/** 收不下的那支忍具，那一列寫什麼 */
export function missedPotionLabel(ask: PotionAsk | undefined, name: string): string {
  if (ask === 'swapped') return `換成了「${name}」`;
  if (ask === 'declined') return `沒有換，放棄了「${name}」`;
  return `忍具帶滿了，「${name}」收不下`;
}
