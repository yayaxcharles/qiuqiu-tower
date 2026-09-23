import { describe, expect, it } from 'vitest';
import { cards } from '../../src/content/cards';
import { potions } from '../../src/content/potions';
import { MIASMA_PURE, relicById, relics } from '../../src/content/relics';
import RATINGS from '../../src/engine/relic-ratings.json';
import { events, eventById } from '../../src/content/events';
import { HEROES, heroOf, pickable } from '../../src/engine/hero';
import {
  makeShop, newCoopRun, newRun, restCardChoices, swapCandidates, takeRelic, takeRestCard, transformCard, type ShopStock,
} from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { me } from '../../src/engine/runplayer';
import { keeperDetour, keeperServices, pillowWorthNap, purifyGain } from '../../src/engine/smartbot';
import type { KeeperId, RunState } from '../../src/engine/types';
import BLESSING_SRC from '../../src/engine/blessing.ts?raw';

/*
 * 第三批四條線合併後的收尾（2026-09-24 b3int，主控裁決）：婆婆淨化接上、換牌規則共用一份、貓薄荷田改名、藥簍夢枕調整。
 * 每一條都照「改回壞寫法會紅」寫（報告附確認方式）。藥簍的新規則在 `content_batch3_rare_0923.test.ts`，球球稀有事件文字延後載入在
 * `tests/ui/event_text_split.test.ts`，這裡不重複。
 */

function shopWith(keeper: KeeperId, seed: string): { run: RunState; shop: ShopStock } {
  const run = newRun(seed, 1, 'ninja');
  const node = run.map.nodes.find((n) => n.type === '罐頭鋪') ?? run.map.nodes[0]!;
  if (keeper !== 'orange') node.keeper = keeper; else delete node.keeper;
  run.currentNode = node.id;
  return { run, shop: makeShop(run) };
}
/** 對球球淨化收益最大的那件沾了魔氣的秘寶（量尺上「淨化版 − 原件」的層數） */
function bestMiasma(): string {
  return Object.keys(MIASMA_PURE).sort((a, b) => purifyGain(b, 'ninja').floors - purifyGain(a, 'ninja').floors)[0]!;
}

describe('婆婆的「請婆婆淨化」：機器人會用', () => {
  it('帶著收益夠大的魔氣秘寶、錢夠：在婆婆那裡淨化；在別位店主那裡不動', () => {
    const id = bestMiasma();
    expect(purifyGain(id, 'ninja').floors, '前提：量尺上淨化後至少多 1.5 層').toBeGreaterThanOrEqual(1.5);
    for (const k of ['tortoise', 'orange', 'curio', 'junk'] as const) {
      const { run, shop } = shopWith(k, `b3int-pur-${k}`);
      takeRelic(run, id);
      me(run).fish = 200;
      keeperServices(run, shop);
      if (k === 'tortoise') {
        expect(me(run).relics, k).toContain(MIASMA_PURE[id]);
        expect(me(run).fish, k).toBe(110);
        expect(shop.purified).toBe(true);
      } else {
        expect(me(run).relics, k).toContain(id);
        expect(shop.purified, k).toBeUndefined();
      }
    }
  });

  it('錢不到 130 就不淨化（留錢逛店）', () => {
    const id = bestMiasma();
    const { run, shop } = shopWith('tortoise', 'b3int-pur-poor');
    takeRelic(run, id);
    me(run).fish = 129;
    keeperServices(run, shop);
    expect(me(run).relics).toContain(id);
  });

  it('身上有沾了魔氣的秘寶就會為婆婆繞路（忍具帶夠也一樣）', () => {
    const { run } = shopWith('tortoise', 'b3int-detour');
    const node = run.map.nodes.find((n) => n.id === run.currentNode)!;
    me(run).potions = [potions[0]!.id, potions[1]!.id];
    expect(keeperDetour(run, node), '沒有魔氣秘寶、忍具夠：不繞').toBe(0);
    takeRelic(run, 'miasma_charm');
    expect(keeperDetour(run, node)).toBe(10);
  });
});

