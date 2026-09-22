import { afterEach, describe, expect, it } from 'vitest';
import {
  castLineFor, dialogue, eventTextFor, lineFor, setCoopStory, storyFor, type DialogueLine,
} from '../../src/content/dialogue';
import { events } from '../../src/content/events';
import ACTCLEAR from '../../src/ui/screens/actclear.ts?raw';
import REWARD from '../../src/ui/screens/reward.ts?raw';
import COMBAT from '../../src/ui/screens/combat.ts?raw';
import MAP from '../../src/ui/screens/map.ts?raw';

/**
 * 「喵」是球球的招牌口癖（`feifeiLineOk` 的說明），另外三隻講出來就是穿幫（2026-09-22 連線盤點 問題 10：
 * 過關拿信物那句 `lineFor` 對封封查不到改句就原句照回，封封講了「這就是塔主的信物喵！」）。
 *
 * 這一支把**所有會經過換口氣那一層**的句子掃一遍：事件文案、關主與劇情的共用台詞、
 * 畫面層寫死再過 `lineFor` 的那幾句。查得到改句的換成改句，查不到的也不可以留著「喵」。
 */
const OTHERS = ['feifei', 'dangdang', 'fengfeng'] as const;

afterEach(() => setCoopStory(null));

/** 別人講的話先拿掉：噹噹那篇「一掌留下的凹痕」回想球球喊「我出招了喵！」，那是球球本人在講 */
const withoutQiuqiuQuotes = (t: string): string => t.replace(/球球[^「」。]*「[^」]*」/gu, '');

/** 共用的劇情表：說話者寫「球球」的走 `lineFor`，其餘走 `castLineFor`（跟 `playDialogue` 的入口一樣） */
function sharedLines(): DialogueLine[] {
  const d = dialogue;
  const tables: DialogueLine[][] = [
    ...Object.values(d.bossIntroById), d.bossIntroGeneric,
    ...Object.values(d.bossDefeatById),
    ...Object.values(d.bossPhase2ById), d.bossPhase2Generic,
    ...Object.values(d.bossPhase3ById), d.bossPhase3Generic,
    d.secretScroll, d.afterFirstElite, ...d.restBeforeBossByAct,
  ];
  return tables.flat();
}

/** 畫面層寫死、再交給 `lineFor` 換口氣的句子（`lineFor(xxx, '…喵！')`，樣板字串裡的 `${…}` 換成一個牌名） */
function uiLiterals(): string[] {
  const out: string[] = [];
  for (const src of [ACTCLEAR, REWARD, COMBAT]) {
    // 第一個參數常帶括號（`me(run, seat).hero`），所以括號要成對吃掉，不能用「到逗號為止」
    for (const m of src.matchAll(/lineFor\((?:[^()]|\([^()]*\))+?,\s*([`'"])([^`'"]*喵[^`'"]*)\1\)/gu)) out.push(m[2]!.replace(/\$\{[^}]+\}/g, '塔主令牌'));
  }
  // 地圖第一次看到修飾詞那句是寫成說話者「球球」交給 `playDialogue`（入口會過 `lineFor`）
  for (const m of MAP.matchAll(/speaker: '球球', text: '([^']*喵[^']*)'/gu)) out.push(m[1]!);
  return out;
}

describe('另外三隻不會講球球的「喵」', () => {
  it('畫面層那幾句寫死的台詞確實抓得到（抓不到就等於沒檢查）', () => {
    const lits = uiLiterals();
    expect(lits.length, lits.join('\n')).toBeGreaterThanOrEqual(5);
    expect(lits.some((t) => t.includes('這就是塔主的信物')), '連線盤點抓到的那一句要在清單裡').toBe(true);
  });

  it.each(OTHERS)('%s：畫面層寫死的台詞', (hero) => {
    for (const t of uiLiterals()) expect(lineFor(hero, t), `${hero}：${t}`).not.toContain('喵');
  });

  it.each(OTHERS)('%s：關主、秘笈、關主前貓窩那批共用台詞', (hero) => {
    for (const l of sharedLines()) {
      const shown = l.speaker === '球球' ? lineFor(hero, l.text) : castLineFor(hero, l.text);
      expect(shown, `${hero}／${l.speaker}：${l.text}`).not.toContain('喵');
    }
  });

  it.each(OTHERS)('%s：事件文案（敘述、選項、結果）', (hero) => {
    for (const e of events) {
      if (e.hero && e.hero !== hero) continue;   // 別人的專屬事件排不進這一位的地圖
      for (const t of [e.text, ...e.choices.flatMap((c) => [c.label, c.result ?? ''])]) {
        expect(withoutQiuqiuQuotes(eventTextFor(hero, t)), `${hero}／${e.id}：${t}`).not.toContain('喵');
      }
    }
  });

  it.each(OTHERS)('%s：自己那份劇本與短句（單人）', (hero) => {
    const s = storyFor(hero);
    const lines = [...s.prologue, ...s.actClear1, ...s.actClear2, ...s.topScene, ...s.defeat, ...s.victory]
      .filter((l) => l.speaker !== '球球').map((l) => l.text);
    const short = [...s.battleStart, ...s.battleWin, ...s.hungry, ...s.lowHp, ...s.chestLines,
      ...s.restNapLines, ...s.restSharpenLines, ...s.reviveLines, ...Object.values(s.firstMeet),
      s.victoryTeaser, s.hardModeEpilogue, ...Object.values(s.victoryNarration)];
    for (const t of [...lines, ...short]) expect(t, `${hero}：${t}`).not.toContain('喵');
  });

  it('反向：球球自己照舊有喵（這一層沒有把他的口癖一起拿掉）', () => {
    const t = uiLiterals().find((x) => x.includes('這就是塔主的信物'))!;
    expect(lineFor('ninja', t)).toContain('喵');
    expect(lineFor(undefined, t)).toContain('喵');
  });
});
