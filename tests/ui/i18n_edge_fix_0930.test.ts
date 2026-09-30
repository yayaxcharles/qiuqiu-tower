import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { _setPackForTest } from '../../src/i18n';
import en from '../../src/i18n/en/index';
import ja from '../../src/i18n/ja/index';
import { enemyDisplay } from '../../src/i18n/speech';
import { cards } from '../../src/content/cards';
import { describeCardEn } from '../../src/i18n/en/cardtext';
import { HUD_LEVEL_CLASSES, HUD_PAD, HUD_WIDTH, dropUntilFits, hudClassesFor, hudOverflow, pickHudLevel, splitIcon } from '../../src/ui/hudfit';
import { BLESS_MIN_SCALE, blessRowScale, pickBlessLevel } from '../../src/ui/blessfit';
import { SCENE_BOX_LIMIT, SCENE_MIN_TEXT, pickSceneLevel, scrollMaxHeight } from '../../src/ui/scenefit';
import { LOOT_TOP_LIMIT, pickLootLevel } from '../../src/ui/lootfit';
import { INTENT_MAX_W, shrinkToFit } from '../../src/ui/labelfit';
import { TIP_MARGIN, TIP_STAGE_H, tipTop } from '../../src/ui/tippos';

/*
 * 2026-09-30 英日極端版面修正（檢查報告 docs/檢查_英日極端版面_20260930.md 的 4 高 7 中）。
 *
 * 這個倉庫的測試跑在 node、沒有版面引擎（雲端也沒裝 happy-dom），量像素的驗收在 `tools/i18n-edge/`（真的 Chrome、量元素外框，
 * 見 docs/修正_英日版面_20260930.md 的前後數字表）。這裡釘兩件事：
 *   ① 每一支「放不下就退讓」的純判斷（狀態列、祝福、事件文字、獲得物、提示框、名字與意圖牌）用報告量到的數字餵進去，退讓的結果要放得下；
 *   ② 接線與樣式：畫好之後真的有叫它、退讓的樣式真的存在、繁中不受影響的條件寫對了。
 * 拿掉任何一條修正（不叫 `fitHud`、樣式表少一段、英文牌尾巴句改回長的），對應的測試都會變紅。
 */
const read = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');   // 這台 core.autocrlf=true：多行比對前先換行
const css = (name: string): string => read(`src/ui/styles/${name}`);

afterAll(() => _setPackForTest('zh', null));

