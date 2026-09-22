import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import APP from '../../src/ui/app.ts?raw';
import MAP from '../../src/ui/screens/map.ts?raw';
import REWARD from '../../src/ui/screens/reward.ts?raw';
import REST from '../../src/ui/screens/rest.ts?raw';
import EVENT from '../../src/ui/screens/event.ts?raw';
import { dialogue, type DialogueLine } from '../../src/content/dialogue';
import { FIXED_EVENT_FLOOR_5, events } from '../../src/content/events';
import { newCoopRun, rest, revivePartner } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { _setManifestForTest, eventArtCast, eventArtKey, setLocalHero, type Manifest } from '../../src/ui/assets';
import { portraitHero, portraitPlan } from '../../src/ui/dialogue';
import { confirmReady, eventPickRule } from '../../src/ui/deckview';
import { restMateNote } from '../../src/ui/screens/rest';
import { closeScreenModals, closeWithScreen } from '../../src/ui/overlay';
import DECKVIEW from '../../src/ui/deckview.ts?raw';
import RELICLIST from '../../src/ui/reliclist.ts?raw';

/*
 * 2026-09-22 兩份盤點報告裡「戰鬥以外的流程、對白、連線」那幾件。
 * 畫面函式本身要整個舞台才跑得動，能抽成純函式的就直接測；只能看原始碼的那幾行照 combat_motion_flow 的做法切出來執行或比對。
 */
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
afterEach(() => { _setManifestForTest(MANIFEST); setLocalHero(undefined); });

function sourceBetween(src: string, start: string, end: string): string {
  const s = src.replace(/\r\n/g, '\n');
  const a = s.indexOf(start);
  const b = s.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`找不到這一段：${start}`);
  return s.slice(a, b);
}

describe('連線盤點 問題 1：有球球的混搭局，另一位也要知道同伴是球球', () => {
  /** 把 `App.syncStory` 那一支原封不動切出來跑（球球那位的 `hero` 欄位刻意不寫） */
  async function sync(players: { hero?: string }[], seat: number): Promise<{ partner?: string; mirror?: string } | null> {
    const body = sourceBetween(APP, '  syncStory(run: RunState = this.run as RunState): void {', '  /** `from` 給了就用它接著打');
    const js = (await transformWithOxc(`class A { seat = 0; run: RunState | null = null; ${body} }\nreturn A;`, 'sync.ts')).code;
    let got: { partner?: string; mirror?: string } | null = null;
    const A = new Function('me', 'setCoopStory', js)(me, (ctx: typeof got) => { got = ctx; }) as new () => { seat: number; syncStory(run: unknown): void };
    const app = new A();
    app.seat = seat;
    app.syncStory({ players });
    return got;
  }

  it('菲菲坐 1 號、球球坐 0 號：她那邊的同伴是球球（原本是空的，整局播單人劇情）', async () => {
    expect(await sync([{}, { hero: 'feifei' }], 1)).toEqual({ partner: 'ninja', mirror: 'ninja' });
  });
  it('噹噹坐 0 號、球球坐 1 號也一樣', async () => {
    expect(await sync([{ hero: 'dangdang' }, {}], 0)).toEqual({ partner: 'ninja', mirror: 'dangdang' });
  });
  it('球球那邊照舊找得到同伴；同角色雙人不算搭檔', async () => {
    expect(await sync([{}, { hero: 'feifei' }], 0)).toEqual({ partner: 'feifei', mirror: 'ninja' });
    expect(await sync([{}, {}], 1)).toEqual({ mirror: 'ninja' });
  });
});

