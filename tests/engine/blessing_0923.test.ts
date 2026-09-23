import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BLESSINGS, BLESS_CLASSES, blessingById } from '../../src/content/blessings';
import { cardById } from '../../src/content/cards';
import { relics, relicById } from '../../src/content/relics';
import {
  anyBlessingPending, blessChoices, blessingAvailable, blessingPending, blessPickCount, canTakeBlessing, rollBlessings, takeBlessing,
} from '../../src/engine/blessing';
import { startRelicFor } from '../../src/engine/hero';
import { beginCombat, finishCombat, newCoopRun, newRun } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { checkRun, loadRun, saveRun, setStore } from '../../src/engine/save';
import { blessingPickFor, blessingScore, smartBless } from '../../src/engine/smartbot';
import type { RelicDef, RunState } from '../../src/engine/types';
import { runFingerprint } from '../../src/net/hash';
import { applyRunAction, canApplyRun } from '../../src/net/runaction';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import BLESS_JSON from '../../src/engine/bless-ratings.json';

/**
 * 開局祝福（2026-09-23 內容擴充第三批 新A～新F，設計稿 design3 第二節）。
 * 守的幾件事：一類一張、分支亂數（不推整局亂數、連線誰先都一樣）、每一種的效果、挑牌的規矩、舊存檔、指紋、機器人會選。
 */
function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}
beforeEach(() => { setStore(memStore()); });

/** 包袱裡放第 0 格是這一樣（量效果用；正式遊戲的包袱由 `rollBlessings` 摸） */
function withOffer(run: RunState, id: string, seat = 0): RunState {
  me(run, seat).bless = { offer: [id] };
  return run;
}

/** 舊護腕那件秘寶是稀有事件那條線（b3rare）做的，這個分支還沒有：要量「進池之後」時臨時塞一份 */
const BRACER: RelicDef = { id: 'master_bracer', name: '沾了魔氣的舊護腕', pool: '事件', text: '每場戰鬥開始時獲得 3 點爪力與 2 層翻肚。', art: 'codex/relic_master_bracer',
  hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }, { kind: 'status', name: '翻肚', amount: 2, target: 'self' }] } };
let injected = false;
function injectBracer(): void {
  if (relicById[BRACER.id]) return;
  relics.push(BRACER); (relicById as Record<string, RelicDef>)[BRACER.id] = BRACER; injected = true;
}
afterEach(() => {
  if (!injected) return;
  relics.splice(relics.indexOf(BRACER), 1); delete (relicById as Record<string, RelicDef>)[BRACER.id]; injected = false;
});

