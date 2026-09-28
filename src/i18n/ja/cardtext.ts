/**
 * 日文牌面文字產生器（多語系第一片，2026-09-29）。
 *
 * 跟英文版（`src/i18n/en/cardtext.ts`）同一個骨架：**照效果資料組句**，一條效果一句、句號收尾、句子之間不留空白。
 * 語氣照譯名表（`src/i18n/glossary.json` 的 tone.ja）：簡潔常體（「6ダメージを与える。」「丸まり5を得る。」）。
 * 狀態、關鍵字名從語言包的 `term` 查，跟提示框、狀態列同一份；缺譯退回中文（缺譯檢查會抓到）。
 */
import { DEBUFFS } from '../../engine/types';
import type { CardDef, Effect } from '../../engine/types';
import { t } from '../index';
import content from './content.json';

const TERM = (content as { term: Record<string, string> }).term;
const S = (zh: string): string => TERM[zh] ?? zh;
const TYPE: Readonly<Record<string, string>> = { attack: '攻撃', skill: 'スキル', power: 'パワー' };
const ALL = '全体の魔物';
const CURL = (): string => S('蜷縮');
const BLOCK = (): string => S('防禦');
const BALL = (): string => S('飯糰');

const INTENT: Readonly<Record<string, string>> = {
  attack: 'このターン攻撃しようとする魔物がいるなら', block: 'このターン防御しようとする魔物がいるなら',
  buff: 'このターン自己強化しようとする魔物がいるなら', debuff: 'このターンあなたを弱らせようとする魔物がいるなら',
  summon: 'このターン仲間を呼ぼうとする魔物がいるなら', special: 'このターン奇策を使おうとする魔物がいるなら',
  idle: 'このターン何もしない魔物がいるなら',
};

const ALLY_KINDS = new Set<Effect['kind']>([
  'statusAlly', 'blockAlly', 'drawAlly', 'drawAllyIfTargetStatus', 'cleanseAlly', 'healAlly',
  'blockFromAllyBlock', 'damageFromAllyStrength', 'doubleNextAttackAlly', 'transferDebuffsFromAlly',
  'energyAlly', 'energyForAllyEachRound', 'poisonAllyNextAttack', 'watchSelfPlay',
]);
/** 跟中文版 `hasAlly` 同一套判準（句尾那句「ひとりの時は相棒＝自分」） */
function hasAlly(fx: Effect): boolean {
  if (ALLY_KINDS.has(fx.kind)) return true;
  if (fx.kind === 'ifSelfStatus') return [...fx.then, ...fx.otherwise].some((f) => f && hasAlly(f));
  if (fx.kind === 'blockSpendQi') return fx.recipient === 'ally';
  if (fx.kind === 'nextAttackBonusSpendQi') return true;
  if (fx.kind === 'ifAllyBlockAtPlay') return true;
  if (fx.kind === 'ifQiAtPlay' || fx.kind === 'ifSpentQiAtLeast') return fx.then.some(hasAlly);
  return false;
}

const list = (xs: readonly string[]): string => xs.join('・');
/** 條件句後面接的那幾條：用「、」串起來 */
const clause = (fx: readonly Effect[], ctx: Ctx): string => fx.map((e) => one(e, ctx)).join('、');

interface Ctx { prev?: Effect | undefined; plays?: number; allFoes?: boolean }

