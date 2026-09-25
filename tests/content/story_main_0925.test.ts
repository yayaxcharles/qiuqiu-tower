import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deckLeaning, dialogue, FEIFEI_BOSS_LINES, feifeiLineOk, lineFor, qiuqiuLineOk,
  setCoopStory, storyFor, victoryLinesFor, type DeckLeaning, type DialogueLine,
} from '../../src/content/dialogue';
import { cards } from '../../src/content/cards';
import { eventTextFor } from '../../src/content/event-text';
import { eventById } from '../../src/content/events';
import { fengfengVictoryVariants } from '../../src/content/fengfeng-dialogue';
import { MAX_ECHOES, VICTORY_ECHOES, VICTORY_MAX_LINES, type VictoryCtx } from '../../src/content/victory-echoes';
import { HEROES, heroName, type Hero } from '../../src/engine/hero';
import { newRun } from '../../src/engine/run';
import { BEST_KEY, loadBest, loadDefeats, loadRun, recordBest, recordDefeat, RUN_KEY, saveRun, setStore } from '../../src/engine/save';
import { endingSlides, topSceneSlides } from '../../src/ui/storyslides';
import APP from '../../src/ui/app.ts?raw';

/**
 * 重逢＋結局整理（2026-09-25 劇情草稿，使用者核可；塔的來歷用 A 版）。
 *
 * 盯的是：菲菲、噹噹的塔頂段真的有、四個結局在任何組合下都落在 8～11 句、醒來的師父木牌寫「大俠貓」、
 * 五種伏筆旁白條件成立才出現且一局最多兩句、倒下次數舊存檔讀得進來、三個新旗標真的記得到。
 */
afterEach(() => setCoopStory(null));

const TITLES = new Set(['難逢敵手。', '走火入魔。', '退隱江湖。', '閉關。', '承讓。', '重出江湖。', '深藏不露。', '在下不才。', '來也。']);
/** 〔來歷句〕：塔是照師父（大俠貓）的記憶長出來的 */
const ORIGIN = /照著?(師父|大俠貓)的?記/u;
const COOP_PAIRS: [Hero, Hero][] = [['ninja', 'feifei'], ['ninja', 'dangdang'], ['feifei', 'dangdang'],
  ['fengfeng', 'ninja'], ['fengfeng', 'feifei'], ['fengfeng', 'dangdang']];

/** 每位角色每一種「單一張牌塞滿牌組」算得出來的傾向各挑一副（起手牌組＝沒有傾向），用來跑遍打法 */
function decksByLeaning(hero: Hero): Map<DeckLeaning, string[]> {
  const out = new Map<DeckLeaning, string[]>([['plain', []]]);
  for (const c of cards) {
    const deck = Array<string>(8).fill(c.id);
    const k = deckLeaning(deck, hero);
    if (!out.has(k)) out.set(k, deck);
  }
  return out;
}

/** 這一位所有可能出現的伏筆句（`{名}` 已換好），拿來數結局裡插了幾句 */
function echoTexts(hero: Hero): Set<string> {
  const name = heroName({ hero });
  const e = VICTORY_ECHOES;
  return new Set([e.shadowWalked[hero], e.shadowFought, e.woodenSword[hero], e.bracerPure, e.bracer, e.hat, e.gourd,
    e.carried[hero], e.taught[hero], e.bundle[hero]].map((t) => t.replace(/\{名\}/g, name)));
}
const countEchoes = (hero: Hero, lines: DialogueLine[]): number => lines.filter((l) => echoTexts(hero).has(l.text)).length;

const ALL_FLAGS = { 'chain:shadow_3_walked': true, 'chain:shadow_3_fought': true, 'chain:shadow_2_watched': true,
  catnip_page: true, 'event:dangdang_old_dent': true };
