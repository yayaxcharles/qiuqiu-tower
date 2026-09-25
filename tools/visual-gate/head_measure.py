"""畫面比對閘門：量頭（不量外框）。只在「圖或大小有變」的項目上跑。

量法照 2026-09-23 實機驗收 gate12/measure.py（那次量了四隻 24 種靜態、空手擲出 8 格、頭像、地圖頭像、選角）：
拿 **base 版戰鬥待機第 1 格的頭**（頭頂到下巴，HEAD_CUT）當樣板，換算到同一個比例尺（每個 CSS 像素 Z 個像素），
在目標圖上搜尋縮放 × 旋轉，最吻合的倍率＝這張的頭是 base 待機的幾倍。另外用「頭頂三成」再搜一次（閉眼、張嘴的表情靠它），
再拿左右翻過來的頭搜一次（臉朝反方向時）。相關係數 < 0.85 的當作量不準，交給人看。

用法：python head_measure.py <工作.json> <結果.json>
工作檔：{"templates": {hero: {"image", "rect"(可省), "scale"}}, "jobs": [{"id", "hero", "image", "rect"(可省), "scale", "lo", "hi", "boost"}]}
  scale＝這張圖每個原圖像素畫成幾個 CSS 像素（逐格動作是資料檔的 scale，戰鬥裡 1 單位＝1 CSS 像素）。
  boost：很小的圖（地圖頭像）先放大幾倍再搜，結果再除回來。
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np
from PIL import Image

HEAD_CUT = {'ninja': .47, 'feifei': .52, 'dangdang': .45, 'fengfeng': .47}
Z = 1.5
CUTS = ('head', .30)
_T: dict = {}
_SPEC: dict = {}


def _load(image: str, rect) -> Image.Image:
    im = Image.open(image).convert('RGBA')
    if rect:
        x, y, w, h = rect
        im = im.crop((x, y, x + w, y + h))
    return im


def _resized(img: Image.Image, k: float) -> Image.Image:
    return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)


def _template(hero: str, cut) -> np.ndarray:
    key = (hero, cut)
    if key not in _T:
        s = _SPEC[hero]
        idle = np.array(_resized(_load(s['image'], s.get('rect')), s['scale'] * Z))
        # 樣板只留頭：從不透明像素的頂端往下切（圖上方的透明邊不算）
        alpha = idle[..., 3] > 16
        rows = np.where(alpha.any(axis=1))[0]
        top, bot = (rows[0], rows[-1] + 1) if len(rows) else (0, idle.shape[0])
        c = HEAD_CUT[hero] if cut == 'head' else cut
        _T[key] = idle[top:top + round((bot - top) * c)]
    return _T[key]


def _search(head: np.ndarray, target: np.ndarray, scales, angles):
    tgt = np.where(target[..., 3:] > 64, target[..., :3], 128).astype(np.float32)
    tgt = cv2.copyMakeBorder(tgt, 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=(128, 128, 128))
    best = (-1.0, 1.0, 0)
    h, w = head.shape[:2]
    for s in scales:
        for th in angles:
            m = cv2.getRotationMatrix2D((w / 2, h / 2), th, float(s))
            cos, sin = abs(m[0, 0]), abs(m[0, 1])
            nw, nh = int(h * sin + w * cos) + 2, int(h * cos + w * sin) + 2
            m[0, 2] += nw / 2 - w / 2
            m[1, 2] += nh / 2 - h / 2
            t = cv2.warpAffine(head, m, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
            if nh >= tgt.shape[0] or nw >= tgt.shape[1] or nh < 4 or nw < 4:
                continue
            mask = (t[..., 3] > 128).astype(np.float32)
            if mask.sum() < 16:
                continue
            r = cv2.matchTemplate(tgt, t[..., :3].astype(np.float32), cv2.TM_CCORR_NORMED, mask=np.dstack([mask] * 3))
            r[~np.isfinite(r)] = -1
            v = float(r.max())
            if v > best[0]:
                best = (v, round(float(s), 3), th)
    return best


def _fit_one(head, target, lo, hi):
    scales = np.exp(np.arange(np.log(lo), np.log(hi), np.log(1.05)))
    coarse = _search(head, target, scales, range(-45, 46, 15))
    s0, th0 = coarse[1], coarse[2]
    return _search(head, target, np.arange(max(lo * .95, s0 - .05), s0 + .051, .01), range(th0 - 12, th0 + 13, 4))


def _init(spec):
    _SPEC.update(spec)


def _thumb(job: dict) -> tuple[int, int]:
    """逐格動作那一格照遊戲裡的大小（CSS 像素）存一張縮圖，深灰底，給報告並排看；回傳寬高（報告照同一個比例縮）"""
    im = _resized(_load(job['image'], job.get('rect')), float(job['scale']))
    bg = Image.new('RGBA', im.size, (46, 46, 52, 255))
    bg.alpha_composite(im)
    bg.convert('RGB').save(job['thumb'], quality=85)
    return im.size


def _pixdiff(a: str, rect_a, b: str, rect_b) -> dict:
    """兩張圖（或圖集裡的兩格）像素差多少：整體平均差、以及 16×16 區塊裡差最多的那一塊的平均差（0～255）。
    重新壓縮（無損 → q85）的雜訊：整體平均 < 1、最大區塊 < 6；真的改了圖：總有一塊差很多。透明的地方照不透明度算。"""
    ia, ib = _load(a, rect_a), _load(b, rect_b)
    if ia.size != ib.size:
        return {'sizeSame': False, 'sizeA': ia.size, 'sizeB': ib.size}
    x = np.asarray(ia, dtype=np.float32)
    y = np.asarray(ib, dtype=np.float32)
    # 顏色乘上不透明度再比（全透明的地方顏色是什麼都不重要）
    xa, ya = x[..., 3:] / 255, y[..., 3:] / 255
    d = np.concatenate([np.abs(x[..., :3] * xa - y[..., :3] * ya), np.abs(x[..., 3:] - y[..., 3:])], axis=2).mean(axis=2)
    h, w = d.shape
    B = 16
    ph, pw = (-h) % B, (-w) % B
    dp = np.pad(d, ((0, ph), (0, pw)))
    blocks = dp.reshape((h + ph) // B, B, (w + pw) // B, B).mean(axis=(1, 3))
    return {'sizeSame': True, 'mean': round(float(d.mean()), 3), 'maxBlock': round(float(blocks.max()), 2)}


SIMILAR_MEAN = 2.5
SIMILAR_BLOCK = 12.0


def measure(job: dict) -> tuple[str, dict]:
    try:
        if job.get('kind') == 'pixdiff':
            r = _pixdiff(job['a'], job.get('rectA'), job['b'], job.get('rectB'))
            r['similar'] = bool(r.get('sizeSame') and r['mean'] < SIMILAR_MEAN and r['maxBlock'] < SIMILAR_BLOCK)
            return job['id'], r
        hero = job['hero']
        # 有 twin（舊版同一格）：先比像素，幾乎一樣（重新壓縮之類）就不用量頭了
        if job.get('twin'):
            tw = job['twin']
            r = _pixdiff(job['image'], job.get('rect'), tw['image'], tw.get('rect'))
            if r.get('sizeSame') and r['mean'] < SIMILAR_MEAN and r['maxBlock'] < SIMILAR_BLOCK:
                return job['id'], {'similar': True, **r}
            _, mine = measure({k: v for k, v in job.items() if k != 'twin'})
            _, other = measure({**job, **tw, 'id': job['id'] + ':twin', 'twin': None})
            return job['id'], {**mine, 'pix': r, 'twinRes': other}
        tsize = _thumb(job) if job.get('thumb') else None
        boost = float(job.get('boost', 1))
        lo, hi = float(job.get('lo', .55)) * boost, float(job.get('hi', 1.8)) * boost
        target = np.array(_resized(_load(job['image'], job.get('rect')), float(job['scale']) * Z * boost))
        res = {str(cut): _fit_one(_template(hero, cut), target, lo, hi) for cut in CUTS}
        best_cut = max(res, key=lambda k: res[k][0])
        b = res[best_cut]
        s0 = b[1]
        flip = _search(_template(hero, 'head')[:, ::-1].copy(), target, np.arange(max(lo * .9, s0 - .09), s0 + .091, .02), range(-30, 31, 10))
        use = flip if flip[0] > b[0] else b
        return job['id'], {'scale': round(use[1] / boost, 4), 'corr': round(use[0], 3), 'angle': use[2], 'cut': best_cut,
                           'flip': flip[0] > b[0], 'headScale': round(res['head'][1] / boost, 4), 'headCorr': round(res['head'][0], 3),
                           'topScale': round(res['0.3'][1] / boost, 4), 'topCorr': round(res['0.3'][0], 3),
                           **({'thumb': job['thumb'], 'thumbW': tsize[0], 'thumbH': tsize[1]} if tsize else {})}
    except Exception as e:  # noqa: BLE001  一張量不到不該讓整批停下來
        return job['id'], {'err': f'{type(e).__name__}: {e}'}


def main() -> None:
    spec = json.load(open(sys.argv[1], encoding='utf-8'))
    jobs = spec['jobs']
    out = {}
    if jobs:
        with ProcessPoolExecutor(initializer=_init, initargs=(spec['templates'],)) as ex:
            for k, v in ex.map(measure, jobs, chunksize=1):
                out[k] = v
    json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
