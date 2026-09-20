import { describe, expect, it } from 'vitest';
import SRC from '../../src/main.ts?raw';

describe('動作模式啟動失敗的退路', () => {
  it('逐格模組或圖片預載失敗時仍會顯示標題', () => {
    expect(SRC).toMatch(
      /if \(new URLSearchParams\(location\.search\)\.get\('motion'\) !== '0'\) \{\s*try \{[\s\S]*?preloadQiuqiuMotion\(\)[\s\S]*?preloadCompanionMotion\(hero\)[\s\S]*?\}\s*catch \(error\) \{[\s\S]*?\}\s*\}\s*app\.show\('title'\)/,
    );
  });
});
