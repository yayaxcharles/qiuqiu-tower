"""出牌動作逐格圖的生圖工具（2026-09-22）。

補的是「出牌時沒有新版逐格動作」那幾組牌（盤點見 `docs/審查報告/缺動作的牌_2026-09-21.md`）：
球球的太極、輕功、能力牌（運氣）、抽牌（翻卷軸），菲菲與封封的吼、太極。

做法整套沿用待機狀態那支 `gen_idle_state_art.py`：角色外觀逐項描述（`LOOK` 直接拿那邊的）、
4 欄 × 2 列 8 格、gpt-image-1.5 真透明、面向右、腳底基準線在格高 92%、不要地板陰影文字邊框；
每張附兩張參考圖：① 新版待機 8 格（長相、頭身比、畫風一律以它為準）② 該招式家族的舊版靜態立繪
（只取「這一招在做什麼」的線索，姿勢比例畫風不照抄）。
提示詞寫意圖、不寫關節角度（過去的教訓：姿勢寫太死會跟角色設定打架）。

用法：
    python tools/gen_card_motion_art.py refs
    python tools/gen_card_motion_art.py prompt feifei roar
    python tools/gen_card_motion_art.py gen qiuqiu/taiji feifei/roar --jobs 4
    python tools/gen_card_motion_art.py gen qiuqiu/qinggong --note "修正說明"    # 重生時補在提示詞最後
    python tools/gen_card_motion_art.py pick qiuqiu/taiji 2
每一次生圖都存成 `<動作>.try<N>.png`（不覆蓋），檢查過才用 `pick` 複製成 `<動作>.png`。
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_idle_state_art import IMAGE_GEN, LOOK, SHEET, idle_sheet  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/card-motions'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'

# 動作 → 舊版靜態立繪的姿勢名（`hero/<角色>_<姿勢>`）：出牌時原本亮的就是這張
OLD_POSE = {'taiji': 'taiji', 'qinggong': 'qinggong', 'focus': 'focus', 'scroll': 'scroll', 'roar': 'roar'}
SPRITE_PREFIX = {'qiuqiu': 'ninja', 'feifei': 'feifei', 'dangdang': 'dangdang', 'fengfeng': 'fengfeng'}

# 每個出牌動作：標題、這一招在做什麼、8 格的節拍、不要畫的東西。
# 出牌動作跟待機狀態不同：第 8 格要**回到一般待機的架式**（播完就接回待機動作，差太多會跳一下）。
ACTION = {
    'taiji': (
        'TAIJI YIELDING HANDS (a soft tai-chi technique that absorbs and redirects force)',
        'Calm, focused face. The cat sinks a little into a relaxed rooted stance and both OPEN palms trace one '
        'smooth slow circle in front of the body, one palm rising while the other sinks, the weight rolling back '
        'and then forward, finishing with a gentle two-palm push forward before settling again. Soft and round, '
        'not a strike.',
        '1 normal idle stance identical to reference image 1; 2 weight settles, fists open into soft palms; '
        '3 palms start to circle, weight shifts back; 4 one palm high at face level, the other low at the waist; '
        '5 palms sweep around the circle, weight rolls forward; 6 a gentle two-palm push forward; '
        '7 palms draw back with an exhale; 8 back to the normal idle stance of frame 1.',
        'Feet stay planted on the ground in every frame. No yin-yang symbol, no swirl effects, no glow, no motion '
        'lines, no wind, no particles.',
    ),
    'qinggong': (
        'LIGHTNESS SKILL (qinggong: a feather-light leap straight up and a silent landing on the same spot)',
        'Light, nimble and effortless. The cat crouches, springs straight UP into the air, hangs lightly at the '
        'top with knees tucked and arms spread for balance while the cloth tails float, drifts down with pointed '
        'toes and lands softly on the same spot.',
        '1 normal idle stance identical to reference image 1 (feet on the ground); 2 crouch to spring, arms swept '
        'back (feet on the ground); 3 springing up, body stretched, feet just leaving the ground; 4 top of the '
        'leap, knees tucked, arms out for balance; 5 floating down, toes pointed; 6 touching down softly on the '
        'toes (feet on the ground); 7 knees absorb the landing (feet on the ground); 8 back to the normal idle '
        'stance of frame 1 (feet on the ground).',
        'In frames 3, 4 and 5 the cat is IN THE AIR: draw the whole body higher in its cell so the feet are clearly '
        'ABOVE the ground line (at the top of the leap the feet are about one quarter of the body height above '
        'it), but keep ears and cloth tails inside the cell. In frames 1, 2, 6, 7 and 8 the feet stand exactly on '
        'the ground line. No clouds, no dust, no smoke, no wind lines, no motion blur, no shadows.',
    ),
    'focus': (
        'FOCUS / QI GATHERING (a short meditation that grants a lasting inner power)',
        'Serene and concentrated. The cat stands a little taller, brings both paws together palm to palm in front '
        'of the chest, closes the eyes and takes one deep calm breath, then opens the eyes with quiet resolve.',
        '1 normal idle stance identical to reference image 1; 2 fists lower, a breath in; 3 both paws come '
        'together palm to palm in front of the chest; 4 eyes close, deep breath in, chest rises; 5 held in calm '
        'meditation; 6 a slow breath out, still meditating; 7 eyes open with resolve, paws part and close into '
        'fists; 8 back to the normal idle stance of frame 1.',
        'Feet stay planted. No aura, no halo, no glow, no sparkles, no particles, no symbols floating around.',
    ),
    'scroll': (
        'SCROLL STUDY (pulls out a ninja scroll, reads new techniques, tucks it away)',
        'Quick and practical. The cat pulls a small rolled scroll from the sash, snaps it open with both paws, '
        'reads it intently with eyes scanning, gives a small nod, rolls it up and tucks it back.',
        '1 normal idle stance identical to reference image 1; 2 one paw reaches to the sash; 3 pulls out a small '
        'rolled scroll; 4 snaps the scroll open with both paws at chest height; 5 reads it intently; 6 a small nod '
        'of understanding; 7 rolls it closed and tucks it back into the sash; 8 back to the normal idle stance of '
        'frame 1.',
        'The scroll is small (about head size when open) and shows only faint abstract brush strokes, no legible '
        'text. Feet stay planted. No glow, no symbols, no particles.',
    ),
    'roar': (
        'BATTLE ROAR (a fierce shout that shakes the enemies)',
        'Fierce and loud. The cat draws a deep breath, then thrusts the head forward and roars with the mouth wide '
        'open showing small fangs, eyes fierce, fists clenched, hair and cloth tails flung back by the force, then '
        'settles back into the ready stance.',
        '1 normal idle stance identical to reference image 1; 2 inhale, shoulders rise; 3 deep inhale, leaning back '
        'a little, chest puffed; 4 head thrusts forward, mouth opening; 5 full roar, mouth wide open, eyes fierce; '
        '6 the roar continues, fists clenched; 7 mouth closes, body settles; 8 back to the normal idle stance of '
        'frame 1.',
        'Feet stay planted. No sound waves, no shockwave rings, no lines, no text, no aura, no particles.',
    ),
}

# 角色專屬的補充（角色設定上不能違反的地方）
EXTRA = {
    ('fengfeng', 'roar'): 'For Fengfeng the jian stays SHEATHED at the waist in every frame; one paw may grip the '
                          'sheathed hilt while he roars.',
    ('fengfeng', 'taiji'): 'For Fengfeng the jian stays SHEATHED at the waist in every frame; the tai-chi circle is '
                           'done with both empty open paws.',
    ('feifei', 'taiji'): 'Feifei does this empty-handed: no needles in her paws.',
    ('feifei', 'roar'): 'Her dark-brown ponytail and purple bow whip back during the roar.',
    # 球球的外觀描述要求整段維持寬馬步；跳起來那幾格是例外，不講清楚會畫成蹲著不動
    ('qiuqiu', 'qinggong'): 'The wide stance applies to frames 1, 2, 7 and 8 only; during the leap the legs tuck '
                            'and stretch freely.',
}

_LOCK = threading.Lock()


def prompt_for(hero: str, action: str) -> str:
    title, look, frames, avoid = ACTION[action]
    extra = EXTRA.get((hero, action), '')
    return (
        f'Create a production-ready transparent sprite sheet for {LOOK[hero]}. '
        'Reference image 1 is this character\'s CURRENT idle animation: copy the face, head size, body '
        'proportions, outfit, colours, clean dark hand-drawn contours and soft cel shading EXACTLY from it. '
        'Reference image 2 is an OLD illustration of the same technique: use it ONLY as a hint for what the '
        'technique is; do NOT copy its pose, proportions or painting style. '
        f'New asset: {title} action animation, played once when the card is used. {look} {extra} '
        'Exactly 8 sequential FULL BODY frames arranged in a precise 4-column by 2-row equal-cell grid, reading '
        'left to right then the next row. Truly transparent RGBA background: no checkerboard drawing, no floor, '
        'no ground shadow, no glow, no text, no numbers, no borders, no grid lines, no labels. Each cell shows '
        'one complete cat facing RIGHT in the same three-quarter side view as reference image 1, safely inside '
        'its own cell with ears, tail, feet and cloth tails fully visible and generous transparent margins '
        '(at least 8% of the cell on every side); cats never touch or overlap the neighbouring cells. '
        'Uniform camera and identical character scale in all 8 frames, the SAME size as in reference image 1 '
        '(standing about 62% of the cell height), body centred horizontally in its cell, the whole move done in '
        'place without travelling sideways. Fixed ground baseline at 92% of each cell height. '
        f'Frames: {frames} The motion must read clearly at small size; frame 8 must match frame 1 so the '
        f'animation hands back smoothly to the idle loop. {avoid} Every frame is a freshly drawn whole character '
        'with natural joints; no paper-cut limbs, no detached body parts, no extra characters.'
    )


def refs(jobs: list[str]) -> None:
    REF.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / 'public/assets/manifest.json').read_text(encoding='utf-8'))['sprites']
    for hero in sorted({j.split('/')[0] for j in jobs}):
        idle_sheet(hero).convert('RGB').save(REF / f'{hero}_idle.png')
    for job in jobs:
        hero, action = job.split('/')
        key = f'hero/{SPRITE_PREFIX[hero]}_{OLD_POSE[action]}'
        old = Image.open(ROOT / 'public' / manifest[key]).convert('RGBA')
        bg = Image.new('RGBA', old.size, (255, 255, 255, 255))
        bg.alpha_composite(old)
        bg.convert('RGB').save(REF / f'{hero}_{action}_old.png')
    print(f'參考圖已輸出到 {REF}')


def record_prompt(hero: str, action: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(f'{hero}/{action}', []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                                        'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(job: str, extra_note: str = '') -> tuple[str, int, str]:
    hero, action = job.split('/', 1)
    out_dir = SOURCE / hero
    out_dir.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (out_dir / f'{action}.try{attempt}.png').exists() or (out_dir / f'{action}.try{attempt}.pending').exists():
            attempt += 1
        (out_dir / f'{action}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = out_dir / f'{action}.try{attempt}.png'
    text = prompt_for(hero, action) + (f' {extra_note}' if extra_note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{SHEET[0]}x{SHEET[1]}', '--quality', 'high',
               '--prompt', text, '--image', str(REF / f'{hero}_idle.png'),
               '--image', str(REF / f'{hero}_{action}_old.png'), '--out', str(target), '--force']
    started = time.time()
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    status = 'ok' if result.returncode == 0 and target.exists() else f'failed: {result.stderr.strip()[-400:]}'
    (out_dir / f'{action}.try{attempt}.pending').unlink(missing_ok=True)
    record_prompt(hero, action, attempt, text, status)
    return job, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    r = sub.add_parser('refs')
    r.add_argument('jobs', nargs='*')
    p = sub.add_parser('prompt')
    p.add_argument('hero')
    p.add_argument('action')
    g = sub.add_parser('gen')
    g.add_argument('jobs', nargs='+', help='hero/action')
    g.add_argument('--jobs', dest='workers', type=int, default=3)
    g.add_argument('--note', default='', help='重生時補在提示詞最後的修正說明')
    k = sub.add_parser('pick')
    k.add_argument('job', help='hero/action')
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    if args.command == 'refs':
        config = json.loads((SOURCE / 'actions.json').read_text(encoding='utf-8'))['heroes']
        refs(args.jobs or [f'{h}/{a}' for h, acts in config.items() for a in acts])
    elif args.command == 'prompt':
        print(prompt_for(args.hero, args.action))
    elif args.command == 'pick':
        hero, action = args.job.split('/', 1)
        chosen = SOURCE / hero / f'{action}.try{args.attempt}.png'
        (SOURCE / hero / f'{action}.png').write_bytes(chosen.read_bytes())
        data = json.loads((SOURCE / 'actions.json').read_text(encoding='utf-8'))
        data['heroes'][hero][action]['attempt'] = args.attempt
        (SOURCE / 'actions.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{args.job} 採用第 {args.attempt} 次')
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for job, attempt, status in pool.map(lambda j: generate(j, args.note), args.jobs):
                print(f'{job} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
