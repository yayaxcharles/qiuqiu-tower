import { describe, expect, it } from 'vitest';
import { playCard, startCombat } from '../src/engine/combat';
import { previewHpLoss } from '../src/engine/preview';
import { Rng, seedFromString } from '../src/engine/rng';
import type { CombatState } from '../src/engine/types';
import { readFileSync } from 'node:fs';
import COMBAT_RAW from '../src/ui/screens/combat.ts?raw';
import { inst } from './helpers';

/*
 * 瞄準時的扣血預覽（使用者 2026-09-24 晚：「指上去但還沒打出去時，就先顯示怪物會扣的血量，
 * 例如怪物 12 血、這張打 5，血條顯示 7+5/12，7 紅色、5 紫色或藍色」）。
 * 引擎：在複本上試打，預覽＝真的打出去的結果、而且不動到本尊。畫面：三條路（點選瞄準、拖曳、滑到範圍牌）都接。
 */
const COMBAT = COMBAT_RAW.replace(/\r\n/g, '\n'), CSS = readFileSync('src/ui/styles/combat.css', 'utf8').replace(/\r\n/g, '\n');

function fight(enc: string, cards: string[]): CombatState {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: cards.map((id, i) => inst(id, 500 + i)), relics: [], potions: [], encounterId: enc,
    rng: new Rng(seedFromString(`preview-${enc}`)), hero: 'ninja' });
  const p = cs.player;
  p.hand = cards.map((id, i) => inst(id, 500 + i)); p.drawPile = []; p.discardPile = []; p.energy = 9;
  return cs;
}
const hpOf = (cs: CombatState): number[] => cs.enemies.map((e) => e.hp);

describe('previewHpLoss：複本上試打', () => {
  it('單體：預覽的扣血＝真的打出去扣的血；本尊的手牌、飯糰、血、亂數都沒動', () => {
    const cs = fight('rats3', ['sanjo']);
    const target = cs.enemies[0]!.uid;
    const before = { hp: hpOf(cs), hand: cs.player.hand.length, energy: cs.player.energy, rng: { ...cs.rng.state }, log: cs.log.length };
    const pv = previewHpLoss(cs, 500, target, 0);
    expect([...pv.keys()]).toEqual([target]);
    expect(hpOf(cs)).toEqual(before.hp);
    expect(cs.player.hand.length).toBe(before.hand);
    expect(cs.player.energy).toBe(before.energy);
    expect(cs.rng.state).toEqual(before.rng);
    expect(cs.log.length).toBe(before.log);
    const hp0 = cs.enemies[0]!.hp;
    expect(playCard(cs, 500, target, 0)).toBe(true);
    expect(pv.get(target)).toEqual({ min: hp0 - cs.enemies[0]!.hp, max: hp0 - cs.enemies[0]!.hp });
  });

  it('範圍攻擊：每一隻都列，跟真的打出去一樣', () => {
    const cs = fight('rats3', ['susu']);
    const hp0 = hpOf(cs);
    const pv = previewHpLoss(cs, 500, undefined, 0);
    expect(pv.size).toBe(cs.enemies.filter((e) => !e.dead).length);
    playCard(cs, 500, undefined, 0);
    cs.enemies.forEach((e, i) => expect(pv.get(e.uid)?.max ?? 0, `魔物 ${e.uid}`).toBe(hp0[i]! - Math.max(0, e.hp)));
  });

  // 推前稽核 2026-09-24 中-1：同一個亂數狀態試打＝先偷看這一次骰到幾點。改報「最少～最多」
  it('醉拳（隨機 4～14）：報範圍、不報這一次骰到的數字；真的打出去落在範圍裡', () => {
    const cs = fight('wood_dummy', ['zuiquan']);
    const e = cs.enemies[0]!;
    e.hp = e.maxHp = 999;
    const pv = previewHpLoss(cs, 500, e.uid, 0);
    expect(pv.get(e.uid)).toEqual({ min: 4, max: 14 });
    playCard(cs, 500, e.uid, 0);
    const dealt = 999 - e.hp;
    expect(dealt).toBeGreaterThanOrEqual(4);
    expect(dealt).toBeLessThanOrEqual(14);
  });

  // 推前稽核（複審）低-2：暗器匣隨機挑一隻打，三隻時中間那隻兩次試打都沒挨到——也要標「0～最多」
  it('暗器匣（第 3 張牌後隨機打一隻 5 點）：三隻都標得到，各自 0～N', () => {
    const cs = fight('rats3', ['cuimian']);   // 催眠術：不造成傷害的全體技能，只剩暗器匣那一下
    cs.player.relics.push('dart_case');
    cs.player.cardsPlayedThisTurn = 2;
    const pv = previewHpLoss(cs, 500, undefined, 0);
    expect(pv.size).toBe(3);
    for (const e of cs.enemies) expect(pv.get(e.uid), `魔物 ${e.uid}`).toEqual({ min: 0, max: 5 });
  });

  // 複審 低-1：打的是單體攻擊時，暗器匣那一下可能疊在同一隻身上，也可能打到別隻——每隻都要是正確範圍
  it('暗器匣＋單體攻擊（貓抓）瞄中間那隻：中間 N～N+5、兩旁 0～5', () => {
    const cs = fight('rats3', ['sanjo']);
    cs.player.relics.push('dart_case');
    cs.player.cardsPlayedThisTurn = 2;
    for (const e of cs.enemies) { e.hp = e.maxHp = 99; }
    const [a, mid, c] = cs.enemies;
    const pv = previewHpLoss(cs, 500, mid!.uid, 0);
    const hit = pv.get(mid!.uid)!;
    expect(hit.max - hit.min).toBe(5);
    expect(pv.get(a!.uid)).toEqual({ min: 0, max: 5 });
    expect(pv.get(c!.uid)).toEqual({ min: 0, max: 5 });
  });

  // 推前稽核 低-2：打出去會停下來選牌的牌，選完之後才觸發的東西算不到 → 不預覽
  it('會停下來選牌的牌（告退：先消耗一張手牌）不預覽', () => {
    const cs = fight('rats3', ['gaotui', 'sanjo']);
    expect(previewHpLoss(cs, 500, undefined, 0).size).toBe(0);
  });

  it('防禦先吃：只預覽真的會少的血；打不出去（飯糰不夠）就回空的', () => {
    const cs = fight('rats3', ['sanjo']);
    const e = cs.enemies[0]!;
    e.block = 999;
    expect(previewHpLoss(cs, 500, e.uid, 0).size).toBe(0);
    e.block = 0;
    cs.player.energy = 0;
    expect(previewHpLoss(cs, 500, e.uid, 0).size).toBe(0);
  });
});

