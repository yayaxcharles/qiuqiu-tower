import type { RunEffectOutcome } from './run';

/*
 * 連線事件的「還在等哪幾種票」（2026-09-24 推前審查五 高-4）。
 *
 * 事件選完之後，每一位的結果可能要再挑一步：挑牌升級／移除（`evcard`）、三選一學招（`evlearn`）、挑一件淨化（`evpurify`）。
 * 原本事件畫面只用一個「還在等」的旗標，**哪一種票先湊齊就把「繼續」放出來**：紫霧②一人要丟牌、一人要挑淨化時，
 * 先挑好的那台就能按「繼續」走掉，另一人挑的結果套不進這台，兩台分岔。
 * 改成記一個集合（`PickWaits`）：這一輪要等的每一種都湊齊（拿掉）了才放「繼續」；別種票湊齊時，自己還有沒挑完的就不要重畫（挑選窗開著）。
 * 純邏輯，畫面（`ui/screens/event.ts`）與測試共用同一份。
 */
export type PickKind = 'evcard' | 'evlearn' | 'evpurify';

/** 這一位的結果要自己再挑哪幾種（學招接著挑牌升級的，兩種都要） */
export function pickKindsOf(o: RunEffectOutcome | undefined): PickKind[] {
  if (!o) return [];
  if ('needs' in o) return ['evcard'];
  if ('chooseCard' in o) return o.then ? ['evlearn', 'evcard'] : ['evlearn'];
  if ('purify' in o) return ['evpurify'];
  return [];
}

/** 這一輪（站著的每一位合起來）要等哪幾種票 */
export function pickKindsFor(outcomes: readonly (RunEffectOutcome | undefined)[]): Set<PickKind> {
  return new Set(outcomes.flatMap((o) => pickKindsOf(o)));
}

/** 事件畫面一輪裡還在等的票種 */
export class PickWaits {
  private readonly left = new Set<PickKind>();

  /** 新的一輪：照每一位的結果記下要等哪幾種 */
  start(outcomes: readonly (RunEffectOutcome | undefined)[]): void {
    this.left.clear();
    for (const k of pickKindsFor(outcomes)) this.left.add(k);
  }

  /** 這一種湊齊、結算完了：只拿掉這一種，別種還在等的照樣等 */
  settle(kind: PickKind): void { this.left.delete(kind); }

  /** 還有沒湊齊的：「繼續」要鎖著 */
  get waiting(): boolean { return this.left.size > 0; }

  /**
   * 這一位自己還有沒挑完的嗎：還在等的那幾種裡，有自己要挑、自己還沒投的（挑選窗還開著，別重畫蓋掉它）。
   * `voted(k)`＝這一位在 `k` 那一種已經投了（空票也算）。學招之後結果會換成接著挑牌那一步（`passLearn`），傳現在的就對。
   */
  ownPending(own: RunEffectOutcome | undefined, voted: (k: PickKind) => boolean): boolean {
    return pickKindsOf(own).some((k) => this.left.has(k) && !voted(k));
  }
}
