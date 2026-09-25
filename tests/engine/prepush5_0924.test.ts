import { describe, expect, it } from 'vitest';
import {
  applyRunEffects, canTakeRestCard, chooseNode, keeperFirstMeet, meetKeeper, miasmaRelicsOf, newCoopRun, purifyRelic,
  removeCard, restCardChoices, takeRelic, takeRestCard, type RunEffectOutcome,
} from '../../src/engine/run';
import { rollRelic, rollRelicChoices } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';
import { canApplyRun, applyRunAction, type RunAction } from '../../src/net/runaction';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { runFingerprint } from '../../src/net/hash';
import { MIASMA_PURE, ownedForRolls, ownsRelic } from '../../src/content/relics';
import { rareEvents } from '../../src/content/events-rare';
import { choiceEffectsFor, choiceGate } from '../../src/engine/eventcond';
import { allVoted, onlyStanding } from '../../src/engine/vote';
import { PickWaits, pickKindsFor, pickKindsOf } from '../../src/engine/eventpicks';
import { restRedrawOnMate, type RestPhase } from '../../src/ui/restphase';
import { nextChoices } from '../../src/engine/map';
import type { EventChoice, RunState } from '../../src/engine/types';
import EVENT_SRC from '../../src/ui/screens/event.ts?raw';
import REST_SRC from '../../src/ui/screens/rest.ts?raw';
import SHOP_SRC from '../../src/ui/screens/shop.ts?raw';

/*
 * 推前審查五（2026-09-24，`c0923-int3`）四條高、一條低的回歸測試。
 * 高-1、高-4 走兩台真的連線會話（`LoopbackPair.hold`：一台先、一台後，兩種順序都跑），
 * 畫面那一段用跟畫面同一份純邏輯（`ui/restphase.ts`、`engine/eventpicks.ts`）照畫面的流程模擬。
 */

const norm = (s: string): string => s.replace(/\r\n/g, '\n');