describe('包袱：一類一張、分支亂數', () => {
  it('十六種、四類各四種，代號不重複', () => {
    expect(BLESSINGS).toHaveLength(16);
    for (const cls of BLESS_CLASSES) expect(BLESSINGS.filter((b) => b.cls === cls), cls).toHaveLength(4);
    expect(new Set(BLESSINGS.map((b) => b.id)).size).toBe(16);
  });

  it('每一位摸四樣，照 安全→換牌→代價→賭運氣 排；同種子同座位一定同四樣', () => {
    const run = newRun('bless-a', 1, 'feifei');
    rollBlessings(run);
    const offer = me(run).bless!.offer;
    expect(offer.map((id) => blessingById[id]!.cls)).toEqual([...BLESS_CLASSES]);
    const again = newRun('bless-a', 1, 'feifei');
    rollBlessings(again);
    expect(me(again).bless!.offer).toEqual(offer);
    // 摸過的不重摸（重新整理續玩回來看到同四張）
    me(run).bless = { offer: ['bless_coins', 'bless_notes', 'bless_stash', 'bless_wine'] };
    rollBlessings(run);
    expect(me(run).bless!.offer).toEqual(['bless_coins', 'bless_notes', 'bless_stash', 'bless_wine']);
  });

  it('**不推整局亂數**：摸包袱、拿會抽亂數的那幾樣（忍具、秘寶、擲骰），`run.rng` 一個位元都不動', () => {
    const run = newRun('bless-rng', 1, 'ninja');
    const before = JSON.stringify(run.rng);
    rollBlessings(run);
    expect(JSON.stringify(run.rng)).toBe(before);
    for (const id of ['bless_potions', 'bless_treasure', 'bless_dice', 'bless_bottom', 'bless_scroll', 'bless_wine']) {
      const r = withOffer(newRun('bless-rng', 1, 'ninja'), id);
      const b = JSON.stringify(r.rng);
      expect(takeBlessing(r, 0, 0), id).toBe(true);
      expect(JSON.stringify(r.rng), `${id} 推了整局亂數`).toBe(b);
    }
  });

  it('連線兩個座位的包袱各摸各的（不是同一份抄兩次），而且誰先選都一樣', () => {
    const seed = 'bless-coop';
    const offers = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const r = newCoopRun(`${seed}-${i}`, 1, 'ninja', 'dangdang');
      rollBlessings(r);
      offers.add(r.players[0]!.bless!.offer.join() === r.players[1]!.bless!.offer.join() ? 'same' : 'diff');
    }
    expect(offers.has('diff')).toBe(true);
    const a = newCoopRun(seed, 1, 'feifei', 'fengfeng'); const b = newCoopRun(seed, 1, 'feifei', 'fengfeng');
    for (const r of [a, b]) { rollBlessings(r); r.players[0]!.bless = { offer: ['bless_potions'] }; r.players[1]!.bless = { offer: ['bless_dice'] }; }
    expect(takeBlessing(a, 0, 0) && takeBlessing(a, 1, 0)).toBe(true);
    expect(takeBlessing(b, 1, 0) && takeBlessing(b, 0, 0)).toBe(true);
    expect(runFingerprint(a)).toBe(runFingerprint(b));
    expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
  });

  it('舊護腕：那件秘寶還沒進池就不發；進池之後就放行（代價類四種都摸得到）', () => {
    const def = blessingById['bless_bracer']!;
    expect(blessingAvailable(def)).toBe(!!relicById['master_bracer']);
    const seen = (): Set<string> => {
      const s = new Set<string>();
      for (let i = 0; i < 120; i++) { const r = newRun(`bracer-${i}`, 1, 'ninja'); rollBlessings(r); s.add(me(r).bless!.offer[2]!); }
      return s;
    };
    if (!relicById['master_bracer']) expect(seen().has('bless_bracer')).toBe(false);
    injectBracer();
    expect(blessingAvailable(def)).toBe(true);
    expect(seen().has('bless_bracer')).toBe(true);
    const r = withOffer(newRun('bracer', 1, 'ninja'), 'bless_bracer');
    const hp = me(r).maxHp;
    expect(takeBlessing(r, 0, 0)).toBe(true);
    expect(me(r).relics).toContain('master_bracer');
    expect(me(r).maxHp).toBe(hp - 8);   // 2026-09-24 祝福減半：−5 → −8（那件秘寶本身不變，換得的代價加重）
  });
});

