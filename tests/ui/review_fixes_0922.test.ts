import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import LOBBY_RAW from '../../src/ui/screens/lobby.ts?raw';
import DIALOGUE_RAW from '../../src/ui/dialogue.ts?raw';

/*
 * 整合版推前審查（2026-09-22 晚）的三條：
 * 中-1 關主換階段那串裡的旁白從關主嘴裡冒出來；低-2 收場對白開了還在冒台詞／舊泡泡指著被藏起來的貓；
 * 低-3 自己一報「接回來了」就把對方斷線那條也撕掉，而且心跳只是暫時沒回音時就說「正在重新連線」。
 */
// Windows 上 git 會把原始碼換成 CRLF，雲端是 LF；切片前先統一成 LF
const COMBAT = COMBAT_RAW.replace(/\r\n/g, '\n');
const LOBBY = LOBBY_RAW.replace(/\r\n/g, '\n');
const DIALOGUE = DIALOGUE_RAW.replace(/\r\n/g, '\n');

function slice(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`找不到這一段：${start}`);
  return src.slice(a, b);
}

async function run<T>(code: string, bindings: Record<string, unknown>): Promise<T> {
  const compiled = await transformWithOxc(code, 'review-fixes.ts');
  return new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as T;
}

type Line = { speaker: string; text: string };

async function makeSpeak(overlayOpen: boolean) {
  const toast = vi.fn();
  const bubbleOverUnit = vi.fn(() => true);
  const speak = await run<(l: Line) => void>(
    `${slice(COMBAT, '    const speak = (l: { speaker: string; text: string }): void => {', '    // 潤飾版有三句的組')}\nreturn speak;`,
    {
      document: { querySelector: (sel: string) => (sel === '.dialogue-overlay' && overlayOpen ? {} : null) },
      toast, bubbleOverUnit,
      speakerSeat: (sp: string) => (sp === '球球' ? 0 : undefined),
      speechBubbleAt: () => ({ left: 200 }),
      coop: null, cs: { players: [{}] }, mySeat: 0,
      app: { stage: {} }, root: { querySelector: () => ({}) }, bossId: 'tanuki_lord',
      text: (l: Line) => l.text, name: (sp: string) => sp,
    });
  return { speak, toast, bubbleOverUnit };
}

describe('關主換階段那串台詞', () => {
  it('旁白照舊從原本的位置冒，不走關主頭上的泡泡（中-1）', async () => {
    const { speak, toast, bubbleOverUnit } = await makeSpeak(false);
    speak({ speaker: '旁白', text: '狸大人把葉子往頭上一放。' });
    expect(bubbleOverUnit).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('狸大人把葉子往頭上一放。', '旁白');
  });

  it('關主本人講的照樣從牠頭上冒；主角講的從自己那一格冒', async () => {
    const { speak, toast, bubbleOverUnit } = await makeSpeak(false);
    speak({ speaker: '塔主', text: '看仔細了——變！' });
    expect(bubbleOverUnit).toHaveBeenCalledTimes(1);
    speak({ speaker: '球球', text: '又變了喵！' });
    expect(toast).toHaveBeenCalledWith('又變了喵！', '球球', { left: 200 });
  });

  it('收場對白已經開了：剩下幾句一句都不冒（低-2）', async () => {
    const { speak, toast, bubbleOverUnit } = await makeSpeak(true);
    speak({ speaker: '旁白', text: 'x' });
    speak({ speaker: '塔主', text: 'y' });
    speak({ speaker: '球球', text: 'z' });
    expect(toast).not.toHaveBeenCalled();
    expect(bubbleOverUnit).not.toHaveBeenCalled();
  });
});

describe('對白框一開', () => {
  it('先收掉畫面上有說話者名牌的台詞泡泡，一般提示不動（低-2）', () => {
    const body = slice(DIALOGUE, 'export function playDialogue(', "const box = el('div', { class: 'dialogue-overlay' });");
    expect(body).toContain("layer.querySelectorAll('.toast').forEach((t) => { if (t.querySelector('b')) t.remove(); });");
    // 要在建對白框之前收：之後才冒的泡泡另外由 speak 擋
    expect(body.indexOf("querySelectorAll('.toast')")).toBeGreaterThan(body.indexOf('if (!layer || lines.length === 0)'));
  });
});

describe('斷線橫幅（低-3）', () => {
  type Node = { who: string; text: string; removed: boolean; remove(): void };
  async function makeBanner() {
    const nodes: Node[] = [];
    const document = {
      body: { append: (n: Node) => nodes.push(n) },
      querySelectorAll: (sel: string) => {
        const m = /data-who="(\w+)"/.exec(sel);
        return nodes.filter((n) => !n.removed && (!m || n.who === m[1]));
      },
    };
    const el = (_tag: string, attrs: Record<string, string>, text: string): Node => {
      const n: Node = { who: attrs['data-who'] ?? '', text, removed: false, remove() { n.removed = true; } };
      return n;
    };
    const banner = await run<(app: unknown, s: string) => void>(
      `${slice(LOBBY, 'function linkBanner(', '\n/*\n * 兩個座位各玩誰')}\nreturn linkBanner;`, { document, el });
    const live = () => nodes.filter((n) => !n.removed);
    return { banner, live };
  }

  it('自己報「接回來了」不會把對方斷線那條撕掉', async () => {
    const { banner, live } = await makeBanner();
    banner(null, 'peerAway');
    banner(null, 'away');
    expect(live().map((n) => n.who).sort()).toEqual(['me', 'peer']);
    banner(null, 'back');
    expect(live().map((n) => n.who)).toEqual(['peer']);
    banner(null, 'peerBack');
    expect(live()).toEqual([]);
  });

  it('自己那條不說「正在重新連線」（心跳只是暫時沒回音就會先報）', async () => {
    const { banner, live } = await makeBanner();
    banner(null, 'away');
    expect(live()[0]!.text).not.toContain('正在重新連線');
    expect(live()[0]!.text).toContain('連線不穩');
  });
});
