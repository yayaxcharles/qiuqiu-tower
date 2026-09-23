import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventTextFor } from '../../src/content/event-text';
import { HEROES } from '../../src/engine/hero';
import { QMARK_ART, ambushOutcomes, rollQmark } from '../../src/engine/qmark';
import { newRun } from '../../src/engine/run';
import type { MapNode } from '../../src/engine/types';
import { BASE, MERCHANT_SPRITES, _setManifestForTest, heroArtUrls, setLocalHero, type Manifest } from '../../src/ui/assets';
import { deferredBgKeys, qmarkMainKeys } from '../../src/ui/bgacts';
import { mapHasQmark, qmarkArtUrls } from '../../src/ui/preload';
import { AMBUSH_LABELS, AMBUSH_TITLE, QMARK_BANNER, QMARK_REVEAL_MS, ambushEvent, loadQmarkText, qmarkTip } from '../../src/ui/qmark';
import APP_RAW from '../../src/ui/app.ts?raw';
import EVENT_RAW from '../../src/ui/screens/event.ts?raw';
import SHOP_RAW from '../../src/ui/screens/shop.ts?raw';
import CHEST_RAW from '../../src/ui/screens/chest.ts?raw';
import MAP_RAW from '../../src/ui/screens/map.ts?raw';

/*
 * 問號格變化的畫面那一半（2026-09-23 內容擴充第三批，設計稿 3-3、3-7；主控裁決第 3 條）。
 * 倉庫測試不能用瀏覽器環境，所以跟其他畫面測試一樣：純函式直接測、接線照原始碼的規矩測。實機驗收另外跑。
 */
const lf = (s: string): string => s.replace(/\r\n/g, '\n');
// 樣式表照其他畫面測試的做法直接讀檔（`?raw` 在測試環境拿不到樣式表的原文）
const APP = lf(APP_RAW), EVENT = lf(EVENT_RAW), SHOP = lf(SHOP_RAW), CHEST = lf(CHEST_RAW), MAP = lf(MAP_RAW), CSS = lf(readFileSync('src/ui/styles/screens.css', 'utf8'));
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
beforeEach(() => { _setManifestForTest(MANIFEST); });
afterEach(() => { _setManifestForTest(EMPTY); setLocalHero('ninja'); });

function method(src: string, start: string): string {
  const a = src.indexOf(start);
  if (a < 0) throw new Error(`找不到這一段：${start}`);
  return src.slice(a, src.indexOf('\n  }\n', a) + 4);
}

describe('問號格的說明寫出目前機率（主控裁決第 3 條）', () => {
  it('照累積寫 5%／10%／20%；5F 寫固定不會變；第一關 3F 以前寫不會是伏擊', () => {
    const run = newRun('qm-tip');
    run.act = 2;
    const n: MapNode = { id: 'f9-l2', floor: 9, lane: 2, type: '事件', next: [], eventId: run.map.nodes.find((x) => x.type === '事件' && x.floor !== 5)!.eventId };
    const pct = (q: number): string => { run.qmark = q; return qmarkTip(run, n).body; };
    expect(pct(0)).toContain('約 5% 會變');
    expect(pct(1)).toContain('約 10% 會變');
    expect(pct(3)).toContain('約 20% 會變');
    expect(pct(0)).toContain('最多 20%');
    expect(pct(0)).not.toContain('不會是伏擊');
    const f5 = run.map.nodes.find((x) => x.floor === 5)!;
    expect(qmarkTip(run, f5).body).toContain('固定的事件，不會變');
    run.act = 1;
    expect(qmarkTip(run, { ...n, floor: 3 }).body).toContain('這一格不會是伏擊');
    const done: MapNode = { ...n, variant: '行腳商' };
    expect(qmarkTip(run, done)).toEqual({ title: '問號格：行腳商', body: '這一格原本是問號格，走進去變成了行腳商。' });
  });

  it('地圖上每個還沒走過的問號格都掛這段說明；變過的換成實際的圖示、左上角掛小問號', () => {
    expect(MAP).toContain('const tip = qmarkTip(run, n);');
    expect(MAP).toContain('attachTextTooltip(btn, tip.title, tip.body);');
    expect(MAP).toContain("if (n.variant) btn.append(el('span', { class: 'map-qv' }, '？'));");
    expect(MAP).toContain('if (n.variant) return artUrl(\'icons\', ICON[VARIANT_ICON[n.variant]]);');
    expect(MAP).toMatch(/VARIANT_ICON: Record<QmarkVariant, MapNode\['type'\]> = \{ 伏擊: '戰鬥', 行腳商: '罐頭鋪', 路邊紙箱: '紙箱' \}/);
  });
});

