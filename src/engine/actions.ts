import { cardById } from '../content/cards';
import { enemyById } from '../content/enemies';
import { relicById } from '../content/relics';
import { draw } from './deck';
import { applyEffects } from './effects';
import { addStatus, computeAttack, computeBlock, getStatus, removeStatus } from './statuses';
import { DEBUFFS } from './types';
import { learnedMove, learnsPlayerCards } from './mimic';
import type { CardInstance, CombatState, EnemyCombat, EnemyEffect, EnemyMove, EnemyPhase, PlayerCombat, Unit, StatusName } from './types';

/** 沉睡中的魔物頭上顯示的意圖。每次都是同一份物件，畫面比對「這一拍出的是哪一招」才穩 */
export const SLEEP_MOVE: EnemyMove = { intent: 'idle', label: '呼呼大睡', effects: [{ kind: 'nothing' }] };
/**
 * 血條式變身（`hpBar`，今天只有師父）打完一條血之後的那一拍：蹲下來、無敵一回合。
 *
 * **提成常數是為了讓回合尾端認得出它**（稽核 2026-09-10 高-1）：那一招是在
 * `damageEnemy` 裡當場塞進 `e.move` 的，如果尾端照常 `advanceMove`，它會被下一階段的第一招蓋掉，
 * 玩家白賺的那個調息回合就整個消失、下一回合直接吃滿傷害。
 * 跟 `SLEEP_MOVE` 同一套：靠物件身分比對（`e.move === REST_MOVE`），所以一定要共用同一個物件。
 */
export const REST_MOVE: EnemyMove = { intent: 'special', label: '蹲下調息', effects: [{ kind: 'nothing' }] };

export function log(cs: CombatState, msg: string): void { cs.log.push(msg); }

/** 秘寶發動那一行的開頭。同一拍連著發動的會併進同一行（見 `fireRelic`） */
const RELIC_LOG = '秘寶發動：';

/**
 * 記一筆「這件秘寶剛剛動了」，並印進戰報。
 *
 * 秘寶的效果多半是靜悄悄套上去的——靈貓鈴多抽一張牌、貓抓板多長一點蜷縮，數字就這樣變了，
 * 玩家不知道是誰做的，久了會以為那件秘寶根本沒作用（使用者 2026-09-10 點名要補回饋）。
 * 每個掛鉤**真的做了事**的那一刻叫一次；純粹一直生效、沒有「發動」時刻可言的不叫。
 *
 * 注意有的效果自己也會印一行（鐵砂衣的開場自傷走 `selfDamage`，`effects.ts` 對秘寶來源的自傷
 * 會印「秘寶的代價：失去 N 點生命」），那種就會是兩行——那是對的，代價本來就該講清楚。
 *
 * **連著發動的併成一行**（稽核 2026-09-10 中-4）：紀錄框只顯示最後四行。
 * 開場帶六件秘寶時實測九行紀錄裡看得到的四行全是「發動」，三隻魔物的開場台詞一句都不剩；
 * 靜靜過一回合也會被回合開始與回合結束那兩批塞滿。用「上一行也是發動就接在後面」的作法，
 * 開場那一批、回合開始那一批、回合結束那一批、一拍清場那一批各自天然收成一行，
 * 而且不必替不同掛鉤訂不同規則——中間只要插進任何別的紀錄（鐵砂衣的自傷、魔物出招），
 * 下一件就會自己另起一行，順序讀起來仍然是對的。
 */
export function fireRelic(cs: CombatState, id: string): void {
  const def = relicById[id];
  if (!def) return;
  cs.relicFired.push(id);
  const last = cs.log[cs.log.length - 1];
  if (last === undefined || !last.startsWith(RELIC_LOG)) { log(cs, `${RELIC_LOG}${def.name}`); return; }
  const body = last.slice(RELIC_LOG.length);
  /**
   * 同一件在同一行裡不重複寫（稽核 2026-09-10 複核 中-2）。
   * 資料表裡有四種組合會讓同一件在同一拍叫兩次以上：紙鶴書籤同掛第一回合多抽與多吃、
   * 魔氣護符與黑貓面具的加成跟開場效果、以及一拍打死好幾隻時擊倒獎勵每隻各叫一次。
   * 畫面那側有 `new Set` 擋著，戰報這側沒有，會印成「秘寶發動：沙丁魚罐、沙丁魚罐、沙丁魚罐」。
   */
  const folded = /^(.+)…等 (\d+) 件$/.exec(body);
  if (folded) {
    if (folded[1]!.split('、').includes(def.name)) return;
    cs.log[cs.log.length - 1] = `${RELIC_LOG}${folded[1]}…等 ${Number(folded[2]) + 1} 件`;
    return;
  }
  const names = body.split('、');
  if (names.includes(def.name)) return;
  /**
   * 第四件起收成「…等 N 件」（稽核 2026-09-10 複核 低-2）。
   * 併成一行解掉了「四筆都是發動」，但紀錄框只有 216 像素寬、放得下約五個視覺行，
   * 開場帶八件會發動的秘寶時那一筆會自己折成三四行，魔物的開場台詞照樣被擠出框外。
   */
  cs.log[cs.log.length - 1] = names.length >= 3
    ? `${RELIC_LOG}${names.join('、')}…等 ${names.length + 1} 件`
    : `${RELIC_LOG}${names.join('、')}、${def.name}`;
}

/**
 * 只推進「發動過」的清單、不印紀錄。
 *
 * 給**自己已經有專屬紀錄句**的那幾件用（最後一口氣「替球球挨了這一下」、秘笈「第一擊加倍」、
 * 暖毯「還熱著」）：那些句子講得比「發動」清楚，再多印一行是重複。
 * 但畫面那側的金光與名牌照樣要演，所以清單一定要推。
 */
export function markRelic(cs: CombatState, id: string): void {
  if (relicById[id]) cs.relicFired.push(id);
}

