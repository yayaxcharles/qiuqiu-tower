"""網站小圖示（瀏覽器分頁標籤上那一格）的生圖工具（2026-09-23，批次 favicon）。

原本打包沒有小圖示，每次載入都有一筆 favicon.ico 404；建置代理先放了一張從對白頭像裁的暫用圖
（`public/favicon.png`，檔名固定，`index.html` 用 `%BASE_URL%favicon.png` 讀它）。這支換成正式那張。

做法：gpt-image-1.5 真透明（codex-oauth），附一張長相參考＝球球新版對白頭像（`hero/ninja_portrait`，
新版待機第 1 格裁的，鋪白底）。小圖示在分頁上只有 16～32 像素，所以要的是**一顆正面大頭**：
頭巾、大圓眼、三條臉頰紋，線條粗、細節少，縮到 16 像素還認得出是誰。

生圖端回來的尺寸不一定照要求，`pick` 一律自己裁：裁到角色外框、補成正方形（四周留一點點邊）、
縮成 64×64（分頁最大顯示 32 像素、高解析螢幕要兩倍＝64；128 的要 18 KB，首載預算已用到 97%，不值得）。

用法：
    python tools/gen_favicon.py refs
    python tools/gen_favicon.py gen --n 3            # 一次生幾張候選（各自一個 try 編號）
    python tools/gen_favicon.py gen --note "修正說明"
    python tools/gen_favicon.py pick 2               # 選第 2 次 → public/favicon.png，並輸出 16／32 像素預覽
每一次生圖都存成 `favicon.try<N>.png`（不覆蓋），選定紀錄寫在 `picks.json`。
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
SOURCE = ROOT / 'tools/motion-art-source/favicon'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
OUT = ROOT / 'public/favicon.png'
SIZE = 64
MARGIN = 0.04   # 補成正方形時四周留的透明邊（邊長的比例）

PROMPT = (
    'Create a website favicon / app icon: the HEAD ONLY of the EXACT QIUQIU ninja cat from reference image 1 '
    '(pale cream-white tabby with grey-brown stripes on top of the head and three brown cheek stripes, big round '
    'head, pink inner ears, big round black eyes with a white highlight, tiny pink nose, a NAVY BLUE headband across '
    'the forehead with its two short tails flicking out to one side). Front-facing, slightly turned, a confident '
    'little smile. The head fills almost the whole square canvas. Very bold thick dark outlines, flat cel shading '
    'with very few details so it stays readable when shrunk to 16x16 pixels. Truly transparent RGBA background, '
    'no body, no paws, no text, no letters, no border, no circle badge, no shadow, no glow.'
)

_LOCK = threading.Lock()


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / 'public/assets/manifest.json').read_text(encoding='utf-8'))['sprites']
    portrait = Image.open(ROOT / 'public' / manifest['hero/ninja_portrait']).convert('RGBA')
    bg = Image.new('RGBA', portrait.size, (255, 255, 255, 255))
    bg.alpha_composite(portrait)
    bg.convert('RGB').save(REF / 'qiuqiu_portrait.png')
    print(f'參考圖已輸出到 {REF}')


def record(attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault('favicon', []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                               'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(note: str) -> tuple[int, str]:
    SOURCE.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (SOURCE / f'favicon.try{attempt}.png').exists() or (SOURCE / f'favicon.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'favicon.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'favicon.try{attempt}.png'
    text = PROMPT + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1024x1024', '--quality', 'high', '--prompt', text,
               '--image', str(REF / 'qiuqiu_portrait.png'), '--out', str(target), '--force']
    started = time.time()
    status = 'failed'
    for _ in range(4):
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-300:]}'
        if 'at capacity' not in result.stderr:   # 伺服器滿載才等一下重試（codex_gen.py 坑 9），其他錯直接回報
            break
        time.sleep(30)
    (SOURCE / f'favicon.try{attempt}.pending').unlink(missing_ok=True)
    record(attempt, text, status)
    return attempt, f'{status}（{time.time() - started:.0f} 秒）'


def square_icon(image: Image.Image) -> Image.Image:
    """裁到角色外框、補成正方形、縮成 SIZE。"""
    rgba = image.convert('RGBA')
    box = rgba.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    if box is None:
        raise SystemExit('整張是空的')
    body = rgba.crop(box)
    side = round(max(body.size) * (1 + 2 * MARGIN))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(body, ((side - body.width) // 2, (side - body.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def pick(attempt: int) -> None:
    src = SOURCE / f'favicon.try{attempt}.png'
    raw = Image.open(src)
    if raw.convert('RGBA').getchannel('A').getextrema()[0] != 0:
        raise SystemExit(f'{src.name} 不是真透明')
    icon = square_icon(raw)
    icon.save(OUT, 'PNG', optimize=True)
    preview = SOURCE / '_preview'
    preview.mkdir(exist_ok=True)
    for px in (16, 32, 64):
        icon.resize((px, px), Image.LANCZOS).save(preview / f'favicon_{px}.png')
    picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
    picks['favicon'] = {'attempt': attempt, 'sourceSize': list(raw.size), 'size': SIZE, 'bytes': OUT.stat().st_size,
                        'at': time.strftime('%Y-%m-%d %H:%M:%S')}
    PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'採用第 {attempt} 次 → {OUT.relative_to(ROOT)}（{OUT.stat().st_size} 位元組）；預覽在 {preview}')


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
