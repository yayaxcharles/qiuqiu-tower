/**
 * 鏡中球球「照著學」（2026-09-08 使用者：他的招式沒特色，改成每回合隨機抽主角牌組裡的牌來打，
 * 畫面要讓玩家看到他打了哪張；但跟主角的牌無關——只是複製一份，不抽走、不棄掉、不消耗）。
 *
 * 哪些牌翻得成魔物的一招：
 * - 打擊 → damage（無視蜷縮的翻成穿透）；蜷縮 → block；回血 → heal
 * - 給自己的狀態只收爪力、貓步、隱身（魔物身上這三個引擎本來就會算，舊版「照著學」抄的也是前兩個）
 * - 給對手的狀態翻成 statusPlayer（翻肚、懶洋洋、炸毛、中毒、定身）
 * - 以中毒層數為傷害（菲菲的見血封喉）→ damageByPlayerStatus，照**你**身上的層數打；
 *   一針斃命（層數夠就秒殺）也翻成同一個、1 倍不清毒——鏡子不能一針把玩家秒掉（2026-09-15）
 * - 抽牌、飯糰、看牌、留牌、消耗、棄牌、清減益這類「操作手牌」的效果他學不來，直接略過（那張牌其餘效果照翻）
 * - 「這回合不能攻擊」這種只綁自己的限制也略過（戰術撤退的 9 點蜷縮照學）
 * - **自傷略過**（2026-09-15）：鏡貓不會為了打你先砍自己一刀。所以手滑、不要過來！、淬毒·改
 *   這三張她的自傷牌現在學得會了（球球的鐵頭功、亡命也跟著學得會，見下面那條紀錄）
 * - 只對魔物群有意義的（散毒＝把毒分給其他魔物）略過；只有兩個人才成立的（幫隊友擋、給隊友附毒、
 *   看隊友有沒有打中）也略過——鏡子只有一隻，沒有隊友
 * - 有條件的加成（背刺「目標有減益才多打」）不學那一段，只學無條件的部分
 * - **能力段（power）只學「掛在對手身上的減益」那一部分**：毒霧＝每回合給你 1 層中毒，
 *   鏡貓學到的就是「給你 1 層中毒」，出招時現掛一次，讀起來對得上牌名。給自己的成長
 *  （結界的每回合 3 點蜷縮、鐵心的每回合 +1 爪力、回復卷軸的打倒回血）**不學**：魔物沒有
 *   「每回合自動觸發」這回事，抄成一次性的既弱又跟牌名對不起來。長效旗標（影子分身、千針萬毒、
 *   拒馬、餘毒）同理，整段略過——那幾張因此翻出零效果、回 null、不進池子，這是要的結果。
 * - 其他（以蜷縮為傷害、偷防禦、結束回合……）翻不成，整張牌不進他的池子
 * 一張牌至少要翻出一個效果才算數。抽牌用戰鬥亂數（cs.rng），同一個局面碼永遠抽到同一張。
 *
 * **2026-09-15 這批的副作用（球球那邊也會變）**：自傷進略過清單之後，`tietou`（鐵頭功）與
 * `wangming`（亡命）從「整張學不會」變成「學得會、只學傷害那一段」；`blockAlly` 進略過清單之後，
 * 雙人支援牌「幫你墊一下」「先幫你留著」也學得會了；能力段的規則讓升級版鐵心／封印解除
 * 那半段先給自己的爪力貓步學得會。這是使用者指定的規則（鏡貓不自傷、能力段略過）的直接結果，
 * 不是順手改的；固定戰鬥與整局的錨值測試都沒有位移。
 */
import { encounterById, enemyById } from '../content/enemies';
import { cardById, cardNameFor } from '../content/cards';
import { cardStats } from './deck';
import type { CardInstance, CombatState, EnemyCombat, EnemyEffect, EnemyMove, Intent, StatusName } from './types';
import { DEBUFFS } from './types';

