// 戰鬥畫面的暖圖：角色姿勢一位只暖一次，整頁重畫只補新召喚（或換了階段立繪）的魔物（清理 2026-09-22 C6）。
// 直接跑戰鬥畫面的原始碼片段：這幾支是畫面內部的函式，不是公開介面。
import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';

function sourceBetween(start: string, end: string): string {
  const normalized = SRC.replace(/\r\n/g, '\n');
  const first = normalized.indexOf(start);
  const last = normalized.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到戰鬥畫面片段：${start}`);
  return normalized.slice(first, last);
}

const mountWarm = sourceBetween('  const warmPool: DecodePool', '  // 開場那一次畫完才開閘');
// render() 開頭、關掉提示框之前的那幾行＝每次整頁重畫都會跑的暖圖
const renderWarm = sourceBetween('  function render(): void {', '    hideTooltip();').replace('  function render(): void {', '');

async function mount() {
  const decodeAll = vi.fn(async () => {});
  const heroArtUrl = vi.fn((hero: string, key: string) => `/${hero}/${key}.webp`);
  const art: Record<number, string> = { 1: 'rat' };
  const cs = { players: [{ seat: 0, hero: 'ninja' }, { seat: 1, hero: 'feifei' }], enemies: [{ uid: 1, enemyId: 'rat' }] as Array<{ uid: number; enemyId: string }> };
  const bindings = {
    cs, decodeAll, heroArtUrl,
    POSE: { idle: 'hero/ninja', attack: 'hero/ninja_attack', hit: 'hero/ninja_hit' },
    enemyById: { rat: { art: 'rat' }, slime: { art: 'slime' } },
    artOfEnemy: (e: { uid: number; enemyId: string }) => art[e.uid] ?? e.enemyId,
    monsterUrl: (a: string, pose: string) => `/${a}_${pose}.webp`,
    hasMonsterPose: () => false, hasSprite: () => false, artUrl: () => '',
    BOSS_ART: {}, BOSS_HURT_ART: [], BOSS_MOVE_ART: {}, BOSS_MOVE_ART_PHASE: [],
  };
  const code = `${mountWarm}\nreturn { rerender() {\n${renderWarm}\n} };`;
  const compiled = await transformWithOxc(code, 'combat-warm.ts');
  const screen = new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as { rerender(): void };
  const lastUrls = (): string[] => [...(decodeAll.mock.calls.at(-1) as unknown as [string[]])[0]];
  return { screen, cs, art, decodeAll, heroArtUrl, lastUrls };
}

describe('戰鬥畫面暖圖', () => {
  it('開戰暖兩位的全部姿勢與場上魔物', async () => {
    const { heroArtUrl, lastUrls } = await mount();
    expect(heroArtUrl).toHaveBeenCalledTimes(6);
    expect(lastUrls()).toEqual(['/rat_idle.webp', '/rat_attack.webp']);
  });

  it('整頁重畫不再重算角色姿勢，只補新召喚的魔物', async () => {
    const { screen, cs, decodeAll, heroArtUrl, lastUrls } = await mount();
    const calls = decodeAll.mock.calls.length;
    screen.rerender();
    expect(heroArtUrl).toHaveBeenCalledTimes(6);
    expect(decodeAll.mock.calls.length).toBe(calls);   // 什麼都沒變：一張都不送
    cs.enemies.push({ uid: 2, enemyId: 'slime' });
    screen.rerender();
    expect(heroArtUrl).toHaveBeenCalledTimes(6);
    expect(lastUrls()).toEqual(['/slime_idle.webp', '/slime_attack.webp']);
  });

  it('魔物換了階段立繪：補暖新的那一組', async () => {
    const { screen, art, lastUrls } = await mount();
    art[1] = 'rat_p2';
    screen.rerender();
    expect(lastUrls()).toEqual(['/rat_p2_idle.webp', '/rat_p2_attack.webp']);
  });

  it('連線途中才出現的那一位：下一次重畫補暖他的姿勢', async () => {
    const { screen, cs, heroArtUrl } = await mount();
    cs.players.push({ seat: 2, hero: 'dangdang' });
    screen.rerender();
    expect(heroArtUrl).toHaveBeenCalledTimes(9);
  });
});
