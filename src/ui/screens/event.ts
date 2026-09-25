import { play } from '../audio';
import { cardById, cardNameFor } from '../../content/cards';
import { dialogue } from '../../content/dialogue';
import { condHint, coopFill, eventTextFor, flagWhy, lotteryAfter, partnerCondLabel } from '../../content/event-text';
import { notice } from '../dialogue';
import { potionById } from '../../content/potions';
import { relicById, relicLongText } from '../../content/relics';
import { FIXED_EVENT_FLOOR_5, eventById } from '../../content/events';
import { addCard, applyRunEffects, purifyRelic, removeCard, runMods, runRng, upgradeCard, type RunEffectOutcome, type RunGain } from '../../engine/run';
import { showPurifyPick } from '../purifypick';
import { purifiedBetween, showPurifyReveal } from '../purifyreveal';
import { choiceEffectsFor, choiceGate, choiceOrder, resultSeat, seatTextIndex, visibleChoices, type ChoiceGate } from '../../engine/eventcond';
import { heroName, heroOf, type Hero } from '../../engine/hero';
import { allVoted, onlyStanding, settleVotes } from '../../engine/vote';
import { PickWaits, pickKindsOf } from '../../engine/eventpicks';
import type { CardDef, CardInstance, EventChoice, EventDef, RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl, eventArtCast, eventArtHero, eventArtKey, eventSidePortrait, heroArtUrl } from '../assets';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';
import { cardNode } from '../cardview';
import { showUpgradeConfirm } from '../confirm';
import { eventPickRule, showDeckPicker } from '../deckview';
import { showPotionSwap, swapPotion } from '../potionswap';
import { el } from '../dom';
import { burst } from '../fx';
import { renderHud } from '../hud';
import { sceneView } from '../scene';
import { me } from '../../engine/runplayer';
import { eventArtReady, preloadEventResults, warmResultArt, whenEventArtDecoded } from '../preload';

// 除錯總覽也要讀事件文案：經由這裡轉給它，打包時文案才會跟事件畫面併成同一塊（見 debug.ts 的匯入說明）
export { eventTextFor, FEIFEI_EVENT_LINES } from '../../content/event-text';

/**
 * 結果畫面要秀出來的牌：學會的彈出來、升級的打鐵發金光、丟掉的化成煙散掉、被塞的壞毛病抖一下。
 * 本來只有一行字「「淡定」被丟掉了」（使用者 2026-09-02：「感覺不太有回饋感」）。
 */
type ShowKind = 'learn' | 'upgrade' | 'remove' | 'curse';
type Showcase = { kind: ShowKind; card: CardInstance }[];

function showcaseNode(items: Showcase): HTMLElement {
  const box = el('div', { class: 'showcase' });
  for (const it of items) {
    const node = cardNode(it.card);
    node.classList.add('showcase-card', it.kind);
    if (it.kind === 'upgrade') node.classList.add('forged');
    // 特效包一層再放：`.card` 自己是 `overflow: hidden`，丟牌那團煙（201 像素、中心壓得低）
    // 掛在牌上會被裁掉下緣約 48 像素，牌底出現一條硬邊（稽核 2026-09-10 低-1）。
    // `.fx-host` 沒有裁切，尺寸完全跟著牌走，版面一格都不動。
    const host = el('span', { class: 'fx-host' }, node);
    box.append(host);
    // 特效要等節點進到文件裡才量得到位置
    window.setTimeout(() => burst(host, it.kind === 'remove' ? 'smoke' : it.kind === 'curse' ? 'debuff' : 'buff'), it.kind === 'remove' ? 420 : 60);
  }
  return box;
}

/**
 * 拿到的秘寶／忍具放大彈出來，**效果直接寫在那顆跳動的圖示上方**
 *（使用者 2026-09-10：「效果應該要在跳動的這個圖案上方也有大字顯示」）。
 *
 * 原本圖示是孤零零一顆，要往下掃到對白框裡那一列才知道它是什麼、有什麼用——
 * 跟紙箱那次同一個毛病（說明離主體太遠）。排法照紙箱退路版那一套：
 * 效果在上、圖示在中、「秘寶／忍具＋名字」在下，一眼從上讀到下。
 * **不共用 `.loot-stack` 那個類別**：它自己帶著一條 `.scene:has(.loot-stack) .scene-art { top: 56px }`，
 * 跟 `.scene-art:has(.showcase)` 的 `translate(-50%, -78%)` 疊起來會把整塊推到畫面外
 *（實測效果那行整條被切掉）。另開 `.gain-stack`，只借排版不借定位。
 * 帶滿收不下的忍具不放大（那不是「拿到」），留給對白框裡那一列去說明。
 */
function gainsNode(gains: readonly RunGain[], owned: readonly string[]): HTMLElement | '' {
  const box = el('div', { class: 'showcase icons' });
  for (const g of gains) {
    if (g.missed) continue;
    const d = g.kind === '秘寶' ? relicById[g.id] : potionById[g.id];
    const url = d ? artUrl('icons', d.art) : '';
    if (!d || url.startsWith('data:')) continue;
    // 包一層才放得下特效：`<img>` 不能有子節點（見 fx.ts 的 burst）
    const node = el('img', { class: 'showcase-icon', src: url, alt: d.name });
    const host = el('span', { class: 'fx-host' }, node);
    box.append(el('div', { class: 'gain-stack' },
      el('p', { class: 'loot-above' }, gainText(g, owned)),
      host,
      el('div', { class: 'loot-below' },
        el('span', { class: 'loot-kind' }, g.kind),
        el('b', { class: 'loot-name' }, d.name))));
    window.setTimeout(() => burst(host, 'buff'), 60);
  }
  return box.childElementCount ? box : '';
}

/**
 * 拿到的東西的效果說明。秘寶走 `relicLongText`：師門那幾件多一段「【師門 n／3】…」，
 * 集到幾件照身上現在的秘寶數（效果已經套完，剛拿到的那件也算進去）——狀態列、罐頭鋪、過關三選一本來就這樣寫，
 * 事件這兩處原本只寫 `d.text`，影子給的舊木劍拿到時看不出湊到第幾件（2026-09-23 b2fin，b2mech 報告第五條）。
 */
function gainText(g: RunGain, owned: readonly string[]): string {
  const r = g.kind === '秘寶' ? relicById[g.id] : undefined;
  return r ? relicLongText(r, owned, true) : potionById[g.id]?.text ?? '';
}

/**
 * 事件的插圖。十個事件本來共用同一張空走廊當底圖——文字寫著「轉角站著一隻橘貓山賊」，
 * 畫面上卻什麼都沒有，故事裡的角色不在畫面上，難怪沒有故事感。
 * 每個事件配一張自己的插圖；還沒生好的就不放（`artUrl` 會回灰剪影，那比沒有更糟）。
 */
function eventArt(id: string, hero?: string, fallback?: { run: RunState; id: string; hero?: string }): HTMLElement | string {
  // 鍵走 `eventArtKey`：有菲菲自己的那張就用她的，沒有就退回球球那張（見那支的說明）
  const want = eventArtKey(id, hero);
  const url = artUrl('bg', want);
  if (url.startsWith('data:')) return '';
  /*
   * 結果圖等滿 6 秒還沒解好（`whenResultArtReady`）：**先用這一篇的主圖頂著，結果圖解好再換上**，不露空白
   *（2026-09-23 0-2 補）。慢網路實測過：本機預覽是 HTTP/1.1、一個主機只開 6 條連線，
   * 跳過的開頭影片、背景音樂、角色逐格動作那幾個大檔會把 6 條全佔住，新請求再怎麼插隊也要排十幾秒。
   * 主圖在事件畫面上已經畫過（走進來時等過它），換上去不會空。結果圖抓不到就一直用主圖。
   */
  const wait = !!fallback && !eventArtReady(fallback.run, url);
  // 頂替的主圖照主圖那一位挑（`fallback.hero`）：結果圖照同伴挑的時候（`resultArtHeroFor`），頂著的仍是畫面上剛畫過的那一張
  const key = wait && fallback ? eventArtKey(fallback.id, fallback.hero) : want;   // 現在要畫的那一張
  // 插圖裡畫了誰也標上：5F 秘笈那段對白播到這一隻時就不再放頭像（同畫面兩種長相，見 dialogue.ts 的 `portraitPlan`）
  const img = el('img', { class: 'event-art', src: artUrl('bg', key), alt: '', 'data-art-cast': eventArtCast(key).join(' ') }) as HTMLImageElement;
  if (wait && fallback) {
    void whenEventArtDecoded(fallback.run, url).then(() => {
      if (!eventArtReady(fallback.run, url)) return;
      img.src = url;
      img.dataset['artCast'] = eventArtCast(want).join(' ');
    });
  }
  return img;
}

