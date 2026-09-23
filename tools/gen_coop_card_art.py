"""連線牌的混搭牌面（2026-09-23，批次 coopcards；美術盤點 C4，主控裁決「對稱構圖、程式不動」）。

連線兩位不同角色時，互助牌的牌面要畫**這兩位**（`assets.ts` 的 `cardArtKey` 先找
`card/coop_<排序過的兩位>_<牌>`，沒有才退回自己那張「兩隻一樣的我」）。33 張連線牌裡原本只有
「分你一半」「一起喘口氣」兩張有，這一批補其餘 31 張、共 159 張：
  - 四位都拿得到的 22 張 × 六組；
  - 只有球球拿得到的 3 張、只有菲菲的 2 張、只有封封的 4 張 × 各自跟另外三位的 3 組。

**對稱構圖**：鍵是排序過的兩位，不分誰出牌、誰被幫，同一張圖兩個席位都會看到。
所以每張都畫成「兩位一起做這件事」（一起撐盾、互相遞、同時出手），不畫「左邊幫右邊」——
單人版牌面那種寫死誰幫誰的畫法，換到混搭局會有一半的時候方向剛好相反。

做法：gpt-image-1.5（codex-oauth）、透明背景，每張附兩張參考圖：
① 這張牌現有的牌面（顏色、特效、畫法照它；姿勢照下面的敘述，不照它）；
② 角色表＝這兩位的新版待機第 1 格（`gen_coop_story_art.cast_sheet`），長相照它。
`pick` 把主體（不透明度 >40 的外框）裁出來、等比縮進 299×240（同現有牌面）、四邊留 3 像素、置中，
存 webp（品質 78，同 `add_card_art.py`），清單 cards 那一段只插這一批的行、不整份重寫，
並把雜湊記進 `docs/coop-card-art.json`。

用法：
    python tools/gen_coop_card_art.py refs
    python tools/gen_coop_card_art.py list
    python tools/gen_coop_card_art.py gen all --jobs 4          # 已有原檔的跳過
    python tools/gen_coop_card_art.py gen dangdang_ninja_bangnisheme --note "..."
    python tools/gen_coop_card_art.py pick dangdang_ninja_bangnisheme 1
    python tools/gen_coop_card_art.py pickall                   # 每張採用最新一次
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_coop_story_art import IMAGE_GEN, LOOK, cast_sheet, white  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/coopcards'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
CARDS_DIR = ROOT / 'public/assets/cards/card'
MANIFEST = ROOT / 'public/assets/manifest.json'
RECORD = ROOT / 'docs/coop-card-art.json'
OUT_SIZE = (299, 240)
MARGIN = 3
HEROES = ('ninja', 'feifei', 'dangdang', 'fengfeng')
WHO = {'ninja': 'qiuqiu', 'feifei': 'feifei', 'dangdang': 'dangdang', 'fengfeng': 'fengfeng'}
NAME = {'ninja': 'QIUQIU', 'feifei': 'FEIFEI', 'dangdang': 'DANGDANG', 'fengfeng': 'FENGFENG'}
WEAPON = {
    'ninja': 'QIUQIU fights with his paws and claws (sometimes a shuriken)',
    'feifei': 'FEIFEI fights with thin gold needles',
    'dangdang': 'DANGDANG fights with his fists and copper bracers',
    'fengfeng': 'FENGFENG fights with his straight jian sword',
}
ALL = HEROES

# 牌面鍵（去掉 card/）→ (誰拿得到, 參考牌面的檔名, 主色, 兩位一起在做什麼)
# 主色照現有牌面（縮到 150 像素寬時先認顏色）；敘述一律寫成兩位對等、互相，不寫誰幫誰。
CARDS: dict[str, tuple[tuple[str, ...], str, str, str]] = {
    'ninaqudang': (ALL, 'ninaqudang', 'BRIGHT CYAN',
        'both cats hold up ONE big glowing cyan shield-orb together, each with a paw pressed on it, sheltering '
        'shoulder to shoulder behind it.'),
    'nixianduo': (('ninja',), 'nixianduo', 'SMOKY VIOLET',
        'both cats crouch together inside one big swirling violet smoke cloud, each holding a paw to its lips '
        '("shh"), both half-hidden by the smoke.'),
    'wolaidang': (ALL, 'wolaidang', 'ALARM RED',
        'both cats stand shoulder to shoulder at the front, chests out and arms spread wide, taunting; bold red '
        'target lines converge on the two of them from both sides.'),
    'bangnisheme': (ALL, 'bangnisheme', 'FIERY ORANGE',
        'both cats punch forward together side by side, their two fists touching, one fiery orange claw burst '
        'wrapping both fists.'),
    'jienicailiangbu': (ALL, 'jienicailiangbu', 'PALE LIME GREEN',
        'both cats leap upward side by side, each stepping on a trail of glowing pale-green paw-print clouds.'),
    'niyechouyizhang': (ALL, 'niyechouyizhang', 'WARM CREAM-GOLD',
        'the two cats flick a card to each other at the same moment - two cream-gold cards cross in mid-air '
        'between them, each cat reaching to catch the other\'s card.'),
    'wobangnipaidiao': (ALL, 'wobangnipaidiao', 'SICKLY PURPLE',
        'the two cats slap sticky purple goo off each other\'s shoulders at the same time, purple splashes '
        'flying outward on both sides; both look relieved.'),
    'fantuanfenni': (ALL, 'fantuanfenni', 'WHITE AND GOLD',
        'the two cats hold ONE big white rice ball between them and break it into two halves together, '
        'golden sparkles bursting from the break, both smiling.'),
    'bangnidianyixia': (ALL, 'bangnidianyixia', 'WARM AMBER',
        'both cats brace side by side behind one big amber hexagonal shield-plate that they hold up together, '
        'and both strike outward past its edges with their free paws in an amber-yellow burst.'),
    'shoujiewoyixia': (ALL, 'shoujiewoyixia', 'SOFT MINT GREEN',
        'the two cats sit facing each other and each winds a mint-green healing bandage around the other\'s '
        'raised forepaw at the same time.'),
    'yuganjijiu': (ALL, 'yuganjijiu', 'HEALING PINK',
        'the two cats sit side by side sharing one dried fish, each holding an end, a big glowing pink healing '
        'heart rising above both of them.'),
    'huannieduochoudian': (ALL, 'huannieduochoudian', 'BRIGHT TEAL',
        'the two cats swap cards: a loop of teal cards swirls between them, flying from each cat\'s paw to the '
        'other, both reaching out to catch.'),
    'wobangnishouwei': (ALL, 'wobangnishouwei', 'DEEP CRIMSON',
        'both cats slam one finishing blow downward together, their two paws side by side trailing one crimson '
        'slash that bursts at the bottom of the frame.'),
    'huannimangyixia': (ALL, 'huannimangyixia', 'GOLDEN YELLOW',
        'the two cats sit cross-legged back to back taking a breather, relaxed, while golden cards and a golden '
        'rice ball float in a circle around both of them.'),
    'genzhewoduohao': (('ninja',), 'genzhewoduohao', 'SMOKY VIOLET',
        'the two cats hold paws and dive together into a diagonal swirl of violet smoke, both starting to fade '
        'at the edges.'),
    'kaoniyixia': (ALL, 'kaoniyixia', 'PALE ICE BLUE',
        'one tall pale-blue crystal shield wall stands in the middle; the two cats lean their backs against it '
        'from either side, arms folded, sharing its cover.'),
    'zhexienixianchi': (ALL, 'zhexienixianchi', 'GOLDEN YELLOW',
        'the two cats politely push golden rice balls toward each other at the same time ("you first"), both '
        'offering, paws full of golden rice balls.'),
    'zhaonishuodeda': (ALL, 'zhaonishuodeda', 'ACID GREEN',
        'both cats point and strike in the same direction together, one acid-green slash trailing from both of '
        'their paws.'),
    'jienideliqi': (ALL, 'jienideliqi', 'BURNT ORANGE',
        'the two cats punch forward together with their fists pressed side by side; burnt-orange power lines '
        'flow between their arms and burst out as one combined fiery fist.'),
    'chenxianzaichushou': (ALL, 'chenxianzaichushou', 'BRIGHT GOLD-YELLOW',
        'the two cats leap in from the two sides and strike at the same moment, their paws meeting in the '
        'centre in one gold-yellow star burst.'),
    'biezhanzaishenshang': (ALL, 'biezhanzaishenshang', 'SICKLY PURPLE',
        'the two cats pull one long clinging strand of sickly-purple slime off both of them together and fling '
        'it away out of the frame with a combined swipe.'),
    'xianbangniliuzhe': (ALL, 'xianbangniliuzhe', 'PALE ICE BLUE',
        'each cat holds one half of a pale-blue round shield disc, and they press the two halves together to '
        'make one whole shield between them.'),
    'nimangwobuwei': (ALL, 'nimangwobuwei', 'BRIGHT TEAL',
        'the two cats stand back to back, each holding a scroll in one paw and a glowing teal card in the other, '
        'glancing at each other over their shoulders.'),
    'fantuanliuyikou': (ALL, 'fantuanliuyikou', 'GOLDEN YELLOW',
        'the two cats hold one golden rice ball between them that has one small bite taken out of each side, '
        'both happy and saving the rest.'),
    'youwozaiqianmian': (('ninja',), 'youwozaiqianmian', 'WARM GOLD',
        'both cats stand side by side at the front with their arms thrust forward, one wide golden crescent '
        'shield-glow spreading from all four paws in front of them.'),
    'biepengzhenjian': (('feifei',), 'feifei_biepengzhenjian', 'SICKLY GREEN',
        'the two cats carefully dip slim dart tips into one small pot of glowing sickly-green paste together, '
        'eyes wide, paws steady, not touching the tips.'),
    'woyouxianbeihao': (('feifei',), 'feifei_woyouxianbeihao', 'SICKLY GREEN',
        'the two cats stand ready side by side, small green vials lined up on their belts, a green shimmer ring '
        'rising around BOTH of them at once.'),
    'fengfeng_youbian': (('fengfeng',), 'fengfeng_youbian', 'WARM GOLD',
        'the two cats dash forward together in a pincer, one from the left and one from the right, each '
        'attacking with its own weapon, gold speed streaks trailing behind both.'),
    'fengfeng_jiewo': (('fengfeng',), 'fengfeng_jiewo', 'STEEL BLUE',
        'the two cats crouch shoulder to shoulder behind one big round wooden shield that they hold up '
        'together, steel-blue qi swirls gathering around both.'),
    'fengfeng_husong': (('fengfeng',), 'fengfeng_husong', 'SOFT SKY BLUE',
        'the two cats walk forward side by side, each with an arm around the other\'s shoulder, one soft '
        'sky-blue protective aura around both of them.'),
    'fengfeng_yiqichushou': (('fengfeng',), 'fengfeng_yiqichushou', 'ORANGE-GOLD',
        'the two cats lunge forward together in the same direction, their weapons thrust side by side, one '
        'combined orange-gold streak ahead of them.'),
}

_LOCK = threading.Lock()


def pairs_for(holders: tuple[str, ...]) -> list[tuple[str, str]]:
    """拿得到這張牌的人 × 另外三位，排序過（`cardArtKey` 的鍵就是排序過的兩位）"""
    out: list[tuple[str, str]] = []
    for a in holders:
        for b in HEROES:
            if a != b:
                p = tuple(sorted((a, b)))
                if p not in out:
                    out.append(p)   # type: ignore[arg-type]
    return out   # type: ignore[return-value]


def jobs() -> dict[str, tuple[str, str, str]]:
    """工作名 `<甲>_<乙>_<牌面鍵>` → (甲, 乙, 牌面鍵)，照 CARDS 的順序"""
    out: dict[str, tuple[str, str, str]] = {}
    for base, (holders, _, _, _) in CARDS.items():
        for a, b in pairs_for(holders):
            out[f'{a}_{b}_{base}'] = (a, b, base)
    return out


def mixed_key(a: str, b: str, base: str) -> str:
    return f'card/coop_{a}_{b}_{base}'


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for base, (_, ref, _, _) in CARDS.items():
        white(Image.open(CARDS_DIR / f'{ref}.webp')).convert('RGB').save(REF / f'card_{base}.png')
    for a in HEROES:
        for b in HEROES:
            if a < b:
                white(cast_sheet([WHO[a], WHO[b]])).convert('RGB').save(REF / f'cast_{a}_{b}.png')
    print(f'參考圖已輸出到 {REF}')


def prompt_for(name: str) -> str:
    a, b, base = jobs()[name]
    _, _, colour, doing = CARDS[base]
    return (
        'A cartoon illustration for a card game, landscape composition, showing TWO DIFFERENT cats together: '
        f'{NAME[a]} on the LEFT and {NAME[b]} on the RIGHT. '
        f'The two cats: {LOOK[WHO[a]]}; {LOOK[WHO[b]]}. '
        'Reference image 1 is the existing card picture for this card: copy its colour, its effect and its '
        'drawing style (thick black outlines, flat colours with subtle soft gradients, cute chibi cats with big '
        'round heads, large round eyes, tiny muzzles, short chubby bodies). Do NOT copy its cats or its pose. '
        'Reference image 2 is the character sheet: copy each cat\'s face, markings, outfit and colours EXACTLY. '
        f'{WEAPON[a]}; {WEAPON[b]}. '
        f'WHAT IS HAPPENING (the two cats are equal partners - neither is the helper or the one being helped): '
        f'{doing} '
        f'The dominant colour of the picture is {colour}; the shared effect should be the loudest thing in the '
        'frame so the card reads from its colour alone at thumbnail size. '
        'Draw BOTH cats big, overlapping, filling the frame edge to edge; both faces must read clearly when the '
        'picture is shrunk to 150 pixels wide. Each cat appears exactly once. '
        'Transparent background. Draw everything solid and opaque. No ground, no shadow, no text, no letters, '
        'no numbers, no watermark, no border, no panel or backdrop behind the cats.'
    )


def record(path: Path, key: str, entry: dict) -> None:
    with _LOCK:
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        data.setdefault(key, []).append(entry)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(name: str, note: str = '') -> tuple[str, int, str]:
    a, b, base = jobs()[name]
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1536x1024', '--quality', 'high', '--prompt', text,
               '--image', str(REF / f'card_{base}.png'), '--image', str(REF / f'cast_{a}_{b}.png'),
               '--out', str(target), '--force']
    started = time.time()
    status = 'failed'
    for _ in range(6):
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
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def fit(image: Image.Image) -> Image.Image:
    """主體（不透明度 >40）裁出來、等比縮進 299×240、四邊留 3 像素、置中"""
    rgba = image.convert('RGBA')
    box = rgba.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
    if box is None:
        raise SystemExit('整張都是透明的')
    rgba = rgba.crop(box)
    scale = min((OUT_SIZE[0] - 2 * MARGIN) / rgba.width, (OUT_SIZE[1] - 2 * MARGIN) / rgba.height)
    rgba = rgba.resize((max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', OUT_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(rgba, ((OUT_SIZE[0] - rgba.width) // 2, (OUT_SIZE[1] - rgba.height) // 2))
    return canvas


def add_manifest(keys: list[str]) -> None:
    """清單 cards 那一段補上這一批的鍵，**不整份重寫**：這一批的行先拿掉，再照 `jobs()` 的順序
    一起插回封封那組混搭牌最後一行（`card/coop_dangdang_fengfeng_yiqichuankou`）後面。"""
    raw = MANIFEST.read_bytes().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    data = json.loads(raw)
    all_keys = [mixed_key(*j) for j in jobs().values()]
    want = [k for k in all_keys if k in data['cards'] or k in keys]
    mine = tuple(f'"{k}"' for k in all_keys)
    raw = nl.join(line for line in raw.split(nl) if not line.strip().startswith(mine))
    key0 = 'card/coop_dangdang_fengfeng_yiqichuankou'
    anchor = f'"{key0}": "assets/cards/{key0}.webp"'
    at = raw.index(anchor) + len(anchor)
    lines = ''.join(f',{nl}    "{k}": "assets/cards/{k}.webp"' for k in want)
    raw = raw[:at] + lines + raw[at:]
    json.loads(raw)
    MANIFEST.write_bytes(raw.encode('utf-8'))


def write_record(picks: dict) -> None:
    rows = []
    for name, (a, b, base) in jobs().items():
        if name not in picks:
            continue
        key = mixed_key(a, b, base)
        path = ROOT / 'public/assets/cards' / f'{key}.webp'
        rows.append({'key': key, 'path': f'assets/cards/{key}.webp', 'pair': [a, b], 'card': f'card/{base}',
                     'attempt': picks[name]['attempt'],
                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    RECORD.write_text(json.dumps({'note': '連線牌混搭牌面（tools/gen_coop_card_art.py，2026-09-23 批次 coopcards）',
                                  'assets': rows}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def pick(name: str, attempt: int, update_manifest: bool = True) -> None:
    a, b, base = jobs()[name]
    src = SOURCE / f'{name}.try{attempt}.png'
    key = mixed_key(a, b, base)
    out = ROOT / 'public/assets/cards' / f'{key}.webp'
    fit(Image.open(src)).save(out, 'WEBP', quality=78, method=6)
    picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
    picks[name] = {'attempt': attempt, 'bytes': out.stat().st_size, 'at': time.strftime('%Y-%m-%d %H:%M:%S')}
    PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if update_manifest:
        add_manifest([key])
        write_record(picks)
    print(f'{name} 採用第 {attempt} 次（{out.stat().st_size // 1024} KB）')


def latest(name: str) -> int | None:
    tries = [int(p.stem.rsplit('try', 1)[1]) for p in SOURCE.glob(f'{name}.try*.png')]
    return max(tries) if tries else None


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    sub.add_parser('list')
    sub.add_parser('pickall')
    g = sub.add_parser('gen')
    g.add_argument('names', nargs='+')
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('name')
    k.add_argument('attempt', type=int)
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'list':
        for name in jobs():
            print(name)
        print(f'共 {len(jobs())} 張')
    elif args.command == 'pick':
        pick(args.name, args.attempt)
    elif args.command == 'pickall':
        keys = []
        for name, (a, b, base) in jobs().items():
            n = latest(name)
            if n is not None:
                pick(name, n, update_manifest=False)
                keys.append(mixed_key(a, b, base))
        add_manifest(keys)
        write_record(json.loads(PICKS.read_text(encoding='utf-8')))
    else:
        if args.names == ['all']:
            names = [n for n in jobs() if latest(n) is None]   # 已有原檔的不重生
        else:
            names = args.names
        unknown = [n for n in names if n not in jobs()]
        if unknown:
            raise SystemExit(f'沒有這幾張：{unknown}')
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, attempt, status in pool.map(lambda n: generate(n, args.note), names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