describe('畫面盤點 問題 3、5：對白放不放頭像、戰場上藏哪一格', () => {
  it('旁白、村貓沒有臉：一格都不藏（倒下旁白一出來，倒地的貓不能整隻不見）', () => {
    _setManifestForTest(MANIFEST);
    const ctx = { artCast: [], mine: 'ninja' };
    expect(portraitPlan('旁白', false, ctx)).toEqual({ show: true, hide: '' });
    expect(portraitPlan('村貓', false, ctx)).toEqual({ show: true, hide: '' });
  });

  it('關主、黑貓頭目的臉疊在左邊那一格上：只讓那一格讓位，不藏別隻', () => {
    _setManifestForTest(MANIFEST);
    const ctx = { artCast: [], mine: 'feifei', mate: 'ninja' };
    expect(portraitPlan('塔主', false, ctx)).toEqual({ show: true, hide: 'slot' });
    expect(portraitPlan('黑貓忍者頭目', false, ctx)).toEqual({ show: true, hide: 'slot' });
  });

  it('頭像就是戰場上那隻：那一格也藏（同一隻不同時出現兩次）；同角色雙人兩格都藏', () => {
    _setManifestForTest(MANIFEST);
    setLocalHero('feifei');
    expect(portraitPlan('菲菲', true, { artCast: [], mine: 'feifei', mate: 'ninja' }).hide).toBe('slot mine');
    expect(portraitPlan('球球', true, { artCast: [], mine: 'feifei', mate: 'ninja' }).hide).toBe('slot mate');
    expect(portraitPlan('球球', false, { artCast: [], mine: 'feifei', mate: 'ninja' }).hide, '劇本寫「球球」＝本機這一位').toBe('slot mine');
    setLocalHero('ninja');
    expect(portraitPlan('球球', false, { artCast: [], mine: 'ninja', mate: 'ninja' }).hide).toBe('slot mine mate');
    expect(portraitPlan('球球', false, { artCast: [], mine: 'ninja' }).hide, '單人').toBe('slot mine');
  });

  it('插圖裡已經畫了這隻貓：不放頭像；插圖裡沒有牠照舊放', () => {
    expect(portraitPlan('噹噹', false, { artCast: ['dangdang'], mine: 'dangdang' })).toEqual({ show: false, hide: '' });
    expect(portraitPlan('噹噹', false, { artCast: ['ninja'], mine: 'dangdang' }).show).toBe(true);
    expect(portraitPlan('旁白', false, { artCast: ['dangdang'], mine: 'dangdang' }).show).toBe(true);
  });

  it('樣式表只照 data-hide 藏，不再有「對白一出來就把主角藏起來」那條', () => {
    const css = readFileSync('src/ui/styles/screens.css', 'utf8');
    expect(css).not.toContain('#stage:has(#overlay .dialogue-overlay) .combat .unit.player .sprite-box');
    expect(css).toContain('.dialogue-overlay[data-hide~="slot"]) .combat .unit.player[data-seat="0"] .sprite-box');
    expect(css).toContain('.dialogue-overlay[data-hide~="mine"]) .combat .unit.player.mine .sprite-box');
    expect(css).toContain('.dialogue-overlay[data-hide~="mate"]) .combat .unit.player:not(.mine) .sprite-box');
  });

  it('事件插圖畫了誰：看檔名（角色前綴＝那一位；球球那張有菲菲版的才畫了他）', () => {
    _setManifestForTest(MANIFEST);
    expect(eventArtCast('bg/event_daxia_teach')).toEqual(['ninja']);
    expect(eventArtCast('bg/event_feifei_daxia_teach')).toEqual(['feifei']);
    expect(eventArtCast('bg/event_dangdang_daxia_teach_r0')).toEqual(['dangdang']);
    expect(eventArtCast('bg/event_fengfeng_daxia_teach')).toEqual(['fengfeng']);
    // 目前倉裡每一張球球版的事件圖都有菲菲版（都畫了他）；純場景圖的規則用一份假清單驗
    _setManifestForTest({ ...MANIFEST, bg: { 'bg/event_empty_hall': 'x.webp' } });
    expect(eventArtCast('bg/event_empty_hall'), '沒有菲菲版＝工單裡沒有球球').toEqual([]);
    expect(eventArtCast('bg/screen_rest')).toEqual([]);
  });

  it.each(['ninja', 'feifei', 'dangdang', 'fengfeng'])('%s：5F 秘笈那段對白（事件畫面上唯一會播的一段），主角那兩句不放頭像', (hero) => {
    _setManifestForTest(MANIFEST);
    setLocalHero(hero);
    const cast = eventArtCast(eventArtKey(FIXED_EVENT_FLOOR_5));
    const lines: DialogueLine[] = dialogue.secretScroll;
    const heroLines = lines.filter((l) => portraitHero(l.speaker) !== null);
    expect(heroLines.length).toBeGreaterThan(0);
    for (const l of heroLines) expect(portraitPlan(l.speaker, false, { artCast: cast, mine: hero }).show, l.text).toBe(false);
  });

  it('事件插圖真的有標 data-art-cast（沒標的話上面那條規則永遠用不到）', () => {
    expect(EVENT).toContain("'data-art-cast': eventArtCast(key).join(' ')");
  });
});

