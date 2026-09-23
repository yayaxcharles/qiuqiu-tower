import type { CardInstance, CombatState, RunState, StatusName, Unit } from '../engine/types';

/**
 * 戰鬥狀態的指紋——**鎖步連線最重要的一道保險**。
 *
 * 鎖步的毛病是：兩邊一旦算出不同的結果，**當下不會有任何錯誤**。
 * 你這邊那隻怪剩 3 滴血、對方那邊已經倒了，兩邊各自繼續跑，
 * 要好幾回合之後畫面明顯對不上才發現，那時已經沒救、也查不出是哪一步走岔的。
 *
 * 所以每回合結束互相對一次指紋：對不上就**當場停下來**告訴玩家，
 * 而不是讓兩個人繼續玩兩份不一樣的遊戲。
 *
 * 要涵蓋「會影響之後計算」的每一個欄位，**亂數狀態也要算進去**——
 * 亂數走岔一步，畫面上當下可能完全看不出來，下一次抽牌才爆開。
 */

/** FNV-1a（32 位元）。挑它是因為夠短、夠快，而且不吃任何外部相依 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 狀態列要**排序後**再串：物件的鍵順序跟疊上去的先後有關，兩邊順序不同但內容相同時不該判成分岔 */
function statusOf(u: Unit): string {
  const names = Object.keys(u.statuses).sort() as StatusName[];
  return names.filter((n) => (u.statuses[n] ?? 0) !== 0).map((n) => `${n}:${u.statuses[n]}`).join(',');
}

function pile(cards: { uid: number; cardId: string; upgraded: boolean }[]): string {
  // 抽牌堆與棄牌堆的**順序有意義**（下一張抽到什麼），所以不排序
  return cards.map((c) => `${c.uid}.${c.cardId}${c.upgraded ? '+' : ''}`).join(' ');
}

/**
 * 這一刻的戰鬥指紋。兩邊算出來不一樣＝已經分岔了。
 *
 * 回傳八位十六進位字串，短到可以塞進每回合的訊息裡，也短到人眼看得出不同。
 */
