"""內容擴充第一批的圖（2026-09-23，批次 c1）：秘寶圖示 18、忍具圖示 10、事件插圖 36。

規格來源：`docs/審查報告/2026-09-23/內容擴充提案_秘寶忍具事件.md` 第⑤節「第一批」。
這支只管「生、挑、放進 public、登記素材清單」；秘寶／忍具／事件的資料與接線是程式代理的事。
每一張的最終鍵名與檔名對照另寫在派工暫存區的 `batch1_art_keys.md`（也印得出來：`keys`）。
丟出去的「火雷珠」飛行物走 `tools/gen_projectile_art.py`（`thunder_bead`），不在這支。

做法（沿用 09-22 rest 批次的銅護臂圖示、09-23 mirror 批次的事件圖）：
  gpt-image-1.5 真透明（codex-oauth），不走綠幕去背。
  - 圖示：參考圖① 同類三張既有圖示拼成一張（只取畫風）。挑定後裁透明邊、長邊貼滿 128、置中，
    存 `public/assets/icons/<名>.webp`（quality 80，同 `add_icons.py`），清單鍵 `codex/<名>`。
  - 事件圖：參考圖① 這隻貓的新版待機第 1 格（長相一律照它，不拿舊立繪當長相參考）、
    ② 同一隻既有的事件圖（只取畫風與「去背小場景」的構圖方式）、屋頂那篇多一張 ③ 影球球待機。
    挑定後照主體外框補成 4:3 再縮成 560×420（同 `gen_feifei_mirror_hall.py`），存 `public/assets/bg/<名>.webp`，
    清單鍵 `bg/<名>`。結果圖一律 `<事件代號>_r<選項序號>`（`tools/event_result_art.test.ts` 的規則），
    「什麼都不做」與「進戰鬥」的選項不畫（同一支測試的 `shouldHaveArt`）。

用法：
    python tools/gen_content_batch1_art.py refs
    python tools/gen_content_batch1_art.py prompt relic_snake_fang
    python tools/gen_content_batch1_art.py gen relic_snake_fang potion_qi_tea --jobs 4
    python tools/gen_content_batch1_art.py gen event_daxia_chest --note "修正說明"
    python tools/gen_content_batch1_art.py pick relic_snake_fang 2      # 裁、縮、存 webp、併進清單（HOLD 那 5 張不併）
    python tools/gen_content_batch1_art.py register                      # 接線時：把 HOLD 那 5 張登記進清單
    python tools/gen_content_batch1_art.py sheet relic <輸出資料夾>       # relic / potion / event / mix
    python tools/gen_content_batch1_art.py keys                          # 印鍵名對照
每一次生圖都存成 `<名>.try<N>.png`（不覆蓋），提示詞記在 `prompts.json`、選定紀錄在 `picks.json`。
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

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from art_rules import FEIFEI_NOT_FAT, FEIFEI_NOT_HUMAN, gear_rule  # noqa: E402
from gen_rest_art import LOOK, idle_frame, on_white  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/c1'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
ICONS = ROOT / 'public/assets/icons'
BG = ROOT / 'public/assets/bg'
MANIFEST = ROOT / 'public/assets/manifest.json'
ICON_SIZE = 128
EVENT_SIZE = (560, 420)

# **先不登記進清單的 5 張**（2026-09-23）：這幾篇事件還沒接進 `events.ts`，球球版主圖（沒有角色前綴、
# 不是結果圖、也不在任何一關的 `bgKeysForAct` 裡）一登記就會被 `preloadArt` 算成每個人的首載——
# 程式還沒有人會去要它們，等於每位玩家白下載約 210 KB，而且會讓推送閘門的圖片預算超標。
# 檔案照最終檔名放在 `public/assets/bg/`，接線的時候跑 `register` 把它們登記進去（見 `batch1_art_keys.md`）。
# 其他 31 張事件圖（結果圖、菲菲／噹噹／封封版）執行期本來就延後下載，照常登記。
HOLD = ('event_daxia_chest', 'event_daxia_lastpage', 'event_ninja_blue_headband', 'event_ninja_target',
        'event_ninja_roof_shadow')

# ---------------------------------------------------------------- 圖示

# 名 → (畫什麼, 參考畫風的三張同類既有圖示)。名字＝檔名＝清單鍵去掉 `codex/`，秘寶與忍具的代號照提案
ICON_JOBS: dict[str, tuple[str, list[str]]] = {
    # ---- 秘寶 18 件
    'relic_snake_fang': (
        'a SNAKE FANG PENDANT: one big curved ivory-white snake fang hanging point-down from a short braided '
        'plum-purple cord with a small gold cap and one purple bead; a single drop of sickly yellow-green venom '
        'beads at the sharp tip. The fang is the big bold shape.',
        ['relic_tiger_claws', 'relic_jade_pendant', 'relic_backstep']),
    'relic_miasma_sachet': (
        'a POISON-MIST SACHET: a plump teardrop-shaped embroidered silk scent pouch in deep wine-red with gold '
        'stitched cloud patterns, tied shut at the top with a gold cord, a red tassel hanging below, and a thick '
        'curl of sickly yellow-green poison mist puffing out of its mouth.',
        ['relic_guard_charm', 'relic_backstep', 'relic_glutton_purse']),
    'relic_herb_cauldron': (
        'a MEDICINE-KING CAULDRON: a small squat three-legged bronze ding cauldron with two upright loop handles, '
        'warm bronze-gold metal, filled to the brim with a bubbling bright yellow-green poison brew with round '
        'bubbles, two purple herb leaves sticking out, and a small puff of yellow-green steam on top.',
        ['relic_golden_bowl', 'relic_master_teacup', 'relic_master_gourd']),
    'relic_anvil': (
        'a BLACKSMITH ANVIL: one chunky dark-iron anvil with a bright polished top face and a pointed horn, '
        'standing on a short wooden stump block, a small copper-headed hammer leaning against it and two bright '
        'orange sparks flying off the top face.',
        ['relic_copper_bracer', 'relic_iron_collar', 'relic_turtle_shell']),
    'relic_knee_guard': (
        'a PADDED KNEE GUARD: one rounded copper-bronze knee-cap plate with rivets, mounted on a thick quilted '
        'brown leather pad shaped to a bent knee, with two leather straps and small brass buckles hanging off the '
        'sides. Clearly a knee guard (a dome plate on a pad), not a bracer and not a cuff.',
        ['relic_copper_bracer', 'relic_wrist_guard', 'relic_iron_shirt']),
    'relic_iron_weight_belt': (
        'a HEAVY WEIGHT BELT: a thick brown leather martial-arts belt rolled into a loose ring, with a big round '
        'dark-iron weight (a heavy iron ball with a flat bottom and a thick ring on top) hanging from its brass '
        'buckle by a short chain. The iron weight is the big bold shape - it must look extremely heavy.',
        ['relic_master_belt', 'relic_sand_bag', 'relic_copper_bracer']),
    'relic_whet_stone': (
        'a SWORD WHETSTONE: a long rectangular two-layer sharpening stone (warm reddish-brown top layer on a grey '
        'bottom layer) set in a small dark wooden holder, with the tip of a bright straight steel sword blade '
        'resting diagonally across it and one small gold spark where the blade touches the stone.',
        ['relic_old_sword_tassel', 'relic_coin_sword', 'relic_scratch_board']),
    'relic_tassel_knot': (
        'a SWORD TASSEL KNOT: an ornate Chinese decorative knot of bright red cord (a square woven endless knot '
        'with four little loops), a round white jade disc threaded above it, and a long flowing GOLD-YELLOW silk '
        'tassel hanging below. Red knot, white jade, gold tassel - three clear colour blocks.',
        ['relic_old_sword_tassel', 'relic_jade_pendant', 'relic_guard_charm']),
    'relic_qi_gourd': (
        'a QI-NURTURING GOURD: a small pale celadon porcelain double gourd (two bulbs, the lower one bigger) with '
        'a red cord tied around its waist, its cork stopper hanging on the cord beside the open mouth, and a swirl '
        'of warm golden qi energy curling up out of the mouth like a little flame-shaped wisp.',
        ['relic_master_teacup', 'relic_old_sword_tassel', 'relic_jade_pendant']),
    'relic_bamboo_tube': (
        'a BAMBOO WATER TUBE: one thick short section of green bamboo with two visible nodes, used as a canteen - '
        'a wooden stopper plugged into the top, a brown cord strap looped around it, and two blue water droplets '
        'on its side. Thick and chunky, standing upright.',
        ['relic_bamboo_copter', 'relic_worn_scroll', 'relic_headband']),
    'relic_startle_bell': (
        'a STARTLE BELL ON A BOW: a small curved wooden archery bow held upright with its string pulled taut, and '
        'one small bronze bell hanging from the middle of the string on a short red cord; two or three short '
        'curved motion marks beside the bell show it is jingling.',
        ['relic_bell', 'relic_tail_bell', 'relic_cat_teaser']),
    'relic_shadow_band': (
        'a SHADOW NINJA HEADBAND: a dark charcoal-black cloth ninja headband tied into a loop with two long tails '
        'fluttering to one side, a dull steel forehead plate on the front of the band, and dark violet-black '
        'shadow wisps (solid, with black outlines) trailing off the ends of the tails. Black and violet, clearly '
        'different from a blue headband.',
        ['relic_headband', 'relic_shadow_cloak', 'relic_black_cat_mask']),
    'relic_sleepless_censer': (
        'a SLEEPLESS INCENSE BURNER: a round bronze tripod incense censer with a domed pierced lid and a small '
        'knob on top, glowing orange embers visible through the lid holes, two curls of creamy-grey incense smoke '
        'rising, and one wide-open staring eye engraved on its round belly.',
        ['relic_master_teacup', 'relic_golden_bowl', 'relic_warm_stone']),
    'relic_greedy_pouch': (
        'a PURSE STUFFED WITH COPPER COINS: a fat bulging drawstring money sack of rough brown cloth, overflowing '
        'with dull copper square-holed coins, two strings of copper cash coins tied around its neck, and three '
        'coins spilling out beside it. Copper-orange and brown.',
        ['relic_glutton_purse', 'relic_lucky_coin', 'relic_coin_sword']),
    'relic_renounce_beads': (
        'a BROKEN PRAYER-BEAD BRACELET: a loop of dark reddish-brown wooden prayer beads whose cord has snapped - '
        'the loop is open, the two frayed cord ends dangle, and three loose beads tumble away from the gap.',
        ['relic_counting_beads', 'relic_jade_pendant', 'relic_tiger_claws']),
    'relic_mad_sheath': (
        'a MAD BLADE SCABBARD: a curved blood-red lacquered sabre scabbard with dark iron fittings, a jagged crack '
        'running along it, a strip of torn black cloth wrapped around the middle, a short bright blade edge showing '
        'through the crack, and a few jagged hot orange-red flame-like streaks (solid, with black outlines) '
        'flaring off it.',
        ['relic_blood_dagger', 'relic_claw_sheath', 'relic_old_sword_tassel']),
    'relic_shared_bento': (
        'a SHARED BENTO BOX: an open square red-and-black lacquered lunch box seen from a three-quarter top view, '
        'divided down the middle into TWO identical halves (each half has a white rice ball, a yellow rolled '
        'omelette slice and a small grilled fish), with two pairs of chopsticks laid across the top, one pair on '
        'each half.',
        ['relic_onigiri_bag', 'relic_golden_bowl', 'relic_sardine_tin']),
    'relic_bond_knot': (
        'a TWO-HEART BOND KNOT: a Chinese concentric-heart knot made of red silk cord - two heart-shaped loops '
        'woven through each other into one knot - with a small gold bead in the centre and TWO tassels hanging '
        'below, one red and one gold.',
        ['relic_guard_charm', 'relic_old_sword_tassel', 'relic_jade_pendant']),
    # ---- 忍具 10 支
    'potion_qi_tea': (
        'a POT OF BRACING TEA: a small round brown clay teapot with a curved spout, a round lid and a loop handle, '
        'a swirl of warm golden qi steam curling up out of the spout in a spiral.',
        ['potion_catgrass_tea', 'potion_milk', 'potion_first_incense']),
    'potion_sword_talisman': (
        'a SWORD-INTENT TALISMAN: one tall vertical rectangular yellow paper talisman with a red border, a bold '
        'red painted straight SWORD shape running down its centre (a picture of a sword, no writing), a small red '
        'tassel at the top and a few short golden spark lines flaring from its edges.',
        ['potion_nine_lives', 'potion_secret_scroll', 'potion_first_incense']),
    'potion_spread_powder': (
        'a SPREADING POISON POWDER PACKET: a small folded square packet of white medicine paper with a purple '
        'paper band, torn open at one corner, a burst of sickly yellow-green poison powder puffing out and '
        'splitting into three small round clouds of powder that fly apart.',
        ['potion_pepper', 'potion_break_art', 'potion_double_back']),
    'potion_needle_salve': (
        'a POT OF THOUSAND-NEEDLE SALVE: a small round white porcelain ointment jar with a blue band, open, filled '
        'with a glossy dark-purple poison salve, with three thin gold needles standing upright stuck into the salve.',
        ['potion_iron_salve', 'potion_bird_glue', 'potion_needle_rain']),
    'potion_iron_oil': (
        'a FLASK OF IRON-SHIRT OIL: a squat round dark-iron flask built like armour, with two copper bands and rows '
        'of round rivets, a copper cork, and one fat glossy drop of dark golden oil sliding down from its mouth.',
        ['potion_claw_oil', 'potion_clone_oil', 'potion_iron_salve']),
    'potion_payback_powder': (
        'a POUCH OF TOOTH-FOR-A-TOOTH POWDER: a small open red-orange cloth pouch heaped with bright red-orange '
        'spiky crystal powder, with one big white fang tooth tied to its drawstring by a short cord.',
        ['potion_rubble_bag', 'potion_break_art', 'potion_steal_claw']),
    'potion_dive_straw': (
        'a DIVING STRAW: one long thin green bamboo breathing tube sticking up diagonally out of a small round '
        'splash of blue water, three white-blue air bubbles rising beside it. Only the top part of the tube and the '
        'little water splash are shown.',
        ['potion_cat_step', 'potion_milk', 'potion_tuna']),
    'potion_decoy_doll': (
        'a SUBSTITUTE DECOY DOLL: a small stuffed cloth doll shaped like a round grey cat, with two button eyes, a '
        'stitched mouth, a sewn patch on its belly and a tiny navy-blue headband tied on its head, sitting upright, '
        'with a small puff of creamy-grey smoke curling behind it. (The doll is an object, not a living character.)',
        ['potion_pick_back', 'potion_quilt', 'potion_smoke_bomb']),
    'potion_thunder_bead': (
        'a FIRE-THUNDER BEAD: a round glossy dark-red lacquered bomb bead held in a gold metal cage of crossing '
        'bands, a short fuse on top burning with a bright orange flame, and crackling zigzag yellow lightning '
        'sparks (solid, with black outlines) jumping around it.',
        ['potion_smoke_bomb', 'potion_firecracker', 'potion_claw_bolt']),
    'potion_share_half': (
        'a STEAMED BUN TORN IN HALF: one big fluffy white steamed bun pulled apart into TWO halves side by side, '
        'the soft insides showing, a little warm creamy-white steam rising from between them.',
        ['potion_onigiri', 'potion_dried_fish_bundle', 'potion_quilt']),
}

ICON_PROMPT = (
    'Create one game item icon for a cute cat-ninja card game: {what}\n'
    'Reference image 1 is a sheet of three OTHER item icons from this same game, shown ONLY for the ICON STYLE: '
    'bold dark hand-drawn outlines, flat bright colours with soft cel shading, a chunky readable silhouette, a '
    'slight three-quarter view. Match that icon style exactly, but do NOT draw any of those three objects and do '
    'NOT arrange several objects in a row.\n'
    'It is shown at only about 32 to 40 pixels in the game, so it must read from its silhouette and its main '
    'colours alone: one bold shape, high contrast, no fine detail, no tiny parts.\n'
    'Draw it SOLID and OPAQUE; any smoke, mist, steam, spark or energy that belongs to the item is drawn as a '
    'solid flat shape with a dark outline, never see-through.\n'
    'One item only, centred and filling about 85% of the image, truly transparent RGBA background: no '
    'checkerboard drawing, no background, no ground, no cast shadow, no glow halo around it, no text, no letters, '
    'no numbers, no border, no hands, no living characters.'
)

# ---------------------------------------------------------------- 事件圖

HERO_NAME = {'ninja': 'QIUQIU', 'feifei': 'FEIFEI', 'dangdang': 'DANGDANG', 'fengfeng': 'FENGFENG'}
LOOK_KEY = {'ninja': 'qiuqiu', 'feifei': 'feifei', 'dangdang': 'dangdang', 'fengfeng': 'fengfeng'}
PRONOUN = {'ninja': ('he', 'his', 'him'), 'feifei': ('she', 'her', 'her'),
           'dangdang': ('he', 'his', 'him'), 'fengfeng': ('he', 'his', 'him')}

# 身上拿不下來的東西（`art_rules.gear_rule`）。封封的劍會拔出來，所以只釘劍鞘
GEAR = {
    'ninja': 'the navy headband with its two long tails',
    'dangdang': 'the two copper forearm bracers',
    'fengfeng': 'the red scarf and the dark-brown scabbard at his waist',
}
FEIFEI_GEAR = (
    'WORN GEAR: the purple bow on her ponytail, the black scarf at her throat and the row of gold needle tubes at '
    'her belt are attached to her - they never detach, never float beside her and never appear twice.\n'
    'THE EYES: both eyes look the same way, same size, same shape; if the scene calls for closed eyes, close BOTH '
    'the same way.\n')


def hero_rules(hero: str) -> str:
    if hero == 'feifei':
        return FEIFEI_GEAR + FEIFEI_NOT_HUMAN + FEIFEI_NOT_FAT
    return gear_rule(GEAR[hero])


# 各隻「照著最後一頁練」的架勢（牌面與動作裡他們各自的招式）
PRACTICE = {
    'ninja': 'one paw thrust forward in a claw strike, the other paw pulled back at his side, feet planted wide',
    'feifei': 'one arm swept forward flicking a single thin gold needle, light on her toes',
    'dangdang': 'a firm low horse stance, pushing one copper-bracered forearm straight forward',
    'fengfeng': 'his straight jian drawn and thrust forward in a lunge, the empty scabbard still at his waist',
}

CHEST_SET = (
    'SETTING: a corner at the foot of a dark wooden staircase in the middle floors of the tower (dark wooden '
    'floorboards and the bottom of a wooden banister). An OLD WOODEN CHEST bound with dark iron corner plates stands '
    'there; its lid is carved with the master\'s mark - one big cat PAW PRINT carved into the wood (a picture, no '
    'letters). An old iron padlock hangs sprung open from the hasp.')
PAGE_SET = (
    'SETTING: night near the very top of the tower - a few wide grey stone steps with a low stone balustrade and '
    'one small stone lantern glowing warm orange. A single TORN-OUT PAGE of a martial-arts manual is involved: '
    'cream paper with one ragged torn edge, covered with fresh glossy black ink brush drawings of a small cat '
    'figure in a fighting pose (pictures only, no writing).')


def five_f(hero: str) -> dict[str, str]:
    """5F 兩版（師父的舊木箱、最後一頁）：每一隻各一套，畫面內容一樣、只換這一隻自己的樣子與架勢。"""
    he, his, him = PRONOUN[hero]
    name = HERO_NAME[hero]
    return {
        'daxia_chest': (
            f'{CHEST_SET} {name} crouches in front of the chest, one paw reaching out to lift the lid, looking at the '
            f'carved paw print with wide surprised eyes - {he} recognises the master\'s mark. The lid is still closed.'),
        'daxia_chest_r0': (
            f'{CHEST_SET} The chest lid is thrown wide open. {name} kneels beside it and lifts a thick old stitched '
            f'martial-arts manual out from the very bottom of the chest, holding it open with both paws: its pages show '
            f'three small ink drawings of a cat in fighting stances (pictures only, no writing). {his.capitalize()} '
            f'eyes shine with excitement.'),
        'daxia_chest_r1': (
            f'{CHEST_SET} The chest lid is open and the chest is empty. {name} stands beside it happily holding up the '
            f'two old ninja tools {he} took out of it: in one paw a small round dark smoke bomb with a short fuse, in '
            f'the other paw a small corked medicine gourd.'),
        'daxia_lastpage': (
            f'{PAGE_SET} The page lies on one of the steps. {name} bends down over it, reaching for it with both paws, '
            f'eyes wide - {he} recognises the master\'s brushwork and the ink is still wet.'),
        'daxia_lastpage_r0': (
            f'{PAGE_SET} The page is laid flat on a step, weighted down by a small stone. {name} practises the pose '
            f'drawn on it, copying it exactly: {PRACTICE[hero]}. The cat figure drawn on the page is in the same pose. '
            f'Determined, focused face.'),
        'daxia_lastpage_r1': (
            f'{PAGE_SET} {name} sits on a step with {his} eyes gently closed, folding the page small and tucking it '
            f'into the front collar of {his} jacket, one paw pressed over it on {his} chest, a small warm smile - '
            f'remembering what the master taught {him}. Three tiny solid gold sparkles float beside {his} head.'),
        'daxia_lastpage_r2': (
            f'{PAGE_SET} {name} sits resting on a step, leaning back against the balustrade, the page folded and '
            f'tucked safely into a small pouch at {his} belt (not being read), drinking from a short green bamboo '
            f'water flask with a relieved, relaxed face - taking a breather before the last climb.'),
    }


QIUQIU_OWN = 'His own headband stays on his head: DARK NAVY blue, clean and bright.'
RAIL_SET = (
    'SETTING: a flight of grey stone steps with an old wooden stair railing (a wooden handrail on a thick square '
    'post). A FADED HEADBAND is involved: a pale, washed-out sky-blue cloth headband, frayed at the edges, the same '
    'shape as the hero\'s own headband with two tails - but clearly faded and paler than his own.')
TARGET_SET = (
    'SETTING: a patch of worn wooden training floor. A ROUND WOODEN TARGET stands on a sturdy wooden tripod stand: '
    'thick wooden rings, riddled with MANY old rusty shuriken stuck into it all over, and its bullseye in the centre '
    'is worn smooth and SHINY from countless hits.')
ROOF_SET = (
    'SETTING: night, on a dark grey clay-tiled rooftop of the tower with a curved upturned eave and the roof ridge. '
    'The SHADOW DOUBLE is involved: a pure dark violet-black shadow copy of Qiuqiu with a smoky body, a shadow '
    'headband and two glowing pale violet eyes, solid dark smoke wisps with black outlines - exactly like the '
    'shadow cat in reference image 3.')

NINJA_EVENTS: dict[str, str] = {
    'ninja_blue_headband': (
        f'{RAIL_SET} The faded headband is tied around the railing post, its two tails hanging and fluttering. '
        f'QIUQIU stands beside the post reaching out one paw to touch it, surprised and wistful. {QIUQIU_OWN}'),
    'ninja_blue_headband_r0': (
        f'{RAIL_SET} QIUQIU has untied the faded headband and winds it tightly around his left wrist and forearm as '
        f'a wrist band, pulling the knot tight with his other paw, a determined little smile. {QIUQIU_OWN}'),
    # 第一次寫「包紮手臂上的擦傷」被生圖端的安全檢查擋掉（誤判成自殘），改成急救式地纏在膝蓋上、不提傷口
    'ninja_blue_headband_r1': (
        f'{RAIL_SET} QIUQIU sits on a step; he has torn the faded headband into strips and ties one strip neatly '
        f'around his sore knee like a first-aid wrap after a long climb, two more torn strips lying beside him, a '
        f'relieved, cheerful face. {QIUQIU_OWN}'),
    'ninja_target': (
        f'{TARGET_SET} QIUQIU stands in front of the target looking up at it with admiration, one paw on his chin.'),
    'ninja_target_r0': (
        f'{TARGET_SET} It is after dark: a small paper lantern hangs lit from the target stand. QIUQIU, tired and '
        f'scuffed (two small scratches, a small bandage on one cheek, sweat drops), is in the middle of throwing a '
        f'shuriken, and one fresh bright shuriken has just stuck right into the shiny bullseye.'),
    'ninja_target_r1': (
        f'{TARGET_SET} QIUQIU pulls old shuriken out of the target: he holds a small bundle of three still-good '
        f'shuriken in one paw and inspects one closely with a satisfied look; two broken rusty ones lie on the floor.'),
    'ninja_roof_shadow': (
        f'{ROOF_SET} The shadow double dashes along the high eave of the roof. QIUQIU crouches on a lower part of the '
        f'roof staring up at it in shock - it looks exactly like him. Only these two figures appear.'),
    'ninja_roof_shadow_r1': (
        f'{ROOF_SET} QIUQIU hides behind the roof ridge, peeking over it with only his head and paws showing, '
        f'watching intently. Further along the roof the shadow double practises a move - a flying kick - without '
        f'noticing him. Only these two figures appear.'),
}

EVENT_HEAD = (
    'Create one new EVENT ILLUSTRATION for a cute cat-ninja card game. It is a cut-out vignette: only the '
    'characters and the few props of the scene (with at most a small patch of floor or steps under them), on a '
    'truly transparent background.\n'
    'Reference image 1 is the hero\'s CURRENT official look: copy {name}\'s face, fur colours and markings, the head '
    'size relative to the body, the body proportions, the outfit and its colours EXACTLY from it. The hero is {look}.\n'
    'Reference image 2 is an existing event illustration from this game: copy its ART STYLE (bold dark hand-drawn '
    'outlines, flat colours with soft cel shading, chunky cute chibi proportions) and the way the scene is cut out on '
    'a transparent background. Do NOT copy its composition or its props, and do NOT take the hero\'s look from it - '
    'the look comes ONLY from reference image 1.\n'
)
EVENT_TAIL = (
    'Only the characters named above appear - no other cats, no extra copies of the hero, no enemies, no master. '
    'No text, no letters, no numbers, no writing of any kind (drawings on paper are simple ink pictures, never '
    'words), no speech bubbles, no frame, no border. Truly transparent RGBA background: no checkerboard drawing, no '
    'white box, no wall or sky filling the frame, no cast shadow outside the small floor patch. The whole scene is '
    'centred with a clear transparent margin on every side; nothing is cut off at the edges.\n'
    'Style: thick black outlines, FLAT colours with only subtle soft shading - not painterly, no heavy airbrushed '
    'shadows, cute cartoon, not photorealistic. THE FACE ESPECIALLY: flat blocks of colour with hard edges between '
    'them; no shaded blob around the muzzle, no glow on the cheeks.\n'
)

HEROES = ['ninja', 'feifei', 'dangdang', 'fengfeng']


def event_name(hero: str, stem: str) -> str:
    """檔名＝清單鍵去掉 `bg/`：球球版沒有前綴，其他三隻 `event_<角色>_<代號>`（`eventArtKey` 的規矩）。"""
    return f'event_{stem}' if hero == 'ninja' else f'event_{hero}_{stem}'


# 名 → (角色, 畫什麼, 場景畫風參考圖（public/assets/ 底下的相對路徑）, 要不要附影球球)
EVENT_JOBS: dict[str, tuple[str, str, str, bool]] = {}
for _h in HEROES:
    _scene_ref = f'bg/{event_name(_h, "daxia_teach")}.webp'   # 同一系列（5F）同一隻的那張
    for _stem, _what in five_f(_h).items():
        EVENT_JOBS[event_name(_h, _stem)] = (_h, _what, _scene_ref, False)
for _stem, _what in NINJA_EVENTS.items():
    _ref = {'ninja_blue': 'bg/event_lost_scroll.webp', 'ninja_targ': 'bg/event_training_hall.webp',
            'ninja_roof': 'bg/event_moon_window.webp'}[_stem[:10]]
    EVENT_JOBS[f'event_{_stem}'] = ('ninja', _what, _ref, _stem.startswith('ninja_roof_shadow'))

SHADOW_REF = 'monsters/shadow_cat_idle.webp'
SHADOW_NOTE = (
    'Reference image 3 shows the SHADOW DOUBLE (an existing enemy of this game): draw the shadow copy exactly like '
    'it - a dark violet-black smoky Qiuqiu with a shadow headband and glowing violet eyes. It is the only other '
    'figure; Qiuqiu himself keeps his normal colours from reference image 1.\n')


def prompt_for(name: str) -> str:
    if name in ICON_JOBS:
        return ICON_PROMPT.format(what=ICON_JOBS[name][0])
    hero, what, _, shadow = EVENT_JOBS[name]
    # 她臉上那片深棕只能叫 markings，`mask` 在她身上只指脖子那塊布（art_rules 2026-09-13 稽核 中-11）
    look = LOOK[LOOK_KEY[hero]].replace('dark-brown face mask', 'dark-brown face markings')
    head = EVENT_HEAD.format(name=HERO_NAME[hero], look=look)
    return head + (SHADOW_NOTE if shadow else '') + f'SCENE: {what}\n' + EVENT_TAIL + hero_rules(hero)


def refs_for(name: str) -> list[Path]:
    if name in ICON_JOBS:
        return [REF / f'style_{name}.png']
    hero, _, scene, shadow = EVENT_JOBS[name]
    out = [REF / f'idle_{hero}.png', REF / f'scene_{Path(scene).stem}.png']
    if shadow:
        out.append(REF / 'shadow_cat_idle.png')
    return out


def white(im: Image.Image, box: tuple[int, int]) -> Image.Image:
    """鋪白底、等比縮到 `box` 的九成、置中。"""
    im = im.convert('RGBA')
    k = min(box[0] * .9 / im.width, box[1] * .9 / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    bg = Image.new('RGBA', box, (255, 255, 255, 255))
    bg.alpha_composite(im, ((box[0] - im.width) // 2, (box[1] - im.height) // 2))
    return bg.convert('RGB')


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        on_white(idle_frame(LOOK_KEY[hero]), .8).save(REF / f'idle_{hero}.png')
    for _, _, scene, _ in EVENT_JOBS.values():
        white(Image.open(ROOT / 'public/assets' / scene), (1024, 768)).save(REF / f'scene_{Path(scene).stem}.png')
    white(Image.open(ROOT / 'public/assets' / SHADOW_REF), (1024, 1024)).save(REF / 'shadow_cat_idle.png')
    # 圖示：三張同類既有圖示拼一張（上兩張、下一張），同 rest 批次銅護臂那張的做法
    for name, (_, style) in ICON_JOBS.items():
        sheet = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
        for i, stem in enumerate(style):
            icon = Image.open(ICONS / f'{stem}.webp').convert('RGBA').resize((420, 420), Image.LANCZOS)
            pos = [(46, 46), (558, 46), (302, 558)][i]
            sheet.alpha_composite(icon, pos)
        sheet.convert('RGB').save(REF / f'style_{name}.png')
    print(f'參考圖已輸出到 {REF}')


# ---------------------------------------------------------------- 生

_LOCK = threading.Lock()


def record(path: Path, key: str, entry: dict) -> None:
    with _LOCK:
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        data.setdefault(key, []).append(entry)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def generate(name: str, note: str = '') -> tuple[str, int, str]:
    with _LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f'\n{note}' if note else '')
    size = '1024x1024' if name in ICON_JOBS else '1536x1024'
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', size, '--quality', 'high', '--prompt', text]
    for ref in refs_for(name):
        command += ['--image', str(ref)]
    command += ['--out', str(target), '--force']
    started = time.time()
    status = 'failed'
    for _ in range(5):
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-300:]}'
        if 'capacity' not in result.stderr:   # 伺服器滿載才等一下重試（codex_gen.py 坑 9）
            break
        time.sleep(30)
    (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
    record(PROMPTS, name, {'attempt': attempt, 'status': status, 'prompt': text,
                           'refs': [p.name for p in refs_for(name)], 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


# ---------------------------------------------------------------- 挑

def clean(im: Image.Image, min_frac: float) -> tuple[Image.Image, int]:
    """清掉離主體很遠的小碎點：面積小於最大那塊 `min_frac` 的分離區塊整塊挖掉（連同淡淡的外圍）。"""
    arr = np.array(im.convert('RGBA'))
    a = arr[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8), connectivity=8)
    if n <= 1:
        raise SystemExit('整張是空的')
    main = st[1:, 4].max()
    dropped = 0
    for i in range(1, n):
        if st[i, 4] < main * min_frac:
            arr[lab == i, 3] = 0
            dropped += 1
    return Image.fromarray(arr), dropped


def gate(name: str, raw: Image.Image) -> list[str]:
    """真透明、四角全透明、主體沒碰到邊（碰到邊＝可能被切掉）。"""
    errs = []
    a = np.array(raw)[..., 3]
    if (a == 0).mean() < .3:
        errs.append(f'透明的地方只有 {(a == 0).mean():.0%}，背景可能被畫進去了')
    # 門檻 8：生圖端回來的圖常有 alpha 1～2 的零星雜點（看不見，`clean` 會清掉），不算背景沒去乾淨
    if any(c.max() > 8 for c in (a[:12, :12], a[:12, -12:], a[-12:, :12], a[-12:, -12:])):
        errs.append('四個角不是全透明')
    ys, xs = np.where(a > 16)
    if xs.min() < 2 or ys.min() < 2 or xs.max() > raw.width - 3 or ys.max() > raw.height - 3:
        errs.append(f'主體碰到圖的邊（{xs.min()},{ys.min()},{xs.max()},{ys.max()}），可能被切到')
    return errs


def fit_event(im: Image.Image) -> Image.Image:
    """照主體外框補成 4:3（外框置中、四周留 4%），縮成 560×420（同 gen_feifei_mirror_hall.py 的 fit）。"""
    box = im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    x0, y0, x1, y1 = box
    w, h = (x1 - x0) * 1.04, (y1 - y0) * 1.04
    if w / h > EVENT_SIZE[0] / EVENT_SIZE[1]:
        h = w * EVENT_SIZE[1] / EVENT_SIZE[0]
    else:
        w = h * EVENT_SIZE[0] / EVENT_SIZE[1]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    canvas = Image.new('RGBA', (round(w), round(h)), (0, 0, 0, 0))
    canvas.alpha_composite(im.crop(box), (round(w / 2 - (cx - x0)), round(h / 2 - (cy - y0))))
    return canvas.resize(EVENT_SIZE, Image.LANCZOS)


def fit_icon(im: Image.Image) -> Image.Image:
    """裁掉透明邊、長邊貼滿 128、置中（同 add_icons.py 與 build_rest_art.py 的銅護臂）。"""
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    im.thumbnail((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    canvas = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((ICON_SIZE - im.width) // 2, (ICON_SIZE - im.height) // 2))
    return canvas


def register(entries: dict[str, dict[str, str]]) -> None:
    """把 `{分類: {鍵: 路徑}}` 併進清單。

    寫法照清單現在進版控的格式：兩格縮排＋結尾換行（`make_dialogue_portraits.py` 同一種）。
    `manifest_io.merge` 寫的是一格縮排，會把整份三千行全部改掉、差異看不出加了什麼，所以這裡不用它。
    """
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for section, items in entries.items():
        data.setdefault(section, {}).update(items)
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def register_picked(names: list[str]) -> None:
    """照 `picks.json` 把挑定的圖登記進清單（接線時登記 `HOLD` 那 5 張用）。"""
    picks = json.loads(PICKS.read_text(encoding='utf-8'))
    missing = [n for n in names if n not in picks]
    if missing:
        raise SystemExit(f'這幾張還沒挑定：{missing}')
    entries: dict[str, dict[str, str]] = {}
    for n in names:
        section = 'icons' if n in ICON_JOBS else 'bg'
        entries.setdefault(section, {})[picks[n]['key']] = picks[n]['file'].removeprefix('public/')
    register(entries)
    print(f'清單已登記 {len(names)} 筆：{"、".join(picks[n]["key"] for n in names)}')


def pick(name: str, attempt: int, force: bool = False) -> None:
    src = SOURCE / f'{name}.try{attempt}.png'
    if not src.exists():
        raise SystemExit(f'找不到 {src.name}')
    raw = Image.open(src).convert('RGBA')
    errs = gate(name, raw)
    if errs and not force:
        raise SystemExit(f'{name} 第 {attempt} 次沒過閘門：' + '；'.join(errs))
    icon = name in ICON_JOBS
    cleaned, dropped = clean(raw, .004 if icon else .0015)
    out_img = fit_icon(cleaned) if icon else fit_event(cleaned)
    target = (ICONS if icon else BG) / f'{name}.webp'
    out_img.save(target, 'WEBP', quality=80, method=6)
    data = target.read_bytes()
    a = np.array(out_img)[..., 3]
    semi = float(((a > 0) & (a < 248)).sum() / max(1, (a > 0).sum()))
    key = f'codex/{name}' if icon else f'bg/{name}'
    if name not in HOLD:
        register({'icons' if icon else 'bg': {key: target.relative_to(ROOT / 'public').as_posix()}})
    with _LOCK:
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        picks[name] = {'attempt': attempt, 'key': key, 'file': target.relative_to(ROOT).as_posix(),
                       'sourceSize': list(raw.size), 'size': list(out_img.size), 'bytes': len(data),
                       'droppedSpecks': dropped, 'semiTransparentShare': round(semi, 4),
                       'gate': errs, 'sha256': hashlib.sha256(data).hexdigest(),
                       'at': time.strftime('%Y-%m-%d %H:%M:%S')}
        PICKS.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{name} 採用第 {attempt} 次 → {target.relative_to(ROOT).as_posix()}（{len(data)} 位元組，'
          f'清掉碎點 {dropped} 塊，半透明 {semi:.1%}）→ 清單鍵 {key}'
          + ('（先不登記，接線時跑 register）' if name in HOLD else ''))


# ---------------------------------------------------------------- 聯絡表

def _font(n: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', n)


def contact(files: list[Path], out: Path, cell: int, cols: int) -> None:
    """每格 `cell` 像素寬、底下標檔名；透明處鋪淺灰格紋，看得出透明邊。"""
    rows = (len(files) + cols - 1) // cols
    ims = []
    for f in files:
        im = Image.open(f).convert('RGBA')
        k = cell / max(im.size)
        ims.append((f.stem, im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)))
    rowh = max(im.height for _, im in ims) + 30
    sheet = Image.new('RGB', (cols * (cell + 10) + 10, rows * rowh + 10), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, (stem, im) in enumerate(ims):
        x, y = 10 + (i % cols) * (cell + 10), 10 + (i // cols) * rowh
        bg = Image.new('RGBA', im.size, (226, 226, 226, 255))
        cd = ImageDraw.Draw(bg)
        for yy in range(0, im.height, 16):
            for xx in range(0, im.width, 16):
                if (xx // 16 + yy // 16) % 2:
                    cd.rectangle([xx, yy, xx + 15, yy + 15], fill=(246, 246, 246, 255))
        bg.alpha_composite(im)
        sheet.paste(bg.convert('RGB'), (x, y))
        d.text((x, y + im.height + 4), stem, fill=(0, 0, 0), font=_font(18))
    sheet.save(out)
    print(f'聯絡表 {out}（{sheet.size[0]}×{sheet.size[1]}）')


def mix_sheet(out: Path, new: list[str], old: list[str], scale: int) -> None:
    """新舊混排、實際遊戲大小（`scale`＝1 是原大，3 是放大三倍給人看細節）。

    上半＝狀態列那一格：32 像素圖示放在淺色嵌板上（`components.css` 的 `.hud-relic img`，嵌板
    `#fbf6ec→#e6d9c0`、深棕 1.5 像素框）；下半＝戰鬥畫面的忍具欄：42 像素（`combat.css` 的 `.combat .potion img`）。
    新舊一張隔一張排，新圖底下畫黃條。
    """
    order: list[tuple[str, bool]] = []
    for i in range(max(len(new), len(old))):
        if i < len(old):
            order.append((old[i], False))
        if i < len(new):
            order.append((new[i], True))
    cols = 12
    rows = (len(order) + cols - 1) // cols
    parts = [(32, 36), (42, 46)]   # (圖示大小, 嵌板大小)
    gap = 6 * scale
    height = gap + sum(rows * (panel * scale + 6 * scale + gap) + gap * 2 for _, panel in parts)
    width = gap + cols * (46 * scale + gap)
    sheet = Image.new('RGB', (width, height), (58, 42, 28))
    d = ImageDraw.Draw(sheet)
    y0 = gap
    for icon_px, panel_px in parts:
        p, s = panel_px * scale, icon_px * scale
        for i, (stem, is_new) in enumerate(order):
            x = gap + (i % cols) * (46 * scale + gap)
            y = y0 + (i // cols) * (p + 6 * scale + gap)
            panel = Image.new('RGBA', (p, p))
            for yy in range(p):   # 由上往下的淡米色漸層，同嵌板
                t = yy / max(1, p - 1)
                ImageDraw.Draw(panel).line([(0, yy), (p, yy)], fill=(round(251 - 21 * t), round(246 - 29 * t), round(236 - 44 * t), 255))
            ImageDraw.Draw(panel).rectangle([0, 0, p - 1, p - 1], outline=(58, 42, 28), width=max(1, round(1.5 * scale)))
            icon = Image.open(ICONS / f'{stem}.webp').convert('RGBA').resize((s, s), Image.LANCZOS)
            panel.alpha_composite(icon, ((p - s) // 2, (p - s) // 2))
            sheet.paste(panel.convert('RGB'), (x, y))
            d.rectangle([x, y + p + scale, x + p - 1, y + p + 4 * scale], fill=(255, 210, 90) if is_new else (120, 100, 80))
        y0 += rows * (p + 6 * scale + gap) + gap * 2
    sheet.save(out)
    print(f'新舊混排 {out}（{sheet.size[0]}×{sheet.size[1]}，黃條＝新圖）')


def sheet(kind: str, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    if kind in ('relic', 'potion'):
        names = [n for n in ICON_JOBS if n.startswith(kind)]
        contact([ICONS / f'{n}.webp' for n in names], out_dir / f'c1_{kind}_500.png', 500, 4)
    elif kind == 'event':
        names = list(EVENT_JOBS)
        for i in range(0, len(names), 8):
            contact([BG / f'{n}.webp' for n in names[i:i + 8]], out_dir / f'c1_event_500_{i // 8 + 1}.png', 500, 4)
    elif kind == 'mix':
        for pool in ('relic', 'potion'):
            new = [n for n in ICON_JOBS if n.startswith(pool)]
            old = sorted(p.stem for p in ICONS.glob(f'{pool}_*.webp') if p.stem not in ICON_JOBS)
            old = old[:len(new)] if len(old) >= len(new) else old
            mix_sheet(out_dir / f'c1_{pool}_mix_1x.png', new, old, 1)
            mix_sheet(out_dir / f'c1_{pool}_mix_3x.png', new, old, 3)
    else:
        raise SystemExit(f'不認得 {kind}')


def keys() -> None:
    for name in ICON_JOBS:
        print(f'codex/{name}\tpublic/assets/icons/{name}.webp')
    for name in EVENT_JOBS:
        print(f'bg/{name}\tpublic/assets/bg/{name}.webp')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    sub.add_parser('keys')
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
    s = sub.add_parser('sheet')
    s.add_argument('kind')
    s.add_argument('out_dir')
    r = sub.add_parser('register', help='把挑定的圖登記進清單（不給名字＝HOLD 那 5 張）')
    r.add_argument('names', nargs='*')
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'register':
        register_picked(args.names or list(HOLD))
    elif args.command == 'keys':
        keys()
    elif args.command == 'prompt':
        print(prompt_for(args.name))
    elif args.command == 'pick':
        pick(args.name, args.attempt, args.force)
    elif args.command == 'sheet':
        sheet(args.kind, Path(args.out_dir))
    else:
        unknown = [n for n in args.names if n not in ICON_JOBS and n not in EVENT_JOBS]
        if unknown:
            raise SystemExit(f'沒有這幾張：{unknown}')
        SOURCE.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, attempt, status in pool.map(lambda n: generate(n, args.note), args.names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
