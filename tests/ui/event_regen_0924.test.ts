import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 事件圖重生（2026-09-24）：使用者抓到劍浮在半空、手沒握著劍、文字寫的村貓圖上沒有，要求全部檢查、有問題就重生。
 * 810 張事件圖逐張比文字（`docs/審查報告/2026-09-24_事件圖重生/`），判定要重生的由 `tools/regen_event_art.py`
 * 分組重畫、挑定時把檔案雜湊記在 `tools/motion-art-source/regen0924/picks*.json`，再由獨立驗收代理複查。
 * 這裡守：線上放的就是挑定、驗收過的那一版（換回舊圖、或重畫後沒走挑定那一步，雜湊就對不上），而且是 560×420 的事件圖。
 */
interface Pick { file: string; sha256: string }
const picksOf = (dir: string): [string, Pick][] => (existsSync(dir) ? readdirSync(dir) : [])
  .filter((f) => /^picks(_\w+)?\.json$/.test(f))
  .flatMap((f) => Object.entries(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Record<string, Pick>));
// 每一輪一個 regenMMDD 資料夾（0924 全面重審、0925 書信畫拿反、0926 球球毛色與場景…）；同名的以後一輪挑定的為準
const ROUNDS = readdirSync('tools/motion-art-source').filter((d) => /^regen\d{4}$/.test(d)).sort()
  .map((d) => picksOf(`tools/motion-art-source/${d}`));
const picks = picksOf('tools/motion-art-source/regen0924');
const latest = new Map(ROUNDS.flat());
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
/** WebP（VP8X）表頭裡的畫布大小 */
const canvasOf = (path: string): [number, number] => {
  const b = readFileSync(path);
  const read24 = (at: number): number => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
  return new TextDecoder().decode(b.subarray(12, 16)) === 'VP8X' ? [1 + read24(24), 1 + read24(27)] : [0, 0];
};

describe('事件圖重生：線上是挑定的那一版', () => {
  it('每一張挑定的圖都在、雜湊對得上、是 560×420', () => {
    expect(picks.length).toBeGreaterThanOrEqual(160);
    for (const [name, p] of latest) {
      expect(p.file, name).toBe(`public/assets/bg/${name}.webp`);
      expect(existsSync(p.file), p.file).toBe(true);
      expect(sha(p.file), p.file).toBe(p.sha256);
      expect(canvasOf(p.file), p.file).toEqual([560, 420]);
    }
  });
  it('同一張圖只在一組裡挑定（不會兩組各換一次、互相蓋掉）', () => {
    for (const round of ROUNDS) {
      const names = round.map(([n]) => n);
      expect(new Set(names).size).toBe(names.length);
    }
  });
  it('重畫工具每張都附「東西不能浮空」與「文字寫到的角色一定畫出來」', () => {
    const tool = readFileSync('tools/regen_event_art.py', 'utf8').replace(/\r\n/g, '\n');
    expect(tool).toContain('NOTHING floats in mid-air');
    expect(tool).toContain('every character named in the SCENE is clearly visible');
    expect(tool).toContain("return head + extra + f'SCENE: {job[\"scene\"]}\\n' + PHYSICS + CAST + READING + tail + rules");
    // 2026-09-25：書信畫拿反那一輪加的規則
    expect(tool).toContain("written or drawn side faces the character\\'s OWN eyes");
  });
});
