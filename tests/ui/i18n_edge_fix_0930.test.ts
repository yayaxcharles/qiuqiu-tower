import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { _setPackForTest } from '../../src/i18n';
import en from '../../src/i18n/en/index';
import ja from '../../src/i18n/ja/index';
import { enemyDisplay } from '../../src/i18n/speech';
import { cards } from '../../src/content/cards';
import { describeCardEn } from '../../src/i18n/en/cardtext';
import { HP_PAD, HUD_LEVEL_CLASSES, HUD_SLACK, HUD_WIDTH, hudClassesFor, hudShortfall, runHudFit, type HudAdapter } from '../../src/ui/hudfit';
import { BLESS_MIN_SCALE, blessRowScale, runBlessFit, type BlessAdapter } from '../../src/ui/blessfit';
import { SCENE_BOX_LIMIT, SCENE_MIN_TEXT, runSceneFit, scrollMaxHeight, type SceneAdapter } from '../../src/ui/scenefit';
import { LOOT_TOP_LIMIT, runLootFit } from '../../src/ui/lootfit';
import { INTENT_MAX_W, fitIntentWidth, fitNameWidth, shrinkToFit } from '../../src/ui/labelfit';
import { ART_MIN_RATIO, runNameWrap, runTextSpace } from '../../src/ui/cardfit';
import { TIP_MARGIN, TIP_STAGE_H, tipTop } from '../../src/ui/tippos';
import { layoutHooks, layoutOk, relayout, watchLayout } from '../../src/ui/layouthooks';

/*
 * 2026-09-30 英日極端版面修正（檢查報告 docs/檢查_英日極端版面_20260930.md 的 4 高 7 中），2026-10-01 審查後重寫。
 *
 * 這個倉庫的測試跑在 node、沒有版面引擎（雲端也沒裝 happy-dom），量像素的驗收在 `tools/i18n-edge/`（真的 Chrome、量元素外框，
 * 見 docs/修正_英日版面_20260930.md 的前後數字表）。這裡驗的是**行為**：每一支「放不下就退讓」的流程
 * （`src/ui/*fit.ts` 的 `run…Fit`）拿一個假的版面轉接器餵進去——假版面用報告量到的數字建模（每一級省多少像素）——
 * 驗它：放得下的時候一步都不動、放不下時退到剛好放得下、重跑結果一樣（轉向重量要冪等）、最後一級之後停手。
 * 少數釘接線的字串比對只留「首載不准 import 英日才用的版面程式」這類沒辦法用行為驗的約定。
 */
const read = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');   // 這台 core.autocrlf=true：多行比對前先換行
const css = (name: string): string => read(`src/ui/styles/${name}`);

afterAll(() => _setPackForTest('zh', null));

