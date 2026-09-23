import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as DIALOGUE from '../../src/content/dialogue';
import * as FENGFENG from '../../src/content/fengfeng-dialogue';
import * as EVENT_TEXT from '../../src/content/event-text';
import MAIN_RAW from '../../src/main.ts?raw';

/*
 * 事件文字分包（2026-09-23 內容擴充第〇批 0-1）。
 *
 * 噹噹、封封、菲菲三份共用事件文案（加上鏡子走廊的混搭版）一百多 KB，搬到 `content/event-text.ts`，
 * 只給延後載入的事件畫面與除錯總覽讀。**主程式的靜態匯入鏈只要碰到它一次**（例如哪個首載的畫面順手
 * `import { eventTextFor } from '…/event-text'`），打包器就會把整份拉回首載，這一刀白做——而且不會有任何畫面壞掉，
 * 只有 `tools/check_size.py` 的數字悄悄漲回去。這裡照原始碼把主程式的靜態匯入走一遍，碰到就紅。
 */
const MAIN = MAIN_RAW.replace(/\r\n/g, '\n');

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

  it('事件畫面登記成延後載入', () => {
    expect(MAIN).toContain("registerLazyScreen('event', () => import('./ui/screens/event')");
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
});
