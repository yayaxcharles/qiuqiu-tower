import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { smartRun } from '../src/engine/smartbot';
it('b', () => {
  const rows: string[] = [];
  for (const hero of ['ninja', 'feifei'] as const) {
    const agg = new Map<string, { n: number; w: number; hp: number; turns: number }>();
    for (let i = 0; i < 400; i++) {
      const r = smartRun(`b-${i}`, 3, hero) as unknown as { bosses: { id: string; won: boolean; hpIn: number; maxHp: number; turns: number }[] };
      for (const b of r.bosses) {
        const c = agg.get(b.id) ?? { n: 0, w: 0, hp: 0, turns: 0 };
        c.n++; c.w += b.won ? 1 : 0; c.hp += b.hpIn / b.maxHp; c.turns += b.turns;
        agg.set(b.id, c);
      }
    }
    rows.push(`【${hero === 'ninja' ? '球球' : '菲菲'}】400 局，難度 3`);
    for (const [id, v] of [...agg].sort((a, b) => b[1].n - a[1].n)) {
      rows.push(`  ${id.padEnd(16)} 打了 ${String(v.n).padStart(3)} 場　玩家勝 ${(v.w / v.n * 100).toFixed(0)}%　進場血 ${(v.hp / v.n * 100).toFixed(0)}%　${(v.turns / v.n).toFixed(1)} 回合`);
    }
  }
  writeFileSync(process.env.OUT ?? 'boss.txt', rows.join('\n'), 'utf-8');
}, 900_000);
