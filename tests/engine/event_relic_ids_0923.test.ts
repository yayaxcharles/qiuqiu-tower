import { describe, expect, it } from 'vitest';
import { eventById, events } from '../../src/content/events';
import { MIASMA_PURE, relicById, relicLongText, relics } from '../../src/content/relics';
import { BLESSINGS } from '../../src/content/blessings';
import { choiceEffectsFor } from '../../src/engine/eventcond';
import { applyRunEffects, newRun, takeRelic, type RunGain } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import type { ChoiceCond, RunEffect } from '../../src/engine/types';

/*
 * 事件指名的秘寶代號都要對得到秘寶定義（2026-09-23 b2fin，第二批事件收尾）。
 *
 * 對不到的時候**引擎不會報錯**：`relicId` 靜靜退回 60 條小魚乾、`loseRelicId` 當作身上沒有而跳過、
 * 條件選項的 `requires: relic` 永遠不出現。b2event 開工時三件事件限定秘寶還沒合進來，
 * 牢裡的山賊①、魔氣結晶①、影子的真面目②就一直在發小魚乾，而全套測試照樣是綠的。
 */

/** 一串效果裡指名的秘寶代號（賭局的輸贏兩邊也算） */
function effectIds(fxs: readonly RunEffect[]): string[] {
  return fxs.flatMap((fx) => fx.kind === 'relicId' || fx.kind === 'loseRelicId' ? [fx.id]
    : fx.kind === 'gamble' ? [...effectIds(fx.win), ...effectIds(fx.lose)]
    : fx.kind === 'lottery' ? fx.table.flatMap((t) => effectIds(t.effects)) : []);   // 抽獎的每一格也算（稀有事件，2026-09-24 b3int 合併）
}
function condIds(c: ChoiceCond | undefined): string[] {
  if (!c) return [];
  return c.kind === 'relic' ? [...c.ids] : c.kind === 'anyOf' ? c.of.flatMap(condIds) : [];
}
const named = events.flatMap((e) => e.choices.flatMap((c, i) => [
  ...effectIds(c.outcome), ...(c.bySeat ?? []).flatMap(effectIds), ...condIds(c.requires),
].map((id) => ({ where: `${e.id} 選項 ${i + 1}`, id }))));

describe('事件裡每個秘寶代號都查得到秘寶定義', () => {
  it('給的、交出的、條件看的，全部對得到', () => {
    // 走法本身沒壞：已知的幾個都有掃到
    for (const id of ['bandit_iou', 'miasma_shard', 'master_wooden_sword', 'wind_chime', 'bell', 'master_hat']) {
      expect(named.map((n) => n.id), id).toContain(id);
    }
    for (const n of named) expect(relicById[n.id], `${n.where}：「${n.id}」沒有這件秘寶`).toBeDefined();
  });

  it('事件限定池的每一件都有事件給（不然整局拿不到）', () => {
    const given = new Set(events.flatMap((e) => e.choices.flatMap((c) => [c.outcome, ...(c.bySeat ?? [])]
      .flatMap((fxs) => fxs.filter((fx) => fx.kind === 'relicId').map((fx) => (fx as { id: string }).id)))));
    // 第三批（2026-09-24 b3int 合併）：沾了魔氣的舊護腕（事件池）由開局祝福「舊護腕」給、紫霧①（`relicMiasma`，六件魔氣隨機一件）也給得到
    for (const b of BLESSINGS) for (const fx of b.effects ?? []) if (fx.kind === 'relicId') given.add(fx.id);
    if (events.some((e) => e.choices.some((c) => c.outcome.some((fx) => fx.kind === 'relicMiasma')))) for (const id of Object.keys(MIASMA_PURE)) given.add(id);
    const eventPool = relics.filter((r) => r.pool === '事件').map((r) => r.id);
    expect(eventPool.length).toBeGreaterThan(0);
    for (const id of eventPool) expect(given.has(id), `「${id}」沒有任何事件給`).toBe(true);
  });
});

describe('三個給限定秘寶的選項真的給秘寶，不是退回小魚乾', () => {
  const cases = [['cell_bandit', 0, 'bandit_iou'], ['miasma_crystal', 0, 'miasma_shard'], ['shadow_truth', 1, 'master_wooden_sword']] as const;
  for (const [evId, index, relicId] of cases) {
    it(`${evId} 第 ${index + 1} 個選項 → ${relicId}`, () => {
      const choice = eventById[evId]!.choices[index]!;
      // 標籤寫的名字就是實際給的那一件
      expect(choice.label).toContain(`「${relicById[relicId]!.name}」`);
      const run = newRun(`b2fin-${evId}`);
      const fish0 = me(run).fish;
      const notes: string[] = [];
      const gains: RunGain[] = [];
      applyRunEffects(run, choiceEffectsFor(choice, 0), notes, gains);
      expect(me(run).relics).toContain(relicId);
      expect(gains).toContainEqual({ kind: '秘寶', id: relicId });
      expect(me(run).fish, '沒有退回小魚乾').toBe(fish0);
      expect(notes.join('；')).not.toContain('小魚乾');
    });
  }

  it('舊木劍拿到時的說明寫集到幾件（事件畫面「拿到了什麼」那一欄用的就是這一支）', () => {
    const run = newRun('b2fin-sword-set');
    takeRelic(run, 'master_hat');
    applyRunEffects(run, choiceEffectsFor(eventById['shadow_truth']!.choices[1]!, 0));
    expect(relicLongText(relicById['master_wooden_sword']!, me(run).relics)).toContain('【師門 2／3】');
  });
});
