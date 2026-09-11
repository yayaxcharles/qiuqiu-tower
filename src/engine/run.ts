import { cardById, cards, starterDeckFor } from '../content/cards';
import { addStatus } from './statuses';
import { clampDifficulty, difficultyMods, type DifficultyMods } from '../content/difficulty';
import { encounterById, enemyById } from '../content/enemies';
import { heroOf, pickable, startRange, startRelicFor } from './hero';
import type { Hero } from './hero';
import { modifierById } from '../content/modifiers';
import { potionById, potions } from '../content/potions';
import { relicById } from '../content/relics';
import { startCombat } from './combat';
import { FLOORS, generateMap, nextChoices, nodeById } from './map';
import { Rng, seedFromString } from './rng';
import { rollCardChoices, rollPotion, rollRelic, rollRelicChoices, rollRewards, type CombatRewards } from './rewards';
import type { CardDef, CardInstance, CombatState, EnemyCombat, MapNode, PlayerCombat, Rarity, RelicPool, RunEffect, RunState } from './types';
import { me, standing } from './runplayer';

export const START_FISH = 50;
export const ACTS = 3;
export const ACT_NAMES = ['塔下', '塔中', '塔頂'] as const;

/**
 * 這一關的關主候選（遭遇 id）。
 * 走火入魔的大俠貓是故事的最終頭目（師父閉關走火入魔、把自己關在塔頂），
 * 固定守在第三關；前兩關從其餘塔主隨機。第二關還沒有專屬關主（立繪要另外生），
 * 骨架先跟第一關共用同一池。
 */
export function bossPoolForAct(act: number): string[] {
  // 塔下五選一（貓又／鐵爪／橘皮大王／蛙大名／犰狳王）、
  // 塔中五選一（奶牛貓／狸大人／波斯大小姐／沉睡的龍貓／詛咒老住持）、塔頂固定師父。
  // 新關主的立繪還在生圖中：資料先接好，圖裝進資產包才會推上線（沒圖就是灰剪影，不會報錯）。
  if (act >= 3) return ['tower_master'];
  if (act === 2) return ['cowcat_boss', 'tanuki_lord', 'persian_lady', 'dragon_cat', 'hex_abbot'];
  return ['nekomata', 'iron_claw', 'orange_king', 'frog_daimyo', 'armadillo_king'];
}
const PRICE: Record<Rarity, number> = { 常見: 50, 罕見: 75, 稀有: 150 };
const RELIC_PRICE = 150, POTION_PRICE = 45;   // 沒標價的保底值；各件的價差標在 relics.ts／potions.ts

export function runRng(run: RunState): Rng {
  const rng = new Rng(run.rng);
  run.rng = rng.state;
  return rng;
}

/** 這一局的難度旋鈕（舊存檔沒有 difficulty 就是 1） */
export function runMods(run: RunState): DifficultyMods { return difficultyMods(run.difficulty ?? 1); }

export function newRun(seed: string, difficulty = 1, hero: Hero = 'ninja'): RunState {
  const rng = new Rng(seedFromString(seed));
  const level = clampDifficulty(difficulty);
  const mods = difficultyMods(level);
  const run: RunState = {
    version: 2, seed, rng: rng.state, act: 1, difficulty: level,
    // 每人一份的家當（血量、牌組、秘寶、忍具、小魚乾、移除價）都在這裡。單機就一位
    players: [{
      ...(hero === 'ninja' ? {} : { hero }),
      hp: mods.maxHp, maxHp: mods.maxHp, fish: START_FISH,
      deck: [], relics: [], potions: [], removeCost: 75,
    }],
    floor: 0,
    map: generateMap(rng, { act: 1, bossIds: bossPoolForAct(1), eliteMul: mods.eliteMul, flags: {}, difficulty: level }), currentNode: null, trail: [],
    nextUid: 1, stats: { kills: 0, turns: 0, cardsPlayed: 0 }, status: 'playing',
    flags: {},
  };
  /*
   * 起手牌照職業發（2026-09-12 起）：
   * - 菲菲有**自己的一整套**（飛針、退開、遠射、淬毒），見 `FEIFEI_STARTER_DECK`
   * - 武士還是用球球那份；替身術是忍者獨占，武士先用一張淡定補位
   *  （武士自己的起手牌等他真的有專屬牌再說——他目前是「球球換打法」不是另一個角色）
   */
  for (const id of starterDeckFor(hero)) addCard(run, (cardById[id]?.hero && cardById[id]!.hero !== hero) ? 'tanding' : id);
  if (mods.startCurse) addCard(run, mods.startCurse);   // 難度 4 起：開局就背一張壞毛病
  takeRelic(run, startRelicFor(hero));
  return run;
}

export function currentNode(run: RunState): MapNode | null {
  return run.currentNode ? nodeById(run.map, run.currentNode) : null;
}

export function chooseNode(run: RunState, nodeId: string): MapNode {
  const n = nextChoices(run.map, run.currentNode).find((x) => x.id === nodeId);
  if (!n) throw new Error(`不能走到 ${nodeId}`);
  run.currentNode = n.id;
  run.trail.push(n.id);   // 足跡：地圖上「走過的路亮起來」靠這條
  // 顯示用的樓層是**跨關累計**的（第二關從 16F 起跳），地圖節點自己的 floor 仍是關內 1～15
  run.floor = (run.act - 1) * FLOORS + n.floor;
  return n;
}

export function beginCombat(run: RunState, encounterId?: string): CombatState {
  const enc = encounterId ?? currentNode(run)?.encounterId;
  if (!enc) throw new Error('目前節點沒有遭遇');
  const m = runMods(run);
  // 難度：所有魔物帶爪力、血量倍率；難度 5 的塔頂大魔物再加魔氣
  const strength = m.enemyStrength + (run.act >= ACTS && encounterById[enc]?.pool === '大魔物' ? m.topEliteStrength : 0);
  const startBlock = me(run).restBlock ?? 0;
  me(run).restBlock = 0;   // 暖毯的蜷縮只帶一場
  const cs = startCombat({ hp: me(run).hp, maxHp: me(run).maxHp, deck: me(run).deck.map((c) => ({ ...c })), relics: me(run).relics, potions: me(run).potions, encounterId: enc, rng: runRng(run),
    mods: { hpMul: m.hpMul, strength, startBlock }, hero: heroOf(me(run)),
    // 幾個人決定魔物的血量倍率（只放大血量，傷害不動——見 `coopscale.ts`）
    players: run.players.length });
  /*
   * 第二位之後的玩家（連線版 2026-09-11）。
   *
   * `startCombat` 只建得出第一位——它收的是一份平鋪的參數，而且魔物的血量在那一刻
   * 就要算好，所以人數是先傳進去的、人本身後補。這裡把其餘的照同一套規格補上，
   * 並且**替每一位各洗一次自己的牌堆**。
   *
   * 洗牌用的是同一顆 `cs.rng`，順序固定（座位 1、2…），所以兩台機器算出來一模一樣。
   */
  for (const rp of run.players.slice(1)) {
    const p: PlayerCombat = {
      ...(rp.hero ? { hero: rp.hero } : {}),
      seat: cs.players.length,
      relics: [...rp.relics], potions: [...rp.potions],
      hp: rp.hp, maxHp: rp.maxHp, block: 0, armour: 0, statuses: {},
      energy: 0, maxEnergy: 3 + rp.relics.reduce((s, id) => s + (relicById[id]?.hooks.energyPerTurn ?? 0), 0),
      hand: [], drawPile: cs.rng.shuffle(rp.deck.map((c) => ({ ...c }))), discardPile: [], exhaustPile: [],
      retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
      noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
      firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false, freshDebuffs: {}, fishDelta: 0,
      range: startRange(rp.hero),
    };
    cs.players.push(p);
    /*
     * **上一場就倒下的人，這一場一開始就是倒著的**（規則四）。
     *
     * 不標的話他會以站著的姿態進場——0 點生命、可以出牌、還會被魔物挑中，
     * 而「倒下」這件事就沒有代價了（隊友幫他在貓窩扶起來才該站得起來）。
     * 倒著的人不發牌、不給飯糰：`startPlayerTurn` 本來就跳過他們，
     * 這裡先發下去只是留一手用不到的牌在記憶體裡。
     */
    if (rp.down) { p.down = true; p.hp = 0; continue; }
    // 第一回合已經在 `startCombat` 裡跑過了（那時只有第一位），所以補進來的人要自己發一手牌
    p.energy = p.maxEnergy;
    p.hand = p.drawPile.splice(0, 5);
    // 暖毯的蜷縮也是各帶各的：他自己在打盹點蓋了毯子，這一場就該帶進來（然後一樣只帶一場）
    if (rp.restBlock) { p.block += rp.restBlock; rp.restBlock = 0; }
  }
  // 第一位也一樣（他是 `startCombat` 建的，那支沒有「倒下」這個輸入）
  if (run.players[0]?.down) {
    /*
     * 座位 0 是 `startCombat` 建的，那支已經跑完第一回合（發了五張牌、給滿飯糰、吃掉暖毯的蜷縮），
     * 所以要把那些**還回去**——不然主機倒下時畫面上擺著五張點不動的牌與三顆飯糰，
     * 點下去被引擎擋掉、毫無反應（稽核第二輪 中-1）。座位 1 以上是在發牌之前就 `continue`，沒這個問題。
     */
    const first = cs.players[0] as PlayerCombat;
    first.down = true; first.hp = 0;
    first.drawPile = [...first.hand, ...first.drawPile];
    first.hand = [];
    first.energy = 0;
    first.block = 0;
  }
  applyBossPrefix(run, cs);
  applyEncounterModifier(run, cs);
  return cs;
}

