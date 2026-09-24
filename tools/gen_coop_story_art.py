"""連線雙貓劇情幻燈片（2026-09-23，批次 coopstory；美術盤點 C3）。

連線兩位不同角色時，序章、兩次過關、結局演的是「兩個人共用的一整段場景」（`content/dialogue.ts` 的 `MIXED_SCENES`、
`content/fengfeng-dialogue.ts` 的 `fengfengCoopScenes`），可是單人版的劇情圖上只有一隻貓，
所以 `storyslides.ts` 一律退回純對白；只有封封三條路線 09-20 生了序章、塔頂、結局各一張。這一批補齊 24 張：
  - 球球＋菲菲、球球＋噹噹、噹噹＋菲菲：序章 2、第一關過關 1、第二關過關 1、結局 2（各 6 張）；
  - 封封＋球球／菲菲／噹噹：第一關過關 1、第二關過關 1（各 2 張）。
每張照那一段台詞畫（台詞原文貼在 `SCENES` 旁邊的註解，改稿時兩邊一起看）。

做法：gpt-image-1.5（codex-oauth），每張附兩張參考圖：
① 場景畫風＝同一類場景現成的劇情圖（封封連線序章、塔內樓梯、結局），光影、構圖密度、描線照它；
② 角色表＝這一張出場的貓各自的新版待機第 1 格（大俠貓用立繪 `boss/idle1`）排成一列、鋪白底，長相照它。
生圖端回來的尺寸不一定照要求：`pick` 一律從中間裁成 16:9、縮成 1280×720（舞台大小，同單人劇情圖），存 webp。
鍵名 `bg/<角色>_coop_<搭檔>_<段>`：跟封封那九張同一個樣子，`assets.ts` 的預載規則（`bg/<角色>_coop_` 點到才載）直接適用。

用法：
    python tools/gen_coop_story_art.py refs
    python tools/gen_coop_story_art.py list
    python tools/gen_coop_story_art.py gen feifei_coop_ninja_prologue1 ... --jobs 4
    python tools/gen_coop_story_art.py gen all --jobs 4
    python tools/gen_coop_story_art.py pick feifei_coop_ninja_prologue1 2
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
SOURCE = ROOT / 'tools/motion-art-source/coopstory'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
BG = ROOT / 'public/assets/bg'
MANIFEST = ROOT / 'public/assets/manifest.json'
OUT_SIZE = (1280, 720)

IDLE = {
    'qiuqiu': 'src/ui/qiuqiu-motion-data.json', 'feifei': 'src/ui/feifei-motion-data.json',
    'dangdang': 'src/ui/dangdang-motion-data.json', 'fengfeng': 'src/ui/fengfeng-motion-data.json',
}
LOOK = {
    'qiuqiu': ('QIUQIU (small young cream-white tabby cat with grey-brown stripes and three brown cheek stripes, big round '
               'head, black eyes, NAVY BLUE ninja gi and a NAVY headband with two long tails)'),
    'feifei': ('FEIFEI (young Siamese cat girl: cream fur with a dark-brown face mask, dark-brown ears, paws and tail, big '
               'BLUE eyes, dark-brown high ponytail tied with a PURPLE bow, magenta-purple gi, black scarf, a row of small '
               'gold needle tubes on her belt, carries a bamboo needle tube)'),
    'dangdang': ('DANGDANG (stout black-and-white tuxedo cat, white muzzle, chest and paws, AMBER eyes, teal-green '
                 'sleeveless martial vest with cream lapels, brown waist sash, two COPPER forearm bracers)'),
    'fengfeng': ('FENGFENG (compact orange tabby cat with cream muzzle and paws, amber eyes, red scarf, red sleeveless vest '
                 'over cream sleeves, dark trousers, brown sash, a straight jian sword SHEATHED at his waist)'),
    'master': ('the MASTER DAXIA CAT (tall adult grey tabby cat martial-arts master with a woven bamboo conical straw hat '
               'and an off-white robe with a dark belt; his eyes are normal and kind again)'),
}

# 場景畫風參考（public/assets/bg 底下的現成劇情圖）
# 球球、菲菲、噹噹三人的單人劇情圖是平塗描線那一派，封封的（含 09-20 那九張連線圖）是厚塗那一派：
# 前三組搭檔照單人劇情圖畫，封封三組的兩次過關照封封自己的劇情圖畫，跟同一條路線的序章、塔頂、結局一致。
STYLE = {
    'rush': 'still_rush', 'towerdoor': 'still_depart', 'gate': 'dangdang_still_gate', 'stairs': 'still_act1_stairs',
    'upper': 'dangdang_still_act2_voice', 'embrace': 'still_embrace', 'topgroup': 'dangdang_still_embrace',
    'ff_stairs': 'fengfeng_still_act1_stairs', 'ff_upper': 'fengfeng_still_act2_voice',
}

# 名稱 → (出場角色〔角色表由左到右〕, 場景畫風, 畫面)
SCENES: dict[str, tuple[list[str], str, str]] = {
    # ---- 球球＋菲菲（MIXED_SCENES['feifei+ninja']）----
    # 序章 1～2 句：魔塔冒出來那一夜，師父衝向塔頂，球球抓起頭巾就追；菲菲在後面喊他，抓起竹筒一路追。
    'feifei_coop_ninja_prologue1': (['qiuqiu', 'feifei'], 'rush',
        'Night outside the village: a sinister tower glows purple on the hill. QIUQIU sprints toward it in the '
        'foreground right, still tying on his navy headband as he runs; FEIFEI runs after him from the village gate on '
        'the left, clutching her bamboo needle tube, one paw raised, calling after him.'),
    # 序章 3～7 句：塔下，菲菲喘著說叫了他好幾次；球球說師父跑進去了不能停；她說一個人進去她更怕；他叫她跟在後面。
    'feifei_coop_ninja_prologue2': (['qiuqiu', 'feifei'], 'towerdoor',
        'At the foot of the glowing purple tower at night, by the big stone door: FEIFEI has just caught up, bent over '
        'catching her breath, worried; QIUQIU turns back toward her, determined, one paw pointing at the door and the '
        'other gesturing for her to stay behind him.'),
    # 第一關過關：關主倒下露出樓梯，球球衝上去頭巾勾到扶手扯出藍線；菲菲說回去幫他補，蹲下撿回射出去的針。
    'feifei_coop_ninja_act1': (['qiuqiu', 'feifei'], 'stairs',
        'Inside the tower at the foot of a torch-lit stone staircase: QIUQIU dashes up the first steps but his navy '
        'headband tail is snagged on the wooden banister, pulling out a thin blue thread; FEIFEI crouches on the floor '
        'below picking up her scattered, slightly bent needles, a loose blue thread in her other paw.'),
    # 第二關過關：塔頂傳來師父痛苦的吼聲，球球抬頭大喊；菲菲扶著牆，拉好口罩，兩人踏上最後一段樓梯。
    'feifei_coop_ninja_act2': (['qiuqiu', 'feifei'], 'upper',
        'A narrow upper stairwell lit by lanterns, dust falling from above: QIUQIU stands at the bottom of the last '
        'flight shouting up with both paws cupped to his mouth; FEIFEI beside him pulls her black scarf up over her nose '
        'like a mask, eyes worried, ready to follow him up.'),
    # 結局 1～5 句：最後一縷魔氣散去，師父眼裡紫光熄了；他蹲下一手抱住球球、一手把菲菲拉到身邊，兩人都哭了。
    'feifei_coop_ninja_victory1': (['master', 'qiuqiu', 'feifei'], 'embrace',
        'The tower top after the battle, the purple haze fading into morning light: the MASTER kneels down and hugs '
        'QIUQIU tightly with one arm while pulling FEIFEI close with the other; QIUQIU is crying happy tears, FEIFEI is '
        'wide-eyed with tears finally falling. A warm, emotional reunion.'),
    # 結局 6～12 句：三人帶著小魚乾回村；村口燈還亮著，噹噹拉開門閂，村貓端熱湯；菲菲替球球換濕掉的繃帶。
    'feifei_coop_ninja_victory2': (['master', 'qiuqiu', 'feifei', 'dangdang'], 'gate',
        'Evening at the village gate with glowing lanterns: DANGDANG holds the gate open and village cats come out with '
        'steaming bowls of soup; FEIFEI rebandages QIUQIU\'s paw as he holds it out obediently; the MASTER stands behind '
        'them carrying a bundle of dried fish.'),

    # ---- 球球＋噹噹（MIXED_SCENES['dangdang+ninja']）----
    # 序章 1～4 句：村口門剛關上，噹噹看見球球往魔塔跑；村貓接過門閂催他去；菲菲在門邊替受傷村貓包紮，叫住噹噹。
    'dangdang_coop_ninja_prologue1': (['dangdang', 'feifei', 'qiuqiu'], 'gate',
        'The village gate at dusk: DANGDANG hands the heavy wooden door bar to two village cats; beside the gate FEIFEI '
        'kneels bandaging injured village cats and looks up calling to DANGDANG; far in the background a tiny QIUQIU '
        'runs toward the purple-glowing tower on the hill.'),
    # 序章 5～7 句：塔下，球球蹲在台階前重綁跑鬆的頭巾；噹噹追到，說看見了，提醒他腳邊那塊磚鬆了。
    'dangdang_coop_ninja_prologue2': (['qiuqiu', 'dangdang'], 'towerdoor',
        'The stone steps at the foot of the purple-glowing tower: QIUQIU crouches on the steps retying his loosened navy '
        'headband; DANGDANG arrives beside him, pointing down at a loose cracked brick by QIUQIU\'s foot.'),
    # 第一關過關：球球在樓梯旁找到村裡的糧箱抱起來晃，掉出碎魚乾；噹噹叫他先放牆邊；球球的頭巾勾住扶手，噹噹替他解開。
    'dangdang_coop_ninja_act1': (['qiuqiu', 'dangdang'], 'stairs',
        'Inside the tower by the stairs: QIUQIU holds up an empty village food crate, shaking it so a few fish crumbs fall '
        'out, looking indignant; his headband tail is caught on the banister and DANGDANG calmly untangles the cloth '
        'with his big white paws.'),
    # 第二關過關：塔頂傳來低吼，球球跑到樓梯口扶著牆往上喊；上面只有拖動石塊的聲音；噹噹說我也聽見了，走。
    'dangdang_coop_ninja_act2': (['qiuqiu', 'dangdang'], 'upper',
        'An upper stairwell: QIUQIU leans on the wall at the bottom of the stairs shouting upward, worried; DANGDANG '
        'stands beside him listening, bracers raised, dust falling from the dark stairway above.'),
    # 結局 1～7 句：紫光散去，師父蹲下把球球抱進懷裡；噹噹卸下護臂坐在門檻上，手在抖；師父替噹噹揉手臂。
    'dangdang_coop_ninja_victory1': (['master', 'qiuqiu', 'dangdang'], 'embrace',
        'The tower top as the purple light fades: the MASTER kneels and hugs QIUQIU in his arms; DANGDANG sits on the '
        'stone threshold nearby with his copper bracers taken off beside him, his arm trembling, as QIUQIU passes him '
        'his tool bag.'),
    # 結局 8～12 句：村口燈還亮著，菲菲提著藥箱跑出來；球球和噹噹坐在門邊，大俠貓端了水。
    'dangdang_coop_ninja_victory2': (['master', 'qiuqiu', 'dangdang', 'feifei'], 'gate',
        'Evening at the lantern-lit village gate: FEIFEI runs out carrying a medicine box; QIUQIU and DANGDANG sit side by '
        'side on the step by the gate, the tool bag at DANGDANG\'s feet; the MASTER brings them a cup of water.'),

    # ---- 噹噹＋菲菲（MIXED_SCENES['dangdang+feifei']）----
    # 序章 1～4 句：第三天，菲菲背著行囊走到村口；噹噹剛裝好新門閂，把錘子交給村貓；兩人決定一起去。
    'dangdang_coop_feifei_prologue1': (['dangdang', 'feifei'], 'gate',
        'Morning at the village gate: DANGDANG has just fitted a new wooden door bar and hands his hammer to a village cat; '
        'FEIFEI arrives with a travel pack on her back, holding her bamboo needle tube, the purple-glowing tower in the '
        'distance.'),
    # 序章 5～7 句：噹噹調鬆菲菲竹筒的扣環還給她；兩人走過缺了一塊木板的橋，來到塔門前。
    'dangdang_coop_feifei_prologue2': (['dangdang', 'feifei'], 'towerdoor',
        'A rickety wooden bridge with one plank missing leading to the tower gate: DANGDANG hands FEIFEI back her bamboo '
        'needle tube after adjusting its clasp as they walk across together toward the looming tower door.'),
    # 第一關過關：兩人在糧箱後找到樓梯；菲菲在扶手取下一縷藍線（師兄的頭巾）；噹噹移開階梯上的空箱。
    'dangdang_coop_feifei_act1': (['feifei', 'dangdang'], 'stairs',
        'Inside the tower behind stacked food crates, a staircase: FEIFEI carefully picks a thin blue thread off the '
        'wooden banister; DANGDANG lifts an empty crate off the steps to clear the way.'),
    # 第二關過關：塔頂傳來吼聲，菲菲扶著牆抬頭；噹噹大喊大俠貓、球球；兩人一起跑上最後一段樓梯。
    'dangdang_coop_feifei_act2': (['feifei', 'dangdang'], 'upper',
        'An upper stairwell: FEIFEI steadies herself against the wall looking up, frightened; DANGDANG cups a paw to his '
        'mouth shouting upward; both are about to run up the last flight of stairs.'),
    # 結局 1～5 句：師父眼裡紫光退去，看向菲菲，伸手碰她的頭；球球扶著門框走過來，菲菲去扶他。
    'dangdang_coop_feifei_victory1': (['master', 'feifei', 'qiuqiu', 'dangdang'], 'topgroup',
        'The tower top as the purple light fades: the MASTER gently pats FEIFEI\'s head, his eyes kind again; QIUQIU, '
        'with a small bandage on his forehead, limps in holding the door frame and FEIFEI reaches to support him; '
        'DANGDANG leans against the wall in the background.'),
    # 結局 6～12 句：師父把兩個徒弟拉到身邊；噹噹靠牆，扣帶卡住，菲菲拿剪刀替他剪開，師父接住掉下來的銅護臂。
    'dangdang_coop_feifei_victory2': (['master', 'feifei', 'dangdang', 'qiuqiu'], 'topgroup',
        'On the tower top after the battle: FEIFEI carefully snips DANGDANG\'s stuck bracer strap with small scissors while he '
        'sits against the wall; the MASTER catches the falling copper bracer; QIUQIU sits close beside the MASTER.'),

    # ---- 封封三條路線的兩次過關（fengfengCoopScenes 的 actClear1、actClear2）----
    # 封封＋球球 過關 1：球球從空糧箱翻出碎魚乾；封封認出箱側貨號、查看拖痕；球球頭巾勾住扶手，封封替他解開。
    'fengfeng_coop_ninja_act1': (['qiuqiu', 'fengfeng'], 'ff_stairs',
        'Inside the tower by the stairs among empty merchant crates marked with a cart emblem: QIUQIU digs fish crumbs '
        'out of an empty crate, indignant; FENGFENG crouches studying drag marks leading to the stairs, one paw on the '
        'crate\'s painted mark.'),
    # 封封＋球球 過關 2：上面傳來大俠貓吼聲，球球衝到樓梯口大喊；封封指路。
    'fengfeng_coop_ninja_act2': (['qiuqiu', 'fengfeng'], 'ff_upper',
        'An upper stairwell: QIUQIU at the foot of the stairs shouting upward; FENGFENG beside him points up the stairs '
        'with his sheathed sword, calm and alert.'),
    # 封封＋菲菲 過關 1：菲菲在扶手上找到一縷藍線收進口袋；封封抬高劍鞘從她身旁走過去看前面。
    'fengfeng_coop_feifei_act1': (['feifei', 'fengfeng'], 'ff_stairs',
        'Inside the tower on the stairs: FEIFEI tucks a thin blue thread from the banister into her pocket; FENGFENG '
        'walks past her up the steps holding his sheathed sword raised, scouting ahead.'),
    # 封封＋菲菲 過關 2：大俠貓吼聲從高處傳來，菲菲停步扣緊竹筒；封封說上面那道門後面還有樓梯。
    'fengfeng_coop_feifei_act2': (['feifei', 'fengfeng'], 'ff_upper',
        'An upper stairwell before a heavy wooden door: FEIFEI stops, clutching her bamboo needle tube, worried; FENGFENG '
        'stands by the door with his sheathed sword, looking up toward the sound.'),
    # 封封＋噹噹 過關 1：樓梯前堵著空糧箱，噹噹抬起一端，封封幫忙挪到牆邊。
    'fengfeng_coop_dangdang_act1': (['dangdang', 'fengfeng'], 'ff_stairs',
        'Inside the tower at the foot of the stairs: DANGDANG lifts one end of a big empty food crate blocking the steps '
        'and FENGFENG helps carry the other end toward the wall.'),
    # 封封＋噹噹 過關 2：上層傳來吼聲，灰塵從階梯落下，兩人停步抬頭看樓梯。
    'fengfeng_coop_dangdang_act2': (['dangdang', 'fengfeng'], 'ff_upper',
        'An upper stairwell, dust falling from the steps above after a distant roar: DANGDANG and FENGFENG stop side by '
        'side and look up the dark staircase, DANGDANG\'s bracers raised, FENGFENG\'s paw on his sheathed sword.'),
}

_LOCK = threading.Lock()


def white(im: Image.Image) -> Image.Image:
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im.convert('RGBA'))
    return bg


def figure(who: str) -> Image.Image:
    if who == 'master':
        sprites = json.loads(MANIFEST.read_text(encoding='utf-8'))['sprites']
        im = Image.open(ROOT / 'public' / sprites['boss/idle1']).convert('RGBA')
        return im.crop(im.getchannel('A').getbbox())
    data = json.loads((ROOT / IDLE[who]).read_text(encoding='utf-8'))['actions']['idle']
    x, y, w, h = data['frames'][0]['rect']
    return Image.open(ROOT / 'public' / data['texture']).convert('RGBA').crop((x, y, x + w, y + h))


def cast_sheet(cast: list[str]) -> Image.Image:
    """出場角色一列排開、同一個高度（大俠貓高一截，他是成貓）、鋪白底。"""
    height = 420
    figs = []
    for who in cast:
        im = figure(who)
        h = round(height * (1.25 if who == 'master' else 1.0))
        figs.append(im.resize((round(im.width * h / im.height), h), Image.LANCZOS))
    width = sum(f.width for f in figs) + 60 * (len(figs) + 1)
    sheet = Image.new('RGBA', (width, max(f.height for f in figs) + 60), (255, 255, 255, 255))
    x = 60
    for f in figs:
        sheet.alpha_composite(f, (x, sheet.height - 30 - f.height))
        x += f.width + 60
    return sheet


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for key, name in STYLE.items():
        Image.open(BG / f'{name}.webp').convert('RGB').save(REF / f'style_{key}.png')
    for name, (cast, _, _) in SCENES.items():
        white(cast_sheet(cast)).convert('RGB').save(REF / f'cast_{name}.png')
    print(f'參考圖已輸出到 {REF}')


def prompt_for(name: str) -> str:
    cast, _, scene = SCENES[name]
    who = '; '.join(LOOK[c] for c in cast)
    return (
        'Create one wide cinematic STORY ILLUSTRATION (16:9) for a cute cat-ninja adventure game. '
        'Reference image 1 is an existing story illustration from the same game: copy its art style EXACTLY - '
        'the same rendering of backgrounds and lighting, the same line work and shading on the characters, '
        'chibi cat proportions with big round heads, the same level of detail and the same colour mood. '
        'Use it for STYLE ONLY: do not copy its characters, poses or composition. '
        'Reference image 2 is the character sheet for this picture (left to right): copy each character\'s face, head '
        f'size, markings, outfit and colours EXACTLY from it. The characters: {who}. '
        f'The scene: {scene} '
        'Every character must be clearly recognisable at a glance and appear only once. Keep all important action in '
        'the lower two thirds of the picture: the top quarter is covered by a dialogue box, so keep it as simple '
        'background (sky, wall, ceiling). Leave a small safety margin at the left and right edges. '
        'No text, no letters, no speech bubbles, no captions, no watermark, no border, no UI.'
    )


def record(path: Path, key: str, entry: dict) -> None:
    with _LOCK:
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        data.setdefault(key, []).append(entry)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(name: str, note: str = '') -> tuple[str, int, str]:
    _, style, _ = SCENES[name]
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f' {note}' if note else '')
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--size', '1536x1024', '--quality', 'high', '--prompt', text,
               '--image', str(REF / f'style_{style}.png'), '--image', str(REF / f'cast_{name}.png'),
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
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def fit(image: Image.Image) -> Image.Image:
    """從中間裁成 16:9、縮成 OUT_SIZE。"""
    rgb = image.convert('RGB')
    w, h = rgb.size
    target = OUT_SIZE[0] / OUT_SIZE[1]
    if w / h > target:
        cw = round(h * target)
        rgb = rgb.crop(((w - cw) // 2, 0, (w - cw) // 2 + cw, h))
    else:
        ch = round(w / target)
        rgb = rgb.crop((0, (h - ch) // 2, w, (h - ch) // 2 + ch))
    return rgb.resize(OUT_SIZE, Image.LANCZOS)


def add_manifest(keys: list[str]) -> None:
    """清單 bg 那一段補上這一批的鍵，**不整份重寫**：這一批的行先拿掉，再照 `SCENES` 的順序
    一起插回封封那張 `fengfeng_coop_ninja_victory` 後面（一張張選的時候順序才不會倒過來）。"""
    raw = MANIFEST.read_bytes().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    data = json.loads(raw)
    want = [k for k in SCENES if f'bg/{k}' in data['bg'] or k in keys]
    mine = tuple(f'"bg/{k}"' for k in SCENES)
    raw = nl.join(line for line in raw.split(nl) if not line.strip().startswith(mine))
    anchor = '"bg/fengfeng_coop_ninja_victory": "assets/bg/fengfeng_coop_ninja_victory.webp"'
    at = raw.index(anchor) + len(anchor)
    lines = ''.join(f',{nl}    "bg/{k}": "assets/bg/{k}.webp"' for k in want)
    raw = raw[:at] + lines + raw[at:]
    json.loads(raw)
    MANIFEST.write_bytes(raw.encode('utf-8'))


def pick(name: str, attempt: int) -> None:
    src = SOURCE / f'{name}.try{attempt}.png'
    out = BG / f'{name}.webp'
    fit(Image.open(src)).save(out, 'WEBP', quality=80, method=6)
    add_manifest([name])
    picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
    picks[name] = {'attempt': attempt, 'sourceSize': list(Image.open(src).size), 'bytes': out.stat().st_size,
                   'at': time.strftime('%Y-%m-%d %H:%M:%S')}
    PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{name} 採用第 {attempt} 次（{out.stat().st_size // 1024} KB）')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    sub.add_parser('list')
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
        for name in SCENES:
            print(name)
    elif args.command == 'pick':
        pick(args.name, args.attempt)
    else:
        names = list(SCENES) if args.names == ['all'] else args.names
        unknown = [n for n in names if n not in SCENES]
        if unknown:
            raise SystemExit(f'沒有這幾張：{unknown}')
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, attempt, status in pool.map(lambda n: generate(n, args.note), names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
