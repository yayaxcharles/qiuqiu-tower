import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { writeDoc } from './docs-dump';
import { cards } from '../src/content/cards';
import { describeCard } from '../src/ui/cardtext';
it('dump cards', () => {
  const rows = cards.map((c) => ({ id: c.id, name: c.name, pool: c.pool, rarity: c.rarity, cost: c.cost, type: c.type, target: c.target,
    keywords: c.keywords ?? [], hidden: !!c.hidden, combatOnly: !!c.combatOnly, kinds: c.effects.map((e) => e.kind),
    effects: c.effects, upCost: c.upgrade.cost, text: describeCard(c, false), up: describeCard(c, true) }));
  // 平常跑測試不寫檔，`npm run docs:dump` 才更新（tools/docs-dump.ts）；指定了 CARD_DUMP 就照舊寫到那裡
  const text = JSON.stringify(rows, null, 1);
  if (process.env.CARD_DUMP) writeFileSync(process.env.CARD_DUMP, text, 'utf-8');
  else writeDoc('docs/牌池總表.json', text);
});
