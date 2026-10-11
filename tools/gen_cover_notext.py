"""封面四隻貓拿掉「參上」題字（2026-10-11 使用者：「標題的 4 個角色上方的字『參上』感覺都可以移除了」）。

用 `gen_screen_art.split_cover` 把題字層（米白色的字＋黃色底線＋速度線）整層拿掉，只留煙塵＋貓；
貓與煙塵一個像素都不動，畫布大小不變（畫面比對閘門的「角色大小」照舊）。
沒字之後不分語言，中、英、日三個檔寫成同一張（程式照語言挑檔的那段不用動）。原檔先備份到 `tools/cover_backup_20261011/`。

用法：python tools/gen_cover_notext.py
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_screen_art import split_cover  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
HERO_DIR = ROOT / 'public/assets/sprites/hero'
BACKUP = ROOT / 'tools/cover_backup_20261011'
KEYS = ['feifei_cover', 'cover', 'dangdang_cover', 'fengfeng_cover']
SHEET = ROOT / 'docs/審查報告/封面拿掉參上_2026-10-11.png'


def main() -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    tiles = []
    for key in KEYS:
        src = HERO_DIR / f'{key}.webp'
        for name in (f'{key}.webp', f'{key}_en.webp', f'{key}_ja.webp'):
            if not (BACKUP / name).exists():
                shutil.copy2(HERO_DIR / name, BACKUP / name)
        orig = Image.open(BACKUP / f'{key}.webp').convert('RGBA')
        _, body = split_cover(orig)
        for name in (f'{key}.webp', f'{key}_en.webp', f'{key}_ja.webp'):
            body.save(HERO_DIR / name, 'WEBP', quality=86, method=6)
        print(key, src.stat().st_size // 1024, 'KB')
        tiles.append((orig, body))
    w, h = tiles[0][0].size
    sheet = Image.new('RGBA', (w * len(tiles), h * 2), (38, 48, 88, 255))
    for c, (orig, body) in enumerate(tiles):
        sheet.alpha_composite(orig, (w * c, 0))
        sheet.alpha_composite(body, (w * c, h))
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert('RGB').resize((w * len(tiles) // 2, h)).save(SHEET)
    print('sheet', SHEET)


if __name__ == '__main__':
    main()
