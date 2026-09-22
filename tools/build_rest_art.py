"""批次 rest（2026-09-22）：貓窩立繪、地圖小頭像、噹噹「銅護臂」圖示換新版畫風，外加封封幾張插圖去殘渣。

**這支只算不生**（生圖在 `tools/gen_rest_art.py`）。所有圖先在記憶體裡算好、全部過閘門才一起寫檔；
任何一張不合格就整批停下、一個檔都不寫（`GateError`），不是只印出來。

一、貓窩立繪（`public/assets/sprites/hero/<代號>_<姿勢>.webp`，畫布照舊：560×547，封封 560×560）
  - 蜷縮（進貓窩時那張）與倒地（連線時自己倒下）：**不生圖**，直接取新版逐格動作的那一格
   （蜷縮＝`curl` 停住的第 8 格、倒地＝`defeat` 最後一格），照戰鬥裡的比例放進畫布。
    跟 `make_dialogue_portraits.py` 同一個道理：那就是新版畫風本身，不會畫走樣。
  - 打盹、磨爪、扶同伴：用生好的圖（`picks.json` 選定那一次），**照頭的大小縮放**——
    拿新版待機第 1 格的頭當樣板（`head_fit` 同一套量法），量出生圖裡的頭比待機大多少，
    縮到頭一樣大；再量一次確認差 ±6% 內。
  - 顯示比例：貓窩的立繪框寬 300、畫布寬 560（`screens.css` 的 `.scene .scene-portrait` 與
    `max-width: 300px`），所以 1 個畫布像素＝300/560 舞台像素；戰鬥裡的新版動作是 1 遊戲單位＝1 舞台像素。
    兩邊換算到同一個比例，頭一樣大＝同一隻貓在兩個畫面一樣大。
  - 位置：外框左右置中在 x＝280、底邊對齊舊蜷縮圖的底邊（樣式表的座標是照那張對的，見 `FOOT`）。

二、地圖小頭像（`public/assets/icons/map_hero_*.webp`，畫布照舊：球球 96、其他 128）
  - 不生圖：第一關＝待機第 1 格、第二關＝格擋（`guard` 最後一格）、第三關＝氣勢（`power` 最後一格），
    「一路往上越來越戒備」照 `map.ts` 的原意。
  - 十二顆**同一個比例**（遊戲單位→畫布像素），球球的畫布小一號就再乘 96/128，
    在地圖上（框 52×52）四隻三關看起來一樣大。氣勢那格旁邊的小墨線在 52 像素下只剩一兩個點，
    看起來像髒東西，所以只留跟身體連著的那一塊。

三、噹噹起始秘寶「銅護臂」圖示（`public/assets/icons/relic_copper_bracer.webp`，128×128，同其他秘寶）

四、封封插圖去殘渣（`CLEANUP`）：只把**指定框裡、跟主體分開的碎片**的透明度歸零。
    做法是換掉 WebP 檔裡的透明度區塊（ALPH），顏色區塊（VP8）一個位元組都不動，
    所以圖的其他地方跟原檔完全一樣；寫完再解一次，確認只有那些碎片變透明。

用法：
    python tools/build_rest_art.py            # 算＋閘門，全過才寫檔與紀錄
    python tools/build_rest_art.py --dry-run  # 只算與閘門，不寫
    python tools/build_rest_art.py --sheet    # 另外拼聯絡表 docs/審查報告/換新畫風_rest_2026-09-22.png
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/rest'
PICKS = SOURCE / 'picks.json'
RECORD = SOURCE / 'record.json'
SHEET_OUT = ROOT / 'docs/審查報告/換新畫風_rest_2026-09-22.png'
HEROES = ['qiuqiu', 'feifei', 'dangdang', 'fengfeng']
SPRITE_KEY = {'qiuqiu': 'ninja', 'feifei': 'feifei', 'dangdang': 'dangdang', 'fengfeng': 'fengfeng'}
MOTION_FILES = {
    'qiuqiu': ['qiuqiu-motion-data', 'qiuqiu-extra-motion-data', 'qiuqiu-attack-motion-data'],
    'feifei': ['feifei-motion-data', 'feifei-needle-motion-data'],
    'dangdang': ['dangdang-motion-data', 'dangdang-attack-motion-data'],
    'fengfeng': ['fengfeng-motion-data', 'fengfeng-attack-motion-data'],
}
REST_SCALE = 300 / 560          # 貓窩：1 畫布像素＝0.5357 舞台像素
CANVAS = {'qiuqiu': (560, 547), 'feifei': (560, 547), 'dangdang': (560, 547), 'fengfeng': (560, 560)}
FOOT = {'qiuqiu': 540, 'feifei': 542, 'dangdang': 542, 'fengfeng': 539}   # 舊蜷縮圖的底邊（alpha>16 最下面那一列）
CENTER_X = 280
REST_POSES = ['curl', 'nap', 'sharpen', 'helpup', 'down']
GENERATED = ['nap', 'sharpen', 'helpup']
FROM_MOTION = {'curl': ('curl', 7), 'down': ('defeat', -1)}
# 倒地那一格球球、噹噹、封封是頭朝左躺，舊圖四隻都是頭朝右（臉朝畫面中間）：這三張左右翻過來（面向閘門）
MIRROR = {('qiuqiu', 'down'), ('dangdang', 'down'), ('fengfeng', 'down')}
# 生圖裡允許的「分開的道具」塊數（磨刀石；噹噹調護臂沒有道具）
PROPS = {'sharpen': 1}
MAP_TIER = {'low': ('idle', 0), 'mid': ('guard', -1), 'top': ('power', -1)}
HEAD_CUT = {'qiuqiu': .47, 'feifei': .52, 'dangdang': .45, 'fengfeng': .47}   # 同 head_fit.py
HEAD_TOL = .06
HEAD_MIN_CORR = .80             # 相關低於這個＝量不準，要在 picks.json 標 "headCheck": "eye"（改用人眼並排）
QUALITY = 82                    # 同 add_sprite.py 的立繪品質；透明度一律無損（alpha_quality=100）
MAP_QUALITY = 80                # 同 add_icons.py 的圖示品質
MARGIN = 6
# 「舊圖」一律從這筆提交取（＝換圖前的線上版），重跑不會把已經換過的新圖當成舊圖
BASE_COMMIT = 'a4e6d19'

# 封封插圖的殘渣：檔案 → 要清的框（x0, y0, x1, y1，含邊界）。框裡「不是主體」的連通塊才清。
# 框是 2026-09-22 逐張放大看過定的（盤點報告第 8 項）；event_blocked_r0 那幾塊是握拳的使勁符號
# 與尾巴甩動線，是畫的一部分，不清。
CLEANUP = {
    'public/assets/bg/event_fengfeng_chest_closed.webp': [(8, 170, 30, 370)],
    'public/assets/bg/event_fengfeng_chest_open.webp': [(16, 175, 36, 335), (150, 398, 210, 418)],
    'public/assets/bg/event_fengfeng_hidden_box_r0.webp': [(8, 220, 16, 234)],
    'public/assets/bg/event_fengfeng_robin_r0.webp': [(8, 170, 20, 190)],
    'public/assets/bg/event_fengfeng_rescue_return_fish.webp': [(8, 218, 14, 240)],
    'public/assets/bg/event_fengfeng_lost_scroll_r1.webp': [(178, 8, 224, 16)],
    'public/assets/bg/event_fengfeng_old_master_ghost.webp': [(412, 400, 482, 412)],
    'public/assets/bg/event_fengfeng_chest_empty.webp': [(142, 398, 204, 412)],
    'public/assets/sprites/hero/fengfeng_claw.webp': [(506, 460, 535, 475)],
    'public/assets/sprites/hero/fengfeng_dodge.webp': [(154, 506, 248, 524)],
    'public/assets/sprites/hero/fengfeng_qinggong.webp': [(272, 502, 386, 545)],
}


class GateError(Exception):
    pass


# ---------------------------------------------------------------- 共用

def actions(hero: str) -> dict:
    acts: dict = {}
    for f in MOTION_FILES[hero]:
        acts.update(json.loads((ROOT / f'src/ui/{f}.json').read_text(encoding='utf-8'))['actions'])
    return acts


_TEX: dict[str, Image.Image] = {}


def texture(rel: str) -> Image.Image:
    if rel not in _TEX:
        _TEX[rel] = Image.open(ROOT / 'public' / rel).convert('RGBA')
    return _TEX[rel]


def motion_crop(m: dict, index: int, margin: int = MARGIN) -> Image.Image:
    """逐格圖集的一格（rect 是 alpha>16 的外框，外面多留一圈反鋸齒）。"""
    x, y, w, h = m['frames'][index]['rect']
    tex = texture(m['texture'])
    return tex.crop((max(0, x - margin), max(0, y - margin), min(tex.width, x + w + margin), min(tex.height, y + h + margin)))


def resize(im: Image.Image, k: float) -> Image.Image:
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def bbox(im: Image.Image, thr: int = 16) -> tuple[int, int, int, int]:
    """alpha>thr 的外框（x0, y0, x1, y1，含邊界）。"""
    a = np.array(im)[..., 3]
    ys, xs = np.where(a > thr)
    if not len(xs):
        raise GateError('整張是空的')
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def components(im: Image.Image, thr: int = 16) -> list[tuple[int, tuple[int, int, int, int], np.ndarray]]:
    a = np.array(im)[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > thr).astype(np.uint8), connectivity=8)
    out = [(int(st[i, 4]), (int(st[i, 0]), int(st[i, 1]), int(st[i, 2]), int(st[i, 3])), lab == i) for i in range(1, n)]
    return sorted(out, key=lambda c: -c[0])


def keep_parts(im: Image.Image, keep: int, min_area: int) -> tuple[Image.Image, dict]:
    """只留最大的 `keep` 塊（主體＋道具），其餘小於 `min_area` 的碎點清掉；回傳清掉幾塊、最大那塊多大。"""
    comps = components(im, 0)
    arr = np.array(im)
    areas = []
    for i, (area, box, mask) in enumerate(comps):
        if i < keep or area >= min_area:
            continue
        arr[mask, 3] = 0
        areas.append(area)
    return Image.fromarray(arr), {'count': len(areas), 'maxArea': max(areas, default=0), 'totalArea': sum(areas)}


def keep_main(im: Image.Image, thr: int = 16, grow: int = 3) -> Image.Image:
    """只留最大那一塊（外擴 `grow` 像素，保住它自己的反鋸齒），其他分開的東西連同淡淡的外圍一起清掉。"""
    comps = components(im, thr)
    keep = cv2.dilate(comps[0][2].astype(np.uint8), np.ones((2 * grow + 1, 2 * grow + 1), np.uint8)) > 0
    arr = np.array(im)
    arr[~keep, 3] = 0
    return Image.fromarray(arr)


def place(im: Image.Image, size: tuple[int, int], cx: float, foot: int) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """外框左右置中在 cx、底邊貼在 foot 那一列。"""
    x0, y0, x1, y1 = bbox(im)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    ox = round(cx - (x0 + x1 + 1) / 2)
    oy = foot - y1
    canvas.paste(im, (ox, oy))      # 底是全透明，直接整塊貼（傳遮罩會把半透明邊的 alpha 平方）
    return canvas, (x0 + ox, y0 + oy, x1 + ox, y1 + oy)


def encode(im: Image.Image, quality: int = QUALITY) -> bytes:
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, alpha_quality=100, method=6)
    return buf.getvalue()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------- 頭的大小（head_fit.py 的量法）

def idle_head(hero: str, z: float, mirror: bool = False) -> np.ndarray:
    m = actions(hero)['idle']
    f = m['frames'][0]
    x, y, w, h = f['rect']
    s = m['scale'] * z
    im = texture(m['texture']).crop((x, y, x + w, y + h)).resize((round(w * s), round(h * s)), Image.LANCZOS)
    arr = np.array(im)
    arr = arr[:round(arr.shape[0] * HEAD_CUT[hero])]
    return arr[:, ::-1].copy() if mirror else arr


def head_fit(hero: str, target: np.ndarray, z: float, scales, angles, mirror: bool = False) -> tuple[float, float, int]:
    """target＝以「遊戲單位×z」為像素的 RGBA。回傳（相關, 倍率, 旋轉）：倍率＝目標的頭是待機的幾倍。"""
    head = idle_head(hero, z, mirror)
    tgt = np.where(target[..., 3:] > 64, target[..., :3], 128).astype(np.float32)
    pad = round(30 * z)
    tgt = cv2.copyMakeBorder(tgt, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(128, 128, 128))
    best = (-1.0, 1.0, 0)
    h, w = head.shape[:2]
    for s in scales:
        for th in angles:
            M = cv2.getRotationMatrix2D((w / 2, h / 2), th, s)
            cos, sin = abs(M[0, 0]), abs(M[0, 1])
            nw, nh = int(h * sin + w * cos) + 2, int(h * cos + w * sin) + 2
            M[0, 2] += nw / 2 - w / 2
            M[1, 2] += nh / 2 - h / 2
            t = cv2.warpAffine(head, M, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
            if nh >= tgt.shape[0] or nw >= tgt.shape[1]:
                continue
            mask = (t[..., 3] > 128).astype(np.float32)
            r = cv2.matchTemplate(tgt, t[..., :3].astype(np.float32), cv2.TM_CCORR_NORMED, mask=np.dstack([mask] * 3))
            r[~np.isfinite(r)] = -1
            v = float(r.max())
            if v > best[0]:
                best = (v, round(float(s), 3), int(th))
    return best


def measure_head(hero: str, im: Image.Image, px_per_unit: float, lo: float = .55, hi: float = 1.8,
                 mirror: bool = False) -> tuple[float, float, int]:
    """im 的 1 像素＝1/px_per_unit 遊戲單位。粗找用半解析度（每遊戲單位 0.5 像素）、細找用 1 像素。

    head_fit.py 是每遊戲單位 2 像素；量法相同（頭部樣板、縮放×旋轉搜尋、帶遮罩正規化相關），
    只是解析度減半——實測同一張圖兩種解析度的相關與倍率一致，一次量從五分鐘降到二十秒。
    """
    coarse = np.array(resize(im, .5 / px_per_unit))
    corr, s, th = head_fit(hero, coarse, .5, np.arange(lo, hi + 1e-6, .04), range(-50, 51, 10), mirror)
    fine = np.array(resize(im, 1 / px_per_unit))
    return head_fit(hero, fine, 1, np.arange(max(.3, s - .05), s + .0501, .01), range(th - 8, th + 9, 4), mirror)


# ---------------------------------------------------------------- 一、貓窩立繪

def picks() -> dict:
    return json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}


def pick_of(job: str) -> dict:
    v = picks().get(job)
    if v is None:
        raise GateError(f'{job} 還沒選定（python tools/gen_rest_art.py pick {job} N）')
    return v if isinstance(v, dict) else {'attempt': v}


def raw_px_per_unit(hero: str) -> float:
    """參考圖 ① 裡待機第 1 格被放大到畫布的 80%（gen_rest_art.on_white），生圖照那個比例畫的話就是這個倍率。"""
    m = actions(hero)['idle']
    _, _, w, h = m['frames'][0]['rect']
    return .8 * 1024 / max(w, h) / m['scale']


def check_generated(job: str, raw: Image.Image, keep: int) -> list[str]:
    """真透明、單一角色（加道具）、沒被切到。"""
    errs = []
    a = np.array(raw)[..., 3]
    if (a == 0).mean() < .35:
        errs.append(f'{job}：透明的地方只有 {(a == 0).mean():.0%}，不是真透明（或背景被畫進去了）')
    corners = [a[:16, :16], a[:16, -16:], a[-16:, :16], a[-16:, -16:]]
    if any(c.max() > 0 for c in corners):
        errs.append(f'{job}：四個角不是全透明')
    x0, y0, x1, y1 = bbox(raw)
    if x0 < 3 or y0 < 3 or x1 > raw.width - 4 or y1 > raw.height - 4:
        errs.append(f'{job}：角色碰到圖的邊（{x0},{y0},{x1},{y1}），可能被切到')
    comps = components(raw)
    main = comps[0][0]
    big = [c for c in comps[1:] if c[0] >= .03 * main]
    if len(big) > keep - 1:
        errs.append(f'{job}：除了主體還有 {len(big)} 大塊（允許 {keep - 1}）：{[(c[0], c[1]) for c in big]}')
    return errs


def build_rest(hero: str, pose: str, record: dict, errs: list[str]) -> tuple[str, bytes] | None:
    key = SPRITE_KEY[hero]
    out_rel = f'public/assets/sprites/hero/{key}_{pose}.webp'
    size, foot = CANVAS[hero], FOOT[hero]
    job = f'{hero}/{pose}'
    info: dict = {'file': out_rel, 'canvas': list(size)}
    if pose in FROM_MOTION:
        action, index = FROM_MOTION[pose]
        m = actions(hero)[action]
        frame = motion_crop(m, index)
        if (hero, pose) in MIRROR:
            frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        k = m['scale'] / REST_SCALE                      # 圖集像素 → 畫布像素（跟戰鬥同比例）
        scaled = resize(frame, k)
        info.update(source=f'{m["texture"]}#{action}[{index % len(m["frames"])}]', scale=round(k, 4),
                    sizeCheck='同一張逐格圖、同戰鬥比例', mirrored=(hero, pose) in MIRROR)
    else:
        p = pick_of(job)
        raw_path = SOURCE / hero / f'{pose}.try{p["attempt"]}.png'
        raw = Image.open(raw_path).convert('RGBA')
        keep = 1 + PROPS.get(pose, 0) + p.get('props', 0)
        e = check_generated(job, raw, keep)
        errs.extend(e)
        if e:
            return None
        raw, dropped = keep_parts(raw, keep, 400)
        g = raw_px_per_unit(hero)
        corr, s, th = measure_head(hero, raw, g)
        # 面向：頭左右翻過來再比一次，翻過來比較像＝畫成面向左
        mcorr, _, _ = measure_head(hero, raw, g, mirror=True)
        info.update(source=raw_path.relative_to(ROOT).as_posix(), attempt=p['attempt'], rawHead=s, rawAngle=th, rawCorr=round(corr, 3),
                    mirrorCorr=round(mcorr, 3), dropped=dropped)
        if mcorr > corr and p.get('facingCheck') != 'eye':
            errs.append(f'{job}：頭反過來比對更像（{mcorr:.3f} > {corr:.3f}），可能面向左')
        k = 1 / (g * s * REST_SCALE)                     # 生圖像素 → 畫布像素：頭縮到跟待機一樣大
        scaled = resize(raw, k)
        info['scale'] = round(k, 4)
    canvas, box = place(scaled, size, CENTER_X, foot)
    info['bbox'] = list(box)
    if box[0] < 4 or box[2] > size[0] - 5 or box[1] < 4:
        errs.append(f'{job}：放進 {size} 畫布後超出範圍（外框 {box}）')
    # 閘門：放好之後再量一次頭（換回遊戲單位比），要在 ±6% 內
    corr, s, th = measure_head(hero, canvas, 1 / REST_SCALE, .7, 1.4)
    info.update(head=s, headAngle=th, headCorr=round(corr, 3))
    if pose in GENERATED:
        p = pick_of(job)
        if corr < HEAD_MIN_CORR:
            if p.get('headCheck') == 'eye':
                info['headCheck'] = 'eye'
            else:
                errs.append(f'{job}：頭部比對相關只有 {corr:.3f}（量不準），要人眼並排判斷後在 picks.json 標 headCheck')
        elif abs(s - 1) > HEAD_TOL:
            errs.append(f'{job}：頭部大小是待機的 {s:.2f} 倍，超出 ±{HEAD_TOL:.0%}')
    data = encode(canvas)
    info['sha256'] = sha(data)
    record[out_rel] = info
    return out_rel, data


# ---------------------------------------------------------------- 二、地圖小頭像

def map_frames() -> dict[tuple[str, str], Image.Image]:
    """十二格原圖（圖集像素），只留跟身體連著的那一塊；回傳時換算成遊戲單位。"""
    out = {}
    for hero in HEROES:
        acts = actions(hero)
        for tier, (action, index) in MAP_TIER.items():
            m = acts[action]
            frame = motion_crop(m, index)
            frame = keep_main(frame)
            out[(hero, tier)] = resize(frame, m['scale'])    # 1 像素＝1 遊戲單位
    return out


def build_map(record: dict, errs: list[str]) -> list[tuple[str, bytes]]:
    frames = map_frames()
    # 同一個比例：十二格都要放得進 128 畫布（左右各留 1、上面留 1）
    k128 = min(min(126 / (b[2] - b[0] + 1), 126 / (b[3] - b[1] + 1)) for b in (bbox(f) for f in frames.values()))
    outs = []
    for (hero, tier), frame in frames.items():
        side = 96 if hero == 'qiuqiu' else 128
        k = k128 * side / 128
        scaled = resize(frame, k)
        canvas, box = place(scaled, (side, side), side / 2, side - 2)
        name = f'map_hero_{tier}' if hero == 'qiuqiu' else f'map_hero_{hero}_{tier}'
        rel = f'public/assets/icons/{name}.webp'
        if box[0] < 0 or box[1] < 0 or box[2] > side - 1:
            errs.append(f'{rel}：超出畫布（{box}）')
        extra = components(canvas)[1:]
        if extra:
            errs.append(f'{rel}：還有分開的碎塊 {[(c[0], c[1]) for c in extra]}')
        data = encode(canvas, MAP_QUALITY)
        action, index = MAP_TIER[tier]
        record[rel] = {'file': rel, 'canvas': [side, side], 'source': f'{actions(hero)[action]["texture"]}#{action}[{index}]',
                       'unitsPerCanvas128': round(k128, 5), 'scale': round(k, 5), 'bbox': list(box),
                       'heightOnMap': round((box[3] - box[1] + 1) * 52 / side, 1), 'sha256': sha(data)}
        outs.append((rel, data))
    return outs


# ---------------------------------------------------------------- 三、銅護臂圖示

RELIC_REL = 'public/assets/icons/relic_copper_bracer.webp'


def build_relic(record: dict, errs: list[str]) -> tuple[str, bytes] | None:
    p = pick_of('relic/copper_bracer')
    raw_path = SOURCE / 'relic' / f'copper_bracer.try{p["attempt"]}.png'
    raw = Image.open(raw_path).convert('RGBA')
    e = check_generated('relic/copper_bracer', raw, 1 + p.get('props', 0))
    errs.extend(e)
    if e:
        return None
    raw, dropped = keep_parts(raw, 1 + p.get('props', 0), 400)
    x0, y0, x1, y1 = bbox(raw, 0)
    im = raw.crop((x0, y0, x1 + 1, y1 + 1))
    im.thumbnail((128, 128), Image.LANCZOS)                # 同 add_icons.py：長邊貼滿 128、置中
    canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    canvas.paste(im, ((128 - im.width) // 2, (128 - im.height) // 2))
    data = encode(canvas, MAP_QUALITY)                      # 秘寶圖示那一組也是 quality 80（add_icons.py）
    record[RELIC_REL] = {'file': RELIC_REL, 'canvas': [128, 128], 'source': raw_path.relative_to(ROOT).as_posix(),
                         'attempt': p['attempt'], 'bbox': list(bbox(canvas)), 'dropped': dropped, 'sha256': sha(data)}
    return RELIC_REL, data


# ---------------------------------------------------------------- 四、去殘渣（只換透明度區塊）

def riff_chunks(data: bytes) -> list[tuple[bytes, bytes]]:
    if data[:4] != b'RIFF' or data[8:12] != b'WEBP':
        raise GateError('不是 WebP')
    i, out = 12, []
    while i < len(data):
        tag, n = data[i:i + 4], struct.unpack('<I', data[i + 4:i + 8])[0]
        out.append((tag, data[i + 8:i + 8 + n]))
        i += 8 + n + (n & 1)
    return out


def riff_join(chunks: list[tuple[bytes, bytes]]) -> bytes:
    body = b'WEBP' + b''.join(tag + struct.pack('<I', len(p)) + p + (b'\0' if len(p) & 1 else b'') for tag, p in chunks)
    return b'RIFF' + struct.pack('<I', len(body)) + body


def build_cleanup(record: dict, errs: list[str], originals: dict[str, bytes]) -> list[tuple[str, bytes]]:
    outs = []
    for rel, boxes in CLEANUP.items():
        orig = originals[rel]
        chunks = riff_chunks(orig)
        if [t for t, _ in chunks] != [b'VP8X', b'ALPH', b'VP8 ']:
            errs.append(f'{rel}：區塊不是 VP8X＋ALPH＋VP8，不能只換透明度')
            continue
        im = Image.open(io.BytesIO(orig)).convert('RGBA')
        arr = np.array(im)
        comps = components(im, 8)

        def inside(x: int, y: int, w: int, h: int) -> bool:
            return any(bx0 <= x and by0 <= y and x + w - 1 <= bx1 and y + h - 1 <= by1 for bx0, by0, bx1, by1 in boxes)

        cleared = [{'area': area, 'box': [x, y, w, h]} for area, (x, y, w, h), _ in comps[1:] if inside(x, y, w, h)]
        # 保護：整塊不在框裡的（主體、閃光等）外擴 3 像素；框裡其餘像素（碎片與它的淡邊）歸零
        protect = np.zeros(arr.shape[:2], np.uint8)
        for area, (x, y, w, h), mask in comps:
            if not inside(x, y, w, h):
                protect |= mask.astype(np.uint8)
        protect = cv2.dilate(protect, np.ones((7, 7), np.uint8)) > 0
        zone = np.zeros(arr.shape[:2], bool)
        for bx0, by0, bx1, by1 in boxes:
            zone[by0:by1 + 1, bx0:bx1 + 1] = True
        wipe = zone & ~protect & (arr[..., 3] > 0)
        if not cleared:
            errs.append(f'{rel}：框裡找不到要清的碎片（原檔已經清過？）')
            continue
        arr[wipe, 3] = 0
        left = [c for c in components(Image.fromarray(arr), 0)[1:] if inside(*c[1])]
        if left:
            errs.append(f'{rel}：清完框裡還有東西 {[(c[0], c[1]) for c in left]}')
            continue
        new = Image.fromarray(arr)
        alph = next(p for t, p in riff_chunks(encode(new)) if t == b'ALPH')
        data = riff_join([(t, alph if t == b'ALPH' else p) for t, p in chunks])
        # 驗證：解回來的透明度＝要的、顏色（看得到的地方）＝原檔
        back = np.array(Image.open(io.BytesIO(data)).convert('RGBA'))
        if not np.array_equal(back[..., 3], arr[..., 3]):
            errs.append(f'{rel}：換完透明度解回來對不上')
            continue
        vis = back[..., 3] > 0
        if not np.array_equal(back[..., :3][vis], np.array(im)[..., :3][vis]):
            errs.append(f'{rel}：顏色被動到了')
            continue
        record[rel] = {'file': rel, 'cleared': cleared, 'pixels': int(wipe.sum()), 'boxes': [list(b) for b in boxes],
                       'sha256Before': sha(orig), 'sha256': sha(data)}
        outs.append((rel, data))
    return outs


# ---------------------------------------------------------------- 聯絡表

def contact_sheet(outs: dict[str, bytes], originals: dict[str, bytes], record_now: dict) -> Image.Image:
    """每格「新版待機第 1 格｜舊圖｜新圖」，同一個顯示比例（貓窩：舞台像素；地圖：52 框放大 3 倍）。"""
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 18)
    except OSError:
        font = ImageFont.load_default()
    rows = []
    bgc = (58, 44, 36, 255)

    def tile(ims: list[Image.Image], labels: list[str], w: int, h: int) -> Image.Image:
        t = Image.new('RGBA', (w * len(ims), h + 26), bgc)
        d = ImageDraw.Draw(t)
        for i, (im, lab) in enumerate(zip(ims, labels)):
            t.alpha_composite(im, (i * w + (w - im.width) // 2, 26 + h - im.height - 4))
            d.text((i * w + 6, 3), lab, fill=(255, 230, 190, 255), font=font)
            d.line([(i * w, 0), (i * w, h + 26)], fill=(20, 14, 10, 255), width=2)
        return t

    for hero in HEROES:
        idle_m = actions(hero)['idle']
        idle = resize(motion_crop(idle_m, 0), idle_m['scale'])            # 戰鬥裡的大小（舞台像素）
        for pose in REST_POSES:
            rel = f'public/assets/sprites/hero/{SPRITE_KEY[hero]}_{pose}.webp'
            old = resize(Image.open(io.BytesIO(originals[rel])).convert('RGBA'), REST_SCALE)
            new = resize(Image.open(io.BytesIO(outs[rel])).convert('RGBA'), REST_SCALE)
            rows.append(tile([idle, old.crop(old.getbbox()), new.crop(new.getbbox())],
                             [f'{hero} 待機第1格', f'舊 {pose}', f'新 {pose}'], 320, 300))
    k128 = next(v['unitsPerCanvas128'] for v in record_now.values() if 'unitsPerCanvas128' in v)
    for hero in HEROES:
        idle_m = actions(hero)['idle']
        for tier in MAP_TIER:
            name = f'map_hero_{tier}' if hero == 'qiuqiu' else f'map_hero_{hero}_{tier}'
            rel = f'public/assets/icons/{name}.webp'
            side = 96 if hero == 'qiuqiu' else 128
            k = 52 / side * 3
            idle = resize(motion_crop(idle_m, 0), idle_m['scale'] * k128 * 52 / 128 * 3)
            old = resize(Image.open(io.BytesIO(originals[rel])).convert('RGBA'), k)
            new = resize(Image.open(io.BytesIO(outs[rel])).convert('RGBA'), k)
            rows.append(tile([idle, old, new], [f'{hero} 待機（地圖×3）', f'舊 {tier}', f'新 {tier}'], 320, 160))
    relic = Image.open(io.BytesIO(outs[RELIC_REL])).convert('RGBA')
    ref = resize(motion_crop(actions('dangdang')['idle'], 0), actions('dangdang')['idle']['scale'])
    rows.append(tile([ref, Image.new('RGBA', (1, 1)), resize(relic, 2)], ['噹噹待機第1格', '舊：沒有圖', '新 銅護臂（×2）'], 320, 300))
    for rel in CLEANUP:
        old = Image.open(io.BytesIO(originals[rel])).convert('RGBA')
        new = Image.open(io.BytesIO(outs[rel])).convert('RGBA')
        k = 300 / max(old.size)
        rows.append(tile([resize(old, k), resize(new, k)], [Path(rel).stem + ' 前', '後'], 480, 300))
    # 四欄照順序排：球球＋菲菲貓窩｜噹噹＋封封貓窩｜地圖＋銅護臂｜去殘渣
    col_rows = [rows[0:10], rows[10:20], rows[20:33], rows[33:]]
    cols = len(col_rows)
    col_w = max(r.width for r in rows)
    height = max(sum(r.height for r in c) for c in col_rows)
    sheet = Image.new('RGBA', (col_w * cols, height), bgc)
    for ci, c in enumerate(col_rows):
        y = 0
        for r in c:
            sheet.alpha_composite(r, (ci * col_w, y))
            y += r.height
    return sheet.convert('RGB')


# ---------------------------------------------------------------- 主程式

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--only', default='', help='只算這幾項（逗號分隔：rest,map,relic,cleanup）；寫檔一律要全部')
    args = ap.parse_args()
    parts = set(args.only.split(',')) if args.only else {'rest', 'map', 'relic', 'cleanup'}
    record: dict = json.loads(RECORD.read_text(encoding='utf-8')) if RECORD.exists() else {}
    originals: dict[str, bytes] = {}

    def head_bytes(rel: str) -> bytes:
        return subprocess.run(['git', 'show', f'{BASE_COMMIT}:{rel}'], cwd=ROOT, capture_output=True, check=True).stdout

    errs: list[str] = []
    outs: list[tuple[str, bytes]] = []
    if 'rest' in parts:
        for hero in HEROES:
            for pose in REST_POSES:
                rel = f'public/assets/sprites/hero/{SPRITE_KEY[hero]}_{pose}.webp'
                originals[rel] = head_bytes(rel)
                try:
                    r = build_rest(hero, pose, record, errs)
                except GateError as e:
                    errs.append(str(e))
                    r = None
                if r:
                    outs.append(r)
                    info = record[r[0]]
                    print(f'{hero:9s} {pose:8s} 頭 {info["head"]:.2f} 倍（相關 {info["headCorr"]:.3f}）外框 {info["bbox"]} 縮放 {info["scale"]}')
    if 'map' in parts:
        for hero in HEROES:
            for tier in MAP_TIER:
                name = f'map_hero_{tier}' if hero == 'qiuqiu' else f'map_hero_{hero}_{tier}'
                originals[f'public/assets/icons/{name}.webp'] = head_bytes(f'public/assets/icons/{name}.webp')
        outs.extend(build_map(record, errs))
        for rel, info in record.items():
            if 'heightOnMap' in info:
                print(f'{Path(rel).stem:26s} 地圖上高 {info["heightOnMap"]} 像素 外框 {info["bbox"]}')
    if 'relic' in parts:
        try:
            r = build_relic(record, errs)
        except GateError as e:
            errs.append(str(e))
            r = None
        if r:
            outs.append(r)
    if 'cleanup' in parts:
        for rel in CLEANUP:
            originals[rel] = head_bytes(rel)
        outs.extend(build_cleanup(record, errs, originals))
        for rel in CLEANUP:
            if rel in record and 'cleared' in record[rel]:
                print(f'{Path(rel).stem:36s} 清掉 {[c["area"] for c in record[rel]["cleared"]]}')
    if errs:
        print('\n!! 閘門沒過，整批停下、一個檔都沒寫：', file=sys.stderr)
        for e in errs:
            print('  - ' + e, file=sys.stderr)
        sys.exit(1)
    if args.sheet:
        if parts != {'rest', 'map', 'relic', 'cleanup'}:
            raise SystemExit('聯絡表要四項全算')
        SHEET_OUT.parent.mkdir(parents=True, exist_ok=True)
        contact_sheet(dict(outs), originals, record).save(SHEET_OUT, optimize=True)
        print(f'聯絡表：{SHEET_OUT}')
    if args.dry_run:
        print('（--dry-run：沒寫檔）')
        return
    if parts != {'rest', 'map', 'relic', 'cleanup'}:
        raise SystemExit('寫檔要四項一起算（--only 只給試算用）')
    for rel, data in outs:
        (ROOT / rel).write_bytes(data)
    RECORD.write_text(json.dumps(dict(sorted(record.items())), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'寫了 {len(outs)} 個檔；紀錄 {RECORD.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
