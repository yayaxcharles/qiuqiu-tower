import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { eventById } from '../../src/content/events';
import { rareEvents } from '../../src/content/events-rare';
import { MIASMA_PURE, relicById, relics } from '../../src/content/relics';
import { HEROES } from '../../src/engine/hero';
import { _setManifestForTest, artUrl, eventArtCast, eventArtKey, type Manifest } from '../../src/ui/assets';
import { deferredBgKeys, eventMainKeys } from '../../src/ui/bgacts';
import EVENT from '../../src/ui/screens/event.ts?raw';
import REST from '../../src/ui/screens/rest.ts?raw';
import MAP from '../../src/ui/screens/map.ts?raw';
import CHEST from '../../src/ui/screens/chest.ts?raw';
import REWARD from '../../src/ui/screens/reward.ts?raw';
import HUD from '../../src/ui/hud.ts?raw';
import ITEMS from '../../src/ui/itemcompendium.ts?raw';
import APP from '../../src/ui/app.ts?raw';

/*
 * 內容擴充第三批 b3rare 的畫面接線（2026-09-23）：稀有事件的圖（四隻各一套、主圖不進首載）、金牌「難得一見」、抽到之後那一句、
 * 挑一件淨化、貓窩點清心香、夢枕、箱中箱、藥簍各拿各的、地圖金色問號、狀態列紫火。
 * 畫面層不能用 DOM 測（雲端沒有 happy-dom），照這個倉庫的慣例讀原始碼釘住接線。
 */
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
afterEach(() => { _setManifestForTest(EMPTY); });
const lf = (s: string): string => s.replace(/\r\n/g, '\n');

describe('圖：四隻各看自己那一套、主圖不進首載', () => {
  it.each(HEROES)('%s：五篇主圖＋12 張結果圖＋神龕【魔氣】的結果圖', (hero) => {
    _setManifestForTest(MANIFEST);
    const keys: string[] = [];
    for (const e of rareEvents) keys.push(e.id, ...e.choices.flatMap((c) => (c.resultArt ? [c.resultArt] : [])));
    keys.push(eventById['broken_shrine']!.choices[2]!.resultArt!);
    expect(keys.length).toBe(5 + 12 + 1);   // 進戰鬥與無效果的選項不配（籤筒③、大魔物③、紫霧③）
    for (const k of keys) {
      const want = hero === 'ninja' ? `bg/event_${k}` : `bg/event_${hero}_${k}`;
      expect(eventArtKey(k, hero), `${hero} ${k}`).toBe(want);
      expect(MANIFEST.bg[want], `${want} 不在清單裡`).toBeTruthy();
      expect(eventArtCast(want), `${want} 畫的應該是 ${hero}`).toEqual([hero]);
    }
  });

  it('五篇的主圖不進首載（照地圖現抓）', () => {
    const deferred = deferredBgKeys();
    for (const e of rareEvents) {
      expect(eventMainKeys()).toContain(`bg/event_${e.id}`);
      expect(deferred.has(`bg/event_${e.id}`), `${e.id} 的主圖會進首載`).toBe(true);
    }
  });

  it('新秘寶 9 件與淨化版 6 件的圖示都在清單裡（鍵照 art5 對照表，魔氣殘片原件照舊用 demon_shard）', () => {
    _setManifestForTest(MANIFEST);
    const ids = ['herb_basket', 'dream_pillow', 'peace_cord', 'scout_staff', 'box_in_box', 'miasma_lantern', 'demon_seal', 'stamp_card', 'master_bracer', ...Object.values(MIASMA_PURE)];
    for (const id of ids) {
      const r = relicById[id]!;
      expect(r.art).toBe(`codex/relic_${id}`);
      expect(artUrl('icons', r.art).startsWith('data:'), `${id} 的圖示不在清單裡`).toBe(false);
    }
    expect(relicById['miasma_shard']!.art).toBe('codex/relic_demon_shard');
    expect(relics.length).toBe(126);
  });
});

