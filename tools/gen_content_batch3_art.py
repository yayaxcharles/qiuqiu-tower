"""內容擴充第三批的圖（2026-09-23，批次 c3，美術代理 art5）：約 130 張。

規格來源（圖面描述的唯一來源）：派工暫存區 `content/design3_大結構.md`（第二節開局祝福、第三節問號格、
第四節店主、第五節稀有事件、第六節淨化、第七節新秘寶；第八節總表）；主控裁決 `design3_主控裁決.md`
（第 2 條：「掉進貓薄荷田的大俠貓」用**替代版**——大俠貓本人不出場，只留貓薄荷田、壓扁的草、酒葫蘆和一撮毛；
①撿他掉的一頁筆記、③在他壓出來的窩裡睡一覺。那 16 張的圖面描述是照裁決改寫的，見 `catnip_master`）。
每一張的最終鍵名、檔名、對應設計稿哪一段另寫在派工暫存區 `batch3_art_keys.md`（也印得出來：`keys`）。

做法照前幾批（`gen_content_batch1_art.py` 的閘門、清碎點、補 4:3、聯絡表；`gen_content_batch2_art.py` 的
計數型右下角；`gen_content_batch2_events_a.py` 的配角設計圖先定稿；`gen_content_batch2_events_b.py` 的
場景參考與 `--force` 只放行透明比例 20～30%），gpt-image-1.5 真透明（codex-oauth）：
  - 圖示（祝福物品 15、新秘寶 9）：參考圖＝同類三張既有圖示拼一張（只取畫風），128×128、WebP q80。
    探路杖、箱中箱是計數型，右下角 44×44 留空（`fit_counter`）。
  - 淨化版秘寶 6：`edit` 附**原件**的圖，只改顏色與設計稿寫的細節，外形照原件
    （長明燈、大俠貓的舊護腕的原件是本批剛生的魔氣燈籠、舊護腕，挑定後才生淨化版）。
  - 事件圖（祝福主圖、問號格三種、稀有 5 篇、神龕新結果圖）：參考圖① 這隻的新版待機第 1 格（長相只照它）、
    ② 同一隻的既有事件圖（只取畫風）、③ 視需要（塔門、行腳商設計圖、紙箱、酒葫蘆圖示）。
    挑定後 560×420、WebP q80，存 `public/assets/bg/`。
  - 店主與行腳商立繪：先各生一張設計圖定稿（`design`），之後三個表情都附它＋橘貓老闆的招呼圖（只取畫風與取景）。
    挑定時**照頭寬縮放**（`--head` 給原檔上量到的頭寬，縮到橘貓老闆的 `HEAD_TARGET`），腳底貼下緣、水平置中，
    存 332×420 透明 WebP（q82，同 `add_sprite.py`）到 `public/assets/sprites/shop/`。

**只放檔、不登記素材清單**（派工單：程式接線時一次登記）：`pick` 不碰清單；接線時跑
`python tools/gen_content_batch3_art.py register`（照 `picks.json` 併進清單，兩格縮排、只加新行）。

用法：
    python tools/gen_content_batch3_art.py refs
    python tools/gen_content_batch3_art.py prompt event_rare_hot_spring
    python tools/gen_content_batch3_art.py gen bless_rations relic_herb_basket --jobs 4
    python tools/gen_content_batch3_art.py gen --group rare_hot_spring --jobs 4     # 一組全部（見 GROUPS）
    python tools/gen_content_batch3_art.py gen event_q_ambush --note "修正說明"
    python tools/gen_content_batch3_art.py design design_merchant 1                  # 配角設計圖定稿
    python tools/gen_content_batch3_art.py pick event_q_ambush 2 [--force]           # 裁、縮、存（不登記）
    python tools/gen_content_batch3_art.py pick keeper_curio 1 --head 402            # 立繪：原檔上量到的頭寬
    python tools/gen_content_batch3_art.py sheet <種類> <輸出資料夾>                    # 見 sheet()
    python tools/gen_content_batch3_art.py register [--dry-run]                      # 接線時：登記進清單
    python tools/gen_content_batch3_art.py keys
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
from PIL import Image, ImageDraw, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_content_batch1_art as c1  # noqa: E402
import gen_content_batch2_art as c2  # noqa: E402
from art_rules import FEIFEI_NOT_FAT, FEIFEI_NOT_HUMAN, gear_rule  # noqa: E402
from gen_rest_art import LOOK, idle_frame, on_white  # noqa: E402

ROOT = c1.ROOT
SOURCE = ROOT / 'tools/motion-art-source/c3'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
ASSETS = ROOT / 'public/assets'
ICONS = c1.ICONS
BG = c1.BG
SHOP = ASSETS / 'sprites/shop'
HEROES = c1.HEROES
NAME = c1.HERO_NAME

# 立繪畫布照橘貓老闆（`shop/keeper`，332×420，腳底貼下緣）
SPRITE_SIZE = (332, 420)
# 橘貓老闆的頭寬（鼻子那一列、臉頰外緣到外緣、不含耳朵，332×420 畫布上的像素）：招呼圖約 155、成交約 155、
# 錢不夠約 150（2026-09-23 在原圖上畫兩條直線對著臉頰驗過，量法見 `batch3_art_keys.md`）。
# 設計稿 1-3：「頭的大小跟橘貓老闆一樣（比頭不比外框）」
HEAD_TARGET = 153
# 照頭寬縮完塞不進 332×420 時，最多准頭再縮到目標的幾成（`--fit`）：超過這個就要重生，不偷偷縮
FIT_MIN = 0.95


def event_name(hero: str, stem: str) -> str:
    return c1.event_name(hero, stem)


class P:
    """這一隻在英文提示詞裡的名字與代名詞。"""

    def __init__(self, hero: str):
        self.hero = hero
        self.n = NAME[hero]
        self.he, self.his, self.him = c1.PRONOUN[hero]
        self.He, self.His = self.he.capitalize(), self.his.capitalize()


# ================================================================ 圖示

ICON_JOBS: dict[str, tuple[str, list[str], str]] = {
    # ---- 開局祝福的物品 15 件（設計稿 2-5；「沾了魔氣的舊護腕」直接用第七節那件秘寶的圖示，不另畫）
    'bless_rations': (
        'a TRAVEL RATION SACK: one plump little sack of rough tan burlap, bulging full; out of its open mouth peek '
        'TWO white rice balls (each with a dark seaweed band) and ONE small dried fish. Its drawstring is tied in a '
        'BIG, CROOKED, CLUMSY KNOT with two floppy loops and one long trailing tail.',
        ['potion_dried_fish_bundle', 'relic_greedy_pouch', 'potion_onigiri'], '乾糧袋'),
    'bless_coins': (
        'a SPILLING COIN PURSE: one small DEEP-BLUE cloth money pouch lying on its side with its mouth loosened '
        'open, and a whole handful of small golden-brown DRIED FISH sliding out of it in a little heap - the '
        'spilling fish are the main point of the picture.',
        ['relic_lucky_coin', 'potion_dried_fish_bundle', 'relic_fish_jar'], '零錢袋'),
    'bless_potions': (
        'an OLD NINJA-TOOL BELT POUCH: one flat, boxy, WORN brown LEATHER waist pouch with a belt loop on its back '
        'and a flap closed by a small brass buckle; from under the flap the necks of THREE small corked bottles '
        'poke out - one RED, one GREEN, one BLUE. Scuffed and well used. (A flat belt pouch with a flap, NOT a '
        'round drawstring sack.)',
        ['relic_master_belt', 'relic_wholesale_crate', 'potion_clone_oil'], '舊忍具袋'),
    'bless_charm': (
        'a LUCKY CHARM POUCH: one small rounded pouch-shaped good-luck charm of deep crimson brocade cloth with a '
        'rounded bottom, a big bold GOLD CAT PAW PRINT embroidered on its front, and a loop of thin red cord on '
        'top tied in a simple knot. (A soft little pouch - NOT a flat rectangular tag, NOT a bracelet.)',
        ['relic_bond_knot', 'relic_jade_pendant', 'relic_tassel_knot'], '護身符'),
    'bless_scissors': (
        'a PAIR OF OLD IRON SCISSORS: one pair of dark-iron scissors with its two handle loops wrapped in faded '
        'cloth strips, the blades slightly open, and TWO small snipped scraps of cream paper fluttering beside the '
        'blades.',
        ['relic_crane_bookmark', 'relic_coin_sword', 'relic_anvil'], '舊剪刀'),
    'bless_notes': (
        'a PRACTICE NOTEBOOK: one small stitched notebook lying OPEN, its two cream pages showing only two simple '
        'ink doodles of a little cat doing kung-fu moves (pictures, no writing), with a calligraphy brush resting '
        'across it.',
        ['relic_five_poison_manual', 'relic_worn_scroll', 'relic_crane_bookmark'], '練功筆記'),
    'bless_moves': (
        'a STACK OF TECHNIQUE SCROLLS: THREE small rolled-up paper scrolls stacked together and tied into one '
        'bundle with a red cord, the TOP scroll glowing with warm golden light from inside.',
        ['relic_scroll', 'potion_secret_scroll', 'relic_clone_scroll'], '一疊招式圖'),
    'bless_doodle': (
        'a DOODLE BOOK: one old worn notebook lying OPEN, both cream pages covered in wobbly childish doodles of '
        'cat kung-fu moves (little stick-like cat figures, no writing), and one bold curved ARROW looping round '
        'between the two pages (a swap sign).',
        ['relic_five_poison_manual', 'relic_scroll', 'potion_swap_talisman'], '塗鴉本'),
    'bless_treasure': (
        'a TIGHTLY WRAPPED TREASURE: one small square parcel wrapped in layer upon layer of DEEP-BLUE cloth and '
        'bound tight with THREE turns of cord, with bright warm GOLDEN LIGHT leaking out through the gaps in the '
        'folds.',
        ['relic_shared_bento', 'potion_bento', 'relic_tower_token'], '包得很緊的寶貝'),
    'bless_stash': (
        'a SECRET SAVINGS JAR: one small squat brown-grey CLAY jar with its mouth stuffed shut with a wad of '
        'cloth, a CRACK running down its belly, and through the crack you can see it is packed with small '
        'golden-brown dried fish.',
        ['relic_coin_jar', 'relic_piggy_bank', 'relic_fish_jar'], '私房錢'),
    'bless_box': (
        'an EMPTY TREASURE BOX: one small black-and-red LACQUERED wooden box standing OPEN with its lid tipped '
        'back; inside it is lined with red velvet, and in the middle of the velvet there is an EMPTY hollow shaped '
        'to hold one small object - clearly empty.',
        ['relic_master_seal', 'relic_dart_case', 'relic_sardine_tin'], '空的寶盒'),
    'bless_bottom': (
        'a PAW REACHING INTO A BUNDLE: one DEEP-BLUE cloth bundle with its opening gathered at the top, and ONE '
        'cat paw (just a furry paw and a little of the forearm, coming in from the upper side) reaching down into '
        'the opening, with a few small sparkles of something unclear glinting at the paw.',
        ['relic_onigiri_bag', 'relic_greedy_pouch', 'relic_potion_bag'], '包袱最底下'),
    'bless_dice': (
        'ONE BIG WHITE DIE: a single large chunky white cube die with rounded edges seen from a three-quarter '
        'view so exactly THREE faces show; its pips are small RED CAT PAW PRINTS instead of dots (one paw print '
        'on one face, two on the next, three on the third).',
        ['relic_daruma', 'relic_lucky_coin', 'relic_tower_token'], '一顆骰子'),
    'bless_scroll': (
        'an UNLABELLED OLD SCROLL: one rolled-up old scroll tied round the middle with rough hemp twine, its '
        'wooden end knobs faded and plain, no label, no seal, no writing; its paper edge has a big fold crease '
        'bent into the shape of a QUESTION MARK (a crease in the paper, not a written symbol).',
        ['relic_scroll', 'relic_clone_scroll', 'relic_bamboo_tube'], '沒貼標籤的卷軸'),
    'bless_wine': (
        'a SMALL BOTTLE OF MEDICINAL WINE: one small round-bellied brown CLAY bottle with a narrow neck stoppered '
        'with a scrap of red cloth, and a small blank square paper label stuck on its belly (plain paper, no '
        'writing).',
        ['relic_master_gourd', 'relic_qi_gourd', 'potion_iron_salve'], '一小瓶藥酒'),
    # ---- 新秘寶 9 件（設計稿 7-4）
    'relic_herb_basket': (
        'a HERB BASKET: one small woven bamboo back-basket (a tall basket with a woven lattice pattern and two '
        'rope shoulder straps), with a few fresh leafy herb sprigs and the necks of TWO small bottles - one RED, '
        'one BLUE - poking out of its open top.',
        ['relic_wholesale_crate', 'relic_catgrass_seed', 'relic_bamboo_tube'], '藥簍'),
    'relic_dream_pillow': (
        'a DREAM PILLOW: one plump, round, puffy PALE SKY-BLUE pillow with a crescent MOON and TWO little stars '
        'embroidered on its face in gold thread (stitched pictures, no writing), and the corner of one playing '
        'card peeking out from under its edge.',
        ['relic_small_cushion', 'relic_warm_blanket', 'relic_tower_moon'], '夢枕'),
    'relic_peace_cord': (
        'a LUCKY CORD BRACELET: one round loop bracelet of RED cord braided like a twisted rope, with ONE small '
        'round GOLD bead carved as a cat paw threaded in its middle, and TWO short red tassels hanging from the '
        'knot.',
        ['relic_bond_knot', 'relic_counting_beads', 'relic_renounce_beads'], '平安繩'),
    'relic_scout_staff': (
        'a PATHFINDER STAFF: one old bent WOODEN walking staff with a crooked hooked top, and hanging from the '
        'hook a small round cream PAPER LANTERN (lit warm) and a small tied cloth bundle.',
        ['relic_bamboo_copter', 'relic_wood_post', 'relic_wooden_dummy'], '探路杖'),
    'relic_box_in_box': (
        'a BOX IN A BOX: one OPEN brown cardboard box, and inside it a SMALLER open cardboard box, and inside that '
        'a THIRD even tinier box glowing with a bit of warm golden light - three boxes nested inside each other.',
        ['relic_wholesale_crate', 'relic_paper_bag', 'relic_hourglass'], '箱中箱'),
    'relic_miasma_lantern': (
        'a MIASMA LANTERN: one round paper lantern with dark wooden top and bottom rims, its paper DARK PURPLE, a '
        'PURPLE flame burning inside it, and a tassel hanging below from which a curl of dark purple smoke rises '
        '(solid, with outlines).',
        ['relic_miasma_charm', 'relic_spirit_bell', 'relic_sleepless_censer'], '魔氣燈籠'),
    'relic_demon_seal': (
        'a DEMON-SEALING TALISMAN: one tall narrow YELLOW paper talisman strip with a big bold RED CAT PAW PRINT '
        'painted on it and a few curling red brush-stroke swirls around the paw (magic patterns, NOT letters), '
        'and a small red tassel tied at its BOTTOM end.',
        ['potion_sword_talisman', 'potion_swap_talisman', 'relic_miasma_charm'], '鎮魔符'),
    'relic_stamp_card': (
        'a STAMP CARD: one small BLUE folded card booklet standing OPEN, and on its cream inside pages THREE round '
        'stamp circles in a row: the first holds an ORANGE cat paw-print stamp, the second a PURPLE cat paw-print '
        'stamp, and the third is EMPTY (just a dashed circle). No cord, no writing.',
        ['relic_member_card', 'relic_crane_bookmark', 'relic_five_poison_manual'], '集章卡'),
    'relic_master_bracer': (
        'a MIASMA-STAINED OLD WRIST WRAP: one old cloth arm wrap (a band of faded DARK-BLUE cloth wound round into '
        'a cuff shape, frayed at the edges), its tie strings knotted in a BIG, CROOKED, CLUMSY KNOT with two floppy '
        'loops and one long trailing tail; the cloth is blotched with dark PURPLE stains and a curl of purple '
        'smoke rises from it (solid, with outlines). Cloth only - no metal, no buckle.',
        ['relic_wrist_guard', 'relic_copper_bracer', 'relic_master_hat'], '沾了魔氣的舊護腕'),
}
BLESS = [n for n in ICON_JOBS if n.startswith('bless_')]
RELIC_NEW = [n for n in ICON_JOBS if n.startswith('relic_')]
COUNTER = ('relic_scout_staff', 'relic_box_in_box')
# 圖示提示詞的結尾有「no hands, no living characters」；這一張設計稿就是要畫一隻爪子伸進包袱
PAW_OK = {'bless_bottom': 'The ONLY exception to "no hands": the one cat paw described above.\n'}

# ---- 淨化版 6 件（設計稿 6-6、7-4）：附原件的圖，只改顏色與設計稿寫的細節
# 名 → (原件：本批的圖示名或 public/assets/icons 底下的既有圖示, 怎麼改, 中文名)
PURE_JOBS: dict[str, tuple[str, str, str]] = {
    'relic_miasma_charm_pure': (
        'relic_miasma_charm',
        'this is the PURIFIED version of the talisman: the purple paper becomes clean OFF-WHITE cream paper, its '
        'purple patterns become soft PALE CYAN-BLUE lines, and the purple smoke around it becomes a few small '
        'wisps of WHITE smoke (solid, with outlines). Keep the red cord exactly as it is.',
        '清心護符'),
    'relic_blood_dagger_pure': (
        'relic_blood_dagger',
        'this is the PURIFIED version of the dagger: the blood-red blade becomes clean shining SILVER-WHITE steel '
        'with one thin bright highlight along the edge, the red drop at the tip is gone, and one small GOLD '
        'sparkle glints beside the tip. Keep the white cloth-wrapped grip exactly as it is.',
        '解契短刀'),
    'relic_black_cat_mask_pure': (
        'relic_black_cat_mask',
        'this is the PURIFIED version of the mask: the black face of the cat mask becomes clean WHITE (with soft '
        'pale-grey shading). Keep the gold eye rims and the red ribbon bow exactly as they are.',
        '白貓面具'),
    'relic_miasma_shard_pure': (
        'relic_demon_shard',
        'this is the PURIFIED version of the crystal: the dark crimson-violet crystal becomes a PALE ICY BLUE-WHITE '
        'crystal (moonstone colours, suggest its clearness with lighter facets but draw it SOLID and opaque), its '
        'red inner glow becomes a soft WHITE glow, and the dark purple-red miasma curls around it are replaced by '
        'a soft ring of pale MOON-WHITE light around the crystal (solid, with outlines).',
        '月光晶石'),
    'relic_miasma_lantern_pure': (
        'relic_miasma_lantern',
        'this is the PURIFIED version of the lantern: the dark purple paper becomes clean CREAM-WHITE paper, the '
        'purple flame inside becomes a warm GOLDEN flame, and the tassel hangs clean with NO smoke at all.',
        '長明燈'),
    'relic_master_bracer_pure': (
        'relic_master_bracer',
        'this is the PURIFIED version of the wrist wrap: all the purple stains and the purple smoke are GONE, the '
        'cloth is clean, fresh DEEP BLUE again, and a thin soft rim of pale GOLD light glows around its outline. '
        'Keep the big crooked knot with its two floppy loops and long tail exactly as it is.',
        '大俠貓的舊護腕'),
}
PURE_PROMPT = (
    'Edit this game item icon. Reference image 1 is the ORIGINAL icon: {change}\n'
    'Keep EVERYTHING ELSE the same as reference image 1 - the same object, the same shape and silhouette, the '
    'same proportions, the same angle, the same thick dark outlines and cel-shaded icon style - so the two icons '
    'read as the same item before and after. Only the colours and details named above change.\n'
    'It is shown at only about 32 to 40 pixels in the game: one bold shape, high contrast.\n'
    'Draw it SOLID and OPAQUE; any glow, smoke or light is a solid flat shape with a dark outline, never '
    'see-through.\n'
    'One item only, centred and filling about 85% of the image, truly transparent RGBA background: no '
    'checkerboard drawing, no background, no ground, no cast shadow, no text, no letters, no numbers, no border, '
    'no hands, no living characters.'
)


def icon_prompt(name: str) -> str:
    text = c1.ICON_PROMPT.format(what=ICON_JOBS[name][0]) + '\n' + PAW_OK.get(name, '')
    return text + (c2.COUNTER_NOTE if name in COUNTER else '')


# ================================================================ 店主與行腳商（設計稿 4-6）

STYLE_KEEPER = (
    'the ORANGE TABBY SHOPKEEPER of this game (another member of the same shop): use him ONLY for the ART STYLE - '
    'thick black outlines, flat colours with subtle soft shading, the same amount of fur detail - and for the '
    'size of the HEAD relative to the picture. Do NOT copy his orange fur, his indigo coat, his beige apron, his '
    'coin pouch or his pose.'
)
KEEPERS: dict[str, dict[str, str]] = {
    'tortoise': {
        'zh': '玳瑁婆婆',
        'who': 'THE TORTOISESHELL GRANNY (a shopkeeper)',
        'look': (
            'a TORTOISESHELL cat - her fur is a patchwork of BLACK, ORANGE and CREAM patches mixed together, and '
            'her FACE is split down the middle: one half BLACK, the other half ORANGE - an OLD GRANNY: small, '
            'round and a little hunched, droopy old amber eyes with small wrinkles, a few white whiskers; a deep '
            'PURPLE short jacket, a faded DARK-GREEN apron tied over it whose front pocket is stuffed with small '
            'bottles (red, green and blue bottle necks sticking out); a string of small plain WOODEN medicine '
            'tags hanging round her neck (plain wood, no writing); a short tail curling up behind her. She is '
            'SHORTER than the orange tabby - about three quarters of his height - but her HEAD is just as big as '
            'his.'),
        'keeper': 'one paw holds a small glass medicine bottle up to the light at eye level, out toward the LEFT, and '
                  'she squints one eye at it; the other paw rests on her hip; the corners of her mouth turn down - '
                  'stern, but not mean; short tail curled up.',
        'happy': 'a squinting happy smile that shows ONE small pointed fang; one paw held up toward the LEFT making an '
                 '"OK" sign (a circle made with two fingers), the other paw on her hip.',
        'no': 'both paws planted on her hips, shaking her head (two short curved motion marks beside her head), '
              'brows knitted in a disapproving frown.',
    },
    'curio': {
        'zh': '長毛掌櫃',
        'who': 'THE LONGHAIR CURIO DEALER (a shopkeeper)',
        'look': (
            'a CHINCHILLA PERSIAN cat - SILVER-WHITE, very long, very fluffy fur, a flat round face with a small '
            'pushed-in nose, big round emerald-GREEN eyes - a dignified middle-aged gentleman: a long DARK-GREEN '
            'robe, a short BLACK mandarin jacket over it fastened with cloth-knot buttons, a small round BLACK '
            'skullcap (a six-panel melon cap with a tiny red knot on top), a gold-rimmed MONOCLE over his right eye '
            'with a fine GOLD CHAIN hanging down to his chest; a huge fluffy tail like a feather duster. He stands '
            'very straight and is about as tall as the orange tabby, with a head just as big.'),
        'keeper': 'standing very straight; one paw holds a FEATHER DUSTER (a short stick with a fluffy tuft of brown '
                  'feathers); the other paw holds out toward the LEFT a small folded RED CLOTH on which a little '
                  'bundle of warm golden light glows (only a glow - do NOT draw any object in it); a calm, slightly '
                  'proud face.',
        'happy': 'his monocle flashes with a small white glint; a polite pleased smile; he bows slightly from the '
                 'waist with one paw on his chest, the feather duster in the other paw.',
        'no': 'he holds the feather duster crosswise in front of his chest like a little barrier, brows drawn '
              'together in a frown, mouth pressed into a thin flat line.',
    },
    'junk': {
        'zh': '阿福',
        'who': 'THE BIG JUNK-STALL UNCLE (a shopkeeper)',
        'look': (
            'a MAINE COON cat - BROWN TABBY with bold dark stripes, long LYNX TUFTS on the tips of his ears, a big '
            'shaggy RUFF of fur around his chin and chest, very big paws - a big cheerful middle-aged uncle with '
            'a round belly and smiling squinty eyes: a NAVY short jacket covered in several sewn-on PATCHES of '
            'different fabrics, a rough ROPE tied round his waist as a belt, dark trousers; a huge bulging BURLAP '
            'SACK slung diagonally on his back, and from its mouth poke an old knife handle, the handle of a broken '
            'pot and a coil of rope; wide flat feet. He is the BIGGEST and BULKIEST of the shopkeepers: as tall as '
            'the orange tabby, but broader, heavier and rounder - and his HEAD is the same size as the orange '
            'tabby\'s.'),
        'keeper': 'one paw scratches the back of his head; the other paw holds out toward the LEFT a patched old IRON '
                  'COOKING POT by its handle; a big easy smile.',
        'happy': 'head thrown back laughing loudly with his mouth wide open and eyes squeezed shut, one paw patting '
                 'his round belly.',
        'no': 'scratching his head with a wry, apologetic smile, the other paw held out open, palm up, in a "sorry" '
              'shrug.',
    },
    'merchant': {
        'zh': '行腳商',
        'who': 'THE TRAVELLING PEDLAR',
        'look': (
            'a MUNCHKIN cat - short smooth MILK-TEA (light beige-brown) fur, very SHORT stubby legs and arms, a '
            'round face with big round shining eyes - a young, lively travelling pedlar: a MUSTARD-YELLOW '
            'headscarf tied round his head (NOT navy blue, NOT a ninja headband), a short STRAW RAIN-CAPE over his '
            'shoulders, a plain brown short tunic, cloth wraps round his short calves; on his back a tall WOODEN '
            'BACKPACK FRAME that rises a whole head above him, hung with small wooden drawers, cloth bundles, two '
            'or three small corked bottles and a string of dried fish. He is a little shorter than the orange '
            'tabby, and his head is as big as the orange tabby\'s.'),
        'keeper': 'one paw holds the shoulder strap of his backpack frame; the other paw is raised high, waving toward '
                  'the LEFT in greeting; a big eager grin.',
        'happy': 'a big thumbs-up with one paw, both feet off the ground in a little hop of joy, a huge grin.',
        'no': 'both paws spread open palms-up in a shrug, his backpack frame tilting over to one side, a sheepish face.',
    },
}
# 立繪名：店主 `keeper_<代號>`、`_happy`、`_no`；行腳商 `merchant`、`_happy`、`_no`（清單鍵 `shop/<名>`）
SPRITE_JOBS: dict[str, tuple[str, str]] = {}
for _who in KEEPERS:
    _base = 'merchant' if _who == 'merchant' else f'keeper_{_who}'
    SPRITE_JOBS[_base] = (_who, 'keeper')
    SPRITE_JOBS[f'{_base}_happy'] = (_who, 'happy')
    SPRITE_JOBS[f'{_base}_no'] = (_who, 'no')
DESIGN_JOBS = {f'design_{w}': w for w in KEEPERS}


def design_prompt(name: str) -> str:
    k = KEEPERS[DESIGN_JOBS[name]]
    return (
        f'Create one CHARACTER DESIGN for a side character of a cute cat-ninja card game: {k["who"]}.\n'
        f'The character: {k["look"]}\n'
        'Pose: a clean model-sheet pose that shows the whole outfit - standing upright on two legs, full body, the '
        'body turned slightly toward the LEFT in a three-quarter view, arms relaxed at the sides, a friendly '
        'neutral face.\n'
        f'Reference image 1 is {STYLE_KEEPER}\n'
        'Draw everything SOLID and OPAQUE - flat filled colour with soft shading, nothing see-through. One '
        'character only, full body, centred, filling about 85% of the height, with a clear transparent margin on '
        'every side (ears, tail and props never cut off). Truly transparent RGBA background: no checkerboard '
        'drawing, no ground, no cast shadow, no scenery, no text, no letters, no numbers, no border.'
    )


def sprite_prompt(name: str) -> str:
    who, mood = SPRITE_JOBS[name]
    k = KEEPERS[who]
    return (
        'A single cartoon shopkeeper character for a cute game set in a cat ninja tower, full body, facing LEFT '
        '(the body turned slightly toward the left edge of the picture, like reference image 2).\n'
        f'Reference image 1 is THIS character\'s design sheet: {k["who"]}. Copy the character EXACTLY from it - the '
        'same face, the same fur colours and markings, the same clothes and colours, the same accessories, the same '
        f'body shape and size. For reference, the character is {k["look"]}\n'
        f'Reference image 2 is {STYLE_KEEPER} Draw this character at the same scale: the head exactly as big as '
        'the orange tabby\'s head in reference image 2.\n'
        f'Pose: {k[mood]}\n'
        'Readable at small size (it is shown about 230 pixels tall): bold silhouette, strong shapes, no fine detail '
        'that disappears when shrunk. Draw everything SOLID and OPAQUE - flat filled colour with soft shading, '
        'nothing transparent or see-through.\n'
        'One character only. It stands upright on the ground on its own feet (it will be placed with the feet on the '
        'bottom edge of the game frame). The whole character fits inside the picture with a clear transparent '
        'margin on every side - ears, tail, raised paws and props never cut off. Nothing else in the picture: no '
        'counter, no shelves, no goods, no ground line, no shadow, no scenery, no text, no letters, no numbers, no '
        'watermark, no border. Truly transparent RGBA background, no checkerboard drawing.\n'
        'Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.'
    )


# ================================================================ 事件圖

# 身上拿不下來的東西：`gear_rule` 的兩段（WORN GEAR、THE EYES）。有幾張要換掉裝備那一段
EYES_RULE = gear_rule('x').split('THE EYES:', 1)[1]
EYES_RULE = 'THE EYES:' + EYES_RULE
GEAR_FENGFENG_HELD = 'the red scarf; his jian stays inside its dark-brown scabbard'


def rules(hero: str, gear: str | None = None, feifei_note: str = '') -> str:
    """同第一批 `hero_rules`；`gear` 給了就換掉裝備句；`gear` 以 `!` 開頭＝整段自己寫（只留眼睛那段）。"""
    if hero == 'feifei':
        return c1.FEIFEI_GEAR + (feifei_note + '\n' if feifei_note else '') + FEIFEI_NOT_HUMAN + FEIFEI_NOT_FAT
    if gear and gear.startswith('!'):
        return gear[1:] + '\n' + EYES_RULE
    return gear_rule(gear or c1.GEAR[hero])


# 參考圖②：同一隻的既有事件圖（只取畫風）＋那張圖是什麼地方
SCENE_REF = {
    'act1': ('seclusion', 'a stone room with torchlight'),
    'act2': ('daxia_chest', 'a wooden staircase corner'),
    'act3': ('daxia_lastpage', 'night-time stone steps at the top of the tower'),
    'chest': ('chest_closed', 'finding a cardboard box'),
}
# 參考圖③④（public/assets 底下的路徑, 說明）
EXTRA = {
    'door': ('bg/door_act1.webp',
             'Reference image {n} is the TOWER GATE of this game: the huge gate in this scene is that same heavy '
             'dark iron-bound stone double door - but here one leaf stands half open.'),
    'merchant': (None,
                 'Reference image {n} is THE TRAVELLING PEDLAR\'s design: draw him exactly like it - a young '
                 'short-legged MUNCHKIN cat with milk-tea fur and big round eyes, a MUSTARD-YELLOW headscarf, a '
                 'short straw rain-cape, cloth leg wraps, and a tall wooden BACKPACK FRAME hung with little drawers, '
                 'cloth bundles, small bottles and a string of dried fish. In this picture he is drawn in the same '
                 'chunky chibi event style as the hero and is about the hero\'s size; his backpack frame rises a '
                 'head above him.'),
    'gourd': ('icons/relic_master_gourd.webp',
              'Reference image {n} is the item icon of THE MASTER\'S GOURD: the gourd in this scene is exactly that '
              'gourd - an ORANGE double gourd with a RED cord tied round its waist.'),
}


def bless_bundle(p: P) -> dict[str, str]:
    gate = ('SETTING: dawn at the foot of the tower, right outside its gate: the huge heavy stone double door of '
            'the tower (like reference image 3) stands HALF OPEN and a pale VIOLET glow seeps out of the dark gap; '
            'cool pale-blue early-morning light falls in from the LEFT side of the picture; a few dried fish lie '
            'scattered on the stone threshold. By the threshold sits a DEEP-BLUE CLOTH BUNDLE, half untied and '
            'half open; one corner of it is tied in a BIG, CROOKED, CLUMSY KNOT with two floppy loops and one long '
            'trailing tail (the master\'s knot - you cannot miss it). Inside the half-open bundle there are only a '
            'few lumpy, bulging round shapes under the folds of cloth - do NOT draw any recognisable object in it '
            '(no bottles, no coins, no scrolls, no weapons, no food).')
    pose = {
        'ninja': 'QIUQIU crouches beside the bundle with one paw resting on the big crooked knot, his head tilted '
                 'far back, gazing up toward the top of the tower (out of the picture) with a determined, longing '
                 'face',
        'feifei': 'FEIFEI crouches beside the bundle, one paw on the big crooked knot, lifting a corner of the '
                  'cloth onto her lap with the other paw, looking down at the knot with a soft, teary smile',
        'dangdang': 'DANGDANG crouches beside the bundle with one paw on the big crooked knot, bending close to '
                    'study how it is tied, a serious frown',
        'fengfeng': 'FENGFENG kneels on one knee beside the bundle, one paw resting on the big crooked knot; his '
                    'jian in its dark-brown scabbard lies on the ground beside him',
    }[p.hero]
    return {'bless_bundle': f'{gate} {pose}.'}


def q_ambush(p: P) -> dict[str, str]:
    corner = ('SETTING: a dim, gloomy turn of a staircase inside the tower: a few worn stone steps, a rough stone '
              'wall with an old wooden beam across it, deep dark shadows filling both sides. Out of the shadows on '
              'BOTH sides, four or five pairs of GLOWING YELLOW EYES lunge toward the hero: the attackers are only '
              'vague, featureless, solid dark charcoal-black SILHOUETTES with a few claw tips - NOT any '
              'recognisable monster; only their dark silhouettes and their glowing eyes are drawn.')
    pose = {
        'ninja': 'QIUQIU in the middle has leapt into the air in fright: every hair of his fur puffed out and '
                 'bristling, his tail fluffed up like a bottle brush, eyes wide',
        'feifei': 'FEIFEI in the middle shrinks back with her back pressed flat against the wall, ears flattened, '
                  'eyes wide with fear',
        'dangdang': 'DANGDANG in the middle plants his feet wide and raises both copper-bracered forearms in front '
                    'of his chest, frowning',
        'fengfeng': 'FENGFENG in the middle takes half a step back, one paw gripping his sword hilt (the jian still '
                    'in its scabbard), eyes narrowed',
    }[p.hero]
    return {'q_ambush': f'{corner} {pose}.'}


def q_merchant(p: P) -> dict[str, str]:
    stairs = ('SETTING: a turn of a staircase inside the tower: a few wooden steps with a wooden banister and a bit '
              'of stone wall behind. THE PEDLAR (the young short-legged munchkin cat of reference image 3, with his '
              'mustard-yellow headscarf, straw rain-cape and tall wooden backpack frame hung with little drawers, '
              'cloth bundles, small bottles and a string of dried fish) sits on one of the upper steps with his '
              'backpack frame on, one paw raised high, waving to the hero with a big eager grin.')
    pose = {
        'ninja': 'QIUQIU comes up the steps from below and leans in close with curious, sparkling eyes, looking at '
                 'the little drawers on the backpack frame',
        'feifei': 'FEIFEI peeks shyly out from behind the wooden banister post further down the steps, only her '
                  'head and paws showing past the post',
        'dangdang': 'DANGDANG stands on a lower step pointing at ONE rope of the backpack frame that has come '
                    'loose and dangles free - that one loose rope must be clearly visible',
        'fengfeng': 'FENGFENG stands on a lower step and gives a small polite nod of greeting, one paw raised a '
                    'little',
    }[p.hero]
    return {'q_merchant': f'{stairs} {pose}.'}


def q_roadbox(p: P) -> dict[str, str]:
    box = ('SETTING: a quiet corner at the side of a staircase inside the tower (a couple of stone steps and a bit '
           'of wall). In the corner sits ONE OLD CARDBOARD BOX - the same kind of plain brown cardboard box as in '
           'reference image 2, but a little worn and dented - with its lid CLOSED; on top of the lid a big SMILEY '
           'FACE is drawn in thick dark lines (two dots and a curve - a doodle, not writing). A soft beam of warm '
           'golden light falls from above onto the box (a few solid pale-gold rays with outlines). No monsters, '
           'no traps.')
    pose = {
        'ninja': 'QIUQIU crouches in front of the box, his tail sticking straight up with excitement, eyes shining',
        'feifei': 'FEIFEI crouches in front of the box and carefully reaches out ONE finger to knock on it',
        'dangdang': 'DANGDANG crouches beside the box with his head tilted, peering at the bottom edge of the box',
        'fengfeng': 'FENGFENG crouches in front of the box with one paw resting on its lid',
    }[p.hero]
    return {'q_roadbox': f'{box} {pose}.'}


def hot_spring(p: P) -> dict[str, str]:
    room = ('SETTING: a half-collapsed stone room inside the tower: cracked grey flagstones and a broken stone wall; '
            'in the middle a small HOT SPRING POOL wells up through the cracked floor, ringed with a few big rounded '
            'stones; creamy-white steam rises from it in soft puffs (solid, opaque, with outlines - never '
            'see-through); a short bamboo pipe trickles water into the pool and a wooden bucket stands beside it; '
            'on the wall hangs a wooden board carved with a simple picture of a cat soaking blissfully with its '
            'eyes closed (a carved line drawing, no writing). Soft moonlight from above and the warm glow of one '
            'paper lantern.')
    test = {
        'ninja': 'QIUQIU crouches at the edge of the pool dipping the tip of one claw into the hot water, just '
                 'pulling it back a little - "hot!" - but smiling',
        'feifei': 'FEIFEI crouches at the edge of the pool touching the water surface with one fingertip, eyes '
                  'wide with wonder',
        'dangdang': 'DANGDANG crouches at the edge of the pool with one paw pressed on a warm rim stone, testing '
                    'the heat and studying where the water wells up',
        'fengfeng': 'FENGFENG crouches at the edge of the pool dipping one paw into the water to test the '
                    'temperature, calm',
    }[p.hero]
    soaked = {
        'ninja': 'At the edge of the pool his travel bag lies half sunk in the water, soaking wet',
        'feifei': 'Her bamboo tube and her travel bag have fallen into the pool and lie half sunk, soaking wet',
        'dangdang': 'His two copper bracers lie on the stone rim of the pool, but his tool bag has slipped into the '
                    'water and lies half sunk, soaking wet',
        'fengfeng': 'His jian in its scabbard leans against the stone wall, but his water bag and travel bag have '
                    'slid into the pool and lie half sunk, soaking wet',
    }[p.hero]
    safe = {
        'ninja': 'His dried-fish bag hangs from a short wooden post beside the pool, safe and dry',
        'feifei': 'Her bamboo tube and her travel bag sit neatly on top of the highest rock beside the pool, safe '
                  'and dry',
        'dangdang': 'His tool bag hangs from a short wooden post beside the pool, its strap wound TWICE round the '
                    'post and tied, safe and dry',
        'fengfeng': 'His jian in its scabbard leans against the stone wall, and his travel bag and water bag sit '
                    'on a rock a few steps away from the pool, safe and dry',
    }[p.hero]
    busy = {
        'ninja': 'trying out a claw-strike with one paw stretched forward while he sits',
        'feifei': 'with a row of thin gold needles laid across her knees, wiping one dry with a small cloth',
        'dangdang': 'rubbing the rust off the copper bracer on his forearm with a wet cloth',
        'fengfeng': 'with his drawn jian laid across his knees, wiping the blade with a warm cloth; the empty '
                    'scabbard at his waist',
    }[p.hero]
    return {
        'rare_hot_spring': f'{room} {test}.',
        'rare_hot_spring_r0': (
            f'{room} {p.n} soaks in the hot spring right up to the neck - only {p.his} head shows above the water - '
            f'with a blissful, melting face and both eyes closed. A few round PURPLE BUBBLES (solid, with outlines) '
            f'rise from the water around {p.him} and pop at the surface. {soaked}, and two or three small potion '
            f'bottles float on the water.'),
        'rare_hot_spring_r1': (
            f'{room} {p.n} soaks up to the chest, leaning back comfortably against a big rounded stone at the edge '
            f'of the pool, eyes half closed, relaxed. {safe}. A few faint wisps of pale lilac smoke (solid, with '
            f'outlines) drift up off the water and fade away.'),
        'rare_hot_spring_r2': (
            f'{room} {p.n} sits on the stone edge of the pool soaking only {p.his} feet in the water, {busy} - and '
            f'{p.his} eyes light up with a sudden idea (a tiny gold sparkle beside {p.his} head).'),
    }


def fortune_sticks(p: P) -> dict[str, str]:
    altar = ('SETTING: a turn of a staircase inside the tower (a few wooden steps and a bit of wall). A small '
             'RED-LACQUERED offering table stands there with: a bamboo FORTUNE-STICK CYLINDER (a tall bamboo cup of '
             'thin wooden sticks), two red crescent-moon-shaped wooden divination blocks, and a small wooden '
             'offering box with a coin slot. On the wall behind the table hangs a row of small wooden DRAWERS, each '
             'marked with a different simple picture - a fish, a moon, a paw print, a gourd, a star (pictures only, '
             'no writing). A small oil lamp burns with a warm flame.')
    look = {
        'ninja': 'QIUQIU stands in front of the table staring at the toppled cylinder with big sparkling eyes',
        'feifei': 'FEIFEI stands in front of the table with both paws clasped together at her chest, hopeful and '
                  'nervous',
        'dangdang': 'DANGDANG has pulled one of the little drawers half open and studies its wooden runners '
                    'closely',
        'fengfeng': 'FENGFENG stands up straight in front of the table, calmly looking at the row of drawers',
    }[p.hero]
    pray = {
        'ninja': 'QIUQIU puts both paws together and bows',
        'feifei': 'FEIFEI puts both paws together in prayer with her eyes closed and bows',
        'dangdang': 'DANGDANG lowers his head in a small, respectful bow',
        'fengfeng': 'FENGFENG stands up straight with both paws together and bows',
    }[p.hero]
    return {
        'rare_fortune_sticks': (
            f'{altar} The bamboo cylinder lies TOPPLED on its side and several sticks have spilled across the '
            f'table. {look}.'),
        'rare_fortune_sticks_r0': (
            f'{altar} The cylinder is upright again. {p.n} holds it in both paws and shakes it hard with both eyes '
            f'squeezed shut, and ONE stick is flying up out of it into the air. Behind, one little drawer on the '
            f'wall stands half open with warm light glowing out of it - do NOT show what is inside it.'),
        'rare_fortune_sticks_r1': (
            f'{altar} The cylinder stands upright on the table. {pray} before it; the offering box is piled high '
            f'with dried fish, and one single stick is slowly rising up out of the cylinder by itself.'),
    }


def sleeping_hoard(p: P) -> dict[str, str]:
    crate = (' - their sides are marked with a caravan\'s sign: a circle with a paw print inside (a simple picture)'
             if p.hero == 'fengfeng' else '')
    room = ('SETTING: a dim storeroom glimpsed through a half-open wooden door. In the middle rises a HEAP OF '
            f'TREASURE: dried fish, broken old weapons, a few wooden crates{crate}, and a few scattered points of '
            'warm golden light (only glowing dots - no recognisable object). Sprawled asleep on top of the heap '
            'lies a HUGE BLACK SHADOW: a soft, blurry, featureless dark mass with no clear outline, only two closed, '
            'faintly glowing curved eye slits and a big round snot bubble at its nose - it must NOT look like any '
            'particular animal or monster.')
    peek = {
        'ninja': 'gulping, his eyes huge',
        'feifei': 'both paws clapped over her mouth, holding her breath',
        'dangdang': 'squinting at the bottom of the heap, which is stacked crookedly',
        'fengfeng': 'staring at the marked crates with a surprised, serious look',
    }[p.hero]
    door = ' He pulls the door shut behind him with his free paw.' if p.hero == 'fengfeng' else ''
    second = (' The second treasure is wedged under an old broken spear.' if p.hero == 'dangdang' else '')
    treasure = 'a treasure so bright with warm golden light that you cannot tell what it is'
    return {
        'rare_sleeping_hoard': f'{room} {p.n} peeks round the edge of the half-open door, {peek}.',
        'rare_sleeping_hoard_r0': (
            f'{room} {p.n} tiptoes back out through the doorway hugging ONE glowing treasure to {p.his} chest - '
            f'{treasure}. Behind, the black shadow still sleeps on the heap, the snot bubble still at its nose.{door}'),
        'rare_sleeping_hoard_r1': (
            f'{room} {p.n} stands on the side of the heap holding one glowing treasure in one arm and reaching the '
            f'other paw for a SECOND glowing treasure - frozen stiff mid-reach, cold sweat drops flying, eyes wide.'
            f'{second} On top of the heap the black shadow\'s nose twitches and its snot bubble is about to burst - '
            f'but its eyes stay CLOSED (whether it wakes is NOT shown).'),
    }


def miasma_whisper(p: P) -> dict[str, str]:
    hall = ('SETTING: the far end of a long WOODEN corridor in the middle floors of the tower (warm brown '
            'floorboards, wooden wall posts, one paper lantern). The floorboards are split by a long crack, and thick '
            'PURPLE MIST (solid, opaque, with outlines) oozes out of it, creeping low along the floor and curling '
            'into a swirl in the middle of the picture. In the centre of the swirl hovers a small glowing PURPLE '
            'LIGHT with a jagged, pointed shape - not any recognisable object. The edge of the swirl faintly curls '
            'into the SIDE PROFILE OF A BIG CAT\'S FACE - only a very pale, thin outline, like a ghost of a face in '
            'the mist.')
    stand = {
        'ninja': 'one paw trembling',
        'feifei': 'frozen, her eyes brimming with tears',
        'dangdang': 'both fists clenched',
        'fengfeng': 'one paw on his sword hilt, not stepping forward',
    }[p.hero]
    reach = {
        'ninja': f'{p.n} reaches one paw into the purple mist; the mist coils up around his arm, and a glowing '
                 'purple light rests in his palm',
        'feifei': f'{p.n} reaches one paw into the purple mist; the mist coils up around her arm, and a glowing '
                  'purple light rests in her palm',
        'dangdang': f'{p.n} reaches one paw into the purple mist and grabs; the mist crawls up over his copper '
                    'bracer and along his arm, and a glowing purple light rests in his palm',
        'fengfeng': f'{p.n} hooks the glowing purple light out of the mist with the tip of his SHEATHED sword (the '
                    'jian still in its scabbard, held in one paw), and the mist curls around his paw',
    }[p.hero]
    return {
        'rare_miasma_whisper': (
            f'{hall} {p.n} stands at the near end of the corridor facing the mist, ears pressed back, {stand}.'),
        'rare_miasma_whisper_r0': (
            f'{hall} {reach}. In the mist, the faint outline of the big cat\'s face now has the corner of its mouth '
            f'curling up in a thin smile.'),
        'rare_miasma_whisper_r1': (
            f'{hall.split(" The floorboards")[0]} The floorboards are split by a long crack. {p.n} shouts with '
            f'{p.his} mouth wide open, leaning forward; the shout is drawn as a few bold CREAMY-WHITE curved arcs '
            f'spreading out from {p.his} mouth. The purple mist (solid, with outlines) is blasted apart and shrinks '
            f'back down into the crack in the floor; the faint cat-face outline is gone.'),
    }


def catnip_master(p: P) -> dict[str, str]:
    """主控裁決 2：替代版，大俠貓本人不出場。只留貓薄荷田、壓扁的草（他打滾壓出來的窩）、酒葫蘆、一撮毛。
    ① 撿他掉的一頁筆記（選絕學）、② 撿起他滾落的酒葫蘆、③ 在他壓出來的窩裡睡一覺（回滿血）。"""
    field = ('SETTING: the open-air top of the tower at night under a big full moon: the edge of a stone terrace '
             'overgrown with a big patch of CATNIP (pale fresh GREEN leaves with clusters of tiny WHITE flowers). '
             'In the middle of the patch the catnip is FLATTENED into a big hollow the shape of a LARGE cat that lay '
             'there on its back and rolled around (a big body-shaped dent, several snapped stems) - whoever made it '
             'is GONE. A small TUFT of GREY fur with dark grey stripes lies in the hollow.')
    gourd = (' At the edge of the patch the master\'s GOURD, exactly like reference image 3 (orange double gourd, '
             'red cord), lies tipped over on its side.')
    page = (' A single folded sheet of old paper lies half hidden in the flattened catnip.')
    nobody = ' NOBODY else is here: no big cat, no master, no other animal - only the hero.'
    see = {
        'ninja': 'QIUQIU crouches at the edge of the patch with his mouth wide open, staring at the big empty '
                 'hollow',
        'feifei': 'FEIFEI stands at the edge of the patch with both paws pressed over her mouth, her eyes welling '
                  'with tears',
        'dangdang': 'DANGDANG stands stock-still at the edge of the patch, stunned and speechless',
        'fengfeng': 'FENGFENG has stopped at the edge of the patch, one paw pressing his sword hilt, staring at the '
                    'hollow',
    }[p.hero]
    hug = {'ninja': 'his', 'feifei': 'her', 'dangdang': 'his', 'fengfeng': 'his'}[p.hero]
    sleep = {
        'ninja': '',
        'feifei': '',
        'dangdang': ' Both copper bracers stay on his forearms.',
        'fengfeng': ' He hugs his sheathed jian against his side.',
    }[p.hero]
    return {
        'rare_catnip_master': f'{field}{gourd}{page} {see}.{nobody}',
        'rare_catnip_master_r0': (
            f'{field} {p.n} kneels in the flattened hollow holding up an old sheet of notes in both paws, studying it '
            f'with wide, shining eyes; the paper shows only a few quick ink brush drawings of a BIG cat demonstrating '
            f'a fighting move (pictures, no writing). A few tiny gold sparkles float around {p.him}.{nobody}'),
        'rare_catnip_master_r1': (
            f'{field} {p.n} hugs the master\'s gourd (exactly like reference image 3: orange double gourd, red cord) '
            f'to {hug} chest with both arms, looking down at it with a moved, wistful face, standing beside the '
            f'empty hollow.{nobody}'),
        'rare_catnip_master_r2': (
            f'{field} {p.n} is curled up fast asleep INSIDE the big flattened cat-shaped hollow - the hollow is much '
            f'bigger than {p.him}, like a giant\'s bed - both eyes peacefully closed, a small sleep bubble at '
            f'{p.his} nose, a few catnip sprigs lying over {p.him} like a blanket, the big full moon above. Warm, '
            f'quiet and safe.{sleep}{nobody}'),
    }


def shrine_r2(p: P) -> dict[str, str]:
    pose = {
        'ninja': 'QIUQIU kneels in front of the shrine with both paws pressed together in prayer, eyes closed',
        'feifei': 'FEIFEI kneels in front of the shrine with both paws pressed together in prayer, eyes closed; a '
                  'small white handkerchief is spread under the glowing thing on the tray',
        'dangdang': 'DANGDANG kneels in front of the shrine with both paws pressed together in prayer; the offering '
                    'tray sits level on a small wooden wedge he has slid under it',
        'fengfeng': 'FENGFENG stands in front of the shrine one step back, calm, both paws hanging relaxed at his '
                    'sides',
    }[p.hero]
    return {
        'broken_shrine_r2': (
            'the same fallen shrine as in reference image 2 (copy the shrine, the broken halves of the cat-god '
            'statue and the setting from it). Between the two broken halves of the statue sits a small offering '
            'tray, and on it lies ONE thing glowing with purple light (not a recognisable object - just a small '
            'glowing lump). The statue\'s eyes now shine bright GOLD, and thin wisps of PURPLE MIST (solid, with '
            f'outlines) are being pulled off the glowing thing and sucked into the cracks of the statue. {pose}.'),
    }


# 組 → (生成函式, 參考圖② 的場景, 參考圖③④, 結果圖序號)
GROUPS: dict[str, tuple[object, str, list[str], list[int]]] = {
    'bless_bundle': (bless_bundle, 'act1', ['door'], []),
    'q_ambush': (q_ambush, 'act2', [], []),
    'q_merchant': (q_merchant, 'act2', ['merchant'], []),
    'q_roadbox': (q_roadbox, 'chest', [], []),
    'rare_hot_spring': (hot_spring, 'act1', [], [0, 1, 2]),
    'rare_fortune_sticks': (fortune_sticks, 'act2', [], [0, 1]),
    'rare_sleeping_hoard': (sleeping_hoard, 'act2', [], [0, 1]),
    'rare_miasma_whisper': (miasma_whisper, 'act2', [], [0, 1]),
    'rare_catnip_master': (catnip_master, 'act3', ['gourd'], [0, 1, 2]),
    'broken_shrine_r2': (shrine_r2, 'shrine', [], []),
}

# 換掉裝備句的幾張
GEAR_OVERRIDE = {
    ('bless_bundle', 'fengfeng'): 'the red scarf; his jian stays inside its dark-brown scabbard, which lies on the '
                                  'ground beside him',
    ('rare_hot_spring_r0', 'fengfeng'): 'the red scarf',
    ('rare_hot_spring_r1', 'fengfeng'): 'the red scarf',
    ('rare_hot_spring_r0', 'dangdang'): '!His two copper forearm bracers are OFF in this picture: they lie on the '
                                        'stone rim of the pool (only in this picture).',
    ('rare_miasma_whisper_r0', 'fengfeng'): GEAR_FENGFENG_HELD,
    ('rare_catnip_master_r2', 'fengfeng'): GEAR_FENGFENG_HELD,
}
FEIFEI_NOTE = {
    'rare_hot_spring_r0': 'In the pool only her head shows; her belt and needle tubes are simply hidden under the water.',
    'rare_hot_spring_r1': 'In the pool her belt and needle tubes are simply hidden under the water.',
}


class Job:
    def __init__(self, hero: str, stem: str, group: str, what: str, scene: str, extras: list[str]):
        self.hero, self.stem, self.group, self.what, self.scene, self.extras = hero, stem, group, what, scene, extras


def _event_jobs() -> dict[str, Job]:
    out: dict[str, Job] = {}
    for group, (fn, scene, extras, _) in GROUPS.items():
        for hero in HEROES:
            for stem, what in fn(P(hero)).items():  # type: ignore[operator]
                out[event_name(hero, stem)] = Job(hero, stem, group, what, scene, extras)
    return out


EVENT_JOBS = _event_jobs()

HEAD = (
    'Create one new EVENT ILLUSTRATION for a cute cat-ninja card game. It is a cut-out vignette: only the characters '
    'and the few props of the scene (with at most a small patch of floor under them), on a truly transparent '
    'background.\n'
    'Reference image 1 is the hero\'s CURRENT official look: copy {name}\'s face, fur colours and markings, the head '
    'size relative to the body, the body proportions, the outfit and its colours EXACTLY from it. The hero is {look}.\n'
)
REF2_SCENE = (
    'Reference image 2 is an existing event illustration from this game ({what}): copy its ART STYLE (bold dark '
    'hand-drawn outlines, flat colours with soft cel shading, chunky cute chibi proportions) and the way the scene is '
    'cut out on a transparent background. Do NOT copy its composition or its props, and do NOT take the hero\'s look '
    'from it - the look comes ONLY from reference image 1.\n'
)
REF2_CHEST = (
    'Reference image 2 is this game\'s existing illustration of finding a cardboard box: copy its ART STYLE (bold '
    'dark hand-drawn outlines, flat colours with soft cel shading, chunky cute chibi proportions), the look of its '
    'plain brown CARDBOARD BOX and the way the scene is cut out on a transparent background. Do NOT copy its '
    'composition, and do NOT take the hero\'s look from it - the look comes ONLY from reference image 1.\n'
)
REF2_COND = (
    'Reference image 2 is the MAIN illustration of this same event - the moment just before this one: keep the SAME '
    'setting, the same props, the same art style (bold dark hand-drawn outlines, flat colours with soft cel shading, '
    'chunky cute chibi proportions) and the same cut-out way on a transparent background, so the two pictures read '
    'as one story. But draw the NEW moment described below, and do NOT take the hero\'s look from it - the hero in '
    'reference image 2 may be an older drawing; the hero\'s look comes ONLY from reference image 1.\n'
)
TAIL = (
    'Only the characters described in this SCENE appear - no other cats or creatures, and never a second copy of the '
    'hero{extra}. No text, no letters, no numbers, no writing of any kind (paper, signs, boards, drawers and labels '
    'carry only simple pictures or paw prints, never words), no speech bubbles, no frame, no border. Truly '
    'transparent RGBA background: no checkerboard drawing, no white box, no wall or sky filling the frame, no cast '
    'shadow outside the small floor patch. The whole scene is centred with a clear transparent margin on every side; '
    'nothing is cut off at the edges.\n'
    'Steam, smoke, mist, bubbles, glow and light are drawn SOLID and OPAQUE as flat shapes with outlines, never '
    'see-through.\n'
    'Style: thick black outlines, FLAT colours with only subtle soft shading - not painterly, no heavy airbrushed '
    'shadows, cute cartoon, not photorealistic. THE FACE ESPECIALLY: flat blocks of colour with hard edges between '
    'them; no shaded blob around the muzzle, no glow on the cheeks.\n'
)
TAIL_EXTRA = {
    'q_ambush': ' (the dark silhouettes with glowing eyes described above are the only other figures)',
    'q_merchant': ' (the pedlar described above is the only other figure)',
    'rare_sleeping_hoard': ' (the huge sleeping black shadow described above is the only other figure)',
}


def event_prompt(name: str) -> str:
    j = EVENT_JOBS[name]
    look = LOOK[c1.LOOK_KEY[j.hero]].replace('dark-brown face mask', 'dark-brown face markings')
    text = HEAD.format(name=NAME[j.hero], look=look)
    if j.scene == 'shrine':
        text += REF2_COND
    elif j.scene == 'chest':
        text += REF2_CHEST
    else:
        text += REF2_SCENE.format(what=SCENE_REF[j.scene][1])
    for i, key in enumerate(j.extras, start=3):
        text += EXTRA[key][1].format(n=i) + '\n'
    text += f'SCENE: {j.what}\n'
    text += TAIL.format(extra=TAIL_EXTRA.get(j.group, ''))
    return text + rules(j.hero, GEAR_OVERRIDE.get((j.stem, j.hero)), FEIFEI_NOTE.get(j.stem, ''))


def event_refs(name: str) -> list[Path]:
    j = EVENT_JOBS[name]
    if j.scene == 'shrine':
        scene = REF / f'scene_{event_name(j.hero, "broken_shrine")}.png'
    else:
        scene = REF / f'scene_{event_name(j.hero, SCENE_REF[j.scene][0])}.png'
    out = [REF / f'idle_{j.hero}.png', scene]
    for key in j.extras:
        out.append(REF / ('design_merchant.png' if key == 'merchant' else f'{key}.png'))
    return out


# ================================================================ 共用：提示詞、參考圖

def kind_of(name: str) -> str:
    if name in ICON_JOBS:
        return 'icon'
    if name in PURE_JOBS:
        return 'pure'
    if name in DESIGN_JOBS:
        return 'design'
    if name in SPRITE_JOBS:
        return 'sprite'
    if name in EVENT_JOBS:
        return 'event'
    raise SystemExit(f'沒有這一張：{name}')


def prompt_for(name: str) -> str:
    k = kind_of(name)
    if k == 'icon':
        return icon_prompt(name)
    if k == 'pure':
        return PURE_PROMPT.format(change=PURE_JOBS[name][1])
    if k == 'design':
        return design_prompt(name)
    if k == 'sprite':
        return sprite_prompt(name)
    return event_prompt(name)


def refs_for(name: str) -> list[Path]:
    k = kind_of(name)
    if k == 'icon':
        return [REF / f'style_{name}.png']
    if k == 'pure':
        return [REF / f'base_{name}.png']
    if k == 'design':
        return [REF / 'keeper_style.png']
    if k == 'sprite':
        return [REF / f'design_{SPRITE_JOBS[name][0]}.png', REF / 'keeper_style.png']
    return event_refs(name)


def gen_size(name: str) -> str:
    k = kind_of(name)
    if k in ('icon', 'pure', 'design'):
        return '1024x1024' if k != 'design' else '1024x1536'
    return '1024x1536' if k == 'sprite' else '1536x1024'


def pure_base(name: str) -> None:
    """淨化版的原件圖：本批的原件照 `picks.json` 用挑定的那張原檔，既有的用 public 的圖示放大（鋪白底）。"""
    base = PURE_JOBS[name][0]
    if base in ICON_JOBS:
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        if base not in picks:
            raise SystemExit(f'{name} 的原件 {base} 還沒挑定，先 pick 它')
        im, _ = c1.clean(Image.open(SOURCE / f'{base}.try{picks[base]["attempt"]}.png').convert('RGBA'), .004)
        im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    else:
        im = Image.open(ICONS / f'{base}.webp').convert('RGBA')
        im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    c1.white(im, (1024, 1024)).save(REF / f'base_{name}.png')


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        on_white(idle_frame(c1.LOOK_KEY[hero]), .8).save(REF / f'idle_{hero}.png')
        for stem in [s for s, _ in SCENE_REF.values()] + ['broken_shrine']:
            src = BG / f'{event_name(hero, stem)}.webp'
            c1.white(Image.open(src), (1024, 768)).save(REF / f'scene_{event_name(hero, stem)}.png')
    for key, (src, _) in EXTRA.items():
        if src:
            c1.white(Image.open(ASSETS / src), (1024, 1024)).save(REF / f'{key}.png')
    # 橘貓老闆的招呼圖：畫風與取景參考（鋪白底，直的）
    c1.white(Image.open(SHOP / 'keeper.webp'), (1024, 1536)).save(REF / 'keeper_style.png')
    for name, (_, style, _) in ICON_JOBS.items():
        sheet = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
        for i, stem in enumerate(style):
            icon = Image.open(ICONS / f'{stem}.webp').convert('RGBA').resize((420, 420), Image.LANCZOS)
            sheet.alpha_composite(icon, [(46, 46), (558, 46), (302, 558)][i])
        sheet.convert('RGB').save(REF / f'style_{name}.png')
    for name, (base, _, _) in PURE_JOBS.items():
        if base not in ICON_JOBS:
            pure_base(name)
    print(f'參考圖已輸出到 {REF}（配角設計圖要先 gen 再 design 定稿；本批原件的淨化版要等原件挑定）')


# ================================================================ 生

def generate(name: str, note: str = '') -> tuple[str, int, str]:
    if kind_of(name) == 'pure' and PURE_JOBS[name][0] in ICON_JOBS:
        pure_base(name)
    with c1._LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f'\n{note}' if note else '')
    refs_ = refs_for(name)
    missing = [p for p in refs_ if not p.exists()]
    if missing:
        (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
        return name, attempt, f'缺參考圖 {[p.name for p in missing]}（先跑 refs／design）'
    command = [sys.executable, str(c1.IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', gen_size(name), '--quality', 'high', '--prompt', text]
    for ref in refs_:
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
        # 伺服器滿載、連線被切斷才等一下重試（codex_gen.py 坑 9；art3 遇過 WinError 10054）
        if 'capacity' not in result.stderr and '10054' not in result.stderr:
            break
        time.sleep(40)
    (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
    c1.record(PROMPTS, name, {'attempt': attempt, 'status': status, 'prompt': text,
                              'refs': [p.name for p in refs_], 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


# ================================================================ 挑（只放檔、不登記）

def design(name: str, attempt: int) -> None:
    """配角設計圖定稿：清碎點、裁透明邊、鋪白底存成 `_ref/<名>.png`，之後每一張都附它（不進 public）。"""
    src = SOURCE / f'{name}.try{attempt}.png'
    im, _ = c1.clean(Image.open(src).convert('RGBA'), .004)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    c1.white(im, (1024, 1536)).save(REF / f'{name}.png')
    save_pick(name, {'attempt': attempt, 'ref': (REF / f'{name}.png').relative_to(ROOT).as_posix()})
    print(f'{name} 定稿第 {attempt} 次 → {REF / f"{name}.png"}')


def save_pick(name: str, entry: dict) -> None:
    with c1._LOCK:
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        entry['at'] = time.strftime('%Y-%m-%d %H:%M:%S')
        picks[name] = entry
        PICKS.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def fit_sprite(im: Image.Image, head: float, fit: bool = False) -> tuple[Image.Image, float]:
    """立繪：照頭寬縮放（原檔頭寬 `head` → `HEAD_TARGET`），腳底貼下緣、外框水平置中，貼進 332×420。

    放不進畫布就停下來（縮了頭就不一樣大——設計稿「比頭不比外框」）。`fit` 准頭最多縮到 `FIT_MIN`
    （阿福那種「身體最大隻」照頭寬會比畫布高一點點），再多就要重生；縮了多少記在 `picks.json`。
    """
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox())
    k = HEAD_TARGET / head
    w, h = round(im.width * k), round(im.height * k)
    if w > SPRITE_SIZE[0] or h > SPRITE_SIZE[1]:
        shrink = min(SPRITE_SIZE[0] / w, SPRITE_SIZE[1] / h)
        if not fit or shrink < FIT_MIN:
            raise SystemExit(f'照頭寬縮完是 {w}×{h}，塞不進 {SPRITE_SIZE[0]}×{SPRITE_SIZE[1]}（要把頭縮到 '
                             f'{shrink:.0%}）：{"超過准許的 " + format(FIT_MIN, ".0%") if fit else "加 --fit 或"}重生（姿勢收一點）')
        k *= shrink
        w, h = min(SPRITE_SIZE[0], round(im.width * k)), min(SPRITE_SIZE[1], round(im.height * k))
    small = im.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', SPRITE_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(small, ((SPRITE_SIZE[0] - w) // 2, SPRITE_SIZE[1] - h))
    return canvas, k


def pick(name: str, attempt: int, force: bool = False, head: float | None = None, fit: bool = False) -> None:
    kind = kind_of(name)
    if kind == 'design':
        design(name, attempt)
        return
    src = SOURCE / f'{name}.try{attempt}.png'
    if not src.exists():
        raise SystemExit(f'找不到 {src.name}')
    raw = Image.open(src).convert('RGBA')
    errs = c1.gate(name, raw)
    if errs and not force:
        raise SystemExit(f'{name} 第 {attempt} 次沒過閘門：' + '；'.join(errs))
    # `--force` 只放行「透明比例 20～30%」這一種（同 art4 的 c2eb）：四角不透明、主體碰邊一律不收
    transparent = float((np.array(raw)[..., 3] == 0).mean())
    if errs and (len(errs) > 1 or not errs[0].startswith('透明的地方只有') or transparent < .2):
        raise SystemExit(f'{name} 第 {attempt} 次的閘門問題不能硬收：' + '；'.join(errs))
    entry: dict = {'attempt': attempt, 'gate': errs, 'sourceSize': list(raw.size)}
    if kind in ('icon', 'pure'):
        cleaned, dropped = c1.clean(raw, .004)
        counter = name in COUNTER
        out_img = c2.fit_counter(cleaned) if counter else c1.fit_icon(cleaned)
        if counter and c2.corner_alpha(out_img) > 8:
            raise SystemExit(f'{name}：右下角沒讓出來（alpha {c2.corner_alpha(out_img)}）')
        target = ICONS / f'{name}.webp'
        out_img.save(target, 'WEBP', quality=80, method=6)
        if counter and c2.corner_alpha(Image.open(target).convert('RGBA')) > 8:
            raise SystemExit(f'{name}：存檔後右下角有殘影')
        entry.update(section='icons', key=f'codex/{name}', counterCorner=c2.CORNER if counter else None)
    elif kind == 'sprite':
        if head is None:
            raise SystemExit('立繪要給 --head（原檔上量到的頭寬，臉頰外緣到外緣、不含耳朵）')
        cleaned, dropped = c1.clean(raw, .002)
        out_img, k = fit_sprite(cleaned, head, fit)
        target = SHOP / f'{name}.webp'
        out_img.save(target, 'WEBP', quality=82, method=6)
        entry.update(section='sprites', key=f'shop/{name}', headSource=head, scale=round(k, 4),
                     headTarget=HEAD_TARGET, headInCanvas=round(head * k, 1))
    else:
        cleaned, dropped = c1.clean(raw, .0015)
        out_img = c1.fit_event(cleaned)
        target = BG / f'{name}.webp'
        out_img.save(target, 'WEBP', quality=80, method=6)
        j = EVENT_JOBS[name]
        entry.update(section='bg', key=f'bg/{name}', group=j.group, stem=j.stem, hero=j.hero)
    data = target.read_bytes()
    a = np.array(out_img)[..., 3]
    semi = float(((a > 0) & (a < 248)).sum() / max(1, (a > 0).sum()))
    entry.update(file=target.relative_to(ROOT).as_posix(), size=list(out_img.size), bytes=len(data),
                 droppedSpecks=dropped, semiTransparentShare=round(semi, 4), sha256=hashlib.sha256(data).hexdigest())
    save_pick(name, entry)
    print(f'{name} 採用第 {attempt} 次 → {entry["file"]}（{len(data)} 位元組，清掉碎點 {dropped} 塊，'
          f'半透明 {semi:.1%}）→ 鍵 {entry["key"]}（先不登記，接線時跑 register）')


def deliverables() -> list[str]:
    """要進 public 的全部（不含設計圖）：圖示 24＋淨化版 6＋立繪 12＋事件圖 88＝130。"""
    return list(ICON_JOBS) + list(PURE_JOBS) + list(SPRITE_JOBS) + list(EVENT_JOBS)


def register_picked(dry_run: bool) -> None:
    """照 `picks.json` 把本批 130 張一次登記進清單（程式接線時跑；寫法同第一批 `register`：兩格縮排、只加新行）。"""
    picks = json.loads(PICKS.read_text(encoding='utf-8'))
    names = deliverables()
    missing = [n for n in names if n not in picks]
    if missing:
        raise SystemExit(f'這幾張還沒挑定：{missing}')
    gone = [n for n in names if not (ROOT / picks[n]['file']).exists()]
    if gone:
        raise SystemExit(f'這幾張的檔案不在 public/：{gone}')
    entries: dict[str, dict[str, str]] = {}
    for n in names:
        entries.setdefault(picks[n]['section'], {})[picks[n]['key']] = picks[n]['file'].removeprefix('public/')
    counts = '、'.join(f'{s} {len(v)} 筆' for s, v in entries.items())
    if dry_run:
        print(f'（試跑，沒有寫檔）會登記 {len(names)} 筆：{counts}')
        return
    c1.register(entries)
    print(f'清單已登記 {len(names)} 筆：{counts}')


# ================================================================ 聯絡表

def _checker(size: tuple[int, int]) -> Image.Image:
    bg = Image.new('RGBA', size, (226, 226, 226, 255))
    d = ImageDraw.Draw(bg)
    for yy in range(0, size[1], 16):
        for xx in range(0, size[0], 16):
            if (xx // 16 + yy // 16) % 2:
                d.rectangle([xx, yy, xx + 15, yy + 15], fill=(246, 246, 246, 255))
    return bg


def shop_sheet(out: Path) -> None:
    """立繪跟橘貓老闆並排、遊戲實際大小：罐頭鋪的立繪高 290 像素、左右翻（`screens.css` 的 `.scene-portrait`），
    底下墊罐頭鋪的背景。三列＝招呼、成交、錢不夠；每一列最左邊是橘貓老闆。另存一張把頭放大兩倍的。"""
    rows = [('keeper', ''), ('happy', '_happy'), ('no', '_no')]
    who = [('orange', 'keeper'), ('tortoise', 'keeper_tortoise'), ('curio', 'keeper_curio'),
           ('junk', 'keeper_junk'), ('merchant', 'merchant')]
    h = 290
    k = h / SPRITE_SIZE[1]
    w = round(SPRITE_SIZE[0] * k)
    gap = 14
    bgimg = Image.open(BG / 'screen_shop.webp').convert('RGB')
    width = gap + len(who) * (w + gap)
    height = gap + len(rows) * (h + 34 + gap)
    sheet = ImageOps.fit(bgimg, (width, height)).convert('RGBA')
    d = ImageDraw.Draw(sheet)
    font = c1._font(16)
    for r, (_, suffix) in enumerate(rows):
        y = gap + r * (h + 34 + gap)
        for i, (label, base) in enumerate(who):
            x = gap + i * (w + gap)
            f = SHOP / f'{base}{suffix}.webp'
            if not f.exists():
                continue
            im = ImageOps.mirror(Image.open(f).convert('RGBA')).resize((w, h), Image.LANCZOS)
            sheet.alpha_composite(im, (x, y))
            d.rectangle([x, y, x + w - 1, y + h - 1], outline=(255, 255, 255, 90))
            d.line([(x, y + h - 1), (x + w, y + h - 1)], fill=(255, 210, 90, 255), width=2)
            d.text((x + 4, y + h + 6), f'{base}{suffix}', fill=(255, 255, 255), font=font, stroke_width=2,
                   stroke_fill=(0, 0, 0))
    sheet.convert('RGB').save(out)
    print(f'店主並排（遊戲實際大小，立繪高 {h}、已左右翻）{out}（{sheet.size[0]}×{sheet.size[1]}）')


def sheet(kind: str, out_dir: Path) -> None:
    """種類：bless／relic（圖示 500）、mix（新秘寶與淨化版、原件並排，實際遊戲大小 1x 與 3x）、counter、
    design（四張設計圖）、keepers（12 張立繪 500）、shop（跟橘貓老闆並排、實際大小）、或組名（那一組四隻並排 500）。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    if kind == 'bless':
        c1.contact([ICONS / f'{n}.webp' for n in BLESS], out_dir / 'c3_bless_500.png', 500, 4)
    elif kind == 'relic':
        files = [ICONS / f'{n}.webp' for n in RELIC_NEW + list(PURE_JOBS)]
        c1.contact(files, out_dir / 'c3_relic_500.png', 500, 4)
    elif kind == 'mix':
        # 淨化版跟原件一張隔一張（原件＝「舊」、淨化版＝「新」黃條）；新 9 件另一張跟既有圖示混排
        base = [PURE_JOBS[n][0] for n in PURE_JOBS]
        c1.mix_sheet(out_dir / 'c3_pure_pairs_1x.png', list(PURE_JOBS), base, 1)
        c1.mix_sheet(out_dir / 'c3_pure_pairs_3x.png', list(PURE_JOBS), base, 3)
        older = ['relic_wholesale_crate', 'relic_small_cushion', 'relic_bond_knot', 'relic_bamboo_copter',
                 'relic_paper_bag', 'relic_miasma_charm', 'potion_sword_talisman', 'relic_member_card',
                 'relic_wrist_guard']
        c1.mix_sheet(out_dir / 'c3_relic_mix_1x.png', RELIC_NEW, older, 1)
        c1.mix_sheet(out_dir / 'c3_relic_mix_3x.png', RELIC_NEW, older, 3)
        bless_old = ['relic_potion_bag', 'relic_guard_charm', 'relic_coin_jar', 'relic_worn_scroll', 'relic_onigiri_bag',
                     'relic_glutton_purse', 'relic_scroll', 'relic_master_gourd']
        c1.mix_sheet(out_dir / 'c3_bless_mix_1x.png', BLESS, bless_old, 1)
    elif kind == 'counter':
        saved = c2.COUNTER
        c2.COUNTER = COUNTER
        try:
            c2.counter_preview(out_dir / 'c3_counter_3x.png', 3)
        finally:
            c2.COUNTER = saved
    elif kind == 'design':
        c1.contact([REF / f'{n}.png' for n in DESIGN_JOBS], out_dir / 'c3_design_500.png', 500, 4)
    elif kind == 'keepers':
        c1.contact([SHOP / f'{n}.webp' for n in SPRITE_JOBS], out_dir / 'c3_keepers_500.png', 500, 3)
    elif kind == 'shop':
        shop_sheet(out_dir / 'c3_shop_side_by_side_1x.png')
    elif kind in GROUPS:
        stems = [kind] if not GROUPS[kind][3] else [kind] + [f'{kind}_r{r}' for r in GROUPS[kind][3]]
        files = [BG / f'{event_name(h, s)}.webp' for s in stems for h in HEROES]
        missing = [f.name for f in files if not f.exists()]
        if missing:
            raise SystemExit(f'還沒挑定：{missing}')
        c1.contact(files, out_dir / f'c3_{kind}_500.png', 500, 4)
    else:
        raise SystemExit(f'不認得 {kind}')


