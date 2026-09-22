"""貓窩三個動作（打盹、磨爪、扶同伴）＋噹噹「銅護臂」秘寶圖示的生圖工具（2026-09-22，批次 rest）。

背景：貓窩畫面還在用舊立繪（`public/assets/sprites/hero/<角色>_nap／_sharpen／_helpup.webp`），
戰鬥與對白已經是新版畫風，同一趟流程長相來回換（使用者：「很亂」）。這支只負責「生」；
挑選、縮放、放進畫布與閘門在 `tools/build_rest_art.py`。

做法沿用 `tools/gen_idle_state_art.py`：
  參考圖 ①＝新版待機第 1 格（鋪白底放大）——長相、頭身比、畫風一律照它；
  參考圖 ②＝要換掉的那張舊圖（鋪白底）——只取姿勢與道具，畫風與比例不照抄。
生圖後端：`~/.codex/skills/codex-ppt/scripts/image_gen.py edit --backend codex-oauth
--model gpt-image-1.5 --background transparent`（直接出真透明）。

用法：
    python tools/gen_rest_art.py refs
    python tools/gen_rest_art.py prompt fengfeng nap
    python tools/gen_rest_art.py gen qiuqiu/nap feifei/sharpen relic/copper_bracer --jobs 4
    python tools/gen_rest_art.py pick qiuqiu/nap 2
每次生圖都存成 `<角色>/<動作>.try<N>.png`（不覆蓋），檢查過才用 `pick` 記進 `picks.json`。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/rest'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
SPRITE_KEY = {'qiuqiu': 'ninja', 'feifei': 'feifei', 'dangdang': 'dangdang', 'fengfeng': 'fengfeng'}
IDLE_DATA = {
    'qiuqiu': 'src/ui/qiuqiu-motion-data.json',
    'feifei': 'src/ui/feifei-motion-data.json',
    'dangdang': 'src/ui/dangdang-motion-data.json',
    'fengfeng': 'src/ui/fengfeng-motion-data.json',
}
SIZE = 1024

# 外觀逐項描述（取自 gen_idle_state_art.py 的 LOOK，拿掉只適用待機動畫的站姿要求）
LOOK = {
    'qiuqiu': (
        'the EXACT QIUQIU ninja cat from reference image 1: pale cream-white tabby with grey-brown stripes on the '
        'head and three brown cheek stripes, big round head with pink inner ears, black eyes, a navy headband tied '
        'with two long tails flowing behind, navy ninja gi with crossed collar, black sash tied at the front, '
        'navy trousers with black shin wraps, white paws, a grey-brown ringed striped tail'
    ),
    'feifei': (
        'the EXACT FEIFEI Siamese ninja cat from reference image 1: cream fur with dark-brown face mask, ears, paws '
        'and long smooth dark-brown tail, large BLUE eyes, dark-brown high ponytail tied with a PURPLE bow, '
        'magenta-purple gi, black scarf, black belt, black trousers with ankle wraps, a row of small gold '
        'needle tubes at the belt'
    ),
    'dangdang': (
        'the EXACT DANGDANG martial-artist cat from reference image 1: stout round BLACK-and-WHITE TUXEDO cat, '
        'black head/ears/back/tail, white muzzle, chest and large WHITE paws, AMBER eyes, teal-green sleeveless '
        'martial vest with cream lapels, brown waist sash hanging in front, dark trousers, two solid COPPER '
        'FOREARM BRACERS on both forearms. No headband, no sword, no ponytail'
    ),
    'fengfeng': (
        'the EXACT FENGFENG sword cat from reference image 1: compact orange tabby with darker orange stripes, '
        'cream-white muzzle, chest and paws, amber eyes, red scarf, red sleeveless martial vest with cream trim '
        'over rolled cream sleeves, dark charcoal trousers, brown waist sash, brown lower-leg wraps, ONE straight '
        'Chinese jian sword with brass guard and red tassel in a dark-brown scabbard. Not a katana, not a ninja'
    ),
}

# 動作：寫意圖、不寫關節角度（舊圖是姿勢參考）
POSE = {
    'nap': (
        'NAPPING in the cat nest: the cat lies down on its belly in a cosy compact loaf, head resting on its '
        'folded front paws, eyes peacefully closed as happy curved lines, a small content smile, tail wrapped '
        'around the body; relaxed, compact and low to the ground.',
        'Draw ONLY the cat: the game background already contains the cat bed, so no bed, no cushion, no pillow, '
        'no blanket. No sleep bubbles, no Z letters, no symbols.',
    ),
    'sharpen': (
        'SHARPENING: kneeling on one knee and leaning forward over a small grey whetstone block that sits on the '
        'ground in front of the cat, concentrating hard.',
        'The whetstone is the ONLY prop. No floor, no table, no shadow, no background.',
    ),
    'helpup': (
        'HELPING A FALLEN FRIEND UP: half-crouching with knees bent, leaning forward and reaching one open paw '
        'far forward and slightly down to the right as if pulling a friend up from the ground, the other paw on '
        'its own knee, worried but encouraging face with the mouth open as if calling "come on, get up!".',
        'The friend is NOT drawn: only this one cat. No props, no floor, no shadow.',
    ),
}
EXTRA = {
    ('qiuqiu', 'nap'): 'The navy headband stays on, its two tails draping behind the head.',
    ('feifei', 'nap'): 'Her ponytail with the purple bow and the gold needle tubes at the belt stay visible.',
    ('dangdang', 'nap'): 'Both copper bracers stay on his forearms; his cheek rests on the bracers.',
    ('fengfeng', 'nap'): 'The jian stays SHEATHED in its dark-brown scabbard, hugged against his side under one arm.',
    ('qiuqiu', 'sharpen'): ('He scrapes the extended claws of one paw along the whetstone while the other paw steadies '
                            'the stone; focused determined eyes, the tip of the tongue poking out, two or three tiny '
                            'yellow spark marks right at the claws.'),
    ('feifei', 'sharpen'): ('She holds one thin gold needle between her fingers and hones its tip on the whetstone; '
                            'focused narrowed blue eyes, one tiny yellow spark at the needle tip.'),
    ('fengfeng', 'sharpen'): ('He slides the drawn straight jian blade along the whetstone, holding the hilt in one '
                              'paw and pressing the flat of the blade with the other; the empty dark-brown scabbard '
                              'stays at his waist; calm focused eyes. The blade is short enough to stay well inside '
                              'the image.'),
    ('fengfeng', 'helpup'): 'The jian stays SHEATHED at his waist.',
    ('dangdang', 'helpup'): 'Both copper bracers stay on his forearms.',
}

# 噹噹的「磨爪」是調護臂（`sharpenVerb`），整段換掉，不沿用磨刀石那一句
REPLACE = {
    ('dangdang', 'sharpen'): (
        'ADJUSTING HIS BRACERS: kneeling on one knee, the left forearm raised in front of the chest, pulling the '
        'leather strap of the copper bracer on that forearm tight with the other paw, serious focused face.',
        'No whetstone, no tools, no props at all. No floor, no shadow, no background.',
    ),
}

RELIC_PROMPT = (
    'Create one game item icon: a single COPPER FOREARM BRACER, the same armour piece the black-and-white '
    'martial-artist cat in reference image 1 wears on his forearms: a sturdy rounded copper-bronze cuff that '
    'wraps the forearm, warm copper highlights, a darker bronze band near each end, a few round rivets and a '
    'short brown leather strap with a small buckle. Reference image 2 shows the ICON STYLE of the other relic '
    'icons in this game: bold dark hand-drawn outlines, soft cel shading, chunky readable silhouette, slight '
    'three-quarter view. Match that icon style exactly. One object only, empty inside (no arm, no paw, no cat), '
    'centered and filling about 85% of the image, truly transparent RGBA background: no checkerboard drawing, '
    'no shadow, no glow, no sparkles, no text, no border.'
)


def prompt_for(hero: str, pose: str) -> str:
    if hero == 'relic':
        return RELIC_PROMPT
    body, avoid = REPLACE.get((hero, pose), POSE[pose])
    extra = EXTRA.get((hero, pose), '')
    return (
        f'Create one production-ready game character illustration of {LOOK[hero]}. '
        'Reference image 1 is this character\'s CURRENT official look: copy the face, the head size relative to '
        'the body, body proportions, outfit, colours, clean dark hand-drawn contours and soft cel shading EXACTLY '
        'from it. Reference image 2 is an OLD illustration of the same action in an outdated style: use it ONLY '
        'for the pose idea; do NOT copy its proportions, face or painting style. '
        f'New asset: {body} {extra} '
        'One single complete character, full body, facing RIGHT in the same three-quarter side view as reference '
        'image 1, drawn at the same scale as reference image 1 (the head exactly as big as in reference image 1). '
        'Truly transparent RGBA background: no checkerboard drawing, no floor, no ground shadow, no glow, no text, '
        'no border. The character is centred with generous transparent margins (at least 10% of the image on '
        'every side); ears, tail, paws and props never touch the image edges. '
        f'{avoid} A freshly drawn whole character with natural joints; no detached body parts, no extra characters.'
    )


def idle_frame(hero: str) -> Image.Image:
    data = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    x, y, w, h = data['frames'][0]['rect']
    return Image.open(ROOT / 'public' / data['texture']).convert('RGBA').crop((x, y, x + w, y + h))


def on_white(im: Image.Image, fill: float) -> Image.Image:
    """鋪白底、等比放大到畫布的 `fill` 倍、置中。"""
    k = fill * SIZE / max(im.size)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    bg = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 255))
    bg.alpha_composite(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
    return bg.convert('RGB')


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero, key in SPRITE_KEY.items():
        on_white(idle_frame(hero), .8).save(REF / f'{hero}_idle.png')
        for pose in POSE:
            old = Image.open(ROOT / f'public/assets/sprites/hero/{key}_{pose}.webp').convert('RGBA')
            on_white(old.crop(old.getbbox()), .8).save(REF / f'{hero}_{pose}_old.png')
    # 秘寶：噹噹待機第 1 格（看護臂長相）＋同組四件秘寶圖示（看圖示畫風）
    on_white(idle_frame('dangdang'), .9).save(REF / 'relic_copper_bracer_idle.png')
    style = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 255))
    for i, name in enumerate(['relic_wrist_guard', 'relic_iron_palm_wraps', 'relic_bronze_mirror', 'relic_headband']):
        icon = Image.open(ROOT / f'public/assets/icons/{name}.webp').convert('RGBA').resize((440, 440), Image.LANCZOS)
        style.alpha_composite(icon, ((i % 2) * 512 + 36, (i // 2) * 512 + 36))
    style.convert('RGB').save(REF / 'relic_copper_bracer_old.png')
    print(f'參考圖已輸出到 {REF}')


_LOCK = threading.Lock()


def record_prompt(job: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(job, []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                         'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(job: str, extra_note: str = '') -> tuple[str, int, str]:
    hero, pose = job.split('/', 1)
    out_dir = SOURCE / hero
    out_dir.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (out_dir / f'{pose}.try{attempt}.png').exists() or (out_dir / f'{pose}.try{attempt}.pending').exists():
            attempt += 1
        (out_dir / f'{pose}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = out_dir / f'{pose}.try{attempt}.png'
    text = prompt_for(hero, pose) + (f' {extra_note}' if extra_note else '')
    ref_key = f'relic_{pose}' if hero == 'relic' else f'{hero}_{pose}'
    ref1 = REF / (f'{ref_key}_idle.png' if hero == 'relic' else f'{hero}_idle.png')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{SIZE}x{SIZE}', '--quality', 'high',
               '--prompt', text, '--image', str(ref1), '--image', str(REF / f'{ref_key}_old.png'),
               '--out', str(target), '--force']
    started = time.time()
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    status = 'ok' if result.returncode == 0 and target.exists() else f'failed: {result.stderr.strip()[-400:]}'
    (out_dir / f'{pose}.try{attempt}.pending').unlink(missing_ok=True)
    record_prompt(job, attempt, text, status)
    return job, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    p = sub.add_parser('prompt')
    p.add_argument('hero')
    p.add_argument('pose')
    g = sub.add_parser('gen')
    g.add_argument('jobs', nargs='+', help='hero/pose 或 relic/copper_bracer')
    g.add_argument('--jobs', dest='workers', type=int, default=3)
    g.add_argument('--note', default='', help='重生時補在提示詞最後的修正說明')
    k = sub.add_parser('pick')
    k.add_argument('job')
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'prompt':
        print(prompt_for(args.hero, args.pose))
    elif args.command == 'pick':
        hero, pose = args.job.split('/', 1)
        if not (SOURCE / hero / f'{pose}.try{args.attempt}.png').exists():
            raise SystemExit(f'找不到 {args.job} 第 {args.attempt} 次的圖')
        data = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        data[args.job] = args.attempt
        PICKS.write_text(json.dumps(dict(sorted(data.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{args.job} 採用第 {args.attempt} 次')
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for job, attempt, status in pool.map(lambda j: generate(j, args.note), args.jobs):
                print(f'{job} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
