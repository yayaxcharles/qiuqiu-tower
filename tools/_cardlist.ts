import { cards } from '../src/content/cards';
import { describeCard } from '../src/ui/cardtext';
for (const c of cards) {
  if (c.pool === '壞毛病') continue;
  console.log(`${c.pool}|${c.rarity}|${c.cost}費|${c.name}|${describeCard(c, false)}`);
}
