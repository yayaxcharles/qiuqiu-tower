import type { StatusName } from '../engine/types';

/**
 * 每個狀態是好是壞（2026-09-23 health H-8）。**戰鬥畫面的三份清單都從這一張產生**：
 * 狀態列的排列順序（`STATUS_ORDER`）、加了好狀態放金光的 `GOOD_STATUS`、被丟壞狀態放紫光的 `BAD_STATUS`。
 *
 * 為什麼收成一張：原本 `combat.ts` 手寫三份陣列（`STATUS_ORDER` 一字不差等於另外兩份接起來），
 * 只有圖示表 `STATUS_ICON` 是 `Record<StatusName, …>`。加新狀態時補了圖示、忘了補陣列，
 * 那個狀態掛在身上**畫面永遠不顯示**、也不算好壞光，而且不報錯。這張的鍵是 `StatusName`，漏一格 tsc 當場擋。
 *
 * 好壞是**站在掛著這個狀態的那一隻的立場**看：縮殼、飛行、鱗甲、虛化對魔物是好事（金光），
 * 沉睡、消散對牠是壞事（紫光）。球球身上永遠不會有這六個。
 *
 * **這張的順序就是狀態列的順序**：好的排前面，才不會每次重畫就換位置。
 * 字串鍵的物件照寫入順序列舉（語言規格保證），`tests/ui/status_kind_0923.test.ts` 另外把順序釘死。
 */
const STATUS_KIND: Readonly<Record<StatusName, 'good' | 'bad'>> = {
  爪力: 'good', 貓步: 'good', 隱身: 'good', 潛水: 'good', 鐵布衫: 'good', 反彈: 'good', 不壞身: 'good',
  縮殼: 'good', 飛行: 'good', 鱗甲: 'good', 虛化: 'good',
  定身: 'bad', 沉睡: 'bad', 消散: 'bad', 翻肚: 'bad', 懶洋洋: 'bad', 炸毛: 'bad', 中毒: 'bad',
  迷魂: 'bad',   // 2026-09-23 第二批迷魂香：只掛在魔物身上，對牠是壞事（紫光）
};

const ALL = Object.keys(STATUS_KIND) as StatusName[];
export const GOOD_STATUS: readonly StatusName[] = ALL.filter((n) => STATUS_KIND[n] === 'good');
export const BAD_STATUS: readonly StatusName[] = ALL.filter((n) => STATUS_KIND[n] === 'bad');
/** 狀態列的排列順序：好的排前面（物件鍵的順序由上面那張決定，測試釘著） */
export const STATUS_ORDER: readonly StatusName[] = [...GOOD_STATUS, ...BAD_STATUS];

/** 狀態 → 圖示鍵（戰鬥畫面的狀態列畫它；開局預載第一步魔物會上的那幾顆也查這張，`netload-run.ts`） */
export const STATUS_ICON: Record<StatusName, string> = {
  爪力: 'icon/status_claw', 貓步: 'icon/status_step', 翻肚: 'icon/status_belly',
  懶洋洋: 'icon/status_lazy', 炸毛: 'icon/status_puff', 中毒: 'icon/status_choke',
  隱身: 'icon/status_stealth', 定身: 'icon/status_stun', 反彈: 'icon/status_thorns',
  潛水: 'icon/status_stealth',
  鐵布衫: 'icon/status_iron',   // 不借鱗甲的鍵，免得兩邊撞到
  // 第二波魔物的五個狀態（2026-09-10 圖示補齊）
  縮殼: 'icon/status_curl', 飛行: 'icon/status_fly', 鱗甲: 'icon/status_plate', 不壞身: 'icon/status_iron_body',
  沉睡: 'icon/status_sleep', 消散: 'icon/status_fade',
  // 菁英擴充的虛化（2026-09-03；圖示 2026-09-10 補上）。
  // 虛化的意思就是「半透明」，但圖示不能真的畫半透明——綠幕會從身體裡透出來、去背後整張帶綠
  //（codex_gen.py 的坑 5）。改用「實心淡色本體＋錯位殘影」表達。
  虛化: 'icon/status_phase',
  // 迷魂（2026-09-23 第二批）：沒有另畫狀態圖示，借迷魂香那支忍具的圖（同一個 icons 分類，戰鬥中一定載好了）
  迷魂: 'codex/potion_daze_incense',
};