export function aliveEnemies(cs: CombatState): EnemyCombat[] { return cs.enemies.filter((e) => !e.dead); }
export function findEnemy(cs: CombatState, uid: number): EnemyCombat | undefined { return cs.enemies.find((e) => e.uid === uid && !e.dead); }
export function hasRelic(cs: CombatState, id: string): boolean { return cs.relics.includes(id); }

export function gainBlock(cs: CombatState, u: Unit, base: number): number {
  const v = computeBlock(base, u);
  u.block += v;
  return v;
}

/** 每回合第一次拿隱身時吃秘寶加成（紙袋的 stealthBonus），加成量由秘寶資料決定 */
// 隱身**沒有上限**（使用者 2026-09-04 明示：要能無限疊，不能設上限；平衡靠「蜷縮先擋」的判定順序與看破）
export function gainStealth(cs: CombatState, n: number, p: PlayerCombat = cs.player): void {
  let amt = n;
  // 加成的那幾件也要看得到在做事（稽核 2026-09-10 中-3）：這裡是它們唯一的「發動時刻」
  for (const id of cs.relics) {
    const h = relicById[id]?.hooks;
    if (!h) continue;
    const first = !p.firstStealthGiven && (h.stealthBonus ?? 0) > 0;
    if (first || (h.stealthBonusEvery ?? 0) > 0) fireRelic(cs, id);
  }
  if (!p.firstStealthGiven) amt += cs.relics.reduce((s, id) => s + (relicById[id]?.hooks.stealthBonus ?? 0), 0);
  amt += cs.relics.reduce((s, id) => s + (relicById[id]?.hooks.stealthBonusEvery ?? 0), 0);   // 影披風：每次都加（審查 #6）
  p.firstStealthGiven = true;
  addStatus(p, '隱身', amt);
}

export function healPlayer(cs: CombatState, n: number, p: PlayerCombat = cs.player): number {
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  return p.hp - before;
}

export function drawCards(cs: CombatState, n: number, p: PlayerCombat = cs.player): CardInstance[] { return draw(p, n, cs.rng); }

/**
 * 魔物塞牌給球球（黏液、眼冒金星）。
 *
 * `discard`＝丟進棄牌堆（這一輪打不到，洗牌之後才會遇到）；
 * `draw`＝洗進抽牌堆的隨機位置（可能下一張就抽到，比較討厭）。
 * 位置只用 `cs.rng`，同種子才重現得出同一局。
 */
export function giveCards(cs: CombatState, from: EnemyCombat, cardId: string, n: number, to: 'discard' | 'draw',
                          p: PlayerCombat = cs.player): void {
  const def = cardById[cardId];
  if (!def) throw new Error(`未知的牌：${cardId}`);
  for (let i = 0; i < n; i++) {
    const card: CardInstance = { uid: cs.nextCardUid++, cardId, upgraded: false };
    if (to === 'discard') p.discardPile.push(card);
    else p.drawPile.splice(cs.rng.int(0, p.drawPile.length), 0, card);
  }
  log(cs, `${from.name}把 ${n} 張「${def.name}」塞進你的${to === 'discard' ? '棄牌堆' : '抽牌堆'}`);
}

/**
 * 魔物（或自傷）打球球。direct＝不看隱身、不看蜷縮、不套公式（自傷、噎到、壞毛病用）；
 * pierce＝穿透：套公式、吃隱身與反彈，但**跳過蜷縮**（師父的穿心掌、亡命一擊）
 */
/**
 * 甲吃掉這一下的傷害，回傳還剩多少會扣到血（武士球球，2026-09-05）。
 *
 * 擺在蜷縮之後、生命之前。**穿透（pierce）穿得過蜷縮但擋在這裡**——使用者拍板：穿透本來就是
 * 設計來剋「堆蜷縮龜縮」的，而甲是整場有限的資源、堆不起來，不需要再被剋一次，
 * 不然武士打師父那場沒得打。
 */
function eatArmour(cs: CombatState, p: PlayerCombat, lose: number): number {
  if (lose <= 0 || p.armour <= 0) return lose;
  const eaten = Math.min(p.armour, lose);
  p.armour -= eaten;
  log(cs, `甲擋下了 ${eaten} 點${p.armour === 0 ? '，甲碎了' : ''}`);
  return lose - eaten;
}

