/**
 * WebP 檔頭裡的寬高，三種容器都認（2026-09-24 讀取加速：動作圖從無損 VP8L 改存有損帶透明的 VP8X）。
 * - `VP8L`（無損）：第 21～24 位元組是寬減一、高減一，各 14 位元；
 * - `VP8X`（擴充容器，有損帶透明）：第 24～26 位元組是畫布寬減一、27～29 是高減一，各 24 位元小端；
 * - `VP8 `（有損不帶透明）：第 26～29 位元組是寬、高，各 14 位元小端。
 */
export function webpSizeOf(bytes: Uint8Array): [number, number] {
  const tag = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (tag === 'VP8L') {
    const [b1, b2, b3, b4] = [bytes[21]!, bytes[22]!, bytes[23]!, bytes[24]!];
    return [1 + (b1 | ((b2 & 0x3f) << 8)), 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10))];
  }
  if (tag === 'VP8X') {
    return [1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)), 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16))];
  }
  if (tag === 'VP8 ') {
    return [(bytes[26]! | (bytes[27]! << 8)) & 0x3fff, (bytes[28]! | (bytes[29]! << 8)) & 0x3fff];
  }
  throw new Error(`不是認得的 WebP 容器：${tag}`);
}
