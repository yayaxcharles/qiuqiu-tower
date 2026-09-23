"""四隻貓「空手擲出」逐格圖的生圖工具（2026-09-23，批次 toss）。

為什麼要這一套（美術盤點 2026-09-23 A1～A4）：丟東西的牌與忍具原本借的是別的動作——
球球借擲手裏劍（出手前手上捏著一枚手裏劍，飛出去的卻是葉片、苦無、毛球、鞭炮⋯⋯）、
菲菲借彈針（手上一根針或三根針扇開）、噹噹借近身推掌、封封借劍刺（東西從空著的左手飛出去）。
這一套是**空手**的擲出：握拳看不出手裡是什麼、出手那一格手掌張開，飛出去的東西由遊戲另外畫
（`projectile-flight.ts`），所以一套動作配所有飛行物。

做法照 `gen_card_motion_art.py`：角色外觀描述（`LOOK`）、4 欄 × 2 列 8 格、gpt-image-1.5 真透明、面向右、
腳底基準線在格高 92%。**長相參考只附新版待機 8 格**（`gen_idle_state_art.idle_sheet`）：不附舊立繪——
09-20 那批頭部大小錯就是拿舊立繪當長相參考來的；也不附現成的擲手裏劍動作，免得把手裏劍一起抄進手裡。

用法：
    python tools/gen_toss_art.py refs
    python tools/gen_toss_art.py prompt feifei
    python tools/gen_toss_art.py gen qiuqiu feifei dangdang fengfeng --jobs 4
    python tools/gen_toss_art.py gen qiuqiu --note "修正說明"
    python tools/gen_toss_art.py pick qiuqiu 2
每一次生圖都存成 `<角色>/toss.try<N>.png`（不覆蓋），選定用 `pick` 記進 `actions.json`、複製成 `toss.png`。
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_idle_state_art import IMAGE_GEN, LOOK, SHEET, idle_sheet  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/toss'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
CONFIG = SOURCE / 'actions.json'

TITLE = ('QUICK EMPTY-HANDED THROW (a ninja toss: the throwing paw holds a tiny hidden object inside a closed '
         'fist, so NOTHING is visible, and flings it forward; the thrown object is drawn separately by the game)')
MOVE = ('Snappy and light. The cat pulls the throwing paw back high beside the head in a closed fist while the other '
        'paw points forward to aim, steps into the throw and snaps the arm straight forward, the paw opening at the '
        'release with the fingers pointing at the enemy on the right, follows through, then settles back.')
FRAMES = ('1 normal idle stance identical to reference image 1; 2 weight shifts back, the throwing paw closes into a '
          'fist and starts to rise; 3 wind-up: the fist drawn back high beside the head, the other paw pointing '
          'forward to aim; 4 RELEASE: the throwing arm snaps straight forward at shoulder height toward the right, '
          'the paw just opened with the fingers spread, the body leaning into the throw; 5 follow-through, the arm '
          'still extended forward with the open paw; 6 the arm comes back down, balance recovering; 7 settling; '
          '8 back to the normal idle stance of frame 1.')
AVOID = ('The paws are EMPTY in every frame: absolutely NO shuriken, NO needle, NO kunai, NO leaf, NO ball, NO rope, '
         'NO weapon or object of any kind in either paw, and nothing flying through the air. Feet stay planted on '
         'the ground line: the throw is done in place without travelling. No motion lines, no speed lines, no wind, '
         'no glow, no particles, no dust.')
EXTRA = {
    'qiuqiu': 'The wide low stance stays through the throw; only the upper body winds up and snaps forward.',
    'feifei': 'Feifei throws empty-handed: no needles in her paws, the gold needle tubes stay on her belt.',
    'dangdang': 'Dangdang keeps both copper forearm bracers on; the throw is a strong compact overhand heave.',
    'fengfeng': ('For Fengfeng the jian stays SHEATHED in its scabbard at the waist in EVERY frame (never drawn, '
                 'never held); the throw is done with an empty paw.'),
}

_LOCK = threading.Lock()


def prompt_for(hero: str) -> str:
    return (
        f'Create a production-ready transparent sprite sheet for {LOOK[hero]}. '
        'Reference image 1 is this character\'s CURRENT idle animation: copy the face, head size, body '
        'proportions, outfit, colours, clean dark hand-drawn contours and soft cel shading EXACTLY from it. '
        f'New asset: {TITLE} action animation, played once when a throwing card or item is used. {MOVE} {EXTRA[hero]} '
        'Exactly 8 sequential FULL BODY frames arranged in a precise 4-column by 2-row equal-cell grid, reading '
        'left to right then the next row. Truly transparent RGBA background: no checkerboard drawing, no floor, '
        'no ground shadow, no glow, no text, no numbers, no borders, no grid lines, no labels. Each cell shows '
        'one complete cat facing RIGHT in the same three-quarter side view as reference image 1, safely inside '
        'its own cell with ears, tail, feet and cloth tails fully visible and generous transparent margins '
        '(at least 8% of the cell on every side); the extended arm in frames 4 and 5 must also stay inside its own '
        'cell; cats never touch or overlap the neighbouring cells. '
        'Uniform camera and identical character scale in all 8 frames, the SAME size as in reference image 1 '
        '(standing about 62% of the cell height, the head exactly as big as in reference image 1), body centred '
        'horizontally in its cell. Fixed ground baseline at 92% of each cell height. '
        f'Frames: {FRAMES} The motion must read clearly at small size; frame 8 must match frame 1 so the '
        f'animation hands back smoothly to the idle loop. {AVOID} Every frame is a freshly drawn whole character '
        'with natural joints; no paper-cut limbs, no detached body parts, no extra characters.'
    )


def refs(heroes: list[str]) -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in heroes:
        idle_sheet(hero).convert('RGB').save(REF / f'{hero}_idle.png')
    print(f'參考圖已輸出到 {REF}')


def record(hero: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(f'{hero}/toss', []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                                    'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(hero: str, note: str = '') -> tuple[str, int, str]:
    out_dir = SOURCE / hero
    out_dir.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (out_dir / f'toss.try{attempt}.png').exists() or (out_dir / f'toss.try{attempt}.pending').exists():
            attempt += 1
        (out_dir / f'toss.try{attempt}.pending').write_text('', encoding='utf-8')
    target = out_dir / f'toss.try{attempt}.png'
    text = prompt_for(hero) + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{SHEET[0]}x{SHEET[1]}', '--quality', 'high',
               '--prompt', text, '--image', str(REF / f'{hero}_idle.png'), '--out', str(target), '--force']
    started = time.time()
    status = 'failed'
    for _ in range(5):
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-300:]}'
        if 'at capacity' not in result.stderr:   # 伺服器滿載才等一下重試（codex_gen.py 坑 9），其他錯直接回報
            break
        time.sleep(30)
    (out_dir / f'toss.try{attempt}.pending').unlink(missing_ok=True)
    record(hero, attempt, text, status)
    return hero, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    r = sub.add_parser('refs')
    r.add_argument('heroes', nargs='*', default=['qiuqiu', 'feifei', 'dangdang', 'fengfeng'])
    p = sub.add_parser('prompt')
    p.add_argument('hero')
    g = sub.add_parser('gen')
    g.add_argument('heroes', nargs='+')
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('hero')
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    if args.command == 'refs':
        refs(args.heroes)
    elif args.command == 'prompt':
        print(prompt_for(args.hero))
    elif args.command == 'pick':
        chosen = SOURCE / args.hero / f'toss.try{args.attempt}.png'
        (SOURCE / args.hero / 'toss.png').write_bytes(chosen.read_bytes())
        data = json.loads(CONFIG.read_text(encoding='utf-8'))
        data['heroes'][args.hero]['toss']['attempt'] = args.attempt
        CONFIG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{args.hero}/toss 採用第 {args.attempt} 次')
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for hero, attempt, status in pool.map(lambda h: generate(h, args.note), args.heroes):
                print(f'{hero}/toss 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