/**
 * 開一局兩個人的（連線版 2026-09-11）。
 *
 * 兩台機器**各自跑這一支**，餵同一顆種子與難度，算出來的整局狀態一模一樣——
 * 這是鎖步的前提，不是傳過去的。
 *
 * 第二位的牌用 `addCard(run, id, false, 1)` 發：牌號從整局共用的 `run.nextUid` 拿，
 * 兩副牌絕不會撞號（撞號的後果見 `addCard` 的說明）。
 */
export function newCoopRun(seed: string, difficulty = 1, hero: Hero = 'ninja'): RunState {
  const run = newRun(seed, difficulty, hero);
  const first = me(run);
  run.players.push({
    ...(first.hero ? { hero: first.hero } : {}),
    hp: first.hp, maxHp: first.maxHp, fish: first.fish,
    deck: [], relics: [], potions: [], removeCost: first.removeCost,
  });
  for (const c of first.deck) addCard(run, c.cardId, c.upgraded, 1);
  for (const id of first.relics) takeRelic(run, id, 1);
  return run;
}

/**
 * 遭遇修飾詞（使用者 2026-09-04 拍板）：一般怪與菁英在地圖生成時就抽好標在節點上，
 * 開戰時整場的**每一隻**魔物都吃一次。關主走自己的 `BOSS_PREFIXES`，兩套互不干擾——
 * 關主節點的 `modifier` 本來就不會被填（見 map.ts）。
 *
 * 整場的魔物都冠上修飾詞的名字（「暴怒的老鼠」，使用者 2026-09-04 指定），這樣戰鬥中的每一行
 * 紀錄、每一顆頭上的名牌都看得到這場不一樣，不用回頭想地圖上寫了什麼。
 * `startCombat` 已經用舊名字印過開場白，跟 applyBossPrefix 一樣要一併改寫，
 * 不然同一隻在紀錄裡會有兩個名字。
 *
 * 戰鬥中才冒出來的（伏兵、召喚物）不冠名：修飾詞講的是「原本站在這裡的這一群」，
 * 河童叫來的蝌蚪兵本來就不是那一群的。
 */
function nodeModifier(run: RunState, encounterId: string | undefined) {
  const node = currentNode(run);
  // 護欄一：遭遇 id 可以被呼叫端覆寫（事件戰、鏡像戰），節點標的跟實際打的不是同一場時
  // 修飾詞不能生效——今天四條覆寫路徑都落在事件或塔主節點（那些節點不會有修飾詞）所以碰不到，
  // 但那是巧合不是設計，補一行讓它變明文（稽核 2026-09-04 夜 L-1）
  if (!node || node.encounterId !== encounterId) return undefined;
  // 護欄二：`modifierById` 是 Object.fromEntries 建的，原型上的字（constructor、__proto__、toString）
  // 查得到東西。被竄改的存檔寫 `modifier: "constructor"` 會變成「undefined木樁人」（稽核同上 L-6）
  const id = node.modifier;
  return id && Object.hasOwn(modifierById, id) ? modifierById[id] : undefined;
}

export function applyEncounterModifier(run: RunState, cs: CombatState): void {
  const mod = nodeModifier(run, cs.encounterId);
  if (!mod) return;
  const oldNames = [...new Set(cs.enemies.map((e) => e.name))];
  for (const e of cs.enemies) { mod.apply(e); e.name = mod.label + e.name; }
  // 比對「舊名字＋全形冒號」而不是只比名字：「老鼠」才不會把「老鼠將軍：…」那行也改掉
  cs.log = cs.log.map((l) => (oldNames.some((n) => l.startsWith(n + '：')) ? mod.label + l : l));
  cs.log.push(`${mod.label}：${mod.desc}`);
}

/**
 * 關主隨機前綴（使用者 2026-09-04：「同一個關主偶爾帶不同開場狀態，重玩才不會每次一樣」）。
 * 塔下、塔中的關主戰有 35% 機率抽到一個；師父（第三關）不抽。名字直接改成「暴怒的橘皮大王」，
 * 開場紀錄講一句它做了什麼。三種都是有得有失：暴怒＝爪力 +2 但血 −20%；疲憊＝血 −10% 但開場 8 點防禦；披甲＝鱗甲 2（每回合長防禦）但血 −5%。
 */
export const BOSS_PREFIXES: { label: string; line: string; apply: (e: EnemyCombat) => void }[] = [
  // 數字（下一輪平衡 2026-09-05，機器人強制每場都套的 A/B）：暴怒 +2／−10% 是純加難（到第二關 −4.7 點）、
  // 疲憊 −15% 是純送分（+5.8 點）；改成 +2／−20% 與 −10% 之後三個都在 ±1～3 點內，前綴是變化不是懲罰
  { label: '暴怒的', line: '牠氣得毛都豎起來了（爪力 +2，生命 −20%）', apply: (e) => { addStatus(e, '爪力', 2); e.maxHp = Math.round(e.maxHp * 0.8); e.hp = e.maxHp; } },
  { label: '疲憊的', line: '牠看起來累壞了（生命 −10%，但先架好 8 點防禦）', apply: (e) => { e.maxHp = Math.round(e.maxHp * 0.9); e.hp = e.maxHp; e.block += 8; } },
  { label: '披甲的', line: '牠身上多披了一層甲（鱗甲 2：每回合長出防禦，生命 −5%）', apply: (e) => { addStatus(e, '鱗甲', 2); e.maxHp = Math.round(e.maxHp * 0.95); e.hp = e.maxHp; } },
];
export function applyBossPrefix(run: RunState, cs: CombatState): void {
  if (encounterById[cs.encounterId]?.pool !== '塔主' || run.act >= ACTS) return;
  const boss = cs.enemies.find((e) => enemyById[e.enemyId]?.pool === '塔主');
  if (!boss) return;
  // 用這場戰鬥自己的亂數，不再另叫 runRng：原本這一叫會把 run.rng 換成新複本，整場關主戰在舊物件上推進、
  // run.rng 停在抽前綴那一刻，戰後的獎勵是從開打前的亂數接下去抽（全面體檢 2026-09-05）
  const rng = cs.rng;
  if (!rng.chance(0.35)) return;
  const p = rng.pick(BOSS_PREFIXES);
  p.apply(boss);
  const oldName = boss.name;
  boss.name = p.label + boss.name;
  // startCombat 已經用舊名字印了開場白，一併改寫，紀錄裡才不會同一隻兩個名字（稽核 2026-09-04 中 9）
  cs.log = cs.log.map((l) => (l.startsWith(oldName + '：') ? boss.name + l.slice(oldName.length) : l));
  cs.log.push(`${boss.name}：${p.line}`);
}

