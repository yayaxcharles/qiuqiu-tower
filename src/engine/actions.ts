import { cardById } from '../content/cards';
import { enemyById } from '../content/enemies';
import { relicById } from '../content/relics';
import { draw } from './deck';
import { applyEffects } from './effects';
import { addStatus, computeAttack, computeBlock, getStatus, removeStatus } from './statuses';
import type { CardInstance, CombatState, EnemyCombat, EnemyEffect, EnemyMove, EnemyPhase, Unit } from './types';

/** 沉睡中的魔物頭上顯示的意圖。每次都是同一份物件，畫面比對「這一拍出的是哪一招」才穩 */
export const SLEEP_MOVE: EnemyMove = { intent: 'idle', label: '呼呼大睡', effects: [{ kind: 'nothing' }] };

export function log(cs: CombatState, msg: string): void { cs.log.push(msg); }
export function aliveEnemies(cs: CombatState): EnemyCombat[] { return cs.enemies.filter((e) => !e.dead); }
export function findEnemy(cs: CombatState, uid: number): EnemyCombat | undefined { return cs.enemies.find((e) => e.uid === uid && !e.dead); }
export function hasRelic(cs: CombatState, id: string): boolean { return cs.relics.includes(id); }

export function gainBlock(cs: CombatState, u: Unit, base: number): number {
  const v = computeBlock(base, u);
  u.block += v;
  return v;
}

/** 每回合第一次拿隱身時吃秘寶加成（紙袋的 stealthBonus），加成量由秘寶資料決定 */
export function gainStealth(cs: CombatState, n: number): void {
  let amt = n;
  if (!cs.player.firstStealthGiven) amt += cs.relics.reduce((s, id) => s + (relicById[id]?.hooks.stealthBonus ?? 0), 0);
  amt += cs.relics.reduce((s, id) => s + (relicById[id]?.hooks.stealthBonusEvery ?? 0), 0);   // 影披風：每次都加（審查 #6）
  cs.player.firstStealthGiven = true;
  addStatus(cs.player, '隱身', amt);
}

export function healPlayer(cs: CombatState, n: number): number {
  const p = cs.player; const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  return p.hp - before;
}

export function drawCards(cs: CombatState, n: number): CardInstance[] { return draw(cs.player, n, cs.rng); }

/**
 * 魔物塞牌給球球（黏液、眼冒金星）。
 *
 * `discard`＝丟進棄牌堆（這一輪打不到，洗牌之後才會遇到）；
 * `draw`＝洗進抽牌堆的隨機位置（可能下一張就抽到，比較討厭）。
 * 位置只用 `cs.rng`，同種子才重現得出同一局。
 */
