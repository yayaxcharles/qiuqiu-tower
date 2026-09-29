/**
 * 戰鬥紀錄「中文一字不差」的對照（2026-09-29 多語系第二片）：紀錄改成「事件＋參數」之前先跑一次存底，改完再跑一次比對。
 * 每位角色（單人、兩兩組隊）× 每一場遭遇，另一輪戴滿全部秘寶，讓機器人打完，整份紀錄寫進檔案。
 * 平常不跑（要帶 `LOG_GOLDEN_OUT=<檔案路徑>`）。
 */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { encounters } from '../src/content/enemies';
import { relics } from '../src/content/relics';
import { HEROES } from '../src/engine/hero';
import { Rng, seedFromString } from '../src/engine/rng';
import { beginCombat, newCoopRun, newRun, takeRelic } from '../src/engine/run';
import { me } from '../src/engine/runplayer';
import { smartCombat } from '../src/engine/smartbot';

declare const process: { env: Record<string, string | undefined> };
const OUT = process.env['LOG_GOLDEN_OUT'];

it.skipIf(!OUT)('戰鬥紀錄存底', () => {
  const lines: string[] = [];
  const fight = (run: ReturnType<typeof newRun>, tag: string, potions: string[]): void => {
    for (const enc of encounters) {
      const cs = beginCombat(run, enc.id);
      cs.player.potions = [...potions];
      try { smartCombat(cs, new Rng(seedFromString(`${tag}:${enc.id}`)), 80, tag); } catch (e) { lines.push(`!! ${tag} ${enc.id} ${String(e)}`); }
      lines.push(`## ${tag} ${enc.id}`, ...cs.log);
      for (const p of run.players) { p.hp = p.maxHp; p.down = false; }
      run.status = 'playing';
    }
  };
  for (const h of HEROES) fight(newRun(`golden-${h}`, 2, h), `solo-${h}`, ['whetstone', 'claw_oil', 'smoke_bomb']);
  for (const a of HEROES) for (const b of HEROES) if (a < b) fight(newCoopRun(`golden-${a}-${b}`, 2, a, b), `coop-${a}-${b}`, ['rope', 'shuriken']);
  const all = newRun('golden-all', 3, 'ninja');
  for (const r of relics) if (!me(all).relics.includes(r.id)) takeRelic(all, r.id);
  fight(all, 'relics-all', ['whetstone', 'claw_oil', 'rope']);
  writeFileSync(OUT!, lines.join('\n'), 'utf-8');
});
