"""選角、結算、過關、特殊獎勵、標題五個畫面的主角立繪換新畫風（2026-09-22，批次 `screens`）。

背景：戰鬥、對白、走路轉場已經是新版畫風（逐格動作），這五個畫面還在用 09-11～09-20 那批舊立繪
（`public/assets/sprites/hero/*.webp`），同一趟流程長相來回換（盤點報告 `docs/審查報告/畫面盤點_2026-09-22.md`
第 4 項、第 12 項、第二節）。使用者裁定全部重畫成新版畫風。

換哪幾張（四隻貓 × 六種，共 24 張，**同檔名、同畫布**覆蓋，程式與清單都不動）：
  idle   選角（`heroselect.ts` 的 PICKS）          `ninja`／`<代號>_idle`
  win    結算贏、過關信物與秘寶亮相、獎勵關主信物   `<代號>_win`
  lose   結算輸                                       `<代號>_lose`（封封那張暗底白毛邊一併解決）
  eat    獎勵：沒牌可挑                               `<代號>_eat`
  dizzy  獎勵：魔物散掉                               `<代號>_dizzy`（封封的檔名是 `fengfeng_dizzy_clean`）
  cover  標題「參上」貼圖                             `cover`／`<代號>_cover`
（實際檔名一律從 `public/assets/manifest.json` 查，不在這裡寫死。）

參考圖（`refs` 子指令產生，放在 `_ref/`，白底 1024×1024）：
  ① 新版待機第 1 格，照「站高 60% 畫布、腳底在 92%、左右置中」擺好（跟挨打那批同一個版面，
     直接借 `gen_hit_recoil_art.idle_ref`）——長相、頭身比、畫風、大小一律以它為準；
  ② 要換掉的那張舊圖（只取姿勢、手勢、表情、道具；細線、小頭、舊配色不照抄）。
     標題貼圖的舊圖先把「参上」題字拿掉（題字由打包時從舊圖原樣疊回去，見 `pack_screen_art.py`）。
     選角的待機不給②：選角直接畫成戰鬥裡那個待機姿勢，玩家選完一進戰鬥就是同一個架式。

生圖後端：`~/.codex/skills/codex-ppt/scripts/image_gen.py edit --backend codex-oauth
--model gpt-image-1.5 --background transparent`（直接出真透明）。

用法：
    python tools/gen_screen_art.py refs
    python tools/gen_screen_art.py prompt feifei win
    python tools/gen_screen_art.py gen qiuqiu/win feifei/win --jobs 4
    python tools/gen_screen_art.py gen all --jobs 6
    python tools/gen_screen_art.py gen feifei/win --note "修正說明"     # 重生時補在提示詞最後
    python tools/gen_screen_art.py pick feifei/win 2                    # 選定第 2 次當正式來源
每一次生圖都存成 `<角色>_<種類>.try<N>.png`（不覆蓋），檢查過才 `pick`，
再交給 `tools/pack_screen_art.py` 打包。同一張最多生 4 次（使用者 2026-09-22：額度很多，但不要無限重來）。
"""
from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_hit_recoil_art import CANVAS, idle_ref, look  # noqa: E402
from gen_idle_state_art import IMAGE_GEN  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/screens'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
CONFIG = SOURCE / 'actions.json'
MANIFEST = ROOT / 'public/assets/manifest.json'
HEROES = ('qiuqiu', 'feifei', 'dangdang', 'fengfeng')
POSES = ('idle', 'win', 'lose', 'eat', 'dizzy', 'cover')
PREFIX = {'qiuqiu': 'ninja', 'feifei': 'feifei', 'dangdang': 'dangdang', 'fengfeng': 'fengfeng'}
MAX_TRIES = 4
TITLE_BOTTOM = 200      # 舊貼圖的題字、底線、速度線都在這一排以上（560 畫布）


def sprite_key(hero: str, pose: str) -> str:
    p = PREFIX[hero]
    if pose == 'idle':
        return 'hero/ninja' if p == 'ninja' else f'hero/{p}_idle'
    if pose == 'cover':
        return 'hero/cover' if p == 'ninja' else f'hero/{p}_cover'
    return f'hero/{p}_{pose}'


def sprite_path(hero: str, pose: str) -> Path:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    return ROOT / 'public' / manifest['sprites'][sprite_key(hero, pose)]


BASE_COMMIT = 'a4e6d19'          # 換圖前的版本（2026-09-22 線上版）：舊圖一律從這裡讀，換完重跑才不會拿新圖當舊圖


def old_sprite(hero: str, pose: str) -> Image.Image:
    rel = sprite_path(hero, pose).relative_to(ROOT).as_posix()
    blob = subprocess.run(['git', 'show', f'{BASE_COMMIT}:{rel}'], cwd=ROOT, capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(blob)).convert('RGBA')


