/**
 * 狀態牌子折成好幾排時，角色與魔物的腳底不動（使用者 2026-09-25：「噹噹、封封有時候被狀態到或是某些情況，
 * 角色會突然往上移，變成不是站在地上，角色會突然變高、腳離地」）。做法見 `src/ui/chiplift.ts` 檔頭。
 *
 * 倉庫測試刻意不裝畫面環境（雲端 `npm ci` 沒有瀏覽器），排版量不到，所以這裡：
 *  1. 純函式與「量完才寫、值沒變不寫」直接測（假節點＋假的 ResizeObserver）；
 *  2. 用同一條算式推一遍角色格由下往上疊的高度，釘住「牌子幾排，立繪框底邊都在同一個位置」這件事；
 *  3. 樣式與 combat.ts 的接線讀原文比對（哪天有人把負邊距拿掉、或新的放進畫面路徑忘了當場量，這裡就紅）。
 * 真的開瀏覽器量腳底的手動量測：`tools/chip_float_check.js`（修前球球同一姿勢 403 → 349，浮 54 像素；修後 0～13 塊都在 403）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { CHIPS_LIFT_VAR, chipsLift, createChipsLift, type ResizeWatcherCtor } from '../../src/ui/chiplift';

const CSS = readFileSync(new URL('../../src/ui/styles/combat.css', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const COMBAT = SRC.replace(/\r\n/g, '\n');

function between(start: string, end: string): string {
  const a = COMBAT.indexOf(start);
  const b = COMBAT.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`combat.ts 找不到這一段：${start}`);
  return COMBAT.slice(a, b);
}

/** 假的角色格＋牌子列：只有 chiplift 用得到的那幾個欄位；`log` 記下量與寫的先後 */
function fakeUnit(h: number, log: string[] = [], name = 'u') {
  const props = new Map<string, string>();
  const unit = {
    style: {
      getPropertyValue: (k: string) => props.get(k) ?? '',
      setProperty: (k: string, v: string) => { props.set(k, v); log.push(`寫${name}`); },
      removeProperty: (k: string) => { const v = props.get(k) ?? ''; props.delete(k); log.push(`清${name}`); return v; },
    },
  };
  const row = { parentElement: unit, isConnected: true, h, name };
  return { unit, row, props, el: row as unknown as HTMLElement };
}
const scopeOf = (...rows: HTMLElement[]) => ({
  querySelectorAll: (sel: string) => { expect(sel).toBe('.unit > .chips'); return rows; },
}) as unknown as ParentNode;

describe('牌子列多出來的高度', () => {
  it('一排以內（或還沒排版）是 0；多一排就是多出來那排的高度，小數照留', () => {
    expect(chipsLift(24, 24)).toBe(0);
    expect(chipsLift(0, 24)).toBe(0);          // 還沒排版、量到 0
    expect(chipsLift(Number.NaN, 24)).toBe(0);
    expect(chipsLift(25, 24)).toBe(1);          // 一排球球的牌子（圖示 19）比最小高度高 1：也吃掉，一排都不晃
    expect(chipsLift(50, 24)).toBe(26);         // 兩排
    expect(chipsLift(49.5, 24)).toBe(25.5);
    expect(chipsLift(78.333, 24)).toBe(54.33);
  });

  it('角色格由下往上疊：牌子折幾排，立繪框底邊都在同一個位置（修前每多一排就往上浮一排）', () => {
    // 桌機實測的高度：戰場底邊 470、牌子列上邊距 3、血條 18＋上邊距 2、名字 20、牌子列最小高度 24
    const boxBottom = (rowH: number, lift: number) => 470 - rowH - 3 - (18 + 2) - 20 + lift;
    const heights = [24, 25, 50, 53, 76, 102];   // 0 塊／一排／兩排／三排／四排
    const fixed = heights.map((h) => boxBottom(h, chipsLift(h, 24)));
    expect(new Set(fixed).size, `修後：${fixed.join('、')}`).toBe(1);
    expect(fixed[0]).toBe(403);
    const old = heights.map((h) => boxBottom(h, 0));
    expect(old[2], '修前兩排：整隻浮 26 像素').toBe(403 - 26);
  });
});