describe('阿福的換招與祝福的塗鴉本共用一份換牌規則（`run.ts` 的 `transformCard`）', () => {
  it('祝福那邊不再自己篩候選：叫的是 run.ts 那一支', () => {
    const src = BLESSING_SRC.replace(/\r\n/g, '\n');
    expect(src).toMatch(/import \{[^}]*\btransformCard\b[^}]*\} from '\.\/run';/);
    expect(src).toContain('transformCard(run, c, runRng(run), seat)');
    expect(src, '祝福那邊又寫了一支自己的換牌').not.toMatch(/function transformCard\(/);
  });

  it('候選規則跟合併前兩份一模一樣：同一位、忍術池、罕見以上（壞毛病換常見）、不同名；四隻、單人連線逐張比', () => {
    let n = 0;
    for (const players of [1, 2]) for (const h of HEROES) {
      const run = players === 1 ? newRun('b3int-swap', 1, h) : newCoopRun('b3int-swap', 1, h, h === 'ninja' ? 'feifei' : 'ninja');
      const hero = heroOf(me(run, 0));
      for (const c of cards) {
        const curse = c.pool === '壞毛病';
        const old = cards.filter((d) => d.pool === '忍術' && d.id !== c.id && pickable(d, hero, run.players.length)
          && (curse ? d.rarity === '常見' : d.rarity !== '常見')).map((d) => d.id);
        expect(swapCandidates(run, c.id, 0).map((d) => d.id), `${players} 人 ${h} ${c.id}`).toEqual(old);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(400);
  });

  it('原地換、升級不帶過去、亂數用呼叫端給的那一條（同一條亂數換出同一張）', () => {
    const run = newRun('b3int-tf', 1, 'feifei');
    const c = me(run).deck[0]!;
    c.upgraded = true;
    const uid = c.uid, at = me(run).deck.indexOf(c);
    const a = transformCard(run, c, new Rng(seedFromString('same')));
    expect(a).not.toBeNull();
    expect(me(run).deck[at]!.uid).toBe(uid);
    expect(c.upgraded).toBe(false);
    const run2 = newRun('b3int-tf', 1, 'feifei');
    const b = transformCard(run2, me(run2).deck[0]!, new Rng(seedFromString('same')));
    expect(b?.id).toBe(a?.id);
  });
});

describe('「大俠貓打過滾的貓薄荷田」（原名「掉進貓薄荷田的大俠貓」，2026-09-24 改名）', () => {
  it('標題換了；事件資料、選項、結果裡找不到舊名字', () => {
    expect(eventById['rare_catnip_master']!.title).toBe('大俠貓打過滾的貓薄荷田');
    const all = JSON.stringify(events);
    expect(all).not.toContain('掉進貓薄荷田的大俠貓');
  });
});

describe('淨化版照原件那一池的下四分位～上四分位（2026-09-24 b3int 主控裁決）', () => {
  const avg = (id: string): number => {
    const per = (RATINGS as { relics: Record<string, Record<string, { d: number }>> }).relics[id]!;
    const xs = HEROES.flatMap((h) => (per[h] ? [per[h]!.d] : []));   // 鎖角色的那幾件只有拿得到的那幾隻有格子
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  };
  const q3 = (pool: string): number => {
    const xs = relics.filter((r) => r.pool === pool).map((r) => avg(r.id)).sort((a, b) => a - b);
    const k = (xs.length - 1) * 0.75, lo = Math.floor(k), hi = Math.min(lo + 1, xs.length - 1);
    return xs[lo]! + (xs[hi]! - xs[lo]!) * (k - lo);
  };

  it('量尺表上：每一件淨化版都比原件好，而且不超過原件那一池的上四分位（原件本來就超過的，只准比原件好一點）', () => {
    for (const [orig, pure] of Object.entries(MIASMA_PURE)) {
      const pool = relicById[orig]!.pool;
      expect(avg(pure), `${pure} 要比 ${orig} 好`).toBeGreaterThan(avg(orig));
      // 量尺每格標準誤約 ±0.25 層，上四分位留 0.2 的量測誤差
      expect(avg(pure), `${pure} 不超過 ${pool} 池上四分位（或原件 +1.5）`).toBeLessThanOrEqual(Math.max(q3(pool), avg(orig) + 1.5) + 0.2);
    }
  });

  it('寫法：清心護符留 2 層炸毛、解契短刀 2 點爪力、大俠貓的舊護腕 2 點爪力並扣 3 點上限、月光晶石 +13', () => {
    expect(relicById['miasma_charm_pure']!.hooks).toEqual({ energyPerTurn: 1, combatStart: [{ kind: 'status', name: '炸毛', amount: 2, target: 'self' }] });
    expect(relicById['blood_dagger_pure']!.hooks).toEqual({ combatStart: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }] });
    expect(relicById['master_bracer_pure']!.hooks).toEqual({ combatStart: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }], maxHp: -3 });
    expect(relicById['miasma_shard_pure']!.hooks).toEqual({ maxHp: 13 });
  });
});

describe('夢枕：三張都是升級版、機器人會為它打盹', () => {
  function withPillow(seed: string): RunState {
    const run = newRun(seed, 1, 'ninja');
    takeRelic(run, 'dream_pillow');
    run.floor = 8;
    run.currentNode = run.map.nodes.find((n) => n.type === '貓窩')?.id ?? run.map.nodes[0]!.id;
    return run;
  }

  it('挑到的那張進牌組是升級版', () => {
    const run = withPillow('b3int-pillow');
    const picks = restCardChoices(run);
    expect(picks.length).toBe(3);
    expect(takeRestCard(run, picks[0]!.id)).toBe(true);
    const got = me(run).deck[me(run).deck.length - 1]!;
    expect(got.cardId).toBe(picks[0]!.id);
    expect(got.upgraded).toBe(true);
    expect(relicById['dream_pillow']!.text).toContain('升級版');
  });

  it('機器人：三張裡有夠好的就去打盹（血滿也一樣）；沒帶夢枕照舊不看', () => {
    let worth = 0;
    for (let i = 0; i < 20; i++) if (pillowWorthNap(withPillow(`b3int-pw-${i}`))) worth += 1;
    expect(worth, '二十格貓窩裡至少有幾格值得為夢枕打盹').toBeGreaterThan(3);
    expect(pillowWorthNap(newRun('b3int-nopillow', 1, 'ninja'))).toBe(false);
  });
});
