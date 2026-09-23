"""戰鬥靜態立繪換新畫風：從新版逐格動作裁代表格覆蓋（2026-09-23，批次 statics；美術盤點 D1）。

四隻貓各 37 張靜態立繪，09-22 換過 13 張（選角、結算、過關、特殊獎勵、貓窩、走路、頭像、標題），
**剩 24 種還是舊畫風**（細線、頭身比不同）：出招、狀態、挨打那幾種。它們在一般網址下還看得到——
逐格動作圖集還沒下載好時（網路慢的第一場整場都是）、延後下載的狀態圖還沒到時（掛彩、氣勢、肚子餓、懶洋洋、
鐵布衫、翻肚、隱身、炸毛），以及 `?motion=0`。這支**不生圖**：從同一隻貓的新版逐格圖集裁一格（出手那格、
狀態圖停著呼吸的第 8 格、挨打那一張），換成靜態立繪的比例與位置，同檔名覆蓋（程式、清單、樣式都不用動）。

**大小**：戰鬥立繪框 270×300、`object-fit: contain`，560 寬的畫布以寬為準縮成 270，所以
一個遊戲單位＝560/270 畫布像素（跟 `pack_screen_art.py` 同一個換算）；逐格圖一格的像素 × 那個動作的 `scale`
＝遊戲單位，再乘 560/270。跟逐格動作在戰鬥裡畫出來的大小一樣，換過去不會忽大忽小。

**位置**：
  - 腳底線＝**這一張舊圖**外框的底邊（封封幾張舊圖的底邊不等高，`combat.css` 有照舊圖底邊算好的位移，
    保留底邊那些位移才繼續對）；騰空、倒地的格照逐格資料的腳底定位點擺（身體畫在定位點上方）。
  - 左右：腳底定位點擺在「新版待機第 1 格照同一個規矩擺進待機靜態圖時」的位置——四隻各算一次、全部姿勢共用，
    跟逐格動作一樣所有姿勢照腳底定位點對齊，換姿勢身體不會左右跳。

用法：
    python tools/pack_static_from_motion.py --check          # 只量、不寫，印每張的來源與位置
    python tools/pack_static_from_motion.py                  # 寫檔＋紀錄 docs/static-from-motion-assets.json
    python tools/pack_static_from_motion.py --sheet 某處.jpg  # 另排一張新舊對照聯絡表
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / 'public'
MANIFEST = PUB / 'assets/manifest.json'
RECORD = ROOT / 'docs/static-from-motion-assets.json'
UNIT = 560 / 270
WEBP_QUALITY = 82   # 跟 pack_screen_art.py 同一個品質
# 透明度改有損 70（預設是無損）：新圖比舊圖大一截，球球那 24 張沒有角色前綴、算在首載裡，
# 無損透明度會讓首載總計超標（實測 11.34／11.30 MB）；70 在暗底上放大看不出毛邊，檔案小三成
ALPHA_QUALITY = 70
EDGE = 2            # 主體離畫布邊至少幾個像素
MAX_SHIFT = 40      # 左右放不下時最多往畫布裡推幾個畫布像素（約 19 個遊戲單位；逐格動作裡同一招的格也會左右晃這麼多）
MAX_FRAME_STEPS = 2  # 指定那格放不下時，最多往前後找幾格
MIN_SHRINK = .85    # 真的放不下才縮，縮超過這個就停
WIDE_SHIFT = {'belly': 120}   # 翻肚是橫躺的，腳底定位點不在身體中間，推多一點不會看出左右跳
# 封封舊圖底邊不等高而在 combat.css 補的位移：這幾張換成新圖（底邊貼畫布底）之後要拿掉，不然會往下沉
FENGFENG_CSS_DROP = ('belly_clean', 'choke_clean', 'lazy_clean', 'puff_clean', 'stealth', 'iron', 'hit', 'hurt', 'power')

DATA = {
    'ninja': ['qiuqiu-motion-data.json', 'qiuqiu-extra-motion-data.json', 'qiuqiu-attack-motion-data.json'],
    'feifei': ['feifei-motion-data.json', 'feifei-needle-motion-data.json'],
    'dangdang': ['dangdang-motion-data.json', 'dangdang-attack-motion-data.json'],
    'fengfeng': ['fengfeng-motion-data.json', 'fengfeng-attack-motion-data.json'],
}
HIT_KEY = {'ninja': 'qiuqiu', 'feifei': 'feifei', 'dangdang': 'dangdang', 'fengfeng': 'fengfeng'}

# 靜態姿勢 → （動作, 第幾格〔從 0 算〕）。出招取出手或打到的那一格；狀態取停著呼吸的第 8 格（中毒取第 4 格，
# 跟動作裡停著的那格一樣）；挨打取挨打那一張。選的是「只看這一格也認得出在做什麼」的那一格。
SHARED_REST = {
    'hurt': ('wounded', 7), 'power': ('power', 7), 'hungry': ('hungry', 7), 'lazy': ('lazy', 7),
    'iron': ('iron', 7), 'belly': ('belly', 7), 'stealth': ('stealth', 7), 'puff': ('puff', 7), 'choke': ('poison', 3),
    'hit': ('hit', 0), 'throw': ('toss', 3),
}
PICK = {
    'ninja': {**SHARED_REST,
              'stealth': ('stealth', 0), 'puff': ('puff', 0),   # 球球這兩套是原本就有的循環動作，停在第 1 格
              'attack': ('attack1', 3), 'claw': ('attack2', 3), 'kick': ('kick', 7), 'dash': ('rush', 4),
              'punch': ('uppercut', 3), 'skill': ('seal', 4), 'focus': ('focus', 4), 'scroll': ('scroll', 4),
              'roar': ('roar', 4), 'taiji': ('taiji', 4), 'qinggong': ('qinggong', 1), 'guard': ('guard', 4),
              'dodge': ('roll', 5)},   # 輕功取蹲下起跳那格：騰空那幾格頭會頂出畫布；閃避取翻完蹲低那格（翻滾中間是倒立的）
    'feifei': {**SHARED_REST,
               'attack': ('shuriken', 4), 'claw': ('attack1', 4), 'kick': ('kick', 4), 'dash': ('roll', 3),
               'punch': ('needle_pierce', 4), 'skill': ('seal', 4), 'focus': ('seal', 4), 'scroll': ('seal', 4),
               'roar': ('roar', 4), 'taiji': ('taiji', 4), 'qinggong': ('roll', 3), 'guard': ('guard', 4),
               'dodge': ('roll', 3)},
    'dangdang': {**SHARED_REST,
                 'attack': ('punch', 4), 'claw': ('palm', 4), 'kick': ('kick', 4), 'dash': ('shoulder', 4),
                 'punch': ('punch', 4), 'skill': ('focus', 4), 'focus': ('focus', 4), 'scroll': ('focus', 4),
                 'roar': ('ground_slam', 4), 'taiji': ('counter', 4), 'qinggong': ('dodge', 3), 'guard': ('guard', 4),
                 'dodge': ('dodge', 3)},
    'fengfeng': {**SHARED_REST,
                 # 劍整把伸出去的那幾格比畫布寬（270 個遊戲單位），取出劍前後劍還收在身邊的那一格
                 'attack': ('slash', 2), 'claw': ('double_slash', 3), 'kick': ('sweep', 6), 'dash': ('thrust', 1),
                 'punch': ('heavy_slash', 3), 'skill': ('focus', 4), 'focus': ('focus', 4), 'scroll': ('focus', 4),
                 'roar': ('roar', 4), 'taiji': ('taiji', 4), 'qinggong': ('dodge', 3), 'guard': ('guard', 4),
                 'dodge': ('dodge', 3)},
}
POSES = sorted(PICK['ninja'])


def motions(hero: str) -> dict:
    out: dict = {}
    for name in DATA[hero]:
        out.update(json.loads((ROOT / 'src/ui' / name).read_text(encoding='utf-8'))['actions'])
    hit = json.loads((ROOT / 'src/ui/hit-recoil-motion-data.json').read_text(encoding='utf-8'))['heroes'][HIT_KEY[hero]]
    out['hit'] = {'texture': hit['texture'], 'scale': hit['scale'], 'frames': [{'rect': hit['rect'], 'pivot': hit['pivot']}]}
    return out


def sprite_key(hero: str, pose: str) -> str:
    return 'hero/ninja' if hero == 'ninja' and pose == 'idle' else f'hero/{hero}_{pose}'


def frame_image(motion: dict, index: int) -> tuple[Image.Image, list[float]]:
    frame = motion['frames'][index]
    x, y, w, h = frame['rect']
    tex = Image.open(PUB / motion['texture']).convert('RGBA')
    k = motion['scale'] * UNIT
    crop = tex.crop((x, y, x + w, y + h)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    return crop, [frame['pivot'][0] * k, frame['pivot'][1] * k]


def bbox(image: Image.Image) -> tuple[int, int, int, int]:
    box = image.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    if box is None:
        raise SystemExit('整張是空的')
    return box


def idle_pivot_x(hero: str, sprites: dict) -> float:
    """新版待機第 1 格照「外框置中對齊待機靜態圖的外框」擺進去時，腳底定位點落在畫布的哪個 x。"""
    idle_static = Image.open(PUB / sprites[sprite_key(hero, 'idle')]).convert('RGBA')
    sx0, _, sx1, _ = bbox(idle_static)
    crop, pivot = frame_image(motions(hero)['idle'], 0)
    cx0, _, cx1, _ = bbox(crop)
    return (sx0 + sx1) / 2 - (cx0 + cx1) / 2 + pivot[0]


def foot_line(hero: str, old: Image.Image) -> int:
    """腳底線（最底下那一列不透明像素的 y；逐格資料的腳底定位點也是指那一列）。
    封封那幾張舊圖的底邊不等高、靠 `combat.css` 的位移補到同一條線；換成新圖之後底邊一律貼畫布底
    （跟另外三隻一樣留 EDGE），那幾條位移要一起拿掉（見 `FENGFENG_CSS_DROP`）。"""
    return old.height - EDGE - 1 if hero == 'fengfeng' else bbox(old)[3] - 1


def place(crop: Image.Image, pivot: list[float], px: float, foot: int, size: tuple[int, int],
          max_shift: int = MAX_SHIFT) -> tuple[int, int, int, int, int] | None:
    """照腳底定位點擺；左右放不下就往畫布裡推（最多 MAX_SHIFT），還是放不下回 None。回傳（外框四邊, 推了多少）。
    底下不留邊：腳本來就踩在腳底線上，差一兩列是取整數的誤差。"""
    cb = bbox(crop)
    left, top = round(px - pivot[0]), round(foot - pivot[1])
    x0, y0, x1, y1 = left + cb[0], top + cb[1], left + cb[2], top + cb[3]
    if y0 < EDGE or y1 > size[1] or x1 - x0 > size[0] - 2 * EDGE:
        return None
    shift = max(0, EDGE - x0) - max(0, x1 - (size[0] - EDGE))
    if abs(shift) > max_shift:
        return None
    return x0 + shift, y0, x1 + shift, y1, shift


def build(hero: str, pose: str, sprites: dict, px: float) -> tuple[Image.Image, dict]:
    """先試指定的那一格；放不下就試同一個動作裡離它最近的格（出手前後那幾格通常比較收）；
    都放不下才把指定那格等比縮進畫布（以腳底為準），縮超過 MIN_SHRINK 就停——那樣換姿勢會看得出變小。"""
    action, index = PICK[hero][pose]
    motion = motions(hero)[action]
    old = Image.open(PUB / sprites[sprite_key(hero, pose)]).convert('RGBA')
    foot = foot_line(hero, old)
    order = sorted(range(len(motion['frames'])), key=lambda i: (abs(i - index), i))[:MAX_FRAME_STEPS + 1]
    chosen = None
    for i in order:
        crop, pivot = frame_image(motion, i)
        spot = place(crop, pivot, px, foot, old.size, WIDE_SHIFT.get(pose, MAX_SHIFT))
        if spot:
            chosen = (i, crop, spot, 1.0)
            break
    if chosen is None:
        crop, pivot = frame_image(motion, index)
        cb = bbox(crop)
        room_w = (old.width - 2 * EDGE) / (cb[2] - cb[0])
        room_h = (foot - EDGE) / (pivot[1] - cb[1])
        k = min(room_w, room_h) * 0.995
        if k < MIN_SHRINK:
            raise SystemExit(f'{hero}/{pose}: {action} 每一格都放不下，要縮到 {k:.2f} 倍（下限 {MIN_SHRINK}）')
        crop = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
        pivot = [pivot[0] * k, pivot[1] * k]
        spot = place(crop, pivot, px, foot, old.size, WIDE_SHIFT.get(pose, MAX_SHIFT))
        if spot is None:
            raise SystemExit(f'{hero}/{pose}: 縮了 {k:.2f} 倍還是放不下')
        chosen = (index, crop, spot, round(k, 3))
    i, crop, (x0, y0, x1, y1, shift), shrink = chosen
    canvas = Image.new('RGBA', old.size, (0, 0, 0, 0))
    canvas.alpha_composite(crop.crop(bbox(crop)), (x0, y0))
    return canvas, {'hero': hero, 'pose': pose, 'action': action, 'frame': i + 1, 'texture': motion['texture'],
                    'file': sprites[sprite_key(hero, pose)], 'canvas': list(old.size), 'footLine': foot,
                    'box': [x0, y0, x1, y1], 'shift': shift, 'shrink': shrink}


def run(write: bool, sheet: str | None) -> None:
    sprites = json.loads(MANIFEST.read_text(encoding='utf-8'))['sprites']
    rows, images, errors = [], [], []
    for hero in PICK:
        px = idle_pivot_x(hero, sprites)
        for pose in POSES:
            try:
                image, info = build(hero, pose, sprites, px)
            except SystemExit as error:   # 全部量完再一起報，免得改一張跑一次
                errors.append(str(error))
                continue
            info['pivotX'] = round(px, 1)
            rows.append(info)
            images.append((hero, pose, image))
    if errors:
        raise SystemExit('有幾張不合格，整批不寫：\n  ' + '\n  '.join(errors))
    if sheet:
        contact(images, sprites, sheet)
    if not write:
        for r in rows:
            print(f"{r['hero']:8s} {r['pose']:9s} ← {r['action']}#{r['frame']}  腳底 {r['footLine']}  外框 {r['box']}")
        return
    for (hero, pose, image), info in zip(images, rows):
        dst = PUB / info['file']
        image.save(dst, 'WEBP', quality=WEBP_QUALITY, alpha_quality=ALPHA_QUALITY, method=6)
        info['bytes'] = dst.stat().st_size
        info['sha256'] = hashlib.sha256(dst.read_bytes()).hexdigest()
    RECORD.write_text(json.dumps({'reproducer': 'python tools/pack_static_from_motion.py', 'unit': UNIT,
                                  'assets': rows}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'寫了 {len(rows)} 張，紀錄在 {RECORD.relative_to(ROOT)}')


def contact(images: list, sprites: dict, out: str) -> None:
    """每隻一列：上面舊圖、下面新圖，500 像素格子太大，這裡用 220（一次看 24 種）。"""
    tile = 220
    font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 16)
    heroes = list(PICK)
    sheet = Image.new('RGB', (len(POSES) * tile, len(heroes) * (tile * 2 + 24)), (30, 30, 34))
    d = ImageDraw.Draw(sheet)
    for r, hero in enumerate(heroes):
        for c, pose in enumerate(POSES):
            new = next(im for h, p, im in images if h == hero and p == pose)
            old = Image.open(PUB / sprites[sprite_key(hero, pose)]).convert('RGBA')
            for k, im in enumerate((old, new)):
                bg = Image.new('RGBA', im.size, (210, 210, 214, 255))
                bg.alpha_composite(im)
                bg = bg.convert('RGB').resize((tile, round(tile * im.height / im.width)))
                sheet.paste(bg, (c * tile, r * (tile * 2 + 24) + 24 + k * tile))
            d.text((c * tile + 4, r * (tile * 2 + 24) + 4), f'{hero} {pose}', fill=(230, 230, 230), font=font)
    sheet.save(out, quality=86)
    print(out, sheet.size)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--sheet')
    args = parser.parse_args()
    run(not args.check, args.sheet)


if __name__ == '__main__':
    main()