def split_cover(image: Image.Image) -> tuple[Image.Image, Image.Image]:
    """舊「參上」貼圖拆成（題字層, 本體層）。

    題字、底線、速度線是一塊塊獨立的筆畫，都在上面 200 排以內；本體（煙塵＋貓）是最大的那一塊。
    封封那張的底線被耳朵尖碰到、跟本體連成一塊，所以本體裡 150 排以上的**黃色**像素也算題字（底線是亮黃色，
    橘毛的紅綠差比它大得多，不會被誤抓）。
    """
    a = np.array(image.convert('RGBA'))
    solid = a[..., 3] > 8
    labels, count = ndimage.label(solid)
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    big = int(np.argmax(sizes)) + 1
    title = np.zeros_like(solid)
    for i, box in enumerate(ndimage.find_objects(labels), 1):
        if i != big and box[0].start < 150 and box[0].stop <= TITLE_BOTTOM:
            title |= labels == i
    r, g, b = (a[..., c].astype(int) for c in range(3))
    yellow = (labels == big) & (r > 170) & (g > 140) & (b < 120) & (r - g < 75)
    yellow[150:] = False
    title |= yellow
    top, body = a.copy(), a.copy()
    top[~title, 3] = 0
    body[title, 3] = 0
    return Image.fromarray(top, 'RGBA'), Image.fromarray(body, 'RGBA')


