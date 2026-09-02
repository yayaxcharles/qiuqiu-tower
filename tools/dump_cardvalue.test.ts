/**
 * 把 86 張可拿的牌（壞毛病除外）倒成「牌費量表」網頁要的形狀，含升級版的費用／效果／關鍵字／牌面文字。
 * 牌面文字用遊戲本人的 describeCard() 生，跟遊戲裡看到的一模一樣。
 * 跑法：npx vitest run tools/dump_cardvalue.test.ts   輸出：tools/out/cardvalue.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { expect, it } from 'vitest';

import { cards } from '../src/content/cards';
import { describeCard } from '../src/ui/cardtext';

it('倒出牌費量表資料', () => {
  const rows = cards.filter((def) => def.pool !== '壞毛病').map((def) => ({
    id: def.id, name: def.name, pool: def.pool, rarity: def.rarity, type: def.type, cost: def.cost,
    keywords: def.keywords ?? [], effects: def.effects, text: describeCard(def, false),
    upgrade: {
      cost: def.upgrade.cost ?? def.cost,
      effects: def.upgrade.effects ?? def.effects,
      keywords: def.upgrade.keywords ?? def.keywords ?? [],
      text: describeCard(def, true),
    },
  }));
  expect(rows.length).toBeGreaterThan(80);
  const out = resolve(__dirname, 'out/cardvalue.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(rows), 'utf8');
});