describe('createChipsLift：量完再寫、寫到角色格上', () => {
  const measure = (row: HTMLElement) => ({ height: (row as unknown as { h: number }).h, minHeight: 24 });

  it('settle：每一格照自己的排數寫 --chips-lift；回到一排就拿掉', () => {
    const a = fakeUnit(24), b = fakeUnit(50), c = fakeUnit(76);
    const lift = createChipsLift({ RO: null, measure });
    lift.settle(scopeOf(a.el, b.el, c.el));
    expect(a.props.get(CHIPS_LIFT_VAR)).toBeUndefined();
    expect(b.props.get(CHIPS_LIFT_VAR)).toBe('26px');
    expect(c.props.get(CHIPS_LIFT_VAR)).toBe('52px');
    b.row.h = 24;
    lift.settle(scopeOf(b.el));
    expect(b.props.has(CHIPS_LIFT_VAR), '牌子掉回一排，立繪框的負邊距要收回').toBe(false);
  });

  it('settle 先全部量完才寫（量一個寫一個會每一格都逼瀏覽器重排一次）；值沒變不寫', () => {
    const log: string[] = [];
    const m = (row: HTMLElement) => { log.push(`量${(row as unknown as { name: string }).name}`); return measure(row); };
    const a = fakeUnit(50, log, 'A'), b = fakeUnit(76, log, 'B');
    const lift = createChipsLift({ RO: null, measure: m });
    lift.settle(scopeOf(a.el, b.el));
    expect(log).toEqual(['量A', '量B', '寫A', '寫B']);
    log.length = 0;
    lift.settle(scopeOf(a.el, b.el));
    expect(log, '重畫幾十次、排數沒變：一次都不寫').toEqual(['量A', '量B']);
  });

  it('settle 跳過已經不在畫面上的牌子列', () => {
    const a = fakeUnit(50);
    a.row.isConnected = false;
    createChipsLift({ RO: null, measure }).settle(scopeOf(a.el));
    expect(a.props.size).toBe(0);
  });

  it('watch：瀏覽器通知尺寸變了就補寫；被換掉的舊牌子列放掉不量', () => {
    let cb: ((entries: readonly { target: Element }[]) => void) | undefined;
    const observed: unknown[] = [], dropped: unknown[] = [];
    let disconnected = false;
    const RO = class {
      constructor(f: (entries: readonly { target: Element }[]) => void) { cb = f; }
      observe(t: Element) { observed.push(t); }
      unobserve(t: Element) { dropped.push(t); }
      disconnect() { disconnected = true; }
    } as unknown as ResizeWatcherCtor;
    const lift = createChipsLift({ RO, measure });
    const a = fakeUnit(24), old = fakeUnit(50);
    lift.watch(a.el);
    lift.watch(old.el);
    expect(observed).toEqual([a.row, old.row]);
    a.row.h = 53;                // 手機橫拿換字級、折成兩排
    old.row.isConnected = false; // 這一排已經被整排換掉
    cb!([{ target: a.el }, { target: old.el }]);
    expect(a.props.get(CHIPS_LIFT_VAR)).toBe('29px');
    expect(old.props.size).toBe(0);
    expect(dropped).toEqual([old.row]);
    lift.disconnect();
    expect(disconnected).toBe(true);
  });

  it('沒有 ResizeObserver 的環境：watch 什麼都不做、不會丟錯，settle 照樣能用', () => {
    const lift = createChipsLift({ RO: null, measure });
    const a = fakeUnit(50);
    expect(() => lift.watch(a.el)).not.toThrow();
    expect(() => lift.disconnect()).not.toThrow();
    lift.settle(scopeOf(a.el));
    expect(a.props.get(CHIPS_LIFT_VAR)).toBe('26px');
  });
});

describe('接線（讀原文）', () => {
  it('樣式：立繪框用負的下邊距吃掉多出來的排；名字、血條、牌子列墊在逐格畫布（z-index 1）上面', () => {
    expect(CSS).toContain('.combat .unit > .sprite-box { margin-bottom: calc(-1 * var(--chips-lift, 0px)); }');
    expect(CSS).toContain('.combat .unit > :is(.name, .hpbar, .chips) { position: relative; z-index: 2; }');
    // 「一排」的基準就是牌子列的最小高度（chiplift 讀的就是它）：拿掉的話零個牌子那一格的高度會跟著變
    const chips = CSS.slice(CSS.indexOf('.combat .chips {'), CSS.indexOf('}', CSS.indexOf('.combat .chips {')));
    expect(chips).toContain('min-height: 24px;');
    expect(chips).toContain('flex-wrap: wrap;');
  });

  it('每排牌子列建好就 watch；換畫面拆掉', () => {
    const row = between('function statusRow(', '\n  }\n');
    expect(row).toMatch(/chipLift\.watch\(row\);\n\s*return row;/);
    expect(COMBAT).toContain('const chipLift = createChipsLift();');
    expect(COMBAT).toContain('app.disposers.push(() => chipLift.disconnect());');
  });

  it('整頁重畫：放進畫面後、量位置的發牌／瞄準箭頭／手牌滑動之前，當場 settle', () => {
    const render = between('function render(): void {', '\n  }\n');
    const at = render.indexOf('chipLift.settle(field);');
    expect(at, 'render 裡要當場量').toBeGreaterThan(render.indexOf('root.append(box);'));
    for (const later of ['dealFrom(box);', 'mountArrow(box);', 'slideHand(handWas);']) {
      expect(render.indexOf(later), `${later} 要排在 settle 之後`).toBeGreaterThan(at);
    }
  });

  it('其他放進畫面的路徑也當場 settle：就地修補、只換牌子列、同伴點選重畫那一格', () => {
    expect(between('function patchField(before: Snap): boolean {', '\n  }\n')).toContain('chipLift.settle(field);');
    expect(between('const refreshPlayerStatus = (seat: number): void => {', '\n  };\n')).toContain('chipLift.settle(node);');
    expect(between('function refreshEnemyStatus(node: HTMLElement, e: EnemyCombat): void {', '\n  }\n')).toContain('chipLift.settle(node);');
    expect(between('session.onHint((seat, u) => {', '\n    });\n')).toMatch(/node\.replaceWith\(fresh\);\n\s*chipLift\.settle\(fresh\);/);
    // 換整格的地方就這幾處；新增一處卻忘了 settle 的話，這個數字會對不上
    expect(COMBAT.match(/replaceWith\((?:playerUnit|enemyUnit)\(/g)?.length, '換整格角色／魔物的地方變多了：記得當場 chipLift.settle').toBe(3);
  });
});
