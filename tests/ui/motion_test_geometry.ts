/** 畫布像素經獨立 CSS 縮放後的幾何；原有水平定位仍由各測試另行確認。 */
export function visibleCanvasRect(
  canvas: HTMLCanvasElement,
  rect: readonly [number, number, number, number],
): [number, number, number, number] {
  const scale = canvas.style.scale && canvas.style.scale !== 'none' ? canvas.style.scale : '1';
  const [sx = 1, sy = sx] = scale.split(/\s+/).map(Number);
  const origin = canvas.style.transformOrigin
    || `${Number.parseFloat(canvas.style.width) / 2}px ${Number.parseFloat(canvas.style.height) / 2}px`;
  const [ox = 0, oy = 0] = origin.split(/\s+/).map(Number.parseFloat);
  return [sx === 1 ? rect[0] : ox + (rect[0] - ox) * sx,
    sy === 1 ? rect[1] : oy + (rect[1] - oy) * sy, rect[2] * sx, rect[3] * sy];
}