export function damagePlayer(cs: CombatState, attacker: Unit, base: number,
                             opts: {
                               direct?: boolean; pierce?: boolean; throughBlock?: boolean;
                               /**
                                * 打在**誰**身上（連線版第一步 2026-09-11）。不填就是第一位玩家，
                                * 單機跟以前一模一樣。放在選項袋而不是參數位置，是因為這支有五十幾個
                                * 呼叫點，硬插一個參數會把每一處都改動一遍、看不出哪一處是真的改了行為。
                                */
                               victim?: PlayerCombat;
                             } = {}): number {
  const p = opts.victim ?? cs.player;
  let lose: number;
  if (opts.direct) {
    lose = base;
    // 反彈那種「直傷但先扣蜷縮」（使用者 2026-09-03：被反彈的人都應該優先扣蜷縮，蜷縮 4 被反彈 2 就剩 2）
    if (opts.throughBlock) {
      const absorbed = Math.min(p.block, base); p.block -= absorbed; lose = base - absorbed;
      if (absorbed > 0) log(cs, `蜷縮擋下了 ${absorbed} 點`);
    }
    lose = eatArmour(cs, p, lose);
  } else {
    if (p.immune) { log(cs, '球球躲在角落，什麼都沒看到'); return 0; }
    const dmg = computeAttack(base, attacker, p);
    // 判定順序改成「蜷縮先擋，擋不完的那一下才用隱身閃」（使用者 2026-09-04：隱身判定在前、強度又比蜷縮高太多，玩家只拿隱身不拿蜷縮）。
    // 隱身只在「蜷縮擋完還有剩」時才消耗一層，整下落空；穿透招蜷縮擋不住，還是直接看隱身。
    const absorbed = opts.pierce ? 0 : Math.min(p.block, dmg);
    if (dmg - absorbed > 0 && getStatus(p, '隱身') > 0) {
      p.block -= absorbed;
      if (absorbed > 0) log(cs, `蜷縮擋下了 ${absorbed} 點`);
      addStatus(p, '隱身', -1); log(cs, '球球閃過了'); return 0;
    }
    p.block -= absorbed;
    lose = dmg - absorbed;
    lose = eatArmour(cs, p, lose);
    // 擋下來要留紀錄：畫面靠這行飄「擋住 N」跟盾牌，不然整下被吃掉看起來像沒打到（使用者回報）
    if (absorbed > 0) log(cs, `蜷縮擋下了 ${absorbed} 點`);
    if (opts.pierce && dmg > 0) log(cs, '這一下穿過了蜷縮');
    const thorns = getStatus(p, '反彈');
    if (dmg > 0 && thorns > 0 && attacker !== p) {
      const e = cs.enemies.find((x) => x === attacker);
      if (e) {
        log(cs, `反彈回敬了${e.name} ${thorns} 點`);   // 畫面靠這行飄「反彈！」——被反彈打死的魔物本來只是默默消失（使用者回報）
        damageEnemy(cs, e, thorns, { direct: true, throughBlock: true });
      }
    }
  }
  p.hp -= lose;
  // 已經打贏了，殘餘效果（自傷、壞毛病）不會把球球打死
  if (cs.phase === 'won') { p.hp = Math.max(1, p.hp); return lose; }
  if (p.hp <= 0) {
    // 擋一次致命傷的秘寶由資料決定（最後一口氣的 preventLethal），不要把 id 寫死在引擎裡
    const saverId = cs.relics.find((id) => relicById[id]?.hooks.preventLethal);
    if (saverId && !p.lethalPrevented) {
      p.hp = 1; p.lethalPrevented = true;
      // 這條自己有專屬的紀錄句子（比「發動」講得清楚），所以只推清單、不再多印一行
      markRelic(cs, saverId);
      log(cs, `${relicById[saverId]?.name ?? '秘寶'}替球球挨了這一下`);
    }
    else { p.hp = 0; cs.phase = 'lost'; }
  }
  return lose;
}

function currentPhase(e: EnemyCombat): EnemyPhase | undefined {
  return enemyById[e.enemyId]?.phases?.[e.phase - 1];
}
function moveSet(e: EnemyCombat): { moves: EnemyMove[]; pattern: 'cycle' | 'random' } {
  const def = enemyById[e.enemyId]!;
  const ph = currentPhase(e);
  return ph ? { moves: ph.moves, pattern: ph.pattern } : { moves: def.moves, pattern: def.pattern };
}

/**
 * 兩次召喚之間**至少要隔幾個牠自己的回合**（使用者 2026-09-10：
 * 「尾巴不能一直招喚，至少要相隔四個回合……不然永遠打不完」）。
 *
 * 4 ＝ 貓又婆婆本來就在用的節奏（第 1 回合放、第 4 回合預告、第 5 回合再放）。
 * 實測沒守規矩的有三隻：花栗鼠間隔 1,3,2,1,1,2,2,1（幾乎每回合都在叫同伴）、
 * 傀儡師 3、狸大人 2。**寫在引擎不寫在各隻的招式表**：這是通則，
 * 寫進資料的話下次加新怪一定會忘，而且忘了不會有任何測試爆掉。
 *
 * 玩家看得到的預告不受影響：`advanceMove` 本來就在牠出手的**前一個回合**排好招，
 * 所以「牠要召喚了」照樣會提前一回合亮在牠頭上。
 */
export const SUMMON_GAP = 4;

/**
 * 偷到東西之後**至少要撐幾個回合才准帶著跑**（使用者 2026-09-10：
 * 「第二回合橘貓山賊偷到了 10 條小魚乾，就得第 6 回合準備逃跑，第 7 回合才能跑掉」）。
 *
 * 5 ＝ 從偷到的那個回合算起，第 5 個回合之後才逃得掉：偷在第 2 回合 → 最快第 7 回合跑。
 * 頭上的「逃走」預告會在**前一個回合**（第 6 回合）就亮出來，那就是使用者說的「準備逃跑」——
 * `advanceMove` 本來就提前一回合排招，不必另外做預告招。
 *
 * **沒偷到東西就不准跑**：牠是來搶劫的，空手跑掉沒有意義，而且玩家會覺得被耍。
 * 冷卻記在**每一隻身上**，所以兩隻山賊各偷各的、各跑各的，不會被綁在一起。
 */
export const ESCAPE_GAP = 5;

/** 這一招會不會生出東西來 */
function isSummon(m: EnemyMove): boolean { return m.effects.some((f) => f.kind === 'summon'); }

/**
 * 這一招現在放得出來嗎。只擋兩種有冷卻的行為（召喚、帶錢逃跑），其他招一律放行。
 * 擋住的話 `advanceMove` 會改挑別招，冷卻好了自然輪回來。
 */
function moveReady(cs: CombatState, e: EnemyCombat, m: EnemyMove): boolean {
  if (isSummon(m)) {
    return e.lastSummonTurn === undefined || (e.turnCount + 1) - e.lastSummonTurn >= SUMMON_GAP;
  }
  if (m.effects.some((f) => f.kind === 'escape')) {
    if (e.stolen <= 0 || e.stolenTurn === undefined) return false;   // 空手不跑
    return (cs.turn + 1) - e.stolenTurn >= ESCAPE_GAP;
  }
  return true;
}

