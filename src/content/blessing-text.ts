import type { Hero } from '../engine/hero';
import type { BlessClass } from './blessings';
import { relicById } from './relics';

/**
 * 開局祝福的文字（2026-09-23 內容擴充第三批，設計稿 design3 2-2、2-4）。
 *
 * **只給延後載入的祝福畫面讀**（`ui/screens/blessing.ts`），首載不背這些字（設計稿 2-1「首載」；
 * `tests/ui/blessing_split.test.ts` 守著主程式的靜態匯入碰不到這一份）。規則（效果、類別）在 `blessings.ts`。
 *
 * 口吻（設計稿 1-2）：卡面是系統說明，用「你」、不指名角色、不加喵；台詞照角色——球球句尾帶「喵」，
 * 菲菲喊「師父」「師兄」、先道歉結巴，噹噹與封封喊「大俠貓」、不講喵（噹噹跟大俠貓不是師徒）。
 */

export const BLESS_NAMES: Readonly<Record<string, string>> = {
  bless_rations: '乾糧袋', bless_coins: '零錢袋', bless_potions: '舊忍具袋', bless_charm: '護身符',
  bless_scissors: '舊剪刀', bless_notes: '練功筆記', bless_moves: '一疊招式圖', bless_doodle: '塗鴉本',
  bless_treasure: '包得很緊的寶貝', bless_stash: '私房錢', bless_box: '空的寶盒', bless_bracer: '沾了魔氣的舊護腕',
  bless_bottom: '包袱最底下', bless_dice: '一顆骰子', bless_scroll: '沒貼標籤的卷軸', bless_wine: '一小瓶藥酒',
};

/**
 * 卡面說明。`{招式}`＝這一位的招式牌叫什麼：噹噹是「拳腳」、其餘照事件的講法寫「忍術」
 *（主控裁決第 10 條「噹噹的卡面照角色出兩種字」；跟 `event-text-b2.ts` 只換噹噹那兩處同一套）。
 */
const BLESS_CARD_TEXT: Readonly<Record<string, string>> = {
  bless_rations: '生命上限與當前生命各 +3。',
  bless_coins: '獲得 45 條小魚乾。',
  bless_potions: '隨機獲得 2 個忍具。',
  bless_charm: '接下來 5 場戰鬥開始時，給全體魔物 1 層翻肚。',
  bless_scissors: '自選移除 2 張牌。',
  bless_notes: '自選升級至多 1 張牌。',
  bless_moves: '從 3 張罕見{招式}牌中選擇 1 張。',
  bless_doodle: '自選 1 張牌，換成隨機 1 張你自己的罕見以上的{招式}牌（壞毛病換成常見的）。',
  bless_treasure: '隨機獲得 1 件常見秘寶；牌組加入 1 張壞毛病「失手了」。',
  bless_stash: '獲得 120 條小魚乾；生命上限 −3。',
  bless_box: '交出你的起始秘寶，換隨機 1 件大魔物秘寶。',
  // 秘寶的名字與說明照那件秘寶自己寫的（`{秘寶}`），那件是稀有事件那條線做的，數字改了這裡跟著變
  bless_bracer: '獲得秘寶「{秘寶}」：{秘寶說明}（沾了魔氣：可以淨化）生命上限 −8。',
  bless_bottom: '五成：隨機獲得 1 件常見秘寶；五成：牌組加入 1 張壞毛病「中計了」。',
  bless_dice: '擲一次：1～2 點，最多失去 10 點生命、獲得 25 條小魚乾；3～4 點，獲得 50 條小魚乾；5～6 點，隨機獲得 1 件常見秘寶。',
  bless_scroll: '隨機獲得 1 張稀有{招式}牌。',
  bless_wine: '五成：生命上限與當前生命各 +8；五成：生命上限 −3。',
};

export function blessCardText(id: string, hero: string | undefined): string {
  const relic = relicById['master_bracer'];
  return (BLESS_CARD_TEXT[id] ?? '').replace(/\{招式\}/g, hero === 'dangdang' ? '拳腳' : '忍術')
    .replace('{秘寶}', relic?.name ?? '沾了魔氣的舊護腕').replace('{秘寶說明}', relic?.text ?? '每場戰鬥開始時獲得 3 點爪力與 2 層翻肚。');
}

