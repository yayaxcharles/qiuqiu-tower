import { describe, expect, it } from 'vitest';
import { relicOutcomeText } from '../../src/engine/rewards';
import { relicById } from '../../src/content/relics';

/**
 * 連線版撞件結算後的那句公告（使用者 2026-09-15：「雙人選擇的時候要知道最後誰拿到什麼」）。
 * 用秘寶表裡真的存在的兩件來測，名字照表念；`seat` 是我，另一位叫「同伴」。
 */
const [a, b] = Object.keys(relicById).slice(0, 2) as [string, string];
const na = relicById[a]!.name;
const nb = relicById[b]!.name;

describe('撞件結算的公告', () => {
  it('各拿各的：兩個人都念到，不提擲骰', () => {
    const s = relicOutcomeText([a, b], [a, b], [a, b], 0);
    expect(s).toBe(`你拿到「${na}」、同伴拿到「${nb}」`);
    expect(s).not.toContain('擲骰');
  });

  it('撞件：先講兩人都想要哪件、擲骰決定，再講結果；座位 1 的視角把「你」放對人', () => {
    const s = relicOutcomeText([a, b], [a, a], [b, a], 1);
    expect(s.startsWith(`兩人都想要「${na}」，擲骰決定：`)).toBe(true);
    expect(s).toContain(`同伴拿到「${nb}」`);
    expect(s).toContain(`你拿到「${na}」`);
  });

  it('只有一個人分到（池子只剩一件）：只念拿到的那位；沒人拿到就空字串', () => {
    expect(relicOutcomeText([a], [a, a], [a, null], 0)).toContain('你拿到');
    expect(relicOutcomeText([a], [a, a], [a, null], 0)).not.toContain('同伴');
    expect(relicOutcomeText([a], [null, null], [null, null], 0)).toBe('');
  });
});