export function advanceMove(cs: CombatState, e: EnemyCombat): void {
  // 換階段排好的那一招優先（見 EnemyCombat.queuedMove）：它就是為了「下一回合才亮出來」而存在的
  if (e.queuedMove) {
    const q = e.queuedMove;
    delete e.queuedMove;
    // 冷卻沒到就先放著，等冷卻好了再輪到它（不是丟掉——換階段那招是設計的一部分）
    if (moveReady(cs, e, q)) { e.move = q; return; }
    e.queuedMove = q;
  }
  // 照著學的（鏡中球球）每一動都從球球的牌組抽，抽不到才照表
  if (learnsPlayerCards(e)) { const learned = learnedMove(cs); if (learned) { e.move = learned; return; } }
  const { moves, pattern } = moveSet(e);
  /**
   * 被冷卻擋掉的那一招**排進佇列，不是丟掉**（稽核 2026-09-10 中-1）。
   *
   * 原本只是「跳過、挑別招」，於是循環表的索引推過了那一格，橘貓山賊的「逃走」得再繞一整圈
   * 才輪回來——實測第 9 回合才跑，比使用者要的第 7 回合晚兩輪。
   * 排進佇列之後，`advanceMove` 開頭會優先看它、冷卻一好就立刻輪到，
   * 而且佇列只裝一招，不會愈積愈多。
   */
  const hold = (m: EnemyMove): void => { if (!e.queuedMove) e.queuedMove = m; };
  // 照表出招的怪先問表（turnCount 是「已經行動過的回合數」，下一動＝+1）
  const scripted = enemyById[e.enemyId]?.chooseMove?.(e.turnCount + 1, moves);
  if (scripted) {
    if (moveReady(cs, e, scripted)) { e.move = scripted; return; }
    hold(scripted);
  }
  if (pattern === 'random') {
    // 抽到冷卻中的就改抽別的；整組都放不出來的話只好照抽（那種怪不存在，但不要因此當掉）
    const ok = moves.filter((m) => moveReady(cs, e, m));
    e.move = cs.rng.pick(ok.length ? ok : moves);
    return;
  }
  /**
   * 循環表：往下找第一招放得出來的。整圈都放不出來就**照原本那一招**（`i === moves.length` 時
   * 算出來的索引就是 `moveIndex` 本身），不讓它卡死——今天沒有任何一隻的招式表全是召喚或逃走，
   * 走不到這條，但不留退路的話以後加一隻就會無限迴圈（稽核 2026-09-10 低-2 修正註解）。
   *
   * **被擋掉的那一格不算走過**（稽核 2026-09-10 中-1）：原本 `e.moveIndex = idx` 會把索引推過
   * 那一格，橘貓山賊的「逃走」被冷卻擋掉之後就得再繞一整圈才輪回來，實測第 9 回合才跑、
   * 比使用者要的第 7 回合晚兩輪，還多偷了一輪。改成「填空的那一招不動索引」，
   * 冷卻一好，下一回合第一個候選還是它。
   */
  for (let i = 1; i <= moves.length; i++) {
    const idx = (e.moveIndex + i) % moves.length;
    const m = moves[idx] as EnemyMove;
    if (moveReady(cs, e, m) || i === moves.length) { e.moveIndex = idx; e.move = m; return; }
    hold(m);   // 這一格被冷卻擋住：記著，冷卻好了第一個就輪它
  }
}

function checkPhase(cs: CombatState, e: EnemyCombat): void {
  const def = enemyById[e.enemyId]!;
  const next = def.phases?.[e.phase];
  // hpBelow 語意＝「生命 ≤ 此值就切換」，所以剛好等於門檻也要進下一階段。
  // 血條式（hpBar）的階段不走這裡——那種要等整條血歸零，在 damageEnemy 裡切換。
  if (!next || next.hpBelow === undefined || e.hp > next.hpBelow || e.dead) return;
  e.phase += 1;
  // 用 onEnterMove 時 moveIndex 設 -1：那招做完 advanceMove 會 +1，新階段從第一招開始（稽核 2026-09-04 L-5）
  e.moveIndex = next.onEnterMove ? -1 : 0;
  if (next.line) log(cs, `${e.name}：${next.line}`);
  runEnemyEffects(cs, e, next.onEnter, false);
  if (next.onEnterMove) {
    // **排隊、不當場換掉頭上的預告**（使用者 2026-09-10：「第七回合牠是補血，結果又直接跑出兩條尾巴」）。
    // 這條大多在**玩家回合中途**觸發（打過血量門檻），當場改 `move` 等於預告說謊：
    // 玩家照著「吸魂」規劃完整個回合，牠卻在同一回合放尾巴。詳見 `EnemyCombat.queuedMove`。
    e.queuedMove = next.onEnterMove;
  } else {
    e.move = def.chooseMove?.(e.turnCount + 1, next.moves)
      ?? (next.pattern === 'random' ? cs.rng.pick(next.moves) : (next.moves[0] as EnemyMove));
  }
}

/**
 * 這隻倒下之後會不會爬回來：要在同生共死組、沒標「倒了就倒了」（`neverRevive`）、沒逃走、
 * 而且同組還有人站著。引擎的擊倒與復活迴圈、畫面的「重生中」殘影三處共用這一支——
 * 原本各寫一份，`killEnemy` 那份漏了 `neverRevive`，蛙大名先倒就永遠掛「重生中 2」、
 * 擊倒秘寶全不發（全面體檢 2026-09-05 #1）。
 */
export function willRevive(cs: CombatState, e: EnemyCombat): boolean {
  const rd = enemyById[e.enemyId];
  if (!rd?.reviveGroup || rd.neverRevive || e.escaped) return false;
  return cs.enemies.some((o) => o !== e && !o.dead && enemyById[o.enemyId]?.reviveGroup === rd.reviveGroup);
}

