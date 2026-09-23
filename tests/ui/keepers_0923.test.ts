import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HEROES } from '../../src/engine/hero';
import { KEEPERS } from '../../src/content/keepers';
import { KEEPER_TEXT, SWAP_LINES } from '../../src/content/shop-text';
import { newRun } from '../../src/engine/run';
import { BASE, _setManifestForTest, isGuestKeeperArt, type Manifest } from '../../src/ui/assets';
import { mapKeeperArtUrls } from '../../src/ui/preload';
import { _setShopTextImporterForTest, loadShopText, shopTextNow } from '../../src/ui/shop-text-loader';
import SHOP_RAW from '../../src/ui/screens/shop.ts?raw';
import MAP_RAW from '../../src/ui/screens/map.ts?raw';

/*
 * 罐頭鋪店主輪替的畫面與台詞（2026-09-23 內容擴充第三批 新J，design3 4-4、4-5、4-6）。
 * 畫面行為用純函式＋讀原始碼規矩測（倉庫不用 happy-dom，見共同規則）；實機截圖在 b3shop 報告。
 */
const SHOP = SHOP_RAW.replace(/\r\n/g, '\n');
const MAP = MAP_RAW.replace(/\r\n/g, '\n');
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
const GUESTS = ['tortoise', 'curio', 'junk'] as const;
/** 球球的句子最後一個字是「喵」（句尾標點不算） */
const endsMeow = (s: string): boolean => /喵[！？。…」]*$/u.test(s);

describe('台詞（design3 4-5）：三位店主 × 四隻，一句都不缺、口吻對', () => {
  it.each(GUESTS)('%s：碎念 6 句、初見一句、欠條一句；店主不講喵', (k) => {
    const t = KEEPER_TEXT[k];
    expect(t.chatter).toHaveLength(6);
    expect(t.firstMeet).toMatch(/^橘貓老闆今天不在/);
    expect(t.debt).toContain('十條');
    for (const s of [...t.chatter, t.firstMeet, t.debt]) expect(s).not.toContain('喵');
    for (const h of HEROES) {
      const L = t.byHero[h];
      expect(L.enter[0]).not.toContain('喵');
      expect(L.tooMuch[0]).not.toContain('喵');
      for (const s of [L.enter[0], L.enter[1], L.leave, L.tooMuch[0], L.tooMuch[1]]) expect(s.length, `${k} ${h}`).toBeGreaterThan(1);
    }
  });

  it('球球每句最後一個字是喵；菲菲、噹噹、封封一句都不帶喵', () => {
    for (const k of GUESTS) {
      const q = KEEPER_TEXT[k].byHero.ninja;
      for (const s of [q.enter[1], q.leave, q.tooMuch[1]]) expect(endsMeow(s), s).toBe(true);
      for (const h of ['feifei', 'dangdang', 'fengfeng'] as const) {
        const L = KEEPER_TEXT[k].byHero[h];
        for (const s of [L.enter[1], L.leave, L.tooMuch[1]]) expect(s, `${k} ${h}`).not.toContain('喵');
      }
    }
    expect(endsMeow(SWAP_LINES.ninja)).toBe(true);
    for (const h of ['feifei', 'dangdang', 'fengfeng'] as const) expect(SWAP_LINES[h]).not.toContain('喵');
  });

  it('噹噹跟封封叫師父「大俠貓」、不叫師父（婆婆那幾句是婆婆在講「大個子」）', () => {
    for (const k of GUESTS) for (const h of ['dangdang', 'fengfeng'] as const) {
      const L = KEEPER_TEXT[k].byHero[h];
      for (const s of [L.enter[1], L.leave, L.tooMuch[1]]) expect(s).not.toContain('師父');
    }
  });
});

describe('台詞放延後模組：罐頭鋪畫面、地圖都不直接載它', () => {
  it('src 底下只有延後載入的那一支用 `import(...)` 抓 shop-text，其餘只准 `import type`', () => {
    for (const f of ['src/ui/screens/shop.ts', 'src/ui/screens/map.ts', 'src/ui/app.ts', 'src/engine/run.ts', 'src/ui/preload.ts']) {
      const src = readFileSync(f, 'utf8');
      const staticImport = /import\s+(?!type\b)[^;]*from\s+'[^']*content\/shop-text'/.test(src);
      expect(staticImport, f).toBe(false);
    }
    expect(readFileSync('src/ui/shop-text-loader.ts', 'utf8')).toContain("import('../content/shop-text')");
  });

  it('載入器：同一時間只抓一次；失敗了下一次叫會重來', async () => {
    let calls = 0;
    let fail = true;
    _setShopTextImporterForTest(async () => {
      calls += 1;
      if (fail) throw new Error('網路斷了');
      return import('../../src/content/shop-text');
    });
    await expect(loadShopText()).rejects.toThrow('網路斷了');
    expect(shopTextNow()).toBeNull();
    fail = false;
    const [a, b] = await Promise.all([loadShopText(), loadShopText()]);
    expect(a).toBe(b);
    expect(calls).toBe(2);
    expect(shopTextNow()?.KEEPER_TEXT.curio.short).toBe('掌櫃');
    _setShopTextImporterForTest(() => import('../../src/content/shop-text'));
  });

  it('畫面層沒有寫喵（台詞全在 content）', () => {
    expect(SHOP).not.toContain('喵');
  });
});