describe('高-1、高-2 狀態列：放不下就逐級退讓，音樂／音效／語音／分享鈕一顆都不掉出畫面', () => {
  /**
   * 報告量到的英文桌機寬度（版面像素，1280 寬、左右內距 14）：把每一格的寬度寫成「各級的寬」，
   * 模擬 `fitHud` 逐級套用之後最右邊那顆鈕的右緣。數字取自 hud_*.json（難度 5、12 件秘寶、忍具袋）。
   */
  const fixed = 14 + 178 + 10 + 176 + 10 + 60 + 10;   // 左內距、關名牌、生命條、小魚乾… 不會退讓的固定部分
  const widths = (level: number, relics: number): number => {
    const relicW = relics * (level >= 1 ? 30 : 38) + (relics > 8 ? 46 : 0);
    const potions = 3 * (level >= 1 ? 30 : 38);
    const diff = level >= 3 ? 46 : 212;                         // 「Difficulty 5·Demon Tower」→「D5」
    const deck = level >= 3 ? 70 : 108;                         // 「Deck 10」→「🎴 10」
    const comp = level >= 3 ? 44 : 170;                         // 「📖 Compendium」→「📖」
    const share = level >= 2 ? 52 : 158;                        // 「📤 Share Run」→「📤」
    const audio = level >= 2 ? 3 * 52 + 80 : 3 * 100 + 110;    // 音樂、音效、語音＋拉桿
    return fixed + relicW + potions + diff + deck + comp + share + audio + 60;
  };
  const over = (relics: number) => (level: number): number => widths(level, relics) - (HUD_WIDTH - HUD_PAD);

  it('原本：英文難度 5、12 件秘寶超出右緣 300 多像素（跟量到的一致）', () => {
    expect(over(12)(0)).toBeGreaterThan(300);
  });
  it('逐級退讓之後放得下；能只退到只留圖示就放得下的，不多退', () => {
    expect(pickHudLevel(over(0), 1)).toBeLessThanOrEqual(3);
    for (const n of [0, 8, 12]) {
      const l = pickHudLevel(over(n), 1);
      // 級數用完還放不下，就一顆顆收最舊的秘寶（每顆省 30 像素，第一次收出「+N」多 46）
      let icons = n;
      let extra = 0;
      dropUntilFits(() => widths(l, icons) + extra - (HUD_WIDTH - HUD_PAD), () => { if (icons === 0) return false; icons--; extra = 46; return true; });
      expect(widths(l, icons) + extra, `${n} 件秘寶`).toBeLessThanOrEqual(HUD_WIDTH - HUD_PAD + 0.5);
    }
    // 音效鈕只留圖示（第 2 級）就放得下的情況，不會被推去縮難度牌子
    const light = (level: number): number => (level >= 2 ? -20 : 90);
    expect(pickHudLevel(light, 1)).toBe(2);
  });
  it('每一級都放不下就停在最後一級，再一顆顆收最舊的秘寶進「+N」直到放得下；沒得收就停手', () => {
    expect(pickHudLevel(() => 500, 1)).toBe(HUD_LEVEL_CLASSES.length);
    let pixels = 200;
    let icons = 8;
    const dropped = dropUntilFits(() => pixels, () => { if (icons === 0) return false; icons--; pixels -= 38; return true; });
    expect(dropped).toBe(6);            // 200 → 需要收 6 顆（38×6=228）
    expect(pixels).toBeLessThanOrEqual(0.5);
    expect(dropUntilFits(() => 999, () => false)).toBe(0);
    let calls = 0;
    expect(dropUntilFits(() => 999, () => { calls++; return true; }, 5)).toBe(5);   // 量測壞掉時保險：最多收 5 顆就停
    expect(calls).toBe(5);
  });
  it('每一級要加的類別：第 1 級擠、第 2 級只留圖示、第 3 級短標；第 0 級什麼都不加', () => {
    expect(hudClassesFor(0)).toEqual([]);
    expect(hudClassesFor(2)).toEqual(['crowded', 't-icons']);
    expect(hudClassesFor(3)).toEqual(['crowded', 't-icons', 't-short']);
    expect(hudClassesFor(99)).toEqual(['crowded', 't-icons', 't-short']);
  });
  it('右緣算法：最右那顆的左緣加寬度，超出 1280−14 的部分', () => {
    expect(hudOverflow(1100, 166)).toBe(0);
    expect(hudOverflow(1200, 160)).toBe(94);
  });
  it('「🔊 SFX」拆成圖示與字（字前面帶空白）；沒有空白就整段當字', () => {
    expect(splitIcon('🔊 SFX')).toEqual({ icon: '🔊', label: ' SFX' });
    expect(splitIcon('🗣 ボイス')).toEqual({ icon: '🗣', label: ' ボイス' });
    expect(splitIcon('Share')).toEqual({ icon: '', label: 'Share' });
  });

  const hud = read('src/ui/hud.ts');
  const comp = css('components.css');
  it('接線：狀態列畫完最後一步就是 `fitHud`；三顆音訊鈕、圖鑑、分享鈕都拆成圖示＋字，按了以後也走同一個拆法', () => {
    expect(hud).toContain('fitHud(hud, relics, moreBtn, totalRelics);\n  return hud;');
    expect(hud).toContain('iconLabel(sound, soundOn()');
    expect(hud).toContain('iconLabel(music, musicOn()');
    expect(hud).toContain('iconLabel(voice, voiceOn()');
    expect(hud).toContain('iconLabel(compBtn, ');
    expect(hud).toContain('iconLabel(sound, on ?');
    expect(hud).toContain('iconLabel(music, toggleMusic()');
    expect(hud).toContain('iconLabel(voice, toggleVoice()');
    // 沒有人把按鈕字直接寫回 textContent（會把 .ico／.lbl 兩段洗掉）
    expect(hud).not.toMatch(/(sound|music|voice)\.textContent\s*=/);
    // 一顆顆收秘寶時「+N」一定有（戰鬥閃光靠它找退路，見 combat.ts 的 `?? more`）
    expect(hud).toContain("relics.querySelector('.hud-relic-more')?.remove();\n    relics.append(moreBtn(total - shown));");
  });
  it('樣式：生命條不再是被壓扁的那格；只留圖示、短標的規則都在，而且是掛在 `.hud.t-icons`／`.hud.t-short` 底下（平常不生效）', () => {
    expect(comp).toMatch(/\.hud-hp \{[^}]*flex: 0 0 auto;[^}]*min-width: 146px;/);
    expect(comp).toContain('.hud.t-icons .hud-sound .lbl, .hud.t-icons .hud-seed .lbl,');
    expect(comp).toContain('.hud.t-short .hud-comp .lbl, .hud.t-short .hud-deck .lbl, .hud.t-short .hud-diff .full { display: none; }');
    expect(comp).toContain('.hud-deck .ico, .hud-diff .short { display: none; }');
  });
  it('難度短標「難{level}」英日有譯', () => {
    expect((en.ui as Record<string, string>)['難{level}']).toBe('D{level}');
    expect((ja.ui as Record<string, string>)['難{level}']).toBeTruthy();
  });
});

