"""批次 `screens` 的打包器（2026-09-22）：把 `gen_screen_art.py pick` 選定的生圖原檔，照舊圖的畫布換進遊戲。

讀 `tools/motion-art-source/screens/<角色>_<種類>.try<N>.png`（`actions.json` 記著選哪一次），做四件事：
  1. 透明度整理（`tidy`，跟待機狀態、挨打那兩批同一道：補滿 253～254 的不透明、清掉背景灰塵，不動顏色）；
  2. 品質閘門（**不合格就丟例外、整支停下、什麼都不寫**——自檢只印不停＝沒檢查）；
  3. 縮成遊戲大小、照舊圖的畫布與腳底線擺好，存成**同一個檔名**的 webp（程式與清單都不用動）；
  4. 量到的數字寫進 `docs/screen-art-assets.json`（測試 `tests/ui/screen_art.test.ts` 守這份），
     並拼聯絡表 `docs/審查報告/換新畫風_screens_2026-09-22.png`。

**大小怎麼換算**（「頭部大小跟新版待機同比例」）：
  - 戰鬥裡主角的立繪框是 270×300、`object-fit: contain`（`combat.css` 的 `.combat .unit.player .sprite`），
    560 寬的舊畫布會以寬度為準縮成 270 寬，也就是**畫布 560 像素 ＝ 270 個遊戲單位**；新版逐格動作的待機高 252 單位。
    這五個畫面的立繪跟戰鬥用同一批檔（戰鬥在逐格動作載好之前、以及用忍具時也會拿它們），
    所以新圖一律照「一個遊戲單位 ＝ 560/270 ≈ 2.07 畫布像素」畫：新版待機放進舊畫布是 523 像素高，
    跟舊待機（537 像素）差不到 3%。**同一隻貓六張都用同一個比例**，換畫面時大小才不會跳。
  - 生圖端不一定照參考圖的大小畫（挨打那批就差過一成五）。所以每張先量頭：把新版待機第 1 格的頭
   （頭頂到下巴，`HEAD_CUT`）當樣板，在新圖上搜尋縮放與旋轉，找最吻合的倍率（`head_fit`，量法同
    `scratchpad/sizecheck/head_fit.py`）。吻合度夠（≥ `RELIABLE`）就照量到的倍率把整張縮回來；
    縮完**在最後那張成品上重量一次**，差超過 ±6% 就停。吻合度不夠（姿勢或表情差太多，例如低頭跪著、
    眼睛變蚊香），就要在 `actions.json` 寫下人眼並排看過的結論（`pick --eye "…"`），不寫就停。
  - 標題貼圖：生圖時角色也照參考圖①的大小畫，整張等比例縮成 560，四隻用同一個比例（同樣先量頭、再修正）。

**擺在哪裡**：角色外框的底邊＝舊圖外框的底邊（腳底線不變：封封那幾張在 `combat.css` 有照舊圖腳底算好的
位移），左右中心＝舊圖外框的中心；放不下就往畫布裡推，推了還放不下就停。
標題貼圖：煙塵底邊對齊舊圖煙塵底邊，左右置中；舊圖的「参上」題字、底線、速度線原樣疊在新圖**後面**
（貓的耳朵尖碰到底線時耳朵在前，跟舊圖一樣）。

用法：
    python tools/pack_screen_art.py check qiuqiu/win 1      # 只量、不寫檔（不合格一樣會停）
    python tools/pack_screen_art.py                         # 打包 actions.json 選定的全部
    python tools/pack_screen_art.py sheet                   # 只重拼聯絡表
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_hit_recoil_art import CHAR_HEIGHT  # noqa: E402
from gen_idle_state_art import IDLE_DATA  # noqa: E402
from gen_screen_art import CONFIG, HEROES, POSES, SOURCE, old_sprite, sprite_key, sprite_path, split_cover  # noqa: E402
from pack_idle_state_motion import ArtError, tidy  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / 'docs/screen-art-assets.json'
SHEET = ROOT / 'docs/審查報告/換新畫風_screens_2026-09-22.png'
UNIT = 560 / 270                 # 一個遊戲單位幾個畫布像素（戰鬥立繪框 270 寬裝 560 寬畫布，見檔頭）
HEAD_CUT = {'qiuqiu': .47, 'feifei': .52, 'dangdang': .45, 'fengfeng': .47}   # 頭身交界（待機第 1 格高度的比例）
Z = 1.5                          # 量頭時的比例尺：一個遊戲單位 1.5 像素（頭約 180 像素高，2% 一格夠細）
RELIABLE = .90                   # 吻合度到這裡以上，量到的倍率才拿來用（挨打那批的經驗：可靠的都在 .91 以上）
HEAD_TOL = .06                   # 成品重量頭部，跟新版待機差這麼多以內
# 大小修正（＝1 ÷ 量到的頭部倍率）容許的範圍。第一輪 24 張實測：生圖端幾乎都畫得比參考圖大 15～30%
#（整隻等比例放大，外框身高的倍率跟頭部倍率差不到 4%），所以照量到的倍率縮回來就好；
# 畫到 1.5 倍以上或比參考圖還小兩成，代表根本沒照參考圖的版面畫，重生
FIX_RANGE = (1 / 1.5, 1 / .8)
MAIN_BODY = {'dizzy': .90, 'cover': .90}   # 最大一塊佔全部不透明像素的比例（暈頭有星星、貼圖有碎石）
MAIN_BODY_DEFAULT = .97
GEN_EDGE = .01                   # 生圖原檔裡角色離畫布邊至少留這麼多（比例），貼邊＝可能被切到
FINAL_EDGE = 2                   # 成品裡角色離畫布邊至少幾個像素
FIT_SHRINK_MIN = .97             # 放不下舊畫布時最多再縮多少（見 build）
HALO_MAX = .30                   # 半透明亮邊（暗底上的灰白毛邊）÷ 外輪廓長度；舊封封落敗圖是 3.52
WEBP_QUALITY = 82


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def idle_frame(hero: str) -> tuple[Image.Image, float]:
    """新版待機第 1 格（原解析度）與它的比例（一個原圖像素幾個遊戲單位）"""
    data = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    x, y, w, h = data['frames'][0]['rect']
    texture = Image.open(ROOT / 'public' / data['texture']).convert('RGBA')
    return texture.crop((x, y, x + w, y + h)), float(data['scale'])


def idle_at(hero: str, px_per_unit: float) -> Image.Image:
    frame, scale = idle_frame(hero)
    k = scale * px_per_unit
    return frame.resize((round(frame.width * k), round(frame.height * k)), Image.LANCZOS)


def gen_px_per_unit(hero: str, gen_height: int) -> float:
    """生圖原檔裡一個遊戲單位幾像素：參考圖①把待機第 1 格畫成畫布高的 60%（生圖端可能放大輸出，照比例算）"""
    frame, scale = idle_frame(hero)
    return CHAR_HEIGHT * gen_height / (frame.height * scale)


def _head_search(head: np.ndarray, target: np.ndarray, scales: np.ndarray, angles: range) -> tuple[float, float, int]:
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
            if nh >= tgt.shape[0] or nw >= tgt.shape[1]:
                continue
            mask = (t[..., 3] > 128).astype(np.float32)
            r = cv2.matchTemplate(tgt, t[..., :3].astype(np.float32), cv2.TM_CCORR_NORMED, mask=np.dstack([mask] * 3))
            r[~np.isfinite(r)] = -1
            v = float(r.max())
            if v > best[0]:
                best = (v, round(float(s), 3), th)
    return best


def head_fit(hero: str, image: Image.Image, px_per_unit: float) -> dict:
    """新圖的頭是新版待機的頭的幾倍（同一個顯示比例下比）。

    image 是任意解析度的新圖，px_per_unit 是它一個遊戲單位幾像素。兩邊都換算到 Z（每單位 1.5 像素）再比。
    另外拿左右翻過來的頭再搜一次：翻過來反而更吻合＝臉朝反方向（面向閘門用）。
    """
    idle = np.array(idle_at(hero, Z))
    head = idle[:round(idle.shape[0] * HEAD_CUT[hero])]
    k = Z / px_per_unit
    target = np.array(image.resize((round(image.width * k), round(image.height * k)), Image.LANCZOS))
    coarse = _head_search(head, target, np.arange(.70, 1.55, .04), range(-45, 46, 15))
    s0, th0 = coarse[1], coarse[2]
    fine = _head_search(head, target, np.arange(max(.66, s0 - .05), s0 + .051, .01), range(th0 - 12, th0 + 13, 4))
    flip = _head_search(head[:, ::-1].copy(), target, np.arange(.70, 1.55, .04), range(-45, 46, 15))
    return {'scale': fine[1], 'corr': round(fine[0], 3), 'angle': fine[2], 'flipCorr': round(flip[0], 3)}


def main_body_share(alpha: np.ndarray) -> float:
    solid = alpha > 16
    labels, count = ndimage.label(solid)
    if not count:
        return 0.0
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    return float(sizes.max() / sizes.sum())


def halo_ratio(image: Image.Image) -> float:
    """半透明亮邊：alpha 8～249、本身顏色偏亮（亮度 > 160）的像素數 ÷ 外輪廓長度。
    疊到暗底上就是一圈灰白毛邊（盤點第 12 項：舊封封落敗圖 3.52、舊封封勝利圖 2.64）。"""
    a = np.array(image.convert('RGBA')).astype(np.float32)
    alpha = a[..., 3]
    lum = a[..., :3] @ np.array([.299, .587, .114])
    halo = (alpha > 8) & (alpha < 250) & (lum > 160)
    solid = alpha > 128
    edge = solid & ~ndimage.binary_erosion(solid)
    return float(halo.sum() / max(1, edge.sum()))


def bbox(image: Image.Image) -> tuple[int, int, int, int]:
    box = image.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    if box is None:
        raise ArtError('整張是空的')
    return box


def old_layout(hero: str, pose: str) -> dict:
    """舊圖的畫布、角色外框；標題貼圖另外拆出題字層與煙塵底邊。"""
    old = old_sprite(hero, pose)
    out = {'canvas': old.size}
    if pose == 'cover':
        title, body = split_cover(old)
        out['title'] = title
        out['box'] = bbox(body)
    else:
        out['box'] = bbox(old)
    return out


def build(hero: str, pose: str, attempt: int, eye: str = '', eye_fix: float | None = None) -> tuple[Image.Image, dict]:
    """量一張、過閘門、做成成品。不合格就丟 ArtError。回傳（成品, 量到的數字）。

    eye／eye_fix：自動量頭量不準的那幾張（低頭跪著、正面的標題貼圖），人眼並排比過之後訂的大小修正與結論
   （`gen_screen_art.py pick … --eye "結論" --fix 倍率`）。有 eye_fix 就照它縮、不做成品重量；沒有又量不準就停。
    """
    label = f'{hero}/{pose} 第 {attempt} 次'
    src = SOURCE / f'{hero}_{pose}.try{attempt}.png'
    raw = Image.open(src)
    image = tidy(raw)
    alpha = np.array(image.getchannel('A'))
    width, height = image.size
    info: dict = {'attempt': attempt, 'source': src.name, 'sourceSize': [width, height]}

    # 1. 真透明：四個角全透明，而且同時有完全透明與完全不透明
    if image.getchannel('A').getextrema() != (0, 255):
        raise ArtError(f'{label}: 背景不是真透明（alpha 範圍 {image.getchannel("A").getextrema()}）')
    if max(alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]) > 0:
        raise ArtError(f'{label}: 四個角有不透明像素（背景沒去乾淨）')
    # 2. 單一角色：最大一塊佔絕大多數
    share = main_body_share(alpha)
    info['mainBody'] = round(share, 3)
    if share < MAIN_BODY.get(pose, MAIN_BODY_DEFAULT):
        raise ArtError(f'{label}: 最大一塊只佔 {share:.1%}，多畫了東西或第二隻貓')
    # 3. 沒被切到：離生圖畫布四邊都有留白
    x0, y0, x1, y1 = bbox(image)
    edge = GEN_EDGE * max(width, height)
    if min(x0, y0, width - x1, height - y1) < edge:
        raise ArtError(f'{label}: 角色貼到畫布邊（外框 {x0},{y0}～{x1},{y1}），耳朵、尾巴可能被切掉')

    # 4. 頭部大小：量生圖原檔 → 算修正 → 縮成成品 → 成品再量一次
    per_unit = gen_px_per_unit(hero, height)
    measured = head_fit(hero, image, per_unit)
    info['headRaw'] = measured
    by_eye = eye_fix is not None
    if by_eye and not eye:
        raise ArtError(f'{label}: 人眼訂的大小修正要附上並排看過的結論（--eye）')
    reliable = measured['corr'] >= RELIABLE and not by_eye
    if not reliable and not by_eye:
        raise ArtError(f'{label}: 頭部比對吻合度只有 {measured["corr"]}（倍率 {measured["scale"]}），量不準；'
                       '要並排看過再用 `gen_screen_art.py pick … --eye "結論" --fix 倍率` 記下來')
    fix = float(eye_fix) if by_eye else 1 / measured['scale']
    if not FIX_RANGE[0] <= fix <= FIX_RANGE[1]:
        raise ArtError(f'{label}: 頭畫成待機的 {measured["scale"]} 倍，差太多，重生')
    # 5. 面向：左右翻過來的頭比原本的更吻合＝臉朝反方向（標題貼圖是正面，不查）
    if pose != 'cover' and reliable and measured['flipCorr'] > measured['corr'] + .01:
        raise ArtError(f'{label}: 翻過來的頭更吻合（{measured["flipCorr"]} > {measured["corr"]}），面向反了')
    info['sizeFix'] = round(fix, 3)
    info['sizeBy'] = 'eye' if by_eye else 'headFit'
    if eye:
        info['eye'] = eye

    layout = old_layout(hero, pose)
    cw, ch = layout['canvas']
    ox0, oy0, ox1, oy1 = layout['box']
    crop = image.crop((x0, y0, x1, y1))
    # 成品一個遊戲單位幾像素：一般立繪照戰鬥框（UNIT）；標題貼圖整張等比例縮成 560 寬（四隻同一個比例）
    final_per_unit = UNIT if pose != 'cover' else per_unit * cw / width
    k = final_per_unit / per_unit * fix
    info['pxPerUnit'] = round(final_per_unit, 4)
    # 放不下舊畫布時最多再縮 3%（成品的頭仍要在 ±6% 內，下面重量會守）：菲菲的馬尾比待機翹高一點就頂到畫布上緣
    room_w, room_h = cw - 2 * FINAL_EDGE, oy1 - FINAL_EDGE
    shrink = min(1.0, room_w / (crop.width * k), room_h / (crop.height * k))
    if shrink < FIT_SHRINK_MIN:
        raise ArtError(f'{label}: 縮好是 {crop.width * k:.0f}×{crop.height * k:.0f}，放進 {cw}×{ch} 的舊畫布'
                       f'（腳底線 {oy1}）要再縮 {1 - shrink:.1%}，超過 {1 - FIT_SHRINK_MIN:.0%}；姿勢太高或太寬，重生')
    if shrink < 1:
        k *= shrink
        info['fitShrink'] = round(shrink, 4)
    body = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
    left = round((ox0 + ox1) / 2 - body.width / 2)
    top = oy1 - body.height
    left = min(max(left, FINAL_EDGE), cw - FINAL_EDGE - body.width)
    if left < FINAL_EDGE or top < FINAL_EDGE:
        raise ArtError(f'{label}: 縮好是 {body.width}×{body.height}，放進 {cw}×{ch} 的舊畫布會被切到'
                       f'（上緣 {top}、左緣 {left}）')
    canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    if pose == 'cover':
        canvas.alpha_composite(layout['title'])
    canvas.alpha_composite(body, (left, top))
    final = canvas
    info['canvas'] = [cw, ch]
    info['box'] = list(bbox(final)) if pose != 'cover' else [left, top, left + body.width, top + body.height]
    info['oldBox'] = [ox0, oy0, ox1, oy1]
    info['soleLine'] = top + body.height

    # 6. 成品重量頭部（同一個顯示比例：成品畫布一個遊戲單位 final_per_unit 像素）
    if reliable:
        check = head_fit(hero, body, final_per_unit)
        info['headFinal'] = check
        if check['corr'] < RELIABLE - .03 or abs(check['scale'] - 1) > HEAD_TOL:
            raise ArtError(f'{label}: 成品的頭是待機的 {check["scale"]} 倍（吻合度 {check["corr"]}），超過 ±6%')
    # 7. 暗底白毛邊
    if pose != 'cover':
        halo = halo_ratio(final)
        info['halo'] = round(halo, 3)
        if halo > HALO_MAX:
            raise ArtError(f'{label}: 半透明亮邊 {halo:.2f}（上限 {HALO_MAX}），疊在暗底上會有一圈白邊')
    return final, info


def encode(image: Image.Image) -> bytes:
    rgba = np.array(image)
    rgba[rgba[..., 3] == 0, :3] = 0            # 看不見的像素清成 0，檔案小一點
    buf = io.BytesIO()
    Image.fromarray(rgba, 'RGBA').save(buf, 'WEBP', quality=WEBP_QUALITY, method=6)
    return buf.getvalue()


def pack() -> None:
    config = load_config()
    missing = [f'{h}/{p}' for h in HEROES for p in POSES if p not in config.get(h, {})]
    if missing:
        raise ArtError(f'還沒選定：{", ".join(missing)}')
    results: dict[str, tuple[bytes, dict]] = {}
    for hero in HEROES:
        for pose in POSES:
            pick = config[hero][pose]
            final, info = build(hero, pose, pick['attempt'], pick.get('eye', ''), pick.get('fix'))
            data = encode(final)
            path = sprite_path(hero, pose)
            info['key'] = sprite_key(hero, pose)
            info['file'] = path.relative_to(ROOT).as_posix()
            info['sha256'] = sha(data)
            info['bytes'] = len(data)
            info['oldBytes'] = path.stat().st_size
            results[f'{hero}/{pose}'] = (data, info)
            print(f'{hero}/{pose}: 頭 {info["headRaw"]["scale"]}→{info.get("headFinal", {}).get("scale", "人眼")} '
                  f'吻合 {info["headRaw"]["corr"]} 修正 {info["sizeFix"]} 外框 {info["box"]} '
                  f'{info["oldBytes"] // 1024}→{len(data) // 1024} KB', flush=True)
    # 全部過了才寫檔
    for data, info in results.values():
        (ROOT / info['file']).write_bytes(data)
    record = {
        'note': '批次 screens（2026-09-22）：選角、結算、過關、特殊獎勵、標題的主角立繪換新畫風。'
                '由 tools/pack_screen_art.py 產生，數字的意思見該檔檔頭。',
        'unit': round(UNIT, 4),
        'headTolerance': HEAD_TOL,
        'haloMax': HALO_MAX,
        'files': {k: v[1] for k, v in results.items()},
    }
    RECORD.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'寫好 {len(results)} 張，紀錄在 {RECORD.relative_to(ROOT)}')
    sheet()


FONT = 'C:/Windows/Fonts/msjh.ttc'
LABEL = {'idle': '選角（待機）', 'win': '勝利：結算贏／過關亮相／關主信物', 'lose': '落敗：結算輸',
         'eat': '吃飯糰：獎勵沒牌可挑', 'dizzy': '暈頭：獎勵魔物散掉', 'cover': '標題「參上」貼圖'}
NAME = {'qiuqiu': '球球', 'feifei': '菲菲', 'dangdang': '噹噹', 'fengfeng': '封封'}


def sheet(path: Path = SHEET, record: dict | None = None) -> None:
    """每種姿勢一列、四隻貓並排；每隻三格「新版待機第 1 格｜舊圖｜新圖」，同一個比例（舊畫布 560 → 格寬）。"""
    record = record or json.loads(RECORD.read_text(encoding='utf-8'))
    cell, head = 210, 30
    font = ImageFont.truetype(FONT, 17)
    small = ImageFont.truetype(FONT, 13)
    width = cell * 12
    out = Image.new('RGB', (width, (cell + head) * len(POSES) + 34), (34, 38, 52))
    draw = ImageDraw.Draw(out)
    draw.text((10, 6), '換新畫風 批次 screens（2026-09-22）　每隻三格：新版待機第 1 格｜舊圖｜新圖（同比例，暗底）',
              font=font, fill=(255, 230, 170))
    for row, pose in enumerate(POSES):
        y = 34 + row * (cell + head)
        draw.text((10, y + 5), LABEL[pose], font=font, fill=(255, 230, 170))
        for col, hero in enumerate(HEROES):
            info = record['files'][f'{hero}/{pose}']
            cw, ch = info['canvas']
            k = cell / max(cw, ch)
            new = Image.open(ROOT / info['file']).convert('RGBA')
            old = old_sprite(hero, pose)
            idle = idle_at(hero, info['pxPerUnit'])
            sole = info['soleLine']
            tiles = []
            for i, im in enumerate((idle, old, new)):
                tile = Image.new('RGBA', (cw, ch), (24, 28, 40, 255) if i != 1 else (44, 40, 36, 255))
                if i == 0:
                    tile.alpha_composite(idle, (round(cw / 2 - idle.width / 2), max(0, sole - idle.height)))
                else:
                    tile.alpha_composite(im)
                tiles.append(tile.resize((round(cw * k), round(ch * k)), Image.LANCZOS))
            for i, tile in enumerate(tiles):
                out.paste(tile.convert('RGB'), ((col * 3 + i) * cell, y + head))
            fin = info.get('headFinal', {}).get('scale')
            note = f'{NAME[hero]}　頭 {fin}' if fin else f'{NAME[hero]}　頭：人眼'
            draw.text(((col * 3) * cell + 8 + 180 * 0, y + head + 4), note, font=small, fill=(230, 230, 230))
    path.parent.mkdir(parents=True, exist_ok=True)
    # 全彩存是 2.8 MB；減成 256 色（不抖色）0.9 MB，看姿勢、大小、長相夠用
    out.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)
    print(f'聯絡表：{path.relative_to(ROOT)}')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command')
    c = sub.add_parser('check')
    c.add_argument('job')
    c.add_argument('attempt', type=int)
    c.add_argument('--eye', default='')
    c.add_argument('--fix', type=float, default=None)
    c.add_argument('--preview', default='', help='把成品存到這個路徑（不動遊戲裡的檔）')
    sub.add_parser('sheet')
    args = parser.parse_args()
    try:
        if args.command == 'check':
            hero, pose = args.job.split('/')
            final, info = build(hero, pose, args.attempt, args.eye, args.fix)
            print(json.dumps(info, ensure_ascii=False))
            if args.preview:
                final.save(args.preview)
        elif args.command == 'sheet':
            sheet()
        else:
            pack()
    except ArtError as error:
        print(f'不合格，整批停下：{error}', file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
