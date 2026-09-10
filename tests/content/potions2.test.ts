import { describe, expect, it } from 'vitest';
import { makeShop, newRun } from '../../src/engine/run';
import { rollPotion } from '../../src/engine/rewards';
import { potionById, potions } from '../../src/content/potions';
import { Rng, seedFromString } from '../../src/engine/rng';

/** 2026-09-11 加的七支戰術型忍具（使用者指定） */
const NEW = ['clone_oil', 'iron_salve', 'revive_pill', 'first_incense', 'pick_back', 'claw_bolt', 'bind_nail'];

describe('新忍具', () => {
  it('七支都在，資料齊全', () => {
    for (const id of NEW) {
      const d = potionById[id];
      expect(d, id).toBeTruthy();
      expect(d!.effects.length, id).toBeGreaterThan(0);
      expect(d!.text.length, id).toBeGreaterThan(4);
      expect(d!.art.startsWith('codex/potion_'), id).toBe(true);
    }
  });

  it('**進得了戰利品的忍具池**：加了新忍具卻沒進池的話，玩家一輩子拿不到', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1200; i++) seen.add(rollPotion(new Rng(seedFromString(`p${i}`))));
    for (const id of NEW) expect(seen.has(id), `${id} 抽不到`).toBe(true);
  });

  it('**進得了罐頭鋪**：同上，貨架也要看得到', () => {
    const inShop = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const run = newRun(`s${i}`, 1);
      for (const it of makeShop(run).potions) inShop.add(it.id);
    }
    for (const id of NEW) expect(inShop.has(id), `${id} 沒進過貨`).toBe(true);
  });

  it('起死回生丹只在生命低於三成時用得出來', () => {
    const u = potionById['revive_pill']!.usable!;
    expect(u.check(29, 100), '29/100 該可以用').toBe(true);
    expect(u.check(30, 100), '剛好三成不算低於三成').toBe(false);
    expect(u.check(80, 100), '滿血不能用').toBe(false);
    expect(u.reason.length).toBeGreaterThan(4);
  });

  it('只有起死回生丹有使用條件，其餘一律隨時可用', () => {
    for (const p of potions) {
      if (p.id === 'revive_pill') continue;
      expect(p.usable, `${p.id} 不該有使用條件`).toBeUndefined();
    }
  });
});