const ALL_RELICS = ['master_wooden_sword', 'master_bracer_pure', 'master_bracer', 'master_hat', 'master_gourd'];
const FULL: VictoryCtx = { relics: ALL_RELICS, flags: ALL_FLAGS, blessTook: 'bless_bracer', defeatsBefore: 3 };

/** 跑遍的伏筆組合：沒傳、空的、每一種單獨成立、兩兩成立、全部成立 */
const CTXS: (VictoryCtx | undefined)[] = [
  undefined, {}, FULL,
  { flags: { 'chain:shadow_3_walked': true } }, { flags: { 'chain:shadow_3_fought': true } },
  { flags: { catnip_page: true } }, { flags: { 'chain:shadow_2_watched': true } }, { flags: { 'event:dangdang_old_dent': true } },
  ...ALL_RELICS.map((id) => ({ relics: [id] })),
  { defeatsBefore: 1 }, { blessTook: 'bless_dice' },
  { relics: ['master_hat'], defeatsBefore: 1 }, { defeatsBefore: 2, blessTook: 'bless_dice' },
  { flags: { 'chain:shadow_3_walked': true }, relics: ['master_gourd'], defeatsBefore: 1, blessTook: 'bless_dice' },
];

describe('塔頂段：菲菲、噹噹在塔頂真的見到人', () => {
  it('菲菲 6 句、噹噹 5 句，沒有插圖就照字面播純對白；口吻規矩照舊', () => {
    const len: Partial<Record<Hero, number>> = { feifei: 6, dangdang: 5 };
    for (const hero of ['feifei', 'dangdang'] as const) {
      const top = storyFor(hero).topScene;
      expect(top.length, hero).toBe(len[hero]);
      expect(topSceneSlides(hero), `${hero} 沒有塔頂插圖，要退回純對白`).toEqual([]);
      for (const l of top) {
        if (l.speaker === '球球') expect(qiuqiuLineOk(l.text), l.text).toBe(true);
        else expect(feifeiLineOk(l.text), `${l.speaker} 不說喵：${l.text}`).toBe(true);
      }
      expect(top.some((l) => l.speaker === '球球'), `${hero} 的塔頂段要見到師兄`).toBe(true);
    }
    expect(storyFor('dangdang').topScene.some((l) => l.speaker === '菲菲'), '噹噹還見到菲菲').toBe(true);
  });

  it('連線混搭的整段場景不吃單人的塔頂段（同角色雙人照演）', () => {
    setCoopStory({ partner: 'ninja' });
    expect(storyFor('feifei').topScene).toEqual([]);
    setCoopStory({ partner: 'feifei' });
    expect(storyFor('dangdang').topScene).toEqual([]);
    setCoopStory({ partner: 'feifei' });
    expect(storyFor('feifei').topScene.length).toBe(6);
  });

  it('菲菲開打那句把師兄一起講出來（鍵不動、只改值）', () => {
    expect(lineFor('feifei', '退隱也要回家喵！你看著我，我是你徒弟喵！')).toBe('退隱也可以回家呀。師兄在門口等著……跟我們回去，好不好？');
    expect(FEIFEI_BOSS_LINES['退隱也要回家喵！你看著我，我是你徒弟喵！']).toContain('師兄在門口等著');
  });
});

