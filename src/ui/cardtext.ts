import { DEBUFFS } from '../engine/types';
import type { CardDef, Effect, StatusName } from '../engine/types';

/**
 * 規格 §6.1 有幾張牌的兩段效果是各自獨立的子句，用分號接才讀得順：
 * 順手牽羊（造成 6 傷；擊倒目標則 +15 小魚乾）、我在這、戰術撤退、讀心術、拖字訣。
 */
const CLAUSE_AFTER: ReadonlySet<Effect['kind']> = new Set(['scry', 'retainFromHand']);
const CLAUSE_BEFORE: ReadonlySet<Effect['kind']> = new Set(['drawIfTargetStatus', 'noAttacksThisTurn']);

/** 一次性的狀態：牌面不寫層數（規格 §6.1 定身術、點穴手都只寫「給目標定身」） */
const ONE_SHOT: ReadonlySet<StatusName> = new Set(['定身']);

/**
 * 潛水是引擎內部用來記「下回合開始換成隱身」的暫存狀態（見 glossary 與 combat.ts 的回合開始結算）。
 * 牌面不講這個名字，照規格 §6.1 寫成「下回合開始再獲得 N 隱身」。
 */
function isDive(fx: Effect | undefined): boolean {
  return fx?.kind === 'status' && fx.name === '潛水';
}

/** 這條效果點名的是「全體魔物」嗎——收掉重複主詞用 */
function namesAllFoes(fx: Effect | undefined): boolean {
  if (!fx) return false;
  if (fx.kind === 'damage') return fx.target === 'all';
  if (fx.kind === 'status') return fx.target === 'all' && !isDive(fx);
  return false;
}

/** 這張牌有沒有動到魔物——有的話回復要寫成「你回復 N 生命」才分得清誰回血（規格 §6.1 以德服人） */
const FOE_KINDS: ReadonlySet<Effect['kind']> = new Set(
  ['damage', 'damageRandom', 'damageEqualBlock', 'stealBlock', 'removeStatuses', 'transferDebuffs']);
function touchesFoes(effects: readonly Effect[]): boolean {
  return effects.some((e) => FOE_KINDS.has(e.kind) || (e.kind === 'status' && e.target !== 'self'));
}

/**
 * 規格 §6.1 留在牌面上的玩笑話。牌表（`src/content/cards.ts`）沒有這個欄位，
 * 又不歸畫面層去加，所以按牌號補在這裡。
 */
const FLAVOUR: Readonly<Record<string, string>> = { bianshen: '（變成飯糰）' };

function sep(prev: Effect, next: Effect): string {
  // 「獲得 1 隱身」跟「下回合開始再獲得 1 隱身」是兩件事，用分號分開（規格 §6.1 潛水術）
  if (isDive(next)) return '；';
  // 連續兩條都打全體魔物：主詞只講一次，第二條用頓號接在後面（規格 §6.1 催眠術）
  if (namesAllFoes(prev) && namesAllFoes(next) && next.kind === 'status' && prev.kind === 'status') return '、';
  if (next.kind === 'gold' && next.onKill) return '；';
  return CLAUSE_AFTER.has(prev.kind) || CLAUSE_BEFORE.has(next.kind) ? '；' : '，';
}

interface Ctx {
  /**
   * 這條效果掛在能力牌的觸發子句底下——同一條 block 在牌面直接寫是「蜷縮 5」，
   * 掛在觸發底下要寫成「每回合開始獲得 3 蜷縮」（規格 §6.1 結界、秘寶尾巴鈴都是這個講法）。
   */
  inPower?: boolean;
  /** 前一條效果，用來收掉重複的主詞與接「再」 */
  prev?: Effect | undefined;
  /** 這張牌同時動到魔物，回復要寫「你回復」 */
  youHeal?: boolean;
}

