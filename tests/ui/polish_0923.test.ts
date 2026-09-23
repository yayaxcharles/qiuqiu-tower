import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { MELEE_HANDOFF_RETURN_MS, meleeHandoffReturn, motionMeleeSample } from '../../src/ui/qiuqiu-melee';
import { joinElapsed, throwElapsed, throwLaunch } from '../../src/ui/projectile-flight';

/*
 * 2026-09-23 polish 批次（派工單 1～7 條；第 8 條手機橫拿在 phone_landscape_0923.test.ts）。畫面函式要整個舞台才跑得動：
 * 能抽成純函式的直接測；只能看原始碼的，照 combat_motion_flow.test.ts 的做法把那一段切出來執行，或比對寫法。
 */
const COMBAT = SRC.replace(/\r\n/g, '\n');
// 樣式檔用 fs 讀（vitest 對 `.css?raw` 會先過自己的 CSS 處理）
const css = (name: string): string => readFileSync(`src/ui/styles/${name}`, 'utf8').replace(/\r\n/g, '\n');

function sourceBetween(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`找不到這一段：${start}`);
  return src.slice(a, b);
}

async function execute(source: string, bindings: Record<string, unknown>): Promise<void> {
  const result = await transformWithOxc(source, 'polish-0923.ts');
  new Function(...Object.keys(bindings), result.code)(...Object.values(bindings));
}

/** 一條 CSS 規則（完整選擇器）的內容；沒有就回 null */
function ruleBody(text: string, selector: string): string | null {
  const i = text.indexOf(`${selector} {`);
  if (i < 0) return null;
  const open = text.indexOf('{', i);
  return text.slice(open + 1, text.indexOf('}', open));
}

const playMotion = sourceBetween(COMBAT, '  const playMotion = (', '  const motionForCard =');

/** 球球的出牌狀態＋畫面相依都換成假的，只留 playMotion 本身的邏輯 */
function motionHarness(now = { t: 1000 }) {
  const state: Record<string, unknown> & { layer: { style: { transform?: string }; remove(): void } } = {
    source: 'qiuqiu', action: 'idle', active: false, away: false, raf: 0, endsAt: 0,
    actor: { play() {}, element: {} }, layer: { style: {}, remove() {} },
  };
  const cancelled: number[] = [];
  let made = 0;
  let nextFrame: (t: number) => void = () => {};
  const refreshed: boolean[] = [];
  const motionProjectiles = new Set<() => void>();
  const cs = { phase: 'player', players: [{ seat: 0, hp: 40 }] };
  const bindings = {
    cs, app: { cs, stage: {} }, mySeat: 0, motionEnabled: true, motionState: () => state,
    motionSourceFor: () => 'qiuqiu', qiuqiuCombatMotionDecision: () => 'play', motionDuration: () => 600,
    motionMeleeSample, meleeHandoffReturn, refreshMotion: () => { refreshed.push(!!state.away); },
    root: { querySelector: () => null }, MINE: '.mine', pose: 'idle', idlePose: () => 'idle', heroArtUrl: () => '',
    idleMotion: () => { state.active = false; }, motionFoot: () => ({ x: 0, y: 0 }), motionProjectiles,
    playQiuqiuAfterimages: () => { const id = ++made; return () => { cancelled.push(id); }; },
    performance: { now: () => now.t },
    window: { cancelAnimationFrame() {}, requestAnimationFrame: (fn: (t: number) => void) => { nextFrame = fn; return 1; } },
  };
  return { state, cancelled, motionProjectiles, bindings, refreshed, frame: (t: number) => { now.t = t; nextFrame(t); } };
}

// 連刀：往前衝 74、970 毫秒、第一下 107 毫秒（1.5 倍速後的量級）
const rushTrip = { origin: { x: 100, y: 400 }, plan: { dx: 74, dy: 0, approachMs: 0, strikeMs: 970, returnMs: 0, impactMs: 107, totalMs: 970, action: 'ultimate_rush' } };

describe('第 1 條（稽核 ui 低-1）：下一招接手時，上一招的衝刺殘影一起收掉', () => {
  it('連刀演到一半接淡定：連刀的殘影當場收掉，也不再掛在收尾清單上', async () => {
    const h = motionHarness();
    await execute(`${playMotion}\nplayMotion(0, 'ultimate_rush', trip, 300);\nplayMotion(0, 'guard');`, { ...h.bindings, trip: rushTrip });
    expect(h.cancelled).toEqual([1]);
    expect(h.motionProjectiles.size).toBe(0);
  });

  it('衝刺接衝刺：只留後面那一條殘影（修前兩條疊在一起，同時最多六張）', async () => {
    const h = motionHarness();
    await execute(`${playMotion}\nplayMotion(0, 'ultimate_rush', trip, 300);\nplayMotion(0, 'ultimate_rush', trip, 0);`, { ...h.bindings, trip: rushTrip });
    expect(h.cancelled).toEqual([1]);
    expect(h.motionProjectiles.size).toBe(1);
  });
});

