import { describe, expect, it } from 'vitest';
import { addCard, beginCombat, finishCombat, newCoopRun, rest, takeRelic } from '../../src/engine/run';

/*
 * **各座位各算各的那幾樣，要有測試釘著**（2026-09-13 第三輪稽核 中-1／中-2）。
 *
 * 這三件事本來就修好了，但把修正改回舊寫法**一千多條測試照樣全綠**——
 * 等於沒有護欄，下一個重構的人會無聲地改回去。稽核代理的原話是「這個修正目前是裸的」。
 *
 * 三條都是**連線限定**：一個人玩時座位只有 0 號，怎麼寫都對，所以單機的測試抓不到。
 */
function winOnce(run: ReturnType<typeof newCoopRun>) {
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  const cs = beginCombat(run);
  for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
  cs.phase = 'won';
  return finishCombat(run, cs)!;
}

describe('戰利品的排除名單與加牌，各座位各算各的', () => {
  /*
   * 掌門印（`rewardChoices: 1`）買在 1 號身上，多的那一張就該給 1 號。
   * 改回只看 0 號的話，玩家看到的是「我花 230 條買的掌門印，我這份還是只有三張」。
   */
  it('掌門印買在 1 號：多的那一張給 1 號，不是 0 號', () => {
    const run = newCoopRun('extras-seal', 1, 'ninja', 'ninja');
    takeRelic(run, 'master_seal', 1);
    const r = winOnce(run);
    expect(r.cardsPerSeat![1]!.length, '1 號買的掌門印沒算到他自己頭上').toBe(4);
    expect(r.cardsPerSeat![0]!.length, '0 號沒買，不該跟著多一張').toBe(3);
  });

  /*
   * 排除名單（牌組裡已經有兩張的不再開）也要看自己的牌組。
   * 一局三張樣本太小，跑四十局才看得出「到底有沒有在排除」。
   */
  it('1 號牌組裡已經有兩張的，不該再開給他', () => {
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      const run = newCoopRun(`extras-ex-${i}`, 1, 'ninja', 'ninja');
      addCard(run, 'wozaizhe', false, 1);
      addCard(run, 'wozaizhe', false, 1);
      if (winOnce(run).cardsPerSeat![1]!.some((c) => c.id === 'wozaizhe')) seen += 1;
    }
    expect(seen, '排除名單還是照 0 號的牌組算').toBe(0);
  });

  /*
   * 反過來也要成立：0 號疊了兩張，**1 號那份照樣開得到**。
   * 少了這條的話，把 `excludeFor(i)` 寫死成 `excludeFor(1)` 也會過。
   */
  it('0 號疊了兩張，不該連累 1 號那一份', () => {
    let seen = 0;
    // 40 局 → 160 局（2026-09-23 內容擴充第一批）：忍具改成先抽稀有度，戰利品多吃一次亂數，
    // 這四十顆種子剛好一次都沒開到（單次約六趴、四十局全落空約一成的機率）；拉長樣本讓它只在真的被連累時才紅
    for (let i = 0; i < 160; i++) {
      const run = newCoopRun(`extras-ex2-${i}`, 1, 'ninja', 'ninja');
      addCard(run, 'wozaizhe', false, 0);
      addCard(run, 'wozaizhe', false, 0);
      if (winOnce(run).cardsPerSeat![1]!.some((c) => c.id === 'wozaizhe')) seen += 1;
    }
    expect(seen, '1 號被 0 號的牌組連累了').toBeGreaterThan(0);
  });
});

/*
 * **加入的那位的暖毯**（稽核 2026-09-13 中-2）。
 *
 * 這一段是既有行為被搬家：本來 `beginCombat` 在 `startJoinedSeat` 之後才加蜷縮，
 * 現在交給 `startJoinedSeat` 在回合開始之前加，位置跟座位 0 一致。
 * 搬家最容易掉東西，而掉了完全看不出來——玩家只是第一回合白挨 12 點。
 */
describe('加入的那位在貓窩蓋的毯子', () => {
  it('1 號打盹過：下一場開戰要帶著 12 點蜷縮', () => {
    const run = newCoopRun('extras-blanket', 1, 'ninja', 'ninja');
    takeRelic(run, 'warm_blanket', 1);
    const node = run.map.nodes.find((n) => n.type === '貓窩') ?? run.map.nodes[0]!;
    run.currentNode = node.id;
    expect(rest(run, '打盹', undefined, 1), '打盹要成功，不然這條在測空氣').toBe(true);
    const fight = run.map.nodes.find((n) => n.type === '戰鬥')!;
    run.currentNode = fight.id;
    const cs = beginCombat(run);
    expect(cs.players[1]!.block, '加入方的暖毯沒帶進戰鬥').toBeGreaterThanOrEqual(12);
    expect(cs.players[0]!.block, '0 號沒蓋毯子，不該憑空有蜷縮').toBe(0);
  });

  it('帶進來之後就用掉了，下一場不會再有', () => {
    const run = newCoopRun('extras-blanket2', 1, 'ninja', 'ninja');
    takeRelic(run, 'warm_blanket', 1);
    const node = run.map.nodes.find((n) => n.type === '貓窩') ?? run.map.nodes[0]!;
    run.currentNode = node.id;
    rest(run, '打盹', undefined, 1);
    const fight = run.map.nodes.find((n) => n.type === '戰鬥')!;
    run.currentNode = fight.id;
    beginCombat(run);
    const again = beginCombat(run);
    expect(again.players[1]!.block, '暖毯只帶一場，第二場不該再有').toBe(0);
  });
});
