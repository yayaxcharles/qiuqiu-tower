"""菲菲針招重畫（批次 ff2）的聯絡表：整批拼成一張看，單張看不出走鐘。

每套一列：新版待機第 1 格｜舊 8 格｜新 8 格，全部同一個比例尺（遊戲單位 × ZOOM）、同一條腳底線（紅線），
定位點在每格正中（淡灰直線）。每格底下印頭部倍率（待機＝1.00；舊的現場量、新的讀打包紀錄），
出手那一格框黃色，並標出飛針放出來的位置：舊 8 格是 09-20 那版的起點（空心紅圈：共用預設腳底右 82、上 118，
連針上下 ±12、針雨左 45 上 110、不要過來左 25），新 8 格是逐招量到的新起點（實心黃點）與手部範圍（青框，
`docs/feifei-needle-origins.json`）。

另出一張頭部並排（待機頭｜舊頭｜新頭，都取出手那一格前一格，同比例），只給自己看、不進版控。

用法：
    python tools/feifei_needle_redraw_sheet.py            # 舊版取 88c696b（重畫前）的資料與圖
    python tools/feifei_needle_redraw_sheet.py --old-rev <提交>
"""
from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_feifei_needle_redraw import ACTIONS  # noqa: E402
import pack_feifei_needle_redraw as P  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/審查報告/重畫_ff2_2026-09-22.png'
HEADS = ROOT / 'docs/審查報告/重畫頭部_ff2_2026-09-22.png'
ZOOM = 0.75
CELL_W, CELL_H, BASE = 300, 330, 300        # 遊戲單位
NAMES = {'needle_backhand': '反手針（手滑）', 'needle_barrage': '連環針（全撒了）', 'needle_combo': '連針',
         'needle_pierce': '穿刺針（一針斃命）', 'needle_rain': '針雨', 'needle_retreat': '撤步針（不要過來！）',
         'needle_venom': '毒針（見血封喉）'}
DEFAULT_ORIGIN = (82, -118)
OLD_SHIFT = {'needle_combo': [(0, -12), (0, 12)], 'needle_rain': [(-45, -110)], 'needle_retreat': [(-25, 0)]}
ORIGINS = ROOT / 'docs/feifei-needle-origins.json'