describe('畫面：三條路都接、收得乾淨、樣式照使用者說的', () => {
  const between = (start: string, end: string): string => {
    const a = COMBAT.indexOf(start);
    const b = COMBAT.indexOf(end, a + start.length);
    if (a < 0 || b < 0) throw new Error(`找不到片段：${start}`);
    return COMBAT.slice(a, b);
  };
  it('數字寫成「剩下＋會扣／上限」，+N 是紫色；隨機的寫範圍、多扣的那段淡紫；以引擎真實血量為準', () => {
    const fn = between('  function damagePreview(cardUid: number | null, foeUid?: number): void {', '   * 選目標時從牌拉一條弧線到滑鼠');
    expect(fn).toContain("label.replaceChildren(range(lo, hi), el('b', { class: 'hp-loss' }, `+${range(loss.min, loss.max)}`), `/${e.maxHp}`);");
    expect(fn).toContain('const lo = Math.max(0, e.hp - loss.max), hi = Math.max(0, e.hp - loss.min);');
    expect(fn).not.toContain('motionPendingDamage.get(uid)');
    expect(fn).toContain("class: 'hpbar-preview maybe'");
    expect(fn).toContain('previewHpLoss(cs, cardUid, foeUid, mySeat)');
    expect(CSS).toContain('.combat .hpbar-preview {');
    expect(CSS).toContain('.combat .hpbar b.hp-loss { color: #d9c4ff; }');
    expect(CSS).toContain('.combat .hpbar-preview.maybe { opacity: .5; animation: none; }');
  });
  it('血條被換掉（命中落地、同伴動作的就地修補）時照同一組重畫', () => {
    expect(COMBAT).toContain("target.querySelector('.hpbar')?.replaceWith(hpBar(`e${e.uid}`, e.hp + pending, e.maxHp));\n            repaintPreview();");
    expect(between('  function patchField(before: Snap): boolean {', '\n  }\n')).toContain("keepLoops(box, app.loopT0, 'card-idle');\n    repaintPreview();");
  });
  it('點選瞄準（箭頭吸附）、拖曳經過、滑到不用瞄準的牌：三條路；換瞄準與整頁重畫時收掉', () => {
    expect(COMBAT).toContain("damagePreview(foe && targeting?.kind === 'card' ? targeting.uid : null, foe ? Number(foe.dataset['uid']) : undefined);");
    expect(COMBAT).toContain('damagePreview(uid === null ? null : c.uid, uid ?? undefined);');
    expect(COMBAT).toContain("node.addEventListener('mouseenter', () => { if (!targeting) damagePreview(c.uid); });");
    expect(between('  const setTargeting = (t: Targeting): void => {', '  };')).toContain('damagePreview(null);');
    expect(between('  function render(): void {', 'clear(root);')).toContain('previewFor = null;');
  });
});
