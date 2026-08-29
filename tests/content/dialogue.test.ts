import { describe, expect, it } from 'vitest';
import { enemies } from '../../src/content/enemies';
import { dialogue, qiuqiuLineOk } from '../../src/content/dialogue';

const DAXIA_TITLES = ['難逢敵手', '走火入魔', '退隱江湖', '閉關', '承讓', '重出江湖', '深藏不露', '在下不才', '來也'];

describe('對白', () => {
  it('句尾喵檢查函式', () => {
    expect(qiuqiuLineOk('參上！球球來也喵！')).toBe(true);
    expect(qiuqiuLineOk('先睡了喵……')).toBe(true);
    expect(qiuqiuLineOk('我來了')).toBe(false);
  });
  it('球球每一句都以喵結尾；旁白不加喵', () => {
    const groups = [dialogue.prologue, dialogue.secretScroll, dialogue.afterFirstElite, dialogue.restBeforeBoss,
      dialogue.bossIntro, dialogue.bossPhase2, dialogue.victory, dialogue.defeat];
    for (const g of groups) for (const l of g) {
      if (l.speaker === '球球') expect(qiuqiuLineOk(l.text), l.text).toBe(true);
      if (l.speaker === '旁白') expect(qiuqiuLineOk(l.text), l.text).toBe(false);
    }
    for (const s of [...dialogue.battleStart, ...dialogue.battleWin, ...dialogue.restLines,
      dialogue.hungry, dialogue.lowHp, dialogue.chestLine, dialogue.victoryTeaser]) expect(qiuqiuLineOk(s), s).toBe(true);
    for (const s of Object.values(dialogue.firstMeet)) expect(qiuqiuLineOk(s), s).toBe(true);
  });
  it('每種魔物都有初見吐槽', () => {
    for (const e of enemies) expect(dialogue.firstMeet[e.id], e.id).toBeTruthy();
  });
  it('塔主只講大俠貼圖標題', () => {
    const groups = [dialogue.bossIntro, dialogue.bossPhase2, dialogue.victory];
    for (const g of groups) for (const l of g) if (l.speaker === '塔主') expect(DAXIA_TITLES, l.text).toContain(l.text.replace(/[。！]$/u, ''));
  });
});