/** 開場：對白框裡旁白一段＋角色一句（設計稿 2-4） */
export const BLESS_OPENING: Readonly<Record<Hero, { narration: string; line: string }>> = {
  ninja: {
    narration: '塔門的門檻邊躺著一個藍布包袱，結打得又大又歪——是師父打的那種。師父衝上去的時候，大概連包袱掉了都沒發現。球球蹲下來解開結，裡面的東西擠成一團，爪子伸進去只摸得到四樣。',
    line: '師父的東西，我先借來用，見面再還你喵。',
  },
  feifei: {
    narration: '塔門的門檻邊躺著一個藍布包袱，被露水打濕了一角。那個歪歪的結，菲菲一眼就認出來——師父綁什麼都是這樣綁的。她把包袱抱到膝上，輕輕拆開。',
    line: '師父的……師兄一定是急著往上追，才沒看見吧。',
  },
  dangdang: {
    narration: '塔門口的石階上擱著一個藍布包袱。噹噹認得那個結：大俠貓每次來修理鋪取東西，都用這種結綁，拆的時候總要拆半天。他花了一會兒才解開。',
    line: '大俠貓的包袱。先借一樣，其他的替他收好。',
  },
  fengfeng: {
    narration: '門檻上的小魚乾旁邊，躺著一個藍布包袱。封封翻過來看，結是大俠貓打的，他送貨時收過好幾次這樣綁的包裹。',
    line: '大俠貓的貨。路上用得到的，先借一樣。',
  },
};

/** 選完的那一句（回到地圖的吐司），照選的那一類 */
const TAKE_LINE: Readonly<Record<Hero, Readonly<Record<BlessClass, string>>>> = {
  ninja: { 安全: '先拿實在的，路還很長喵。', 換牌: '師父說招式不用多，要練熟喵。', 代價: '好東西都有代價，師父說的喵。', 賭運氣: '閉著眼睛拿，拿到什麼都算我的喵！' },
  feifei: { 安全: '這個……師父應該不會生氣吧。', 換牌: '師父以前也這樣教我……先把手上的練好。', 代價: '會、會痛也沒關係……我要變強。', 賭運氣: '不、不要是奇怪的東西……' },
  dangdang: { 安全: '這個用得上。', 換牌: '工具不用多，要順手。', 代價: '代價我看清楚了。拿。', 賭運氣: '看不到裡面，就摸摸看。' },
  fengfeng: { 安全: '走遠路，帶這個最穩。', 換牌: '行李輕一點，路才走得快。', 代價: '這筆帳，我記下了。', 賭運氣: '沒得挑的貨，也得收。' },
};

/** 有自己那一句的兩樣（蓋過上面那一類的句子） */
const SPECIAL_LINE: Readonly<Record<string, Readonly<Record<Hero, string>>>> = {
  bless_box: {
    ninja: '先寄放在師父這裡，見面再拿回來喵。',
    feifei: '毒針袋……先放在這裡。師父，您幫我顧著。',
    dangdang: '換。我自己的東西，回去還能再打一對。',
    fengfeng: '劍穗先押在這裡。回來再取。',
  },
  bless_bracer: {
    ninja: '師父的護腕……上面的紫氣好冰喵。我一定會把它洗乾淨喵。',
    feifei: '這是師父的……摸起來好冷。我、我會想辦法把它弄乾淨。',
    dangdang: '大俠貓的護腕。沾了魔氣，還能用。回頭我把它清乾淨。',
    fengfeng: '沾了魔氣的貨。我先帶著，路上找地方洗。',
  },
};

export function blessTakeLine(id: string, cls: BlessClass, hero: string | undefined): string {
  const h = (hero ?? 'ninja') as Hero;
  return SPECIAL_LINE[id]?.[h] ?? TAKE_LINE[h]?.[cls] ?? '';
}

/** 連線提示（系統口吻）：`{同伴}` 換成同伴的名字、`{名稱}` 換成那一樣的名字 */
export const BLESS_COOP_TOOK = '{同伴}從包袱裡拿了「{名稱}」。';
export const BLESS_COOP_WAIT = '等{同伴}挑……';