describe('事件畫面', () => {
  const src = lf(EVENT);
  it('稀有事件：名牌旁的金牌「難得一見」（開場、結果、選牌三個畫面都掛）、開場播秘寶那聲', () => {
    expect(src).toContain("el('span', { class: 'rare-badge' }, '難得一見')");
    expect(src.match(/root\.append\(markRare\(sceneView\(/g)?.length).toBe(3);
    expect(src).toContain("if (ev.rare && !votes.some((v) => v !== null)) play('relic');");
  });
  it('抽到之後的那一句接在結果後面（從引擎寫的提示裡找抽到哪一格）', () => {
    // 結果文字照 b2fin 的 `resultHero` 換角色（2026-09-24 b3int 合併）
    expect(src).toContain('const resultText = evText(rawResult, resultHero) + lotteryAfter(evd.id, notes, me(run, seat).hero);');
  });
  it('挑一件淨化：單人挑完當場淨化；連線走 `evpurify` 投票、套用掛在 `take()` 裡、沒得挑的投空票', () => {
    expect(src).toContain("if ('purify' in outcome) {");
    expect(src).toContain("showPurifyPick(ids, (id) => {");
    expect(src).toContain("if (kind === 'evpurify') {");
    expect(src).toContain("purifyRelic(run, v, i, i === seat ? mine : undefined);");
    expect(src).toContain("if (outcomes.some((o) => !!o && 'purify' in o) && !(mine && 'purify' in mine)) coop.pick('evpurify', '');");
    // 有人要挑淨化也鎖「繼續」：2026-09-24 推前審查五 高-4 起記每一種（`PickWaits`），淨化那一種要自己湊齊
    expect(src).toContain('waitingPicks.start(outcomes);');
    expect(src).toContain("waitingPicks.settle('evpurify');");
  });
});

describe('貓窩、紙箱、獎勵、地圖、狀態列、圖鑑', () => {
  it('貓窩：有沾了魔氣的才出現「點一炷清心香」，送的是 `淨化` 動作；兩件以上可以按「先不要」', () => {
    const src = lf(REST);
    expect(src).toContain('const miasma = miasmaRelicsOf(run, seat);');
    expect(src).toContain("act({ t: 'rest', seat, c: '淨化', r: id }, () => rest(run, '淨化', undefined, seat, id))");
    expect(src).toContain('showPurifyPick(miasma, go, { cancellable: true })');
    expect(src).toContain("if (a.c === '淨化') { play('relic'); afterPurify(a.r ?? ''); continue; }");
  });
  it('貓窩：夢枕睡完先挑一張；連線時帶夢枕的人挑完（`restCard`）才算做完', () => {
    const src = lf(REST);
    expect(src).toContain('if (restCardChoices(run, seat).length) { showPillow(heal); return; }');
    expect(src).toContain("const pillowWait = a.t === 'rest' && a.c === '打盹' && restCardChoices(run, a.seat).length > 0;");
    expect(src).toContain("act({ t: 'restCard', seat, id }, () => takeRestCard(run, id, seat))");
  });
  it('紙箱：單人開完箱才多給、連線兩台在同一拍多給（都接在開箱那一支裡，畫面只拿回報來講）', () => {
    const src = lf(CHEST);
    // 路邊紙箱（問號格那條線）走同一支、一樣帶回報（2026-09-24 b3int 合併）
    expect(src).toContain('const id = road ? openRoadsideBox(run, seat, bonus) : openChest(run, seat, bonus);');
    expect(src).toContain('const offers: string[] = coop ? (road ? openRoadsideBoxCoop(run, bonusAll) : openChestCoop(run, bonusAll)) : [];');
    expect(src).not.toContain('openChestBonus');
  });
  it('獎勵：兩個人有人帶藥簍時各拿各的那一支', () => {
    expect(lf(REWARD)).toContain('const myPotion = r.potionPerSeat ? r.potionPerSeat[seat] ?? null : r.potion;');
  });
  it('地圖：走過的稀有事件那一格掛 `rare`（金色問號）；走進去當下的秘寶提示用公告講', () => {
    expect(lf(MAP)).toContain("if (n.type === '事件' && run.trail.includes(n.id) && eventById[n.eventId ?? '']?.rare) cls.push('rare');");
    expect(lf(APP)).toContain('const node = chooseNode(run, nodeId, entryNotes, this.seat);');
    expect(readFileSync('src/ui/styles/map.css', 'utf8')).toContain('.map-node.rare img');
  });
  it('狀態列：沾了魔氣的掛紫火、箱中箱用完變灰；圖鑑的淨化版跟在原件下面、沒拿過畫剪影', () => {
    expect(lf(HUD)).toContain("${isMiasma(id) ? ' miasma' : ''}${spent ? ' spent' : ''}");
    const css = readFileSync('src/ui/styles/components.css', 'utf8');
    expect(css).toContain('.hud-relic.miasma::before');
    expect(css).toContain('.hud-relic.spent img');
    expect(lf(ITEMS)).toContain("el('div', { class: `item-row pure${owned.includes(pure.id) ? '' : ' unseen'}` }");
    // `淨化` 池不自成一區（那一行照舊只有六池）
    expect(ITEMS).toContain("const RELIC_POOLS = ['起始', '常見', '大魔物', '塔主', '罐頭鋪', '事件'] as const;");
  });
});
