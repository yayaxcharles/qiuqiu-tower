import { DEBUFFS } from '../engine/types';
import type { CardDef, Effect, StatusName } from '../engine/types';

/**
 * 規格 §6.1 有幾張牌的兩段效果是各自獨立的子句，用分號接才讀得順：
 * 順手牽羊（造成 6 點傷害；打倒牠就多拿 15 條小魚乾）、我在這、戰術撤退、讀心術、拖字訣。
 * 借力使力也算：前半句「造成的傷害等於你現在的蜷縮，而且蜷縮不會因此減少」自己就含逗號，
 * 後面再用逗號接「獲得 6 點蜷縮」會黏成一長串，看不出那 6 點是另一件事。
 */
const CLAUSE_AFTER: ReadonlySet<Effect['kind']> = new Set(['scry', 'retainFromHand', 'damageEqualBlock']);
const CLAUSE_BEFORE: ReadonlySet<Effect['kind']> = new Set(['drawIfTargetStatus', 'noAttacksThisTurn', 'range', 'ifRange', 'poisonBurst', 'rangeGuard', 'poisonOnAttack']);

/** 一次性的狀態：牌面不寫層數（規格 §6.1 定身術、點穴手都只寫「給目標定身」） */
const ONE_SHOT: ReadonlySet<StatusName> = new Set(['定身']);

/**
 * 各狀態的量詞。少了量詞的「獲得 1 隱身」「給目標 2 翻肚」唸起來不像中文，
 * 加上「層／點」才是一句話。分法照規格 §2 的名詞表：
 * 撐幾回合的算層（隱身、翻肚、懶洋洋、炸毛、中毒），數值型的算點（爪力、貓步、反彈）。
 */
export const STATUS_UNIT: Readonly<Record<string, string>> = {
  隱身: '層', 翻肚: '層', 懶洋洋: '層', 炸毛: '層', 中毒: '層',
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
  ['damage', 'damageRamp', 'damageRandom', 'damageEqualBlock', 'damageByRange', 'damageByStatus', 'execByStatus',
   'stealBlock', 'removeStatuses', 'transferDebuffs']);
function touchesFoes(effects: readonly Effect[]): boolean {
  return effects.some((e) => FOE_KINDS.has(e.kind) || (e.kind === 'status' && e.target !== 'self'));
}

/**
 * 這張牌有沒有打魔物——自傷寫成「自己**也**受 N 點傷害」時，那個「也」要有對象才成立。
 * 鐵頭功、亡命是先打人再自傷，「也」對；拼命只有自傷（拿血換飯糰），
 * 寫「也」會害玩家回頭去找那個根本不存在的前一下。
 */
const HURT_KINDS: ReadonlySet<Effect['kind']> = new Set(
  ['damage', 'damageRamp', 'damageRandom', 'damageEqualBlock', 'damageByRange', 'damageByStatus', 'execByStatus']);
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
    case 'damageScatter': return `對隨機魔物造成 ${fx.amount} 點傷害，打 ${fx.times} 次`;
    case 'skipEnemyTurn': return '魔物這回合不出手';
    /*
     * 菲菲的距離（2026-09-12）。措辭刻意不寫「後退」——距離是抽象的「牠離你多遠」，
     * 有些牌是把魔物逼退（煙霧彈）、有些是自己退，寫死動作以後那些牌的文字會對不上圖。
     */
    case 'range': return fx.to !== undefined ? `距離直接變成 ${fx.to}`
      : (fx.n ?? 0) >= 0 ? `距離 +${fx.n ?? 0}` : `距離 ${fx.n ?? 0}`;
    case 'damageByRange': return `造成 ${fx.amount} 點傷害，距離每 1 點再多 ${fx.per} 點`;
    case 'ifRange': return `距離有 ${fx.min} 以上的話，${fx.effects.map((e) => one(e, ctx)).join('，')}`;
    case 'damageByStatus': return `造成等同目標${fx.name}層數的傷害`
      + (fx.consume ? `，然後把${fx.name}清掉` : '');
    case 'execByStatus': return `目標的${fx.name}層數比牠剩下的生命還多的話，直接打倒牠`;
    case 'poisonBurst': return fx.full ? '中毒的魔物被打倒時，剩下的層數每一隻都拿一份'
      : '中毒的魔物被打倒時，把剩下的層數分給其他魔物';
    case 'rangeGuard': return `距離有 ${fx.min} 以上時，魔物的攻擊對你少 ${fx.amount} 點`;
    case 'poisonOnAttack': return `之後每打出一張攻擊牌，再給那個目標 ${fx.n} 層中毒`;
    // 幫隊友的三招（連線版 2026-09-11）。措辭刻意寫成「兩個人一起玩才看得出差別」，
    // 不寫成「給隊友」——單機也抽得到這些牌，說了做不到的事會讓玩家以為壞掉
    case 'blockAll': return `每個人各獲得 ${fx.amount} 點蜷縮`;
    case 'statusAlly': return `同伴獲得 ${fx.amount} ${STATUS_UNIT[fx.name] ?? '層'}${fx.name}（自己一個人時算在自己身上）`;
    case 'taunt': return '這一輪魔物的攻擊全部衝著你來';
    case 'blockAlly': return `同伴獲得 ${fx.amount} 點蜷縮（自己一個人時算在自己身上）`;
    case 'drawAlly': return `同伴抽 ${fx.n} 張牌（自己一個人時算在自己身上）`;
    case 'cleanseAlly': return '清掉同伴身上所有減益（自己一個人時清自己的）';
    case 'energyAlly': return `同伴這回合多 ${fx.n} 顆飯糰（自己一個人時算在自己身上）`;
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
    // `percent` 照實際數字印，不要寫死「一半」：型別上它是任意數字，
    // 哪天加一支回三成的，文字會跟實際回的血對不上（稽核 2026-09-11 低-2）
    case 'heal': return fx.percent
      ? `${ctx.youHeal ? '你' : ''}回復最大生命的 ${fx.percent}%`
      : `${ctx.youHeal ? '你' : ''}回復 ${fx.n} 點生命`;
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