function killEnemy(cs: CombatState, e: EnemyCombat): void {
  e.dead = true;
  // 同生共死組的成員倒下就開始倒數「重生中」；沒有同組概念的魔物、或同伴已經都不在的維持 0
  // （同伴都不在的不該再占召喚名額，稽核 2026-09-04 L-4）
  const reviving = willRevive(cs, e);
  // 預設躺兩回合（使用者 2026-09-03：一回合就爬起來沒緩衝；躺著期間把其他同伴清掉就算贏）
  e.reviveIn = reviving ? (enemyById[e.enemyId]?.reviveDelay ?? 2) : 0;
  cs.kills += 1;
  const def = enemyById[e.enemyId]!;
  if (def.onDeathHealPlayer) healPlayer(cs, def.onDeathHealPlayer);
  if (e.stolen > 0) { cs.fishDelta += e.stolen; cs.stolenFish -= e.stolen; e.stolen = 0; }
  // 同生共死組還有同伴站著＝這隻等一下會爬回來，倒下不算真的擊倒：擊倒獎勵（能力、秘寶）不發（審查 #11）
  // 擊倒的那位（連線版第二步要由 damageEnemy 一路帶下來「是誰打的」，現在只有一位）
  const killer = cs.player;
  if (!reviving) for (const pw of killer.powers) if (pw.trigger === 'onKill') applyEffects(cs, pw.effects, { self: killer, source: 'power' });
  // 打倒魔物的秘寶效果（沙丁魚罐回血、黑曜爪爪力、銅錢劍小魚乾）
  if (!reviving) for (const rid of cs.relics) {
    const h = relicById[rid]?.hooks;
    if (!h) continue;
    // 滿血時沙丁魚罐回 0 點：那一下什麼都沒發生，不該閃金光也不該佔一格紀錄（稽核 2026-09-10 低-9）
    const heals = !!h.killHeal && cs.player.hp < cs.player.maxHp;
    if (heals || h.killStrength || h.killFish) fireRelic(cs, rid);
    if (h.killHeal) healPlayer(cs, h.killHeal);
    if (h.killStrength) addStatus(cs.player, '爪力', h.killStrength);
    if (h.killFish) cs.fishDelta += h.killFish;
  }
  if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won';
}

/**
 * 這隻**現在打不打得到**——不是「還活著」而已。
 *
 * 有兩種活著卻完全吃不到傷害的狀態，`damageEnemy` 一進去就回 0：
 * 蹲下調息（`invulnIn`，血條式關主的變身過場）與僕從護體（`guardedByAllies`，旁邊還有同伴）。
 * 玩家自己指定目標時看得到不能打、不會浪費，**隨機挑目標的效果就得自己問這一句**
 *（稽核 2026-09-11 中-2：貓爪雷三下全抽到調息中的關主＝ 65 條小魚乾買到 0 傷害，
 * 而且那正是最想用它的場合）。`smartbot.ts` 的估算也共用這一支，判準只留一份。
 */
export function attackable(cs: CombatState, e: EnemyCombat): boolean {
  if (e.dead || e.invulnIn > 0) return false;
  if (enemyById[e.enemyId]?.guardedByAllies && cs.enemies.some((o) => o !== e && !o.dead)) return false;
  return true;
}

export function damageEnemy(cs: CombatState, e: EnemyCombat, base: number,
  opts: { ignoreBlock?: boolean; noStrength?: boolean; direct?: boolean; throughBlock?: boolean } = {}): { dealt: number; killed: boolean } {
  if (e.dead) return { dealt: 0, killed: false };
  // 蹲下調息中（血條式變身的過場）：無敵，什麼傷害都不吃
  if (e.invulnIn > 0) {
    // 每回合開頭固定會用 0 點的噎到結算走進來一次，那時沒人打他，別寫「毫髮無傷」——
    // 玩家看到這行會以為自己漏看了一次攻擊（使用者 2026-09-08）。真的有東西打過來才記
    if (base > 0) log(cs, `${e.name}正在調息，毫髮無傷`);
    return { dealt: 0, killed: false };
  }
  // 僕從護體：還有同伴活著就毫髮無傷（含直傷）。放在隱身之前——被護著的時候不消耗隱身層數
  if (enemyById[e.enemyId]?.guardedByAllies && cs.enemies.some((o) => o !== e && !o.dead)) {
    log(cs, `${e.name}被僕從護著，毫髮無傷`);
    return { dealt: 0, killed: false };
  }
  let lose: number;
  let dmg = 0;   // 真的打進去的量；反彈要看它，0 傷不該被刺（直傷分支維持 0，直傷本來就不觸發反彈）
  if (opts.direct) {
    lose = base;
    // 反彈：直傷但先扣魔物的防禦（同上，兩邊規則一樣）
    if (opts.throughBlock) {
      const absorbed = Math.min(e.block, base); e.block -= absorbed; lose = base - absorbed;
      if (absorbed > 0) log(cs, `${e.name}的防禦擋下了 ${absorbed} 點`);
    }
  } else {
    if (getStatus(e, '隱身') > 0) { addStatus(e, '隱身', -1); log(cs, `${e.name}閃過了`); return { dealt: 0, killed: false }; }
    dmg = computeAttack(base, cs.player, e, { noStrength: opts.noStrength });
    // 飛行：打得到的只有一半，**先減半再扣防禦**（燈蛾、月蛾后）。噎到那種直傷不吃這條
    if (getStatus(e, '飛行') > 0 && dmg > 0) { dmg = Math.floor(dmg / 2); log(cs, `${e.name}在天上，這一下只擦到一半`); }
    if (opts.ignoreBlock) lose = dmg;
    else {
      const absorbed = Math.min(e.block, dmg); e.block -= absorbed; lose = dmg - absorbed;
      if (absorbed > 0) log(cs, `${e.name}的防禦擋下了 ${absorbed} 點`);   // 同上：魔物那邊也要飄「擋住 N」
    }
  }
  // 魔物身上的反彈：你每打一下就被刺一下（刺蝟師傅、龜甲、師父第三條血——以前只有球球的反彈有效）。
  // 跟球球側同一條規則：真的有傷害才刺——蜷縮 0 時打「等同蜷縮」、被飛行減半到 0 都不該掉血（全面體檢 2026-09-05）
  if (!opts.direct && dmg > 0) {
    const th = getStatus(e, '反彈');
    if (th > 0) { log(cs, `${e.name}的刺反彈了 ${th} 點`); damagePlayer(cs, e, th, { direct: true, throughBlock: true }); }
  }
  // 虛化（虛無貓）：身體半透明，**每一段**傷害最多只扣 1 點血——攻擊、噎到、反彈一視同仁。
  // 擺在扣血之前、防禦結算之後：防禦照原本的量擋掉，虛化只管「真的扣進血條的那幾點」
  if (getStatus(e, '虛化') > 0 && lose > 1) {
    log(cs, `${e.name}半透明的，這一下只碰到 1 點`);
    lose = 1;
  }
  cs.hits.push({ uid: e.uid, amount: Math.min(lose, e.hp) });   // 每一段各記一筆（含被擋成 0 的）、只記真的扣到血的量，畫面拆多段用
  cs.damageDealt += Math.min(lose, e.hp);   // 整場累計（`hits` 每回合會清掉，不能拿來加總），魔物散掉時的獎勵門檻看它
  e.hp = Math.max(0, e.hp - lose);
  if (lose > 0) {
    // 打痛牠才會發生的四件事。擺在扣血之後、判死之前：被一擊打死的當然不用醒也不用縮。
    // 飛行、鱗甲只被「攻擊」剝落（噎到那種直傷不算）；沉睡與縮殼是**任何**扣血都算
    if (!opts.direct) {
      if (getStatus(e, '飛行') > 0) { addStatus(e, '飛行', -1); if (getStatus(e, '飛行') === 0) log(cs, `${e.name}被打了下來`); }
      if (getStatus(e, '鱗甲') > 0) { addStatus(e, '鱗甲', -1); log(cs, `${e.name}的鱗甲剝落了一層`); }
    }
    if (getStatus(e, '沉睡') > 0 && e.hp > 0) {
      removeStatus(e, '沉睡');
      log(cs, `${e.name}被打醒了`);
      const wake = enemyById[e.enemyId]?.onWake;
      if (wake) runEnemyEffects(cs, e, wake, false);
      e.moveIndex = -1;   // 醒過來從招式表的第一招開始（advanceMove 會 +1）
      advanceMove(cs, e);
    }
    if (getStatus(e, '縮殼') > 0 && e.hp > 0) {
      const n = getStatus(e, '縮殼');
      removeStatus(e, '縮殼');   // 一場只縮一次
      gainBlock(cs, e, n);
      log(cs, `${e.name}縮回殼裡，長出 ${n} 點防禦`);
    }
  }
  if (e.hp === 0) {
    // 血條式變身：這條打完不算死——蹲下調息（無敵一回合），亮出下一條血
    const next = enemyById[e.enemyId]?.phases?.[e.phase];
    if (next?.hpBar) {
      e.phase += 1;
      e.hp = next.hpBar;
      e.maxHp = next.hpBar;
      e.block = 0;
      e.invulnIn = 1;
      // 換血條時把身上的減益全部化掉，增益（爪力等）留著——尾王要越打越難（使用者 2026-09-03）
      const purged = DEBUFFS.filter((name) => getStatus(e, name) > 0);
      for (const name of purged) removeStatus(e, name);
      if (purged.length) log(cs, `${e.name}調息之際把身上的${purged.join('、')}全化掉了`);
      e.moveIndex = -1;   // 起身後 advanceMove 會 +1，從新階段的第一招開始
      e.move = REST_MOVE;
      if (next.line) log(cs, `${e.name}：${next.line}`);
      log(cs, `${e.name}蹲了下來調息，暫時打不進去`);
      runEnemyEffects(cs, e, next.onEnter, false);
      return { dealt: lose, killed: false };
    }
    killEnemy(cs, e);
    return { dealt: lose, killed: true };
  }
  const sp = enemyById[e.enemyId]?.splitInto;
  if (sp && !e.split && e.hp <= e.maxHp * sp.below) { splitEnemy(cs, e, sp); return { dealt: lose, killed: false }; }
  checkPhase(cs, e);
  return { dealt: lose, killed: false };
}

