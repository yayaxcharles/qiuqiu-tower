import { describe, expect, it } from 'vitest';
import { enemies } from '../../src/content/enemies';
import { dialogue, qiuqiuLineOk, victoryLinesFor } from '../../src/content/dialogue';

const DAXIA_TITLES = ['難逢敵手', '走火入魔', '退隱江湖', '閉關', '承讓', '重出江湖', '深藏不露', '在下不才', '來也'];

describe('對白', () => {
  it('句尾喵檢查函式', () => {
    expect(qiuqiuLineOk('參上！球球來也喵！')).toBe(true);
    expect(qiuqiuLineOk('先睡了喵……')).toBe(true);
    expect(qiuqiuLineOk('我來了')).toBe(false);
  });
  it('球球每一句都以喵結尾；旁白不加喵', () => {
    const groups = [dialogue.prologue, dialogue.secretScroll, dialogue.afterFirstElite,
      ...dialogue.restBeforeBossByAct, ...Object.values(dialogue.bossIntroById), dialogue.bossIntroGeneric,
      ...Object.values(dialogue.bossPhase2ById), dialogue.bossPhase2Generic,
      ...Object.values(dialogue.bossPhase3ById), dialogue.bossPhase3Generic,
      dialogue.actClear1, dialogue.actClear2, dialogue.victory, dialogue.defeat, ...Object.values(dialogue.bossDefeatById),
      victoryLinesFor(['fengyin', 'fengyin', 'fengyin', 'fengyin', 'fengyin', 'fengyin'], 5)];
    for (const g of groups) for (const l of g) {
      if (l.speaker === '球球') expect(qiuqiuLineOk(l.text), l.text).toBe(true);
      if (l.speaker === '旁白') expect(qiuqiuLineOk(l.text), l.text).toBe(false);
    }
    for (const s of [...dialogue.battleStart, ...dialogue.battleWin, ...dialogue.restNapLines, ...dialogue.restSharpenLines,
      ...dialogue.hungry, ...dialogue.lowHp, ...dialogue.chestLines, dialogue.victoryTeaser]) expect(qiuqiuLineOk(s), s).toBe(true);
    for (const s of Object.values(dialogue.firstMeet)) expect(qiuqiuLineOk(s), s).toBe(true);
  });
  it('每種魔物都有初見吐槽', () => {
    for (const e of enemies) expect(dialogue.firstMeet[e.id], e.id).toBeTruthy();
  });
  it('師父（tower_master）只講大俠貼圖標題', () => {
    // 這條風格規矩只管師父本人：其他關主（貓又婆婆等）的塔主台詞是一般對白
    const groups = [dialogue.bossIntroById['tower_master']!, dialogue.bossPhase2ById['tower_master']!, dialogue.bossPhase3ById['tower_master']!, dialogue.victory,
      // 結局依牌組換的那幾句也要在標題裡（稽核 2026-09-04 中 5）
      ...(['strength', 'stealth', 'block', 'plain'] as const).map((k) => [{ speaker: '塔主' as const, text: dialogue.masterFirstWords[k] }])];
    for (const g of groups) for (const l of g) if (l.speaker === '塔主') expect(DAXIA_TITLES, l.text).toContain(l.text.replace(/[。！]$/u, ''));
  });
});
