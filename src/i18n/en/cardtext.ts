/**
 * 英文牌面文字產生器（多語系第一片，2026-09-29）。
 *
 * 跟中文版（`src/ui/cardtext.ts`）一樣是**照效果資料組句**，不是逐句翻：每條效果一句、句首大寫、句號收尾，
 * 殺戮尖塔式的祈使句（"Deal 6 damage. Apply 1 Lazy."）。名詞一律照譯名表（`src/i18n/glossary.json`），
 * 狀態名從語言包的 `term` 查，跟提示框、狀態列用的是同一份。
 * 中文版那些「收掉重複主詞、接『再』、分號切句」的構詞技巧英文用不到，這裡刻意不搬，一條效果一句最不會讀錯。
 */
import { DEBUFFS } from '../../engine/types';
import type { CardDef, Effect } from '../../engine/types';
import { t } from '../index';
import content from './content.json';

const TERM = (content as { term: Record<string, string> }).term;
/** 狀態、關鍵字的英文名（缺譯退回中文，缺譯檢查會抓到） */
const S = (zh: string): string => TERM[zh] ?? zh;
const pl = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const cards = (n: number): string => pl(n, 'card');
const balls = (n: number): string => pl(n, 'Rice Ball');
const TYPE: Readonly<Record<string, string>> = { attack: 'Attack', skill: 'Skill', power: 'Power' };
const ALL = 'ALL monsters';

const INTENT: Readonly<Record<string, string>> = {
  attack: 'If any monster intends to attack this turn', block: 'If any monster intends to defend this turn',
  buff: 'If any monster intends to buff itself this turn', debuff: 'If any monster intends to debuff you this turn',
  summon: 'If any monster intends to summon help this turn', special: 'If any monster intends a special move this turn',
  idle: 'If any monster is idle this turn',
};

const ALLY_KINDS = new Set<Effect['kind']>([
  'statusAlly', 'blockAlly', 'drawAlly', 'drawAllyIfTargetStatus', 'cleanseAlly', 'healAlly',
  'blockFromAllyBlock', 'damageFromAllyStrength', 'doubleNextAttackAlly', 'transferDebuffsFromAlly',
  'energyAlly', 'energyForAllyEachRound', 'poisonAllyNextAttack', 'watchSelfPlay',
]);
/** 跟中文版 `hasAlly` 同一套判準（句尾那句「一個人玩時同伴＝你自己」） */
function hasAlly(fx: Effect): boolean {
  if (ALLY_KINDS.has(fx.kind)) return true;
  if (fx.kind === 'ifSelfStatus') return [...fx.then, ...fx.otherwise].some((f) => f && hasAlly(f));
  if (fx.kind === 'blockSpendQi') return fx.recipient === 'ally';
  if (fx.kind === 'nextAttackBonusSpendQi') return true;
  if (fx.kind === 'ifAllyBlockAtPlay') return true;
  if (fx.kind === 'ifQiAtPlay' || fx.kind === 'ifSpentQiAtLeast') return fx.then.some(hasAlly);
  return false;
}

const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: readonly string[]): string => xs.length <= 1 ? (xs[0] ?? '')
  : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const clause = (fx: readonly Effect[], ctx: Ctx): string => fx.map((e) => lower(one(e, ctx))).join(', ');

interface Ctx { prev?: Effect | undefined; plays?: number; allFoes?: boolean }