export function finishCombat(run: RunState, cs: CombatState, bonusFish = 0): CombatRewards | null {
  if (cs.phase === 'player') throw new Error('戰鬥尚未結束');
  run.stats.turns += cs.turn;
  run.stats.cardsPlayed += cs.cardsPlayed;
  /*
   * 把這一場的結果寫回整局——**每一位各寫各的**（連線版 2026-09-11）。
   *
   * 原本只寫第一位，因為只有一位。兩個人時漏掉第二位的後果是整局最嚴重的一種：
   * 他這一場挨的打、喝掉的忍具、賺到的小魚乾全部不算數，下一場又滿血滿瓶開打。
   * 而且兩台機器都會這樣算，所以**指紋照樣對得上**，錯得完全無聲。
   */
  for (const p of cs.players) {
    const rp = run.players[p.seat];
    if (!rp) continue;
    rp.potions = [...p.potions];
    rp.hp = p.down ? 0 : p.hp;
    rp.down = !!p.down;
    rp.fish = Math.max(0, rp.fish + p.fishDelta);
  }
  /*
   * **輸掉的那一場也把小魚乾併回去**——這是刻意的，跟舊版不同。
   *
   * 舊版是在下面那個 `lost` 早退之後才併，等於輸掉就不算。改成先併是因為
   * 這個迴圈要一次把每個人的結果都寫回去（血量、忍具、小魚乾是同一件事），
   * 拆成兩段只會讓「誰的哪一項在哪裡寫」更難追。
   * 單機看不出差別：輸掉會 `clearSave()`，結算畫面與最佳成績都不讀小魚乾。
   */
  // 輸掉的那一場也是打倒過魔物的，統計要照收，不然總擊倒數會少算
  run.stats.kills += cs.kills;
  if (cs.phase === 'lost') { me(run).hp = 0; run.status = 'lost'; return null; }
  // 打贏回血的秘寶（暖爐石、不倒翁）。倒下的人不回——他要等打盹點才扶得起來（規則四）
  for (const rp of run.players) {
    if (rp.down) continue;
    const endHeal = rp.relics.reduce((s, id) => s + (relicById[id]?.hooks.combatEndHeal ?? 0), 0);
    if (endHeal > 0) rp.hp = Math.min(rp.maxHp, rp.hp + endHeal);
  }
  const node = currentNode(run);
  // **全場都是自己散掉的、你一隻都沒真的打倒＝沒有戰利品**（稽核 2026-09-10 高-1）。
  //
  // `combat.ts` 那邊的註解本來就寫著「不算打倒、不掉戰利品」，但它只把魔物標成 `escaped`，
  // 場上一空就判贏，這裡照樣發全額獎勵。實測：第二關的醉拳狗（消散 6）一張牌都不打、
  // 連按六次結束回合，就白拿一件大魔物秘寶＋三張牌＋35 條小魚乾；第三關的怨靈武者擺爛
  // 只挨 48 點。等於「站著不動」嚴格優於認真打。
  //
  // 判準用 `cs.kills === 0`：只要真的打倒過任何一隻（包含把三隻裡的兩隻打死、第三隻散掉），
  // 就照常發獎，不會誤傷正常打完的人。偷來的小魚乾（`fishDelta`）已經在上面結算過，不收回。
  // **判準是「自己散掉」（`faded`），不是「離場」（`escaped`）**（稽核 2026-09-10 中-1）：
  // `escaped` 還包含逃走招式與分裂本體，用它會把「橘貓山賊第五回合帶錢跑掉」也算進來——
  // 那是正常打但差一口氣，實測 1000 局有 11.2% 踩到而且全是第一關的山賊，等於平白沒收獎勵。
  // 事件獎金在早退之前就先給（稽核 2026-09-10 高-1）：那是玩家答應打這一場換來的，
  // 跟這場有沒有掉戰利品是兩件事，而且獎勵畫面本來就會另起一行印出來。
  if (bonusFish) for (const rp of standing(run)) rp.fish += bonusFish;
  /**
   * **一隻都沒打倒就沒有戰利品**（使用者 2026-09-11：「逃跑的怪不該有該隻怪的獎勵」）。
   *
   * 「跑掉」有兩種：自己散掉（`faded`，幻狐與怨靈武者）與逃走（`escaped`，橘貓山賊帶著
   * 偷到的小魚乾開溜）。兩種都是**牠全身而退、你什麼都沒拿到**，發獎說不過去——
   * 使用者實玩時看到的就是「醉拳狗打一打跑掉、獎勵還是照給」。
   *
   * 這條之前是「打進兩成血就照常發獎」（`FADE_REWARD_MIN`），理由是
   * 「認真打了六回合、把 125 血的醉拳狗打到剩兩成、最後一回合牠散掉」拿零很委屈。
   * 那個委屈的案例**已經不存在**：醉拳狗（唯一會散的大魔物）2026-09-11 拿掉了消散，
   * 現在會散的只剩兩隻一般怪，一般戰本來就不該打六回合還打不完。
   *
   * `escaped` 也含分裂本體（團子史萊姆一分為二），但那不會誤傷：分裂之後你得把兩半都清掉
   * 才算贏，那時 `cs.kills` 早就大於 0、根本進不到這條。
   *
   * 事件獎金（`bonusFish`）在上面就先給了，不受這條影響——那是玩家答應打這一場換來的。
   */
  if (cs.kills === 0 && cs.enemies.some((e) => e.faded || e.escaped)) {
    return { kind: '戰鬥', cards: [], fish: 0, potion: null, relic: null, escaped: true };
  }
  // 看遭遇屬於哪個池，不要比對特定 id——塔主現在有三個，寫死 id 會漏掉另外兩個
  const isBoss = encounterById[cs.encounterId ?? '']?.pool === '塔主';
  const kind: CombatRewards['kind'] = isBoss ? '塔主' : node?.type === '大魔物' ? '大魔物' : '戰鬥';
  const winGold = me(run).relics.reduce((s, id) => s + (relicById[id]?.hooks.winGold ?? 0), 0);
  // 「後期」＝第一關的 8F 起、或第二關以後：獎勵抽好一點的牌
  const late = run.act >= 2 || run.floor >= 8;
  // 牌組裡已經有兩張的不再開（第三張同名牌等於少一個選項）；稀有保底見 RunState.rarePity
  const counts = new Map<string, number>();
  for (const c of me(run).deck) counts.set(c.cardId, (counts.get(c.cardId) ?? 0) + 1);
  const exclude = [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
  // 遭遇修飾詞掛在戰利品上的兩條：中了魔氣的多挑一張牌、肥美的／餓扁了的改小魚乾（見 content/modifiers）
  const mod = nodeModifier(run, cs.encounterId);
  const extraChoices = me(run).relics.reduce((s, id) => s + (relicById[id]?.hooks.rewardChoices ?? 0), 0)
    + (mod?.extraCard ? 1 : 0);   // 掌門印：牌多一張可選
  const upgradeChance = upgradeChanceFor(run);   // 戰鬥獎勵開出升級牌的機率（數字見 upgradeChanceFor）
  /*
   * 戰利品**開一份、兩個人共用**（牌照使用者規則三各挑一張，見 `takeCardReward`）。
   *
   * 開的時候看的是第一位的秘寶、牌組與稀有保底——一份共用的戰利品總得有個基準，
   * 而且兩台機器都用同一個基準才算得出同一份。兩位的差異體現在「各挑各的」那一步。
   */
  const r = rollRewards(runRng(run), kind, me(run).relics, winGold, late, { exclude, rareBonus: (me(run).rarePity ?? 0) * 4, extraChoices, upgradeChance, hero: heroOf(me(run)),
    ...(run.players.length > 1 ? { ownedPerSeat: run.players.map((p) => p.relics) } : {}) });
  if (r.cards.length) me(run).rarePity = r.cards.some((c) => c.rarity === '稀有') ? 0 : (me(run).rarePity ?? 0) + 1;
  // 肥美／餓扁改固定加減（下一輪平衡 2026-09-05）：倍率對 15～25 條的戰利品只有 ±10～20 條，換的卻是 ±25% 血，秤不平；
  // 固定值也不會再碰到「把秘寶答應的加成一起砍掉」那個坑（稽核 2026-09-04 夜 M-2）：下限就是秘寶答應的那份（稽核 2026-09-05 夜 2 低-1）
  if (mod?.fishAdd) r.fish = Math.max(winGold, r.fish + mod.fishAdd);
  if (mod) r.modifier = { label: mod.label, desc: mod.desc };   // 獎勵畫面要講得出「因為這場是肥美的」
  /*
   * 小魚乾與忍具**兩個人各拿一份全額**（規則三「獎勵分開給」，不是分一半）。
   *
   * 為什麼不對半分：兩個人的魔物血量是 1.5 倍（見 `coopscale.ts`），一場戰鬥的工作量
   * 是一個人的 1.5 倍卻要養兩副牌組、兩個背包；對半分等於兩個人都比單機窮一半，
   * 商店與移除牌整局都逛不起。倒下的人不分（他這一場沒在打）。
   */
  for (const rp of standing(run)) rp.fish += r.fish;   // 獎金另計：r.fish 維持規格 §5.4 的戰利品數字，不把事件獎金摻進去（bonusFish 在上面早退之前就加過了）
  /*
   * 秘寶：單機直接給；兩個人時攤在獎勵畫面上各挑一件（`relicOffers`，規則三）。
   *
   * 走到這條的只剩**塔主的信物**（`rollRewards` 對塔主一律回 `tower_token`），
   * 那是「你打倒了關主」的證明，不是戰利品，所以**兩個人都要有**——
   * 只給第一位的話，第二位的秘寶列會少一格，而他明明也在場打完了那一場。
   */
  if (r.relic) for (const rp of standing(run)) takeRelic(run, r.relic, run.players.indexOf(rp));
  if (r.potion) {
    // 一人一個背包，滿的人不一定是同一個。全部人都收不下才把這一支收回來讓畫面問要不要換
    const missed = standing(run).filter((rp) => !addPotion(run, r.potion as string, run.players.indexOf(rp)));
    if (missed.length) r.potionMissedSeats = missed.map((rp) => run.players.indexOf(rp));
    if (missed.length === standing(run).length) { r.potionMissed = r.potion; r.potion = null; }   // 帶滿：留著讓獎勵畫面問要不要換
  }
  // 只有第三關的關主倒下才算通關；前兩關的關主打完由 advanceAct 接手進下一關
  if (kind === '塔主' && run.act >= ACTS) run.status = 'won';
  return r;
}

/**
 * 進下一關：回滿血、生下一關的地圖、回到「還沒踏上第一個節點」的狀態。
 * 回滿血是跟「殺戮尖塔」一樣的取捨——後面的怪更痛，不回滿活不到第三關。
 * 這裡**不存檔**（規格 §3：節點結算完才存），存檔交給過關畫面收尾的 backToMap()。
 */
export function advanceAct(run: RunState): void {
  if (run.act >= ACTS || run.status !== 'playing') return;
  run.act += 1;
  // 過關回血：難度 3 起只補回缺血的七成五（殺戮尖塔進階 5 的做法）
  const heal = runMods(run).actHeal;
  // 每一位都回（連線版 2026-09-11）：只回第一位的話，第二位整局被硬扣掉兩次回復，後面撐不住
  for (const p of run.players) {
    if (p.down) continue;   // 倒下的人不回：血條顯示滿的、狀態卻還是倒下，只會讓同伴誤判（稽核第二輪 中-2）
    p.hp = heal >= 1 ? p.maxHp : Math.min(p.maxHp, p.hp + Math.round((p.maxHp - p.hp) * heal));
  }
  run.map = generateMap(runRng(run), { act: run.act, bossIds: bossPoolForAct(run.act), eliteMul: runMods(run).eliteMul, flags: run.flags, difficulty: run.difficulty ?? 1 });
  run.currentNode = null;
  run.trail = [];
  run.floor = (run.act - 1) * FLOORS;
}

/**
 * 過關獎勵之二：稀有牌三選一（兩張忍術＋一張絕學）。
 * 打倒關主原本一張牌都不給，牌組跨關幾乎只靠一般戰鬥的常見池長大，
 * 中後期永遠差一口氣——這是「牌組養不起來」的另一個病根。
 */
export function rollActCards(run: RunState): CardDef[] {
  const rng = runRng(run);
  const h = heroOf(me(run));
  const jue = rollCardChoices(rng, '絕學', 1, [], true, 0, undefined, h);
  const ren = rollCardChoices(rng, '忍術', 2, jue.map((c) => c.id), true, 0, undefined, h);
  return rng.shuffle([...jue, ...ren]);
}

/** 過關獎勵：大魔物級秘寶三選一。池子抽乾了就有幾件算幾件（有可能一件都不剩）。 */
export function rollActRelics(run: RunState, n = 3): string[] {
  const rng = runRng(run);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    // 過關三選一抽塔主池（圖鑑也這樣寫）；塔主池抽完了才退回大魔物池——以前一直抽大魔物池，塔主池九件永遠拿不到（審查 #2）
    const id = rollRelic(rng, '塔主', [...me(run).relics, ...out]) ?? rollRelic(rng, '大魔物', [...me(run).relics, ...out]);
    if (id) out.push(id);
  }
  return out;
}

