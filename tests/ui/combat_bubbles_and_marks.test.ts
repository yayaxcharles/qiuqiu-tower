/**
 * 戰鬥畫面的台詞泡泡、倒下、同伴頭上的牌、魔物化成煙（2026-09-22 晚，兩份盤點的中低項）。
 *
 *  - 台詞泡泡從實際說話那一格冒出來（連線盤點問題 5）：原本寫死在左上、尾巴指著座位 0，
 *    座位 1 講話、師父換階段那句都從座位 0 頭上冒；
 *  - 高大魔物的開場泡泡避開頭上的意圖牌（畫面盤點問題 13）；
 *  - 倒下那一格保留原色（連線盤點問題 7）：原本降彩度壓暗，封封洗成灰、菲菲變黑影；
 *  - 同伴頭上的牌不擋臉、打贏就收（連線盤點問題 8）；
 *  - 一般魔物化成煙時意圖牌、名字、血條收起來，數字不在煙上掛著（畫面盤點問題 14）。
 *
 * 畫面整個架起來成本太高，照 combat_motion_flow 那套：純函式直接測、combat.ts 的片段摳出來跑、樣式讀原文比對。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import APP from '../../src/ui/app.ts?raw';
import DIALOGUE from '../../src/ui/dialogue.ts?raw';
import { STAGE_W, playerLeft, speechBubbleAt } from '../../src/ui/enemylayout';
import { bubbleClearOf } from '../../src/ui/dialogue';
import { heroName } from '../../src/engine/hero';

// 樣式檔用 fs 讀（vitest 對 `.css?raw` 會先過自己的 CSS 處理）；換行一律統一成 \n（這台 autocrlf 取出來是 CRLF）
const CSS = readFileSync(new URL('../../src/ui/styles/combat.css', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const COMBAT = SRC.replace(/\r\n/g, '\n');

function branch(start: string, end: string): string {
  const first = COMBAT.indexOf(start);
  const last = COMBAT.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`combat.ts 找不到這一段：${start}`);
  return COMBAT.slice(first, last);
}

async function run<T>(code: string, bindings: Record<string, unknown>): Promise<T> {
  const compiled = await transformWithOxc(code, 'combat-bubbles.ts');
  return new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as T;
}

/** 樣式表裡某個選擇器的宣告（完全相同的選擇器） */
function rule(selector: string): string | undefined {
  const at = CSS.indexOf(`${selector} {`);
  if (at < 0) return undefined;
  return CSS.slice(at + selector.length + 2, CSS.indexOf('}', at));
}

