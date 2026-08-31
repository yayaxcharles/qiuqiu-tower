/**
 * 把 78 張牌的完整資料倒成 JSON，給做 DOCX 對照表用。
 *
 * 為什麼寫成測試檔：規則文字是 `describeCard()` 生出來的（TypeScript），
 * 用 Python 重寫一份一定會跟遊戲裡看到的不一樣。掛在 vitest 底下跑，
 * 用的就是遊戲本人那份程式，文字保證一模一樣。
 *
 * 跑法：npx vitest run tools/dump_cards.test.ts
 * 輸出：tools/out/cards.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { expect, it } from 'vitest';

import { cards, STARTER_DECK } from '../src/content/cards';
import { describeCard } from '../src/ui/cardtext';

it('倒出牌組資料', () => {
  const starterCount = new Map<string, number>();
  for (const id of STARTER_DECK) starterCount.set(id, (starterCount.get(id) ?? 0) + 1);

  const rows = cards.map((def) => ({
    id: def.id,
    name: def.name,
    cost: def.cost,
    type: def.type,
    rarity: def.rarity,
    pool: def.pool,
    target: def.target,
    art: def.art,
    starter: starterCount.get(def.id) ?? 0,
    text: describeCard(def, false),
    upgraded: describeCard(def, true),
  }));

  const out = resolve(__dirname, 'out/cards.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(rows, null, 1), 'utf-8');
  expect(rows.length).toBeGreaterThan(0);
});
