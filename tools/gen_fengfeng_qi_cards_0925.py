"""封封補三張「花蓄氣打傷害」的攻擊牌（2026-09-25 使用者：「攻擊牌應該要多加一點消耗蓄氣打傷害的」）的牌面。

| 牌號 | 牌 | 畫面要講的事 |
|---|---|---|
| fengfeng_shunjian | 順手一劍（常見 0 費） | 走著走著順手一劍，輕鬆、不費力 |
| fengfeng_sanlian  | 連環三劍（常見 1 費） | 一口氣連刺三下，三道劍光 |
| fengfeng_yikouqi  | 一口氣（罕見 1 費） | 把存著的氣一口吐盡，一記超大劍光 |

做法照連線混搭牌那一批（`gen_coop_card_art.py`）：gpt-image-1.5（codex-oauth）、真透明背景，每張附兩張參考圖——
① 一張現有的封封牌面（畫法、劍光顏色照它，姿勢不照）；② 角色表＝封封新版待機第 1 格（`cast_sheet`，長相照它）。
封封現有的牌面都是「只有他一隻＋劍光、透明底」，不是菲菲那種「大物件＋貓」的版型，這三張跟著封封自己那組走。
`pick` 把主體裁出來、等比縮進 299×240、四邊留 3 像素、置中，存 webp（品質 78），
清單 cards 那一段只在 `card/fengfeng_yiqichushou` 後面插這三行、不整份重寫。

用法：
    python tools/gen_fengfeng_qi_cards_0925.py refs
    python tools/gen_fengfeng_qi_cards_0925.py gen all
    python tools/gen_fengfeng_qi_cards_0925.py gen fengfeng_sanlian --note "..."
    python tools/gen_fengfeng_qi_cards_0925.py pick fengfeng_sanlian 2
**牌號別取成 `fengfeng_<共用牌號>`**：那是封封版共用牌的牌面（`assets.ts` 查圖先找它）。一開始取的 fengfeng_shunshou、
fengfeng_lianhuan 剛好是「順手牽羊」「連環踢」的封封版，pick 下去會蓋掉那兩張——所以 `pick` 遇到檔案已經在就停。
原檔在 tools/motion-art-source/fengfeng_qi_0925/（圖不進版控、prompts.json 進，同事件圖重生那批）。
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_coop_card_art import fit  # noqa: E402
from gen_coop_story_art import IMAGE_GEN, LOOK, cast_sheet, white  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/fengfeng_qi_0925'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
CARDS_DIR = ROOT / 'public/assets/cards/card'
MANIFEST = ROOT / 'public/assets/manifest.json'
ANCHOR = 'card/fengfeng_yiqichushou'
_LOCK = threading.Lock()   # 三張平行生圖，prompts.json 的讀改寫要排隊（推前審查二 低-4）

# 牌號 → (參考牌面, 主色, 他在做什麼)
CARDS: dict[str, tuple[str, str, str]] = {
    'fengfeng_shunjian': ('fengfeng_huibu', 'PALE IVORY-GOLD',
        'he is WALKING casually from left to right, mid-step, and without breaking stride flicks his drawn jian '
        'sword out ahead of him in ONE quick, light, ONE-PAWED slash; a single slim ivory-gold crescent streak '
        'trails the blade tip. His other paw hangs relaxed at his side. His face is calm with a small easy '
        'half-smile and his eyes glance at the slash sideways - effortless, like swatting a fly. No strain, no '
        'deep stance, no big wind-up.'),
    'fengfeng_sanlian': ('fengfeng_shuangduan', 'BRIGHT GOLD',
        'strict side view facing RIGHT, he is in a low forward lunge thrusting his jian with both paws on the grip, '
        'striking THREE TIMES in a rapid blur: exactly THREE separate short curved golden slash arcs are stacked '
        'in front of the blade tip (one high, one middle, one low), and two faint semi-solid afterimages of the '
        'blade show the consecutive strikes. Focused, determined eyes. Count the golden arcs: exactly three.'),
    'fengfeng_yikouqi': ('fengfeng_duanliu', 'BLAZING IVORY-GOLD',
        'he releases ALL of his stored breath at once in ONE enormous two-pawed diagonal slash from upper left to '
        'lower right, in a deep wide stance; his cheeks are slightly puffed and his mouth is open as he exhales '
        'hard, a few pale gold wisps of breath streaming from his mouth into the blade. His eyes are wide and '
        'fierce. A HUGE, thick ivory-gold crescent of sword-energy sweeps across almost the whole picture - by far '
        'the biggest and brightest effect of all his cards - but it must NOT cover his face, paws or sword.'),
}


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for name, (ref, _, _) in CARDS.items():
        white(Image.open(CARDS_DIR / f'{ref}.webp')).convert('RGB').save(REF / f'card_{name}.png')
    white(cast_sheet(['fengfeng'])).convert('RGB').save(REF / 'cast_fengfeng.png')
    print(f'參考圖已輸出到 {REF}')


def prompt_for(name: str) -> str:
    _, colour, doing = CARDS[name]
    return (
        'A cartoon illustration for a card game, landscape composition, showing ONE cat swordsman: '
        f'{LOOK["fengfeng"]}. In THIS picture his straight jian sword is DRAWN and in his paws; the empty dark '
        'brown scabbard stays at his waist. '
        'Reference image 1 is an existing card picture of him: copy its drawing style, its line weight and the look '
        'of its sword-energy effect (thick black outlines, flat colours with subtle soft gradients, cute chibi cat '
        'with a big round head, large round eyes, a tiny muzzle, a short compact body). Do NOT copy its pose. '
        'Reference image 2 is his character sheet: copy his face, orange-and-cream tabby markings, red scarf, red '
        'sleeveless vest over cream sleeves, dark trousers, brown sash and sword EXACTLY. '
        f'WHAT IS HAPPENING: {doing} '
        f'The dominant colour of the effect is {colour}; the sword-energy effect should read at thumbnail size. '
        'Draw him BIG, filling the frame edge to edge; his face must read clearly when the picture is shrunk to '
        '150 pixels wide. Exactly ONE cat, exactly two arms, two legs, one tail, one sword. '
        'Transparent background. Draw everything solid and opaque. No ground, no shadow, no enemy, no text, '
        'no letters, no numbers, no watermark, no border, no panel or backdrop behind him.'
    )


def generate(name: str, note: str = '') -> str:
    attempt = 1
    while (SOURCE / f'{name}.try{attempt}.png').exists():
        attempt += 1
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1536x1024', '--quality', 'high', '--prompt', text,
               '--image', str(REF / f'card_{name}.png'), '--image', str(REF / 'cast_fengfeng.png'),
               '--out', str(target), '--force']
    started = time.time()
    status = 'failed'
    for _ in range(6):
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-300:]}'
        if 'at capacity' not in result.stderr:
            break
        time.sleep(30)
    record(name, {'attempt': attempt, 'status': status, 'prompt': text, 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return f'{name} 第 {attempt} 次：{status}（{time.time() - started:.0f} 秒）'


def record(name: str, entry: dict) -> None:
    with _LOCK:
        data = json.loads(PROMPTS.read_text(encoding='utf-8')) if PROMPTS.exists() else {}
        data.setdefault(name, []).append(entry)
        PROMPTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def shared_card_ids() -> set[str]:
    """共用牌的牌號（沒有 hero 的那些）：`fengfeng_<它>` 是封封版共用牌的圖，新牌不能取這個名字"""
    text = (ROOT / 'src/content/cards.ts').read_text(encoding='utf-8')
    return {m.group(1) for m in re.finditer(r"\{ id: '([a-z0-9_]+)'(?:(?!\n  \{).)*?", text, re.S)} - {
        m.group(1) for m in re.finditer(r"\{ id: '([a-z0-9_]+)'[^\n]*hero: '", text)}


def add_manifest(key: str) -> None:
    """清單 cards 那一段補這一行，不整份重寫：已經有就不動，沒有就插在封封那組最後一行後面"""
    raw = MANIFEST.read_bytes().decode('utf-8')
    if f'"{key}"' in raw:
        return
    nl = '\r\n' if '\r\n' in raw else '\n'
    anchor = f'"{ANCHOR}": "assets/cards/{ANCHOR}.webp"'
    at = raw.index(anchor) + len(anchor)
    raw = raw[:at] + f',{nl}    "{key}": "assets/cards/{key}.webp"' + raw[at:]
    json.loads(raw)
    MANIFEST.write_bytes(raw.encode('utf-8'))


def pick(name: str, attempt: int) -> None:
    out = CARDS_DIR / f'{name}.webp'
    if name.startswith('fengfeng_') and name[len('fengfeng_'):] in shared_card_ids():
        raise SystemExit(f'{name} 跟共用牌「{name[len("fengfeng_"):]}」的封封版圖同名，換一個牌號')
    if out.exists() and not (SOURCE / f'{name}.picked').exists():
        raise SystemExit(f'{out.name} 已經有了（可能是別張牌的圖），不蓋；確定是這張的重選就先建 {name}.picked')
    fit(Image.open(SOURCE / f'{name}.try{attempt}.png')).save(out, 'WEBP', quality=78, method=6)
    add_manifest(f'card/{name}')
    (SOURCE / f'{name}.picked').write_text(str(attempt), encoding='utf-8')
    record(name, {'picked': attempt, 'at': time.strftime('%Y-%m-%d %H:%M:%S')})   # 選定紀錄進版控（.picked 只是本機記號）
    print(f'{name} 採用第 {attempt} 次（{out.stat().st_size // 1024} KB）')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    g = sub.add_parser('gen')
    g.add_argument('names', nargs='+')
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('name')
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    SOURCE.mkdir(parents=True, exist_ok=True)
    if args.command == 'refs':
        refs()
    elif args.command == 'gen':
        names = list(CARDS) if args.names == ['all'] else args.names
        with ThreadPoolExecutor(max_workers=3) as pool:
            for line in pool.map(lambda n: generate(n, args.note), names):
                print(line, flush=True)
    else:
        pick(args.name, args.attempt)


if __name__ == '__main__':
    main()