function one(fx: Effect, ctx: Ctx = {}): string {
  switch (fx.kind) {
    case 'gainQi': return `Gain ${fx.n} Qi`;
    case 'damageSpendQi': {
      const spend = fx.allQi ? 'Spend all your Qi' : `Spend up to ${fx.maxQi ?? 0} Qi`;
      const who = fx.target === 'all' ? ` to ${ALL}` : '';
      const hits = (fx.times ?? 1) > 1 ? `, ${fx.times} times` : '';
      // 沒有基本傷害的（氣貫長虹，2026-09-29）不寫 "deal 0 damage, +3 per Qi spent"
      const dmg = fx.amount > 0 ? `deal ${fx.amount} damage${who}, +${fx.perQi} per Qi spent` : `deal ${fx.perQi} damage${who} per Qi spent`;
      return `${spend}: ${dmg}${hits}${fx.ignoreBlock ? ', ignoring Block' : ''}`;
    }
    case 'blockSpendQi': return `Spend up to ${fx.maxQi} Qi: ${fx.recipient === 'ally' ? 'your partner gains' : 'gain'} ${fx.amount} Curl, +${fx.perQi} per Qi spent`;
    case 'nextAttackBonusSpendQi': return `Spend up to ${fx.maxQi} Qi: ${fx.recipients === 'ally' ? "your partner's" : "both players'"} next Attack this turn deals ${fx.amount} more damage to its first target, +${fx.perQi} per Qi spent (doesn't stack)`;
    case 'ifQiAtPlay': return `If you had at least ${fx.min} Qi before playing this, ${clause(fx.then, ctx)}`;
    case 'ifSpentQiAtLeast': return `If this spent at least ${fx.min} Qi, ${clause(fx.then, ctx)}`;
    case 'ifAllyBlockAtPlay': return `If your partner had at least ${fx.min} Curl, ${clause(fx.then, ctx)}`;
    case 'preventEnergyGainThisPhase': return "You can't gain Rice Balls for the rest of this turn";
    case 'damageSpendBlock': {
      const spend = fx.all ? 'remove your Curl' : `remove up to ${fx.max ?? 0} Curl`;
      const times = (fx.mul ?? 1) > 1 ? `${fx.mul}x that much damage` : 'that much damage';
      const who = fx.target === 'all' ? ` to ${ALL}` : '';
      const plus = fx.plusOwnStatus ? `, +1 per ${S(fx.plusOwnStatus)} you have` : '';
      const ign = fx.ignoreBlock ? ', ignoring Block' : '';
      if (fx.plus) return `Deal ${fx.plus} damage; ${spend} and add it to the damage${plus}${ign}`;
      return `${cap(spend)} and deal ${times}${who}${plus}${ign}`;
    }
    case 'healSpendBlock': return `Remove up to ${fx.max} Curl and heal that much HP`;
    case 'blockFromThorns': return `Gain Curl equal to your ${S('反彈')} (${S('反彈')} is not reduced)`;
    case 'damageByOwnStatus': return (fx.mul ?? 1) > 1
      ? `Deal damage equal to ${fx.mul}x your ${S(fx.name)}` : `Deal damage equal to your ${S(fx.name)}`;
    case 'ifBlock': return `${fx.min <= 1 ? 'If you have Curl' : `If you have more than ${fx.min - 1} Curl`}, ${clause(fx.then, ctx)}`;
    case 'ifEnemyIntent': return `${INTENT[fx.intent] ?? ''}, ${clause(fx.then, ctx)}`;
    case 'keepBlock': return `At the end of this turn, keep up to ${fx.n} Curl`;
    case 'halfSpendBlock': return 'Cards that remove Curl now remove only half (rounded up); their power is unchanged';
    case 'blockWhenAttacked': return `Whenever a monster attacks you (even if blocked), gain ${fx.n} Curl`;
    case 'thornsBonus': return `Your ${S('反彈')} deals ${fx.n} more damage`;
    case 'blockOnThorns': return `Whenever your ${S('反彈')} hits back, gain ${fx.n} Curl`;
    case 'thornsFromSpend': return `Whenever you remove Curl to attack, gain ${S('反彈')} equal to ${fx.full ? '' : 'half '}the amount removed`;
    case 'blockToThorns': return `At the end of this turn, turn every ${fx.per} leftover Curl into ${fx.gain} ${S('反彈')}`;
    case 'damageScatter': return `Deal ${fx.amount} damage to a random monster ${fx.times} times`;
    case 'skipEnemyTurn': return "Monsters don't act this turn";
    case 'damageByStatus': return ((fx.mul ?? 1) > 1
      ? `Deal damage equal to ${fx.mul}x the target's ${S(fx.name)}` : `Deal damage equal to the target's ${S(fx.name)}`)
      + (fx.consume ? `, then remove its ${S(fx.name)}` : '');
    case 'execByStatus': return fx.bonus
      ? `If the target has ${S(fx.name)} and its HP is at most its ${S(fx.name)} + ${fx.bonus}, defeat it instantly`
      : `If the target's ${S(fx.name)} is at least its remaining HP, defeat it instantly`;
    case 'spreadStatus': return fx.half
      ? `Split the target's ${S(fx.name)} among the other monsters (half each)`
      : `Copy the target's ${S(fx.name)} to every other monster`;
    case 'poisonBurst': return fx.full
      ? `When a monster with ${S('中毒')} dies, every other monster gets its remaining ${S('中毒')}`
      : `When a monster with ${S('中毒')} dies, split its remaining ${S('中毒')} among the other monsters`;
    case 'blockBonus': return `Whenever you gain Curl, gain ${fx.n} more`;
    case 'echoFirst': return 'The first non-Power card you play each turn is played twice (stacks: each copy adds another play)';
    case 'poisonOnAttack': return `Whenever you play an Attack, apply ${fx.n} ${S('中毒')} to its target`;
    case 'blockIfPoisoned': return ctx.allFoes
      ? `If any monster already had ${S('中毒')}, gain ${fx.amount} Curl`
      : `If the target already had ${S('中毒')}, gain ${fx.amount} Curl`;
    case 'blockAll': return `Everyone gains ${fx.amount} Curl`;
    case 'statusAlly': return `Your partner gains ${fx.amount} ${S(fx.name)}`;
    case 'taunt': return 'This round, all monsters target you (attacks, fish theft and debuffs)';
    case 'blockAlly': return `Your partner gains ${fx.amount} Curl`;
    case 'drawAlly': return `Your partner draws ${cards(fx.n)}`;
    case 'cleanseAlly': return "Remove all of your partner's debuffs";
    case 'healAlly': return `Your partner heals ${fx.n} HP`;
    case 'blockFromAllyBlock': return `Gain ${fx.amount} Curl, plus ${fx.half ? 'half of ' : ''}your partner's current Curl (max ${fx.cap}; theirs is not reduced)`;
    case 'damageFromAllyStrength': return `Deal ${fx.amount} damage, +1 per ${S('爪力')} your partner has (max ${fx.cap})${fx.ignoreBlock ? ', ignoring Block' : ''}`;
    case 'energyTransfer': return `Give your partner up to ${balls(fx.n)} you have left (not when solo)`;
    case 'doubleNextAttackAlly': return "Your partner's next Attack this round deals double damage";
    case 'drawAllyIfTargetStatus': return `If the target already had ${fx.anyDebuff ? 'any debuff' : S(fx.name ?? '')}, your partner draws ${cards(fx.n)}`;
    case 'transferDebuffsFromAlly': return "Move all of your partner's debuffs onto the target";
    case 'watchAllyPlay': return `Each round, the first time your partner plays ${fx.cardType === 'any' ? 'a card' : 'a Skill'}, draw 1 card (solo: counts your own plays)`;
    case 'watchSelfPlay': return `Each round, the first time you play ${fx.cardType === 'any' ? 'a card' : 'an Attack'}, your partner gains 6 Curl`;
    case 'watchPoisonHit': return `Once per round, when ${fx.who === 'both' ? 'either of you damages' : 'your partner damages'} a monster that already had ${S('中毒')}, you both gain 4 Curl (solo: your own hits count; gain 8)`;
    case 'poisonAllyNextAttack': return `Your partner's next ${fx.anyDamage ? 'damaging card' : 'Attack'} this round applies ${fx.amount} ${S('中毒')} to each monster it damages`;
    case 'energyForAllyEachRound': return `At the start of each round, your partner gains 1 Rice Ball${fx.draw ? ' and draws 1 extra card' : ''}`;
    case 'ifSelfStatus': {
      const then = clause(fx.then, ctx);
      const other = clause(fx.otherwise, ctx);
      return other ? `If you have ${S(fx.name)}, ${then}; otherwise, ${other}` : `If you have ${S(fx.name)}, also ${then}`;
    }
    case 'energyAlly': return fx.onKill ? `If this defeats it, your partner gains ${balls(fx.n)} this turn` : `Your partner gains ${balls(fx.n)} this turn`;
    case 'damage': {
      if (fx.ifTargetDebuffed) return `If the target has any debuff, deal ${fx.amount} more damage`;
      const then = ctx.prev?.kind === 'stealBlock' ? 'Then deal' : 'Deal';
      const head = fx.target === 'all' ? `Deal ${fx.amount} damage to ${ALL}` : `${then} ${fx.amount} damage`;
      const times = fx.scaleWithCombo
        ? `, hitting ${S('連抓')} + 1 times${fx.comboCap === undefined ? '' : ` (max ${fx.comboCap})`}`
        : (fx.times ?? 1) > 1 ? ` ${fx.times} times` : '';
      return head + times + (fx.ignoreBlock ? ', ignoring Block' : '');
    }
    case 'damageRamp': {
      const plays = ctx.plays ?? 0;
      const grew = plays > 0 ? ` (base ${fx.amount})` : '';
      return `Deal ${fx.amount + fx.step * plays} damage${grew}. Each time you play this card this combat, its damage increases by ${fx.step}`;
    }
    case 'damageRandom': return `Deal ${fx.min}–${fx.max} damage at random`;
    case 'damageEqualBlock': return "Deal damage equal to your Curl (your Curl isn't reduced)";
    case 'selfDamage': return `Take ${fx.amount} damage`;
    case 'block': return `Gain ${fx.amount} Curl`;
    case 'stealBlock': return "Take all of the target's Block";
    case 'draw': return `Draw ${cards(fx.n)}`;
    case 'drawIfTargetStatus': return `If the target has ${S(fx.name)}, draw ${cards(fx.n)}`;
    case 'drawNextTurn': return `Next turn, draw ${fx.n} more ${fx.n === 1 ? 'card' : 'cards'}`;
    case 'status': {
      const name = S(fx.name);
      if (fx.step) {
        const plays = ctx.plays ?? 0;
        const grew = plays > 0 ? ` (base ${fx.amount})` : '';
        return `Apply ${fx.amount + fx.step * plays} ${name}${grew}. Each time you play this card this combat, it applies ${fx.step} more`;
      }
      if (fx.name === '潛水') return `Next turn, gain ${fx.amount} ${S('隱身')}`;
      if (fx.name === '鐵布衫') return `Next turn, gain ${fx.amount} Curl`;
      if (fx.name === '定身' && fx.amount <= 1) {
        return fx.target === 'self' ? `You get ${name}` : fx.target === 'all' ? `${name} ${ALL}` : `${name} the target`;
      }
      if (fx.target === 'self') return DEBUFFS.includes(fx.name) ? `You get ${fx.amount} ${name}` : `Gain ${fx.amount} ${name}`;
      if (fx.target === 'all') return `Apply ${fx.amount} ${name} to ${ALL}`;
      return `Apply ${fx.amount} ${name}`;
    }
    case 'energyNextTurn': return `Next turn, gain ${balls(fx.n)}`;
    case 'guardLethal': return 'The first time you would be defeated this combat, keep 1 HP; the rest of that monster turn cannot defeat you either';
    case 'transformFromHand': return 'Choose a card in your hand and turn it into a random upgraded card (this combat only)';
    case 'daze': return 'This turn, the target attacks the monster next to it instead (or nothing, if alone)';
    case 'removeStatuses': {
      const names = list(fx.names.map(S));
      if (fx.target === 'all') return `Remove ${names} from ${ALL}`;
      if (fx.max === undefined) return `Remove the target's ${names}${fx.removeBlock ? ' and Block' : ''}`;
      return `Remove up to ${fx.max} ${names}${fx.removeBlock ? ` and ${fx.max} Block` : ''} from the target`;
    }
    case 'transferDebuffs': return `Move all your ${list(DEBUFFS.map(S))} onto the target`;
    case 'cleanse': return fx.max ? `Remove ${fx.max} ${fx.max === 1 ? 'kind' : 'kinds'} of debuff from yourself` : 'Remove all your debuffs';
    case 'energy': return fx.onKill ? `If this defeats it, gain ${balls(fx.n)}` : `Gain ${balls(fx.n)}`;
    case 'doubleStatus': return `Double the target's ${S(fx.name)}` + (fx.add ? `, then add ${fx.add}` : ' (no effect if it has none)');
    case 'heal': return fx.percent ? `Heal ${fx.percent}% of your max HP` : `Heal ${fx.n} HP`;
    case 'gold': return fx.onKill ? `If this defeats it, gain ${fx.n} Dried Fish` : `Gain ${fx.n} Dried Fish`;
    case 'scry': return `Look at the top ${cards(fx.n)} of your draw pile and discard any of them`;
    case 'exhaustFromHand': return `${S('消耗')} ${cards(fx.n)} in your hand`;
    case 'retainFromHand': return `Choose ${cards(fx.n)} in your hand to keep until next turn`;
    case 'discardFromHand': return `Discard ${cards(fx.n)}`;
    case 'recoverFromDiscard': return 'Put 1 card from your discard pile into your hand';
    case 'doubleNextAttack': return 'Your next Attack this turn deals double damage';
    case 'endTurn': return 'Then end your turn';
    case 'noAttacksThisTurn': return "You can't play Attacks this turn";
    case 'immuneThisTurn': return "Monsters can't hurt you this turn";
    case 'power': {
      const inner = fx.effects.map((e) => lower(one(e, {}))).join(', ');
      const scope = fx.thisTurn ? 'This turn, ' : '';
      const same = fx.sameNameMax ? ' (copies of this card don\'t stack; the highest applies)' : '';
      if (fx.trigger === 'afterCard') {
        const cond = fx.minQiSpent ? ` that spends at least ${fx.minQiSpent} Qi` : '';
        const kind = fx.cardType ? TYPE[fx.cardType] ?? '' : 'card';
        const art = /^[AEIOU]/.test(kind) ? 'an' : 'a';
        const when = fx.oncePerTurn ? `the first time each turn you play ${art} ${kind}` : `whenever you play ${art} ${kind}`;
        return cap(`${scope}${lower(when)}${cond}, ${inner}`)
          + (fx.maxPerTurn !== undefined ? ` (up to ${fx.maxPerTurn} times per turn)` : '') + same;
      }
      if (fx.trigger === 'passive') return cap(inner);
      return (fx.trigger === 'turnStart' ? `${scope}At the start of each turn, ${inner}`
        : fx.trigger === 'onKill' ? `${scope}Whenever you defeat a monster, ${inner}`
          : `${scope}At the end of your turn, if you played no Attacks, ${inner}`) + same;
    }
  }
}

