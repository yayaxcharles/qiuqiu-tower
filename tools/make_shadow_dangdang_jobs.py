# -*- coding: utf-8 -*-
"""H 批：鏡中噹噹（影噹噹）的魔物立繪五張。

姿勢名照 `src/ui/assets.ts` 的 `MonsterPose`：idle／attack／hurt／block／down，
鍵是 `codex/monster_shadow_dangdang`（`src/content/enemies.ts` 的 `MIRROR_DANGDANG`）。
（這五張 2026-09-16 已進倉；當時 `assets.ts` 裡那張「還沒進倉就先借別隻」的替身表
也在 2026-09-18 一併拿掉了，現在查無鍵就是灰剪影。）

做法：完全照鏡中菲菲那五張（`make_fix_0915_jobs.py` 的 e1／e2 批）
------------------------------------------------------------------
同一條鏡子走廊裡三隻影子要看起來是同一種東西，所以**影子化那一段不自己重寫**，
一律拿影球球的原始工單（`codex_jobs/shadow_cat.json`、`hurt/shadow_cat.json`、
`monster_down.json`、`build_block_queue.BLOCK_POSE`）來換主角，跟菲菲那批同一個做法：

  h1  待機：參考圖用噹噹的設定表，先把待機生出來、進倉
  h2  出招／挨打／防禦／倒地：參考圖換成待機圖鋪白底重建的
      `tools/ref/monster_refs/shadow_dangdang.png`，長相全靠它

進倉前要先種一張畫布（`add_sprite.py --group monsters` 固定拿 `<id>_idle.webp` 當基準）：

  cp public/assets/monsters/shadow_cat_idle.webp public/assets/monsters/shadow_dangdang_idle.webp

**參考圖要先左右鏡射**（`art_rules.py` 第四個雷：參考圖會被讀走的不只是長相，還有角度）。
魔物一律朝左，而 `tools/ref/dangdang_ref.png` 兩格都朝右——直接附上去等於一邊寫
「facing left」一邊給它一張朝右的圖看。本檔的 `mirror_ref()` 會產一張朝左的
`tools/ref/dangdang_ref_left.png`。他的白臉線在正中央、兩隻手都有護臂，鏡射不會改長相。

動作語彙（使用者 2026-09-17 明示）：**護臂、拳、掌、站樁；不用暗器、不伸爪抓。**
菲菲那批的影子會甩煙針，那是她的路數，噹噹這批一句都不能抄。

兩條硬規則（前幾批的教訓，寫在 `SOLID_FX`）：
  - 特效一律是**有黑外框的實心形狀**（沒外框的柔光會暈進綠幕、去背去不掉）；
  - **兩個顏色之間不要漸層**（漸層會從綠色經過）。
  他的青綠短褂是設計不是特效，而且影子化之後整件變成暗紫黑，不受這條影響。

跑法
----
  python tools/make_shadow_dangdang_jobs.py h1
  python tools/codex_gen.py tools/codex_jobs/shadow_dangdang_h1.json
  cp public/assets/monsters/shadow_cat_idle.webp public/assets/monsters/shadow_dangdang_idle.webp
  python tools/add_sprite.py --group monsters monster_shadow_dangdang_idle.png

  python tools/make_shadow_dangdang_jobs.py h2
  python tools/codex_gen.py tools/codex_jobs/shadow_dangdang_h2.json
  python tools/add_sprite.py --group monsters monster_shadow_dangdang_{attack,hurt,block,down}.png

重生某幾張加 `--redo`（會把舊稿改名留底）。不加的話 `codex_gen.py` 看到檔案已存在就跳過、
整張空轉，而且印「已存在跳過」、離開碼 0，看起來像成功（`art_rules.py` 第九個雷）。

自檢**不寫成 `SystemExit`**（使用者 2026-09-17 明示，見 `make_dangdang_hero_jobs.py` 檔頭）：
工作檔一定會寫出來，已經有舊稿的那幾張印成一塊醒目的清單。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_block_queue import BLOCK_POSE, BLOCK_TAIL  # noqa: E402

JOBS = ROOT / 'tools' / 'codex_jobs'
RAW = ROOT / 'tools' / 'codex_raw'
PUB = ROOT / 'public'
MONSTER_REFS = ROOT / 'tools' / 'ref' / 'monster_refs'
REF_RIGHT = ROOT / 'tools' / 'ref' / 'dangdang_ref.png'
REF_LEFT = ROOT / 'tools' / 'ref' / 'dangdang_ref_left.png'
IDLE_WEBP = PUB / 'assets' / 'monsters' / 'shadow_dangdang_idle.webp'


# ---------------------------------------------------------------------------
def load(name: str) -> dict:
    return json.loads((JOBS / name).read_text(encoding='utf-8'))


def prompt_of(v) -> str:
    return v if isinstance(v, str) else v['prompt']


def swap(text: str, old: str, new: str, who: str) -> str:
    """來源工單改過就當場停——換不到等於整段護欄沒貼上，生出來才發現太貴。"""
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'!! {who}：要換的原文出現 {n} 次（應該剛好 1 次），來源工單改過了，先看一眼：\n'
                         f'   「{old[:110]}…」')
    return text.replace(old, new, 1)


def white_ref(src: Path, dst: Path) -> str:
    """去背過的 webp 鋪白底存成 PNG 當參考圖（跟 0914 魔物、0915 影菲菲同一個做法）。"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.paste(im, (0, 0), im)
    bg.convert('RGB').save(dst)
    return dst.relative_to(ROOT).as_posix()


