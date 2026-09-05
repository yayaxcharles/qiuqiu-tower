import { DEBUFFS } from '../engine/types';
import type { CardDef, Effect, StatusName } from '../engine/types';

/**
 * 規格 §6.1 有幾張牌的兩段效果是各自獨立的子句，用分號接才讀得順：
 * 順手牽羊（造成 6 點傷害；打倒牠就多拿 15 條小魚乾）、我在這、戰術撤退、讀心術、拖字訣。
 * 借力使力也算：前半句「造成的傷害等於你現在的蜷縮，而且蜷縮不會因此減少」自己就含逗號，
 * 後面再用逗號接「獲得 6 點蜷縮」會黏成一長串，看不出那 6 點是另一件事。
 */
const CLAUSE_AFTER: ReadonlySet<Effect['kind']> = new Set(['scry', 'retainFromHand', 'damageEqualBlock']);
const CLAUSE_BEFORE: ReadonlySet<Effect['kind']> = new Set(['drawIfTargetStatus', 'noAttacksThisTurn']);

/** 一次性的狀態：牌面不寫層數（規格 §6.1 定身術、點穴手都只寫「給目標定身」） */
const ONE_SHOT: ReadonlySet<StatusName> = new Set(['定身']);

/**
 * 各狀態的量詞。少了量詞的「獲得 1 隱身」「給目標 2 翻肚」唸起來不像中文，
 * 加上「層／點」才是一句話。分法照規格 §2 的名詞表：
 * 撐幾回合的算層（隱身、翻肚、懶洋洋、炸毛、噎到），數值型的算點（爪力、貓步、反彈）。
 */
export const STATUS_UNIT: Readonly<Record<string, string>> = {
  隱身: '層', 翻肚: '層', 懶洋洋: '層', 炸毛: '層', 噎到: '層',
  爪力: '點', 貓步: '點', 反彈: '點',
};

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
  ['damage', 'damageRamp', 'damageRandom', 'damageEqualBlock', 'stealBlock', 'removeStatuses', 'transferDebuffs']);
function touchesFoes(effects: readonly Effect[]): boolean {
  return effects.some((e) => FOE_KINDS.has(e.kind) || (e.kind === 'status' && e.target !== 'self'));
}

/**
 * 這張牌有沒有打魔物——自傷寫成「自己**也**受 N 點傷害」時，那個「也」要有對象才成立。
 * 鐵頭功、亡命是先打人再自傷，「也」對；拼命只有自傷（拿血換飯糰），
 * 寫「也」會害玩家回頭去找那個根本不存在的前一下。
 */
const HURT_KINDS: ReadonlySet<Effect['kind']> = new Set(['damage', 'damageRamp', 'damageRandom', 'damageEqualBlock']);
function hurtsFoes(effects: readonly Effect[]): boolean {
  return effects.some((e) => HURT_KINDS.has(e.kind));
}

function sep(prev: Effect, next: Effect): string {
  // 「獲得 1 隱身」跟「下回合開始再獲得 1 隱身」是兩件事，用分號分開（規格 §6.1 潛水術）
  if (isDive(next)) return '；';
  // 連續兩條都打全體魔物：主詞只講一次，第二條用頓號接在後面（規格 §6.1 催眠術）
  if (namesAllFoes(prev) && namesAllFoes(next) && next.kind === 'status' && prev.kind === 'status') return '、';
  if ((next.kind === 'gold' || next.kind === 'energy') && next.onKill) return '；';
  return CLAUSE_AFTER.has(prev.kind) || CLAUSE_BEFORE.has(next.kind) ? '；' : '，';
}

interface Ctx {
  /**
   * 這條效果掛在能力牌的觸發子句底下。
   * 措辭改寫後蜷縮一律講「獲得 N 點蜷縮」，兩種情境已經同一種講法，這個旗標目前不影響文字；
   * 留著是因為 power 的內層仍照它遞迴，之後要分開講時有地方掛。
   */
  inPower?: boolean;
  /** 前一條效果，用來收掉重複的主詞與接「再」 */
  prev?: Effect | undefined;
  /** 這張牌同時動到魔物，回復要寫「你回復」 */
  youHeal?: boolean;
  /** 這張牌同時也打了魔物，自傷才寫得出「自己也受」 */
  alsoHurts?: boolean;
  /** 分身術這場已經打過幾次：牌面要印「這次打出去實際打幾點」，不是永遠印基礎值 */
  plays?: number;
}