describe('台詞泡泡從說話那一格冒出來', () => {
  it('泡泡跟著座位走：單機照舊左緣 200；連線座位 0 左緣 180，座位 1 尾巴改到右下角、往左長', () => {
    expect(speechBubbleAt(0, 1)).toEqual({ left: 200 });
    expect(speechBubbleAt(0, 2)).toEqual({ left: 180 });
    expect(speechBubbleAt(1, 2)).toEqual({ right: STAGE_W - 473 });
    // 尾巴尖（左尾巴＝左緣＋34；右尾巴＝右緣－34）落在各自那一格的嘴前：兩格差的距離＝兩格站位的距離
    const tip = (at: { left: number } | { right: number }) => ('left' in at ? at.left + 34 : STAGE_W - at.right - 34);
    expect(tip(speechBubbleAt(0, 1))).toBe(234);
    expect(tip(speechBubbleAt(1, 2)) - tip(speechBubbleAt(0, 2))).toBe(playerLeft(1, 2) - playerLeft(0, 2));
  });

  it('誰在講：一般劇本的「球球」是本機這一位；搭檔整組照名字找那一格；關主那句不是玩家', async () => {
    const speakerSeat = await run<(s: string, literal: boolean, players: unknown[], mySeat: number) => number | undefined>(
      `${branch('function speakerSeat(', 'registerScreen(')}\nreturn speakerSeat;`, { heroName });
    const players = [{ seat: 0, hero: undefined }, { seat: 1, hero: 'dangdang' }];   // 球球那位的 hero 欄位刻意不寫
    expect(speakerSeat('球球', false, players, 1)).toBe(1);
    expect(speakerSeat('塔主', false, players, 1)).toBeUndefined();
    expect(speakerSeat('噹噹', true, players, 0)).toBe(1);
    expect(speakerSeat('球球', true, players, 1)).toBe(0);
    expect(speakerSeat('塔主', true, players, 0)).toBeUndefined();
  });

  it('戰鬥裡每一句玩家台詞都帶位置；關主換階段那句改從牠頭上冒', () => {
    // combat.ts：伏兵、餓扁、生命過低、打贏四句都從自己那一格冒；不准再有不帶位置的角色台詞
    expect(COMBAT.match(/heroSpeaker\(\), mySpeech\(\)\)/g)).toHaveLength(4);
    expect(COMBAT).not.toMatch(/heroSpeaker\(\)\)/);
    expect(COMBAT).toContain('const mySpeech = (): ReturnType<typeof speechBubbleAt> => speechBubbleAt(mySeat, cs.players.length);');
    const talk = branch('  function bossPhaseTalk(', '  // ===== 待選牌 =====');
    expect(talk).toContain('speakerSeat(l.speaker, !!coop, cs.players, mySeat)');
    expect(talk).toContain('bubbleOverUnit(app.stage, root.querySelector(`.unit.enemy[data-id="${bossId}"]`)');
    // app.ts 開場那句：從自己那一格冒（連線時可能是座位 1）
    const app = APP.replace(/\r\n/g, '\n');
    expect(app).toContain('const at = speechBubbleAt(this.seat, cs.players.length);');
    expect(app.match(/heroSpeaker\(\), at\)/g)).toHaveLength(2);
    // toast 收到位置就蓋掉樣式表寫死的 left；右邊那一格換成右下角的尾巴
    const dialogue = DIALOGUE.replace(/\r\n/g, '\n');
    expect(dialogue).toContain("if (at && 'left' in at) t.style.left = `${Math.round(at.left)}px`;");
    expect(dialogue).toContain("t.style.right = `${Math.round(at.right)}px`; t.classList.add('tail-right');");
    expect(rule('#stage[data-screen="combat"] .toast.tail-right::before')).toContain('right: 22px');
  });

  it('魔物頭上的泡泡不算吐槽的第二格：關主那句先冒，接著講的貓不會被推到第二格、壓在自己頭上', () => {
    expect(rule('#stage[data-screen="combat"] .toast:not(.bubble-at) ~ .toast:not(.bubble-at)')).toContain('top: 116px');
    expect(rule('#stage[data-screen="combat"]:has(.tut-bar) .toast:not(.bubble-at) ~ .toast:not(.bubble-at)')).toContain('top: 174px');
    expect(CSS).not.toMatch(/\.toast ~ \.toast \{/);
  });
});

describe('高大魔物的開場泡泡避開頭上的意圖牌', () => {
  const intent = { left: 845, top: 108, right: 905, bottom: 132 };   // 橘皮大王頭上的「攻 20」（盤點截圖量的）

  it('上面沒位子（牌子貼著狀態列）：挪到牌子左邊、牌子底下，不留在跟貓開場那句同一條', () => {
    // 盤點截圖那一格：泡泡 67～107 壓在「攻 20」上，往上只剩狀態列
    expect(bubbleClearOf({ left: 585, top: 67, right: 909, bottom: 107 }, intent, 62)).toEqual({ top: 132 + 6, right: 1280 - 845 + 8 });
    // 只有尾巴碰到也算（泡泡底下凸 14 像素）
    expect(bubbleClearOf({ left: 585, top: 50, right: 909, bottom: 96 }, intent, 62)).toEqual({ top: 138, right: 1280 - 845 + 8 });
  });

  it('上面有位子（一般高度的魔物）：整顆往上挪，尾巴尖離牌子 4 像素', () => {
    const low = { left: 845, top: 250, right: 905, bottom: 276 };
    expect(bubbleClearOf({ left: 585, top: 205, right: 909, bottom: 250 }, low, 62)).toEqual({ top: 250 - 4 - 14 - 45 });
  });

  it('沒蓋到、或沒有意圖牌，就照原位', () => {
    expect(bubbleClearOf({ left: 585, top: 20, right: 909, bottom: 60 }, intent, 62)).toBeUndefined();
    expect(bubbleClearOf({ left: 400, top: 67, right: 820, bottom: 107 }, intent, 62)).toBeUndefined();
    expect(bubbleClearOf({ left: 585, top: 67, right: 909, bottom: 107 }, undefined, 62)).toBeUndefined();
  });

  it('開場與換階段都量意圖牌；特別高的（師父）先壓到狀態列下緣，不蓋在狀態列上', () => {
    const dialogue = DIALOGUE.replace(/\r\n/g, '\n');
    expect(dialogue).toContain("const intent = unit.querySelector('.intent');");
    expect(dialogue).toContain('let top = Math.max(TOP_MIN, Math.round(headY - 74));');
    const app = APP.replace(/\r\n/g, '\n');
    expect(app).toContain('bubbleOverUnit(this.stage, this.screen.querySelector(`.unit.enemy[data-uid="${e.uid}"]`),');
    expect(app).not.toContain('bubbleAt(');
  });
});