describe('四個結局：基本 8 句，封頂 11 句', () => {
  it('每位角色都是基本 8 句、切點在〔來歷句〕（塔的來歷 A 版在這裡點破）', () => {
    for (const hero of HEROES) {
      const v = storyFor(hero).victory;
      expect(v.length, hero).toBe(8);
      const cut = v.filter((l) => l.slideBreak);
      expect(cut.length, hero).toBe(1);
      expect(cut[0]!.speaker).toBe('旁白');
      expect(cut[0]!.text, `${hero} 的切點不是來歷句`).toMatch(ORIGIN);
    }
  });

  it('跑遍打法、難度、伏筆組合：永遠 8～11 句、伏筆最多兩句、只有一個切點', () => {
    for (const hero of HEROES) {
      const decks = decksByLeaning(hero);
      expect(decks.size, `${hero} 至少要跑到兩種打法`).toBeGreaterThan(1);
      for (const [lean, deck] of decks) {
        for (const diff of [1, 2, 3, 4, 5]) {
          for (const ctx of CTXS) {
            const lines = victoryLinesFor(deck, diff, hero, ctx);
            const tag = `${hero}／${lean}／難度 ${diff}／${JSON.stringify(ctx)}`;
            expect(lines.length, tag).toBeGreaterThanOrEqual(8);
            expect(lines.length, tag).toBeLessThanOrEqual(VICTORY_MAX_LINES);
            expect(countEchoes(hero, lines), tag).toBeLessThanOrEqual(MAX_ECHOES);
            expect(lines.filter((l) => l.slideBreak).length, tag).toBe(1);
            // 封封每一派都有打法插句：最少 9 句
            if (hero === 'fengfeng') expect(lines.length, tag).toBeGreaterThanOrEqual(9);
          }
        }
      }
    }
  });

  it('全部伏筆都成立、難度 5 又有傾向時，照封頂擠掉多的（名額＝min(2, 11 − 已有句數)）', () => {
    for (const hero of HEROES) {
      for (const [lean, deck] of decksByLeaning(hero)) {
        const base = victoryLinesFor(deck, 5, hero).length;
        const full = victoryLinesFor(deck, 5, hero, FULL);
        expect(full.length, `${hero}／${lean}`).toBe(Math.min(VICTORY_MAX_LINES, base + MAX_ECHOES));
        expect(countEchoes(hero, full), `${hero}／${lean}`).toBe(Math.min(MAX_ECHOES, VICTORY_MAX_LINES - base));
      }
    }
  });
});

describe('師父醒來那句的說話者是「大俠貓」', () => {
  it('單人四隻：結局裡只有一句大俠貓、講的是貼圖標題，結局裡不再有「塔主」', () => {
    for (const hero of HEROES) {
      for (const [lean, deck] of decksByLeaning(hero)) {
        const lines = victoryLinesFor(deck, 5, hero, FULL);
        const master = lines.filter((l) => l.speaker === '大俠貓');
        expect(master.length, `${hero}／${lean}`).toBe(1);
        expect(TITLES.has(master[0]!.text), master[0]!.text).toBe(true);
        expect(master[0]!.text).toBe(dialogue.masterFirstWords[lean]);
        expect(lines.some((l) => l.speaker === '塔主'), `${hero} 醒來了還掛塔主木牌`).toBe(false);
      }
    }
  });

  it('連線六組、兩個座位：醒來那句也是大俠貓、只講貼圖標題', () => {
    for (const [a, b] of COOP_PAIRS) {
      for (const [me, partner] of [[a, b], [b, a]] as const) {
        setCoopStory({ partner, mirror: a });
        const lines = victoryLinesFor([], 1, me);
        const master = lines.filter((l) => l.speaker === '大俠貓');
        expect(master.length, `${me}＋${partner}`).toBe(1);
        expect(TITLES.has(master[0]!.text), `${me}＋${partner}：${master[0]!.text}`).toBe(true);
        expect(lines.some((l) => l.speaker === '塔主'), `${me}＋${partner}`).toBe(false);
      }
    }
  });
});