function one(fx: Effect, ctx: Ctx = {}): string {
  switch (fx.kind) {
    case 'gainQi': return `${S('蓄氣')}${fx.n}を得る`;
    case 'damageSpendQi': {
      const spend = fx.allQi ? `${S('蓄氣')}を全て使い` : `${S('蓄氣')}を最大${fx.maxQi ?? 0}使い`;
      const who = fx.target === 'all' ? `${ALL}に` : '';
      const hits = (fx.times ?? 1) > 1 ? `×${fx.times}回` : '';
      return `${spend}、${who}${fx.amount}ダメージ${hits}を与える（${S('蓄氣')}1につき+${fx.perQi}）${fx.ignoreBlock ? `。${BLOCK()}無視` : ''}`;
    }
    case 'blockSpendQi': return `${S('蓄氣')}を最大${fx.maxQi}使い、${fx.recipient === 'ally' ? `相棒が` : ''}${CURL()}${fx.amount}を得る（${S('蓄氣')}1につき+${fx.perQi}）`;
    case 'nextAttackBonusSpendQi': return `${S('蓄氣')}を最大${fx.maxQi}使い、このターン${fx.recipients === 'ally' ? `相棒` : '両者'}の次の攻撃カードの最初の対象へのダメージ+${fx.amount}（${S('蓄氣')}1につき+${fx.perQi}、重複せず高い方）`;
    case 'ifQiAtPlay': return `使用前に${S('蓄氣')}が${fx.min}以上あるなら、さらに${clause(fx.then, ctx)}`;
    case 'ifSpentQiAtLeast': return `${S('蓄氣')}を${fx.min}以上使ったなら、${clause(fx.then, ctx)}`;
    case 'ifAllyBlockAtPlay': return `相棒の${CURL()}が${fx.min}以上あったなら、さらに${clause(fx.then, ctx)}`;
    case 'preventEnergyGainThisPhase': return `このターン、これ以上${BALL()}を得られない`;
    case 'damageSpendBlock': {
      const spend = fx.all ? `${CURL()}を全て外し` : `${CURL()}を最大${fx.max ?? 0}外し`;
      const times = (fx.mul ?? 1) > 1 ? `その${fx.mul}倍のダメージ` : '同じだけのダメージ';
      const who = fx.target === 'all' ? `${ALL}に` : '';
      const plus = fx.plusOwnStatus ? `（${S(fx.plusOwnStatus)}1につき+1）` : '';
      const ign = fx.ignoreBlock ? `。${BLOCK()}無視` : '';
      if (fx.plus) return `${fx.plus}ダメージを与え、${spend}その分を上乗せ${plus}${ign}`;
      return `${spend}、${who}${times}を与える${plus}${ign}`;
    }
    case 'healSpendBlock': return `${CURL()}を最大${fx.max}外し、同じだけHPを回復`;
    case 'blockFromThorns': return `${S('反彈')}と同じだけ${CURL()}を得る（${S('反彈')}は減らない）`;
    case 'damageByOwnStatus': return (fx.mul ?? 1) > 1
      ? `自分の${S(fx.name)}の${fx.mul}倍のダメージを与える` : `自分の${S(fx.name)}と同じダメージを与える`;
    case 'ifBlock': return `${fx.min <= 1 ? `${CURL()}があるなら` : `${CURL()}が${fx.min - 1}より多いなら`}、さらに${clause(fx.then, ctx)}`;
    case 'ifEnemyIntent': return `${INTENT[fx.intent] ?? ''}、さらに${clause(fx.then, ctx)}`;
    case 'keepBlock': return `このターン終了時、${CURL()}を最大${fx.n}残す`;
    case 'halfSpendBlock': return `以後、${CURL()}を外すカードは半分だけ外す（端数切り上げ、全て外すものも同じ）。威力は変わらない`;
    case 'blockWhenAttacked': return `以後、魔物に攻撃されるたび（防いでも）${CURL()}${fx.n}を得る`;
    case 'thornsBonus': return `以後、${S('反彈')}のダメージ+${fx.n}`;
    case 'blockOnThorns': return `以後、${S('反彈')}で反撃するたび${CURL()}${fx.n}を得る`;
    case 'thornsFromSpend': return `以後、${CURL()}を外して攻撃するたび、外した量${fx.full ? '' : 'の半分'}の${S('反彈')}を得る`;
    case 'blockToThorns': return `このターン終了時、残った${CURL()}${fx.per}につき${S('反彈')}${fx.gain}に変える`;
    case 'damageScatter': return `ランダムな魔物に${fx.amount}ダメージを${fx.times}回与える`;
    case 'skipEnemyTurn': return 'このターン、魔物は行動しない';
    case 'damageByStatus': return ((fx.mul ?? 1) > 1
      ? `対象の${S(fx.name)}の${fx.mul}倍のダメージを与える` : `対象の${S(fx.name)}と同じダメージを与える`)
      + (fx.consume ? `。その後${S(fx.name)}を消す` : '');
    case 'execByStatus': return fx.bonus
      ? `対象に${S(fx.name)}があり、残りHPが「${S(fx.name)}+${fx.bonus}」以下なら即座に倒す`
      : `対象の${S(fx.name)}が残りHP以上なら即座に倒す`;
    case 'spreadStatus': return fx.half
      ? `対象の${S(fx.name)}を他の魔物に半分ずつ分ける`
      : `対象の${S(fx.name)}を他の全ての魔物にそのまま写す`;
    case 'poisonBurst': return fx.full
      ? `${S('中毒')}の魔物が倒れた時、残りの${S('中毒')}を他の魔物全員に同じだけ与える`
      : `${S('中毒')}の魔物が倒れた時、残りの${S('中毒')}を他の魔物に分ける`;
    case 'blockBonus': return `以後、${CURL()}を得るたび+${fx.n}`;
    case 'echoFirst': return '以後、毎ターン最初のパワー以外のカードをもう1回使う（重ねるほど回数が増える）';
    case 'poisonOnAttack': return `以後、攻撃カードを使うたび、その対象に${S('中毒')}${fx.n}を付与`;
    case 'blockIfPoisoned': return ctx.allFoes
      ? `使用前に${S('中毒')}の魔物がいたなら、${CURL()}${fx.amount}を得る`
      : `対象が元々${S('中毒')}なら、${CURL()}${fx.amount}を得る`;
    case 'blockAll': return `全員が${CURL()}${fx.amount}を得る`;
    case 'statusAlly': return `相棒が${S(fx.name)}${fx.amount}を得る`;
    case 'taunt': return 'このラウンド、魔物は全てあなたを狙う（攻撃・煮干し泥棒・デバフ）';
    case 'blockAlly': return `相棒が${CURL()}${fx.amount}を得る`;
    case 'drawAlly': return `相棒がカードを${fx.n}枚引く`;
    case 'cleanseAlly': return `相棒のデバフを全て消す`;
    case 'healAlly': return `相棒がHPを${fx.n}回復`;
    case 'blockFromAllyBlock': return `${CURL()}${fx.amount}を得て、さらに相棒の今の${CURL()}${fx.half ? 'の半分' : ''}を得る（最大${fx.cap}、相棒は減らない）`;
    case 'damageFromAllyStrength': return `${fx.amount}ダメージを与える（相棒の${S('爪力')}1につき+1、最大${fx.cap}）${fx.ignoreBlock ? `。${BLOCK()}無視` : ''}`;
    case 'energyTransfer': return `残りの${BALL()}を最大${fx.n}個相棒に渡す（ひとりの時は起きない）`;
    case 'doubleNextAttackAlly': return `このラウンド、相棒の次の攻撃カードのダメージ2倍`;
    case 'drawAllyIfTargetStatus': return `対象が使用前に${fx.anyDebuff ? 'デバフを持っていた' : `${S(fx.name ?? '')}を持っていた`}なら、相棒がカードを${fx.n}枚引く`;
    case 'transferDebuffsFromAlly': return `相棒のデバフを全て対象の魔物に移す`;
    case 'watchAllyPlay': return `毎ラウンド、相棒が最初に${fx.cardType === 'any' ? 'カード' : 'スキル'}を使った時、カードを1枚引く（ひとりの時は自分の使用で）`;
    case 'watchSelfPlay': return `毎ラウンド、最初に${fx.cardType === 'any' ? 'カード' : '攻撃カード'}を使った時、相棒が${CURL()}6を得る`;
    case 'watchPoisonHit': return `ラウンドに1回、${fx.who === 'both' ? 'どちらかが' : `相棒が`}元々${S('中毒')}の魔物にダメージを与えた時、2人とも${CURL()}4を得る（ひとりの時は自分の攻撃で${CURL()}8）`;
    case 'poisonAllyNextAttack': return `このラウンド、相棒の次の${fx.anyDamage ? 'ダメージを与えるカード' : '攻撃カード'}が、ダメージを与えた魔物それぞれに${S('中毒')}${fx.amount}を付与`;
    case 'energyForAllyEachRound': return `毎ラウンド開始時、相棒の${BALL()}+1${fx.draw ? '、さらにカードを1枚引く' : ''}`;
    case 'ifSelfStatus': {
      const then = clause(fx.then, ctx);
      const other = clause(fx.otherwise, ctx);
      return other ? `自分に${S(fx.name)}があるなら${then}。なければ${other}` : `自分に${S(fx.name)}があるなら、さらに${then}`;
    }
    case 'energyAlly': return fx.onKill ? `倒したなら、このターン相棒の${BALL()}+${fx.n}` : `このターン相棒の${BALL()}+${fx.n}`;
    case 'damage': {
      if (fx.ifTargetDebuffed) return `対象にデバフがあるなら、さらに${fx.amount}ダメージ`;
      const then = ctx.prev?.kind === 'stealBlock' ? 'さらに' : '';
      const who = fx.target === 'all' ? `${ALL}に` : then;
      const times = fx.scaleWithCombo
        ? `を（${S('連抓')}+1）回${fx.comboCap === undefined ? '' : `（最大${fx.comboCap}回）`}`
        : (fx.times ?? 1) > 1 ? `を${fx.times}回` : 'を';
      return `${who}${fx.amount}ダメージ${times}与える${fx.ignoreBlock ? `。${BLOCK()}無視` : ''}`;
    }
    case 'damageRamp': {
      const plays = ctx.plays ?? 0;
      const grew = plays > 0 ? `（元は${fx.amount}）` : '';
      return `${fx.amount + fx.step * plays}ダメージを与える${grew}。この戦闘で使うたびダメージ+${fx.step}`;
    }
    case 'damageRandom': return `ランダムに${fx.min}～${fx.max}ダメージを与える`;
    case 'damageEqualBlock': return `今の${CURL()}と同じダメージを与える（${CURL()}は減らない）`;
    case 'selfDamage': return `自分に${fx.amount}ダメージ`;
    case 'block': return `${CURL()}${fx.amount}を得る`;
    case 'stealBlock': return `対象の${BLOCK()}を全て奪う`;
    case 'draw': return `カードを${fx.n}枚引く`;
    case 'drawIfTargetStatus': return `対象に${S(fx.name)}があるなら、カードを${fx.n}枚引く`;
    case 'drawNextTurn': return `次のターン、カードを${fx.n}枚多く引く`;
    case 'status': {
      const name = S(fx.name);
      if (fx.step) {
        const plays = ctx.plays ?? 0;
        const grew = plays > 0 ? `（元は${fx.amount}）` : '';
        return `${name}${fx.amount + fx.step * plays}を付与${grew}。この戦闘で使うたび${name}+${fx.step}`;
      }
      if (fx.name === '潛水') return `次のターン開始時、${S('隱身')}${fx.amount}を得る`;
      if (fx.name === '鐵布衫') return `次のターン開始時、${CURL()}${fx.amount}を得る`;
      if (fx.name === '定身' && fx.amount <= 1) {
        return fx.target === 'self' ? `自分が${name}になる` : fx.target === 'all' ? `${ALL}を${name}にする` : `対象を${name}にする`;
      }
      if (fx.target === 'self') return DEBUFFS.includes(fx.name) ? `自分に${name}${fx.amount}` : `${name}${fx.amount}を得る`;
      if (fx.target === 'all') return `${ALL}に${name}${fx.amount}を付与`;
      return `${name}${fx.amount}を付与`;
    }
    case 'energyNextTurn': return `次のターン開始時、${BALL()}+${fx.n}`;
    case 'guardLethal': return 'この戦闘で初めて倒されそうな時、HP1で耐える。その魔物ターンの残りの攻撃でも倒れない';
    case 'transformFromHand': return '手札1枚をランダムな強化済みカードに変える（この戦闘のみ）';
    case 'daze': return 'このターン、対象の攻撃は隣の仲間に向かう（仲間がいなければ空振り）';
    case 'removeStatuses': {
      const names = list(fx.names.map(S));
      if (fx.target === 'all') return `${ALL}の${names}を消す`;
      if (fx.max === undefined) return `対象の${names}${fx.removeBlock ? `と${BLOCK()}` : ''}を消す`;
      return `対象の${names}を最大${fx.max}消す${fx.removeBlock ? `（${BLOCK()}も${fx.max}）` : ''}`;
    }
    case 'transferDebuffs': return `自分の${list(DEBUFFS.map(S))}を全て対象に移す`;
    case 'cleanse': return fx.max ? `自分のデバフを${fx.max}種類消す` : '自分のデバフを全て消す';
    case 'energy': return fx.onKill ? `倒したなら${BALL()}${fx.n}を得る` : `${BALL()}${fx.n}を得る`;
    case 'doubleStatus': return `対象の${S(fx.name)}を2倍にする` + (fx.add ? `。さらに+${fx.add}` : '（なければ効果なし）');
    case 'heal': return fx.percent ? `最大HPの${fx.percent}%を回復` : `HPを${fx.n}回復`;
    case 'gold': return fx.onKill ? `倒したなら${S('小魚乾')}${fx.n}を得る` : `${S('小魚乾')}${fx.n}を得る`;
    case 'scry': return `山札の上から${fx.n}枚を見て、好きなだけ捨てる`;
    case 'exhaustFromHand': return `手札を${fx.n}枚${S('消耗')}`;
    case 'retainFromHand': return `手札を${fx.n}枚選んで次のターンまで残す`;
    case 'discardFromHand': return `カードを${fx.n}枚捨てる`;
    case 'recoverFromDiscard': return '捨て札から1枚選んで手札に戻す';
    case 'doubleNextAttack': return 'このターン次の攻撃カードのダメージ2倍';
    case 'endTurn': return 'その後ターンを終える';
    case 'noAttacksThisTurn': return 'このターン、もう攻撃カードを使えない';
    case 'immuneThisTurn': return 'このターン、魔物の攻撃が当たらない';
    case 'power': {
      const inner = fx.effects.map((e) => one(e, {})).join('、');
      const scope = fx.thisTurn ? 'このターン、' : '';
      const same = fx.sameNameMax ? '（同名は高い方のみ）' : '';
      if (fx.trigger === 'afterCard') {
        const cond = fx.minQiSpent ? `${S('蓄氣')}を${fx.minQiSpent}以上使う` : '';
        const kind = fx.cardType ? TYPE[fx.cardType] ?? '' : 'カード';
        const when = fx.oncePerTurn ? `毎ターン最初に${cond}${kind}を使った時` : `${cond}${kind}を使うたび`;
        return `${scope}${when}、${inner}`
          + (fx.maxPerTurn !== undefined ? `（毎ターン最大${fx.maxPerTurn}回）` : '') + same;
      }
      if (fx.trigger === 'passive') return inner;
      return (fx.trigger === 'turnStart' ? `${scope}毎ターン開始時、${inner}`
        : fx.trigger === 'onKill' ? `${scope}魔物を倒すたび、${inner}`
          : `${scope}ターン終了時、このターン攻撃カードを使っていなければ、${inner}`) + same;
    }
  }
}