describe('每一種的效果', () => {
  const take = (id: string, hero: 'ninja' | 'feifei' | 'dangdang' | 'fengfeng' = 'ninja', seed = `fx-${id}`, pick = {}) => {
    const run = withOffer(newRun(seed, 1, hero), id);
    const before = JSON.parse(JSON.stringify(me(run))) as ReturnType<typeof me>;
    const notes: string[] = [];
    expect(takeBlessing(run, 0, 0, pick, notes), id).toBe(true);
    expect(me(run).bless!.took).toBe(id);
    return { run, before, p: me(run), notes };
  };

  // 2026-09-24 b3int 主控裁決祝福整體減半：乾糧袋 +6 → +3、零錢袋 90 → 45、私房錢 200／−6 → 120／−3
  it('乾糧袋：生命上限與當前生命各 +3；零錢袋 +45 條；私房錢 +120 條、上限 −3', () => {
    const a = take('bless_rations');
    expect(a.p.maxHp - a.before.maxHp).toBe(3);
    expect(a.p.hp - a.before.hp).toBe(3);
    expect(take('bless_coins').p.fish - START).toBe(45);
    const s = take('bless_stash');
    expect(s.p.fish - START).toBe(120);
    expect(s.p.maxHp - s.before.maxHp).toBe(-3);
  });

  it('舊忍具袋：2 個忍具（帶不下的講出來；2026-09-24 減半 3 → 2）', () => {
    const { p, notes } = take('bless_potions');
    expect(p.potions.length).toBe(2);
    expect(notes.some((n) => n.includes('收不下'))).toBe(false);
  });

  it('護身符：接下來 5 場開打時魔物全體 1 層翻肚，第 6 場就沒有了（2026-09-24 減半 2 → 1 層）', () => {
    const { run } = take('bless_charm');
    expect(me(run).nextFight?.[0]?.left).toBe(5);
    for (let i = 1; i <= 6; i++) {
      const cs = beginCombat(run, 'rats3');
      const flipped = cs.enemies.every((e) => (e.statuses['翻肚'] ?? 0) >= 1);
      expect(flipped, `第 ${i} 場`).toBe(i <= 5);
      for (const e of cs.enemies) { e.dead = true; e.hp = 0; }
      cs.kills = cs.enemies.length; cs.phase = 'won';
      finishCombat(run, cs);
      expect(me(run).nextFight?.[0]?.left ?? 0, `第 ${i} 場打完剩幾場`).toBe(Math.max(0, 5 - i));
    }
    expect(me(run).nextFight).toBeUndefined();
  });

  it('送上樓的便當（只一場）照舊：打完那一場就拿掉，沒有 left 那一欄', () => {
    const run = newRun('bento', 1, 'ninja');
    me(run).nextFight = [{ note: '把便當吃了', effects: [{ kind: 'block', amount: 8 }] }];
    const cs = beginCombat(run, 'rats3');
    expect(cs.player.block).toBeGreaterThanOrEqual(8);
    expect(me(run).nextFight).toBeUndefined();
  });

  it('舊剪刀：一定要挑滿 2 張、不重複、在牌組裡；丟掉的真的不見了（2026-09-24 減半 3 → 2）', () => {
    const run = withOffer(newRun('scissors', 1, 'ninja'), 'bless_scissors');
    const deck = me(run).deck;
    const [a, b] = [deck[0]!.uid, deck[1]!.uid];
    expect(blessPickCount(run, 0, blessingById['bless_scissors']!)).toEqual({ min: 2, max: 2 });
    expect(canTakeBlessing(run, 0, 0, { u: [a] }), '少挑').toBe(false);
    expect(canTakeBlessing(run, 0, 0, { u: [a, a] }), '重複').toBe(false);
    expect(canTakeBlessing(run, 0, 0, { u: [a, 99999] }), '不在牌組').toBe(false);
    const n = deck.length;
    expect(takeBlessing(run, 0, 0, { u: [a, b] })).toBe(true);
    expect(me(run).deck.length).toBe(n - 2);
    expect(me(run).deck.some((x) => [a, b].includes(x.uid))).toBe(false);
  });

  it('練功筆記：至多 1 張（2026-09-24 減半 2 → 1），壞毛病與升過的不能挑', () => {
    const run = withOffer(newRun('notes', 4, 'ninja'), 'bless_notes');   // 難度 4 開局帶一張壞毛病
    const curse = me(run).deck.find((c) => cardById[c.cardId]?.pool === '壞毛病')!;
    expect(curse, '前提：難度 4 開局有壞毛病').toBeDefined();
    const ok = me(run).deck.find((c) => c !== curse)!;
    expect(canTakeBlessing(run, 0, 0, { u: [curse.uid] })).toBe(false);
    expect(canTakeBlessing(run, 0, 0, { u: [] }), '至多＝最少一張').toBe(false);
    expect(takeBlessing(run, 0, 0, { u: [ok.uid] })).toBe(true);
    expect(me(run).deck.find((c) => c.uid === ok.uid)!.upgraded).toBe(true);
  });

  it('一疊招式圖：三張都是這一位拿得到的罕見忍術牌、每次一樣；挑的那張進牌組（一般版）；噹噹拿到的是他自己的（2026-09-24 減半：稀有升級版 → 罕見）', () => {
    for (const hero of ['ninja', 'dangdang'] as const) {
      const run = withOffer(newRun('moves', 1, hero), 'bless_moves');
      const opts = blessChoices(run, 0, 'bless_moves');
      expect(opts).toHaveLength(3);
      for (const c of opts) {
        expect(c.rarity).toBe('罕見');
        expect(c.pool).toBe('忍術');
        expect(!c.hero || c.hero === hero, c.id).toBe(true);
      }
      expect(blessChoices(run, 0, 'bless_moves').map((c) => c.id)).toEqual(opts.map((c) => c.id));
      expect(canTakeBlessing(run, 0, 0, { c: 'sanjo' }), '不在三張裡').toBe(false);
      const n = me(run).deck.length;
      expect(takeBlessing(run, 0, 0, { c: opts[1]!.id })).toBe(true);
      expect(me(run).deck.length).toBe(n + 1);
      const got = me(run).deck[me(run).deck.length - 1]!;
      expect(got.cardId).toBe(opts[1]!.id);
      expect(got.upgraded).toBe(false);
    }
  });

  it('塗鴉本：原地換成這一位的罕見以上忍術牌（不同名、不帶升級、牌號不變），壞毛病換成常見的', () => {
    // 2026-09-24 減半：挑 2 張 → 1 張，一般牌與壞毛病各開一局
    const run = withOffer(newRun('doodle', 4, 'fengfeng'), 'bless_doodle');
    const curse0 = me(run).deck.find((c) => cardById[c.cardId]?.pool === '壞毛病')!;
    const first = me(run).deck.find((c) => c !== curse0)!;
    first.upgraded = true;
    const oldCard = first.cardId;
    const nextUid = run.nextUid;
    expect(canTakeBlessing(run, 0, 0, { u: [first.uid, curse0.uid] }), '只能挑 1 張').toBe(false);
    expect(takeBlessing(run, 0, 0, { u: [first.uid] })).toBe(true);
    const a = me(run).deck.find((c) => c.uid === first.uid)!;
    const run2 = withOffer(newRun('doodle', 4, 'fengfeng'), 'bless_doodle');
    const curse = me(run2).deck.find((c) => cardById[c.cardId]?.pool === '壞毛病')!;
    const oldCurse = curse.cardId;
    expect(takeBlessing(run2, 0, 0, { u: [curse.uid] })).toBe(true);
    const b = me(run2).deck.find((c) => c.uid === curse.uid)!;
    expect(a.cardId).not.toBe(oldCard);
    expect(cardById[a.cardId]!.rarity).not.toBe('常見');
    expect(cardById[a.cardId]!.pool).toBe('忍術');
    expect(!cardById[a.cardId]!.hero || cardById[a.cardId]!.hero === 'fengfeng').toBe(true);
    expect(a.upgraded).toBe(false);
    expect(b.cardId).not.toBe(oldCurse);
    expect(cardById[b.cardId]!.rarity).toBe('常見');
    expect(run.nextUid).toBe(nextUid);
  });

  it('包得很緊的寶貝：一件常見秘寶＋一張「失手了」（2026-09-24 減半：塔主＋兩張 → 常見＋一張）', () => {
    const { p, before } = take('bless_treasure');
    const got = p.relics.filter((id) => !before.relics.includes(id));
    expect(got).toHaveLength(1);
    expect(relicById[got[0]!]!.pool).toBe('常見');
    expect(p.deck.filter((c) => c.cardId === 'shishou').length - before.deck.filter((c) => c.cardId === 'shishou').length).toBe(1);
  });

  it('空的寶盒：交出自己的起始秘寶、換一件大魔物秘寶（四隻都是；2026-09-24 減半：原本換塔主秘寶）', () => {
    for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const) {
      const { p } = take('bless_box', hero);
      expect(p.relics, hero).not.toContain(startRelicFor(hero));
      expect(p.relics.filter((id) => relicById[id]?.pool === '大魔物'), hero).toHaveLength(1);
    }
  });

  it('包袱最底下／藥酒／骰子：同一顆種子結果一樣；骰子講出擲了幾點', () => {
    for (const id of ['bless_bottom', 'bless_wine', 'bless_dice']) {
      const x = take(id, 'ninja', 'luck');
      const y = take(id, 'ninja', 'luck');
      expect(JSON.stringify(x.p)).toBe(JSON.stringify(y.p));
    }
    const d = take('bless_dice', 'ninja', 'luck');
    expect(d.notes.some((n) => /^擲出 [1-6] 點$/.test(n))).toBe(true);
    // 六個面都擲得到（分支亂數照種子走）
    const faces = new Set<string>();
    for (let i = 0; i < 80; i++) faces.add(take('bless_dice', 'ninja', `dice-${i}`).notes.find((n) => n.startsWith('擲出'))!);
    expect(faces.size).toBe(6);
  });

  it('沒貼標籤的卷軸：一張這一位拿得到的稀有忍術牌', () => {
    const { p, before } = take('bless_scroll', 'feifei');
    const got = p.deck.filter((c) => !before.deck.some((x) => x.uid === c.uid));
    expect(got).toHaveLength(1);
    expect(cardById[got[0]!.cardId]!.rarity).toBe('稀有');
    expect(!cardById[got[0]!.cardId]!.hero || cardById[got[0]!.cardId]!.hero === 'feifei').toBe(true);
  });

  it('選過就不能再選；沒有包袱（舊存檔、除錯開局）什麼都不做', () => {
    const run = withOffer(newRun('twice', 1, 'ninja'), 'bless_coins');
    expect(takeBlessing(run, 0, 0)).toBe(true);
    expect(takeBlessing(run, 0, 0)).toBe(false);
    expect(me(run).fish).toBe(START + 45);
    const bare = newRun('bare', 1, 'ninja');
    expect(takeBlessing(bare, 0, 0)).toBe(false);
    expect(blessingPending(bare, 0)).toBe(false);
    expect(anyBlessingPending(bare)).toBe(false);
  });
});
const START = 50;

