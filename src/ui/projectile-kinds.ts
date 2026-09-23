import { isFeifeiNeedleAction } from './feifei-needle-patterns';
import { companionThrowRelease } from './companion-motion';
import type { CombatMotionAction, CombatMotionSource } from './qiuqiu-combat-motion';

/**
 * 丟出去的東西飛出去時長什麼樣（2026-09-22，批次 proj）。
 *
 * 原本遠程牌與丟出去的忍具，飛出去的一律是手裏劍（球球、`qiuqiu-shuriken.ts`）或飛針（菲菲、`feifei-needles.ts`），
 * 噹噹、封封丟東西時什麼都沒飛：聚葉成刀飛手裏劍、毛球彈飛手裏劍、毒丸彈飛針、絆索飛針、三連針飛手裏劍⋯⋯
 * 使用者 2026-09-22：「飛出去的東西很重要」——每一種都專門生了一張「飛行中」的圖
 * （`tools/gen_projectile_art.py`，圖在 `public/assets/motion/projectile/`），手裏劍與飛針沿用現成的。
 *
 * 這一支只管「哪張牌、哪支忍具、誰丟 → 飛什麼」，怎麼飛（圖、大小、轉不轉、拋物線）在 `projectile-flight.ts`。
 */
export type ProjectileKind =
  | 'shuriken' | 'needle'
  | 'leaf' | 'kunai' | 'barrel'
  | 'furball_qiuqiu' | 'furball_dangdang' | 'furball_fengfeng'
  | 'poison_pill' | 'poison_sand' | 'snare_cord'
  | 'hemp_rope' | 'firecracker' | 'smoke_bomb' | 'nip_ball' | 'bind_nail' | 'rubble'
  | 'grapple' | 'thunder_bead';

/** 丟向誰：單體、全體、丟在自己腳邊（煙霧彈） */
export type ProjectileAim = 'enemy' | 'all' | 'self';

export type ProjectileShot = Readonly<{
  kind: ProjectileKind;
  /**
   * 只有忍具帶。麻繩、定身釘、貓薄荷球沒有傷害紀錄，戰鬥畫面要照這個決定飛向哪幾隻；煙霧彈丟在自己腳邊。
   * 牌都有傷害紀錄，飛向誰照命中紀錄，不用帶。
   */
  aim?: ProjectileAim;
  /** 單體忍具選的魔物 */
  target?: number;
  /** 忍具代號：戰鬥畫面用紀錄裡「用了『某某』」認這一拍真的用掉了（連線客戶端送出那一拍狀態還沒變，不能先飛） */
  potion?: string;
}>;

/**
 * 共用牌在每一位手上飛什麼（牌面插圖每位各畫一張，照插圖裡飛出去的東西定）：
 * - 聚葉成刀：四位都是金屬葉片。
 * - 手裏劍亂舞：手裏劍；噹噹那張叫「橫掃千軍」、是掃堂帶過一圈（使用者 2026-09-17 改的名），沒有東西飛。
 * - 毛球彈：吐出來的毛球，顏色跟那一位的毛色一樣；菲菲那張叫「毒丸彈」，彈一顆毒丸。
 * - 撒手鐧：球球、菲菲的插圖是一把大苦無，噹噹、封封的是一個木桶。
 * - 菲菲改名的兩張：毒砂（鐵砂掌）撒一把毒砂、絆索（擒拿手）甩出一圈繩套。其餘三位那兩張是近身掌、拳，沒有東西飛。
 * - 拋爪：四位的牌面都是甩出去的帶繩飛爪（2026-09-23；原本是近身招式或飛針）。
 * 菲菲其餘的針術牌飛針（`defaultProjectile`）。
 */
const CARD_PROJECTILE: Readonly<Record<string, Readonly<Partial<Record<CombatMotionSource, ProjectileKind>>>>> = {
  paozhao: { qiuqiu: 'grapple', feifei: 'grapple', dangdang: 'grapple', fengfeng: 'grapple' },
  juye: { qiuqiu: 'leaf', feifei: 'leaf', dangdang: 'leaf', fengfeng: 'leaf' },
  luanwu: { qiuqiu: 'shuriken', feifei: 'shuriken', fengfeng: 'shuriken' },
  maoqiudan: { qiuqiu: 'furball_qiuqiu', feifei: 'poison_pill', dangdang: 'furball_dangdang', fengfeng: 'furball_fengfeng' },
  sashoujian: { qiuqiu: 'kunai', feifei: 'kunai', dangdang: 'barrel', fengfeng: 'barrel' },
  tieshazhang: { feifei: 'poison_sand' },
  qinna: { feifei: 'snare_cord' },
};

/**
 * 丟出去的忍具飛什麼（四位一樣）。手裡劍、三連針原本就是丟的；其餘六支原本是「施術」（結印、運氣），
 * 東西明明是丟出去的（鞭炮、麻繩、煙霧彈、貓薄荷球、定身釘、亂石包），2026-09-22 起一起改成丟。
 * 沒列的（藥、食物、卷軸、粉、膏、鐵指虎⋯⋯）不是丟出去的，維持原本的動作。
 */
