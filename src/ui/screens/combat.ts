import { dialogue } from '../../content/dialogue';
import { enemyById } from '../../content/enemies';
import { potionById } from '../../content/potions';
import { aliveEnemies } from '../../engine/actions';
import { canPlay, endTurn, playCard, resolveChoice, usePotion } from '../../engine/combat';
import { cardStats } from '../../engine/deck';
import { computeAttack, computeBlock, getStatus } from '../../engine/statuses';
import type { CombatState, EnemyCombat, EnemyDef, EnemyEffect, Intent, PendingChoice, RunState, StatusName, Unit } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl, monsterUrl } from '../assets';
import { cardNode } from '../cardview';
import { toast } from '../dialogue';
import { clear, el } from '../dom';
import { renderHud } from '../hud';
import { overlayRoot } from '../overlay';
import { attachTooltip, hideTooltip } from '../tooltip';

const STATUS_ICON: Record<StatusName, string> = {
  爪力: 'icon/status_claw', 貓步: 'icon/status_step', 翻肚: 'icon/status_belly',
  懶洋洋: 'icon/status_lazy', 炸毛: 'icon/status_puff', 噎到: 'icon/status_choke',
  隱身: 'icon/status_stealth', 定身: 'icon/status_stun', 反彈: 'icon/status_thorns',
  潛水: 'icon/status_stealth',
};
/** 狀態排列順序寫死，好的排前面，才不會每次重畫就換位置（物件鍵的順序不保證） */
const STATUS_ORDER: readonly StatusName[] = ['爪力', '貓步', '隱身', '潛水', '反彈', '定身', '翻肚', '懶洋洋', '炸毛', '噎到'];
/** 意圖沒有圖示素材（美術清單只做了狀態圖示），用一個中文字當記號，字型一定有 */
const INTENT_GLYPH: Record<Intent, string> = { attack: '攻', block: '守', buff: '強', debuff: '弱', special: '？', summon: '召', idle: '…' };
const PENDING_TITLE: Record<PendingChoice['purpose'], string> = {
  exhaust: '選要消耗的牌', retain: '選要保留到下回合的牌', discard: '選要棄掉的牌',
  recover: '選要拿回手上的牌', scryDiscard: '抽牌堆頂的牌，選要丟掉的',
};
/** 球球的姿勢（規格 §8.4）：待機淡定、出招參上、挨打中計了、閃避替身術、餓扁先睡了、勝利任務完成、陣亡任務失敗、蜷縮捲成球 */
const POSE = {
  idle: 'ninja/32', attack: 'ninja/01', hit: 'ninja/34', dodge: 'ninja/08',
  hungry: 'ninja/38', win: 'ninja/04', lose: 'ninja/36', curl: 'codex/curl',
};