def old_ref(hero: str, pose: str) -> Image.Image:
    """舊圖（標題貼圖先拿掉題字），角色外框縮到畫布 84%、置中，鋪白底。"""
    image = old_sprite(hero, pose)
    if pose == 'cover':
        image = split_cover(image)[1]
    box = image.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    body = image.crop(box)
    k = CANVAS * .84 / max(body.size)
    body = body.resize((round(body.width * k), round(body.height * k)), Image.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS, CANVAS), (255, 255, 255, 255))
    canvas.alpha_composite(body, ((CANVAS - body.width) // 2, (CANVAS - body.height) // 2))
    return canvas.convert('RGB')


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        idle_ref(hero).save(REF / f'{hero}_idle.png')
        for pose in POSES:
            if pose != 'idle':
                old_ref(hero, pose).save(REF / f'{hero}_{pose}_old.png')
    print(f'參考圖已輸出到 {REF}')


# 外觀描述沿用待機狀態那批（`gen_idle_state_art.LOOK`），只有封封勝利那張要拔劍，把「永遠收在鞘裡」那句換掉
def look_for(hero: str, pose: str) -> str:
    text = look(hero)
    if hero == 'fengfeng' and pose == 'win':
        text = text.replace('kept SHEATHED in a dark-brown scabbard at the waist in EVERY frame (never drawn)',
                            'drawn out of its dark-brown scabbard, the empty scabbard stays at the waist')
    return text


SCALE = ('the SAME character scale as reference image 1: the head drawn at EXACTLY the same size as in '
         'reference image 1, the same chibi head-to-body ratio (big head, short torso, short legs), ')
CAMERA = ('keep the same three-quarter side view with the character FACING RIGHT and ')
REF2 = ('Reference image 2 is the OLD artwork of this same pose, drawn in an outdated style: use it ONLY for the '
        'pose, gesture, expression and props; do NOT copy its thin lines, its smaller head, its longer body, its '
        'colours or its painting style. ')
TAIL = ('Exactly one full-body character, fully inside the canvas with transparent margins on every side (at '
        'least 5% of the canvas) so ears, tail, paws and cloth tails are fully visible. Truly transparent RGBA '
        'background: no checkerboard drawing, no white or coloured background, no floor, no ground shadow, no '
        'glow, no motion lines, no sweat drops, no text, no labels, no borders. A freshly drawn whole character '
        'with natural joints; no paper-cut limbs, no extra characters.')
LOW = ('Nothing (no paw, fist, sword, hair or star) may rise more than 3% of the canvas height above the ear '
       'tips. ')

POSE_TEXT = {
    'idle': {
        '*': ('New asset: the character\'s IDLE fighting stance, exactly the same pose, facing and expression as '
              'reference image 1: this is simply a crisp, clean, high-resolution redraw of that very frame. '),
    },
    'win': {
        'qiuqiu': ('New asset: VICTORY pose. Standing tall and proud, the right fist pumped up in the air right '
                   'beside the head (the fist no higher than the ear tips), the left fist clenched in front of the '
                   'chest, a confident smug smile with the eyes narrowed. '),
        'feifei': ('New asset: VICTORY pose. Standing, one paw making a cheerful V-sign (peace sign) next to her '
                   'face at cheek height, the other paw resting at the belt, winking one eye with a happy smile. '),
        'dangdang': ('New asset: VICTORY pose. Standing sturdily, one arm bent upward with the fist raised beside '
                     'the head to show off the copper bracer (the fist no higher than the ear tips), the other fist '
                     'at the waist, eyes closed with a proud satisfied smile. '),
        # 第 1 次照舊圖把劍舉過頭，縮到跟待機同比例後比畫布高 170 像素，放不下（2026-09-22）；改成扛在肩上
        'fengfeng': ('New asset: VICTORY pose. Standing proudly, the drawn jian sword RESTING ON HIS SHOULDER: the '
                     'front paw holds the hilt at shoulder height and the blade lies back over the shoulder, pointing '
                     'BACKWARD (to the left, behind him) and only slightly upward, the whole sword lower than the ear '
                     'tips; the other paw a fist on the hip; a happy open-mouthed grin. '),
    },
    'lose': {
        'qiuqiu': ('New asset: DEFEATED pose. Kneeling on the ground on both knees and sitting back on the heels, '
                   'shoulders slumped, the head bowed forward, eyes closed, a sad exhausted face, both paws resting '
                   'on the ground in front of the knees. '),
        'feifei': ('New asset: DEFEATED pose. Sitting on the ground with the legs folded to one side, one paw '
                   'propped on the ground, shoulders slumped, sad downcast eyes about to cry; the gold needle '
                   'tubes stay on her belt. '),
        # 第 1 次腿伸直、尾巴甩開，縮到跟待機同比例後 587 像素寬，比畫布還寬；改成縮成一團
        'dangdang': ('New asset: DEFEATED pose. Sitting slumped on the ground in a COMPACT heap: the knees drawn up '
                     'close in front of the body, the back hunched, the head hanging low with downcast eyes, both '
                     'forearms with the copper bracers resting on the knees, the tail curled tightly against the '
                     'body. The whole silhouette is compact: no wider than 55% of the canvas. '),
        'fengfeng': ('New asset: DEFEATED pose. Kneeling on the ground on both knees and sitting back on the heels, '
                     'both paws resting on the knees, shoulders slumped, the head bowed, eyes half-closed and sad; '
                     'the jian stays sheathed at the waist. '),
    },
    # 第 1 次站得直挺挺（或畫成頭小身長），縮到跟待機同比例後比畫布高；架式與身高寫死成跟待機一樣
    'eat': {
        '*': ('New asset: EATING pose. Holding a white onigiri rice ball with a black nori strip in both paws '
              'right at the mouth and taking a happy bite, eyes closed in bliss, blushing cheeks. Keep the SAME '
              'stance, the SAME leg pose and the SAME overall height from ear tips to soles as reference image 1: '
              'do NOT stand up straighter or taller, and do NOT draw the head smaller or the body longer than in '
              'reference image 1. '),
    },
    # 第 1 次星星畫在頭頂上方、人也站直，縮到跟待機同比例後比畫布高 16～55 像素；星星改到頭的兩側
    'dizzy': {
        '*': ('New asset: DAZED pose. Wobbling unsteadily in the SAME stance, the SAME leg pose and the SAME '
              'overall height from ear tips to soles as reference image 1 (do NOT stand up straighter or taller), '
              'arms hanging loosely, the head tilted, big swirly spiral eyes, a wavy confused mouth. Two or three '
              'SMALL yellow five-pointed stars float BESIDE the head, to its left and right at eye-to-ear height, '
              'NOT above the head; they are the only extra marks allowed. No wobble lines, no motion lines. '),
    },
}
COVER_POSE = {
    'qiuqiu': 'crouching a little in a lively ready pose, one paw raised in a fist, a big excited open-mouthed grin',
    'feifei': ('standing with one paw making a V-sign next to her face and the other paw on her hip, a cheerful '
               'open-mouthed smile'),
    'dangdang': ('a wide strong stance, one fist raised up beside the head showing off the copper bracer, the other '
                 'fist at the waist, a confident open-mouthed shout'),
    'fengfeng': ('a wide stance, one fist raised beside the head, the other paw resting on the hilt of the sheathed '
                 'jian at the waist, an excited open-mouthed grin'),
}


def prompt_for(hero: str, pose: str) -> str:
    if pose == 'cover':
        return (
            f'Create ONE transparent "arrival" sticker illustration of {look_for(hero, pose)}. '
            "Reference image 1 is this character's CURRENT in-game idle frame: copy the face, head size, body "
            'proportions, outfit, colours, clean dark hand-drawn contours and soft cel shading EXACTLY from it, and keep '
            + SCALE + 'about 60% of the canvas height from ear tips to soles, the soles at 92% of the canvas height, '
            'the character centred horizontally. '
            'Reference image 2 is the OLD version of this sticker, drawn in an outdated style: use it ONLY for the '
            'composition (the character bursting out in front of a big dust-cloud explosion) and the pose; do NOT '
            'copy its thin lines, its head shape, its proportions or its colours. '
            f'Pose: the character faces the viewer in a three-quarter view turned slightly to the right, '
            f'{COVER_POSE[hero]}. Behind the character: a large cream-beige puffy dust cloud explosion with spiky '
            'light-beige burst rays and a few small brown rock chips flying out, drawn in the same clean dark-contour '
            'cel-shaded style; the cloud spans from about 3% to 97% of the canvas width and from about 30% down to '
            '95% of the canvas height, with a roughly flat bottom edge. The TOP 27% of the canvas must stay '
            'COMPLETELY EMPTY and transparent (a title will be added there later); only the ear tips may touch it. '
            'Truly transparent RGBA background outside the cloud: no checkerboard drawing, no white or coloured '
            'background, no floor, no ground shadow, no glow, no text, no letters, no labels, no borders, no '
            'extra characters.'
        )
    table = POSE_TEXT[pose]
    body = table.get(hero, table.get('*', ''))
    return (
        f'Create ONE production-ready transparent game sprite of {look_for(hero, pose)}. '
        "Reference image 1 is this character's CURRENT in-game idle frame: copy the face, head size, body "
        'proportions, outfit, colours, clean dark hand-drawn contours and soft cel shading EXACTLY from it, and '
        + CAMERA + SCALE + 'the soles (or the knees and seat, when kneeling or sitting) on the SAME ground line at '
        '92% of the canvas height, the body centred horizontally. '
        + ('' if pose == 'idle' else REF2) + body + LOW + TAIL
    )


_LOCK = threading.Lock()


def record_prompt(job: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(job, []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                         'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(job: str, extra_note: str = '') -> tuple[str, int, str]:
    hero, pose = job.split('/')
    name = f'{hero}_{pose}'
    SOURCE.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        if attempt > MAX_TRIES:
            return job, attempt, f'已經生過 {MAX_TRIES} 次，不再重來（要再生先改提示詞並在回報裡說明）'
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(hero, pose) + (f' {extra_note}' if extra_note else '')
    images = ['--image', str(REF / f'{hero}_idle.png')]
    if pose != 'idle':
        images += ['--image', str(REF / f'{hero}_{pose}_old.png')]
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{CANVAS}x{CANVAS}', '--quality', 'high',
               '--prompt', text, *images, '--out', str(target), '--force']
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
    record_prompt(job, attempt, text, status)
    return job, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def expand(jobs: list[str]) -> list[str]:
    out: list[str] = []
    for job in jobs:
        if job == 'all':
            out += [f'{h}/{p}' for p in POSES for h in HEROES]
        elif job in POSES:
            out += [f'{h}/{job}' for h in HEROES]
        else:
            hero, pose = job.split('/')
            if hero not in HEROES or pose not in POSES:
                raise SystemExit(f'不認得 {job}')
            out.append(job)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    p = sub.add_parser('prompt')
    p.add_argument('hero', choices=HEROES)
    p.add_argument('pose', choices=POSES)
    g = sub.add_parser('gen')
    g.add_argument('jobs', nargs='+', help='角色/種類、種類（四隻一起）或 all')
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='', help='重生時補在提示詞最後的修正說明')
    k = sub.add_parser('pick')
    k.add_argument('job')
    k.add_argument('attempt', type=int)
    k.add_argument('--eye', default='', help='頭部大小或面向要靠人眼判斷時，寫下並排看過的結論')
    k.add_argument('--fix', type=float, default=None, help='人眼並排訂的大小修正倍率（跟 --eye 一起給）')
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'prompt':
        print(prompt_for(args.hero, args.pose))
    elif args.command == 'pick':
        hero, pose = args.job.split('/')
        chosen = SOURCE / f'{hero}_{pose}.try{args.attempt}.png'
        if not chosen.exists():
            raise SystemExit(f'沒有 {chosen.name}')
        data = json.loads(CONFIG.read_text(encoding='utf-8')) if CONFIG.exists() else {}
        entry = {'attempt': args.attempt}
        if args.eye:
            entry['eye'] = args.eye
        if args.fix is not None:
            entry['fix'] = args.fix
        data.setdefault(hero, {})[pose] = entry
        CONFIG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{args.job} 採用第 {args.attempt} 次')
    else:
        jobs = expand(args.jobs)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for job, attempt, status in pool.map(lambda j: generate(j, args.note), jobs):
                print(f'{job} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
