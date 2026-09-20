import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrameMotionSet } from '../../src/ui/frame-motion';

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => path }));
let draws: number[][];
beforeEach(() => {
  draws = [];
  vi.stubGlobal('window', { devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame: vi.fn() });
  vi.stubGlobal('Image', class { src = ''; complete = true; });
  vi.stubGlobal('document', { createElement: () => ({
    style: {}, setAttribute: vi.fn(), getContext: () => ({
      setTransform: vi.fn(), clearRect: vi.fn(),
      drawImage: (_image: unknown, ...args: number[]) => draws.push(args),
    }),
  }) });
});
afterEach(() => vi.unstubAllGlobals());

function actor() {
  const frames = [
    { rect: [0, 0, 180, 252] as const, pivot: [90, 251] as const, duration: .2 },
    { rect: [200, 0, 190, 260] as const, pivot: [70, 259] as const, duration: .2 },
  ];
  return createFrameMotionSet<'idle' | 'attack'>({
    motions: {
      idle: { texture: 'idle.webp', scale: 1, loop: true, frames },
      attack: { texture: 'attack.webp', scale: 1, loop: false, frames },
    },
    nativeHeight: 252, initialAction: 'idle', className: 'test', ariaLabel: 'test',
    resolve: (action, elapsed) => ({ key: action, elapsed }), duration: () => 400,
  }).createActor();
}

describe('quiet grounded idle', () => {
  it('keeps the same whole-body pose instead of jumping between offset idle drawings', () => {
    const a = actor();
    for (const elapsed of [0, 250, 500, 1200, 1800, 3100, 4400, 6200]) a.play('idle', { elapsed });
    for (const draw of draws) expect(draw.slice(0, 4)).toEqual([0, 0, 180, 252]);
    a.dispose();
  });

  it('breathes continuously with a visible small rise while anchoring the feet', () => {
    const a = actor();
    draws.length = 0;
    for (const elapsed of [0, 800, 1600, 2400, 3100, 3900, 4700, 5500, 6200]) a.play('idle', { elapsed });
    for (let i = 1; i <= 4; i++) expect(draws[i]![7]).toBeGreaterThan(draws[i - 1]![7]!);
    for (let i = 5; i < draws.length; i++) expect(draws[i]![7]).toBeLessThan(draws[i - 1]![7]!);
    expect(draws[0]).toEqual(draws.at(-1));
    expect(Math.max(...draws.map(x => x[7]!))).toBeGreaterThan(258);
    for (const draw of draws) {
      expect(draw[4]).toBe(draws[0]![4]);
      expect(draw[6]).toBe(180);
      expect(draw[7]).toBeLessThanOrEqual(252 * 1.025 + .00001);
      expect(draw[5]! + draw[7]! * 251 / 252).toBeCloseTo(a.foot.y, 6);
    }
    a.dispose();
  });

  it('preserves every attack frame and its original scale and timing', () => {
    const a = actor();
    a.play('attack', { elapsed: 250 });
    expect(draws.at(-1)!.slice(0, 4)).toEqual([200, 0, 190, 260]);
    expect(draws.at(-1)![7]).toBe(260);
    a.dispose();
  });
});
