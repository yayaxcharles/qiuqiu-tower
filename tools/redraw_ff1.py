"""菲菲五套出招動作重畫（批次 ff1，2026-09-22）：爪擊 attack1、格擋 guard、踢 kick、丟針 shuriken、跑步 run。

**為什麼要重畫**：09-20 那批跟新版待機第 1 格比，頭小了一成左右（0.85～0.92），出招時頭會縮一下。
量 8 格（不是只量第 1 格）之後確定不是「整隻一起小」：外框身高照 252 對齊了，頭卻只有 0.86～0.92，
腰（針筒）離地是待機的 1.1～1.5 倍、兩眼距 0.85～0.90——頭畫小、身體腿畫長，是比例畫偏，改縮放救不回來。
量法與數字見 `docs/審查報告/重畫_ff1_2026-09-22.png` 與 `docs/redraw-ff1-motion-assets.json`。

**生圖**（`gen`）：沿用 `gen_card_motion_art.py` 那一套（gpt-image-1.5、codex-oauth、真透明、4×2、
面向右、站高 62% 格高、腳底 92%），兩張參考圖都照同一個版面鋪白底（`refs`）：
  ① 新版待機**第 1 格**鋪滿 8 格——長相、頭的大小、頭身比、畫風一律照它（參考圖過期就會抄到舊版，所以每次現做）；
  ② 舊圖集那 8 格、照遊戲裡的比例排——只取「每一格在做什麼」（招式、節拍、朝向），比例不照抄。
每一次生圖存成 `<動作>.try<N>.png`（不覆蓋），選定才用 `pick` 複製成 `<動作>.png`。每套最多生 4 次。

**打包**（`pack`）：換掉既有動作的圖與逐格位置，**格數、順序、每格時長、命中／出手時間、是否循環一律沿用原資料**，
貼圖檔名也沿用（`kick_claw.webp` 原本下半張放了一套沒人用的爪擊，新圖只剩踢）。
  - 大小：先照舊規矩讓第 1 格外框＝252 單位，再量 8 格的頭部倍率，用中位數把頭對齊待機
    （外框量不出身體大小，頭才是玩家看得出來的地方）；對齊之後第 1 格外框必須在 252 的 ±6% 內，
    超出就代表頭身比又畫偏了（頭對了身體就太大／太小）。
  - 腳底：每格外框最底下＝腳底；跑步照舊版加「騰空高度」（遊戲單位，舊資料就是這樣做的）。
    兩腳中點：第 1 格的兩腳中點放在跟待機一樣的位置（相對定位點），其餘各格沿用同一個格內位置，
    保留圖裡畫的前後移動。

**閘門**（任何一項不合格丟 `ArtError`，整批不寫任何檔）：真透明、每格只有一隻（最大一塊 ≥97%）、
沒被切到、8 格每格頭部倍率在待機的 ±5% 內、相鄰格頭部倍率變化 ≤4%（循環動作連第 8→1 格也算）、
對齊後第 1 格外框在 252±6%、第 8 格回到第 1 格的架式（兩腳中點差 ≤10 單位）、著地格腳底線一致、
往定位點左邊伸出 ≤130 單位（站在戰場最左邊不會被切）。

用法：
    python tools/redraw_ff1.py refs
    python tools/redraw_ff1.py prompt kick
    python tools/redraw_ff1.py gen attack1 guard kick shuriken run --jobs 5
    python tools/redraw_ff1.py gen kick --note "修正說明"            # 重生時補在提示詞最後
    python tools/redraw_ff1.py check kick --path tools/motion-art-source/ff1/feifei/kick.try2.png
    python tools/redraw_ff1.py pick kick 2
    python tools/redraw_ff1.py pack                                  # 全部選定的一起打包（先全部檢查再寫）
    python tools/redraw_ff1.py measure                               # 量現行資料（改前／改後都用這個）
    python tools/redraw_ff1.py sheet                                 # 出聯絡表
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_idle_state_art import IMAGE_GEN, LOOK  # noqa: E402
from pack_idle_state_motion import ArtError, dump_json, index_sheet, tidy  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/ff1'
REF = SOURCE / '_ref'
CONFIG = SOURCE / 'actions.json'
PROMPTS = SOURCE / 'prompts.json'
DATA = ROOT / 'src/ui/feifei-motion-data.json'
RECORD = ROOT / 'docs/redraw-ff1-motion-assets.json'
HERO_RECORD = ROOT / 'docs/feifei-motion-assets.json'
REPORT = ROOT / 'docs/審查報告'
NATIVE_HEIGHT = 252
SHEET = (1536, 1024)      # gpt-image-1.5 最寬 1536×1024；一格 384×512
CHAR_HEIGHT = .62
BASELINE = .92
MAX_ATTEMPTS = 4

# 閘門數字
HEAD_TOL = .05            # 每格頭部倍率 ÷ 待機第 1 格：1±5%
HEAD_STEP = .04           # 相鄰格頭部倍率變化上限（不閃大小）
HEAD_CORR = .85           # 頭部比對的相關係數下限：低於這個代表找不到頭、量不準，不能放行
HEIGHT_TOL = .06          # 頭對齊後第 1 格外框 ÷ 252
MAIN_BODY = .97           # 每格最大一塊佔不透明像素的比例（只有一隻、沒有特效碎片）
GROUND_TOL = .025         # 同一列著地格腳底線最大落差（格高比例）
LAST_FEET = 10            # 第 8 格兩腳中點離第 1 格多少單位以內（播完接回待機不跳）
LEFT_REACH = 130          # 往定位點左邊伸出的上限（遊戲單位，見 pack_hit_recoil_motion.py 的說明）
FOOT_BAND = .06           # 「腳底那一條」取外框最底下的 6%

# 頭部量法（跟 `scratchpad/sizecheck/head_fit.py` 同一套）：待機第 1 格上方 52%（到下巴）當樣板，
# 在目標格上搜尋縮放 × 旋轉，帶遮罩的正規化相關找最吻合的倍率。同一個比例尺（遊戲單位 × Z）下比。
HEAD_CUT = .52
Z = 1.5

# 動作 → 貼圖檔名、標題、這一招在做什麼、8 格節拍、不要畫的東西
ACTION = {
    'attack1': (
        'claw.webp',
        'CLAW SWIPE (a single powerful close-range cat-claw strike)',
        'Fierce and quick: she coils, winds one paw back with three short ivory cat claws out, drives a full '
        'diagonal claw swipe toward the RIGHT at chest height, then recovers.',
        '1 guarded ready stance with both fists up, as in reference image 2 frame 1; 2 knees compress as the '
        'shoulders coil to the left; 3 the near paw winds back beside the left hip, three short ivory claws '
        'extend; 4 hips rotate to the right, elbow leads, paw close to the torso; 5 fully extended diagonal claw '
        'swipe toward the RIGHT at chest height while the other paw guards her chin (the hit frame, the widest '
        'pose); 6 the swipe follows through downward, torso tilts slightly; 7 claws retract and the paw recoils '
        'to the chest; 8 back to the guarded ready stance of frame 1.',
        'Feet stay planted on the ground line in every frame. The extended claws stay well inside the cell. '
        'No slash arcs, no speed lines, no particles, no weapons.',
    ),
    'guard': (
        'guard.webp',
        'GUARD (bracing into a defensive forearm block)',
        'Cautious and firm: she flexes her knees, raises her forearms into a tight protective X in front of the '
        'chest and chin, absorbs an invisible frontal hit with a small recoil, pushes the guard forward and '
        'settles back.',
        '1 relaxed cautious fighting stance with fists up, as in reference image 2 frame 1; 2 knees flex slightly '
        'as the paws rise; 3 one forearm across the chest, the other near the face; 4 both forearms cross in a '
        'tight protective X in front of the chest and chin; 5 a slight recoil from an invisible frontal hit, eyes '
        'squeezed, feet firm; 6 the body resists and pushes the guard forward a little; 7 shoulders soften but '
        'the wrists stay up; 8 back to the calm guarded ready stance of frame 1.',
        'Both feet planted on the ground line throughout, no travel. No shield object, no barrier, no hit spark, '
        'no effects.',
    ),
    'kick': (
        'kick_claw.webp',
        'FRONT KICK (a sharp martial front kick)',
        'Snappy and balanced: she guards her face, lifts the front knee high, snaps a full forward kick toward '
        'the RIGHT at waist height with the heel leading and the body leaning back slightly, then retracts and '
        'returns.',
        '1 ready fighting stance, as in reference image 2 frame 1; 2 paws guard the face, weight shifts onto the '
        'back foot; 3 the front knee rises high; 4 the thigh pivots forward, foot chambered; 5 sharp fully '
        'extended forward kick toward the RIGHT at waist height, heel leading, body leaning back slightly (the '
        'hit frame); 6 the knee retracts to the chest; 7 the foot lowers; 8 back to the ready stance of frame 1.',
        'The supporting foot stays planted on the ground line in every frame; only the kicking leg moves. Exactly '
        'two legs, no cartwheel, no jumping. The extended foot stays well inside the cell. No speed lines, no '
        'effects.',
    ),
    'shuriken': (
        'needle.webp',
        'PRECISE NEEDLE THROW (a quick right-handed throw of one small needle)',
        'Precise and swift: she reaches to the needle tubes at her belt, draws ONE small silver needle with a '
        'tiny purple grip beside her cheek, rotates her hips and whips the arm forward to release toward the '
        'RIGHT at shoulder level, then recovers.',
        '1 guarded ready stance, as in reference image 2 frame 1; 2 reaches to the needle tubes at the belt, '
        'knees compress; 3 holds ONE small silver needle beside her cheek, the other paw guards the chest; '
        '4 hips rotate, the throwing elbow leads swiftly, needle still in hand; 5 full forward release toward the '
        'RIGHT at shoulder level, fingers extended, torso follows through (the needle has just left her fingers '
        'and is NOT drawn); 6 the throwing arm continues slightly down, ponytail follows; 7 the hand retracts and '
        'the torso resets; 8 back to the ready stance of frame 1.',
        'Feet stay planted on the ground line in every frame. Draw the tiny held needle only in frames 3 and 4; '
        'the game draws the flying needle separately, so NO flying projectile, no trail, no arc, no star '
        'shuriken, no big weapons.',
    ),
    'run': (
        'run.webp',
        'RUN CYCLE (a looping run in place)',
        'A brisk, light run in place with a slight forward lean, alternating legs with contralateral arm swing, '
        'a moderate head bob, ponytail and tail following through.',
        '1 right foot forward contact, left arm forward and right arm back; 2 right knee compresses taking the '
        'weight, left leg passes; 3 right leg drives behind, left knee lifts, right arm comes forward; 4 flight '
        'with the left leg reaching ahead; 5 left foot forward contact, right arm forward and left arm back; '
        '6 left knee compresses, right leg passes; 7 left leg drives behind, right knee lifts, left arm comes '
        'forward; 8 flight with the right leg reaching ahead, leading back into frame 1.',
        'The run is IN PLACE: the body stays centred in its cell, no travelling. Draw every frame with the '
        'lowest foot on the ground line (the game adds the flight height itself). Both legs alternate clearly. '
        'No speed lines, no dust, no shadows, no effects.',
    ),
}

_LOCK = threading.Lock()


# ─────────────────────────── 共用：讀資料、量頭 ───────────────────────────

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_data() -> dict:
    return json.loads(DATA.read_text(encoding='utf-8'))


def idle_motion() -> dict:
    return load_data()['actions']['idle']


def crop_units(texture: Image.Image, frame: dict, scale: float, zoom: float = 1.0) -> Image.Image:
    """一格裁下來、縮成「遊戲單位 × zoom」的解析度。"""
    x, y, w, h = frame['rect']
    k = scale * zoom
    return texture.crop((x, y, x + w, y + h)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)


def _warp(t: np.ndarray, s: float, th: float) -> np.ndarray:
    h, w = t.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), th, s)
    cos, sin = abs(m[0, 0]), abs(m[0, 1])
    nw, nh = int(h * sin + w * cos) + 2, int(h * cos + w * sin) + 2
    m[0, 2] += nw / 2 - w / 2
    m[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(t, m, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))


def _score(target: np.ndarray, part: np.ndarray, s: float, th: float) -> float:
    t = _warp(part, s, th)
    if t.shape[0] >= target.shape[0] or t.shape[1] >= target.shape[1]:
        return -1.0
    mask = (t[..., 3] > 128).astype(np.float32)
    r = cv2.matchTemplate(target, t[..., :3].astype(np.float32), cv2.TM_CCORR_NORMED, mask=np.dstack([mask] * 3))
    r[~np.isfinite(r)] = -1
    return float(r.max())


def head_template() -> np.ndarray:
    idle = idle_motion()
    texture = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    base = np.array(crop_units(texture, idle['frames'][0], idle['scale'], Z))
    return base[:round(base.shape[0] * HEAD_CUT)]


def head_scale(template: np.ndarray, frame_rgba: np.ndarray) -> tuple[float, float]:
    """回傳（頭部倍率, 相關係數）。先粗搜（0.03、10 度）再細搜（0.01、2.5 度）。"""
    target = np.where(frame_rgba[..., 3:] > 64, frame_rgba[..., :3], 128).astype(np.float32)
    target = cv2.copyMakeBorder(target, 80, 80, 80, 80, cv2.BORDER_CONSTANT, value=(128, 128, 128))
    best = (-1.0, 1.0, 0.0)
    for s in np.arange(.76, 1.32, .03):
        for th in range(-30, 31, 10):
            v = _score(target, template, float(s), th)
            if v > best[0]:
                best = (v, float(s), float(th))
    _, s0, t0 = best
    for s in np.arange(s0 - .03, s0 + .031, .01):
        for th in np.arange(t0 - 7.5, t0 + 7.6, 2.5):
            v = _score(target, template, float(s), float(th))
            if v > best[0]:
                best = (v, float(s), float(th))
    return round(best[1], 3), round(best[0], 3)


def head_scales(texture: Image.Image, frames: list[dict], scale: float, workers: int = 8) -> list[tuple[float, float]]:
    template = head_template()
    crops = [np.array(crop_units(texture, f, scale, Z)) for f in frames]
    with ThreadPoolExecutor(max_workers=workers) as pool:   # OpenCV 放掉 GIL，執行緒就夠
        return list(pool.map(lambda c: head_scale(template, c), crops))


def feet_mid(alpha: np.ndarray) -> float:
    """格內：腳掌踩地那一條（外框最底下 6%）的左右中點。"""
    solid = alpha > 16
    rows = np.flatnonzero(solid.any(axis=1))
    top, bottom = int(rows[0]), int(rows[-1])
    band = solid[bottom - round((bottom - top + 1) * FOOT_BAND) + 1:bottom + 1]
    cols = np.flatnonzero(band.any(axis=0))
    return (cols[0] + cols[-1]) / 2


def frame_alpha(image: Image.Image, frame: dict) -> np.ndarray:
    x, y, w, h = frame['rect']
    return np.array(image.getchannel('A').crop((x, y, x + w, y + h)))


def idle_feet_offset() -> float:
    """新版待機第 1 格：兩腳中點在定位點右邊幾個遊戲單位。"""
    idle = idle_motion()
    texture = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    frame = idle['frames'][0]
    return (feet_mid(frame_alpha(texture, frame)) - frame['pivot'][0]) * idle['scale']


# ─────────────────────────── 參考圖 ───────────────────────────

def layout(texture: Image.Image, frames: list[dict], scale: float, units_px: float) -> Image.Image:
    """把 8 格照遊戲裡的比例排成 4×2、定位點在格子正中、腳底在 92%，鋪白底。units_px＝一個遊戲單位幾像素。"""
    cell_w, cell_h = SHEET[0] // 4, SHEET[1] // 2
    sheet = Image.new('RGBA', SHEET, (255, 255, 255, 255))
    for index, frame in enumerate(frames):
        crop = crop_units(texture, frame, scale, units_px)
        col, row = index % 4, index // 4
        px = col * cell_w + cell_w / 2 - frame['pivot'][0] * scale * units_px
        py = row * cell_h + BASELINE * cell_h - frame['pivot'][1] * scale * units_px
        sheet.alpha_composite(crop, (round(px), round(py)))
    return sheet


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    data = load_data()['actions']
    units_px = CHAR_HEIGHT * SHEET[1] / 2 / NATIVE_HEIGHT     # 252 單位＝格高 62%
    idle = data['idle']
    texture = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    layout(texture, [idle['frames'][0]] * 8, idle['scale'], units_px).convert('RGB').save(REF / 'feifei_idle1.png')
    for action in ACTION:
        motion = data[action]
        texture = Image.open(ROOT / 'public' / motion['texture']).convert('RGBA')
        layout(texture, motion['frames'], motion['scale'], units_px).convert('RGB').save(REF / f'feifei_{action}_old.png')
    print(f'參考圖已輸出到 {REF}')


# ─────────────────────────── 生圖 ───────────────────────────

def prompt_for(action: str) -> str:
    _, title, look, frames, avoid = ACTION[action]
    loop = action == 'run'
    ending = ('Frame 8 flows straight back into frame 1 because the cycle loops.' if loop else
              'Frame 8 must match frame 1 so the animation hands back smoothly to the idle loop.')
    return (
        f'Create a production-ready transparent sprite sheet for {LOOK["feifei"]}. '
        "Reference image 1 is this character's CURRENT idle frame repeated in every cell of the exact sheet "
        'layout: copy the face, the BIG round head, the head-to-body proportions, outfit, colours, clean dark '
        'hand-drawn contours and soft cel shading EXACTLY from it. Her head (from the ear tips to the chin) is '
        'about half of her whole standing height and her legs are short; keep exactly that head size in every '
        'frame, also while she crouches, kicks, runs or stretches. '
        'Reference image 2 is the OLD version of this very animation in the same layout: follow its choreography '
        'frame by frame (the same pose, the same beat and the same facing in each of the 8 cells), but it was '
        'drawn OFF-MODEL: its head is about 12% too small and its body and legs are too long. Do NOT copy its '
        'proportions or sizes; redraw every frame on-model with the head size and proportions of reference image 1. '
        f'Asset: {title} animation. {look} '
        'Exactly 8 sequential FULL BODY frames arranged in a precise 4-column by 2-row equal-cell grid, reading '
        'left to right then the next row. Truly transparent RGBA background: no checkerboard drawing, no floor, '
        'no ground shadow, no glow, no text, no numbers, no borders, no grid lines, no labels. Each cell shows '
        'one complete cat facing RIGHT in the same three-quarter side view as reference image 1, safely inside '
        'its own cell with ears, tail, feet, paws and ponytail fully visible and generous transparent margins '
        '(at least 8% of the cell on every side); cats never touch or overlap the neighbouring cells. '
        'Uniform camera and identical character scale in all 8 frames, the SAME size as in reference image 1 '
        '(standing about 62% of the cell height, with the head as big as in reference image 1), body centred '
        'horizontally in its cell, the whole move done in place without travelling sideways. Fixed ground '
        f'baseline at 92% of each cell height. Frames: {frames} The motion must read clearly at small size; '
        f'{ending} {avoid} Every frame is a freshly drawn whole character with natural joints; no paper-cut '
        'limbs, no detached body parts, no extra characters.'
    )


def record_prompt(action: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(f'feifei/{action}', []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                                        'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(action: str, note: str = '') -> tuple[str, int, str]:
    out_dir = SOURCE / 'feifei'
    out_dir.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (out_dir / f'{action}.try{attempt}.png').exists() or (out_dir / f'{action}.try{attempt}.pending').exists():
            attempt += 1
        if attempt > MAX_ATTEMPTS:
            return action, attempt, f'已生滿 {MAX_ATTEMPTS} 次，不再生'
        (out_dir / f'{action}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = out_dir / f'{action}.try{attempt}.png'
    text = prompt_for(action) + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{SHEET[0]}x{SHEET[1]}', '--quality', 'high',
               '--prompt', text, '--image', str(REF / 'feifei_idle1.png'),
               '--image', str(REF / f'feifei_{action}_old.png'), '--out', str(target), '--force']
    started = time.time()
    status = ''
    for retry in range(6):          # 三位助手同時在生：限流就等一下重試，不降品質
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-400:]}'
        if not any(k in result.stderr for k in ('429', 'rate', 'Rate', '502', '503', '504', 'timed out', 'Timeout')):
            break
        time.sleep(60 * (retry + 1))
    (out_dir / f'{action}.try{attempt}.pending').unlink(missing_ok=True)
    record_prompt(action, attempt, text, status)
    return action, attempt, f'{status}（{time.time() - started:.0f} 秒）'


# ─────────────────────────── 檢查與打包 ───────────────────────────

def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def check(action: str, path: Path | None = None) -> tuple[Image.Image, dict, dict]:
    """閘門＋逐格資料。不合格丟 ArtError；合格回傳（整理過的圖, 動作資料條目, 量到的數字）。"""
    label = f'feifei/{action}'
    spec = load_config()['actions'][action]
    old = load_data()['actions'][action]
    path = path or SOURCE / 'feifei' / f'{action}.png'
    image = tidy(Image.open(path))
    if image.size != SHEET:
        raise ArtError(f'{label}: 圖是 {image.size}，不是 {SHEET}')
    times = [round(f['duration'] * 1000) for f in old['frames']]
    frames = index_sheet(image, times, label)
    cell_w, cell_h = SHEET[0] / 4, SHEET[1] / 2

    # 只有一隻：每格最大一塊（稍微膨脹再算連通）要佔 97% 以上
    main_body = []
    for i, frame in enumerate(frames):
        solid = frame_alpha(image, frame) > 16
        labels, count = ndimage.label(ndimage.binary_dilation(solid, iterations=2))
        sizes = ndimage.sum(solid, labels, range(1, count + 1))
        share = float(sizes.max() / sizes.sum())
        main_body.append(round(share, 4))
        if share < MAIN_BODY:
            raise ArtError(f'{label}: 第 {i + 1} 格最大一塊只佔 {share:.1%}，旁邊多畫了東西（特效、碎片或第二隻）')

    # 著地：同一列每格外框最底下（腳底）要在同一條線上
    bottoms = [f['rect'][1] + f['rect'][3] for f in frames]
    for row in range(2):
        row_bottoms = bottoms[row * 4:row * 4 + 4]
        spread = (max(row_bottoms) - min(row_bottoms)) / cell_h
        if spread > GROUND_TOL:
            raise ArtError(f'{label}: 第 {row + 1} 列腳底線差了 {spread:.3f} 格高，有一格浮起來或沉下去')

    # 大小：先讓第 1 格外框＝252，量 8 格頭部倍率，用中位數對齊待機的頭
    base_scale = NATIVE_HEIGHT / frames[0]['rect'][3]
    raw = head_scales(image, frames, base_scale)
    low = [i + 1 for i, (_, c) in enumerate(raw) if c < HEAD_CORR]
    if low:
        raise ArtError(f'{label}: 第 {low} 格找不到吻合的頭（相關 {[raw[i - 1][1] for i in low]}），量不準不能放行')
    median = float(np.median([s for s, _ in raw]))
    scale = base_scale / median
    heads = [round(s / median, 3) for s, _ in raw]
    bad = [i + 1 for i, h in enumerate(heads) if abs(h - 1) > HEAD_TOL]
    if bad:
        raise ArtError(f'{label}: 第 {bad} 格頭部倍率 {[heads[i - 1] for i in bad]} 超出待機的 ±{HEAD_TOL:.0%}')
    pairs = list(zip(heads, heads[1:])) + ([(heads[-1], heads[0])] if old['loop'] else [])
    jumps = [round(abs(a - b), 3) for a, b in pairs]
    if max(jumps) > HEAD_STEP:
        raise ArtError(f'{label}: 相鄰格頭部倍率跳了 {max(jumps)}（上限 {HEAD_STEP}），出招時頭會閃大閃小')
    height = frames[0]['rect'][3] * scale / NATIVE_HEIGHT
    if abs(height - 1) > HEIGHT_TOL:
        raise ArtError(f'{label}: 頭對齊待機後第 1 格外框是 252 的 {height:.3f} 倍（容許 ±{HEIGHT_TOL:.0%}），'
                       '頭身比畫偏了')

    # 腳底定位：y＝外框最底下（跑步照舊加騰空高度）；x＝第 1 格兩腳中點對齊待機，其餘沿用同一個格內位置
    offset = idle_feet_offset()
    cell_x = frames[0]['rect'][0] + feet_mid(frame_alpha(image, frames[0])) - offset / scale   # 第 1 格在第 1 欄
    lifts = spec.get('lift', [0] * 8)
    for i, frame in enumerate(frames):
        x, y, w, h = frame['rect']
        frame['pivot'] = [round((i % 4) * cell_w + cell_x - x, 2), round(h - 1 + lifts[i] / scale, 2)]
    feet = [round((feet_mid(frame_alpha(image, f)) - f['pivot'][0]) * scale, 1) for f in frames]
    if abs(feet[-1] - feet[0]) > LAST_FEET and not old['loop']:
        raise ArtError(f'{label}: 第 8 格兩腳中點離第 1 格 {abs(feet[-1] - feet[0]):.1f} 單位（上限 {LAST_FEET}），接回待機會跳')
    reach = [round(f['pivot'][0] * scale, 1) for f in frames]
    if max(reach) > LEFT_REACH:
        raise ArtError(f'{label}: 往定位點左邊伸出 {max(reach)} 單位（上限 {LEFT_REACH}），站在戰場最左邊會被切掉')

    entry = {'texture': old['texture'], 'scale': scale, 'loop': old['loop'], 'frames': frames}
    for key in ('impactTimes', 'releaseTimes'):
        if key in old:
            entry[key] = old[key]
    metrics = {
        'headScales': heads, 'headCorr': [c for _, c in raw], 'headMaxStep': max(jumps),
        'firstFrameHeightRatio': round(height, 3), 'heightUnits': [round(f['rect'][3] * scale, 1) for f in frames],
        'feetMidOffsetUnits': feet, 'idleFeetMidOffsetUnits': round(offset, 2), 'leftReachUnits': reach,
        'mainBody': main_body,
    }
    return image, entry, metrics


def pack() -> None:
    config = load_config()['actions']
    staged = []
    for action in ACTION:
        path = SOURCE / 'feifei' / f'{action}.png'
        if not path.exists():
            print(f'略過 {action}：還沒有選定的圖')
            continue
        staged.append((action, path, *check(action, path)))   # 先全部檢查過，有一張不合格就整批不動
    if not staged:
        return
    data = load_data()
    hero_record = json.loads(HERO_RECORD.read_text(encoding='utf-8'))
    old_records = json.loads(RECORD.read_text(encoding='utf-8'))['assets'] if RECORD.exists() else []
    records = []
    for action, path, image, entry, metrics in staged:
        target = ROOT / 'public' / entry['texture']
        tmp = target.with_suffix('.tmp.webp')
        image.save(tmp, 'WEBP', lossless=True, method=6, exact=True)
        if Image.open(tmp).convert('RGBA').tobytes() != image.tobytes():
            tmp.unlink()
            raise ArtError(f'feifei/{action}: 無損存檔讀回來不一樣')
        tmp.replace(target)
        data['actions'][action] = entry
        for asset in hero_record['assets']:
            if asset['target'] == target.relative_to(ROOT).as_posix():
                asset.update({'source': path.relative_to(ROOT).as_posix(), 'sourceSha256': sha(path),
                              'targetSha256': sha(target), 'bytes': target.stat().st_size, 'size': list(image.size),
                              'redrawnBy': 'python tools/redraw_ff1.py pack（2026-09-22 重畫：頭部比例）'})
        before = config[action]['before']
        records.append({'hero': 'feifei', 'action': action, 'attempt': config[action].get('attempt'),
                        'source': path.relative_to(ROOT).as_posix(), 'sourceSha256': sha(path),
                        'target': target.relative_to(ROOT).as_posix(), 'targetSha256': sha(target),
                        'bytesBefore': before['bytes'], 'bytes': target.stat().st_size, 'size': list(image.size),
                        'scale': entry['scale'], 'headScalesBefore': before['headScales'], **metrics})
    hero_record['uniqueBytes'] = sum(a['bytes'] for a in hero_record['assets'])
    dump_json(DATA, data)
    dump_json(HERO_RECORD, hero_record)
    done = {r['action'] for r in records}
    dump_json(RECORD, {
        'note': '菲菲五套出招動作重畫（09-20 那批頭畫小一成、身體畫長）。headScales＝每格頭部大小 ÷ 新版待機第 1 格，'
                '由 tools/redraw_ff1.py 量圖得來；測試 tests/ui/feifei_redraw_ff1.test.ts 守這些數字與圖檔雜湊。',
        'generator': 'gpt-image-1.5（codex-oauth，真透明輸出）', 'reproducer': 'python tools/redraw_ff1.py pack',
        'gate': {'headTolerance': HEAD_TOL, 'headMaxStep': HEAD_STEP, 'headMinCorr': HEAD_CORR,
                 'firstFrameHeightTolerance': HEIGHT_TOL, 'mainBody': MAIN_BODY, 'leftReach': LEFT_REACH},
        'assets': [r for r in old_records if r['action'] not in done] + records,
    })
    print(json.dumps({'packed': sorted(done)}, ensure_ascii=False))


def measure(actions: list[str]) -> dict:
    """量現行資料（遊戲裡實際畫的比例）：每格頭部倍率。改前、改後都用這個，數字才能比。"""
    data = load_data()['actions']
    out = {}
    for action in actions:
        motion = data[action]
        texture = Image.open(ROOT / 'public' / motion['texture']).convert('RGBA')
        out[action] = head_scales(texture, motion['frames'], motion['scale'])
    return out


# ─────────────────────────── 聯絡表 ───────────────────────────

def _strip(texture: Image.Image, motion: dict, zoom: float, cell: int, height: int, base: int) -> Image.Image:
    strip = Image.new('RGBA', (cell * len(motion['frames']), height), (0, 0, 0, 0))
    for i, frame in enumerate(motion['frames']):
        crop = crop_units(texture, frame, motion['scale'], zoom)
        px = i * cell + cell / 2 - frame['pivot'][0] * motion['scale'] * zoom
        py = base - frame['pivot'][1] * motion['scale'] * zoom
        strip.alpha_composite(crop, (round(px), round(py)))
    return strip


def sheet(old_root: Path) -> None:
    """每套一列：待機第 1 格｜舊 8 格｜新 8 格，同比例、同一條腳底線。另出頭部並排（不提交）。"""
    import copy
    new = load_data()['actions']
    old_data = json.loads((old_root / 'src/ui/feifei-motion-data.json').read_text(encoding='utf-8'))['actions']
    zoom, cell, row_h, base = .72, 200, 240, 224
    gap, label_w = 20, 110
    width = label_w + cell * 17 + gap * 2
    out = Image.new('RGB', (width, row_h * len(ACTION) + 40), (246, 244, 238))
    draw = ImageDraw.Draw(out)
    font = None
    try:
        from PIL import ImageFont
        font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 22)
    except OSError:
        pass
    draw.text((label_w, 8), '待機第 1 格｜舊 8 格（09-20）｜新 8 格（重畫）　同比例、同一條腳底線（紅線）', fill=(40, 40, 40), font=font)
    idle = new['idle']
    idle_tex = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    heads = []
    for r, action in enumerate(ACTION):
        y0 = 40 + r * row_h
        one = copy.deepcopy(idle)
        one['frames'] = [idle['frames'][0]]
        row = Image.new('RGBA', (width, row_h), (0, 0, 0, 0))
        row.alpha_composite(_strip(idle_tex, one, zoom, cell, row_h, base), (label_w, 0))
        om = old_data[action]
        otex = Image.open(old_root / 'public' / om['texture']).convert('RGBA')
        row.alpha_composite(_strip(otex, om, zoom, cell, row_h, base), (label_w + cell + gap, 0))
        nm = new[action]
        ntex = Image.open(ROOT / 'public' / nm['texture']).convert('RGBA')
        row.alpha_composite(_strip(ntex, nm, zoom, cell, row_h, base), (label_w + cell * 9 + gap * 2, 0))
        bg = Image.new('RGBA', (width, row_h), (246, 244, 238, 255) if r % 2 == 0 else (236, 234, 228, 255))
        bg.alpha_composite(row)
        out.paste(bg.convert('RGB'), (0, y0))
        draw.line([(label_w, y0 + base), (width, y0 + base)], fill=(220, 40, 40), width=1)
        draw.text((10, y0 + row_h // 2 - 12), action, fill=(40, 40, 40), font=font)
        for x in (label_w + cell + gap // 2, label_w + cell * 9 + gap + gap // 2):
            draw.line([(x, y0 + 10), (x, y0 + row_h - 10)], fill=(150, 150, 150), width=2)
        # 頭部並排：待機頭｜舊頭｜新頭（第 1 格上方 52%，同比例）
        tiles = []
        for tex, motion in ((idle_tex, idle), (otex, om), (ntex, nm)):
            c = crop_units(tex, motion['frames'][0], motion['scale'], 2)
            idle_h = idle['frames'][0]['rect'][3] * idle['scale'] * 2
            box = Image.new('RGBA', (560, round(idle_h * HEAD_CUT) + 60), (246, 244, 238, 255))
            f = motion['frames'][0]
            px = 280 - f['pivot'][0] * motion['scale'] * 2
            py = box.height - 10 - (f['pivot'][1] * motion['scale'] * 2 - (idle_h * (1 - HEAD_CUT)))
            box.alpha_composite(c, (round(px), round(py)))
            tiles.append(box)
        heads.append(tiles)
    REPORT.mkdir(parents=True, exist_ok=True)
    # 聯絡表要進版控：調色盤壓縮（256 色，審查用看得清楚就好）
    out.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(REPORT / '重畫_ff1_2026-09-22.png', optimize=True)
    tile_w, tile_h = heads[0][0].size
    hs = Image.new('RGB', (tile_w * 3 + 150, tile_h * len(heads)), (246, 244, 238))
    hd = ImageDraw.Draw(hs)
    for r, (action, tiles) in enumerate(zip(ACTION, heads)):
        for c, tile in enumerate(tiles):
            hs.paste(tile.convert('RGB'), (150 + c * tile_w, r * tile_h))
        hd.text((10, r * tile_h + tile_h // 2), action, fill=(40, 40, 40), font=font)
    hs.save(REPORT / '重畫頭部_ff1_2026-09-22.png', optimize=True)
    print('聯絡表：', REPORT / '重畫_ff1_2026-09-22.png')


# ─────────────────────────── 入口 ───────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    p = sub.add_parser('prompt')
    p.add_argument('action', choices=ACTION)
    g = sub.add_parser('gen')
    g.add_argument('actions', nargs='+', choices=ACTION)
    g.add_argument('--jobs', dest='workers', type=int, default=5)
    g.add_argument('--note', default='')
    c = sub.add_parser('check')
    c.add_argument('action', choices=ACTION)
    c.add_argument('--path')
    k = sub.add_parser('pick')
    k.add_argument('action', choices=ACTION)
    k.add_argument('attempt', type=int)
    sub.add_parser('pack')
    m = sub.add_parser('measure')
    m.add_argument('actions', nargs='*')
    s = sub.add_parser('sheet')
    s.add_argument('--old-root', default=str(ROOT.parent / 'qiuqiu-coop'),
                   help='舊圖從哪裡讀（預設主資料夾，只讀）')
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'prompt':
        print(prompt_for(args.action))
    elif args.command == 'gen':
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for action, attempt, status in pool.map(lambda a: generate(a, args.note), args.actions):
                print(f'{action} 第 {attempt} 次：{status}', flush=True)
    elif args.command == 'check':
        _, entry, metrics = check(args.action, Path(args.path) if args.path else None)
        print(json.dumps({'ok': args.action, 'scale': round(entry['scale'], 4), **metrics}, ensure_ascii=False))
    elif args.command == 'pick':
        chosen = SOURCE / 'feifei' / f'{args.action}.try{args.attempt}.png'
        (SOURCE / 'feifei' / f'{args.action}.png').write_bytes(chosen.read_bytes())
        config = load_config()
        config['actions'][args.action]['attempt'] = args.attempt
        dump_json(CONFIG, config)
        print(f'{args.action} 採用第 {args.attempt} 次')
    elif args.command == 'pack':
        pack()
    elif args.command == 'measure':
        res = measure(args.actions or ['idle', *ACTION])
        for action, rows in res.items():
            s = [x for x, _ in rows]
            print(f'{action:9s} ' + ' '.join(f'{x:.2f}({c:.2f})' for x, c in rows) + f'   {min(s):.2f}～{max(s):.2f}')
    elif args.command == 'sheet':
        sheet(Path(args.old_root))


if __name__ == '__main__':
    main()
