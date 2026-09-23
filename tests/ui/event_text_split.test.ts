import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as DIALOGUE from '../../src/content/dialogue';
import * as FENGFENG from '../../src/content/fengfeng-dialogue';
import * as EVENT_TEXT from '../../src/content/event-text';
import { NINJA_COND_RESULT_B2, NINJA_EVENT_TEXT_B2 } from '../../src/content/event-text-b2';
import { NINJA_EVENT_TEXT_B3RARE } from '../../src/content/event-text-b3rare';
import { eventById } from '../../src/content/events';
import MAIN_RAW from '../../src/main.ts?raw';
import LOADER_RAW from '../../src/ui/event-loader.ts?raw';

/*
 * 事件文字分包（2026-09-23 內容擴充第〇批 0-1）。
 *
 * 噹噹、封封、菲菲三份共用事件文案（加上鏡子走廊的混搭版）一百多 KB，搬到 `content/event-text.ts`，
 * 只給延後載入的事件畫面與除錯總覽讀。**主程式的靜態匯入鏈只要碰到它一次**（例如哪個首載的畫面順手
 * `import { eventTextFor } from '…/event-text'`），打包器就會把整份拉回首載，這一刀白做——而且不會有任何畫面壞掉，
 * 只有 `tools/check_size.py` 的數字悄悄漲回去。這裡照原始碼把主程式的靜態匯入走一遍，碰到就紅。
 */
const MAIN = MAIN_RAW.replace(/\r\n/g, '\n');
const LOADER = LOADER_RAW.replace(/\r\n/g, '\n');

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;   // 套件
  if (/\.(css|json)(\?|$)|\?raw$/.test(spec)) return null;   // 樣式、資料、原文
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const base = parts.join('/');
  for (const cand of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (/\.ts$/.test(cand) && existsSync(cand)) return cand;
  }
  throw new Error(`${from} 匯入的 ${spec} 找不到檔案`);
}