export function combatFingerprint(cs: CombatState): string {
  const parts: string[] = [
    `t${cs.turn}`, cs.phase, cs.encounterId,
    // 亂數狀態：走岔一步當下看不出來，下一次抽牌才爆開
    `r${cs.rng.state.a},${cs.rng.state.b},${cs.rng.state.c},${cs.rng.state.d}`,
    `k${cs.kills}`, `c${cs.cardsPlayed}`, `s${cs.stolenFish}`,
    // 開場還沒發的「給同伴」秘寶效果（2026-09-23，同心結、分食便當）：`beginCombat` 裡就發完刪掉，正常永遠是空的。
    // 有才串進來，舊的指紋一個位元都不變；萬一哪條路漏了沒發，兩台會各自留著一份，在這裡當場抓到
    ...(cs.pendingAllyRelics?.length ? [`pal[${cs.pendingAllyRelics.map((x) => `${x.seat}:${JSON.stringify(x.effects)}`).join(',')}]`] : []),
  ];
  for (const p of cs.players) {
    parts.push([
      `P${p.seat}`, `hp${p.hp}/${p.maxHp}`, `b${p.block}`, `e${p.energy}/${p.maxEnergy}`,
      p.down ? 'DOWN' : '', p.ready ? 'RDY' : '',
      statusOf(p),
      `h[${pile(p.hand)}]`, `d[${pile(p.drawPile)}]`, `x[${pile(p.discardPile)}]`, `z[${pile(p.exhaustPile)}]`,
      `rel[${[...p.relics].sort().join(',')}]`, `pot[${p.potions.join(',')}]`,
      `pw[${p.powers.map((pw) => [pw.trigger, pw.cardId ?? '', pw.upgraded ? 1 : 0, pw.thisTurn ? 1 : 0,
        pw.cardType ?? '', pw.minQiSpent ?? '', pw.oncePerTurn ? 1 : 0, pw.firedTurn ?? '', JSON.stringify(pw.effects)].join(':')).join(',')}]`,
      `q${p.qi ?? 0}`, `nab${p.nextAttackBonus ?? 0}`, `egb${p.energyGainBlockedThisPhase ? 1 : 0}`,
      `dn${p.doubleNext}`, `f${p.fishDelta}`,
      // 菲菲的三個長效旗標：整場都在、會影響之後每一次結算，不進指紋的話分岔會晚一拍才抓到
      `pb${p.poisonBurst ?? ''}`, `bb${p.blockBonus ?? 0}`, `ef${p.echoFirst ?? 0}`, `poa${p.poisonOnAttack ?? 0}`,
      // 噹噹的四個（2026-09-17）：`pw` 只數張數，數不出千斤墜疊到幾點
      `hs${p.halfSpendBlock ? 1 : 0}`, `bwa${p.blockWhenAttacked ?? 0}`,
      `tb${p.thornsBonus ?? 0}`, `bk${p.blockKeepThisTurn ?? 0}`,
      // 橋接牌那三個（2026-09-17）
      `bot${p.blockOnThorns ?? 0}`, `tfs${p.thornsFromSpend ?? ''}`,
      `b2t${p.blockToThornsThisTurn ? `${p.blockToThornsThisTurn.per}/${p.blockToThornsThisTurn.gain}` : ''}`,
      // 連線支援牌 C 批的四個跨回合旗標（2026-09-13 稽核 低-4）。
      // 沒有它們真分岔還是會被蜷縮或手牌抓到，只是**晚一拍、而且訊息指錯地方**——
      // 分岔點會被算在後面某個無關的效果上，查起來會繞遠路。
      // `watch*` 與 `energyForAllyEachRound` 靠 `pw` 的張數間接蓋到，這裡補的是沒蓋到的四個。
      `pna${p.poisonNextAttack ? `${p.poisonNextAttack.amount}${p.poisonNextAttack.anyDamage ? 'a' : ''}` : ''}`,
      `fap${p.firedAllyPlay ? 1 : 0}`, `fsp${p.firedSelfPlay ? 1 : 0}`, `fph${p.firedPoisonHit ? 1 : 0}`,
      /*
       * 2026-09-23 內容擴充第二批的戰鬥內狀態：便當、回魂香、木人樁的計數、收鞘墜的零頭、滿月劍意發動過的回合。
       * **有才串**：沒帶這幾件的局指紋一個位元都不變。
       */
      ...(p.energyNextTurn ? [`ent${p.energyNextTurn}`] : []),
      ...(p.guardLethal ? ['gl'] : []),
      ...(p.relicCounters && Object.keys(p.relicCounters).length ? [`rc[${countersKey(p.relicCounters)}]`] : []),
      ...(p.qiSpentAcc ? [`qsa${p.qiSpentAcc}`] : []),
      ...(p.fullMoonTurn !== undefined ? [`fmt${p.fullMoonTurn}`] : []),
    ].join('|'));
  }
  for (const e of cs.enemies) {
    parts.push([
      `E${e.uid}`, e.enemyId, `hp${e.hp}/${e.maxHp}`, `b${e.block}`,
      e.dead ? 'DEAD' : '', e.escaped ? 'GONE' : '',
      `ph${e.phase}`, `mi${e.moveIndex}`, `tc${e.turnCount}`, `rv${e.reviveIn}`, `iv${e.invulnIn}`,
      `pby${e.poisonedBy ?? ''}`,   // 誰下的毒——毒死牠時擊倒獎勵算在這個人頭上，兩邊記的人不一樣會分岔
      // 誰丟的迷魂香（2026-09-23 第二批）：牠打倒同伴時擊倒獎勵歸這一位。有才串（迷魂本身在狀態那一欄）
      ...(e.dazedBy !== undefined ? [`dzb${e.dazedBy}`] : []),
      // 頭上預告的那一招：兩邊預告不同，下一拍就會打出不一樣的東西
      e.move.label,
      statusOf(e),
    ].join('|'));
  }
  return fnv1a(parts.join('\n')).toString(16).padStart(8, '0');
}

/**
 * 整局的指紋（連線版 2026-09-11）。
 *
 * 戰鬥有指紋、整局沒有——於是**離開戰鬥之後的分岔完全看不見**。
 * 實測撞到的就是這個：兩個人在地圖上投完票，各自走進**不一樣的**節點，
 * 一個打犰狳寶寶、一個打黃瓜怪，兩邊的畫面都正常、主控台乾淨，
 * 要等下一次戰鬥對帳才炸開，而且錯誤訊息指向戰鬥，查不到病根其實在地圖那一格。
 *
 * **亂數狀態排在最前面**：它是最早出現差異的地方（多跑一次抽選、少跑一次都算），
 * 血量與牌組那些要再過好幾步才看得出來。
 */
