"""待機狀態逐格圖的聯絡表（2026-09-21）。

每列＝「新版待機第 1 格」＋「新圖 8 格」，全部換算成**遊戲裡的比例**（同一條腳底線、同一個縮放），
灰色虛線是新版待機的頭頂高度——身高有沒有跑掉、腳底有沒有浮起來、畫風有沒有走鐘，排在一起一眼看得出來。
（過去的教訓：一張一張看看不出走鐘，要整批拼起來看。）

用法：
    python tools/idle_state_contact_sheet.py out.png qiuqiu/wounded feifei/wounded ...
    python tools/idle_state_contact_sheet.py out.png --all
    python tools/idle_state_contact_sheet.py out.png feifei/wounded@2 dangdang/curl@1     # 看還沒選定的第 N 次嘗試
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_idle_state_motion import ROOT, SOURCE, ArtError, index_sheet, load_config, quality, tidy  # noqa: E402

IDLE_DATA = {
    'qiuqiu': 'src/ui/qiuqiu-motion-data.json',
    'feifei': 'src/ui/feifei-motion-data.json',
    'dangdang': 'src/ui/dangdang-motion-data.json',
    'fengfeng': 'src/ui/fengfeng-motion-data.json',
}
NAMES = {'qiuqiu': '球球', 'feifei': '菲菲', 'dangdang': '噹噹', 'fengfeng': '封封'}
STATES = {'wounded': '掛彩', 'power': '氣勢', 'hungry': '肚子餓', 'dizzy': '定身', 'lazy': '懶洋洋',
          'iron': '鐵布衫', 'curl': '蜷縮', 'belly': '翻肚', 'stealth': '隱身', 'puff': '炸毛'}
K = .56            # 遊戲單位 → 聯絡表像素（252 單位的待機約 141 像素高）
CELL_W = 170
ROW_H = 200
LABEL_W = 120
FOOT_Y = 178


def font(size: int) -> ImageFont.FreeTypeFont:
    for name in ('msjh.ttc', 'msjhbd.ttc', 'mingliu.ttc'):
        try:
            return ImageFont.truetype(f'C:/Windows/Fonts/{name}', size)
        except OSError:
            continue
    return ImageFont.load_default()


def place(canvas: Image.Image, texture: Image.Image, frame: dict, scale: float, cx: float, foot: float) -> None:
    x, y, w, h = frame['rect']
    k = scale * K
    crop = texture.crop((x, y, x + w, y + h)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    canvas.alpha_composite(crop, (round(cx - frame['pivot'][0] * k), round(foot - frame['pivot'][1] * k)))


def row_image(hero: str, action: str, path: Path | None) -> Image.Image:
    idle = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    idle_tex = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    spec = load_config()['heroes'][hero][action]
    path = path or SOURCE / hero / f'{action}.png'
    image = tidy(Image.open(path))
    row = Image.new('RGBA', (LABEL_W + CELL_W * 9, ROW_H), (238, 238, 238, 255))
    draw = ImageDraw.Draw(row)
    for i in range(9):
        if i % 2 == 0:
            draw.rectangle((LABEL_W + i * CELL_W, 0, LABEL_W + (i + 1) * CELL_W - 1, ROW_H), fill=(226, 226, 226, 255))
    head = FOOT_Y - 252 * K
    draw.line((LABEL_W, FOOT_Y, row.width, FOOT_Y), fill=(220, 60, 60, 255), width=1)
    for x in range(LABEL_W, row.width, 8):
        draw.line((x, head, x + 4, head), fill=(120, 120, 120, 255), width=1)
    draw.text((8, 12), NAMES[hero], font=font(26), fill=(30, 30, 30, 255))
    draw.text((8, 50), STATES[action], font=font(22), fill=(30, 30, 30, 255))
    draw.text((8, 84), action + (f'  #{path.stem.rsplit("try", 1)[-1]}' if path and 'try' in path.stem else ''),
              font=font(15), fill=(90, 90, 90, 255))
    place(row, idle_tex, idle['frames'][0], idle['scale'], LABEL_W + CELL_W / 2, FOOT_Y)
    draw.text((LABEL_W + 6, 4), '新版待機', font=font(14), fill=(60, 60, 60, 255))
    try:
        frames = index_sheet(image, spec['times'], f'{hero}/{action}')
    except ArtError as error:
        draw.text((LABEL_W + CELL_W + 10, 80), f'切格失敗：{error}', font=font(16), fill=(200, 0, 0, 255))
        return row
    scale = 252 / frames[0]['rect'][3]
    try:
        quality(hero, action, image, frames)
        verdict, color = '檢查通過', (0, 130, 0, 255)
    except ArtError as error:
        verdict, color = f'不合格：{str(error).split(": ", 1)[-1]}', (200, 0, 0, 255)
    draw.text((8, 110), verdict[:9], font=font(14), fill=color)
    if len(verdict) > 9:
        draw.text((LABEL_W + CELL_W + 6, ROW_H - 20), verdict, font=font(13), fill=color)
    for i, frame in enumerate(frames):
        cx = LABEL_W + (i + 1.5) * CELL_W
        place(row, image, frame, scale, cx, FOOT_Y)
        draw.text((LABEL_W + (i + 1) * CELL_W + 6, 4), str(i + 1), font=font(14), fill=(60, 60, 60, 255))
    x8 = LABEL_W + 8 * CELL_W
    draw.rectangle((x8 + 1, 1, x8 + CELL_W - 2, ROW_H - 2), outline=(40, 120, 220, 255), width=2)
    return row


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('jobs', nargs='*')
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--path', help='只有一列時：改看這個檔')
    parser.add_argument('--title', default='')
    args = parser.parse_args()
    jobs = args.jobs
    if args.all:
        jobs = [f'{h}/{a}' for h, acts in load_config()['heroes'].items() for a in acts
                if (SOURCE / h / f'{a}.png').exists()]
    rows = []
    for job in jobs:
        name, _, attempt = job.partition('@')
        hero, action = name.split('/', 1)
        path = SOURCE / hero / f'{action}.try{attempt}.png' if attempt else None
        if args.path and len(jobs) == 1:
            path = Path(args.path)
        rows.append(row_image(hero, action, path))
    top = 40 if args.title else 0
    sheet = Image.new('RGB', (rows[0].width, top + ROW_H * len(rows)), (255, 255, 255))
    if args.title:
        ImageDraw.Draw(sheet).text((10, 6), args.title, font=font(24), fill=(20, 20, 20))
    for i, row in enumerate(rows):
        sheet.paste(row.convert('RGB'), (0, top + i * ROW_H))
        ImageDraw.Draw(sheet).line((0, top + (i + 1) * ROW_H - 1, sheet.width, top + (i + 1) * ROW_H - 1), fill=(180, 180, 180))
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out)
    print(args.out)


if __name__ == '__main__':
    main()
