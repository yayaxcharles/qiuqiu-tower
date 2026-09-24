import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderer: undefined as undefined | ((app: any, root: any, props: unknown) => void),
}));

vi.mock('../../src/ui/app', () => ({
  registerScreen: (_name: string, renderer: typeof mocks.renderer) => { mocks.renderer = renderer; },
}));

import { registerLazyScreen } from '../../src/ui/lazy-screen';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeRoot() {
  const elements: any[] = [];
  return {
    elements,
    ownerDocument: {
      defaultView: { location: { reload: vi.fn() } },
      createElement: (tag: string) => {
        const node = { tag, className: '', textContent: '', addEventListener: vi.fn() };
        elements.push(node);
        return node;
      },
    },
    append: vi.fn(),
    replaceChildren: vi.fn(),
  };
}

describe('延遲畫面登記', () => {
  beforeEach(() => { mocks.renderer = undefined; });

  it('舊載入完成時若已離開，不會覆蓋新畫面', async () => {
    const pending = deferred();
    registerLazyScreen('combat', () => pending.promise);
    const app = { stage: { dataset: { screen: 'combat' } }, show: vi.fn() };
    const root = fakeRoot();
    mocks.renderer!(app, root, { fight: 1 });
    app.stage.dataset.screen = 'map';
    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    expect(app.show).not.toHaveBeenCalled();
  });

  it('同一畫面重入只讓最新請求接手，並保留最新參數', async () => {
    const pending = deferred();
    registerLazyScreen('combat', () => pending.promise);
    const app = { stage: { dataset: { screen: 'combat' } }, show: vi.fn() };
    const root = fakeRoot();
    mocks.renderer!(app, root, { fight: 1 });
    mocks.renderer!(app, root, { fight: 2 });
    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    expect(app.show).toHaveBeenCalledTimes(1);
    expect(app.show).toHaveBeenCalledWith('combat', { fight: 2 }, { quiet: true });
  });

  it('仍停在載入畫面時會顯示錯誤，不會切換畫面', async () => {
    const pending = deferred();
    registerLazyScreen('combat', () => pending.promise);
    const app = { stage: { dataset: { screen: 'combat' } }, show: vi.fn() };
    const root = fakeRoot();
    mocks.renderer!(app, root, {});
    pending.reject(new Error('load failed'));
    await pending.promise.catch(() => undefined);
    await Promise.resolve();
    expect(root.replaceChildren).toHaveBeenCalledTimes(2);
    expect(app.show).not.toHaveBeenCalled();
    const retry = root.elements.find((node) => node.tag === 'button' && node.textContent === '重新整理');
    expect(retry?.textContent).toBe('重新整理');
    retry.addEventListener.mock.calls[0][1]();
    expect(root.ownerDocument.defaultView.location.reload).toHaveBeenCalledOnce();
  });

  it('載入失敗先給「再試一次」：再畫一次載入畫面（再叫一次 load），不必重新整理（連線中重新整理會中斷這一局，推前審查 低-1）', async () => {
    let calls = 0;
    const loads = [deferred(), deferred()];
    registerLazyScreen('event', () => loads[calls++]!.promise);
    const app = { stage: { dataset: { screen: 'event' } }, show: vi.fn() };
    const root = fakeRoot();
    mocks.renderer!(app, root, { eventId: 'toll' });
    loads[0]!.reject(new Error('Failed to fetch dynamically imported module'));
    await loads[0]!.promise.catch(() => undefined);
    await Promise.resolve();
    const again = root.elements.find((node) => node.tag === 'button' && node.textContent === '再試一次');
    expect(again, '要有「再試一次」').toBeDefined();
    expect(root.append.mock.calls.flat(), '而且真的放上畫面').toContain(again);
    const msg = root.elements.find((node) => node.className === 'screen-load-error');
    expect(msg?.textContent).toContain('連線中重新整理會中斷這一局');
    again.addEventListener.mock.calls[0][1]();
    expect(app.show).toHaveBeenCalledExactlyOnceWith('event', { eventId: 'toll' }, { quiet: true });
    // 畫面層照 show 重畫載入畫面：再叫一次 load，這次成功就換上真的畫面
    mocks.renderer!(app, root, { eventId: 'toll' });
    expect(calls).toBe(2);
    loads[1]!.resolve();
    await loads[1]!.promise; await Promise.resolve();
    expect(app.show).toHaveBeenCalledTimes(2);
  });
});
