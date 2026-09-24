import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playAttackImpactAccent } from '../../src/ui/attack-impact-accent';

class ElementStub {
  children: ElementStub[] = [];
  parent?: ElementStub;
  style = {};
  dataset: Record<string, string> = {};
  className = '';
  innerHTML = '';
  finish?: () => void;
  cancel?: () => void;
  setAttribute(): void {}
  append(child: ElementStub): void { child.parent = this; this.children.push(child); }
  remove(): void { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
  animate(): { onfinish?: () => void; oncancel?: () => void } {
    const self = this;
    return {
      set onfinish(fn: (() => void) | undefined) { self.finish = fn; },
      set oncancel(fn: (() => void) | undefined) { self.cancel = fn; },
    };
  }
}

const target = (host: ElementStub | null): Element => ({ querySelector: () => host } as unknown as Element);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('document', { createElement: () => new ElementStub() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('short-lived attack accents', () => {
  it('removes every new attack accent even when animation events never fire', () => {
    const host = new ElementStub();
    for (const action of ['roar', 'ground_slam', 'palm_combo', 'body_bash', 'rapid_combo',
      'heavy_palm', 'sweep_combo', 'reckless_bash', 'sword_combo', 'qi_cleave', 'earth_split', 'retreat_thrust']) {
      expect(playAttackImpactAccent(target(host), action)).toBe(true);
    }
    expect(host.children).toHaveLength(12);
    vi.advanceTimersByTime(400);
    expect(host.children).toHaveLength(0);
  });

  it('isolates effects on the confirmed target and cleans rapid overlapping hits independently', () => {
    const a = new ElementStub();
    const b = new ElementStub();
    playAttackImpactAccent(target(a), 'heavy_palm');
    vi.advanceTimersByTime(100);
    playAttackImpactAccent(target(a), 'body_bash');
    expect(b.children).toHaveLength(0);
    a.children[0]!.finish!();
    expect(a.children).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(a.children).toHaveLength(0);
  });

  it('cleans a cancelled animation and does not depend on animationend', () => {
    const host = new ElementStub();
    playAttackImpactAccent(target(host), 'earth_split');
    host.children[0]!.cancel!();
    expect(host.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves unhandled moves and missing hosts to the existing effect renderer', () => {
    const host = new ElementStub();
    expect(playAttackImpactAccent(target(host), 'guard')).toBe(false);
    expect(playAttackImpactAccent(target(null), 'roar')).toBe(false);
    expect(host.children).toHaveLength(0);
  });

  it('draws separate downward, upward and straight contacts for a three-cut sword combo', () => {
    const host = new ElementStub();
    for (let wave = 0; wave < 3; wave++) playAttackImpactAccent(target(host), 'sword_combo', wave);
    expect(new Set(host.children.map(x => x.innerHTML)).size).toBe(3);
  });
});