/**
 * 升級版牌面跟沒升級版比起來，動了哪些地方。
 *
 * 玩家的原話：「才知道升級跟沒升級牌的差異」。升級大多只動一兩個數字（造成 6→9 點傷害），
 * 兩張牌並排看還是得逐字比對才找得出差在哪，所以直接把改掉的字標色。
 *
 * `changed`＝升級版文字裡跟原版不一樣的字元位置（標色用）。
 * `removed`＝升級後被拿掉的句子。有三張牌的升級**只是刪東西**（出大事了少掉自傷、踏雪無痕
 * 少掉消耗、催噎少掉那句括號），這種差異在升級版牌面上根本沒有位置可以標色，
 * 光看牌面完全看不出升級了什麼，所以另外撈出來給升級預覽掛在標籤上講。
 *
 * 兩者都用最長共同子序列對齊兩段文字算出來：沒對到的字，在升級版那側就是新增或改動、
 * 在原版那側就是被拿掉的。牌面文字最長六十來字，這個對齊算得很快。
 */
export interface UpgradeDiff {
  changed: ReadonlySet<number>;
  removed: readonly string[];
}

const EMPTY_DIFF: UpgradeDiff = { changed: new Set(), removed: [] };
const diffCache = new Map<string, UpgradeDiff>();

/** 這張牌的文字會不會隨「這場打過幾次」變（只有分身術這種成長牌會）——決定快取要不要把次數算進去 */
function textVariesWithPlays(def: CardDef): boolean {
  const has = (fx: readonly Effect[] | undefined): boolean => (fx ?? []).some((e) => e.kind === 'damageRamp');
  return has(def.effects) || has(def.upgrade.effects);
}

export function upgradeDiff(def: CardDef, plays = 0): UpgradeDiff {
  // 只有成長牌的文字會隨打出次數變，其他牌把次數放進 key 只會讓同一份結果存好幾份
  const key = textVariesWithPlays(def) ? `${def.id}|${plays}` : def.id;
  const hit = diffCache.get(key);
  if (hit) return hit;
  const base = describeCard(def, false, plays);
  const up = describeCard(def, true, plays);
  if (base === up) { diffCache.set(key, EMPTY_DIFF); return EMPTY_DIFF; }

  const n = base.length;
  const m = up.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = base[i] === up[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const changed = new Set<number>();
  const dropped: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === up[j]) { i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { dropped.push(i); i++; }
    else { changed.add(j); j++; }
  }
  for (; i < n; i++) dropped.push(i);
  for (; j < m; j++) changed.add(j);

  // 數字整串一起標：15→25 只有十位變，逐字比對會標成「[2]5」，
  // 一個數字半紅半黑很難讀，所以只要某一位變了就整串都算改過。
  for (let a = 0; a < m; a++) {
    if (!/\d/.test(up[a] ?? '')) continue;
    let b = a;
    while (b + 1 < m && /\d/.test(up[b + 1] ?? '')) b++;
    let hitDigit = false;
    for (let k = a; k <= b; k++) if (changed.has(k)) { hitDigit = true; break; }
    if (hitDigit) for (let k = a; k <= b; k++) changed.add(k);
    a = b;
  }

  const diff: UpgradeDiff = { changed, removed: removedPhrases(base, dropped) };
  diffCache.set(key, diff);
  return diff;
}

/** 升級版牌面文字裡「跟沒升級不一樣」的字元位置（標色用） */
export function upgradedChangedChars(def: CardDef, plays = 0): ReadonlySet<number> {
  return upgradeDiff(def, plays).changed;
}

/**
 * 把「原版有、升級版沒有」的字元位置串成人看得懂的句子。
 *
 * 逐字比對出來的位置常常是零散的（對齊時中間夾了幾個共用字），所以只留連續三字以上的整段，
 * 再把兩端的標點與連接詞修掉——「，自己獲得 1 層翻肚」要變成「自己獲得 1 層翻肚」才唸得順。
 * 修完剩不到兩個字的（只是標點差異）就丟掉，不然標籤上會冒出「。」這種沒意義的東西。
 */
function removedPhrases(base: string, dropped: readonly number[]): string[] {
  const out: string[] = [];
  let k = 0;
  while (k < dropped.length) {
    let e = k;
    while (e + 1 < dropped.length && dropped[e + 1] === dropped[e]! + 1) e++;
    const from = dropped[k]!;
    const to = dropped[e]! + 1;
    if (to - from >= 3) {
      const phrase = base.slice(from, to).replace(/^[，。；、（）\s]+/, '').replace(/[，。；、（）\s]+$/, '');
      if (phrase.length >= 2) out.push(phrase);
    }
    k = e + 1;
  }
  return out;
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
  if (def.needRange) parts.push(`距離要有 ${def.needRange} 才打得出來。`);
  if (keywords.includes('消耗')) parts.push('消耗。');
  if (keywords.includes('保留')) parts.push('保留。');
  if (keywords.includes('虛幻')) parts.push('回合結束還在手上就消失。');
  return parts.join('');
}