/**
 * 收下戰利品裡的一張牌。`seat` 不填就是自己。
 *
 * **`rewards.cards` 不在這裡清空**（以前會，兩個人一起玩就壞了）：
 * 兩位玩家從**同一份**戰利品各挑一張，第一位挑完就清掉的話，第二位的挑選
 * 會被判成「這張不在戰利品裡」而靜靜落空。清空改由呼叫端在全部挑完之後做。
 */
export function takeCardReward(run: RunState, rewards: CombatRewards, cardId: string | null, seat = 0): void {
  if (cardId && rewards.cards.some((c) => c.id === cardId)) {
    addCard(run, cardId, rewards.upgradedCard === cardId, seat);   // 開出來的升級牌拿到就是升級版
  }
}

/** 這一份戰利品處理完了（牌不再能挑）。單機挑完一張就叫，兩個人要等兩邊都挑完 */
export function closeCardReward(rewards: CombatRewards): void { rewards.cards = []; }

/**
 * 加一張牌進**某一位**的牌組。`seat` 不填就是自己。
 *
 * **牌號一律從整局共用的 `run.nextUid` 拿**，兩個人的牌絕不撞號。
 * 撞號的後果很安靜：`canPlay` 是在那一位自己的手牌裡找 uid，撞號的話
 * 「打對方的牌」會誤打成自己同號的那一張，引擎不報錯、畫面上那張牌憑空變成另一張；
 * 連線版每個動作送的就是 uid，撞號等於兩台機器對「哪一張」的認知不同，直接分岔。
 * （`tests/engine/coop.rewards.test.ts` 有一條在守這件事。）
 */
export function addCard(run: RunState, cardId: string, upgraded = false, seat = 0): CardInstance {
  if (!cardById[cardId]) throw new Error(`未知的牌：${cardId}`);
  const c: CardInstance = { uid: run.nextUid++, cardId, upgraded };
  me(run, seat).deck.push(c);
  return c;
}
export function removeCard(run: RunState, uid: number, seat = 0): boolean {
  const i = me(run, seat).deck.findIndex((c) => c.uid === uid);
  if (i < 0) return false;
  me(run, seat).deck.splice(i, 1);
  return true;
}
export function upgradeCard(run: RunState, uid: number, seat = 0): boolean {
  const c = me(run, seat).deck.find((x) => x.uid === uid);
  if (!c || c.upgraded || cardById[c.cardId]?.pool === '壞毛病') return false;
  c.upgraded = true;
  return true;
}

export function takeRelic(run: RunState, relicId: string, seat = 0): boolean {
  const def = relicById[relicId];
  if (!def || me(run, seat).relics.includes(relicId)) return false;
  me(run, seat).relics.push(relicId);
  const d = def.hooks.maxHp ?? 0;
  if (d) { const p = me(run, seat); p.maxHp += d; p.hp = Math.min(p.maxHp, Math.max(1, p.hp + Math.max(0, d))); }
  return true;
}

/** 忍具格數＝難度給的格數＋秘寶加成（忍具袋） */
export function potionCapacity(run: RunState, seat = 0): number {
  return runMods(run).potionSlots + me(run, seat).relics.reduce((s, id) => s + (relicById[id]?.hooks.potionSlots ?? 0), 0);
}
/** 帶滿時用新的換掉第 index 支（2026-09-02 使用者：「滿的話新拿到的可以把舊的替換掉」） */
export function replacePotion(run: RunState, index: number, potionId: string, seat = 0): boolean {
  const p = me(run, seat);
  if (index < 0 || index >= p.potions.length || !potions.some((x) => x.id === potionId)) return false;
  p.potions[index] = potionId;
  return true;
}
export function addPotion(run: RunState, potionId: string, seat = 0): boolean {
  const p = me(run, seat);
  if (p.potions.length >= potionCapacity(run, seat) || !potions.some((x) => x.id === potionId)) return false;
  p.potions.push(potionId);
  return true;
}

