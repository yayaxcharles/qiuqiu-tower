"""菲菲七套針招重畫的打包器（2026-09-22，批次 ff2）。

讀 `tools/motion-art-source/ff2/<動作>.png`（`gen_feifei_needle_redraw.py pick` 選定的那一次），做四件事：
  1. 透明度整理（`tidy`，跟待機狀態那批同一道）、切格（`index_sheet`，只在完全透明的空隙下刀）；
  2. 定大小：先照「第 1 格＝252 單位」換算，再量 8 格的頭（新版待機第 1 格的頭當樣板，帶遮罩顏色比對，
     搜尋縮放×旋轉），把 8 格頭部倍率的中位數修成 1.00——使用者看得到的毛病就是「出招時頭縮一圈」，
     所以直接對頭；
  3. 定腳底：第 1 格兩腳中點跟新版待機第 1 格對齊（同一個位移套到 8 格，鏡頭固定，招式裡的步伐照畫的留著）；
  4. 閘門（不合格丟 `ArtError`、整批停下、什麼都不寫——自檢只印不停＝沒檢查）：
       真透明、每格只有一隻、沒被切到、每格頭部倍率在待機的 ±5%、相鄰格頭部倍率變化 ≤4%、
       腳底著地（同一列的腳底線對齊）、第 1 格身高在待機的 ±6%（頭對了身高也對＝頭身比對了）、
       第 8 格回到第 1 格的架式、往左伸出定位點不超過 150 單位。
格數、順序、每格時長、出手時間照 09-20 那版（`TIMING`），打包後的資料再核一次，不一樣就停。

寫出：`public/assets/motion/feifei/<動作>_v3.webp`（無損）、`src/ui/feifei-needle-motion-data.json` 裡這七套
（撒針 `needle_fan` 借的是舊 `fan.webp`，不在這批，原封不動）、紀錄 `docs/feifei-needle-redraw-ff2.json`
（每格頭部倍率等量到的數字；測試 `tests/ui/feifei_needle_redraw.test.ts` 守它）。

用法：
    python tools/pack_feifei_needle_redraw.py --check needle_combo --path tools/motion-art-source/ff2/needle_combo.try1.png
    python tools/pack_feifei_needle_redraw.py                    # 打包七套已選定的（缺一套就停）
    python tools/pack_feifei_needle_redraw.py --measure-old      # 只量現行資料的頭部倍率（改前數字）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_feifei_needle_redraw import ACTIONS, CONFIG, SOURCE  # noqa: E402
from pack_idle_state_motion import ArtError, index_sheet, tidy  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'src/ui/feifei-needle-motion-data.json'
IDLE_DATA = ROOT / 'src/ui/feifei-motion-data.json'
RECORD = ROOT / 'docs/feifei-needle-redraw-ff2.json'
NATIVE_HEIGHT = 252

# 09-20 那版的每格時長（毫秒）與出手時間：飛針投射物照出手時間放出去，一格都不能動
TIMING = {
    'needle_combo': ([60, 80, 80, 70, 90, 70, 110, 120], [220, 380]),
    'needle_backhand': ([50, 70, 100, 40, 80, 90, 110, 160], [260]),
    'needle_pierce': ([60, 90, 90, 100, 80, 55, 100, 125], [420]),
    'needle_venom': ([60, 80, 100, 120, 70, 90, 140, 150], [360]),
    'needle_retreat': ([60, 65, 75, 60, 70, 90, 110, 140], [260]),
    'needle_rain': ([60, 90, 110, 90, 80, 120, 160, 170], [350]),
    'needle_barrage': ([60, 80, 100, 110, 70, 110, 150, 140], [350]),
}

HEAD_TOLERANCE = 0.05       # 每格頭部倍率 ÷ 待機：±5%
HEAD_STEP = 0.04            # 相鄰兩格頭部倍率差：≤4%（出招時頭不閃大小）
HEAD_MIN_CORR = 0.86        # 頭部比對的吻合度下限：低於這個代表頭畫走樣或轉開了，倍率量不準，不能放行
SIZE_FIX = (0.94, 1.06)     # 「第 1 格＝252 單位」到「頭對齊」要修多少：超出代表第 1 格不是待機的架式或頭身比畫錯
FIRST_HEIGHT = (0.94, 1.06)  # 修正後第 1 格外框身高 ÷ 待機外框身高
LAST_HEIGHT = (0.92, 1.08)  # 第 8 格外框身高 ÷ 第 1 格（播完直接接回待機）
LAST_FEET = 12              # 第 8 格兩腳中點離待機的兩腳中點多少遊戲單位以內
FEET_SHIFT = 40             # 第 1 格要把定位點挪多少才對齊待機的兩腳中點（遊戲單位）。只是防呆：待機自己的兩腳中點
                            # 就在定位點右邊 30 單位，生圖把兩腳畫在格子正中也要挪 30；超過 40 代表角色根本不在格子中間
GROUND_TOLERANCE = 0.025    # 某一格腳底比同一列腳底線（中位數）高出多少就算浮空（格高比例）
GROUND_SINK = 0.05          # 比同一列腳底線低多少以內可以直接壓回地面（格高比例）
MAIN_BODY = 0.97            # 每格最大一塊佔全部不透明像素的比例：低於這個就是多畫了飛針、特效或第二隻貓
EDGE_PX = 4                 # 每格外框離整張圖邊緣至少幾個像素
LEFT_REACH = 150            # 定位點左邊最多伸出去幾個遊戲單位（主角站在戰場最左邊，單人時腳底離畫面左緣 150）
FOOT_BAND = 0.06            # 「腳底那一條」取角色高度最底下的 6%

# 頭部比對（跟 scratchpad/sizecheck/head_fit.py 同一套：待機第 1 格上半 52% 當樣板、帶遮罩正規化相關）
HEAD_CUT = 0.52
FACE_ROWS = (0.22, 0.52)    # 「只有臉」樣板：待機第 1 格高度的 22%～52%（眼睛到下巴）
FACE_LEFT = 0.30            # 左邊 30% 切掉（後腦的馬尾那一側）；再窄（26%～52%、切 35%）會誤配到手上，試過
FACE_AGREE = 0.02           # 臉跟整顆頭量出來的倍率最多差多少，才算互相印證
Z = 2.0                     # 比對時的比例尺：一個遊戲單位 2 像素


class _Frame:
    """一格：圖集＋比例（一個像素幾個遊戲單位）→ 換成比對用的 RGBA 陣列。"""

    def __init__(self, atlas: Image.Image, rect: list[int], scale: float):
        x, y, w, h = rect
        s = scale * Z
        self.rgba = np.array(atlas.crop((x, y, x + w, y + h)).resize(
            (max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS))


def _warp(t: np.ndarray, s: float, th: float) -> np.ndarray:
    h, w = t.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), th, s)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw, nh = int(h * sin + w * cos) + 2, int(h * cos + w * sin) + 2
    M[0, 2] += nw / 2 - w / 2
    M[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(t, M, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))


def _search(tmpl: np.ndarray, target: np.ndarray, scales, rots) -> tuple[float, float, float]:
    tgt = np.where(target[..., 3:] > 64, target[..., :3], 128).astype(np.float32)
    tgt = cv2.copyMakeBorder(tgt, 80, 80, 80, 80, cv2.BORDER_CONSTANT, value=(128, 128, 128))
    best = (-1.0, 1.0, 0.0)
    for s in scales:
        for th in rots:
            t = _warp(tmpl, float(s), float(th))
            if t.shape[0] >= tgt.shape[0] or t.shape[1] >= tgt.shape[1]:
                continue
            mask = (t[..., 3] > 128).astype(np.float32)
            r = cv2.matchTemplate(tgt, t[..., :3].astype(np.float32), cv2.TM_CCORR_NORMED, mask=np.dstack([mask] * 3))
            r[~np.isfinite(r)] = -1
            v = float(r.max())
            if v > best[0]:
                best = (v, round(float(s), 3), float(th))
    return best


def head_fit(head: np.ndarray, target: np.ndarray) -> tuple[float, float, float]:
    """回傳（吻合度, 頭部倍率, 旋轉角）。先粗（0.70～1.30 每 0.03、±40° 每 8°）後細（±0.03 每 0.01、±6° 每 2°）。"""
    v, s, th = _search(head, target, np.arange(.70, 1.32, .03), range(-40, 41, 8))
    v2, s2, th2 = _search(head, target, np.arange(s - .03, s + .031, .01), np.arange(th - 6, th + 6.1, 2))
    return (v2, s2, th2) if v2 >= v else (v, s, th)


def feet_mid(alpha: np.ndarray) -> tuple[float, int]:
    """腳掌踩地那一條（角色最底下 6%）的左右中點、最底下那一排的列號（格內座標）。"""
    solid = alpha > 16
    rows = np.flatnonzero(solid.any(axis=1))
    top, bottom = int(rows[0]), int(rows[-1])
    band = solid[bottom - round((bottom - top + 1) * FOOT_BAND) + 1:bottom + 1]
    cols = np.flatnonzero(band.any(axis=0))
    return (cols[0] + cols[-1]) / 2, bottom


class Idle:
    """新版待機第 1 格：頭部樣板、外框身高、兩腳中點在定位點右邊幾單位。"""

    def __init__(self) -> None:
        idle = json.loads(IDLE_DATA.read_text(encoding='utf-8'))['actions']['idle']
        frame = idle['frames'][0]
        atlas = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
        x, y, w, h = frame['rect']
        base = _Frame(atlas, frame['rect'], idle['scale']).rgba
        self.head = base[:round(base.shape[0] * HEAD_CUT)]
        # 只有臉（眼睛到下巴、去掉後腦的耳朵蝴蝶結馬尾）：手舉過頭、擋到後腦那幾格的第二道量法
        self.face = base[round(base.shape[0] * FACE_ROWS[0]):round(base.shape[0] * FACE_ROWS[1]),
                         round(base.shape[1] * FACE_LEFT):]
        alpha = np.array(atlas)[y:y + h, x:x + w, 3]
        mid, _ = feet_mid(alpha)
        self.height = h * idle['scale']
        self.feet_offset = (mid - frame['pivot'][0]) * idle['scale']


def measure_heads(idle: Idle, atlas: Image.Image, frames: list[dict], scale: float) -> list[dict]:
    """每格的頭部倍率。整顆頭的吻合度不到下限（多半是舉過頭的手擋到後腦的馬尾、耳朵），就再用「只有臉」的樣板量一次：
    臉的吻合度要到下限、而且兩種量法的倍率差不到 FACE_AGREE，這一格才算量得準（倍率照用整顆頭的）；
    兩種都量不準、或兩種量出來不一樣，就記成量不準（`corr` 取兩者較高的，交給閘門擋下）。"""
    rows = []
    for frame in frames:
        target = _Frame(atlas, frame['rect'], scale).rgba
        corr, s, th = head_fit(idle.head, target)
        row = {'head': s, 'rotation': th, 'corr': round(corr, 3), 'method': 'head'}
        if corr < HEAD_MIN_CORR:
            fcorr, fs, _ = head_fit(idle.face, target)
            row.update({'faceHead': fs, 'faceCorr': round(fcorr, 3)})
            if fcorr >= HEAD_MIN_CORR and abs(fs - s) <= FACE_AGREE + 1e-9:
                row['method'] = 'face-confirmed'
        rows.append(row)
    return rows


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(action: str, path: Path, idle: Idle | None = None) -> tuple[Image.Image, dict, dict]:
    """品質檢查＋定大小與腳底。不合格丟 ArtError；合格回傳（整理後的圖、動作資料、量到的數字）。"""
    idle = idle or Idle()
    times, release = TIMING[action]
    image = tidy(Image.open(path))
    width, height = image.size
    frames = index_sheet(image, times, action)          # 真透明、切得開、沒被整張圖的邊緣切到
    alpha = np.array(image)[..., 3]
    cell_h = height / 2
    for i, frame in enumerate(frames):
        x, y, w, h = frame['rect']
        if x < EDGE_PX or y < EDGE_PX or x + w > width - EDGE_PX or y + h > height - EDGE_PX:
            raise ArtError(f'{action}: 第 {i + 1} 格貼到整張圖的邊緣（{frame["rect"]}），耳朵、手或尾巴可能被切掉')
        solid = alpha[y:y + h, x:x + w] > 16
        labels, count = ndimage.label(ndimage.binary_dilation(solid, iterations=2))
        sizes = ndimage.sum(solid, labels, range(1, count + 1))
        main = float(sizes.max() / sizes.sum())
        if main < MAIN_BODY:
            raise ArtError(f'{action}: 第 {i + 1} 格最大一塊只佔 {main:.1%}，旁邊多畫了東西（飛針、特效或另一隻貓）')
    # 腳底著地：打包時每格的定位點都在自己最底下，所以遊戲裡每格都踩在地上；這裡擋的是生圖畫了「跳起來、浮空」
    # 的格（腳底比同一列其他格的腳底線高出一截）——壓回地面會把那一下跳躍吃掉。比同一列低一點（例如收招那格
    # 整隻畫低了幾個像素）壓回地面剛好，不算錯；低太多代表那一格整隻畫大或畫歪，另外擋。
    ground_problems: list[str] = []
    for row in range(2):
        bottoms = [f['rect'][1] + f['rect'][3] for f in frames[row * 4:row * 4 + 4]]
        line = float(np.median(bottoms))
        for col, bottom in enumerate(bottoms):
            above, below = (line - bottom) / cell_h, (bottom - line) / cell_h
            if above > GROUND_TOLERANCE:
                ground_problems.append(f'第 {row * 4 + col + 1} 格腳底比同一列的腳底線高 {above:.3f} 格高（各格腳底 {bottoms}），畫成浮空了')
            if below > GROUND_SINK:
                ground_problems.append(f'第 {row * 4 + col + 1} 格腳底比同一列的腳底線低 {below:.3f} 格高（各格腳底 {bottoms}）')

    problems: list[str] = list(ground_problems)
    # 大小：先照第 1 格＝252 單位，再量頭、把中位數修成 1.00
    raw_scale = NATIVE_HEIGHT / frames[0]['rect'][3]
    raw = measure_heads(idle, image, frames, raw_scale)
    median = float(np.median([r['head'] for r in raw]))
    fix = round(1 / median, 4)
    if not SIZE_FIX[0] <= fix <= SIZE_FIX[1]:
        problems.append(f'頭要修 {fix:.3f} 倍才對得上待機（上限 {SIZE_FIX}）：第 1 格不是待機的架式，或頭身比畫錯了')
    scale = raw_scale * fix
    heads = measure_heads(idle, image, frames, scale)
    ratios = [r['head'] for r in heads]
    low = [i + 1 for i, r in enumerate(heads) if r['corr'] < HEAD_MIN_CORR and r['method'] != 'face-confirmed']
    if low:
        problems.append(f'第 {low} 格的頭跟待機對不起來（吻合度 {[heads[i - 1]["corr"] for i in low]}，'
                        f'只量臉 {[(heads[i - 1].get("faceHead"), heads[i - 1].get("faceCorr")) for i in low]}，'
                       f'下限 {HEAD_MIN_CORR}），頭畫走樣或轉開了，倍率量不準')
    bad = [i + 1 for i, r in enumerate(ratios) if abs(r - 1) > HEAD_TOLERANCE + 1e-9]
    if bad:
        problems.append(f'第 {bad} 格頭部倍率 {[ratios[i - 1] for i in bad]} 超出待機的 ±{HEAD_TOLERANCE:.0%}')
    steps = [round(abs(b - a), 3) for a, b in zip(ratios, ratios[1:])]
    jump = [i + 1 for i, d in enumerate(steps) if d > HEAD_STEP + 1e-9]
    if jump:
        problems.append(f'第 {jump} 格到下一格頭部倍率跳了 {[steps[i - 1] for i in jump]}（上限 {HEAD_STEP}），出招時頭會閃大小')
    first_height = round(frames[0]['rect'][3] * scale / idle.height, 3)
    if not FIRST_HEIGHT[0] <= first_height <= FIRST_HEIGHT[1]:
        problems.append(f'頭對齊後第 1 格身高是待機的 {first_height} 倍（容許 {FIRST_HEIGHT}），頭身比跟待機不一樣')
    last_height = round(frames[-1]['rect'][3] / frames[0]['rect'][3], 3)
    if not LAST_HEIGHT[0] <= last_height <= LAST_HEIGHT[1]:
        problems.append(f'第 8 格身高是第 1 格的 {last_height} 倍（容許 {LAST_HEIGHT}），接回待機會跳')

    # 腳底：第 1 格兩腳中點對齊待機，同一個位移套到 8 格
    def feet(frame: dict) -> float:
        x, y, w, h = frame['rect']
        mid, _ = feet_mid(alpha[y:y + h, x:x + w])
        return (mid - frame['pivot'][0]) * scale          # 兩腳中點在格子中心右邊幾單位
    offsets = [feet(f) for f in frames]
    shift = offsets[0] - idle.feet_offset                   # 定位點往右移幾單位，第 1 格兩腳中點就跟待機一樣
    if abs(shift) > FEET_SHIFT:
        problems.append(f'第 1 格兩腳中點離格子中心 {offsets[0]:.1f} 單位（待機 {idle.feet_offset:.1f}），生圖沒把角色放在格子中間')
    for frame in frames:
        frame['pivot'] = [round(frame['pivot'][0] + shift / scale, 2), frame['pivot'][1]]
    feet_after = [round(o - shift, 1) for o in offsets]     # 各格兩腳中點在定位點右邊幾單位
    if abs(feet_after[-1] - idle.feet_offset) > LAST_FEET:
        problems.append(f'第 8 格兩腳中點離待機 {feet_after[-1] - idle.feet_offset:.1f} 單位（上限 {LAST_FEET}），接回待機會橫移')
    reach = max(f['pivot'][0] * scale for f in frames)
    if reach > LEFT_REACH:
        problems.append(f'往左伸出定位點 {reach:.0f} 單位（上限 {LEFT_REACH}），站在戰場最左邊會被畫面切掉')

    durations = [round(f['duration'] * 1000) for f in frames]
    if problems:
        raise ArtError(f'{action}: ' + '；'.join(problems) + f'（頭部倍率 {ratios}、吻合度 {[r["corr"] for r in heads]}）')
    if durations != times or len(frames) != 8:
        raise ArtError(f'{action}: 每格時長 {durations} 跟原版 {times} 不一樣')
    entry = {'texture': f'assets/motion/feifei/{action}_v3.webp', 'scale': scale, 'loop': False, 'frames': frames,
             'releaseTimes': release}
    metrics = {
        'rawHeadScales': [r['head'] for r in raw], 'sizeFix': fix,
        'headScales': ratios, 'headCorr': [r['corr'] for r in heads], 'headRotation': [r['rotation'] for r in heads],
        'headMethod': [r['method'] for r in heads],
        'faceCheck': {str(i + 1): [r['faceHead'], r['faceCorr']] for i, r in enumerate(heads) if 'faceHead' in r},
        'headStepMax': max(steps), 'firstHeightRatio': first_height, 'lastHeightRatio': last_height,
        'feetMidOffsetUnits': feet_after, 'idleFeetMidOffsetUnits': round(idle.feet_offset, 1),
        'leftReachUnits': round(reach, 1),
    }
    return image, entry, metrics


def _check_selected(action: str) -> tuple[Image.Image, dict, dict]:
    return check(action, SOURCE / f'{action}.png')


def dump_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def pack() -> None:
    config = json.loads(CONFIG.read_text(encoding='utf-8'))['actions'] if CONFIG.exists() else {}
    missing = [a for a in ACTIONS if not (SOURCE / f'{a}.png').exists() or a not in config]
    if missing:
        raise ArtError(f'還沒選定：{missing}（先跑 gen_feifei_needle_redraw.py pick）')
    # 先全部檢查過一遍才開始寫：有一套不合格就整批不動（七套分開行程同時量，頭部比對一套要兩三分鐘）
    with ProcessPoolExecutor(max_workers=len(ACTIONS)) as pool:
        results = list(pool.map(_check_selected, ACTIONS))
    staged = [(action, *result) for action, result in zip(ACTIONS, results)]
    data = json.loads(DATA.read_text(encoding='utf-8'))
    old_textures = {a: data['actions'][a]['texture'] for a in ACTIONS}
    records = []
    for action, image, entry, metrics in staged:
        target = ROOT / 'public' / entry['texture']
        tmp = target.with_suffix('.tmp.webp')
        image.save(tmp, 'WEBP', lossless=True, method=6, exact=True)
        if not np.array_equal(np.array(Image.open(tmp).convert('RGBA')), np.array(image)):
            tmp.unlink()
            raise ArtError(f'{action}: 無損存檔讀回來不一樣')
        tmp.replace(target)
        data['actions'][action] = entry
        source = SOURCE / f'{action}.png'
        records.append({'action': action, 'attempt': config[action]['attempt'],
                        'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': sha(source),
                        'target': target.relative_to(ROOT).as_posix(), 'targetSha256': sha(target),
                        'bytes': target.stat().st_size, 'size': list(image.size), 'replaces': old_textures[action],
                        **metrics})
    dump_json(DATA, data)
    # 舊圖沒人用了就移掉（撒針借的 fan.webp 不在這批）
    used = {m['texture'] for m in data['actions'].values()}
    for texture in old_textures.values():
        if texture not in used and (ROOT / 'public' / texture).exists():
            (ROOT / 'public' / texture).unlink()
    dump_json(RECORD, {'generator': 'gpt-image-1.5（codex-oauth，真透明輸出）',
                       'reproducer': 'python tools/pack_feifei_needle_redraw.py',
                       'headTolerance': HEAD_TOLERANCE, 'headStep': HEAD_STEP, 'assets': records})
    print(json.dumps({'packed': [r['action'] for r in records]}, ensure_ascii=False))


def measure_old() -> None:
    idle = Idle()
    data = json.loads(DATA.read_text(encoding='utf-8'))['actions']
    for action in ACTIONS:
        motion = data[action]
        atlas = Image.open(ROOT / 'public' / motion['texture']).convert('RGBA')
        heads = measure_heads(idle, atlas, motion['frames'], motion['scale'])
        print(json.dumps({'action': action, 'texture': motion['texture'], 'headScales': [h['head'] for h in heads],
                          'headCorr': [h['corr'] for h in heads]}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', choices=ACTIONS, help='只檢查一張，不寫檔')
    parser.add_argument('--path', help='搭配 --check：檢查指定檔（例如還沒選定的某一次嘗試）')
    parser.add_argument('--measure-old', action='store_true', help='只量現行資料的頭部倍率')
    args = parser.parse_args()
    if args.measure_old:
        measure_old()
        return
    if args.check:
        path = Path(args.path) if args.path else SOURCE / f'{args.check}.png'
        _, entry, metrics = check(args.check, path)
        print(json.dumps({'ok': args.check, 'scale': entry['scale'], **metrics}, ensure_ascii=False))
        return
    pack()


if __name__ == '__main__':
    main()
