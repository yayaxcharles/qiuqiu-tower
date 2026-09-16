import { describe, expect, it } from 'vitest';
import {
  DANGDANG_BOSS_LINES, DANGDANG_CAST_LINES, castLineFor, dialogue, feifeiLineOk, lineFor,
} from '../../src/content/dialogue';

/**
 * 塔主那批共用台詞的噹噹版（2026-09-17）。
 *
 * 跟菲菲那份同一個已知的脆弱處：鍵是**球球的原句**，改了球球那邊一個字，
 * 他這邊會靜靜掉回「只拿掉句尾的喵」，不報錯、畫面照樣有台詞。
 * 所以這裡盯著兩邊的句子集合要一模一樣——少一句或多一句都會紅。
 */
const HIS = new Set([
  'prologue', 'actClear1', 'actClear2', 'defeat', 'victoryTeaser', 'victory',
  'masterFirstWordsNarration', 'hardModeEpilogue', 'battleStart', 'battleWin',
  'hungry', 'lowHp', 'chestLines', 'restNapLines', 'restSharpenLines',
  'firstMeet', 'firstMeetFeifei', 'firstMeetDangdang',
]);

function sharedLinesOfQiuqiu(): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (!v || typeof v !== 'object') return;
    const l = v as { speaker?: string; text?: string };
    if (l.speaker === '球球' && typeof l.text === 'string') { out.push(l.text); return; }
    for (const x of Object.values(v)) walk(x);
  };
  for (const [key, val] of Object.entries(dialogue)) if (!HIS.has(key)) walk(val);
  return out;
}

describe('塔主那批台詞的噹噹版', () => {
  const theirs = sharedLinesOfQiuqiu();

  it('球球那邊有幾句，他這邊就有幾句（一句都不能漏）', () => {
    expect(theirs.length, '關主區塊一句都沒抓到，這條測試失效了').toBeGreaterThan(30);
    const missing = theirs.filter((t) => !DANGDANG_BOSS_LINES[t]);
    expect(missing, `這幾句沒寫他的版本：\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('他這邊沒有多出來的（球球那邊改過字就會對不上）', () => {
    const set = new Set(theirs);
    const orphan = Object.keys(DANGDANG_BOSS_LINES).filter((k) => !set.has(k));
    expect(orphan, `這幾個鍵在球球那邊找不到原句（是不是改過字？）：\n  ${orphan.join('\n  ')}`).toEqual([]);
  });

  it('沒有一句原封不動照抄，也不講「喵」', () => {
    expect(Object.entries(DANGDANG_BOSS_LINES).filter(([k, v]) => k === v).map(([k]) => k)).toEqual([]);
    const meow = Object.values(DANGDANG_BOSS_LINES).filter((v) => !feifeiLineOk(v) || v.includes('喵'));
    expect(meow, '他的台詞裡有「喵」').toEqual([]);
  });

  it('他不喊師父——那是球球與菲菲的稱呼，他叫大俠貓', () => {
    const bad = Object.values(DANGDANG_BOSS_LINES).filter((v) => /師父|師兄|我是球球/.test(v));
    expect(bad, `他跟大俠貓不是師徒，不該這樣喊：\n  ${bad.join('\n  ')}`).toEqual([]);
  });

  it('`lineFor` 真的會換過去，球球與菲菲那邊都沒被動到', () => {
    for (const [orig, his] of Object.entries(DANGDANG_BOSS_LINES)) {
      expect(lineFor('dangdang', orig)).toBe(his);
      expect(lineFor('ninja', orig)).toBe(orig);
      expect(lineFor(undefined, orig)).toBe(orig);
    }
  });

  it('沒重寫的句子照舊只拿掉句尾的「喵」', () => {
    expect(lineFor('dangdang', '這隻看起來好兇喵。')).toBe('這隻看起來好兇。');
    expect(lineFor('dangdang', '喵喵叫個不停')).toBe('喵喵叫個不停');
  });

  it('關主與旁白講到他的那幾句也換了（他沒有師父）', () => {
    expect(Object.keys(DANGDANG_CAST_LINES).length).toBeGreaterThan(5);
    for (const [orig, his] of Object.entries(DANGDANG_CAST_LINES)) {
      expect(castLineFor('dangdang', orig)).toBe(his);
      expect(castLineFor('ninja', orig)).toBe(orig);
      expect(castLineFor('feifei', orig)).not.toBe(his);
    }
    // 貓又婆婆對球球說「你師父……」，對他得換句話講
    const nekomata = dialogue.bossIntroById['nekomata']!.find((l) => l.text.includes('你師父'))!;
    expect(castLineFor('dangdang', nekomata.text)).not.toContain('你師父');
  });
});
