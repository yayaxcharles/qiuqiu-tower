import { afterEach, describe, expect, it } from 'vitest';
import { coopBossLines, hasCoopScene, setCoopStory, storyFor } from '../../src/content/dialogue';

/**
 * 連線劇情的時序（2026-09-17 使用者指出兩件）。
 *
 * 1. 「塔頂門外」原本併在**第二關過關**的尾巴，可是那段講的是「推開門就看到大俠貓」——
 *    第二關過完還要走完整個第三關才會見到他，早了一整關。
 * 2. 連線的序章從頭到尾不會播（大廳 `begin()` 直接 `show('map')`），那兩段寫好的序章躺著。
 */
afterEach(() => setCoopStory(null));

const PAIRS = [
  { me: 'ninja', partner: 'dangdang' },
  { me: 'dangdang', partner: 'ninja' },
  { me: 'dangdang', partner: 'feifei' },
  { me: 'feifei', partner: 'dangdang' },
] as const;

describe('連線劇情的時序', () => {
  it('第二關過關不可以提到推開門、看到大俠貓', () => {
    for (const { me, partner } of PAIRS) {
      setCoopStory({ partner, mirror: me });
      const text = storyFor(me).actClear2.map((l) => l.text).join('');
      expect(text, `${me}+${partner} 的第二關過關演到塔頂了`).not.toContain('門後的大俠貓');
      expect(text, `${me}+${partner} 的第二關過關演到塔頂了`).not.toContain('球球坐在門後');
    }
  });

  it('那一段改接在打大俠貓之前', () => {
    for (const { me, partner } of PAIRS) {
      setCoopStory({ partner, mirror: me });
      const intro = coopBossLines('tower_master', 'intro', me);
      expect(intro, `${me}+${partner} 沒有搭檔專屬的開場`).toBeTruthy();
      const text = intro!.map((l) => l.text).join('');
      expect(text, '塔頂門外那一段不見了').toMatch(/門後的大俠貓|球球坐在門後/);
      // 原本那四句接話還在（大俠貓的「難逢敵手」那組）
      expect(text, '原本的接話被蓋掉了').toContain('難逢敵手');
    }
  });

  it('只有大俠貓有，其他關主不會被插進這一段', () => {
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    expect(coopBossLines('nekomata', 'intro', 'ninja')).toBeNull();
    expect(coopBossLines('orange_king', 'intro', 'ninja')).toBeNull();
  });

  it('一個人玩的時候完全不受影響', () => {
    setCoopStory(null);
    for (const hero of ['ninja', 'feifei', 'dangdang']) {
      expect(coopBossLines('tower_master', 'intro', hero)).toBeNull();
      expect(hasCoopScene(hero)).toBe(false);
    }
  });
});

describe('連線序章接得上', () => {
  it('大廳會叫 playPrologue，而且不播影片', async () => {
    const { readFileSync } = await import('node:fs');
    const lobby = readFileSync('src/ui/screens/lobby.ts', 'utf-8');
    expect(lobby, '大廳沒有演序章').toContain('playPrologue');
    // 呼叫裡面還有括號（`me(app.run, seat)`），所以不用一個大正規表示式硬吃，改成看同一段裡有沒有那個旗標
    const call = lobby.slice(lobby.indexOf('playPrologue('));
    expect(call.slice(0, 200), '連線不該播開頭影片（一個人看、另一個人乾等）').toContain('video: false');
    // 這條反過來也要守：不可以又退回「直接跳地圖」
    const app = readFileSync('src/ui/app.ts', 'utf-8');
    expect(app, 'playPrologue 被刪掉了').toContain('playPrologue(hero: Hero');
  });

  it('兩套連線序章都有話可演', () => {
    for (const { me, partner } of PAIRS) {
      setCoopStory({ partner, mirror: me });
      const pro = storyFor(me).prologue;
      expect(pro.length, `${me}+${partner} 的序章是空的`).toBeGreaterThan(5);
      const who = new Set(pro.map((l) => l.speaker));
      expect(who.size, `${me}+${partner} 的序章只有一個人在講話`).toBeGreaterThan(1);
    }
  });
});