describe('高-3 淨化過的原件：抽不到、拿不到、清心香不出現', () => {
  const PURE_POOLS: [string, '大魔物' | '事件'][] = [['miasma_charm', '大魔物'], ['blood_dagger', '大魔物'], ['miasma_shard', '事件'], ['miasma_lantern', '大魔物']];

  it('淨化之後，原件在每一條抽秘寶的路上都不會再出現（400 顆種子）', () => {
    for (const [orig, pool] of PURE_POOLS) {
      const run = newCoopRun(`c3-roll-${orig}`, 1, 'ninja', 'feifei');
      takeRelic(run, orig, 0);
      expect(purifyRelic(run, orig, 0), `${orig} 淨化得掉`).toBe(true);
      const owned = run.players[0]!.relics;
      expect(owned).toContain(MIASMA_PURE[orig]);
      expect(owned).not.toContain(orig);
      for (let i = 0; i < 400; i++) {
        expect(rollRelic(new Rng(seedFromString(`r${i}`)), pool, owned, ['ninja']), `${orig} 單抽 ${i}`).not.toBe(orig);
        expect(rollRelicChoices(new Rng(seedFromString(`c${i}`)), pool, [owned, run.players[1]!.relics], 3, ['ninja', 'feifei']), `${orig} 三選一 ${i}`).not.toContain(orig);
      }
    }
  });

  it('前提：沒淨化過的時候原件抽得到（上一條不是因為池子裡本來就沒有）', () => {
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) seen = rollRelic(new Rng(seedFromString(`r${i}`)), '大魔物', [], ['ninja']) === 'miasma_charm';
    expect(seen).toBe(true);
  });

  it('拿、買、事件給、連線放行都把淨化版當成原件', () => {
    const run = newCoopRun('c3-take', 1, 'ninja', 'feifei');
    takeRelic(run, 'miasma_charm', 0);
    purifyRelic(run, 'miasma_charm', 0);
    expect(ownsRelic(run.players[0]!.relics, 'miasma_charm')).toBe(true);
    expect(ownedForRolls(run.players[0]!.relics)).toContain('miasma_charm');
    expect(takeRelic(run, 'miasma_charm', 0), '直接拿').toBe(false);
    expect(run.players[0]!.relics.filter((id) => id === 'miasma_charm' || id === 'miasma_charm_pure')).toEqual(['miasma_charm_pure']);
    expect(canApplyRun({ run }, { t: 'relic', seat: 0, id: 'miasma_charm' }), '連線拿秘寶的放行').toBe(false);
    // 同伴沒有淨化版：照樣拿得到（每一位各算各的）
    expect(canApplyRun({ run }, { t: 'relic', seat: 1, id: 'miasma_charm' })).toBe(true);
    applyRunEffects(run, [{ kind: 'relicId', id: 'miasma_charm' } as never], undefined, undefined, 0);
    expect(run.players[0]!.relics).not.toContain('miasma_charm');
  });

  it('舊存檔兩件並存：原件不算「可以淨化」，清心香與淨化放行都不出現、不會斷線；兩件都留著', () => {
    const run = newCoopRun('c3-old', 1, 'ninja', 'feifei');
    run.players[0]!.relics.push('miasma_charm_pure', 'miasma_charm');   // 修之前抽到的：兩件都在身上
    expect(miasmaRelicsOf(run, 0)).toEqual([]);
    const shrine = { label: '', requires: { kind: 'miasmaRelic' } } as unknown as EventChoice;
    expect(choiceGate(run, shrine, 0).shown, '事件的【魔氣】選項也不出現').toBe(false);
    const a: RunAction = { t: 'rest', seat: 0, c: '淨化', r: 'miasma_charm' };
    expect(canApplyRun({ run }, a), '主機不發號碼').toBe(false);
    expect(applyRunAction({ run }, a)).toBe(false);
    expect(run.players[0]!.relics).toEqual(expect.arrayContaining(['miasma_charm_pure', 'miasma_charm']));
    // 另一件真的沒淨化過的照舊淨化得了
    run.players[0]!.relics.push('blood_dagger');
    expect(miasmaRelicsOf(run, 0)).toEqual(['blood_dagger']);
    expect(choiceGate(run, shrine, 0)).toMatchObject({ shown: true, by: 0, why: { kind: 'relic', id: 'blood_dagger' } });
  });

  it('畫面：清心香的鈕照 `miasmaRelicsOf`、罐頭鋪的「已經有了」照 `ownsRelic`', () => {
    expect(norm(REST_SRC)).toContain('const miasma = miasmaRelicsOf(run, seat);');
    expect(norm(SHOP_SRC)).toContain('const owned = ownsRelic(me(run, seat).relics, it.id);');
  });
});

