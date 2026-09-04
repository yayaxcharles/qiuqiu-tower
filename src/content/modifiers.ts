import { addStatus, getStatus } from '../engine/statuses';
import type { EnemyCombat } from '../engine/types';

/**
 * 遭遇修飾詞（使用者 2026-09-04 拍板）。
 *
 * 跟關主前綴（`BOSS_PREFIXES`）是兩套：那套只給關主、開戰才揭曉；這套給一般怪與菁英，
 * **地圖生成時就抽好標在節點上**，所以玩家看得到、可以照著選路——「這條路有隻中了魔氣的，
 * 我血夠不夠？」「那邊有隻肥美的，繞過去賺一筆」。看不到的話它就只是隨機事件，沒有決策價值。
 *
 * 設計原則是**有得有失**，不是純加強：通關率本來就已經偏低（0.2～0.8%，目標 2%），
 * 再往同一個方向踩一腳只會更糟。所以七個裡面有三個對玩家是好事（打瞌睡、肥美、餓扁了），
 * 目的是讓每一場不一樣，不是把難度往上推。
 *
 * 整場的**每一隻**魔物都吃一次 `apply`；獎勵類的（`fishMul`、`extraCard`）是整場算一次。
 */
export interface EncounterModifier {
  id: string;
  /** 顯示的名字，一律以「的」結尾，才接得上怪名（「暴怒的老鼠群」） */
  label: string;
  /** 地圖上滑鼠移過去看到的說明：一句話把得與失都講完 */
  desc: string;
  /** 這一場的每一隻魔物都套一次 */
  apply: (e: EnemyCombat) => void;
  /** 打贏拿到的小魚乾倍率（沒寫＝照常） */
  fishMul?: number;
  /** 打贏多挑一次牌 */
  extraCard?: boolean;
}

/**
 * 改最大生命並補到滿。開戰時魔物都是滿血，所以直接跟著改 hp（跟 BOSS_PREFIXES 同一套做法）。
 *
 * 已知偏移（稽核 2026-09-04 夜 L-5，刻意不修）：石獅子與三花貓武僧的階段是按**絕對血量**切的
 * （`EnemyPhase.hpBelow`），縮放最大生命會讓那個門檻的相對位置移動 ±15 個百分點。
 * 不跟著縮是因為 `hpBelow` 掛在共用的 `EnemyDef` 上，改它會污染同一場的其他個體。
 * 影響只是換階段早一點或晚一點，不會 0 血也不會跳過階段。
 */
function scaleHp(e: EnemyCombat, mul: number): void {
  e.maxHp = Math.round(e.maxHp * mul);
  e.hp = e.maxHp;
}

export const ENCOUNTER_MODIFIERS: EncounterModifier[] = [
  { id: 'furious', label: '暴怒的', desc: '爪力 +2，但生命只剩九成',
    apply: (e) => { addStatus(e, '爪力', 2); scaleHp(e, 0.9); } },
  // 鐵羅漢帶「不壞身」＝防禦不歸零，給牠防禦或鱗甲會從「有得有失」反轉成純加強
  // （8 點變永久護盾、鱗甲跟不壞身相加變每回合長 18 點）。稽核 2026-09-04 夜 L-3
  { id: 'weary', label: '疲憊的', desc: '生命 −15%，但開場先架好 8 點防禦',
    apply: (e) => { scaleHp(e, 0.85); if (getStatus(e, '不壞身') === 0) e.block += 8; } },
  { id: 'plated', label: '披甲的', desc: '鱗甲 2（每回合長出防禦），生命 −5%',
    apply: (e) => { if (getStatus(e, '不壞身') === 0) addStatus(e, '鱗甲', 2); scaleHp(e, 0.95); } },
  // 本來就睡著的（冬眠熊）或正在消散倒數的，再加定身等於白送五回合／直接把牠拖到消失。稽核同上 L-4
  { id: 'dozing', label: '打瞌睡的', desc: '前兩回合睡著、打不出攻擊，但生命多兩成',
    apply: (e) => { if (getStatus(e, '沉睡') === 0 && getStatus(e, '消散') === 0) addStatus(e, '定身', 2); scaleHp(e, 1.2); } },
  { id: 'plump', label: '肥美的', desc: '生命 +25%，但打贏的小魚乾加倍', fishMul: 2,
    apply: (e) => { scaleHp(e, 1.25); } },
  { id: 'starved', label: '餓扁了的', desc: '生命 −25%，但身上沒油水，小魚乾只有一半', fishMul: 0.5,
    apply: (e) => { scaleHp(e, 0.75); } },
  { id: 'miasmic', label: '中了魔氣的', desc: '爪力 +3，但打贏可以多挑一次牌', extraCard: true,
    apply: (e) => { addStatus(e, '爪力', 3); } },
];

export const modifierById: Record<string, EncounterModifier> =
  Object.fromEntries(ENCOUNTER_MODIFIERS.map((m) => [m.id, m]));

/**
 * 這一層抽到修飾詞的機率。第一關低是刻意的——前十五層是學遊戲的時候，
 * 版面越乾淨越好；一整關大概只會碰到一次，當作見面禮。越往上越不安定。
 */
export function modifierChanceFor(act: number): number {
  return act >= 3 ? 0.3 : act === 2 ? 0.25 : 0.15;
}
