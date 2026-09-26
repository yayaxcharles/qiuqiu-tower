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
import { getStatus } from './statuses';
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
  // 封封：鏡子沒有蓄氣／同伴／玩家階段資源。固定傷害與自用蜷縮在 switch 轉譯，
  // 產氣、支援、門檻分支及飯糰封禁略過，保留同張牌其餘可學的部分。
  'gainQi', 'nextAttackBonusSpendQi', 'ifQiAtPlay', 'ifSpentQiAtLeast', 'ifAllyBlockAtPlay', 'preventEnergyGainThisPhase',
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
      /*
       * 封封的蓄氣傷害：鏡子沒有可保存的蓄氣，照牌上可支付上限學成固定傷害，
       * 跟噹噹的 damageSpendBlock 照 max 學成固定傷害一致。多段與穿透原樣保留。
       *
       * 「消耗全部蓄氣」（`allQi`，絕學·斷流、絕學·開山）沒有牌面上限，比照噹噹的卸光（`all`）
       * 跳過不學（使用者 2026-09-21 裁定）。原本照全域上限 12 算，斷流學成單下 46（升級 50），太兇。
       */
      case 'damageSpendQi': {
        if (fx.allQi) break;
        const spent = fx.maxQi ?? 0;
        const hit: Extract<EnemyEffect, { kind: 'damage' }> = { kind: 'damage', amount: fx.amount + fx.perQi * spent };
        if (fx.times !== undefined && fx.times > 1) hit.times = fx.times;
        if (fx.ignoreBlock) hit.pierce = true;
        out.push(hit);
        break;
      }
      case 'block': out.push({ kind: 'block', amount: fx.amount }); break;
      case 'blockSpendQi':
        // 幫同伴擋的版本沒有對象；自用版照最大支付量轉成一次固定蜷縮。
        if (fx.recipient !== 'ally') out.push({ kind: 'block', amount: fx.amount + fx.perQi * fx.maxQi });
        break;
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
        const hit: Extract<EnemyEffect, { kind: 'damage' }> = { kind: 'damage', amount: Math.floor(fx.max * (fx.mul ?? 1)) + (fx.plus ?? 0) };
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

/** 噹噹的影子開場帶的反彈（連打好幾下會被打回來）。原本另帶鱗甲 4，3000 局實測一場拖到 18 回合，拿掉 */
export const SHADOW_DANGDANG = { thorns: 3 } as const;

/** 菲菲的影子：你身上的毒疊到這麼多層，下一招就換成見血封喉（照你身上的毒打） */
export const SHADOW_EXEC_POISON = 8;

/**
 * 他下一動要「學」的那一招：最多 n 張（遭遇的 learnCards，不填＝1），效果接在一起、牌名用「、」串。
 * 池子空的（牌組裡沒半張學得會的）回 undefined，讓呼叫端退回牠自己的招式表。
 *
 * **慢你一拍**（2026-09-26 使用者：「影子系列的怪物超級弱，每隻角色都一樣」）：
 * 原本每一動從整副牌隨機抽 1～2 張，常抽到基本的抓與擋，打起來沒威脅也沒個性。
 * 改成**照抄你上一輪真的打出去的牌**（`p.playedThisTurn`），挑費用最高的 n 張——你捨得花飯糰的那幾張。
 * 敵人回合結束時才挑，所以玩家下一輪看到的預告，就是自己剛打的牌：這一輪猛攻，下一輪就被還回來；
 * 這一輪改守，牠下一輪就只會擋。開戰第一動、或上一輪沒打半張學得會的，照舊從整副牌隨機抽。
 *
 * 四隻各自的招牌（照**鏡子照的那一位**，座位 0，跟變裝同一個判準；開場被動在 `actions.ts` 的 `makeEnemy`）：
 * - 球球的影子「影分身」：抄來的第一段攻擊多打一下（抄來的隱身一律不學；原本另帶開場隱身，3000 局實測菁英版打死球球近三成，拿掉）
 * - 菲菲的影子「針上帶毒」：抄來的每一張攻擊牌多上一層中毒；你身上的毒到 `SHADOW_EXEC_POISON` 層，下一招換成見血封喉
 * - 噹噹的影子「鐵壁」：開場帶反彈，出招照抄；抄來的反彈不學（不然他每回合都打反彈牌，影子越疊越厚，一場拖到快 20 回合）
 * - 封封的影子「蓄氣」：每第三動多蓄一次氣，下一次攻擊的傷害加倍（引擎既有的 `chargeNext`；那一動只抄到防禦的話，留到下一個攻擊招）
 *
 * `e` 只有封封那條要用（看這是牠的第幾動）；不傳就當第一動。
 */
