// 影子「慢你一拍」＋四隻各自的招牌（2026-09-26 使用者：「影子系列的怪物超級弱，每隻角色都一樣」→「好你試試看」）
import { describe, expect, it } from 'vitest';
import { encounterById } from '../../src/content/enemies';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import type { Hero } from '../../src/engine/hero';
import { learnedMove, SHADOW_DANGDANG, SHADOW_EXEC_POISON } from '../../src/engine/mimic';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';
import { inst } from '../helpers';

const fight = (enc: string, hero: Hero, deck: readonly string[] = ['sanjo', 'sanjo', 'sanjo', 'tanding', 'tanding', 'tanding'], seed = 'shadow') =>
  startCombat({ hp: 80, maxHp: 80, deck: deck.map((id, i) => inst(id, i + 1)), relics: [], potions: [],
    encounterId: enc, rng: new Rng(seedFromString(seed)), hero });
const ids = (m: ReturnType<typeof learnedMove>): string[] => (m?.learned ?? []).map((c) => c.cardId);

describe('慢你一拍：照抄你上一輪打的牌', () => {
  it('真的打一張貓抓、結束回合，影子下一招的預告就是那張貓抓', () => {
    const cs = fight('mirror_duel', 'dangdang', ['sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo', 'tanding', 'tanding', 'tanding', 'tanding', 'tanding']);
    const cat = cs.player.hand.find((c) => c.cardId === 'sanjo');
    expect(cat, '起手要有一張貓抓').toBeDefined();
    expect(playCard(cs, cat!.uid, cs.enemies[0]!.uid)).toBe(true);
    endTurn(cs);
    expect(ids(cs.enemies[0]!.move)).toEqual(['sanjo']);
    expect(cs.player.playedThisTurn, '新的一輪清空').toEqual([]);
  });

  it('打超過張數上限時挑費用最高的，照你打出的順序排', () => {
    const cs = fight('mirror_duel_a2', 'dangdang');   // 二關最多 2 張
    cs.player.playedThisTurn = [inst('tanding', 91), inst('sanjo', 92), inst('jinzhong', 93)];
    expect(ids(learnedMove(cs))).toEqual(['tanding', 'jinzhong']);   // 金鐘罩 2 費必選；1 費的同費照順序取先打的淡定
  });

  it('上一輪沒打半張學得會的，照舊從整副牌隨機抽', () => {
    const cs = fight('mirror_duel_a2', 'dangdang');
    cs.player.playedThisTurn = [];
    const m = learnedMove(cs)!;
    expect(m.learned).toHaveLength(2);
    for (const id of ids(m)) expect(['sanjo', 'tanding']).toContain(id);
  });

  it('影子學不會隱身：只打了替身術的那一輪，不會變成一招空的', () => {
    const cs = fight('mirror_duel', 'ninja');
    cs.player.playedThisTurn = [inst('kawarimi', 91)];
    const m = learnedMove(cs)!;
    expect(ids(m)).not.toContain('kawarimi');
    expect(m.effects.length).toBeGreaterThan(0);
    expect(m.effects.some((f) => f.kind === 'statusSelf' && f.name === '隱身')).toBe(false);
  });

  it('連線時座位 0 倒下：他那份清單不再清空，影子改回隨機抽，不會整場重複倒下前那一招', () => {
    const cs = fight('mirror_duel', 'dangdang', ['tanding', 'tanding', 'tanding', 'tanding']);
    cs.player.playedThisTurn = [inst('sanjo', 91)];
    cs.player.down = true;
    expect(ids(learnedMove(cs))).toEqual(['tanding']);   // 牌組只有淡定，抄到貓抓就是讀了倒下前那份
  });
});

