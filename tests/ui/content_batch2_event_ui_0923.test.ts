import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { eventById } from '../../src/content/events';
import { batch2Events } from '../../src/content/events-batch2';
import { HEROES } from '../../src/engine/hero';
import { _setManifestForTest, eventArtCast, eventArtKey, type Manifest } from '../../src/ui/assets';
import { deferredBgKeys, eventMainKeys } from '../../src/ui/bgacts';
import EVENT from '../../src/ui/screens/event.ts?raw';
import SCENE from '../../src/ui/scene.ts?raw';
import APP from '../../src/ui/app.ts?raw';

/*
 * 內容擴充第二批的事件畫面（2026-09-23）：
 *   - 圖：四隻各看自己那一套（美術代理 art3、art4 的對照表），連線三篇是純場景；主圖照地圖現抓、不進首載；
 *   - 畫面：條件選項的標籤與「因為…」、提示句、座位不對稱的文字與排法、兩位立繪、學完招接著挑牌升級。
 * 畫面層不能用 DOM 測（雲端沒有 happy-dom），照這個倉庫的慣例讀原始碼釘住接線。
 */
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
afterEach(() => { _setManifestForTest(EMPTY); });
const lf = (s: string): string => s.replace(/\r\n/g, '\n');
const CSS = readFileSync('src/ui/styles/screens.css', 'utf8');
const COND = ['sleeping_guard', 'medicine_cat', 'sparring_cat', 'heavy_door', 'greedy_merchant', 'old_master_ghost', 'lost_kitten', 'noisy_kitchen'];

describe('圖：四隻各看自己那一套，一張都不退回球球那張', () => {
  it.each(HEROES)('%s：十五篇（主圖＋每張結果圖）與八條條件選項的結果圖', (hero) => {
    _setManifestForTest(MANIFEST);
    const keys: string[] = [];
    for (const e of batch2Events.filter((x) => !x.coopOnly)) {
      keys.push(e.id, ...e.choices.flatMap((c) => (c.resultArt ? [c.resultArt] : [])));
    }
    for (const id of COND) keys.push(eventById[id]!.choices.find((c) => c.requires)!.resultArt!);
    expect(keys.length).toBe(15 + 35 + 8);   // 主圖 15、結果圖 35（進戰鬥與無效果的不配）、條件選項 8
    for (const k of keys) {
      const want = hero === 'ninja' ? `bg/event_${k}` : `bg/event_${hero}_${k}`;
      expect(eventArtKey(k, hero), `${hero} ${k}`).toBe(want);
      expect(MANIFEST.bg[want], `${want} 不在清單裡`).toBeTruthy();
      expect(eventArtCast(want), `${want} 畫的應該是 ${hero}`).toEqual([hero]);
    }
  });

  it('連線三篇：純場景（圖裡沒有主角），①② 兩個鍵指到同一張', () => {
    _setManifestForTest(MANIFEST);
    for (const id of ['coop_rope_bridge', 'coop_seesaw', 'coop_shooting_star']) {
      for (const hero of HEROES) expect(eventArtKey(id, hero)).toBe(`bg/event_${id}`);
      expect(eventArtCast(`bg/event_${id}`)).toEqual([]);
      expect(MANIFEST.bg[`bg/event_${id}_r1`]).toBe(MANIFEST.bg[`bg/event_${id}_r0`]);
      expect(MANIFEST.bg[`bg/event_${id}_r2`]).toBeTruthy();
    }
  });

  it('十八篇的主圖不進首載（照地圖現抓）', () => {
    const deferred = deferredBgKeys();
    for (const e of batch2Events) {
      expect(eventMainKeys()).toContain(`bg/event_${e.id}`);
      expect(deferred.has(`bg/event_${e.id}`), `${e.id} 的主圖會進首載`).toBe(true);
    }
  });
});

describe('事件畫面的接線（讀原始碼）', () => {
  const ev = lf(EVENT);

  it('選項照看得到的排（條件沒達成不顯示；座位 1 把「我拿」排第一）', () => {
    expect(ev).toContain('const order = choiceOrder(run, ev, seat);');
    expect(ev).toContain('order.forEach((index) => {');
    expect(ev, '還在把全部選項照原本順序畫出來').not.toContain('ev.choices.forEach((c, index) => {');
  });

  it('條件選項：金底標籤、按鈕下面一行「因為…」、事件開頭接提示句', () => {
    expect(ev).toContain("el('span', { class: 'choice-tag' }");
    expect(ev).toContain("el('span', { class: 'choice-why' }, condWhyLine(");
    expect(ev).toContain('const opening = evText(ev.text) + hints.join(\'\');');
    expect(ev).toMatch(/condHint\(ev\.id, me\(run, bySelf \? seat : gate\.by!\)\.hero\)/);
    expect(lf(CSS)).toContain('.scene-actions .btn .choice-tag');
    expect(lf(CSS)).toContain('.scene-actions .btn .choice-why');
  });

  it('座位不對稱：每一位套自己那一串效果、文字照自己的視角挑、連線的稱呼換掉', () => {
    expect(ev).toContain('applyRunEffects(run, choiceEffectsFor(c, i),');
    expect(ev).toContain('const raw = resultRaw(index);');
    expect(ev).toContain('evText(labelRaw(index))');
    expect(ev).toContain('coopFill(mine, me(run, seat).hero, partner.hero)');
  });

  it('連線限定事件兩位立繪站兩邊（本機在左、同伴在右）', () => {
    expect(ev).toContain('const coopPair = !!coop && !!ev.coopOnly && !!partner;');
    expect(ev).toContain('...(portrait2 ? { portrait2 } : {})');
    expect(lf(SCENE)).toContain("o.portrait2 ? el('img', { class: 'scene-portrait right', src: o.portrait2, alt: '' }) : ''");
    expect(lf(CSS)).toMatch(/\[data-screen="event"\] \.scene \.scene-portrait\.right \{ left: auto; right: 150px; scale: -1 1; \}/);
  });

  it('學完招接著挑牌升級（then）：單人、都不要、連線三條路都接上', () => {
    expect(ev).toContain('if (chained && afterLearn) { afterLearn(note, [got]); return; }');
    expect(ev).toContain("if (passLearn(seat, outcomes) && afterLearn) { afterLearn('一招都沒挑', []); return; }");
    expect(ev).toContain("awaitingPicks = outcomes.some((o) => !!o && 'chooseCard' in o && !!o.then);");
    expect(ev).toContain("else if (v === '' && i !== seat) passLearn(i, outcomes);");
    expect(ev).toContain('afterLearn = (note, learned) => settle(outcomes[seat] ?? null, raw,');
  });

  it('影子鏈那一場：配樂照鏡像戰、不跳鏡子的初見吐槽', () => {
    const app = lf(APP);
    expect(app).toContain("encounterId.startsWith('shadow_duel') ? 'shadow'");
    expect(app).toContain('const firstNew = encounterById[encounterId]?.skin ? undefined');
  });
});