describe('第 4 條：近戰前衝到一半接非近戰動作，平順退回原位', () => {
  it('退回曲線：從接手當下的位移開始、140 毫秒回到 0、中間單調遞減', () => {
    expect(meleeHandoffReturn(74, 0)).toBe(74);
    expect(meleeHandoffReturn(74, MELEE_HANDOFF_RETURN_MS / 2)).toBeCloseTo(37, 5);
    expect(meleeHandoffReturn(74, MELEE_HANDOFF_RETURN_MS)).toBe(0);
    expect(meleeHandoffReturn(0, 50)).toBe(0);
    let last = 74;
    for (let t = 10; t <= MELEE_HANDOFF_RETURN_MS; t += 10) { const x = meleeHandoffReturn(74, t); expect(x).toBeLessThanOrEqual(last); last = x; }
  });

  it('連刀衝在最前面時接淡定：那一格仍在 74 像素，之後一格一格退回、退完畫布放回自己那一格（修前那一格直接歸零）', async () => {
    const h = motionHarness();
    await execute(`${playMotion}\nplayMotion(0, 'ultimate_rush', trip, 300);\nplayMotion(0, 'guard');`, { ...h.bindings, trip: rushTrip });
    expect(h.state.layer.style.transform).toBe('translate(74px, 0px)');
    expect(h.state.away).toBe(true);
    expect(h.state.action).toBe('guard');
    h.frame(1000 + MELEE_HANDOFF_RETURN_MS / 2);
    expect(h.state.layer.style.transform).toBe('translate(37px, 0px)');
    h.frame(1000 + MELEE_HANDOFF_RETURN_MS);
    expect(h.state.layer.style.transform).toBe('');
    expect(h.state.away).toBe(false);
    expect(h.refreshed.at(-1)).toBe(false);
    expect(h.state.active).toBe(true);   // 退回只管位置，淡定照演完
  });

  it('本來就在原位（沒有近戰在前面）時接非近戰：不掛前衝圖層，照舊', async () => {
    const h = motionHarness();
    await execute(`${playMotion}\nplayMotion(0, 'guard');`, h.bindings);
    expect(h.state.layer.style.transform).toBe('');
    expect(h.state.away).toBe(false);
  });
});