/** 一串效果寫成英文（每條一句） */
export function describeEffectsEn(effects: readonly Effect[], plays = 0): string {
  const allFoes = effects.some((e) => (e.kind === 'damage' || e.kind === 'status') && e.target === 'all');
  return effects.map((fx, i) => cap(one(fx, { prev: effects[i - 1], plays, allFoes })) + '.').join(' ');
}

export function describeCardEn(def: CardDef, upgraded: boolean, plays = 0): string {
  const effects = upgraded ? (def.upgrade.effects ?? def.effects) : def.effects;
  const keywords = upgraded ? (def.upgrade.keywords ?? def.keywords ?? []) : (def.keywords ?? []);
  const parts: string[] = [];
  if (keywords.includes('不可打出')) parts.push(`${S('不可打出')}.`);
  if (!effects.length && !keywords.includes('不可打出')) parts.push('Does nothing when played.');
  if (effects.length) {
    parts.push(describeEffectsEn(effects, plays));
    if (effects.some(hasAlly)) parts.push('Solo: "partner" means you.');
  }
  if (def.curse?.onTurnEnd) parts.push(`If this is in your hand at the end of your turn, take ${def.curse.onTurnEnd} damage.`);
  if (def.curse?.onTurnStart) parts.push(`If this is in your hand at the start of your turn, take ${def.curse.onTurnStart} damage.`);
  if (def.curse?.onDraw) parts.push('When drawn, lose 1 Rice Ball.');
  if (keywords.includes('消耗')) parts.push(`${S('消耗')}.`);
  if (keywords.includes('保留')) parts.push(`${S('保留')}.`);
  if (keywords.includes('虛幻')) parts.push(`${S('虛幻')}.`);
  if (def.note) parts.push(t(def.note));   // i18n-dynamic：牌的來歷（只有一張）
  return parts.join(' ');
}
