import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cards } from '../src/content/cards';
import { describeCard } from '../src/ui/cardtext';
it('dump cards', () => {
  const rows = cards.map((c) => ({ id: c.id, name: c.name, pool: c.pool, rarity: c.rarity, cost: c.cost, type: c.type, target: c.target,
    keywords: c.keywords ?? [], hidden: !!c.hidden, combatOnly: !!c.combatOnly, kinds: c.effects.map((e) => e.kind),
    effects: c.effects, upCost: c.upgrade.cost, text: describeCard(c, false), up: describeCard(c, true) }));
  writeFileSync(process.env.CARD_DUMP ?? 'docs/牌池總表.json', JSON.stringify(rows, null, 1), 'utf-8');
});