/** 一條效果的文字 */
function one(fx: Effect, ctx: Ctx = {}): string {
  switch (fx.kind) {
    case 'damage': {
      // 前面剛「奪走目標全部蜷縮」，這一下要接「再造成 N 傷」（規格 §6.1 交出來）
      const again = ctx.prev?.kind === 'stealBlock' ? '再' : '';
      const head = fx.target === 'all' ? `對全體魔物造成 ${fx.amount} 傷` : `${again}造成 ${fx.amount} 傷`;
      const cap = fx.comboCap === undefined ? '' : `（上限 ${fx.comboCap} 次）`;
      const times = fx.scaleWithCombo
        ? `，次數＝連抓＋1${cap}`
        : (fx.times ?? 1) > 1 ? ` ${fx.times} 次` : '';
      return head + times + (fx.ignoreBlock ? '，無視蜷縮' : '');
    }
    case 'damageRandom': return `造成 ${fx.min}～${fx.max} 隨機傷害`;
    case 'damageEqualBlock': return '對目標造成等同你目前蜷縮值的傷害（蜷縮不減）';
    case 'selfDamage': return `自己受 ${fx.amount} 傷`;
    case 'block': return ctx.inPower ? `獲得 ${fx.amount} 蜷縮` : `蜷縮 ${fx.amount}`;
    case 'stealBlock': return '奪走目標全部蜷縮變成你的';
    case 'draw': return `抽 ${fx.n} 張`;
    case 'drawIfTargetStatus': return `目標有${fx.name}則抽 ${fx.n} 張`;
    case 'drawNextTurn': return `下回合開始多抽 ${fx.n} 張`;
    case 'status': {
      if (isDive(fx)) return `下回合開始再獲得 ${fx.amount} 隱身`;
      const oneShot = ONE_SHOT.has(fx.name);
      const body = oneShot ? fx.name : `${fx.amount} ${fx.name}`;
      const say = (head: string): string => (oneShot ? head + body : `${head} ${body}`);
      if (namesAllFoes(fx) && namesAllFoes(ctx.prev)) {
        // 主詞前一條已經講過了：接在同一條狀態後面就只留層數，接在傷害後面補個「給」
        return ctx.prev?.kind === 'status' ? body : say('給');
      }
      // 自己吃減益要講「自己獲得」，不然「獲得 1 翻肚」會被讀成好事（規格 §6.1 出大事了的措辭）
      return fx.target === 'self' ? say(DEBUFFS.includes(fx.name) ? '自己獲得' : '獲得')
        : fx.target === 'all' ? say('全體魔物獲得')
          : say('給目標');
    }
    case 'removeStatuses': return `移除目標的${fx.names.join('、')}${fx.removeBlock ? '與蜷縮' : ''}`;
    case 'transferDebuffs': return '把你身上的翻肚、懶洋洋、炸毛、噎到全部移到目標身上';
    case 'energy': return `獲得 ${fx.n} 顆飯糰`;
    case 'heal': return `${ctx.youHeal ? '你' : ''}回復 ${fx.n} 生命`;
    case 'gold': return fx.onKill ? `擊倒目標則 +${fx.n} 小魚乾` : `+${fx.n} 小魚乾`;
    case 'scry': return `看抽牌堆頂 ${fx.n} 張、可丟掉任意張`;
    case 'exhaustFromHand': return `消耗手牌中 ${fx.n} 張牌`;
    case 'retainFromHand': return `選 ${fx.n} 張手牌保留到下回合`;
    case 'discardFromHand': return `棄 ${fx.n} 張`;
    case 'recoverFromDiscard': return '從棄牌堆選 1 張牌回到手上';
    case 'doubleNextAttack': return '本回合下一張攻擊牌傷害加倍';
    case 'endTurn': return '然後立刻結束回合';
    case 'noAttacksThisTurn': return '本回合不能再打攻擊牌';
    case 'immuneThisTurn': return '本回合魔物的攻擊全部打不到你';
    case 'power': {
      const inner = fx.effects.map((e) => one(e, { inPower: true })).join('，');
      return fx.trigger === 'turnStart' ? `每回合開始${inner}`
        : fx.trigger === 'onKill' ? `每擊倒一隻魔物${inner}`
          : `回合結束時若本回合沒打攻擊牌，${inner}`;
    }
  }
}

/** 牌面規則文字，措辭照規格 §6.1 的牌表 */
export function describeCard(def: CardDef, upgraded: boolean): string {
  const effects = upgraded ? (def.upgrade.effects ?? def.effects) : def.effects;
  const keywords = upgraded ? (def.upgrade.keywords ?? def.keywords ?? []) : (def.keywords ?? []);
  const parts: string[] = [];
  if (keywords.includes('不可打出')) parts.push('不能打出。');
  if (effects.length) {
    const youHeal = touchesFoes(effects);
    let text = '';
    for (let i = 0; i < effects.length; i++) {
      const fx = effects[i];
      if (!fx) continue;
      const prev = effects[i - 1];
      text += (prev ? sep(prev, fx) : '') + one(fx, { prev, youHeal });
    }
    parts.push(text + (FLAVOUR[def.id] ?? '') + '。');
  }
  if (def.curse?.onTurnEnd) parts.push(`回合結束時若在手牌，受 ${def.curse.onTurnEnd} 傷。`);
  if (def.curse?.onTurnStart) parts.push(`每回合開始若在手牌，受 ${def.curse.onTurnStart} 傷。`);
  if (def.curse?.onDraw) parts.push('抽到時失去 1 顆飯糰。');
  if (keywords.includes('消耗')) parts.push('消耗。');
  if (keywords.includes('保留')) parts.push('保留。');
  return parts.join('');
}
