import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { eventById } from '../../src/content/events';
import { newCoopRun } from '../../src/engine/run';
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
    expect(EV).toContain('const resultText = evText(rawResult, resultHero);');
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
