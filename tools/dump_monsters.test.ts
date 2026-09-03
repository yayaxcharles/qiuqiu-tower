/**
 * 把所有魔物定義倒成 JSON 給「怪物工作檯」網頁（tools/build_monster_workbench.py）用。
 * 跑法：npx vitest run tools/dump_monsters.test.ts → docs/怪物工作檯.json
 * 只倒資料：id／名字／血／池／體型／出現關數／被動（除了結構欄位以外的所有鍵）／招式／階段。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { encounters, enemies } from '../src/content/enemies';

const STRUCT = new Set(['id', 'name', 'hp', 'pool', 'pattern', 'size', 'art', 'line', 'lines', 'moves', 'phases', 'chooseMove']);

it('倒出怪物工作檯資料', () => {
  const acts = new Map<string, Set<number>>();
  for (const enc of encounters) {
    if (!enc.acts) continue;   // 關主遭遇沒標關數（由關主表決定），不算進出現關數
    for (const id of enc.enemies) {
      const set = acts.get(id) ?? new Set<number>();
      for (const a of enc.acts) set.add(a);
      acts.set(id, set);
    }
  }
  const rows = enemies.map((e) => {
    const passives: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e as unknown as Record<string, unknown>)) {
      if (!STRUCT.has(k) && typeof v !== 'function') passives[k] = v;
    }
    return {
      id: e.id, name: e.name, hp: e.hp, pool: e.pool, size: e.size, pattern: e.pattern, art: e.art,
      acts: [...(acts.get(e.id) ?? [])].sort(),
      passives, moves: e.moves,
      phases: (e.phases ?? []).map((p) => ({ ...p })),
      note: '',
    };
  });
  const out = resolve(__dirname, '..', 'docs', '怪物工作檯.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), monsters: rows }, null, 1), 'utf8');
  expect(rows.length).toBeGreaterThan(50);
});
