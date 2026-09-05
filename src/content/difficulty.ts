/**
 * 難度 1～5（2026-09-02，使用者：「設計難度 1 到 5，難度 1 就是目前的設計，每多一級就加血量、精英或不良事件」）。
 * 照殺戮尖塔的「進階」制：效果**累積**，通關某一級才解鎖下一級（解鎖存在瀏覽器裡，見 save.ts）。
 * 每一級只動一組旋鈕，玩家一眼看得出這級多了什麼；數字全部在這張表，調難度改這裡就好。
 */
export const MAX_DIFFICULTY = 5;

export const DIFFICULTY_NAMES = ['見習', '出師', '高手', '宗師', '魔塔'] as const;

/** 每一級「新增」的懲罰（給標題畫面與說明用；實際數值由 difficultyMods 算） */
export const DIFFICULTY_TEXT = [
  '現在的設計，什麼都不加。',
  '大魔物節點多六成；所有魔物出場就帶 1 點爪力；地圖上開始出現遭遇修飾詞（肥美的、中了魔氣的……）。',
  '所有魔物血量再加一成五；過關只補回七成五的缺血。',
  '開局牌組多一張「中計了」；忍具只能帶兩支；罐頭鋪貴一成；壞事件更壞（賭輸機率提高、掉血代價乘 1.5）。',
  '最大生命 76 變 70；塔頂的大魔物再多 2 點魔氣；最終戰前先跟影球球打一場，中間不回血。',
] as const;

export interface DifficultyMods {
  /** 大魔物節點的權重倍率（>1 時同一層最多兩個，並在 11F 再保底一個；三關通用） */
  eliteMul: number;
  /** 所有魔物出場帶的爪力 */
  enemyStrength: number;
  /** 魔物血量倍率（乘在遭遇本身的 hpScale 上） */
  hpMul: number;
  /** 過關回血：1＝回滿；0.75＝補回缺血的七成五 */
  actHeal: number;
  /** 開局塞進牌組的壞毛病 */
  startCurse: string | null;
  potionSlots: number;
  /** 罐頭鋪價格倍率 */
  shopMul: number;
  /** 壞事件更壞：事件掉血乘 1.5、賭博成功率乘 0.7 */
  unlucky: boolean;
  maxHp: number;
  /** 塔頂大魔物額外魔氣 */
  topEliteStrength: number;
  /** 最終戰前先打一場影球球、不回血 */
  finalPrefight: boolean;
}

export function clampDifficulty(level: number): number {
  return Math.max(1, Math.min(MAX_DIFFICULTY, Math.round(Number.isFinite(level) ? level : 1)));
}

export function difficultyMods(level: number): DifficultyMods {
  const d = clampDifficulty(level);
  return {
    eliteMul: d >= 2 ? 1.6 : 1,
    enemyStrength: d >= 2 ? 1 : 0,
    hpMul: d >= 3 ? 1.15 : 1,
    actHeal: d >= 3 ? 0.75 : 1,
    startCurse: d >= 4 ? 'zhongji' : null,
    potionSlots: d >= 4 ? 2 : 3,
    shopMul: d >= 4 ? 1.1 : 1,
    unlucky: d >= 4,
    maxHp: d >= 5 ? 70 : 76,   // 2026-09-02 使用者：起始血 70→76（難度 5 同步 64→70，維持少 6）
    topEliteStrength: d >= 5 ? 2 : 0,
    finalPrefight: d >= 5,
  };
}

export function difficultyName(level: number): string {
  return DIFFICULTY_NAMES[clampDifficulty(level) - 1] ?? DIFFICULTY_NAMES[0];
}