/**
 * 分裂（團子史萊姆）：本體消失、原地冒出幾隻小的，每隻的血量＝本體剩下的血。
 *
 * 本體走 `escaped` 那條路——**不算打倒**：擊倒獎勵（吸貓大法、黑曜爪那些）不發、
 * 偷走的小魚乾也不退。剛冒出來的照既有的召喚規則：玩家回合中途冒出來的先掛「剛冒出來」，
 * 敵方回合冒出來的照表亮意圖（`endTurn` 跑的是快照，那一拍本來就不會動）。
 */
function splitEnemy(cs: CombatState, e: EnemyCombat, sp: { enemyId: string; n: number; below: number }): void {
  const hp = e.hp;
  e.split = true;
  e.dead = true;
  e.escaped = true;
  log(cs, `${e.name}裂開了`);
  for (let i = 0; i < sp.n; i++) {
    if (aliveEnemies(cs).length >= 5) break;   // 畫面塞不下五個以上
    const fresh = makeEnemy(cs, sp.enemyId, i, cs.mods?.hpMul ?? 1);
    fresh.hp = hp; fresh.maxHp = hp;           // 血量照本體剩下的，不用小怪自己的區間
    if (cs.mods?.strength) addStatus(fresh, '爪力', cs.mods.strength);
    if (!cs.enemyActing) {
      fresh.move = { intent: 'idle', label: '剛冒出來', effects: [{ kind: 'nothing' }] };
      fresh.moveIndex = -1;
    }
    cs.enemies.push(fresh);
  }
  // 塞不下半隻（極端情況）就等於清場了，該判贏
  if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won';
}

