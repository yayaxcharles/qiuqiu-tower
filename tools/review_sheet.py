"""把幾張圖拼成一張聯絡表，人眼一次看完。

**格子一律 500 像素**（2026-09-13 訂）：先前用 190～320 的版本漏掉整批寶箱圖，
縮太小時「畫錯角色」「手指黏在一起」這類問題看起來都像壓縮雜訊。
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

TILE = 500
PAD = 8
COLS = 4


def build(paths, out, cols=COLS, tile=TILE):
    paths = [Path(p) for p in paths]
    rows = (len(paths) + cols - 1) // cols
    label_h = 26
    sheet = Image.new('RGB', (cols * (tile + PAD) + PAD, rows * (tile + label_h + PAD) + PAD), (30, 30, 34))
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        x = PAD + (i % cols) * (tile + PAD)
        y = PAD + (i // cols) * (tile + label_h + PAD)
        try:
            im = Image.open(p).convert('RGBA')
        except Exception as e:                      # 讀不到就畫一格紅的，不要整張表掛掉
            d.rectangle([x, y, x + tile, y + tile], fill=(90, 20, 20))
            d.text((x + 6, y + 6), f'{p.name}\n{e}', fill=(255, 200, 200))
            continue
        im.thumbnail((tile, tile))
        # 貼在淺灰底上：牌面多半是去背的，深底看不出邊緣殘留
        bg = Image.new('RGBA', (tile, tile), (210, 210, 214, 255))
        bg.alpha_composite(im, ((tile - im.width) // 2, (tile - im.height) // 2))
        sheet.paste(bg.convert('RGB'), (x, y))
        d.text((x + 4, y + tile + 6), p.stem, fill=(230, 230, 230))
    sheet.save(out, quality=88)
    print(out, sheet.size, len(paths), '張')


if __name__ == '__main__':
    build(sys.argv[2:], sys.argv[1])