def mirror_ref() -> str:
    """噹噹的設定表左右鏡射成朝左，給朝左的魔物用（`art_rules.py` 第四個雷）。"""
    if not REF_RIGHT.exists():
        raise SystemExit(f'!! 參考圖不存在：{REF_RIGHT.relative_to(ROOT)}　先跑 python tools/make_dangdang_ref.py')
    im = Image.open(REF_RIGHT).convert('RGB').transpose(Image.FLIP_LEFT_RIGHT)
    im.save(REF_LEFT)
    return REF_LEFT.relative_to(ROOT).as_posix()


# ---------------------------------------------------------------------------
# 影子化那一段：主角換成噹噹，其他一個字不動（三隻影子要是同一種東西）
# ---------------------------------------------------------------------------
# 影球球原工單的那一段，用來當 `swap()` 的錨點
OLD_MON = ('The monster: a SHADOW CLONE of the grey tabby cat ninja in the attached reference sheet - the '
           'SAME proportions as the reference (big round head as large as the body, tiny muzzle, short '
           'chubby body, headband with two trailing tails), but made ENTIRELY of solid dark violet-black '
           'smoke: no fur markings, flat near-black silhouette with wisps of dark smoke curling off the '
           'head, ears and tail, and two glowing pale violet eyes with tiny bright pupils. Clearly the same '
           'character, turned evil.')

# ---------------------------------------------------------------------------
# 鏡頭角度與頭身比：第一版整張走鐘的地方（2026-09-17 三隻並排看出來的）
# ---------------------------------------------------------------------------
# 第一張待機生出來是**全側臉、只看得到一隻眼、頭比另外兩隻小一號**。影球球與影菲菲都是
# 身體側身、臉轉向鏡頭、兩隻發光眼睛是全圖最亮的東西——三隻並排一看就不是同一種東西，
# 而且遊戲裡縮到兩百像素時，側臉那一隻眼幾乎看不見。
#
# 病根是參考圖：`dangdang_ref.png` 兩格都是側面站姿，鏡射之後還是側面
#（`art_rules.py` 第四個雷：參考圖會被讀走的不只是長相，還有角度）。
# **先只改提示詞、不動參考圖**——連錯兩次同一種錯才是參考圖在教它。
FACE_VIEWER = (
    '**WHERE HE LOOKS:** his body, his stance and his feet are turned toward the LEFT, but his HEAD is turned '
    'to face the VIEWER, so **BOTH of his glowing violet eyes are visible and both look straight out at us** - '
    'a three-quarter view of the face, not a flat side profile. The two glowing eyes are large and are the '
    'BRIGHTEST thing in the whole picture; the monster is shown small in the game and those two eyes are what '
    'makes him readable. One eye hidden behind his muzzle is wrong.\n'
    '**HIS HEAD IS BIG AND ROUND** - about as large as his torso, taking up roughly the top third of his whole '
    'height, with big round cheeks and two pointed ears standing up off it. Do NOT draw adult or realistic cat '
    'proportions with a small head on a big body; do NOT make the head wider than his shoulders either.\n')