interface Snap {
  hp: number;
  block: number;
  enemies: Map<number, { hp: number; dead: boolean; phase: number; intent: Intent }>;
  logLen: number;
}
function snap(cs: CombatState): Snap {
  return {
    hp: cs.player.hp, block: cs.player.block, logLen: cs.log.length,
    enemies: new Map(cs.enemies.map((e) => [e.uid, { hp: e.hp, dead: e.dead, phase: e.phase, intent: e.move.intent }])),
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
  const bgKey = run.floor <= 5 ? 'bg/low' : run.floor <= 10 ? 'bg/mid' : 'bg/top';

  let targeting: { kind: 'card'; uid: number } | { kind: 'potion'; id: string } | null = null;
  let pose = POSE.idle;
  let hint = '';
  let hungryTurn = -1;
  let lowHpTold = false;
  let ended = false;
  let picker: HTMLElement | null = null;
  let seq = 0;   // 每次結算 +1，讓過期的計時器認出自己已經不是最新的一次

  /** 可以操作嗎：分出勝負、還在等玩家選牌時，出牌／忍具／結束回合都會被引擎靜默拒絕，所以先反灰 */
  function canAct(): boolean { return !ended && cs.phase === 'player' && !cs.pending; }

  // ===== 元件 =====

  function chip(term: string, iconKey: string | null, value: string, extra = ''): HTMLElement {
    const node = el('div', { class: `chip ${extra}`.trim() });
    const url = iconKey ? artUrl('icons', iconKey) : '';
    // 圖示還沒生好就寫名字：一排灰剪影根本認不出誰是誰
    if (url && !isFallback(url)) node.append(el('img', { src: url, alt: term }));
    else node.append(el('b', {}, term));
    node.append(el('span', {}, value));
    attachTooltip(node, term);
    return node;
  }

  function statusRow(u: Unit): HTMLElement {
    const row = el('div', { class: 'chips' });
    if (u.block > 0) row.append(chip('蜷縮', null, String(u.block), 'block'));
    for (const name of STATUS_ORDER) {
      const v = getStatus(u, name);
      if (v > 0) row.append(chip(name, STATUS_ICON[name], String(v)));
    }
    return row;
  }

  function hpBar(hp: number, maxHp: number): HTMLElement {
    const pct = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
    return el('div', { class: 'hpbar' },
      el('div', { class: 'hpbar-fill', style: `width:${pct}%` }),
      el('span', {}, `${hp}/${maxHp}`));
  }

  /** 魔物頭上的意圖：攻擊直接算進爪力／懶洋洋／翻肚與蓄力，玩家看到的就是真的會挨幾下 */
  function intentChip(e: EnemyCombat): HTMLElement {
    const m = e.move;
    const x = e.charged ? 2 : 1;
    const hits = m.effects.filter(has('damage'));
    const rnd = m.effects.find(has('damageRandom'));
    const blk = m.effects.find(has('block'));
    let text = `${INTENT_GLYPH[m.intent]} ${m.label}`;
    if (m.intent === 'attack' && getStatus(e, '定身') > 0) text = '被定住了';
    else if (hits.length) text = `攻 ${hits.map((d) => `${computeAttack(d.amount * x, e, cs.player)}${(d.times ?? 1) > 1 ? `×${d.times}` : ''}`).join('＋')}`;
    else if (rnd) text = `攻 ${computeAttack(rnd.min * x, e, cs.player)}～${computeAttack(rnd.max * x, e, cs.player)}`;
    else if (blk) text = `守 ${computeBlock(blk.amount, e)}`;
    if (e.charged && m.intent === 'attack') text += '（蓄力）';
    const node = el('div', { class: `intent i-${m.intent}` }, text);
    node.title = m.label;
    return node;
  }

  /** 塔主的 art 是沒有編號的 'daxia'，兩個階段各對一張立繪；其餘魔物走 monsters 那一組 */
  function enemySprite(e: EnemyCombat, def: EnemyDef | undefined): string {
    if (!def) return monsterUrl('', 'idle');
    if (def.art === 'daxia') return artUrl('sprites', e.phase > 0 ? 'daxia/33' : 'daxia/36');
    return monsterUrl(def.art, 'idle');
  }

  function enemyUnit(e: EnemyCombat, i: number, n: number): HTMLElement {
    const def = enemyById[e.enemyId];
    const step = n <= 2 ? 210 : n === 3 ? 205 : n === 4 ? 180 : 150;
    const left = Math.round(875 - ((n - 1) * step) / 2 - 95 + i * step);
    const cls = ['unit', 'enemy', `size-${def?.size ?? 'medium'}`];
    if (e.dead) cls.push('gone');
    if (targeting && !e.dead) cls.push('targetable');
    const node = el('div', { class: cls.join(' '), 'data-uid': String(e.uid), style: `left:${left}px` },
      intentChip(e),
      el('img', { class: 'sprite', src: enemySprite(e, def), alt: e.name }),
      el('div', { class: 'name' }, e.name),
      hpBar(e.hp, e.maxHp),
      statusRow(e));
    if (targeting && !e.dead) node.addEventListener('click', () => pickTarget(e.uid));
    return node;
  }

  function sidePanel(): HTMLElement {
    const p = cs.player;
    const energy = el('div', { class: 'energy' });
    for (let i = 0; i < Math.max(p.maxEnergy, p.energy); i++) {
      const url = artUrl('icons', i < p.energy ? 'icon/onigiri_full' : 'icon/onigiri_empty');
      // 飯糰圖還沒生好就畫一顆圓點，至少數得出來剩幾顆
      energy.append(isFallback(url) ? el('div', { class: `pip${i < p.energy ? ' full' : ''}` }) : el('img', { src: url, alt: '' }));
    }
    energy.append(el('span', {}, `${p.energy}/${p.maxEnergy}`));
    attachTooltip(energy, '飯糰');

    const potions = el('div', { class: 'potions' });
    for (let i = 0; i < 3; i++) {
      const id = cs.potions[i];
      const def = id ? potionById[id] : undefined;
      const slot = el('div', { class: `potion${def ? '' : ' empty'}` });
      if (id && def) {
        const url = artUrl('icons', def.art);
        slot.append(isFallback(url) ? el('b', {}, def.name) : el('img', { src: url, alt: def.name }));
        slot.title = `${def.name}：${def.text}`;
        if (canAct()) { slot.classList.add('usable'); slot.addEventListener('click', () => onPotion(id)); }
      }
      potions.append(slot);
    }

    const combo = el('span', {}, `連抓 ${p.cardsPlayedThisTurn}`);
    attachTooltip(combo, '連抓');
    const piles = el('div', { class: 'piles' },
      el('span', {}, `第 ${cs.turn} 回合`),
      el('span', {}, `抽牌 ${p.drawPile.length}`),
      el('span', {}, `棄牌 ${p.discardPile.length}`),
      el('span', {}, `消耗 ${p.exhaustPile.length}`),
      combo);
    return el('div', { class: 'side' }, energy, potions, piles);
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
        selected: targeting?.kind === 'card' && targeting.uid === c.uid,
        disabled: !canAct() || !chk.ok,
        onClick: () => onCard(c.uid),
      });
      node.style.transform = `rotate(${((i - mid) * spread).toFixed(2)}deg) translateY(${(Math.abs(i - mid) * lift).toFixed(0)}px)`;
      node.style.margin = `0 ${((step - 145) / 2).toFixed(1)}px`;
      node.style.zIndex = String(i + 1);
      // 打不出來的原因直接用引擎給的字串，畫面不要自己再寫一套
      if (!chk.ok) { node.title = chk.reason; node.addEventListener('click', () => { hint = chk.reason; render(); }); }
      hand.append(node);
    });
    return hand;
  }

  function render(): void {
    hideTooltip();   // 掛著提示的節點馬上要被換掉，不先關會留一個孤兒黏在畫面上
    clear(root);
    const box = el('div', { class: 'combat' });
    const bg = el('div', { class: 'battle-bg' });
    const bgUrl = artUrl('bg', bgKey);
    if (!isFallback(bgUrl)) bg.style.backgroundImage = `url(${bgUrl})`;
    box.append(bg);
    // 選目標時鋪一層透明的接盤子：點空白處＝取消。魔物與手牌都疊在它上面，照樣點得到
    if (targeting) box.append(el('div', { class: 'target-catcher', onclick: () => { targeting = null; render(); } }));

    const field = el('div', { class: 'field' },
      el('div', { class: 'unit player' },
        el('img', { class: 'sprite', src: artUrl('sprites', pose), alt: '球球' }),
        el('div', { class: 'name' }, '球球'),
        hpBar(cs.player.hp, cs.player.maxHp),
        statusRow(cs.player)));
    cs.enemies.forEach((e, i) => field.append(enemyUnit(e, i, cs.enemies.length)));
    box.append(field, sidePanel(), handRow());

    const endBtn = el('button', { class: 'btn primary end-turn', onclick: () => onEndTurn() }, '結束回合');
    if (!canAct()) endBtn.setAttribute('disabled', 'disabled');
    box.append(endBtn, el('div', { class: 'log' }, ...cs.log.slice(-6).map((l) => el('div', {}, l))));
    if (targeting) box.append(el('div', { class: 'target-hint' }, targeting.kind === 'card' ? '點一隻魔物打牠（Esc 或點空白處取消）' : '點一隻魔物用忍具（Esc 或點空白處取消）'));
    else if (hint) box.append(el('div', { class: 'target-hint warn' }, hint));
    renderHud(app, box);
    root.append(box);
  }

  // ===== 操作 =====

  function onCard(uid: number): void {
    if (!canAct()) return;
    const card = cs.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    hint = '';
    if (cardStats(card).def.target === 'enemy') {
      // 再點一次同一張＝取消；點另一張＝改選那一張
      targeting = targeting?.kind === 'card' && targeting.uid === uid ? null : { kind: 'card', uid };
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
    else act(() => { if (!usePotion(cs, t.id, enemyUid)) console.error(`usePotion 失敗：${t.id}`); });
  }

  function play(uid: number, targetUid: number | undefined): void {
    const card = cs.player.hand.find((c) => c.uid === uid);
    if (!card) return;
    const st = cardStats(card);
    const chk = canPlay(cs, uid, targetUid);
    if (!chk.ok) { hint = chk.reason; render(); return; }
    // 出招換成這張牌的姿勢；大俠牌沒有對應立繪（只做了塔主九張），退回「參上」
    const wanted = st.def.art.startsWith('ninja/') ? st.def.art : POSE.attack;
    act(() => {
      // canPlay 剛放行卻打不出來＝引擎跟畫面對不上，出聲，不要靜靜吞掉
      if (!playCard(cs, uid, targetUid)) console.error(`playCard 在 canPlay 放行後仍失敗：${st.name}（uid ${uid}）`);
    }, { pose: wanted, attack: st.def.type === '攻擊' });
  }

  function onPotion(id: string): void {
    if (!canAct()) return;
    const def = potionById[id];
    if (!def) return;
    hint = '';
    // 只有打魔物的忍具要選目標（手裡劍、麻繩）；全體與自己用的直接用掉
    if (def.target === 'enemy') { targeting = { kind: 'potion', id }; render(); return; }
    act(() => { if (!usePotion(cs, id)) console.error(`usePotion 失敗：${id}`); });
  }

  function onEndTurn(): void {
    if (!canAct()) return;
    targeting = null;
    act(() => endTurn(cs));
  }

  // ===== 結算與動畫 =====

  /** 跑一個引擎動作，然後照「前後差異」放姿勢、動畫與台詞 */
  function act(fn: () => void, opts: { pose?: string; attack?: boolean } = {}): void {
    const before = snap(cs);
    hint = '';
    fn();
    settle(before, opts);
  }

  function settle(before: Snap, opts: { pose?: string; attack?: boolean } = {}): void {
    const posePref = opts.pose;
    const p = cs.player;
    const fresh = cs.log.slice(before.logLen);
    const hurt = p.hp < before.hp;
    const dodged = fresh.some((l) => l.includes('球球閃過了'));
    const hungry = cs.phase === 'player' && p.energy === 0 && hungryTurn !== cs.turn
      && p.hand.some((c) => cardStats(c).cost > 0);
    // 姿勢優先序：分出勝負 ＞ 挨打 ＞ 閃過 ＞ 蜷縮 ＞ 這張牌 ＞ 餓扁 ＞ 待機。先決定再畫，姿勢才看得到。
    // 蜷縮排在牌姿勢前面是因為「淡定」的牌圖就是待機那張，照牌圖換等於什麼都沒動；
    // 攻擊牌例外（交出來會奪走蜷縮），那種時候還是要看到出招的姿勢。
    if (cs.phase === 'won') pose = POSE.win;
    else if (cs.phase === 'lost') pose = POSE.lose;
    else if (hurt) pose = POSE.hit;
    else if (dodged) pose = POSE.dodge;
    else if (p.block > before.block && !opts.attack) pose = POSE.curl;
    else if (posePref) pose = posePref;
    else if (hungry) pose = POSE.hungry;
    render();

    // 畫完才把動畫類別與浮動數字掛到剛生出來的節點上
    for (const e of cs.enemies) {
      const b = before.enemies.get(e.uid);
      const node = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
      if (!b || !node) continue;
      if (e.hp < b.hp) { node.classList.add('hit'); node.append(el('div', { class: 'num' }, `-${b.hp - e.hp}`)); }
      if (!b.dead && e.dead) node.classList.add('dead');
      else if (b.intent === 'attack' && !e.dead && (hurt || dodged)) node.classList.add('attack');
      if (b.phase === 0 && e.phase > 0) bossPhase2();
    }
    const cat = root.querySelector<HTMLElement>('.unit.player');
    if (cat) {
      if (hurt) { cat.classList.add('hit'); cat.append(el('div', { class: 'num' }, `-${before.hp - p.hp}`)); }
      else if (dodged) cat.classList.add('dodge');
      else if (posePref) cat.classList.add('attack');
    }

    if (hungry) { hungryTurn = cs.turn; toast(dialogue.hungry, '球球'); }
    if (!lowHpTold && p.hp > 0 && p.hp < p.maxHp * 0.3) { lowHpTold = true; toast(dialogue.lowHp, '球球'); }

    const mine = ++seq;
    window.setTimeout(() => {
      if (seq === mine && app.cs === cs && !ended && cs.phase === 'player') { pose = POSE.idle; render(); }
    }, 650);

    if (cs.phase !== 'player' && !ended) {
      ended = true;
      if (cs.phase === 'won') toast(dialogue.battleWin[Math.floor(Math.random() * dialogue.battleWin.length)] ?? '', '球球');
      // 讓勝負的姿勢與吐槽站一下再交棒；app.cs 換人就表示這場已經被接手，不要再叫一次
      window.setTimeout(() => { if (app.cs === cs) app.afterCombat(bonusFish); }, 1300);
    }
    syncPicker();
  }

  /** 塔主進第二階段的兩句：吐槽是同一個位置，錯開時間放才不會疊在一起 */
  function bossPhase2(): void {
    const [a, b] = dialogue.bossPhase2;
    if (a) toast(a.text, a.speaker);
    if (b) window.setTimeout(() => toast(b.text, b.speaker), 1400);
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

  render();
  syncPicker();
});
