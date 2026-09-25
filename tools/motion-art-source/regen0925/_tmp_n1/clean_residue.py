"""n1 組：兩張去背殘留只清殘留、不重畫。

- event_sleeping_guard：球球尾巴根部與忍者服之間一小塊亮綠色綠幕殘留（約 x 205～218、y 312～324）。
  那是畫裡「衣服和尾巴之間的空隙」。試過清成透明：在淺色底上變成一個沒描邊的小破洞，很突兀；
  所以改成補上周圍描邊／陰影的深色（看起來是衣服和尾巴之間的暗縫），周圍帶綠色調的邊緣像素把綠壓回去。
- event_medicine_cat_r0：攤子窗口裡、三花貓身後一整塊不透明的灰色斑駁方塊（帶破碎白邊）。
  同事件 r1、r3 這個位置是透明的（主圖是半透明深色），所以清成透明。
  做法：窗口框內「低彩度、不太暗」的像素，從幾個確定是灰塊的種子點做連通擴散（三花貓的白毛被黑色描邊圍住，
  不會連進來），再把灰塊裡夾著的零星暗斑一起清掉。

一律從 regen0925/_old/ 的備份算（沒有就先備份），重跑不會越清越多；存回尺寸不變、WEBP quality=80 method=6。
用法：python clean_residue.py <guard|med> [--dry <預覽.png>]
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[4]
BG = ROOT / 'public/assets/bg'
OLD = ROOT / 'tools/motion-art-source/regen0925/_old'


def load(name: str) -> tuple[Path, Image.Image]:
    target = BG / f'{name}.webp'
    OLD.mkdir(parents=True, exist_ok=True)
    backup = OLD / target.name
    if not backup.exists():
        shutil.copy2(target, backup)
        print('已備份原圖 →', backup.relative_to(ROOT).as_posix())
    return target, Image.open(backup).convert('RGBA')


def box_mask(shape, box):
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = box
    m[y0:y1, x0:x1] = True
    return m


def guard(src: Image.Image) -> tuple[np.ndarray, dict]:
    a = np.array(src).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    box = box_mask(al.shape, (200, 306, 224, 330))
    green = box & (g > np.maximum(r, b) + 15) & (g > 30) & (al > 0)
    # 綠塊外緣反鋸齒：跟綠塊相鄰、綠色明顯高於紅藍的像素也算殘留
    grown = green.copy()
    for _ in range(2):
        ring = ndimage.binary_dilation(grown) & ~grown & box
        add = ring & (g > np.maximum(r, b) + 8) & (al > 0)
        if not add.any():
            break
        grown |= add
    out = np.array(src)
    if GUARD_MODE == 'clear':
        out[grown, :3] = 0
        out[grown, 3] = 0
    else:
        # 補成「衣服與尾巴之間的深色陰影」：取周圍（6 點內）不透明、很暗的描邊／陰影像素的中位數
        near = ndimage.binary_dilation(grown, iterations=6) & ~grown & (al == 255)
        mx = np.maximum(np.maximum(r, g), b)
        pool = a[near & (mx < 60) & (g <= np.maximum(r, b) + 3)][:, :3]
        out[grown, :3] = np.median(pool, axis=0).astype(np.uint8)
        out[grown, 3] = 255
    # 去綠邊：框外擴 3 點內仍帶綠色調的像素，把綠壓回紅藍較大者
    zone = ndimage.binary_dilation(grown, iterations=3)
    o = out.astype(int)
    cap = np.maximum(o[..., 0], o[..., 2])
    spill = zone & (o[..., 3] > 0) & (o[..., 1] > cap + 3)
    out[spill, 1] = cap[spill].astype(np.uint8)
    return out, {'綠色點': int(green.sum()), f'連同外緣處理（{GUARD_MODE}）': int(grown.sum()), '去綠邊': int(spill.sum())}


GUARD_MODE = 'fill'   # 'clear'＝清成透明（在淺色底上會變成一個沒描邊的小破洞）；'fill'＝補成深色陰影


MED_BOX = (45, 100, 280, 268)          # 攤子窗口一帶（含三花貓；靠連通性只取灰塊）
MED_SEEDS = [(60, 150), (250, 150), (228, 118), (62, 235), (255, 200), (248, 250)]


def med(src: Image.Image) -> tuple[np.ndarray, dict]:
    a = np.array(src).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    box = box_mask(al.shape, MED_BOX)
    cand = box & (al > 0) & ((mx - mn) <= 38) & (mx >= 70)
    lab, _ = ndimage.label(cand)
    ids = {lab[y, x] for x, y in MED_SEEDS if lab[y, x] > 0}
    region = np.isin(lab, list(ids))
    # 灰塊裡夾著的暗斑（斑駁紋理）：被灰塊包住的小洞一起清
    filled = ndimage.binary_fill_holes(region)
    holes = filled & ~region
    hl, hn = ndimage.label(holes)
    sizes = ndimage.sum(holes, hl, range(1, hn + 1))
    small = np.isin(hl, [i + 1 for i, s in enumerate(sizes) if s <= 60])
    kill = region | small
    # 灰塊外緣：跟灰塊相鄰、低彩度的半暗像素（灰與描邊之間的過渡）也清，最多 2 圈
    for _ in range(2):
        ring = ndimage.binary_dilation(kill) & ~kill & box
        add = ring & ((mx - mn) <= 30) & (mx >= 55) & (al > 0)
        if not add.any():
            break
        kill |= add
    out = np.array(src)
    out[kill, :3] = 0
    out[kill, 3] = 0
    return out, {'種子連到的灰塊': int(region.sum()), '夾在中間的暗斑': int(small.sum()),
                 '清成透明合計': int(kill.sum())}


def main() -> None:
    which = sys.argv[1]
    dry = sys.argv[sys.argv.index('--dry') + 1] if '--dry' in sys.argv else None
    name = {'guard': 'event_sleeping_guard', 'med': 'event_medicine_cat_r0'}[which]
    target, src = load(name)
    out, stats = (guard if which == 'guard' else med)(src)
    print(name, stats)
    img = Image.fromarray(out, 'RGBA')
    assert img.size == src.size
    if dry:
        img.save(dry)
        print('預覽 →', dry)
        return
    img.save(target, 'WEBP', quality=80, method=6)
    check = Image.open(target)
    print('已存回', target.relative_to(ROOT).as_posix(), check.size, check.mode, target.stat().st_size, '位元組')


if __name__ == '__main__':
    main()