describe('五種伏筆旁白', () => {
  const plainDeck: string[] = [];
  const has = (hero: Hero, ctx: VictoryCtx, text: string): boolean =>
    victoryLinesFor(plainDeck, 1, hero, ctx).some((l) => l.text === text.replace(/\{名\}/g, heroName({ hero })));

  it('① 影子的去向：陪它練完、攔下它打一場各一種；都沒有就不出現', () => {
    for (const hero of HEROES) {
      expect(has(hero, { flags: { 'chain:shadow_3_walked': true } }, VICTORY_ECHOES.shadowWalked[hero]), hero).toBe(true);
      expect(has(hero, { flags: { 'chain:shadow_3_fought': true } }, VICTORY_ECHOES.shadowFought), hero).toBe(true);
      expect(has(hero, { flags: { 'chain:shadow_2_fought': true } }, VICTORY_ECHOES.shadowFought), hero).toBe(false);
      expect(has(hero, {}, VICTORY_ECHOES.shadowWalked[hero]), hero).toBe(false);
    }
  });

  it('② 還師門秘寶：身上有才還，好幾件只挑一件（舊木劍＞淨化護腕＞護腕＞斗笠＞酒葫蘆）', () => {
    const e = VICTORY_ECHOES;
    for (const hero of HEROES) {
      expect(has(hero, { relics: ['master_wooden_sword'] }, e.woodenSword[hero]), hero).toBe(true);
      expect(has(hero, { relics: ['master_bracer_pure'] }, e.bracerPure), hero).toBe(true);
      expect(has(hero, { relics: ['master_bracer'] }, e.bracer), hero).toBe(true);
      expect(has(hero, { relics: ['master_hat'] }, e.hat), hero).toBe(true);
      expect(has(hero, { relics: ['master_gourd'] }, e.gourd), hero).toBe(true);
      expect(has(hero, { relics: ['tower_token'] }, e.hat), hero).toBe(false);
      const many = victoryLinesFor(plainDeck, 1, hero, { relics: ['master_gourd', 'master_hat', 'master_wooden_sword'] });
      expect(countEchoes(hero, many), hero).toBe(1);
      expect(many.some((l) => l.text === e.woodenSword[hero]), hero).toBe(true);
    }
    // 斗笠那句「扣回{名}頭上」要換成這一位的名字
    expect(has('feifei', { relics: ['master_hat'] }, '菲菲把那頂斗笠還給大俠貓。他接過去看了看，又反手扣回菲菲頭上。')).toBe(true);
  });

  it('③ 背你回村的人：這隻貓以前倒下過才出現', () => {
    for (const hero of HEROES) {
      expect(has(hero, { defeatsBefore: 1 }, VICTORY_ECHOES.carried[hero]), hero).toBe(true);
      expect(has(hero, { defeatsBefore: 0 }, VICTORY_ECHOES.carried[hero]), hero).toBe(false);
      expect(has(hero, {}, VICTORY_ECHOES.carried[hero]), hero).toBe(false);
    }
  });

  it('④ 師父親手教的那一下：看過那一招才出現（球球不看躲著看的那一集；噹噹多一條凹痕）', () => {
    const t = VICTORY_ECHOES.taught;
    for (const hero of HEROES) {
      expect(has(hero, { flags: { catnip_page: true } }, t[hero]), hero).toBe(true);
      expect(has(hero, { flags: {} }, t[hero]), hero).toBe(false);
    }
    expect(has('ninja', { flags: { 'chain:shadow_2_watched': true } }, t.ninja), '球球的第二集是屋頂上的影子，沒有這一招').toBe(false);
    for (const hero of ['feifei', 'dangdang', 'fengfeng'] as const) expect(has(hero, { flags: { 'chain:shadow_2_watched': true } }, t[hero]), hero).toBe(true);
    expect(has('dangdang', { flags: { 'event:dangdang_old_dent': true } }, t.dangdang)).toBe(true);
    expect(has('feifei', { flags: { 'event:dangdang_old_dent': true } }, t.feifei)).toBe(false);
    // 陪影子練完那一集也教了：①佔一格、④佔一格
    const walked = victoryLinesFor(plainDeck, 1, 'ninja', { flags: { 'chain:shadow_3_walked': true } });
    expect(walked.some((l) => l.text === t.ninja)).toBe(true);
  });

  it('⑤ 還包袱：這一局從包袱拿過東西才出現', () => {
    for (const hero of HEROES) {
      expect(has(hero, { blessTook: 'bless_dice' }, VICTORY_ECHOES.bundle[hero]), hero).toBe(true);
      expect(has(hero, { blessTook: undefined }, VICTORY_ECHOES.bundle[hero]), hero).toBe(false);
    }
  });

  it('一局最多兩句，照優先序挑；塔頂的插在〔來歷句〕前、回家路的插在後面', () => {
    for (const hero of HEROES) {
      const lines = victoryLinesFor(plainDeck, 1, hero, FULL);
      expect(countEchoes(hero, lines), hero).toBe(2);
      // 優先序：①影子（陪它練完）＞②秘寶（舊木劍），③④⑤都被擠掉
      expect(lines.some((l) => l.text === VICTORY_ECHOES.shadowWalked[hero])).toBe(true);
      expect(lines.some((l) => l.text === VICTORY_ECHOES.woodenSword[hero])).toBe(true);
      expect(lines.some((l) => l.text === VICTORY_ECHOES.bundle[hero])).toBe(false);
      const slides = endingSlides(hero, plainDeck, 1, FULL);
      const first = slides[0]!.lines.map((l) => l.text);
      const second = slides[1]!.lines.map((l) => l.text);
      expect(first, `${hero} 影子那句要在塔頂那張`).toContain(VICTORY_ECHOES.shadowWalked[hero]);
      expect(first.at(-1), `${hero} 塔頂那張收在來歷句`).toMatch(ORIGIN);
      expect(second[0], `${hero} 還木劍那句要在回家路那張的第一句`).toBe(VICTORY_ECHOES.woodenSword[hero]);
      // 旁白不帶喵
      for (const l of lines) if (l.speaker === '旁白') expect(l.text, l.text).not.toContain('喵');
    }
  });

  it('沒傳狀況（除錯頁、舊呼叫）與連線混搭的整段場景都不插；同角色雙人照插', () => {
    for (const hero of HEROES) expect(countEchoes(hero, victoryLinesFor(plainDeck, 1, hero)), hero).toBe(0);
    setCoopStory({ partner: 'feifei', mirror: 'ninja' });
    expect(countEchoes('ninja', victoryLinesFor(plainDeck, 1, 'ninja', FULL))).toBe(0);
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    expect(countEchoes('ninja', victoryLinesFor(plainDeck, 1, 'ninja', FULL))).toBe(2);
  });
});

