import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

/*
 * **貓窩的吐槽不可以直接拿球球那份**（2026-09-14 夜間稽核：今天的提交 範圍外-1、連線 中-4）。
 *
 * `dialogue.restNapLines`／`restSharpenLines` 是球球的句子（「爪子有點鈍了喵。」），
 * 菲菲那份在 `storyFor('feifei')` 裡。貓窩畫面原本有四處直接讀 `dialogue.*`：
 * 單機磨針、連線的打盹／扶人／磨針——玩菲菲時照講球球的話，連「喵」都在。
 *
 * 文字掃描（`hero_text_scan`、`feifei_text`）抓不到這一種：原始碼裡沒有「喵」這個字，
 * 句子是從內容表拿的。所以這條直接盯「畫面層不准繞過 storyFor 讀這兩份」。
 */
describe('貓窩的吐槽要照角色拿', () => {
  it('畫面層沒有任何地方直接讀 dialogue.restNapLines／restSharpenLines（要走 storyFor）', () => {
    const bad: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) {
          readFileSync(p, 'utf-8').split('\n').forEach((line, i) => {
            if (/dialogue\.rest(Nap|Sharpen)Lines/.test(line)) bad.push(`${p}:${i + 1}`);
          });
        }
      }
    };
    walk('src/ui');
    expect(bad, '菲菲會講出「爪子有點鈍了喵。」').toEqual([]);
  });
});
