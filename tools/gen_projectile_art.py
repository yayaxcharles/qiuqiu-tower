"""飛行物（丟出去的暗器、忍具）的生圖工具（2026-09-22，批次 proj）。

背景：遠程牌與丟出去的忍具，飛出去的一律是手裏劍或飛針（`qiuqiu-shuriken.ts`、`feifei-needles.ts`）；
聚葉成刀、毛球彈、毒丸、毒砂、絆索、撒手鐧、鞭炮、麻繩、煙霧彈……都沒有自己的東西。
使用者 2026-09-22：「道具的確很值得生圖，尤其是飛出去的東西很重要」——每一種都專門生一張「飛行中」的樣子，
不拿忍具圖示硬飛（圖示是靜態擺拍）。

做法：gpt-image-1.5 真透明（codex-oauth），每張附兩張參考圖：
① 畫風參考＝現成的手裏劍飛行圖 `shuriken_128.webp`（粗黑描邊、柔和賽璐珞上色，放大到 512 貼白底）；
② 內容參考＝這個東西在牌面或忍具圖示裡的樣子（只取「是什麼東西、什麼顏色」，構圖不照抄）。
會轉的只有毛球（圓的、畫成不帶拖尾的單一物件，飛的時候由程式轉）；其餘一律畫成「飛行中」：
尖端或正面朝右＝飛行方向、身後一小段拖尾或速度線（引信火花往後飄），程式只順著飛行方向擺頭、不轉。
木桶、鞭炮、煙霧彈、貓薄荷球、碎石第一輪畫成正面擺拍（看不出在飛），第二輪改成飛行中（主控 2026-09-22 看過草稿）。

用法：
    python tools/gen_projectile_art.py refs
    python tools/gen_projectile_art.py prompt leaf
    python tools/gen_projectile_art.py gen leaf kunai --jobs 4
    python tools/gen_projectile_art.py gen leaf --note "修正說明"
    python tools/gen_projectile_art.py pick leaf 2          # 選定 → 裁邊、縮圖、存 public/assets/motion/projectile/<名>.webp
每一次生圖都存成 `<名>.try<N>.png`（不覆蓋），選定紀錄寫在 `picks.json`。
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
SOURCE = ROOT / 'tools/motion-art-source/proj'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
OUT = ROOT / 'public/assets/motion/projectile'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
CARD = ROOT / 'public/assets/cards/card'
ICON = ROOT / 'public/assets/icons'

# 名 → (畫布, 內容參考圖, 參考圖裁切框 (x0,y0,x1,y1) 或 None, 長邊縮到幾像素, 描述)
# 長邊像素＝實際顯示大小的兩倍左右（手裏劍 40 像素顯示、圖檔 128）
JOBS: dict[str, tuple[str, Path, tuple[int, int, int, int] | None, int, str]] = {
    'leaf': ('1536x1024', CARD / 'juye.webp', (140, 0, 299, 240), 128,
             'ONE single leaf hardened into a razor blade (the martial-arts trick "gathering leaves into blades"): '
             'a slim pointed bronze-gold metallic leaf with a sharp glinting edge and a short stem, flying tip-first '
             'to the RIGHT, very slightly curved, with one thin pale speed streak trailing behind the stem on the left.'),
    'furball_qiuqiu': ('1024x1024', CARD / 'maoqiudan.webp', (0, 40, 150, 240), 96,
                       'ONE round fluffy cat hairball rolled tight and flung like a ball: soft light-grey cat fur '
                       'with a few darker grey tabby strands wound around it, a couple of loose tufts sticking out, '
                       'cute and slightly silly. No trail (the game spins it).'),
    'furball_dangdang': ('1024x1024', CARD / 'dangdang_maoqiudan.webp', (150, 40, 299, 240), 96,
                         'ONE round fluffy cat hairball rolled tight and flung like a ball: soft BLACK cat fur mixed '
                         'with a few WHITE fur strands wound around it, a couple of loose tufts sticking out, cute '
                         'and slightly silly. No trail (the game spins it).'),
    'furball_fengfeng': ('1024x1024', CARD / 'fengfeng_maoqiudan.webp', (0, 0, 150, 200), 96,
                         'ONE round fluffy cat hairball rolled tight and flung like a ball: soft ORANGE ginger tabby '
                         'cat fur with a few cream strands wound around it, a couple of loose tufts sticking out, cute '
                         'and slightly silly. No flames, no trail (the game spins it).'),
    'poison_pill': ('1536x1024', CARD / 'feifei_maoqiudan.webp', None, 96,
                    'ONE small round POISON PILL flicked through the air: a glossy dark-purple pellet with a sickly '
                    'lime-green poison sheen and one tiny green drip, flying to the RIGHT, with a short wispy '
                    'green-purple poison vapour trail behind it on the left.'),
    'poison_sand': ('1536x1024', CARD / 'feifei_tieshazhang.webp', (0, 0, 190, 240), 128,
                    'ONE handful of flung POISONED SAND flying to the RIGHT: a compact cone-shaped spray of coarse '
                    'yellow-ochre sand grains mixed with sickly lime-green poison specks, dense and clumped at the '
                    'front (right), thinning out and scattering towards the back (left). Just the sand spray, no hand, '
                    'no cloud background.'),
    'snare_cord': ('1536x1024', CARD / 'feifei_qinna.webp', (120, 0, 299, 240), 128,
                   'ONE braided ORANGE-RED snare cord thrown as an open lasso loop flying to the RIGHT: a round open '
                   'loop with a slip knot at the front and a short loose tail of cord trailing behind on the left.'),
    'hemp_rope': ('1536x1024', ICON / 'potion_rope.webp', None, 128,
                  'ONE tan twisted HEMP ROPE thrown as an open lasso loop flying to the RIGHT: a round open loop with '
                  'a slip knot at the front and a short loose tail of rope trailing behind on the left, visible '
                  'twisted fibres.'),
    'kunai': ('1536x1024', CARD / 'sashoujian.webp', (100, 40, 299, 240), 128,
              'ONE heavy dark-steel KUNAI throwing knife flying tip-first to the RIGHT: broad leaf-shaped blade '
              'with a bright bevelled edge, dark cord-wrapped grip and a ring pommel at the back, with one thin pale '
              'speed streak trailing behind the ring on the left.'),
    # 下面五張第一輪是正面擺拍、看不出在飛（主控 2026-09-22 看過草稿）：改成「飛行中」——往右上斜飛、
    # 身後一小段拖尾或速度線、引信火花往後飄；特效要小，不能蓋過東西本身。飛的時候程式不轉它，只順著拋物線擺頭
    'barrel': ('1536x1024', CARD / 'dangdang_sashoujian.webp', (150, 20, 299, 220), 128,
               'ONE small sturdy WOODEN BARREL caught IN FLIGHT, hurled towards the RIGHT: tilted diagonally with its '
               'round lid end leading towards the upper right, warm brown wooden staves, two brass hoop bands with '
               'rivets, and a few short pale curved speed lines trailing behind it on the lower left. The speed lines '
               'are thin and small, the barrel itself stays the clear focus.'),
    'firecracker': ('1536x1024', ICON / 'potion_firecracker.webp', None, 128,
                    'ONE lit bundle of RED FIRECRACKERS tied together with string caught IN FLIGHT, tossed towards the '
                    'RIGHT: the bundle is tilted diagonally with the tubes pointing towards the upper right, gold paper '
                    'wrapping on the tubes, and the burning fuse at the BACK (left) streams a short trail of tiny yellow '
                    'sparks and a wisp of grey smoke flowing backwards to the left. Small sparks, the firecrackers stay '
                    'the clear focus.'),
    'smoke_bomb': ('1536x1024', ICON / 'potion_smoke_bomb.webp', None, 112,
                   'ONE round ninja SMOKE BOMB caught IN FLIGHT, lobbed towards the RIGHT: a dark purple-black glossy '
                   'ball with a darker band, its short rope fuse bent BACKWARDS to the left by the wind, burning with a '
                   'small bright spark that leaves a short trail of tiny sparks and a thin wisp of grey smoke streaming '
                   'back to the left. The trail is small, the bomb stays the clear focus.'),
    'nip_ball': ('1536x1024', ICON / 'potion_nip_ball.webp', None, 112,
                 'ONE round CATNIP BALL caught IN FLIGHT, tossed towards the RIGHT: a soft purple felt ball stuffed with '
                 'catnip, a small fresh green catnip leaf on it bent backwards by the wind, and a short trail of a few '
                 'tiny green catnip flecks and two or three thin pale speed lines streaming back to the left. The trail '
                 'is small, the ball stays the clear focus.'),
    'bind_nail': ('1536x1024', ICON / 'potion_bind_nail.webp', None, 112,
                  'ONE long dark-iron BINDING NAIL flying point-first to the RIGHT: square iron shank with a flat '
                  'head at the back, a strip of white paper talisman tied just behind the head fluttering backwards, '
                  'with one thin pale speed streak trailing on the left.'),
    'rubble': ('1536x1024', ICON / 'potion_rubble_bag.webp', (20, 0, 108, 60), 128,
               'A tight cluster of four jagged GREY ROCKS of different sizes caught IN FLIGHT together, hurled towards '
               'the RIGHT: the biggest rock leads at the front right, the smaller ones follow slightly behind, chunky '
               'cartoon stones with light top faces and dark undersides, with a few short pale speed lines and a tiny '
               'puff of grey dust trailing behind on the left. No bag. The trail is small, the rocks stay the clear focus.'),
}

_LOCK = threading.Lock()


def prompt_for(name: str) -> str:
    _, _, _, _, what = JOBS[name]
    return (
        'Create a production-ready transparent GAME PROJECTILE sprite for a cute cartoon cat-ninja card game. '
        'Reference image 1 is an existing projectile from the same game (a flying shuriken): copy its art style '
        'EXACTLY — clean confident dark hand-drawn outline, soft cel shading with one light direction from the top '
        'left, bright readable colours, chunky toy-like proportions, crisp edges that stay readable at 40 pixels. '
        'Reference image 2 shows the object as it appears on a card or item icon: use it ONLY to know what the '
        'object is and its colours; do NOT copy its composition, background, characters or effects. '
        f'New asset: {what} '
        'Draw exactly ONE object (or the one described clump), no hands, no cat, no characters, no text, no '
        'numbers, no labels, no frame, no border, no ground, no cast shadow, no glow halo, no background scenery. '
        'Truly transparent RGBA background (no checkerboard drawing, no white box). The object is centred and fills '
        'about 70% of the canvas with generous transparent margins on every side, nothing cut off at the edges.'
    )


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    style = Image.open(ROOT / 'public/assets/motion/qiuqiu/shuriken_128.webp').convert('RGBA')
    style = style.resize((style.width * 4, style.height * 4), Image.LANCZOS)
    bg = Image.new('RGBA', (640, 640), (255, 255, 255, 255))
    bg.alpha_composite(style, ((640 - style.width) // 2, (640 - style.height) // 2))
    bg.convert('RGB').save(REF / 'style.png')
    for name, (_, path, box, _, _) in JOBS.items():
        im = Image.open(path).convert('RGBA')
        if box:
            im = im.crop(box)
        scale = 512 / max(im.size)
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        out = Image.new('RGBA', im.size, (255, 255, 255, 255))
        out.alpha_composite(im)
        out.convert('RGB').save(REF / f'{name}.png')
    print(f'參考圖已輸出到 {REF}')


def record(path: Path, key: str, entry: dict) -> None:
    with _LOCK:
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        data.setdefault(key, []).append(entry)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(name: str, note: str = '') -> tuple[str, int, str]:
    size = JOBS[name][0]
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', size, '--quality', 'high', '--prompt', text,
               '--image', str(REF / 'style.png'), '--image', str(REF / f'{name}.png'), '--out', str(target), '--force']
    started = time.time()
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    status = 'ok' if result.returncode == 0 and target.exists() else f'failed: {result.stderr.strip()[-400:]}'
    (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
    record(PROMPTS, name, {'attempt': attempt, 'status': status, 'prompt': text, 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def finish(name: str, attempt: int) -> Path:
    """選定的那張：裁掉透明邊、長邊縮到指定像素、存 webp（保留透明）。"""
    src = Image.open(SOURCE / f'{name}.try{attempt}.png').convert('RGBA')
    alpha = src.getchannel('A')
    box = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
    if not box:
        raise SystemExit(f'{name} 第 {attempt} 次整張透明')
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(src.width, box[2] + pad), min(src.height, box[3] + pad))
    im = src.crop(box)
    longest = JOBS[name][3]
    scale = longest / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f'{name}.webp'
    im.save(out, 'WEBP', quality=88, method=6)
    record(PICKS, name, {'attempt': attempt, 'size': list(im.size), 'bytes': out.stat().st_size,
                         'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    p = sub.add_parser('prompt')
    p.add_argument('name')
    g = sub.add_parser('gen')
    g.add_argument('names', nargs='+')
    g.add_argument('--jobs', dest='workers', type=int, default=3)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('name')
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'prompt':
        print(prompt_for(args.name))
    elif args.command == 'pick':
        out = finish(args.name, args.attempt)
        print(f'{args.name} 採用第 {args.attempt} 次 → {out.relative_to(ROOT)}（{out.stat().st_size} 位元組）')
    else:
        unknown = [n for n in args.names if n not in JOBS]
        if unknown:
            raise SystemExit(f'沒有這幾種：{unknown}')
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, attempt, status in pool.map(lambda n: generate(n, args.note), args.names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