# 噹噹版。剪影是玩家唯一認得出他的線索，而他的招牌是**兩隻護臂**
#（`art_rules.py` 第五個雷：配件要講它在畫面上佔哪一塊，不是講它叫什麼）。
DD_SHADOW = (
    'The monster: a SHADOW CLONE of the black-and-white TUXEDO cat in the attached reference image - the SAME '
    'proportions and the SAME silhouette as the reference (a big round head about as large as his whole body, a '
    'short squat body, short stubby legs, no neck, small rounded paws, the sleeveless Chinese jacket, the cloth '
    'sash knotted at his waist with the ends hanging down, the wrapped ankles, and **a round chunky BRACER on '
    'each of his two forearms**), but made ENTIRELY of solid dark violet-black smoke: no white face stripe, no '
    'white muzzle, no white chest, no white paws, no teal jacket colour, no brown sash colour, no bronze metal '
    'colour - just a flat near-black silhouette with wisps of dark violet smoke curling off his head, ears, '
    'shoulders and tail, and two glowing pale violet eyes with tiny bright pupils. Clearly the same character, '
    'turned evil.\n'
    '**HIS SILHOUETTE IS THE ONLY WAY PLAYERS RECOGNISE HIM**: the TWO BRACERS are thick rounded cuffs wrapped '
    'right around his forearms, each one clearly wider than the arm inside it, so both arms read as bulky and '
    'armoured; they are outlined in black and sit a shade lighter than his fur so they stay readable against the '
    'black body. The knotted sash with its two hanging ends stays on his waist. A shadow with plain thin arms is '
    'the wrong character.\n'
    '**HE IS A SMALL, SHORT, ROUND CHIBI SHAPE** - do not draw a tall, slim or grown-up cat, do not give him '
    'long legs, and do not inflate him into a featureless ball: you must still be able to point at two arms and '
    'two legs.\n'
    + FACE_VIEWER +
    '**HOW HE MOVES: with those two bracers.** He punches, pushes with open palms, blocks and plants himself in '
    'a stance. His paws stay rounded and closed. He never throws needles, darts, shuriken or any thrown weapon, '
    'never holds a weapon, and never puts out claws.')

# 兩條硬規則。措辭只針對煙與特效，不碰主體的平塗敘述——寫成「整張都不准漸層」會跟
# 來源工單的 "flat colors with subtle soft gradients" 打架（`art_rules.py` 檔頭第一條教訓）。
SOLID_FX = (
    '\nTHE SMOKE: every wisp of violet smoke coming off him is a SOLID SHAPE with its own THICK BLACK OUTLINE, '
    'like a little flame drawn in ink - never a soft airbrushed haze and never see-through. Where the violet '
    'smoke meets his black body that is a CLEAN HARD EDGE; do NOT blend or fade one colour into the other '
    'anywhere in the picture. (A soft fade bleeds into the green background and cannot be cut out.)\n')

# 出招／防禦不可以比待機矮（`add_sprite.py` 會擋，0914 e 批的教訓）
TALL = ('Fill the frame from the very top to the very bottom: he must be AT LEAST AS TALL as in the reference '
        'image, with his head at the same height or higher. Show the action with an upright, stepping or '
        'planted pose - NOT by stretching him sideways or crouching lower. A wide, flat pose gets shrunk to fit '
        'in the game and he looks smaller the moment he acts; that is wrong.\n')

SAME_ONE = ('The creature: EXACTLY the monster shown in the reference image - the same shadow tuxedo cat, the '
            'same silhouette, the same two thick bracers on his forearms, the same knotted sash, the same two '
            'glowing violet eyes, the same smoke wisps. This is the same creature one moment later, NOT a '
            'different creature.')

KEEP_BRACERS = (' Keep the TWO THICK BRACERS on his forearms readable - they are the only way players tell him '
                'apart from the other shadows. He fights with them: punches, palms and stances only, never a '
                'thrown weapon and never claws.')