describe('存檔與指紋', () => {
  it('舊存檔（沒有包袱那一欄）讀得回來、不演祝福', () => {
    const run = newRun('old', 1, 'dangdang');
    expect('bless' in me(run), '前提：舊格式裡沒有這一欄').toBe(false);
    saveRun(run);
    const back = loadRun()!;
    expect(back).not.toBeNull();
    expect(anyBlessingPending(back)).toBe(false);
  });

  it('選到一半存的檔：讀回來還是同四張、還沒選', () => {
    const run = newRun('half', 1, 'ninja');
    rollBlessings(run);
    const offer = [...me(run).bless!.offer];
    saveRun(run);
    const back = loadRun()!;
    expect(me(back).bless).toEqual({ offer });
    expect(anyBlessingPending(back)).toBe(true);
  });

  it('壞掉的包袱只丟那一欄，不把整局判成壞檔；連套幾場的剩幾場壞掉照舊判壞檔', () => {
    const run = newRun('bad', 1, 'ninja');
    for (const bad of [{ offer: ['nope', 'x', 'y', 'z'] }, { offer: ['bless_coins'] }, { offer: ['bless_coins', 'bless_notes', 'bless_stash', 'bless_wine'], took: 'bless_rations' }, 'x']) {
      const json = JSON.parse(JSON.stringify(run)) as { players: { bless?: unknown }[] };
      json.players[0]!.bless = bad;
      const back = checkRun(json as unknown as RunState);
      expect(back, JSON.stringify(bad)).not.toBeNull();
      expect(me(back!).bless).toBeUndefined();
    }
    const good = JSON.parse(JSON.stringify(run)) as RunState;
    me(good).bless = { offer: ['bless_coins', 'bless_notes', 'bless_stash', 'bless_wine'], took: 'bless_notes' };
    expect(me(checkRun(good)!).bless?.took).toBe('bless_notes');
    const badLeft = JSON.parse(JSON.stringify(run)) as RunState;
    me(badLeft).nextFight = [{ note: 'x', effects: [], left: 0 }];
    expect(checkRun(badLeft)).toBeNull();
  });

  it('指紋：拿了哪一樣會進指紋；還沒選（或舊局）指紋跟沒有這一欄一樣', () => {
    const run = newRun('fp', 1, 'ninja');
    const plain = runFingerprint(run);
    me(run).bless = { offer: ['bless_coins', 'bless_notes', 'bless_stash', 'bless_wine'] };
    expect(runFingerprint(run)).toBe(plain);
    const a = JSON.parse(JSON.stringify(run)) as RunState; const b = JSON.parse(JSON.stringify(run)) as RunState;
    me(a).bless!.took = 'bless_coins'; me(b).bless!.took = 'bless_notes';
    expect(runFingerprint(a)).not.toBe(runFingerprint(b));
    expect(runFingerprint(a)).not.toBe(plain);
  });
});

