import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventById } from '../../src/content/events';
import { nextChoices } from '../../src/engine/map';
import { HEROES } from '../../src/engine/hero';
import { advanceAct, chooseNode, newCoopRun, newRun } from '../../src/engine/run';
import type { MapNode, RunState } from '../../src/engine/types';
import { BASE, _setManifestForTest, setLocalHero, type Manifest } from '../../src/ui/assets';
import { _mapEventHeldForTest, eventScreenBgUrl, mapEventArtUrls, mapEventIds, preloadMapEvents, warmEventArt } from '../../src/ui/preload';

/*
 * 事件主圖改成「照這張地圖排到的那幾格」現抓（2026-09-23 內容擴充第〇批 0-2）。
 *
 * 首載不再包含三十張球球版事件主圖，所以地圖畫面出來時就得把**會畫出來的那一張**抓好：
 *  - 這張地圖上每個事件格＋這一關待出的後集（走進第一個事件格就會換成它）；
 *  - 是本機這一位自己的版本（四隻各有一套），連線的鏡子走廊照座位 0；
 *  - 插隊、留參照，走進去時等它解好（`warmEventArt`）。
 */
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };

beforeEach(() => { _setManifestForTest(MANIFEST); });
afterEach(() => { _setManifestForTest(EMPTY); setLocalHero('ninja'); vi.unstubAllGlobals(); vi.useRealTimers(); });

/** 從地圖起點走到最近的一個事件格（不含 5F 固定那格）的路 */
function pathToEvent(run: RunState): MapNode[] | null {
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  const queue: MapNode[][] = nextChoices(run.map, null).map((n) => [n]);
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1]!;
    if (last.type === '事件' && last.floor !== 5) return path;
    for (const id of last.next) queue.push([...path, byId.get(id)!]);
  }
  return null;
}

describe('這張地圖要先抓哪幾篇', () => {
  it('地圖上每個事件格都在名單裡（含 5F 固定那篇）', () => {
    for (let s = 0; s < 20; s++) {
      const run = newRun(`map-art-${s}`, 1, HEROES[s % 4]!);
      const ids = new Set(mapEventIds(run));
      for (const n of run.map.nodes) if (n.type === '事件') expect(ids.has(n.eventId!), `${n.id} ${n.eventId}`).toBe(true);
      expect(ids.has('daxia_teach')).toBe(true);
    }
  });

  it('待出的後集排第一，而且真的走進第一個事件格時換出來的那篇一定在名單裡（拿引擎的 `chooseNode` 對）', () => {
    let checked = 0;
    for (let s = 0; s < 60 && checked < 5; s++) {
      const run = newRun(`sequel-art-${s}`, 1);
      run.flags['toll_paid'] = true;            // 第一關付了買路財 → 第二關的「山賊再現」待出
      advanceAct(run);
      expect(run.flags['sequel:toll_again_paid']).toBe(true);
      const ids = mapEventIds(run);
      expect(ids[0]).toBe('toll_again_paid');
      // 只挑後集**沒有**被排在地圖上的那幾局：那種局只有「待出」這一條路會讓它出現，拿掉就會漏抓
      if (run.map.nodes.some((n) => n.eventId === 'toll_again_paid')) continue;
      const path = pathToEvent(run);
      if (!path) continue;
      for (const n of path) chooseNode(run, n.id);
      const entered = path[path.length - 1]!;
      expect(entered.eventId).toBe('toll_again_paid');
      expect(ids, `${run.seed}：走進去看到的那篇沒先抓`).toContain(entered.eventId);
      checked++;
    }
    expect(checked, '至少要對到幾局').toBeGreaterThan(0);
  });

  it('遇過的後集不再列（跟引擎換不換同一條判準）', () => {
    const run = newRun('sequel-seen', 1);
    run.flags['toll_paid'] = true;
    advanceAct(run);
    run.flags['event:toll_again_paid'] = true;
    expect(mapEventIds(run).slice(0, 1)).not.toEqual(['toll_again_paid']);
  });
});