# ---------------------------------------------------------------------------
def build_h1() -> dict:
    ref = mirror_ref()
    sc = load('shadow_cat.json')
    fid = 'monster_shadow_dangdang_idle.png'
    t = swap(prompt_of(sc['monster_shadow_cat_idle.png']), OLD_MON, DD_SHADOW, fid)
    t = swap(t, 'Pose: standing in a ready ninja stance, smoke drifting upward off its shoulders',
             'Pose: standing rooted in a ready fighting stance, knees bent low and weight settled evenly, both '
             'bracered forearms raised in a loose guard in front of his chest with the bracers turned outward, '
             'both paws closed, chin level, his head turned to the viewer with both glowing eyes staring '
             'steadily out at us, smoke drifting upward off his shoulders', fid)
    t = swap(t, 'Output 768x768 PNG.', SOLID_FX + 'Output 768x768 PNG.', fid)
    t = swap(t, 'Save the image as monster_shadow_cat_idle.png', f'Save the image as {fid}', fid)
    return {fid: {'prompt': t, 'ref': ref}}


def build_h2() -> dict:
    if not IDLE_WEBP.exists():
        raise SystemExit('!! 待機圖還沒進倉：先跑 h1、進倉，再跑 h2（續集的長相全靠它）')
    ref = white_ref(IDLE_WEBP, MONSTER_REFS / 'shadow_dangdang.png')
    jobs: dict[str, dict] = {}

    # --- 出招：直拳，護臂領路。照影菲菲那批加「不可以比待機矮」 ---
    sc = load('shadow_cat.json')
    fid = 'monster_shadow_dangdang_attack.png'
    t = swap(prompt_of(sc['monster_shadow_cat_attack.png']), OLD_MON, DD_SHADOW + '\n' + SAME_ONE, fid)
    t = swap(t, 'Pose: lunging forward with one smoke-claw swiping wide, a trail of smoke behind the arm',
             'Pose: ATTACKING - standing tall and stepping forward onto his front foot, driving a straight '
             'punch to the LEFT so the bracer on that forearm leads the blow at shoulder height, the other paw '
             'kept in close at his chest, back leg braced behind him, eyes narrowed. A trail of dark violet '
             'smoke streams off the punching arm. He stays upright and does not crouch', fid)
    t = swap(t, 'Fill the frame vertically: the monster should reach nearly the top and the bottom of the '
                'image.\n', TALL, fid)
    t = swap(t, 'Output 768x768 PNG.', SOLID_FX + 'Output 768x768 PNG.', fid)
    t = swap(t, 'Save the image as monster_shadow_cat_attack.png', f'Save the image as {fid}', fid)
    jobs[fid] = {'prompt': t, 'ref': ref}

    # --- 挨打：照 hurt/shadow_cat.json ---
    hurt = load('hurt/shadow_cat.json')
    fid = 'monster_shadow_dangdang_hurt.png'
    t = swap(prompt_of(hurt['monster_shadow_cat_hurt.png']),
             'The reference image is the idle pose of a cartoon monster (影球球) from a cute cat ninja tower '
             'game.',
             'The reference image is the idle pose of a cartoon monster (影噹噹, the shadow clone of the '
             'black-and-white tuxedo cat) from a cute cat ninja tower game.', fid)
    t = swap(t, 'Keep the exact same character design, colours, proportions and art style as the reference',
             'Keep the exact same character design, colours, proportions and art style as the reference - '
             'including the TWO THICK BRACERS wrapped round his forearms and the knotted sash at his waist, '
             'which are the only way players tell him apart from the other shadows', fid)
    t = swap(t, 'Output 1024x1024 PNG.', SOLID_FX + 'Output 1024x1024 PNG.', fid)
    t = swap(t, 'Save the image as monster_shadow_cat_hurt.png', f'Save the image as {fid}', fid)
    jobs[fid] = {'prompt': t, 'ref': ref}

    # --- 防禦：照 build_block_queue 的 BLOCK_POSE／BLOCK_TAIL（交叉護臂本來就是他的本業）---
    fid = 'monster_shadow_dangdang_block.png'
    t = SAME_ONE + KEEP_BRACERS + BLOCK_POSE + (
        '. His guard is the X: both bracered forearms crossed in front of his face and chest so the two thick '
        'cuffs are the front of the silhouette') + BLOCK_TAIL.format(name=fid)
    t = swap(t, 'Full body, facing LEFT. Fill the frame vertically.\n', 'Full body, facing LEFT. ' + TALL, fid)
    t = swap(t, 'Output 1024x1024 PNG.', SOLID_FX + 'Output 1024x1024 PNG.', fid)
    jobs[fid] = {'prompt': t, 'ref': ref}

    # --- 倒地：照 monster_down.json ---
    down = load('monster_down.json')
    fid = 'monster_shadow_dangdang_down.png'
    t = swap(prompt_of(down['monster_shadow_cat_down.png']),
             'The creature: exactly the monster shown in the reference image.',
             SAME_ONE + ' Keep the TWO THICK BRACERS readable on his forearms even as he lies collapsed - they '
                       'are the only way players tell him apart from the other shadows.', fid)
    t = swap(t, 'Output 1024x1024 PNG.', SOLID_FX + 'Output 1024x1024 PNG.', fid)
    t = swap(t, 'Save the image as monster_shadow_cat_down.png', f'Save the image as {fid}', fid)
    jobs[fid] = {'prompt': t, 'ref': ref}
    return jobs


# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('batch', choices=('h1', 'h2'), help='h1＝待機（先跑）；h2＝出招／挨打／防禦／倒地')
    ap.add_argument('--only', nargs='+', default=None, help='只出這幾張（例如 attack down）')
    ap.add_argument('--redo', action='store_true', help='已經有舊稿的先改名留底，不然 codex_gen 會直接跳過')
    args = ap.parse_args()

    jobs = build_h1() if args.batch == 'h1' else build_h2()
    if args.only:
        want = {f'monster_shadow_dangdang_{p}.png' for p in args.only}
        unknown = want - set(jobs)
        if unknown:
            print(f'!! 這批沒有這幾張：{sorted(unknown)}（有的：{sorted(jobs)}）')
            return
        jobs = {k: v for k, v in jobs.items() if k in want}

    RAW.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M')
    exists = [fid for fid in jobs if (RAW / fid).exists()]
    if exists and args.redo:
        for fid in exists:
            old = RAW / fid
            old.rename(old.with_name(f'{old.stem}.prev-{stamp}.png'))
        print(f'舊稿改名留底 {len(exists)} 張（.prev-{stamp}.png）')
        exists = []

    # 提示詞自己的毛病：存檔檔名對不上、兩句存檔指令、參考圖不在——這幾件一定要當場停，
    # 不然生出來的是別張的名字或沒有參考圖的圖（`codex_gen.py` 坑 4）
    for fid, job in jobs.items():
        if not (ROOT / job['ref']).exists():
            raise SystemExit(f'{fid} 的參考圖不在：{job["ref"]}')
        if f'Save the image as {fid}' not in job['prompt']:
            raise SystemExit(f'{fid}：存檔指令的檔名跟工單的鍵對不上')
        if job['prompt'].count('Save the image as') != 1:
            raise SystemExit(f'{fid}：提示詞裡有兩句存檔指令，換檔名時漏換了一句')
        if 'shadow_cat' in job['prompt'] or '影球球' in job['prompt'] or 'grey tabby' in job['prompt']:
            raise SystemExit(f'{fid}：提示詞裡還留著影球球的字眼，有一段沒換到')

    JOBS.mkdir(parents=True, exist_ok=True)
    out = JOBS / f'shadow_dangdang_{args.batch}.json'
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(jobs)} 張 → {out.relative_to(ROOT)}')
    for fid in jobs:
        print(f'  {fid}')

    if exists:
        print('\n' + '!' * 70)
        print(f'這 {len(exists)} 張 tools/codex_raw 裡已經有舊稿，codex_gen.py 會直接跳過、不會重生：')
        for fid in exists:
            print(f'  {fid}')
        print('要重生請加 --redo（會先改名留底），或自己把舊稿改名。')
        print('!' * 70)


if __name__ == '__main__':
    main()