export function runFingerprint(run: RunState): string {
  const parts: string[] = [
    `r${run.rng.a},${run.rng.b},${run.rng.c},${run.rng.d}`,
    // 難度也要比（審查 低-3）：兩台難度不同時，要在走第一格就發現，不是等到魔物血量對不上
    `lv${run.difficulty ?? 1}`,
    `a${run.act}`, `f${run.floor}`, `n${run.currentNode ?? '-'}`, `u${run.nextUid}`,
    run.status,
    /*
     * 事件怎麼排也要比（審查 2026-09-14 中-2）：走進事件格會照旗標換成後集、遇過的不再排，
     * 兩台旗標不一樣的話會各自看到不同的事件，卻要到下一場戰鬥才可能炸開。
     * **只收引擎自己寫的 `event:`／`sequel:`**，加上地圖每一格排的事件——
     * 序章、看過哪隻魔物那些是畫面寫的旗標，兩台寫的時機本來就可能不同，收進來會誤報斷線。
     */
    // `chain:` 是事件鏈的旗標（2026-09-23 內容擴充第一批起，提案第⑦節）：前集記下、後集照它排，兩台不一樣就會各自排到不同的後集
    // `shop_bought:` 是店長私藏買過哪幾件（2026-09-23 第二批，引擎的 `buyRelic` 寫）：兩台不一樣，下一間店的私藏那格就會擺得不一樣
    `ev[${Object.keys(run.flags).filter((k) => run.flags[k] && (k.startsWith('event:') || k.startsWith('sequel:') || k.startsWith('chain:') || k.startsWith('shop_bought:'))).sort().join(',')}]`,
    `m[${run.map.nodes.map((n) => n.eventId ?? '').join(',')}]`,
    // 問號格變化（2026-09-23 內容擴充第三批 新G）：累積幾次、哪幾格變成什麼（伏擊連同那一組）。兩台不一樣，下一個問號格就會擲出不同的結果。
    // 有才串：還沒走進任何事件格的局（開局、舊存檔）指紋跟以前一樣
    ...(run.qmark ? [`qm${run.qmark}`] : []),
    ...(run.map.nodes.some((n) => n.variant) ? [`qv[${run.map.nodes.filter((n) => n.variant).map((n) => `${n.id}:${n.variant}:${n.encounterId ?? ''}`).join(',')}]`] : []),
  ];
  for (const p of run.players) {
    parts.push([
      `h:${p.hero ?? 'ninja'}`, `hp${p.hp}/${p.maxHp}`, `$${p.fish}`, `rm${p.removeCost}`, p.down ? 'DOWN' : '',
      `d[${p.deck.map((c: CardInstance) => `${c.uid}.${c.cardId}${c.upgraded ? '+' : ''}`).join(' ')}]`,
      `rel[${[...p.relics].sort().join(',')}]`, `pot[${p.potions.join(',')}]`,
      // 跨戰鬥的秘寶計數（木人樁、撲滿，2026-09-23 第二批）：兩台數得不一樣，發動的那一場就會分岔。有才串，舊局的指紋不變
      ...(p.counters && Object.keys(p.counters).length ? [`ctr[${countersKey(p.counters)}]`] : []),
      // 事件帶進下一場的東西（送上樓的便當，2026-09-23 內容擴充第二批）：兩台記的不一樣，下一場開打那一拍就分岔
      p.nextFight?.length ? `nf${JSON.stringify(p.nextFight)}` : '',
    ].join('|'));
  }
  return fnv1a(parts.join('||')).toString(16).padStart(8, '0');
}

/** 計數表排序後串起來：物件的鍵順序跟先寫哪一件有關，兩台內容一樣但順序不同時不該判成分岔（跟 `statusOf` 同一個理由） */
function countersKey(c: Record<string, number>): string {
  return Object.keys(c).sort().map((k) => `${k}:${c[k]}`).join(',');
}
