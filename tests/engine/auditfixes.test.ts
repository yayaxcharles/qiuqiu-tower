import { describe, expect, it } from 'vitest';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { checkRun } from '../../src/engine/save';
import { finishCombat, newRun, openChest } from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { relics } from '../../src/content/relics';
import { inst } from '../helpers';

function combat(encounterId: string, deck = [inst('canshang', 1)]) {
  const cs = startCombat({ hp: 999, maxHp: 999, deck, relics: [], potions: [], encounterId, rng: new Rng(seedFromString('fix')) });
  cs.player.drawPile = []; cs.player.hand = [...deck]; cs.player.energy = 9;
  return cs;
}

describe('稽核 2026-09-10 的修正', () => {
  it('高-1 消散：一隻都沒打倒就沒有戰利品', () => {
    const run = newRun('fade', 1);
    const cs = combat('drunk_dog', []);
    for (let i = 0; i < 12 && cs.phase === 'player'; i++) endTurn(cs);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(0);
    const r = finishCombat(run, cs);
    expect(r?.escaped).toBe(true);
    expect(r?.relic).toBeNull();
    expect(r?.cards).toEqual([]);
    expect(r?.fish).toBe(0);
  });

  it('中-1 逃走招式不算「自己散掉」，獎勵照發', () => {
    // 橘貓山賊第五回合帶著小魚乾逃走：那是正常打但差一口氣，不該連戰利品都沒有
    const run = newRun('flee', 1);
    const cs = combat('orange_bandit', []);
    for (let i = 0; i < 12 && cs.phase === 'player'; i++) endTurn(cs);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(0);
    expect(cs.enemies.some((e) => e.escaped)).toBe(true);
    expect(cs.enemies.some((e) => e.faded)).toBe(false);   // 逃走不是散掉
    const r = finishCombat(run, cs);
    expect(r?.escaped).toBeUndefined();
    expect(r?.cards.length).toBeGreaterThan(0);   // 照樣有戰利品
  });

  it('高-1 事件獎金不會被早退吞掉', () => {
    const run = newRun('bonus', 1);
    const before = run.fish;
    const cs = combat('drunk_dog', []);
    for (let i = 0; i < 12 && cs.phase === 'player'; i++) endTurn(cs);
    const r = finishCombat(run, cs, 40);
    expect(r?.escaped).toBe(true);
    expect(r?.fish).toBe(0);            // 魔物身上沒有戰利品
    expect(run.fish).toBe(before + 40); // 但事件答應的獎金照給
  });

  it('高-2 借力使力吃得到蓄力加倍', () => {
    const mk = (charged: boolean): number => {
      const cs = combat('wood_dummy', [inst('jiedao', 1)]);
      const foe = cs.enemies[0]!;
      foe.hp = 500; foe.maxHp = 500; foe.block = 0;
      cs.player.block = 20;
      if (charged) cs.player.doubleNext = 1;
      playCard(cs, 1, foe.uid);
      return 500 - foe.hp;
    };
    expect(mk(false)).toBe(20);
    expect(mk(true)).toBe(40);   // 修好之前是 20
  });

  it('中-1 被定住的魔物不會震散你、也不會長爪力', () => {
    const cs = combat('tower_master', []);
    const boss = cs.enemies[0]!;
    boss.phase = 2;   // 師父第三條血才有 drainPlayerPerTurn
    addStatus(cs.player, '爪力', 6);
    addStatus(cs.player, '貓步', 6);
    addStatus(boss, '定身', 1);
    const bossClaw = getStatus(boss, '爪力');
    endTurn(cs);
    expect(getStatus(cs.player, '爪力')).toBe(6);
    expect(getStatus(cs.player, '貓步')).toBe(6);
    expect(getStatus(boss, '爪力')).toBe(bossClaw);
    expect(cs.log.some((l) => l.includes('震散'))).toBe(false);
  });

  it('低-1 自己疊的減益不會把魔物給的那幾層一起凍住', () => {
    const cs = combat('wood_dummy', [inst('chudashi', 1)]);   // 出大事了：自帶 1 層翻肚
    addStatus(cs.player, '翻肚', 3);                          // 假裝是魔物給的
    playCard(cs, 1);
    expect(getStatus(cs.player, '翻肚')).toBe(4);
    endTurn(cs);
    expect(getStatus(cs.player, '翻肚')).toBe(3);   // 修好之前會停在 4
  });

  it('紙箱一定給秘寶：常見池收光就往上退', () => {
    const run = newRun('chest', 1);
    // 先把常見池全部塞進背包，再開箱
    run.relics = relics.filter((r) => r.pool === '常見').map((r) => r.id);
    const got = openChest(run);
    expect(got).not.toBeNull();
    expect(relics.find((r) => r.id === got)?.pool).not.toBe('常見');
  });

  it('中-3、低-2 存檔驗證擋得住壞掉的地圖與欄位', () => {
    const good = (): ReturnType<typeof newRun> => JSON.parse(JSON.stringify(newRun('save', 1))) as ReturnType<typeof newRun>;
    expect(checkRun(good())).not.toBeNull();

    const noStart = good(); delete (noStart.map as { start?: unknown }).start;
    expect(checkRun(noStart)).toBeNull();

    const badStart = good(); (badStart.map as { start: string[] }).start = ['f1-l99'];
    expect(checkRun(badStart)).toBeNull();

    const badNext = good();
    const withNext = badNext.map.nodes.find((n) => n.next && n.next.length > 0);
    if (withNext) withNext.next = ['nope'];
    expect(checkRun(badNext)).toBeNull();

    const emptyNodes = good(); emptyNodes.map.nodes = [];
    expect(checkRun(emptyNodes)).toBeNull();

    const noCost = good(); delete (noCost as { removeCost?: unknown }).removeCost;
    expect(checkRun(noCost)).toBeNull();

    const badTrail = good(); (badTrail as { trail: unknown }).trail = 'x';
    expect(checkRun(badTrail)).toBeNull();

    const badAct = good(); badAct.act = 9;
    expect(checkRun(badAct)).toBeNull();

    const overHeal = good(); overHeal.hp = overHeal.maxHp + 50;
    expect(checkRun(overHeal)).toBeNull();

    const badRng = good(); (badRng.rng as unknown as Record<string, unknown>)['a'] = 'x';
    expect(checkRun(badRng)).toBeNull();

    const dupUid = good(); dupUid.deck = [dupUid.deck[0]!, { ...dupUid.deck[0]! }];
    expect(checkRun(dupUid)).toBeNull();
  });
});