describe('倒下次數：只記數字，存在既有的存檔倉庫', () => {
  function memStore(init: Record<string, string> = {}) {
    const m = new Map<string, string>(Object.entries(init));
    return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
  }
  beforeEach(() => setStore(memStore().store));

  it('舊存檔沒有這一欄：讀起來是 0，進行中的一局與最佳成績照常讀得進來', () => {
    const run = newRun('old-save-defeats', 1, 'feifei');
    const best = JSON.stringify({ floor: 12, won: false, turns: 80, date: '2026-09-20' });
    const { m, store } = memStore({ [RUN_KEY]: JSON.stringify(run), [BEST_KEY]: best });
    setStore(store);
    for (const hero of HEROES) expect(loadDefeats(hero), hero).toBe(0);
    expect(loadRun(), '舊的進行中那一局').not.toBeNull();
    expect(loadBest()).toEqual(JSON.parse(best));
    expect(m.get(BEST_KEY), '讀倒下次數不能動到最佳成績').toBe(best);
  });

  it('照角色分開記、一次加一；壞掉的值當 0，不清別的東西', () => {
    const { m, store } = memStore();
    setStore(store);
    expect(recordDefeat('ninja')).toBe(1);
    expect(recordDefeat('ninja')).toBe(2);
    expect(loadDefeats('ninja')).toBe(2);
    expect(loadDefeats('feifei'), '球球輸過不算到菲菲頭上').toBe(0);
    for (const bad of ['abc', '-1', '1.5', 'NaN']) {
      m.set(`${BEST_KEY}/defeats/dangdang`, bad);
      expect(loadDefeats('dangdang'), bad).toBe(0);
    }
    expect(loadDefeats('ninja')).toBe(2);
  });

  it('記成績照舊：倒下次數的鍵不會被當成某一級難度的最佳成績', () => {
    const { store } = memStore();
    setStore(store);
    recordDefeat('fengfeng');
    const run = newRun('best-after-defeat', 1, 'fengfeng');
    run.status = 'lost';
    expect(recordBest(run).floor).toBe(run.floor);
    expect(loadDefeats('fengfeng')).toBe(1);
  });

  it('倉庫壞掉（私密模式等）也不會讓遊戲當掉', () => {
    setStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    expect(loadDefeats('ninja')).toBe(0);
    expect(() => recordDefeat('ninja')).not.toThrow();
  });

  it('接線：整局輸掉那一刻替本機這一位加一；結局帶著這一局的狀況去挑伏筆', () => {
    const src = APP.replace(/\r\n/g, '\n');
    expect(src).toContain("if (run.status === 'lost') recordDefeat(me(run, this.seat).hero ?? 'ninja');");
    expect(src).toContain("defeatsBefore: loadDefeats(mineP.hero ?? 'ninja')");
    expect(src).toContain('victoryLinesFor(mineP.deck.map((c) => c.cardId), run.difficulty ?? 1, mineP.hero, endCtx)');
    expect(src).toContain('endingSlides(mineP.hero, mineP.deck.map((c) => c.cardId), run.difficulty ?? 1, endCtx)');
  });
});

