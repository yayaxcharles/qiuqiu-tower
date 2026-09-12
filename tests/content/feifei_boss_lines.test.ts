import { describe, expect, it } from 'vitest';
import { FEIFEI_BOSS_LINES, dialogue, feifeiLineOk, lineFor } from '../../src/content/dialogue';

/**
 * 塔主那批共用台詞的她版（使用者 2026-09-12：「要 要改」）。
 *
 * `FEIFEI_BOSS_LINES` 的鍵是**球球的原句**，這種寫法有個已知的脆弱處：
 * 改了球球那邊一個字，她這邊會靜靜掉回「只拿掉句尾的喵」，不報錯、畫面照樣有台詞。
 * 所以這裡盯著**兩邊的句子集合要一模一樣**——少一句（漏寫）或多一句（球球那邊改過字）都會紅。
 */

/**
 * 共用的 `dialogue` 裡球球講的每一句，**扣掉她整段接管的那些**。
 *
 * 不是只掃關主那幾個區塊：她整段接管的是 `storyFor` 列的那幾個（序章、過關、落敗、
 * 通關、每場戰鬥的口頭禪、魔物初見…），**其餘一律是共用的**，共用的就該有她的版本。
 * 這樣寫的好處是以後多加一個共用區塊也會被抓到，不用回來改這條測試。
 *
 * 走物件不解析原始碼：排版一改、字串換個引號，解析就會靜靜少抓到幾句。
 */
const HERS = new Set([
  'prologue', 'actClear1', 'actClear2', 'defeat', 'victoryTeaser', 'victory',
  'masterFirstWordsNarration', 'hardModeEpilogue', 'battleStart', 'battleWin',
  'hungry', 'lowHp', 'chestLines', 'restNapLines', 'restSharpenLines',
  'firstMeet', 'firstMeetFeifei',
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
  for (const [key, val] of Object.entries(dialogue)) if (!HERS.has(key)) walk(val);
  return out;
}

describe('塔主那批台詞的她版', () => {
  const theirs = sharedLinesOfQiuqiu();

  it('球球那邊有幾句，她這邊就有幾句（一句都不能漏）', () => {
    expect(theirs.length, '關主區塊一句都沒抓到，這條測試失效了').toBeGreaterThan(30);
    const missing = theirs.filter((t) => !FEIFEI_BOSS_LINES[t]);
    expect(missing, `這幾句沒寫她的版本：\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('她這邊沒有多出來的（球球那邊改過字就會對不上）', () => {
    const set = new Set(theirs);
    const orphan = Object.keys(FEIFEI_BOSS_LINES).filter((k) => !set.has(k));
    expect(orphan, `這幾個鍵在球球那邊找不到對應的原句（是不是改過字？）：\n  ${orphan.join('\n  ')}`).toEqual([]);
  });

  it('沒有一句原封不動照抄', () => {
    const same = Object.entries(FEIFEI_BOSS_LINES).filter(([k, v]) => k === v);
    expect(same.map(([k]) => k)).toEqual([]);
  });

  it('她不講「喵」', () => {
    const bad = Object.entries(FEIFEI_BOSS_LINES).filter(([, v]) => !feifeiLineOk(v) || v.includes('喵'));
    expect(bad.map(([, v]) => v), '她的台詞裡有「喵」').toEqual([]);
  });

  it('她不自稱球球，也不把師兄講成自己', () => {
    const bad = Object.entries(FEIFEI_BOSS_LINES)
      .filter(([, v]) => /我是球球|我叫球球/.test(v));
    expect(bad.map(([, v]) => v)).toEqual([]);
  });

  it('`lineFor` 真的會換過去，球球那邊一個字都沒動', () => {
    for (const [orig, hers] of Object.entries(FEIFEI_BOSS_LINES)) {
      expect(lineFor('feifei', orig)).toBe(hers);
      expect(lineFor('ninja', orig)).toBe(orig);
      expect(lineFor(undefined, orig)).toBe(orig);
    }
  });

  it('沒重寫的句子照舊只拿掉句尾的「喵」', () => {
    // 魔物初見那些不走這張表，退路要留著
    expect(lineFor('feifei', '這隻看起來好兇喵。')).toBe('這隻看起來好兇。');
    expect(lineFor('feifei', '喵喵叫個不停')).toBe('喵喵叫個不停');   // 不在句尾就不動
  });

  it('球球自己那批完全沒被改到', () => {
    expect(dialogue.bossIntroGeneric.some((l) => l.speaker === '球球' && l.text.endsWith('喵。'))).toBe(true);
  });
});
