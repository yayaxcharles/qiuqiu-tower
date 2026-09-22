"""標題「參上」貼圖的貓放大（2026-09-22，批次 proj）。

背景：下午的批次 screens 把四張「參上」貼圖換成新畫風（`tools/gen_screen_art.py` 的 cover），但生圖時貓與煙塵
畫在同一張、貓照待機的大小只站 60%，整張縮成 560 寬之後**貓比舊貼圖小一截（約八到九成高），題字底線和煙塵頂之間
空出 30～60 像素**。使用者：把貓放大到跟舊版貼圖裡的貓差不多大（量舊圖貓的外框當目標），四張一致。

做法：貓和煙塵**分開生**，才量得到貓自己的外框（畫在一起的話，米白色的煙塵跟白毛、米色毛分不開）：
  cat   只有貓、真透明，姿勢照舊貼圖（參考圖②），長相照新版待機第 1 格（參考圖①）；
  dust  只有煙塵爆炸（米白煙團＋放射尖刺＋幾顆碎石），照舊貼圖那一團的樣子，中間不留空（貓會疊在前面）。
打包（`pack`）：
  1. 題字、底線、速度線照舊從舊圖原樣拆出來（`gen_screen_art.split_cover`），疊在最後面；
  2. 煙塵：寬對齊舊圖本體外框、底邊對齊舊圖煙塵底邊（腳底線不變），頂端補到題字底線下方 6 像素以內（不再空一截）；
  3. 貓：外框高度＝舊圖貓外框的高度（`OLD_CAT`，人眼在 10 像素格線上量的），腳底對齊腳底線、左右中心對齊舊圖貓的中心；
  4. 閘門（不合格整批停、不寫檔）：真透明、只有一隻貓（最大一塊 ≥ 97%）、沒貼邊、煙塵裡沒有貓（人眼在聯絡表確認）、
     成品貓整隻在畫布裡、四隻的貓身高差在 12% 以內（「四張一致」）、本體（貓＋煙塵）頂端離題字底線不比舊圖遠
    （舊圖貓頭幾乎頂到底線；下午那版空 30～60 像素，就是使用者說的「空一截」）；
  5. 頭：正面三分之一側的貼圖，拿朝右的待機頭比對量不準（下午那批四張也是人眼），照舊由人眼並排判斷，結論寫進紀錄。
寫回同一個檔名（`public/assets/sprites/hero/cover.webp`、`<代號>_cover.webp`），更新 `docs/screen-art-assets.json`
的四筆 cover（測試 `tests/ui/screen_art.test.ts` 守它），聯絡表 `docs/審查報告/換新畫風_proj_標題_2026-09-22.png`。

用法：
    python tools/gen_cover_art.py refs
    python tools/gen_cover_art.py gen cat qiuqiu feifei dangdang fengfeng --jobs 4
    python tools/gen_cover_art.py gen dust qiuqiu --note "修正說明"
    python tools/gen_cover_art.py pick qiuqiu cat 2
    python tools/gen_cover_art.py check                      # 只量、不寫檔，成品存到 _preview/
    python tools/gen_cover_art.py pack                       # 寫進遊戲、更新紀錄、拼聯絡表
每一次生圖都存成 `<角色>_<層>.try<N>.png`（不覆蓋），同一張最多 4 次。
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_hit_recoil_art import idle_ref  # noqa: E402
from gen_idle_state_art import IMAGE_GEN  # noqa: E402
from gen_screen_art import COVER_POSE, look_for, old_sprite, sprite_key, sprite_path, split_cover  # noqa: E402
from pack_idle_state_motion import ArtError, tidy  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/proj/cover'
REF = SOURCE / '_ref'
PREVIEW = SOURCE / '_preview'
PROMPTS = SOURCE / 'prompts.json'
CONFIG = SOURCE / 'picks.json'
RECORD = ROOT / 'docs/screen-art-assets.json'
SHEET = ROOT / 'docs/審查報告/換新畫風_proj_標題_2026-09-22.png'
HEROES = ('qiuqiu', 'feifei', 'dangdang', 'fengfeng')
NAME = {'qiuqiu': '球球', 'feifei': '菲菲', 'dangdang': '噹噹', 'fengfeng': '封封'}
LAYERS = ('cat', 'dust')
MAX_TRIES = 4
PM_COMMIT = '6aac3ad'     # 今天下午那版（換小貓之後）；舊版從 gen_screen_art.BASE_COMMIT（a4e6d19）讀

# 舊貼圖裡貓的外框（560 畫布像素，x0, y0, x1, y1；耳尖／頭髮頂到腳底，含甩出去的頭帶、尾巴、舉起的拳頭）。
# 人眼在 10 像素格線上量（scratchpad 的 fine_*.jpg），誤差約 ±5 像素。
OLD_CAT = {
    'qiuqiu': (141, 172, 492, 531),
    'feifei': (129, 145, 400, 534),
    'dangdang': (95, 131, 442, 533),
    'fengfeng': (118, 133, 415, 533),
}
CAT_MAIN_BODY = .97
DUST_MAIN_BODY = .80       # 碎石是分開的小塊
GEN_EDGE = .01
FINAL_EDGE = 2
TITLE_GAP = 6              # 煙塵頂最多離題字底線這麼遠
HEIGHT_SPREAD = .12        # 四隻貓身高差（最高 ÷ 最矮 − 1）
DUST_WIDEN = 1.12          # 煙塵最多比舊圖本體寬這麼多（再寬就擠到隔壁那張貼圖）
TOP_SLACK = 20             # 本體（貓＋煙塵）頂端最多比舊圖低這麼多像素
DUST_GAP_MAX = 40          # 煙塵頂最多離題字底線這麼遠（下午那版貓頭底下整排空著）
WEBP_QUALITY = 82

CAT_POSE = {
    # 舊貼圖的姿勢（參考圖②），寫得比下午那批具體：身體要站高、頭要在最上面
    'qiuqiu': ('stepping forward toward the viewer in a lively crouch, one front paw raised in a loose fist at chest '
               'height, the navy headband tails flying out to the side, a big excited open-mouthed grin'),
    'feifei': ('standing with one paw making a V-sign (peace sign) up beside her face and the other paw on her hip, '
               'her tail curling out to the side, a cheerful open-mouthed smile'),
    'dangdang': ('a wide strong stance, one arm raised high with the fist up beside the head showing off the copper '
                 'bracer, the other fist with its bracer held at the waist, the tail curling out to the side, a '
                 'confident open-mouthed shout'),
    'fengfeng': ('a wide stance, one fist raised up beside the head, the other paw resting on the hilt of the sheathed '
                 'jian at the waist, the red scarf flying, an excited open-mouthed grin'),
}


def refs() -> None:
    """① 新版待機第 1 格（白底）；② 舊貼圖拿掉題字（白底，只取姿勢與煙塵的樣子）。"""
    REF.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        idle_ref(hero).save(REF / f'{hero}_idle.png')
        body = split_cover(old_sprite(hero, 'cover'))[1]
        canvas = Image.new('RGBA', body.size, (255, 255, 255, 255))
        canvas.alpha_composite(body)
        canvas.convert('RGB').resize((1024, 1024), Image.LANCZOS).save(REF / f'{hero}_cover_old.png')
    print(f'參考圖已輸出到 {REF}')


def prompt_for(hero: str, layer: str) -> str:
    if layer == 'cat':
        return (
            f'Create ONE transparent "arrival" sticker character of {look_for(hero, "cover")}. '
            "Reference image 1 is this character's CURRENT in-game idle frame: copy the face, head shape and head "
            'size relative to the body, the chibi proportions (big head, short torso, short legs), outfit, colours, '
            'clean dark hand-drawn contours and soft cel shading EXACTLY from it. '
            'Reference image 2 is the OLD version of this sticker (a cat bursting out of a dust explosion), drawn in '
            'an outdated style: use it ONLY for the pose, gesture and expression; do NOT copy its thin lines, its '
            'head shape, its proportions or its colours, and do NOT draw its dust cloud. '
            f'Pose: the character faces the viewer in a three-quarter view turned slightly to the right, {CAT_POSE[hero]}. '
            'Draw ONLY the character: no dust, no cloud, no smoke, no burst rays, no rocks, no effects, no floor, no '
            'ground shadow, no glow, no motion lines, no text, no letters, no borders. The character is large and '
            'centred, the whole body from ear tips to soles about 80% of the canvas height, with transparent margins '
            'on every side (at least 5% of the canvas) so ears, hair, tail, paws and cloth tails are fully visible. '
            'Truly transparent RGBA background (no checkerboard drawing, no white box). Exactly one character, a '
            'freshly drawn whole character with natural joints; no paper-cut limbs.'
        )
    return (
        'Create ONE transparent cartoon DUST-CLOUD EXPLOSION backdrop for a game sticker. Reference image 1 is a '
        'finished character in the target art style (clean dark hand-drawn contours, soft cel shading): match that '
        'line and shading style. Reference image 2 is the OLD sticker: copy the look of ITS dust explosion only — '
        'a big puffy cream-beige dust cloud made of round billows with light-tan shading, bright light-beige spiky '
        'burst rays sticking out all around its top and sides, and a few small brown rock chips flying out — but '
        'draw NO character at all: no cat, no animal, no person, no face, no paws, no tail, no clothes. The cloud '
        'is solid and filled all the way through its middle (a character will be placed in front of it later). '
        'It fills the WHOLE landscape canvas like the burst in reference image 2: its outermost billows and rock '
        'chips reach the left and right margins, its highest spiky rays reach the top margin and its roughly flat '
        'bottom sits on the bottom margin; the billowing cloud body rises to about two thirds of the canvas height '
        'and long spiky rays shooting up and out fill the top third. Keep small transparent margins (about 2% of '
        'the canvas) on every side. Truly transparent RGBA '
        'background outside the cloud (no checkerboard drawing, no white box), no text, no letters, no borders, '
        'no ground, no shadow.'
    )


_LOCK = threading.Lock()


def record_prompt(key: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(key, []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                         'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(hero: str, layer: str, note: str = '') -> tuple[str, int, str]:
    name = f'{hero}_{layer}'
    SOURCE.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        if attempt > MAX_TRIES:
            return name, attempt, f'已經生過 {MAX_TRIES} 次，不再重來'
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(hero, layer) + (f' {note}' if note else '')
    ref1 = REF / f'{hero}_idle.png'
    # 煙塵：第 1 輪 1536×1024 只說「寬約高的 1.4 倍」，畫成扁扁一坨（寬是高的兩倍），放到舊圖的寬度頂端離題字一大截；
    # 第 2 輪改正方形說「跟寬一樣高」，又畫成 1:1，放進舊圖寬度會蓋到題字。第 3 輪起回到橫幅、要它撐滿整張畫布（約 1.45:1，跟舊圖本體 1.41:1 相近）
    size = '1024x1024' if layer == 'cat' else '1536x1024'
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', size, '--quality', 'high', '--prompt', text,
               '--image', str(ref1), '--image', str(REF / f'{hero}_cover_old.png'), '--out', str(target), '--force']
    started = time.time()
    status = ''
    for wait in (0, 60, 180):          # 限流就等一下再試，不降品質
        if wait:
            time.sleep(wait)
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-400:]}'
    (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
    record_prompt(name, attempt, text, status)
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def bbox(image: Image.Image) -> tuple[int, int, int, int]:
    box = image.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    if box is None:
        raise ArtError('整張是空的')
    return box


def main_share(alpha: np.ndarray) -> float:
    solid = alpha > 16
    labels, count = ndimage.label(solid)
    if count == 0:
        return 0.0
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    return float(sizes.max() / sizes.sum())


def load_layer(hero: str, layer: str, attempt: int, main_min: float) -> Image.Image:
    label = f'{hero}/{layer} 第 {attempt} 次'
    image = tidy(Image.open(SOURCE / f'{hero}_{layer}.try{attempt}.png'))
    alpha = np.array(image.getchannel('A'))
    if image.getchannel('A').getextrema() != (0, 255):
        raise ArtError(f'{label}: 背景不是真透明')
    if max(alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]) > 0:
        raise ArtError(f'{label}: 四個角有不透明像素')
    share = main_share(alpha)
    if share < main_min:
        raise ArtError(f'{label}: 最大一塊只佔 {share:.1%}（至少 {main_min:.0%}），多畫了東西')
    x0, y0, x1, y1 = bbox(image)
    # 貓要留 1% 以上（耳朵、尾巴容易被切）；煙塵的尖刺本來就要撐到邊，只要沒貼到最外一排（沒被切掉）就好
    edge = GEN_EDGE * max(image.size) if layer == 'cat' else 2
    if min(x0, y0, image.width - x1, image.height - y1) < edge:
        raise ArtError(f'{label}: 貼到畫布邊（外框 {x0},{y0}～{x1},{y1}），可能被切掉')
    return image.crop((x0, y0, x1, y1))


def old_dust_box(hero: str) -> tuple[tuple[int, int, int, int], int]:
    """舊圖本體（煙塵＋貓）外框、題字層的最下一排。"""
    title, body = split_cover(old_sprite(hero, 'cover'))
    return bbox(body), bbox(title)[3]


def build(hero: str, cat_try: int, dust_try: int) -> tuple[Image.Image, dict]:
    cat = load_layer(hero, 'cat', cat_try, CAT_MAIN_BODY)
    dust = load_layer(hero, 'dust', dust_try, DUST_MAIN_BODY)
    title = split_cover(old_sprite(hero, 'cover'))[0]
    (bx0, by0, bx1, sole), title_bottom = old_dust_box(hero)
    cw, ch = 560, 560
    # 煙塵：寬對齊舊本體外框，底對齊腳底線；太矮就放大到頂端碰到題字底線下方 TITLE_GAP 以內，
    # 但最多比舊本體寬 DUST_WIDEN（再寬就擠到隔壁那張貼圖）
    k = (bx1 - bx0) / dust.width
    want_top = title_bottom + TITLE_GAP
    if sole - dust.height * k > want_top:
        k = min((sole - want_top) / dust.height, (bx1 - bx0) * DUST_WIDEN / dust.width, (cw - 2 * FINAL_EDGE) / dust.width)
    dust_s = dust.resize((round(dust.width * k), round(dust.height * k)), Image.LANCZOS)
    dx = round((bx0 + bx1) / 2 - dust_s.width / 2)
    dx = min(max(dx, FINAL_EDGE), cw - FINAL_EDGE - dust_s.width)
    dy = sole - dust_s.height
    # 貓：高度＝舊圖貓外框高，腳底對齊腳底線，左右中心對齊舊圖貓
    ox0, oy0, ox1, oy1 = OLD_CAT[hero]
    kc = (oy1 - oy0) / cat.height
    cat_s = cat.resize((round(cat.width * kc), round(cat.height * kc)), Image.LANCZOS)
    cx = round((ox0 + ox1) / 2 - cat_s.width / 2)
    cx = min(max(cx, FINAL_EDGE), cw - FINAL_EDGE - cat_s.width)
    # 腳底：舊圖貓的腳底（人眼量的，可能比煙塵底邊低 1～2 像素），但不低於腳底線（封封量到 533、腳底線 531）
    cy = min(oy1, sole) - cat_s.height
    if cy < FINAL_EDGE or cx < FINAL_EDGE or cx + cat_s.width > cw - FINAL_EDGE:
        raise ArtError(f'{hero}: 貓放大到 {cat_s.width}×{cat_s.height} 放不進畫布（左 {cx}、上 {cy}）')
    canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    canvas.alpha_composite(title)
    canvas.alpha_composite(dust_s, (dx, dy))
    canvas.alpha_composite(cat_s, (cx, cy))
    box = bbox(_union(dust_s, dx, dy, cat_s, cx, cy, cw, ch))
    info = {
        'attempt': {'cat': cat_try, 'dust': dust_try},
        'source': {'cat': f'{hero}_cat.try{cat_try}.png', 'dust': f'{hero}_dust.try{dust_try}.png'},
        'catBox': [cx, cy, cx + cat_s.width, cy + cat_s.height],
        'oldCatBox': list(OLD_CAT[hero]),
        'dustBox': [dx, dy, dx + dust_s.width, dy + dust_s.height],
        'titleBottom': title_bottom,
        'gapToTitle': dy - title_bottom,
        'bodyGap': min(dy, cy) - title_bottom,
        'oldBodyGap': by0 - title_bottom,
        'canvas': [cw, ch],
        'box': list(box),
        'oldBox': [bx0, by0, bx1, sole],
        'soleLine': sole,
    }
    return canvas, info


def _union(a: Image.Image, ax: int, ay: int, b: Image.Image, bx: int, by: int, cw: int, ch: int) -> Image.Image:
    layer = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    layer.alpha_composite(a, (ax, ay))
    layer.alpha_composite(b, (bx, by))
    return layer


def encode(image: Image.Image) -> bytes:
    rgba = np.array(image)
    rgba[rgba[..., 3] == 0, :3] = 0
    buf = io.BytesIO()
    Image.fromarray(rgba, 'RGBA').save(buf, 'WEBP', quality=WEBP_QUALITY, method=6)
    return buf.getvalue()


def load_picks() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8')) if CONFIG.exists() else {}


def build_all() -> dict[str, tuple[Image.Image, dict]]:
    picks = load_picks()
    missing = [f'{h}/{l}' for h in HEROES for l in LAYERS if l not in picks.get(h, {})]
    if missing:
        raise ArtError(f'還沒選定：{", ".join(missing)}')
    out = {hero: build(hero, picks[hero]['cat']['attempt'], picks[hero]['dust']['attempt']) for hero in HEROES}
    heights = [info['catBox'][3] - info['catBox'][1] for _, info in out.values()]
    spread = max(heights) / min(heights) - 1
    if spread > HEIGHT_SPREAD:
        raise ArtError(f'四隻貓身高差 {spread:.1%}（上限 {HEIGHT_SPREAD:.0%}）：{heights}')
    for hero, (_, info) in out.items():
        if info['bodyGap'] > info['oldBodyGap'] + TOP_SLACK:
            raise ArtError(f'{hero}: 本體頂端離題字底線 {info["bodyGap"]} 像素，比舊圖（{info["oldBodyGap"]}）低超過 {TOP_SLACK}')
        if info['gapToTitle'] > DUST_GAP_MAX:
            raise ArtError(f'{hero}: 煙塵頂離題字底線 {info["gapToTitle"]} 像素（上限 {DUST_GAP_MAX}），又空一截')
        eye = picks[hero].get('eye', '')
        if not eye:
            raise ArtError(f'{hero}: 頭的大小要附人眼並排看過的結論（pick … --eye）')
        info['eye'] = eye
    return out


def pm_sprite(hero: str) -> Image.Image:
    rel = sprite_path(hero, 'cover').relative_to(ROOT).as_posix()
    blob = subprocess.run(['git', 'show', f'{PM_COMMIT}:{rel}'], cwd=ROOT, capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(blob)).convert('RGBA')


def sheet(results: dict[str, tuple[Image.Image, dict]], path: Path = SHEET) -> None:
    """每隻一列：舊（今天以前）｜今天下午版｜新，暗底同比例；貓外框畫細框，量給人看。"""
    font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 22)
    small = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 16)
    cell, head = 360, 40
    out = Image.new('RGB', (cell * 3 + 140, head + cell * len(HEROES)), (30, 34, 46))
    d = ImageDraw.Draw(out)
    for i, t in enumerate(('舊（今天以前）', '今天下午版（貓變小、題字下空一截）', '新（batch proj）')):
        d.text((140 + i * cell + 8, 8), t, font=small, fill=(255, 230, 170))
    k = cell / 560
    for row, hero in enumerate(HEROES):
        y = head + row * cell
        d.text((10, y + 10), NAME[hero], font=font, fill=(255, 255, 255))
        final, info = results[hero]
        h_new = info['catBox'][3] - info['catBox'][1]
        ob = OLD_CAT[hero]
        d.text((10, y + 50), f'舊貓高 {ob[3] - ob[1]}', font=small, fill=(200, 200, 200))
        d.text((10, y + 72), f'新貓高 {h_new}', font=small, fill=(200, 200, 200))
        d.text((10, y + 94), f'煙塵頂離底線 {info["gapToTitle"]}', font=small, fill=(200, 200, 200))
        d.text((10, y + 116), f'本體頂離底線 {info["bodyGap"]}', font=small, fill=(200, 200, 200))
        d.text((10, y + 138), f'（舊 {info["oldBodyGap"]}）', font=small, fill=(200, 200, 200))
        for col, im in enumerate((old_sprite(hero, 'cover'), pm_sprite(hero), final)):
            tile = Image.new('RGBA', (560, 560), (22, 30, 52, 255))
            tile.alpha_composite(im)
            if col != 1:
                box = ob if col == 0 else info['catBox']
                ImageDraw.Draw(tile).rectangle(box, outline=(255, 90, 90, 255), width=2)
            out.paste(tile.convert('RGB').resize((cell, cell), Image.LANCZOS), (140 + col * cell, y))
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, optimize=True)
    print(f'聯絡表：{path.relative_to(ROOT)}')


def pack(write: bool) -> None:
    results = build_all()
    if not write:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        for hero, (final, info) in results.items():
            final.save(PREVIEW / f'{hero}_cover.png')
            print(hero, json.dumps(info, ensure_ascii=False))
        sheet(results, PREVIEW / 'sheet.png')
        return
    record = json.loads(RECORD.read_text(encoding='utf-8'))
    for hero, (final, info) in results.items():
        data = encode(final)
        path = sprite_path(hero, 'cover')
        entry = record['files'][f'{hero}/cover']
        entry.update({
            'attempt': info['attempt'], 'source': info['source'], 'batch': 'proj',
            'sizeBy': 'eye', 'eye': info['eye'],
            'catBox': info['catBox'], 'oldCatBox': info['oldCatBox'], 'dustBox': info['dustBox'],
            'gapToTitle': info['gapToTitle'], 'bodyGap': info['bodyGap'], 'oldBodyGap': info['oldBodyGap'],
            'canvas': info['canvas'], 'box': info['box'],
            'oldBox': info['oldBox'], 'soleLine': info['soleLine'],
            'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
        })
        # 下午那批量生圖原檔的數字（頭部比對、縮放修正、最大一塊、原檔大小）量的是換掉的那張，拿掉；
        # pxPerUnit 留著：`pack_screen_art.py sheet` 拿它畫參考用的待機，這一批的貓是照舊貓外框放大的，不照它
        for stale in ('headRaw', 'sizeFix', 'mainBody', 'sourceSize'):
            entry.pop(stale, None)
        path.write_bytes(data)
        print(f'{hero}: 貓 {info["catBox"]}（舊 {info["oldCatBox"]}），煙塵 {info["dustBox"]}，'
              f'本體頂離底線 {info["bodyGap"]}（舊 {info["oldBodyGap"]}），{len(data) // 1024} KB')
    record['note'] += ' 四張 cover 由批次 proj（tools/gen_cover_art.py）重做：貓放大到舊貼圖的大小、煙塵補到題字底線下。'
    RECORD.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sheet(results)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    p = sub.add_parser('prompt')
    p.add_argument('layer', choices=LAYERS)
    p.add_argument('hero', choices=HEROES)
    g = sub.add_parser('gen')
    g.add_argument('layer', choices=LAYERS)
    g.add_argument('heroes', nargs='+', choices=HEROES)
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('hero', choices=HEROES)
    k.add_argument('layer', choices=LAYERS)
    k.add_argument('attempt', type=int)
    k.add_argument('--eye', default='', help='頭的大小人眼並排看過的結論（選貓那一層時給）')
    sub.add_parser('check')
    sub.add_parser('pack')
    args = parser.parse_args()
    try:
        if args.command == 'refs':
            refs()
        elif args.command == 'prompt':
            print(prompt_for(args.hero, args.layer))
        elif args.command == 'gen':
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                for name, attempt, status in pool.map(lambda h: generate(h, args.layer, args.note), args.heroes):
                    print(f'{name} 第 {attempt} 次：{status}', flush=True)
        elif args.command == 'pick':
            if not (SOURCE / f'{args.hero}_{args.layer}.try{args.attempt}.png').exists():
                raise SystemExit('沒有這一次')
            data = load_picks()
            data.setdefault(args.hero, {})[args.layer] = {'attempt': args.attempt}
            if args.eye:
                data[args.hero]['eye'] = args.eye
            CONFIG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(f'{args.hero}/{args.layer} 採用第 {args.attempt} 次')
        else:
            pack(args.command == 'pack')
    except ArtError as error:
        print(f'不合格，整批停下：{error}', file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
