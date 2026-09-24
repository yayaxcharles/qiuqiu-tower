"""開局祝福（包袱裡的四樣）卡片外框（2026-09-24 晚）。

使用者：「一開始的 4 選 1 我很喜歡，但是它就是用黃色框框顯示而已，用生圖設計比較好的框讓他更好看，不然有點醜」。
原本四張借罐頭鋪的 `.shop-item`：米白底＋細黃邊。改成一張生出來的框，用 `border-image` 九宮格套上去
（跟對白名牌、意圖木牌同一套：四個角固定，四條邊與中間拉伸），所以四條邊要**粗細一致、沒有花樣**，花樣只放四個角。

生圖後端同事件圖（gpt-image-1.5、codex-oauth、真透明）。每一次存成 `tools/motion-art-source/bless_frame/frame.try<N>.png`，
挑定後 `pick <N>`：去掉四周透明、縮成 512×512、存 `public/assets/icons/ui_blessframe.webp`。

用法：
    python tools/gen_bless_frame.py gen 3          # 生三次
    python tools/gen_bless_frame.py pick 2         # 採用第 2 次
"""
from __future__ import annotations

import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_content_batch1_art as c1  # noqa: E402

ROOT = c1.ROOT
SOURCE = ROOT / 'tools/motion-art-source/bless_frame'
TARGET = ROOT / 'public/assets/icons/ui_blessframe.webp'

PROMPT = (
    'A decorative CARD FRAME for a cute cartoon cat-ninja card game, drawn perfectly straight-on (no perspective), '
    'as a square filling the whole image with a small margin. It frames one item the hero finds in his master\'s '
    'old blue cloth bundle at the tower door.\n'
    'The frame: a border of carved dark walnut wood, the SAME even thickness all the way round (about 7% of the '
    'image width), with a thin bright brass inlay line running along its inner edge. At each of the four corners '
    'sits a small brass corner fitting shaped like a rounded cloud curl with a tiny cat-paw print stamped in it; '
    'the four corners are mirror images of each other. The long straight stretches of the border between the '
    'corners are completely plain wood with a smooth horizontal (on the top and bottom) or vertical (on the sides) '
    'grain - NO ornaments, knots, rivets or patterns in the middle of any side, because the game stretches those '
    'stretches to fit different card sizes.\n'
    'Inside the frame: a panel of warm cream washi paper with a very subtle soft fibre texture and a gentle warm '
    'vignette toward the edges. The paper is completely plain and empty - the game writes the item name, picture '
    'and effect on top of it.\n'
    'Everything is SOLID and OPAQUE; only the area OUTSIDE the square frame is transparent.\n'
    'Style: thick dark outlines, flat colours with soft cel shading, warm and slightly worn, hand-made - matching '
    'a cosy cartoon game, never sleek, metallic-chrome or modern. Bold enough to still read when shrunk to 200 '
    'pixels: no hairline detail.\n'
    'Absolutely NO text, letters, numbers, symbols or watermark anywhere.'
)


def gen_one(attempt: int) -> str:
    out = SOURCE / f'frame.try{attempt}.png'
    cmd = [sys.executable, str(c1.IMAGE_GEN), 'generate', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
           '--background', 'transparent', '--size', '1024x1024', '--quality', 'high', '--prompt', PROMPT,
           '--out', str(out), '--force']
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return f'第 {attempt} 次：' + ('ok' if r.returncode == 0 and out.exists() else f'失敗 {r.stderr.strip()[-300:]}')


def gen(n: int) -> None:
    SOURCE.mkdir(parents=True, exist_ok=True)
    start = 1
    while (SOURCE / f'frame.try{start}.png').exists():
        start += 1
    with ThreadPoolExecutor(max_workers=n) as ex:
        for line in ex.map(gen_one, range(start, start + n)):
            print(line, flush=True)


def pick(attempt: int) -> None:
    im = Image.open(SOURCE / f'frame.try{attempt}.png').convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    im = im.crop(bbox).resize((512, 512), Image.LANCZOS)
    im.save(TARGET, 'WEBP', quality=88, method=6)
    print(f'採用第 {attempt} 次 → {TARGET.relative_to(ROOT).as_posix()}（{TARGET.stat().st_size} 位元組，裁切範圍 {bbox}）')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    cmd, arg = sys.argv[1], int(sys.argv[2])
    gen(arg) if cmd == 'gen' else pick(arg)
