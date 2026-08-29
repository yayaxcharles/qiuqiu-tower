export interface RngState { a: number; b: number; c: number; d: number }

/** cyrb128：把任意字串雜湊成 4 個 32 位元整數當種子 */
export function seedFromString(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  // 注意：這裡的混合方式跟原版 cyrb128 不一樣（原版是 h1^h2, h2^h1, h3^h4, h4^h3），
  // 是刻意保留的差異，不要「順手修正」。改了等於換掉每一顆種子：舊存檔接不回去、
  // 回歸測試釘住的機器人數值與平衡報告也會全部作廢。
  return { a: (h1 ^ h2 ^ h3 ^ h4) >>> 0, b: h2 >>> 0, c: h3 >>> 0, d: h4 >>> 0 };
}

/** sfc32：小而快的 32 位元亂數，狀態就是四個整數，直接可存檔 */
export class Rng {
  readonly state: RngState;
  constructor(state: RngState) {
    this.state = { a: state.a >>> 0, b: state.b >>> 0, c: state.c >>> 0, d: state.d >>> 0 };
  }
  next(): number {
    const s = this.state;
    s.a |= 0; s.b |= 0; s.c |= 0; s.d |= 0;
    const t = (((s.a + s.b) | 0) + s.d) | 0;
    s.d = (s.d + 1) | 0;
    s.a = s.b ^ (s.b >>> 9);
    s.b = (s.c + (s.c << 3)) | 0;
    s.c = (s.c << 21) | (s.c >>> 11);
    s.c = (s.c + t) | 0;
    s.a >>>= 0; s.b >>>= 0; s.c >>>= 0; s.d >>>= 0;
    return (t >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick：空陣列');
    return arr[this.int(0, arr.length - 1)] as T;
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
  chance(p: number): boolean { return this.next() < p; }
  clone(): Rng { return new Rng({ ...this.state }); }
}