describe('抓的是事件畫面會畫的那一張', () => {
  it('四隻各抓自己的版本；沒有自己版本的退回球球那張；一張都不是剪影', () => {
    for (const hero of HEROES) {
      setLocalHero(hero);
      const run = newRun(`hero-art-${hero}`, 1, hero);
      const ids = mapEventIds(run);
      const urls = mapEventArtUrls(run);
      expect(urls).toHaveLength(ids.length);
      ids.forEach((id, i) => {
        const mine = `bg/event_${hero}_${id}`;
        const key = hero !== 'ninja' && MANIFEST.bg[mine] !== undefined ? mine : `bg/event_${id}`;
        expect(urls[i], `${hero} ${id}`).toBe(`${BASE}${MANIFEST.bg[key]}`);
        expect(urls[i]!.startsWith('data:'), `${hero} ${id} 沒有圖`).toBe(false);
      });
      // 共用事件的角色版真的有被挑到（不是全部退回球球那張）
      if (hero !== 'ninja') expect(urls.some((u) => u.includes(`/event_${hero}_`)), hero).toBe(true);
    }
  });

  it('連線的鏡子走廊照座位 0 挑（坐 1 號的球球看到封封那張），其餘照本機這一位', () => {
    const run = newCoopRun('coop-mirror-art', 1, 'fengfeng', 'ninja');
    setLocalHero('ninja');
    const slot = run.map.nodes.find((n) => n.type === '事件' && n.floor !== 5)!;
    slot.eventId = 'mirror_hall';
    const ids = mapEventIds(run);
    const urls = mapEventArtUrls(run);
    expect(urls[ids.indexOf('mirror_hall')]).toBe(`${BASE}${MANIFEST.bg['bg/event_fengfeng_mirror_hall']}`);
    expect(urls[ids.indexOf('daxia_teach')]).toBe(`${BASE}${MANIFEST.bg['bg/event_daxia_teach']}`);
  });
});

describe('背景預載', () => {
  function fakeImages(decode: () => Promise<void> = async () => undefined) {
    const got: { src: string; priority: string | undefined }[] = [];
    class FakeImage {
      fetchPriority: string | undefined;
      set src(v: string) { got.push({ src: v, priority: this.fetchPriority }); }
      decode = decode;
    }
    vi.stubGlobal('Image', FakeImage);
    return got;
  }

  it('只抓這張地圖的那幾張（加事件畫面底圖）、插隊、留參照；同一張地圖再叫一次不重送；換關就換一組', async () => {
    const got = fakeImages();
    const run = newRun('preload-map-1', 1);
    // 事件畫面的底圖也一起插隊（慢網路實測：第一次走進事件格時它還沒到，整片米白）
    const bg = eventScreenBgUrl(run);
    expect(bg).toBe(`${BASE}${MANIFEST.bg['bg/screen_event']}`);
    const want = [...new Set([bg, ...mapEventArtUrls(run)])];
    // 地圖自己的底圖排第一（這一批插隊，不排第一會搶在玩家眼前那張地圖底圖前面），但不留參照
    const mapBg = `${BASE}${MANIFEST.bg['bg/map_tall']}`;
    await preloadMapEvents(run);
    expect(got[0]!.src, '地圖底圖先').toBe(mapBg);
    expect(got.map((g) => g.src).sort()).toEqual([mapBg, ...want].sort());
    expect(got.every((g) => g.priority === 'high'), '要插隊').toBe(true);
    expect(_mapEventHeldForTest().sort()).toEqual([...want].sort());
    // 不是整包：沒排到這張地圖的事件一張都不抓
    const others = Object.keys(eventById).filter((id) => !mapEventIds(run).includes(id));
    expect(others.length).toBeGreaterThan(10);
    for (const id of others) expect(got.some((g) => g.src.endsWith(`/event_${id}.webp`)), id).toBe(false);

    got.length = 0;
    await preloadMapEvents(run);
    expect(got, '連線每投一票地圖就重畫一次：同一張地圖不重送').toEqual([]);

    advanceAct(run);
    const next = [...new Set([eventScreenBgUrl(run), ...mapEventArtUrls(run)])].sort();
    expect(eventScreenBgUrl(run), '第二關換塔中那張').toBe(`${BASE}${MANIFEST.bg['bg/screen_event_mid']}`);
    await preloadMapEvents(run);
    expect(got.map((g) => g.src).sort(), '新地圖整組重抓（5F 那張也是新的一關）').toEqual([`${BASE}${MANIFEST.bg['bg/map_tall_mid']}`, ...next].sort());
    expect(_mapEventHeldForTest().sort(), '上一關那組放掉').toEqual(next);
  });

  it('走進事件格：主圖與底圖已經解好就立刻過；還在路上就插隊再要，最多等 6 秒', async () => {
    vi.useFakeTimers();
    const pending: (() => void)[] = [];
    const got = fakeImages(() => new Promise<void>((r) => { pending.push(r); }));
    const run = newRun('warm-event-1', 1);
    const id = mapEventIds(run)[0]!;
    let done = false;
    void warmEventArt(run, id).then(() => { done = true; });
    expect(got.map((g) => g.src).sort()).toEqual([eventScreenBgUrl(run), mapEventArtUrls(run)[0]!].sort());
    expect(got.every((g) => g.priority === 'high')).toBe(true);
    await vi.advanceTimersByTimeAsync(5999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done, '網路整個卡住時不讓整局停在地圖上').toBe(true);

    for (const r of pending) r();
    await vi.advanceTimersByTimeAsync(0);
    got.length = 0;
    let again = false;
    void warmEventArt(run, id).then(() => { again = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(got, '解好了就不再要').toEqual([]);
    expect(again).toBe(true);
  });
});