/** 打盹回多少：最大生命三成 × 秘寶倍率（貓草）＋ 固定加成（貓草種子）。畫面顯示與實際結算共用這一條 */
export function napHeal(run: RunState, seat = 0): number {
  // 44F（第三關 14F，師父前一格）的貓窩打盹回滿：走到師父面前平均只剩七成六的血，17 回合的最終戰撐不住
  //（使用者 2026-09-06 拍板「師父前補給」；44F 本來就保底一個貓窩，差的是回多少）
  if (run.act >= 3 && run.floor === 44) return me(run, seat).maxHp;
  const p = me(run, seat);
  const mult = p.relics.reduce((m, id) => m * (relicById[id]?.hooks.restMultiplier ?? 1), 1);
  const flat = p.relics.reduce((n, id) => n + (relicById[id]?.hooks.restFlat ?? 0), 0);
  return Math.floor(p.maxHp * 0.3 * mult) + flat;
}
/**
 * 全力準備（44F、難度 4 起；玩家 2026-09-08 建議）：升級一張牌＋回一成血，再把全部小魚乾換成生命（÷10、無條件捨去），
 * 小魚乾歸零。師父前一格之後小魚乾本來就沒地方花；打盹照舊回滿，「上樓前想升級又想多回一點」才選這個。
 */
export function fullPrepAvailable(run: RunState): boolean {
  return run.act >= 3 && run.floor === 44 && (run.difficulty ?? 1) >= 4;
}
/** 全力準備回多少：一成＋小魚乾÷10（畫面顯示與實際結算共用這一條；封頂在最大生命由 rest 處理） */
export function fullPrepHeal(run: RunState, seat = 0): { tenth: number; fromFish: number; total: number } {
  const tenth = Math.floor(me(run, seat).maxHp * 0.1);
  const fromFish = Math.floor(me(run, seat).fish / 10);
  return { tenth, fromFish, total: tenth + fromFish };
}
/**
 * 倒下的同伴在打盹點爬起來時回多少血（使用者 2026-09-11：「打盹可以救回來」）。
 *
 * 三成：救得起來，但爬起來是虛的，下一場得靠隊友頂著——救人本身要有重量，
 * 不然「倒下」這件事就沒有份量了。救的人也付出代價：他這一格不能打盹也不能磨爪。
 */
export const REVIVE_RATIO = 0.3;

/**
 * 打盹點扶起倒下的同伴（規則四的後半）。
 *
 * `seat`＝要扶誰。扶人的那一位**用掉了自己這一格的打盹機會**，這就是代價；
 * 所以一個貓窩要嘛自己回血、要嘛救人，得商量。
 */
export function revivePartner(run: RunState, seat: number): boolean {
  const p = run.players[seat];
  if (!p || !p.down) return false;
  p.down = false;
  p.hp = Math.max(1, Math.floor(p.maxHp * REVIVE_RATIO));
  return true;
}

export function rest(run: RunState, choice: '打盹' | '磨爪' | '全力準備', uid?: number, seat = 0): boolean {
  const p = me(run, seat);
  if (p.down) return false;   // 倒下的人自己動不了，要等隊友扶（見 `revivePartner`）
  if (choice === '全力準備') {
    if (!fullPrepAvailable(run)) return false;
    const ok = uid !== undefined && upgradeCard(run, uid, seat);
    if (!ok) return false;
    p.hp = Math.min(p.maxHp, p.hp + fullPrepHeal(run, seat).total);
    p.fish = 0;
    return true;
  }
  if (choice === '打盹') {
    p.hp = Math.min(p.maxHp, p.hp + napHeal(run, seat));
    // 暖毯：打盹後下一場開戰帶蜷縮
    p.restBlock = p.relics.reduce((n, id) => n + (relicById[id]?.hooks.restNextFightBlock ?? 0), 0);
    return true;
  }
  // 磨爪順便回一成血（打盹的三分之一）：一關只有兩三次貓窩，升級跟回血硬碰硬的話
  // 血一掉就永遠選打盹，四十五層只升得了三四張牌（2026-09-02 機器人實測平均 3.6 張）
  const ok = uid !== undefined && upgradeCard(run, uid, seat);
  if (ok) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.1));
  return ok;
}

/**
 * 紙箱節點：**一定給一件秘寶**（使用者 2026-09-10：「紙箱節點是一定有寶物，不要有空的，
 * 除非是事件的紙箱」）。
 *
 * 本來只抽常見池，30 件收齊之後就開出空箱——走到紙箱、看完演出、什麼都沒有，
 * 那個節點等於白走一趟。現在常見抽不到就往上退到大魔物池、再退到塔主池；
 * 三池 64 件全部收齊才會真的空（那時整局也差不多結束了）。
 *
 * **事件裡的紙箱不走這裡**（`applyRunEffects` 的 `relic` 效果），那邊指定哪一池就是哪一池，
 * 抽不到會照舊寫一句「這一池的秘寶都拿過了」——事件本來就會有拿不到東西的選項。
 */
const CHEST_POOLS: RelicPool[] = ['常見', '大魔物', '塔主'];

export function openChest(run: RunState, seat = 0): string | null {
  const rng = runRng(run);
  for (const pool of CHEST_POOLS) {
    const id = rollRelic(rng, pool, me(run, seat).relics);
    if (id) { takeRelic(run, id, seat); return id; }
  }
  return null;
}

/**
 * 兩個人的紙箱：開兩件出來各挑一件（規則三，跟大魔物的秘寶同一套）。
 *
 * 抽法跟單人一樣一池一池往上退，只是每一池要抽到兩件都抽不出來才換池——
 * 這樣「一定有東西」的保證對兩個人都成立。
 */
export function openChestCoop(run: RunState): string[] {
  const rng = runRng(run);
  const ownedPerSeat = run.players.map((p) => p.relics);
  for (const pool of CHEST_POOLS) {
    const got = rollRelicChoices(rng, pool, ownedPerSeat, run.players.length);
    if (got.length) return got;
  }
  return [];
}

export interface ShopStock {
  /**
   * `base`＝未打折的定價；`price`＝現在的售價（買到零錢罐那一刻整間店重標，見 repriceShop）；`upgraded`＝這格是升級版；
   * `sale`＝特價折數（0.7＝七折；每間店隨機一件，使用者 2026-09-04）
   */
  cards: { def: CardDef; base: number; price: number; sold: boolean; upgraded?: boolean; sale?: number }[];
  relics: { id: string; base: number; price: number; sold: boolean; sale?: number }[];
  potions: { id: string; base: number; price: number; sold: boolean; sale?: number }[];
  /** 重整貨架用過了沒（每店一次，75 條；賣掉的格子不動） */
  reshuffled?: boolean;
}

/** 特價折數與權重：七折最常見、三折最少（使用者 2026-09-04：「不一定五折，7／5／4／3 折隨機，機率你定」） */
export const SALE_RATES: readonly [number, number][] = [[0.7, 45], [0.5, 30], [0.4, 15], [0.3, 10]];
export const RESHUFFLE_COST = 75;

function priceOf(base: number, mul: number, sale?: number): number { return Math.round(base * mul * (sale ?? 1)); }
/** 罐頭鋪牌格數：第一關 5、第二關起 6 */
export function shopCardCount(run: RunState): number { return run.act >= 2 ? 6 : 5; }

/** 罐頭鋪價格倍率：難度 4 起貴一成 × 帶著的秘寶折扣（零錢罐八折、貪吃錢袋漲三成，相乘） */
export function shopMulFor(run: RunState, seat = 0): number {
  return runMods(run).shopMul * me(run, seat).relics.reduce((m, id) => m * (relicById[id]?.hooks.shopDiscount ?? 1), 1);
}

/** 依現在的倍率把還沒賣掉的東西重新標價（買到會改價格的秘寶時叫——使用者 2026-09-04：買了零錢罐商品沒跟著變） */
export function repriceShop(run: RunState, shop: ShopStock): void {
  const mul = shopMulFor(run);
  for (const it of [...shop.cards, ...shop.relics, ...shop.potions]) if (!it.sold) it.price = priceOf(it.base, mul, it.sale);
}

/** 罐頭鋪的牌：依關數的稀有度配額抽 n 張（排除 `exclude`），並套稀有保底 */
function rollShopCards(run: RunState, rng: Rng, n: number, exclude: string[]): CardDef[] {
  const odds: readonly [Rarity, number][] = run.act >= 3 ? [['常見', 20], ['罕見', 40], ['稀有', 40]]
    : run.act === 2 ? [['常見', 35], ['罕見', 40], ['稀有', 25]] : [['常見', 60], ['罕見', 30], ['稀有', 10]];
  const jueN = n > 0 && rng.chance(run.act >= 3 ? 0.4 : run.act === 2 ? 0.3 : 0.2) ? 1 : 0;
  const cardDefs = [...rollCardChoices(rng, '忍術', n - jueN, exclude, false, 0, odds, heroOf(me(run))), ...rollCardChoices(rng, '絕學', jueN, exclude, false, 0, odds, heroOf(me(run)))];
  const wantRare = Math.min(n, run.act >= 3 ? 2 : run.act === 2 ? 1 : 0);
  const order = rng.shuffle(cardDefs.map((_, i) => i)).sort((x, y) => Number(cardDefs[x]!.pool === '絕學') - Number(cardDefs[y]!.pool === '絕學'));
  for (const i of order) {
    if (cardDefs.filter((c) => c.rarity === '稀有').length >= wantRare) break;
    const cur = cardDefs[i]!;
    if (cur.rarity === '稀有') continue;
    const pool = cards.filter((c) => c.pool === cur.pool && c.rarity === '稀有' && pickable(c, heroOf(me(run)), run.players.length) && !exclude.includes(c.id) && !cardDefs.some((d) => d.id === c.id));
    if (pool.length) cardDefs[i] = rng.pick(pool);
  }
  return cardDefs;
}