describe('第 2 條（稽核 ui 低-2）：收姿勢的等待照「延後後」的命中時間算', () => {
  it('連線加入方：確認回來時出手格已過，飛行物從第一波出手那一刻飛，最後一下比 impactElapsed 算的晚', () => {
    const impactTimes = [300, 450, 600];
    const flight = throwLaunch('feifei', 'needle_combo')!.flightMs;
    const elapsed = 420;   // 主機確認繞回來花了 0.42 秒
    const joined = throwElapsed('feifei', 'needle_combo', elapsed, impactTimes);
    expect(joined).toBe(joinElapsed(elapsed, impactTimes, flight));
    expect(joined).toBeLessThan(elapsed);
    // 從現在起最後一下還要多久：舊算法 600−420＝180，實際要 600−joined
    expect(600 - joined).toBeGreaterThan(600 - elapsed);
  });

  it('戰鬥畫面：丟東西那條路的 lastMotionImpact 用 throwElapsed，playThrow 也用同一支（兩邊不會各算各的）', () => {
    const branch = sourceBetween(COMBAT, '      if (throwFlight && shot && throwFoot && throwBox && impactSource && impactMotion) {', '        const onImpact = (wave: number): void => {');
    expect(branch).toMatch(/lastMotionImpact = Math\.max\(lastMotionImpact, finalImpactAt\s*- throwElapsed\(impactSource, impactMotion, impactElapsed, impactPlan\.map\(\(impact\) => impact\.at\)\)\);/);
    const flight = readFileSync('src/ui/projectile-flight.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(sourceBetween(flight, 'export function playThrow(', 'export function joinElapsed(')).toContain('elapsed: throwElapsed(source, action, options.elapsed ?? 0, options.impactTimes)');
  });
});

describe('第 3 條：麻繩、定身釘這類，狀態牌子等飛到才掛上', () => {
  it('魔物的狀態牌子與意圖牌照 shownEnemy 畫：還在飛的換成出手前的狀態與防禦', async () => {
    const body = sourceBetween(COMBAT, '  function shownEnemy(e: EnemyCombat): EnemyCombat {', '  /** 魔物腳下那一排牌子');
    let shown: unknown;
    const pending = new Map([[7, { statuses: { 越戰越勇: 3, 飛行: 2 }, block: 8 }]]);
    await execute(`${body}\nresult(shownEnemy({ uid: 7, block: 0, statuses: { 越戰越勇: 3, 飛行: 1, 中毒: 3 } }), shownEnemy({ uid: 8, block: 0, statuses: { 定身: 1 } }));`,
      { motionPendingStatus: pending, result: (a: unknown, b: unknown) => { shown = [a, b]; } });
    expect(shown).toEqual([{ uid: 7, block: 8, statuses: { 越戰越勇: 3, 飛行: 2 } }, { uid: 8, block: 0, statuses: { 定身: 1 } }]);
  });

  it('畫法接線：牌子排、意圖牌、飛在天上都走 shownEnemy；丟出去那一拍記下出手前的狀態與防禦，飛到（landStatus）才拿掉並換牌子', () => {
    expect(sourceBetween(COMBAT, '  function enemyChips(', '  /** 只換這一隻')).toContain('statusRow(shownEnemy(e), false, `e${e.uid}`)');
    const unit = sourceBetween(COMBAT, '  function enemyUnit(', '  function sidePanel(');
    expect(unit).toContain('intentChip(shownEnemy(e))');
    expect(unit).toContain("getStatus(shownEnemy(e), '飛行') > 0) cls.push('airborne')");
    expect(sourceBetween(COMBAT, '  function refreshEnemyStatus(', '  function enemyUnit(')).toContain("node.classList.toggle('airborne', !e.dead && getStatus(shown, '飛行') > 0);");
    expect(COMBAT).toContain('statuses: { ...e.statuses },');
    const loop = sourceBetween(COMBAT, '      const landStatus = (target: HTMLElement): void => {', '      if (throwFlight && shot && throwFoot && throwBox && impactSource && impactMotion) {');
    expect(loop).toContain('if (motionPendingStatus.delete(e.uid)) refreshEnemyStatus(target,');
    expect(loop).toMatch(/if \(statusByFlight && \(b\.block !== e\.block \|\| STATUS_ORDER\.some\([^\n]+\) \{\n\s+motionPendingStatus\.set\(e\.uid, \{ statuses: b\.statuses, block: b\.block \}\);\n[\s\S]*?lastIntent\.delete\(e\.uid\);\n\s+refreshEnemyStatus\(node, e\);/);
    // 整場收掉、演出出錯還原時一起清，不會把牌子永遠藏著
    expect(COMBAT.match(/motionPendingStatus\.clear\(\);/g)?.length).toBe(2);
  });

  it('主控裁定：丟出去的牌也等飛到（不只帶 aim 的忍具）——毒砂、絆索、點穴手、毛球彈、飛針都在這一條', () => {
    const loop = sourceBetween(COMBAT, '      const landStatus = (target: HTMLElement): void => {', '      if (throwFlight && shot && throwFoot && throwBox && impactSource && impactMotion) {');
    expect(loop).toContain('const statusByFlight = !!throwFlight;');
    // 飛到才演減益特效與「掙脫！」：最後一波打到時叫 landStatus，沒有飛行的才當場演
    expect(COMBAT).toContain('if (live && statusByFlight && wave === waves - 1) landStatus(live);');
    expect(COMBAT).toContain('if (!statusByFlight) landStatus(node);');
  });
});

describe('第 5 條：關主與菁英的攻擊預告，攻擊木牌的暖光亮得起來', () => {
  it('預告那 0.32 秒：光圈換成暖光、亮著不閃（牌子本身的 box-shadow 照舊拿掉，光掛在 ::before）', () => {
    const text = css('combat.css');
    const glow = ruleBody(text, '.combat .unit.enemy.telegraph .intent.i-attack::before');
    expect(glow).not.toBeNull();
    expect(glow).toMatch(/box-shadow:\s*0 0 14px 3px #ffd97a, 0 0 26px #ffb84a80;/);
    expect(glow).toMatch(/opacity:\s*1;/);
    expect(glow).toMatch(/animation:\s*none;/);
    // 跟其他意圖牌子的預告暖光同一組數值，不另外加大（不搶戲）
    expect(ruleBody(text, '.combat .unit.enemy.telegraph .intent')).toContain('box-shadow: 0 0 14px 3px #ffd97a, 0 0 26px #ffb84a80;');
  });
});

describe('第 6 條（複驗 09-22 新發現 1）：連線時同伴頭上的牌不壓自己的台詞泡泡', () => {
  it('畫面上有貓講話的泡泡時，同伴那張牌退到幾乎透明；魔物頭上的泡泡不算', () => {
    const text = css('combat.css');
    const yieldRule = ruleBody(text, '#stage[data-screen="combat"]:has(#overlay .toast:not(.out):not(.bubble-at)) .combat .unit.player .mate-play');
    expect(yieldRule).not.toBeNull();
    const opacity = Number(/opacity:\s*([\d.]+)/.exec(yieldRule!)?.[1]);
    expect(opacity).toBeLessThanOrEqual(0.15);
    expect(yieldRule).toMatch(/animation:\s*none;/);   // 新的一張淡入動畫不能把它拉回 .65
    // 泡泡收掉淡回來
    expect(ruleBody(text, '.combat .unit.player .mate-play')).toMatch(/transition:\s*opacity \.2s/);
  });
});

describe('第 7 條：罐頭鋪老闆的手不蓋到秘寶第一格', () => {
  it('老闆 266 高：立繪原圖 221:280，手尖（右緣）落在 210，秘寶三格時第一格左緣 219（實機量）', () => {
    const text = css('screens.css');
    const rules = [...text.matchAll(/\.scene:has\(\.scene-goods\) \.scene-portrait \{([^}]*)\}/g)].map((m) => m[1]!);
    const height = Number(/height:\s*(\d+)px/.exec(rules.filter((r) => /height:/.test(r)).at(-1)!)?.[1]);
    expect(height).toBe(266);
    expect(Math.round(height * 221.33 / 280)).toBeLessThan(219);
  });
});

describe('主控最後一輪第 1 條：丟東西打到帶刺的魔物，被刺回來那一下也等飛到才演（只改演出時機）', () => {
  it('從這一拍的紀錄算出刺了多少、其中蜷縮擋掉多少（刺先扣蜷縮，引擎緊接著寫一行擋下）', async () => {
    const body = sourceBetween(COMBAT, 'function thornPricks(', '/**\n * 狀態列（`hud.ts` 的 `renderHud`）');
    let got: unknown;
    await execute(`${body}\nresult([
      thornPricks(['球球打出「毛球彈」', '木樁人的刺反彈了 3 點', '蜷縮擋下了 2 點', '木樁人的刺反彈了 3 點']),
      thornPricks(['菲菲打出「連針」', '刺蝟師傅的刺反彈了 1 點', '菲菲的蜷縮擋下了 1 點']),
      thornPricks(['蜷縮擋下了 5 點', '木樁人的防禦擋下了 4 點']),
    ]);`, { result: (r: unknown) => { got = r; } });
    // 第三個：沒有被刺，前面那行是魔物打人時擋下的，不能算進來
    expect(got).toEqual([{ total: 6, blocked: 2 }, { total: 1, blocked: 1 }, { total: 0, blocked: 0 }]);
  });

  it('接線：出手那一位的血與蜷縮照 shownPlayer 畫；帶刺的目標最後一個飛到才演；當場那一段扣掉延後的部分', () => {
    const unit = sourceBetween(COMBAT, '  const playerUnit = (q: PlayerCombat): HTMLElement => {', '    mountMotion(q, picture, displayedPose);');
    expect(unit).toContain('hpBar(`p${q.seat}`, shownPlayer(q).hp, q.maxHp)');
    expect(unit).toContain('statusRow(shownPlayer(q), true, `p${q.seat}`)');
    // 帶刺又被打中的目標才算；最後一波打到時倒數，歸零才演
    expect(COMBAT).toContain("const pricks = (b.statuses['反彈'] ?? 0) > 0 && enemyHits.length > 0;");
    expect(COMBAT).toContain('if (pricks && wave === waves - 1 && --thornFlights === 0) revealThorns?.();');
    const hold = sourceBetween(COMBAT, '    if (thornFlights > 0) {', '    // 全體攻擊的各目標可能因死亡或隱身而有不同波數');
    expect(hold).toContain('motionPendingPlayer.set(thornSeat, { hp, block });');
    expect(hold).toContain("lastHpPct.delete(`p${thornSeat}`);");
    expect(hold).toMatch(/revealThorns = \(\): void => \{[\s\S]*motionPendingPlayer\.delete\(thornSeat\)[\s\S]*playerHurtFx\(live, hp, thrower\.maxHp, false\)/);
    // 當場那一段只演扣掉延後那部分之後剩下的
    // 擋下的量改看引擎記的數字（同日 tidy 合併，health H-1），延後的那部分照樣扣掉
    expect(COMBAT).toContain('const guarded = myFeedback.blocked - (heldHere?.block ?? 0);');
    expect(COMBAT).toContain('const lost = before.hp - comparedHp - (heldHere?.hp ?? 0);');
    expect(COMBAT.match(/motionPendingPlayer\.clear\(\);/g)?.length).toBe(2);
  });
});