export function makeEnemy(cs: CombatState, enemyId: string, index: number, hpScale = 1): EnemyCombat {
  const def = enemyById[enemyId];
  if (!def) throw new Error(`未知的魔物：${enemyId}`);
  const hp = Math.max(1, Math.round(cs.rng.int(def.hp[0], def.hp[1]) * hpScale));
  /**
   * 開場那一招也要過冷卻（稽核 2026-09-10 低-3）。
   *
   * 循環表的起點是 `index % moves.length`，讓同一場的第 N 隻從第 N 招開始（一排小怪才不會同步）。
   * 但橘貓山賊的「逃走」正好排在第五招——排到第五隻時，牠第一回合頭上就掛「逃走」，
   * 而且 `stolen` 是 0 也照跑，正是這批要修掉的行為。今天最多的那組只有四隻、碰不到，
   * 但那是巧合不是設計。往下挑到第一招放得出來的為止。
   */
  let moveIndex = def.pattern === 'cycle' ? index % def.moves.length : 0;
  if (def.pattern === 'cycle') {
    for (let i = 0; i < def.moves.length; i++) {
      const m = def.moves[(moveIndex + i) % def.moves.length] as EnemyMove;
      // 開場一定是「還沒偷過、還沒召喚過」，所以只要看這一招是不是那兩種有冷卻的行為
      if (!m.effects.some((f) => f.kind === 'escape')) { moveIndex = (moveIndex + i) % def.moves.length; break; }
    }
  }
  const move = def.pattern === 'cycle' ? (def.moves[moveIndex] as EnemyMove) : cs.rng.pick(def.moves);
  const e: EnemyCombat = {
    uid: cs.nextEnemyUid++, enemyId, name: def.name, hp, maxHp: hp, block: 0, statuses: {},
    moveIndex, turnCount: 0, phase: 0, charged: false, reviveIn: 0, invulnIn: 0,
    move: def.chooseMove?.(1, def.moves) ?? move, dead: false, escaped: false, stolen: 0,
  };
  if (def.learnsPlayerCards) e.move = learnedMove(cs) ?? e.move;   // 第一動也是學來的（開戰時牌組已經在抽牌堆裡）
  // 開戰就帶的被動狀態（第二波魔物）。全部走正常的狀態欄位，畫面上就有牌子、滑上去有說明
  if (def.flying) addStatus(e, '飛行', def.flying);
  if (def.plating) addStatus(e, '鱗甲', def.plating);
  if (def.curlUp) addStatus(e, '縮殼', def.curlUp);
  if (def.fadeAfter) addStatus(e, '消散', def.fadeAfter);
  // 2026-09-03 菁英擴充：開戰帶反彈（紙老虎，整場不消失）、開戰帶虛化（虛無貓，之後每回合開始切換）
  if (def.thorns) addStatus(e, '反彈', def.thorns);
  if (def.ironBody) addStatus(e, '不壞身', def.ironBody);
  if (def.phasing) addStatus(e, '虛化', 1);
  if (def.asleep) {
    addStatus(e, '沉睡', def.asleep);
    e.move = SLEEP_MOVE;   // 睡著的頭上顯示「呼呼大睡」；醒來時 moveIndex −1 → advanceMove 從第一招開始
    e.moveIndex = -1;
  }
  return e;
}

/** 包成函式再讀，免得 TypeScript 把 cs.phase 窄化後，看不見 damagePlayer 途中把戰鬥打成敗北 */
function isLost(cs: CombatState): boolean { return cs.phase === 'lost'; }

/** 把球球身上指定的狀態各減半（向下取整保留），回傳真的有動到的那幾個。破功與看破共用（原本兩份一字不差）。 */
function halvePlayerStatuses(p: PlayerCombat, names: readonly StatusName[]): StatusName[] {
  const hit = names.filter((n) => getStatus(p, n) > 0);
  for (const n of hit) { const cur = getStatus(p, n); addStatus(p, n, -(cur - Math.floor(cur / 2))); }
  return hit;
}

/**
 * 跑一隻魔物這一招的所有效果。
 *
 * `victim`＝這一招打在**誰**身上（連線版第一步 2026-09-11）。不傳就是第一位玩家，
 * 單機跟以前一模一樣；連線版第二步只要在呼叫端挑好目標，整套減益、塞牌、破功就都會找對人。
 */
