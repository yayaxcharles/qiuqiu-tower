import { describe, expect, it } from 'vitest';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { damageEnemy } from '../../src/engine/actions';
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
  /*
   * **獎勵規則 2026-09-11 換過一次**（使用者：「逃跑的怪不該有該隻怪的獎勵」）。
   *
   * 舊規則：自己散掉時只要打進兩成血（`FADE_REWARD_MIN`）就照常發獎，
   * 而「逃走」（橘貓山賊）完全不受限制。那是為了照顧「認真打了六回合、
   * 把 125 血的醉拳狗打到剩兩成、最後一回合牠散掉」的委屈案例。
   * 新規則：**一隻都沒打倒就沒有戰利品**，散掉與逃走一視同仁。
   * 那個委屈案例已經不存在——醉拳狗（唯一會散的大魔物）同一天拿掉了消散，
   * 現在會散的只剩幻狐與怨靈武者兩隻一般怪，一般戰本來就不該打到散掉還沒打完。
   * 這一組因此整個改寫，測試對象從醉拳狗換成幻狐。
   */
  it('自己散掉、一隻都沒打倒：沒有戰利品', () => {
    const run = newRun('fade', 1);
    const cs = combat('phantom_fox', []);
    for (let i = 0; i < 12 && cs.phase === 'player'; i++) endTurn(cs);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(0);
    expect(cs.enemies.some((e) => e.faded)).toBe(true);
    const r = finishCombat(run, cs);
    expect(r?.escaped).toBe(true);
    expect(r?.relic).toBeNull();
    expect(r?.cards).toEqual([]);
    expect(r?.fish).toBe(0);
  });

  it('**打進去很多也一樣沒有**：門檻整個拿掉了，只看有沒有打倒', () => {
    const run = newRun('dealt', 1);
    const cs = combat('phantom_fox', []);
    const foe = cs.enemies[0]!;
    damageEnemy(cs, foe, 60, { direct: true });   // 70~78 血打進 60 點，舊規則早就過門檻了
    for (let i = 0; i < 12 && cs.phase === 'player'; i++) endTurn(cs);
    expect(cs.kills).toBe(0);
    expect(cs.enemies.some((e) => e.faded)).toBe(true);
    expect(finishCombat(run, cs)?.escaped).toBe(true);
  });

  it('**逃走跟散掉一視同仁**：橘貓山賊帶著小魚乾跑掉也沒有戰利品', () => {
    // 舊規則刻意放行逃走（「那是正常打但差一口氣」），使用者 2026-09-11 改掉：
    // 牠全身而退、還帶走你的小魚乾，再發獎說不過去
    const run = newRun('flee', 1);
    const cs = combat('orange_bandit', []);
    for (let i = 0; i < 12 && cs.phase === 'player'; i++) endTurn(cs);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(0);
    expect(cs.enemies.some((e) => e.escaped)).toBe(true);
    const r = finishCombat(run, cs);
    expect(r?.escaped).toBe(true);
    expect(r?.cards).toEqual([]);
  });

  it('打倒一隻就算數：兩隻裡跑掉一隻，戰利品照發', () => {
    // 規則的判準是 `cs.kills === 0`，不是「有沒有人跑掉」——
    // 清掉一隻就代表你真的打贏了一部分，不該連戰利品都沒有
    const run = newRun('one', 1);
    const cs = combat('panther_fox', []);
    const fox = cs.enemies.find((e) => e.enemyId === 'phantom_fox')!;
    const other = cs.enemies.find((e) => e.enemyId !== 'phantom_fox')!;
    damageEnemy(cs, other, 9999, { direct: true });   // 把不會散的那隻打死
    for (let i = 0; i < 12 && cs.phase === 'player'; i++) endTurn(cs);
    expect(cs.kills).toBeGreaterThan(0);
    expect(fox.faded || fox.dead).toBe(true);
    const r = finishCombat(run, cs);
    expect(r?.escaped).toBeUndefined();
    expect(r?.cards.length).toBeGreaterThan(0);
  });

  it('**大魔物不會自己走掉**：醉拳狗拿掉了消散，只會越打越強', () => {
    // 使用者 2026-09-11：「菁英怪應該是強力且打到底的，不該讓菁英怪逃跑」。
    // 牠身上的 `strengthEveryNTurns: 1`（每回合 +1 爪力）跟消散本來就互相矛盾
    const cs = combat('drunk_dog', []);
    const foe = cs.enemies[0]!;
    for (let i = 0; i < 12 && cs.phase === 'player'; i++) { cs.player.block = 999; endTurn(cs); }
    expect(foe.faded, '打十二回合也不會自己散掉').toBeFalsy();
    expect(foe.dead).toBe(false);
    expect(getStatus(foe, '爪力'), '而且越拖越強').toBeGreaterThan(5);
  });

  it('高-1 事件獎金不會被早退吞掉', () => {
    const run = newRun('bonus', 1);
    const before = run.fish;
    const cs = combat('phantom_fox', []);   // 醉拳狗 2026-09-11 拿掉消散，改用還會散的幻狐
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