/**
 * 事件拿到的秘寶／忍具，排成跟戰利品畫面同一種列：圖示、名稱、效果各就各位。
 * 本來只有一行「拿到忍具「鐵爪套」「小魚乾串」」，看不出那是什麼、有什麼用。
 */
function gainRows(gains: readonly RunGain[], owned: readonly string[]): HTMLElement | string {
  if (!gains.length) return '';
  const box = el('div', { class: 'reward-items event-gains' });
  for (const g of gains) {
    const d = g.kind === '秘寶' ? relicById[g.id] : potionById[g.id];
    if (!d) continue;
    const url = artUrl('icons', d.art);
    // 帶滿收不下的忍具要寫清楚（不然看起來像拿到了）；問過之後照 `asked` 畫（換成了／放棄了），重畫也不會變回「收不下」
    const label = g.asked === 'swapped' ? `換成了「${d.name}」`
      : g.asked === 'declined' ? `沒有換，放棄了「${d.name}」`
      : g.missed ? `忍具帶滿了，「${d.name}」收不下` : `拿到${g.kind}「${d.name}」`;
    box.append(el('div', { class: `reward-item ${g.kind === '秘寶' ? 'relic' : 'potion'}${g.missed && !g.asked ? ' missed' : ''}`, 'data-gain': g.id },
      url.startsWith('data:') ? '' : el('img', { src: url, alt: d.name }),
      el('span', { class: 'reward-line' }, el('b', {}, label), el('em', {}, gainText(g, owned)))));
  }
  return box;
}

/**
 * 條件選項按鈕下面那一行灰字「因為：…」（2026-09-23 內容擴充第二批，劇本 design2 新1）：
 * 讓玩家知道「為什麼多了這條路」是**這一局養出來的**。`who`＝讓它出現的那一位（本機這一位寫「你」，同伴寫名字）。
 */
const TAG_VERB: Readonly<Record<string, string>> = { 毒: '會上毒', 反彈: '會反彈', 隱身: '會隱身', 蓄氣: '會蓄氣' };
function condWhyLine(gate: ChoiceGate, who: string, coop: boolean): string {
  const w = gate.why;
  if (!w) return '';
  const all = coop ? '你們' : '你';   // 付錢型與整局旗標是兩個人一起的
  switch (w.kind) {
    case 'deckTag': return `因為：${who}後來學的牌裡有 ${w.n} 張${TAG_VERB[w.tag] ?? ''}`;
    case 'relic': return `因為：${who}身上帶著「${relicById[w.id]?.name ?? w.id}」`;
    case 'fishAtLeast': return `因為：${all}身上${coop ? '都' : ''}有 ${w.n} 條以上的小魚乾`;
    case 'potionsFull': return `因為：${who}的忍具帶滿了`;
    case 'flag': { const why = flagWhy(w.name); return why ? `因為：${all}${why}` : ''; }
    default: { const _never: never = w; void _never; return ''; }
  }
}

/** 牌名。**要收 hero**：菲菲看到的是她那套名字（`cardNameFor`），拿原名會跟牌面對不起來 */
function cardName(c: CardInstance, hero: string | undefined): string {
  const d = cardById[c.cardId];
  return (d ? cardNameFor(d, hero) : c.cardId) + (c.upgraded ? '＋' : '');
}

