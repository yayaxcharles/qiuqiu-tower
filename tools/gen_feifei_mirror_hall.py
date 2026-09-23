"""菲菲單人「鏡子走廊」事件主圖重生（2026-09-23，批次 mirror；美術盤點 C2）。

`bg/event_feifei_mirror_hall` 是 09-14 重生的：那時她在鏡子走廊打的是影球球，所以圖上鏡子裡站著
「綁頭巾的黑影」。09-15 起她打的是鏡中菲菲（`enemies.ts` 的 `MIRROR_FEIFEI`），單人文字也改成
「其中一個倒影卻沒有停下。它朝她笑了笑，抬起握針的手」——圖文對不上。這支照原圖的構圖與畫風，
只把大鏡子裡那隻換成**她自己的黑影**（紮蝴蝶結的馬尾、捏著針、發光紫眼）。

做法：gpt-image-1.5 真透明（codex-oauth），參考圖① 現在這張（構圖、畫風、菲菲的樣子）、
② 鏡中菲菲待機（黑影長什麼樣）。生圖端回來的尺寸不一定是 4:3，`pick` 照主體外框補成 4:3 再縮成 560×420
（事件插圖的畫布），同檔名覆蓋、清單鍵不動。

用法：
    python tools/gen_feifei_mirror_hall.py refs
    python tools/gen_feifei_mirror_hall.py gen --n 2
    python tools/gen_feifei_mirror_hall.py pick 1
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
SOURCE = ROOT / 'tools/motion-art-source/mirror'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
TARGET = ROOT / 'public/assets/bg/event_feifei_mirror_hall.webp'
SIZE = (560, 420)
NAME = 'feifei_mirror_hall'

PROMPT = (
    'Redraw reference image 1 as a new event illustration for a cute cat-ninja card game, in EXACTLY the same art '
    'style, the same camera and the same composition: a corridor lined with tall ornate gold-framed mirrors, and '
    'FEIFEI - the Siamese cat girl ninja with the dark-brown ponytail, purple bow, blue eyes and magenta outfit, '
    'exactly as she looks in reference image 1 - standing between the mirrors holding a needle. Her face is '
    'startled and wary, she leans back half a step. '
    'CHANGE ONLY THIS: the figure inside the big mirror on the right is now FEIFEI\'S OWN SHADOW - a dark violet-black '
    'shadow version of HER (the same ponytail with a bow, the same outfit silhouette, two glowing pale violet eyes, '
    'solid dark smoke wisps with black outlines, exactly like the shadow cat in reference image 2). The shadow smiles '
    'slyly at her and raises one paw holding three needles. In the smaller mirrors on the left, her normal reflections '
    'have all turned their heads toward her. NO headband anywhere in the picture - the shadow is not a ninja with a '
    'headband, it is her. '
    'Nothing else: no text, no letters, no floor line, no cast shadow, no frame border. Truly transparent RGBA '
    'background outside the mirrors and the cat (no checkerboard drawing, no white box), exactly like reference image 1.'
)

_LOCK = threading.Lock()


def white(im: Image.Image) -> Image.Image:
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im.convert('RGBA'))
    return bg.convert('RGB')


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    white(Image.open(TARGET)).save(REF / 'feifei_mirror_hall_old.png')
    white(Image.open(ROOT / 'public/assets/monsters/shadow_feifei_idle.webp')).save(REF / 'shadow_feifei_idle.png')
    print(f'參考圖已輸出到 {REF}')


def record(path: Path, key: str, entry: dict) -> None:
    with _LOCK:
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        data.setdefault(key, []).append(entry)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(note: str) -> tuple[int, str]:
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{NAME}.try{attempt}.png').exists() or (SOURCE / f'{NAME}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{NAME}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{NAME}.try{attempt}.png'
    text = PROMPT + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1536x1024', '--quality', 'high', '--prompt', text,
               '--image', str(REF / 'feifei_mirror_hall_old.png'), '--image', str(REF / 'shadow_feifei_idle.png'),
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
    (SOURCE / f'{NAME}.try{attempt}.pending').unlink(missing_ok=True)
    record(PROMPTS, NAME, {'attempt': attempt, 'status': status, 'prompt': text, 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return attempt, f'{status}（{time.time() - started:.0f} 秒）'


def fit(image: Image.Image) -> Image.Image:
    """照主體外框補成 4:3（外框置中、四周留一點邊），縮成 560×420。"""
    rgba = image.convert('RGBA')
    box = rgba.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    if box is None:
        raise SystemExit('整張是空的')
    x0, y0, x1, y1 = box
    w, h = (x1 - x0) * 1.04, (y1 - y0) * 1.04
    if w / h > SIZE[0] / SIZE[1]:
        h = w * SIZE[1] / SIZE[0]
    else:
        w = h * SIZE[0] / SIZE[1]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    canvas = Image.new('RGBA', (round(w), round(h)), (0, 0, 0, 0))
    canvas.alpha_composite(rgba.crop(box), (round(w / 2 - (cx - x0)), round(h / 2 - (cy - y0))))
    return canvas.resize(SIZE, Image.LANCZOS)


def pick(attempt: int) -> None:
    src = SOURCE / f'{NAME}.try{attempt}.png'
    out = fit(Image.open(src))
    out.save(TARGET, 'WEBP', quality=80, method=6)
    picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
    picks[NAME] = {'attempt': attempt, 'sourceSize': list(Image.open(src).size), 'bytes': TARGET.stat().st_size,
                   'at': time.strftime('%Y-%m-%d %H:%M:%S')}
    PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'採用第 {attempt} 次 → {TARGET.relative_to(ROOT)}（{TARGET.stat().st_size} 位元組）')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    g = sub.add_parser('gen')
    g.add_argument('--n', type=int, default=1)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'pick':
        pick(args.attempt)
    else:
        with ThreadPoolExecutor(max_workers=min(3, args.n)) as pool:
            for attempt, status in pool.map(lambda _: generate(args.note), range(args.n)):
                print(f'第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
