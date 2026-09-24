"""菲菲七套針招逐格圖重畫的生圖工具（2026-09-22，批次 ff2）。

背景：09-20 那批針招（`needle_*_v2.webp`）生圖時的長相參考是舊版立繪 `sprites/hero/feifei_idle.webp`，
跟現在的新版待機比起來頭小一成多、腿長三成左右（上衣一樣大）。打包時又把第 1 格外框拉成跟待機一樣高，
所以一出招整隻貓「身高一樣、頭縮一圈」。量法與數字見 `docs/審查報告/重畫_ff2_2026-09-22.png` 與
`docs/feifei-needle-redraw-ff2.json`。這不是整隻縮放能修的（頭放大到對，腿就長出一截），只能重畫。

做法跟 `gen_card_motion_art.py` 同一套（gpt-image-1.5 真透明、4 欄 × 2 列 8 格、面向右、腳底在格高 92%），
差在兩張參考圖都照**同一個版面**排好（`refs` 子指令產生，白底，放在 `_ref/`）：
  ① 新版待機**第 1 格**，8 格每格放一隻、站高 56% 格高——長相、頭的大小、頭身比一律照它；
  ② 舊版 8 格，照遊戲裡的比例、同一條腳底線、同一個格子中心排好——只取「每一格在做什麼」
     （姿勢、哪隻手出手、出手那一格），比例和畫風不照抄。
站高用 56%（不是待機狀態那批的 62%）：一針斃命、連針伸直手臂那幾格寬到 280 單位，62% 會頂到隔壁格。

格數、順序、每格時長、出手時間都不動（寫在 `feifei-needle-motion-data.json`，打包器照抄）。

用法：
    python tools/gen_feifei_needle_redraw.py refs
    python tools/gen_feifei_needle_redraw.py prompt needle_combo
    python tools/gen_feifei_needle_redraw.py gen needle_combo needle_rain --jobs 3
    python tools/gen_feifei_needle_redraw.py gen needle_rain --note "修正說明"   # 重生時補在提示詞最後
    python tools/gen_feifei_needle_redraw.py pick needle_combo 2
每一次生圖都存成 `<動作>.try<N>.png`（不覆蓋），檢查過才用 `pick` 複製成 `<動作>.png`。每套最多生 4 次。
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
from gen_idle_state_art import IMAGE_GEN, LOOK  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/ff2'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
CONFIG = SOURCE / 'actions.json'
IDLE_DATA = ROOT / 'src/ui/feifei-motion-data.json'
NEEDLE_DATA = ROOT / 'src/ui/feifei-needle-motion-data.json'
SHEET = (1536, 1024)          # gpt-image-1.5 最寬 1536×1024；一格 384×512
CHAR_HEIGHT = .56             # 參考圖裡待機的站高佔格高的比例（新圖照這個比例畫；打包器靠它換算大小）
BASELINE = .92
MAX_ATTEMPTS = 4
ACTIONS = ('needle_backhand', 'needle_barrage', 'needle_combo', 'needle_pierce', 'needle_rain', 'needle_retreat',
           'needle_venom')

# 每一招：標題、8 格的節拍（沿用 09-20 那批的節拍，招式才認得出是同一招；只把頭的朝向寫死成一直看右邊）
BEATS = {
    'needle_combo': (
        'ALTERNATING TWO-HAND RAPID NEEDLE COMBO',
        '1 balanced guard, both paws up (the idle stance of reference image 1); 2 both paws pull one slim silver '
        'needle each from the gold waist tubes, knees load; 3 right elbow draws back while the left hand aims, torso '
        'twists; 4 FIRST RELEASE: the right paw shoots straight out to screen-right at chest height, open and empty, '
        'left elbow retracts; 5 right hand pulls back while the LEFT hand chambers across the waist; 6 SECOND '
        'RELEASE: the LEFT paw shoots outward to screen-right at shoulder height, open and empty, right hand guards '
        'the chest; 7 follow-through with both hands forward at different heights, ponytail whips; 8 controlled '
        'return to the guard of frame 1.',
        'Only needles still held before a release may be visible; release paws are empty.',
    ),
    'needle_backhand': (
        "'BUTTERFINGERS' ACCIDENTAL BACKHAND NEEDLE SHOT (clumsy and comedic, but readable)",
        '1 normal ready stance (the idle stance of reference image 1); 2 she carefully reaches toward her gold waist '
        'needle tubes; 3 her paw gets pricked: brow rises, small shocked gasp, the other paw reaches to help; '
        '4 sudden reflex recoil, elbows fold up across the body, knees knock inward slightly; 5 RELEASE: an '
        'accidental fast BACKHAND fling toward screen-right from the crossed-arm position, the released paw open, '
        'empty and pointing screen-right, torso tilting the other way; 6 she grabs the stinging hand with the other '
        'paw, ears tilt back; 7 quickly shakes out the hand and regains balance; 8 back to the ready stance of '
        'frame 1 with a wary, annoyed expression.',
        'No blood, no emotion symbols, no magic.',
    ),
    'needle_pierce': (
        "ONE-NEEDLE EXECUTION (a marksman's low aiming stance, then one explosive straight-arm throw)",
        '1 neutral guard (the idle stance of reference image 1); 2 she raises ONE tiny silver needle beside her eye '
        'between two fingers, eyes narrow; 3 sinks into a low fencing-like stance, the free paw extends to sight the '
        'target, the needle hand behind the cheek; 4 sinks lower, rear knee loaded, eyes fixed on screen-right; '
        '5 final coil, the needle hand drawn beside the ear; 6 RELEASE: a sudden full straight-arm throw toward '
        'screen-right with the front foot planted and the rear heel lifting, throwing paw open and empty; '
        '7 recoil and long follow-through, ponytail trailing left; 8 back to the grounded guard of frame 1.',
        'No bow, gun, sword or bottles; no trail or floating needle after the release.',
    ),
    'needle_venom': (
        'VENOM-SEAL NEEDLE (an ominous, controlled ritual, then one lethal two-finger flick)',
        '1 guard (the idle stance of reference image 1); 2 both paws come close together at the sternum around one '
        'held silver needle, gaze intense; 3 fingers roll and inspect the needle held horizontally between crossed '
        'wrists, shoulders sink; 4 holds this tight coiled crossed-wrist silhouette, knees deeply bent, eyes narrow; '
        '5 RELEASE: snaps one hand outward with two fingers pointing to screen-right while the other hand keeps a '
        'seal at the chest; 6 holds the empty release fingers pointing at the target; 7 eases the stance, ponytail '
        'settles; 8 back to the ready stance of frame 1.',
        'No aura, no circles, no poison bottles, no flames, no trails (the game adds the poison burst itself).',
    ),
    'needle_retreat': (
        "'DON'T COME CLOSER!' PANICKED HANDFUL VOLLEY WHILE SHRINKING BACKWARD (cute fear)",
        '1 ready stance facing screen-right (the idle stance of reference image 1); 2 startled wide blue eyes, ears '
        'pull back, weight shifts to the rear leg; 3 both hands yank a handful of slim needles from the gold waist '
        'tubes, shoulders hunch; 4 crossed arms clutch the two handfuls to the chest, torso leans backward; '
        '5 RELEASE: desperate explosive BOTH-HANDS forward release to screen-right, fingers spread and EMPTY, torso '
        'still recoiling left, eyes squeezed shut; 6 near crouch with the arms curled protectively over the face, '
        'no fall; 7 opens the eyes, pulls the guard in tightly, nervous expression; 8 steadies back in the ready '
        'stance of frame 1.',
        'No tears, symbols, blood, smoke, floating needles or motion streaks.',
    ),
    'needle_rain': (
        'OVERHEAD NEEDLE RAIN (tosses two handfuls HIGH into the air toward screen-right, not a horizontal throw)',
        '1 neutral stance (the idle stance of reference image 1); 2 both paws gather needles from the waist, knees '
        'bend; 3 deep squat with both handfuls low near the hips; 4 torso rises as BOTH arms sweep up in front and '
        'ABOVE the head, paws still holding needles, legs extend; 5 RELEASE: both arms fully up overhead, fingers '
        'open and empty, up on the toes, looking up and to the right; 6 arms stay up but start opening to either '
        'side as she watches the rain fall, heels settle; 7 arms lower smoothly to the chest, knees soften; '
        '8 back to the stance of frame 1.',
        'She does NOT jump: at least the toes touch the common ground line in every frame. Raised paws and the '
        'ponytail stay fully inside the cell. No rain, no falling needles, no effects.',
    ),
    'needle_barrage': (
        "'EMPTY THE NEEDLES!' ALL-OUT TWO-ARM SPREAD VOLLEY (a big wind-up twist, then both arms fling open)",
        '1 guard (the idle stance of reference image 1); 2 each hand grasps several needles from the waist tubes '
        'while she plants a wide stance; 3 the torso twists away to wind up, arms crossed and loaded, ponytail '
        'swings, but the FACE still looks screen-right; 4 coils more, one hand high behind the shoulder and the '
        'other low across the front, needles still held; 5 RELEASE: explosively unwinds to screen-right, BOTH arms '
        'fling OPEN diagonally (one high forward, one low forward), fingers spread and empty, wide grounded stance, '
        'tail counterbalancing; 6 big open-arm follow-through, weight forward, determined face; 7 exhales and draws '
        'both empty hands back toward the tubes, slightly worried; 8 back to the guard of frame 1.',
        'No spin ring, magic lines, extra arms, flying needles, bottles or other weapons.',
    ),
}

_LOCK = threading.Lock()


def _atlas(texture: str) -> Image.Image:
    return Image.open(ROOT / 'public' / texture).convert('RGBA')


def _place(sheet: Image.Image, atlas: Image.Image, frame: dict, scale: float, index: int) -> None:
    """把一格照遊戲比例（×站高換算）貼到 4×2 版面的第 index 格：定位點在格子正中、腳底在 92%。"""
    cell_w, cell_h = SHEET[0] // 4, SHEET[1] // 2
    k = CHAR_HEIGHT * cell_h / 252 * scale
    x, y, w, h = frame['rect']
    crop = atlas.crop((x, y, x + w, y + h)).resize((round(w * k), round(h * k)), Image.LANCZOS)
    col, row = index % 4, index // 4
    px = col * cell_w + cell_w / 2 - frame['pivot'][0] * k
    py = row * cell_h + BASELINE * cell_h - frame['pivot'][1] * k
    sheet.alpha_composite(crop, (round(px), round(py)))


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    idle = json.loads(IDLE_DATA.read_text(encoding='utf-8'))['actions']['idle']
    sheet = Image.new('RGBA', SHEET, (255, 255, 255, 255))
    atlas = _atlas(idle['texture'])
    for index in range(8):
        _place(sheet, atlas, idle['frames'][0], idle['scale'], index)
    sheet.convert('RGB').save(REF / 'feifei_idle_frame1.png')
    needles = json.loads(NEEDLE_DATA.read_text(encoding='utf-8'))['actions']
    for action in ACTIONS:
        motion = needles[action]
        if not motion['texture'].endswith('_v2.webp'):
            raise SystemExit(f'{action}: 動作資料已經不是舊版 v2（{motion["texture"]}），舊版姿勢參考要從 git 取回再產生')
        sheet = Image.new('RGBA', SHEET, (255, 255, 255, 255))
        atlas = _atlas(motion['texture'])
        for index, frame in enumerate(motion['frames']):
            _place(sheet, atlas, frame, motion['scale'], index)
        sheet.convert('RGB').save(REF / f'{action}_old.png')
    print(f'參考圖已輸出到 {REF}')


def prompt_for(action: str) -> str:
    title, frames, avoid = BEATS[action]
    return (
        f'Create a production-ready transparent sprite sheet for {LOOK["feifei"]}. '
        "Reference image 1 is this character's CURRENT in-game idle frame, repeated in every cell at the exact size "
        'and position each new frame must use. Copy from it EXACTLY: the face, the LARGE head (the head with ears '
        'takes up about the top half of her standing height), the short chunky chibi body, the SHORT legs (only a '
        'little black trouser shows below the magenta tunic before the feet), the outfit, colours, clean dark '
        'hand-drawn contours and soft cel shading. '
        'Reference image 2 is the OLD version of this same animation, 8 frames in the same grid: keep each frame\'s '
        'pose, gesture, hand positions, which hand throws, and the beat of every frame, so it is clearly the same '
        'technique in the same order. But the character in reference image 2 is drawn with an outdated design: '
        'its head is too SMALL and its legs are too LONG. Do NOT copy those proportions or its style; redraw every '
        'pose with the character of reference image 1 (bigger head, shorter legs, same overall height). '
        f'Animation: {title}, played once when the card is used. '
        'Exactly 8 sequential FULL BODY frames arranged in a precise 4-column by 2-row equal-cell grid, reading '
        'left to right then the next row. Truly transparent RGBA background: no checkerboard drawing, no floor, '
        'no ground shadow, no glow, no text, no numbers, no borders, no grid lines, no labels, no speed lines. '
        'Each cell shows one complete cat facing RIGHT in the same three-quarter side view as reference image 1; '
        'the HEAD keeps that three-quarter view looking toward screen-right in every frame (it may tilt, it never '
        'turns away from the viewer) and keeps EXACTLY the same size in all 8 frames. Ears, ponytail, bow, tail, '
        'paws and feet fully visible, safely inside the cell with generous transparent margins (at least 6% of the '
        'cell on every side); cats never touch or overlap the neighbouring cells. Uniform camera and identical '
        'character scale in all 8 frames, the SAME size as in reference image 1 (standing about 56% of the cell '
        'height), feet centred in the cell, the whole move done in place without travelling sideways. Fixed ground '
        'baseline at 92% of each cell height: both feet stand on it in every frame. '
        f'Frames: {frames} Frame 8 must match frame 1 so the animation hands back smoothly to the idle loop. '
        f'{avoid} Every frame is a freshly drawn whole character with natural joints; no paper-cut limbs, no '
        'detached body parts, no extra characters.'
    )


def record_prompt(action: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(action, []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                            'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(action: str, extra_note: str = '') -> tuple[str, int, str]:
    SOURCE.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{action}.try{attempt}.png').exists() or (SOURCE / f'{action}.try{attempt}.pending').exists():
            attempt += 1
        if attempt > MAX_ATTEMPTS:
            return action, attempt, f'已經生滿 {MAX_ATTEMPTS} 次，不再生'
        (SOURCE / f'{action}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{action}.try{attempt}.png'
    text = prompt_for(action) + (f' {extra_note}' if extra_note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{SHEET[0]}x{SHEET[1]}', '--quality', 'high',
               '--prompt', text, '--image', str(REF / 'feifei_idle_frame1.png'),
               '--image', str(REF / f'{action}_old.png'), '--out', str(target), '--force']
    started = time.time()
    status = ''
    # 限流或連線失敗不算一次生圖（沒有產出圖）：等一下再試，最多等 6 輪
    for wait in (0, 60, 120, 180, 240, 300):
        if wait:
            time.sleep(wait)
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-400:]}'
    (SOURCE / f'{action}.try{attempt}.pending').unlink(missing_ok=True)
    record_prompt(action, attempt, text, status)
    return action, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    p = sub.add_parser('prompt')
    p.add_argument('action', choices=ACTIONS)
    g = sub.add_parser('gen')
    g.add_argument('actions', nargs='+', choices=ACTIONS)
    g.add_argument('--jobs', dest='workers', type=int, default=3)
    g.add_argument('--note', default='', help='重生時補在提示詞最後的修正說明')
    k = sub.add_parser('pick')
    k.add_argument('action', choices=ACTIONS)
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'prompt':
        print(prompt_for(args.action))
    elif args.command == 'pick':
        chosen = SOURCE / f'{args.action}.try{args.attempt}.png'
        (SOURCE / f'{args.action}.png').write_bytes(chosen.read_bytes())
        data = json.loads(CONFIG.read_text(encoding='utf-8')) if CONFIG.exists() else {'actions': {}}
        data['actions'].setdefault(args.action, {})['attempt'] = args.attempt
        CONFIG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{args.action} 採用第 {args.attempt} 次')
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for action, attempt, status in pool.map(lambda a: generate(a, args.note), args.actions):
                print(f'{action} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
