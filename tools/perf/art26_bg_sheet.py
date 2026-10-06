# -*- coding: utf-8 -*-
"""把 art26_bg_shots.mjs 截的圖拼成聯絡表（2026-10-06 背景線）。

用法：python tools/perf/art26_bg_sheet.py <截圖夾> <輸出夾>
輸出：combat_desktop.jpg、combat_phone.jpg、map.jpg、film_fog.jpg、film_beam.jpg、film_lamp.jpg
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

try:
    FONT = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 14)   # 微軟正黑體：標籤有中文，預設字型會變成方塊
except OSError:
    FONT = None

KEYS = [f'art26_{t}_{n}' for t in ('low', 'mid', 'top') for n in (1, 2, 3)]


def grid(paths, cols, tw, out, labels):
    ims = [Image.open(p).convert('RGB') for p in paths]
    th = round(ims[0].height * tw / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rows * (th + 22)), (24, 20, 18))
    d = ImageDraw.Draw(sheet)
    for i, (im, lab) in enumerate(zip(ims, labels)):
        x, y = (i % cols) * tw, (i // cols) * (th + 22)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 22))
        d.text((x + 6, y + 5), lab, fill=(255, 230, 150), font=FONT)
    sheet.save(out, quality=86)
    print(out)


def film(src, prefix, box, out, label):
    frames = [Image.open(src / f'{prefix}_{i}.png').convert('RGB').crop(box) for i in range(10)]
    w, h = frames[0].size
    sheet = Image.new('RGB', (w, (h + 18) * len(frames)), (24, 20, 18))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(frames):
        sheet.paste(f, (0, i * (h + 18) + 18))
        d.text((6, i * (h + 18) + 3), f'{label}  第 {i} 格（約 +{i * 200} 毫秒，實際間隔含截圖時間）', fill=(255, 230, 150), font=FONT)
    sheet.save(out, quality=86)
    print(out)


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    grid([src / f'desk_combat_{k}.png' for k in KEYS], 3, 640, dst / 'combat_desktop.jpg', KEYS)
    grid([src / f'phone_combat_{k}.png' for k in KEYS], 5, 260, dst / 'combat_phone.jpg', KEYS)
    grid([src / f'{v}_map_act{a}.png' for v in ('desk',) for a in (1, 2, 3)], 3, 640, dst / 'map_desktop.jpg', [f'桌面 第 {a} 關' for a in (1, 2, 3)])
    grid([src / f'phone_map_act{a}.png' for a in (1, 2, 3)], 3, 300, dst / 'map_phone.jpg', [f'手機 第 {a} 關' for a in (1, 2, 3)])
    film(src, 'film_fogbeam', (0, 300, 1280, 480), dst / 'film_fog.jpg', '霧（清晨練功房 地板那一帶）')
    film(src, 'film_fogbeam', (420, 56, 1280, 420), dst / 'film_beam.jpg', '光束（清晨練功房 右邊兩道）')
    film(src, 'film_lamp', (240, 56, 1020, 300), dst / 'film_lamp.jpg', '燈（火把地牢 兩支火把）')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