/** 一串效果寫成日文（每條一句，句子之間不留空白） */
export function describeEffectsJa(effects: readonly Effect[], plays = 0): string {
  const allFoes = effects.some((e) => (e.kind === 'damage' || e.kind === 'status') && e.target === 'all');
  return effects.map((fx, i) => one(fx, { prev: effects[i - 1], plays, allFoes }) + '。').join('');
}

export function describeCardJa(def: CardDef, upgraded: boolean, plays = 0): string {
  const effects = upgraded ? (def.upgrade.effects ?? def.effects) : def.effects;
  const keywords = upgraded ? (def.upgrade.keywords ?? def.keywords ?? []) : (def.keywords ?? []);
  const parts: string[] = [];
  if (keywords.includes('不可打出')) parts.push(`${S('不可打出')}。`);
  if (!effects.length && !keywords.includes('不可打出')) parts.push('使っても何も起きない。');
  if (effects.length) {
    parts.push(describeEffectsJa(effects, plays));
    if (effects.some(hasAlly)) parts.push(`ひとりの時は「相棒」＝自分。`);
  }
  if (def.curse?.onTurnEnd) parts.push(`ターン終了時に手札にあれば${def.curse.onTurnEnd}ダメージを受ける。`);
  if (def.curse?.onTurnStart) parts.push(`ターン開始時に手札にあれば${def.curse.onTurnStart}ダメージを受ける。`);
  if (def.curse?.onDraw) parts.push(`引いた時、${BALL()}1を失う。`);
  if (keywords.includes('消耗')) parts.push(`${S('消耗')}。`);
  if (keywords.includes('保留')) parts.push(`${S('保留')}。`);
  if (keywords.includes('虛幻')) parts.push(`${S('虛幻')}。`);
  if (def.note) parts.push(t(def.note));   // i18n-dynamic：牌的來歷（只有一張）
  return parts.join('');
}
