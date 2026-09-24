"""挨打新畫風立繪的打包器（2026-09-22）。

讀 `tools/motion-art-source/hit-recoil/<角色>.png`（`gen_hit_recoil_art.py pick` 選定的那一次），
做三件事：
  1. 透明度整理（`tidy`，跟待機狀態那批同一道：補滿 253～254 的不透明、清掉背景灰塵，不動顏色）；
  2. 品質檢查（不合格就丟例外、整支停下、什麼都不寫——過去的教訓：自檢只印不停＝沒檢查）；
  3. 裁掉空白、縮成跟該角色新版待機圖集一樣的解析度，存成無損 webp（`public/assets/motion/<角色>/hit_recoil.webp`），
     逐格資料寫進 `src/ui/hit-recoil-motion-data.json`，量到的數字寫進 `docs/hit-recoil-motion-assets.json`。

**大小怎麼換算**：生圖時參考圖①是新版待機第 1 格、站高 60% 畫布（`gen_hit_recoil_art.py` 的
`CHAR_HEIGHT`），新圖照同一個版面畫。所以「畫布高 × 60%」就是遊戲裡的 252 單位，挨打圖先照這個比例換算，
不另外拉成 252——挨打時身體往後仰，本來就比站著矮一點，硬拉成一樣高反而會讓整隻貓變大。

**再乘一個每隻的大小修正（`SIZE_FIX`，2026-09-22 下午）**：生圖端不一定照參考圖的大小畫。
第一版只看外框身高（±10%），封封外框是待機的 1.035 倍、看起來合格，實際上頭和身體都大了一成五左右——
往後仰、膝蓋彎，外框本來就該變矮，外框一樣高代表身體畫大了。**外框身高量不出身體大小**，
所以改成把挨打的頭轉正、跟待機的頭同比例並排比（`docs/審查報告/挨打大小修正_2026-09-22.png`），
照這個結果訂每隻的倍率。挨打的姿勢與表情跟待機差太多，自動比對頭部大小不準（試過帶遮罩的顏色比對、
特徵點比對、輪廓比對，挨打圖的吻合度都偏低、倍率常卡在搜尋邊界），所以倍率是人眼並排訂的、寫死在這裡，
測試（`tests/ui/hit_recoil_motion.test.ts`）守住它：拿掉修正、或只改資料檔不改這裡，測試會變紅。

**腳底怎麼對齊**：量兩張圖「最底下那一小條」（腳掌踩地的範圍）的左右中點。
新版待機的定位點不一定在兩腳正中間（菲菲的定位點是生圖格子的中心，比兩腳中點偏左一點），
所以挨打圖的定位點＝挨打圖兩腳中點，再往同一個方向偏移同樣多的遊戲單位。
這樣一挨打，兩隻腳踩的位置跟待機時一樣，不會橫移；腳底那一排像素正好落在地面線上。

用法：
    python tools/pack_hit_recoil_motion.py --check feifei --path tools/motion-art-source/hit-recoil/feifei.try2.png
    python tools/pack_hit_recoil_motion.py                 # 打包四隻已選定的
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_hit_recoil_art import CHAR_HEIGHT, HEROES, SOURCE  # noqa: E402
from gen_idle_state_art import IDLE_DATA  # noqa: E402
from pack_idle_state_motion import ArtError, tidy  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CONFIG = SOURCE / 'actions.json'
DATA = ROOT / 'src/ui/hit-recoil-motion-data.json'
RECORD = ROOT / 'docs/hit-recoil-motion-assets.json'
NATIVE_HEIGHT = 252
# 解析度（一個遊戲單位用幾個像素）跟該角色新版待機圖集一樣：球球 1.61、菲菲與封封 1.21、噹噹 0.90。
# 2026-09-22 第一版存成 2 倍，比待機清楚、檔案也大（135～200 KB）；挨打是從待機直接切過去的，
# 兩張清晰度一致比較不跳，檔案也小三到七成。壓縮方式照其他逐格動作圖：133 張全部是無損（VP8L）
PAD = 2                      # 裁切外框多留的透明邊（反鋸齒那一圈）
# 每隻的大小修正（乘在「照參考圖比例換算」之後）。訂法見檔頭；要改先重出並排圖再改
SIZE_FIX = {
    'qiuqiu': 0.95,    # 頭略大（約 5%）
    'feifei': 1.00,
    'dangdang': 1.00,  # 銅護臂面積比 1.00，頭與身體都對得上
    'fengfeng': 0.86,  # 頭與褲子都大一成五左右；0.84／0.86／0.88 並排比過，0.86 最接近
}
# 生圖端有沒有照參考圖的版面畫：外框身高 ÷ 參考圖裡待機的外框身高（修正前）。這條只擋「整張畫錯比例」，
# 不是大小對不對的判準（大小看上面的 SIZE_FIX）
DRAWN_HEIGHT_RATIO = (0.90, 1.10)
# 修正後的外框身高 ÷ 待機外框身高：只當防呆（往後仰、膝蓋彎會比待機矮，封封修正後是 0.89）
SHOWN_HEIGHT_RATIO = (0.80, 1.10)
MAIN_BODY = 0.97             # 最大一塊要佔全部不透明像素的比例：低於這個就是多畫了星星、特效或第二隻貓
EDGE = 0.01                  # 角色離畫布邊至少留這麼多（比例）；貼邊代表耳朵、尾巴可能被切掉
FOOT_BAND = 0.06             # 「腳底那一條」取角色高度最底下的 6%
# 定位點左邊最多伸出去幾個遊戲單位。主角站在戰場最左邊：單人時腳底離畫面左緣 150（`enemylayout.ts` 的
# `playerLeft` 30＋站位框一半 120），連線左邊那位只有 130；舞台 `overflow: hidden`，伸出去的部分會被切掉。
# 球球第一版伸到 197，頭巾尾巴在實機截圖裡被切掉一截；再生五次，合格的最好一張是 135.5（第 6 次，頭巾尾巴下垂）。
# 大小修正（×0.95）之後是 128.8：連線左邊那位也不會被切。上限就放在 130
LEFT_REACH = 130


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def feet_mid(alpha: np.ndarray) -> tuple[float, int, int]:
    """腳掌踩地那一條的左右中點、最底下那一排的列號、那一條裡分成幾塊（兩腳分開踩＝2）。"""
    solid = alpha > 16
    rows = np.flatnonzero(solid.any(axis=1))
    top, bottom = int(rows[0]), int(rows[-1])
    band = solid[bottom - round((bottom - top + 1) * FOOT_BAND) + 1:bottom + 1]
    cols = np.flatnonzero(band.any(axis=0))
    _, pieces = ndimage.label(band.any(axis=0))
    return (cols[0] + cols[-1]) / 2, bottom, int(pieces)


def idle_reference(hero: str) -> dict:
    """新版待機第 1 格：比例尺、定位點、兩腳中點（格內座標）。"""
    idle = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    frame = idle['frames'][0]
    x, y, w, h = frame['rect']
    alpha = np.array(Image.open(ROOT / 'public' / idle['texture']).convert('RGBA'))[y:y + h, x:x + w, 3]
    mid, bottom, pieces = feet_mid(alpha)
    return {'scale': idle['scale'], 'pivot': frame['pivot'], 'feetMid': mid, 'bottom': bottom,
            'height': h * idle['scale'], 'width': w * idle['scale'], 'feetPieces': pieces}


def check(hero: str, path: Path) -> tuple[Image.Image, dict, dict]:
    """品質檢查＋裁切縮放。不合格丟 ArtError；合格回傳（成品圖、逐格資料、量到的數字）。"""
    image = tidy(Image.open(path))
    width, height = image.size
    alpha = np.array(image)[..., 3]
    if (int(alpha.min()), int(alpha.max())) != (0, 255):
        raise ArtError(f'{hero}: 背景不是真透明（alpha 範圍 {alpha.min()}～{alpha.max()}）')
    if width != height:
        raise ArtError(f'{hero}: 畫布不是正方形（{width}×{height}），換算比例的前提不成立')
    solid = alpha > 16
    ys, xs = np.nonzero(solid)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    edge = round(width * EDGE)
    if x0 < edge or y0 < edge or x1 >= width - edge or y1 >= height - edge:
        raise ArtError(f'{hero}: 角色貼到畫布邊（外框 {x0},{y0}～{x1},{y1}），耳朵或尾巴可能被切掉')
    labels, count = ndimage.label(ndimage.binary_dilation(solid, iterations=2))
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    main = float(sizes.max() / sizes.sum())
    if main < MAIN_BODY:
        raise ArtError(f'{hero}: 最大一塊只佔 {main:.1%}，旁邊多畫了東西（星星、特效或另一隻貓）')
    ref_height = CHAR_HEIGHT * height          # 參考圖裡新版待機的站高＝遊戲裡的 252 單位
    ratio = (y1 - y0 + 1) / ref_height
    if not DRAWN_HEIGHT_RATIO[0] <= ratio <= DRAWN_HEIGHT_RATIO[1]:
        raise ArtError(f'{hero}: 生圖的外框身高是參考圖待機的 {ratio:.3f} 倍，超出 '
                       f'{DRAWN_HEIGHT_RATIO[0]}～{DRAWN_HEIGHT_RATIO[1]}：沒有照參考圖的版面畫')
    fix = SIZE_FIX[hero]
    if not 0.80 <= fix <= 1.10:
        raise ArtError(f'{hero}: 大小修正 {fix} 超出 0.80～1.10，這已經不是微調，要重生')

    # 裁掉空白（多留一圈反鋸齒），套上大小修正，縮成跟該角色新版待機圖集一樣的解析度
    idle = idle_reference(hero)
    box = (max(0, x0 - PAD), max(0, y0 - PAD), min(width, x1 + PAD + 1), min(height, y1 + PAD + 1))
    crop = image.crop(box)
    units_per_px = NATIVE_HEIGHT / ref_height * fix   # 生圖原檔一個像素＝幾個遊戲單位（已乘修正）
    k = units_per_px / idle['scale']
    out = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
    rgba = np.array(out)
    rgba[rgba[..., 3] == 0, :3] = 0            # 完全透明的地方不留看不見的顏色（無損存檔會照存、白佔空間）
    out = Image.fromarray(rgba, 'RGBA')
    scale = units_per_px * crop.height / out.height   # 成品一個像素＝幾個遊戲單位
    shown = (y1 - y0 + 1) * units_per_px / idle['height']
    if not SHOWN_HEIGHT_RATIO[0] <= shown <= SHOWN_HEIGHT_RATIO[1]:
        raise ArtError(f'{hero}: 修正後外框身高是待機的 {shown:.3f} 倍，超出 {SHOWN_HEIGHT_RATIO[0]}～{SHOWN_HEIGHT_RATIO[1]}')

    mid, bottom, pieces = feet_mid(rgba[..., 3])
    offset = (idle['feetMid'] - idle['pivot'][0]) * idle['scale']   # 待機時兩腳中點在定位點右邊幾單位
    pivot = [round(mid - offset / scale, 2), bottom]
    reach = pivot[0] * scale
    if reach > LEFT_REACH:
        raise ArtError(f'{hero}: 往後伸出定位點左邊 {reach:.0f} 單位（上限 {LEFT_REACH}），站在戰場最左邊會被畫面切掉')
    frame = {'texture': f'assets/motion/{hero}/hit_recoil.webp', 'scale': scale,
             'rect': [0, 0, out.width, out.height], 'pivot': pivot,
             # 下面兩個遊戲不讀，是給測試守大小修正用的（見檔頭）
             'sizeFix': fix, 'drawnHeightRatio': round(ratio, 4)}
    metrics = {
        'sizeFix': fix,
        'heightRatio': round(ratio, 3),
        'shownHeightRatio': round(shown, 3),
        'heightUnits': round((bottom - int(np.flatnonzero((rgba[..., 3] > 16).any(axis=1))[0]) + 1) * scale, 1),
        'idleHeightUnits': round(idle['height'], 1),
        'widthUnits': round(out.width * scale, 1),
        'idleWidthUnits': round(idle['width'], 1),
        'mainBody': round(main, 4),
        'feetPieces': pieces,
        'feetMidOffsetUnits': round((mid - pivot[0]) * scale, 2),
        'leftReachUnits': round(reach, 1),
        'idleFeetMidOffsetUnits': round(offset, 2),
    }
    return out, frame, metrics


def dump_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def pack() -> None:
    config = json.loads(CONFIG.read_text(encoding='utf-8'))['heroes']
    missing = [hero for hero in HEROES if not (SOURCE / f'{hero}.png').exists() or hero not in config]
    if missing:
        raise ArtError(f'還沒選定：{missing}（先跑 gen_hit_recoil_art.py pick）')
    # 先全部檢查過一遍才開始寫：有一張不合格就整批不動
    staged = [(hero, *check(hero, SOURCE / f'{hero}.png')) for hero in HEROES]
    heroes, records = {}, []
    for hero, image, frame, metrics in staged:
        target = ROOT / 'public' / frame['texture']
        tmp = target.with_suffix('.tmp.webp')
        image.save(tmp, 'WEBP', lossless=True, method=6, exact=True)
        if not np.array_equal(np.array(Image.open(tmp).convert("RGBA")), np.array(image)):
            tmp.unlink()
            raise ArtError(f'{hero}: 無損存檔讀回來不一樣')
        tmp.replace(target)
        heroes[hero] = frame
        source = SOURCE / f'{hero}.png'
        records.append({'hero': hero, 'attempt': config[hero]['attempt'],
                        'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': sha(source),
                        'target': target.relative_to(ROOT).as_posix(), 'targetSha256': sha(target),
                        'bytes': target.stat().st_size, 'size': list(image.size), **metrics})
    dump_json(DATA, {'note': '挨打那一下的新畫風立繪（2026-09-22）。由 tools/pack_hit_recoil_motion.py 產生，不要手改；'
                             '停留時間寫在 src/ui/hit-recoil-motion.ts。',
                     'heroes': heroes})
    dump_json(RECORD, {'generator': 'gpt-image-1.5（codex-oauth，真透明輸出）',
                       'reproducer': 'python tools/pack_hit_recoil_motion.py', 'assets': records})
    print(json.dumps({'packed': [r['hero'] for r in records]}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', choices=HEROES, help='只檢查一張，不寫檔')
    parser.add_argument('--path', help='搭配 --check：檢查指定檔（例如還沒選定的某一次嘗試）')
    args = parser.parse_args()
    if args.check:
        path = Path(args.path) if args.path else SOURCE / f'{args.check}.png'
        _, frame, metrics = check(args.check, path)
        print(json.dumps({'ok': args.check, **frame, **metrics}, ensure_ascii=False))
        return
    pack()


if __name__ == '__main__':
    main()
