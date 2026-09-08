/**
 * 鏡中球球「照著學」（2026-09-08 使用者：他的招式沒特色，改成每回合隨機抽主角牌組裡的牌來打，
 * 畫面要讓玩家看到他打了哪張；但跟主角的牌無關——只是複製一份，不抽走、不棄掉、不消耗）。
 *
 * 哪些牌翻得成魔物的一招：
 * - 打擊 → damage（無視蜷縮的翻成穿透）；蜷縮 → block；回血 → heal
 * - 給自己的狀態只收爪力、貓步、隱身（魔物身上這三個引擎本來就會算，舊版「照著學」抄的也是前兩個）
 * - 給對手的狀態翻成 statusPlayer（翻肚、懶洋洋、炸毛、噎到、定身）
 * - 抽牌、飯糰、看牌、留牌、消耗、棄牌、清減益這類「操作手牌」的效果他學不來，直接略過（那張牌其餘效果照翻）
 * - 「這回合不能攻擊」這種只綁自己的限制也略過（戰術撤退的 9 點蜷縮照學）
 * - 有條件的加成（背刺「目標有減益才多打」）不學那一段，只學無條件的部分
 * - 其他（能力效果、自傷、以蜷縮為傷害、偷防禦、結束回合……）翻不成，整張牌不進他的池子；
 *   能力牌本身不是一律排除——馬步、運功這種只加爪力／貓步的照收（跟舊版照著學抄的東西一樣）
 * 一張牌至少要翻出一個效果才算數。抽牌用戰鬥亂數（cs.rng），同一個局面碼永遠抽到同一張。
 */
import { encounterById, enemyById } from '../content/enemies';
import { cardStats } from './deck';
import type { CardInstance, CombatState, EnemyCombat, EnemyEffect, EnemyMove, Intent, StatusName } from './types';
import { DEBUFFS } from './types';

const SELF_OK: readonly StatusName[] = ['爪力', '貓步', '隱身'];
/** 學不來但不礙事的效果：略過，牌還是能用 */
const SKIP: ReadonlySet<string> = new Set([
  'draw', 'drawIfTargetStatus', 'drawNextTurn', 'energy', 'gold', 'scry',
  'exhaustFromHand', 'retainFromHand', 'discardFromHand', 'recoverFromDiscard', 'cleanse', 'removeStatuses',
  'noAttacksThisTurn',
]);

/** 這張牌翻成魔物的效果；翻不成回 null */
export function learnCard(inst: CardInstance): EnemyEffect[] | null {
  const { def, effects, keywords } = cardStats(inst);
  if (keywords.includes('不可打出') || def.combatOnly) return null;
  const out: EnemyEffect[] = [];
  for (const fx of effects) {
    switch (fx.kind) {
      case 'damage': {
        if (fx.ifTargetDebuffed) break;   // 背刺那種「目標有減益才多打」的那一段不學（稽核 2026-09-08 低-4）
        const hit: Extract<EnemyEffect, { kind: 'damage' }> = { kind: 'damage', amount: fx.amount };
        if (fx.times !== undefined && fx.times > 1) hit.times = fx.times;
        if (fx.ignoreBlock) hit.pierce = true;
        out.push(hit);
        break;
      }
      case 'block': out.push({ kind: 'block', amount: fx.amount }); break;
      case 'heal': out.push({ kind: 'heal', n: fx.n }); break;
      case 'status':
        if (fx.target === 'self') { if (SELF_OK.includes(fx.name)) out.push({ kind: 'statusSelf', name: fx.name, amount: fx.amount }); }
        else if (DEBUFFS.includes(fx.name)) out.push({ kind: 'statusPlayer', name: fx.name, amount: fx.amount });
        break;
      default:
        if (!SKIP.has(fx.kind)) return null;
    }
  }
  return out.length ? out : null;
}

/** 球球這一局帶進來的牌裡，他學得會的那些。四堆合起來看，不動任何一堆 */
export function learnPool(cs: CombatState): CardInstance[] {
  const p = cs.player;
  return [...p.drawPile, ...p.hand, ...p.discardPile, ...p.exhaustPile].filter((c) => learnCard(c) !== null);
}

/** 這隻魔物會不會照著學（鏡中球球）。在 makeEnemy／advanceMove 裡問，是的話招式不照表走 */
export function learnsPlayerCards(e: EnemyCombat): boolean {
  return enemyById[e.enemyId]?.learnsPlayerCards === true;
}

/**
 * 他下一動要「學」的那一招：抽 n 張（遭遇的 learnCards，不填＝1）不同的牌，效果接在一起、牌名用「、」串。
 * 池子空的（牌組裡沒半張學得會的）回 undefined，讓呼叫端退回牠自己的招式表。
 */
export function learnedMove(cs: CombatState): EnemyMove | undefined {
  const pool = learnPool(cs);
  if (pool.length === 0) return undefined;
  const n = Math.min(encounterById[cs.encounterId]?.learnCards ?? 1, pool.length);
  const rest = [...pool];
  const picks: CardInstance[] = [];
  for (let i = 0; i < n; i++) {
    const c = cs.rng.pick(rest);
    picks.push(c);
    rest.splice(rest.indexOf(c), 1);
  }
  const effects = picks.flatMap((c) => learnCard(c) ?? []);
  const intent: Intent = effects.some((f) => f.kind === 'damage') ? 'attack'
    : effects.some((f) => f.kind === 'block') ? 'block'
      : effects.some((f) => f.kind === 'statusPlayer') ? 'debuff' : 'buff';
  // 牌名用「、」串：升級牌的名字結尾就是「＋」，用「＋」串會變成「淡定＋＋貓抓＋」（稽核 2026-09-08 中-1）
  return { intent, label: picks.map((c) => cardStats(c).name).join('、'), effects, learned: picks.map((c) => ({ cardId: c.cardId, upgraded: c.upgraded })) };
}
