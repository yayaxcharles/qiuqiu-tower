import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { COND_LABEL_PARTNER_FOR_TEST, partnerCondLabel } from '../../src/content/event-text-b2';
import { eventById, events } from '../../src/content/events';
import { HEROES } from '../../src/engine/hero';
import { newCoopRun } from '../../src/engine/run';
import type { ChoiceCond } from '../../src/engine/types';
import { BASE, _setManifestForTest, setLocalHero, type Manifest } from '../../src/ui/assets';
import { eventResultUrls } from '../../src/ui/preload';
import EVENT_RAW from '../../src/ui/screens/event.ts?raw';

/*
 * 事件畫面的兩處收尾（2026-09-23 b2fin，第二批事件的收尾清單）。倉庫測試不能開 DOM，照原始碼守接線；
 * 行為本身在 `tests/engine/event_relic_ids_0923.test.ts`（舊木劍說明寫集到幾件）與
 * `tests/engine/cond_result_seat_0923.test.ts`（條件選項照誰的版本寫）。
 */
const EV = EVENT_RAW.replace(/\r\n/g, '\n');
/** 從 `head` 那一行到它的收尾（照縮排找：頂層函式收在 `\n}\n`，畫面裡的內部函式收在 `\n  }\n`，箭頭函式多一個分號） */
function body(head: string, indent = '', semi = ''): string {
  const i = EV.indexOf(head);
  expect(i, `找不到 ${head}`).toBeGreaterThanOrEqual(0);
  const j = EV.indexOf(`\n${indent}}${semi}\n`, i);
  expect(j, `${head} 找不到收尾`).toBeGreaterThan(i);
  return EV.slice(i, j);
}

describe('「拿到了什麼」那一欄的秘寶說明走 relicLongText（師門寫集到幾件）', () => {
  it('說明只有一個出口：秘寶走 relicLongText、照身上現在的秘寶數', () => {
    expect(body('function gainText(')).toContain('relicLongText(r, owned)');
  });

  it('放大彈出的那一顆、對白框那一列都用它，不再直接寫 d.text', () => {
    for (const f of ['function gainsNode(', 'function gainRows(']) {
      const b = body(f);
      expect(b, f).toContain('gainText(g, owned)');
      expect(b, f).not.toMatch(/\bd\.text\b/);
    }
  });

  it('兩處都傳本機這一位身上的秘寶（效果已經套完，剛拿到的那件也算）', () => {
    expect(EV).toContain('gainsNode(gains, me(run, seat).relics)');
    expect(EV).toContain('gainRows(gains, me(run, seat).relics)');
  });
});

describe('連線時同伴讓條件選項出現：結果文字寫同伴做的事', () => {
  it('take() 先問 resultSeat、再套效果（鈴鐺那條套完就問不到了）；文字與結果圖都定案', () => {
    const take = body('  function take(index: number): void {', '  ');
    const effects = take.indexOf('applyRunEffects(');
    // 走 heroOf：球球那一位的 hero 欄可能不填，直接傳 undefined 會被 evText 的預設值當成「本機這一位」
    const ask = take.indexOf('resultHero = heroOf(me(run, resultSeat(run, c, seat)));');
    const art = take.indexOf('resultArtHero = resultArtHeroFor(index);');
    expect(ask, 'take() 沒有問照誰的版本寫').toBeGreaterThan(0);
    expect(art, 'take() 沒有定結果圖照誰挑').toBeGreaterThan(0);
    expect(Math.max(ask, art), '套完效果才問').toBeLessThan(effects);
  });

  it('結果圖跟著文字換成同伴那一版：畫、等、預載三處都照 resultArtHero／resultArtHeroFor（實機抓到字寫菲菲、圖畫球球）', () => {
    const pick = body('  const resultArtHeroFor = (i: number): string | undefined => {', '  ', ';');
    expect(pick).toContain('resultSeat(run, c, seat)');
    expect(pick).toContain('return s === seat ? artHero : heroOf(me(run, s));');
    expect(EV).toContain('eventArt(art ?? ev.id, art ? resultArtHero : artHero, art ? { run, id: ev.id, hero: artHero } : undefined)');
    expect(EV).toContain('void warmResultArt(run, ev.id, index, resultArtHero)');
    expect(EV).toContain('void preloadEventResults(run, ev.id, ev.choices.map((_, i) => resultArtHeroFor(i)));');
    // 還沒解好先頂著的主圖照主圖那一位（畫面上剛畫過的那張），不跟著換成同伴的
    expect(body('function eventArt(')).toContain('eventArtKey(fallback.id, fallback.hero)');
  });

  it('三條結果路（一般結算、連線學招、連線學招都不要）都照 resultHero 寫；沒有漏掉的', () => {
    // 稀有事件那條線在後面接了「抽到之後的那一句」（2026-09-24 b3int 合併）
    expect(EV).toContain('const resultText = evText(rawResult, resultHero) + lotteryAfter(');
    expect(EV.split('evText(raw, resultHero)').length - 1).toBe(2);
    expect(EV).not.toMatch(/evText\(raw(?:Result)?\)/);
  });

  describe('預載與等圖照給的角色挑（preload 的 heroes／hero 參數）', () => {
    const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
    afterEach(() => { _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] }); setLocalHero('ninja'); });
    const ev = eventById['medicine_cat']!;
    const cond = ev.choices.findIndex((c) => !!c.requires);
    const art = ev.choices[cond]!.resultArt!;

    it('本機球球、同伴菲菲讓它出現：條件選項那張抓菲菲那一版，其餘照本機', () => {
      _setManifestForTest(MANIFEST); setLocalHero('ninja');
      const run = newCoopRun('b2fin-art-a', 1, 'ninja', 'feifei');
      const urls = eventResultUrls(run, ev.id, ev.choices.map((_, i) => (i === cond ? 'feifei' : undefined)));
      expect(urls).toContain(`${BASE}${MANIFEST.bg[`bg/event_feifei_${art}`]}`);
      expect(urls).not.toContain(`${BASE}${MANIFEST.bg[`bg/event_${art}`]}`);
      expect(eventResultUrls(run, ev.id), '不給就照本機').toContain(`${BASE}${MANIFEST.bg[`bg/event_${art}`]}`);
    });

    it('本機菲菲、同伴球球讓它出現：明講 ninja 就抓球球那一版（不會被當成「照本機」）', () => {
      _setManifestForTest(MANIFEST); setLocalHero('feifei');
      const run = newCoopRun('b2fin-art-b', 1, 'ninja', 'feifei');
      const urls = eventResultUrls(run, ev.id, ev.choices.map((_, i) => (i === cond ? 'ninja' : undefined)));
      expect(urls).toContain(`${BASE}${MANIFEST.bg[`bg/event_${art}`]}`);
      expect(urls).not.toContain(`${BASE}${MANIFEST.bg[`bg/event_feifei_${art}`]}`);
    });
  });

  it('evText 的角色參數只換「照誰的版本」，連線的稱呼記號照舊站在本機這一位', () => {
    const f = body('  const evText = (t: string, hero = me(run, seat).hero): string => {', '  ', ';');
    expect(f).toContain('eventTextFor(hero, t)');
    expect(f).toContain('coopFill(mine, me(run, seat).hero, partner.hero)');
  });
});

