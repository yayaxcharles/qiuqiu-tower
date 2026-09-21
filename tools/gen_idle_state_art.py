"""待機狀態逐格圖的生圖工具（2026-09-21）。

做法沿用 `qiuqiu-coop-motion-20260920/tools/motion-art-source/*/prompts.json` 的句型：
角色外觀逐項描述、4 欄 × 2 列 8 格、真透明、面向右、腳底基準線在格高 92%、不要地板陰影文字邊框。

每一張都附兩張參考圖（`refs` 子指令產生，放在 `_ref/`）：
  ① 新版待機的 8 格（照遊戲裡的比例排成 4×2、鋪白底）——長相、頭身比、畫風一律以它為準；
  ② 該狀態的舊版立繪（鋪白底）——只取「狀態的外觀線索」（繃帶、口水、星星…），姿勢與畫風不照抄。

生圖後端：`~/.codex/skills/codex-ppt/scripts/image_gen.py edit --backend codex-oauth
--model gpt-image-1.5 --background transparent`（直接出真透明，不用去背）。

用法：
    python tools/gen_idle_state_art.py refs
    python tools/gen_idle_state_art.py prompt feifei wounded        # 印出提示詞
    python tools/gen_idle_state_art.py gen feifei/wounded dangdang/curl --jobs 4
    python tools/gen_idle_state_art.py pick feifei/wounded 2      # 選定第 2 次的結果當正式來源
每一次生圖都存成 `<動作>.try<N>.png`（不覆蓋、不先刪再生），檢查過才用 `pick` 複製成 `<動作>.png`。
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
SOURCE = ROOT / 'tools/motion-art-source/idle-states'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
SPRITE_KEY = {'qiuqiu': 'ninja', 'feifei': 'feifei', 'dangdang': 'dangdang', 'fengfeng': 'fengfeng'}
IDLE_DATA = {
    'qiuqiu': 'src/ui/qiuqiu-motion-data.json',
    'feifei': 'src/ui/feifei-motion-data.json',
    'dangdang': 'src/ui/dangdang-motion-data.json',
    'fengfeng': 'src/ui/fengfeng-motion-data.json',
}
SHEET = (1536, 1024)          # gpt-image-1.5 最寬只到 1536×1024；一格 384×512
CHAR_HEIGHT = .62             # 參考圖裡角色站高佔格高的比例（新圖也照這個比例畫）
BASELINE = .92

LOOK = {
    'qiuqiu': (
        'the EXACT QIUQIU ninja cat from reference image 1: pale cream-white tabby with grey-brown stripes on the '
        'head and three brown cheek stripes, big round head with pink inner ears, black eyes, a navy headband tied '
        'with two long tails flowing to the left, navy ninja gi with crossed collar, black sash tied at the front, '
        'navy trousers with black shin wraps, white paws, a grey-brown ringed striped tail. His idle is a WIDE, LOW, '
        'knees-bent martial-arts stance with the feet planted far apart and both fists raised in front of the chest; '
        'frame 1 must reproduce exactly that wide stance (not an upright pose), and the legs stay in a similar wide '
        'stance through the animation unless the status itself makes him sit or curl'
        # 2026-09-21：肚子餓第一版第 1 格畫成直挺挺站著，拿它定比例整隻貓縮水一成五，所以把架式寫進外觀描述
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
        'cream-white muzzle, chest and paws, amber eyes, red scarf fluttering to the left, red sleeveless martial '
        'vest with cream trim over rolled cream sleeves, dark charcoal trousers, brown waist sash, brown lower-leg '
        'wraps, ONE straight Chinese jian sword with brass guard and red tassel kept SHEATHED in a dark-brown '
        'scabbard at the waist in EVERY frame (never drawn). Not a katana, not a ninja'
    ),
}

# 每種狀態：8 格的內容。寫意圖、不寫關節角度（姿勢寫太死會跟角色設定打架）。
# 第 1～4 格從一般待機過渡到該狀態，第 5～8 格穩住；第 8 格是之後一直停著的那一格，要最清楚。
STATE = {
    'wounded': (
        'WOUNDED (low health, battered but refusing to give up)',
        'Status cues: one or two small beige cross-shaped adhesive bandages on the cheek or forehead and one on an '
        'arm, a few small scuffs on the clothes, a small sweat drop on the face, panting with the mouth slightly '
        'open. Body: weight a little lower with knees more bent, one paw pressed to the side of the ribs, the other '
        'fist still raised in a fighting guard; eyes pained (one eye squinting) but determined, teeth gritted.',
        '1 normal idle stance identical to reference image 1; 2 a flinch as the aches hit, a paw moves to the ribs; '
        '3 shoulders sag and knees bend, bandages visible; 4 catching breath; 5 feet re-planted and guard raised '
        'again; 6 panting breath in; 7 panting breath out; 8 the definitive wounded-but-defiant fighting stance.',
        'NO blood, NO open wounds, NOT kneeling, NOT falling: still standing on both feet at nearly full height.',
    ),
    'power': (
        'POWERED UP (claw power fully charged)',
        'Body: stance opens wider, chest out, one fist clenched hard and the other paw raised with sharp claws '
        'out, fierce confident eyes and a small fanged grin, tail and cloth tails flicking energetically. Cue: a few '
        'short bold ink power strokes drawn right on the fists and shoulders, hugging the body.',
        '1 normal idle stance identical to reference image 1; 2 inhale, fists tighten; 3 feet planted wider; '
        '4 claws extend, eyes sharpen; 5 powered stance set; 6 slight breath in; 7 slight breath out; '
        '8 the definitive powered-up stance with claws bared.',
        'NO aura, NO glow, NO halo, NO sparks or particles floating away from the body, NO background effects: '
        'every mark must stay on the cat itself.',
    ),
    'hungry': (
        'HUNGRY (ran out of food energy)',
        'Body: one or both paws rubbing the round belly, shoulders drooping, head a little lowered, ears drooping, '
        'tired half-lidded eyes, mouth slightly open with a tiny drop of drool, tail hanging low. Still standing '
        'on both feet.',
        '1 normal idle stance identical to reference image 1; 2 the belly rumbles, a surprised glance down; '
        '3 a paw moves to the belly; 4 shoulders droop; 5 both paws on the belly, sad face; 6 a small sigh; '
        '7 knees soften a little; 8 the definitive hungry pose, paws on belly, droopy eyes, a little drool.',
        'No food, no bowls, no floating symbols, no text.',
    ),
    'dizzy': (
        'DAZED (bound and stunned, cannot attack)',
        'Body: unsteady wobble, knees a little bent, arms loose, head tilted, swirly spiral eyes, wavy mouth. '
        'Cue: two or three SMALL yellow stars circling close above the head, kept small and inside the cell.',
        '1 normal idle stance identical to reference image 1; 2 head jolts, a blink; 3 eyes start to swirl, sway '
        'to one side; 4 sway to the other side; 5 wobbly stance with swirl eyes and stars; 6 sway; 7 sway back; '
        '8 the definitive dazed pose with swirl eyes and small stars.',
        'No large effects, no text, no birds. Feet stay on the ground.',
    ),
    'lazy': (
        'LAZY / DROWSY (sluggish)',
        'Body: a big yawn with one paw covering the mouth, droopy sleepy half-closed eyes, slouched back, the other '
        'arm hanging loose, relaxed knees, drooping tail.',
        '1 normal idle stance identical to reference image 1; 2 eyelids droop; 3 a yawn begins, paw rising; '
        '4 a big yawn with the paw at the mouth, eyes shut; 5 slouch after the yawn; 6 sleepy blink; '
        '7 head nods slightly; 8 the definitive lazy slouch, sleepy eyes, paw near the mouth.',
        'No Z letters, no bubbles, no text, no pillow.',
    ),
    'iron': (
        'IRON BODY (iron-shirt technique, defence hardened)',
        'Body: rooted wide stance, chest puffed out, arms folded firmly across the chest (or forearms braced '
        'crosswise in front), muscles tensed, chin up, calm unshakable confident face. Cue: a subtle cool '
        'steel-grey sheen on the fur and clothes.',
        '1 normal idle stance identical to reference image 1; 2 a deep breath in; 3 sink into a rooted stance; '
        '4 arms fold and brace firmly; 5 body tenses, steel sheen appears; 6 hold; 7 a tiny breath; '
        '8 the definitive iron-body stance.',
        'No aura, no glow, no particles, no armour pieces added.',
    ),
    'curl': (
        'CURLED DEFENCE (tucking in to block)',
        'The cat quickly tucks into a compact round defensive ball: crouched low, knees up, arms hugging in front, '
        'head tucked down, back rounded, tail wrapped around the body, one eye peeking out.',
        '1 normal idle stance identical to reference image 1; 2 crouch and pull the arms in; 3 knees up, head '
        'tucking; 4 a compact round ball; 5 hold the ball; 6 tiny breath; 7 an eye peeks out; '
        '8 the definitive curled defensive ball.',
        'The body naturally gets LOWER as it curls: do NOT enlarge the curled cat to match the standing height; '
        'the bottom stays on the same ground line. No shields, no effects.',
    ),
    'belly': (
        'BELLY-UP (knocked off balance and flipped onto the back)',
        'A single continuous comical fall onto the back, ending belly-up and helpless with paws curled in the air.',
        '1 normal idle stance identical to reference image 1; 2 wobbles backwards, surprised eyes; 3 knees buckle '
        'and the rump drops; 4 sits and tips back; 5 rolls onto the back with head to the LEFT and feet to the '
        'RIGHT, paws up; 6 settles on the back, belly up; 7 paws wobble; 8 the definitive helpless belly-up pose.',
        'Do NOT somersault or turn upside down. Do NOT enlarge the lying cat to match standing height; the body '
        'rests on the same ground line. No stars, no impact symbols.',
    ),
    'stealth': (
        'STEALTH (hidden, sneaking)',
        'Body: a sneaky slightly lowered crouch on tiptoe, one paw with a raised finger at the lips in a quiet '
        '"shh" gesture, the other paw ready, narrowed watchful eyes glancing right.',
        '1 normal idle stance identical to reference image 1; 2 a glance around; 3 lower into a crouch; '
        '4 finger to the lips; 5 quiet breath in; 6 quiet breath out; 7 eyes scan; '
        '8 the definitive stealth crouch with the shh gesture.',
        'No smoke, no mist, no see-through body, no particles, no symbols.',
    ),
    'puff': (
        'PUFFED UP (startled, fur bristling)',
        'Body: shocked wide round eyes, spiky bristling fur on the cheeks, head and body, a huge bristled '
        'bottle-brush tail standing up, stiff alarmed stance with paws raised.',
        '1 normal idle stance identical to reference image 1; 2 a startled flinch; 3 fur starts to bristle; '
        '4 the tail puffs up huge; 5 stiff alarmed breathing, fur fully bristled; 6 a short blink; 7 shoulders '
        'still tense; 8 the definitive puffed-up startled pose.',
        'Keep the huge tail completely inside its own cell. No lightning, no motion lines, no symbols.',
    ),
}

# 角色專屬的補充（舊立繪的狀態線索、角色設定上不能違反的地方）
EXTRA = {
    ('feifei', 'stealth'): 'For Feifei the stealth cue is pulling her black scarf up over her nose and mouth like a '
                           'ninja mask (instead of the shh finger), eyes narrowed.',
    ('dangdang', 'curl'): 'For Dangdang the curl is his signature block: he crouches low into a sturdy compact ball '
                          'and hides his tucked head behind BOTH copper forearm bracers held together in front '
                          'like a shield, back rounded, tail wrapped around his feet.',
    ('dangdang', 'iron'): 'For Dangdang the iron body shows both copper bracers crossed firmly in front of his chest.',
    ('fengfeng', 'stealth'): 'For Fengfeng: shh finger at the lips while the other paw rests on the SHEATHED sword hilt.',
    ('fengfeng', 'power'): 'For Fengfeng the sword stays SHEATHED: one paw grips the hilt at the waist ready to draw, '
                           'the other fist clenched.',
    ('fengfeng', 'iron'): 'For Fengfeng the arms are folded across the chest; the sword stays sheathed at the waist.',
}


def prompt_for(hero: str, action: str) -> str:
    title, look, frames, avoid = STATE[action]
    extra = EXTRA.get((hero, action), '')
    return (
        f'Create a production-ready transparent sprite sheet for {LOOK[hero]}. '
        'Reference image 1 is this character\'s CURRENT idle animation: copy the face, head size, body '
        'proportions, outfit, colours, clean dark hand-drawn contours and soft cel shading EXACTLY from it. '
        'Reference image 2 is an OLD illustration of the same status: use it ONLY as a hint for the status cue; '
        'do NOT copy its pose, proportions or painting style. '
        f'New asset: {title} idle-state animation. {look} {extra} '
        'Exactly 8 sequential FULL BODY frames arranged in a precise 4-column by 2-row equal-cell grid, reading '
        'left to right then the next row. Truly transparent RGBA background: no checkerboard drawing, no floor, '
        'no ground shadow, no glow, no text, no numbers, no borders, no grid lines, no labels. Each cell shows '
        'one complete cat facing RIGHT in the same three-quarter side view as reference image 1, safely inside '
        'its own cell with ears, tail, feet and cloth tails fully visible and generous transparent margins '
        '(at least 8% of the cell on every side); cats never touch or overlap the neighbouring cells. '
        'Uniform camera and identical character scale in all 8 frames, the SAME size as in reference image 1 '
        '(standing about 62% of the cell height), body centred horizontally in its cell. Fixed ground baseline '
        'at 92% of each cell height: feet planted on it, no sliding, no jumping. '
        f'Frames: {frames} Frames 1-4 flow from the normal idle into the status; frames 5-8 hold the status with '
        'only small breathing changes; frame 8 is held on screen for a long time, so make it the clearest and most '
        f'readable. {avoid} Every frame is a freshly drawn whole character with natural joints; no paper-cut '
        'limbs, no detached body parts, no extra characters.'
    )


def idle_sheet(hero: str) -> Image.Image:
    """新版待機的 8 格，照遊戲比例排成 4×2、腳底在 92%，鋪白底。"""
    data = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    texture = Image.open(ROOT / 'public' / data['texture']).convert('RGBA')
    frames = data['frames']
    order = [frames[i % len(frames)] for i in range(8)]
    cell_w, cell_h = SHEET[0] // 4, SHEET[1] // 2
    target = CHAR_HEIGHT * cell_h
    sheet = Image.new('RGBA', SHEET, (255, 255, 255, 255))
    for index, frame in enumerate(order):
        x, y, w, h = frame['rect']
        k = target / 252 * data['scale']
        crop = texture.crop((x, y, x + w, y + h)).resize((round(w * k), round(h * k)), Image.LANCZOS)
        col, row = index % 4, index // 4
        px = col * cell_w + cell_w / 2 - frame['pivot'][0] * k
        py = row * cell_h + BASELINE * cell_h - frame['pivot'][1] * k
        sheet.alpha_composite(crop, (round(px), round(py)))
    return sheet


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / 'public/assets/manifest.json').read_text(encoding='utf-8'))['sprites']
    for hero, key in SPRITE_KEY.items():
        idle_sheet(hero).convert('RGB').save(REF / f'{hero}_idle.png')
        for action in STATE:
            sprite = manifest.get(f'hero/{key}_{action if action != "wounded" else "hurt"}')
            if not sprite:
                continue
            old = Image.open(ROOT / 'public' / sprite).convert('RGBA')
            bg = Image.new('RGBA', old.size, (255, 255, 255, 255))
            bg.alpha_composite(old)
            bg.convert('RGB').save(REF / f'{hero}_{action}_old.png')
    print(f'參考圖已輸出到 {REF}')


_LOCK = threading.Lock()


def record_prompt(hero: str, action: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        _record_prompt(hero, action, attempt, text, status)


def _record_prompt(hero: str, action: str, attempt: int, text: str, status: str) -> None:
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
    old_ref = REF / f'{hero}_{action}_old.png'
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{SHEET[0]}x{SHEET[1]}', '--quality', 'high',
               '--prompt', text, '--image', str(REF / f'{hero}_idle.png'), '--image', str(old_ref),
               '--out', str(target), '--force']
    started = time.time()
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    status = 'ok' if result.returncode == 0 and target.exists() else f'failed: {result.stderr.strip()[-400:]}'
    (out_dir / f'{action}.try{attempt}.pending').unlink(missing_ok=True)
    record_prompt(hero, action, attempt, text, status)
    return job, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
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
        refs()
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