registerScreen('event', (app, root, props) => {
  root.append(screenBg(actVariantKey('bg/screen_event', app.run?.act ?? 1)));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  /*
   * `qmark`＝問號格變成伏擊的那一篇（2026-09-23 內容擴充第三批，`app.ts` 的 `enterQmark` 組好帶進來）：不在事件表裡，
   * 文字已經是本機這一位的版本（`content/qmark-text.ts`），所以下面換口吻那一層（`eventTextFor`）整個跳過。
   */
  const { eventId, qmark } = props as { eventId?: string; qmark?: EventDef };
  const ev = qmark ?? (eventId ? eventById[eventId] : undefined);
  // 節點沒帶事件 id 就別停在一片空白，直接回地圖。這裡走 show 不走 backToMap：
  // backToMap 會存檔，而這是「進節點」的當下、節點還沒結算，存下去就違反「節點結算完才存」的規矩
  // （引擎保證事件節點一定帶得到 eventId，所以這條路今天走不到，但規矩要處處成立）
  if (!ev) { app.show('map'); return; }
  // 標題也照本機這一位換口吻（2026-09-23 主控裁定）：噹噹、封封不喊「師父」，看到的是「大俠貓的舊木箱」這類；
  // 走跟本文同一條 `eventTextFor`（對照表查不到就原樣），連線混搭一樣照本機這一位
  const title = eventTextFor(me(run, app.seat).hero, ev.title);

  /*
   * 兩個人一起遇到同一件事（連線版 2026-09-11）。
   *
   * **選項用投票**（跟選路線一樣）：兩個人各投一個，投一樣就照那個走、
   * 投不一樣就擲一次骰（規則與理由見 `engine/vote.ts`）。一件事只會發生一次，
   * 總不能一個人在賭博、另一個人在摸貓。
   *
   * **效果對兩個人各跑一次**：回血就兩個人都回、扣錢就兩個人都扣。
   * 那是「這件事發生在你們身上」最直觀的意思，也跟戰利品「各拿一份」同一套。
   */
  const seat = app.seat;
  const coop = app.coop;
  /**
   * 走進事件時自己身上的秘寶（2026-09-25 淨化結果視窗）：結果畫好時跟現在的比，淨化掉哪幾件就秀出來（`purifiedBetween`）。
   * 一件、全部、挑的、連線投票淨化的都走得到這裡，不用每條路各接一次。`purifyShown` 記秀過的，`finish` 叫幾次都只秀一次
   */
  const relicsAtStart = [...me(run, seat).relics];
  const purifyShown = new Set<string>();
  const evd = ev;   // 收斂成不可為 undefined 的常數，給下面的內部函式用（窄化不會跟進函式裡）
  // 插圖照誰挑、要不要在旁邊放自己的立繪（連線的鏡子走廊照座位 0，見 assets.ts 的 `eventArtHero`）
  const artHero = eventArtHero(ev.id, run.players.map((p) => p.hero));
  /**
   * 這個選項的結果圖照誰挑（2026-09-23 b2fin，實機抓到）：條件選項是同伴讓它出現的（`resultSeat`），結果文字寫同伴做的事，
   * **結果圖也要是同伴那一版**，不然字寫菲菲、圖畫球球。其餘照原本（`artHero`）。進畫面時預載用、`take()` 套效果之前定案用，同一個局面問兩次答案一樣。
   */
  const resultArtHeroFor = (i: number): string | undefined => {
    const c = evd.choices[i];
    const s = c ? resultSeat(run, c, seat) : seat;
    return s === seat ? artHero : heroOf(me(run, s));
  };
  /*
   * 連線限定事件（2026-09-23 內容擴充第二批，劇本 design2 新7）：插圖是純場景、圖裡沒有主角，
   * 兩位的立繪站兩邊——本機這一位在左、同伴在右。其餘事件照舊（鏡子走廊那種才在旁邊放自己）。
   */
  const partner = run.players.length > 1 ? run.players[seat === 0 ? 1 : 0] : undefined;
  const pairUrl = (h: string | undefined): string | undefined => { const u = heroArtUrl(h ?? 'ninja', 'hero/ninja'); return u.startsWith('data:') ? undefined : u; };
  const coopPair = !!coop && !!ev.coopOnly && !!partner;
  const portrait = coopPair ? pairUrl(me(run, seat).hero) : eventSidePortrait(ev.id, artHero, me(run, seat).hero ?? 'ninja');
  const portrait2 = coopPair ? pairUrl(partner?.hero) : undefined;
  /**
   * 座位不對稱的選項（連線限定事件的「我拿／我付」）：按鈕與結果的文字照本機這一位的視角挑。
   * 約定見 `EventChoice.bySeat`：`choices[0]` 的字是「我拿」、`choices[1]` 的是「我付」（座位 0 的視角），
   * 座位 1 看的時候兩個對調。**投票、套效果仍用原本的索引**（票是絕對的，兩台才結算得一樣）。
   */
  const labelRaw = (i: number): string => evd.choices[seatTextIndex(evd, i, seat)]?.label ?? '';
  const resultRaw = (i: number): string => evd.choices[seatTextIndex(evd, i, seat)]?.result ?? '';
  /*
   * **選擇不可以在畫面收尾時清掉**（2026-09-11 實測的坑）。
   *
   * 這裡本來掛了一個 `clearPicks` 的收尾，想說離開這一格就清乾淨。可是「有人投票」
   * 的當下要重畫畫面，而重畫＝`app.show()`＝**先跑收尾再重建**——於是每投一票就被
   * 自己清掉一次，兩邊永遠湊不齊、畫面完全沒反應、主控台也不會叫。
   * 清的時機只有一個：**票結算完的那一刻**（下面設定的地方）。
   */
  let chosen = -1;   // 已經定案的選項（-1＝還在投票）
  /*
   * 「挑牌升級／移除」那一輪要用的文案與旗標。
   * 掛在畫面層級是因為**套用的處理函式在 `take()` 裡**（兩台都跑得到），
   * 而文案只有真的開過挑牌疊層的那一台才有。
   */
  let cardPickInfo: { up: boolean; resultText: string; gains: RunGain[];
    gotShow: Showcase; noteLine: (extra?: string) => string | null;
    /** 一張都沒挑的時候那一行怎麼寫（本來就沒得挑，跟有得挑卻選了不選，講法不一樣） */
    none: string } | null = null;
  /**
   * **還在等同伴挑牌**（挑一張來升級／丟掉、三選一學招）。
   *
   * 這段期間不可以讓人按「繼續」走掉：套用那幾張牌的處理函式是這個畫面掛上去的，
   * 而 `App.show()` 換畫面時會把畫面級的連線回呼清乾淨——先走的那一位
   * **就再也套不到同伴挑的那張牌**，兩邊的牌組與 `nextUid` 當場差一個，下一格對帳才炸。
   *
   * 最容易踩到的是「自己沒得挑」的人：倒下的、或牌組裡每張都升級過的，
   * 他那台一進來就直接看到結果與「繼續」，一按就走。
   */
  /**
   * 這一輪還在等哪幾種票（2026-09-24 推前審查五 高-4）：原本是一個旗標，哪一種先湊齊就放「繼續」——紫霧②一人丟牌、一人挑淨化時，
   * 先挑好的那台能先走，另一人挑的結果套不進這台、兩台分岔。改成記每一種，湊齊一種拿掉一種，全拿掉了才放（`engine/eventpicks.ts`）。
   */
  const waitingPicks = new PickWaits();
  /** 最近一次畫的結果畫面（`finish` 的參數）：別種票湊齊、要把按鈕換成「繼續」時照這一份重畫，不重跑結果（重跑會再開一次挑選窗） */
  let lastFinish: [string, string | null, readonly RunGain[], Showcase] | null = null;
  /** 連線時「挑一件淨化」那一輪的文案（2026-09-23 第三批）：只有真的開過挑選窗的那一台才有，理由同 `cardPickInfo` */
  let purifyInfo: { resultText: string; gains: RunGain[]; gotShow: Showcase; noteLine: (extra?: string) => string | null } | null = null;
  const iDown = !!coop && !!me(run, seat).down;   // 我倒下了：只能看，不能選

  /** 交換是大家一起做：站著的每一位都要有可交出的非起始秘寶。 */
  function exchangeBlockReason(choice: EventChoice): string {
    if (!choice.outcome.some((fx) => fx.kind === 'loseRelic')) return '';
    const participants = coop ? run.players.filter((p) => !p.down) : [me(run, seat)];
    const missing = participants.find((p) => !p.relics.some((id) => relicById[id]?.pool !== '起始'));
    return !missing ? '' : missing === me(run, seat) ? '沒有可交換的秘寶' : '同伴沒有可交換的秘寶';
  }

  /**
   * 事件的每一條路都收在這個劇場版面：插圖立在中上、結果一句話寫在對白框、按鈕排在框裡
   * （挑牌那條路先不放按鈕，傳 ''）。
   */
  function panel(resultText: string, note: string | null, button: Node | string,
    gains: readonly RunGain[] = [], art?: string, show: Showcase = []): void {
    clearKeepBg(root);
    renderHud(app, root);
    // 結果畫面預設沿用同一張插圖：選完之後畫面整個換掉的話，前後接不起來。
    // 但選項自己有 `resultArt` 時就換成那張——像貓薄荷「採一把」那種，
    // 有專屬的結果圖才看得出「我剛剛真的做了那件事」。
    /**
     * **插圖當底、戰利品疊在上面**（2026-09-11）。
     *
     * 原本是三選一：有牌就放牌、有秘寶忍具就放圖示、都沒有才放插圖。
     * 那表示**凡是有收穫的選項都看不到結果圖**——而「有收穫」正是最值得畫一張圖的時候。
     * 實際數過（2026-09-11 稽核重數）：60 個配了結果圖的選項裡，24 個沒有戰利品、
     * 舊寫法看得到；另外 36 個有收穫的（13 個只給忍具秘寶、21 個只給牌、2 個兩者都有）
     * 在舊寫法下永遠看不到自己的結果圖。
     * 最有力的證據是這段註解自己舉的例子：貓薄荷「採一把」拿兩支忍具，
     * 所以那張 `catnip_field_take` 從上線到現在**從來沒被玩家看見過**（稽核 2026-09-11 高-1）。
     *
     * 改成疊層：插圖鋪底，牌與圖示浮在它前面。兩者都看得到，版面高度不變
     *（`.event-art-stack` 是 `position: relative`，疊上去的那層絕對定位、不佔空間）。
     * 插圖沒生好時退回原本的行為，不會開天窗。
     */
    // 有結果圖的：還沒解好先用主圖頂著（見 `eventArt`）
    const illo = ev ? eventArt(art ?? ev.id, art ? resultArtHero : artHero, art ? { run, id: ev.id, hero: artHero } : undefined) : '';
    const loot = show.length ? showcaseNode(show) : gains.length ? gainsNode(gains, me(run, seat).relics) : '';
    const artNode = loot && illo
      ? el('div', { class: 'event-art-stack' }, illo, el('div', { class: 'event-art-loot' }, loot))
      : (loot || illo);
    // 賭局要有結果的感覺（使用者 2026-09-03：「碗掀開了應該要有結果，直接小魚乾加減了，沒感受到贏還是輸」）：
    // 引擎記的「中了！／沒中……」不只寫成一行小字，還蓋一個大戳章＋音效
    const won = note?.includes('中了！') ?? false;
    const lost = note?.includes('沒中') ?? false;
    const stamp = won || lost ? el('div', { class: `gamble-stamp ${won ? 'win' : 'lose'}` }, won ? '賭贏了！' : '賭輸了……') : '';
    if (won) play('victory'); else if (lost) play('defeat');
    root.append(markRare(sceneView({
      art: artNode,
      ...(portrait ? { portrait } : {}),
      ...(portrait2 ? { portrait2 } : {}),
      speaker: title,
      text: resultText,
      extra: [stamp, gainRows(gains, me(run, seat).relics), note ? el('p', { class: 'event-note' }, note) : ''],
      actions: button ? [button] : [],
    })));
  }
  /** 稀有事件：名牌旁掛金色小牌「難得一見」（2026-09-23 第三批，design3 5-1）。其他事件原樣回 */
  function markRare(scene: HTMLElement): HTMLElement {
    if (evd.rare) scene.querySelector('.dialogue-speaker')?.append(el('span', { class: 'rare-badge' }, '難得一見'));
    return scene;
  }
  /**
   * 選好選項、要畫結果之前，先等那張結果圖到（2026-09-23 內容擴充 0-2 補，主控裁定）。
   *
   * 進畫面時已經在背景抓了這個事件所有選項的結果圖（下面的 `preloadEventResults`），平常這裡不用等；
   * 慢網路下還沒到的話，照走進事件格那一套（`app.ts` 的 `enterEvent`）：舞台先點不動、最多等 6 秒，
   * 超過 0.4 秒在對白框補一行「正在準備……」，好了才跑 `go`——不然結果畫面的插圖那一塊會先空著。
   *
   * **等的只有「畫」，效果當場就套**（2026-09-23 推前審查 高-1）：`go` 是把結果畫出來（`paint` 記著的那一筆），
   * 不是 `take()`。原本連線時連 `take()` 都延到圖到了才跑——圖先到的那台先套效果，同伴在「要不要換忍具」視窗
   * 送出的 swap 到了慢的那台，那一格還不存在（`replacePotion` 拒絕）：加入方整局停掉、主機悄悄丟掉。
   * 現在兩台都在票結算那一拍 `take()`、同一拍套效果，只有畫面各自等自己的圖。
   */
  let resolving = false;   // 等結果圖的時候，鍵盤按選項也不再收（舞台的點不動只擋得住滑鼠）
  /**
   * 結果畫面「要畫的那一筆」。`undefined`＝沒在等圖，直接畫；在等的時候只記最後一筆（同伴挑完那一次重畫會蓋掉前一筆），
   * 圖到了畫那一筆。狀態（牌組、忍具、小魚乾）早就套好了，畫面只是晚一點出來。
   */
  let heldPaint: (() => void) | null | undefined;
  const paint = (fn: () => void): void => { if (heldPaint !== undefined) heldPaint = fn; else fn(); };
  /** 這個選項有結果圖：先把畫面扣住，等圖到了（或這一局丟了就不畫）再放出去 */
  function holdPaintForResultArt(index: number): void {
    if (!ev?.choices[index]?.resultArt) return;
    heldPaint = null;
    whenResultArtReady(index, () => { const fn = heldPaint; heldPaint = undefined; fn?.(); });
  }
  function whenResultArtReady(index: number, go: () => void): void {
    if (!ev?.choices[index]?.resultArt) { go(); return; }
    resolving = true;
    app.stage.classList.add('fight-pending');
    const slow = window.setTimeout(() => {
      root.querySelector('.scene-box')?.append(el('p', { class: 'event-note event-wait' }, '正在準備……'));
    }, 400);
    void warmResultArt(run, ev.id, index, resultArtHero).then(() => {
      window.clearTimeout(slow);
      resolving = false;
      app.stage.classList.remove('fight-pending');
      root.querySelector('.event-wait')?.remove();
      if (app.run !== run) return;
      go();
    });
  }
  let resultArt: string | undefined;   // 這一次選的選項有沒有專屬結果圖
  /** 這一次的結果文字照誰的版本寫：條件選項連線時是同伴讓它出現的，寫同伴做的事（`resultSeat`）。`take()` 設，沒設＝本機這一位 */
  let resultHero: Hero | undefined;
  /** 這一次的結果圖照誰挑（`resultArtHeroFor`，跟 `resultHero` 同一個判準）。`take()` 設 */
  let resultArtHero: string | undefined;
  let pickLabel = '';                  // 這一次選的選項原文：挑牌視窗能不能不選照它寫的「至多」走（見 `eventPickRule`）
  /** 學完招接著挑牌升級（`then`）：本機這一位學完（或都不要）之後，照這一支開挑牌那一步。`take()` 設 */
  let afterLearn: ((note: string, learned: CardInstance[]) => void) | null = null;
  const finish = (resultText: string, note: string | null = null, gains: readonly RunGain[] = [], show: Showcase = []): void => {
    lastFinish = [resultText, note, gains, show];
    panel(resultText, note,
      waitingPicks.waiting
        ? el('button', { class: 'btn', disabled: 'disabled' }, '等同伴挑完…')
        : el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續'),
      gains, resultArt, show);
    // 忍具帶滿收不下的（gains 裡標 missed）：結果畫好之後一支一支問要不要換掉舊的。
    // **問過的不再問**（`asked`）：`finish` 會被叫不只一次（連線結算、學牌結果），不記就每次都再彈一次
    const missed = gains.filter((g) => g.kind === '忍具' && g.missed && !g.asked);
    const askNext = (i: number): void => {
      const g = missed[i];
      if (!g) return;
      if (!root.querySelector('.reward-item.missed')) return;   // 玩家已經離開這個畫面（2026-09-02 稽核 M-1）
      showPotionSwap(run, g.id, (idx) => {
        g.asked = idx >= 0 ? 'swapped' : 'declined';
        const row = root.querySelector(`.reward-item.missed[data-gain="${g.id}"]`);
        const d = potionById[g.id];
        if (idx >= 0) {
          swapPotion(app, run, seat, idx, g.id);   // 連線時要送出去，只改本機會分岔（稽核 高-3）
          play('relic'); root.querySelector('.hud')?.remove(); renderHud(app, root);   // 先拆舊的，不然疊兩條
          if (row && d) { row.classList.remove('missed'); row.querySelector('b')!.textContent = `換成了「${d.name}」`; }
        } else if (row && d) {
          row.classList.remove('missed'); row.querySelector('b')!.textContent = `沒有換，放棄了「${d.name}」`;
        }
        askNext(i + 1);
      }, missed.length > 1 ? { progress: `第 ${i + 1}／${missed.length} 支`, seat, apply: false } : { seat, apply: false });
    };
    // 這一次淨化掉的（2026-09-25）：先秀淨化結果視窗，關掉之後才接著問忍具要不要換，兩個視窗不疊在一起
    const purified = purifiedBetween(relicsAtStart, me(run, seat).relics).filter((id) => !purifyShown.has(id));
    for (const id of purified) purifyShown.add(id);
    if (purified.length) showPurifyReveal(purified, () => { if (missed.length) askNext(0); });
    else if (missed.length) window.setTimeout(() => askNext(0), 400);
  };

  /**
   * 第 `who` 位學到那一張。**一定要用他那一份清單去找**——效果一位跑一次、每次重抽，
   * 兩個座位看到的三張牌本來就不一樣，拿自己這一份去找會找不到、他那張就靜靜落空。
   */
  function takeLearn(who: number, cardId: string, outcomes: RunEffectOutcome[],
    /**
     * 演出用的結果文案，**`null` ＝只套用不演**（連線時同伴挑的那張走這條）。
     *
     * 這個參數 2026-09-12 從「可省略」改成**必填**：原本單人那條漏傳，
     * 於是走進「只套用不演」的分支——牌進了牌組、畫面卻永遠不動，
     * 玩家看起來像當掉，實際上可以一直點一直加牌。改成必填之後，
     * 漏傳會在型別檢查就被擋下來，不會再靜靜跑錯分支。
     */
    resultText: string | null, gains: readonly RunGain[] = []): void {
    const o = outcomes[who];
    const list = o && 'chooseCard' in o ? o.chooseCard : [];
    const upId = o && 'chooseCard' in o ? o.upgradedCard : undefined;
    const def = list.find((d) => d.id === cardId);
    if (!def) {
      // 那一位的清單裡找不到他挑的那張＝兩台算出來的清單不一樣，已經分岔（同一個座位的清單兩台本該一樣；
      // 不同座位的清單本來就不同，見 take）。別人的只記錯誤、下一格對帳會抓到；
      // **自己的絕不能靜靜 return**——那會讓畫面停在「等同伴挑完」永遠不動（使用者 2026-09-15 實測）
      console.error(`事件學招：座位 ${who} 挑的「${cardId}」不在那個座位的清單裡`);
      if (resultText !== null) finish(resultText, '這一招沒學到（兩邊的清單對不上）', gains);
      return;
    }
    const up = def.id === upId;
    const got = addCard(run, def.id, up, who);
    const chained = passLearn(who, outcomes);   // 學完還要挑牌升級的：待辦換成那一步（兩台都換，挑牌那一輪才判得出升級或移除）
    if (resultText === null) return;   // 別人的：只套用、不演（見上面對這個參數的說明）
    // 牌名要過 `cardNameFor`（2026-09-12 使用者實測抓到）：牌面畫的是「絕學·絆索」，
    // 這一行卻寫「學會了「絕學·擒拿手」」——同一張牌兩個名字。看的是**學到的那一位**
    const note = `學會了「${cardNameFor(def, me(run, who).hero)}${up ? '＋' : ''}」`;
    if (chained && afterLearn) { afterLearn(note, [got]); return; }
    finish(resultText, note, gains, [{ kind: 'learn', card: got }]);
  }

  /**
   * 「三選一學招」之後**接著**要挑牌升級（`then`，2026-09-23 內容擴充第二批：影子的真面目③、師父的影子【師門】）。
   * 把這一位的待辦換成挑牌那一步，回傳有沒有接下去。學了或「都不要」都要換——「都不要」也照樣可以挑牌升級。
   */
  function passLearn(who: number, outcomes: RunEffectOutcome[]): boolean {
    const o = outcomes[who];
    const then = o && 'chooseCard' in o ? o.then : undefined;
    if (then) outcomes[who] = then;
    return !!then;
  }

  /** 選一招（大俠傳功那種）：牌排在中上方（插圖的位置），挑完就收尾，也可以都不要 */
  function chooseCard(resultText: string, defs: CardDef[], gains: readonly RunGain[] = [], upgradedCard?: string,
    outcomes: RunEffectOutcome[] = [], waiting = false): void {
    clearKeepBg(root);
    renderHud(app, root);
    /*
     * **兩個人時要等兩邊都挑完才動手**（跟挑牌升級同一條理由）：學到的牌會進自己的牌組，
     * 而牌組是兩台機器都在模擬的，對面不知道我學了哪一張就會分岔。
     * `''` ＝一招都不要（空字串比 null 好傳，也不會跟任何牌的編號撞）。
     */
    /*
     * **這裡只負責「畫出來、把我挑的送出去」，套用是 `take()` 掛的那一支在做。**
     *
     * 為什麼不能掛在這裡（稽核第二輪 高-3）：倒下的人、或牌組裡沒有可以挑的牌的人，
     * **根本不會走到這個函式**——於是他那台從來沒有註冊過處理函式，
     * 同伴挑的那張牌在他那台永遠不會進牌組，兩邊的牌組與 `nextUid` 當場差一個。
     * 掛在 `take()` 裡就沒有這個問題：那一支兩台都一定會跑到。
     */
    const learn = (cardId: string): void => {
      if (!coop) {
        /*
         * **單人也要把 `resultText` 傳進去**（2026-09-12 使用者實測抓到）。
         *
         * 原本寫 `takeLearn(seat, cardId, outcomes)`——少了第四個參數。`takeLearn` 裡有一行
         * 「`resultText === undefined` 就 return」，那是給連線用的（套用同伴挑的牌但不演出），
         * 單人卻也走進去了。後果是**牌真的進了牌組、畫面卻永遠不動**：
         * 玩家看起來像當掉，實際上可以一直點一直加牌，等於無限複製。
         * 空字串（都不要）更慘——`find` 找不到就 return，連牌都沒加、畫面也不動，完全卡死。
         *
         * 連線那條走 `coop.onPick` 的回呼，那裡本來就有傳 `c.result` 與處理空字串，所以沒事。
         */
        if (cardId === '') {
          // 都不要：學完還要挑牌升級的（`then`）照樣接下去
          if (passLearn(seat, outcomes) && afterLearn) { afterLearn('一招都沒挑', []); return; }
          finish(resultText, '一招都沒挑', gains);
          return;
        }
        takeLearn(seat, cardId, outcomes, resultText, gains);
        return;
      }
      /*
       * **先畫「挑好了，等同伴挑完」，再投票**（理由同 `settleCards`）。
       *
       * 原本反過來：先 `pick`、再看票箱決定要不要畫等待畫面。我如果是**後投的那一位**，`pick` 會當場把票湊齊、
       * 處理函式立刻結算並畫出結果、把票箱清空——接著回到這裡一看票箱是空的，就把結果蓋回「選一招帶走」，
       * 玩家再點一次，那一票永遠等不到對方，畫面停在「等同伴挑完」（使用者 2026-09-15 跟朋友實測：
       * 開房的人先點所以沒事，加入的人每次都卡住）。
       * `waiting: true`＝畫成已挑好，因為這時候票箱裡還沒有我的票。
       */
      chooseCard(resultText, defs, gains, upgradedCard, outcomes, true);
      // 沒送出去（連線已經停了）就畫回可以點的樣子，別停在等待畫面（審查 低-1）；紅色橫幅會說明為什麼
      if (!coop.pick('evlearn', cardId)) chooseCard(resultText, defs, gains, upgradedCard, outcomes);
    };

    const grid = el('div', { class: 'reward-cards' });
    const mine = coop ? coop.picks('evlearn', run.players.length)[seat] : null;
    // **空字串是「我選了都不要」，不是「還沒選」**——用 falsy 判斷會讓文案繼續寫著「選一招帶走」，
    // 但牌其實已經點不動了（稽核第三輪 低-1）
    const picked = waiting || (mine !== null && mine !== undefined);
    for (const c of defs) {
      const up = c.id === upgradedCard;   // 開出升級版的那張：照＋版畫、學到就是升級牌（使用者 2026-09-04）
      grid.append(cardNode(up ? { uid: -1, cardId: c.id, upgraded: true } : c,
        picked ? { disabled: true } : { onClick: () => learn(c.id) }));
    }
    root.append(markRare(sceneView({
      art: grid,
      speaker: title,
      text: picked ? `${resultText}　挑好了，等同伴挑完。` : `${resultText}　選一張牌帶走。`,
      actions: [picked
        ? el('button', { class: 'btn', disabled: 'disabled' }, '等同伴挑完…')
        : el('button', { class: 'btn', onclick: () => learn('') }, '都不要')],
    })));
  }

  /**
   * 把 `applyRunEffects` 回來的那一個待處理結果收乾淨。回 null 就是效果都跑完了，
   * 直接顯示結果；要玩家挑牌就開挑牌疊層；是一場架就交給戰鬥畫面。
   *
   * `notes` 是引擎一路記下來的「實際發生了什麼」（賭飯糰中了哪一邊、忍具收不收得下、
   * 隨機撿到哪一張牌）。挑牌那條路自己還會再補一句，所以用 `noteLine` 接起來一起顯示。
   */
  /**
   * 事件文案換成這一位的（敘述裡的名字、引號裡句尾的「喵」）。球球那邊一個字不動。
   * 連線時再把「{同伴}」「{稱}」「{對方}」換成同伴的名字與稱呼（連線限定事件，2026-09-23 內容擴充第二批）；
   * 單人的文案裡沒有這幾個記號，換了也不會動到。
   * `hero` 只有結果文字會傳（`resultHero`：同伴讓條件選項出現時，照同伴那一位的版本寫他做的事）。
   */
  const evText = (t: string, hero = me(run, seat).hero): string => {
    if (qmark) return t;   // 伏擊那一篇本來就是這一位的版本（見上面 `qmark`）
    const mine = eventTextFor(hero, t);
    return partner ? coopFill(mine, me(run, seat).hero, partner.hero) : mine;
  };
  /**
   * 選項按鈕上的字（2026-09-23 b2fin，主控裁定改口）：條件選項連線時是**同伴**讓它出現的（`choiceGate` 的 `by`），
   * 照實際達成的人寫（`partnerCondLabel`：「讓她拿菲菲的毒試新解藥」，不是「你的毒」），其餘照原本。
   * 擲骰結果那一句也走這支：兩處講的是同一顆按鈕，字要一樣。
   */
  const labelText = (i: number): string => {
    const c = evd.choices[i];
    const by = c?.requires ? choiceGate(run, c, seat).by : undefined;
    const theirs = by !== undefined && by !== seat && partner ? partnerCondLabel(evd.id, me(run, seat).hero, partner.hero) : undefined;
    return theirs ?? evText(labelRaw(i));
  };

  function settle(outcome: RunEffectOutcome, rawResult: string, notes: string[], gains: RunGain[], added: CardInstance[] = [], outcomes: RunEffectOutcome[] = []): void {
    // 換角色的文案在**入口**過一次，比每個呼叫點各包一次不容易漏（這支有六個呼叫點）。
    // 稀有事件的抽獎（籤筒、睡著的大魔物）接一句「抽到之後的那一句」：抽到哪一格從引擎寫的提示裡找（2026-09-23 第三批）
    const resultText = evText(rawResult, resultHero) + lotteryAfter(evd.id, notes, me(run, seat).hero);
    const noteLine = (extra?: string): string | null => {
      const all = extra ? [...notes, extra] : notes;
      return all.length ? all.join('；') : null;
    };
    // 效果直接塞進牌組的牌（撿到、學會、被塞壞毛病）也要秀
    const gotShow: Showcase = added.map((c) => ({ kind: cardById[c.cardId]?.pool === '壞毛病' ? 'curse' : 'learn', card: c }));
    if (!outcome) { finish(resultText, noteLine(), gains, gotShow); return; }
    if ('needs' in outcome) {
      const up = outcome.needs === 'upgradeCard';
      const filter = up ? (c: CardInstance) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病' : () => true;
      // 一張都不合就直接跳過（疊層本身也擋得住鎖死，但沒得挑還開一個空視窗只是煩人）
      const usable = me(run, seat).deck.filter(filter).length;
      if (usable === 0) {
        /*
         * **沒得挑也要投一張空票**（稽核第二輪 高-4）：不投的話同伴那邊
         * `allVoted` 永遠湊不齊，他的疊層又是不能取消的，兩個人一起卡死只能重開。
         */
        const why = noteLine(up ? '沒有可以升級的牌' : '沒有牌可以移除');
        if (coop) {
          /*
           * **連線時這裡只畫等待、不跑 `finish`**：結算那一支之後還會再跑一次 `finish`，
           * 而 `finish` 會排「忍具帶滿要不要換」的問話——跑兩次就問兩次（稽核第三輪的邊角）。
           */
          cardPickInfo = { up, resultText, gains, gotShow, noteLine, none: up ? '沒有可以升級的牌' : '沒有牌可以移除' };
          panel(resultText, why, '', gains, resultArt);
          coop.pick('evcard', '');
          return;
        }
        finish(resultText, why, gains);
        return;
      }
      // 要挑的張數可能比牌組裡合格的還多（例如只剩一張沒升級過的牌卻要升兩張），
      // 那就以實際挑得到的為準，不然確認鈕永遠按不下去、玩家被鎖在疊層裡
      const want = Math.min(outcome.n, usable);
      const verb = up ? '升級' : '移除';
      /**
       * 把挑好的牌一次結算完，說明文字寫成「「A」「B」升級了」。
       *
       * **兩個人時要等兩邊都挑完才動手**：挑的是自己的牌，但牌組是兩台機器都在模擬的東西，
       * 對面不知道我丟了哪一張，下一場我抽到的牌就對不上、當場分岔。
       * 走「大家各選一個」那條通道（`evcard`），值是牌號用逗號串起來（空字串＝一張都沒挑）。
       */
      const applyPicks = (who: number, uids: readonly number[]): { names: string[]; show: Showcase } => {
        const names: string[] = [];
        const show: Showcase = [];
        for (const uid of uids) {
          const c = me(run, who).deck.find((x) => x.uid === uid);
          if (!c) continue;
          names.push(cardName(c, me(run, who).hero));
          const before = { ...c };   // 丟掉的牌要用「丟掉前」的樣子秀
          if (up) upgradeCard(run, uid, who); else removeCard(run, uid, who);
          if (who === seat) show.push(up ? { kind: 'upgrade', card: c } : { kind: 'remove', card: before });
        }
        return { names, show };
      };
      const finishPicks = (names: string[], show: Showcase): void => {
        if (names.length) play(up ? 'upgrade' : 'dodge');
        // 寫「至多」的可以不選（見 `eventPickRule`）：一張都沒挑也要講，不然結果那段像是真的練了
        const note = names.length
          ? `「${names.join('」「')}」${up ? '升級了' : '被丟掉了'}`
          : '這次一張都沒挑';
        finish(resultText, noteLine(note), gains, [...gotShow, ...show]);
      };
      /*
       * **只負責投票**，套用是 `take()` 掛的那一支在做（理由同 `learn`，見稽核第二輪 高-3）。
       */
      const settleCards = (uids: readonly number[]): void => {
        if (!coop) { const r = applyPicks(seat, uids); finishPicks(r.names, r.show); return; }
        cardPickInfo = { up, resultText, gains, gotShow, noteLine, none: '這次一張都沒挑' };
        /*
         * **等待的畫面要先畫、再投票**：我如果是後投的那一位，`pick` 會當場把票湊齊、
         * 處理函式立刻把結果畫出來——這時候再畫「等同伴挑完」就會把結果蓋掉。
         */
        panel(`${resultText}　挑好了，等同伴挑完。`, null, '', gains, resultArt);
        coop.pick('evcard', uids.join(','));
      };
      // 先把結果版面畫出來（含更新過的狀態列）再開疊層，別讓那一排舊選項留在疊層後面：
      // 效果已經跑掉了，選項卻還在，看起來像還能再選一次。按鈕等挑完牌才由 finish 補上。
      panel(resultText, null, '', gains, resultArt);
      // 選項寫「至多」就可以不選（多選時挑一張也算）；寫死張數的照舊要挑滿（2026-09-22 畫面盤點 問題 11）
      const rule = eventPickRule(pickLabel, want, verb);
      const openPicker = (): void => showDeckPicker({
        title: rule.title,
        previewUpgrade: up,   // 升級才需要看「變成什麼樣」；移除不用
        cards: me(run, seat).deck, pickable: true, cancellable: rule.cancellable, filter,
        pickCount: want, minPick: rule.minPick,
        onPick: (uid) => {
          if (uid === null) { settleCards([]); return; }
          const c = me(run, seat).deck.find((x) => x.uid === uid);
          // 升級一張時跟貓窩磨爪一樣先問「就磨這張／再看看」，按「再看看」回牌堆重挑
          //（使用者 2026-09-06：事件裡選好牌左鍵就直接升級了，其他地方都有這一步）
          if (up && c) { showUpgradeConfirm(c, (ok) => { if (ok) settleCards([uid]); else openPicker(); }); return; }
          settleCards([uid]);
        },
        onPickMany: settleCards,
      });
      openPicker();
      return;
    }
    if ('chooseCard' in outcome) { chooseCard(resultText, outcome.chooseCard, gains, outcome.upgradedCard, outcomes); return; }
    /*
     * 身上兩件以上沾了魔氣、只淨化一件（2026-09-23 第三批，design3 6-2）：跳一個小視窗挑。
     * 單人挑完當場淨化；連線照挑牌那一套投票（`evpurify`），**套用是 `take()` 掛的那一支在做**（兩台都跑得到，理由同 `settleCards`）。
     */
    if ('purify' in outcome) {
      panel(resultText, noteLine(), '', gains, resultArt, gotShow);
      const ids = outcome.purify;
      if (!coop) {
        showPurifyPick(ids, (id) => {
          const got: string[] = [];
          if (id) purifyRelic(run, id, seat, got);
          if (got.length) play('relic');
          finish(resultText, noteLine(got.join('；') || undefined), gains, gotShow);
        });
        return;
      }
      purifyInfo = { resultText, gains, gotShow, noteLine };
      showPurifyPick(ids, (id) => {
        panel(`${resultText}　挑好了，等同伴挑完。`, noteLine(), '', gains, resultArt);   // 先畫等待再投票（我是後投的那一位時，投下去當場就結算、畫出結果）
        coop.pick('evpurify', id ?? '');
      });
      return;
    }
    // 打一場：戰鬥畫面會把獎金一路帶到戰後結算，這裡不存檔（節點還沒結束）
    const f = outcome.fight;
    panel(resultText, noteLine(), el('button', { class: 'btn primary', onclick: () => {
      if (app.run) app.run.pendingAfterFight = f.afterWin;   // 秘寶等獎勵打贏才發（使用者 2026-09-04）
      app.startFight(f.encounterId, false, f.bonusFish, f.bonusUpgrades ?? 0);
    } }, '開打'), gains, resultArt);
  }

  /**
   * 真的去做這個選項。單機是按下去就跑；連線是**兩個人都投完票之後**才跑，
   * 而且兩台機器各跑一次（引擎是決定性的，跑出來一樣）。
   */
  function take(index: number): void {
    const c = ev?.choices[index];
    if (!c) return;
    const exchangeReason = exchangeBlockReason(c);
    if (exchangeReason) { finish('這次沒有交換秘寶。', exchangeReason); return; }
    // 結果寫誰做的事、結果圖照誰挑：**先問、再套效果**（鈴鐺那條套完就交出去了，問不出是誰的，見 `resultSeat`）。
    // 走 `heroOf`：球球那一位的 `hero` 欄可能不填，直接傳 undefined 會被當成「照本機這一位」
    resultHero = heroOf(me(run, resultSeat(run, c, seat)));
    resultArtHero = resultArtHeroFor(index);
    const cost = c.costFish ?? 0;
    resultArt = c.resultArt;
    pickLabel = labelRaw(index);
    const notes: string[] = [];
    const gains: RunGain[] = [];
    const had = new Set(me(run, seat).deck.map((x) => x.uid));
    /*
     * 小魚乾由畫面扣（引擎的 `applyRunEffects` 不管 `costFish`）——
     * 連線時**兩個人各付各的**：這件事是兩個人一起做的，好處也兩個人一起拿。
     * 付不起的人扣到 0 為止（`Math.max`），不會變成負的。
     */
    const seats = coop ? run.players.map((_, i) => i).filter((i) => !run.players[i]?.down) : [seat];
    for (const i of seats) me(run, i).fish = Math.max(0, me(run, i).fish - cost);
    // 效果一位一位跑，順序固定（座位由小到大），兩台機器抽出來的東西才一樣
    /*
     * **每個座位的結果都要留著**（稽核 2026-09-11 高-1）。
     *
     * 「三選一學招」那一支每跑一次就重抽一份清單（會推進整局的亂數），
     * 所以座位 0 與座位 1 看到的三張牌**本來就不一樣**。
     * 只留自己那一份的話，結算時拿本機的清單去找對方挑的那張會找不到，
     * 他那張就靜靜落空——兩邊的牌組與 `nextUid` 當場差一個，下一格對帳就炸。
     * 5F 的「師父留下的秘笈」是固定事件，每一局必遇，所以這條一定會踩到。
     */
    const outcomes: RunEffectOutcome[] = [];
    for (const i of seats) {
      // 座位不對稱的選項（連線限定事件）每一位跑自己那一串：一人拿、一人付（`EventChoice.bySeat`）
      outcomes[i] = applyRunEffects(run, choiceEffectsFor(c, i), i === seat ? notes : undefined, i === seat ? gains : undefined, i);
    }
    /*
     * **挑牌的處理函式掛在這裡，不掛在挑牌的畫面裡**（稽核第二輪 高-3）。
     *
     * 這一支兩台都一定會跑到；挑牌的畫面不是——倒下的人、或牌組裡沒有可挑的牌的人
     * 根本走不到那裡，他那台就永遠沒有人在聽，同伴挑的牌在他那台不會進牌組。
     */
    const added = me(run, seat).deck.filter((x) => !had.has(x.uid));
    /*
     * **倒下的人沒有自己的結果，但同伴要打的那一場他也得進去**（2026-09-14 夜間稽核 高-11）。
     *
     * 效果只替站著的人跑，所以倒下那台的 `outcomes[seat]` 是空的，原本就走「繼續」回地圖；
     * 站著那台走「開打」進戰鬥——兩台一個在地圖、一個在戰鬥，下一個動作就斷線。
     * 戰鬥本來就是兩個人一起的（倒下的人在場上觀戰，規則四），所以照站著那位的那一場進去。
     */
    const fightOf = coop && !outcomes[seat] ? outcomes.find((o) => !!o && 'fight' in o) ?? null : null;
    /**
     * 把結果畫面重畫一次（自己沒得挑的那一台，等同伴挑完之後要把「繼續」放出來）。
     * 結果圖還沒到就先記著，圖到了才畫（`paint`，推前審查 高-1：效果上面已經當場套完了）
     */
    // 結果文字照本機這一位的視角挑（連線限定事件的「我拿／我付」，見 `seatTextIndex`）
    const raw = resultRaw(index);
    const showResult = (): void => { paint(() => settle(outcomes[seat] ?? fightOf, raw, notes, gains, added, outcomes)); };
    // 學完招還要挑牌升級（`then`）：學完那一刻把這一位的待辦換成挑牌那一步，照同一套畫面接下去
    afterLearn = (note, learned) => settle(outcomes[seat] ?? null, raw, [...notes, note], gains, [...added, ...learned], outcomes);
    holdPaintForResultArt(index);
    const alive = run.players.map((p) => !p.down);
    /** 這一位本來有沒有「三選一學招」要挑（座位不對稱的選項可能只有一邊有；見下面的空票） */
    const hadLearn = outcomes.map((o) => !!o && 'chooseCard' in o);
    if (coop) {
      // 只要**有人**要挑牌（或挑一件淨化，2026-09-23 第三批），這個畫面就先鎖住「繼續」；要等的每一種都湊齊才放（見 `waitingPicks`）
      waitingPicks.start(outcomes);
      lastFinish = null;
      /**
       * 別種票湊齊了、我這台沒開過那一種的視窗：自己還有沒挑完的（挑選窗開著）就不動畫面；沒有的話照最近一次結果重畫、把按鈕換掉。
       * 原本直接 `showResult()`：一人丟牌、一人挑淨化時，丟牌那台會再開出第二個丟牌視窗疊在上面（推前審查五 高-4）。
       * 自己那一種已經投了、還沒結算（`lastFinish` 還沒有）：畫面停在「挑好了，等同伴挑完」，等自己那一種結算時 `finish` 會畫；
       * 只有自己這一輪本來就沒得挑的，才用 `showResult()` 畫一次結果（`settle` 走不到任何挑選窗）
       */
      const refresh = (): void => {
        if (waitingPicks.ownPending(outcomes[seat], (k) => coop.picks(k, run.players.length)[seat] != null)) return;
        if (lastFinish) finish(...lastFinish);
        else if (!pickKindsOf(outcomes[seat]).length) showResult();
      };
      coop.onPick((kind) => {
        if (kind === 'evpurify') {
          const all = onlyStanding(coop.picks('evpurify', run.players.length), alive);
          if (!allVoted(all, alive)) return;
          coop.clearPicks('evpurify');
          waitingPicks.settle('evpurify');
          // 照座位順序淨化（兩台一樣）；「要不要淨化、候選是哪幾件」看那一位自己的 `outcome`，不看本機有沒有開過視窗
          const mine: string[] = [];
          all.forEach((v, i) => {
            const oi = outcomes[i];
            if (!v || !(oi && 'purify' in oi) || !oi.purify.includes(v)) return;
            purifyRelic(run, v, i, i === seat ? mine : undefined);
          });
          const info = purifyInfo;
          if (!info) { refresh(); return; }   // 我這台沒開過視窗（沒得挑、倒下、挑的是別種）：重畫一次把「繼續」放出來
          if (mine.length) play('relic');
          finish(info.resultText, info.noteLine(mine.join('；') || undefined), info.gains, info.gotShow);
          return;
        }
        if (kind === 'evlearn') {
          const all = onlyStanding(coop.picks('evlearn', run.players.length), alive);
          if (!allVoted(all, alive)) return;
          coop.clearPicks('evlearn');
          // 學完招還要接著挑牌升級的（`then`）：「繼續」要等下一輪（`evcard`）都挑完才放出來——`PickWaits.start` 一開始就把 evcard 也記進去了
          waitingPicks.settle('evlearn');
          // 照座位順序套，兩台算出來的牌組才一樣；只有自己那張要演出來
          // 文案要過 `evText`（換角色的名字與句尾的喵）——單人那條在 `settle` 進門就過了，
          // 連線這條直接拿原文，玩菲菲時會留著「球球」跟「喵」（稽核 2026-09-12 低-1）
          const mineThen = all[seat] === '' && passLearn(seat, outcomes);
          all.forEach((v, i) => {
            if (v) takeLearn(i, v, outcomes, i === seat ? evText(raw, resultHero) : null, gains);
            else if (v === '' && i !== seat) passLearn(i, outcomes);   // 同伴都不要也照樣接著挑牌升級（兩台都換，才判得出升級或移除）
          });
          if (mineThen && afterLearn) afterLearn('一招都沒挑', []);
          else if (all[seat] === '' && hadLearn[seat]) finish(evText(raw, resultHero), '一招都沒挑', gains);
          // 我這台根本沒得挑（倒下的人、或座位不對稱時自己那一串沒有學招、投的是空票）：重畫一次把「繼續」放出來
          else if (all[seat] === null || all[seat] === '') refresh();
          return;
        }
        if (kind !== 'evcard') return;
        const all = onlyStanding(coop.picks('evcard', run.players.length), alive);
        if (!allVoted(all, alive)) return;
        coop.clearPicks('evcard');
        waitingPicks.settle('evcard');
        const info = cardPickInfo;
        const mineOut = { names: [] as string[], show: [] as Showcase };
        all.forEach((v, i) => {
          if (v === null) return;
          /*
           * **「這是升級還是移除」要從那一位自己的 `outcome` 拿，不可以從 `cardPickInfo` 拿**
           *（稽核第三輪自己抓到的）。`cardPickInfo` 只有**真的開過挑牌疊層的那一台**才有；
           * 沒開過的那一台（倒下的人、沒得挑的人）讀到 undefined，於是把該升級的牌
           * 通通**丟掉**——實測倒下的那一台牌組直接從 10 張變 8 張，兩台當場不一樣。
           * `outcomes[i]` 是引擎算出來的，兩台一模一樣。
           */
          const oi = outcomes[i];
          // 這一位這次根本沒有要挑牌（座位不對稱的選項，他投的是空票）：什麼都不動。
          // 不擋的話一張不該在的牌號會被當成「移除」（下面的 `upI` 是 false），兩台雖然一樣、牌卻平白少一張
          if (!(oi && 'needs' in oi)) return;
          const upI = oi.needs === 'upgradeCard';
          const list = v ? v.split(',').map(Number) : [];
          const names: string[] = [];
          for (const uid of list) {
            const card = me(run, i).deck.find((x) => x.uid === uid);
            if (!card) continue;
            names.push(cardName(card, me(run, i).hero));
            const before = { ...card };
            if (upI) upgradeCard(run, uid, i); else removeCard(run, uid, i);
            if (i === seat) mineOut.show.push(upI ? { kind: 'upgrade', card } : { kind: 'remove', card: before });
          }
          if (i === seat) mineOut.names = names;
        });
        if (!info) { refresh(); return; }   // 我這台沒開過挑牌疊層：套用完重畫一次，把「繼續」放出來（自己還在挑別種的就不動）
        if (mineOut.names.length) play(info.up ? 'upgrade' : 'dodge');
        const note = mineOut.names.length
          ? `「${mineOut.names.join('」「')}」${info.up ? '升級了' : '被丟掉了'}` : info.none;
        finish(info.resultText, info.noteLine(note), info.gains, [...info.gotShow, ...mineOut.show]);
      });
    }
    showResult();
    /*
     * **座位不對稱的選項：只有一邊要挑牌時，沒得挑的那一邊替自己投一張空票**（2026-09-23 內容擴充第二批，實機驗收抓到）。
     * 兩人一樣的選項兩邊一定同時要挑、同時投；「翹翹板」那種卻是一個人拿秘寶、另一個人挑牌升級——
     * 拿秘寶的那一位沒有挑牌畫面、永遠不投，挑牌的那一位挑完之後票湊不齊，兩台一起卡在「等同伴挑完」。
     * 投在畫好結果之後：票剛好湊齊時處理函式會再畫一次，把「繼續」放出來。倒下的人不投（票本來就不算他）。
     */
    if (coop && alive[seat]) {
      const mine = outcomes[seat];
      if (outcomes.some((o) => !!o && 'needs' in o) && !(mine && 'needs' in mine)) coop.pick('evcard', '');
      if (outcomes.some((o) => !!o && 'chooseCard' in o) && !hadLearn[seat]) coop.pick('evlearn', '');
      // 挑一件淨化也一樣（2026-09-23 第三批）：同伴有兩件要挑、我只有一件（當場淨化了）或沒有，替自己投空票
      if (outcomes.some((o) => !!o && 'purify' in o) && !(mine && 'purify' in mine)) coop.pick('evpurify', '');
    }
  }

  renderHud(app, root);
  const choices: HTMLElement[] = [];
  const votes = coop ? coop.picks('event', run.players.length) : [];
  /*
   * 看得到哪幾個選項（2026-09-23 內容擴充第二批，劇本 design2 新1、新7）：條件沒達成的不顯示；
   * 座位不對稱的「我拿」排第一（座位 1 的人看到的是原本的第二個在上面），投的票照舊是原本的索引。
   */
  const shown = visibleChoices(run, ev, seat);
  const order = choiceOrder(run, ev, seat);
  // 條件選項出現時，事件開頭多接一句條件提示句（故事裡就講出「為什麼多了這條路」）：照讓它出現的那一位挑
  const hints: string[] = [];
  const partnerName = partner ? heroName(partner) : '';
  order.forEach((index) => {
    const c = ev.choices[index]!;
    const cost = c.costFish ?? 0;
    // 選項自己的文案就寫著要付多少（「付 30 小魚乾」「買一顆（20 小魚乾）」），這裡不要再補一次價錢；
    // 付不起才補一句話講清楚為什麼按不動。
    const poor = cost > me(run, seat).fish;
    const exchangeReason = exchangeBlockReason(c);
    // 誰投了這一項：兩個人才知道對方想選什麼（跟地圖上的小記號同一套）
    const who = votes.map((v, i) => (v === String(index) ? (i === seat ? '你' : '同伴') : '')).filter(Boolean);
    const gate = c.requires ? choiceGate(run, c, seat) : null;
    const bySelf = gate?.by === undefined || gate.by === seat;
    if (gate) {
      const hint = condHint(ev.id, me(run, bySelf ? seat : gate.by!).hero);
      if (hint) hints.push(hint);
    }
    const btn = el('button', { class: 'btn' },
      // 條件選項：按鈕最前面一個金底小標籤（連線時是同伴讓它出現的，寫「某某的…」）
      gate && c.requiresLabel ? el('span', { class: 'choice-tag' }, `【${bySelf ? '' : `${partnerName}的`}${c.requiresLabel}】`) : '',
      labelText(index) + (poor ? '（小魚乾不夠）' : '') + (exchangeReason ? `（${exchangeReason}）` : '') + (who.length ? `　← ${who.join('、')}` : ''),
      gate ? el('span', { class: 'choice-why' }, condWhyLine(gate, bySelf ? '你' : partnerName, !!coop)) : '');
    // 倒下的人沒得選（規則四）：不停用的話他按下去那一票會跟站著的那票搶時機，兩台結算出不一樣的結果
    if (poor || exchangeReason || iDown || (coop && votes[seat] !== null && votes[seat] !== undefined)) btn.setAttribute('disabled', 'disabled');
    else btn.addEventListener('click', () => {
      if (resolving) return;   // 正在等上一次點的結果圖（見 `whenResultArtReady`），不收第二次
      if (cost > me(run, seat).fish) return;   // 保險：畫面畫完之後小魚乾又變少的話也不能透支
      if (exchangeBlockReason(c)) { app.show('event', props, { quiet: true }); return; }
      play('click');
      if (coop) { coop.pick('event', String(index)); return; }   // 兩個人都投完才真的做（見 onPick）
      take(index);   // 效果當場套；結果圖還沒到的話只有畫面等（`holdPaintForResultArt`）
    });
    choices.push(btn);
  });
  /**
   * 難度 4 起的共用提示（2026-09-11）。
   *
   * `run.ts` 對事件效果有兩條看不見的修正：扣血 ×1.5（`unlucky`）、賭運氣的成功率 ×0.7。
   * 選項上寫的是難度 1～3 的值，難度 4 以上照著按就會被坑（文案審閱 2026-09-11 列為高優先）。
   *
   * **寫成一行共用提示，不是塞進每個按鈕**：把兩組數字並列寫進標籤會讓最長的那顆變成 73 個字
   *（實測「買一顆吃（花費 20 條…難度 1–3 50%／難度 4–5 35%…）」），而選項是一列一顆撐滿框的，
   * 三個選項的事件會把對白框頂高到蓋住插圖 38 像素。一行提示講完同一件事，佔一行。
   *
   * 只在真的會受影響的事件出現（有扣血或有賭運氣），沒受影響的不要平白嚇人。
   */
  /**
   * 只看最上層就夠，**不用遞迴進 `gamble` 的輸贏兩邊**（稽核 2026-09-11 提過，但那一條是多慮的）：
   * 藏在 `gamble` 裡的扣血確實看不到，可是那個 `gamble` 本身就被 ×0.7 改過、
   * 已經讓提示出現了，所以不會有「該提示卻沒提示」的情形。
   */
  // 看得到的選項才算；座位不對稱的兩邊都算（一人扣血那種也是「會掉血」）
  // 抽獎（籤筒的下籤會掉血，2026-09-23 第三批）也算
  const risky = shown.some((i) => [...ev.choices[i]!.outcome, ...(ev.choices[i]!.bySeat?.flat() ?? [])].some((o) => o.kind === 'damage' || o.kind === 'gamble' || o.kind === 'lottery'));
  const extra = runMods(run).unlucky && risky
    ? [el('p', { class: 'event-note' }, '這個難度下，事件會更兇：掉血多一半，賭運氣的成功機率打七折（例如 50% 只剩 35%）；選項上寫的是一般難度的數字')]
    : [];
  const opening = evText(ev.text) + hints.join('');
  // 劇場版面：插圖立在中上、事件敘述寫在對白框、選項一列一顆排在框裡（事件名當名牌）
  root.append(markRare(sceneView({ art: eventArt(ev.id, artHero), ...(portrait ? { portrait } : {}), ...(portrait2 ? { portrait2 } : {}), speaker: title,
    // 同伴投一票的安靜重畫：對白框、立繪、備註不再彈一次（畫面抖動稽核 2026-09-24 第 4 項，見 `App.redraw`）
    text: iDown ? `${opening}（你倒下了，這次由同伴決定）` : opening, extra, actions: choices, column: true, calm: app.redraw })));
  // 稀有事件開場播一聲秘寶那個音效（design3 5-1）。連線時每投一票會重畫一次，有人投過票就不再響
  if (ev.rare && !votes.some((v) => v !== null)) play('relic');

  if (coop) {
    coop.onPick((kind) => {
      if (kind !== 'event' || chosen >= 0 || !ev) return;
      const alive = run.players.map((p) => !p.down);
      const now = onlyStanding(coop.picks('event', run.players.length), alive);   // 結算前先洗掉倒下的人那幾票：不洗的話結果會跟票到達的順序有關（稽核第二輪 高-5）
      if (!allVoted(now, alive)) { app.show('event', props, { quiet: true }); return; }
      // 無效交換直接顯示未交換的結果；重新投票會讓晚進畫面的同伴把新票當重複票丟掉。
      const blockedVote = now.find((v) => v !== null && ev.choices[Number(v)] && exchangeBlockReason(ev.choices[Number(v)]!));
      if (blockedVote !== undefined) {
        chosen = Number(blockedVote);
        coop.clearPicks('event');
        take(chosen);
        return;
      }
      const pickStr = settleVotes(runRng(run), now);
      if (pickStr === null) return;
      chosen = Number(pickStr);
      // 兩人選得不一樣時是擲骰決定的，講出來骰到哪一個選項（使用者 2026-09-15：「要知道隨機到哪個事件」）
      if (new Set(now.filter((v) => v !== null)).size > 1) {
        notice(`兩人選的不一樣，擲骰選了${now[seat] === pickStr ? '你' : '同伴'}選的「${labelText(chosen)}」`);
      }
      coop.clearPicks('event');
      // 兩台在同一拍結算、同一拍套效果（推前審查 高-1）：不可以等圖才 `take()`，只有畫面等
      take(chosen);
    });
  }

  // 這個事件所有選項的結果圖先在背景抓（插隊、留著），讀完文字點下去時通常已經到了（見 `whenResultArtReady`）
  void preloadEventResults(run, ev.id, ev.choices.map((_, i) => resultArtHeroFor(i)));

  // 5F 大俠傳功：撿到秘笈那段只播一次，旗標寫在 run.flags，由結算那次存檔帶走。
  // **整局一次、只綁第一關那一版**（2026-09-23 內容擴充第一批，5F 改成一關一版時定的）：那三句講的是
  //「第一次認出師父的字」，搬到第二關的木箱、第三關的紙頁會跟插圖對不上；後兩版的線索寫在事件本文裡，不另播對白
  if (ev.id === FIXED_EVENT_FLOOR_5) app.playOnce('secretScroll', dialogue.secretScroll, () => { /* 看完就直接選 */ });
});