export function giveCards(cs: CombatState, from: EnemyCombat, cardId: string, n: number, to: 'discard' | 'draw'): void {
  const def = cardById[cardId];
  if (!def) throw new Error(`未知的牌：${cardId}`);
  const p = cs.player;
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
export function damagePlayer(cs: CombatState, attacker: Unit, base: number, opts: { direct?: boolean; pierce?: boolean } = {}): number {
  const p = cs.player;
  let lose: number;
  if (opts.direct) {
    lose = base;
  } else {
    if (p.immune) { log(cs, '球球躲在角落，什麼都沒看到'); return 0; }
    if (getStatus(p, '隱身') > 0) { addStatus(p, '隱身', -1); log(cs, '球球閃過了'); return 0; }
    const dmg = computeAttack(base, attacker, p);
    const absorbed = opts.pierce ? 0 : Math.min(p.block, dmg);
    p.block -= absorbed;
    lose = dmg - absorbed;
    // 擋下來要留紀錄：畫面靠這行飄「擋住 N」跟盾牌，不然整下被吃掉看起來像沒打到（使用者回報）
    if (absorbed > 0) log(cs, `蜷縮擋下了 ${absorbed} 點`);
    if (opts.pierce && dmg > 0) log(cs, '這一下穿過了蜷縮');
    const thorns = getStatus(p, '反彈');
    if (dmg > 0 && thorns > 0 && attacker !== p) {
      const e = cs.enemies.find((x) => x === attacker);
      if (e) {
        log(cs, `反彈回敬了${e.name} ${thorns} 點`);   // 畫面靠這行飄「反彈！」——被反彈打死的魔物本來只是默默消失（使用者回報）
        damageEnemy(cs, e, thorns, { direct: true });
      }
    }
  }
  p.hp -= lose;
  // 已經打贏了，殘餘效果（自傷、壞毛病）不會把球球打死
  if (cs.phase === 'won') { p.hp = Math.max(1, p.hp); return lose; }
  if (p.hp <= 0) {
    // 擋一次致命傷的秘寶由資料決定（木樁的 preventLethal），不要把 id 寫死在引擎裡
    const saved = cs.relics.some((id) => relicById[id]?.hooks.preventLethal);
    if (saved && !p.lethalPrevented) {
      p.hp = 1; p.lethalPrevented = true;
      const saver = cs.relics.map((id) => relicById[id]).find((r) => r?.hooks.preventLethal);
      log(cs, `${saver?.name ?? '秘寶'}替球球挨了這一下`);
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

export function advanceMove(cs: CombatState, e: EnemyCombat): void {
  const { moves, pattern } = moveSet(e);
  // 照表出招的怪先問表（turnCount 是「已經行動過的回合數」，下一動＝+1）
  const scripted = enemyById[e.enemyId]?.chooseMove?.(e.turnCount + 1, moves);
  if (scripted) { e.move = scripted; return; }
  if (pattern === 'random') { e.move = cs.rng.pick(moves); return; }
  e.moveIndex = (e.moveIndex + 1) % moves.length;
  e.move = moves[e.moveIndex] as EnemyMove;
}

function checkPhase(cs: CombatState, e: EnemyCombat): void {
  const def = enemyById[e.enemyId]!;
  const next = def.phases?.[e.phase];
  // hpBelow 語意＝「生命 ≤ 此值就切換」，所以剛好等於門檻也要進下一階段。
  // 血條式（hpBar）的階段不走這裡——那種要等整條血歸零，在 damageEnemy 裡切換。
  if (!next || next.hpBelow === undefined || e.hp > next.hpBelow || e.dead) return;
  e.phase += 1;
  e.moveIndex = 0;
  if (next.line) log(cs, `${e.name}：${next.line}`);
  runEnemyEffects(cs, e, next.onEnter, false);
  e.move = def.chooseMove?.(e.turnCount + 1, next.moves)
    ?? (next.pattern === 'random' ? cs.rng.pick(next.moves) : (next.moves[0] as EnemyMove));
}

function killEnemy(cs: CombatState, e: EnemyCombat): void {
  e.dead = true;
  // 同生共死組的成員倒下就開始倒數「重生中」；沒有同組概念的魔物維持 0
  const rd = enemyById[e.enemyId];
  e.reviveIn = rd?.reviveGroup ? (rd.reviveDelay ?? 1) : 0;
  cs.kills += 1;
  const def = enemyById[e.enemyId]!;
  if (def.onDeathHealPlayer) healPlayer(cs, def.onDeathHealPlayer);
  if (e.stolen > 0) { cs.fishDelta += e.stolen; cs.stolenFish -= e.stolen; e.stolen = 0; }
  // 同生共死組還有同伴站著＝這隻等一下會爬回來，倒下不算真的擊倒：擊倒獎勵（能力、秘寶）不發（審查 #11）
  const reviving = !!rd?.reviveGroup && cs.enemies.some((o) => o !== e && !o.dead && enemyById[o.enemyId]?.reviveGroup === rd.reviveGroup);
  if (!reviving) for (const pw of cs.player.powers) if (pw.trigger === 'onKill') applyEffects(cs, pw.effects, { source: 'power' });
  // 打倒魔物的秘寶效果（沙丁魚罐回血、黑曜爪爪力、銅錢劍小魚乾）
  if (!reviving) for (const rid of cs.relics) {
    const h = relicById[rid]?.hooks;
    if (!h) continue;
    if (h.killHeal) healPlayer(cs, h.killHeal);
    if (h.killStrength) addStatus(cs.player, '爪力', h.killStrength);
    if (h.killFish) cs.fishDelta += h.killFish;
  }
  if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won';
}

export function damageEnemy(cs: CombatState, e: EnemyCombat, base: number,
  opts: { ignoreBlock?: boolean; noStrength?: boolean; direct?: boolean } = {}): { dealt: number; killed: boolean } {
  if (e.dead) return { dealt: 0, killed: false };
  // 蹲下調息中（血條式變身的過場）：無敵，什麼傷害都不吃
  if (e.invulnIn > 0) { log(cs, `${e.name}正在調息，毫髮無傷`); return { dealt: 0, killed: false }; }
  // 僕從護體：還有同伴活著就毫髮無傷（含直傷）。放在隱身之前——被護著的時候不消耗隱身層數
  if (enemyById[e.enemyId]?.guardedByAllies && cs.enemies.some((o) => o !== e && !o.dead)) {
    log(cs, `${e.name}被僕從護著，毫髮無傷`);
    return { dealt: 0, killed: false };
  }
  let lose: number;
  if (opts.direct) {
    lose = base;
  } else {
    if (getStatus(e, '隱身') > 0) { addStatus(e, '隱身', -1); log(cs, `${e.name}閃過了`); return { dealt: 0, killed: false }; }
    let dmg = computeAttack(base, cs.player, e, { noStrength: opts.noStrength });
    // 飛行：打得到的只有一半，**先減半再扣防禦**（燈蛾、月蛾后）。噎到那種直傷不吃這條
    if (getStatus(e, '飛行') > 0 && dmg > 0) { dmg = Math.floor(dmg / 2); log(cs, `${e.name}在天上，這一下只擦到一半`); }
    if (opts.ignoreBlock) lose = dmg;
    else {
      const absorbed = Math.min(e.block, dmg); e.block -= absorbed; lose = dmg - absorbed;
      if (absorbed > 0) log(cs, `${e.name}的防禦擋下了 ${absorbed} 點`);   // 同上：魔物那邊也要飄「擋住 N」
    }
  }
  // 魔物身上的反彈：你每打一下就被刺一下（刺蝟師傅、龜甲、師父第三條血——以前只有球球的反彈有效）
  if (!opts.direct) {
    const th = getStatus(e, '反彈');
    if (th > 0) { log(cs, `${e.name}的刺反彈了 ${th} 點`); damagePlayer(cs, e, th, { direct: true }); }
  }
  // 虛化（虛無貓）：身體半透明，**每一段**傷害最多只扣 1 點血——攻擊、噎到、反彈一視同仁。
  // 擺在扣血之前、防禦結算之後：防禦照原本的量擋掉，虛化只管「真的扣進血條的那幾點」
  if (getStatus(e, '虛化') > 0 && lose > 1) {
    log(cs, `${e.name}半透明的，這一下只碰到 1 點`);
    lose = 1;
  }
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
      e.moveIndex = -1;   // 起身後 advanceMove 會 +1，從新階段的第一招開始
      e.move = { intent: 'special', label: '蹲下調息', effects: [{ kind: 'nothing' }] };
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
  const moveIndex = def.pattern === 'cycle' ? index % def.moves.length : 0;
  const move = def.pattern === 'cycle' ? (def.moves[moveIndex] as EnemyMove) : cs.rng.pick(def.moves);
  const e: EnemyCombat = {
    uid: cs.nextEnemyUid++, enemyId, name: def.name, hp, maxHp: hp, block: 0, statuses: {},
    moveIndex, turnCount: 0, phase: 0, charged: false, reviveIn: 0, invulnIn: 0,
    move: def.chooseMove?.(1, def.moves) ?? move, dead: false, escaped: false, stolen: 0,
  };
  // 開戰就帶的被動狀態（第二波魔物）。全部走正常的狀態欄位，畫面上就有牌子、滑上去有說明
  if (def.flying) addStatus(e, '飛行', def.flying);
  if (def.plating) addStatus(e, '鱗甲', def.plating);
  if (def.curlUp) addStatus(e, '縮殼', def.curlUp);
  if (def.fadeAfter) addStatus(e, '消散', def.fadeAfter);
  // 2026-09-03 菁英擴充：開戰帶反彈（紙老虎，整場不消失）、開戰帶虛化（虛無貓，之後每回合開始切換）
  if (def.thorns) addStatus(e, '反彈', def.thorns);
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

export function runEnemyEffects(cs: CombatState, e: EnemyCombat, effects: EnemyEffect[], charged: boolean): void {
  const p = cs.player;
  for (const fx of effects) {
    if (e.dead) return;        // 已經倒下（例如被反彈打死）就不再執行剩下的效果
    if (isLost(cs)) return;
    switch (fx.kind) {
      case 'damage': {
        const base = fx.amount * (charged ? 2 : 1);
        for (let i = 0; i < (fx.times ?? 1); i++) {
          if (e.dead) return;      // 被反彈打死，剩下的段數不能再打
          damagePlayer(cs, e, base, { pierce: fx.pierce });
          if (isLost(cs)) return;
        }
        break;
      }
      case 'damageRandom': damagePlayer(cs, e, cs.rng.int(fx.min, fx.max) * (charged ? 2 : 1)); break;
      case 'block': gainBlock(cs, e, fx.amount); break;
      case 'statusSelf': addStatus(e, fx.name, fx.amount); break;
      case 'statusPlayer': addStatus(p, fx.name, fx.amount); break;
      case 'heal': e.hp = Math.min(e.maxHp, e.hp + fx.n); break;
      case 'stealFish': e.stolen += fx.n; cs.stolenFish += fx.n; cs.fishDelta -= fx.n; log(cs, `${e.name}偷走了 ${fx.n} 小魚乾`); break;
      case 'discardRandomHand': {
        // 魔物出手時你的手牌早就在回合結束時全棄掉了，「隨機丟手牌」實際上什麼都沒發生
        // （使用者 2026-09-02：「完全沒看到效果」）。改成真正有感的版本：下回合少抽幾張，最少還是抽得到 1 張。
        const cut = Math.min(fx.n, Math.max(0, 5 + p.drawNextTurn - 1));
        p.drawNextTurn -= cut;
        log(cs, `${e.name}把你的牌吹散了，下回合少抽 ${cut} 張`);
        break;
      }
      case 'summon': {
        for (let i = 0; i < fx.n; i++) {
          const same = cs.enemies.filter((o) => o.enemyId === fx.enemyId && !o.dead);
          // 場上塞不下（五個單位）或這種怪到上限：不硬召，改把一隻的血量接到現有的最弱那隻身上
          // （使用者 2026-09-02：「畫面塞不下，四隻後再召喚就是把尾巴血量加上去」）
          if (aliveEnemies(cs).length >= 5 || (fx.max !== undefined && same.length >= fx.max)) {
            const weakest = same.sort((a, b) => a.hp - b.hp)[0];
            const sdef = enemyById[fx.enemyId];
            if (weakest && sdef) {
              const add = Math.round((sdef.hp[0] + sdef.hp[1]) / 2);
              weakest.maxHp += add; weakest.hp += add;
              log(cs, `${e.name}把力量灌進${weakest.name}（+${add} 生命）`);
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
        const hitNames = fx.names.filter((n) => getStatus(cs.player, n) > 0);
        for (const n of hitNames) {
          const cur = getStatus(cs.player, n);
          addStatus(cs.player, n, -(cur - Math.floor(cur / 2)));
        }
        if (hitNames.length) log(cs, `${e.name}一掌拍散了球球的氣勁（${hitNames.join('、')}減半）`);
        break;
      }
      case 'stripPlayer': {
        // 看破：先囤好的隱身／潛水拍掉一半（向下取整保留：3 剩 1、2 剩 1、1 剩 0）。
        // 原本是整個拍掉，使用者 2026-09-03：「太強了，拍掉一半就好，3 就拍掉剩 1」
        const hit = fx.names.filter((n) => getStatus(cs.player, n) > 0);
        for (const n of hit) { const cur = getStatus(cs.player, n); addStatus(cs.player, n, -(cur - Math.floor(cur / 2))); }
        if (hit.length) log(cs, `${e.name}看穿了球球的身法（${hit.join('、')}少了一半）`);
        break;
      }
      case 'chargeNext': e.charged = true; break;
      case 'escape': e.dead = true; e.escaped = true; log(cs, `${e.name}帶著小魚乾逃走了`);
        if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won'; break;
      case 'selfDestruct': {
        // 自爆（河豚精）：先打人（吃蜷縮、隱身照閃），然後自己倒下——這一下**算打倒**，戰利品照發
        log(cs, `${e.name}炸開了`);
        damagePlayer(cs, e, fx.amount * (charged ? 2 : 1));
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
      case 'giveCard': giveCards(cs, e, fx.cardId, fx.n, fx.to); break;
      case 'nothing': break;
      default: { const _never: never = fx; void _never; break; }   // 漏接新的 EnemyEffect 種類會在型別檢查就爆
    }
  }
}
