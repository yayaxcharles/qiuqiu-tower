import { describe, expect, it } from 'vitest';
import { DANGDANG_BOSS_LINES, dangdangDialogue, dialogue } from '../../src/content/dialogue';
import { FENGFENG_BOSS_LINES, fengfengFirstMeet, fengfengShortLines } from '../../src/content/fengfeng-dialogue';
import { eventTextFor, lotteryAfter } from '../../src/content/event-text';
import { events } from '../../src/content/events';
import { NINJA_EVENT_TEXT_B2 } from '../../src/content/event-text-b2';
import { NINJA_EVENT_TEXT_B3RARE } from '../../src/content/event-text-b3rare';
import { applyRunEffects, newRun } from '../../src/engine/run';

/*
 * 劇情打磨（2026-09-25，草稿 draft_voice_coop 第 1～3 節，使用者裁定照做）。
 *
 * ① 封封跟噹噹講話太像：同一隻魔物的初見吐槽有 21 句字面相似度 ≥ 0.60（盤點時用 Python `difflib.SequenceMatcher`
 *    比兩句去掉標點後的字）。封封那邊改從「劍路、距離、收劍、回程」出發；這一支把同一套比法寫成測試，
 *    以後誰又把兩隻寫回同一句，這裡就紅。
 * ② 三個弱事件（可疑的飯糰攤、賭博的老鼠、古井）贏跟輸原本讀起來一樣：結果段只寫到「吃下去／碗掀開／投下去」，
 *    贏輸各補一句，走稀有事件那套「抽完再補一句」（`LOTTERY_AFTER`）。
 */

/** 去掉標點與空白（跟盤點腳本 sim.py 的 `norm` 同一組字元） */
const norm = (s: string): string[] => Array.from(s.replace(/[，。！？、…～；：「」『』（）,.!?\s—]/gu, ''));

/**
 * `difflib.SequenceMatcher(None, a, b).ratio()` 的同一套算法（沒有垃圾字元、句子短於 200 字不觸發自動垃圾判定）：
 * 反覆找最長共同片段、左右兩半再各自找，最後 2×配對字數 ÷ 兩句總字數。
 */
function ratio(x: string, y: string): number {
  const a = norm(x);
  const b = norm(y);
  if (a.length + b.length === 0) return 1;
  const b2j = new Map<string, number[]>();
  b.forEach((ch, j) => { const l = b2j.get(ch); if (l) l.push(j); else b2j.set(ch, [j]); });
  const longest = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let besti = alo; let bestj = blo; let best = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of b2j.get(a[i]!) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > best) { besti = i - k + 1; bestj = j - k + 1; best = k; }
      }
      j2len = next;
    }
    return [besti, bestj, best];
  };
  let matched = 0;
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (!k) continue;
    matched += k;
    if (alo < i && blo < j) queue.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
  }
  return (2 * matched) / (a.length + b.length);
}

const TOO_CLOSE = 0.6 - 1e-9;

describe('封封跟噹噹的口吻分得開', () => {
  it('比法本身對得上 Python 的 difflib（盤點時那幾個數字）', () => {
    // 原本那幾對：「頭上的水快灑出來了。」兩邊一字不差＝1.00；石獅子那對 0.92；木屐那對 0.70
    expect(ratio('頭上的水快灑出來了。', '頭上的水快灑出來了。')).toBe(1);
    expect(ratio('石座空了……原來你走下來了。', '石座空了，原來你自己走下來了。')).toBeCloseTo(0.9166, 3);
    expect(ratio('少了一隻還跳得這麼快？', '一隻木屐也跳得這麼快。')).toBeCloseTo(0.7, 3);
  });

  it('同一隻魔物的初見吐槽：相似度 ≥ 0.60 的一句都不剩', () => {
    const dd = dialogue.firstMeetDangdang;
    const ids = Object.keys(fengfengFirstMeet).filter((id) => dd[id] !== undefined);
    expect(ids.length, '兩份對得起來的魔物變少了？比法抓錯表').toBeGreaterThan(100);
    const close = ids.map((id) => ({ id, r: ratio(dd[id]!, fengfengFirstMeet[id]!) })).filter((x) => x.r >= TOO_CLOSE)
      .map((x) => `${x.id} ${x.r.toFixed(2)}｜噹噹：${dd[x.id]}｜封封：${fengfengFirstMeet[x.id]}`);
    expect(close, close.join('\n')).toEqual([]);
  });

  it('同類短句（開場、打贏、肚子餓、低血、紙箱、睡醒、磨練、扶人）任兩句都不到 0.60', () => {
    const pairs: [readonly string[], readonly string[]][] = [
      [dangdangDialogue.battleStart, fengfengShortLines.START ?? []], [dangdangDialogue.battleWin, fengfengShortLines.WIN ?? []],
      [dangdangDialogue.hungry, fengfengShortLines.HUNGRY ?? []], [dangdangDialogue.lowHp, fengfengShortLines.LOW ?? []],
      [dangdangDialogue.chestLines, fengfengShortLines.CHEST ?? []], [dangdangDialogue.restNapLines, fengfengShortLines.NAP ?? []],
      [dangdangDialogue.restSharpenLines, fengfengShortLines.TRAIN ?? []], [dangdangDialogue.reviveLines, fengfengShortLines.REVIVE ?? []],
    ];
    const close: string[] = [];
    for (const [dd, ff] of pairs) for (const x of dd) for (const y of ff) if (ratio(x, y) >= TOO_CLOSE) close.push(`噹噹：${x}｜封封：${y}`);
    expect(close, close.join('\n')).toEqual([]);
  });

  it('關主台詞與關主前一晚獨白（同一句球球原句）：只剩塔頂師父開場那一句（塔頂段不在這一批）', () => {
    // 師父開場第二句屬塔頂段，另一位編劇負責；這裡只准它一句，其餘都要分開
    const allowed = new Set(['退隱也要回家喵！你看著我，我是你徒弟喵！']);
    const close = Object.keys(FENGFENG_BOSS_LINES).filter((k) => DANGDANG_BOSS_LINES[k] !== undefined && !allowed.has(k))
      .filter((k) => ratio(DANGDANG_BOSS_LINES[k]!, FENGFENG_BOSS_LINES[k]!) >= TOO_CLOSE)
      .map((k) => `噹噹：${DANGDANG_BOSS_LINES[k]}｜封封：${FENGFENG_BOSS_LINES[k]}（${k}）`);
    expect(close, close.join('\n')).toEqual([]);
  });

  it('封封不再借噹噹的招牌「腳站得太近」', () => {
    const seclusionTrain = events.find((e) => e.id === 'seclusion')!.choices[0]!.result;
    expect(eventTextFor('fengfeng', seclusionTrain)).not.toContain('站得太近');
  });
});

