"""內容擴充第二批的事件插圖 A 組（2026-09-23，批次 c2a，美術代理 art3）。

範圍：design2 事件劇本第三節（事件鏈 A 郵差鴿 3 集）、第四節（事件鏈 B 影子 3 集）、第六節（連線限定 3 篇）。
第五節（關卡限定 9 篇）與第七節（條件選項）是另一個美術代理的，不在這支。
劇本：派工暫存區 `content/design2_事件劇本.md`，每一張的「畫什麼」照那一篇的「圖面」＋四份文字的細節寫；
主控裁決：圖全做不砍；連線那兩個對調選項共用一張結果圖（`_r0`、`_r1` 兩個鍵指同一個檔）。
鍵名與檔名對照另寫在派工暫存區的 `batch2_event_art_keys_A.md`（也印得出來：`keys`）。

**這一批只放檔、不登記素材清單**：事件還沒接線，同時有好幾個分支在改清單，接線的人跑一次 `register` 就全部登記
（照 `picks.json`；連線三篇的 `_r1` 由這支自己補成指向 `_r0` 那個檔）。

做法照第一批（`gen_content_batch1_art.py`；閘門、清碎點、補 4:3 縮 560×420、聯絡表都直接借它的）：
  gpt-image-1.5 真透明（codex-oauth），不走綠幕去背。
  - 有主角的圖：參考圖① 這隻的新版待機第 1 格（長相只照它）、② 同一隻、同一段塔的既有事件圖（只取畫風與
    「去背小場景」的做法）：塔下石牢＝`seclusion`（閉關）、塔中木造＝第一批 `daxia_chest`、塔頂夜空＝第一批
    `daxia_lastpage`；③④ 配角的設計圖（郵差鴿、老爺爺、師父的舊木劍，先各生一張定稿再給每一張當參考，
    四隻、三集都長一樣）或這隻的影子魔物待機（`shadow_<角色>`，影子鏈用）、木樁人（`wood_dummy`）。
  - 連線限定三篇：純場景、圖裡不畫主角。參考圖只有一張：同一段塔的既有事件圖**裁掉主角**的那一塊（只取畫風）。
  挑定後照主體外框補成 4:3 再縮成 560×420，存 `public/assets/bg/<名>.webp`（quality 80），清單鍵 `bg/<名>`。
  結果圖一律 `<事件代號>_r<選項序號>`；「什麼都不做」與「進戰鬥」的選項不畫（`tools/event_result_art.test.ts`）。

用法：
    python tools/gen_content_batch2_events_a.py refs
    python tools/gen_content_batch2_events_a.py prompt event_pigeon_lost
    python tools/gen_content_batch2_events_a.py gen design_pigeon design_grandpa design_wood_sword --jobs 3
    python tools/gen_content_batch2_events_a.py gen event_pigeon_lost --note "修正說明"
    python tools/gen_content_batch2_events_a.py pick event_pigeon_lost 2       # 裁、縮、存 webp（不登記清單）
    python tools/gen_content_batch2_events_a.py design design_pigeon 1         # 定稿配角設計圖（之後的參考圖）
    python tools/gen_content_batch2_events_a.py sheet pigeon_lost <輸出資料夾>   # 一篇一張 500 像素聯絡表
    python tools/gen_content_batch2_events_a.py register                       # 接線時：全部登記進清單
    python tools/gen_content_batch2_events_a.py keys
每一次生圖都存成 `<名>.try<N>.png`（不覆蓋），提示詞記在 `prompts.json`、選定紀錄在 `picks.json`。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_content_batch1_art as c1  # noqa: E402
from gen_rest_art import LOOK, idle_frame, on_white  # noqa: E402

ROOT = c1.ROOT
SOURCE = ROOT / 'tools/motion-art-source/c2a'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
BG = c1.BG
HEROES = c1.HEROES
HERO_NAME = c1.HERO_NAME
PRONOUN = c1.PRONOUN

# 同一段塔、同一隻的既有事件圖（畫風參考）。球球版沒有前綴（`event_name`）
ACT_SCENE = {1: 'seclusion', 2: 'daxia_chest', 3: 'daxia_lastpage'}

# 連線限定三篇（純場景）的畫風參考：既有事件圖裁掉主角的那一塊（左、上、右、下，0～1）
COOP_STYLE = {
    1: ('event_blocked', (0.25, 0.0, 1.0, 1.0)),
    2: ('event_daxia_chest_r1', (0.66, 0.0, 1.0, 1.0)),
    3: ('event_fengfeng_daxia_lastpage_r0', (0.64, 0.56, 1.0, 1.0)),
}

# 連線限定三篇的 `_r1`（「對調」那個選項）跟 `_r0` 是同一個場面：同一個檔登記兩個鍵（主控裁決 5）
ALIAS = {
    'event_coop_rope_bridge_r1': 'event_coop_rope_bridge_r0',
    'event_coop_seesaw_r1': 'event_coop_seesaw_r0',
    'event_coop_shooting_star_r1': 'event_coop_shooting_star_r0',
}


def event_name(hero: str, stem: str) -> str:
    return c1.event_name(hero, stem)


# ---------------------------------------------------------------- 配角設計圖（先定稿，之後每一張都附）

DESIGN_JOBS: dict[str, str] = {
    'design_pigeon': (
        'Create one CHARACTER DESIGN for a side character of a cute cat-ninja card game: THE POSTMAN PIGEON.\n'
        'A plump, round, chubby cartoon pigeon standing on its two feet in a three-quarter view facing right: soft '
        'blue-grey body and head, two darker slate-grey bars across each folded wing, a small dusty-pink sheen patch '
        'on the side of the neck, a short grey tail, small orange beak, round black eyes with a white highlight, '
        'little orange-pink feet. It wears a small DARK NAVY-BLUE POSTMAN CAP with a short black visor and a tiny '
        'round gold badge on the front (the badge shows a paw print, no letters), and a brown leather MAIL SATCHEL '
        'hanging at its side on a strap worn diagonally across its chest. Proud, earnest expression, chest puffed.\n'
        'Match the game art style: thick black outlines, flat colours with only subtle soft shading, chunky cute '
        'proportions. One character only, full body, centred, filling about 80% of the image, truly transparent '
        'RGBA background: no checkerboard drawing, no ground, no cast shadow, no text, no letters, no numbers.'),
    'design_grandpa': (
        'Create one CHARACTER DESIGN for a side character of a cute cat-ninja card game: THE OLD GRANDPA CAT.\n'
        'An elderly, small, slightly hunched cartoon cat sitting on the floor in a three-quarter view facing right: '
        'a DARK BROWN MACKEREL TABBY with bold dark-brown stripes on a warm brown-grey coat, a greying white muzzle '
        'and chin, long bushy WHITE EYEBROWS and long white whiskers, droopy kind eyes behind big ROUND WIRE-RIMMED '
        'GLASSES, a thin brown tail curled around him. He wears a faded olive-brown quilted padded jacket with a '
        'few sewn patches and a knitted grey scarf. Gentle, tired, kind face.\n'
        'He must look clearly OLD and clearly different from a young hero cat: sagging shoulders, grey muzzle, '
        'white eyebrows. Match the game art style: thick black outlines, flat colours with only subtle soft shading, '
        'chunky cute proportions. One character only, full body, centred, filling about 80% of the image, truly '
        'transparent RGBA background: no checkerboard drawing, no ground, no cast shadow, no text, no letters.'),
    'design_wood_sword': (
        'Create one PROP DESIGN for a cute cat-ninja card game: THE MASTER\'S OLD WOODEN SWORD.\n'
        'One old wooden practice sword shaped like a straight Chinese jian, shown whole and diagonally, point up to '
        'the right: pale LIGHT-BROWN honey-coloured wood worn smooth with a few small nicks along the edges; a plain '
        'wooden cross-guard; the GRIP wrapped in FADED BLUE cloth; a short RED CORD tied in a knot at the pommel; '
        'around the MIDDLE of the blade one thin COPPER STRIP is wrapped around a crack and held by two small round '
        'nail heads; the very TIP of the blade is wrapped in a small band of WHITE CLOTH. Those four details (blue '
        'grip, red cord, copper strip with two nails, white cloth tip) must all be clearly visible.\n'
        'Match the game art style: thick black outlines, flat colours with only subtle soft shading. The sword '
        'only, centred, filling about 85% of the image diagonally, truly transparent RGBA background: no '
        'checkerboard drawing, no hands, no characters, no ground, no cast shadow, no text, no letters.'),
}
DESIGN_NOTE = {
    'pigeon': 'Reference image {n} shows THE POSTMAN PIGEON\'s design: draw the pigeon exactly like it (plump '
              'blue-grey body, slate wing bars, orange beak and feet, brown mail satchel on a cross-body strap){cap}. '
              'It is a small side character, about as tall as the hero\'s head.\n',
    'grandpa': 'Reference image {n} shows THE OLD GRANDPA CAT\'s design: draw him exactly like it (old dark-brown '
               'mackerel tabby, grey muzzle, white eyebrows, big round wire glasses, patched olive-brown quilted '
               'jacket, grey knitted scarf). He is a different cat from the hero.\n',
    'sword': 'Reference image {n} shows THE MASTER\'S OLD WOODEN SWORD: draw it exactly like it - pale light-brown '
             'wood, grip wrapped in faded blue cloth, a red cord at the pommel, a thin copper strip with two small '
             'nails around the middle of the blade, white cloth wrapped around the tip. It is the same sword in every '
             'picture.\n',
    'shadow': 'Reference image {n} shows this hero\'s SHADOW DOUBLE (an enemy of this game): the shadow in this '
              'picture has the same silhouette and the same outline features as it{shadow_extra}.\n',
    'dummy': 'Reference image {n} shows the WOODEN TRAINING DUMMY of this game: draw the dummy exactly like it '
             '(a thick upright wooden post with short round wooden arms), without a face.\n',
}

# ---------------------------------------------------------------- 角色專屬的小地方（照四份文字）

# 影子的輪廓要看得出是誰（劇本 B1 圖面）
SHADOW_MARK = {
    'ninja': 'the headband knot with its two long tails',
    'feifei': 'the ribbon bow and the spiky ponytail on the head',
    'dangdang': 'the two thick forearm bracers',
    'fengfeng': 'the straight sword',
}
# 影子練的是誰的招（B1 主圖、B2）
SHADOW_MOVE = {
    'ninja': 'a claw strike, one paw thrust forward with the claws out',
    'feifei': 'a needle throw, one arm flicking forward with three thin needles between the fingers',
    'dangdang': 'a bracer block, both forearms raised in front with the feet planted wide apart',
    'fengfeng': 'a straight sword thrust, the sword arm extended',
}
# B1 ①：跑太急撞到哪裡
BUMP = {
    'ninja': 'rubbing a small red bump on his FOREHEAD with one paw, eyes squeezed a little',
    'feifei': 'rubbing her sore KNEE with both paws, a small tear at the corner of her eye',
    'dangdang': 'rubbing his numb KNEE with one big white paw, calm frowning face',
    'fengfeng': 'holding his scraped SHOULDER with one paw (a small pale scuff on the sleeve, no blood), catching his breath',
}
# B1 ②：舉火把改招、B2 ②：跟著比同一個姿勢、B3 ③：收勢
POSE_TRY = {
    'ninja': 'one paw swiping forward in a neat, lower claw strike',
    'feifei': 'one arm flicking a thin gold needle forward with a loose, relaxed wrist',
    'dangdang': 'feet planted wide apart, one copper-bracered forearm pushed forward',
    'fengfeng': 'drawing his straight sword smoothly back toward the scabbard at his side',
}
FINISH = {
    'ninja': 'standing in a closing stance, paws together in front of his chest, one paw loosely fisted',
    'feifei': 'standing in a closing stance, her bamboo water tube held upright in one paw at her side',
    'dangdang': 'standing firm with his feet wide apart, both bracered forearms lowered in a closing stance',
    'fengfeng': 'standing in a closing stance, his sword just sheathed, one paw resting on the hilt at his waist',
}
# A3 ②：小孫女的蠟筆畫裡被誇大的特徵
CRAYON = {
    'ninja': ('a round cat whose headband is RED and tied into one GIANT red bow bigger than its head', ''),
    'feifei': ('a cat holding a SUPER-LONG needle, much longer than its body, smiling', ''),
    'dangdang': ('a cat drawn as TWO SQUARES stacked with a CIRCLE on top, its two arms drawn as two shiny '
                 'COPPER-coloured blocks', ''),
    'fengfeng': ('a cat holding a SWORD TWICE AS LONG AS ITS BODY, a red scarf flying up high', ''),
}
# A3 ③：照小孩的畫擺出來的誇張招式
WILD_MOVE = {
    'ninja': 'QIUQIU spins in mid-air three times - a big golden swirl of motion lines circles around him, his '
             'claws glowing warm gold - clearly airborne above the stone floor, delighted.',
    'feifei': 'FEIFEI has just flung a fan of needles that burst into a whole scattered sheet of tiny GOLDEN STAR '
              'DOTS in the air in front of her, and she stares at it amazed.',
    'dangdang': 'DANGDANG stands with his feet wide apart and both copper-bracered forearms thrust forward, and a '
                'strong wind (drawn as solid creamy-white swoosh shapes with outlines) splits around his arms and '
                'does not reach behind him; the pigeon shelters behind his back.',
    'fengfeng': 'FENGFENG has just drawn and re-sheathed his sword in one motion - his paw rests on the hilt at his '
                'waist - and on the ground around him fallen autumn leaves are swept up into one neat swirling ring.',
}
# A2 ①：念信時的樣子
READ_ALOUD = {
    'ninja': 'QIUQIU scratches the back of his head with an embarrassed grin (he has just misread a word), while the '
             'grandpa laughs so hard his round glasses are knocked crooked.',
    'feifei': 'FEIFEI\'s eyes are wet with tears as she reads; the grandpa gently pats her paw with his.',
    'dangdang': 'DANGDANG holds a small pair of pliers in one paw (he has just tightened the loose arm of the '
                'grandpa\'s glasses); the grandpa\'s glasses now sit straight and he looks at the letter.',
    'fengfeng': 'FENGFENG reads calmly and steadily, the letter spread flat in both paws; the grandpa listens '
                'quietly, his paws folded.',
}
# A2 ②：信紙上唯一的記號（不寫字）
LETTER_MARK = {
    'ninja': 'a tiny ink drawing of a little dried fish at the bottom corner',
    'feifei': 'a tiny ink drawing of a little flower at the bottom corner',
    'dangdang': 'one small hole poked through the paper where the brush pressed too hard',
    'fengfeng': 'a neatly folded envelope lying beside it, marked only with a paw-print stamp',
}
# A1 主圖：開頭那一句
PIGEON_OPEN = {
    'ninja': 'QIUQIU stands under the window looking up at it with wide eyes.',
    'feifei': 'FEIFEI stands under the window holding one fallen envelope in her paws, looking up with worried eyes.',
    'dangdang': 'DANGDANG stands under the window looking up with a squint, studying the tangled strap and its buckle.',
    'fengfeng': 'FENGFENG stands under the window holding one fallen envelope, looking up calmly.',
}
# A1 ①：疊信的方式
STACK = {
    'ninja': 'QIUQIU',
    'feifei': 'FEIFEI',
    'dangdang': 'DANGDANG (stacking them neatly by size)',
    'fengfeng': 'FENGFENG (sorting them into three small bundles, each tied with string)',
}
# B3 開頭：抬頭看的反應
TRUTH_LOOK = {
    'ninja': 'QIUQIU stands on the stone platform below, looking up at it, surprised and serious',
    'feifei': 'FEIFEI stands on the stone platform below, one paw raised toward it, looking up with worried eyes',
    'dangdang': 'DANGDANG stands on the stone platform below, looking up at it steadily',
    'fengfeng': 'FENGFENG stands on the stone platform below, one paw on his sword hilt, looking up at it calmly',
}

# ---------------------------------------------------------------- 場景（照劇本各篇「圖面」）

DUNGEON = ('SETTING: the stone dungeon at the bottom of the tower - rough grey stone-block walls and floor, lit warm '
           'orange by a burning TORCH in an iron wall bracket on the LEFT side.')
ATTIC = ('SETTING: a wooden attic in the middle floors of the tower at night - dark sloping wooden roof beams '
         'overhead, a pile of old wooden boxes and crates, a small ROUND WINDOW letting in pale moonlight, and one '
         'glowing paper lantern hanging from a beam. The floor is wooden planks with a square ladder hatch.')
ROOFTOP = ('SETTING: night at the very top of the tower - a flat grey stone platform with an old wooden railing along '
           'its edge, a big pale-yellow FULL MOON disc floating behind (a solid circle with an outline, no sky filled '
           'in around it).')
TOP_STEPS = ('SETTING: night at the very top of the tower - a big pale-yellow FULL MOON disc floating behind (a '
             'solid circle with an outline, no sky filled in around it), a flat grey stone platform, and grey stone '
             'STEPS leading up and away toward the highest level; the upper steps are shrouded in a thick PURPLE '
             'MIST drawn as solid, opaque, irregular cloud shapes with dark outlines (like the tower\'s demon miasma).')
DOJO = ('SETTING: a wooden training room in the middle floors of the tower at NIGHT, seen through a Japanese PAPER '
        'SLIDING DOOR (shoji: a wooden lattice frame with white paper panels) in the foreground; inside, a wooden '
        'floor lit by a warm paper lamp.')
PIGEON = ('the POSTMAN PIGEON (reference image 3)')
SWORD = ('the MASTER\'S OLD WOODEN SWORD (see its reference image: pale wood, faded blue cloth grip, red cord, '
         'copper strip with two nails mid-blade, white cloth on the tip)')


def standing_shadow(hero: str) -> str:
    return (f'The SHADOW is a solid standing shadow copy of {HERO_NAME[hero]}: the same silhouette and outline '
            f'features ({SHADOW_MARK[hero]} clearly readable), its whole body one flat DARK VIOLET-GREY colour with '
            f'no fur detail, and two soft PALE VIOLET dot eyes - calm and quiet, NOT menacing, fainter and less '
            f'fierce than the shadow in reference image 3, only a few small solid smoke wisps at its edges')


def scenes(hero: str) -> dict[str, tuple[int, str, list[str]]]:
    """這一隻的每一張：代號 → (第幾關, 畫什麼, 第 3 張起的配角參考)。"""
    he, his, him = PRONOUN[hero]
    name = HERO_NAME[hero]
    He = he.capitalize()
    wall = (f'On the OPPOSITE stone wall there is a FLAT SILHOUETTE - a shadow cast on the wall, perfectly flat like '
            f'paint on the stones, NOT a standing figure - with exactly {name}\'s outline ({SHADOW_MARK[hero]} '
            f'clearly readable), filled one flat DARK VIOLET-GREY colour (never green, never black ink), ')
    return {
        # ---- A1 迷路的郵差鴿（塔下）
        'pigeon_lost': (1, (
            f'{DUNGEON} High up on the stone wall is one small IRON-BARRED WINDOW. {PIGEON} is stuck in it: its navy '
            f'postman cap has slipped crooked over one eye, its satchel strap is tangled around the iron bars, and its '
            f'wings are flapping wide open in a panic. More than ten plain envelopes are scattered over the floor; the '
            f'envelope in front has a small cat PAW PRINT drawn where the stamp goes (the envelopes have no writing). '
            f'{PIGEON_OPEN[hero]}'), ['pigeon']),
        'pigeon_lost_r0': (1, (
            f'{DUNGEON} Below the small iron-barred window, {STACK[hero]} crouches on the floor squaring a neat stack '
            f'of plain envelopes; the back of {his} paw shows one or two thin red scratch lines (no blood). '
            f'{PIGEON} stands proudly on top of the neat stack of letters with its chest puffed out, its navy cap now '
            f'set straight, looking grateful.'), ['pigeon']),
        'pigeon_lost_r1': (1, (
            f'{DUNGEON} {PIGEON} flies away OUT through the small iron-barred window high on the wall, seen from '
            f'behind, a snapped strap end dangling from the bars. In mid-air below it falls a small tied cloth bundle '
            f'(its thank-you gift). {name} catches the bundle with one paw while {his} other paw reaches toward the '
            f'envelopes still scattered all over the floor, with a "huh?" expression.'), ['pigeon']),
        # ---- A2 給爺爺的信（塔中閣樓）
        'pigeon_grandpa': (2, (
            f'{ATTIC} {PIGEON} perches on a roof beam with ONE WING hanging down limp (it is hurt), panting. Among the '
            f'old boxes huddles THE OLD GRANDPA CAT (reference image 4), holding a plain envelope (only a paw-print '
            f'stamp on it, no writing) at arm\'s length, squinting at it through his round glasses'
            f'{", which have slipped down his nose" if hero == "dangdang" else ""}. {name} has just climbed up through '
            f'the ladder hatch and stands at the top of the ladder, one paw still held out toward the grandpa - {he} '
            f'has just handed him the letter.'), ['pigeon', 'grandpa']),
        'pigeon_grandpa_r0': (2, (
            f'{ATTIC} {name} sits on the floor beside THE OLD GRANDPA CAT (reference image 3), holding an opened '
            f'letter and reading it aloud; the letter paper shows only a child\'s simple crayon drawing of two orange '
            f'persimmons and a little bow (no writing). {READ_ALOUD[hero]}'), ['grandpa']),
        'pigeon_grandpa_r1': (2, (
            f'{ATTIC} A low wooden box is used as a desk; on it lie a sheet of paper, an ink brush rest and an ink '
            f'stone. {name} holds an ink brush and writes on the paper, concentrating; THE OLD GRANDPA CAT (reference '
            f'image 3) sits right beside {him} dictating, and steadies {name}\'s wrist with one paw. The paper is still '
            f'mostly blank: the only mark on it is {LETTER_MARK[hero]} (no letters, no characters, no writing).'),
            ['grandpa']),
        'pigeon_grandpa_r2': (2, (
            f'{ATTIC} Seen from behind, {name} climbs down the wooden ladder through the hatch, a small wrapped pack of '
            f'dried fish tucked under one arm. Up in the attic above {him}, THE OLD GRANDPA CAT (reference image 3) '
            f'holds the letter right up against his round glasses, reading it slowly.'), ['grandpa']),
        # ---- A3 風裡的回信（塔頂夜空）
        'pigeon_reply': (3, (
            f'{ROOFTOP} A cloth banner on a pole is blown slanted by a strong night wind. {PIGEON} has just crash-landed: '
            f'its feathers are ruffled and messy, it has NO CAP now, and it leans against {name}\'s feet clutching a '
            f'small parcel wrapped in old cloth and tied with string. {name} crouches down to take the parcel from it.'),
            ['pigeon_nocap']),
        'pigeon_reply_r0': (3, (
            f'{ROOFTOP} {name} holds up in both paws a small object half wrapped in old cloth, a warm GOLDEN light '
            f'glowing out of the gap in the cloth (the object itself is hidden, only its glow shows). {PIGEON} (no cap, '
            f'ruffled feathers) stands beside {him} with its chest puffed out proudly.'), ['pigeon_nocap']),
        'pigeon_reply_r1': (3, (
            f'{ROOFTOP} {name} sits on the floor leaning back against the wooden railing, looking at a CRAYON DRAWING '
            f'held up in both paws, facing the viewer so the drawing is clearly visible. The drawing is obviously made '
            f'by a small child: wobbly lines, colours scribbled outside the lines, on cream paper - it shows '
            f'{CRAYON[hero][0]} (no writing on it). {name} looks at it with a soft, touched smile. {PIGEON} (no cap, '
            f'ruffled feathers) sleeps curled up against {his} side.'), ['pigeon_nocap']),
        'pigeon_reply_r2': (3, (
            f'{ROOFTOP} {WILD_MOVE[hero]} {PIGEON} (no cap, ruffled feathers) flaps its wings and cheers nearby. A '
            f'second sheet of paper lies on the floor showing a child\'s crayon drawing of that same move (no '
            f'writing).'), ['pigeon_nocap']),
        # ---- B1 影子不見了（塔下）
        'shadow_loose': (1, (
            f'{DUNGEON} {name} stands in the torchlight in the middle and has NO SHADOW AT ALL: the lit stone floor '
            f'under and behind {him} is clean and bright, with nothing dark on it. {wall}posed in the middle of '
            f'practising {SHADOW_MOVE[hero]}. {name} is startled, eyes wide, pointing at the silhouette on the wall '
            f'with one paw.'), []),
        'shadow_loose_r0': (1, (
            f'SETTING: a grey stone staircase in the dungeon at the bottom of the tower, lit warm orange by a burning '
            f'wall torch. {name} sits on a step {BUMP[hero]}. Up at the turn of the stairs, on the stone wall, a FLAT '
            f'SILHOUETTE (a shadow cast on the wall, perfectly flat, NOT a standing figure) with {name}\'s outline '
            f'({SHADOW_MARK[hero]} readable), filled flat DARK VIOLET-GREY, looks back over its shoulder at {him}. '
            f'There is no shadow on the steps under {name}.'), []),
        'shadow_loose_r1': (1, (
            f'{DUNGEON} {name} holds up a burning torch in one paw; now a normal, soft grey shadow lies on the floor at '
            f'{his} feet, attached to {him} again like an ordinary shadow. {He} tries a move - {POSE_TRY[hero]} - with '
            f'an "oh, I see!" expression of sudden understanding.'), []),
        # ---- B2 偷練的影子（塔中練功房，夜）
        'shadow_study': (2, (
            f'{DOJO} In the front, {name} crouches OUTSIDE the paper door peeking in through the gap of the slightly '
            f'open door, only {his} face and paws at the edge. Inside the room, the SHADOW practises on a WOODEN '
            f'TRAINING DUMMY (reference image 4): {SHADOW_MOVE[hero]}. {standing_shadow(hero)}.'
            + {'ninja': ' The dummy has several fresh claw scratches on it.',
               'feifei': ' Several thin needles are stuck into the dummy, all in one single spot.',
               'dangdang': ' The dummy is being pushed back by its bracer.',
               'fengfeng': ' The sword tip stops a finger\'s width from the dummy without touching it.'}[hero]),
            ['shadow', 'dummy']),
        'shadow_study_r1': (2, (
            f'{DOJO} It is DAWN: pale early-morning light. The paper sliding door stands half open. In the back of the '
            f'room the SHADOW is leaving through a small window, seen from behind as it climbs out. '
            f'{standing_shadow(hero)}. Outside the door in the front, {name} copies the move {he} just watched: '
            f'{POSE_TRY[hero]}, concentrating.'), ['shadow']),
        # ---- B3 影子的真面目（塔頂夜空）
        'shadow_truth': (3, (
            f'{TOP_STEPS} On the lowest of the steps stands the SHADOW, hugging {SWORD} tightly to its chest with both '
            f'arms. {standing_shadow(hero)}. {TRUTH_LOOK[hero]}.'), ['shadow', 'sword']),
        'shadow_truth_r1': (3, (
            f'{TOP_STEPS} No shadow double in this picture - it has gone. {name} stands on the stone platform holding '
            f'{SWORD} across both open paws, looking down at it with a calm face and slightly wet eyes, touched. A '
            f'faint, ordinary soft grey shadow lies on the floor at {his} feet again.'), ['sword_only']),
        'shadow_truth_r2': (3, (
            f'{TOP_STEPS} Seen from behind, the SHADOW walks up the stone steps hugging {SWORD}, its upper half already '
            f'disappearing into the purple mist. {standing_shadow(hero)}. Below on the stone platform, {name} is '
            f'{FINISH[hero]}, looking up and watching it go.'), ['shadow', 'sword']),
    }


# 連線限定三篇：純場景（劇本第六節「圖面」），不畫任何主角
COOP_SCENES: dict[str, tuple[int, str]] = {
    'coop_rope_bridge': (1, (
        'SETTING: the stone dungeon at the bottom of the tower, lit warm orange by a wall torch. A deep dark CHASM '
        'splits the stone floor across the middle of the picture. Over it hangs a rickety ROPE BRIDGE of old, rotten '
        'wooden planks. On the far side, on a stone ledge, stands a TREASURE CHEST with a monster-face pattern '
        'carved on its lid, closed. On the near side at the head of the bridge stands a thick wooden POST with a '
        'coil of rope tied to it; carved into the post is one single cat PAW PRINT mark (no letters).')),
    'coop_rope_bridge_r0': (1, (
        'SETTING: the same stone dungeon chasm with the rickety plank rope bridge, lit warm orange by a wall torch. '
        'On the far ledge the TREASURE CHEST with the carved monster-face pattern stands OPEN and EMPTY. The rope '
        'tied to the thick wooden post at the near bridge head is pulled TAUT and STRAIGHT across the chasm, its '
        'strands frayed and fuzzy where it rubbed. On the stone floor beside the post are two long DRAG MARKS left '
        'by claws digging in.')),
    'coop_rope_bridge_r2': (1, (
        'SETTING: the same stone dungeon chasm with the rickety plank rope bridge, lit warm orange by a wall torch. '
        'The TWO planks nearest the bridge head are MISSING (a clear gap). The treasure chest with the carved '
        'monster-face pattern still sits closed on the far ledge. In one corner of the picture, at a stair landing, '
        'stands a small unattended SECOND-HAND JUNK STALL (a low wooden stall with some old pots and odds and ends) '
        'with the two old wooden planks leaning against it.')),
    'coop_seesaw': (2, (
        'SETTING: a wooden machinery room in the middle floors of the tower. A GIANT WOODEN SEESAW stands on a big '
        'central wooden GEAR axle. One end is raised high, right up to a wooden SHELF near the ceiling beams; on '
        'that shelf sit a small tied CLOTH BUNDLE and a small WOODEN BOX. The other end rests down on the floor, and '
        'carved into the floorboards next to it is one single cat PAW PRINT mark (no letters).')),
    'coop_seesaw_r0': (2, (
        'SETTING: the same wooden machinery room with the GIANT WOODEN SEESAW on its central gear axle, one end high, '
        'one end low. The wooden SHELF up by the ceiling beams is now EMPTY. On the floor beside the LOW end lies a '
        'small opened bag of dried fish, a few little dried fish spilling out.')),
    'coop_seesaw_r2': (2, (
        'SETTING: the same wooden machinery room with the GIANT WOODEN SEESAW on its central gear axle. The seesaw '
        'now rests perfectly LEVEL, and both of its seats are rubbed smooth and SHINY from use. On the floor lie two '
        'squashed flat cushions and a dropped towel.')),
    'coop_shooting_star': (3, (
        'SETTING: night at the very top of the tower - a flat grey stone platform. On it sits a round WISHING STONE '
        'with two paw-print hollows pressed into its top: one DEEP and worn, one SHALLOW and faint. Carved on the '
        'side of the stone are only two small paw-print symbols (no letters). Above, a SHOOTING STAR streaks in '
        'toward it from the upper left: a bright star with a long golden tail, drawn as a solid golden shape with '
        'an outline, with a few small solid star sparkles (no sky filled in around it).')),
    'coop_shooting_star_r0': (3, (
        'SETTING: night at the very top of the tower - the same flat grey stone platform and round WISHING STONE with '
        'two paw-print hollows. Only ONE of the two paw prints is GLOWING warm gold; the other stays dark. The '
        'SHOOTING STAR has already flown far away and is now small, near the far edge of the picture, its golden '
        'tail trailing behind it (drawn as a solid golden shape with an outline, no sky filled in around it).')),
    'coop_shooting_star_r2': (3, (
        'SETTING: night at the very top of the tower - the same flat grey stone platform and round WISHING STONE with '
        'two paw-print hollows. BOTH paw prints are GLOWING warm gold, exactly equally bright. Above, the SHOOTING '
        'STAR\'s golden tail SPLITS INTO TWO equal golden streaks (drawn as solid golden shapes with outlines, a few '
        'small solid star sparkles, no sky filled in around it).')),
}

# ---------------------------------------------------------------- 提示詞

HEAD = (
    'Create one new EVENT ILLUSTRATION for a cute cat-ninja card game. It is a cut-out vignette: only the '
    'characters and the few props of the scene (with at most a small patch of floor, wall or steps around them), '
    'on a truly transparent background.\n'
    'Reference image 1 is the hero\'s CURRENT official look: copy {name}\'s face, fur colours and markings, the head '
    'size relative to the body, the body proportions, the outfit and its colours EXACTLY from it. The hero is {look}.\n'
    'Reference image 2 is an existing event illustration from this game set in the same part of the tower: copy its '
    'ART STYLE (bold dark hand-drawn outlines, flat colours with soft cel shading, chunky cute chibi proportions, '
    'the colours of the setting) and the way the scene is cut out on a transparent background. Do NOT copy its '
    'composition or its props, and do NOT take the hero\'s look from it - the look comes ONLY from reference image 1.\n'
)
COOP_HEAD = (
    'Create one new EVENT ILLUSTRATION for a cute cat-ninja card game. It is a cut-out vignette of a PLACE with NO '
    'CHARACTERS AT ALL: only the props of the scene and a small patch of floor around them, on a truly transparent '
    'background. (In the game, the two heroes\' portraits stand on either side of this picture, so it must stay '
    'empty of anyone.)\n'
    'Reference image 1 is a piece of an existing event illustration from this game set in the same part of the '
    'tower, shown ONLY for its ART STYLE (bold dark hand-drawn outlines, flat colours with soft cel shading, the '
    'colours of the setting) and the cut-out look. Do NOT copy its props or composition.\n'
)
TAIL = (
    'Only the figures listed above appear - no other cats, no other copies of the hero, no enemies, no master, '
    'no extra animals. No text, no letters, no numbers, no writing of any kind (letters, envelopes and papers carry '
    'only simple pictures or paw prints, never words), no speech bubbles, no frame, no border. Truly transparent RGBA '
    'background: no checkerboard drawing, no white box, no wall or sky filling the whole frame, no cast shadow '
    'outside the small floor patch. The whole scene is centred with a clear transparent margin on every side; '
    'nothing is cut off at the edges.\n'
    'Style: thick black outlines, FLAT colours with only subtle soft shading - not painterly, no heavy airbrushed '
    'shadows, cute cartoon, not photorealistic. THE FACE ESPECIALLY: flat blocks of colour with hard edges between '
    'them; no shaded blob around the muzzle, no glow on the cheeks.\n'
)
COOP_TAIL = (
    'NOBODY is in this picture: no cats, no heroes, no people, no animals, no silhouettes, no hands. No text, no '
    'letters, no numbers, no writing of any kind, no frame, no border. Truly transparent RGBA background: no '
    'checkerboard drawing, no white box, no wall or sky filling the whole frame. The whole scene is centred with a '
    'clear transparent margin on every side; nothing is cut off at the edges.\n'
    'Style: thick black outlines, FLAT colours with only subtle soft shading - not painterly, no heavy airbrushed '
    'shadows, cute cartoon.\n'
)

# 名 → (角色或 None（純場景）, 第幾關, 畫什麼, 配角參考清單, 代號)
EVENT_JOBS: dict[str, tuple[str | None, int, str, list[str], str]] = {}
for _h in HEROES:
    for _stem, (_act, _what, _extra) in scenes(_h).items():
        EVENT_JOBS[event_name(_h, _stem)] = (_h, _act, _what, _extra, _stem)
for _stem, (_act, _what) in COOP_SCENES.items():
    EVENT_JOBS[f'event_{_stem}'] = (None, _act, _what, [], _stem)

# 每一篇（聯絡表、鍵名表用）：代號 → 結果圖序號
EVENTS: dict[str, list[int]] = {
    'pigeon_lost': [0, 1], 'pigeon_grandpa': [0, 1, 2], 'pigeon_reply': [0, 1, 2],
    'shadow_loose': [0, 1], 'shadow_study': [1], 'shadow_truth': [1, 2],
    'coop_rope_bridge': [0, 1, 2], 'coop_seesaw': [0, 1, 2], 'coop_shooting_star': [0, 1, 2],
}


def extra_refs(hero: str, extra: list[str]) -> tuple[list[Path], str]:
    """配角參考圖（第 3 張起）與對應的說明。"""
    paths: list[Path] = []
    notes = ''
    for tag in extra:
        n = 3 + len(paths)
        if tag in ('pigeon', 'pigeon_nocap'):
            paths.append(REF / 'design_pigeon.png')
            cap = (' - but in THIS picture it has LOST its cap: no cap on its head, feathers ruffled'
                   if tag == 'pigeon_nocap' else ', and its small navy postman cap')
            notes += DESIGN_NOTE['pigeon'].format(n=n, cap=cap)
        elif tag == 'grandpa':
            paths.append(REF / 'design_grandpa.png')
            notes += DESIGN_NOTE['grandpa'].format(n=n)
        elif tag in ('sword', 'sword_only'):
            paths.append(REF / 'design_wood_sword.png')
            notes += DESIGN_NOTE['sword'].format(n=n)
        elif tag == 'shadow':
            paths.append(REF / f'shadow_{hero}.png')
            notes += DESIGN_NOTE['shadow'].format(
                n=n, shadow_extra=', but it is calmer: a flat dark violet-grey body and two soft pale violet dot eyes')
        elif tag == 'dummy':
            paths.append(REF / 'wood_dummy.png')
            notes += DESIGN_NOTE['dummy'].format(n=n)
    return paths, notes


def cast_line(hero: str, stem: str, extra: list[str]) -> str:
    """畫面裡准出現的全部：配合結尾那句「只准出現上面列的」，影子那幾張要把影子也列進來，不然會被當成多畫的一隻。"""
    names = [HERO_NAME[hero]]
    if 'pigeon' in extra or 'pigeon_nocap' in extra:
        names.append('the postman pigeon')
    if 'grandpa' in extra:
        names.append('the old grandpa cat')
    if 'shadow' in extra:
        names.append(f'{HERO_NAME[hero]}\'s shadow double described above (a dark violet-grey shadow copy)')
    if stem in ('shadow_loose', 'shadow_loose_r0'):
        names.append('the FLAT silhouette on the wall described above (a shadow painted flat on the stones, not a '
                     'second cat)')
    return 'The ONLY figures in this picture: ' + '; '.join(names) + '.\n'


def prompt_for(name: str) -> str:
    if name in DESIGN_JOBS:
        return DESIGN_JOBS[name]
    hero, _, what, extra, stem = EVENT_JOBS[name]
    if hero is None:
        return COOP_HEAD + f'SCENE: {what}\n' + COOP_TAIL
    look = LOOK[c1.LOOK_KEY[hero]].replace('dark-brown face mask', 'dark-brown face markings')
    _, notes = extra_refs(hero, extra)
    return (HEAD.format(name=HERO_NAME[hero], look=look) + notes + f'SCENE: {what}\n' + cast_line(hero, stem, extra)
            + TAIL + c1.hero_rules(hero))


def refs_for(name: str) -> list[Path]:
    if name in DESIGN_JOBS:
        return []
    hero, act, _, extra, _ = EVENT_JOBS[name]
    if hero is None:
        return [REF / f'coop_style_{act}.png']
    paths, _ = extra_refs(hero, extra)
    return [REF / f'idle_{hero}.png', REF / f'scene_{hero}_{act}.png'] + paths


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        on_white(idle_frame(c1.LOOK_KEY[hero]), .8).save(REF / f'idle_{hero}.png')
        for act, stem in ACT_SCENE.items():
            src = ROOT / 'public/assets/bg' / f'{event_name(hero, stem)}.webp'
            c1.white(Image.open(src), (1024, 768)).save(REF / f'scene_{hero}_{act}.png')
        shadow = 'shadow_cat' if hero == 'ninja' else f'shadow_{hero}'
        c1.white(Image.open(ROOT / f'public/assets/monsters/{shadow}_idle.webp'), (1024, 1024)).save(
            REF / f'shadow_{hero}.png')
    c1.white(Image.open(ROOT / 'public/assets/monsters/wood_dummy_idle.webp'), (1024, 1024)).save(REF / 'wood_dummy.png')
    for act, (stem, (l, t, r, b)) in COOP_STYLE.items():
        im = Image.open(ROOT / 'public/assets/bg' / f'{stem}.webp').convert('RGBA')
        w, h = im.size
        c1.white(im.crop((round(l * w), round(t * h), round(r * w), round(b * h))), (1024, 768)).save(
            REF / f'coop_style_{act}.png')
    print(f'參考圖已輸出到 {REF}（配角設計圖要先 gen 再 design 定稿）')


# ---------------------------------------------------------------- 生

def generate(name: str, note: str = '') -> tuple[str, int, str]:
    with c1._LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f'\n{note}' if note else '')
    missing = [p for p in refs_for(name) if not p.exists()]
    if missing:
        (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
        return name, attempt, f'缺參考圖 {[p.name for p in missing]}（先跑 refs／design）'
    size = '1024x1024' if name in DESIGN_JOBS else '1536x1024'
    command = [sys.executable, str(c1.IMAGE_GEN), 'edit' if refs_for(name) else 'generate', '--backend',
               'codex-oauth', '--model', 'gpt-image-1.5', '--background', 'transparent', '--size', size,
               '--quality', 'high', '--prompt', text]
    for ref in refs_for(name):
        command += ['--image', str(ref)]
    command += ['--out', str(target), '--force']
    started = time.time()
    status = 'failed'
    for _ in range(8):
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-300:]}'
        if 'capacity' not in result.stderr:   # 伺服器滿載才等一下重試（codex_gen.py 坑 9）
            break
        time.sleep(40)
    (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
    c1.record(PROMPTS, name, {'attempt': attempt, 'status': status, 'prompt': text,
                              'refs': [p.name for p in refs_for(name)], 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


# ---------------------------------------------------------------- 挑

def design(name: str, attempt: int) -> None:
    """配角設計圖定稿：裁透明邊、鋪白底存成 `_ref/<名>.png`，之後每一張都附它。"""
    src = SOURCE / f'{name}.try{attempt}.png'
    im, _ = c1.clean(Image.open(src).convert('RGBA'), .004)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    c1.white(im, (1024, 1024)).save(REF / f'{name}.png')
    with c1._LOCK:
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        picks[name] = {'attempt': attempt, 'ref': (REF / f'{name}.png').relative_to(ROOT).as_posix(),
                       'at': time.strftime('%Y-%m-%d %H:%M:%S')}
        PICKS.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{name} 定稿第 {attempt} 次 → {REF / f"{name}.png"}')


def pick(name: str, attempt: int, force: bool = False) -> None:
    src = SOURCE / f'{name}.try{attempt}.png'
    if not src.exists():
        raise SystemExit(f'找不到 {src.name}')
    raw = Image.open(src).convert('RGBA')
    errs = c1.gate(name, raw)
    if errs and not force:
        raise SystemExit(f'{name} 第 {attempt} 次沒過閘門：' + '；'.join(errs))
    cleaned, dropped = c1.clean(raw, .0015)
    out_img = c1.fit_event(cleaned)
    target = BG / f'{name}.webp'
    out_img.save(target, 'WEBP', quality=80, method=6)
    data = target.read_bytes()
    a = np.array(out_img)[..., 3]
    semi = float(((a > 0) & (a < 248)).sum() / max(1, (a > 0).sum()))
    with c1._LOCK:
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        picks[name] = {'attempt': attempt, 'key': f'bg/{name}', 'file': target.relative_to(ROOT).as_posix(),
                       'sourceSize': list(raw.size), 'size': list(out_img.size), 'bytes': len(data),
                       'droppedSpecks': dropped, 'semiTransparentShare': round(semi, 4),
                       'gate': errs, 'sha256': hashlib.sha256(data).hexdigest(),
                       'at': time.strftime('%Y-%m-%d %H:%M:%S')}
        PICKS.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{name} 採用第 {attempt} 次 → {target.relative_to(ROOT).as_posix()}（{len(data)} 位元組，'
          f'清掉碎點 {dropped} 塊，半透明 {semi:.1%}）→ 鍵 bg/{name}（先不登記，接線時跑 register）')


def register() -> None:
    """接線時一次登記：`picks.json` 裡挑定的每一張，加上連線三篇 `_r1` 指向 `_r0` 同一個檔。"""
    picks = json.loads(PICKS.read_text(encoding='utf-8'))
    missing = [n for n in EVENT_JOBS if n not in picks]
    if missing:
        raise SystemExit(f'這幾張還沒挑定：{missing}')
    entries = {picks[n]['key']: picks[n]['file'].removeprefix('public/') for n in EVENT_JOBS}
    for alias, same in ALIAS.items():
        entries[f'bg/{alias}'] = picks[same]['file'].removeprefix('public/')
    c1.register({'bg': entries})
    print(f'清單已登記 {len(entries)} 筆（{len(EVENT_JOBS)} 張圖＋連線對調選項 {len(ALIAS)} 個共用鍵）')


# ---------------------------------------------------------------- 聯絡表與鍵名

def event_rows(stem: str) -> list[str]:
    return [stem] + [f'{stem}_r{r}' for r in EVENTS[stem]]


def sheet(stem: str, out_dir: Path) -> None:
    """一篇一張：每一列一種（主圖、各結果圖），四隻並排（球球、菲菲、噹噹、封封）；連線篇一列三張。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    if stem.startswith('coop_'):
        files = [BG / f'event_{s}.webp' for s in event_rows(stem) if f'event_{s}' not in ALIAS]
        c1.contact(files, out_dir / f'c2a_{stem}_500.png', 500, 3)
        return
    files = [BG / f'{event_name(h, s)}.webp' for s in event_rows(stem) for h in HEROES]
    c1.contact(files, out_dir / f'c2a_{stem}_500.png', 500, 4)


