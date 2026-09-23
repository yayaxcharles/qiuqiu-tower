import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 2026-09-23 連線稽核 高-1（b）：劇情疊層（幻燈片、對白、過場影片）在丟掉這一局時要整批收掉，而且**不叫 onDone**。
 *
 * 倉庫不用假的瀏覽器環境，這裡把 `el` 換成一個只記「被拆了沒、掛了哪些監聽」的假節點，
 * 疊層、鎖畫面、連點保護都用真的，三支劇情疊層也是真的那三支。
 */
type Fake = {
  tag: string; children: unknown[]; removed: boolean; paused: boolean;
  listeners: Record<string, (ev: unknown) => void>;
  dataset: Record<string, string>; style: Record<string, string>; hidden: boolean; textContent: string; src: string;
  classList: { add(): void; remove(): void; toggle(): void };
  append(...kids: unknown[]): void; remove(): void; addEventListener(t: string, fn: (ev: unknown) => void): void;
  querySelector(): null; querySelectorAll(): unknown[]; setAttribute(): void; removeAttribute(): void;
  pause(): void; play(): undefined; offsetWidth: number;
};
const made: Fake[] = [];
function fake(tag: string): Fake {
  const n: Fake = {
    tag, children: [], removed: false, paused: false, listeners: {}, dataset: {}, style: {}, hidden: false, textContent: '', src: '',
    classList: { add() {}, remove() {}, toggle() {} },
    append(...kids) { n.children.push(...kids); }, remove() { n.removed = true; },
    addEventListener(t, fn) { n.listeners[t] = fn; }, querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, removeAttribute() {}, pause() { n.paused = true; }, play: () => undefined, offsetWidth: 0,
  };
  made.push(n);
  return n;
}
vi.mock('../../src/ui/dom', () => ({
  el: (tag: string, _attrs: unknown, ...kids: unknown[]) => { const n = fake(tag); n.append(...kids); return n; },
  stageFrame: () => ({ left: 0, top: 0, k: 1 }),
}));
vi.mock('../../src/ui/assets', () => ({
  artUrl: () => 'bg.webp', fileUrl: (p: string) => p, hasHeroSprite: () => false, heroArtUrl: () => 'hero.webp',
  localHero: () => 'ninja', localPartner: () => undefined, monsterUrl: () => 'monster.webp',
}));
vi.mock('../../src/ui/bgm', () => ({ pauseBgm: () => {}, setBgm: () => {} }));

import { playSlides } from '../../src/ui/slides';
import { playDialogue } from '../../src/ui/dialogue';
import { playVideo } from '../../src/ui/video';
import { closeStoryOverlays, setOverlayRoot } from '../../src/ui/overlay';

/** 畫面層：鎖住時掛 `inert`，拿它看鎖有沒有解乾淨 */
let inert = false;
const screen = { setAttribute: () => { inert = true; }, removeAttribute: () => { inert = false; } };
const layer = { ...fake('div'), parentElement: { querySelector: (s: string) => (s === '#screen' ? screen : null) } };
const boxes = (): Fake[] => layer.children as Fake[];
const click = (box: Fake): void => box.listeners['click']!({ timeStamp: performance.now() + 60_000 });

beforeEach(() => {
  made.length = 0; layer.children.length = 0; inert = false;
  vi.stubGlobal('window', { setTimeout: () => 1, clearTimeout: () => {} });
  setOverlayRoot(layer as unknown as HTMLElement);
});
afterEach(() => { closeStoryOverlays(); setOverlayRoot(null); vi.unstubAllGlobals(); });

describe('丟掉這一局時，劇情疊層整批收掉、不叫 onDone', () => {
  it('幻燈片、對白、過場影片同時開著：一次收乾淨，onDone 一個都不叫，畫面解鎖', () => {
    const done = { slides: vi.fn(), dialogue: vi.fn(), video: vi.fn() };
    playSlides([{ img: 'story_1', lines: [{ speaker: '旁白', text: '一' }, { speaker: '旁白', text: '二' }] }], done.slides);
    playDialogue([{ speaker: '旁白', text: '三' }], done.dialogue);
    playVideo('ending', done.video);
    expect(boxes()).toHaveLength(3);
    expect(inert, '三層疊著，畫面是鎖的').toBe(true);

    closeStoryOverlays();
    expect(boxes().every((b) => b.removed), '序章幻燈片還蓋在標題上').toBe(true);
    expect(done.slides, '幻燈片的 onDone 就是 show("map")').not.toHaveBeenCalled();
    expect(done.dialogue).not.toHaveBeenCalled();
    expect(done.video).not.toHaveBeenCalled();
    expect(inert, '三個鎖都要解掉，不然標題畫面點不動').toBe(false);
    expect(made.find((n) => n.tag === 'video')?.paused, '影片要停').toBe(true);

    // 收掉之後再點那個已經拆掉的框（連點殘留）也不會接下去
    for (const b of boxes()) b.listeners['click']?.({ timeStamp: performance.now() + 60_000 });
    expect(done.slides).not.toHaveBeenCalled();
    expect(done.dialogue).not.toHaveBeenCalled();
  });

  it('正常演完的會自己除名：之後再收一次不會多叫、也不會多解一次鎖', () => {
    const onDone = vi.fn();
    playSlides([{ img: 'story_1', lines: [{ speaker: '旁白', text: '一' }] }], onDone);
    const other = vi.fn();
    playDialogue([{ speaker: '旁白', text: '還在演' }], other);
    click(boxes()[0]!);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(inert, '對白還開著，鎖要留著').toBe(true);
    closeStoryOverlays();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(inert).toBe(false);
  });
});