/*
 * 連線時同伴讓條件選項出現：**按鈕標籤**也照實際達成的人寫（2026-09-23 b2fin，主控裁定改口）。
 * 原本同伴養出毒，按鈕寫【菲菲的毒】讓她拿**你的**毒試新解藥。
 */
describe('連線時同伴讓條件選項出現：標籤照實際達成的人寫', () => {
  /** 養成型＝連線時可能是同伴讓它出現的（付錢型每一位都要、旗標是整局的，沒有「誰達成」） */
  const grown = (c: ChoiceCond): boolean => c.kind === 'anyOf' ? c.of.some(grown) : c.kind === 'deckTag' || c.kind === 'relic' || c.kind === 'potionsFull';
  const conds = events.flatMap((e) => e.choices.filter((c) => c.requires).map((c) => ({ id: e.id, c })));
  const paren = (s: string): string => s.slice(s.indexOf('（'));

  it('每一條養成型條件選項都有同伴版、付錢型與旗標型沒有；括號裡的效果一字不動、動作那一段換成同伴', () => {
    const table = COND_LABEL_PARTNER_FOR_TEST;
    const want = conds.filter(({ c }) => grown(c.requires!)).map(({ id }) => id).sort();
    expect(want.length).toBe(7);
    expect(Object.keys(table).sort()).toEqual(want);
    for (const { id, c } of conds.filter(({ c }) => grown(c.requires!))) {
      const t = table[id]!;
      expect(paren(t), `${id} 的效果跟原標籤不一樣`).toBe(paren(c.label));
      expect(t.slice(0, t.indexOf('（')), `${id} 的動作那一段沒寫同伴`).toContain('{同伴}');
    }
    for (const { id, c } of conds.filter(({ c }) => !grown(c.requires!))) expect(partnerCondLabel(id, 'ninja', 'feifei'), id).toBeUndefined();
  });

  it('稱呼換好：不同角色寫名字、同一隻寫「同伴」，沒有留下記號；賣藥的三花貓寫「她拿菲菲的毒」不寫「你的毒」', () => {
    for (const id of Object.keys(COND_LABEL_PARTNER_FOR_TEST)) for (const me of HEROES) for (const mate of HEROES) {
      const s = partnerCondLabel(id, me, mate)!;
      expect(s, `${id} ${me}+${mate}`).not.toMatch(/[{}]/);
      expect(s, `${id} ${me}+${mate}`).toContain(me === mate ? '同伴' : ({ ninja: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' } as const)[mate]);
    }
    expect(partnerCondLabel('medicine_cat', 'ninja', 'feifei')).toBe('讓她拿菲菲的毒試新解藥（最多失去 8 點生命；生命上限與當前生命各 +8）');
    expect(partnerCondLabel('medicine_cat', 'feifei', undefined), '球球的 hero 欄不填也認得').toContain('拿球球的毒');
  });

  it('畫面接線：只有同伴讓它出現（by 不是本機）才換，按鈕與擲骰那一句都走同一支', () => {
    const f = body('  const labelText = (i: number): string => {', '  ', ';');
    expect(f).toContain('c?.requires ? choiceGate(run, c, seat).by : undefined');
    expect(f).toContain("by !== undefined && by !== seat && partner ? partnerCondLabel(evd.id, me(run, seat).hero, partner.hero) : undefined");
    expect(f).toContain('return theirs ?? evText(labelRaw(i));');
    expect(EV).toContain('labelText(index) + ');
    expect(EV).toContain('選的「${labelText(chosen)}」');
    expect(EV).not.toMatch(/evText\(labelRaw\((?:index|chosen)\)\)/);
  });
});