/**
 * 重整貨架（使用者 2026-09-04；2026-09-07 擴大到整間店）：75 條、每店一次，
 * **牌、秘寶、忍具三區沒賣掉的格子全部換一批**。
 *
 * 原本只換牌格——使用者 2026-09-07 回報「怎麼秘寶跟忍具沒有變換」，按鈕寫「重整貨架」
 * 卻只動新招區，連他自己都被誤導，所以改成名實相符。
 * 賣掉的格子一律不動（維持原樣、寫「賣掉了」），免得花 75 條反而把架子變滿、越買越多。
 * 特價如果掛在被換掉的格子上，新商品繼承那個折數。
 * 秘寶會避開玩家身上已有的與這間店還留著的，不會洗出重複；珍品架（第三格，第二關起才有）
 * 照舊抽大魔物池，其餘抽常見——跟 makeShop 的排法一致。忍具跟開店時一樣不去重。
 */
export function reshuffleShop(run: RunState, shop: ShopStock, seat = 0): boolean {
  const openOf = (arr: readonly { sold: boolean }[]): number[] =>
    arr.map((it, i) => (it.sold ? -1 : i)).filter((i) => i >= 0);
  const openCards = openOf(shop.cards);
  const openRelics = openOf(shop.relics);
  const openPotions = openOf(shop.potions);
  const total = openCards.length + openRelics.length + openPotions.length;
  if (shop.reshuffled || !total || !pay(run, RESHUFFLE_COST, seat)) return false;   // 沒有空格可換就不收錢（稽核 2026-09-04 低 1）
  shop.reshuffled = true;
  const rng = runRng(run);
  const mul = shopMulFor(run);

  const fresh = rollShopCards(run, rng, openCards.length, shop.cards.map((c) => c.def.id));
  const upIdx = fresh.length && rng.chance(upgradeChanceFor(run)) ? rng.int(0, fresh.length - 1) : -1;
  openCards.forEach((slot, k) => {
    const def = fresh[k]; if (!def) return;
    const prev = shop.cards[slot]!;
    shop.cards[slot] = { def, base: PRICE[def.rarity], price: priceOf(PRICE[def.rarity], mul, prev.sale), sold: false, ...(k === upIdx ? { upgraded: true } : {}), ...(prev.sale ? { sale: prev.sale } : {}) };
  });

  // 排除清單含「整排現在擺著的秘寶」——不只賣掉那幾格，要被換掉的那幾格也算。
  // 只排除賣掉的話，同一格有機會原封不動抽回同一件（常見池扣掉身上的約剩二十來件，
  // 三格合計一成多的機率至少一格看起來沒變），又變成使用者抱怨的「怎麼沒變換」（稽核 2026-09-07 低 1）。
  // 牌格本來就是整排排除（見上面傳給 rollShopCards 的第四個參數），兩邊一致。
  const taken = [...me(run).relics, ...shop.relics.map((r) => r.id)];
  for (const slot of openRelics) {
    const id = rollRelic(rng, slot >= 2 ? '大魔物' : '常見', taken);
    if (!id) continue;   // 池子抽乾就維持原樣，不留空格
    taken.push(id);
    const prev = shop.relics[slot]!;
    const base = relicById[id]?.price ?? RELIC_PRICE;
    shop.relics[slot] = { id, base, price: priceOf(base, mul, prev.sale), sold: false, ...(prev.sale ? { sale: prev.sale } : {}) };
  }

  for (const slot of openPotions) {
    const prev = shop.potions[slot]!;
    const id = rollPotion(rng);
    const base = potionById[id]?.price ?? POTION_PRICE;
    shop.potions[slot] = { id, base, price: priceOf(base, mul, prev.sale), sold: false, ...(prev.sale ? { sale: prev.sale } : {}) };
  }
  return true;
}

/** 戰鬥獎勵、罐頭鋪、事件選牌開出「升級牌」的機率：第一關 20%、第二關 25%、第三關 40%（2026-09-04 定 10／20／40，2026-09-06 第二輪平衡調高） */
export function upgradeChanceFor(run: RunState): number {
  // 第一關 10→20%、第二關 20→25%（第二輪平衡 2026-09-06）：牌組品質是關主戰勝負的主因（體檢：好牌組對第一關關主 71～93%），
  // 機器人每隻關主 +2～3 點、通關 0.67→0.80%
  return run.act >= 3 ? 0.4 : run.act === 2 ? 0.25 : 0.2;
}

export function makeShop(run: RunState): ShopStock {
  const shopMul = shopMulFor(run);
  const rng = runRng(run);
  // 罐頭鋪的稀有度隨關數往上（使用者 2026-09-03）、絕學低機率一張、稀有保底（稽核 2026-09-04 M-4）——全部在 rollShopCards 裡
  // 第二關起貨架放六張牌（使用者 2026-09-04：新招區還有空間）；第一關五張
  const cardDefs = rollShopCards(run, rng, shopCardCount(run), []);
  const relicIds: string[] = [];
  for (let i = 0; i < 2; i++) { const id = rollRelic(rng, '常見', [...me(run).relics, ...relicIds]); if (id) relicIds.push(id); }
  // 珍品架（使用者 2026-09-04）：第二、三關多一件大魔物池的秘寶，標價照那件秘寶自己的定價（使用者：不要另外抬到 250）
  let treasure: string | null = null;
  if (run.act >= 2) { treasure = rollRelic(rng, '大魔物', [...me(run).relics, ...relicIds]); if (treasure) relicIds.push(treasure); }
  // 升級牌：依關數機率把架上（第一關五張、第二關起六張）的一張標成升級版（同價；使用者 2026-09-04：罐頭鋪也要套用）
  const upgradedIdx = cardDefs.length && rng.chance(upgradeChanceFor(run)) ? rng.int(0, cardDefs.length - 1) : -1;
  const shop: ShopStock = {
    cards: cardDefs.map((def, i) => ({ def, base: PRICE[def.rarity], price: priceOf(PRICE[def.rarity], shopMul), sold: false, ...(i === upgradedIdx ? { upgraded: true } : {}) })),
    relics: relicIds.map((id) => { const base = relicById[id]?.price ?? RELIC_PRICE; return { id, base, price: priceOf(base, shopMul), sold: false }; }),
    potions: Array.from({ length: 3 }, () => {
      const id = rollPotion(rng);
      const base = potionById[id]?.price ?? POTION_PRICE;
      return { id, base, price: priceOf(base, shopMul), sold: false };
    }),
  };
  // 每店一件特價（使用者 2026-09-04）：全部商品裡隨機一件，折數照 SALE_RATES 的權重抽
  const all = [...shop.cards, ...shop.relics, ...shop.potions];
  if (all.length) {
    const total = SALE_RATES.reduce((s, [, w]) => s + w, 0);
    let roll = rng.next() * total; let rate = SALE_RATES[0]![0];
    for (const [rt, w] of SALE_RATES) { roll -= w; if (roll < 0) { rate = rt; break; } }
    const it = all[rng.int(0, all.length - 1)]!;
    it.sale = rate; it.price = priceOf(it.base, shopMul, rate);
  }
  return shop;
}

/**
 * 這一位要付多少（連線版 2026-09-11）。
 *
 * **貨架是共用的、折扣是各自的**：零錢罐、貪吃錢袋那類改價的秘寶掛在人身上，
 * 一個人買到不該讓另一個人也跟著便宜。所以標價只存「未打折的定價」與特價折數，
 * 真正的售價每次照買的人重算。
 *
 * `it.price` 仍然留著：那是第一位看到的價格，單機的畫面與既有測試都讀它，
 * 對第一位來說兩者永遠相等（同一條算式、同一批秘寶）。
 */