describe('伏擊那一篇（事件畫面照一般事件畫）', () => {
  it('四隻的開頭與兩個結果都是自己的版本；選項標籤共用、效果照引擎那一份', async () => {
    const mod = await loadQmarkText();
    const run = newRun('qm-amb-ui');
    const n: MapNode = { id: 'f9-l2', floor: 9, lane: 2, type: '事件', next: [], eventId: 'x', variant: '伏擊' };
    rollQmark(run, n);
    for (const h of HEROES) {
      const ev = ambushEvent(n, h);
      expect(ev.id).toBe(QMARK_ART['伏擊']);
      expect(ev.title).toBe(AMBUSH_TITLE);
      expect(ev.text).toBe(mod.QMARK_TEXT[h].ambush.text);
      expect(ev.choices.map((c) => c.label)).toEqual([...AMBUSH_LABELS]);
      expect(ev.choices.map((c) => c.result)).toEqual([...mod.QMARK_TEXT[h].ambush.results]);
      expect(ev.choices.map((c) => c.outcome)).toEqual(ambushOutcomes(n));
    }
    expect(AMBUSH_LABELS).toEqual(['迎戰（進入戰鬥，勝利後額外獲得 20 條小魚乾）', '甩掉牠們（最多失去 6 點生命）']);
  });

  it('標題照樣過 `eventTextFor`（事件畫面那一行沒改），四隻讀到的都是「埋伏」', () => {
    for (const h of HEROES) expect(eventTextFor(h, AMBUSH_TITLE)).toBe(AMBUSH_TITLE);
    expect(EVENT).toContain('const title = eventTextFor(me(run, app.seat).hero, ev.title);');
  });

  it('事件畫面收下 `qmark` 那一篇，本文不再換口吻（已經是這一位的版本）', () => {
    expect(EVENT).toContain('const ev = qmark ?? (eventId ? eventById[eventId] : undefined);');
    expect(EVENT).toContain('if (qmark) return t;');
  });
});

describe('走進變了的格子（`app.ts` 的 `enterQmark`）', () => {
  it('走格子先分流：變了的一律走 `enterQmark`，事件格那一行照舊', () => {
    const enter = method(APP, '  enterNode(nodeId: string): void {');
    const at = enter.indexOf('if (node.variant) { this.enterQmark(node); return; }');
    expect(at).toBeGreaterThan(enter.indexOf('this.coop?.syncRun(run, nodeId);'));
    expect(at).toBeLessThan(enter.indexOf('switch (node.type)'));
    expect(enter).toContain("case '事件': this.enterEvent(node.eventId); break;");
  });

  it('行腳商的攤子當場抽、先掛上會話；拆地圖的投票處理；等文字與揭曉圖；換過去那一拍演揭曉', () => {
    const q = method(APP, '  private enterQmark(node: MapNode): void {');
    const shops = q.indexOf("const shops = variant === '行腳商' ? makeMerchants(run) : undefined;");
    expect(shops).toBeGreaterThan(0);
    expect(q.indexOf('this.coop?.attachShop(shops);')).toBeGreaterThan(shops);
    expect(q.indexOf('this.coop?.clearScreenHooks(target);')).toBeLessThan(q.indexOf('loadQmarkText()'));
    expect(q).toContain('warmQmarkArt(run, variant)');
    expect(q).toContain("variant === '伏擊' ? [loadEventScreen()] : []");
    expect(q).toContain('if (this.run !== run) return;');
    expect(q.indexOf('playQmarkReveal(this.overlay, variant);')).toBeGreaterThan(q.indexOf("this.show('chest'"));
  });

  it('揭曉一拍 0.4 秒以內翻完、整塊不擋點擊；三句橫幅照設計稿', () => {
    expect(QMARK_REVEAL_MS).toBe(400);
    const flip = /\.qmark-card \{[^}]*animation: qm-flip \.(\d+)s ease-out forwards; \}/.exec(CSS);
    const out = /\.qmark-flip \{[^}]*animation: qm-out \.(\d+)s \.(\d+)s ease-in forwards; \}/.exec(CSS);
    expect(flip, '找不到翻面的動畫').not.toBeNull();
    expect(out, '找不到淡出的動畫').not.toBeNull();
    const flipS = Number(`0.${flip![1]}`), [outS, delayS] = out!.slice(1).map((d) => Number(`0.${d}`));
    expect(delayS).toBeCloseTo(flipS);
    expect((flipS + outS!) * 1000).toBeLessThanOrEqual(QMARK_REVEAL_MS);
    // 翻面那一層不准動不透明度（會被壓平成 2D、背面翻不出來，實機膠卷抓到的）
    expect(/@keyframes qm-flip \{[^\n]*opacity/.test(CSS)).toBe(false);
    expect(CSS).toMatch(/\.qmark-card \{[^}]*transform-style: preserve-3d/);
    expect(CSS).toMatch(/\.qmark-reveal \{ position: absolute; inset: 0; pointer-events: none; \}/);
    expect(QMARK_BANNER).toEqual({ 伏擊: '不是事件——有埋伏！', 行腳商: '不是事件——遇到行腳商！', 路邊紙箱: '不是事件——路邊有個紙箱！' });
  });
});

