"""mix 批次：動作圖大小修正（2026-09-22）。

背景：09-20 那批逐格動作打包時一律「把第 1 格的外框高拉成 252 單位」。第 1 格的架式只要跟待機
不一樣高（跑步腿張開、太極站得比待機直），整隻貓就被放大或縮小；有幾套則是生圖時頭本身就畫大或畫小。
出招時頭會縮一下、脹一下。這一批處理八個動作：

  - 噹噹 跑步（run）、球球 過關走路（walk）、球球 太極（taiji）：頭、尾巴、拳頭、腳掌一起偏大或偏小
    （頭與身體部件倍率差 ≤3%），**不重畫，只改資料檔的 scale**（`SCALE_FIX`）。圖檔一個位元都不動，
    腳底定位點是圖內座標、不用改（縮放以定位點為中心，腳底線與兩腳位置不動）。
    球球走路是 Godot 動作修練場原畫移過來的（只准縮放）。
  - 噹噹 吃東西（eat）與中毒（poison）、封封 突刺（thrust）、連斬（double_slash）、橫掃（sweep）：
    腳掌、腰帶、尾巴跟待機一樣大，只有頭畫大（噹噹約 +9%）或畫小（封封 -8%～-19%，弓步那幾格更小）
    ——比例畫偏，縮放救不了，**重畫**（`REDRAW`）。

量法（`measure`）：待機第 1 格的頭（上面 45～47%）當樣板，在每一格裡搜尋縮放 0.78～1.30 × 旋轉 ±40 度，
用帶遮罩的顏色相關找最吻合的倍率（同一個比例尺：遊戲單位 × 1.5 像素）。身體用不太會變形的部件
（腳掌、護臂、腰帶結、拳頭、尾巴、劍柄）做同樣的搜尋，只採相關 ≥0.93 的部件。
外框身高量不出身體大小（後仰、彎膝外框本來就會變矮），所以一律比頭與部件，不比外框。

閘門（`gate`，**不合格就丟例外、整批停下、什麼都不寫**）：
  真透明、每格只有一隻、每格頭部倍率在待機的 ±5% 內、相鄰格頭部倍率變化 ≤4%（循環動作連最後一格
  接回第 1 格也算）、沒有被切到、腳底著地（重畫的：每格腳掌樣板落在腳底線上；只改縮放的：定位點沒動）、
  重畫的第 1 格身體部件倍率在 ±5% 內（頭對了身體也要對，不然只是反過來畫偏）。

重畫的做法（`refs`／`gen`／`pick`）：gpt-image-1.5 真透明（codex-oauth）、面向右、腳底在格高 92%。
  參考圖①＝**新版待機 8 格**（長相與頭身比的依據，每次 refs 都從現行資料重出，不會抄到舊版）；
  參考圖②＝**舊圖集那 8 格**照同一個版面排好（姿勢、身體大小、在格子裡的位置照它，只有頭照①）。
  封封的劍很長，4×2 一格只有 384 寬、畫不下又要夠清楚，所以拆兩張 2×2（一格 768×512）：前 4 格、後 4 格；
  畫後 4 格時把選定的前 4 格當參考圖③，兩張才接得上。噹噹站著吃、咳嗽，4×2 一張就夠。
  打包時每張圖先照「版面比例」（站高 62% 格高＝252 單位）換算，再用頭部量測把那一張的頭對齊待機（中位數＝1；
  生圖端常把整隻畫大三成，所以反覆重量到中位數落在 1±2%），縮成跟該角色待機圖集一樣的解析度，
  拼回 4×2（噹噹是吃東西＋中毒 4×4，沿用 `eat_poison.webp`）。
  封封兩張各自對齊之後，接縫（第 4→5 格）可能還差 5%：兩張的相對大小本來就是未知數，所以整張各乘一個
  微調倍率（前半 ±3%、後半 ±6%），讓整套相鄰格跳動最小（`align_halves`）。
  封封第一輪只用文字說「頭畫小了」，頭只放大一點（頭對齊後身體還大 7～12%），第二輪起參考圖②改成
  「舊圖＋照正確大小貼上待機的頭」的版面草稿（`pose_ref` 的 `pasteHead`）；橫掃第 3、4 格舊圖是背面／正面，
  頭量不到、也貼不上，改成「軀幹扭轉、頭維持側面四分之三」（頭部倍率量得到，閘門才驗得了）。
  量測結果依圖檔雜湊快取在 `_cache/`（不進版控），`CACHE_VERSION` 一改就全部重量。

用法：
    python tools/motion_size_fix_mix.py measure [動作…]          # 量現行資料（改前改後都可以量）
    python tools/motion_size_fix_mix.py refs
    python tools/motion_size_fix_mix.py prompt fengfeng/thrust a
    python tools/motion_size_fix_mix.py gen dangdang/eat fengfeng/thrust:a --jobs 4 [--note "修正說明"]
    python tools/motion_size_fix_mix.py check fengfeng/thrust:a 2    # 檢查某次嘗試（不寫檔）
    python tools/motion_size_fix_mix.py pick fengfeng/thrust:a 2
    python tools/motion_size_fix_mix.py apply                        # 全部過閘門才寫檔
    python tools/motion_size_fix_mix.py sheet                        # 聯絡表（改前 vs 改後）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_idle_state_art import IMAGE_GEN, LOOK, idle_sheet  # noqa: E402
from pack_idle_state_motion import ArtError, dump_json, tidy  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/mix'
REF = SOURCE / '_ref'
CONFIG = SOURCE / 'actions.json'
PROMPTS = SOURCE / 'prompts.json'
RECORD = ROOT / 'docs/motion-size-fix-mix.json'
NATIVE_HEIGHT = 252
IDLE_DATA = {
    'qiuqiu': 'src/ui/qiuqiu-motion-data.json',
    'dangdang': 'src/ui/dangdang-motion-data.json',
    'fengfeng': 'src/ui/fengfeng-motion-data.json',
}

# ── 量測 ──────────────────────────────────────────────────────────────
Z = 1.5                       # 量頭：1 遊戲單位 = 1.5 像素
ZP = 2.0                      # 量部件
HEAD_CUT = {'qiuqiu': .47, 'dangdang': .45, 'fengfeng': .47}   # 頭身交界（待機第 1 格高度的比例，下巴附近）
# 身體部件：待機第 1 格裡的位置（遊戲單位 x0, y0, x1, y1）。挑形狀穩定、每格多半看得到的
PARTS = {
    'qiuqiu': {'前腳': (148, 224, 212, 254), '後腳': (18, 222, 84, 254), '尾巴': (12, 128, 62, 214),
               '右拳': (148, 128, 182, 166), '左拳': (86, 128, 118, 162), '腰帶結': (108, 164, 162, 206)},
    'dangdang': {'後護臂': (48, 122, 98, 182), '前護臂': (122, 128, 168, 182), '後腳': (40, 226, 82, 253),
                 '前腳': (104, 226, 152, 253), '腰帶': (112, 150, 152, 206)},
    'fengfeng': {'劍柄': (148, 132, 187, 196), '後腳': (58, 226, 102, 253), '前腳': (124, 226, 168, 253),
                 '尾巴': (0, 152, 76, 212)},
}
FEET = ('前腳', '後腳')
PART_CORR = 0.93              # 部件相關低於這個就不採（被擋住、轉到側面、換了形狀）
HEAD_LIMIT = 0.05             # 每格頭部倍率 ±5%
HEAD_STEP = 0.04              # 相鄰格頭部倍率變化上限
BODY_LIMIT = 0.05             # 重畫的第 1 格身體部件倍率 ±5%
MAIN_BODY = 0.97              # 最大一塊要佔全部不透明像素的比例：低於這個就是多畫了特效或第二隻貓
FOOT_BAND = 0.06              # 腳掌樣板的底邊要落在「腳底線往上 6% 身高」以內
_TEX: dict[str, Image.Image] = {}


def texture(path: str | Path) -> Image.Image:
    key = str(path)
    if key not in _TEX:
        full = Path(path) if Path(path).is_absolute() else ROOT / 'public' / path
        _TEX[key] = Image.open(full).convert('RGBA')
    return _TEX[key]


def load_action(data_file: str, action: str) -> dict:
    return json.loads((ROOT / data_file).read_text(encoding='utf-8'))['actions'][action]


def frame_rgba(image: Image.Image, rect, units_per_px: float, z: float) -> np.ndarray:
    x, y, w, h = rect
    k = units_per_px * z
    return np.array(image.crop((x, y, x + w, y + h)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS))


def _warp(t: np.ndarray, s: float, th: float) -> np.ndarray:
    h, w = t.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), th, s)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw, nh = int(h * sin + w * cos) + 2, int(h * cos + w * sin) + 2
    M[0, 2] += nw / 2 - w / 2
    M[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(t, M, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))


def _search(part: np.ndarray, tgt: np.ndarray, scales, rots, keep: int = 1):
    """每個（倍率, 旋轉）的最高相關；回傳最好的 keep 組（倍率彼此至少差 0.05，避免三組都是同一個峰）。"""
    found = []
    for s in scales:
        for th in rots:
            t = _warp(part, float(s), th)
            if t.shape[0] >= tgt.shape[0] or t.shape[1] >= tgt.shape[1]:
                continue
            mask = (t[..., 3] > 128).astype(np.float32)
            r = cv2.matchTemplate(tgt, t[..., :3].astype(np.float32), cv2.TM_CCORR_NORMED, mask=np.dstack([mask] * 3))
            r[~np.isfinite(r)] = -1
            v = float(r.max())
            yy, xx = np.unravel_index(int(np.argmax(r)), r.shape)
            found.append((v, float(s), th, (int(xx), int(yy), t.shape[1], t.shape[0])))
    found.sort(key=lambda f: -f[0])
    best: list = []
    for f in found:
        if all(abs(f[1] - b[1]) >= .05 for b in best):
            best.append(f)
        if len(best) == keep:
            break
    return best if keep > 1 else (best[0] if best else (-1.0, 1.0, 0, (0, 0, 0, 0)))


PAD = 60


def fit(part: np.ndarray, target: np.ndarray, rot: int = 40, lo: float = .78, hi: float = 1.30):
    """part 在 target 裡最吻合的（相關, 倍率, 旋轉, 外框 x, y, w, h（target 座標））。
    粗找（倍率 0.04、旋轉 10 度一格）留前三個不同的峰，各自細找（0.01、2 度），取相關最高的——
    只細找一個峰時，難認的格（彎腰、低頭）會卡在假峰，同一格換個比例尺重量就差 5%。"""
    tgt = np.where(target[..., 3:] > 64, target[..., :3], 128).astype(np.float32)
    tgt = cv2.copyMakeBorder(tgt, PAD, PAD, PAD, PAD, cv2.BORDER_CONSTANT, value=(128, 128, 128))
    seeds = _search(part, tgt, np.arange(lo, hi, .04), range(-rot, rot + 1, 10), keep=3)
    best = max((_search(part, tgt, np.arange(s0 - .03, s0 + .031, .01), range(th0 - 8, th0 + 9, 2))
                for _, s0, th0, _ in seeds), key=lambda f: f[0])
    v, s, th, (x, y, w, h) = best
    return round(v, 3), round(s, 3), th, (x - PAD, y - PAD, w, h)


def idle_frame(hero: str, z: float) -> np.ndarray:
    idle = load_action(IDLE_DATA[hero], 'idle')
    return frame_rgba(texture(idle['texture']), idle['frames'][0]['rect'], idle['scale'], z)


def head_template(hero: str) -> np.ndarray:
    base = idle_frame(hero, Z)
    return base[:round(base.shape[0] * HEAD_CUT[hero])]


def part_templates(hero: str) -> dict[str, np.ndarray]:
    base = idle_frame(hero, ZP)
    return {name: base[round(y0 * ZP):round(y1 * ZP), round(x0 * ZP):round(x1 * ZP)]
            for name, (x0, y0, x1, y1) in PARTS[hero].items()}


def measure_frame(args) -> dict:
    """一格的頭部倍率；with_parts 時另外量身體部件（腳掌順便給位置，拿來驗腳底著地）。"""
    hero, tex_path, rect, units_per_px, with_parts = args
    image = texture(tex_path)
    target = frame_rgba(image, rect, units_per_px, Z)
    corr, scale, rot, _ = fit(head_template(hero), target)
    out = {'head': scale, 'headCorr': corr, 'headRot': rot}
    if with_parts:
        tgt = frame_rgba(image, rect, units_per_px, ZP)
        parts = {}
        for name, tpl in part_templates(hero).items():
            c, s, r, (x, y, w, h) = fit(tpl, tgt, rot=60, lo=.72, hi=1.34)
            parts[name] = {'scale': s, 'corr': c, 'bottomGap': round((tgt.shape[0] - (y + h)) / ZP, 1)}
        good = [p['scale'] for p in parts.values() if p['corr'] >= PART_CORR]
        out['parts'] = parts
        out['body'] = round(float(np.median(good)), 3) if good else None
    return out


def measure_frames(hero: str, tex_path: str | Path, frames: list[dict], units_per_px: float,
                   parts_on: set[int] = frozenset()) -> list[dict]:
    jobs = [(hero, str(tex_path), f['rect'], units_per_px, i in parts_on) for i, f in enumerate(frames)]
    with ProcessPoolExecutor(max_workers=min(16, len(jobs))) as pool:
        return list(pool.map(measure_frame, jobs))


# ── 要修的動作 ──────────────────────────────────────────────────────────
# 只改縮放：packed＝原本打包出來的 scale（第 1 格外框高＝252 那一套；球球走路是 Godot 原檔移植時的值），
# fix＝乘上去的倍率（1 ÷ 改前 8 格頭部倍率的中位數，取到千分位）。
SCALE_FIX = {
    'dangdang/run': {'data': 'src/ui/dangdang-motion-data.json', 'packed': 0.631578947368421, 'fix': 0.909,
                     'loop': True},
    'qiuqiu/walk': {'data': 'src/ui/qiuqiu-motion-data.json', 'packed': 0.68, 'fix': 0.909, 'loop': True,
                    'godotOriginal': True},
    'qiuqiu/taiji': {'data': 'src/ui/qiuqiu-extra-motion-data.json', 'packed': 0.7159090909090909, 'fix': 1.081,
                     'loop': False},
}

SHEET = (1536, 1024)
CHAR_HEIGHT = .62             # 生圖版面：一般站姿身高佔格高 62%（跟待機狀態、出牌動作那兩批同一個規矩）
BASELINE = .92
PX_PER_UNIT = CHAR_HEIGHT * 512 / NATIVE_HEIGHT     # 生圖版面裡 1 遊戲單位幾像素（格高 512）

# 重畫：texture＝輸出的圖集（沿用舊檔名，資料檔改指向同一張）、layout＝生圖版面、
# too＝舊圖頭畫偏的方向與大約幅度（寫進提示詞）、times／impactTimes／loop 照舊資料。
REDRAW = {
    'dangdang/eat': {'data': 'src/ui/dangdang-motion-data.json', 'atlas': 'eat_poison', 'row': 0, 'layout': 'sheet',
                     'too': 'about 9% too LARGE'},
    'dangdang/poison': {'data': 'src/ui/dangdang-motion-data.json', 'atlas': 'eat_poison', 'row': 2,
                        'layout': 'sheet', 'too': 'about 8% too LARGE'},
    'fengfeng/thrust': {'pasteHead': True, 'data': 'src/ui/fengfeng-motion-data.json', 'atlas': 'thrust', 'row': 0, 'layout': 'halves',
                        'too': 'about 8% too SMALL in the first frames and up to 19% too SMALL in the lunge frames'},
    'fengfeng/double_slash': {'pasteHead': True, 'data': 'src/ui/fengfeng-motion-data.json', 'atlas': 'double_slash', 'row': 0,
                              'layout': 'halves',
                              'too': 'about 7% too SMALL in the first frames and up to 19% too SMALL in the cutting frames'},
    'fengfeng/sweep': {'pasteHead': True, 'data': 'src/ui/fengfeng-motion-data.json', 'atlas': 'sweep', 'row': 0, 'layout': 'halves',
                       'too': 'about 9% too SMALL, and even smaller in the spinning frames'},
}
ATLAS = {  # 圖集 → (角色, 資料夾, 包含的動作（依列序）, 欄數)
    'eat_poison': ('dangdang', 'public/assets/motion/dangdang', ['dangdang/eat', 'dangdang/poison']),
    'thrust': ('fengfeng', 'public/assets/motion/fengfeng', ['fengfeng/thrust']),
    'double_slash': ('fengfeng', 'public/assets/motion/fengfeng', ['fengfeng/double_slash']),
    'sweep': ('fengfeng', 'public/assets/motion/fengfeng', ['fengfeng/sweep']),
}
ASSET_RECORD = {'dangdang': 'docs/dangdang-motion-assets.json', 'fengfeng': 'docs/fengfeng-motion-assets.json'}

# 每套：標題、這一招在做什麼、8 格節拍、不要畫的東西
MOVES = {
    'dangdang/eat': (
        'EATING TO HEAL (a quick rice-ball snack that restores health)',
        'Relaxed and happy. He pulls a small rice ball from his sash, eats it with a contented face and returns to '
        'his ready guard.',
        '1 normal ready guard identical to reference image 1, both fists up in front of the chest; 2 one paw reaches '
        'to the waist sash and takes a small white onigiri with a black nori strip; 3 raises the rice ball to his '
        'face with both paws; 4 takes a gentle bite; 5 chews happily with the eyes closed; 6 contented smile, still '
        'holding the rest of the rice ball; 7 lowers the paws toward the waist, the rice ball gone; 8 back to the '
        'normal ready guard of frame 1 with both paws empty.',
        'The rice ball is small (about the size of his paw). Both copper bracers stay on his forearms. Feet stay '
        'planted. No crumbs, no sparkles, no hearts, no glow, no particles.',
    ),
    'dangdang/poison': (
        'POISONED status loop (queasy and uneasy while poison works on him)',
        'Uneasy, a little sick, but still standing and alert; it loops while he stays poisoned.',
        '1 uneasy ready guard, both fists up; 2 his left paw rests on the stomach; 3 the shoulders hunch and the '
        'eyes narrow; 4 a brief cough into his right paw (this frame is held on screen for a long time while he '
        'is poisoned: make it clear and readable); 5 the cough subsides; 6 a small uncomfortable shiver; '
        '7 straightens up; 8 uneasy ready guard matching frame 1 so the loop is seamless.',
        'Do not make him faint, fall or lie down; do not change his fur colours. Feet stay planted. No green '
        'bubbles, no skull, no purple aura, no particles, no floating icons.',
    ),
    'fengfeng/thrust': (
        'FORWARD SWORD THRUST (one long straight stab to the right)',
        'Quick, precise and committed: draw, cock, lunge, stab straight to the right, pull back.',
        '1 normal ready stance identical to reference image 1, the jian still SHEATHED at the waist; 2 draws the '
        'jian and holds it up near the body; 3 sinks the weight into the back leg and cocks the blade horizontally '
        'at the right shoulder; 4 steps right, the body starts to extend; 5 long straight THRUST to the RIGHT, the '
        'blade horizontal and the sword arm fully extended; 6 holds the stab line in a deep lunge, front knee bent, '
        'rear leg straight; 7 retracts the blade along the same straight line; 8 compact low guard, blade forward.',
        'Exactly ONE straight double-edged jian (never curved, never two swords); the free paw counterbalances '
        'behind or rests at the belly and never grips the blade edge.',
    ),
    'fengfeng/double_slash': (
        'TWO CONNECTED SWORD CUTS (a downward cut, then a rising cut the other way)',
        'Two clearly different strokes with one jian, flowing into each other.',
        '1 ready stance identical to reference image 1, one paw on the hilt of the sheathed jian; 2 draws the blade '
        'up above the left shoulder and coils; 3 FIRST CUT down and forward to the RIGHT, front knee bent, blade '
        'ending diagonally low right; 4 the blade rebounds to the left hip; 5 the waist coils the opposite way, '
        'blade below the waist; 6 SECOND CUT rising from low left to HIGH RIGHT, blade extended diagonally up; '
        '7 recovers into a low guard; 8 settles in the low guard.',
        'Exactly ONE straight jian, two visibly opposite trajectories; the stances of frames 3 and 6 clearly '
        'differ; he keeps facing RIGHT.',
    ),
    'fengfeng/sweep': (
        'BROAD ROTATING SWEEP (a full torso turn that swings the jian around in a wide horizontal arc)',
        'A full-body wind-up and release: coil the torso hard to the left, unwind, sweep wide to the right, recover.',
        '1 neutral ready stance identical to reference image 1, the jian sheathed; 2 knees bend and the hips coil '
        'away toward the back-left while drawing the jian; 3 fully coiled: the hips and shoulders twist hard toward '
        'the back-left and the sword is drawn far out to the LEFT, while the HEAD stays in the same normal '
        'three-quarter view facing right as in frame 1, at the same size as in frame 1 (the twist is shown by the '
        'torso, arms, tail and scarf, not by turning the head away); 4 unwinding, the hips rotate back toward the '
        'right, the sword swinging low across the body; 5 the sword extends to the '
        'RIGHT in a wide horizontal sweep, open stance, weight forward; 6 rotating follow-through, facing right '
        'again, blade angled down; 7 draws the blade close to the body; 8 back to a neutral stance, blade low.',
        'Exactly ONE straight jian; the empty scabbard stays at the hip; the tail and scarf swing with the turn. '
        'No magic, no curved slash effects.',
    ),
}
# 封封的外觀描述（待機那支寫的）要求劍「每一格都收在鞘裡」，出劍的招式要換掉那一句
LOOK_OVERRIDE = {
    'fengfeng': LOOK['fengfeng'].replace(
        'kept SHEATHED in a dark-brown scabbard at the waist in EVERY frame (never drawn)',
        'carried in a dark-brown scabbard at the waist'),
}
EXTRA_LOOK = {
    'fengfeng': 'In frame 1 the jian is SHEATHED at the waist; once drawn it is held in the paw and the empty '
                'scabbard stays at the waist.',
}


def config() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8')) if CONFIG.exists() else {'picked': {}}


def jobs_of(key: str) -> list[str]:
    return [f'{key}:a', f'{key}:b'] if REDRAW[key]['layout'] == 'halves' else [key]


def split_job(job: str) -> tuple[str, str | None]:
    key, _, half = job.partition(':')
    if key not in REDRAW:
        raise SystemExit(f'不認得的動作：{key}')
    return key, half or None


def grid_of(job: str) -> tuple[int, int, list[int]]:
    """（欄, 列, 這張圖畫的是第幾格（從 0 算））"""
    key, half = split_job(job)
    if REDRAW[key]['layout'] == 'halves':
        return 2, 2, [0, 1, 2, 3] if half == 'a' else [4, 5, 6, 7]
    return 4, 2, list(range(8))


# ── 參考圖 ──────────────────────────────────────────────────────────────
PASTE_CUT = .42               # 貼頭用的待機頭：只取到下巴（再往下是圍巾，貼上去會多一條）
PASTE_CORR = .90              # 舊圖那一格的頭認得出來（相關 ≥ 這個）才貼；背面、正面的格認不出來就不貼


def pose_ref(job: str) -> tuple[Image.Image, list[dict]]:
    """舊圖集的那幾格，照生圖版面排好（定位點在格子中線、腳底在 92%、1 單位＝PX_PER_UNIT 像素），鋪白底。

    `pasteHead` 的動作（封封）另外把待機的頭照正確大小貼在舊頭的位置上（以下巴為準往上長、角度照舊頭）：
    第一版只用文字說「頭畫小了」，生出來的頭只放大了一點（頭對齊後身體還大 7～12%），
    模型照參考圖的版面畫得很準，所以直接把正確的頭身比放進參考圖。這張只是給模型看的版面草稿，不會進遊戲。
    """
    key, _ = split_job(job)
    hero = key.split('/')[0]
    cols, rows, idx = grid_of(job)
    data = load_action(REDRAW[key]['data'], key.split('/')[1])
    tex = texture(data['texture'])
    cw, ch = SHEET[0] / cols, SHEET[1] / rows
    sheet = Image.new('RGBA', SHEET, (255, 255, 255, 255))
    idle = load_action(IDLE_DATA[hero], 'idle')
    idle_px = frame_rgba(texture(idle['texture']), idle['frames'][0]['rect'], idle['scale'], PX_PER_UNIT)
    head = idle_px[:round(idle_px.shape[0] * HEAD_CUT[hero])]
    paste = idle_px[:round(idle_px.shape[0] * PASTE_CUT)]
    notes = []
    for cell, i in enumerate(idx):
        frame = data['frames'][i]
        x, y, w, h = frame['rect']
        k = data['scale'] * PX_PER_UNIT
        crop = tex.crop((x, y, x + w, y + h)).resize((round(w * k), round(h * k)), Image.LANCZOS)
        if REDRAW[key].get('pasteHead'):
            corr, sc, th, (bx, by, bw, bh) = fit(head, np.array(crop))
            if corr >= PASTE_CORR:
                # 舊頭（倍率 sc、旋轉 th）的下巴位置不動，換成倍率 1 的待機頭
                rad = np.radians(th)
                up = np.array([-np.sin(rad), -np.cos(rad)])
                cx, cy = bx + bw / 2, by + bh / 2
                grow = head.shape[0] * (1 - sc) / 2
                ncx, ncy = np.array([cx, cy]) + up * grow
                t = _warp(paste, 1.0, th)
                # 貼頭樣板比量頭樣板短（只到下巴）：兩者頂端對齊，中心差半個長度差
                shift = (head.shape[0] - paste.shape[0]) / 2
                ncx, ncy = np.array([ncx, ncy]) + up * shift
                big = Image.new('RGBA', (crop.width + 400, crop.height + 400), (0, 0, 0, 0))
                big.alpha_composite(crop, (200, 200))
                big.alpha_composite(Image.fromarray(t), (round(200 + ncx - t.shape[1] / 2), round(200 + ncy - t.shape[0] / 2)))
                ox, oy = 200, 200
                crop = big
            else:
                ox = oy = 0
            notes.append({'frame': i + 1, 'oldHead': sc, 'corr': corr, 'pasted': corr >= PASTE_CORR})
        else:
            ox = oy = 0
        col, row = cell % cols, cell // cols
        px = col * cw + cw / 2 - frame['pivot'][0] * k - ox
        py = row * ch + BASELINE * ch - frame['pivot'][1] * k - oy
        sheet.alpha_composite(crop, (round(px), round(py)))
    return sheet.convert('RGB'), notes


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in ('dangdang', 'fengfeng'):
        idle_sheet(hero).convert('RGB').save(REF / f'{hero}_idle.png')
    for key in REDRAW:
        for job in jobs_of(key):
            image, notes = pose_ref(job)
            image.save(REF / f'{stem(job)}_old.png')
            if notes:
                print(job, notes)
    print(f'參考圖已輸出到 {REF}')


def prompt_for(job: str) -> str:
    key, half = split_job(job)
    hero = key.split('/')[0]
    title, look, frames, avoid = MOVES[key]
    spec = REDRAW[key]
    cols, rows, idx = grid_of(job)
    n = len(idx)
    if spec.get('pasteHead'):
        guide = ('Reference image 2 is a rough paste-up LAYOUT GUIDE made from the old version of this very '
                 'animation, laid out exactly like the sheet you must draw: keep each pose, the body size, the '
                 'position inside the cell and the ground line from it. In the old version the head was drawn '
                 f'{spec["too"]} for the body, so in the guide a correctly sized head has been pasted over it '
                 '(its angle, expression and neck join are rough; a few cells still show the old small head). '
                 'Redraw every frame as one clean, freshly drawn character following the guide, with the head '
                 'exactly as large as in reference image 1 relative to the body (the same head-to-body ratio as the '
                 'idle) in EVERY frame, including the turning frames.')
    else:
        guide = ('Reference image 2 is the OLD version of this very animation, laid out exactly like the sheet you '
                 'must draw: keep each pose, the body size, the position inside the cell and the ground line from '
                 f'it, but in reference image 2 the head is drawn {spec["too"]} for the body. Redraw every frame so '
                 'the head is exactly as large as in reference image 1 relative to the body (same head-to-body ratio '
                 'as the idle), and keep that head size identical in every frame.')
    if half:
        part = (f'This image holds frames {idx[0] + 1}-{idx[-1] + 1} of the 8-frame animation. ')
        grid = (f'Exactly {n} sequential FULL BODY frames (frames {idx[0] + 1} to {idx[-1] + 1}) arranged in a precise '
                '2-column by 2-row equal-cell grid of wide cells, reading left to right then the next row. ')
        third = ('Reference image 3 is frames 1-4 of this same animation, already final: match its character size, '
                 'head size, colours and line quality exactly so frames 4 and 5 join seamlessly. ' if half == 'b' else '')
    else:
        part = ''
        grid = ('Exactly 8 sequential FULL BODY frames arranged in a precise 4-column by 2-row equal-cell grid, '
                'reading left to right then the next row. ')
        third = ''
    return (
        f'Create a production-ready transparent sprite sheet for {LOOK_OVERRIDE.get(hero, LOOK[hero])}. '
        "Reference image 1 is this character's CURRENT idle animation: copy the face, the HEAD SIZE, the "
        'head-to-body proportions, outfit, colours, clean dark hand-drawn contours and soft cel shading EXACTLY '
        'from it. '
        f'{guide} {third}'
        f'Animation: {title}. {part}{look} {EXTRA_LOOK.get(hero, "")} '
        f'{grid}Truly transparent RGBA background: no checkerboard drawing, no floor, no ground shadow, no glow, '
        'no text, no numbers, no borders, no grid lines, no labels. Each cell shows one complete cat facing RIGHT '
        'in the same three-quarter side view as reference image 1 (except where a frame below says otherwise), '
        'safely inside its own cell with ears, tail, paws, cloth tails and the whole sword fully visible and '
        'generous transparent margins (at least 6% of the cell on every side); cats and swords never touch or '
        'cross into the neighbouring cells. Uniform camera and identical character scale in every frame, the '
        'SAME scale as reference image 1 (a normal standing pose is about 62% of the cell height). Fixed ground '
        'baseline at 92% of each cell height: the soles stand on it in every frame, and nothing (no blade tip, '
        f'no tail) goes below the soles. Frames: {frames} {avoid} Every frame is a freshly drawn whole character '
        'with natural joints; no paper-cut limbs, no detached body parts, no motion lines, no speed lines, no '
        'slash trails, no extra characters.'
    )


# ── 生圖 ──────────────────────────────────────────────────────────────
_LOCK = threading.Lock()
MAX_ATTEMPTS = 4


def stem(job: str) -> str:
    return job.replace('/', '_').replace(':', '_')


def record_prompt(job: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(job, []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                         'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(job: str, note: str = '') -> tuple[str, int, str]:
    key, half = split_job(job)
    SOURCE.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{stem(job)}.try{attempt}.png').exists() or (SOURCE / f'{stem(job)}.try{attempt}.pending').exists():
            attempt += 1
        if attempt > MAX_ATTEMPTS:
            return job, attempt, f'已經生了 {MAX_ATTEMPTS} 次，不再生'
        (SOURCE / f'{stem(job)}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{stem(job)}.try{attempt}.png'
    text = prompt_for(job) + (f' {note}' if note else '')
    images = ['--image', str(REF / f'{key.split("/")[0]}_idle.png'), '--image', str(REF / f'{stem(job)}_old.png')]
    if half == 'b':
        first = SOURCE / f'{stem(key + ":a")}.png'
        if not first.exists():
            (SOURCE / f'{stem(job)}.try{attempt}.pending').unlink(missing_ok=True)
            return job, attempt, '前 4 格還沒選定，先 pick 前半'
        flat = Image.new('RGBA', SHEET, (255, 255, 255, 255))
        flat.alpha_composite(Image.open(first).convert('RGBA'))
        flat.convert('RGB').save(REF / f'{stem(key)}_first_half.png')
        images += ['--image', str(REF / f'{stem(key)}_first_half.png')]
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{SHEET[0]}x{SHEET[1]}', '--quality', 'high',
               '--prompt', text, *images, '--out', str(target), '--force']
    started = time.time()
    status = ''
    for retry in range(4):   # 限流就等一下再試，不降品質
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-400:]}'
        if not any(w in status.lower() for w in ('429', 'rate', 'limit', 'busy', 'timeout', '503', '502')):
            break
        time.sleep(60 * (retry + 1))
    (SOURCE / f'{stem(job)}.try{attempt}.pending').unlink(missing_ok=True)
    record_prompt(job, attempt, text, status)
    return job, attempt, f'{status}（{time.time() - started:.0f} 秒）'


# ── 檢查與打包 ──────────────────────────────────────────────────────────
def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cut_sheet(image: Image.Image, cols: int, rows: int, label: str) -> list[dict]:
    """在完全透明的空隙下刀，切出每一格的外框（整張圖座標）與格子中線。貼到整張圖的邊＝被切到。"""
    width, height = image.size
    alpha = np.array(image)[..., 3] > 16

    def gaps(axis_len: int, n: int, clear_at, radius_frac: float, what: str) -> list[int]:
        edges = [0]
        for k in range(1, n):
            nominal = round(axis_len * k / n)
            radius = round(axis_len / n * radius_frac)
            clear = [v for v in range(nominal - radius, nominal + radius) if clear_at(v)]
            if not clear:
                raise ArtError(f'{label}: {what}第 {k} 條空隙不乾淨，兩格黏在一起')
            edges.append(min(clear, key=lambda v: abs(v - nominal)))
        return edges + [axis_len]

    row_edges = gaps(height, rows, lambda y: not alpha[y].any(), .22, '橫向')
    out = []
    for r in range(rows):
        top, bottom = row_edges[r], row_edges[r + 1]
        col_edges = gaps(width, cols, lambda x: not alpha[top:bottom, x].any(), .16, f'第 {r + 1} 列直向')
        for c in range(cols):
            left, right = col_edges[c], col_edges[c + 1]
            ys, xs = np.nonzero(alpha[top:bottom, left:right])
            if not len(xs):
                raise ArtError(f'{label}: 第 {r * cols + c + 1} 格是空的')
            x0, y0, x1, y1 = left + xs.min(), top + ys.min(), left + xs.max() + 1, top + ys.max() + 1
            if x0 <= 1 or y0 <= 1 or x1 >= width - 1 or y1 >= height - 1:
                raise ArtError(f'{label}: 第 {r * cols + c + 1} 格貼到整張圖的邊，被切到了')
            out.append({'rect': [int(x0), int(y0), int(x1 - x0), int(y1 - y0)], 'center': (c + .5) * width / cols})
    return out


def single_character(image: Image.Image, rect, label: str) -> float:
    """最大一塊要佔全部不透明像素的 97% 以上，否則就是多畫了特效或第二隻。"""
    x, y, w, h = rect
    solid = np.array(image)[y:y + h, x:x + w, 3] > 16
    labels, count = ndimage.label(ndimage.binary_dilation(solid, iterations=2))
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    share = float(sizes.max() / sizes.sum())
    if share < MAIN_BODY:
        raise ArtError(f'{label}: 不只一隻或多畫了東西（最大一塊只佔 {share:.3f}）')
    return round(share, 4)


def feet_mid(alpha: np.ndarray) -> float:
    """腳掌踩地那一條（角色最底下 6%）的左右中點（格內座標）。"""
    solid = alpha > 16
    rows_ = np.flatnonzero(solid.any(axis=1))
    top, bottom = int(rows_[0]), int(rows_[-1])
    band = solid[bottom - round((bottom - top + 1) * FOOT_BAND) + 1:bottom + 1]
    cols_ = np.flatnonzero(band.any(axis=0))
    return (cols_[0] + cols_[-1]) / 2


def idle_feet_offset(hero: str) -> float:
    """新版待機第 1 格：定位點減兩腳中點（遊戲單位）。新圖的定位點照同樣的偏移放，出招時腳踩的位置才不橫移。"""
    idle = load_action(IDLE_DATA[hero], 'idle')
    f = idle['frames'][0]
    x, y, w, h = f['rect']
    alpha = np.array(texture(idle['texture']))[y:y + h, x:x + w, 3]
    return (f['pivot'][0] - feet_mid(alpha)) * idle['scale']


def head_gate(label: str, heads: list[float], loop: bool) -> None:
    bad = [(i + 1, h) for i, h in enumerate(heads) if abs(h - 1) > HEAD_LIMIT + 1e-9]
    if bad:
        raise ArtError(f'{label}: 頭部倍率超出待機 ±{HEAD_LIMIT:.0%}（第幾格, 倍率）：{bad}')
    pairs = list(zip(range(len(heads)), heads, heads[1:])) + ([(len(heads) - 1, heads[-1], heads[0])] if loop else [])
    jumps = [(i + 1, round(b / a - 1, 3)) for i, a, b in pairs if abs(b / a - 1) > HEAD_STEP + 1e-9]
    if jumps:
        raise ArtError(f'{label}: 相鄰格頭部倍率跳動超過 {HEAD_STEP:.0%}（第幾格→下一格, 變化）：{jumps}')


CACHE_VERSION = 3             # 量法一改就加一，舊的量測快取作廢


def check_image(job: str, path: Path) -> dict:
    """一張生圖的品質檢查＋換算比例尺（量測結果依圖檔雜湊快取在 `_cache/`，不進版控）。不合格丟 ArtError。"""
    cache = SOURCE / '_cache' / f'{stem(job)}_{sha(path)[:16]}_v{CACHE_VERSION}.json'
    if cache.exists():
        r = json.loads(cache.read_text(encoding='utf-8'))
        if 'error' in r:
            raise ArtError(r['error'])
        r['image'] = tidy(Image.open(path))
        return r
    try:
        r = _check_image(job, path)
    except ArtError as e:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps({'error': str(e)}, ensure_ascii=False), encoding='utf-8')
        raise
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({k: v for k, v in r.items() if k != 'image'}, ensure_ascii=False), encoding='utf-8')
    return r


def _check_image(job: str, path: Path) -> dict:
    key, _ = split_job(job)
    hero = key.split('/')[0]
    cols, rows, idx = grid_of(job)
    image = tidy(Image.open(path))
    a = np.array(image)[..., 3]
    if (int(a.min()), int(a.max())) != (0, 255):
        raise ArtError(f'{job}: 背景不是真透明（alpha 範圍 {a.min()}～{a.max()}）')
    if image.size != SHEET:
        raise ArtError(f'{job}: 圖的大小 {image.size} 不是 {SHEET}')
    cells = cut_sheet(image, cols, rows, job)
    shares = [single_character(image, c['rect'], f'{job} 第 {idx[i] + 1} 格') for i, c in enumerate(cells)]
    s0 = 1 / PX_PER_UNIT
    tmp = SOURCE / f'_{stem(job)}_tidy.png'
    image.save(tmp)
    frames = [{'rect': c['rect']} for c in cells]
    m0 = measure_frames(hero, tmp, frames, s0)
    # 生圖端常常沒照版面比例畫（整隻畫大兩三成），搜尋範圍（0.78～1.30）會頂到邊：
    # 換成「頭對齊待機」的比例尺重量，直到中位數落在 1±2%（最多四輪）
    s_img, m1 = s0, m0
    for _ in range(4):
        median = float(np.median([m['head'] for m in m1]))
        if abs(median - 1) <= .02 and m1 is not m0:
            break
        s_img /= median
        m1 = measure_frames(hero, tmp, frames, s_img)
    # 最後一輪順便量身體部件與腳掌位置
    m1 = measure_frames(hero, tmp, frames, s_img, parts_on=set(range(len(cells))))
    tmp.unlink(missing_ok=True)
    heads = [m['head'] for m in m1]
    bodies = [m['body'] for m in m1 if m.get('body') is not None]
    if not bodies:
        raise ArtError(f'{job}: 一個身體部件都認不出來（相關都低於 {PART_CORR}），量不到身體大小')
    body = float(np.median(bodies))
    if abs(body - 1) > BODY_LIMIT + 1e-9:   # 跟頭部閘門同一個浮點容差（量測是 0.01 一格，1.05 算在界內）
        raise ArtError(f'{job}: 頭對齊待機之後身體部件倍率 {body:.3f}（超出 ±{BODY_LIMIT:.0%}），頭身比還是畫偏了'
                       f'（版面比例下的頭 {[m["head"] for m in m0]}、各格身體 {[m.get("body") for m in m1]}）')
    # 腳底著地：認得出來的腳掌樣板，底邊要貼著這一格的最底下。劍尖比腳掌低一點（≤6% 身高）時，
    # 腳底線改用腳掌的位置（sole lift），不然定位點會落在劍尖、整隻貓浮起來；再低就不合格
    lifts = []
    for i, m in enumerate(m1):
        feet = [m['parts'][n] for n in FEET if m['parts'][n]['corr'] >= PART_CORR]
        if not feet:
            raise ArtError(f'{job}: 第 {idx[i] + 1} 格認不出腳掌，驗不了腳底著地')
        # 腳掌樣板比待機的腳底多 1 單位（樣板裁到 253、腳底在 252）
        lift = max(0.0, min(f['bottomGap'] for f in feet) + 1)
        if lift > FOOT_BAND * cells[i]['rect'][3] * s_img:
            raise ArtError(f'{job}: 第 {idx[i] + 1} 格腳掌離這格最底下 {lift:.1f} 單位，最底下不是腳（劍尖或尾巴？）')
        lifts.append(round(lift, 1) if lift > 2 else 0.0)
    return {'job': job, 'path': path.relative_to(ROOT).as_posix(), 'cells': cells, 'image': image, 'scale': s_img,
            'headAtLayout': [m['head'] for m in m0], 'head': heads, 'body': [m.get('body') for m in m1],
            'bodyMedian': round(body, 3), 'mainBodyShare': shares, 'frames': idx, 'soleLift': lifts}


def check_job(job: str, path: Path) -> dict:
    r = check_image(job, path)
    head_gate(job, r['head'], loop=False)
    return {k: v for k, v in r.items() if k not in ('image', 'cells')}


def resample_frame(image: Image.Image, rect, pivot_x: float, r: float, lift_px: float = 0) -> tuple[Image.Image, list[float]]:
    """裁一格（多留 3 像素）、縮放 r 倍，回傳緊貼外框的圖與定位點。
    x＝換算後的位置；y＝最底下那一排（腳底），劍尖比腳低時再往上 lift_px（原圖像素）到腳掌的位置。"""
    x, y, w, h = rect
    m = 3
    crop = image.crop((x - m, y - m, x + w + m, y + h + m))
    out = crop.resize((max(1, round(crop.width * r)), max(1, round(crop.height * r))), Image.LANCZOS)
    arr = np.array(out)
    alpha = arr[..., 3]
    alpha[alpha <= 2] = 0
    alpha[alpha >= 250] = 255
    arr[alpha == 0, :3] = 0
    ys, xs = np.nonzero(alpha)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    tight = Image.fromarray(np.ascontiguousarray(arr[y0:y1, x0:x1]), 'RGBA')
    px = (pivot_x - (x - m)) * r - x0
    py = int(y1 - y0 - 1) if lift_px <= 0 else round(float((y + h - 1 - lift_px - (y - m)) * r - y0), 2)
    return tight, [round(float(px), 2), py]


def align_halves(key: str, parts: list[dict], loop: bool) -> None:
    """拆兩張生的（封封）：兩張各自用頭的中位數對齊待機，但接縫（第 4→5 格）可能差 5%。
    兩張是分開生的，彼此的相對大小本來就是未知數，所以在 ±3%（前半）／±6%（後半）內各找一個微調倍率，
    讓整套相鄰格的最大跳動最小（其次讓離待機最遠的那格最近）；每格頭部倍率仍要在 ±5% 內。
    微調是整張一起縮放（同一張裡的格子彼此不動），身體部件跟著一起乘。"""
    a, b = parts
    best = None
    for ga in np.arange(.97, 1.0301, .005):
        for gb in np.arange(.94, 1.0601, .005):
            heads = [h * ga for h in a['head']] + [h * gb for h in b['head']]
            dev = max(abs(h - 1) for h in heads)
            if dev > HEAD_LIMIT:
                continue
            pairs = list(zip(heads, heads[1:])) + ([(heads[-1], heads[0])] if loop else [])
            jump = max(abs(y / x - 1) for x, y in pairs)
            score = (round(jump, 4), round(dev, 4), abs(ga - 1) + abs(gb - 1))
            if best is None or score < best[0]:
                best = (score, float(ga), float(gb))
    if best is None:
        raise ArtError(f'{key}: 兩張怎麼微調都有格子的頭超出 ±{HEAD_LIMIT:.0%}（前半 {a["head"]}、後半 {b["head"]}）')
    for part, g in ((a, best[1]), (b, best[2])):
        part['scale'] *= g
        part['head'] = [round(h * g, 3) for h in part['head']]
        part['body'] = [None if v is None else round(v * g, 3) for v in part['body']]
        part['seamFix'] = round(g, 3)
        bodies = [v for v in part['body'] if v is not None]
        if abs(float(np.median(bodies)) - 1) > BODY_LIMIT + 1e-9:
            raise ArtError(f'{part["job"]}: 接縫微調（×{g:.3f}）之後身體部件倍率 {np.median(bodies):.3f} 超出 ±{BODY_LIMIT:.0%}')


def build_redraw(errors: list[str]) -> dict:
    """選定的重畫圖全部檢查、換算、拼成圖集、在圖集上再量一次。不合格的記進 errors（這時還什麼都沒寫）。"""
    atlases = {}
    for atlas, spec in ATLAS.items():
        try:
            atlases[atlas] = build_atlas(atlas, *spec)
        except ArtError as e:
            errors.append(str(e))
    return atlases


def build_atlas(atlas: str, hero: str, out_dir: str, keys: list[str]) -> dict:
    picked = config().get('picked', {})
    if True:
        idle_scale = load_action(IDLE_DATA[hero], 'idle')['scale']
        offset_units = idle_feet_offset(hero)
        sets = []
        for key in keys:
            parts = []
            for job in jobs_of(key):
                if job not in picked:
                    raise ArtError(f'{job}: 還沒選定（pick）')
                parts.append(check_image(job, SOURCE / f'{stem(job)}.png'))
            if len(parts) == 2:
                align_halves(key, parts, loop=bool(load_action(REDRAW[key]['data'], key.split('/')[1]).get('loop')))
            # 定位點：第 1 格的兩腳中點＋待機的偏移，換成「離格子中線多少遊戲單位」，整套 8 格都照這個偏移
            first = parts[0]
            c0 = first['cells'][0]
            x, y, w, h = c0['rect']
            fm = x + feet_mid(np.array(first['image'])[y:y + h, x:x + w, 3])
            d_units = (fm - c0['center']) * first['scale'] + offset_units
            old = load_action(REDRAW[key]['data'], key.split('/')[1])
            frames, heads, bodies, tiles = [], [], [], []
            for part in parts:
                r = part['scale'] / idle_scale
                for cell, i, head, body, lift in zip(part['cells'], part['frames'], part['head'], part['body'],
                                                     part['soleLift']):
                    tile, pivot = resample_frame(part['image'], cell['rect'], cell['center'] + d_units / part['scale'], r,
                                                 lift / part['scale'])
                    tiles.append(tile)
                    frames.append({'pivot': pivot, 'duration': old['frames'][i]['duration']})
                    heads.append(head)
                    bodies.append(body)
            head_gate(key, heads, loop=bool(old.get('loop')))
            sets.append({'key': key, 'parts': parts, 'tiles': tiles, 'frames': frames, 'heads': heads,
                         'bodies': bodies, 'old': old, 'offsetUnits': round(d_units, 2)})
        # 拼圖集：每套 4 欄 × 2 列、格子一樣大，腳底貼在格子底下留 pad 的地方
        tiles = [t for s in sets for t in s['tiles']]
        pad = 12
        cw = max(t.width for t in tiles) + 2 * pad
        ch = max(t.height for t in tiles) + 2 * pad
        sheet = Image.new('RGBA', (cw * 4, ch * 2 * len(sets)), (0, 0, 0, 0))
        n = 0
        for s in sets:
            for tile, frame in zip(s['tiles'], s['frames']):
                col, row = n % 4, n // 4
                ox, oy = col * cw + (cw - tile.width) // 2, row * ch + ch - pad - tile.height
                sheet.alpha_composite(tile, (ox, oy))
                frame['rect'] = [int(ox), int(oy), tile.width, tile.height]
                n += 1
        # 在圖集上再量一次（畫面上真正畫的就是這張），再過一次閘門
        tmp = SOURCE / f'_{atlas}_atlas.png'
        sheet.save(tmp)
        _TEX.pop(str(tmp), None)
        for s in sets:
            final = measure_frames(hero, tmp, s['frames'], idle_scale)
            s['finalHeads'] = [m['head'] for m in final]
            print(f"{s['key']:22s} 生圖換算 {s['heads']} → 圖集 {s['finalHeads']}", flush=True)
            head_gate(f"{s['key']}（圖集）", s['finalHeads'], loop=bool(s['old'].get('loop')))
            for i, f in enumerate(s['frames']):
                single_character(sheet, f['rect'], f"{s['key']} 圖集第 {i + 1} 格")
        tmp.unlink(missing_ok=True)
        return {'hero': hero, 'target': ROOT / out_dir / f'{atlas}.webp', 'sheet': sheet, 'sets': sets,
                'scale': idle_scale}


def build_scale_fix(errors: list[str]) -> dict:
    """只改縮放的三套：量改後 8 格的頭、驗圖沒被切到。不合格的記進 errors。"""
    out = {}
    for key, spec in SCALE_FIX.items():
        try:
            out[key] = _scale_fix(key, spec)
        except ArtError as e:
            errors.append(str(e))
    return out


def _scale_fix(key: str, spec: dict) -> dict:
    if True:
        hero, action = key.split('/')
        data = load_action(spec['data'], action)
        fixed = spec['packed'] * spec['fix']
        if abs(data['scale'] - spec['packed']) > 1e-9 and abs(data['scale'] - fixed) > 1e-9:
            raise ArtError(f'{key}: 資料檔的 scale {data["scale"]} 既不是打包值也不是修正後的值，有人改過，先查清楚')
        heads = [m['head'] for m in measure_frames(hero, data['texture'], data['frames'], fixed)]
        print(f'{key:22s} 改後 {heads}', flush=True)
        head_gate(key, heads, loop=spec['loop'])
        a = np.array(texture(data['texture']))[..., 3]
        if (int(a.min()), int(a.max())) != (0, 255):
            raise ArtError(f'{key}: 圖集不是真透明')
        for i, f in enumerate(data['frames']):
            x, y, w, h = f['rect']
            if x == 0 or y == 0 or x + w >= a.shape[1] or y + h >= a.shape[0]:
                raise ArtError(f'{key}: 第 {i + 1} 格外框貼著圖邊，可能被切到')
            ring = np.concatenate([a[y - 1, x:x + w], a[y + h, x:x + w], a[y:y + h, x - 1], a[y:y + h, x + w]])
            if (ring > 16).any():
                raise ArtError(f'{key}: 第 {i + 1} 格外框外面緊貼著不透明像素，可能被切到')
            single_character(texture(data['texture']), f['rect'], f'{key} 第 {i + 1} 格')
        return {'spec': spec, 'scale': fixed, 'heads': heads, 'data': data}


def apply() -> None:
    errors: list[str] = []
    fixes = build_scale_fix(errors)
    atlases = build_redraw(errors)
    if errors:
        raise ArtError('閘門不合格，整批不寫：\n  ' + '\n  '.join(errors))
    cfg = config()
    before = cfg.get('before', {})
    prompts = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
    # ── 全部過了才開始寫 ──
    touched: dict[str, dict] = {}
    record = {'note': '2026-09-22 mix 批次動作圖大小修正：只改縮放的三套＋重畫的五套。量法與閘門見 tools/motion_size_fix_mix.py 檔頭。'
                      'headAtLayout＝照生圖版面比例（站高 62% 格高）量到的頭，1.29 是搜尋上限（生圖端畫得比版面大三成以上）；'
                      'headAfter＝圖集上重量的最終值；before＝改前（開分支那一版）的量測；body＝身體部件（腳掌、護臂、腰帶、尾巴、拳頭，'
                      '只採相關 ≥0.93 的）倍率，跑步、弓步的腳掌形狀變很多，身體數字只當參考。',
              'reproducer': 'python tools/motion_size_fix_mix.py apply',
              'gate': {'headLimit': HEAD_LIMIT, 'headStep': HEAD_STEP, 'bodyLimit': BODY_LIMIT, 'mainBody': MAIN_BODY},
              'scaleFix': {}, 'redraw': {}, 'atlases': {}}
    for key, f in fixes.items():
        data = touched.setdefault(f['spec']['data'], json.loads((ROOT / f['spec']['data']).read_text(encoding='utf-8')))
        data['actions'][key.split('/')[1]]['scale'] = f['scale']
        tex = ROOT / 'public' / f['data']['texture']
        record['scaleFix'][key] = {'packedScale': f['spec']['packed'], 'sizeFix': f['spec']['fix'], 'scale': f['scale'],
                                   'texture': f['data']['texture'], 'textureSha256': sha(tex),
                                   'bytes': tex.stat().st_size, 'godotOriginal': bool(f['spec'].get('godotOriginal')),
                                   'before': before.get(key), 'headAfter': f['heads']}
    for atlas, a in atlases.items():
        target = a['target']
        # 改前的大小照開分支那一版算（apply 可以重跑，不能拿已經換掉的檔當改前）
        old_bytes = int(subprocess.run(['git', 'cat-file', '-s', f'{BASE_COMMIT}:{target.relative_to(ROOT).as_posix()}'],
                                       cwd=ROOT, capture_output=True, text=True, check=True).stdout)
        tmp = target.with_suffix('.tmp.webp')
        a['sheet'].save(tmp, 'WEBP', lossless=True, method=6, exact=True)
        if Image.open(tmp).convert('RGBA').tobytes() != a['sheet'].tobytes():
            tmp.unlink()
            raise ArtError(f'{atlas}: 無損存檔讀回來不一樣')
        tmp.replace(target)
        rel_tex = f'{target.parent.relative_to(ROOT / "public").as_posix()}/{target.name}'
        jobs = []
        for s in a['sets']:
            action = s['key'].split('/')[1]
            data = touched.setdefault(REDRAW[s['key']]['data'],
                                      json.loads((ROOT / REDRAW[s['key']]['data']).read_text(encoding='utf-8')))
            entry = data['actions'][action]
            entry['texture'] = rel_tex
            entry['scale'] = a['scale']
            entry['frames'] = [{'rect': f['rect'], 'pivot': f['pivot'], 'duration': f['duration']} for f in s['frames']]
            jobs += [p['job'] for p in s['parts']]
            record['redraw'][s['key']] = {
                'texture': rel_tex, 'scale': a['scale'],
                'sources': [{'job': p['job'], 'path': p['path'], 'sha256': sha(ROOT / p['path']),
                             'attempt': cfg['picked'][p['job']], 'attemptsMade': len(prompts.get(p['job'], [])),
                             'headAtLayout': p['headAtLayout'], 'bodyMedian': p['bodyMedian'],
                             'seamFix': p.get('seamFix', 1.0)} for p in s['parts']],
                'feetOffsetUnits': s['offsetUnits'], 'before': before.get(s['key']),
                'headAfter': s['finalHeads'], 'bodyAfter': s['bodies']}
        record['atlases'][atlas] = {'target': target.relative_to(ROOT).as_posix(), 'sha256': sha(target),
                                    'bytes': target.stat().st_size, 'bytesBefore': old_bytes,
                                    'size': list(a['sheet'].size)}
        # 各批的打包紀錄也跟著換（測試拿它對雜湊，確認圖沒被別人動過）
        rec_path = ROOT / ASSET_RECORD[a['hero']]
        rec = json.loads(rec_path.read_text(encoding='utf-8'))
        for asset in rec['assets']:
            if asset['target'] == target.relative_to(ROOT).as_posix():
                asset.update({'source': '＋'.join(f'tools/motion-art-source/mix/{stem(j)}.png' for j in jobs),
                              'sourceSha256': '＋'.join(sha(SOURCE / f'{stem(j)}.png') for j in jobs),
                              'targetSha256': sha(target), 'bytes': target.stat().st_size,
                              'size': list(a['sheet'].size), 'rgbaExact': True,
                              'redrawn': '2026-09-22 mix 批次重畫（頭身比），紀錄見 docs/motion-size-fix-mix.json'})
        rec['uniqueBytes'] = sum(x['bytes'] for x in rec['assets'])
        dump_json(rec_path, rec)
    for path, data in touched.items():
        dump_json(ROOT / path, data)
    dump_json(RECORD, record)
    print(json.dumps({'scaleFix': list(fixes), 'redraw': [s['key'] for a in atlases.values() for s in a['sets']]},
                     ensure_ascii=False))


ALL = ['dangdang/run', 'dangdang/eat', 'dangdang/poison', 'fengfeng/thrust', 'fengfeng/double_slash', 'fengfeng/sweep',
       'qiuqiu/walk', 'qiuqiu/taiji']
DATA_OF = {**{k: v['data'] for k, v in SCALE_FIX.items()}, **{k: v['data'] for k, v in REDRAW.items()}}


def measure_cmd(actions: list[str], save_as: str = '') -> dict:
    """量現行資料每套 8 格的頭部倍率與身體部件倍率（改前、改後都可以量）。"""
    out = {}
    for key in actions or ALL:
        hero, action = key.split('/')
        data = load_action(DATA_OF[key], action)
        rows = measure_frames(hero, data['texture'], data['frames'], data['scale'],
                              parts_on=set(range(len(data['frames']))))
        out[key] = {'head': [m['head'] for m in rows], 'body': [m.get('body') for m in rows]}
        heads = ' '.join(f"{m['head']:.2f}" for m in rows)
        bodies = ' '.join('—' if m.get('body') is None else f"{m['body']:.2f}" for m in rows)
        print(f'{key:22s} 頭 {heads} ｜ 身體 {bodies}', flush=True)
    if save_as:
        data = config()
        data.setdefault(save_as, {}).update(out)
        dump_json(CONFIG, data)
    return out

# ── 聯絡表 ──────────────────────────────────────────────────────────────
BASE_COMMIT = '88c696b'       # 這一批開分支的地方＝改前
SHEET_OUT = ROOT / 'docs/審查報告/重畫_mix_2026-09-22.png'
HEADS_OUT = ROOT / 'docs/審查報告/重畫頭部_mix_2026-09-22.png'
LABEL = {'dangdang/run': '噹噹 跑步（縮放）', 'dangdang/eat': '噹噹 吃東西（重畫）', 'dangdang/poison': '噹噹 中毒（重畫）',
         'fengfeng/thrust': '封封 突刺（重畫）', 'fengfeng/double_slash': '封封 連斬（重畫）',
         'fengfeng/sweep': '封封 橫掃（重畫）', 'qiuqiu/walk': '球球 走路（縮放・原畫）',
         'qiuqiu/taiji': '球球 太極（縮放）'}


def _git_bytes(path: str) -> bytes:
    return subprocess.run(['git', 'show', f'{BASE_COMMIT}:{path}'], cwd=ROOT, capture_output=True, check=True).stdout


def _old_action(key: str) -> tuple[dict, Image.Image]:
    import io
    data = json.loads(_git_bytes(DATA_OF[key]).decode('utf-8'))['actions'][key.split('/')[1]]
    return data, Image.open(io.BytesIO(_git_bytes(f'public/{data["texture"]}'))).convert('RGBA')


def _font(size: int):
    from PIL import ImageFont
    for name in ('C:/Windows/Fonts/msjh.ttc', 'C:/Windows/Fonts/msyh.ttc'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def _frame_image(tex: Image.Image, frame: dict, scale: float, k: float) -> tuple[Image.Image, float, float]:
    x, y, w, h = frame['rect']
    s = scale * k
    im = tex.crop((x, y, x + w, y + h)).resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    return im, frame['pivot'][0] * s, frame['pivot'][1] * s


def sheet() -> None:
    """每套一列：待機第 1 格｜改前 8 格｜改後 8 格，同一個比例尺、同一條腳底線（紅線），灰虛線＝待機頭頂。
    另出一張頭部並排（待機頭｜改前頭｜改後頭，第 1 格與改前最偏的那一格），不進版控。"""
    from PIL import ImageDraw
    K = 0.8                                   # 1 遊戲單位 = 0.8 像素
    F, FS = _font(22), _font(16)
    rows, head_rows = [], []
    for key in ALL:
        hero, action = key.split('/')
        idle = load_action(IDLE_DATA[hero], 'idle')
        old, old_tex = _old_action(key)
        new = load_action(DATA_OF[key], action)
        new_tex = texture(new['texture'])
        cells = [('待機1', texture(idle['texture']), idle['frames'][0], idle['scale'])]
        cells += [(f'改前{i + 1}', old_tex, f, old['scale']) for i, f in enumerate(old['frames'])]
        cells += [(f'改後{i + 1}', new_tex, f, new['scale']) for i, f in enumerate(new['frames'])]
        imgs = [(lab, *_frame_image(tex, f, sc, K)) for lab, tex, f, sc in cells]
        left = max(px for _, _, px, _ in imgs) + 8
        right = max(im.width - px for _, im, px, _ in imgs) + 8
        up = max(py for _, _, _, py in imgs) + 34
        down = max(im.height - py for _, im, _, py in imgs) + 6
        cw, rh = round(left + right), round(up + down)
        gap = 18
        row = Image.new('RGBA', (cw * len(imgs) + gap * 2 + 260, rh), (44, 48, 58, 255))
        d = ImageDraw.Draw(row)
        d.text((8, 8), LABEL[key], font=F, fill=(255, 255, 255, 255))
        foot = up
        ox = 260
        for j, (lab, im, px, py) in enumerate(imgs):
            if j in (1, 9):
                ox += gap
            row.alpha_composite(im, (round(ox + left - px), round(foot - py)))
            d.text((ox + 4, 4), lab, font=FS, fill=(255, 255, 0, 255) if lab.startswith('改後') else (220, 220, 220, 255))
            ox += cw
        d.line((260, foot, row.width, foot), fill=(230, 70, 70, 255), width=2)
        top = foot - idle['frames'][0]['pivot'][1] * idle['scale'] * K
        for xx in range(260, row.width, 10):
            d.line((xx, top, xx + 5, top), fill=(170, 170, 170, 255))
        rows.append(row)
        # 頭部並排：待機頭、改前第 1 格與改前最偏那格、改後同兩格（照量到的位置裁，同一個比例尺）
        before = config().get('before', {}).get(key, {}).get('head') or [1.0] * len(old['frames'])
        worst = int(np.argmax([abs(h - 1) for h in before]))
        picks = [('待機', texture(idle['texture']), idle['frames'][0], idle['scale'])]
        for i in sorted({0, worst}):
            picks.append((f'改前{i + 1}（{before[i]:.2f}）', old_tex, old['frames'][i], old['scale']))
        after = RECORD.exists() and json.loads(RECORD.read_text(encoding='utf-8'))
        for i in sorted({0, worst}):
            h_after = ''
            if after:
                src = after['scaleFix'].get(key) or after['redraw'].get(key) or {}
                if src.get('headAfter'):
                    h_after = f"（{src['headAfter'][i]:.2f}）"
            picks.append((f'改後{i + 1}{h_after}', new_tex, new['frames'][i], new['scale']))
        z = 2.0
        base = idle_frame(hero, z)
        tpl = base[:round(base.shape[0] * HEAD_CUT[hero])]
        tiles = []
        for lab, tex, f, sc in picks:
            arr = frame_rgba(tex, f['rect'], sc, z)
            corr, s_, th, (bx, by, bw, bh) = fit(tpl, arr)
            m = 16
            im = Image.fromarray(arr).crop((bx - m, by - m, bx + bw + m, by + bh + m))
            tile = Image.new('RGBA', (im.width, im.height + 26), (60, 64, 74, 255))
            tile.alpha_composite(im, (0, 26))
            ImageDraw.Draw(tile).text((4, 2), lab, font=FS, fill=(255, 255, 0, 255))
            tiles.append(tile)
        hr = Image.new('RGBA', (sum(t.width + 10 for t in tiles) + 260, max(t.height for t in tiles) + 10),
                       (36, 40, 48, 255))
        ImageDraw.Draw(hr).text((8, 8), LABEL[key], font=F, fill=(255, 255, 255, 255))
        ox = 260
        for t in tiles:
            hr.alpha_composite(t, (ox, 5))
            ox += t.width + 10
        head_rows.append(hr)
    for out, parts in ((SHEET_OUT, rows), (HEADS_OUT, head_rows)):
        W = max(r.width for r in parts)
        S = Image.new('RGBA', (W, sum(r.height + 6 for r in parts)), (20, 20, 20, 255))
        y = 0
        for r in parts:
            S.alpha_composite(r, (0, y))
            y += r.height + 6
        out.parent.mkdir(parents=True, exist_ok=True)
        S.convert('RGB').save(out, optimize=True)
        print(out.relative_to(ROOT), S.size)

# ── 指令 ──────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    m = sub.add_parser('measure')
    m.add_argument('actions', nargs='*', help='hero/action，不給就量全部八套')
    m.add_argument('--save-as', default='', help='把量到的倍率存進 actions.json 的這一欄（before＝改前）')
    sub.add_parser('refs')
    p = sub.add_parser('prompt')
    p.add_argument('job', help='hero/action 或 hero/action:a')
    g = sub.add_parser('gen')
    g.add_argument('jobs', nargs='+')
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='', help='重生時補在提示詞最後的修正說明')
    c = sub.add_parser('check')
    c.add_argument('job')
    c.add_argument('attempt', type=int)
    k = sub.add_parser('pick')
    k.add_argument('job')
    k.add_argument('attempt', type=int)
    sub.add_parser('apply')
    sub.add_parser('sheet')
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'prompt':
        print(prompt_for(args.job))
    elif args.command == 'gen':
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for job, attempt, status in pool.map(lambda j: generate(j, args.note), args.jobs):
                print(f'{job} 第 {attempt} 次：{status}', flush=True)
    elif args.command == 'pick':
        chosen = SOURCE / f'{stem(args.job)}.try{args.attempt}.png'
        (SOURCE / f'{stem(args.job)}.png').write_bytes(chosen.read_bytes())
        data = config()
        data.setdefault('picked', {})[args.job] = args.attempt
        dump_json(CONFIG, data)
        print(f'{args.job} 採用第 {args.attempt} 次')
    elif args.command == 'check':
        report = check_job(args.job, SOURCE / f'{stem(args.job)}.try{args.attempt}.png')
        print(json.dumps(report, ensure_ascii=False))
    elif args.command == 'measure':
        measure_cmd(args.actions, args.save_as)
    elif args.command == 'apply':
        apply()
    else:
        sheet()


if __name__ == '__main__':
    main()
