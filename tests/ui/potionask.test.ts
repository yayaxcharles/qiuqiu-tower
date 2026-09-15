import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { missedPotionLabel, shouldAskPotion } from '../../src/ui/potionask';
import REWARD from '../../src/ui/screens/reward.ts?raw';

/**
 * 戰利品頁換忍具只問一次（總稽核 2026-09-16 甲 高-1／中-1／中-2）。
 *
 * 三種都在兩台真畫面（happy-dom＋LoopbackPair）重現過，這裡釘住修法的規矩——
 * 倉庫測試刻意不裝畫面環境（雲端 `npm ci` 沒有 happy-dom），所以判斷抽成純函式、畫面那側讀原始碼：
 * 1. 視窗開著時同伴一動作整頁重畫，原本每重畫一次就再疊一個視窗（兩個都按「換」就少掉兩支舊的）
 * 2. 客戶端按「換」到主機編號繞回來之前重畫，會再問一次
 * 3. 從「收到自己座位的換忍具」推「這頁換過了」，上一格事件頁遲到的換忍具會被誤認，收不下的那支完全不問
 */
describe('換忍具問到哪一步', () => {
  it('只有「還沒問」才排問話；開著、換了、不換都不再排', () => {
    expect(shouldAskPotion(undefined)).toBe(true);
    expect(shouldAskPotion('asking')).toBe(false);
    expect(shouldAskPotion('swapped')).toBe(false);
    expect(shouldAskPotion('declined')).toBe(false);
  });

  it('那一列照答案寫', () => {
    expect(missedPotionLabel(undefined, '煙霧彈')).toBe('忍具帶滿了，「煙霧彈」收不下');
    expect(missedPotionLabel('asking', '煙霧彈')).toBe('忍具帶滿了，「煙霧彈」收不下');
    expect(missedPotionLabel('swapped', '煙霧彈')).toBe('換成了「煙霧彈」');
    expect(missedPotionLabel('declined', '煙霧彈')).toBe('沒有換，「煙霧彈」放棄了');
  });

  it('戰利品頁：開視窗前先記 asking、計時器到了再查一次記號', () => {
    const at = REWARD.indexOf("r.potionAsk = 'asking';");
    expect(at, '開視窗前要先記「正在問」').toBeGreaterThan(-1);
    expect(REWARD.indexOf('showPotionSwap(run, newId', at), '記號要在開視窗之前').toBeGreaterThan(at);
    expect(REWARD).toMatch(/if \(!line\.isConnected \|\| !shouldAskPotion\(r\.potionAsk\)\) return;/);
  });

  it('戰利品頁：「換了」在按下去的當下就記，而且只有真的送出去才算', () => {
    expect(REWARD).toMatch(/swapPotion\(app, run, seat, idx, newId\) \? 'swapped' : undefined/);
  });

  it('戰利品頁：收到換忍具動作只重畫狀態列，不去改問到哪一步', () => {
    const start = REWARD.indexOf("applied.every((o) => o.a.t === 'swap')");
    expect(start).toBeGreaterThan(-1);
    const block = REWARD.slice(start, REWARD.indexOf('return;', start));
    expect(block, '遲到的換忍具不能被當成這一頁的回答').not.toMatch(/r\.potion\w*\s*=/);
    expect(block).toContain('renderHud(app, root)');
  });
});

/**
 * 投票與撞件的結果用系統公告，不借角色吐槽泡泡（總稽核 2026-09-16 甲 低-3）：
 * 戰鬥畫面把 `.toast` 畫成主角頭上的泡泡，地圖投票完進戰鬥就像角色在講「擲骰選了戰鬥」；對白層還會把它蓋住。
 */
describe('系統公告', () => {
  const base = readFileSync('src/ui/styles/base.css', 'utf-8');
  const combat = readFileSync('src/ui/styles/combat.css', 'utf-8');
  const screens = readFileSync('src/ui/styles/screens.css', 'utf-8');

  it('四個結果都走 notice', () => {
    for (const f of ['map', 'event', 'reward', 'chest']) {
      const src = readFileSync(`src/ui/screens/${f}.ts`, 'utf-8');
      expect(src, `${f}.ts 的結果公告`).toMatch(/notice\((relicOutcomeText|`兩人選)/);
      expect(src, `${f}.ts 不該再用 toast 講投票結果`).not.toMatch(/toast\((relicOutcomeText|`兩人選)/);
    }
  });

  it('公告壓在對白層上面，戰鬥與其他畫面的泡泡樣式套不到它', () => {
    const z = Number(/\.notice\s*\{[^}]*z-index:\s*(\d+)/.exec(base)?.[1]);
    expect(z, '對白層是 50').toBeGreaterThan(50);
    expect(combat + screens, '別的樣式表不要改公告').not.toMatch(/\.notice\b/);
  });
});
