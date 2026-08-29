import { DEBUFFS } from '../engine/types';
import type { CardDef, Effect } from '../engine/types';

/**
 * 規格 §6.1 有幾張牌的兩段效果是各自獨立的子句，用分號接才讀得順：
 * 順手牽羊（造成 6 傷；擊倒目標則 +15 小魚乾）、我在這、戰術撤退、讀心術、拖字訣。
 */
const CLAUSE_AFTER: ReadonlySet<Effect['kind']> = new Set(['scry', 'retainFromHand']);
const CLAUSE_BEFORE: ReadonlySet<Effect['kind']> = new Set(['drawIfTargetStatus', 'noAttacksThisTurn']);

function sep(prev: Effect, next: Effect): string {
  if (next.kind === 'gold' && next.onKill) return '；';
  return CLAUSE_AFTER.has(prev.kind) || CLAUSE_BEFORE.has(next.kind) ? '；' : '，';
}

/**
 * 一條效果的文字。
 * `inPower` 是「這條效果掛在能力牌的觸發子句底下」——同一條 block 在牌面直接寫是「蜷縮 5」，
 * 掛在觸發底下要寫成「每回合開始獲得 3 蜷縮」（規格 §6.1 結界、秘寶尾巴鈴都是這個講法）。
 */
function one(fx: Effect, inPower = false): string {
  switch (fx.kind) {
    case 'damage': {
      const head = fx.target === 'all' ? `對全體魔物造成 ${fx.amount} 傷` : `造成 ${fx.amount} 傷`;
      const cap = fx.comboCap === undefined ? '' : `（上限 ${fx.comboCap} 次）`;
      const times = fx.scaleWithCombo
        ? `，次數＝連抓＋1${cap}`
        : (fx.times ?? 1) > 1 ? ` ${fx.times} 次` : '';
      return head + times + (fx.ignoreBlock ? '，無視蜷縮' : '');
    }
    case 'damageRandom': return `造成 ${fx.min}～${fx.max} 隨機傷害`;
    case 'damageEqualBlock': return '對目標造成等同你目前蜷縮值的傷害（蜷縮不減）';
    case 'selfDamage': return `自己受 ${fx.amount} 傷`;
    case 'block': return inPower ? `獲得 ${fx.amount} 蜷縮` : `蜷縮 ${fx.amount}`;
    case 'stealBlock': return '奪走目標全部蜷縮變成你的';
    case 'draw': return `抽 ${fx.n} 張`;
    case 'drawIfTargetStatus': return `目標有${fx.name}則抽 ${fx.n} 張`;
    case 'drawNextTurn': return `下回合開始多抽 ${fx.n} 張`;
    case 'status':
      // 自己吃減益要講「自己獲得」，不然「獲得 1 翻肚」會被讀成好事（規格 §6.1 出大事了的措辭）
      return fx.target === 'self' ? `${DEBUFFS.includes(fx.name) ? '自己獲得' : '獲得'} ${fx.amount} ${fx.name}`
        : fx.target === 'all' ? `全體魔物獲得 ${fx.amount} ${fx.name}`
          : `給目標 ${fx.amount} ${fx.name}`;
    case 'removeStatuses': return `移除目標的${fx.names.join('、')}${fx.removeBlock ? '與蜷縮' : ''}`;
    case 'transferDebuffs': return '把你身上的翻肚、懶洋洋、炸毛、噎到全部移到目標身上';
    case 'energy': return `獲得 ${fx.n} 顆飯糰`;
    case 'heal': return `回復 ${fx.n} 生命`;
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
      const inner = fx.effects.map((e) => one(e, true)).join('，');
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
    let text = '';
    for (let i = 0; i < effects.length; i++) {
      const fx = effects[i];
      if (!fx) continue;
      const prev = effects[i - 1];
      text += (prev ? sep(prev, fx) : '') + one(fx);
    }
    parts.push(text + '。');
  }
  if (def.curse?.onTurnEnd) parts.push(`回合結束時若在手牌，受 ${def.curse.onTurnEnd} 傷。`);
  if (def.curse?.onTurnStart) parts.push(`每回合開始若在手牌，受 ${def.curse.onTurnStart} 傷。`);
  if (def.curse?.onDraw) parts.push('抽到時失去 1 顆飯糰。');
  if (keywords.includes('消耗')) parts.push('消耗。');
  if (keywords.includes('保留')) parts.push('保留。');
  return parts.join('');
}