describe('狀態列（高-1、高-2）：逐級退讓、生命條比自己的字窄才算放不下、重跑冪等', () => {
  /** 假狀態列：各級省多少像素、秘寶一顆占多少（報告量到的英文桌機數字）；`base`＝第 0 級右緣，`hp`＝生命條目前寬 */
  function fakeHud(base: number, o: { relics?: number; hpNat?: number; hpText?: number; crowded0?: boolean } = {}) {
    const relics = o.relics ?? 8;
    const state = { level: 0, dropped: 0, resets: 0, applied: [] as number[] };
    const saved = [0, 60, 240, 130]; // 各級累計省多少：擠、只留圖示、短標
    const adapter: HudAdapter = {
      reset: () => { state.level = 0; state.dropped = 0; state.resets++; },
      apply: (l) => { state.level = l; state.applied.push(l); },
      shortfall: () => {
        const cut = [0, saved[1]!, saved[1]! + saved[2]!, saved[1]! + saved[2]! + saved[3]!][state.level]! + state.dropped * 34;
        const over = base - cut - HUD_WIDTH;
        // 生命條是唯一會縮的：先吸收超出（但不會比 0 窄），剩下的超出才算右緣掉出去
        const hpNat = o.hpNat ?? 220;
        const hp = Math.max(0, hpNat - Math.max(0, over));
        const right = Math.max(0, over - hpNat);
        return hudShortfall(HUD_WIDTH + right, hp, o.hpText ?? 90);
      },
      drop: () => { if (state.dropped >= relics) return false; state.dropped++; return true; },
    };
    return { adapter, state };
  }

  it('放得下就一步都不動：不走任何退讓', () => {
    const { adapter, state } = fakeHud(1280 + 0);
    expect(runHudFit(adapter)).toBe(0);
    expect(state.applied).toEqual([]);
  });
  it('繁中常見的「生命條縮到 120 還讀得到」不算放不下（這是審查抓到的：原本放得下的組合不能被推去退讓）', () => {
    // 右緣超出 100、生命條 220→120 吸收掉；字寬 90＋留邊 6 ＝ 96 ＜ 120
    const { adapter, state } = fakeHud(1280 + 100);
    expect(runHudFit(adapter)).toBe(0);
    expect(state.applied).toEqual([]);
    expect(hudShortfall(1280, 120, 90)).toBe(0);
  });
  it('生命條窄到放不下自己的字（41、67）才算放不下，缺多少就算多少', () => {
    expect(hudShortfall(1280, 67, 90)).toBe(90 + HP_PAD - 67);
    expect(hudShortfall(1280, 41, 90)).toBe(90 + HP_PAD - 41);
    expect(hudShortfall(1280 + 12, 0, 90)).toBe(12);   // 生命條看不見（戰鬥畫面隱藏）就只看右緣
  });
  it('右緣 1281 也算掉出去（不留 1 像素的寬限）', () => {
    expect(HUD_SLACK).toBe(0);
    expect(hudShortfall(1281, 220, 90)).toBe(1);
    expect(hudShortfall(1280, 220, 90)).toBe(0);
  });
  it('英文難度 5、12 件秘寶（原本超出 300 多像素）：退到放得下為止，最少的級數', () => {
    const { adapter, state } = fakeHud(1280 + 330);
    const lv = runHudFit(adapter);
    expect(adapter.shortfall()).toBe(0);
    expect(lv).toBeGreaterThan(0);
    expect(state.applied[state.applied.length - 1]).toBe(state.level);
    // 沒有多退：上一級是放不下的
    if (state.level > 1 && state.dropped === 0) { const prev = fakeHud(1280 + 330); prev.adapter.reset(); prev.adapter.apply(state.level - 1); expect(prev.adapter.shortfall()).toBeGreaterThan(0); }
  });
  it('所有類別級數都用完還放不下，才一顆一顆收秘寶；收到放得下就停', () => {
    const { adapter, state } = fakeHud(1280 + 800, { relics: 8 });
    const lv = runHudFit(adapter);
    expect(lv).toBe(HUD_LEVEL_CLASSES.length + 1);
    expect(state.dropped).toBeGreaterThan(0);
    expect(adapter.shortfall()).toBe(0);
  });
  it('沒得收了就停手（不無限迴圈）', () => {
    const { adapter, state } = fakeHud(1280 + 5000, { relics: 3 });
    runHudFit(adapter);
    expect(state.dropped).toBe(3);
  });
  it('冪等：轉向後重跑，先還原再量，結果跟第一次一樣', () => {
    const { adapter } = fakeHud(1280 + 330);
    const a = runHudFit(adapter);
    const b = runHudFit(adapter);
    expect(b).toBe(a);
  });
  it('每一級要加的類別：第 1 級擠、第 2 級只留圖示、第 3 級短標；第 0 級什麼都不加', () => {
    expect(hudClassesFor(0)).toEqual([]);
    expect(hudClassesFor(2)).toEqual(['crowded', 't-icons']);
    expect(hudClassesFor(99)).toEqual(['crowded', 't-icons', 't-short']);
  });
  it('樣式：生命條沒有固定下限（繁中原本靠它縮），字放不下才由程式退讓別的格；只留圖示的規則只在退讓的類別底下', () => {
    const comp = css('components.css');
    expect(comp).not.toMatch(/^\.hud-hp \{[^}]*min-width/m);
    expect(comp).not.toMatch(/^\.hud-hp \{[^}]*flex: (0 0 auto|none)/m);
    expect(comp).toMatch(/^\.hud-hp span \{[^}]*white-space: nowrap/m);   // 量字寬靠這個
    expect(comp).toContain('.hud.t-icons .hud-sound .lbl, .hud.t-icons .hud-seed .lbl,');
  });
  it('手機只留圖示：按鈕內距加大（每顆可點區夠大），關閉的三顆 🔇 後面帶一字短標分得出來', () => {
    expect(css('phone.css')).toContain('html[data-device="phone"][data-orient="landscape"] .hud.t-icons .btn.small { padding: 5px 9px; }');
    expect(css('components.css')).toContain('.hud.t-icons .hud-sound .kd { display: inline;');
  });
});