def font(size: int) -> ImageFont.FreeTypeFont:
    for name in ('msjh.ttc', 'msjhbd.ttc', 'mingliu.ttc'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def git_bytes(rev: str, path: str) -> bytes:
    return subprocess.run(['git', 'show', f'{rev}:{path}'], cwd=ROOT, capture_output=True, check=True).stdout


def frame_image(atlas: Image.Image, frame: dict, scale: float, k: float) -> tuple[Image.Image, float, float]:
    x, y, w, h = frame['rect']
    s = scale * k
    im = atlas.crop((x, y, x + w, y + h)).resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    return im, frame['pivot'][0] * s, frame['pivot'][1] * s


def release_frames(motion: dict) -> dict[int, int]:
    """出手那幾格 → 第幾波。"""
    starts, t = [], 0
    for f in motion['frames']:
        starts.append(round(t))
        t += f['duration'] * 1000
    return {starts.index(r): wave for wave, r in enumerate(motion['releaseTimes']) if r in starts}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--old-rev', default='88c696b')
    args = parser.parse_args()
    idle_data = json.loads(P.IDLE_DATA.read_text(encoding='utf-8'))['actions']['idle']
    idle_atlas = Image.open(ROOT / 'public' / idle_data['texture']).convert('RGBA')
    old_data = json.loads(git_bytes(args.old_rev, 'src/ui/feifei-needle-motion-data.json'))['actions']
    new_data = json.loads(P.DATA.read_text(encoding='utf-8'))['actions']
    record = {r['action']: r for r in json.loads(P.RECORD.read_text(encoding='utf-8'))['assets']}
    origins = json.loads(ORIGINS.read_text(encoding='utf-8'))['actions']
    idle = P.Idle()
    k = ZOOM
    cw, ch, base = round(CELL_W * k), round(CELL_H * k), round(BASE * k)
    label_h = 64
    cols = 17
    head_font, small = font(20), font(15)
    sheet = Image.new('RGBA', (cw * cols + 20, (ch + label_h) * len(ACTIONS) + 70), (40, 43, 52, 255))
    d = ImageDraw.Draw(sheet)
    d.text((12, 14), '菲菲針招重畫（ff2）：待機第 1 格｜舊 8 格（09-20，頭小腿長）｜新 8 格。同一比例尺、紅線＝腳底線、'
                     '黃框＝出手格、紅圈＝舊飛針起點、黃點＝新飛針起點（青框＝手部範圍）；數字＝頭部倍率（待機＝1.00）', fill=(235, 235, 235, 255), font=head_font)
    head_rows = []
    for r, action in enumerate(ACTIONS):
        top = 60 + r * (ch + label_h)
        old, new = old_data[action], new_data[action]
        old_atlas = Image.open(io.BytesIO(git_bytes(args.old_rev, f'public/{old["texture"]}'))).convert('RGBA')
        new_atlas = Image.open(ROOT / 'public' / new['texture']).convert('RGBA')
        old_heads = [h['head'] for h in P.measure_heads(idle, old_atlas, old['frames'], old['scale'])]
        new_heads = record[action]['headScales']
        d.line((0, top + base, sheet.width, top + base), fill=(200, 70, 70, 255), width=1)
        d.text((12, top + 4), NAMES[action], fill=(255, 255, 255, 255), font=head_font)
        cells = [('待機', idle_atlas, idle_data['frames'][0], idle_data['scale'], 1.0, None, None)]
        rel_old, rel_new = release_frames(old), release_frames(new)
        cells += [(f'舊{i + 1}', old_atlas, f, old['scale'], old_heads[i], rel_old.get(i), 'old') for i, f in enumerate(old['frames'])]
        cells += [(f'新{i + 1}', new_atlas, f, new['scale'], new_heads[i], rel_new.get(i), 'new') for i, f in enumerate(new['frames'])]
        for c, (tag, atlas, frame, scale, head, wave, kind) in enumerate(cells):
            gap = 10 if c >= 9 else 0
            x0 = 10 + c * cw + gap
            cx = x0 + cw / 2
            d.line((cx, top + 30, cx, top + base), fill=(70, 74, 86, 255))
            im, px, py = frame_image(atlas, frame, scale, k)
            sheet.alpha_composite(im, (round(cx - px), round(top + base - py)))
            if wave is not None:
                d.rectangle((x0 + 2, top + 28, x0 + cw - 3, top + ch - 2), outline=(240, 200, 40, 255), width=2)
                if kind == 'old':
                    shifts = OLD_SHIFT.get(action, [(0, 0)])
                    tx = DEFAULT_ORIGIN[0] + shifts[wave % len(shifts)][0]
                    ty = DEFAULT_ORIGIN[1] + shifts[wave % len(shifts)][1]
                    d.ellipse((cx + tx * k - 5, top + base + ty * k - 5, cx + tx * k + 5, top + base + ty * k + 5),
                              outline=(255, 90, 90, 255), width=2)
                else:
                    row = origins[action]['waves'][wave]
                    bx0, by0, bx1, by1 = row['handRange']
                    d.rectangle((cx + bx0 * k, top + base + by0 * k, cx + bx1 * k, top + base + by1 * k),
                                outline=(80, 220, 255, 255), width=1)
                    tx, ty = row['origin']
                    d.ellipse((cx + tx * k - 5, top + base + ty * k - 5, cx + tx * k + 5, top + base + ty * k + 5),
                              fill=(255, 220, 40, 255))
            bad = abs(head - 1) > P.HEAD_TOLERANCE
            d.text((x0 + 6, top + ch + 4), f'{tag} 頭 {head:.2f}', fill=(255, 120, 120, 255) if bad else (210, 230, 210, 255),
                   font=small)
        # 頭部並排：出手前一格
        pick = max(0, min(rel_new or {0: 0}) - 1)
        head_rows.append((action, (idle_atlas, idle_data['frames'][0], idle_data['scale']),
                          (old_atlas, old['frames'][pick], old['scale']), (new_atlas, new['frames'][pick], new['scale'])))
    sheet.convert('RGB').save(OUT, optimize=True)
    # 頭部並排圖（不進版控）
    hk = 2.0
    hw, hh = round(200 * hk), round(150 * hk)
    heads = Image.new('RGBA', (hw * 3 + 40, (hh + 40) * len(head_rows) + 50), (40, 43, 52, 255))
    hd = ImageDraw.Draw(heads)
    hd.text((10, 10), '頭部並排（同比例）：待機第 1 格｜舊（出手前一格）｜新（出手前一格）', fill=(235, 235, 235, 255), font=head_font)
    for r, (action, *items) in enumerate(head_rows):
        top = 50 + r * (hh + 40)
        hd.text((10, top), NAMES[action], fill=(255, 255, 255, 255), font=small)
        for c, (atlas, frame, scale) in enumerate(items):
            im, px, py = frame_image(atlas, frame, scale, hk)
            crop = im.crop((0, 0, im.width, min(im.height, round(im.height * 0.55))))
            heads.alpha_composite(crop, (10 + c * (hw + 10), top + 24))
    heads.convert('RGB').save(HEADS)
    print(OUT, sheet.size)
    print(HEADS, heads.size)


if __name__ == '__main__':
    main()
