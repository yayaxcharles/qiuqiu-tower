"""封面「參上」貼圖的英日版（2026-09-29 多語系第二片）。

四張 `hero/*cover.webp` 是分層拼出來的（`tools/gen_cover_art.py`）：題字、底線、速度線一層，煙塵＋貓一層。
這支把題字層裡**米白色的字**拿掉，留下黃色底線與速度線，照語言重新寫字，疊回本體，存成
`hero/<鍵>_en.webp`、`hero/<鍵>_ja.webp`。貓與煙塵一個像素都不動（畫面比對閘門的「角色大小」照舊）。

字：英文 "HERE I AM!"（Arial Rounded MT Bold），日文「参上」（新字體；Yu Gothic Bold，描同色邊加粗），
顏色取原本字的米白、跟原字一樣微微往右上斜，放在原本字的外框裡（寬高都不超過原字）。

用法：python tools/gen_cover_i18n.py            # 寫檔＋拼一張對照表到 docs/審查報告/
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_screen_art import split_cover  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
HERO_DIR = ROOT / 'public/assets/sprites/hero'
KEYS = ['cover', 'feifei_cover', 'dangdang_cover', 'fengfeng_cover']
FONTS = {'en': 'C:/Windows/Fonts/ARLRDBD.TTF', 'ja': 'C:/Windows/Fonts/YuGothB.ttc'}
TEXT = {'en': ['HERE', 'I AM!'], 'ja': ['参上']}
SHEET = ROOT / 'docs/審查報告/封面參上_英日版_2026-09-29.png'


def cream_mask(a: np.ndarray) -> np.ndarray:
    """題字層裡米白色的字（黃色底線、速度線不算）"""
    r, g, b, al = (a[..., c].astype(int) for c in range(4))
    return (al > 8) & (b > 150) & (r > 170) & (g > 160)


def render(lang: str, box: tuple[int, int, int, int], color: tuple[int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    lines = TEXT[lang]
    # 字級從大往小試，整塊放得進原字外框為止
    for size in range(160, 20, -2):
        font = ImageFont.truetype(FONTS[lang], size)
        gap = int(size * 0.05)
        sw = max(1, size // (40 if lang == 'ja' else 30))   # 描一圈同色的邊把筆畫加粗，比較像原本的毛筆字
        boxes = [font.getbbox(s, stroke_width=sw) for s in lines]
        tw = max(b[2] - b[0] for b in boxes)
        th = sum(b[3] - b[1] for b in boxes) + gap * (len(lines) - 1)
        if tw <= w * 0.98 and th <= h * 0.94:
            break
    layer = Image.new('RGBA', (w + 40, h + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    y = (layer.height - th) // 2
    for s, b in zip(lines, boxes):
        lw = b[2] - b[0]
        d.text(((layer.width - lw) // 2 - b[0], y - b[1]), s, font=font, fill=color + (255,), stroke_width=sw, stroke_fill=color + (255,))
        y += (b[3] - b[1]) + gap
    layer = layer.rotate(4, resample=Image.BICUBIC, expand=False)   # 跟原字一樣微微往右上斜
    out = Image.new('RGBA', (560, 560), (0, 0, 0, 0))
    out.alpha_composite(layer, (x0 - 20, y0 - 20))
    return out


def build(key: str, lang: str) -> Image.Image:
    src = Image.open(HERO_DIR / f'{key}.webp').convert('RGBA')
    title, body = split_cover(src)
    a = np.array(title)
    glyph = cream_mask(a)
    ys, xs = np.nonzero(glyph)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    color = tuple(int(np.median(a[..., c][glyph])) for c in range(3))
    a[glyph, 3] = 0
    out = Image.fromarray(a, 'RGBA')
    out.alpha_composite(body)
    out.alpha_composite(render(lang, box, color))
    return out


def main() -> None:
    tiles = []
    for key in KEYS:
        row = [Image.open(HERO_DIR / f'{key}.webp').convert('RGBA')]
        for lang in ('en', 'ja'):
            img = build(key, lang)
            img.save(HERO_DIR / f'{key}_{lang}.webp', 'WEBP', quality=86, method=6)
            row.append(img)
            print(key, lang, (HERO_DIR / f'{key}_{lang}.webp').stat().st_size // 1024, 'KB')
        tiles.append(row)
    sheet = Image.new('RGBA', (560 * 3, 560 * len(tiles)), (38, 48, 88, 255))
    for r, row in enumerate(tiles):
        for c, img in enumerate(row):
            sheet.alpha_composite(img, (560 * c, 560 * r))
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert('RGB').resize((840, 280 * len(tiles))).save(SHEET)
    print('sheet', SHEET)


if __name__ == '__main__':
    main()