/** 在同一個事件選項上一直換種子，直到抽到贏也抽到輸，回兩邊引擎寫下的提示 */
function notesOf(eventId: string): { win: string[]; lose: string[] } {
  const choice = events.find((e) => e.id === eventId)!.choices.find((c) => c.outcome.some((o) => o.kind === 'gamble'))!;
  const found: { win?: string[]; lose?: string[] } = {};
  for (let i = 0; i < 200 && !(found.win && found.lose); i++) {
    const run = newRun(`lottery-${eventId}-${i}`);
    const notes: string[] = [];
    applyRunEffects(run, choice.outcome, notes, [], 0);
    if (notes.some((n) => n.startsWith('中了'))) found.win ??= notes; else found.lose ??= notes;
  }
  expect(found.win && found.lose, `${eventId} 兩百局都抽不到兩種結果`).toBeTruthy();
  return { win: found.win!, lose: found.lose! };
}

const NAME = { ninja: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' } as const;

describe('弱事件：贏跟輸各有一句，而且接得到', () => {
  it.each(['rat_stall', 'gambling_rats', 'old_well'])('%s：四隻都接得到贏一句、輸一句，兩句不一樣', (id) => {
    const { win, lose } = notesOf(id);
    for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const) {
      const w = lotteryAfter(id, win, hero);
      const l = lotteryAfter(id, lose, hero);
      expect(w, `${id}／${hero} 贏了沒有下一句（提示：${win.join('；')}）`).not.toBe('');
      expect(l, `${id}／${hero} 輸了沒有下一句（提示：${lose.join('；')}）`).not.toBe('');
      expect(w).not.toBe(l);
      for (const t of [w, l]) {
        expect(t, `${hero} 那句沒有自己開口`).toContain(`${NAME[hero]}：「`);
        const quotes = [...t.matchAll(/(球球|菲菲|噹噹|封封)：「([^」]*)」/gu)];
        for (const q of quotes) {
          if (q[1] === '球球') expect(q[2], t).toMatch(/喵[！？。…～]*$/u);
          else expect(q[2], t).not.toContain('喵');
        }
      }
    }
  });

  it('贏的提示帶著數字（「中了！贏了 130 條小魚乾」）也認得出是贏', () => {
    const { win } = notesOf('gambling_rats');
    expect(win.some((n) => /^中了！贏了 \d+ 條小魚乾/.test(n)), win.join('；')).toBe(true);
    expect(lotteryAfter('gambling_rats', win, 'ninja')).toContain('一條都不能少');
  });

  it('飯糰攤的前半段不再自相矛盾（攤子沒收，卻說他躲著我）', () => {
    const r = events.find((e) => e.id === 'rat_stall')!.choices[0]!.result;
    expect(r).not.toContain('躲著我');
    for (const hero of ['feifei', 'dangdang', 'fengfeng']) expect(eventTextFor(hero, r)).not.toContain(NAME.ninja);
  });
});

describe('小矛盾', () => {
  it('5F 那本秘笈：旁白前一句才掉出來，事件開頭不再說「又落著一本」', () => {
    const t = events.find((e) => e.id === 'daxia_teach')!.text;
    expect(t).not.toContain('又落著');
    for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng']) expect(eventTextFor(hero, t)).not.toContain('又落著');
  });

  it('酒葫蘆的紅繩第一次出現，不寫「那條」', () => {
    const t = NINJA_EVENT_TEXT_B3RARE['rare_catnip_master']!.text;
    expect(t).not.toContain('那條紅繩');
    for (const hero of ['feifei', 'dangdang', 'fengfeng']) expect(eventTextFor(hero, t)).not.toContain('那條紅繩');
  });

  it('便當送給誰有答案：最上面那一份每天原封不動退回來（四隻都聽得到）', () => {
    const r = Object.values(NINJA_EVENT_TEXT_B2).flatMap((x) => x.results).find((s) => s.includes('這些便當是送去給誰吃的喵'))!;
    expect(r, '球球那一段找不到').toBeTruthy();
    for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng']) {
      const shown = hero === 'ninja' ? r : eventTextFor(hero, r);
      expect(shown, hero).toContain('最上面那一份，每天都原封不動退回來');
    }
  });
});