/**
 * 一條效果的文字。
 *
 * 2026-08-30 全面改寫措辭：原本是「造成 6 傷」「蜷縮 5」「獲得 1 隱身」這種
 * 沒動詞也沒量詞的寫法，唸出來不像人話。現在一律補齊「N 點傷害」「N 點蜷縮」
 * 「N 層隱身」「N 張牌」，句子也改成台灣人會講的語序。
 */
function one(fx: Effect, ctx: Ctx = {}): string {
  switch (fx.kind) {
    case 'damage': {
      // 前面剛「把目標的防禦全部搶過來」，這一下要接「再造成 N 點傷害」（規格 §6.1 交出來）
      if (fx.ifTargetDebuffed) return `目標身上有任何減益就再造成 ${fx.amount} 點傷害`;
      const again = ctx.prev?.kind === 'stealBlock' ? '再' : '';
      const head = fx.target === 'all' ? `對全體魔物造成 ${fx.amount} 點傷害` : `${again}造成 ${fx.amount} 點傷害`;
      const cap = fx.comboCap === undefined ? '' : `（最多 ${fx.comboCap} 次）`;
      const times = fx.scaleWithCombo
        ? `，打的次數是連抓再加 1${cap}`
        : (fx.times ?? 1) > 1 ? `，連打 ${fx.times} 次` : '';
      return head + times + (fx.ignoreBlock ? '，無視防禦' : '');
    }
    case 'damageRamp': {
      // 疊過就印當下的數字，後面補一句原本幾點，玩家才看得出疊了多少（使用者 2026-09-04）
      const plays = ctx.plays ?? 0;
      const now = fx.amount + fx.step * plays;
      const grew = plays > 0 ? `（原本 ${fx.amount} 點）` : '';
      return `造成 ${now} 點傷害${grew}，這場戰鬥中這張牌每打出一次，傷害就再加 ${fx.step} 點`;
    }
    case 'damageRandom': return `隨機造成 ${fx.min}～${fx.max} 點傷害`;
    case 'damageEqualBlock': return '造成的傷害等於你現在的蜷縮，而且蜷縮不會因此減少';
    case 'selfDamage': return `自己${ctx.alsoHurts ? '也' : ''}受 ${fx.amount} 點傷害`;
    case 'block': return `獲得 ${fx.amount} 點蜷縮`;
    case 'stealBlock': return '把目標的防禦全部搶過來';
    case 'draw': return `抽 ${fx.n} 張牌`;
    case 'drawIfTargetStatus': return `目標身上有${fx.name}就抽 ${fx.n} 張牌`;
    case 'drawNextTurn': return `下回合開始時多抽 ${fx.n} 張牌`;
    case 'status': {
      if (isDive(fx)) return `下回合開始時再獲得 ${fx.amount} 層隱身`;
      if (fx.name === '鐵布衫') return `下回合開始時再獲得 ${fx.amount} 點蜷縮`;
      const oneShot = ONE_SHOT.has(fx.name);
      const body = oneShot ? fx.name : `${fx.amount} ${STATUS_UNIT[fx.name] ?? ''}${fx.name}`;
      const say = (head: string): string => (oneShot ? head + body : `${head} ${body}`);
      if (namesAllFoes(fx) && namesAllFoes(ctx.prev)) {
        // 主詞前一條已經講過了：接在同一條狀態後面只留層數，接在傷害後面補一句誰獲得
        return ctx.prev?.kind === 'status' ? body : say('再讓牠們獲得');
      }
      // 自己吃減益要講「自己獲得」，不然「獲得 1 層翻肚」會被讀成好事（規格 §6.1 出大事了的措辭）
      return fx.target === 'self' ? say(DEBUFFS.includes(fx.name) ? '自己獲得' : '獲得')
        : fx.target === 'all' ? say('全體魔物獲得')
          : say('給目標');
    }
    case 'removeStatuses': return fx.max === undefined
      ? `移除目標的${fx.names.join('、')}${fx.removeBlock ? '與防禦' : ''}`
      : `移除目標最多 ${fx.max} 點${fx.names.join('、')}${fx.removeBlock ? `與 ${fx.max} 點防禦` : ''}`;
    case 'transferDebuffs': return `把你身上的${DEBUFFS.join('、')}全部丟到目標身上`;   // 照引擎的表，不手抄
    case 'cleanse': return fx.max ? `清掉自己身上 ${fx.max} 種減益` : '清掉自己身上所有的減益';
    case 'energy': return fx.onKill ? `打倒牠就拿回 ${fx.n} 顆飯糰` : `獲得 ${fx.n} 顆飯糰`;
    case 'doubleStatus': return `把目標身上的${fx.name}翻倍` + (fx.add ? `，再加 ${fx.add} 層` : '（沒有就沒效果）');
    case 'heal': return `${ctx.youHeal ? '你' : ''}回復 ${fx.n} 點生命`;
    case 'gold': return fx.onKill ? `打倒牠就多拿 ${fx.n} 條小魚乾` : `多拿 ${fx.n} 條小魚乾`;
    case 'scry': return `看抽牌堆最上面 ${fx.n} 張，想丟掉哪幾張都可以`;
    case 'exhaustFromHand': return `消耗手牌裡的 ${fx.n} 張牌`;
    case 'retainFromHand': return `挑 ${fx.n} 張手牌留到下回合`;
    case 'discardFromHand': return `丟掉 ${fx.n} 張牌`;
    case 'recoverFromDiscard': return '從棄牌堆挑 1 張牌回到手上';
    case 'doubleNextAttack': return '本回合打出的下一張攻擊牌，傷害加倍';
    case 'endTurn': return '然後直接結束這回合';
    case 'noAttacksThisTurn': return '這回合不能再打攻擊牌';
    case 'immuneThisTurn': return '這回合魔物打不到你';
    case 'power': {
      const inner = fx.effects.map((e) => one(e, { inPower: true })).join('，');
      // 只限本回合的能力一定要講出來，不然玩家會當成永久的（2026-09-04 起沒有牌用 `thisTurn`，保留給日後）
      const scope = fx.thisTurn ? '這回合內，' : '';
      return fx.trigger === 'turnStart' ? `${scope}每回合開始時${inner}`
        : fx.trigger === 'onKill' ? `${scope}每打倒一隻魔物就${inner}`
          : `${scope}回合結束時，如果這回合沒打過攻擊牌，${inner}`;
    }
  }
}