describe('四隻各自的招牌', () => {
  it('球球的影子「影分身」：第一段攻擊多打一下，牌子寫出來；抄到的是防禦就不分身', () => {
    const cs = fight('mirror_duel', 'ninja');
    cs.player.playedThisTurn = [inst('sanjo', 91)];
    const m = learnedMove(cs)!;
    expect(m.effects).toEqual([{ kind: 'damage', amount: 6, times: 2 }]);
    expect(m.label).toBe('貓抓（影分身）');
    cs.player.playedThisTurn = [inst('tanding', 92)];
    expect(learnedMove(cs)!.label).not.toContain('影分身');
  });

  it('菲菲的影子「針上帶毒」：每張攻擊多一層中毒；你身上的毒夠多，下一招換成見血封喉', () => {
    const cs = fight('mirror_duel', 'feifei');
    cs.player.playedThisTurn = [inst('sanjo', 91)];
    expect(learnedMove(cs)!.effects).toEqual([{ kind: 'damage', amount: 6 }, { kind: 'statusPlayer', name: '中毒', amount: 1 }]);
    cs.player.statuses['中毒'] = SHADOW_EXEC_POISON;
    const m = learnedMove(cs)!;
    expect(m.label).toBe('見血封喉');
    expect(m.effects).toEqual([{ kind: 'damageByPlayerStatus', name: '中毒' }]);
  });

  it('噹噹的影子「鐵壁」：開場帶反彈；抄來的反彈不學', () => {
    const cs = fight('mirror_duel', 'dangdang');
    expect(getStatus(cs.enemies[0]!, '反彈')).toBe(SHADOW_DANGDANG.thorns);
    cs.player.playedThisTurn = [inst('dangdang_huijing', 91), inst('sanjo', 92)];
    const m = learnedMove(cs)!;
    expect(ids(m)).toEqual(['sanjo']);
    expect(m.effects.some((f) => f.kind === 'statusSelf' && f.name === '反彈')).toBe(false);
  });

  it('封封的影子「蓄氣」：每第三動多蓄一次氣（下一招傷害加倍），其他動不蓄', () => {
    const cs = fight('mirror_duel', 'fengfeng');
    const e = cs.enemies[0]!;
    cs.player.playedThisTurn = [inst('sanjo', 91)];
    e.turnCount = 1;
    expect(learnedMove(cs, e)!.effects.some((f) => f.kind === 'chargeNext')).toBe(false);
    e.turnCount = 2;   // 已經出過兩招，這是第三動
    const m = learnedMove(cs, e)!;
    expect(m.effects.at(-1)).toEqual({ kind: 'chargeNext' });
    expect(m.label).toBe('貓抓（蓄氣）');
  });

  it('封封走真的回合流程：每一輪打一張貓抓再結束回合，第三動帶蓄氣、第四動吃加倍', () => {
    const cs = fight('mirror_duel', 'fengfeng', Array.from({ length: 12 }, () => 'sanjo'));
    const e = cs.enemies[0]!;
    const labels: string[] = [];
    for (let t = 0; t < 3; t++) {
      cs.player.hp = cs.player.maxHp;
      const c = cs.player.hand.find((x) => x.cardId === 'sanjo')!;
      expect(playCard(cs, c.uid, e.uid)).toBe(true);
      endTurn(cs);
      labels.push(e.move.label);
    }
    expect(labels).toEqual(['貓抓', '貓抓（蓄氣）', '貓抓']);   // 第 2、3、4 動
    expect(e.charged).toBe(true);   // 第三動出完蓄了氣，第四動的貓抓吃加倍
  });

  it('招牌只看鏡子照的那一位：別隻的影子沒有反彈、不分身、不帶毒', () => {
    const cs = fight('mirror_duel', 'fengfeng');
    expect(getStatus(cs.enemies[0]!, '反彈')).toBe(0);
    cs.player.playedThisTurn = [inst('sanjo', 91)];
    expect(learnedMove(cs, cs.enemies[0]!)!.effects).toEqual([{ kind: 'damage', amount: 6 }]);
  });
});

describe('第三關菁英「影球球」改成你自己的影子', () => {
  it('遭遇 id 照舊，打的是鏡中對手＋影子名牌，玩哪一隻就是那一隻的影子', () => {
    const enc = encounterById['shadow_cat']!;
    expect(enc.enemies).toEqual(['mirror_qiuqiu']);
    expect(enc.skin).toBe('shadow');
    expect(enc.acts).toEqual([3]);
    const names: Record<Hero, string> = { ninja: '球球的影子', feifei: '菲菲的影子', dangdang: '噹噹的影子', fengfeng: '封封的影子' };
    for (const [hero, name] of Object.entries(names) as [Hero, string][]) {
      expect(fight('shadow_cat', hero).enemies[0]!.name, hero).toBe(name);
    }
  });
});