describe('高-4 開局祝福：旁白蓋到卡片說明就讓位（旁白縮字、收內距、最後才縮卡片排）', () => {
  it('英文桌機旁白蓋住第四張卡 64 像素：先靠縮旁白字（第 1 級）讓 40、第 2 級再讓 30，兩級就放得下', () => {
    const overlap = (l: number): number => 64 - (l >= 1 ? 40 : 0) - (l >= 2 ? 30 : 0);
    expect(pickBlessLevel(overlap)).toBe(2);
    expect(pickBlessLevel((l) => (l >= 1 ? -3 : 30))).toBe(1);
  });
  it('兩級都不夠才縮卡片排：縮到剛好不撞，最小 0.85', () => {
    expect(blessRowScale(23, 230)).toBeCloseTo(0.9, 2);
    expect(blessRowScale(0, 230)).toBe(1);
    expect(blessRowScale(120, 230)).toBe(BLESS_MIN_SCALE);
  });
  it('接線與樣式：畫完 `root.append(scene)` 就 `fitBlessing`；退讓的類別在樣式表；沒動主圖（`.bless-art` 高度仍是 250）', () => {
    const src = read('src/ui/screens/blessing.ts');
    expect(src).toContain('root.append(scene);\n    fitBlessing(scene);');
    const c = css('screens.css');
    expect(c).toContain('.scene.bless-fit-1 .scene-box .scene-text { font-size: 19px; line-height: 1.45; letter-spacing: 0; }');
    expect(c).toContain('.scene.bless-fit-2 .scene-box .bless-say');
    expect(c).toContain('.bless-art { height: 250px;');
  });
});

describe('高-3、中-5 卡牌：英文單人那句縮短、牌名放不下換兩行、文字放不下才動牌圖，放得下的一個像素都不動', () => {
  it('英文連線牌尾巴那句改短：全部含這句的牌都寫成「Solo: partner = you.」，不再有舊的長句', () => {
    const texts = cards.map((c) => describeCardEn(c, false)).concat(cards.map((c) => describeCardEn(c, true)));
    const solo = texts.filter((s) => s.includes('Solo:'));
    expect(solo.length).toBeGreaterThan(10);
    for (const s of solo) {
      expect(s).toContain('Solo: partner = you.');
      expect(s).not.toContain('means you');
    }
  });
  const view = read('src/ui/cardview.ts');
  it('`fitCardText`：牌名縮到 9px 還放不下就換兩行（`.wrap`），規則文字縮到 10px 還被切才收行距、縮牌圖（最多縮到七成）', () => {
    expect(view).toContain("name.classList.add('wrap');");
    expect(view).toContain("t.style.lineHeight = '1.2';");
    expect(view).toContain('art.style.height = `${h}px`;');
    expect(view).toContain('export const ART_MIN_RATIO = 0.7;');
    // 牌名要先於規則文字處理：換兩行會多佔一行高，規則文字要在那之後才量
    expect(view.indexOf("name.classList.add('wrap')")).toBeLessThan(view.indexOf('size > 10'));
    expect(css('components.css')).toContain('.card-name.wrap { white-space: normal;');
  });
  it('L-7「· 雙人」：CSS 不再寫死中文，改由 `.coop-tag` 走代號詞表', () => {
    const comp = css('components.css');
    expect(comp).not.toContain("content: '· 雙人'");
    expect(comp).toContain('.card.coop .card-type .coop-tag {');
    expect(view).toContain("el('span', { class: 'coop-tag' }, `· ${term('雙人')}`)");
    expect((en.term as Record<string, string>)['雙人']).toBe('Co-op');
    expect((ja.term as Record<string, string>)['雙人']).toBe('二人');
  });
});