/** 牌面規則文字，措辭照規格 §6.1 的牌表 */
export function describeCard(def: CardDef, upgraded: boolean, plays = 0): string {
  const effects = upgraded ? (def.upgrade.effects ?? def.effects) : def.effects;
  const keywords = upgraded ? (def.upgrade.keywords ?? def.keywords ?? []) : (def.keywords ?? []);
  const parts: string[] = [];
  if (keywords.includes('不可打出')) parts.push('不能打出。');
  // 打得出來卻什麼都不做的牌（黏液）：規則就是「花那點飽足把它丟掉」，要講清楚，
  // 不然牌面只剩一句「消耗。」，玩家會以為漏了什麼
  if (!effects.length && !keywords.includes('不可打出')) parts.push('打出去什麼事都不會發生。');
  if (effects.length) {
    const youHeal = touchesFoes(effects);
    const alsoHurts = hurtsFoes(effects);
    let text = '';
    for (let i = 0; i < effects.length; i++) {
      const fx = effects[i];
      if (!fx) continue;
      const prev = effects[i - 1];
      text += (prev ? sep(prev, fx) : '') + one(fx, { prev, youHeal, alsoHurts, plays });
    }
    // 這裡曾經按牌號補一句玩笑話（變身術的「（變成飯糰）」）。拿掉了：飯糰是飽足的單位，
    // 玩家看到「獲得 9 點蜷縮（變成飯糰）」會以為那張牌還附送一顆飯糰，真的有人這樣問過。
    // 牌面只講規則，玩笑話交給圖去講。
    parts.push(text + '。');
  }
  if (def.curse?.onTurnEnd) parts.push(`回合結束時還在手上的話，受 ${def.curse.onTurnEnd} 點傷害。`);
  if (def.curse?.onTurnStart) parts.push(`每回合開始時還在手上的話，受 ${def.curse.onTurnStart} 點傷害。`);
  if (def.curse?.onDraw) parts.push('抽到的時候會少 1 顆飯糰。');
  if (keywords.includes('消耗')) parts.push('消耗。');
  if (keywords.includes('保留')) parts.push('保留。');
  if (keywords.includes('虛幻')) parts.push('回合結束還在手上就消失。');
  return parts.join('');
}
