"""「空手擲出」的逐格聯絡表（2026-09-23，批次 toss）：照遊戲裡的大小與腳底線排，人眼逐格看。

每隻貓一列：第一格是新版待機第 1 格（大小基準），後面 8 格是擲出的逐格，全部照各自的 `scale`
換成遊戲單位、腳底定位點對齊同一條地面線，所以頭忽大忽小、腳滑、手上有沒有東西，一眼看得出來。
格子 500 像素（`review_sheet.py` 的規矩），淺灰底（深底看不出透明邊）。

用法：
    python tools/toss_contact_sheet.py                         # 用 actions.json 選定的
    python tools/toss_contact_sheet.py --try qiuqiu=2 feifei=3  # 看還沒選定的嘗試
    python tools/toss_contact_sheet.py --out 某處.png
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_idle_state_art import IDLE_DATA  # noqa: E402
from pack_toss_motion import SOURCE, check  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TILE = 500
UNIT = 1.6          # 一個遊戲單位畫幾像素（252 單位高的待機＝403 像素，留得下伸出去的手）
GROUND = 0.9        # 地面線在格高的位置
NAME = {'qiuqiu': '球球', 'feifei': '菲菲', 'dangdang': '噹噹', 'fengfeng': '封封'}


def place(tile: Image.Image, crop: Image.Image, pivot: list[float], scale: float) -> None:
    k = scale * UNIT
    image = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
    x = TILE / 2 - pivot[0] * k
    y = TILE * GROUND - pivot[1] * k
    tile.alpha_composite(image, (round(x), round(y)))


def row(hero: str, path: Path | None) -> list[Image.Image]:
    idle = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    texture = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    tiles = []
    first = idle['frames'][0]
    x, y, w, h = first['rect']
    tile = Image.new('RGBA', (TILE, TILE), (210, 210, 214, 255))
    place(tile, texture.crop((x, y, x + w, y + h)), first['pivot'], idle['scale'])
    tiles.append(tile)
    image, frames, metrics = check(hero, path)
    for frame in frames:
        x, y, w, h = frame['rect']
        tile = Image.new('RGBA', (TILE, TILE), (210, 210, 214, 255))
        place(tile, image.crop((x, y, x + w, y + h)), frame['pivot'], metrics['scale'])
        tiles.append(tile)
    return tiles


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--try', dest='tries', nargs='*', default=[], help='hero=嘗試編號')
    parser.add_argument('--out', default=str(ROOT / 'docs/審查報告/空手擲出_逐格_2026-09-23.jpg'))
    args = parser.parse_args()
    tries = dict(t.split('=') for t in args.tries)
    heroes = ['qiuqiu', 'feifei', 'dangdang', 'fengfeng']
    label_w = 90
    sheet = Image.new('RGB', (label_w + 9 * TILE, len(heroes) * TILE + 40), (30, 30, 34))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 28)
    for i, text in enumerate(['待機（基準）'] + [f'第 {n} 格' for n in range(1, 9)]):
        draw.text((label_w + i * TILE + 10, 4), text, fill=(230, 230, 230), font=font)
    for r, hero in enumerate(heroes):
        path = SOURCE / hero / (f'toss.try{tries[hero]}.png' if hero in tries else 'toss.png')
        draw.text((10, 40 + r * TILE + TILE // 2), NAME[hero], fill=(230, 230, 230), font=font)
        for c, tile in enumerate(row(hero, path)):
            sheet.paste(tile.convert('RGB'), (label_w + c * TILE, 40 + r * TILE))
            draw.line([(label_w + c * TILE, 40 + r * TILE + TILE * GROUND), (label_w + (c + 1) * TILE, 40 + r * TILE + TILE * GROUND)],
                      fill=(150, 150, 160), width=1)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out, quality=88)
    print(args.out, sheet.size)


if __name__ == '__main__':
    main()
