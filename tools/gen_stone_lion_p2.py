"""石獅子第二階段補挨打、防禦兩張（2026-09-23，批次 minor；美術盤點 D2）。

09-16 的換階段立繪第一批只做待機與出招（`docs/關主分階段立繪_規劃_2026-09-16.md`），石獅子是第三關強池的一般怪、
那份清單最後寫著「還沒做」。現在牠第二階段（全身裂開、縫裡透出熔岩光）被打、擋的時候沒有自己的圖，
`monsterUrl` 退回第二階段待機——挨打沒反應、擋下來也沒反應。

做法：gpt-image-1.5 真透明（codex-oauth），參考圖① 第二階段待機（長相：裂縫、熔岩光、發光的眼）、
② 第一階段的同一個姿勢（姿勢照它）。照 `add_sprite.py --group monsters` 的規矩貼進第一階段待機那張的畫布
（同一隻的所有階段共用一個畫布，換階段才不會忽大忽小），併進清單 `codex/monster_stone_lion_p2`。

用法：
    python tools/gen_stone_lion_p2.py refs
    python tools/gen_stone_lion_p2.py gen hurt block
    python tools/gen_stone_lion_p2.py pick hurt 1
    python tools/gen_stone_lion_p2.py pack
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

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/minor'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
MONSTERS = ROOT / 'public/assets/monsters'
POSES = ('hurt', 'block')
KEY = 'codex/monster_stone_lion_p2'

POSE = {
    'hurt': ('Pose: recoiling from a hit, head knocked back and to the right, eyes squeezed shut, mouth open in a pained '
             'roar, one front paw still resting on its carved stone ball, a few small stone chips breaking off.'),
    'block': ('Pose: bracing to block, both front legs crossed in front of its chest like a shield, head lowered behind '
              'them, glowing eyes narrowed, the stone ball on the ground beside its front paw.'),
}
PROMPT = (
    'A single cartoon monster for a cute game set in a cat ninja tower, full body, facing LEFT: the STONE GUARDIAN LION '
    'in its ENRAGED SECOND PHASE, EXACTLY as in reference image 1 - grey carved stone body with swirl-curl mane, cracked '
    'all over with glowing orange-yellow lava light shining through the cracks, glowing yellow eyes, small floating stone '
    'chips. Reference image 2 shows the SAME lion in its first phase doing this pose: copy only the pose from it, keep the '
    'cracked lava look of reference image 1. {pose} It stands on the ground with its feet at the very bottom edge of the '
    'picture and fills the frame vertically. Thick black outlines, flat colours with soft shading, EXACTLY the drawing '
    'style of reference image 1. Nothing else: no ground line, no cast shadow, no scenery, no text, no border. Truly '
    'transparent RGBA background (no checkerboard drawing, no white box).'
)

_LOCK = threading.Lock()


def white(path: Path, out: Path) -> None:
    im = Image.open(path).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    bg.convert('RGB').save(out)


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    white(MONSTERS / 'stone_lion_p2_idle.webp', REF / 'stone_lion_p2_idle.png')
    for pose in POSES:
        white(MONSTERS / f'stone_lion_{pose}.webp', REF / f'stone_lion_{pose}.png')
    print(f'參考圖已輸出到 {REF}')


def record(path: Path, key: str, entry: dict) -> None:
    with _LOCK:
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        data.setdefault(key, []).append(entry)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(pose: str, note: str = '') -> tuple[str, int, str]:
    name = f'stone_lion_p2_{pose}'
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = PROMPT.format(pose=POSE[pose]) + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1024x1024', '--quality', 'high', '--prompt', text,
               '--image', str(REF / 'stone_lion_p2_idle.png'), '--image', str(REF / f'stone_lion_{pose}.png'),
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
    (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
    record(PROMPTS, name, {'attempt': attempt, 'status': status, 'prompt': text, 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return pose, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def add_manifest_poses(entry: dict) -> None:
    """只在清單這一隻的那一段補上缺的姿勢，**不整份重寫**（`manifest_io.merge` 會照自己的縮排整份重寫，
    兩千多行的差異會跟別的分支改清單的地方撞在一起）。已經有的姿勢不動。"""
    path = ROOT / 'public/assets/manifest.json'
    raw = path.read_bytes().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    head = f'    "{KEY}": {{{nl}'
    start = raw.index(head) + len(head)
    end = raw.index(f'{nl}    }}', start)
    block = raw[start:end]
    have = json.loads('{' + block + '}')
    extra = [f'      "{pose}": "{entry[pose]}"' for pose in POSES if pose not in have]
    if extra:
        raw = raw[:start] + block + ',' + nl + (',' + nl).join(extra) + raw[end:]
        json.loads(raw)   # 改完還是合法的 JSON 才寫
        path.write_bytes(raw.encode('utf-8'))


def pack() -> None:
    picks = json.loads(PICKS.read_text(encoding='utf-8'))
    base = Image.open(MONSTERS / 'stone_lion_idle.webp')   # 同一隻的所有階段共用第一階段待機的畫布
    cw, ch = base.size
    bottom_pad = ch - base.getchannel('A').getbbox()[3]
    base_h = base.getchannel('A').getbbox()[3] - base.getchannel('A').getbbox()[1]
    entry = dict(json.loads((ROOT / 'public/assets/manifest.json').read_text(encoding='utf-8'))['monsters'][KEY])
    out = []
    for pose in POSES:
        name = f'stone_lion_p2_{pose}'
        src = Image.open(SOURCE / f'{name}.try{picks[name]["attempt"]}.png').convert('RGBA')
        box = src.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
        im = src.crop(box)
        k = min((cw - 2) / im.width, (ch - bottom_pad) / im.height)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        if pose == 'block' and im.height < base_h * 0.9:
            raise SystemExit(f'{pose}: 只有待機的 {im.height / base_h:.0%} 高（add_sprite.py 同一條規矩），要重生直立一點的')
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((cw - im.width) // 2, ch - bottom_pad - im.height))
        dst = MONSTERS / f'{name}.webp'
        canvas.save(dst, 'WEBP', quality=72, method=6)   # 跟 add_sprite.py 的魔物品質一致
        entry[pose] = dst.relative_to(ROOT / 'public').as_posix()
        out.append({'pose': pose, 'attempt': picks[name]['attempt'], 'body': list(im.size), 'bytes': dst.stat().st_size,
                    'sha256': hashlib.sha256(dst.read_bytes()).hexdigest()})
    add_manifest_poses(entry)
    (SOURCE / 'stone_lion_p2_packed.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(out, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    g = sub.add_parser('gen')
    g.add_argument('poses', nargs='+', choices=POSES)
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
        picks[f'stone_lion_p2_{args.pose}'] = {'attempt': args.attempt, 'at': time.strftime('%Y-%m-%d %H:%M:%S')}
        PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{args.pose} 採用第 {args.attempt} 次')
    elif args.command == 'pack':
        pack()
    else:
        with ThreadPoolExecutor(max_workers=2) as pool:
            for pose, attempt, status in pool.map(lambda p: generate(p, args.note), args.poses):
                print(f'{pose} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
