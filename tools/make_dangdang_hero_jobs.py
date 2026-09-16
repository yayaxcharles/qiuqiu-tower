# -*- coding: utf-8 -*-
"""噹噹（黑白賓士貓）的 A 批立繪工作檔——32 張，跟球球、菲菲同一套姿勢名。

**這一批是後面所有批（牌面、幻燈片、事件圖、變裝）的參考來源，走鐘的話全盤皆輸。**

怎麼寫這些提示詞（跟菲菲那批最大的差別）
----------------------------------------
菲菲是「從無到有生一隻新貓」，所以她的提示詞裡有一大段外觀敘述（`art_rules.feifei_look()`）。
噹噹不是：**使用者已經有五張認可的稿**，長相全部交給參考圖
`tools/ref/dangdang_ref.png`（`make_dangdang_ref.py` 產，兩格都朝右、綠幕底）。
所以這裡的提示詞只做三件事：

  1. 指著參考圖說「就是這隻，照抄，不要重新設計」；
  2. 列一張**只寫正面、不舉例**的辨識清單（白臉線、青綠短褂、棕腰帶、**兩隻銅護臂**、
     深色長褲纏踝、琥珀眼）——使用者交代「拿去對照，不是拿去取代參考圖」；
  3. 講**這個姿勢在做什麼**。

刻意不做的事（使用者 2026-09-17 明示）：
  - **不用舉例寫規則**。「不要畫成鱗片那樣」這種句子會讓模型照著長出鱗片；
    反面敘述一樣會。整段不提具體特徵最乾淨。
  - **不整隻重描**。長相寫得越細，越會變成另一隻貓——這是本專案最貴的教訓。

四條跟姿勢有關的硬規則，每一條都掃過整份姿勢表（`art_rules.py` 檔頭的教訓：
規則寫太死會跟姿勢打架），衝突的給它自己的取景（`FRAMING`）：

  - **比高窄**（寬 < 高的八成）：`add_sprite.py` 把主體塞進 540×538 的框，
    畫得比高還寬只能整隻縮小、遊戲裡看起來矮一號。躺著的（`down`、`belly`）、
    縮成球的（`curl`）、正方形的封面（`cover`）做不到，各給自己的取景。
  - **朝右**：`curl` 臉埋著、`belly` 仰躺、`down` 橫躺、`cover` 是正面站的封面。
  - **腳貼底邊**：`qinggong` 騰空、`lose` 坐著、`down`／`belly` 躺著、`curl` 是球。
  - **琥珀色眼睛、兩隻眼睛長一樣**：`dizzy` 的漩渦眼與 `down` 的叉叉眼寫成明文例外，
    `hit` 寫「閉成同一個樣子」，側面只看得到近側那隻是正常的（提示詞裡講明）。

特效一律**貼著身體**畫：上一批有兩張把大片煙霧畫成一塊方形色板貼在綠幕上，
去背去不掉（`art_rules.NO_PANEL`）；而且特效往外拉會把主體擠小。

跑法
----
  python tools/make_dangdang_ref.py                 # 先做參考圖（只要做一次）
  python tools/make_dangdang_hero_jobs.py           # 產工作檔
  python tools/codex_gen.py tools/codex_jobs/dangdang_hero.json --ref tools/ref/dangdang_ref.png

  只重生幾張：python tools/make_dangdang_hero_jobs.py --only idle guard --redo
  （`--redo` 會把舊稿改名留底。不加的話 `codex_gen.py` 看到檔案已存在就跳過、整張空轉，
    而且印的是「已存在跳過」、離開碼 0，看起來像成功——`art_rules.py` 第九個雷。）

**自檢不寫成 `SystemExit`**（使用者 2026-09-17 明示）：上一批有腳本把自己鎖死，
改了提示詞卻每次都失敗離開、工單停在最舊那版，生了十幾張才發現。
這裡改成：工作檔**一定會寫出來**，已經有舊稿的那幾張印成一塊醒目的清單，
要重生就加 `--redo`。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import FOES, STYLE  # noqa: E402

RAW = ROOT / "tools" / "codex_raw"
JOBS = ROOT / "tools" / "codex_jobs"
REF = ROOT / "tools" / "ref" / "dangdang_ref.png"
COVER_REF = ROOT / "tools" / "ref" / "dangdang_cover_ref.png"

# ---------------------------------------------------------------------------
# 他長什麼樣：指著參考圖，配一張只寫正面的辨識清單
# ---------------------------------------------------------------------------
LOOK = (
    "The character is the black-and-white TUXEDO CAT in the attached reference image. "
    "**Copy his design straight from the reference** - the same fur pattern, the same clothes, the same "
    "colours, the same chibi proportions (a big round head about as large as his whole body, a short squat "
    "body, short stubby legs, no neck, small rounded paws) and the same drawing. Do not redesign him.\n"
    "These are the things players recognise him by. Every one of them is in the reference and every one of "
    "them belongs in your picture:\n"
    "  - black fur, with a WHITE STRIPE running down the middle of his face, a white muzzle, a white chest, "
    "white paws and white feet;\n"
    "  - AMBER-GOLD eyes;\n"
    "  - a sleeveless TEAL-GREEN Chinese jacket with a cream border and dark toggle fastenings down the front;\n"
    "  - a BROWN cloth sash knotted at his waist with the ends hanging down;\n"
    "  - **a round BRONZE BRACER on EACH of his two forearms** - they are his weapon and the first thing "
    "players look for, so both of them are in every picture;\n"
    "  - dark trousers, with cloth wrapped around each ankle.\n")

GEAR = (
    "WORN GEAR: the teal jacket, the brown sash and the two bronze bracers are attached to his body. They "
    "move and tilt with him, they never come off, never float beside him, never turn into something he holds, "
    "and never appear twice. If a pose puts one of them behind him it is simply hidden - do not move it "
    "somewhere else and do not leave it out.\n"
    "HIS EYES: amber-gold with a glossy white highlight. When both eyes show they match each other in size "
    "and shape; from the side the far eye is behind his head and that is correct. His gaze points the way his "
    "head is turned.\n"
    "HE FIGHTS WITH THOSE TWO BRACERS: he punches, blocks, sweeps and pushes with his forearms. His paws stay "
    "rounded and closed - no claws out, no weapon in his paws.\n")

FACE_RIGHT = (
    "His muzzle, nose and gaze all point toward the RIGHT edge of the picture, the same way both halves of "
    "the reference image do. He never looks toward the left edge and never looks straight out at the viewer. "
    "His tail trails off to the LEFT behind him.\n")

# ★ 這一條是為了 `add_sprite.py`：主體要塞進 540×538 的框，比框寬就整隻被縮小，
#   遊戲裡同一個角色會忽大忽小。特效往外拉是最常見的原因，所以特效也綁在這條裡。
COMPACT = (
    "SHAPE OF THE WHOLE PICTURE: everything you draw - him and anything coming off him - must be TALLER than "
    "it is WIDE, with the total width staying under 80% of the total height. Gather his stance and his arms in "
    "toward his body rather than spreading them sideways. Any motion streak stays right beside the paw or limb "
    "that made it, short and tucked in; nothing reaches out across the picture.\n")

FRAMING_DEFAULT = ("\n\nFull body. " + FACE_RIGHT
                   + "Feet at the very bottom edge of the picture, do not draw him floating. Fill the frame "
                     "vertically.\n" + COMPACT)

TAIL = ("Keep the exact same character design AND the same right-facing angle as the reference image (both "
        "halves of it face right) - only the pose and the expression differ. There is exactly ONE character in "
        "the picture: no second cat, nobody else.\n"
        "Draw everything SOLID and OPAQUE. Nothing else in the picture: no ground line, no shadow, no scenery, "
        "no text, no letters, no watermark, no border.\n")

# ---------------------------------------------------------------------------
# 32 個姿勢：跟球球、菲菲同名同義，動作照噹噹的路數（蜷縮擋＋護臂回敬）改寫
# ---------------------------------------------------------------------------
POSES: dict[str, str] = {
    # ---- 待機 ----
    'idle': ('standing at ease and ready, weight settled evenly on both feet, both paws loosely closed in '
             'front of his chest with the bracers turned outward, shoulders relaxed, a calm steady look '
             'toward the right'),
    # ---- 出招家族（五種要分得開：直拳／上勾／橫掃／踢／撞）----
    'attack': ('stepping in and driving a straight punch to the RIGHT, the near forearm going out level with '
               'his shoulder so the bronze bracer leads the blow, the other paw kept in close at his chest, '
               'back leg braced behind him, mouth open in a short breath out. Two short solid cream-white '
               'motion arcs curve just behind the punching bracer'),
    'punch': ('throwing a short rising uppercut: the near paw swings up from his waist with the bracer turned '
              'inward, the elbow tucked against his ribs, the other paw guarding his chin, knees springing him '
              'upward, eyes narrowed. A small solid warm-golden impact burst sits right on that bracer'),
    'claw': ('sweeping the near forearm across in front of him to knock a blow aside, the outer rim of the '
             'bracer leading the sweep, his shoulders turning with it, the other paw held ready at his chest. '
             'One short solid cream-white arc follows the rim of the bracer'),
    'kick': ('snapping a short straight kick forward to the RIGHT, the cloth-wrapped foot going out at waist '
             'height, body upright over the standing leg, both paws kept up in a guard in front of his chest '
             'for balance. One thin solid cream-white arc follows the foot'),
    'dash': ('charging forward to the RIGHT, low and fast, one shoulder and the bracer on that arm leading, '
             'head down, back leg driving off the ground, both arms tucked tight against his sides. Three '
             'short straight solid cream-white speed lines trail close behind his back'),
    'throw': ('shoving a blow straight back the way it came: both paws thrust forward to the RIGHT in a '
              'two-palm push with the bracers side by side at chest height, elbows still bent and tucked in, '
              'weight rolling onto the front foot, a sharp satisfied look. One broad solid cream-white arc is '
              'pushed off the front of the bracers'),
    # ---- 防禦家族（他的本業）----
    'guard': ('both bracered forearms crossed in an X in front of his chest and face, head lowered behind '
              'them, knees bent into a low steady stance, eyes fixed on the right over the top of the guard. '
              'Nothing but him - no shield, no glow, no effect'),
    'taiji': ('rooted in a calm low stance, knees softly bent, turning a blow aside instead of meeting it: '
              'the near forearm rises open and high near his chest with the bracer facing outward while the '
              'other paw sinks low by his waist, as if turning a big invisible ball between them. Eyes '
              'half-closed and serene, mouth a small calm line. One thin solid cream-white circular arc sweeps '
              'around his paws. Nothing tense, nothing fast'),
    'curl': ('curled up into a tight compact ball on the ground, knees pulled right in, both bracered '
             'forearms wrapped over his head and tucked in front of his face, tail curled around the outside '
             'of the ball, eyes shut, braced and waiting it out'),
    'iron': ('standing firm and immovable in a low steady stance with his feet planted just outside his '
             'shoulders, both arms folded tightly across his chest so a bracer rests on each side, chin '
             'raised, eyes narrowed calmly, a small confident closed-mouth smile. A thin SOLID warm-golden '
             'metallic rim hugs his outline with a crisp hard edge, as if his fur had turned to bronze for a '
             'moment'),
    'power': ('powered up: planted in a low stance with both fists clenched and both bracers squared up, '
              'shoulders set, eyes narrowed and fierce, mouth firm. A thin, bright, SOLID warm-golden rim hugs '
              'his outline with a crisp hard edge, like a gold line drawn around him. No flames, no big aura, '
              'no soft blurry glow fading out into the background'),
    # ---- 挨打 ----
    'hit': ('knocked back a step, head snapping backward, his eyes squeezed shut the same way as each other, '
            'mouth open in a yelp, both arms flung up with one bracer still half-raised where it did not get '
            'there in time. Three small solid warm-golden stars pop beside his head'),
    'hurt': ('battered but still on his feet: hunched forward and breathing hard, a small cloth bandage stuck '
             'on his cheek, a big sweat drop beside his head, the shoulder of the jacket torn, one paw braced '
             'on his knee, eyes tired but not giving up'),
    'down': ('collapsed and lying on his side on the ground, both eyes drawn as little crosses (this pose is '
             'the one exception to the amber-eye rule), mouth open, one bracered arm stretched limply forward '
             'along the ground, the other folded under him, the end of the sash come loose and trailing'),
    'dodge': ('springing backwards away from the right, both feet skidding low, body leaning back, both '
              'bracered forearms snapped up in front of him, eyes wide and alert. Two short solid cream-white '
              'streaks trail close in front of him where he just was'),
    # ---- 掛在身上的狀態 ----
    'dizzy': ('stunned and wobbling: knees buckled, arms hanging loose, head tilted, his visible eye drawn as '
              'a little AMBER spiral (this pose is the exception to the round-pupil rule), mouth a wavy line, '
              'three small solid yellow stars circling just above his head'),
    'choke': ('poisoned: doubled over with one paw clutching his throat and the other bracer pressed against '
              'his stomach, tongue out, his eye watering, small solid warm-grey vapour curls rising close '
              'around his head'),
    'belly': ('rolled over onto his back in a compact little heap: knees pulled up toward his chest and all '
              'four paws folded limply in the air above his white tummy, tail curled back beside his body, his '
              'head at the right-hand side tipped back, eyes wide and worried with a bead of sweat, mouth a '
              'small nervous squiggle. Helpless and wide open. His tummy is flat, not a round bulging belly'),
    'lazy': ('all his energy gone: shoulders dropped, arms dangling straight down so the bracers hang heavy at '
             'his sides, knees slightly bent, head lolling to one side, eyelids drooping heavily with the '
             'amber still showing under them, mouth open in a big wide yawn with one paw raised loosely to '
             'cover it'),
    'puff': ('startled with his fur standing on end: short spikes of fur bristling up along his back and '
             'cheeks, his tail bristled out thick, back arched, both ears standing rigidly straight up, his '
             'eye huge with a tiny pupil, mouth a small round shocked "o". His OUTLINE becomes SPIKY, not '
             'rounder - he is not inflated, only his fur stands up'),
    'stealth': ('hiding: crouched right down, small and still, one paw raised beside his muzzle in a quiet '
                '"shh", his amber eye glancing to the right, ears laid back. A compact SOLID cream-white '
                'smoke puff swallows him from the waist down, hugging his body, no wider than his shoulders, '
                'with a soft lumpy outline and no straight edges'),
    # ---- 出牌的其他家族 ----
    'eat': ('nibbling a white rice ball held in both paws near his mouth, taking one small neat bite, eyes '
            'half-closed and content, a tiny solid golden sparkle of delight beside his head'),
    'hungry': ('starving: standing slumped with an empty rice bowl held in both paws in front of him, one '
               'drop of drool at the corner of his mouth, eyebrows up and his amber eye pleading'),
    'focus': ('gathering inner power: standing straight and still, both paws pressed flat together in front of '
              'his chest so the two bracers touch, eyelids lowered calmly with a sliver of amber showing, a '
              'small ring of solid warm-golden sparkles around him, the ends of the sash lifting slightly'),
    'skill': ('casting a technique: settled in a firm stance with both paws pressed together in a hand seal in '
              'front of his chest, eyes open and fixed on the right, chin level. Three or four solid '
              'cream-white leaves drift and swirl close around him'),
    'scroll': ('reading a secret scroll: holding a partly unrolled paper scroll open with both paws at chest '
               'height, studying it closely with a narrowed amber eye and one eyebrow raised. The written side '
               'of the scroll faces HIM, so we only see the plain cream back of the paper - no writing, no '
               'letters, no symbols visible to us'),
    'roar': ('feet planted just outside his shoulders, leaning forward, one paw cupped beside his open mouth '
             'as he shouts sharply toward the right, eyes narrowed fiercely, his whiskers and the ends of his '
             'sash blown backward by his own shout. Three bold curved sound arcs ripple out in front of his '
             'mouth toward the right, drawn as simple thick solid cream-white arcs'),
    'qinggong': ('caught mid-leap, weightless, high off the ground - body stretched upward, one back paw '
                 'pointed down with only the very toe-tip touching down, the other leg tucked up, both '
                 'forearms held in close for balance, tail streaming out behind him. Eyes bright and focused, '
                 'a small confident smile. Two or three tiny solid cream puffs below his toe where he barely '
                 'touched down. He must read as LIGHT and airborne, not as a charging attack'),
    # ---- 結算 ----
    'lose': ('sitting slumped on the ground with his legs out in front, shoulders dropped, head hanging, ears '
             'down, eyes closed, both bracered paws resting limply in his lap, the sash come loose. Beaten and '
             'out of it'),
    'win': ('one fist raised beside his head in a small satisfied victory gesture with the bracer catching the '
            'light, the other paw resting on his hip, standing tall, eyes closed in a pleased little smile'),
}

# 做不到預設取景的那幾張，各給自己的（`art_rules.py` 檔頭：規則跟姿勢打架就給例外）
FRAMING: dict[str, str] = {
    # 縮成一團沒有站姿、也沒有「腳貼底邊」可言
    'curl': ("\n\nThe curled-up ball is the whole silhouette, resting on the very bottom edge of the picture "
             "and filling the frame, with his limbs and tail tucked in. It is roughly as wide as it is tall. "
             "His face is tucked down but still angled toward the RIGHT edge, never toward the left. Do not "
             "draw him floating."),
    # 橫躺：寬遠大於高是對的，這張不套「比高窄」
    'down': ("\n\nFull body lying on the ground, his body filling the frame horizontally and resting on the "
             "very bottom edge. His head is at the RIGHT side and his face is angled toward the RIGHT edge, "
             "never toward the left. Do not draw him floating."),
    # 仰躺：縮成一團，大約方形
    'belly': ("\n\nFull body lying on his back on the ground, curled up compactly in the middle of the frame, "
              "resting on the very bottom edge and filling the frame about as much vertically as "
              "horizontally. His head is at the RIGHT side and his face is angled toward the RIGHT edge, "
              "never toward the left."),
    # 坐在地上就沒有「腳貼底邊」可言；仍然要收著坐、不要攤開
    'lose': ("\n\nFull body seated on the ground. " + FACE_RIGHT
             + "His seat and feet rest on the very bottom edge of the picture and he fills the frame. Keep him "
               "gathered in rather than sprawled sideways, and do not draw him floating."),
    # 騰空：只有腳尖碰得到底邊
    'qinggong': ("\n\nFull body in the air. " + FACE_RIGHT
                 + "Only the tip of his lowest toe touches the very bottom edge of the picture. Fill the frame "
                   "vertically.\n" + COMPACT),
}


def hero_jobs(only: list[str]) -> dict[str, str]:
    jobs: dict[str, str] = {}
    for pose in only:
        if pose == 'cover':
            continue
        fid = f"hero_dangdang_{pose}.png"
        jobs[fid] = (
            LOOK + "\n\nPose: " + POSES[pose] + FRAMING.get(pose, FRAMING_DEFAULT) + "\n"
            + TAIL + GEAR + FOES + STYLE
            + f"\nOutput 896x896 PNG. Save the image as {fid} in the current directory and report the path.")
    return jobs


# ---------------------------------------------------------------------------
# 封面「參上」：照球球那張的版面重畫，做法沿用菲菲的（`make_fix_0915_jobs.py` 的 g 批）
# ---------------------------------------------------------------------------
# `codex_gen.py` 的 `-i` 只吃一張圖，所以把兩張參考拼成一張：
# 上半＝球球的封面（只借版面與貼圖風格），下半＝噹噹設定表（借長相）。
# 合參表一律白底——模型讀白底比讀綠底穩（`make_feifei_story_ref.py` 的結論）。
def build_cover_ref() -> None:
    from PIL import Image
    cover = ROOT / "public" / "assets" / "sprites" / "hero" / "cover.webp"
    if not cover.exists():
        print(f"!! 找不到球球的封面 {cover}，封面那張先不生")
        return
    top = Image.open(cover).convert("RGBA")
    bg = Image.new("RGBA", top.size, (255, 255, 255, 255))
    bg.paste(top, (0, 0), top)
    top = bg.convert("RGB").resize((700, 700), Image.LANCZOS)
    bot = Image.open(REF).convert("RGB")
    px = bot.load()
    for y in range(bot.height):
        for x in range(bot.width):
            r, g, b = px[x, y]
            if g - max(r, b) > 60:
                px[x, y] = (255, 255, 255)
    bot = bot.resize((1400, 700), Image.LANCZOS)
    sheet = Image.new("RGB", (1400, 1400), (255, 255, 255))
    sheet.paste(top, (350, 0))
    sheet.paste(bot, (0, 700))
    COVER_REF.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(COVER_REF)
    print(f"封面合參表 → {COVER_REF.relative_to(ROOT)}　{sheet.size}")


def cover_job() -> dict[str, dict[str, str]]:
    fid = "hero_dangdang_cover.png"
    return {fid: {
        'prompt': (
            'A LINE-sticker style cover illustration of a cute cartoon cat ninja character.\n\n'
            '**THE ATTACHED REFERENCE SHEET HAS TWO HALVES, AND THEY ARE USED FOR DIFFERENT THINGS.**\n'
            '  (1) THE TOP HALF is the existing cover of ANOTHER character. It is the STYLE AND LAYOUT '
            'TEMPLATE: copy its composition exactly - a big puffy CREAM-AND-TAN EXPLOSION CLOUD bursting '
            'outward behind the character and filling most of the square, a few small tan rubble chunks and '
            'short dark speed dashes flying out of it, two large brush-written characters across the top, a '
            'thick yellow brush underline swiping beneath them, and three short yellow speed dashes in each of '
            'the top corners. Same thick black outlines, same flat sticker colouring, same square framing, same '
            'big friendly proportions. **Do NOT draw the grey striped cat from the top half** - he is only '
            'there to show you the layout.\n'
            '  (2) THE BOTTOM HALF is THE CHARACTER you must draw: the black-and-white tuxedo cat, shown '
            'twice. Copy his design from there exactly.\n\n'
            "So: the top half's picture, with the bottom half's character standing in it.\n\n"
            'HIS POSE: a big confident VICTORY pose in the very centre, in front of the cloud, filling the '
            'middle of the square - standing with his weight on one foot and turned toward the viewer, one arm '
            'thrown up high above his head with the paw in a cheerful fist so the bronze bracer shows, the '
            'other paw on his hip, chest out, tail curling up behind him, eyes bright and a wide happy '
            'open-mouthed grin. Lively and bouncy, not stiff.\n\n'
            'THE TWO BRUSH CHARACTERS: copy the SAME two Japanese kanji that appear across the top of the '
            'reference, in the same brush-script shapes, the same size, the same place and the same order - '
            'trace them from the reference stroke for stroke. They are written in soft CREAM WHITE with a thin '
            'darker outline, sitting above and behind the cloud. **Exactly TWO characters, nothing else** - no '
            'extra characters, no letters, no numbers, no signature, no watermark. If you cannot reproduce the '
            'two shapes exactly as drawn in the reference, copy them as pure shapes rather than inventing '
            'different ones.\n\n'
            'HIS LOOK (copy it from the bottom half of the reference):\n' + LOOK + '\n' + GEAR +
            '\nEverything is drawn SOLID and OPAQUE - flat filled colour with thick black outlines and only '
            'subtle soft shading. Nothing transparent or see-through. The explosion cloud, the rubble, the '
            'dashes, the lettering and the character are the whole picture - no ground line, no shadow under '
            'him, no scenery, no border, no frame.\n'
            'The cloud and the sparks are CREAM, TAN and WARM AMBER YELLOW - never green, never greenish.\n'
            'Background must be a solid pure green (#00FF00), completely flat, for chroma keying: the green '
            'shows only around the outside of the cloud. Nothing green on the cloud, the lettering or the '
            'character.\n'
            f'Output 1024x1024 PNG. Save the image as {fid} in the current directory and report the path.'),
        'ref': COVER_REF.relative_to(ROOT).as_posix()}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='+', default=None, help='只出這幾個姿勢的工單')
    ap.add_argument('--redo', action='store_true',
                    help='已經有舊稿的先改名留底，不然 codex_gen 會直接跳過那幾張')
    ap.add_argument('--name', default=None, help='工作檔檔名（預設 dangdang_hero.json）')
    args = ap.parse_args()

    # `cover` 不在 POSES 裡（它有自己的參考圖與提示詞），但它算這批的第 32 張
    all_names = list(POSES) + ['cover']
    only = args.only or all_names
    unknown = [p for p in only if p not in all_names]
    if unknown:
        print(f"!! 沒有這幾個姿勢：{unknown}（可用的：{' '.join(all_names)}）")
        return

    if not REF.exists():
        print(f"!! 參考圖不存在：{REF.relative_to(ROOT)}　先跑 python tools/make_dangdang_ref.py")
        return

    jobs: dict[str, object] = dict(hero_jobs(only))
    if 'cover' in only:
        build_cover_ref()
        if COVER_REF.exists():
            jobs.update(cover_job())

    RAW.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M')
    exists = [fid for fid in jobs if (RAW / str(fid)).exists()]
    if exists and args.redo:
        for fid in exists:
            old = RAW / str(fid)
            old.rename(old.with_name(f"{old.stem}.prev-{stamp}.png"))
        print(f"舊稿改名留底 {len(exists)} 張（.prev-{stamp}.png）")
        exists = []

    JOBS.mkdir(parents=True, exist_ok=True)
    out = JOBS / (args.name or ('dangdang_hero.json' if args.only is None
                                else f"dangdang_hero_{'_'.join(only)}.json"))
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"{len(jobs)} 張 → {out.relative_to(ROOT)}")

    # 自檢：不中止（工作檔上面已經寫出去了），但要印得夠大聲
    if exists:
        print("\n" + "!" * 70)
        print(f"這 {len(exists)} 張 tools/codex_raw 裡已經有舊稿，codex_gen.py 會直接跳過、不會重生：")
        for fid in exists:
            print(f"  {fid}")
        print("要重生請加 --redo（會先改名留底），或自己把舊稿改名。")
        print("!" * 70)


if __name__ == '__main__':
    main()