const POTION_PROJECTILE: Readonly<Record<string, ProjectileKind>> = {
  shuriken: 'shuriken',
  needle_rain: 'needle',
  firecracker: 'firecracker',
  rope: 'hemp_rope',
  smoke_bomb: 'smoke_bomb',
  nip_ball: 'nip_ball',
  bind_nail: 'bind_nail',
  rubble_bag: 'rubble',
  // 2026-09-23 內容擴充第一批：火雷珠（全體 14 點），圖 `public/assets/motion/projectile/thunder_bead.webp`
  thunder_bead: 'thunder_bead',
};

export const THROW_POTION_IDS: ReadonlySet<string> = new Set(Object.keys(POTION_PROJECTILE));

/** 這個動作是不是「把東西丟出去」的那一套（出手格放出飛行物）。空手擲出 `toss`（2026-09-23）四隻都算 */
export function isThrowAction(source: CombatMotionSource, action: CombatMotionAction): boolean {
  if (source === 'qiuqiu') return action === 'shuriken' || action === 'ultimate_storm' || action === 'toss';
  if (source === 'feifei' && isFeifeiNeedleAction(action)) return true;
  return companionThrowRelease(source, action) !== undefined;
}

/**
 * 沒有逐張指定時，這一套丟東西的動作飛什麼：球球的擲手裏劍飛手裏劍、菲菲的針術飛針；噹噹、封封沒有預設。
 * 空手擲出沒有預設（2026-09-23）：它本來就是「手上看不出拿什麼」，飛什麼一定要牌或忍具指定——
 * 沒指定就什麼都不飛（命中照動作時點演），不猜一個可能對不上的東西。
 */
export function defaultProjectile(source: CombatMotionSource, action: CombatMotionAction): ProjectileKind | undefined {
  if (!isThrowAction(source, action) || action === 'toss') return undefined;
  if (source === 'qiuqiu') return 'shuriken';
  if (source === 'feifei') return 'needle';
  return undefined;
}

/** 打這張牌、演這個動作時飛什麼；動作不是丟東西的（近身出招）就什麼都不飛 */
export function cardProjectile(source: CombatMotionSource, cardId: string, action: CombatMotionAction): ProjectileShot | undefined {
  if (!isThrowAction(source, action)) return undefined;
  const kind = CARD_PROJECTILE[cardId]?.[source] ?? defaultProjectile(source, action);
  return kind ? { kind } : undefined;
}

/** 用這支忍具時飛什麼；不是丟出去的忍具回 undefined */
export function potionProjectile(
  potion: Readonly<{ id: string; target: ProjectileAim }>,
  targetUid?: number,
): ProjectileShot | undefined {
  const kind = POTION_PROJECTILE[potion.id];
  if (!kind) return undefined;
  return {
    kind,
    aim: potion.target,
    ...(potion.target === 'enemy' && targetUid !== undefined ? { target: targetUid } : {}),
    potion: potion.id,
  };
}

/**
 * 戰鬥畫面這一拍實際要飛什麼：呼叫端帶了（牌、忍具）而且動作是丟東西那一套就用它；
 * 沒帶就用動作的預設（舊行為：球球擲手裏劍、菲菲針術）；都沒有就不飛。
 */
export function resolveProjectileShot(
  source: CombatMotionSource | undefined,
  action: CombatMotionAction | undefined,
  given: ProjectileShot | undefined,
): ProjectileShot | undefined {
  if (!source || !action || !isThrowAction(source, action)) return undefined;
  if (given) return given;
  const kind = defaultProjectile(source, action);
  return kind ? { kind } : undefined;
}

/**
 * 狀態類忍具（麻繩、定身釘、貓薄荷球）沒有傷害紀錄，飛向誰照忍具丟向誰：全體＝每一隻、單體＝選的那一隻。
 * 牌（沒帶 aim）與丟在自己腳邊的煙霧彈不走這條。
 */
export function shotAimsAt(shot: ProjectileShot | undefined, uid: number): boolean {
  return shot?.aim === 'all' || (shot?.aim === 'enemy' && shot.target === uid);
}

/**
 * 這一拍的紀錄裡，這支忍具真的用掉了嗎（引擎寫「某某用了『名字』」）。
 * 連線客戶端送出那一拍狀態還沒變（要等主機套用），不認的話麻繩會先飛一次、主機回來再飛一次。
 * 牌不用認（牌靠命中紀錄，沒命中就沒有計畫）。
 */
export function shotUsedIn(shot: ProjectileShot | undefined, fresh: readonly string[], potionName: (id: string) => string | undefined): boolean {
  if (!shot?.potion) return true;
  const name = potionName(shot.potion);
  return !!name && fresh.some((line) => line.endsWith(`用了「${name}」`));
}
