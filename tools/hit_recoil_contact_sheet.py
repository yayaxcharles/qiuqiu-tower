"""挨打新畫風立繪的聯絡表（2026-09-22）。

每列一隻貓：新版待機第 1 格｜新挨打圖｜舊挨打圖｜重疊（待機淡淡鋪在底下，新挨打疊上去）。
全部照**遊戲裡的比例**擺（同一個縮放、同一條腳底線、同一個定位點），深色底比照戰場：
紅線是地面、灰色虛線是待機的頭頂高度、細直線是腳底定位點——
身高有沒有跑掉、腳底有沒有浮起來或橫移、白毛邊緣有沒有被吃掉、畫風有沒有走鐘，排在一起一眼看得出來。

用法：
    python tools/hit_recoil_contact_sheet.py docs/審查報告/新畫風挨打圖_2026-09-22.png
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_idle_state_art import IDLE_DATA, SPRITE_KEY  # noqa: E402
from idle_state_contact_sheet import NAMES, font  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
K = 1.0            # 遊戲單位 → 聯絡表像素（遊戲原尺寸）
CELL_W = 330
ROW_H = 300
LABEL_W = 110
FOOT_Y = 280
HEADER = 34
COLUMNS = ('新版待機第 1 格', '新挨打圖', '舊挨打圖（09-20～22）', '重疊：待機（淡）＋新挨打')


def legacy_hit(key: str) -> tuple[Image.Image, dict, float]:
    """舊挨打立繪，照原本 legacy-hit-motion.ts 的校準：alpha > 16 的可見高度＝252、腳底在可見範圍的下緣。"""
    image = Image.open(ROOT / f'public/assets/sprites/hero/{key}_hit.webp').convert('RGBA')
    _, top, _, bottom = image.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    frame = {'rect': [0, 0, image.width, image.height], 'pivot': [image.width / 2, bottom]}
    return image, frame, 252 / (bottom - top)


def place(canvas: Image.Image, texture: Image.Image, frame: dict, scale: float, cx: float, alpha: float = 1) -> None:
    x, y, w, h = frame['rect']
    k = scale * K
    crop = texture.crop((x, y, x + w, y + h)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    if alpha < 1:
        crop.putalpha(crop.getchannel('A').point(lambda a: round(a * alpha)))
    canvas.alpha_composite(crop, (round(cx - frame['pivot'][0] * k), round(FOOT_Y - frame['pivot'][1] * k)))


def row_image(hero: str, hits: dict) -> Image.Image:
    idle = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    idle_tex = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    hit = hits[hero]
    hit_tex = Image.open(ROOT / 'public' / hit['texture']).convert('RGBA')
    old_tex, old_frame, old_scale = legacy_hit(SPRITE_KEY[hero])
    row = Image.new('RGBA', (LABEL_W + CELL_W * len(COLUMNS), ROW_H), (44, 48, 58, 255))
    draw = ImageDraw.Draw(row)
    for i in range(len(COLUMNS)):
        if i % 2:
            draw.rectangle((LABEL_W + i * CELL_W, 0, LABEL_W + (i + 1) * CELL_W - 1, ROW_H), fill=(54, 58, 70, 255))
    draw.line((LABEL_W, FOOT_Y, row.width, FOOT_Y), fill=(230, 70, 70, 255), width=1)
    head = FOOT_Y - 252 * K
    for x in range(LABEL_W, row.width, 8):
        draw.line((x, head, x + 4, head), fill=(150, 150, 150, 255), width=1)
    for i in range(len(COLUMNS)):
        cx = LABEL_W + i * CELL_W + CELL_W / 2
        draw.line((cx, FOOT_Y - 6, cx, FOOT_Y + 6), fill=(120, 200, 255, 255), width=1)
    draw.text((10, 16), NAMES[hero], font=font(28), fill=(240, 240, 240, 255))
    cells = [
        lambda cx: place(row, idle_tex, idle['frames'][0], idle['scale'], cx),
        lambda cx: place(row, hit_tex, hit, hit['scale'], cx),
        lambda cx: place(row, old_tex, old_frame, old_scale, cx),
        lambda cx: (place(row, idle_tex, idle['frames'][0], idle['scale'], cx, .35), place(row, hit_tex, hit, hit['scale'], cx)),
    ]
    for i, draw_cell in enumerate(cells):
        draw_cell(LABEL_W + i * CELL_W + CELL_W / 2)
    return row


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    hits = json.loads((ROOT / 'src/ui/hit-recoil-motion-data.json').read_text(encoding='utf-8'))['heroes']
    rows = [row_image(hero, hits) for hero in IDLE_DATA]
    sheet = Image.new('RGBA', (rows[0].width, HEADER + ROW_H * len(rows)), (30, 32, 40, 255))
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(COLUMNS):
        draw.text((LABEL_W + i * CELL_W + 10, 7), name, font=font(18), fill=(230, 230, 230, 255))
    for i, row in enumerate(rows):
        sheet.alpha_composite(row, (0, HEADER + i * ROW_H))
    out = Path(sys.argv[1])
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert('RGB').save(out)
    print(f'聯絡表：{out}')


if __name__ == '__main__':
    main()