def keys() -> None:
    lines = []
    for n in ICON_JOBS:
        lines.append(f'codex/{n}\tpublic/assets/icons/{n}.webp\t{ICON_JOBS[n][2]}' + ('\t計數型' if n in COUNTER else ''))
    for n, (base, _, zh) in PURE_JOBS.items():
        lines.append(f'codex/{n}\tpublic/assets/icons/{n}.webp\t{zh}（淨化版，原件 {base}）')
    for n, (who, mood) in SPRITE_JOBS.items():
        lines.append(f'shop/{n}\tpublic/assets/sprites/shop/{n}.webp\t{KEEPERS[who]["zh"]}・{mood}')
    for n, j in EVENT_JOBS.items():
        lines.append(f'bg/{n}\tpublic/assets/bg/{n}.webp\t{j.group}\t{j.stem}')
    sys.stdout.write('\n'.join(lines) + '\n')


def names_of_group(group: str) -> list[str]:
    if group in GROUPS:
        return [n for n, j in EVENT_JOBS.items() if j.group == group]
    if group == 'bless':
        return BLESS
    if group == 'relic':
        return RELIC_NEW
    if group == 'pure':
        return list(PURE_JOBS)
    if group == 'design':
        return list(DESIGN_JOBS)
    if group in KEEPERS:
        return [n for n, (w, _) in SPRITE_JOBS.items() if w == group]
    raise SystemExit(f'不認得這一組：{group}')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    sub.add_parser('keys')
    p = sub.add_parser('prompt')
    p.add_argument('name')
    g = sub.add_parser('gen')
    g.add_argument('names', nargs='*')
    g.add_argument('--group', action='append', default=[],
                   help='一整組：事件組名（GROUPS）、bless、relic、pure、design、tortoise／curio／junk／merchant')
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('name')
    k.add_argument('attempt', type=int)
    k.add_argument('--force', action='store_true', help='透明比例 20～30% 也收（只放行這一種；要在報告寫原因）')
    k.add_argument('--head', type=float, help='立繪：原檔上量到的頭寬（像素）')
    k.add_argument('--fit', action='store_true', help=f'立繪：照頭寬塞不進畫布時准頭縮到 {FIT_MIN:.0%} 為止')
    d = sub.add_parser('design')
    d.add_argument('name')
    d.add_argument('attempt', type=int)
    s = sub.add_parser('sheet')
    s.add_argument('kind')
    s.add_argument('out_dir')
    r = sub.add_parser('register', help='接線時：把本批 130 張一次登記進清單')
    r.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'keys':
        keys()
    elif args.command == 'prompt':
        print(prompt_for(args.name))
    elif args.command == 'pick':
        pick(args.name, args.attempt, args.force, args.head, args.fit)
    elif args.command == 'design':
        design(args.name, args.attempt)
    elif args.command == 'sheet':
        sheet(args.kind, Path(args.out_dir))
    elif args.command == 'register':
        register_picked(args.dry_run)
    else:
        names = list(args.names)
        for grp in args.group:
            names += names_of_group(grp)
        for n in names:
            kind_of(n)
        if not names:
            raise SystemExit('沒給要生哪幾張')
        SOURCE.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, attempt, status in pool.map(lambda n: generate(n, args.note), names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
