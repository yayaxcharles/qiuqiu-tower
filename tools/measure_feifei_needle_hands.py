"""量菲菲每一招「出手那一格」的手在哪裡，定飛針放出去的位置（2026-09-22，批次 ff2）。

背景：飛針的起點原本全部共用一組（腳底定位點往右 82、往上 118 遊戲單位，`combat.ts` 的 throwFrom），
再加三招的小偏移（連針上下 ±12、針雨左 45 上 110、不要過來左 25）。09-22 七套針招與丟針重畫之後，
出手的手伸得比較遠、高度也不一樣，飛針剛冒出來那一格會出現在手腕、胸口甚至臉上。

做法：每一招、每一波，在出手那一格（出手時間那一格的開頭）裡，用人工框的「搜尋範圍」（`SEARCH`，
從格線圖目測訂的，只是指出是哪一隻手）找手：見 `measure_hand`。一隻手出手的招，起點＝手掌那一截的重心；兩隻手一起出手的招（不要過來、針雨、全撒了），
起點＝兩隻手掌中心的中點，手部範圍＝兩隻手掌外框的聯集（全撒了的針網一出手就上下張開 110 單位，
正好從上下兩隻手之間撒出去）。針雨雖然也是兩手，但兩手分開 120 單位、中點在頭頂上方的空中，
所以只取靠近敵人的那隻（右手），飛針才看得出是從手上拋出去的。

座標一律是「相對腳底定位點的遊戲單位」：x 往右為正、y 往上為負。遊戲裡逐格畫布以 252 單位＝252 舞台像素畫，
所以這就是舞台座標的位移。

寫出 `docs/feifei-needle-origins.json`（每招每波的出手格、手部外框、起點、圖集雜湊）；
程式裡的起點表在 `src/ui/feifei-needle-patterns.ts`（手抄過去、取整數），測試
`tests/ui/feifei_needle_origins.test.ts` 核對兩邊一致、起點落在手部範圍內、圖集沒換過。

用法：
    python tools/measure_feifei_needle_hands.py                 # 量、寫紀錄、印出程式要用的起點表
    python tools/measure_feifei_needle_hands.py --overlay 圖檔   # 另外畫一張每招出手格＋手部框＋新舊起點的檢查圖
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'src/ui/feifei-motion-data.json'
NEEDLE = ROOT / 'src/ui/feifei-needle-motion-data.json'
RECORD = ROOT / 'docs/feifei-needle-origins.json'
DEFAULT_ORIGIN = (82, -118)
PALM = 24                      # 手掌加手指大約多長（遊戲單位）：起點取手最前端這一截的重心
UPWARD = {'needle_rain'}       # 往上拋的招：手的「最前端」是最上面
# 舊版（09-20）各招對共用預設的偏移，只拿來在檢查圖上畫舊起點
OLD_SHIFT = {'needle_combo': [(0, -12), (0, 12)], 'needle_rain': [(-45, -110)], 'needle_retreat': [(-25, 0)]}

# 每招每波：出手時間（素材原速毫秒）與手的搜尋範圍（遊戲單位，x0, x1, y0, y1；一波可以有兩隻手）
SEARCH: dict[str, list[tuple[int, list[tuple[int, int, int, int]]]]] = {
    'shuriken': [(285, [(98, 180, -155, -95)])],
    'storm': [(285, [(88, 150, -150, -95)]), (385, [(80, 150, -150, -95)])],
    'needle_fan': [(285, [(88, 150, -150, -95)])],
    'needle_combo': [(220, [(110, 150, -140, -86)]), (380, [(112, 180, -195, -125)])],
    'needle_backhand': [(260, [(105, 180, -165, -95)])],
    'needle_venom': [(360, [(112, 180, -160, -105)])],
    'needle_pierce': [(420, [(132, 200, -155, -95)])],
    'needle_retreat': [(260, [(150, 172, -160, -116), (92, 128, -158, -102)])],
    'needle_rain': [(350, [(84, 124, -270, -208)])],
    'needle_barrage': [(350, [(108, 180, -205, -140), (95, 170, -95, -30)])],
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def motions() -> dict:
    main = json.loads(MAIN.read_text(encoding='utf-8'))['actions']
    needle = json.loads(NEEDLE.read_text(encoding='utf-8'))['actions']
    return {**main, **needle}


def frame_at(motion: dict, release: int) -> int:
    t = 0
    for i, frame in enumerate(motion['frames']):
        if round(t) == release:
            return i
        t += frame['duration'] * 1000
    raise SystemExit(f'{motion["texture"]}: 出手時間 {release} 不在任何一格的開頭')


def paw_mask(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """手掌：棕色毛（暗、偏紅黃、有飽和度）或粉紅肉球；黑色描邊與米白毛不算。"""
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    brown = (alpha > 200) & (r >= g) & (g >= b - 6) & (mx >= 45) & (mx <= 170) & (mx - mn >= 22)
    pink = (alpha > 200) & (r > 190) & (g > 110) & (g < 185) & (b > 100) & (r - g > 40)
    return brown | pink


def measure_hand(atlas: Image.Image, motion: dict, index: int, box: tuple[int, int, int, int], up: bool) -> dict:
    """一隻手：先在整格裡把手掌色（棕色手套＋肉球）切成一塊一塊（黑色描邊會把它們隔開），挑跟搜尋範圍重疊最多的那塊，
    （菲菲是暹羅貓，棕色從手掌一路到前臂，這塊是整隻「手套」，外框記在 `glove`）。
    「手部範圍」只取這塊最前端 PALM 單位（往右丟的招看最右邊、往上拋的看最上面），也就是手掌與手指那一截，
    外框記在 `box`、重心記在 `palm`——前臂斜斜的，整隻手套的外框會把手腕、手肘旁邊的空白也框進來，太鬆。"""
    frame = motion['frames'][index]
    x, y, w, h = frame['rect']
    s = motion['scale']
    px, py = frame['pivot']
    crop = np.array(atlas.crop((x, y, x + w, y + h)))
    ys, xs = np.mgrid[0:h, 0:w]
    ux, uy = (xs - px) * s, (ys - py) * s
    x0, x1, y0, y1 = box
    inside = (ux >= x0) & (ux <= x1) & (uy >= y0) & (uy <= y1)
    mask = paw_mask(crop[..., :3], crop[..., 3])
    labels, count = ndimage.label(mask)
    overlap = ndimage.sum(inside, labels, range(1, count + 1)) if count else np.array([0])
    if not count or overlap.max() == 0:
        raise SystemExit(f'{motion["texture"]} 第 {index + 1} 格：搜尋範圍 {box} 裡找不到手掌')
    paw = labels == int(np.argmax(overlap)) + 1
    pu, pv = ux[paw], uy[paw]
    area = float(paw.sum()) * s * s
    bbox = [round(float(pu.min()), 1), round(float(pv.min()), 1), round(float(pu.max()), 1), round(float(pv.max()), 1)]
    if area < 150 or area > 2600 or bbox[2] - bbox[0] > 80 or bbox[3] - bbox[1] > 80:
        raise SystemExit(f'{motion["texture"]} 第 {index + 1} 格：挑到的那塊（外框 {bbox}、{area:.0f} 平方單位）不像一隻手，'
                         '多半是連到頭髮、臉或尾巴了')
    reach = -pv if up else pu
    palm = reach >= reach.max() - PALM
    qu, qv = pu[palm], pv[palm]
    return {'box': [round(float(qu.min()), 1), round(float(qv.min()), 1), round(float(qu.max()), 1), round(float(qv.max()), 1)],
            'palm': [round(float(qu.mean()), 1), round(float(qv.mean()), 1)], 'glove': bbox, 'areaUnits2': round(area)}


def measure() -> dict:
    data = motions()
    actions = {}
    for action, waves in SEARCH.items():
        motion = data[action]
        atlas = Image.open(ROOT / 'public' / motion['texture']).convert('RGBA')
        rows = []
        for wave, (release, boxes) in enumerate(waves):
            index = frame_at(motion, release)
            hands = [measure_hand(atlas, motion, index, box, action in UPWARD) for box in boxes]
            cx = sum(h['palm'][0] for h in hands) / len(hands)
            cy = sum(h['palm'][1] for h in hands) / len(hands)
            reach = [min(h['box'][0] for h in hands), min(h['box'][1] for h in hands),
                     max(h['box'][2] for h in hands), max(h['box'][3] for h in hands)]
            rows.append({'wave': wave, 'release': release, 'frame': index + 1, 'hands': hands, 'handRange': reach,
                         'origin': [round(cx), round(cy)]})
        actions[action] = {'texture': motion['texture'], 'textureSha256': sha(ROOT / 'public' / motion['texture']),
                           'waves': rows}
    return {'note': '菲菲飛針起點（相對腳底定位點的遊戲單位，x 往右、y 往上為負）。由 tools/measure_feifei_needle_hands.py 產生；'
                    '程式裡的表在 src/ui/feifei-needle-patterns.ts。',
            'defaultOrigin': list(DEFAULT_ORIGIN), 'actions': actions}


def overlay(record: dict, out: Path) -> None:
    data = motions()
    z = 2.0
    font = ImageFont.truetype('msjh.ttc', 15)
    tiles = []
    for action, info in record['actions'].items():
        motion = data[action]
        atlas = Image.open(ROOT / 'public' / motion['texture']).convert('RGBA')
        for row in info['waves']:
            frame = motion['frames'][row['frame'] - 1]
            x, y, w, h = frame['rect']
            s = motion['scale'] * z
            im = atlas.crop((x, y, x + w, y + h)).resize((round(w * s), round(h * s)), Image.LANCZOS)
            W, H = round(330 * z), round(300 * z)
            fx, fy = round(130 * z), round(282 * z)
            tile = Image.new('RGBA', (W, H), (46, 50, 60, 255))
            d = ImageDraw.Draw(tile)
            tile.alpha_composite(im, (round(fx - frame['pivot'][0] * s), round(fy - frame['pivot'][1] * s)))
            for hand in row['hands']:
                bx0, by0, bx1, by1 = hand['box']
                d.rectangle((fx + bx0 * z, fy + by0 * z, fx + bx1 * z, fy + by1 * z), outline=(80, 220, 255, 255), width=2)
            shifts = OLD_SHIFT.get(action, [(0, 0)])
            ox = DEFAULT_ORIGIN[0] + shifts[row['wave'] % len(shifts)][0]
            oy = DEFAULT_ORIGIN[1] + shifts[row['wave'] % len(shifts)][1]
            d.ellipse((fx + ox * z - 6, fy + oy * z - 6, fx + ox * z + 6, fy + oy * z + 6), outline=(255, 90, 90, 255), width=3)
            nx, ny = row['origin']
            d.ellipse((fx + nx * z - 6, fy + ny * z - 6, fx + nx * z + 6, fy + ny * z + 6), fill=(255, 220, 40, 255))
            d.text((6, 6), f'{action} 第 {row["wave"] + 1} 波（第 {row["frame"]} 格）  舊 ({ox},{oy}) → 新 ({nx},{ny})',
                   fill=(255, 255, 255, 255), font=font)
            tiles.append(tile)
    cols = 4
    W, H = tiles[0].size
    sheet = Image.new('RGB', (W * cols, H * ((len(tiles) + cols - 1) // cols)), (20, 20, 24))
    for k, tile in enumerate(tiles):
        sheet.paste(tile.convert('RGB'), ((k % cols) * W, (k // cols) * H))
    sheet.save(out)
    print(out, sheet.size)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--overlay', help='另外畫一張檢查圖到這個路徑')
    args = parser.parse_args()
    record = measure()
    RECORD.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for action, info in record['actions'].items():
        print(f"  {action}: [{', '.join('{ x: %d, y: %d }' % tuple(r['origin']) for r in info['waves'])}],")
    if args.overlay:
        overlay(record, Path(args.overlay))


if __name__ == '__main__':
    main()