/** 從入口出發、只走**靜態**匯入（`import()` 是按需載入，不算；`import type` 打包後不存在，也不算） */
function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
    const specs = [
      ...[...src.matchAll(/^(?:import|export)\s+(?!type\s)[^'"`;]*?\sfrom\s+'([^']+)'/gms)].map((m) => m[1]!),
      ...[...src.matchAll(/^import\s+'([^']+)'/gm)].map((m) => m[1]!),
    ];
    for (const s of specs) {
      const next = resolve(file, s);
      if (next) todo.push(next);
    }
  }
  return seen;
}

describe('事件文字與事件畫面不在首載', () => {
  const graph = staticGraph('src/main.ts');

  it('走得到的東西是對的（地圖、戰鬥外的首載畫面、共用台詞都在）：確定這個走法本身沒壞', () => {
    for (const f of ['src/ui/app.ts', 'src/ui/screens/map.ts', 'src/ui/screens/reward.ts', 'src/content/dialogue.ts',
      'src/content/fengfeng-dialogue.ts', 'src/content/events.ts', 'src/ui/preload.ts']) {
      expect(graph.has(f), f).toBe(true);
    }
    // 早就按需載入的那幾個也確實不在（對照組）
    expect(graph.has('src/ui/screens/combat.ts')).toBe(false);
    expect(graph.has('src/ui/screens/lobby.ts')).toBe(false);
  });

  it('主程式的靜態匯入碰不到 `content/event-text.ts` 與 `screens/event.ts`', () => {
    expect(graph.has('src/content/event-text.ts'), '有首載的模組靜態匯入了事件文字').toBe(false);
    expect(graph.has('src/ui/screens/event.ts'), '事件畫面被靜態匯入了').toBe(false);
  });

  it('事件文案只有事件畫面直接引用：打包才會跟事件畫面併成同一塊，下載失敗換網址重試時只有一個網址（推前審查 低-1）', () => {
    const importers = [...staticGraph('src/ui/screens/debug.ts'), ...graph]
      .filter((f) => f !== 'src/content/event-text.ts' && f !== 'src/ui/screens/event.ts')
      .filter((f) => /from\s+'[^']*content\/event-text'/.test(readFileSync(f, 'utf-8')));
    expect([...new Set(importers)]).toEqual([]);   // 首載與除錯總覽都不直接引用
    expect(readFileSync('src/ui/screens/event.ts', 'utf-8')).toMatch(/from '\.\.\/\.\.\/content\/event-text'/);
    expect(readFileSync('src/ui/screens/debug.ts', 'utf-8')).toContain("from './event';");
  });

  it('事件畫面登記成延後載入', () => {
    // 2026-09-23 推前審查 低-1 起經由 event-loader（失敗換網址參數重抓），那支用動態載入拿事件畫面
    expect(MAIN).toContain("registerLazyScreen('event', loadEventScreen, ");
    expect(LOADER).toContain("import('./screens/event')");
    expect(MAIN).not.toMatch(/^import '\.\/ui\/screens\/event';/m);
  });

  it('那幾張大表只住在 `event-text.ts`（搬回 `dialogue.ts`／`fengfeng-dialogue.ts` 就等於回到首載）', () => {
    for (const name of ['DANGDANG_EVENT_TEXT', 'FENGFENG_EVENT_TEXT', 'FEIFEI_EVENT_TEXT', 'FEIFEI_EVENT_LINES',
      'FEIFEI_TA', 'MIRROR_EVENT_TEXT', 'eventTextFor']) {
      expect(name in EVENT_TEXT, name).toBe(true);
      expect(name in DIALOGUE, `dialogue.ts 又有 ${name}`).toBe(false);
      expect(name in FENGFENG, `fengfeng-dialogue.ts 又有 ${name}`).toBe(false);
    }
    // 量級：這一份就是那一百多 KB，比首載預算剩下的多得多
    expect(readFileSync('src/content/event-text.ts', 'utf-8').length).toBeGreaterThan(30_000);
  });

  /*
   * 球球第二批事件的開頭與結果（2026-09-23 b2fin，主控裁定跟另外三隻一樣延後載入）：原本寫在 `events-batch2.ts`
   * 與 `events.ts` 八條條件選項裡，跟著事件資料一起進首載。現在住在 `event-text-b2.ts`，載入時填回事件資料。
   */
  const ninjaB2 = [...Object.values(NINJA_EVENT_TEXT_B2).flatMap((t) => [t.text, ...t.results]), ...Object.values(NINJA_COND_RESULT_B2)];

  it('球球第二批的開頭與結果不在首載：主程式走得到的每一支都找不到那幾段', () => {
    expect(graph.has('src/content/event-text-b2.ts'), '有首載的模組靜態匯入了第二批事件文字').toBe(false);
    expect(ninjaB2.length).toBeGreaterThan(70);   // 十八篇開頭＋五十三個結果＋八條條件選項
    for (const f of graph) {
      const src = readFileSync(f, 'utf-8');
      const hit = ninjaB2.find((t) => src.includes(t));
      expect(hit, `${f} 裡還有球球第二批的文字`).toBeUndefined();
    }
  });

  it('載入之後一段不少地填回事件資料（事件畫面、除錯總覽、另外三隻對照表的鍵都靠它）', () => {
    for (const [id, t] of Object.entries(NINJA_EVENT_TEXT_B2)) {
      const ev = eventById[id];
      expect(ev, id).toBeDefined();
      expect(ev!.text, id).toBe(t.text);
      expect(t.results.length, `${id} 結果數跟選項數對不上`).toBe(ev!.choices.length);
      t.results.forEach((r, i) => expect(ev!.choices[i]!.result, `${id} 第 ${i + 1} 個結果`).toBe(r));
    }
    for (const [id, r] of Object.entries(NINJA_COND_RESULT_B2)) {
      expect(eventById[id]?.choices.find((c) => !!c.requires)?.result, id).toBe(r);
    }
    // 另外三隻的表鍵就是球球那份：每一段都對得到（沒填回的話三隻會一起退回空白）
    for (const t of ninjaB2) for (const h of ['feifei', 'dangdang', 'fengfeng']) {
      expect(EVENT_TEXT.eventTextFor(h, t), `${h} 對不到「${t.slice(0, 20)}…」`).not.toBe(t);
    }
  });

  /*
   * 球球的稀有事件 5 篇（2026-09-24 b3int 主控裁決，同一個做法）：原本寫在 `events-rare.ts`，跟著事件資料進首載（實測 5.5 KB）。
   * 現在住在 `event-text-b3rare.ts`（跟另外三隻同一塊），載入時填回。
   */
  const ninjaRare = Object.values(NINJA_EVENT_TEXT_B3RARE).flatMap((t) => [t.text, ...t.results]);

  it('球球稀有事件的開頭與結果不在首載：主程式走得到的每一支都找不到那幾段', () => {
    expect(graph.has('src/content/event-text-b3rare.ts'), '有首載的模組靜態匯入了稀有事件文字').toBe(false);
    expect(ninjaRare.length).toBe(20);   // 五篇開頭＋十五個結果
    for (const f of graph) {
      const src = readFileSync(f, 'utf-8');
      const hit = ninjaRare.find((t) => src.includes(t));
      expect(hit, `${f} 裡還有球球稀有事件的文字`).toBeUndefined();
    }
  });

  it('稀有事件載入之後一段不少地填回（另外三隻對照表的鍵、抽到之後那一句都靠它）', () => {
    for (const [id, t] of Object.entries(NINJA_EVENT_TEXT_B3RARE)) {
      const ev = eventById[id];
      expect(ev?.rare, id).toBeDefined();
      expect(ev!.text, id).toBe(t.text);
      expect(t.results.length, `${id} 結果數跟選項數對不上`).toBe(ev!.choices.length);
      t.results.forEach((r, i) => expect(ev!.choices[i]!.result, `${id} 第 ${i + 1} 個結果`).toBe(r));
    }
    expect(Object.keys(NINJA_EVENT_TEXT_B3RARE).sort()).toEqual(Object.values(eventById).filter((e) => e.rare).map((e) => e.id).sort());
    for (const t of ninjaRare) for (const h of ['feifei', 'dangdang', 'fengfeng']) {
      expect(EVENT_TEXT.eventTextFor(h, t), `${h} 對不到「${t.slice(0, 20)}…」`).not.toBe(t);
    }
  });
});