describe('高-2 夢枕連點：第二張不發號碼、不斷線', () => {
  const mk = (): RunState => {
    const r = newCoopRun('c3-pillow', 1, 'ninja', 'feifei');
    takeRelic(r, 'dream_pillow', 1);
    r.currentNode = r.map.start[0]!;
    return r;
  };

  it('引擎：挑過一張之後，放行判準與套用都說不行；不在三張裡的也不行', () => {
    const run = mk();
    const picks = restCardChoices(run, 1);
    expect(picks.length).toBe(3);
    expect(canTakeRestCard(run, 'not_a_card', 1)).toBe(false);
    expect(canTakeRestCard(run, picks[0]!.id, 0), '沒帶夢枕的那一位').toBe(false);
    const a: RunAction = { t: 'restCard', seat: 1, id: picks[0]!.id };
    const b: RunAction = { t: 'restCard', seat: 1, id: picks[1]!.id };
    expect(canApplyRun({ run }, a)).toBe(true);
    expect(applyRunAction({ run }, a)).toBe(true);
    expect(canApplyRun({ run }, b), '第二筆（連點）不發號碼').toBe(false);
    expect(canApplyRun({ run }, { t: 'restCard', seat: 1, id: '' }), '都不要也不行了').toBe(false);
    expect(takeRestCard(run, picks[1]!.id, 1)).toBe(false);
  });

  it('兩台會話：加入的那台在動作繞回來之前連送兩張，主機只收第一張，兩台一致、不停', () => {
    const a = mk(); const b = mk();
    const pair = new LoopbackPair();
    const bad: string[] = [];
    const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
    host.useRun(a); guest.useRun(b);
    const picks = restCardChoices(b, 1);
    pair.hold = true;
    expect(guest.submitRun({ t: 'restCard', seat: 1, id: picks[0]!.id })).toBe(true);
    // 本機還沒套到第一張（等主機發號碼），本機的放行照樣過——擋第二下要靠主機那一關與畫面的旗標
    guest.submitRun({ t: 'restCard', seat: 1, id: picks[1]!.id });
    pair.flush();   // 兩筆請求到主機：第一筆發號碼，第二筆做不出來、安靜不發
    pair.flush();   // 第一筆的號碼繞回加入的那台
    pair.hold = false;
    expect(bad).toEqual([]);
    expect(host.stopped || guest.stopped).toBe(false);
    expect(runFingerprint(a)).toBe(runFingerprint(b));
    expect(a.players[1]!.deck.filter((c) => c.cardId === picks[0]!.id).length).toBeGreaterThan(0);
    expect(a.players[1]!.deck.filter((c) => c.cardId === picks[1]!.id && picks[1]!.id !== picks[0]!.id).length).toBe(0);
  });

  it('畫面：送出之前先立旗標、已經送出的就不再送；重畫時牌照樣按不動', () => {
    const src = norm(REST_SRC);
    expect(src).toContain('if (pillowSent) return;');
    expect(src).toMatch(/pillowSent = true;[^\n]*\n\s*if \(!act\(\{ t: 'restCard'/);
    expect(src).toContain('disabled: pillowSent');
  });
});

/** 照貓窩畫面的 `onRunApplied` 流程模擬一台（誰做完了、畫面停在哪、同伴的動作進來時重畫哪一頁） */
function restSide(s: CoopSession, run: RunState, seat: number): { phase: RestPhase; draws: string[] } {
  const st = { phase: 'menu' as RestPhase, draws: [] as string[] };
  const done = new Set<number>();
  s.onRunApplied((applied) => {
    let didMine = false;
    for (const one of applied) {
      const a = one.a;
      const pillowWait = a.t === 'rest' && a.c === '打盹' && restCardChoices(run, a.seat).length > 0;
      if ((a.t === 'rest' && !pillowWait) || a.t === 'revive' || a.t === 'restCard') done.add(a.seat);
      if (a.seat === seat) { didMine = true; st.phase = pillowWait ? 'pillow' : 'after'; }
    }
    if (run.players.every((_, i) => done.has(i))) { st.draws.push('map'); return; }
    if (didMine) return;
    const how = restRedrawOnMate(st.phase);
    if (how === 'pillow') st.draws.push('pillow');
    else if (how === 'menu') { st.phase = 'menu'; st.draws.push('menu'); }
    else st.draws.push('keep');
  });
  return st;
}

describe('高-1 連線貓窩：挑夢枕的牌時同伴做完事，不會被蓋回選單', () => {
  it('純邏輯：挑牌那一頁重畫挑牌、選單重畫選單、做完在等的不動', () => {
    expect(restRedrawOnMate('pillow')).toBe('pillow');
    expect(restRedrawOnMate('menu')).toBe('menu');
    expect(restRedrawOnMate('after')).toBe('keep');
  });

  const setup = (pillowSeat: number) => {
    const mk = (): RunState => {
      const r = newCoopRun('c3-rest-order', 1, 'ninja', 'feifei');
      takeRelic(r, 'dream_pillow', pillowSeat);
      r.currentNode = r.map.start[0]!;
      return r;
    };
    const a = mk(); const b = mk();
    const pair = new LoopbackPair();
    const bad: string[] = [];
    const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
    host.useRun(a); guest.useRun(b);
    const hs = restSide(host, a, 0); const gs = restSide(guest, b, 1);
    pair.hold = true;
    const send = (s: CoopSession, act: RunAction): void => { expect(s.submitRun(act), `${act.t} 送得出去`).toBe(true); pair.flush(); pair.flush(); };
    return { a, b, pair, bad, host, guest, hs, gs, send };
  };
  const sharpen = (run: RunState, seat: number): RunAction => ({ t: 'rest', seat, c: '磨爪', u: run.players[seat]!.deck.find((c) => !c.upgraded)!.uid });

  it('加入的那台先睡（挑牌中）、主機後做：加入的那台重畫的是挑牌頁，挑完兩台一起上樓', () => {
    const t = setup(1);
    t.send(t.guest, { t: 'rest', seat: 1, c: '打盹' });
    expect(t.gs.phase).toBe('pillow');
    t.send(t.host, sharpen(t.a, 0));
    expect(t.gs.draws, '同伴做完事時，挑牌那一頁要留著（原本被選單蓋掉、按鈕全死）').toEqual(['pillow']);
    const id = restCardChoices(t.b, 1)[0]!.id;
    t.send(t.guest, { t: 'restCard', seat: 1, id });
    expect(t.gs.draws.at(-1)).toBe('map');
    expect(t.hs.draws.at(-1)).toBe('map');
    expect(t.bad).toEqual([]);
    expect(runFingerprint(t.a)).toBe(runFingerprint(t.b));
  });

  it('主機先睡（挑牌中）、加入的那台後做：主機重畫的是挑牌頁', () => {
    const t = setup(0);
    t.send(t.host, { t: 'rest', seat: 0, c: '打盹' });
    expect(t.hs.phase).toBe('pillow');
    t.send(t.guest, sharpen(t.b, 1));
    expect(t.hs.draws).toEqual(['pillow']);
    t.send(t.host, { t: 'restCard', seat: 0, id: '' });   // 都不要
    expect(t.hs.draws.at(-1)).toBe('map');
    expect(t.gs.draws.at(-1)).toBe('map');
    expect(t.bad).toEqual([]);
    expect(runFingerprint(t.a)).toBe(runFingerprint(t.b));
  });

  it('另兩種順序：同伴先做完我還在選單＝重畫選單；我先做完在等、同伴睡了要挑牌＝不動', () => {
    const t = setup(1);
    t.send(t.host, sharpen(t.a, 0));
    expect(t.gs.draws).toEqual(['menu']);
    const u = setup(0);
    u.send(u.guest, sharpen(u.b, 1));
    u.send(u.host, { t: 'rest', seat: 0, c: '打盹' });
    expect(u.gs.draws, '做完在等的那一台不要被選單蓋掉').toEqual(['keep']);
  });

  it('畫面：同伴的動作進來時照 `restRedrawOnMate(phase)` 重畫，三個畫法各自記下停在哪', () => {
    const src = norm(REST_SRC);
    expect(src).toContain('const how = restRedrawOnMate(phase);');
    expect(src).toContain("if (how === 'pillow') showPillow(napped);");
    expect(src).not.toContain('show();   // 還沒做的那位');
    expect(src).toMatch(/function showPillow\(heal: number\): void \{\n\s*phase = 'pillow';/);
    expect(src).toMatch(/function show\(\): void \{\n\s*phase = 'menu';/);
    // 2026-09-25 多了第六個參數 `hold`（淨化結果視窗關掉才回地圖）：照樣要求第一句就記「停在結果頁」
    expect(src).toMatch(/pose: 'nap' \| 'sharpen' \| 'helpup' \| 'curl' = 'nap',[^{]*?\): void \{\n\s*phase = 'after';/);
  });
});

/** 照事件畫面的連線流程模擬一台：票湊齊一種就結算那一種；「繼續」一放出來就按（最急的玩家），之後到的票沒人套 */
function eventSide(s: CoopSession, run: RunState, seat: number, outcomes: RunEffectOutcome[]) {
  const waits = new PickWaits();
  waits.start(outcomes);
  const st = { left: false, waits };
  const alive = run.players.map((p) => !p.down);
  s.onPick((kind) => {
    if (st.left) return;
    if (kind !== 'evcard' && kind !== 'evpurify') return;
    const all = onlyStanding(s.picks(kind, run.players.length), alive);
    if (!allVoted(all, alive)) return;
    s.clearPicks(kind);
    waits.settle(kind);
    all.forEach((v, i) => {
      const oi = outcomes[i];
      if (!v) return;
      if (kind === 'evcard' && oi && 'needs' in oi) for (const uid of v.split(',').map(Number)) removeCard(run, uid, i);
      if (kind === 'evpurify' && oi && 'purify' in oi && oi.purify.includes(v)) purifyRelic(run, v, i);
    });
    if (!waits.waiting) st.left = true;
  });
  // 自己沒有那一種的替自己投空票（跟畫面一樣）
  const mine = outcomes[seat];
  if (outcomes.some((o) => !!o && 'needs' in o) && !(mine && 'needs' in mine)) s.pick('evcard', '');
  if (outcomes.some((o) => !!o && 'purify' in o) && !(mine && 'purify' in mine)) s.pick('evpurify', '');
  return st;
}

describe('高-4 兩人結果種類不同的事件：每一種票都湊齊才放「繼續」', () => {
  const whisper = rareEvents.find((e) => e.id === 'rare_miasma_whisper')!;
  const mk = (): { run: RunState; outcomes: RunEffectOutcome[] } => {
    const run = newCoopRun('c3-whisper', 2, 'ninja', 'feifei');
    takeRelic(run, 'miasma_charm', 1); takeRelic(run, 'blood_dagger', 1);   // 加入的那位兩件要挑，主機一件都沒有（改成丟一張牌）
    const outcomes: RunEffectOutcome[] = [];
    for (const i of [0, 1]) outcomes[i] = applyRunEffects(run, choiceEffectsFor(whisper.choices[1]!, i), undefined, undefined, i);
    return { run, outcomes };
  };

  it('前提：紫霧②一人丟牌、一人挑淨化，這一輪要等兩種票', () => {
    const { outcomes } = mk();
    expect(outcomes[0]).toEqual({ needs: 'removeCard', n: 1 });
    expect(outcomes[1]).toEqual({ purify: ['miasma_charm', 'blood_dagger'] });
    expect([...pickKindsFor(outcomes)].sort()).toEqual(['evcard', 'evpurify']);
  });

  for (const hostFirst of [true, false]) {
    it(`兩台會話（${hostFirst ? '主機先丟牌、加入的那台後淨化' : '加入的那台先淨化、主機後丟牌'}）：先湊齊的那一種不放「繼續」，兩台結果一樣`, () => {
      const A = mk(); const B = mk();
      const pair = new LoopbackPair();
      const bad: string[] = [];
      const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
      const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
      host.useRun(A.run); guest.useRun(B.run);
      pair.hold = true;
      const hs = eventSide(host, A.run, 0, A.outcomes);
      const gs = eventSide(guest, B.run, 1, B.outcomes);
      pair.flush();   // 兩邊替自己投的空票互相送到
      const drop = A.run.players[0]!.deck[0]!.uid;
      const first = (): void => { host.pick('evcard', String(drop)); };
      const second = (): void => { guest.pick('evpurify', 'blood_dagger'); };
      (hostFirst ? first : second)();
      pair.flush();
      expect(hs.left || gs.left, '只湊齊一種票，兩台都還不能走').toBe(false);
      // 還沒挑的那一位自己的挑選窗開著：別種票結算時不能重畫蓋掉它
      const late = hostFirst ? { s: guest, st: gs, seat: 1, o: B.outcomes } : { s: host, st: hs, seat: 0, o: A.outcomes };
      expect(late.st.waits.ownPending(late.o[late.seat], (k) => late.s.picks(k, 2)[late.seat] != null)).toBe(true);
      (hostFirst ? second : first)();
      pair.flush();
      expect(hs.left && gs.left, '兩種都湊齊才放').toBe(true);
      for (const r of [A.run, B.run]) {
        expect(r.players[1]!.relics, '加入的那位淨化的那件兩台都套到了').toContain('blood_dagger_pure');
        expect(r.players[0]!.deck.some((c) => c.uid === drop), '主機丟的那張兩台都丟了').toBe(false);
      }
      expect(bad).toEqual([]);
      expect(runFingerprint(A.run)).toBe(runFingerprint(B.run));
    });
  }

  it('每一種組合都記得全：學招接著挑牌升級＋淨化＝三種；一人挑牌一人沒得挑＝一種', () => {
    const learnThen = { chooseCard: [], then: { needs: 'upgradeCard', n: 1 } } as unknown as RunEffectOutcome;
    expect(pickKindsOf(learnThen)).toEqual(['evlearn', 'evcard']);
    expect([...pickKindsFor([learnThen, { purify: ['a', 'b'] }])].sort()).toEqual(['evcard', 'evlearn', 'evpurify']);
    expect([...pickKindsFor([{ needs: 'removeCard', n: 1 }, undefined as unknown as RunEffectOutcome])]).toEqual(['evcard']);
    const w = new PickWaits();
    w.start([learnThen, { purify: ['a', 'b'] }]);
    w.settle('evpurify');
    expect(w.waiting, '淨化先湊齊，學招與接著挑牌都還在等').toBe(true);
    w.settle('evlearn');
    expect(w.waiting).toBe(true);
    w.settle('evcard');
    expect(w.waiting).toBe(false);
  });

  it('畫面：不再有單一旗標；三種結算各自拿掉自己那一種，沒開過視窗的那台走 `refresh`', () => {
    const src = norm(EVENT_SRC);
    expect(src).not.toMatch(/awaitingPicks\s*=/);
    expect(src).toContain('const waitingPicks = new PickWaits();');
    expect(src).toContain('waitingPicks.start(outcomes);');
    for (const k of ['evcard', 'evlearn', 'evpurify']) expect(src).toContain(`waitingPicks.settle('${k}');`);
    expect(src).toContain('if (waitingPicks.ownPending(outcomes[seat]');
    expect(src).not.toContain('if (!info) { showResult(); return; }');
    expect(src).toContain('waitingPicks.waiting\n');
  });
});

describe('低-1 客座店主「第一次見到」：引擎在走進格子時記，畫面只讀', () => {
  const mk = (): { run: RunState; id: string } => {
    const run = newCoopRun('c3-keeper', 1, 'ninja', 'feifei');
    const n = nextChoices(run.map, null)[0]!;
    n.type = '罐頭鋪'; n.keeper = 'tortoise';
    return { run, id: n.id };
  };

  it('走進去就記；兩台一樣；指紋不受影響', () => {
    const x = mk(); const y = mk();
    const before = runFingerprint(x.run);
    chooseNode(x.run, x.id); chooseNode(y.run, y.id);
    expect(keeperFirstMeet(x.run)).toBe(true);
    expect(x.run.flags['keeper_met:tortoise']).toBe(true);
    expect(runFingerprint(x.run)).toBe(runFingerprint(y.run));
    // 指紋不收這兩個旗標：只差這兩個的兩份，指紋一樣
    const z = mk(); chooseNode(z.run, z.id);
    delete z.run.flags['keeper_met:tortoise']; delete z.run.flags[`keeper_first:1:${z.id}`];
    expect(runFingerprint(z.run)).toBe(runFingerprint(x.run));
    expect(before).not.toBe('');
  });

  it('第二次遇到同一位就不是第一次；橘貓老闆不記', () => {
    const { run } = mk();
    const other = run.map.nodes.find((n) => n.floor > 1)!;
    other.type = '罐頭鋪'; other.keeper = 'tortoise';
    meetKeeper(run, nextChoices(run.map, null)[0]!);
    run.currentNode = other.id;
    meetKeeper(run, other);
    expect(keeperFirstMeet(run)).toBe(false);
    const orange = run.map.nodes.find((n) => n.floor > 2)!;
    orange.type = '罐頭鋪'; delete orange.keeper;
    const flags = Object.keys(run.flags).length;
    meetKeeper(run, orange);
    expect(Object.keys(run.flags).length).toBe(flags);
  });

  it('畫面：罐頭鋪不再自己寫整局旗標', () => {
    const src = norm(SHOP_SRC);
    expect(src).not.toMatch(/run\.flags\[[^\]]*\]\s*=/);
    expect(src).toContain('keeperFirstMeet(run)');
  });
});