export function learnedMove(cs: CombatState, e?: EnemyCombat): EnemyMove | undefined {
  const hero = cs.player.hero ?? 'ninja';
  if (hero === 'feifei' && getStatus(cs.player, '中毒') >= SHADOW_EXEC_POISON) {
    return { intent: 'attack', label: '見血封喉', effects: [{ kind: 'damageByPlayerStatus', name: '中毒' }] };
  }
  /*
   * **影子學不會隱身**：你這一輪躲起來，牠照抄只會學到「躲」——3000 局實測球球的影子因此每回合疊兩三層隱身，
   * 一場打到 40 回合。噹噹的影子也不學反彈（理由見檔頭那段）。
   * 濾掉之後一個效果都不剩的牌不算學得會：不然只打了替身術的那一輪，牠下一招會是空的。
   */
  const learnFor = (c: CardInstance): EnemyEffect[] => (learnCard(c) ?? [])
    .filter((f) => !(f.kind === 'statusSelf' && (f.name === '隱身' || (hero === 'dangdang' && f.name === '反彈'))));
  const n = encounterById[cs.encounterId]?.learnCards ?? 1;
  // 連線時座位 0 倒下了，他那份清單停在倒下前那一輪、再也不會清空（2026-09-26 推前審查 中-1）：
  // 照抄的話影子整場重複同一招，改回隨機抽
  const played = cs.player.down ? [] : (cs.player.playedThisTurn ?? []).filter((c) => learnFor(c).length > 0);
  let picks: CardInstance[];
  if (played.length) {
    picks = played.map((c, i) => ({ c, i, cost: cardStats(c).cost }))
      .sort((a, b) => b.cost - a.cost || a.i - b.i).slice(0, n)
      .sort((a, b) => a.i - b.i).map((x) => x.c);   // 挑完照你打出的順序排，亮牌面時跟你剛才打的一樣
  } else {
    const pool = learnPool(cs).filter((c) => learnFor(c).length > 0);
    if (pool.length === 0) return undefined;
    const rest = [...pool];
    picks = [];
    for (let i = 0; i < Math.min(n, pool.length); i++) {
      const c = cs.rng.pick(rest);
      picks.push(c);
      rest.splice(rest.indexOf(c), 1);
    }
  }
  let effects: EnemyEffect[] = picks.flatMap(learnFor);
  if (hero === 'feifei') {   // 針上帶毒：抄來的每一張攻擊多上一層中毒（每張一層，不是每一下一層：後者 3000 局實測太兇）
    effects = effects.flatMap((f): EnemyEffect[] => (f.kind === 'damage' ? [f, { kind: 'statusPlayer', name: '中毒', amount: 1 }] : [f]));
  }
  /*
   * 影分身：抄來的第一段攻擊**多打一下**。原本是整張再打一次，3000 局實測抄到多段攻擊（四連擊）時
   * 每一下都吃菁英的魔氣、整張再翻倍，菁英版打死球球近三成；改成多一下，單下的牌還是等於打兩次。
   */
  const clone = hero === 'ninja' ? effects.findIndex((f) => f.kind === 'damage') : -1;
  if (clone >= 0) {
    const f = effects[clone] as Extract<EnemyEffect, { kind: 'damage' }>;
    effects = effects.map((x, i) => (i === clone ? { ...f, times: (f.times ?? 1) + 1 } : x));
  }
  const charge = hero === 'fengfeng' && ((e?.turnCount ?? 0) + 1) % 3 === 0;
  if (charge) effects = [...effects, { kind: 'chargeNext' }];
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
  // 招牌寫在括號裡，不跟牌名混在一起（戰報「照著打出『貓抓、影分身』」會讓人以為有一張叫影分身的牌，推前審查 低-5）
  const tags = [...(clone >= 0 ? ['影分身'] : []), ...(charge ? ['蓄氣'] : [])];
  const label = picks.map(nameOf).join('、') + (tags.length ? `（${tags.join('、')}）` : '');
  return { intent, label, effects, learned: picks.map((c) => ({ cardId: c.cardId, upgraded: c.upgraded })) };
}