describe('連線：一個動作就結案，兩台一樣', () => {
  it('canApplyRun／applyRunAction 認得祝福；挑牌不合規矩的不發號碼', () => {
    const run = newCoopRun('coop-act', 1, 'ninja', 'feifei');
    rollBlessings(run);
    run.players[1]!.bless = { offer: ['bless_scissors'] };
    const ctx = { run };
    const u = run.players[1]!.deck.slice(0, 2).map((c) => c.uid);   // 舊剪刀 2026-09-24 減半後挑 2 張
    expect(canApplyRun(ctx, { t: 'bless', seat: 1, i: 0, u: u.slice(0, 1) })).toBe(false);
    expect(canApplyRun(ctx, { t: 'bless', seat: 1, i: 0, u })).toBe(true);
    expect(applyRunAction(ctx, { t: 'bless', seat: 1, i: 0, u })).toBe(true);
    expect(canApplyRun(ctx, { t: 'bless', seat: 1, i: 0, u })).toBe(false);
  });

  it('兩台各跑一個會話：兩人各選各的（含挑牌、三選一），誰先都一樣、不斷線', () => {
    const mk = (): RunState => { const r = newCoopRun('coop-sess', 1, 'dangdang', 'fengfeng'); rollBlessings(r); r.players[0]!.bless = { offer: ['bless_moves'] }; r.players[1]!.bless = { offer: ['bless_doodle'] }; return r; };
    const a = mk(); const b = mk();
    const pair = new LoopbackPair();
    const bad: string[] = [];
    const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
    const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
    host.useRun(a); guest.useRun(b);
    const c = blessChoices(a, 0, 'bless_moves')[0]!.id;
    const u = b.players[1]!.deck.slice(0, 1).map((x) => x.uid);   // 塗鴉本 2026-09-24 減半後挑 1 張
    expect(guest.submitRun({ t: 'bless', seat: 1, i: 0, u })).toBe(true);
    expect(host.submitRun({ t: 'bless', seat: 0, i: 0, c })).toBe(true);
    expect(bad).toEqual([]);
    expect(host.stopped || guest.stopped).toBe(false);
    expect(anyBlessingPending(a) || anyBlessingPending(b)).toBe(false);
    expect(runFingerprint(a)).toBe(runFingerprint(b));
    host.syncRun(a, 'n1'); guest.syncRun(b, 'n1');
    expect(bad).toEqual([]);
  });
});