export function priceFor(run: RunState, it: { base: number; sale?: number }, seat = 0): number {
  return priceOf(it.base, shopMulFor(run, seat), it.sale);
}

function pay(run: RunState, price: number, seat = 0): boolean {
  const p = me(run, seat);
  if (p.fish < price) return false;
  p.fish -= price;
  return true;
}
export function buyCard(run: RunState, shop: ShopStock, i: number, seat = 0): boolean {
  const it = shop.cards[i]; if (!it || it.sold || !pay(run, priceFor(run, it, seat), seat)) return false;
  it.sold = true; addCard(run, it.def.id, !!it.upgraded, seat); return true;   // 標成升級版的那格買到就是升級牌
}
export function buyRelic(run: RunState, shop: ShopStock, i: number, seat = 0): boolean {
  const it = shop.relics[i]; if (!it || it.sold || me(run, seat).relics.includes(it.id) || !pay(run, priceFor(run, it, seat), seat)) return false;
  it.sold = true; takeRelic(run, it.id, seat);
  repriceShop(run, shop);   // 零錢罐、貪吃錢袋這類改價的秘寶買到當下整間店重標（使用者 2026-09-04）
  return true;
}
/** `replaceIndex`＝帶滿時要換掉哪一支；帶滿又沒指定就不賣（錢也不扣） */
export function buyPotion(run: RunState, shop: ShopStock, i: number, replaceIndex?: number, seat = 0): boolean {
  const it = shop.potions[i]; if (!it || it.sold) return false;
  const full = me(run, seat).potions.length >= potionCapacity(run, seat);
  if (full && (replaceIndex === undefined || replaceIndex < 0 || replaceIndex >= me(run, seat).potions.length)) return false;
  if (!pay(run, priceFor(run, it, seat), seat)) return false;
  it.sold = true;
  if (full) replacePotion(run, replaceIndex!, it.id, seat); else addPotion(run, it.id, seat);
  return true;
}
export function buyRemove(run: RunState, uid: number, seat = 0): boolean {
  const q = me(run, seat);
  if (!q.deck.some((c) => c.uid === uid) || !pay(run, q.removeCost, seat)) return false;
  removeCard(run, uid, seat); q.removeCost += 25; return true;
}

export type RunEffectOutcome =
  /**
   * `n`＝要玩家挑幾張。本來只是一個旗標，事件寫兩次 `upgradeCard` 也只會覆蓋成同一個，
   * 畫面就只跳一次選牌——「升級兩張牌」的事件實際上只升到一張（鏡子、腳印兩個事件都中招）。
   */
  | { needs: 'removeCard' | 'upgradeCard'; n: number }
  | { chooseCard: CardDef[]; upgradedCard?: string }   // `upgradedCard`＝這一張是升級版（機率同戰鬥獎勵）
  /** `afterWin`＝同一個選項裡其他的獎勵效果（秘寶、小魚乾、牌……），要等打贏才發；事件畫面開打前把它放進 run.pendingAfterFight */
  | { fight: { encounterId: string; bonusFish: number; bonusUpgrades?: number; afterWin?: RunEffect[] } }
  | null;

/**
 * 跑一串整局效果。
 *
 * `notes` 是給畫面用的「實際發生了什麼」：有幾種效果**在畫面上完全看不出結果**——賭飯糰
 * 到底中了哪一邊、忍具帶滿時多的那幾個被靜靜丟掉、隨機撿到的是哪一張牌——事件畫面拿這幾句
 * 補在結果文案下面（`finish` 的第二個參數）。傳不傳都行，機器人試玩就不傳。
 * 這裡寫的是敘述句，不是球球講話，所以句尾不加「喵」。
 */
/**
 * 事件實際拿到手的東西。`notes` 只寫得出一行字（「拿到忍具「鐵爪套」「小魚乾串」」），
 * 玩家看不到那是什麼、有什麼用——使用者的原話：「圖片跟功能這邊沒顯示出來會不知道拿到了甚麼」。
 * 所以另外收一份結構化的清單，畫面拿它排出圖示＋名稱＋效果，跟戰利品畫面同一種列。
 */
/** `missed`＝忍具帶滿收不下（畫面會問要不要換掉一支舊的） */
export type RunGain = { kind: '秘寶' | '忍具'; id: string; missed?: boolean };

