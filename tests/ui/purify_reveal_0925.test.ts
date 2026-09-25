import { describe, expect, it } from 'vitest';
import { MIASMA_PURE, PURIFY_CHANGE, miasmaNote, relicById, relicLongText } from '../../src/content/relics';
import { newRun, purifyRelic } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { purifiedBetween } from '../../src/ui/purifyreveal';
import EVENT from '../../src/ui/screens/event.ts?raw';
import REST from '../../src/ui/screens/rest.ts?raw';
import SHOP from '../../src/ui/screens/shop.ts?raw';
import PICK from '../../src/ui/purifypick.ts?raw';
import REVEAL from '../../src/ui/purifyreveal.ts?raw';

/*
 * 淨化結果視窗（2026-09-25 使用者：「淨化完會變怎樣其實看不到，事件也都直接顯示淨化完成，應該要有個畫面讓玩家知道淨化完的變化」）。
 * 使用者選「跳一個視窗」＋「淨化之前說明裡就寫會變成什麼」。畫面層不能用 DOM 測（雲端沒有 happy-dom），接線照慣例讀原始碼釘住。
 */
const lf = (s: string): string => s.replace(/\r\n/g, '\n');

describe('淨化會變怎樣（PURIFY_CHANGE）', () => {
  it('六件沾了魔氣的都有一列，至少寫一條拿掉的壞處', () => {
    expect(Object.keys(PURIFY_CHANGE).sort()).toEqual(Object.keys(MIASMA_PURE).sort());
    for (const [id, ch] of Object.entries(PURIFY_CHANGE)) expect(ch.good.length, id).toBeGreaterThan(0);
  });

  it.each(Object.keys(MIASMA_PURE))('%s：寫的最大生命增減跟淨化實際做的一樣', (id) => {
    const r = relicById[id]!, pure = relicById[MIASMA_PURE[id]!]!;
    const d = (pure.hooks.maxHp ?? 0) - (r.hooks.maxHp ?? 0);
    const run = newRun(`purify-hp-${id}`, 1, 'ninja');
    me(run).relics.push(id);
    const before = me(run).maxHp;
    expect(purifyRelic(run, id)).toBe(true);
    expect(me(run).maxHp - before, '淨化當下最大生命的變化').toBe(d);
    const text = [...PURIFY_CHANGE[id]!.good, ...PURIFY_CHANGE[id]!.bad].join('；');
    if (d === 0) expect(text, '最大生命沒變就不要寫「當場」').not.toContain('當場');
    else {
      expect(text).toContain('當場');
      expect(text).toContain(String(Math.abs(d)));
      // 加回來的寫在拿掉的壞處（綠），扣掉的寫在代價（橘）
      const side = d > 0 ? PURIFY_CHANGE[id]!.good : PURIFY_CHANGE[id]!.bad;
      expect(side.join('；')).toContain('當場');
    }
  });

  it.each(Object.keys(MIASMA_PURE))('%s：淨化之前的說明就寫會變成哪一件、變了什麼', (id) => {
    const pure = relicById[MIASMA_PURE[id]!]!;
    const note = miasmaNote(id);
    expect(note).toContain(`淨化後變成「${pure.name}」`);
    for (const t of PURIFY_CHANGE[id]!.good) expect(note).toContain(t);
    for (const t of PURIFY_CHANGE[id]!.bad) expect(note).toContain(t);
    expect(relicLongText(relicById[id]!)).toContain(note);
  });
});

describe('這一次淨化掉哪幾件（purifiedBetween）', () => {
  it('一件、全部都抓得到；之前就淨化過的、弄丟的不算', () => {
    expect(purifiedBetween(['a', 'miasma_lantern'], ['a', 'miasma_lantern_pure'])).toEqual(['miasma_lantern']);
    expect(purifiedBetween(['miasma_charm', 'blood_dagger'], ['miasma_charm_pure', 'blood_dagger_pure'])).toEqual(['miasma_charm', 'blood_dagger']);
    expect(purifiedBetween(['miasma_shard_pure'], ['miasma_shard_pure'])).toEqual([]);
    expect(purifiedBetween(['black_cat_mask'], [])).toEqual([]);   // 事件把秘寶拿走了：那不是淨化
    expect(purifiedBetween(['miasma_lantern'], ['miasma_lantern'])).toEqual([]);
  });
});

describe('三個地方淨化完都秀結果視窗', () => {
  it('貓窩：清心香點完秀視窗，單機等「收好了」才回地圖', () => {
    const src = lf(REST);
    const fn = src.slice(src.indexOf('function afterPurify('), src.indexOf('function showPillow('));
    expect(fn).toContain('showPurifyReveal([id], closedNow)');
    expect(fn).toMatch(/afterAction\([^;]*'curl', closed\)/);
    // 有 hold 就等它好了才排回地圖；沒有照舊
    expect(src).toContain('if (!hold) { leave(); return; }');
    expect(src).toContain('void hold.then(() => { if (!gone) leave(); });');
  });

  it('玳瑁婆婆：淨化好了秀視窗（單機當下、連線繞回來都走 afterPurify）', () => {
    const src = lf(SHOP);
    const fn = src.slice(src.indexOf('function afterPurify('), src.indexOf('function afterService('));
    expect(fn).toContain('showPurifyReveal([id]);');
  });

  it('事件：結果畫好時比對進事件時的秘寶，淨化掉的秀一次，關掉才問忍具', () => {
    const src = lf(EVENT);
    expect(src).toContain('const relicsAtStart = [...me(run, seat).relics];');
    const fn = src.slice(src.indexOf('const finish = (resultText'), src.indexOf('function takeLearn('));
    expect(fn).toContain('purifiedBetween(relicsAtStart, me(run, seat).relics).filter((id) => !purifyShown.has(id))');
    expect(fn).toContain('showPurifyReveal(purified, () => { if (missed.length) askNext(0); });');
  });

  it('挑選窗改用同一套「拿掉什麼／代價」，不再兩段全文', () => {
    const src = lf(PICK);
    expect(src).toContain('...purifyChangeLines(id)');
    expect(src).not.toContain('淨化前：');
  });

  it('結果視窗不跟著換畫面收（連線同伴做完就上樓），整局換掉才收', () => {
    const src = lf(REVEAL);
    expect(src).toContain('closeWithStory(');
    expect(src).not.toContain('closeWithScreen(');
  });
});