describe('畫面盤點 問題 6：關主落敗對白的頭像跟戰場上最後那個階段一致', () => {
  it('落敗對白的頭像走 `monsterPhaseKey`，階段取戰場上那一隻的', () => {
    const outro = sourceBetween(APP, 'const bossUnit = cs.enemies.find', 'else toSlides();');
    expect(outro).toContain("monsterPhaseKey(bd?.art ?? '', bossUnit?.phase ?? 0)");
    expect(outro).toContain("monsterUrl(outroArt, 'idle')");
    expect(outro, '不可以又直接拿原鍵').not.toContain("monsterUrl(bd.art, 'idle')");
  });
});

describe('連線盤點 問題 3：倒下的人在地圖與戰利品頁不要看起來可以選', () => {
  it('地圖：倒下的人不掛可選的光圈、不掛點擊，提示寫「等同伴選路」', () => {
    expect(MAP).toContain("if (choices.has(n.id) && !iDown) cls.push('choice');");
    expect(MAP).toContain('if (choices.has(n.id) && !iDown) {\n      btn.addEventListener');
    expect(MAP).toContain("iDown ? '你倒下了，等同伴選路…'");
    expect(MAP).toContain('const iDown = !!app.coop && !!me(run, app.seat).down;');
  });

  it('戰利品：倒下的人不寫「選一張牌帶走」，底下的鈕也按不下去', () => {
    const view = sourceBetween(REWARD, '  root.append(sceneView({\n    art: middle,', '\n});');
    expect(view).toMatch(/: iDown \? '你倒下了，這次拿不到新牌。/);
    expect(view.indexOf(": iDown ?"), '倒下那句要排在「選一張牌帶走」之前').toBeLessThan(view.indexOf("'選一張牌帶走，或是放棄。'"));
    expect(view).toContain('actions: [waiting || iDown');
  });
});

describe('連線盤點 問題 4：貓窩被扶起來的那一方要有交代、也看得到同伴做了什麼', () => {
  it('被扶起來：講是誰扶的、回到幾點生命', () => {
    const run = newCoopRun('rest-0922', 1, 'ninja', 'feifei');
    me(run, 1).hp = 0; me(run, 1).down = true;
    expect(revivePartner(run, 1)).toBe(true);
    const note = restMateNote(run, 1, { t: 'revive', seat: 0, w: 1 });
    expect(note).toBe(`球球把你扶起來了，你回到 ${me(run, 1).hp} 點生命。`);
    expect(me(run, 1).hp).toBeGreaterThan(0);
  });

  it('同伴打盹、磨爪也講得出來（牌名照同伴那一套）；自己的動作不講', () => {
    const run = newCoopRun('rest-0922b', 1, 'ninja', 'dangdang');
    expect(restMateNote(run, 0, { t: 'rest', seat: 1, c: '打盹' })).toBe('噹噹在旁邊睡了一下。');
    const c = me(run, 1).deck.find((x) => !x.upgraded)!;
    expect(rest(run, '磨爪', c.uid, 1)).toBe(true);
    expect(restMateNote(run, 0, { t: 'rest', seat: 1, c: '磨爪', u: c.uid })).toMatch(/^噹噹去調護臂了：「.+」升級了。$/);
    expect(restMateNote(run, 1, { t: 'rest', seat: 1, c: '打盹' }), '自己做的事有自己的結果畫面').toBe('');
  });

  it('畫面那一邊：同伴的動作不再一律略過，而是記下來、寫進對白框或公告', () => {
    const applied = sourceBetween(REST, '    coop.onRunApplied((applied) => {', '      if (didMine) return;');
    expect(applied).toContain('mateDid = restMateNote(run, seat, a) || mateDid;');
    expect(applied).not.toMatch(/if \(a\.seat !== seat\) continue;/);
    expect(applied).toContain('if (!didMine && mateDid) notice(mateDid);');
    expect(REST).toContain("extra: mateDid ? [el('p', { class: 'event-note rest-mate' }, mateDid)] : []");
  });
});

describe('畫面盤點 問題 11：事件挑牌寫「至多」就可以不選', () => {
  it('寫「至多」：可以不選、挑一張也能確定；寫死張數的照舊要挑滿', () => {
    expect(eventPickRule('重新墊好護臂（升級至多 1 張牌）', 1, '升級')).toEqual({ cancellable: true, minPick: 1, title: '選一張牌升級（也可以不選）' });
    expect(eventPickRule('沿著足跡練步法（自選升級至多 2 張牌）', 2, '升級')).toEqual({ cancellable: true, minPick: 1, title: '最多選 2 張牌升級' });
    expect(eventPickRule('捨去總讓自己失去重心的招式（自選移除 1 張牌）', 1, '移除')).toEqual({ cancellable: false, minPick: 1, title: '選一張牌移除' });
    expect(eventPickRule('有所領悟，捨去不合適的兩張牌（移除 2 張牌）', 2, '移除')).toEqual({ cancellable: false, minPick: 2, title: '選 2 張牌移除' });
  });

  it('多選的確定鈕：湊到最少張數就能按，超過不行', () => {
    expect(confirmReady(1, 2, 1)).toBe(true);
    expect(confirmReady(0, 2, 1)).toBe(false);
    expect(confirmReady(1, 2)).toBe(false);
    expect(confirmReady(2, 2)).toBe(true);
    expect(confirmReady(3, 2, 1)).toBe(false);
  });

  it('事件畫面真的照這條規矩開視窗（原本寫死 cancellable: false）', () => {
    const picker = sourceBetween(EVENT, '      const openPicker = (): void => showDeckPicker({', '        onPick: (uid) => {');
    expect(picker).toContain('cancellable: rule.cancellable');
    expect(picker).toContain('minPick: rule.minPick');
    expect(picker).not.toContain('cancellable: false');
    expect(EVENT).toContain('const rule = eventPickRule(pickLabel, want, verb);');
  });

  it('事件表裡每一個要挑牌的選項：有「至多」的都能不選（文案跟行為一致）', () => {
    let n = 0;
    for (const e of events) for (const c of e.choices) {
      if (!c.outcome.some((o) => o.kind === 'upgradeCard' || o.kind === 'removeCard')) continue;
      n += 1;
      expect(eventPickRule(c.label, 1, '升級').cancellable, `${e.id}：${c.label}`).toBe(c.label.includes('至多'));
    }
    expect(n).toBeGreaterThan(10);
  });
});

describe('畫面盤點 補查：牌組／挑牌視窗換畫面時要收掉（連線時同伴一推進，視窗留在新畫面上）', () => {
  it('換畫面時登記過的都收掉；自己先關掉的不會再收一次', () => {
    const closed: string[] = [];
    const forgetA = closeWithScreen(() => closed.push('A'));
    closeWithScreen(() => closed.push('B'));
    forgetA();   // A 自己關掉了
    closeScreenModals();
    expect(closed).toEqual(['B']);
    closeScreenModals();
    expect(closed, '收過的不會再收').toEqual(['B']);
  });

  it('App.show() 只在換到**別的**畫面時收（同一個畫面重畫不收：戰利品頁不能取消的升級視窗要留著）', () => {
    const show = sourceBetween(APP, '  show(name: ScreenName, props: unknown = {}', '    r(this, this.screen, props);');
    expect(show).toContain("if (this.stage.dataset['screen'] !== name) closeScreenModals();");
    expect(show.indexOf('closeScreenModals()'), '要在換上新的畫面名字之前比').toBeLessThan(show.indexOf("this.stage.dataset['screen'] = name;"));
  });

  it('牌組／挑牌視窗與秘寶清單都有登記；自己關掉時會撤銷登記', () => {
    expect(DECKVIEW).toContain('const forget = closeWithScreen(');
    expect(sourceBetween(DECKVIEW, '  const dismiss = (uid: number | null): void => {', '    if (many > 1')).toContain('forget();');
    expect(RELICLIST).toContain('const forget = closeWithScreen(() => close());');
  });
});