export function applyRunEffects(run: RunState, effects: RunEffect[], notes?: string[],
  gains?: RunGain[], seat = 0): RunEffectOutcome {
  let outcome: RunEffectOutcome = null;
  const cardName = (id: string): string => cardById[id]?.name ?? id;
  /**
   * 這一次呼叫裡「已經交出去、不要再抽回來」的秘寶（換家的老鼠）。
   * `rollRelic` 只避開身上現有的，交出去那一刻它就從 `run.relics` 消失了，
   * 不另外記的話後面兩抽有機會原封不動換回同一件（稽核 2026-09-11 低-1）。
   */
  const excludeRelics: string[] = [];
  // 同一個選項裡有「打一場」：其他獎勵（秘寶、小魚乾、牌……）不能先發，要等打贏（使用者 2026-09-04）。
  // 旗標照常記（那是「你選了什麼」，不是獎勵）。
  const fightIdx = effects.findIndex((e) => e.kind === 'fight');
  // 要玩家互動的（挑牌、放生、升級）不能延後——延後了就沒有畫面接手、會被靜靜吞掉（稽核 2026-09-04 中 1）；它們當場做，其餘戰利品打贏才發
  const interactive = (e: RunEffect): boolean => e.kind === 'chooseCard' || e.kind === 'removeCard' || e.kind === 'upgradeCard';
  const deferred: RunEffect[] = fightIdx >= 0 ? effects.filter((e) => e.kind !== 'fight' && e.kind !== 'flag' && !interactive(e)) : [];
  const now = fightIdx >= 0 ? effects.filter((e) => e.kind === 'fight' || e.kind === 'flag' || interactive(e)) : effects;
  if (deferred.length) notes?.push('獎勵要打贏才拿得到');
  for (const fx of now) {
    switch (fx.kind) {
      case 'heal': { const got = Math.min(me(run, seat).maxHp, me(run, seat).hp + fx.n) - me(run, seat).hp; me(run, seat).hp += got; if (got > 0) notes?.push(`回復了 ${got} 點生命`); break; }
      case 'healPercent': { const got = Math.min(me(run, seat).maxHp, me(run, seat).hp + Math.floor(me(run, seat).maxHp * fx.p)) - me(run, seat).hp; me(run, seat).hp += got; if (got > 0) notes?.push(`回復了 ${got} 點生命`); break; }
      // 難度 4 起壞事件更壞：掉血乘 1.5、賭博成功率乘 0.7
      case 'damage': { const lost = me(run, seat).hp - Math.max(1, me(run, seat).hp - Math.round(fx.n * (runMods(run).unlucky ? 1.5 : 1))); me(run, seat).hp -= lost; if (lost > 0) notes?.push(`受了 ${lost} 點傷害`); break; }
      case 'fish': { const before = me(run, seat).fish; me(run, seat).fish = Math.max(0, me(run, seat).fish + fx.n); const d = me(run, seat).fish - before; if (d > 0) notes?.push(`拿到 ${d} 條小魚乾`); else if (d < 0) notes?.push(`少了 ${-d} 條小魚乾`); break; }
      case 'fishHalve': { const gone = me(run, seat).fish - Math.floor(me(run, seat).fish / 2); me(run, seat).fish -= gone; if (gone > 0) notes?.push(`分出去 ${gone} 條小魚乾`); break; }
      case 'maxHp':
        me(run, seat).maxHp += fx.n; me(run, seat).hp = Math.min(me(run, seat).maxHp, me(run, seat).hp + Math.max(0, fx.n));
        notes?.push(`最大生命 ${fx.n >= 0 ? '+' : ''}${fx.n}`);
        break;
      case 'addCard':
        addCard(run, fx.cardId, false, seat);
        // 壞毛病是被塞進來的，講法要跟「學會了」分開，玩家才知道自己是賺到還是中招
        notes?.push(cardById[fx.cardId]?.pool === '壞毛病'
          ? `牌組被塞了一張「${cardName(fx.cardId)}」`
          : `學會了「${cardName(fx.cardId)}」`);
        break;
      case 'addRandomCard': {
        // `combatOnly` 的戰鬥雜牌（黏液、眼冒金星）只有魔物塞得進來，事件不能抽到
        const pool = cards.filter((c) => c.pool === fx.pool && pickable(c, heroOf(me(run, seat)), run.players.length) && (!fx.rarity || c.rarity === fx.rarity));
        if (pool.length) { const def = runRng(run).pick(pool); addCard(run, def.id, false, seat); notes?.push(`撿到了「${def.name}」`); }
        break;
      }
      // 同一種連寫幾次就累加張數；換成另一種就重算（目前沒有事件混用，但規矩要成立）
      case 'removeCard':
      case 'upgradeCard': {
        const need = fx.kind;
        outcome = outcome && 'needs' in outcome && outcome.needs === need
          ? { needs: need, n: outcome.n + 1 } : { needs: need, n: 1 };
        break;
      }
      case 'loseRelic': {
        /**
         * 隨機交出一件秘寶。**起始的不算**（開局就給的，玩家沒選過它）。
         *
         * `takeRelic` 做過的事要逐項還原，尤其是改最大生命的那幾件：鮪魚罐頭 +10 拿掉之後
         * 上限要扣回去，而**現有血量只往下夾、不補血**——不然「拿走一件東西」反而變成回血。
         * 上限扣到 1 以下會直接死人，所以夾在 1。
         */
        const pool = me(run, seat).relics.filter((id) => relicById[id]?.pool !== '起始');
        if (!pool.length) { notes?.push('身上沒有可以交出去的秘寶'); break; }
        const id = runRng(run).pick(pool);
        me(run, seat).relics.splice(me(run, seat).relics.indexOf(id), 1);
        const d = relicById[id]?.hooks.maxHp ?? 0;
        if (d) { me(run, seat).maxHp = Math.max(1, me(run, seat).maxHp - d); me(run, seat).hp = Math.max(1, Math.min(me(run, seat).hp, me(run, seat).maxHp)); }
        /**
         * **忍具格也要跟著收**（稽核 2026-09-11 中-5）。忍具袋（常見池，+1 格）與
         * 九命鈴（塔主池，+2 格）都可能被抽中，交出去之後 `potionCapacity` 就少了——
         * 而狀態列與戰鬥畫面都只畫 `Math.max(cap, 3)` 格、拿 `run.potions[i]`，
         * 索引超出的那幾支等於憑空消失（不是永久卡死，前面用掉會往前挪，但玩家看不懂）。
         * 直接砍掉最後幾支並講明白，比讓它靜靜不見好。
         */
        const cap = potionCapacity(run, seat);
        if (me(run, seat).potions.length > cap) {
          // **掉的是最便宜的那幾支**，不是最後拿到的（複核 2026-09-11 低-3）：
          // 砍陣列尾巴等於砍掉剛在罐頭鋪花 80 條小魚乾買的那支，而玩家沒有任何選擇餘地
          const dropped: string[] = [];
          while (me(run, seat).potions.length > cap) {
            const price = (pid: string): number => potions.find((x) => x.id === pid)?.price ?? 45;
            let worst = 0;
            for (let k = 1; k < me(run, seat).potions.length; k++) if (price(me(run, seat).potions[k]!) < price(me(run, seat).potions[worst]!)) worst = k;
            dropped.push(potions.find((x) => x.id === me(run, seat).potions[worst])?.name ?? me(run, seat).potions[worst]!);
            me(run, seat).potions.splice(worst, 1);
          }
          notes?.push(`忍具袋子小了，放不下的${dropped.join('、')}掉了出來`);
        }
        // **交出去的那件要排除在換回來的兩件之外**（稽核 2026-09-11 低-1）：
        // 上面已經把它從 `run.relics` 拿掉，後面兩個 `relic` 的 `rollRelic` 就不再避開它，
        // 約一成機率原封不動換回同一件；而 `takeRelic` 拿到加最大生命的秘寶還會順便補血，
        // 交出去再換回來等於白賺一次回血。記在這裡，`relic` 那一支會把它一起排除。
        excludeRelics.push(id);
        notes?.push(`交出了「${relicById[id]?.name ?? id}」`);
        break;
      }
      case 'relic': {
        const id = rollRelic(runRng(run), fx.pool, [...me(run, seat).relics, ...excludeRelics]);
        if (id) { takeRelic(run, id, seat); gains?.push({ kind: '秘寶', id }); }
        else notes?.push('這一池的秘寶都拿過了，沒有新的可拿');   // 收齊整池才會踩到，但不能靜靜什麼都不給（2026-09-02 稽核 L-4）
        break;
      }
      case 'potions': {
        // 忍具最多帶三個，滿了 addPotion 會回 false 並把多的靜靜丟掉——那件事一定要講出來，
        // 不然文案寫著「掏出兩個忍具塞給球球」，玩家一個都沒拿到還以為是壞掉了
        const rng = runRng(run);
        let full = 0;
        for (let i = 0; i < fx.n; i++) {
          const id = rollPotion(rng);
          if (addPotion(run, id, seat)) gains?.push({ kind: '忍具', id }); else { full += 1; gains?.push({ kind: '忍具', id, missed: true }); }
        }
        if (full > 0) notes?.push(`忍具帶滿了，還有 ${full} 個收不下`);
        break;
      }
      case 'fight': {
        // 事件寫 `mirror_duel`，實際打 `mirror_duel_a<關數>`：同一個事件三關都抽得到，對手要跟著關卡變強
        const byAct = `${fx.encounterId}_a${run.act}`;
        outcome = { fight: { encounterId: encounterById[byAct] ? byAct : fx.encounterId, bonusFish: fx.bonusFish, bonusUpgrades: fx.bonusUpgrades, ...(deferred.length ? { afterWin: deferred } : {}) } };
        break;
      }
      case 'chooseCard': {
        const rng = runRng(run);
        const picks = rollCardChoices(rng, fx.pool, fx.n, [], false, 0, undefined, heroOf(me(run, seat)));
        const up = picks.length && rng.chance(upgradeChanceFor(run)) ? rng.pick(picks).id : undefined;
        outcome = { chooseCard: picks, ...(up ? { upgradedCard: up } : {}) };
        break;
      }
      case 'flag': run.flags[fx.name] = true; break;
      case 'gamble': {
        // 中了哪一邊由子效果自己講（贏＝最大生命 +5、輸＝牌組被塞一張「失手了」）
        const won = runRng(run).chance(fx.p * (runMods(run).unlucky ? 0.7 : 1));
        // 中沒中要自己講。兩邊的結果文案往往同一句（「井底傳來一聲悶響」），
        // 輸的那邊效果常常是空的——玩家按下去只看到圖換了一張，會以為按了沒反應
        // 贏的那邊如果是小魚乾，把數字寫進去（使用者 2026-09-03：掀碗後沒感受到贏還是輸）
        const prize = won ? fx.win.reduce((sum, e) => sum + (e.kind === 'fish' ? e.n : 0), 0) : 0;
        notes?.push(won ? (prize > 0 ? `中了！贏了 ${prize} 條小魚乾` : '中了！') : '沒中……');
        // **座位一定要傳下去**（稽核第三輪 高-1）：不傳的話座位 1 賭贏的小魚乾與秘寶
        // 全進座位 0 的包包、賭輸的壞毛病也塞進座位 0 的牌組，而他自己的畫面照樣寫著「中了！」。
        // 兩台錯得一模一樣所以不會分岔，但那是實打實的資料錯亂。
        const o = applyRunEffects(run, won ? fx.win : fx.lose, notes, gains, seat); if (o) outcome = o;
        break;
      }
      default: { const _never: never = fx; void _never; }   // 漏接新的 RunEffect 種類會在型別檢查就爆
    }
  }
  return outcome;
}

/**
 * 事件「要打一場」附帶的獎勵：打贏才發、輸了清掉。戰鬥收尾（app.afterCombat）在算完戰利品後叫一次；
 * 回傳的 notes／gains 給畫面跳提示用。
 */
export function resolvePendingAfterFight(run: RunState, won: boolean, notes?: string[], gains?: RunGain[]): void {
  const list = run.pendingAfterFight;
  run.pendingAfterFight = undefined;
  if (!list || !won) return;
  /*
   * 事件答應的獎勵**兩個人各拿一份**（跟戰利品同一條規則，見 `finishCombat`）。
   *
   * 照座位順序一位一位跑：有些效果會抽（隨機撿一張牌、隨機給一件秘寶），
   * 兩台機器跑的順序一樣，抽出來的就一樣。`notes` 只收第一位的——
   * 那是寫給畫面看的一行字，兩份併在一起會變成同一件事講兩遍。
   */
  for (const p of standing(run)) {
    const i = run.players.indexOf(p);
    applyRunEffects(run, list, i === 0 ? notes : undefined, i === 0 ? gains : undefined, i);
  }
}