describe('行腳商與路邊紙箱沿用罐頭鋪、紙箱畫面', () => {
  it('行腳商：先一段開頭、立繪用 `shop/merchant` 那三張、沒有放生與重整貨架、收攤的格子寫「收攤了」', () => {
    expect(SHOP).toContain("const base = mer ? 'shop/merchant' : 'shop/keeper';");
    expect(SHOP).toContain('actions: mer ? [leaveBtn()] : [reshuffle, remove, leaveBtn()],');
    expect(SHOP).toContain("if (mer && intro) {");
    expect(SHOP).toContain("eventArtKey('q_merchant')");
    expect(SHOP).toContain("(shopClosed(shop) ? (sold ? '買下了' : '收攤了') : undefined)");
    // 劃掉的原價不吃罐頭鋪的秘寶（主控裁決第 5 條）
    expect(SHOP).toContain('(mer ? runMods(run).shopMul : shopMulFor(run, seat))');
    expect(SHOP).toContain('const ledgerOn = (): boolean => !shop.merchant &&');
  });

  it('路邊紙箱：第一段換成揭曉圖與開頭、開箱照路邊紙箱的池子（單人、連線兩條都換）', () => {
    expect(CHEST).toContain("eventArtKey(road ? 'q_roadbox' : 'chest_closed')");
    expect(CHEST).toContain('road ? openRoadsideBox(run) : openChest(run)');
    expect(CHEST).toContain('road ? openRoadsideBoxCoop(run) : openChestCoop(run)');
    expect(CHEST).toContain('text: road ? road.opening : ');
  });
});

describe('三種的圖用到才下載（地圖上有問號格時背景預抓）', () => {
  it('球球版揭曉圖在「開場不載」名單裡；他版不在選角補載裡；行腳商立繪開場不載', () => {
    const skip = deferredBgKeys();
    for (const k of qmarkMainKeys()) expect(skip.has(k), k).toBe(true);
    expect(qmarkMainKeys()).toEqual(['bg/event_q_ambush', 'bg/event_q_merchant', 'bg/event_q_roadbox']);
    const heroUrls = heroArtUrls(['feifei', 'dangdang', 'fengfeng']);
    for (const h of ['feifei', 'dangdang', 'fengfeng']) {
      for (const id of Object.values(QMARK_ART)) expect(heroUrls).not.toContain(`${BASE}${MANIFEST.bg[`bg/event_${h}_${id}`]}`);
    }
    const assets = lf(readFileSync('src/ui/assets.ts', 'utf8'));
    expect(assets).toContain("if (g === 'sprites' && MERCHANT_SPRITES.includes(key)) continue;");
    expect(MERCHANT_SPRITES).toEqual(['shop/merchant', 'shop/merchant_happy', 'shop/merchant_no']);
  });

  it('預抓的是本機這一位的版本＋行腳商三張；地圖上沒有會變的問號格就不抓', () => {
    setLocalHero('dangdang');
    const urls = qmarkArtUrls();
    for (const id of Object.values(QMARK_ART)) expect(urls).toContain(`${BASE}${MANIFEST.bg[`bg/event_dangdang_${id}`]}`);
    for (const k of MERCHANT_SPRITES) expect(urls).toContain(`${BASE}${MANIFEST.sprites[k]}`);
    expect(qmarkArtUrls('伏擊')).toEqual([`${BASE}${MANIFEST.bg['bg/event_dangdang_q_ambush']}`]);
    const run = newRun('qm-pre');
    expect(mapHasQmark(run)).toBe(true);
    for (const n of run.map.nodes) if (n.type === '事件' && n.floor !== 5) run.trail.push(n.id);
    expect(mapHasQmark(run), '會變的都走過了').toBe(false);
    expect(MAP).toContain('if (mapHasQmark(run)) { void loadQmarkText().catch(() => undefined); void preloadQmarkArt(run); }');
  });
});