describe('開局祝福（高-4）：旁白蓋到卡片說明就讓位', () => {
  function fakeBless(overlap0: number, o: { l1?: number; l2?: number; rowH?: number } = {}) {
    const s = { level: 0, scale: 1, resets: 0 };
    const a: BlessAdapter = {
      reset: () => { s.level = 0; s.scale = 1; s.resets++; },
      setLevel: (l) => { s.level = l; },
      overlap: () => overlap0 - (s.level >= 1 ? (o.l1 ?? 40) : 0) - (s.level >= 2 ? (o.l2 ?? 30) : 0) - (1 - s.scale) * (o.rowH ?? 230),
      rowHeight: () => o.rowH ?? 230,
      scaleRow: (x) => { s.scale = x; },
    };
    return { a, s };
  }
  it('沒撞到：不動', () => { const { a, s } = fakeBless(-10); expect(runBlessFit(a)).toBe(0); expect(s.level).toBe(0); });
  it('英文桌機蓋住 64：縮旁白兩級就放得下，卡片排不縮', () => { const { a, s } = fakeBless(64); expect(runBlessFit(a)).toBe(2); expect(a.overlap()).toBeLessThanOrEqual(0); expect(s.scale).toBe(1); });
  it('只要一級就夠就停在第 1 級', () => { const { a } = fakeBless(30); expect(runBlessFit(a)).toBe(1); });
  it('兩級不夠才縮卡片排，縮到剛好不撞', () => { const { a, s } = fakeBless(93); expect(runBlessFit(a)).toBe(3); expect(s.scale).toBeLessThan(1); expect(a.overlap()).toBeLessThanOrEqual(0.5); });
  it('縮卡片排有下限 0.85', () => { expect(blessRowScale(120, 230)).toBe(BLESS_MIN_SCALE); expect(blessRowScale(23, 230)).toBeCloseTo(0.9, 2); expect(blessRowScale(0, 230)).toBe(1); });
  it('冪等：重跑結果一樣', () => { const { a } = fakeBless(93); const x = runBlessFit(a); expect(runBlessFit(a)).toBe(x); });
});

describe('事件文字（中-1）：縮字、收內距，最後捲動；插圖 210 下限不動', () => {
  function fakeScene(top0: number, o: { l1?: number; l2?: number; textH?: number } = {}) {
    const s = { level: 0, scrolled: 0 };
    const a: SceneAdapter = {
      reset: () => { s.level = 0; s.scrolled = 0; },
      boxTop: () => top0 + (s.level >= 1 ? (o.l1 ?? 60) : 0) + (s.level >= 2 ? (o.l2 ?? 50) : 0) + (s.scrolled ? (o.textH ?? 400) - s.scrolled : 0),
      setLevel: (l) => { s.level = l; },
      textHeight: () => o.textH ?? 400,
      scroll: (h) => { s.scrolled = h; },
    };
    return { a, s };
  }
  it('框頂已在線下：一步都不動', () => { const { a, s } = fakeScene(SCENE_BOX_LIMIT + 5); expect(runSceneFit(a)).toBe(0); expect(s.level).toBe(0); });
  it('缺 40：第 1 級放得下', () => { const { a } = fakeScene(SCENE_BOX_LIMIT - 40); expect(runSceneFit(a)).toBe(1); });
  it('缺 100：第 2 級放得下', () => { const { a } = fakeScene(SCENE_BOX_LIMIT - 100); expect(runSceneFit(a)).toBe(2); });
  it('英文桌機最糟（框頂 25、缺 175）：兩級不夠，文字改捲動，最大高度＝原高扣掉還缺的', () => {
    const { a, s } = fakeScene(25);
    expect(runSceneFit(a)).toBe(3);
    expect(s.scrolled).toBe(scrollMaxHeight(400, SCENE_BOX_LIMIT - (25 + 60 + 50)));
    expect(a.boxTop()).toBeGreaterThanOrEqual(SCENE_BOX_LIMIT);
  });
  it('捲動時文字那塊至少留三行', () => { expect(scrollMaxHeight(100, 65)).toBe(SCENE_MIN_TEXT); });
  it('冪等', () => { const { a } = fakeScene(25); const x = runSceneFit(a); expect(runSceneFit(a)).toBe(x); });
  it('可以給別的線（中間放牌的畫面用插圖底邊）', () => { const { a } = fakeScene(300); expect(runSceneFit(a, 280)).toBe(0); expect(runSceneFit(fakeScene(300).a, 340)).toBeGreaterThan(0); });
  it('插圖 210 下限沒動：`scene.ts` 的公式還在', () => { expect(read('src/ui/scene.ts')).toContain('Math.max(210, Math.min(360, textTop - ART_TOP - 8))'); });
});

