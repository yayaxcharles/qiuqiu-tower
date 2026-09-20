import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/ui/app';
import { newRun } from '../../src/engine/run';

const probe = vi.hoisted(() => ({
  render: undefined as undefined | ((app: App, root: HTMLElement) => void),
  record: vi.fn(() => ({ floor: 2, won: false, turns: 0, date: '' })),
  clear: vi.fn(),
}));
vi.mock('../../src/ui/app', () => ({ registerScreen: (_name: string, render: typeof probe.render) => { probe.render = render; } }));
vi.mock('../../src/engine/save', () => ({ recordBest: probe.record, clearSave: probe.clear }));
vi.mock('../../src/ui/audio', () => ({ play: () => {} }));
vi.mock('../../src/ui/assets', () => ({ artUrl: () => 'data:', heroArtUrl: () => 'data:' }));
vi.mock('../../src/ui/screenbg', () => ({ screenBg: () => ({}) }));
vi.mock('../../src/ui/hud', () => ({ seedTag: () => ({}) }));
vi.mock('../../src/ui/scene', () => ({ sceneView: () => ({}) }));
vi.mock('../../src/ui/deckview', () => ({ showDeckPicker: () => {} }));
vi.mock('../../src/ui/tooltip', () => ({ attachTextTooltip: () => {} }));
vi.mock('../../src/ui/dom', () => ({ el: () => ({ append: () => {} }) }));
import '../../src/ui/screens/result';

describe('試玩結算不寫入正式紀錄', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([true, false])('沙盒=%s 的結算儲存邊界', (sandbox) => {
    const run = newRun('result-preview', 1, 'ninja');
    run.status = 'lost';
    const app = { run, sandbox, coop: null, seat: 0 } as unknown as App;
    probe.render!(app, { append: () => {} } as unknown as HTMLElement);
    expect(probe.record).toHaveBeenCalledTimes(sandbox ? 0 : 1);
    expect(probe.clear).toHaveBeenCalledTimes(sandbox ? 0 : 1);
  });
});
