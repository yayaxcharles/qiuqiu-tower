"""event_dangdang_medicine_cat_r1：把去背沒去乾淨的綠幕殘留清掉（不重畫）。

只動下面幾個框裡的像素；攤子上的綠色藥瓶（合法的綠）不在任何框裡。
- 「清成透明」的框：本來就是畫裡的空隙（兩腿之間、鉗子兩柄之間），綠幕從空隙露出來，清成透明才對。
  兩腿之間另把綠塊外圈那圈「半透明近黑」與「帶藍綠色調的暗描邊」殘渣一起清掉，並把清掉區域裡夾著的零星暗點補清，不留麻點。
- 「補成周圍顏色」的框：綠點夾在地板或毛色中間，清成透明會變成破洞，改用周圍實心像素的中位數補色。
先把原圖備份到 regen0925/_old/（已有備份就不覆蓋）；一律從備份算，重跑不會越清越多；存回時尺寸不變。
用法：python clean_green.py [--dry <預覽輸出.png>]
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
NAME = 'event_dangdang_medicine_cat_r1'
TARGET = ROOT / 'public/assets/bg' / f'{NAME}.webp'
OLD = ROOT / 'tools/motion-art-source/regen0925/_old'
# (x0, y0, x1, y1)，含頭不含尾
GAP = (385, 315, 452, 353)                  # 兩腿之間（主要殘留）
CLEAR = {'兩腿之間': GAP, '攤上鉗子兩柄之間': (89, 183, 97, 191)}
FILL = {'右腳邊地板缺口': (504, 360, 514, 368), '舉起那隻爪子旁': (346, 133, 354, 140)}
DESPILL = {'攤子左下地板邊': (110, 362, 135, 382)}   # 只去綠邊、不清不補


def box_mask(shape, box):
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = box
    m[y0:y1, x0:x1] = True
    return m


def neighbours(m, diag=False):
    p = np.pad(m, 1).astype(int)
    h, w = m.shape
    steps = [(-1, 0), (1, 0), (0, -1), (0, 1)] + ([(-1, -1), (-1, 1), (1, -1), (1, 1)] if diag else [])
    return sum(p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] for dy, dx in steps)


def main() -> None:
    dry = sys.argv[sys.argv.index('--dry') + 1] if '--dry' in sys.argv else None
    OLD.mkdir(parents=True, exist_ok=True)
    backup = OLD / TARGET.name
    if not backup.exists():
        shutil.copy2(TARGET, backup)
        print('已備份原圖 →', backup)
    src = Image.open(backup).convert('RGBA')
    size = src.size
    a = np.array(src).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx = np.maximum(np.maximum(r, g), b)
    green = (g > np.maximum(r, b) + 15) & (g > 30) & (al > 0)
    out = np.array(src)

    # 一、清成透明
    kill = np.zeros(al.shape, bool)
    for label, box in CLEAR.items():
        k = green & box_mask(al.shape, box)
        print(f'{label}：綠色 {int(k.sum())} 點 → 透明')
        kill |= k
    gap = box_mask(al.shape, GAP)
    residue = gap & (((al < 250) & (mx < 80)) |                                   # 半透明近黑
                     ((mx < 70) & (((g - r) >= 8) | ((b - r) >= 10))))            # 帶藍綠色調的暗描邊
    grown = kill.copy()
    for _ in range(10):
        add = (neighbours(grown) > 0) & residue & ~grown
        if not add.any():
            break
        grown |= add
    for _ in range(3):
        add = (neighbours(grown, diag=True) >= 5) & ~grown & gap
        if not add.any():
            break
        grown |= add
    print(f'兩腿之間外圈殘渣與夾在中間的暗點另清 {int((grown & ~kill).sum())} 點')
    out[grown, :3] = 0
    out[grown, 3] = 0

    # 二、補成周圍顏色
    for label, box in FILL.items():
        todo = green & box_mask(al.shape, box)
        print(f'{label}：綠色 {int(todo.sum())} 點 → 補周圍顏色')
        solid = (al == 255) & ~green
        for y, x in zip(*np.nonzero(todo)):
            ys, xs = slice(max(y - 3, 0), y + 4), slice(max(x - 3, 0), x + 4)
            pool = a[ys, xs][solid[ys, xs]]
            out[y, x, :3] = np.median(pool[:, :3], axis=0).astype(np.uint8)
            out[y, x, 3] = 255

    # 三、去綠邊：各框（外擴 3 點）裡還帶一點綠色調的邊緣像素，把綠壓回不超過紅藍較大者（亮度幾乎不變）
    zone = np.zeros(al.shape, bool)
    for x0, y0, x1, y1 in [*CLEAR.values(), *FILL.values(), *DESPILL.values()]:
        zone |= box_mask(al.shape, (x0 - 3, y0 - 3, x1 + 3, y1 + 3))
    o = out.astype(int)
    cap = np.maximum(o[..., 0], o[..., 2])
    spill = zone & (o[..., 3] > 0) & (o[..., 1] > cap + 3)
    out[spill, 1] = cap[spill].astype(np.uint8)
    print(f'去綠邊 {int(spill.sum())} 點')

    img = Image.fromarray(out, 'RGBA')
    assert img.size == size
    if dry:
        img.save(dry)
        print('預覽 →', dry)
        return
    img.save(TARGET, 'WEBP', quality=80, method=6)
    check = Image.open(TARGET)
    print('已存回', TARGET.relative_to(ROOT).as_posix(), check.size, check.mode, TARGET.stat().st_size, '位元組')


if __name__ == '__main__':
    main()