export function runEnemyEffects(cs: CombatState, e: EnemyCombat, effects: EnemyEffect[], charged: boolean,
                                victim: PlayerCombat = cs.player): void {
  // 蓄力只加倍**下一次**傷害：第一個吃到加倍的傷害效果就把蓄力用掉。原本是「攻擊意圖的招才清蓄力」，
  // 狸小弟的搗蛋／裝可愛是減益／防禦意圖卻帶傷害，一次蓄力連吃三招加倍、48 傷（全面體檢 2026-09-05 #3）
  let mult = charged;
  const useCharge = (): number => { if (!mult) return 1; mult = false; e.charged = false; return 2; };
  const p = victim;
  for (const fx of effects) {
    if (e.dead) return;        // 已經倒下（例如被反彈打死）就不再執行剩下的效果
    if (isLost(cs)) return;
    switch (fx.kind) {
      case 'damage': {
        const base = fx.amount * useCharge();
        for (let i = 0; i < (fx.times ?? 1); i++) {
          if (e.dead) return;      // 被反彈打死，剩下的段數不能再打
          damagePlayer(cs, e, base, { pierce: fx.pierce, victim: p });
          if (isLost(cs)) return;
        }
        break;
      }
      case 'damageRandom': damagePlayer(cs, e, cs.rng.int(fx.min, fx.max) * useCharge(), { victim: p }); break;
      case 'block': gainBlock(cs, e, fx.amount); break;
      case 'statusSelf': addStatus(e, fx.name, fx.amount); break;
      case 'statusPlayer': addStatus(p, fx.name, fx.amount); break;
      case 'heal': e.hp = Math.min(e.maxHp, e.hp + (fx.percent ? Math.round(e.maxHp * fx.percent / 100) : fx.n)); break;
      case 'stealFish':
        e.stolen += fx.n; cs.stolenFish += fx.n; cs.fishDelta -= fx.n;
        // 逃跑冷卻從**第一次**偷到算起（見 `ESCAPE_GAP`）：再偷第二次不會把時鐘重設，
        // 不然牠可以一直偷一直重設、永遠不跑，玩家也永遠追不回那筆錢
        e.stolenTurn ??= cs.turn;
        log(cs, `${e.name}偷走了 ${fx.n} 小魚乾`);
        break;
      case 'discardRandomHand': {
        // 魔物出手時你的手牌早就在回合結束時全棄掉了，「隨機丟手牌」實際上什麼都沒發生
        // （使用者 2026-09-02：「完全沒看到效果」）。改成真正有感的版本：下回合少抽幾張，最少還是抽得到 1 張。
        const cut = Math.min(fx.n, Math.max(0, 5 + p.drawNextTurn - 1));
        p.drawNextTurn -= cut;
        log(cs, `${e.name}把你的牌吹散了，下回合少抽 ${cut} 張`);
        break;
      }
      case 'summon': {
        // 這一拍記下來，冷卻從這裡算（見 `SUMMON_GAP`）。灌血給現有的那條路也算「召喚過了」——
        // 玩家的感受是一樣的：牠又動了一次召喚，場面又硬了一截
        e.lastSummonTurn = e.turnCount;
        for (let i = 0; i < fx.n; i++) {
          // 躺著等重生的也占名額（2026-09-03 稽核：蛙大名原本會一邊復活蝌蚪一邊再召兩隻，場上冒出四隻）
          const onField = (o: EnemyCombat) => !o.dead || (o.reviveIn > 0 && !o.escaped);
          const same = cs.enemies.filter((o) => o.enemyId === fx.enemyId && onField(o));
          // 場上塞不下（五個單位）或這種怪到上限：不硬召，改把一隻的血量接到現有的最弱那隻身上
          // （使用者 2026-09-02：「畫面塞不下，四隻後再召喚就是把尾巴血量加上去」）
          if (cs.enemies.filter(onField).length >= 5 || (fx.max !== undefined && same.length >= fx.max)) {
            if (fx.noPour) break;   // 這招只補位不灌血（波斯喚僕從，稽核 2026-09-04 中 5）
            const weakest = same.filter((o) => !o.dead).sort((a, b) => a.hp - b.hp)[0];
            const sdef = enemyById[fx.enemyId];
            if (weakest && sdef) {
              const add = Math.round((sdef.hp[0] + sdef.hp[1]) / 2);
              weakest.maxHp += add; weakest.hp += add;
              log(cs, `${e.name}把力量灌進${weakest.name}（+${add} 生命）`);
            } else if (sdef) {
              // 名額被「躺著重生中」的占滿、卻沒有活著的可以灌血：不要靜默吞掉（稽核 2026-09-04 M-2）
              log(cs, `${e.name}想召喚，可是${sdef.name}都還躺著`);
            }
            break;   // 灌一次就好：召兩隻的招（狸大人喚小弟）滿場時不該灌兩次（稽核 2026-09-03）
          }
          const fresh = makeEnemy(cs, fx.enemyId, i, cs.mods?.hpMul ?? 1);
          if (cs.mods?.strength) addStatus(fresh, '爪力', cs.mods.strength);   // 難度／魔氣的爪力，召喚出來的也要有（審查 #9）
          // 剛冒出來的這回合站不穩：先掛「剛冒出來」，下一回合才照表出招——不然血條式變身時
          // 尾巴在玩家回合中途冒出來、回合一結束就直接打人（使用者 2026-09-02：「突然出現尾巴直接打人很怪」）
          // 敵方回合中途召出來的：endTurn 跑的是快照，這回合本來就不會動，下回合照表出招（意圖先亮給玩家看）。
          // 只有玩家回合中途冒出來的（血條式變身 onEnter）才需要掛「剛冒出來」，不然會多發呆一整回合（2026-09-02 稽核 M-2）
          if (!cs.enemyActing) {
            fresh.move = { intent: 'idle', label: '剛冒出來', effects: [{ kind: 'nothing' }] };
            fresh.moveIndex = -1;
          }
          cs.enemies.push(fresh);
        }
        break;
      }
      case 'purgePlayer': {
        // 破功（師父專用）：爪力／貓步這類疊起來的成長被拍散一半。減益不動——只拆你蓋的塔
        const hitNames = halvePlayerStatuses(p, fx.names);
        if (hitNames.length) log(cs, `${e.name}一掌拍散了球球的氣勁（${hitNames.join('、')}減半）`);
        break;
      }
      case 'copyPlayerStatus': {
      for (const name of fx.names) {
        const mine = getStatus(e, name);
        const yours = getStatus(p, name);
        if (yours > mine) { addStatus(e, name, yours - mine); log(cs, `${e.name}照著學走了你的${name}`); }
      }
      break;
    }
    case 'stripPlayer': {
        // 看破：先囤好的隱身／潛水拍掉一半（向下取整保留：3 剩 1、2 剩 1、1 剩 0）。
        // 原本是整個拍掉，使用者 2026-09-03：「太強了，拍掉一半就好，3 就拍掉剩 1」
        const hit = halvePlayerStatuses(p, fx.names);   // 跟破功同一支算法，只差紀錄句
        if (hit.length) log(cs, `${e.name}看穿了球球的身法（${hit.join('、')}少了一半）`);
        break;
      }
      case 'chargeNext': e.charged = true; break;
      case 'escape': e.dead = true; e.escaped = true; log(cs, `${e.name}帶著小魚乾逃走了`);
        if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won'; break;
      case 'selfDestruct': {
        // 自爆（河豚精）：先打人（吃蜷縮、隱身照閃），然後自己倒下——這一下**算打倒**，戰利品照發
        log(cs, `${e.name}炸開了`);
        damagePlayer(cs, e, fx.amount * useCharge(), { victim: p });
        if (isLost(cs)) return;
        if (!e.dead) damageEnemy(cs, e, e.hp, { direct: true });
        return;   // 自己都沒了，後面的效果不用跑
      }
      case 'statusAllies': {
        for (const o of aliveEnemies(cs)) addStatus(o, fx.name, fx.amount);
        log(cs, `${e.name}一聲令下，全體獲得 ${fx.amount} 點${fx.name}`);
        break;
      }
      case 'blockAllies': {
        for (const o of aliveEnemies(cs)) gainBlock(cs, o, fx.amount);
        log(cs, `${e.name}擺出盾陣，全體獲得 ${fx.amount} 點防禦`);
        break;
      }
      case 'giveCard': giveCards(cs, e, fx.cardId, fx.n, fx.to, p); break;
      case 'nothing': break;
      default: { const _never: never = fx; void _never; break; }   // 漏接新的 EnemyEffect 種類會在型別檢查就爆
    }
  }
}