def keys() -> None:
    lines = []
    for name in EVENT_JOBS:
        lines.append(f'bg/{name}\tpublic/assets/bg/{name}.webp')
    for alias, same in ALIAS.items():
        lines.append(f'bg/{alias}\tpublic/assets/bg/{same}.webp（同一個檔）')
    sys.stdout.write('\n'.join(lines) + '\n')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    sub.add_parser('keys')
    sub.add_parser('register', help='接線時：把挑定的圖全部登記進清單')
    p = sub.add_parser('prompt')
    p.add_argument('name')
    g = sub.add_parser('gen')
    g.add_argument('names', nargs='+')
    g.add_argument('--jobs', dest='workers', type=int, default=3)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('name')
    k.add_argument('attempt', type=int)
    k.add_argument('--force', action='store_true', help='閘門沒過也收（要在報告寫原因）')
    d = sub.add_parser('design')
    d.add_argument('name')
    d.add_argument('attempt', type=int)
    s = sub.add_parser('sheet')
    s.add_argument('stem')
    s.add_argument('out_dir')
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'keys':
        keys()
    elif args.command == 'register':
        register()
    elif args.command == 'prompt':
        print(prompt_for(args.name))
    elif args.command == 'pick':
        pick(args.name, args.attempt, args.force)
    elif args.command == 'design':
        design(args.name, args.attempt)
    elif args.command == 'sheet':
        sheet(args.stem, Path(args.out_dir))
    else:
        unknown = [n for n in args.names if n not in EVENT_JOBS and n not in DESIGN_JOBS]
        if unknown:
            raise SystemExit(f'沒有這幾張：{unknown}')
        SOURCE.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, attempt, status in pool.map(lambda n: generate(n, args.note), args.names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
