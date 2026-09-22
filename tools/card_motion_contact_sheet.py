"""出牌動作逐格圖的聯絡表（2026-09-22）。

跟待機狀態那支 `idle_state_contact_sheet.py` 同一個版面：每列＝「新版待機第 1 格」＋「新圖 8 格」，
全部換算成**遊戲裡的比例**（同一條腳底線、同一個縮放），灰色虛線是新版待機的頭頂高度。
輕功的騰空格照打包後的腳底定位畫，看得到跳起來的高度。
（過去的教訓：一張一張看看不出走鐘，要整批拼起來看。）

用法：
    python tools/card_motion_contact_sheet.py out.png --all
    python tools/card_motion_contact_sheet.py out.png qiuqiu/taiji feifei/roar@2     # @N＝看第 N 次嘗試
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from idle_state_contact_sheet import CELL_W, FOOT_Y, IDLE_DATA, K, LABEL_W, NAMES, font, place  # noqa: E402
from pack_card_motion import SOURCE, ArtError, check, load_config  # noqa: E402
from pack_idle_state_motion import ROOT  # noqa: E402

ROW_H = 230          # 比待機狀態那張高一點：輕功跳起來要有空間
FOOT = FOOT_Y + 30
ACTIONS = {'taiji': '太極', 'qinggong': '輕功', 'focus': '運氣（能力牌）', 'scroll': '翻卷軸（抽牌）', 'roar': '吼'}


def row_image(hero: str, action: str, path: Path | None) -> Image.Image:
    idle = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    idle_tex = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    spec = load_config()['heroes'][hero][action]
    path = path or SOURCE / hero / f'{action}.png'
    row = Image.new('RGBA', (LABEL_W + CELL_W * 9, ROW_H), (238, 238, 238, 255))
    draw = ImageDraw.Draw(row)
    for i in range(9):
        if i % 2 == 0:
            draw.rectangle((LABEL_W + i * CELL_W, 0, LABEL_W + (i + 1) * CELL_W - 1, ROW_H), fill=(226, 226, 226, 255))
    head = FOOT - 252 * K
    draw.line((LABEL_W, FOOT, row.width, FOOT), fill=(220, 60, 60, 255), width=1)
    for x in range(LABEL_W, row.width, 8):
        draw.line((x, head, x + 4, head), fill=(120, 120, 120, 255), width=1)
    draw.text((8, 12), NAMES[hero], font=font(26), fill=(30, 30, 30, 255))
    draw.text((8, 50), ACTIONS[action], font=font(19), fill=(30, 30, 30, 255))
    draw.text((8, 84), action + (f'  #{path.stem.rsplit("try", 1)[-1]}' if 'try' in path.stem else ''),
              font=font(15), fill=(90, 90, 90, 255))
    draw.text((8, 104), f'{sum(spec["times"])} 毫秒', font=font(14), fill=(90, 90, 90, 255))
    place(row, idle_tex, idle['frames'][0], idle['scale'], LABEL_W + CELL_W / 2, FOOT)
    draw.text((LABEL_W + 6, 4), '新版待機', font=font(14), fill=(60, 60, 60, 255))
    try:
        image, frames, _ = check(hero, action, path)
        verdict, color = '檢查通過', (0, 130, 0, 255)
    except ArtError as error:
        verdict, color = f'不合格：{str(error).split(": ", 1)[-1]}', (200, 0, 0, 255)
        from pack_idle_state_motion import index_sheet, tidy
        image = tidy(Image.open(path))
        try:
            frames = index_sheet(image, spec['times'], f'{hero}/{action}')
        except ArtError:
            draw.text((LABEL_W + CELL_W + 10, 80), verdict, font=font(16), fill=color)
            return row
    draw.text((8, 128), verdict[:9], font=font(14), fill=color)
    if len(verdict) > 9:
        draw.text((LABEL_W + CELL_W + 6, ROW_H - 20), verdict, font=font(13), fill=color)
    scale = 252 / frames[0]['rect'][3]
    for i, frame in enumerate(frames):
        place(row, image, frame, scale, LABEL_W + (i + 1.5) * CELL_W, FOOT)
        draw.text((LABEL_W + (i + 1) * CELL_W + 6, 4), str(i + 1), font=font(14), fill=(60, 60, 60, 255))
    return row


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('jobs', nargs='*')
    parser.add_argument('--all', action='store_true')
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