describe('事件結果獲得物（中-2）：超出畫面上緣才收小', () => {
  it('放得下不動；超出 311 兩級後放得下；重跑冪等', () => {
    expect(LOOT_TOP_LIMIT).toBe(63);
    let lvl = 0;
    const reset = (): void => { lvl = 0; };
    const fit = (over0: number) => runLootFit(reset, (l) => { lvl = l; return over0 - (l >= 1 ? 200 : 0) - (l >= 2 ? 150 : 0); });
    expect(fit(-5)).toBe(0);
    expect(fit(311)).toBe(2);
    expect(fit(20)).toBe(1);
    expect(fit(311)).toBe(fit(311));
    expect(lvl).toBe(2);
  });
});

describe('提示框（中-3）：下緣不能出舞台', () => {
  const H = TIP_STAGE_H, M = TIP_MARGIN;
  it('放得下＝原位（錨點上緣往上 90）', () => { expect(tipTop(400, 200)).toBe(310); expect(tipTop(50, 200)).toBe(0); });
  it('英文忍具格（錨點 y≈560）提示框高 451：放到錨點上方，不出舞台、不蓋錨點', () => {
    const top = tipTop(560, 451);
    expect(top + 451).toBeLessThanOrEqual(H - M);
    expect(top).toBeGreaterThanOrEqual(M);
    expect(top + 451).toBeLessThanOrEqual(560);
  });
  it('上方也放不下：貼舞台下緣', () => { expect(tipTop(300, 700) + 700).toBe(H - M); });
  it('掛鉤：英日照上面的算法；繁中維持原位（回 undefined，`tooltip.ts` 改用原本的算式）', () => {
    _setPackForTest('en', en);
    const top = layoutHooks.tipTop?.(560, 451);
    expect(top).toBe(tipTop(560, 451));
    _setPackForTest('zh', null);
    expect(layoutHooks.tipTop?.(560, 451)).toBeUndefined();
  });
});

describe('意圖牌與名字牌（中-6、中-7）', () => {
  function label(w0: number, base: number, natural = w0) {
    const s = { size: base };
    const a = { baseSize: base, width: () => (natural * s.size) / base, setSize: (px: number) => { s.size = px; } };
    return { a, s, w0 };
  }
  it('縮字：一次 0.5、縮到放得下或碰到下限', () => {
    const width = (s: number): number => (249 * s) / 14;
    const s = shrinkToFit(14, 14 * 0.78, INTENT_MAX_W, width);
    expect(width(s)).toBeLessThanOrEqual(INTENT_MAX_W + 0.5);
    expect(shrinkToFit(14, 11, 100, width)).toBe(11);
    expect(shrinkToFit(14, 11, 300, width)).toBe(14);
  });
  it('意圖牌 249：縮到放得下（不用省略號）；手機 333 縮到下限仍放不下 → 回傳 true 要截省略號', () => {
    const l1 = label(249, 14);
    expect(fitIntentWidth(l1.a)).toBe(false);
    expect(l1.a.width()).toBeLessThanOrEqual(INTENT_MAX_W + 0.5);
    const l2 = label(333, 19);
    expect(fitIntentWidth(l2.a)).toBe(true);
  });
  it('放得下的意圖牌一個像素不動', () => { const l = label(150, 14); expect(fitIntentWidth(l.a)).toBe(false); expect(l.s.size).toBe(14); });
  it('名字牌 211 比框 190 寬：縮到放得下；本來放得下的不動', () => {
    const l = label(211, 15);
    expect(fitNameWidth(l.a, 190)).toBe(true);
    expect(l.a.width()).toBeLessThanOrEqual(190.5);
    const ok = label(150, 15);
    expect(fitNameWidth(ok.a, 190)).toBe(false);
    expect(ok.s.size).toBe(15);
  });
  it('省略號不能裁切牌子本身（紅光圈、落影是牌子的偽元素）：程式把省略號做在牌子裡面那層 span，牌子自己不設 overflow', () => {
    const src = read('src/i18n/layout.ts');
    expect(src).toContain("wrap.className = 'ell'");
    expect(src).toContain('display:block;overflow:hidden;text-overflow:ellipsis');
    expect(src).not.toMatch(/n\.style\.(overflow|textOverflow)/);
  });
});