describe('新旗標：只記旗標、不動數值', () => {
  const choice = (eventId: string, i: number) => eventById[eventId]!.choices[i]!;
  it('影子的真面目：攔下它打一場、陪它練完各記一個；伸手要木劍不記', () => {
    expect(choice('shadow_truth', 0).outcome).toContainEqual({ kind: 'flag', name: 'chain:shadow_3_fought' });
    expect(choice('shadow_truth', 2).outcome).toContainEqual({ kind: 'flag', name: 'chain:shadow_3_walked' });
    expect(choice('shadow_truth', 1).outcome.some((o) => o.kind === 'flag')).toBe(false);
  });
  it('貓薄荷田：撿那一頁筆記記 catnip_page，另外兩個選項不記', () => {
    expect(choice('rare_catnip_master', 0).outcome).toContainEqual({ kind: 'flag', name: 'catnip_page' });
    expect(choice('rare_catnip_master', 1).outcome.some((o) => o.kind === 'flag')).toBe(false);
    expect(choice('rare_catnip_master', 2).outcome.some((o) => o.kind === 'flag')).toBe(false);
  });
});

describe('封封：序章、打法插句、高難度尾聲', () => {
  it('序章塔下那張多一句有感情的；第四天下午、村貓說菲菲和噹噹昨天也去了', () => {
    const pro = storyFor('fengfeng').prologue;
    expect(pro.at(-1)).toEqual({ speaker: '封封', text: '每次回村，都是他們在路口等我。這次換我去找。' });
    expect(pro[0]!.text.startsWith('第四天下午')).toBe(true);
    expect(pro.map((l) => l.text).join('')).toContain('昨天也去了');
    expect(pro.map((l) => l.text).join('')).not.toContain('第三天');
  });

  it('爪力→重劍那句、隱身→連招那句、蜷縮→護送配合那句，其餘照舊通用那句', () => {
    const decks = decksByLeaning('fengfeng');
    const want: Partial<Record<DeckLeaning, string>> = {
      strength: fengfengVictoryVariants[0]!.text, stealth: fengfengVictoryVariants[1]!.text,
      block: fengfengVictoryVariants[2]!.text, plain: fengfengVictoryVariants[3]!.text,
    };
    expect(decks.has('strength'), '封封要跑得到爪力流').toBe(true);
    expect(decks.has('block'), '封封要跑得到蜷縮流').toBe(true);
    for (const [lean, deck] of decks) {
      const lines = victoryLinesFor(deck, 1, 'fengfeng');
      const i = lines.findIndex((l) => l.text === '您認得我了。先坐下，我把劍收好。');
      expect(lines[i + 1]!.text, lean).toBe(want[lean] ?? fengfengVictoryVariants[3]!.text);
    }
  });

  it('難度 4 以上多一句尾聲，接在院子練劍那張後面', () => {
    const easy = victoryLinesFor([], 3, 'fengfeng');
    const hard = victoryLinesFor([], 4, 'fengfeng');
    expect(hard.length).toBe(easy.length + 1);
    expect(hard.at(-1)!.text).toBe('之後每次封封出門送貨，大俠貓都送到村口。封封走過木橋回頭看，他還站在那裡。');
    const slides = endingSlides('fengfeng', [], 4);
    expect(slides[2]!.lines.at(-1)!.text).toBe(hard.at(-1)!.text);
  });
});

