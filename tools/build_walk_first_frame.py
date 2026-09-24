"""過關走路轉場那張靜態圖＝跑步動作的第 1 格（2026-09-22，批次 walk）。

問題：過關的走路轉場（`src/ui/acttransition.ts`）先放一張靜態走路圖（`hero/<代號>_walk`），
逐格跑步動作載好才換上畫布。那張靜態圖還是舊畫風，淡入的前 0.17 秒看得到舊長相（複驗 2026-09-22，
球球、噹噹量到；菲菲、封封同一條路）。

做法（**不生圖**，同 `build_rest_art.py` 取格那一套）：把轉場裡畫布一開始畫的那一格
（`run` 動作第 1 格）照轉場的比例與落腳點畫進舊圖的畫布——檔名、畫布大小都不變：
  - 轉場的畫布：`createCompanionMotionActor(hero, { height: 250, action: 'run' })`（球球同），
    1 圖集像素 → `scale × 250/252` 舞台像素；落腳點（pivot）放在舞台 (465, 484)。
  - 靜態圖：`.actwalk-cat { left: 315px; bottom: 228px; width: 300px }`（`base.css`），畫布寬 560，
    1 畫布像素 → 300/560 舞台像素；畫布 (280, 畫布高 − 14.93) 那一點＝舞台 (465, 484)。
    **框原本是 250 寬、貼著落腳點**：跑步第 1 格照轉場比例畫，球球的頭巾尾巴、菲菲與封封的尾巴
    會超出 560×547 的畫布（左、上被切），所以框放大到 300、底下留 8 像素，畫布大小與檔名照舊。
  - 所以 1 圖集像素 → `scale × (250/252) × (560/300)` 畫布像素（略放大，用雙三次內插、先乘透明度再算，
    同瀏覽器的畫布），落腳點對到上面那一點，小數位也對準（仿射轉換，不四捨五入到整數像素）。

閘門（不合格整批不寫）：
  - 模擬兩條路在舞台上畫出來的樣子（畫布那條：圖集直接縮到舞台；靜態那條：靜態圖縮到舞台），
    不透明區域重疊率 ≥ 0.97、重心差 ≤ 0.35 像素；左右上三邊不能碰到畫布邊（沒被切到）。

用法：
    python tools/build_walk_first_frame.py            # 算＋閘門，全過才寫檔與紀錄
    python tools/build_walk_first_frame.py --dry-run
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_rest_art import SPRITE_KEY, actions, encode, texture  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / 'tools/motion-art-source/walk/record.json'
HEROES = ['qiuqiu', 'feifei', 'dangdang', 'fengfeng']
ACTION = 'run'
# 轉場的數字（acttransition.ts 與 base.css；測試會回頭對原始碼）
ACTOR_HEIGHT, NATIVE_HEIGHT = 250, 252
FOOT_STAGE = (465, 484)
CAT_LEFT, CAT_BOTTOM, CAT_WIDTH, STAGE_H = 315, 228, 300, 720
MARGIN = 6
MIN_IOU, MAX_CENTROID = .97, .35


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def affine(src: Image.Image, size: tuple[int, int], k: float, src_pt: tuple[float, float], dst_pt: tuple[float, float]) -> Image.Image:
    """把 src 放大縮小 k 倍，src_pt 那一點（連續座標）落在輸出的 dst_pt。先乘透明度再內插（同瀏覽器畫布）。"""
    a, c = 1 / k, src_pt[0] - dst_pt[0] / k
    e, f = 1 / k, src_pt[1] - dst_pt[1] / k
    out = src.convert('RGBa').transform(size, Image.Transform.AFFINE, (a, 0, c, 0, e, f), resample=Image.Resampling.BICUBIC)
    return out.convert('RGBA')


def alpha_stats(a: np.ndarray) -> tuple[np.ndarray, tuple[float, float]]:
    w = a.astype(np.float64)
    ys, xs = np.indices(a.shape)
    return a > 64, (float((xs * w).sum() / w.sum()), float((ys * w).sum() / w.sum()))


def build(hero: str, record: dict, errs: list[str]) -> tuple[str, bytes]:
    key = SPRITE_KEY[hero]
    rel = f'public/assets/sprites/hero/{key}_walk.webp'
    old = Image.open(ROOT / rel)
    size = old.size                                        # 畫布照舊：560×547（封封 560×560）
    m = actions(hero)[ACTION]
    fr = m['frames'][0]
    x, y, w, h = fr['rect']
    px, py = fr['pivot']
    tex = texture(m['texture'])
    crop = tex.crop((x - MARGIN, y - MARGIN, x + w + MARGIN, y + h + MARGIN))
    pivot_crop = (px + MARGIN, py + MARGIN)
    k = m["scale"] * ACTOR_HEIGHT / NATIVE_HEIGHT * size[0] / CAT_WIDTH   # 圖集→舞台（轉場畫布）÷ 畫布→舞台（靜態圖）
    pivot_canvas = (size[0] * (FOOT_STAGE[0] - CAT_LEFT) / CAT_WIDTH, size[1] - (STAGE_H - CAT_BOTTOM - FOOT_STAGE[1]) * size[0] / CAT_WIDTH)
    canvas = affine(crop, size, k, pivot_crop, pivot_canvas)
    arr = np.array(canvas)[..., 3]
    if arr[:, :2].max() or arr[:, -2:].max() or arr[:2, :].max():
        errs.append(f'{rel}：碰到畫布的左、右或上邊（被切到）')
    # 腳底線以下被畫布底邊切掉的量（圖集像素的透明度總和，跟整格比）
    ca = np.array(crop)[..., 3].astype(np.float64)
    cut = ca[int(np.ceil(pivot_crop[1])):, :].sum() / ca.sum()
    # 閘門：兩條路畫到舞台上（取落腳點周圍 400×400）比一比
    patch = (400, 400)
    at = (200.0, 330.0)                                    # 落腳點在這塊裡的位置
    actor_scale = m['scale'] * ACTOR_HEIGHT / NATIVE_HEIGHT
    via_actor = affine(crop, patch, actor_scale, pivot_crop, at)
    data = encode(canvas)
    decoded = Image.open(io.BytesIO(data)).convert('RGBA')
    via_static = affine(decoded, patch, CAT_WIDTH / size[0], pivot_canvas, at)
    ma, ca_ = alpha_stats(np.array(via_actor)[..., 3])
    ms, cs = alpha_stats(np.array(via_static)[..., 3])
    iou = float((ma & ms).sum() / (ma | ms).sum())
    dc = max(abs(ca_[0] - cs[0]), abs(ca_[1] - cs[1]))
    both = ma & ms
    rgb = float(np.abs(np.array(via_actor)[..., :3].astype(int) - np.array(via_static)[..., :3].astype(int))[both].mean())
    if iou < MIN_IOU or dc > MAX_CENTROID:
        errs.append(f'{rel}：跟轉場畫布第 1 格對不上（重疊 {iou:.3f}、重心差 {dc:.2f} 像素）')
    record[rel] = {
        'file': rel, 'canvas': list(size), 'hero': hero, 'action': ACTION, 'frame': 0,
        'texture': m['texture'], 'textureSha256': sha((ROOT / 'public' / m['texture']).read_bytes()),
        'rect': fr['rect'], 'pivot': fr['pivot'], 'scale': m['scale'],
        'canvasPerAtlasPx': round(k, 6), 'pivotCanvas': [round(v, 4) for v in pivot_canvas],
        'cutBelowFoot': round(cut, 4), 'stageIou': round(iou, 4), 'stageCentroidDiff': round(dc, 3),
        'stageMeanRgbDiff': round(rgb, 2), 'sha256': sha(data),
    }
    print(f'{hero:9s} {m["texture"]} 第 1 格 → {rel}（每圖集像素 {k:.4f} 畫布像素；舞台上重疊 {iou:.3f}、重心差 {dc:.2f}、'
          f'顏色平均差 {rgb:.1f}；腳底線下切掉 {cut:.2%}）')
    return rel, data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    record: dict = {}
    errs: list[str] = []
    outs = [build(hero, record, errs) for hero in HEROES]
    if errs:
        print('\n!! 閘門沒過，整批停下、一個檔都沒寫：', file=sys.stderr)
        for e in errs:
            print('  - ' + e, file=sys.stderr)
        sys.exit(1)
    if args.dry_run:
        print('（--dry-run：沒寫檔）')
        return
    for rel, data in outs:
        (ROOT / rel).write_bytes(data)
    RECORD.parent.mkdir(parents=True, exist_ok=True)
    RECORD.write_text(json.dumps(record, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'寫了 {len(outs)} 個檔；紀錄 {RECORD.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