describe('中-1 事件：文字太長蓋到插圖，文字這邊讓位（縮字、收內距、最後捲動），插圖的 210 下限不動', () => {
  it('對白框上緣要在 200 以下（跟報告「插圖底減 30」同一條線）；先縮字、再收內距，仍不夠才捲動', () => {
    expect(SCENE_BOX_LIMIT).toBe(200);
    // 報告的最糟畫面：英文桌機 greedy_merchant 框頂 81（場景座標 25）→ 缺 175
    const deficit = (l: number): number => 175 - (l >= 1 ? 60 : 0) - (l >= 2 ? 50 : 0);
    expect(pickSceneLevel(deficit)).toBe(2);          // 兩級都不夠
    expect(deficit(2)).toBeGreaterThan(0);            // → 走第 3 級：捲動
    expect(scrollMaxHeight(400, 65)).toBe(335);
    expect(scrollMaxHeight(100, 65)).toBe(SCENE_MIN_TEXT);   // 再擠也留三行
    expect(pickSceneLevel((l) => (l >= 1 ? -1 : 25))).toBe(1);
  });
  it('接線：在 `fitArt` 決定插圖高度之前先讓文字讓位；只有英日走；插圖下限仍是 210', () => {
    const scene = read('src/ui/scene.ts');
    expect(scene).toContain('fitSceneText(scene, box);');
    expect(scene.indexOf('fitSceneText(scene, box);')).toBeLessThan(scene.indexOf('img.style.height = `${Math.max(210, Math.min(360, textTop - ART_TOP - 8))}px`;'));
    expect(scene).toContain("if (getLang() === 'zh' || !text) return;");
    expect(scene).toContain('Math.max(210, Math.min(360, textTop - ART_TOP - 8))');
    const c = css('screens.css');
    expect(c).toContain('.scene.text-fit-1 .scene-text { font-size: 19.5px; line-height: 1.45; }');
    expect(c).toContain('.scene.text-scroll .scene-text { overflow-y: auto;');
    // 手機的選項鈕本來最矮 72，讓位那兩級收到 62／54；規則要以 `html[data-device="phone"]` 開頭（phone_landscape 測試會逐條查）
    expect(css('phone.css')).toContain('html[data-device="phone"][data-orient="landscape"] #stage .scene.text-fit-1 .scene-actions .btn:not(.small) { min-height: 62px;');
  });
});

describe('中-2 事件結果：獲得物展示超出畫面上緣就收小（先拿掉圖示上方那段效果，再縮圖示與名字），放得下的不動', () => {
  it('上緣要在狀態列（56＋3）以下；兩級退讓', () => {
    expect(LOOT_TOP_LIMIT).toBe(63);
    expect(pickLootLevel((l) => 311 - (l >= 1 ? 200 : 0) - (l >= 2 ? 150 : 0))).toBe(2);   // 英文最糟超出 311：兩級後放得下
    expect(pickLootLevel((l) => (l >= 1 ? 0 : 20))).toBe(1);
  });
  it('接線：畫完等插圖縮高（同一格、`fitArt` 之後）再量；樣式在 `.showcase.icons.fit-N`', () => {
    const ev = read('src/ui/screens/event.ts');
    expect(ev).toContain('requestAnimationFrame(() => fitLoot(scene))');
    expect(ev).toContain('root.append(markRare(sceneView({');
    expect(css('screens.css')).toContain('.showcase.icons.fit-1 .loot-above, .showcase.icons.fit-2 .loot-above { display: none; }');
  });
});