describe('球球：第一關過關與結局補句', () => {
  it('第一關過關第 4 句講師父替他重綁頭巾', () => {
    expect(dialogue.actClear1.length).toBe(4);
    expect(dialogue.actClear1[3]).toEqual({ speaker: '球球', text: '頭巾又勾破了。以前都是師父一邊笑我，一邊幫我重綁喵。' });
  });
  it('結局有「按頭」跟「師妹在村口等」', () => {
    const text = dialogue.victory.map((l) => l.text).join('\n');
    expect(text).toContain('……還是那麼喜歡按我的頭喵。');
    expect(text).toContain('師妹提著燈，站在村口等');
    expect(dialogue.victory.at(-1)).toEqual({ speaker: '球球', text: '師妹，我把師父帶回來了喵！……然後，我肚子好餓喵。' });
  });
});

describe('塔的來歷 A 版：塔照師父的記憶長出來', () => {
  it('序章四份都是「先中魔氣、塔才跟著長出來」', () => {
    const first = (lines: DialogueLine[]): string => lines.find((l) => l.text.startsWith('那天夜裡'))!.text;
    const ninja = first(dialogue.prologue);
    expect(ninja.indexOf('鑽入師父體內')).toBeLessThan(ninja.indexOf('魔塔'));
    expect(ninja).not.toContain('突然出現');
    for (const hero of ['feifei', 'dangdang'] as const) {
      const t = first(storyFor(hero).prologue);
      expect(t.indexOf('魔氣'), hero).toBeLessThan(t.indexOf('魔塔'));
      expect(t, hero).toContain('跟著');
    }
    setCoopStory({ partner: 'feifei', mirror: 'ninja' });
    const coop = first(storyFor('ninja').prologue);
    expect(coop.indexOf('紫色')).toBeLessThan(coop.indexOf('魔塔'));
  });

  it('會哭的牆：殘字筆跡像師父（封封、噹噹那兩份換了鍵，照舊讀得到自己的）', () => {
    const wall = eventById['crying_wall']!.text;
    expect(wall).toContain('筆跡也像師父的');
    expect(wall).not.toContain('護塔者');
    expect(eventTextFor('fengfeng', wall)).toContain('聽起來有點像大俠貓');
    expect(eventTextFor('dangdang', wall)).toContain('那聲音有點耳熟，像大俠貓');
    expect(eventTextFor('dangdang', wall)).not.toContain('師父');
  });

  it('住持倒下拆成兩句，暗示塔是照他記得的東西長出來的；魔物不叫他師父', () => {
    const outro = dialogue.bossDefeatById['hex_abbot']!;
    expect(outro.map((l) => l.text)).toContain('這座塔，是照他記得的東西長出來的。越往上，越是他捨不得的。');
    expect(outro.map((l) => l.text)).toContain('若還救得回來，只能靠他最掛念的人。快去。');
    for (const l of outro) if (l.speaker === '塔主') expect(l.text).not.toContain('師父');
  });
});