describe('牌面（高-3、中-5）', () => {
  it('牌名兩行：字級為原本 0.85 倍；兩行還放不下再縮到最低 10', () => {
    let size = 0;
    let wrapped = false;
    const s = runNameWrap({ base: 14, wrap: () => { wrapped = true; }, setSize: (px) => { size = px; }, tooWide: () => false, tooTall: () => false });
    expect(wrapped).toBe(true);
    expect(s).toBe(12);
    const s2 = runNameWrap({ base: 14, wrap: () => undefined, setSize: (px) => { size = px; }, tooWide: () => size > 10.5, tooTall: () => false });
    expect(s2).toBe(10.5);
  });
  it('規則文字：先收行距；放得下就不動牌圖；不夠才一次 2px 縮牌圖，最多縮到七成', () => {
    let tight = false;
    let art = 84;
    const base = { tighten: () => { tight = true; }, artHeight: () => 84, setArt: (h: number) => { art = h; } };
    expect(runTextSpace({ ...base, overflow: () => false })).toBe(0);
    expect(tight).toBe(true);
    expect(art).toBe(84);
    // 缺 20 像素：牌圖縮 20
    expect(runTextSpace({ ...base, overflow: () => art > 64 })).toBe(20);
    // 怎麼縮都不夠：停在七成
    art = 84;
    const shrunk = runTextSpace({ ...base, overflow: () => true });
    expect(84 - shrunk).toBeGreaterThanOrEqual(84 * ART_MIN_RATIO - 1e-9);
    expect(shrunk).toBeGreaterThan(0);
  });
  it('英文連線牌尾巴那句改短：全部含這句的牌都寫成「Solo: partner = you.」', () => {
    const texts = cards.map((c) => describeCardEn(c, false)).concat(cards.map((c) => describeCardEn(c, true)));
    const solo = texts.filter((s) => s.includes('Solo:'));
    expect(solo.length).toBeGreaterThan(10);
    for (const s of solo) { expect(s).toContain('Solo: partner = you.'); expect(s).not.toContain('means you'); }
  });
  it('「· 雙人」走代號詞表、不再寫死在 CSS；牌名換行規則在樣式表', () => {
    const comp = css('components.css');
    expect(comp).not.toContain("content: '· 雙人'");
    expect(comp).toContain('.card-name.wrap { white-space: normal;');
    expect((en.term as Record<string, string>)['雙人']).toBe('Co-op');
    expect((ja.term as Record<string, string>)['雙人']).toBe('二人');
  });
});

describe('轉向重量：手機直拿不量，轉橫後對還在畫面上的重跑', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const fakeDoc = (device: string, orient: string) => ({ documentElement: { dataset: { device, orient } } });
  it('手機直拿時 layoutOk 是 false、橫拿是 true；桌機把視窗拉成直的樣式不變，照量', () => {
    vi.stubGlobal('document', fakeDoc('phone', 'portrait'));
    expect(layoutOk()).toBe(false);
    vi.stubGlobal('document', fakeDoc('phone', 'landscape'));
    expect(layoutOk()).toBe(true);
    vi.stubGlobal('document', fakeDoc('desktop', 'portrait'));
    expect(layoutOk()).toBe(true);
  });
  it('relayout 只重跑還連在畫面上的節點，離開畫面的自動撤掉', () => {
    const a = { isConnected: true } as unknown as Node;
    const b = { isConnected: true } as unknown as Node;
    const ran: string[] = [];
    watchLayout(a, () => ran.push('a'));
    watchLayout(b, () => ran.push('b'));
    relayout();
    expect(ran).toEqual(['a', 'b']);
    (b as unknown as { isConnected: boolean }).isConnected = false;
    ran.length = 0;
    relayout();
    expect(ran).toEqual(['a']);
    relayout();
    expect(ran).toEqual(['a', 'a']);
    (a as unknown as { isConnected: boolean }).isConnected = false;
    relayout();
  });
  it('接線：`app.ts` 方向或裝置變了就叫 relayout；`hud.ts`、`scene.ts`、`lootfit.ts` 都登記並在直拿時不量', () => {
    expect(read('src/ui/app.ts')).toContain('relayout();');
    for (const f of ['src/ui/scene.ts', 'src/ui/lootfit.ts', 'src/i18n/layout.ts']) {
      const src = read(f);
      expect(src, f).toContain('watchLayout(');
      expect(src, f).toContain('layoutOk()');
    }
  });
});

