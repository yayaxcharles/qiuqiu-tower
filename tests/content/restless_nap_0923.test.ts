import { describe, expect, it } from 'vitest';
import REST_RAW from '../../src/ui/screens/rest.ts?raw';
import { napLinesFor, RESTLESS_NAP_LINES, storyFor } from '../../src/content/dialogue';
import { HEROES } from '../../src/engine/hero';
import { napHeal, newRun, takeRelic } from '../../src/engine/run';

/**
 * 帶不眠香爐打盹（2026-09-23 主控裁決）：睡了也不回血，醒來那句不能再講「睡飽了，出發喵」。
 * 四隻各一句「燻得睡不著」，台詞在 content（畫面層不寫喵），貓窩的單機與連線兩條路都要走 `napLinesFor`。
 */
describe('不眠香爐的起床台詞', () => {
  it('四隻各一句，照各自的口吻：只有球球句尾帶喵', () => {
    for (const hero of HEROES) {
      const [line] = napLinesFor(hero, true);
      expect(line, hero).toBe(RESTLESS_NAP_LINES[hero]);
      expect(line, hero).toContain('香爐');
      expect(line!.endsWith('喵。'), hero).toBe(hero === 'ninja');
      if (hero !== 'ninja') expect(line, hero).not.toContain('喵');
    }
    // 睡得好好的時候照舊用各自那一組（同一個陣列，`pick` 才記得住上一句不連抽）
    for (const hero of HEROES) expect(napLinesFor(hero, false), hero).toBe(storyFor(hero).restNapLines);
  });

  it('帶香爐時打盹真的回 0（台詞的前提），44F 最後那個貓窩照常回滿', () => {
    const run = newRun('restless', 1, 'ninja');
    takeRelic(run, 'sleepless_censer');
    expect(napHeal(run)).toBe(0);
    run.act = 3; run.floor = 44;
    expect(napHeal(run)).toBeGreaterThan(0);
  });

  it('貓窩畫面兩條路（單機按鈕、連線動作繞回來）都走 napLinesFor，不再直接抽 restNapLines', () => {
    const src = REST_RAW.replace(/\r\n/g, '\n');
    expect(src).toContain('napLinesFor(');
    expect(src).not.toMatch(/restNapLines/);
    expect(src.match(/afterAction\(napLine\([^)]*\), napQuip\(\)\)/g) ?? []).toHaveLength(2);
  });
});