/*
 * 鏡子學得來的「給自己的狀態」。
 *
 * 2026-09-17 加上**反彈**：噹噹三十張裡有六張是給自己反彈（回敬、挑釁、站樁…），
 * 不收的話那幾張整張學不到，鏡子戰對他明顯比對另外兩位軟。
 * 魔物本來就有反彈（紙老虎、龜甲，見 `actions.ts` 的 `def.thorns`），
 * 而且玩家打牠時會被回敬——照學出來的行為是對的，不是憑空發明一條規則。
 */
const SELF_OK: readonly StatusName[] = ['爪力', '貓步', '隱身', '反彈'];
/** 學不來但不礙事的效果：略過，牌還是能用 */
const SKIP: ReadonlySet<string> = new Set([
  // 噹噹的四個長效旗標（2026-09-17）：鏡子學不會就整張回 null，
  // 他大半副牌都會被跳過，那場鏡子戰變成只會擋的空殼。跳過旗標、留下蜷縮那一段
  'halfSpendBlock', 'blockWhenAttacked', 'thornsBonus', 'keepBlock',
  'blockOnThorns', 'thornsFromSpend', 'blockToThorns',
  // 條件分支：條件本身學不來，但**分支外面那幾條照學**（護臂格擋的 7 點蜷縮）。
  // 不收的話整張回 null，那張在鏡子戰裡憑空消失
  'ifSelfStatus',
  /*
   * 2026-09-17 稽核 低-1：上面那幾個只救到穩住與硬扛。卸蜷縮打人、照反彈打、
   * 條件分支那幾種都不在 SKIP 也不在 `switch`，走 `default` 整張回 null——
   * 於是鏡中球球對上噹噹幾乎只會打正拳跟架盤，那場對他明顯比對另外兩位軟。
   */
  'damageSpendBlock', 'healSpendBlock', 'blockFromThorns', 'damageByOwnStatus',
  'ifBlock', 'ifEnemyIntent',
  'draw', 'drawIfTargetStatus', 'drawNextTurn', 'energy', 'gold', 'scry',
  'exhaustFromHand', 'retainFromHand', 'discardFromHand', 'recoverFromDiscard', 'cleanse', 'removeStatuses',
  'noAttacksThisTurn',
  // ---- 2026-09-15 菲菲那批（理由見檔頭）----
  'selfDamage',                                    // 鏡貓不自傷
  'spreadStatus',                                  // 散毒：把毒分給「其他魔物」，鏡子這邊沒有其他魔物
  'blockAlly', 'poisonAllyNextAttack', 'watchPoisonHit',   // 連線專用：鏡子只有一隻，沒有隊友
  'echoFirst', 'poisonOnAttack', 'blockBonus', 'poisonBurst',   // 長效旗標：魔物身上沒有這些引擎
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
      /*
       * 「目標原本就中毒才給蜷縮」照學成無條件的蜷縮（2026-09-16）。
       *
       * 魔物沒有「打牌那一刻的快照」可以記——牠的招式是預先算好掛在頭上的，
       * 條件式的蜷縮做不出來。照學成無條件是**對玩家比較兇**的那一邊，
       * 比整張不學好（整張不學會讓她的起手牌在鏡子戰裡憑空消失）。
       */
      case 'blockIfPoisoned': out.push({ kind: 'block', amount: fx.amount }); break;
      // `percent` 要一起帶（稽核 2026-09-11 低-3）：帶 percent 的效果 `n` 是 0，
      // 漏掉就變成學了一張回 0 血的牌。今天沒有這種牌，是埋著的
      case 'heal': out.push({ kind: 'heal', n: fx.n, ...(fx.percent ? { percent: fx.percent } : {}) }); break;
      case 'status':
        // 成長牌（她的分身術）整張不學，跟球球的分身術（damageRamp 不在 SKIP）同一個結果：
        // 魔物沒有「這張打過幾次」可以記，照學只會學到永遠不長的基礎值（2026-09-14 推前審查 中-1）
        if (fx.step) return null;
        if (fx.target === 'self') { if (SELF_OK.includes(fx.name)) out.push({ kind: 'statusSelf', name: fx.name, amount: fx.amount }); }
        else if (DEBUFFS.includes(fx.name)) out.push({ kind: 'statusPlayer', name: fx.name, amount: fx.amount });
        break;
      /*
       * 能力段：只把「掛在對手身上的減益」那一部分拆出來當一次性的招（毒霧＝每回合給你 1 層中毒
       * → 學到「給你 1 層中毒」）。給自己的成長不學，理由在檔頭。
       * 內層的判準跟上面的 `status` 同一套，故意不遞迴整支 `learnCard`——
       * 能力裡再包一層傷害或抽牌時，那不是「一次性做得到的事」。
       */
      case 'power':
        for (const inner of fx.effects) {
          if (inner.kind !== 'status' || inner.target === 'self') continue;
          if (DEBUFFS.includes(inner.name)) out.push({ kind: 'statusPlayer', name: inner.name, amount: inner.amount });
        }
        break;
      // 見血封喉：照目標身上的毒打。鏡子照回來就是照**你**身上的毒打（2026-09-15）
      case 'damageByStatus':
        out.push({ kind: 'damageByPlayerStatus', name: fx.name, ...(fx.mul !== undefined ? { mul: fx.mul } : {}), ...(fx.consume ? { consume: true } : {}) });
        break;
      /*
       * 一針斃命也翻成同一個，**1 倍、不清毒**（使用者 2026-09-15 指定）：
       * 原效果是「層數 ≥ 目標剩下的生命就直接打倒」，照搬等於鏡貓可以一針把玩家秒掉，
       * 而玩家沒有「還剩幾層就會死」以外的應對。照層數打就好。
       */
      case 'execByStatus':
        out.push({ kind: 'damageByPlayerStatus', name: fx.name });
        break;
      /*
       * 卸蜷縮打人：**照這張牌的上限學成固定傷害**（2026-09-17 稽核 低-1）。
       *
       * 原效果是「卸掉最多 N 點蜷縮、造成等量傷害」，而魔物沒有蜷縮可以卸——
       * 牠的招是預先算好掛在頭上的，做不出「看我當下有多少」這種事。
       * 照上限學是**對玩家比較兇**的那一邊，跟「目標原本就中毒才給蜷縮」照學成無條件
       * 是同一個判斷（2026-09-16）：比整張不學好，不然卸力掌、崩山掌、震盪波
       * 在鏡子戰裡會憑空消失，那場對噹噹明顯比對另外兩位軟。
       *
       * 卸光那種（`all`，鐵山靠與捨身撞）沒有上限可以照，仍然跳過。
       */
      case 'damageSpendBlock': {
        if (fx.all || !fx.max) break;
        const hit: Extract<EnemyEffect, { kind: 'damage' }> = { kind: 'damage', amount: Math.floor(fx.max * (fx.mul ?? 1)) };
        if (fx.ignoreBlock) hit.pierce = true;
        out.push(hit);
        break;
      }
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
  const intent: Intent = effects.some((f) => f.kind === 'damage' || f.kind === 'damageByPlayerStatus') ? 'attack'
    : effects.some((f) => f.kind === 'block') ? 'block'
      : effects.some((f) => f.kind === 'statusPlayer') ? 'debuff' : 'buff';
  /*
   * 牌名用「、」串：升級牌的名字結尾就是「＋」，用「＋」串會變成「淡定＋＋貓抓＋」（稽核 2026-09-08 中-1）。
   *
   * 名字要過 `cardNameFor`（稽核 2026-09-12 低-1）：菲菲手上的牌面寫「絕學·連珠針」，
   * 紀錄卻寫「絕學·貓爪抓」，同一張牌兩個名字。鏡子學的是**被照的那一位**的牌組，
   * 所以看的是 `p.hero`，不是本機這一位。
   */
  const nameOf = (c: CardInstance): string => {
    const def = cardById[c.cardId];
    if (!def) return cardStats(c).name;
    // 升級的「＋」照 `cardStats` 的規矩自己補（那支是 `def.name + '＋'`）
    return cardNameFor(def, cs.player.hero) + (c.upgraded ? '＋' : '');
  };
  return { intent, label: picks.map(nameOf).join('、'), effects, learned: picks.map((c) => ({ cardId: c.cardId, upgraded: c.upgraded })) };
}
