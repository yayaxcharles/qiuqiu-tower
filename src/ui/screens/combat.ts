import { potionCapacity } from '../../engine/run';
import { cardById } from '../../content/cards';
import { dialogue, pick } from '../../content/dialogue';
import { BOSS_ART, BOSS_MOVE_ART, encounterById, enemyById, BOSS_MOVE_ART_PHASE } from '../../content/enemies';
import { potionById } from '../../content/potions';
import { aliveEnemies, willRevive } from '../../engine/actions';
import { RAMPAGE_TURN, beginEnemyTurn, canPlay, finishEnemyTurn, playCard, resolveChoice, stepEnemyTurn, usePotion } from '../../engine/combat';
import { cardStats } from '../../engine/deck';
import { computeAttack, computeBlock, getStatus } from '../../engine/statuses';
import type { CombatState, EnemyCombat, EnemyDef, EnemyEffect, Intent, PendingChoice, RunState, StatusName, Unit, CardInstance } from '../../engine/types';
import { registerScreen } from '../app';
import { COLLECT_FLY, collectTiming } from '../collect';
import { tierBgKey, tierBgZoom } from '../screenbg';
import { telegraphTarget, willAct } from '../telegraph';
import { artUrl, hasMonsterPose, monsterUrl, hasSprite } from '../assets';
import { STATUS_UNIT, describeCard } from '../cardtext';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { toast } from '../dialogue';
import { clear, el } from '../dom';
import { play as sfx } from '../audio';
import { enemyLeft, nextLineup } from '../enemylayout';
import { burst } from '../fx';
import { renderHud } from '../hud';

const SVG_NS = 'http://www.w3.org/2000/svg';
import { overlayRoot } from '../overlay';
import { attachTextTooltip, attachTooltip, hideTooltip } from '../tooltip';

const STATUS_ICON: Record<StatusName, string> = {
  爪力: 'icon/status_claw', 貓步: 'icon/status_step', 翻肚: 'icon/status_belly',
  懶洋洋: 'icon/status_lazy', 炸毛: 'icon/status_puff', 噎到: 'icon/status_choke',
  隱身: 'icon/status_stealth', 定身: 'icon/status_stun', 反彈: 'icon/status_thorns',
  潛水: 'icon/status_stealth',
  鐵布衫: 'icon/status_iron',   // 沒生圖示→退回寫字「下回合蜷縮」；不借鱗甲的鍵，免得日後鱗甲生了圖撞到
  // 第二波魔物的五個狀態。圖示還沒生：`chip()` 會退回寫名字（灰剪影一排認不出誰是誰）
  縮殼: 'icon/status_curl', 飛行: 'icon/status_fly', 鱗甲: 'icon/status_plate', 不壞身: 'icon/status_iron_body',
  沉睡: 'icon/status_sleep', 消散: 'icon/status_fade',
  // 菁英擴充的虛化（2026-09-03）：圖示同樣還沒生，先寫名字
  虛化: 'icon/status_phase',
};
/** 狀態排列順序寫死，好的排前面，才不會每次重畫就換位置（物件鍵的順序不保證） */
const STATUS_ORDER: readonly StatusName[] = ['爪力', '貓步', '隱身', '潛水', '鐵布衫', '反彈', '不壞身', '縮殼', '飛行', '鱗甲', '虛化',
  '定身', '沉睡', '消散', '翻肚', '懶洋洋', '炸毛', '噎到'];
/**
 * 狀態牌子上要寫的字。引擎內部叫「潛水」，但那只是「下回合開始換成隱身」的暫存記號，
 * 規格 §2 的名詞表根本沒有這個詞、牌面也刻意不講（見 `cardtext.ts` 的 `isDive`），
 * 所以牌子跟著牌面的講法寫「下回合隱身」；其餘狀態的名字就是名詞表上的名字，不用改。
 */
const STATUS_LABEL: Partial<Record<StatusName, string>> = { 潛水: '下回合隱身', 鐵布衫: '下回合蜷縮' };
/** 意圖沒有圖示素材（美術清單只做了狀態圖示），用一個中文字當記號，字型一定有 */
const INTENT_GLYPH: Record<Intent, string> = { attack: '攻', block: '守', buff: '強', debuff: '弱', special: '？', summon: '召', idle: '…' };
const PENDING_TITLE: Record<PendingChoice['purpose'], string> = {
  exhaust: '挑要消耗的牌', retain: '挑要留到下回合的牌', discard: '挑要丟掉的牌',
  recover: '挑要拿回手上的牌', scryDiscard: '這是抽牌堆最上面的牌，挑要丟掉的',
};
/**
 * 回合交接的節拍（毫秒）。按下「結束回合」之後畫面依序做三件事：
 *
 *   收牌（手上剩的牌飛向右下角的按鈕）→ 引擎結算、魔物出手 → 發牌（新手牌從左下角的牌堆飛出來）
 *
 * 原本這三件事之間**沒有任何過場**：按下去手牌瞬間消失、下一批瞬間出現，
 * 感覺不到「這一回合結束了」。
 *
 * `COLLECT_WAIT` 是「等多久再叫引擎」，故意比整段收牌短：牌是自己在飛的，
 * 不必等最後一張落地才讓魔物開始動作，不然一回合要拖快兩秒。
 * `DEAL_FLY` 要跟 `combat.css` 的 `card-deal` 同一個長度（那邊算什麼時候把手牌交還給玩家用）。
 */
// 收牌的三個數字（一張飛多久、每張錯開多久、引擎等多久）搬到 collect.ts：
// 引擎等多久要看手上有幾張牌（見那邊的說明），不再是固定值。
const DEAL_FLY = 440;          // 一張新牌從牌堆飛到定位要多久（＝ card-deal 的長度）

/**
 * 球球的姿勢。全部是專為這款遊戲畫的忍者裝立繪（`hero/*`），打包時放進同一張畫布
 * 底部對齊，換姿勢不會忽大忽小。`hero/ninja_guard`（抱胸格擋）與 `hero/idle`、
 * `hero/armed` 目前沒排到位置，留著備用。
 */
const POSE = {
  idle: 'hero/ninja', attack: 'hero/ninja_attack', hit: 'hero/ninja_hit', dodge: 'hero/ninja_dodge',
  hungry: 'hero/ninja_hungry', win: 'hero/ninja_win', lose: 'hero/ninja_lose', curl: 'hero/ninja_curl',
  // 待機的兩個變化（2026-09-02，使用者：「腳色外觀是不是可以做點變化」）：血見底的掛彩、爪力堆高的氣勢
  power: 'hero/ninja_power', hurt: 'hero/ninja_hurt',
  // 2026-09-03 晚補的動態：施展忍術（打技能／能力牌時用；圖還沒生好就退回出招圖）
  skill: 'hero/ninja_skill',
  // 擲手裡劍（2026-09-03 晚生的圖）：撒手鐧那張牌、手裡劍與針雨兩支忍具用；沒圖就退回出招圖
  throw: 'hero/ninja_throw',
};
/** 出手時該用擲手裡劍立繪的牌與忍具 */
const THROW_CARDS: ReadonlySet<string> = new Set(['sashoujian']);
const THROW_POTIONS: ReadonlySet<string> = new Set(['shuriken', 'needle_rain']);
// 塔主的姿勢對照表放在內容層（`enemies.ts`），跟招式定義擺在一起，加招時比較不會漏配。
const BOSS_MOVE_POSE = BOSS_MOVE_ART;
const BOSS_IDLE = BOSS_ART.idle1;          // 第一階段
const BOSS_DEFEAT = BOSS_ART.defeat;       // 承讓
/** 各階段的待機圖：第三階段的圖還沒生好就先用第二階段的（走火入魔），不能是灰剪影 */
function bossIdle(phase: number): string {
  if (phase >= 2 && hasSprite(BOSS_ART.idle3)) return BOSS_ART.idle3;
  return phase >= 1 ? BOSS_ART.idle2 : BOSS_IDLE;
}
/** 出招圖：先找該階段自己的，沒有（或還沒生）就用第一階段共用的那張 */
function bossMovePose(phase: number, label: string): string | undefined {
  const own = BOSS_MOVE_ART_PHASE[phase - 1]?.[label];
  if (own && hasSprite(own)) return own;
  // 二、三階段沒有自己那張圖就回傳 undefined → 用該階段的待機圖。以前退回第一階段的出招圖，
  // 跨階段那一拍（血量在你的回合跨線，牠這回合出的還是上一階段宣告的招）會突然冒出戴斗笠的舊師父
  // ——使用者 2026-09-03：「都到第二第三階段換造型了，還是會突然出現調息的圖片」。
  if (phase >= 1) return undefined;
  return BOSS_MOVE_POSE[label];
}

/** 這一拍剛出手的魔物：`attacked` 決定要不要換攻擊立繪與前撲，`label` 給塔主查招式姿勢 */
interface Acted { label: string; attacked: boolean }

/** 好狀態與壞狀態各自分組：加了好狀態放金光、被丟壞狀態放紫光，兩邊要分得開 */
// 好壞是**站在掛著這個狀態的那一隻的立場**看：縮殼、飛行、鱗甲、虛化對魔物是好事（金光），
// 沉睡、消散對牠是壞事（紫光）。球球身上永遠不會有這六個。
const GOOD_STATUS: readonly StatusName[] = ['爪力', '貓步', '隱身', '潛水', '鐵布衫', '反彈', '不壞身', '縮殼', '飛行', '鱗甲', '虛化'];
const BAD_STATUS: readonly StatusName[] = ['定身', '沉睡', '消散', '翻肚', '懶洋洋', '炸毛', '噎到'];
const sumStatus = (u: Unit, names: readonly StatusName[]): number =>
  names.reduce((t, k) => t + getStatus(u, k), 0);
/**
 * 這下掉血是不是噎到造成的？噎到每結算一次就自己少 1，拿「少了剛好一層」當判準最準，
 * 比翻紀錄字串可靠。認錯了也只是換一種光，不會壞掉。
 */
const chokeTick = (now: number, was: number): boolean => was > 0 && now === was - 1;

interface Snap {
  hp: number;
  block: number;
  buff: number;
  growth: number;   // 爪力＋貓步：「氣勁被拍散」只看這兩個——隱身被打掉一層不是被拍散（2026-09-02 實玩：閃過攻擊也會飄這行字）
  debuff: number;
  choke: number;
  stealth: number;   // 音效要分辨「拿到隱身」與「拿到其他增益」
  enemies: Map<number, { hp: number; dead: boolean; phase: number; intent: Intent; label: string; turnCount: number; noAct: boolean; debuff: number; choke: number; block: number; stealth: number; buff: number; charged: boolean }>;
  logLen: number;
  hitsLen: number;
}
function snap(cs: CombatState): Snap {
  return {
    hp: cs.player.hp, block: cs.player.block, logLen: cs.log.length, hitsLen: cs.hits.length,
    buff: sumStatus(cs.player, GOOD_STATUS), debuff: sumStatus(cs.player, BAD_STATUS),
    growth: getStatus(cs.player, '爪力') + getStatus(cs.player, '貓步'),
    choke: getStatus(cs.player, '噎到'), stealth: getStatus(cs.player, '隱身'),
    enemies: new Map(cs.enemies.map((e) => [e.uid, {
      hp: e.hp, dead: e.dead, phase: e.phase, intent: e.move.intent, block: e.block, stealth: getStatus(e, '隱身'),
      debuff: sumStatus(e, BAD_STATUS), choke: getStatus(e, '噎到'), buff: sumStatus(e, GOOD_STATUS), charged: e.charged,
      // 招式名與回合數是拿來認「剛剛出的是哪一招」的：魔物行動完 `advanceMove` 就把 `move` 推到下一招，
      // 事後再讀 `e.move` 讀到的是「頭上意圖顯示的下一招」，不是剛剛做完的那一招
      label: e.move.label, turnCount: e.turnCount,
      // 被定身或睡著的那一拍不算出手（引擎在 endTurn 裡整段跳過），立繪與前撲都不該動。
      // 原本只認「攻擊被定身擋掉」，所以山賊的「搶劫」、招財貓的「招手」這種非攻擊招被定住時，
      // 畫面照演一次蓄勢，看起來像牠真的搶到了（使用者 2026-09-04 回報）
      noAct: !willAct(e),
    }])),
  };
}

/** 素材還沒生好時 artUrl 會回一張 data: 的灰剪影；有些位置寧可不放圖也不要放剪影 */
function isFallback(url: string): boolean { return url.startsWith('data:'); }

function has<K extends EnemyEffect['kind']>(kind: K) {
  return (f: EnemyEffect): f is Extract<EnemyEffect, { kind: K }> => f.kind === kind;
}