describe('倒下那一格保留原色', () => {
  it('不再整格降彩度壓暗；身體稍微壓暗、半透明，四隻都認得出是誰', () => {
    const unit = rule('.combat .unit.player.downed');
    expect(unit).toBeDefined();
    expect(unit).not.toMatch(/saturate/);
    expect(unit).toMatch(/filter: none/);   // 也蓋掉舉手時整格變灰那條（倒下時可能同時掛著 .ready）
    const body = rule('.combat .unit.player.downed .sprite-box')!;
    const opacity = Number(/opacity:\s*([\d.]+)/.exec(body)?.[1]);
    const bright = Number(/brightness\(([\d.]+)\)/.exec(body)?.[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.6);
    expect(opacity).toBeLessThan(0.9);
    expect(bright).toBeGreaterThanOrEqual(0.75);
    expect(body).not.toMatch(/saturate|grayscale/);
    expect(rule('.combat .unit.player.downed .ready-tag')).toMatch(/filter: none/);
  });
});

describe('同伴頭上的牌：不擋臉、打贏就收', () => {
  it('掛在頭的右上方外側，不再疊在頭頂正中', () => {
    const mp = rule('.combat .unit.player .mate-play')!;
    expect(mp).not.toMatch(/left: 50%/);
    expect(mp).not.toMatch(/top: -24px/);
    const right = Number(/right:\s*(-?\d+)px/.exec(mp)?.[1]);
    expect(right).toBeLessThan(0);   // 掛出格子右緣外（牌面中心落在臉的前方，不在頭上）
    // 淡入的位移跟著改：不能再帶 -50%，不然淡入那 0.22 秒會先偏半張牌再跳回來
    expect(CSS).toMatch(/@keyframes mate-play-in \{\n\s*from \{ opacity: 0; translate: 0 12px; \}/);
  });

  it('分出勝負就不畫同伴頭上的牌（剛打出的、考慮中的都一樣）', () => {
    const unit = branch('  const playerUnit = (', '  const bonusFish =');
    expect(unit).toContain('if (hintCard && cs.phase === \'player\') {');
    expect(unit).toContain('} else if (mp && mp.turn === cs.turn && cs.phase === \'player\') {');
  });

  it('勝負一分出來那一格就要換新節點：同伴格的簽章帶著戰鬥階段', async () => {
    const cs = { turn: 3, phase: 'player' };
    const mateSig = await run<(q: { seat: number }) => string>(`${branch('  const mateSig = (', '  /** 待機姿勢隨狀態換')}\nreturn mateSig;`, {
      cs, matePlay: new Map([[1, { card: { uid: 7 }, turn: 3 }]]), mateHint: new Map(),
    });
    const during = mateSig({ seat: 1 });
    cs.phase = 'won';
    // 只比快照的話，同伴補最後一刀時血量、蜷縮都沒變，那一格不會重畫，牌就一路掛到換畫面
    expect(mateSig({ seat: 1 })).not.toBe(during);
  });
});

describe('一般魔物化成煙：跟大魔物、關主一樣收起來', () => {
  it('意圖牌當場拿掉，名字、血條、狀態牌淡掉，最後那下的數字飄得比平常快', () => {
    expect(rule('.combat .unit.enemy.dead:not(.downed) .intent')).toMatch(/display: none/);
    expect(rule('.combat .unit.enemy.dead:not(.downed) :is(.name, .chips, .hpbar)')).toMatch(/opacity: 0/);
    const num = rule('.combat .unit.enemy.dead:not(.downed) .num')!;
    const fast = Number(/animation-duration:\s*([\d.]+)s/.exec(num)?.[1]);
    const normal = Number(/animation: float ([\d.]+)s/.exec(rule('.combat .num')!)?.[1]);
    expect(fast).toBeGreaterThan(0);
    expect(fast).toBeLessThan(normal);
    // 化成煙的整段溶解是 0.8 秒：數字要在溶解結束前飄完
    expect(fast).toBeLessThan(0.8);
  });
});
