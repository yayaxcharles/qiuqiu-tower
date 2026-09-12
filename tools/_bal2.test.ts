import { describe, it } from 'vitest';
import { smartRun, type SmartStats } from '../src/engine/smartbot';
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const D = Number(env['D'] ?? 1);
function row(hero: 'ninja' | 'feifei', seeds: string[]): string {
  const rs: SmartStats[] = [];
  for (const s of seeds) for (let i = 0; i < 200; i++) rs.push(smartRun(`${s}-${i}`, D, hero));
  const n = rs.length, won = rs.filter((r) => r.won).length;
  const a2 = rs.filter((r) => r.act >= 2).length, a3 = rs.filter((r) => r.act >= 3).length;
  const fl = rs.map((r) => r.floor).sort((a, b) => a - b);
  const deaths = new Map<string, number>();
  for (const r of rs) if (r.diedTo) deaths.set(r.diedTo, (deaths.get(r.diedTo) ?? 0) + 1);
  const top = [...deaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join('、');
  return `${hero === 'ninja' ? '球球' : '菲菲'}　通關 ${won}/${n}　到二關 ${a2}　到三關 ${a3}`
    + `　平均 ${(fl.reduce((a, b) => a + b, 0) / n).toFixed(1)}F　中位 ${fl[Math.floor(n / 2)]}F　死最多：${top}`;
}
describe('平衡', () => {
  it(`難度 ${D}，各 600 局`, () => {
    const seeds = ['cmp', 'cmpB', 'cmpC'];
    // eslint-disable-next-line no-console
    for (const h of ['ninja', 'feifei'] as const) console.log('  ' + row(h, seeds));
  }, 900_000);
});