registerScreen('combat', (app, root, props) => {
  if (!app.run || !app.cs) { app.show('map'); return; }   // 沒有戰鬥可打就退回地圖，不要留一片白
  // 收斂成不可為 null 的區域常數：型別窄化不會跟著進到下面那一堆內部函式裡
  const run: RunState = app.run;
  const cs: CombatState = app.cs;
  const bonusFish = (props as { bonusFish?: number } | null)?.bonusFish ?? 0;
  const bonusUpgrades = (props as { bonusUpgrades?: number } | null)?.bonusUpgrades ?? 0;
  // 關主戰用專屬戰場（boss1/2/3 依關數）；圖還沒生好就照舊用該關色調
  const bossBgKey = encounterById[cs.encounterId]?.pool === '塔主' ? `boss${run.act}` : '';
  const bgKey = bossBgKey && !isFallback(artUrl('bg', bossBgKey)) ? bossBgKey : tierBgKey(run.floor);

  let targeting: { kind: 'card'; uid: number } | { kind: 'potion'; id: string } | null = null;
  /** 待機姿勢隨狀態換：血剩三成以下就掛彩、爪力堆到 5 就氣勢；圖還沒生好就退回一般待機 */
  const idlePose = (): string => {
    const p = cs.player;
    if (p.hp <= Math.ceil(p.maxHp * 0.3) && hasSprite(POSE.hurt)) return POSE.hurt;
    if (getStatus(p, '爪力') >= 5 && hasSprite(POSE.power)) return POSE.power;
    return POSE.idle;
  };
  let pose = POSE.idle;
  /**
   * 這一拍出手的魔物（uid → 牠剛使出的招式）。跟球球的姿勢同一個節奏：`settle` 重算、
   * 650 毫秒後跟著還原成待機。魔物只在 `endTurn` 裡行動，所以出牌那幾次結算這張表一定是空的。
   */
  let acting = new Map<number, Acted>();
  /** 這一拍被打到的魔物：有挨打圖的換挨打圖（2026-09-03 晚補的動態） */
  let hurtSet = new Set<number>();
  /** 在「這一擊打贏」那一拍倒下的關主：只有這些才演白閃慢倒；早就倒了的（波斯先倒、僕從後倒）維持消散、不會復活再倒一次（稽核 2026-09-04 高 2） */
  const bossFallUids = new Set<number>();
  let hint = '';
  /**
   * 三步教學（-1＝不顯示）。只在第一關 1F、這台瀏覽器沒看完過教學時出現：
   * 出第一張牌進第 2 步、按結束回合進第 3 步、再結束一回合就收工寫進瀏覽器。
   * 寫 localStorage 一律 try/catch——無痕視窗會炸，炸了就當看過。
   */
  let tutStep = -1;
  try { if (run.act === 1 && run.floor === 1 && window.localStorage.getItem('qiuqiu.tutorial') !== 'done') tutStep = 0; } catch { /* 讀不到就不教 */ }
  const TUT_TEXT = [
    '先點一張牌：攻擊牌要再點一隻魔物才會出招，其他牌點了就生效',
    '魔物頭上的圖示＝牠下一回合要做的事（滑鼠移上去有說明）；飯糰用完就按「結束回合」',
    '蜷縮（藍色盾）幫你擋攻擊，撐到你下回合開始；打倒全部魔物就贏了',
  ];
  function tutDone(): void {
    tutStep = -1;
    try { window.localStorage.setItem('qiuqiu.tutorial', 'done'); } catch { /* 存不了就每局都教 */ }
  }
  let hungryTurn = -1;
  let lowHpTold = false;
  let ended = false;
  let picker: HTMLElement | null = null;
  let seq = 0;   // 每次結算 +1，讓過期的計時器認出自己已經不是最新的一次
  const lastHpPct = new Map<string, number>();   // 生命條上一次畫到哪，重畫後才滑得動
  let shownCards = new Set<number>();            // 上一次畫的手牌，認出哪幾張是新抽的
  let dealDelay = 0;                             // 新手牌進場前要等多久（結束回合那一拍會等）
  let lineup: number[] = cs.enemies.map((e) => e.uid);   // 魔物的排位名單（見 render 裡的說明）
  /**
   * 開戰先把這場會用到的立繪解碼好（使用者 2026-09-03：「第一次攻擊動作有點 LAG，下一次就正常」）：
   * 出手圖是換 src 的那一拍才第一次載入＋解碼，第一次前撲就會頓一下。這裡用 Image.decode() 先熱身，
   * 物件留在 keep 裡免得被回收；召喚出新魔物時（render 裡）再補熱。
   */
  const warmed = new Set<string>();
  const keep: HTMLImageElement[] = [];
  const warm = (url: string): void => {
    if (!url || url.startsWith('data:') || warmed.has(url)) return;
    warmed.add(url);
    const im = new Image();
    im.src = url;
    keep.push(im);
    if (typeof im.decode === 'function') im.decode().catch(() => { /* 解不開就算了，畫面照常 */ });
  };
  const warmAll = (): void => {
    for (const key of Object.values(POSE)) warm(artUrl('sprites', key));
    for (const e of cs.enemies) {
      const def = enemyById[e.enemyId];
      if (!def) continue;
      if (def.art === 'daxia') {
        for (const key of [...Object.values(BOSS_ART), ...Object.values(BOSS_MOVE_ART), ...BOSS_MOVE_ART_PHASE.flatMap((t) => Object.values(t))]) if (hasSprite(key)) warm(artUrl('sprites', key));
      } else {
        warm(monsterUrl(def.art, 'idle')); warm(monsterUrl(def.art, 'attack'));
        if (hasMonsterPose(def.art, 'hurt')) warm(monsterUrl(def.art, 'hurt'));
      }
    }
  };
  warmAll();
  /**
   * 收牌動畫進行中：按下「結束回合」之後、引擎真的跑 `endTurn` 之前的那幾百毫秒。
   *
   * 這段時間畫面上的手牌正往右下角的按鈕飛，但**引擎還停在上一回合**——
   * 這時候讓玩家出牌，牌會從已經飛走的那疊裡被打出來，畫面與引擎就對不上了。
   * 所以 `canAct()` 一律回 false，出牌、忍具、再按一次結束回合全部擋掉。
   */
  let collecting = false;
  /**
   * 上一次畫的飯糰數。出牌是整場最常做的動作，但飯糰原本只是**默默少一顆**，
   * 一整排都沒動靜。這裡認出剛被吃掉的是哪幾顆，讓它們消下去。
   * −1 代表這場還沒畫過，第一次畫不演。
   */
  let lastEnergy = -1;

  /** 可以操作嗎：分出勝負、還在等玩家選牌、收牌動畫還在跑的時候，出牌／忍具／結束回合都不受理 */
  let enemyTurnRunning = false;   // 魔物正在一隻一隻出手：這段期間不收玩家的操作
  function canAct(): boolean { return !ended && !collecting && !enemyTurnRunning && cs.phase === 'player' && !cs.pending; }

  // ===== 元件 =====

  /**
   * 立繪連同腳下的接地陰影。陰影是一片橢圓漸層，貼在立繪框的底邊——
   * 少了它，去背的角色貼在背景上就是「浮著」，跟站在地上差很多。
   */
  /**
   * 立繪框的尺寸，跟 `combat.css` 的 `.unit.size-* .sprite` 必須一致。
   * 這裡重複一份是刻意的：算「頭頂空多少」不需要量 DOM，用常數算最準——
   * 量 DOM 的版本試過兩次都抓錯時機（節點還沒進畫面、或體型樣式還沒套上），
   * 黃瓜怪量出 136 而正確值是 162。
   */
  const SPRITE_BOX: Record<string, [number, number]> = {
    small: [130, 150], medium: [180, 210], large: [230, 280], player: [270, 300],
    // 師父三個階段的框（跟 combat.css 的 .unit.enemy.master 三條一致，改要一起改）
    master: [320, 320], master1: [340, 340], master2: [350, 350],
    // 個別放寬的框（跟 combat.css 的 [data-id=…] 那條一致）：犰狳寶寶是橫躺的方圖，小框顯得扁、中框又太高
    pup: [150, 150],
  };
  const SPRITE_SIZE_OVERRIDE: Record<string, keyof typeof SPRITE_BOX> = { armadillo_pup: 'pup' };

  /**
   * 立繪框是固定高度、圖用 `object-fit: contain` 貼在底部，
   * 所以很扁的魔物（黃瓜怪那種）上面會空一大截，頭上的意圖牌子就飄在半空、
   * 那條短繩根本接不到牠。這裡算出空掉的高度寫成 `--head-gap`，
   * 樣式表用負的 margin 把牌子往下拉，牌子才會真的掛在頭上。
   */
  function spriteBox(src: string, alt: string, size: keyof typeof SPRITE_BOX = 'player',
                     over?: HTMLElement | string): HTMLElement {
    const img = el('img', { class: 'sprite', src, alt }) as HTMLImageElement;
    const [bw, bh] = SPRITE_BOX[size] ?? SPRITE_BOX['medium']!;
    const box = el('div', { class: 'sprite-box' },
      el('div', { class: 'ground-shadow' }),
      img);
    if (over) box.append(over);
    // `--drawn-h`＝圖畫實際佔的高度。圖是貼在框底部的，所以「圖畫頂端」就在這個高度上，
    // 意圖牌子用它當 bottom 就會剛好掛在頭上。算的是常數不是量 DOM：
    // 量 DOM 試過兩次都抓錯時機（節點還沒進畫面、體型樣式還沒套上）。
    const fit = (): void => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const drawn = Math.min(bh, bw * img.naturalHeight / img.naturalWidth);
      box.style.setProperty('--drawn-h', `${Math.round(drawn)}px`);
    };
    // 圖已經在快取裡就直接算（開場會把所有圖預載完，多數情況都是這條）
    if (img.complete) fit(); else img.addEventListener('load', fit, { once: true });
    return box;
  }


  function chip(term: string, iconKey: string | null, value: string, extra = ''): HTMLElement {
    const node = el('div', { class: `chip ${extra}`.trim() });
    const url = iconKey ? artUrl('icons', iconKey) : '';
    // 圖示還沒生好就寫名字：一排灰剪影根本認不出誰是誰
    if (url && !isFallback(url)) node.append(el('img', { src: url, alt: term }));
    else node.append(el('b', {}, term));
    if (value) node.append(el('span', {}, value));   // 純標記的牌子（同生共死）沒有數字欄
    attachTooltip(node, term);
    return node;
  }

  /** 飄起來的傷害數字。飄完自己移除，免得留在 DOM 裡等下一次重畫才被掃掉 */
  /** 這一拍的紀錄裡，某個開頭（「蜷縮擋下了」或「〇〇的防禦擋下了」）總共擋了幾點；多段攻擊會有好幾行，加總 */
  function blockedAmount(lines: readonly string[], prefix: string): number {
    let sum = 0;
    for (const l of lines) {
      if (!l.startsWith(prefix)) continue;
      const m = /(\d+) 點$/.exec(l);
      if (m) sum += Number(m[1]);
    }
    return sum;
  }

  /** 多段攻擊一下一下演：每段隔 150 毫秒重掛一次挨打動畫、飄那一段的數字、放一聲。被擋成 0 的那段只閃不飄（「擋住 N」另外飄） */
  function stageHits(node: HTMLElement, amounts: number[]): void {
    amounts.forEach((amt, i) => {
      window.setTimeout(() => {
        if (app.cs !== cs || !node.isConnected) return;   // 這期間換了戰鬥或畫面重畫過了，節點已經不在舞台上
        node.classList.remove('hit');
        void node.offsetWidth;   // 強制重排，動畫才會從頭再播一次
        node.classList.add('hit');
        if (amt > 0) {
          // 三個數字都落在同一點會糊成一團（稽核 2026-09-05 夜 中-1）：照序號左右錯開
          const num = floatNum(`-${amt}`);
          num.style.marginLeft = `${Math.round((i - (amounts.length - 1) / 2) * 28)}px`;
          node.append(num);
        }
        burst(node, 'slash');
        sfx(amt >= 12 ? 'hit_heavy' : 'claw', 0.94 + Math.random() * 0.12);
      }, i * 150);
    });
  }
  function floatNum(text: string, cls = ''): HTMLElement {
    const node = el('div', { class: `num${cls ? ' ' + cls : ''}` }, text);
    node.addEventListener('animationend', () => node.remove());
    return node;
  }

  /**
   * 一排狀態牌子。`mine` 是「這排是球球自己的」。
   *
   * 擋傷害這件事兩邊都有，但講法不一樣：球球是「蜷縮」（縮成一球），
   * 魔物就直接叫「防禦」——蜷縮是球球專屬的用詞，套到木樁人身上很怪。
   * 好狀態與壞狀態各給一個底色，一眼看得出這一個是在幫你還是在害你。
   */
  function statusRow(u: Unit, mine = false): HTMLElement {
    const row = el('div', { class: 'chips' });
    if (u.block > 0) row.append(chip(mine ? '蜷縮' : '防禦', null, String(u.block), 'block'));
    for (const name of STATUS_ORDER) {
      const v = getStatus(u, name);
      if (v <= 0) continue;
      const tone = GOOD_STATUS.includes(name) ? 'good' : BAD_STATUS.includes(name) ? 'bad' : '';
      // 虛化只有「有／沒有」兩種狀態，層數永遠是 1，寫個 1 出來反而讓人以為還能疊——照「無敵」那樣只寫名字
      // 球球身上的減益（魔物放的翻肚、懶洋洋、炸毛、噎到）用名字寫出來、淺紅底，跟能力牌的牌子一樣看得懂
      //（使用者 2026-09-04：只有小圖示認不出是什麼、也看不出是壞的）
      const textOnly = mine && tone === 'bad';
      row.append(chip(STATUS_LABEL[name] ?? name, textOnly ? null : STATUS_ICON[name], name === '虛化' ? '' : String(v), tone));
    }
    // 球球身上生效中的能力牌（封印解除、結界……）：一張一個牌子，疊了幾張寫數字，滑上去看那張牌的效果
    // （使用者 2026-09-03：「爪力的確有加，但我不知道是哪張牌的效果」）
    const powers = mine ? (u as Partial<CombatState['player']>).powers ?? [] : [];
    if (powers.length) {
      // 升級版與基本版分開掛（說明要念對版本，稽核 2026-09-04 H-2）
      const counts = new Map<string, number>();
      for (const pw of powers) if (pw.cardId) { const k = `${pw.cardId}|${pw.upgraded ? 1 : 0}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
      for (const [key, n] of counts) {
        const [cardId, up] = key.split('|');
        const def = cardById[cardId!];
        if (!def) continue;
        const upgraded = up === '1';
        const name = def.name.replace(/^忍術·/, '') + (upgraded ? '＋' : '');
        const node = el('div', { class: 'chip good power' }, el('b', {}, name));
        if (n > 1) node.append(el('span', {}, String(n)));
        attachTextTooltip(node, `${def.name}${upgraded ? '＋' : ''}（能力，這場戰鬥持續生效）`, describeCard(def, upgraded));
        row.append(node);
      }
    }
    // 牌子太多（一堆增益＋一堆能力牌）會疊到四五排、把整隻貓往上頂到頭被切掉（使用者 2026-09-04 要求測的情境）：
    // 超過八個就縮小字與間距、排寬一點，十六個也壓得進三排
    if (mine && row.children.length > 8) row.classList.add('many');
    return row;
  }

  /**
   * 生命條。CSS 上本來就寫了 width 的過場，但每次動作整個畫面重畫、條也是新生的，
   * 新元素的初始值不會觸發過場，所以血量一直是用跳的。
   * 這裡自己記住上一次畫的長度，再用 animate() 從舊值播到新值。
   *
   * 用 animate() 而不是「先設舊值、下一幀改新值」：後者要靠 requestAnimationFrame 補上新值，
   * 分頁切到背景時瀏覽器會把 rAF 停掉，血條就卡在舊值＝顯示錯的血量。
   * animate() 是把元素本身的正確值當底、動畫疊在上面播，動畫被節流也不會顯示錯的數字。
   */
  function hpBar(key: string, hp: number, maxHp: number): HTMLElement {
    const pct = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
    const prev = lastHpPct.get(key) ?? pct;
    lastHpPct.set(key, pct);
    const fill = el('div', { class: 'hpbar-fill', style: `width:${pct}%` });
    if (prev !== pct && typeof fill.animate === 'function') {
      fill.animate([{ width: `${prev}%` }, { width: `${pct}%` }], { duration: 380, easing: 'ease-out' });
    }
    // 掉血時在後面留一條淺色殘影，慢半拍才追上來——一眼看得出「剛剛掉了這麼多」。
    // 只有掉血才留（回血不需要），而且是額外一層，血條本身的數值照舊。
    const ghost = prev > pct
      ? el('div', { class: 'hpbar-ghost', style: `width:${pct}%` })
      : '';
    if (ghost && typeof ghost.animate === 'function') {
      // 前 40% 的時間停在舊長度（讓玩家看清楚掉了多少），之後才追上來
      ghost.animate([
        { width: `${prev}%`, offset: 0 },
        { width: `${prev}%`, offset: 0.4 },
        { width: `${pct}%`, offset: 1 },
      ], { duration: 900, easing: 'ease-in' });
    }
    return el('div', { class: 'hpbar' }, ghost, fill, el('span', {}, `${hp}/${maxHp}`));
  }

  /** 魔物頭上的意圖：攻擊直接算進爪力／懶洋洋／翻肚與蓄力，玩家看到的就是真的會挨幾下 */
  function intentChip(e: EnemyCombat): HTMLElement {
    const m = e.move;
    const x = e.charged ? 2 : 1;
    const hits = m.effects.filter(has('damage'));
    const rnd = m.effects.find(has('damageRandom'));
    const blk = m.effects.find(has('block'));
    const blkAll = m.effects.find(has('blockAllies'));
    const buffAll = m.effects.find(has('statusAllies'));
    const boom = m.effects.find(has('selfDestruct'));
    let text = `${INTENT_GLYPH[m.intent]} ${m.label}`;
    if (getStatus(e, '沉睡') > 0) text = '呼呼大睡';   // 睡著的什麼都不做（2026-09-02 第二波）
    else if (getStatus(e, '定身') > 0) text = '被定住了';   // 定身擋整個動作（2026-09-02）
    else if (boom) text = `攻 ${computeAttack(boom.amount * x, e, cs.player)}（爆）`;
    else if (hits.length) text = `攻 ${hits.map((d) => `${computeAttack(d.amount * x, e, cs.player)}${(d.times ?? 1) > 1 ? `×${d.times}` : ''}${d.pierce ? '（穿）' : ''}`).join('＋')}`;
    else if (rnd) text = `攻 ${computeAttack(rnd.min * x, e, cs.player)}～${computeAttack(rnd.max * x, e, cs.player)}`;
    else if (blk) text = `守 ${computeBlock(blk.amount, e)}`;
    // 盾陣／號令這種給全體的：牌子上也要有數字（使用者 2026-09-03：「有格檔但沒看到格檔值」）
    else if (blkAll) text = `守 ${computeBlock(blkAll.amount, e)}（全體）`;
    else if (buffAll) text = `${INTENT_GLYPH[m.intent]} 全體 +${buffAll.amount} ${buffAll.name}`;
    if (e.charged && m.intent === 'attack') text += '（蓄力）';
    // 看破／破功要寫在牌子上：使用者的朋友囤了十幾層隱身，看牌子只寫「攻 8×2」以為閃得掉，
    // 結果先被拍掉隱身再挨打（2026-09-03 回報）。牌子上先講，滑上去的提示再講細節
    if (getStatus(e, '定身') === 0) {
      if (m.effects.some(has('stripPlayer'))) text += '（看破）';
      if (m.effects.some(has('purgePlayer'))) text += '（破功）';
    }
    const node = el('div', { class: `intent i-${m.intent}` }, text);
    // 牌子上只寫得下「攻 4」這種短標籤，滑上去才講得完牠這一下實際會做什麼
    attachTextTooltip(node, m.label, describeMove(e));
    return node;
  }

  /**
   * 魔物這一拍要做什麼，寫成一句話給提示框用。
   * 數字跟牌子上一樣是**算完的**（吃過爪力、懶洋洋、你的翻肚與蓄力），玩家看到的就是真的會挨幾下。
   */
  function describeMove(e: EnemyCombat): string {
    const m = e.move;
    if (getStatus(e, '沉睡') > 0) return `睡著了，這回合什麼都不會做。再睡 ${getStatus(e, '沉睡')} 回合；打痛牠會提早醒，而且醒來會很生氣。`;
    if (getStatus(e, '定身') > 0) return '被定住了，這回合什麼都做不了。';
    const x = e.charged ? 2 : 1;
    const parts: string[] = [];
    for (const fx of m.effects) {
      switch (fx.kind) {
        case 'damage': {
          const n = computeAttack(fx.amount * x, e, cs.player);
          parts.push(((fx.times ?? 1) > 1 ? `造成 ${n} 點傷害，連打 ${fx.times} 次` : `造成 ${n} 點傷害`) + (fx.pierce ? '（穿透：蜷縮擋不住，隱身閃得掉）' : ''));
          break;
        }
        case 'damageRandom':
          parts.push(`造成 ${computeAttack(fx.min * x, e, cs.player)}～${computeAttack(fx.max * x, e, cs.player)} 點傷害`);
          break;
        case 'block': parts.push(`自己獲得 ${computeBlock(fx.amount, e)} 點防禦`); break;
        case 'statusPlayer':
          // 定身沒有量詞（「給你 1 定身」讀不通）：直接講後果
          if (fx.name === '定身') parts.push('把你定住：這回合打不出攻擊牌');
          else parts.push(`給你 ${fx.amount} ${STATUS_UNIT[fx.name] ?? ''}${fx.name}`);
          break;
        case 'statusSelf': parts.push(`自己獲得 ${fx.amount} ${STATUS_UNIT[fx.name] ?? ''}${fx.name}`); break;
        case 'chargeNext': parts.push('蓄力：下一次攻擊傷害加倍'); break;
        case 'copyPlayerStatus': parts.push(`照著學：把你身上的${fx.names.join('、')}抄一份過去`); break;
        case 'stripPlayer': parts.push(`看破：把你身上的${fx.names.join('、')}拍掉一半`); break;
        case 'purgePlayer': parts.push(`破功：把你身上的${fx.names.join('、')}各拍散一半`); break;
        case 'summon': parts.push('叫來幫手'); break;
        case 'heal': parts.push(`自己回復 ${fx.n} 點生命`); break;
        case 'stealFish': parts.push(`偷走你 ${fx.n} 條小魚乾`); break;
        case 'discardRandomHand': parts.push(`讓你下回合少抽 ${fx.n} 張牌`); break;
        case 'escape': parts.push('逃走'); break;
        // ---- 2026-09-02 第二波魔物的四個新效果 ----
        case 'selfDestruct': parts.push(`自爆：造成 ${computeAttack(fx.amount * x, e, cs.player)} 點傷害，然後牠自己也倒下`); break;
        case 'statusAllies': parts.push(`全體魔物獲得 ${fx.amount} ${STATUS_UNIT[fx.name] ?? '點'}${fx.name}`); break;
        case 'blockAllies': parts.push(`全體魔物獲得 ${fx.amount} 點防禦`); break;
        case 'giveCard': parts.push(`把 ${fx.n} 張「${cardById[fx.cardId]?.name ?? fx.cardId}」塞進你的${fx.to === 'discard' ? '棄牌堆' : '抽牌堆'}`); break;
        case 'nothing': parts.push('發呆，什麼都不做'); break;
        // 漏接新的 EnemyEffect 種類會在型別檢查就爆——魔物做得到的事，提示框一定要講得出來
        default: { const _never: never = fx; void _never; break; }
      }
    }
    const body = parts.length ? parts.join('，') : '看不出來要做什麼';
    return e.charged && m.intent === 'attack' ? `${body}（已蓄力，傷害已經算進去了）。` : `${body}。`;
  }

  /**
   * 魔物的立繪。塔主的 art 是沒有編號的 'daxia'，九種姿勢各自一張（戰敗＞剛使出的招式＞該階段待機）；
   * 其餘魔物只有待機與攻擊兩張，出手的那一拍換成攻擊圖。
   */
  function enemySprite(e: EnemyCombat, def: EnemyDef | undefined): string {
    const act = acting.get(e.uid);
    if (def?.art === 'daxia') {
      if (e.dead) return artUrl('sprites', BOSS_DEFEAT);
      return artUrl('sprites', (act ? bossMovePose(e.phase, act.label) : undefined) ?? bossIdle(e.phase));
    }
    if (!def) return monsterUrl('', 'idle');
    if (act?.attacked) return monsterUrl(def.art, 'attack');
    if (hurtSet.has(e.uid) && !e.dead && hasMonsterPose(def.art, 'hurt')) return monsterUrl(def.art, 'hurt');
    return monsterUrl(def.art, 'idle');
  }

  function enemyUnit(e: EnemyCombat, i: number, n: number): HTMLElement {
    const def = enemyById[e.enemyId];
    const left = enemyLeft(i, n);   // 算式在 `enemylayout.ts`，有測試釘著（曾經算到畫面外）
    const cls = ['unit', 'enemy', `size-${def?.size ?? 'medium'}`];
    // 關主的待機呼吸慢一點、睡著的冒 Zzz（使用者 2026-09-04：待機差異只做關主）
    const bossUnit = def?.pool === '塔主' && encounterById[cs.encounterId]?.pool === '塔主';
    if (bossUnit) cls.push('boss');
    if (bossUnit && getStatus(e, '沉睡') > 0) cls.push('asleep');
    // 「重生中」的不藏起來：倒下但同伴還在，畫成半透明的殘影＋倒數牌子，
    // 玩家才知道牠會爬回來、還剩幾回合可以清場（本來直接隱形，看起來像打完了）
    const reviving = e.dead && e.reviveIn > 0 && willRevive(cs, e);   // 判準與引擎共用，不再自己抄一份
    // 關主被打倒：不是直接消失，而是慢慢倒下（收尾節奏，使用者 2026-09-04）
    if (e.dead && !reviving) cls.push(bossFallUids.has(e.uid) ? 'boss-fall' : 'gone');
    if (reviving) cls.push('reviving');
    // 師父換了條血，整隻套上該階段的光暈（走火入魔紅、真面目紫），跟立繪一起讓人一眼看出換階段了
    // 師父本人（art 'daxia'）掛 master：框開得比球球大（使用者 2026-09-02：「師傅體型比球球小」），換血條再放大
    if (def?.art === 'daxia') { cls.push('master'); if (e.phase > 0) cls.push(`phase-${e.phase}`); }
    if (targeting && !e.dead) cls.push('targetable');
    // 意圖牌子放進立繪框裡（不是當它的兄弟節點）：框裡才有「圖畫實際佔多高」這個座標，
    // 牌子用絕對定位掛在圖畫頂端，扁的魔物才不會讓牌子飄在半空。
    // 放在外面用負邊界試過兩次都不準——那個排版下負邊界只挪了 15 像素而不是 130。
    const row = statusRow(e);
    // 引擎裡玩家看不到的狀態，全部做成牌子掛出來（滑上去有白話說明）——
    // 「機制是對的但畫面沒講」已經連續中招三次：隱身閃避、蜷縮延遲、影子復活
    if (!e.dead) {
      if (def?.onDeathHealPlayer) row.prepend(chip('打倒回血', null, String(def.onDeathHealPlayer), 'good'));
      if (def?.strengthEveryNTurns) {
        const left = def.strengthEveryNTurns - (e.turnCount % def.strengthEveryNTurns);
        row.prepend(chip('越戰越勇', null, String(left), 'bad'));
      }
      if (e.stolen > 0) row.prepend(chip('叼著小魚乾', null, String(e.stolen), 'bad'));
      if (e.charged) row.prepend(chip('蓄力', null, '', 'bad'));
      if (e.invulnIn > 0) row.prepend(chip('無敵', null, '', 'bad'));
      if (def?.reviveGroup && !def.neverRevive) row.prepend(chip('同生共死', null, '', 'bad'));   // 蛙大名自己倒了就倒了，不掛這塊牌
      // 僕從護體（波斯大小姐）：還有同伴站著就打不動她——照慣例把隱藏規則掛成牌子
      if (def?.guardedByAllies && cs.enemies.some((o) => o !== e && !o.dead)) row.prepend(chip('僕從護體', null, '', 'bad'));
      // 第二波魔物的三個被動（2026-09-02）。狀態型的（縮殼、飛行、鱗甲、沉睡、消散）自己就是狀態牌子，
      // 這三個沒有層數可掛，所以照「僕從護體」那一套做成小牌
      if (def?.splitInto && !e.split) row.prepend(chip('分裂', null, '', 'bad'));
      if (def?.hexOnSkill) row.prepend(chip('詛咒', null, '', 'bad'));
      if (def?.angerOnSkill) row.prepend(chip('憤怒', null, String(def.angerOnSkill), 'bad'));
    }
    if (reviving) row.prepend(chip('重生中', null, String(e.reviveIn), 'bad'));
    // 魔氣暴走：第 RAMPAGE_TURN（10）回合起掛在每隻魔物身上，提醒拖下去每回合都會更痛
    if (!e.dead && cs.turn >= RAMPAGE_TURN) row.prepend(chip('魔氣暴走', null, '', 'bad'));
    const node = el('div', { class: cls.join(' '), 'data-uid': String(e.uid), 'data-id': e.enemyId, style: `left:${left}px` },
      spriteBox(enemySprite(e, def), e.name,
        def?.art === 'daxia' ? (e.phase >= 2 ? 'master2' : e.phase === 1 ? 'master1' : 'master') : (SPRITE_SIZE_OVERRIDE[e.enemyId] ?? def?.size ?? 'medium'),
        reviving ? undefined : intentChip(e)),
      el('div', { class: 'name' }, e.name),
      hpBar(`e${e.uid}`, e.hp, e.maxHp),
      row);
    if (targeting && !e.dead) node.addEventListener('click', () => pickTarget(e.uid));
    return node;
  }

  function sidePanel(): HTMLElement {
    const p = cs.player;
    const energy = el('div', { class: 'energy' });
    for (let i = 0; i < Math.max(p.maxEnergy, p.energy); i++) {
      const url = artUrl('icons', i < p.energy ? 'icon/onigiri_full' : 'icon/onigiri_empty');
      // 剛被吃掉的那幾顆（在新的顆數之後、舊的顆數之內）縮一下再變空的
      const eaten = lastEnergy > p.energy && i >= p.energy && i < lastEnergy ? ' eaten' : '';
      // 飯糰圖還沒生好就畫一顆圓點，至少數得出來剩幾顆
      energy.append(isFallback(url)
        ? el('div', { class: `pip${i < p.energy ? ' full' : ''}${eaten}` })
        : el('img', { class: `onigiri${eaten}`, src: url, alt: '' }));
    }
    lastEnergy = p.energy;
    energy.append(el('span', {}, `${p.energy}/${p.maxEnergy}`));
    attachTooltip(energy, '飯糰');

    const potions = el('div', { class: 'potions' });
    for (let i = 0; i < potionCapacity(run); i++) {   // 格數隨難度與忍具袋變
      const id = cs.potions[i];
      const def = id ? potionById[id] : undefined;
      const slot = el('div', { class: `potion${def ? '' : ' empty'}` });
      // 提示只掛在有忍具的格子上：空格跳出一個沒內容的框，反而讓人以為那格有東西。
      if (id && def) {
        const url = artUrl('icons', def.art);
        slot.append(isFallback(url) ? el('b', {}, def.name) : el('img', { src: url, alt: def.name }));
        // 這格是戰鬥中唯一能查忍具做什麼的地方，用瀏覽器原生的 `title` 要停住一秒才跳、
        // 長相又跟旁邊的飯糰、連抓提示不同款，玩家等不到就以為沒說明。改掛遊戲自己的提示框。
        attachTextTooltip(slot, def.name, def.text);
        if (canAct()) { slot.classList.add('usable'); slot.addEventListener('click', () => onPotion(id)); }
      }
      potions.append(slot);
    }

    const combo = el('span', {}, `連抓 ${p.cardsPlayedThisTurn}`);
    attachTooltip(combo, '連抓');
    const piles = el('div', { class: 'piles' },
      el('span', {}, `第 ${cs.turn} 回合`),
      // 這一行同時是「牌堆在哪」的座標：新發的牌就是從這裡飛出來的（見 dealFrom）
      // 三個牌堆都點得開（使用者 2026-09-03：「戰鬥中我看不到我的抽牌堆跟棄牌堆」）：
      // 抽牌堆照名字排序，不洩漏真正的順序；棄牌堆、消耗堆照丟進去的順序
      pileBtn('pile-draw', `抽牌 ${p.drawPile.length}`, '抽牌堆', () => [...p.drawPile].sort((x, y) => (cardById[x.cardId]?.name ?? '').localeCompare(cardById[y.cardId]?.name ?? '', 'zh-Hant'))),
      pileBtn('pile-discard', `棄牌 ${p.discardPile.length}`, '棄牌堆', () => p.discardPile),
      pileBtn('pile-exhaust', `消耗 ${p.exhaustPile.length}`, '消耗堆', () => p.exhaustPile),
      combo);
    return el('div', { class: 'side' }, energy, potions, piles);
  }

  /** 牌堆計數器：點一下翻開來看（只是看看，不能挑） */
  function pileBtn(cls: string, label: string, title: string, cards: () => CardInstance[]): HTMLElement {
    const node = el('span', { class: `${cls} pile-btn`, title: `點一下看${title}` }, label);
    node.addEventListener('click', () => {
      const list = cards();
      showDeckPicker({ title: `${title}（${list.length} 張）`, cards: list, pickable: false, cancellable: true, onPick: () => { /* 只是看看 */ } });
    });
    return node;
  }

  function handRow(): HTMLElement {
    const p = cs.player;
    const n = p.hand.length;
    const hand = el('div', { class: 'hand' });
    // 手牌越多疊越緊：145 是一張小牌的實寬，860 是手牌區的寬
    const step = n > 1 ? Math.min(152, (860 - 145) / (n - 1)) : 152;
    const mid = (n - 1) / 2;
    // 扇形的角度與下沉量也要跟著收：滿手 10 張還照 3.2 度散開的話，最外側兩張的下緣會掉出舞台
    const spread = n > 7 ? 2.2 : 3.2;
    const lift = n > 7 ? 3 : 5;
    p.hand.forEach((c, i) => {
      const st = cardStats(c);
      // 要指定目標的牌先拿第一隻活著的魔物去問，不然一定會卡在「要選一隻魔物」
      const chk = canPlay(cs, c.uid, st.def.target === 'enemy' ? aliveEnemies(cs)[0]?.uid : undefined);
      const node = cardNode(c, {
        small: true,
        plays: cs.cardPlays?.[c.uid] ?? 0,
        selected: targeting?.kind === 'card' && targeting.uid === c.uid,
        disabled: !canAct() || !chk.ok,
        onClick: () => onCard(c.uid),
      });
      node.style.transform = `rotate(${((i - mid) * spread).toFixed(2)}deg) translateY(${(Math.abs(i - mid) * lift).toFixed(0)}px)`;
      node.style.margin = `0 ${((step - 145) / 2).toFixed(1)}px`;
      node.style.zIndex = String(i + 1);
      // 打不出來的原因直接用引擎給的字串，畫面不要自己再寫一套。
      // 用遊戲自己的說明框而不是瀏覽器原生的 `title`：原生的要停一秒才出現、樣式也不同
      if (!chk.ok) {
        attachTextTooltip(node, '這張打不出來', chk.reason);
        // 點下去除了顯示原因，牌本身也抖一下：只有一行小字，玩家常常沒發現自己點了。
        // 動畫要加在**重畫之後**的那張牌上——render() 會把手牌整個重生，
        // 加在這個 node 上會連同它一起被丟掉，動畫根本不會播。
        node.addEventListener('click', () => {
          hint = chk.reason;
          render();
          root.querySelector(`.hand .card[data-uid="${c.uid}"]`)?.classList.add('nope');
        });
      }
      // 只有這次才出現在手上的牌才播進場動畫：每次重畫都播的話，光是選個目標整手牌就會抖一次。
      // 一張一張錯開 45 毫秒出發，整排才不會像同一塊板子被推上來。
      if (!shownCards.has(c.uid)) { node.classList.add('dealt'); node.style.animationDelay = `${dealDelay + i * 45}ms`; }
      hand.append(node);
    });
    // 換回合那一拍要等魔物打完才發牌（dealDelay），這段期間整排牌先不吃滑鼠：
    // 還沒飛到定位的牌被點下去，畫面與引擎會差一拍。時間到再由 unlockHand 解開。
    if (dealDelay > 0) hand.classList.add('dealing');
    shownCards = new Set(p.hand.map((c) => c.uid));
    return hand;
  }

  /**
   * 新發到的牌從哪裡飛出來：左下角的牌堆（側邊欄的「抽牌 N」那一行）。
   *
   * 每張牌各算一次「牌堆中心 → 自己在扇形上的定位」的差，寫成 `--deal-dx`／`--deal-dy`，
   * `combat.css` 的 `card-deal` 就照這個位移把牌從牌堆拉回來。要等節點真的進到文件裡
   * 才量得到位置，所以這件事排在 `root.append(box)` 之後。
   *
   * **量的是 `offsetLeft`／`offsetTop`（版面座標），不是 `getBoundingClientRect()`**：
   * 那時候 `card-deal` 的 backwards 填充已經把牌縮小、轉開、推到牌堆上了，量外框會量到
   * 動畫中的位置，算出來的起點會再偏一次。版面座標不吃 transform，量到的永遠是定位點。
   */
  function dealFrom(box: HTMLElement): void {
    const cards = box.querySelectorAll<HTMLElement>('.hand .card.dealt');
    const hand = box.querySelector<HTMLElement>('.hand');
    const pile = box.querySelector('.pile-draw') ?? box.querySelector('.piles');
    if (!cards.length || !hand || !pile) return;
    // 舞台整個被 transform: scale() 縮過，量到的螢幕座標要除以縮放比才是舞台座標
    const stage = app.stage.getBoundingClientRect();
    const k = stage.width > 0 ? 1280 / stage.width : 1;
    const hr = hand.getBoundingClientRect();     // 手牌區沒有 transform，外框就是它的版面位置
    const pr = pile.getBoundingClientRect();
    const ax = (pr.left + pr.width / 2 - hr.left) * k;   // 牌堆中心，換算成「相對於手牌區」
    const ay = (pr.top + pr.height / 2 - hr.top) * k;
    for (const node of cards) {
      node.style.setProperty('--deal-dx', `${(ax - node.offsetLeft - node.offsetWidth / 2).toFixed(0)}px`);
      node.style.setProperty('--deal-dy', `${(ay - node.offsetTop - node.offsetHeight / 2).toFixed(0)}px`);
    }
  }

  /**
   * 發牌動畫跑完，把手牌與「結束回合」交還給玩家。
   *
   * 只動 class 與 disabled、**不重畫**：這一拍畫面上還有飄著的傷害數字（1 秒）與倒地動畫，
   * `render()` 會把它們砍在半路（跟 settle 收姿勢那段同一個道理）。
   * 中途要是重畫過，這裡拿到的是已經被丟掉的節點，動它不會有任何影響，正好。
   */
  function unlockHand(box: HTMLElement, wait: number): void {
    const hand = box.querySelector<HTMLElement>('.hand');
    const btn = box.querySelector<HTMLElement>('.end-turn');
    window.setTimeout(() => {
      hand?.classList.remove('dealing');
      if (app.cs === cs && canAct()) btn?.removeAttribute('disabled');
    }, wait);
  }

  /**
   * 就地修補戰場（敵方回合逐隻演出用）：只把「這一步有變」的單位換成新節點，其餘節點原封不動，
   * 呼吸動畫才不會每一步重來。回 false＝這一步換不了（節點不齊、有新召喚的），呼叫端改整頁重畫。
   */
  function patchField(before: Snap): boolean {
    const box = root.querySelector<HTMLElement>('.combat');
    const field = box?.querySelector<HTMLElement>('.field');
    if (!box || !field) return false;
    if (cs.enemies.some((e) => !e.dead && !lineup.includes(e.uid))) return false;
    for (const e of cs.enemies) {
      const old = field.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
      if (!old) return false;
      const b = before.enemies.get(e.uid);
      const changed = !b || b.hp !== e.hp || b.block !== e.block || b.dead !== e.dead || b.phase !== e.phase
        || b.turnCount !== e.turnCount || b.label !== e.move.label || b.intent !== e.move.intent
        || b.debuff !== sumStatus(e, BAD_STATUS) || b.stealth !== getStatus(e, '隱身') || b.choke !== getStatus(e, '噎到')
        || acting.has(e.uid) || old.classList.contains('attack') || old.classList.contains('hit');
      if (changed) old.replaceWith(enemyUnit(e, lineup.indexOf(e.uid), lineup.length));
    }
    const pNode = field.querySelector<HTMLElement>('.unit.player');
    if (!pNode) return false;
    const p = cs.player;
    const pChanged = before.hp !== p.hp || before.block !== p.block || before.buff !== sumStatus(p, GOOD_STATUS)
      || before.debuff !== sumStatus(p, BAD_STATUS) || before.stealth !== getStatus(p, '隱身')
      || pNode.querySelector<HTMLImageElement>('.sprite')?.getAttribute('src') !== artUrl('sprites', pose)
      || pNode.classList.contains('hit') || pNode.classList.contains('dodge') || pNode.classList.contains('attack');
    if (pChanged) pNode.replaceWith(el('div', { class: 'unit player' },
      spriteBox(artUrl('sprites', pose), '球球'),
      el('div', { class: 'name' }, '球球'),
      hpBar('player', p.hp, p.maxHp),
      statusRow(p, true)));
    box.querySelector('.log')?.replaceWith(el('div', { class: 'log' }, ...cs.log.slice(-4).map((l) => el('div', {}, l))));
    box.querySelector('.hud')?.remove();
    renderHud(app, box, cs.fishDelta);
    const endBtn = box.querySelector<HTMLElement>('.end-turn');
    if (endBtn) { if (!canAct() || dealDelay > 0) endBtn.setAttribute('disabled', 'disabled'); else endBtn.removeAttribute('disabled'); }
    return true;
  }

  function render(): void {
    warmAll();   // 召喚出來的新魔物也先把兩張圖熱好
    hideTooltip();   // 掛著提示的節點馬上要被換掉，不先關會留一個孤兒黏在畫面上
    clear(root);
    const box = el('div', { class: 'combat' });
    const bg = el('div', { class: 'battle-bg' });
    const bgUrl = artUrl('bg', bgKey);
    if (!isFallback(bgUrl)) {
      bg.style.backgroundImage = `url(${bgUrl})`;
      // 放大率各張不同（見 tierBgZoom）：讓畫上的牆腳對到角色的腳底
      bg.style.backgroundSize = `auto ${tierBgZoom(bgKey)}%`;
    }
    // 空氣裡的浮塵。畫面靜止時總得有東西在動，不然看起來像一張截圖
    // （量過：不操作的時候整個戰鬥畫面只有立繪的呼吸在跑）。三層各自飄，樣式在 combat.css。
    box.append(bg, el('div', { class: 'motes' }, el('i'), el('i'), el('i')));
    // 選目標時鋪一層透明的接盤子：點空白處＝取消。魔物與手牌都疊在它上面，照樣點得到
    if (targeting) box.append(el('div', { class: 'target-catcher', onclick: () => { targeting = null; render(); } }));

    const field = el('div', { class: 'field' },
      el('div', { class: 'unit player' },
        spriteBox(artUrl('sprites', pose), '球球'),
        el('div', { class: 'name' }, '球球'),
        hpBar('player', cs.player.hp, cs.player.maxHp),
        statusRow(cs.player, true)));
    // 排位置只算**活著的**。倒下的魔物還留在 `cs.enemies` 裡（要放倒地動畫），
    // 但牠們不該再佔位子——之前是拿整個陣列來排，塔主召喚第二、第三批之後
    // 總數一路變大、新小怪的索引也一路往後，算出來的 left 直接超出舞台 1280
    // （第三批會落在 1380）。倒下的排在 -1，反正牠們是隱形的。
    const alive = cs.enemies.filter((e) => !e.dead);
    // 位子排好就不動（倒下的照樣佔位），只有召喚新魔物上場才重排——見 enemylayout.ts 的 nextLineup
    lineup = nextLineup(lineup, alive.map((e) => e.uid));
    // 四隻以上時欄距（150）比單位窄（190），狀態牌子會互相壓到——整場掛 crowd 讓牌子縮小
    box.classList.toggle('crowd', lineup.length >= 4);
    cs.enemies.forEach((e) => field.append(enemyUnit(e, lineup.indexOf(e.uid), lineup.length)));
    box.append(field, sidePanel(), handRow());

    const endBtn = el('button', { class: 'btn primary end-turn', onclick: () => onEndTurn() }, '結束回合');
    // 發牌動畫還在跑的那一拍也一起反灰（跟手牌同一個道理，見 handRow 的 dealing）
    if (!canAct() || dealDelay > 0) endBtn.setAttribute('disabled', 'disabled');
    // 紀錄只留四行：六行時最後兩行會壓到球球的頭（2026-09-02 截圖檢查）
    box.append(endBtn, el('div', { class: 'log' }, ...cs.log.slice(-4).map((l) => el('div', {}, l))));
    if (tutStep >= 0) box.append(el('div', { class: 'tut-bar' },
      el('span', { class: 'tut-step' }, `教學 ${tutStep + 1}/3`),
      el('span', {}, TUT_TEXT[tutStep] ?? ''),
      el('button', { class: 'tut-close', onclick: () => { tutDone(); render(); } }, '✕')));
    if (targeting) box.append(el('div', { class: 'target-hint' }, targeting.kind === 'card' ? '把箭頭移到魔物身上，點一下打牠（Esc 或點空白處取消）' : '把箭頭移到魔物身上，點一下用忍具（Esc 或點空白處取消）'));
    else if (hint) box.append(el('div', { class: 'target-hint warn' }, hint));
    renderHud(app, box, cs.fishDelta);   // 偷走／賺到的當下就要在狀態列看得到
    root.append(box);
    // 這兩件都要量元素位置，得等節點真的進到文件裡才量得到，所以放在 append 之後。
    // dealFrom 排在同一拍（不是下一幀）：動畫要到下一幀才開始播，這時候補上位移還來得及。
    dealFrom(box);
    if (dealDelay > 0) {
      unlockHand(box, dealDelay + DEAL_FLY + cs.player.hand.length * 45);
      // 抽牌聲跟著畫面上的飛入逐張響，音高每張微調，不然像複讀機
      sfx('turn_start');
      cs.player.hand.forEach((_, i) => window.setTimeout(
        () => sfx('draw', 0.95 + i * 0.05), dealDelay + i * 45));
    }
    // 箭頭要量元素位置，得等節點真的進到文件裡才量得到，所以放在 append 之後
    if (targeting) mountArrow(box);
    // `dealDelay` 是**一次性**的：settle 設好、緊接著那一次重畫用掉就歸零。
    // 不歸零的話，換完回合之後每一次重畫（點一張要選目標的牌、按 Esc 取消）
    // 都會以為自己還在發牌，把整排手牌與「結束回合」再鎖一秒多。
    dealDelay = 0;
  }

  /**
   * 選目標時從牌拉一條弧線到滑鼠（類殺戮尖塔）。
   *
   * 出牌仍然是「點牌再點魔物」，這條線只是指引——原本選了牌之後畫面沒有任何連線，
   * 玩家不知道自己正牽著什麼、要往哪放。
   *
   * 兩個控制點都拉到終點上方，線就會從牌往上翹、再從上面落到目標，箭頭固定朝下
   * （終點的切線恆為正 y，所以不用算角度）。滑到魔物身上會吸附到牠身上並轉亮。
   */
  function mountArrow(box: HTMLElement): void {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'target-arrow');
    svg.setAttribute('viewBox', '0 0 1280 720');
    // 線分三層（2026-09-02 使用者：「線條太難看」）：深色描邊墊底、金色虛線在上（虛線會往目標流動）、
    // 箭頭帶缺口、吸附時目標腳下多一圈脈動的光環
    const outline = document.createElementNS(SVG_NS, 'path');
    outline.setAttribute('class', 'arrow-outline');
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'arrow-line');
    const head = document.createElementNS(SVG_NS, 'path');
    head.setAttribute('class', 'arrow-head');
    const tip = document.createElementNS(SVG_NS, 'circle');
    tip.setAttribute('class', 'arrow-tip');
    tip.setAttribute('r', '22');
    svg.append(outline, line, tip, head);
    box.append(svg);

    // 舞台整個被 transform: scale() 縮過，滑鼠的座標得換算回 1280×720 的舞台座標
    const rect = app.stage.getBoundingClientRect();
    const k = rect.width > 0 ? 1280 / rect.width : 1;
    const toStage = (cx: number, cy: number): { x: number; y: number } => (
      { x: (cx - rect.left) * k, y: (cy - rect.top) * k });
    const centreOf = (n: Element, yFrac: number): { x: number; y: number } => {
      const r = n.getBoundingClientRect();
      return toStage(r.left + r.width / 2, r.top + r.height * yFrac);
    };

    // 起點：選中的那張牌的上緣中央；忍具沒有選中樣式，退回球球身上
    const src = box.querySelector('.card.selected') ?? box.querySelector('.unit.player .sprite');
    const from = src ? centreOf(src, 0.08) : { x: 640, y: 620 };

    const draw = (to: { x: number; y: number }, snapped: boolean): void => {
      const lift = Math.min(240, 90 + Math.hypot(to.x - from.x, to.y - from.y) * 0.35);
      const d = `M ${from.x} ${from.y} C ${from.x} ${from.y - lift}, ${to.x} ${to.y - lift}, ${to.x} ${to.y - 14}`;
      outline.setAttribute('d', d);
      line.setAttribute('d', d);
      // 帶缺口的箭頭（尾端凹進去），比實心三角形有「箭」的樣子
      head.setAttribute('d',
        `M ${to.x} ${to.y} L ${to.x - 14} ${to.y - 24} L ${to.x} ${to.y - 16} L ${to.x + 14} ${to.y - 24} Z`);
      tip.setAttribute('cx', String(to.x)); tip.setAttribute('cy', String(to.y + 6));
      svg.classList.toggle('snap', snapped);
    };

    // 還沒動滑鼠時先指著第一隻活著的魔物，不要留一條長度是零的線在原地
    const first = box.querySelector('.unit.enemy.targetable');
    draw(first ? centreOf(first, 0.45) : { x: 900, y: 300 }, false);

    // 監聽掛在 box 上：每次重畫都會換一個 box，舊的連同監聽一起被丟掉，不用自己收
    box.addEventListener('mousemove', (ev) => {
      const foe = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.unit.enemy.targetable');
      draw(foe ? centreOf(foe, 0.45) : toStage(ev.clientX, ev.clientY), !!foe);
    });
  }

  // ===== 操作 =====

  function onCard(uid: number): void {
    if (!canAct()) return;
    const card = cs.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    hint = '';
    if (cardStats(card).def.target === 'enemy') {
      const already = targeting?.kind === 'card' && targeting.uid === uid;
      const alive = aliveEnemies(cs);
      // 場上只剩一隻的時候，連點兩下就直接打牠——反正也沒別的可以選，
      // 還要移到魔物身上再點一次很囉嗦。兩隻以上照舊：要自己挑目標。
      if (already && alive.length === 1) { targeting = null; play(uid, alive[0]!.uid); return; }
      // 再點一次同一張＝取消；點另一張＝改選那一張
      targeting = already ? null : { kind: 'card', uid };
      render();
      return;
    }
    play(uid, undefined);
  }

  function pickTarget(enemyUid: number): void {
    const t = targeting;
    targeting = null;
    if (!t || !canAct()) { render(); return; }
    if (t.kind === 'card') play(t.uid, enemyUid);
    else act(() => { if (!usePotion(cs, t.id, enemyUid)) console.error(`usePotion 失敗：${t.id}`); }, THROW_POTIONS.has(t.id) && hasSprite(POSE.throw) ? { pose: POSE.throw, attack: true } : {});
  }

  /**
   * 打出去的牌飛向目標。
   *
   * 原本牌是**直接消失**的——按下去手牌就少一張，中間沒有任何過程，
   * 這是整場戰鬥最「卡」的地方。這裡把那張牌複製一份丟到疊層，讓它飛過去再淡掉。
   *
   * 複製到疊層而不是動原本那張：出牌會整個重畫手牌，原本那張連同動畫一起被丟掉；
   * 疊層不隨畫面重畫，所以飛行過程才播得完。
   */
  function flyCard(uid: number, targetUid: number | undefined): void {
    const layer = overlayRoot();
    const from = root.querySelector<HTMLElement>(`.hand .card[data-uid="${uid}"]`);
    if (!layer || !from || typeof from.animate !== 'function') return;
    const stage = app.stage.getBoundingClientRect();
    const k = stage.width > 0 ? 1280 / stage.width : 1;
    const r = from.getBoundingClientRect();
    const dest = targetUid === undefined
      ? root.querySelector('.unit.player .sprite')
      : root.querySelector(`.unit.enemy[data-uid="${targetUid}"] .sprite`);
    const dr = dest?.getBoundingClientRect();

    const ghost = from.cloneNode(true) as HTMLElement;
    ghost.classList.add('flying');
    ghost.style.left = `${(r.left - stage.left) * k}px`;
    ghost.style.top = `${(r.top - stage.top) * k}px`;
    ghost.style.width = `${r.width * k}px`;
    ghost.style.height = `${r.height * k}px`;
    layer.append(ghost);

    const dx = dr ? (dr.left + dr.width / 2 - (r.left + r.width / 2)) * k : 0;
    const dy = dr ? (dr.top + dr.height / 2 - (r.top + r.height / 2)) * k : -160;
    ghost.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 },
    ], { duration: 340, easing: 'cubic-bezier(.4,0,.6,1)' }).addEventListener('finish', () => ghost.remove());
    // animate() 保險：動畫被節流沒跑完也要把它收掉，不然疊層會留一堆殘影
    window.setTimeout(() => ghost.remove(), 1200);
  }

  function play(uid: number, targetUid: number | undefined): void {
    const card = cs.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    const st = cardStats(card);
    const chk = canPlay(cs, uid, targetUid);
    if (!chk.ok) { hint = chk.reason; render(); return; }
    flyCard(uid, targetUid);
    sfx('draw', 1.15);   // 牌離手的紙聲，比抽牌高一點才分得出是哪個動作
    // 出招一律用「參上」。以前是照牌面貼圖換姿勢，但牌面已經換成專畫的插圖（`card/*`），
    // 那批不是球球的立繪、也沒有對應的姿勢，所以那條規則已經沒有意義了。
    act(() => {
      // canPlay 剛放行卻打不出來＝引擎跟畫面對不上，出聲，不要靜靜吞掉
      if (!playCard(cs, uid, targetUid)) console.error(`playCard 在 canPlay 放行後仍失敗：${st.name}（uid ${uid}）`);
    }, { pose: st.def.type !== '攻擊' && hasSprite(POSE.skill) ? POSE.skill : THROW_CARDS.has(st.def.id) && hasSprite(POSE.throw) ? POSE.throw : POSE.attack, attack: st.def.type === '攻擊' });
    if (tutStep === 0) tutStep = 1;
    // 撒手鐧、先睡了這類「打完直接結束回合」的牌：效果只掛旗，
    // 這裡走跟按「結束回合」一模一樣的流程（收牌動畫→敵人動作→發新牌）。
    // 稍等 650 毫秒讓這張牌的傷害數字與姿勢先播完，不然出招跟收牌疊在同一拍。
    if (cs.endTurnRequested) window.setTimeout(() => {
      if (app.cs === cs && cs.endTurnRequested && cs.phase === 'player') onEndTurn();
    }, 650);
  }

  function onPotion(id: string): void {
    if (!canAct()) return;
    const def = potionById[id];
    if (!def) return;
    hint = '';
    // 只有打魔物的忍具要選目標（手裡劍、麻繩）；全體與自己用的直接用掉
    if (def.target === 'enemy') { targeting = { kind: 'potion', id }; render(); return; }
    act(() => { if (!usePotion(cs, id)) console.error(`usePotion 失敗：${id}`); }, THROW_POTIONS.has(id) && hasSprite(POSE.throw) ? { pose: POSE.throw, attack: true } : {});
  }

  /**
   * 收牌：手上剩下的牌往右下角的「結束回合」飛過去，縮小、轉開、淡掉，像被收回牌堆。
   *
   * **動的是原本那幾張牌，不是複製到疊層的分身**（出牌的 `flyCard` 才需要分身）：
   * 這一段從頭到尾不重畫，所以牌不會被丟掉，動畫播得完；而且分身是照外框
   * （`getBoundingClientRect`）定位的，扇形轉開的牌外框比牌本身大一圈，複製過去會被拉扁。
   *
   * **動的是 `translate`／`rotate`／`scale` 三個獨立屬性，不是 `transform`**：
   * 扇形的角度是渲染時用行內 `transform` 寫上去的，動 `transform` 會把整個扇形抹平。
   * 獨立屬性跟 `transform` 是相乘疊加的，扇形留著、飛行疊在上面。
   *
   * 回傳「等多久再叫引擎」；沒有牌可收（或這個瀏覽器沒有 `animate`）就回 0，呼叫端照舊直接結算。
   */
  function collectHand(): number {
    const hand = root.querySelector<HTMLElement>('.hand');
    const btn = root.querySelector<HTMLElement>('.end-turn');
    const cards = [...root.querySelectorAll<HTMLElement>('.hand .card')];
    if (!hand || !btn || !cards.length || typeof cards[0]!.animate !== 'function') return 0;
    // 舞台整個被 transform: scale() 縮過，量到的螢幕座標要除以縮放比才是舞台座標
    const stage = app.stage.getBoundingClientRect();
    const k = stage.width > 0 ? 1280 / stage.width : 1;
    const br = btn.getBoundingClientRect();
    const bx = br.left + br.width / 2;
    const by = br.top + br.height / 2;
    // 牌多就把出發間隔壓縮、引擎多等一點：固定 38×i 配固定 330 的話，第八張起重畫時還沒出發，
    // 看起來就是「別的牌飛走了、這幾張留在原地」（使用者 2026-09-02 回報）
    const { stagger, wait } = collectTiming(cards.length);
    cards.forEach((node, i) => {
      const r = node.getBoundingClientRect();
      const dx = (bx - r.left - r.width / 2) * k;
      const dy = (by - r.top - r.height / 2) * k;
      // 一張往左轉、一張往右轉，越後面轉越多：整排一起轉同一邊會像一塊板子在倒
      const spin = (i % 2 ? 1 : -1) * (16 + i * 4);
      node.animate([
        { translate: '0 0', rotate: '0deg', scale: 1, opacity: 1 },
        { translate: `${(dx * 0.42).toFixed(0)}px ${(dy * 0.42).toFixed(0)}px`,
          rotate: `${(spin * 0.45).toFixed(0)}deg`, scale: 0.78, opacity: 1, offset: 0.5 },
        { translate: `${dx.toFixed(0)}px ${dy.toFixed(0)}px`, rotate: `${spin}deg`, scale: 0.12, opacity: 0 },
      ], {
        duration: COLLECT_FLY,
        delay: Math.round(i * stagger),
        easing: 'cubic-bezier(.5, 0, .8, .35)',   // 慢慢起步、越飛越快，像被吸進去
        // both＝出發前先定住（不讓手牌的起伏動畫繼續晃）、飛完之後停在按鈕上不要彈回來。
        // 引擎比最後一張牌早跑完，沒有 forwards 的話前面幾張會先跳回原位再被重畫掉。
        fill: 'both',
      });
    });
    // 飛走的牌不要再吃滑鼠：滑過去會被 :hover 拉起來，整段動畫就爛了
    hand.classList.add('collecting');
    btn.setAttribute('disabled', 'disabled');
    return wait;
  }

  function onEndTurn(): void {
    if (!canAct()) return;
    // 選著目標的時候按結束回合：先重畫一次把指引箭頭與選起來的那張牌收掉，再開始收牌。
    // 收牌那段刻意不重畫，箭頭留著就會指著一張已經飛走的牌。
    const wasTargeting = targeting !== null;
    targeting = null;
    if (tutStep === 1) tutStep = 2;
    else if (tutStep === 2) tutDone();
    hideTooltip();
    if (wasTargeting) render();
    sfx('turn_end');
    const wait = collectHand();
    if (wait <= 0) { runEnemyTurn(); return; }
    // 這段時間引擎還停在上一回合，畫面上的數字（飽足、抽牌數）跟引擎仍然是一致的——
    // 因為根本還沒有人動過它。收完牌才真的換回合，那時候整個畫面一起重畫。
    collecting = true;
    window.setTimeout(() => {
      if (app.cs !== cs || !collecting) return;   // 這場已經被接手就算了
      collecting = false;
      runEnemyTurn();
    }, wait);
  }

  /**
   * 敵方回合逐隻演出（使用者 2026-09-03：「所有怪物一次打完所有動作，看不出來怪物有動作」）：
   * 前半（詛咒、棄牌、復活）先畫一拍，然後一隻出手、畫一拍、停 720 毫秒，再換下一隻；
   * 全部動完才收尾發新手牌。中途畫面被接手（app.cs 換了）就整個放掉。
   */
  /** 預告亮多久。這 0.32 秒是從兩隻之間那 720 毫秒的乾等裡借的，不是外加上去的。 */
  const TELEGRAPH_MS = 320;
  /** 收掉蹲低的姿勢：那隻要真的出手了，得先彈回來才接得上前撲。 */
  function clearTelegraph(): void {
    root.querySelector<HTMLElement>('.unit.enemy.telegraph')?.classList.remove('telegraph');
  }
  /**
   * 亮出下一個要出手的那隻。該不該亮的判斷在 `ui/telegraph.ts`（純函式、只讀不寫、有測試釘著），
   * 這裡只負責掛 class。回傳有沒有真的亮，呼叫端才知道要不要等這 0.32 秒。
   */
  function telegraphNext(): boolean {
    const uid = telegraphTarget(cs);   // 該不該亮的條件全在那支純函式裡（有測試釘著它不碰引擎）
    if (uid === undefined) return false;
    const node = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${uid}"]`);
    if (!node) return false;
    node.classList.add('telegraph');
    return true;
  }

  function runEnemyTurn(): void {
    const before = snap(cs);
    if (!beginEnemyTurn(cs)) { settle(before, { deal: true }); return; }
    // 旗標要在 settle 之前設：預告加了延遲之後，settle 畫出來的「結束回合」鈕會亮著閃 0.32 秒
    // （點了仍被 canAct 擋住，但看起來像可以點）——稽核 2026-09-04 夜 L-2
    enemyTurnRunning = true;
    settle(before, { light: true });
    const step = (): void => {
      if (app.cs !== cs) { enemyTurnRunning = false; return; }
      clearTelegraph();
      const b = snap(cs);
      const more = stepEnemyTurn(cs);
      if (!more) {
        finishEnemyTurn(cs);
        enemyTurnRunning = false;
        settle(b, { deal: true });
        return;
      }
      // 這一步有沒有東西可看：有魔物真的動了（回合數推進）或紀錄多了行
      const acted = cs.log.length !== b.logLen
        || cs.enemies.some((e) => (b.enemies.get(e.uid)?.turnCount ?? e.turnCount) !== e.turnCount);
      if (!acted) { step(); return; }
      settle(b, { light: true });
      const gap = cs.phase === 'player' ? 720 : 400;
      // 前 0.4 秒看上一隻的結果，剩下 0.32 秒亮下一隻：兩段加起來還是原本的 720，節奏不變
      if (cs.phase === 'player') {
        window.setTimeout(() => { if (app.cs === cs) telegraphNext(); }, gap - TELEGRAPH_MS);
      }
      window.setTimeout(step, gap);
    };
    // 整個回合的第一隻沒有「上一隻的結果」可以借時間，這 0.32 秒是真的多花的（一回合一次）
    if (telegraphNext()) window.setTimeout(step, TELEGRAPH_MS);
    else step();
  }

  // ===== 結算與動畫 =====

  /** 跑一個引擎動作，然後照「前後差異」放姿勢、動畫與台詞 */
  function act(fn: () => void, opts: { pose?: string; attack?: boolean; deal?: boolean } = {}): void {
    const before = snap(cs);
    hint = '';
    fn();
    settle(before, opts);
  }

  function settle(before: Snap, opts: { pose?: string; attack?: boolean; deal?: boolean; light?: boolean } = {}): void {
    // 結束回合那一拍，魔物出手與新手牌是同一次重畫。手牌立刻滑進來會跟魔物前撲擠在一起，
    // 所以那一拍讓手牌晚 460 毫秒再進場：先看牠們打完，再看自己摸到什麼。
    dealDelay = opts.deal ? 460 : 0;
    // 新回合的手牌全部當成新抽的：上一手沒打完的牌丟進棄牌堆後洗回來、或被拖字訣留下的那張，
    // 編號跟上一手一樣，會被當成「已經在手上」直接出現在定位，其他牌卻還在從牌堆飛——
    // 使用者 2026-09-02：「最後一張牌已經出現，其他牌才從左邊飛出來」
    if (opts.deal) shownCards.clear();
    const posePref = opts.pose;
    const p = cs.player;
    const fresh = cs.log.slice(before.logLen);
    const hurt = p.hp < before.hp;
    const dodged = fresh.some((l) => l.includes('球球閃過了'));
    const hungry = cs.phase === 'player' && p.energy === 0 && hungryTurn !== cs.turn
      && p.hand.some((c) => cardStats(c).cost > 0);
    // 姿勢優先序：分出勝負 ＞ 挨打 ＞ 閃過 ＞ 蜷縮 ＞ 這張牌 ＞ 餓扁 ＞ 待機。先決定再畫，姿勢才看得到。
    // 蜷縮排在牌姿勢前面：擋下傷害這件事比「剛剛打的是哪張牌」更該讓玩家看到。
    // 攻擊牌例外（交出來會奪走蜷縮），那種時候還是要看到出招的姿勢。
    if (cs.phase === 'won') pose = POSE.win;
    else if (cs.phase === 'lost') pose = POSE.lose;
    else if (hurt) pose = POSE.hit;
    else if (dodged) pose = POSE.dodge;
    else if (p.block > before.block && !opts.attack) pose = POSE.curl;
    else if (posePref) pose = posePref;
    else if (hungry) pose = POSE.hungry;
    // 魔物的姿勢也要在畫之前決定。「這一拍有沒有出手」看回合數有沒有往前走：
    // 挨打與閃避（`hurt || dodged`）認不出「攻擊被蜷縮整個擋掉」與「裝死術免疫」那兩種也確實出手的情形。
    acting = new Map();
    hurtSet = new Set();
    for (const e of cs.enemies) {
      const b = before.enemies.get(e.uid);
      if (b && e.hp < b.hp) hurtSet.add(e.uid);
      if (b && !b.dead && e.dead && cs.phase === 'won' && enemyById[e.enemyId]?.pool === '塔主' && encounterById[cs.encounterId]?.pool === '塔主') bossFallUids.add(e.uid);
      if (!b || e.dead || e.turnCount === b.turnCount || b.noAct) continue;
      acting.set(e.uid, { label: b.label, attacked: b.intent === 'attack' });
    }
    // 逐隻演出的每一步只換有變動的單位（light）：整頁重畫會把所有立繪的呼吸動畫重來、背景重貼，
    // 每 0.7 秒抖一下就是使用者說的「嚴重卡頓感」（2026-09-03 晚）。換不了（有新召喚的）才整頁重畫。
    if (!(opts.light && patchField(before))) render();

    // 畫完才把動畫類別與浮動數字掛到剛生出來的節點上
    let stagedMax = 0;   // 本拍最多分幾段：收姿勢與倒下的演出都要排在最後一段之後
    for (const e of cs.enemies) {
      const b = before.enemies.get(e.uid);
      const node = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
      if (!b || !node) continue;
      // 攻擊牌打出多段（連環踢 5×3）：照引擎記下來的每一段，一下一下演——原本只彈一個總數，
      // 玩家看到的是「直接扣 15」而不是三下（使用者 2026-09-05）。丟擲類忍具也帶 attack（針雨 4×3 一樣分段）；
      // 單段、反彈、噎到那些照舊走下面
      const staged = opts.attack ? cs.hits.slice(before.hitsLen).filter((h) => h.uid === e.uid).map((h) => h.amount) : [];
      if (e.hp < b.hp && staged.length > 1) { stageHits(node, staged); stagedMax = Math.max(stagedMax, staged.length); }
      else if (e.hp < b.hp) {
        node.classList.add('hit');
        node.append(floatNum(`-${b.hp - e.hp}`));
        // 出攻擊牌打的放斬擊，其他來源（反彈、中毒、自傷）放撞擊火花：
        // 同樣是掉血，但「我砍的」跟「牠自己踩到的」該長得不一樣
        const poisoned = chokeTick(getStatus(e, '噎到'), b.choke);
        burst(node, poisoned ? 'poison' : opts.attack ? 'slash' : 'hit');
        // 音高照打掉的血量微調：連續打同一隻時，一模一樣的聲音聽起來像卡帶
        const heavy = b.hp - e.hp >= 12;
        sfx(poisoned ? 'poison' : opts.attack ? (heavy ? 'hit_heavy' : 'claw') : 'hit',
          poisoned ? 1 : 0.94 + Math.random() * 0.12);
      }
      // 反彈回敬的那幾下：飄「反彈！」＋刺一聲，被反彈打死的才看得出是怎麼死的
      if (fresh.some((l) => l.startsWith(`反彈回敬了${e.name} `))) {
        node.append(floatNum('反彈！', 'thorn'));
        sfx('thorns');
      }
      // 被防禦擋下的部分：飄「擋住 N」＋盾牌閃一下（整下被吃掉時只有一聲「鏘」的話，看起來像沒打到——使用者 2026-09-02 回報）
      const guarded = blockedAmount(fresh, `${e.name}的防禦擋下了`);
      if (!e.dead && guarded > 0) {
        node.append(floatNum(`擋住 ${guarded}`, 'blocked'));
        burst(node, 'block');
        if (e.hp === b.hp) sfx('blocked');
      }
      // 隱身被消耗、血卻沒動＝這一下被閃掉了。本來只有左上角一行小字，
      // 玩家丟了 16 點的忍具看到毫無反應，只會以為遊戲壞掉（使用者真的回報過）。
      // 頭上飄「閃過！」＋一團煙＋咻一聲，跟被打、被擋同一個等級的回饋。
      if (!e.dead && getStatus(e, '隱身') < b.stealth && e.hp === b.hp) {
        node.append(floatNum('閃過！'));
      }
      if (fresh.some((l) => l === `${e.name}掙脫了定身`)) {
        node.append(floatNum('掙脫！'));
        burst(node, 'smoke');
        sfx('dodge');
      }
      else if (e.hp > b.hp) burst(node, 'heal');
      if (sumStatus(e, BAD_STATUS) > b.debuff) burst(node, 'debuff');
      // 倒下的一團煙晚 160 毫秒放：讓最後那下的斬擊先看完，再看牠化成煙
      // 關主的白閃慢倒不放小怪化煙的煙與音效（調性不合，稽核 2026-09-04 低 22）
      // 分段演出時倒下要等最後一段打完再演，不然溶解跟煙會插在三段中間、最後那下的數字反而看不到（稽核 2026-09-05 夜 高-1）
      if (!b.dead && e.dead) {
        const after = staged.length > 1 ? (staged.length - 1) * 150 : 0;
        const fall = (): void => { if (bossFallUids.has(e.uid)) { sfx('enemy_down'); } else { node.classList.add('dead'); burst(node, 'smoke', 160); sfx('enemy_down'); } };
        if (after > 0) window.setTimeout(() => { if (app.cs === cs && node.isConnected) fall(); }, after); else fall();
      }
      // 前撲跟著立繪一起換：兩邊都認同一張 `acting` 表，不會出現「圖換了卻沒動」或反過來
      else if (acting.get(e.uid)?.attacked) {
        node.classList.add('attack');
        // 一整排同時前撲很像機器人；照排列位置各差 110 毫秒，看起來才像各打各的
        const sp = node.querySelector<HTMLElement>('.sprite');
        if (sp) sp.style.animationDelay = enemyTurnRunning ? '0ms' : `${cs.enemies.indexOf(e) * 110}ms`;
      }
      else if (acting.has(e.uid)) node.classList.add('cast');   // 非攻擊招：原地蓄勢一下（樣式在 combat.css），不然看起來像沒動
      // 出招的結果各疊一團光（使用者 2026-09-03：「怪物放特效或格擋完全看不出動作」）：
      // 格擋、增益、蓄力在牠身上；減益、詛咒塞牌、看破在球球身上；召喚的煙在新冒出來的那隻身上
      if (acting.has(e.uid) && !e.dead) {
        if (e.block > b.block) burst(node, 'block');
        if (sumStatus(e, GOOD_STATUS) > b.buff) burst(node, 'buff');
        if (e.charged && !b.charged) burst(node, 'charge');
      }
      if (e.phase > b.phase) { bossPhaseTalk(e.enemyId, e.phase); phaseBurst(node); }
    }
    // 蜷縮加上去的當下讓那個牌子彈一下：光換姿勢還是容易漏看「這回合擋了多少」
    if (p.block > before.block) root.querySelector('.unit.player .chip.block')?.classList.add('gain');
    const cat = root.querySelector<HTMLElement>('.unit.player');
    // 魔物對球球做的事也要在球球身上看得到：被塞牌／被減益／被看破
    if (cat && acting.size > 0) {
      if (sumStatus(p, BAD_STATUS) > before.debuff) burst(cat, 'debuff');
      if (fresh.some((l) => l.includes('塞進你的'))) burst(cat, 'curse');
      if (fresh.some((l) => l.includes('看穿了球球的身法') || l.includes('拍散') || l.includes('震散'))) burst(cat, 'strip');
    }
    // 剛被召喚出來的：煙
    for (const e of cs.enemies) if (!before.enemies.has(e.uid) && !e.dead) { const n = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`); if (n) burst(n, 'smoke'); }
    // 伏兵是在敵方回合開頭冒出來的，那一拍還沒有人出手，所以不能放在上面那個「有人出招」的區塊裡（稽核 2026-09-04 高 3）
    if (fresh.some((l) => l.startsWith('伏兵'))) toast('有伏兵跳出來了喵！', '球球');
    if (cat) {
      if (p.hp > before.hp) { burst(cat, 'heal'); sfx('heal'); }
      if (p.block > before.block) { burst(cat, 'block'); sfx('block'); }
      if (sumStatus(p, GOOD_STATUS) > before.buff) {
        burst(cat, 'buff');
        // 隱身有專屬的一團煙，跟一般增益的亮音分開
        sfx(getStatus(p, '隱身') > before.stealth ? 'stealth' : 'buff');
      }
      if (sumStatus(p, BAD_STATUS) > before.debuff) { burst(cat, 'debuff'); sfx('debuff'); }
      // 破功：疊好的成長被拍散——數字默默變小很容易漏看，飄字＋紫光講清楚
      if (getStatus(p, '爪力') + getStatus(p, '貓步') < before.growth && p.hp === before.hp) {
        cat.append(floatNum('氣勁被拍散！'));
        burst(cat, 'debuff'); sfx('debuff', 0.8);
      }
      // 被吹散手牌（下回合少抽）：飄一句在球球身上，紀錄框裡也有
      const blown = fresh.find((l) => l.includes('下回合少抽'));
      if (blown) {
        cat.append(floatNum(blown.slice(blown.indexOf('下回合')), 'bad'));
        burst(cat, 'debuff');
        sfx('debuff', 0.8);
      }
      // 蜷縮擋下的部分也要看得到：飄「擋住 N」＋盾牌閃一下＋「鏘」（球球比照魔物）
      const guarded = blockedAmount(fresh, '蜷縮擋下了');
      if (guarded > 0) {
        cat.append(floatNum(`擋住 ${guarded}`, 'blocked'));
        burst(cat, 'block');
        sfx('blocked');
      }
      if (hurt) {
        cat.classList.add('hit');
        // 邊緣紅暈：挨打的訊號要大到用餘光就看得到（受擊姿勢＋抖動一直都有，但視線常在手牌）
        const box = root.querySelector('.combat');
        box?.classList.add('player-hurt');
        window.setTimeout(() => { box?.classList.remove('player-hurt'); }, 500);
        cat.append(floatNum(`-${before.hp - p.hp}`));
        const pPoison = chokeTick(getStatus(p, '噎到'), before.choke);
        burst(cat, pPoison ? 'poison' : 'hit');
        sfx(pPoison ? 'poison' : 'hurt');
        // 挨重擊整個戰場震一下。門檻設在最大生命的 8%，小刮傷不震——
        // 每一下都震反而會麻痺，變成背景雜訊。震的是 .combat 不是舞台：
        // 舞台身上有 transform: scale()，在那裡加動畫會把縮放蓋掉。
        if (before.hp - p.hp >= p.maxHp * 0.08) {
          const box = root.querySelector<HTMLElement>('.combat');
          box?.classList.add('shaken');
          window.setTimeout(() => box?.classList.remove('shaken'), 300);
        }
      }
      else if (dodged) cat.classList.add('dodge');
      // 前撲只給攻擊牌（規格 §8.4）：看 opts.attack，不能看有沒有指定姿勢——每張出的牌都會指定姿勢，
      // 拿它當條件的話「淡定」這種防禦牌也會蜷成球又往前撲
      else if (opts.attack) cat.classList.add('attack');
    }

    if (hungry) { hungryTurn = cs.turn; toast(pick(dialogue.hungry), '球球'); }
    if (!lowHpTold && p.hp > 0 && p.hp < p.maxHp * 0.3) { lowHpTold = true; toast(pick(dialogue.lowHp), '球球'); }

    // 姿勢停留時間：一般 650 毫秒看得清楚，但蜷縮例外——它是「縮成一顆球」的靜態姿勢，
    // 沒有前撲、沒有閃紅，650 毫秒閃一下根本來不及看到牠縮起來，拉到 1200。
    // 一排魔物的前撲各錯開 110 毫秒（見下方 animationDelay），停留時間要算進最後一隻撲完的時間，
    // 不然第三隻起會撲到一半被切回待機（稽核 2026-09-03）
    const stagger = Math.max(0, cs.enemies.length - 1) * 110;
    // 蜷縮本來停 1200：使用者 2026-09-03 晚「有點太長，有時候會拖到下一回合」→ 縮到 700，仍比一般姿勢多停一點
    // 分段演出：最後一段在 (段數−1)×150 毫秒掛上、抖 400 毫秒，收姿勢要等它抖完（稽核 2026-09-05 夜 低-3）
    const hold = pose === POSE.curl ? 700 : Math.max(650, stagger + 560, stagedMax > 1 ? (stagedMax - 1) * 150 + 460 : 0);
    const mine = ++seq;
    window.setTimeout(() => {
      if (seq !== mine || app.cs !== cs || ended || cs.phase !== 'player') return;
      pose = idlePose();
      acting = new Map();   // 魔物也一起收回待機，出手的立繪只亮這一拍
      hurtSet = new Set();
      // 動畫類別也要一起收。這裡刻意不重畫，`attack`／`hit`／`dodge` 就會留在節點上，
      // 立繪的 animation 停在前撲／抖動跑完的那一格，待機的呼吸動畫回不來——
      // 使用者 2026-09-03：「球球跟師父換動作後不會上下飄動了，定在原地不動」。
      for (const u of root.querySelectorAll<HTMLElement>('.unit.attack, .unit.hit, .unit.dodge, .unit.cast')) {
        u.classList.remove('attack', 'hit', 'dodge', 'cast');
        const sp = u.querySelector<HTMLElement>('.sprite');
        if (sp) sp.style.animationDelay = '';
      }
      // **就地換圖，不要 render()**：這一拍畫面沒有任何資料變動，只是姿勢收回待機。
      // 呼叫 render() 會把整個戰場重生一次，正在飄的傷害數字（1 秒）會被砍在半路、
      // 倒地與生命條的動畫也一起中斷——「動畫不順」的根就在這裡。
      const cat = root.querySelector<HTMLImageElement>('.unit.player .sprite');
      if (cat) cat.src = artUrl('sprites', pose);
      for (const e of cs.enemies) {
        const img = root.querySelector<HTMLImageElement>(`.unit.enemy[data-uid="${e.uid}"] .sprite`);
        if (img) img.src = enemySprite(e, enemyById[e.enemyId]);
      }
    }, hold);

    if (cs.phase !== 'player' && !ended) {
      ended = true;
      if (cs.phase === 'won') toast(dialogue.battleWin[Math.floor(Math.random() * dialogue.battleWin.length)] ?? '', '球球');
      // 關主戰打贏：白閃一下、關主慢慢倒下，多站一秒再交棒（收尾節奏，使用者 2026-09-04）
      const bossWon = cs.phase === 'won' && encounterById[cs.encounterId]?.pool === '塔主';
      if (bossWon) { const flash = el('div', { class: 'boss-flash' }); root.append(flash); window.setTimeout(() => flash.remove(), 900); }
      // 讓勝負的姿勢與吐槽站一下再交棒；app.cs 換人就表示這場已經被接手，不要再叫一次
      window.setTimeout(() => { if (app.cs === cs) app.afterCombat(bonusFish, bonusUpgrades); }, bossWon ? 2400 : 1300);
    }
    syncPicker();
  }

  /**
   * 塔主進第二階段的兩句：吐槽是同一個位置，錯開時間放才不會疊在一起。
   * 第二句晚 1.4 秒才放，比交棒的 1300 毫秒還久，所以要跟其他延遲回呼一樣先確認這場還在
   * （`app.cs === cs`）——不然階段一換就把塔主打死的話，這句會飄到結算畫面上（吐槽住在疊層，換畫面不會被清掉）。
   */
  /**
   * 變身那一拍的演出：全場閃白、鏡頭震一下、變身那隻的立繪脹大再回來。
   * 類別 950 毫秒後拆掉——這幾個都是一次性動畫，留著的話下次加不回去（動畫不重播）。
   */
  function phaseBurst(node: HTMLElement): void {
    const box = root.querySelector('.combat');
    box?.classList.add('phase-flash', 'shaken');
    node.classList.add('phase-pulse');
    sfx('hit_heavy', 0.62);   // 沒有專屬吼聲，拿重擊音壓低半檔當「氣勢炸開」
    window.setTimeout(() => {
      if (app.cs !== cs) return;
      box?.classList.remove('phase-flash', 'shaken');
      node.classList.remove('phase-pulse');
    }, 950);
  }

  function bossPhaseTalk(bossId: string, phase: number): void {
    const lines = phase >= 2
      ? (dialogue.bossPhase3ById[bossId] ?? dialogue.bossPhase3Generic)
      : (dialogue.bossPhase2ById[bossId] ?? dialogue.bossPhase2Generic);
    // 「塔主」木牌只留給師父本人；其他關主的吐槽掛自己的名字（貓又婆婆等）
    const name = (sp: string): string =>
      sp === '塔主' && bossId !== 'tower_master' ? (enemyById[bossId]?.name ?? sp) : sp;
    // 潤飾版有三句的組（狸大人）：整串照 1.4 秒一句輪播，跟原本兩句的節奏一致
    lines.forEach((l, i) => {
      if (i === 0) { toast(l.text, name(l.speaker)); return; }
      window.setTimeout(() => { if (app.cs === cs) toast(l.text, name(l.speaker)); }, 1400 * i);
    });
  }

  // ===== 待選牌 =====

  /** `cs.pending` 一出現就開視窗、一消失就收；視窗掛在疊層，重畫畫面不會把它掃掉 */
  function syncPicker(): void {
    if (!cs.pending) { picker?.remove(); picker = null; return; }
    if (picker) return;
    const pd = cs.pending;
    const layer = overlayRoot();
    if (!layer) return;
    const chosen: number[] = [];
    const okBtn = el('button', { class: 'btn primary' }, '確定');
    const count = el('div', { class: 'pick-count' });
    const refresh = (): void => {
      const bad = chosen.length < pd.min || chosen.length > pd.max;
      okBtn.toggleAttribute('disabled', bad);
      count.textContent = `已選 ${chosen.length} 張`;
    };
    const grid = el('div', { class: 'deck-grid' });
    for (const c of pd.cards) {
      const node = cardNode(c, {
        small: true,
        onClick: () => {
          const at = chosen.indexOf(c.uid);
          if (at >= 0) chosen.splice(at, 1);
          else if (chosen.length < pd.max) chosen.push(c.uid);
          else if (pd.max === 1) chosen.splice(0, 1, c.uid);   // 只能選一張時，點另一張＝改選
          else return;
          for (const n of grid.children) n.classList.toggle('selected', chosen.includes(Number((n as HTMLElement).dataset['uid'])));
          refresh();
        },
      });
      grid.append(node);
    }
    okBtn.addEventListener('click', () => {
      const before = snap(cs);
      if (!resolveChoice(cs, [...chosen])) { console.error(`resolveChoice 失敗：${pd.purpose} ${chosen.join(',')}`); return; }
      picker?.remove(); picker = null;
      hideTooltip();
      settle(before);   // 選完之後這張牌剩下的效果才會跑，所以照樣要結算一次
    });
    refresh();
    const range = pd.min === pd.max ? `${pd.min} 張` : `${pd.min}～${pd.max} 張`;
    picker = el('div', { class: 'modal-overlay' },
      el('div', { class: 'modal' },
        el('h2', { class: 'modal-title' }, `${PENDING_TITLE[pd.purpose]}（${range}）`),
        grid,
        el('div', { class: 'modal-foot' }, count, okBtn)));
    layer.append(picker);
  }

  // Esc 取消選目標。這場戰鬥換人（app.cs 變了）時聽眾自己退場，免得一直堆著
  const onKey = (ev: KeyboardEvent): void => {
    if (app.cs !== cs) { window.removeEventListener('keydown', onKey); return; }
    if (ev.key === 'Escape' && targeting) { targeting = null; render(); }
  };
  window.addEventListener('keydown', onKey);
  app.disposers.push(() => window.removeEventListener('keydown', onKey));   // 換畫面就拆，不用等下一次按鍵（2026-09-02 稽核 L-8）

  render();
  syncPicker();

  // ===== 關主戰的 VS 開場閃卡：兩張立繪對衝＋名字橫幅，1.4 秒自動收、點一下也收 =====
  // 疊在第一次畫面上面；素材還沒生好（灰剪影）就整個不放，寧缺勿醜。
  const bossDef = encounterById[cs.encounterId]?.pool === '塔主'
    ? cs.enemies.map((e) => enemyById[e.enemyId]).find((d) => d?.pool === '塔主')
    : undefined;
  if (bossDef) {
    const heroUrl = artUrl('sprites', POSE.idle);
    const bossUrl = bossDef.art === 'daxia' ? artUrl('sprites', BOSS_IDLE) : monsterUrl(bossDef.art, 'idle');
    if (!isFallback(heroUrl) && !isFallback(bossUrl)) {
      const ov = el('div', { class: 'vs-overlay' },
        el('img', { class: 'vs-left', src: heroUrl, alt: '球球' }),
        el('div', { class: 'vs-mark' }, 'VS'),
        el('img', { class: 'vs-right', src: bossUrl, alt: bossDef.name }),
        el('div', { class: 'vs-banner' },
          el('span', { class: 'vs-name' }, '球球'),
          // 名字用場上那隻的（可能已冠上「暴怒的」前綴），跟頭上的名牌一致
          el('span', { class: 'vs-boss' }, cs.enemies.find((u) => enemyById[u.enemyId]?.pool === '塔主')?.name ?? bossDef.name)));
      root.append(ov);
      sfx('hit_heavy', 0.5);
      const off = window.setTimeout(() => ov.remove(), 1400);
      ov.addEventListener('pointerdown', () => { window.clearTimeout(off); ov.remove(); });
    }
  }
});