describe('立繪用到才下載（design3 4-4）', () => {
  beforeEach(() => { _setManifestForTest(MANIFEST); });
  afterEach(() => { _setManifestForTest(EMPTY); });

  it('客座店主九張認得出來；橘貓老闆三張、行腳商三張不算', () => {
    const sprites = Object.keys(MANIFEST.sprites);
    expect(sprites.filter(isGuestKeeperArt).sort()).toEqual(
      GUESTS.flatMap((k) => ['', '_happy', '_no'].map((m) => `shop/keeper_${k}${m}`)).sort());
    for (const k of ['shop/keeper', 'shop/keeper_happy', 'shop/keeper_no', 'shop/merchant', 'shop/merchant_happy', 'shop/merchant_no']) {
      expect(isGuestKeeperArt(k), k).toBe(false);
    }
  });

  it('地圖上有哪一位的店才抓那一位的三張；只有橘貓老闆的地圖一張都不抓', () => {
    const run = newRun('keeper-urls');
    for (const n of run.map.nodes) delete n.keeper;
    expect(mapKeeperArtUrls(run)).toEqual([]);
    const shop = run.map.nodes.find((n) => n.type === '罐頭鋪')!;
    shop.keeper = 'curio';
    expect(mapKeeperArtUrls(run)).toEqual(['', '_happy', '_no'].map((m) => `${BASE}${MANIFEST.sprites[`shop/keeper_curio${m}`]}`));
  });

  it('開場預載跳過客座店主的立繪；地圖畫面叫預抓與台詞', () => {
    const assets = readFileSync('src/ui/assets.ts', 'utf8').replace(/\r\n/g, '\n');
    const preload = assets.slice(assets.indexOf('export async function preloadArt'));
    expect(preload).toContain("if (g === 'sprites' && isGuestKeeperArt(key)) continue;");
    expect(MAP).toContain('void preloadMapKeepers(run);');
    expect(MAP).toMatch(/void loadShopText\(\)\.catch/);
  });
});

describe('罐頭鋪畫面照店主換人（讀原始碼規矩）', () => {
  it('立繪鍵照店主：`<鍵>_happy`／`<鍵>_no` 沒有就退回招呼那張；名牌寫店主名字', () => {
    expect(SHOP).toContain('for (const key of mood === \'idle\' ? [K.art] : [`${K.art}_${mood}`, K.art]) {');
    expect(SHOP).toContain('speaker: K.name,');
    expect(SHOP).not.toContain("speaker: '橘貓老闆'");
    for (const k of ['orange', ...GUESTS] as const) expect(KEEPERS[k].art).toMatch(/^shop\/keeper(?:_[a-z]+)?$/);
  });

  it('放生價、確認框、引擎同一個數（帶貨架）；服務鈕排在放生與離開之間', () => {
    expect(SHOP).toContain('const releaseCost = removePrice(run, seat, shop);');
    expect(SHOP).toContain('buyRemove(run, uid, seat, shop)');
    expect(SHOP).toContain('actions: [reshuffle, remove, serviceBtn(), leaveBtn()],');
  });

  it('買滿 3 樣換「買太多」、離店講一句（單機、連線兩條路都有）；重整不算一樣', () => {
    expect(SHOP).toContain('if (t && boughtN === 3) talk =');
    expect(SHOP).toContain("{ app.backToMap(); sayLeave(); }");
    expect(SHOP).toContain('if (allDone()) { app.backToMap(); sayLeave(); return; }');
    expect(SHOP).toContain("bought('buy', false)");
    expect(SHOP).toContain("if (one.a.t === 'buy' || one.a.t === 'scrub') countBuy();");
  });

  it('地圖：客座店主那間疊小頭像、滑上去講招牌；橘貓老闆那間不疊', () => {
    expect(MAP).toContain("const keeper = n.type === '罐頭鋪' && n.keeper && n.keeper !== 'orange' ? KEEPERS[n.keeper] : undefined;");
    expect(MAP).toContain('attachTextTooltip(btn, `今天顧店：${keeper.name}`, keeper.tip)');
    for (const k of GUESTS) {
      const h = KEEPERS[k].head!;
      expect(h[0] + h[2]).toBeLessThanOrEqual(332);
      expect(h[1] + h[2]).toBeLessThanOrEqual(420);
      expect(KEEPERS[k].tip).toBeTruthy();
    }
    expect(KEEPERS.orange.head).toBeUndefined();
  });
});