describe('中-3 提示框：下緣不能出舞台（放得下照原樣，放不下改放錨點上方，再不行貼下緣）', () => {
  const H = TIP_STAGE_H, M = TIP_MARGIN;
  it('放得下＝原本的位置（錨點上緣往上 90），一個像素都不動', () => {
    expect(tipTop(400, 200)).toBe(310);
    expect(tipTop(50, 200)).toBe(0);
  });
  it('報告的最糟：英文忍具格（錨點在左下、y≈600）提示框高 451，下緣原本超出畫面 170 像素 → 放到錨點上方', () => {
    const top = tipTop(560, 451);
    expect(top + 451).toBeLessThanOrEqual(H - M);
    expect(top).toBeGreaterThanOrEqual(M);
    expect(top + 451).toBeLessThanOrEqual(560);   // 不蓋住錨點
  });
  it('錨點在上半、提示框很高（上方也放不下）→ 貼舞台下緣', () => {
    const top = tipTop(300, 700);
    expect(top + 700).toBe(H - M);
  });
  it('接線：提示框掛上去以後量它的高度再決定位置', () => {
    const tip = read('src/ui/tooltip.ts');
    expect(tip).toContain('tip.style.top = `${tipTop((r.top - s.top) / scale, tip.offsetHeight)}px`;');
  });
});

describe('中-4 罐頭鋪貨架說明：英日放寬到六行；繁中維持四行', () => {
  it('只有 `html[lang="en"]`／`html[lang="ja"]` 的規則改夾行與字級；繁中那條原樣', () => {
    const c = css('screens.css');
    expect(c).toContain('.scene-goods .shop-item:not(.card-item) .small { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; overflow: hidden; }');
    expect(c).toContain('html[lang="en"] .scene-goods .shop-item:not(.card-item) .small,\nhtml[lang="ja"] .scene-goods .shop-item:not(.card-item) .small { -webkit-line-clamp: 6; line-clamp: 6; font-size: 10.5px; }');
  });
});

describe('中-6、中-7 意圖牌與名字牌：放不下就縮字（意圖牌最寬 200、縮到下限改省略號；名字牌釘死高度再縮）', () => {
  it('縮字的算法：一次 0.5、縮到放得下或碰到下限就停', () => {
    // 報告：英文「Debuff Belly Drum(Seen Through)」在 14px 寬 249；寬度隨字級等比縮
    const width = (s: number): number => (249 * s) / 14;
    const s = shrinkToFit(14, 14 * 0.78, INTENT_MAX_W, width);
    expect(width(s)).toBeLessThanOrEqual(INTENT_MAX_W + 0.5);
    expect(s).toBeGreaterThanOrEqual(14 * 0.78);
    // 太寬縮不下：停在下限
    expect(shrinkToFit(14, 11, 100, width)).toBe(11);
    // 本來就放得下：一個像素都不動
    expect(shrinkToFit(14, 11, 300, width)).toBe(14);
  });
  it('接線：戰場整頁重畫與只換魔物的輕量重畫都叫 `fitUnitLabels`；名字牌縮字前先釘死高度與行高（立繪位置不能動）', () => {
    const combat = read('src/ui/screens/combat.ts');
    expect(combat.match(/^\s*fitUnitLabels\(field\);/gm)?.length).toBe(2);   // 行首才算（被註解掉的不算）
    const label = read('src/ui/labelfit.ts');
    expect(label).toContain('node.style.height = `${h}px`;\n  node.style.lineHeight = `${h}px`;');
    expect(label.indexOf('node.style.height')).toBeLessThan(label.indexOf('shrinkToFit(base, base * NAME_MIN_RATIO'));
  });
});

describe('L-7 影球球那場戰鬥紀錄的說話者「球球的影子」英日有譯（原本英日紀錄裡是中文）', () => {
  it.each([['en', en], ['ja', ja]] as const)('%s：四位主角的影子名牌都翻了、沒有中文', (lang, pack) => {
    _setPackForTest(lang, pack);
    for (const zh of ['球球的影子', '菲菲的影子', '噹噹的影子', '封封的影子']) {
      const shown = enemyDisplay('mirror_qiuqiu', zh);
      expect(shown, `${lang} ${zh}`).not.toBe(zh);   // 譯過了（日文的「影」也是漢字，不能用「沒有漢字」判斷）
      if (lang === 'en') expect(shown, `${lang} ${zh}`).not.toMatch(/[一-鿿]/);
    }
    _setPackForTest('zh', null);
  });
  it('繁中不變', () => {
    _setPackForTest('zh', null);
    expect(enemyDisplay('mirror_qiuqiu', '球球的影子')).toBe('球球的影子');
  });
});