describe('首載瘦身：英日才用的版面程式不進首載，只留掛鉤', () => {
  it('只有英日語言包 import `layout`；首載側的檔案都不碰它們', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
    const importers = walk('src').filter((f) => f.endsWith('.ts') && /^import (.* from )?'(\.\.?\/)+(i18n\/)?layout';/m.test(read(f)));
    expect(importers.sort()).toEqual(['src/i18n/en/index.ts', 'src/i18n/ja/index.ts']);
    // `scenefit`、`blessfit`、`labelfit`、`cardfit`、`hudfit`、`tippos` 只准 `src/i18n/layout.ts`（與測試）用
    for (const name of ['scenefit', 'blessfit', 'labelfit', 'cardfit', 'hudfit', 'tippos']) {
      const users = walk('src').filter((f) => f.endsWith('.ts') && new RegExp(`^import .* from '[^']*/${name}';`, 'm').test(read(f)));
      expect(users, name).toEqual(['src/i18n/layout.ts']);
    }
  });
  it('掛鉤的空位都有：首載呼叫的是 `layoutHooks.xxx?.()`，沒掛（繁中）就什麼都不做', () => {
    expect(typeof layoutHooks.scene).toBe('function');   // 這支測試載了英日語言包，語言包載入就把版面程式掛上來
    expect(read('src/ui/hud.ts')).toContain('layoutHooks.hud(hud, relics, moreBtn, total)');   // 繁中沒有語言包：第一次畫狀態列時按需載入 layout
    expect(read('src/ui/hud.ts')).toContain("import('../i18n/layout')");
    expect(read('src/ui/tooltip.ts')).toContain('layoutHooks.tipTop?.(y, tip.offsetHeight) ?? Math.max(0, y - 90)');   // 繁中維持原位
    expect(read('src/ui/scene.ts')).toContain('layoutHooks.scene?.(scene, box)');
    expect(read('src/ui/scene.ts')).toContain('layoutHooks.showcase?.(scene, box)');
    expect(read('src/ui/cardview.ts')).toContain("layoutHooks.card?.(node, 'name')");
    expect(read('src/ui/cardview.ts')).toContain("layoutHooks.card?.(node, 'text')");
    expect(read('src/ui/screens/blessing.ts')).toContain('layoutHooks.bless?.(scene)');
    expect(read('src/ui/screens/combat.ts').match(/layoutHooks\.labels\?\.\(/g)?.length).toBe(3);
  });
});

describe('殘留中文（L-7）與其他', () => {
  it.each([['en', en], ['ja', ja]] as const)('%s：四位主角的影子名牌都翻了', (lang, pack) => {
    _setPackForTest(lang, pack);
    for (const zh of ['球球的影子', '菲菲的影子', '噹噹的影子', '封封的影子']) {
      const shown = enemyDisplay('mirror_qiuqiu', zh);
      expect(shown, `${lang} ${zh}`).not.toBe(zh);
      if (lang === 'en') expect(shown).not.toMatch(/[一-鿿]/);
    }
    _setPackForTest('zh', null);
  });
  it('繁中不變', () => { _setPackForTest('zh', null); expect(enemyDisplay('mirror_qiuqiu', '球球的影子')).toBe('球球的影子'); });
  it('難度短標「難{level}」英日有譯', () => {
    expect((en.ui as Record<string, string>)['難{level}']).toBe('D{level}');
    expect((ja.ui as Record<string, string>)['難{level}']).toBeTruthy();
  });
  it('貨架說明：只有英日放寬到六行，繁中那條原樣', () => {
    const c = css('screens.css');
    expect(c).toContain('.scene-goods .shop-item:not(.card-item) .small { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; overflow: hidden; }');
    expect(c).toContain('html[lang="en"] .scene-goods .shop-item:not(.card-item) .small,\nhtml[lang="ja"] .scene-goods .shop-item:not(.card-item) .small { -webkit-line-clamp: 6; line-clamp: 6; font-size: 10.5px; }');
  });
  it('分享鈕暫時字的 ✅⏳⚠ 只在只留圖示時才顯示，一般狀態維持原字', () => {
    const comp = css('components.css');
    expect(comp).toContain('.hud-seed .ico.tmp { display: none; }');
    expect(comp).toContain('.hud.t-icons .hud-seed .ico.tmp { display: inline; }');
    const hud = read('src/ui/hud.ts');
    expect(hud).toContain("setText(t('已複製！'), live, '✅')");
    expect(hud).not.toContain('`✅ ${');
  });
});
