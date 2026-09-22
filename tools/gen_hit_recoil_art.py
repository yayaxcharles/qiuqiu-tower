"""挨打那一下的新畫風立繪（2026-09-22）。

背景：四隻貓的逐格動作都換成新畫風了，只剩挨打（`hurt`）還借舊版靜態立繪
（`assets/sprites/hero/<代號>_hit.webp`，停 0.65 秒；09-20 依使用者「挨打看不清楚」刻意改的）。
這支只換圖、不動停留時間：每隻貓生一張**單一全身、面向右、真透明**的挨打姿勢。

每一張附兩張參考圖（`refs` 子指令產生，放在 `_ref/`，白底）：
  ① 新版待機第 1 格，照「角色站高 60% 畫布、腳底在 92%、左右置中」擺好——長相、頭身比、畫風、
     朝向、大小一律以它為準（新圖也照同一個版面畫，打包時才能直接換算成遊戲大小）；
  ② 使用者 09-22 拿到的設定圖 `<角色>_poses.png` 第 3 格「HIT RECOIL」——只取「挨打時身體怎麼反應」，
     正面視角、比例、畫風都不照抄。那張是白底帶字，**只能當參考、不能拿來去背**（白毛會被吃掉）。

生圖後端跟待機狀態那支一樣：`~/.codex/skills/codex-ppt/scripts/image_gen.py edit --backend codex-oauth
--model gpt-image-1.5 --background transparent`（直接出真透明）。

用法：
    python tools/gen_hit_recoil_art.py refs
    python tools/gen_hit_recoil_art.py prompt feifei
    python tools/gen_hit_recoil_art.py gen qiuqiu feifei dangdang fengfeng --jobs 4
    python tools/gen_hit_recoil_art.py gen feifei --note "修正說明"      # 重生時補在提示詞最後
    python tools/gen_hit_recoil_art.py pick feifei 2                    # 選定第 2 次的結果當正式來源
每一次生圖都存成 `<角色>.try<N>.png`（不覆蓋），檢查過才用 `pick` 複製成 `<角色>.png`，
再交給 `tools/pack_hit_recoil_motion.py` 打包。同一張最多重生 3 次。
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

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_idle_state_art import IDLE_DATA, IMAGE_GEN, LOOK  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/hit-recoil'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
# 設定圖不進版控（`tools/art_inbox/` 整個被忽略），分支副本裡沒有就去主資料夾讀（只讀）
MODEL_SHEETS = next((p for p in (ROOT / 'tools/art_inbox/hero_model_sheets_20260922',
                                 ROOT.parent / 'qiuqiu-coop/tools/art_inbox/hero_model_sheets_20260922')
                     if p.exists()), ROOT / 'tools/art_inbox/hero_model_sheets_20260922')
CANVAS = 1024                 # 單一姿勢用正方形；gpt-image-1.5 支援 1024×1024
CHAR_HEIGHT = .60             # 參考圖裡新版待機的站高佔畫布高的比例（新圖照這個比例畫）
BASELINE = .92                # 腳底基準線（跟待機狀態那批同一個規矩）
HEROES = ('qiuqiu', 'feifei', 'dangdang', 'fengfeng')

# 角色專屬的補充：設定上不能違反的地方
EXTRA = {
    'qiuqiu': 'The navy headband tails and the striped tail whip forward with the impact.',
    'feifei': 'Her ponytail and purple bow whip forward with the impact; the gold needle tubes stay at the belt.',
    'dangdang': 'Both copper forearm bracers stay clearly visible on his forearms.',
    'fengfeng': 'The jian sword stays SHEATHED in its dark-brown scabbard at the waist (never drawn, never '
                'dropped); the red scarf whips with the impact.',
}


def look(hero: str) -> str:
    # 球球那段外觀描述後半是給 8 格待機表用的（「第 1 格要照寬架式」），單張挨打圖用不到
    return LOOK[hero].split('. His idle')[0]


def prompt_for(hero: str) -> str:
    return (
        f'Create ONE production-ready transparent game sprite of {look(hero)}. '
        "Reference image 1 is this character's CURRENT in-game idle frame: copy the face, head size, body "
        'proportions, outfit, colours, clean dark hand-drawn contours and soft cel shading EXACTLY from it, and keep '
        'the SAME camera: the same three-quarter side view with the character FACING RIGHT, the SAME character '
        'scale (about 60% of the canvas height), the soles on the SAME ground line at 92% of the canvas height, '
        'body centred horizontally. Reference image 2 is a model-sheet HIT RECOIL pose of the same character: use '
        'it ONLY as the idea of how the body reacts to the blow; do NOT copy its front view, proportions or '
        'painting style, and do NOT copy any text. '
        'New asset: HIT RECOIL, the instant the cat is struck hard by an enemy standing to the RIGHT. The cat '
        'still faces right toward the attacker but is knocked backwards: the head and upper body snap back to the '
        'LEFT with the chin jolted up, both arms flung out loosely, knees bent to absorb the blow, BOTH feet still '
        'planted on the ground line (a little wider apart than in the idle). The face must clearly read as PAIN '
        'even at small size: eyes squeezed tightly shut or squinting in pain, teeth gritted in a grimace, ears '
        f'pinned back. {EXTRA[hero]} Leaning back but NOT falling, NOT lying down, NOT airborne, NOT sitting, '
        'NOT turned away. Exactly one full-body character, fully inside the canvas with generous transparent '
        'margins (at least 8% of the canvas on every side) so ears, tail, paws and cloth tails are fully visible. '
        'Truly transparent RGBA background: no checkerboard drawing, no white or coloured background, no floor, '
        'no ground shadow, no glow, no impact stars, no motion lines, no sweat drops, no text, no labels, no '
        'borders. No blood. A freshly drawn whole character with natural joints; no paper-cut limbs, no extra '
        'characters.'
    )


def idle_ref(hero: str) -> Image.Image:
    """新版待機第 1 格，照 60% 站高、腳底 92%、左右以腳底定位點置中，鋪白底。"""
    data = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    frame = data['frames'][0]
    x, y, w, h = frame['rect']
    texture = Image.open(ROOT / 'public' / data['texture']).convert('RGBA')
    k = CHAR_HEIGHT * CANVAS / h
    crop = texture.crop((x, y, x + w, y + h)).resize((round(w * k), round(h * k)), Image.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS, CANVAS), (255, 255, 255, 255))
    px = CANVAS / 2 - frame['pivot'][0] * k
    py = BASELINE * CANVAS - frame['pivot'][1] * k
    canvas.alpha_composite(crop, (round(px), round(py)))
    return canvas.convert('RGB')


def sheet_hit_ref(hero: str) -> Image.Image:
    """設定圖第 3 格（HIT RECOIL）：只取第一列第 3 欄的角色本體，底下的字不帶進來，鋪在白底正方形上。"""
    sheet = Image.open(MODEL_SHEETS / f'{hero}_poses.png').convert('RGB')
    width, height = sheet.size
    x0, x1 = round(width * 2 / 4), round(width * 3 / 4)
    y0, y1 = round(height * .05), round(height * .47)      # 標籤字在 0.49～0.52，擋在外面
    ink = np.array(sheet.crop((x0, y0, x1, y1))).min(axis=2) < 225
    labels, count = ndimage.label(ndimage.binary_dilation(ink, iterations=2))
    sizes = ndimage.sum(ink, labels, range(1, count + 1))
    ys, xs = np.nonzero(labels == int(np.argmax(sizes)) + 1)
    pad = 16
    box = (x0 + xs.min() - pad, y0 + ys.min() - pad, x0 + xs.max() + pad, y0 + ys.max() + pad)
    body = sheet.crop(box)
    k = CANVAS * .84 / max(body.size)
    body = body.resize((round(body.width * k), round(body.height * k)), Image.LANCZOS)
    canvas = Image.new('RGB', (CANVAS, CANVAS), (255, 255, 255))
    canvas.paste(body, ((CANVAS - body.width) // 2, (CANVAS - body.height) // 2))
    return canvas


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        idle_ref(hero).save(REF / f'{hero}_idle.png')
        sheet_hit_ref(hero).save(REF / f'{hero}_sheet_hit.png')
    print(f'參考圖已輸出到 {REF}')


_LOCK = threading.Lock()


def record_prompt(hero: str, attempt: int, text: str, status: str) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(hero, []).append({'attempt': attempt, 'status': status, 'prompt': text,
                                          'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(hero: str, extra_note: str = '') -> tuple[str, int, str]:
    SOURCE.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{hero}.try{attempt}.png').exists() or (SOURCE / f'{hero}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{hero}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{hero}.try{attempt}.png'
    text = prompt_for(hero) + (f' {extra_note}' if extra_note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', f'{CANVAS}x{CANVAS}', '--quality', 'high',
               '--prompt', text, '--image', str(REF / f'{hero}_idle.png'),
               '--image', str(REF / f'{hero}_sheet_hit.png'), '--out', str(target), '--force']
    started = time.time()
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    status = 'ok' if result.returncode == 0 and target.exists() else f'failed: {result.stderr.strip()[-400:]}'
    (SOURCE / f'{hero}.try{attempt}.pending').unlink(missing_ok=True)
    record_prompt(hero, attempt, text, status)
    return hero, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    p = sub.add_parser('prompt')
    p.add_argument('hero', choices=HEROES)
    g = sub.add_parser('gen')
    g.add_argument('heroes', nargs='+', choices=HEROES)
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='', help='重生時補在提示詞最後的修正說明')
    k = sub.add_parser('pick')
    k.add_argument('hero', choices=HEROES)
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'prompt':
        print(prompt_for(args.hero))
    elif args.command == 'pick':
        chosen = SOURCE / f'{args.hero}.try{args.attempt}.png'
        (SOURCE / f'{args.hero}.png').write_bytes(chosen.read_bytes())
        config = SOURCE / 'actions.json'
        data = json.loads(config.read_text(encoding='utf-8')) if config.exists() else {'heroes': {}}
        data['heroes'][args.hero] = {'attempt': args.attempt}
        config.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{args.hero} 採用第 {args.attempt} 次')
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for hero, attempt, status in pool.map(lambda h: generate(h, args.note), args.heroes):
                print(f'{hero} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
