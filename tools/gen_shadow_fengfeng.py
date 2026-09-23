"""鏡中封封（鏡子走廊裡封封的影子）五個姿勢重生（2026-09-23，批次 mirror；美術盤點 C1）。

09-20 進倉的 `shadow_fengfeng_{idle,attack,hurt,block,down}` 畫的是**一隻灰虎斑貓穿封封的衣服**：
沒有影子化（鏡中球球、菲菲、噹噹都是黑紫煙霧的身體、兩隻發光紫眼），細線舊畫法，
而且角色只佔畫布 58～68%（另外三隻 95～100%），戰場上小一圈。這一批照另外三隻的樣子重畫。

做法：gpt-image-1.5 真透明（codex-oauth），每張附兩張參考圖：
① 鏡中噹噹的同一個姿勢（鋪白底）——「影子」長什麼樣（黑紫煙霧、發光紫眼、有黑外框的實心煙）一律照它；
② 封封新版待機第 1 格（鋪白底、**左右鏡射成朝左**，魔物一律朝左；`art_rules.py` 第四個雷）——剪影、頭身比、
   紅圍巾的形狀、背上那把劍照它。舊的 `shadow_fengfeng_*` 不當參考（那一批就是走鐘的來源）。
五張都生好才打包：`pack` 照 `add_sprite.py --group monsters` 的規矩貼進 460×460 畫布（主體貼底、左右置中、
比畫布大就等比縮進去，跟另外三隻影子同一個畫法），同檔名覆蓋、清單鍵不動。

用法：
    python tools/gen_shadow_fengfeng.py refs
    python tools/gen_shadow_fengfeng.py gen idle attack hurt block down
    python tools/gen_shadow_fengfeng.py gen attack --note "修正說明"
    python tools/gen_shadow_fengfeng.py pick attack 2
    python tools/gen_shadow_fengfeng.py pack        # 五張都選好才會寫
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

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/mirror'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
MONSTERS = ROOT / 'public/assets/monsters'
POSES = ('idle', 'attack', 'hurt', 'block', 'down')
CANVAS = (460, 460)   # 另外三隻影子的畫布
BOTTOM_PAD = 2        # 主體底邊離畫布底（另外三隻影子都是 2）
MAIN_BODY = .95       # 最大一塊要佔全部不透明像素的比例（挨打有小星星，給一點空間）

SHADOW = (
    'The monster: a SHADOW CLONE of FENGFENG, the compact sword cat in reference image 2 - the SAME proportions and '
    'the SAME silhouette as reference image 2 (a big round head about as large as his torso with two pointed ears, '
    'a compact chibi body, short legs, the short SCARF knotted at his neck with its two ends fluttering out behind, '
    'the sleeveless martial vest, the waist sash, the wrapped lower legs, and ONE straight Chinese jian sword), but '
    'made ENTIRELY of solid dark violet-black smoke exactly like the shadow cat in reference image 1: no orange fur, '
    'no stripes, no cream muzzle, no red scarf colour, no red vest colour - a flat near-black silhouette with wisps of '
    'dark violet smoke curling off his head, ears, shoulders, scarf ends and tail, and TWO large glowing pale violet '
    'eyes with tiny bright pupils. His jian is also shadow-black with a thin glowing violet edge. Clearly Fengfeng, '
    'turned evil. His body faces LEFT but his head is turned toward the viewer so BOTH glowing eyes are visible; the '
    'two eyes are the brightest thing in the picture.\n'
    'THE SMOKE: every wisp of violet smoke is a SOLID SHAPE with its own THICK BLACK OUTLINE, like a little flame drawn '
    'in ink - never a soft airbrushed haze, never see-through. Where the violet smoke meets the black body that is a '
    'clean hard edge.\n'
)
POSE = {
    'idle': ('Pose: standing rooted in a ready sword stance facing LEFT, the jian held low and forward in one paw, '
             'the other paw raised in guard, smoke drifting up off his shoulders.'),
    'attack': ('Pose: a fast lunging THRUST to the LEFT: front foot stepping forward, the jian extended straight out '
               'ahead at chest height, smoke trailing behind the sword arm. Keep him as TALL as in the idle pose: an '
               'upright stepping lunge, NOT a low crouch and NOT stretched flat sideways.'),
    'hurt': ('Pose: flinching back to the RIGHT after being hit, head knocked back, both glowing eyes squeezed shut into '
             'glowing violet "> <" shapes, mouth open, one paw thrown up, the jian still in the other paw, two or three '
             'SMALL solid yellow stars with black outlines popping near his head.'),
    'block': ('Pose: a firm PARRY facing LEFT: the jian held crosswise in front of his body with both paws, feet planted '
              'wide, glowing eyes narrowed. At least as TALL as the idle pose, not crouching lower.'),
    'down': ('Pose: defeated, collapsed lying on the ground on his side, head to the LEFT, eyes turned into two glowing '
             'violet "X" shapes, the jian dropped flat beside him, smoke wisps drooping. He lies low and wide.'),
}
TAIL = ('A single cartoon monster for a cute game set in a cat ninja tower, full body. It stands (or rests) on the ground '
        'with its feet at the very bottom edge of the picture - do not draw it floating. Fill the frame: the monster '
        'reaches nearly the top and the bottom of the image. Readable at small size: bold silhouette, strong shapes, a '
        'clear cartoon face. Draw everything SOLID and OPAQUE. Nothing else in the picture: no ground line, no cast '
        'shadow, no scenery, no text, no letters, no watermark, no border. Style: thick black outlines, flat colours with '
        'subtle soft shading, cute cartoon look, EXACTLY the drawing style of reference image 1. Truly transparent RGBA '
        'background (no checkerboard drawing, no white box).')

_LOCK = threading.Lock()


def prompt_for(pose: str) -> str:
    return f'{TAIL}\n{SHADOW}{POSE[pose]}'


def white(im: Image.Image) -> Image.Image:
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im.convert('RGBA'))
    return bg.convert('RGB')


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for pose in POSES:
        white(Image.open(MONSTERS / f'shadow_dangdang_{pose}.webp')).save(REF / f'shadow_dangdang_{pose}.png')
    data = json.loads((ROOT / 'src/ui/fengfeng-motion-data.json').read_text(encoding='utf-8'))['actions']['idle']
    x, y, w, h = data['frames'][0]['rect']
    frame = Image.open(ROOT / 'public' / data['texture']).convert('RGBA').crop((x, y, x + w, y + h))
    white(frame.transpose(Image.FLIP_LEFT_RIGHT)).save(REF / 'fengfeng_idle_left.png')
    print(f'參考圖已輸出到 {REF}')


def record(path: Path, key: str, entry: dict) -> None:
    with _LOCK:
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        data.setdefault(key, []).append(entry)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(pose: str, note: str = '') -> tuple[str, int, str]:
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{pose}.try{attempt}.png').exists() or (SOURCE / f'{pose}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{pose}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{pose}.try{attempt}.png'
    text = prompt_for(pose) + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1024x1024', '--quality', 'high', '--prompt', text,
               '--image', str(REF / f'shadow_dangdang_{pose}.png'), '--image', str(REF / 'fengfeng_idle_left.png'),
               '--out', str(target), '--force']
    started = time.time()
    status = 'failed'
    for _ in range(5):
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-300:]}'
        if 'at capacity' not in result.stderr:   # 伺服器滿載才等一下重試（codex_gen.py 坑 9）
            break
        time.sleep(30)
    (SOURCE / f'{pose}.try{attempt}.pending').unlink(missing_ok=True)
    record(PROMPTS, pose, {'attempt': attempt, 'status': status, 'prompt': text, 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return pose, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def body(image: Image.Image) -> Image.Image:
    """真透明檢查＋裁到主體。不合格就停（自檢只印不停＝沒檢查）。"""
    rgba = image.convert('RGBA')
    alpha = np.array(rgba.getchannel('A'))
    if alpha.min() != 0 or alpha.max() < 250:
        raise SystemExit('不是真透明')
    solid = alpha > 16
    labels, count = ndimage.label(solid)
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    share = float(sizes.max() / sizes.sum())
    if share < MAIN_BODY:
        raise SystemExit(f'最大一塊只佔 {share:.1%}，多畫了東西（第二隻、飄走的特效）')
    box = Image.fromarray((solid * 255).astype(np.uint8)).getbbox()
    return rgba.crop(box)


def dark_share(image: Image.Image) -> float:
    """不透明像素裡「接近黑」（亮度 < 80）的比例：影子是黑紫煙霧，應該大半是暗的；
    09-20 那批灰虎斑只有一成多（舊圖量過，見 `tests/ui/mirror_shadow_art.test.ts`）。"""
    a = np.array(image.convert('RGBA')).astype(np.float32)
    solid = a[..., 3] > 128
    lum = a[..., :3] @ np.array([.299, .587, .114], dtype=np.float32)
    return round(float((solid & (lum < 80)).sum() / max(1, solid.sum())), 3)


def pack() -> None:
    picks = json.loads(PICKS.read_text(encoding='utf-8'))
    missing = [p for p in POSES if p not in picks]
    if missing:
        raise SystemExit(f'還沒選好：{missing}')
    out = []
    for pose in POSES:
        im = body(Image.open(SOURCE / f'{pose}.try{picks[pose]["attempt"]}.png'))
        max_w, max_h = CANVAS[0] - 2, CANVAS[1] - BOTTOM_PAD
        k = min(max_w / im.width, max_h / im.height)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        canvas = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
        canvas.alpha_composite(im, ((CANVAS[0] - im.width) // 2, CANVAS[1] - BOTTOM_PAD - im.height))
        dst = MONSTERS / f'shadow_fengfeng_{pose}.webp'
        canvas.save(dst, 'WEBP', quality=72, method=6)   # 跟 add_sprite.py 的魔物品質一致
        out.append({'pose': pose, 'attempt': picks[pose]['attempt'], 'body': list(im.size),
                    'heightShare': round(im.height / CANVAS[1], 3), 'darkShare': dark_share(canvas),
                    'bytes': dst.stat().st_size, 'sha256': hashlib.sha256(dst.read_bytes()).hexdigest()})
    (SOURCE / 'packed.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(out, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    g = sub.add_parser('gen')
    g.add_argument('poses', nargs='+', choices=POSES)
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('pose', choices=POSES)
    k.add_argument('attempt', type=int)
    sub.add_parser('pack')
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'pick':
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        picks[args.pose] = {'attempt': args.attempt, 'at': time.strftime('%Y-%m-%d %H:%M:%S')}
        PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{args.pose} 採用第 {args.attempt} 次')
    elif args.command == 'pack':
        pack()
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for pose, attempt, status in pool.map(lambda p: generate(p, args.note), args.poses):
                print(f'{pose} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