describe('機器人會選', () => {
  it('分數照祝福量尺的表（多爬幾層），表上沒有的才照事件分換算（第一輪量出來事件分把小魚乾估太高）', () => {
    const table = (BLESS_JSON as { bless: Record<string, Record<string, number>> }).bless;
    for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const) {
      const run = newRun('bot-score', 1, hero);
      for (const b of BLESSINGS) {
        const want = table[b.id]?.[hero];
        if (want !== undefined) expect(blessingScore(run, b), `${b.id}/${hero}`).toBe(want);
      }
    }
    expect(Object.keys(table).length, '前提：表是量過的').toBeGreaterThanOrEqual(15);
  });

  it('挑包袱裡分數最高的那一樣；挑牌的那一步挑得合規矩', () => {
    for (let i = 0; i < 12; i++) {
      for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const) {
        const run = newRun(`bot-bless-${i}`, 1, hero);
        rollBlessings(run);
        const offer = [...me(run).bless!.offer];
        const best = offer.slice().sort((x, y) => blessingScore(run, blessingById[y]!) - blessingScore(run, blessingById[x]!))[0];
        for (const [k, id] of offer.entries()) expect(canTakeBlessing(run, 0, k, blessingPickFor(run, blessingById[id]!)), `${hero} ${id}`).toBe(true);
        expect(smartBless(run)).toBe(best);
        expect(me(run).bless?.took).toBe(best);
      }
    }
  });

  it('連線：兩個座位各選各的（照座位順序叫、各用自己的分支亂數），連線機器人整局跑得完', async () => {
    const run = newCoopRun('coop-bot-bless', 1, 'ninja', 'feifei');
    const b = JSON.stringify(run.rng);
    expect(smartBless(run, 0)).toBeTruthy();
    expect(smartBless(run, 1)).toBeTruthy();
    expect(anyBlessingPending(run)).toBe(false);
    expect(JSON.stringify(run.rng)).toBe(b);
    const { coopRun } = await import('../../src/engine/coopbot');
    expect(() => coopRun('coop-bot-bless', 1, ['ninja', 'feifei'])).not.toThrow();
  });
});
