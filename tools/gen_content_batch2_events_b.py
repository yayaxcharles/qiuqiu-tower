"""內容擴充第二批的事件圖 B 組（2026-09-23，批次 c2eb，美術代理 art4）：關卡限定 9 篇＋條件選項 8 條。

規格來源（圖面描述的唯一來源）：派工暫存區 `design2_事件劇本.md` 第五節（關卡限定 9 篇：塔下石牢、塔中木造、
塔頂夜空各 3 篇）與第七節（條件選項 8 條，只生**新選項的結果圖**，既有事件的圖一張都不動）；
主控裁決 `design2_主控裁決.md`（圖全做不砍）。第三、四、六節（兩條事件鏈、連線限定）是 art3 的，不在這支。
每一張的最終鍵名、檔名、對應劇本哪一段另寫在 `batch2_event_art_keys_B.md`（也印得出來：`keys`）。

做法照第一批事件圖（`gen_content_batch1_art.py`，閘門、清碎點、補 4:3、清單寫法、聯絡表都直接借它的）：
  gpt-image-1.5 真透明（codex-oauth），挑定後照主體外框補成 4:3、縮成 560×420、WebP quality 80，
  存 `public/assets/bg/<名>.webp`，清單鍵 `bg/<名>`。
  - 參考圖① 這隻貓的新版待機第 1 格（長相一律照它）。
  - 參考圖② 關卡限定：**同一關**、同一隻的既有事件圖，只取畫風與那一關的材質光線——
    塔下石牢＝`seclusion`（石牆、火把）、塔中木造＝`daxia_chest`（木造，第一批新畫風）、
    塔頂夜空＝`daxia_lastpage`（夜裡的石台，第一批新畫風）。
    條件選項：**那篇既有事件、同一隻的主圖**（同一個場景、同一批配角，讓結果圖跟主圖是同一篇）。
  - 參考圖③④ 視需要：魔物待機（熊、飯糰怪、木人、老鼠）、秘寶圖示（風鈴、魔氣殘片、師父的斗笠、鈴鐺）、
    師父的長相（`still_teach` 右半裁下來）。
  結果圖一律 `<事件代號>_r<選項序號>`；進戰鬥與無效果的選項不畫（`tools/event_result_art.test.ts` 的規則）。

**只放檔、不登記素材清單**（派工單：程式接線時一次登記）。`pick` 不碰清單；接線時跑 `register`
（照 `picks.json` 併進清單，兩格縮排、只加新行，同第一批的 `register`）。

用法：
    python tools/gen_content_batch2_events_b.py refs
    python tools/gen_content_batch2_events_b.py prompt event_cell_bandit
    python tools/gen_content_batch2_events_b.py gen event_cell_bandit event_feifei_cell_bandit --jobs 4
    python tools/gen_content_batch2_events_b.py gen --event cell_bandit --jobs 4    # 那一篇四隻全部
    python tools/gen_content_batch2_events_b.py gen event_cell_bandit --note "修正說明"
    python tools/gen_content_batch2_events_b.py pick event_cell_bandit 2            # 裁、縮、存 webp（不登記）
    python tools/gen_content_batch2_events_b.py sheet cell_bandit <輸出資料夾>        # 那一篇四份並排、每格 500 像素
    python tools/gen_content_batch2_events_b.py register [--dry-run] [名字…]         # 接線時：登記進清單
    python tools/gen_content_batch2_events_b.py keys
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
from art_rules import FEIFEI_NOT_FAT, FEIFEI_NOT_HUMAN, gear_rule  # noqa: E402
from gen_rest_art import LOOK, idle_frame, on_white  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/c2eb'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
BG = ROOT / 'public/assets/bg'
ASSETS = ROOT / 'public/assets'

HEROES = ['ninja', 'feifei', 'dangdang', 'fengfeng']
NAME = c1.HERO_NAME
EYES = {'ninja': 'black', 'feifei': 'bright BLUE', 'dangdang': 'amber', 'fengfeng': 'amber'}


def event_name(hero: str, stem: str) -> str:
    """檔名＝清單鍵去掉 `bg/`：球球版沒有前綴，其他三隻 `event_<角色>_<代號>`（`eventArtKey` 的規矩）。"""
    return c1.event_name(hero, stem)


class P:
    """這一隻在英文提示詞裡的名字與代名詞。"""

    def __init__(self, hero: str):
        self.hero = hero
        self.n = NAME[hero]
        self.he, self.his, self.him = c1.PRONOUN[hero]
        self.He, self.His = self.he.capitalize(), self.his.capitalize()


# ---------------------------------------------------------------- 三關的材質與光線

ACT = {
    1: ('FLOOR: the LOWEST level of the tower, a stone DUNGEON. Materials: rough grey stone blocks, cracked '
        'flagstones and dark iron, lit by warm orange flickering torches in iron wall brackets - cold grey stone '
        'with warm torchlight. No wooden interiors, no night sky.'),
    2: ('FLOOR: the MIDDLE level of the tower, where everything is WOODEN: warm brown wooden floorboards, posts '
        'and beams, cream paper sliding doors with dark wooden lattice, and round cream PAPER LANTERNS giving a '
        'soft warm glow. No grey stone dungeon walls, no torches, no night sky.'),
    3: ('FLOOR: the TOP of the tower, open-air at NIGHT: dark blue-grey stone slabs and low wooden railings, '
        'everything shaded in cool moonlit blues. No indoor walls, no torches.'),
}
# 參考圖②：同一關、同一隻的既有事件圖（只取畫風與材質光線）
ACT_REF = {1: 'seclusion', 2: 'daxia_chest', 3: 'daxia_lastpage'}
ACT_REF_NOTE = {
    1: 'its stone walls and warm torchlight',
    2: 'its warm brown wood',
    3: 'its cool night-time stone',
}

# 參考圖③④：魔物、秘寶、師父（public/assets 底下的路徑, 說明）
EXTRA = {
    'rat': ('monsters/rat_idle.webp',
            'Reference image {n} shows the kind of MOUSE the rats of this game are: use it ONLY for the species look '
            '(grey fur, big round pink ears, long pink tail); do NOT copy its paper hat or its spear.'),
    'bear': ('monsters/hibernating_bear_idle.webp',
             'Reference image {n} is THE BEAR of this scene (an existing enemy of this game): copy its look exactly - '
             'big round brown bear with a red-and-yellow striped nightcap and a matching striped scarf.'),
    'onigiri': ('monsters/onigiri_idle.webp',
                'Reference image {n} is the ONIGIRI MONSTER of this game (a rice ball with a seaweed band, big eyes, '
                'little arms and feet): the little rice-ball monsters in this scene look exactly like it, only smaller.'),
    'dummy': ('monsters/wood_dummy_idle.webp',
              'Reference image {n} is the WOODEN TRAINING DUMMY of this game: the dummies in this scene look exactly '
              'like it (a log body with peg arms and a peg leg).'),
    'chime': ('icons/relic_wind_chime.webp',
              'Reference image {n} is the item icon of the WIND CHIME in this game: a small blue bell with a white '
              'paper strip hanging below it. Every wind chime in this scene is that kind of chime.'),
    'shard': ('icons/relic_demon_shard.webp',
              'Reference image {n} is the item icon of the MIASMA SHARD in this game: the crystal in this scene is '
              'that same jagged violet-magenta crystal (but without the smoke around it).'),
    'hat': ('icons/relic_master_hat.webp',
            'Reference image {n} is the item icon of THE MASTER\'S STRAW HAT: a woven tan conical straw hat with a '
            'dark chin cord.'),
    'master': ('bg/still_teach.webp',
               'Reference image {n} shows THE MASTER (the old martial-arts master cat of this story) when he was well: '
               'a big grey tabby cat with dark grey stripes, a white muzzle, a calm kind smile, a cream robe with a '
               'black sash and the tan straw hat. Use it ONLY for his face and look, not for the setting.'),
    'bell': ('icons/relic_bell.webp',
             'Reference image {n} is the item icon of THE BELL in this game: a round shiny gold bell with a red '
             'ribbon bow on top.'),
}
MASTER_CROP = (520, 40, 1140, 720)   # still_teach 右半：大俠貓（連斗笠）

# ---------------------------------------------------------------- 身上拿不下來的東西（art_rules.gear_rule）

GEAR_FENGFENG_HELD = 'the red scarf; his jian stays inside its dark-brown scabbard'


def rules(hero: str, gear: str | None = None, feifei_note: str = '') -> str:
    """同第一批 `hero_rules`；`gear` 給了就換掉那一隻的裝備句（姿勢要把劍鞘拿到身前、泡澡這類）。"""
    if hero == 'feifei':
        return c1.FEIFEI_GEAR + (feifei_note + '\n' if feifei_note else '') + FEIFEI_NOT_HUMAN + FEIFEI_NOT_FAT
    return gear_rule(gear or c1.GEAR[hero])


# ---------------------------------------------------------------- 第五節：關卡限定 9 篇


def cell_bandit(p: P) -> dict[str, str]:
    cell = ('SETTING: a prison cell in the dungeon: a wall of thick dark IRON BARS with a barred cell door and a heavy '
            'iron padlock, and one burning wall torch. On the stone wall beside the cell, a simple MAP scratched by '
            'claws: a few scratched lines and one X mark (no letters).')
    bandit = ('THE BANDIT: a scruffy tabby bandit cat with GREY-AND-BLACK striped fur (NOT orange), a white '
              'sticking-plaster patch on one cheek, a torn brown vest, and a short length of BROKEN IRON CHAIN '
              'dangling from an iron collar around his neck.')
    stance = {'ninja': 'one paw on his hip, eyebrows raised',
              'feifei': 'paws clasped nervously in front of her',
              'dangdang': 'peering closely at the rusty padlock',
              'fengfeng': 'one paw resting on his sword hilt, calm'}[p.hero]
    return {
        'cell_bandit': (
            f'{cell} {bandit} The bandit is INSIDE the cell, pressed against the bars, eagerly pushing a crumpled '
            f'sheet of paper out through the bars toward {p.n} (the paper shows nothing readable). {p.n} stands '
            f'OUTSIDE the cell, {stance}.'),
        'cell_bandit_r0': (
            f'{cell} {bandit} The cell door now stands wide OPEN and the padlock hangs broken. The bandit has stepped '
            f'out, grinning broadly and patting {p.n} on the shoulder. {p.n} looks down at the crumpled paper {p.he} '
            f'holds in both paws with a puzzled "huh?" face: the paper shows ONLY one red cat paw print stamped on it '
            f'(no writing at all).'),
        'cell_bandit_r1': (
            f'{cell} {bandit} {p.n} straightens up beside a pried-up floor tile (a dark hole in the flagstones), a fat '
            f'sack of dried fish slung over {p.his} back, the scratched map on the wall behind. In the background the '
            f'bandit, still locked INSIDE the cell, grips the bars with both paws, mouth wide open in outrage.'),
    }


def rat_bathhouse(p: P) -> dict[str, str]:
    bath = ('SETTING: a bathhouse the rats run in a dungeon cellar: stone walls, two or three round wooden bath tubs '
            'puffing thick CREAMY-WHITE steam clouds (solid opaque puffs with outlines, never see-through), a small '
            'wooden counter, and wooden shelves behind the counter piled with travellers\' bags and bundles. A little '
            'wooden sign over the doorway shows only a steam symbol (three wavy lines rising from a bowl), no writing.')
    keeper = ('THE RAT KEEPER: a grey mouse as in reference image 3, wearing a small striped apron (no hat, no spear).')
    bag = 'tool pouch' if p.hero == 'dangdang' else 'travel bag'
    soak = {
        'ninja': 'his navy headband still tied on under the towel',
        'feifei': 'her purple bow and ponytail showing above the towel; her belt and needle tubes are under the water',
        'dangdang': 'both copper-bracered forearms resting on the tub rim',
        'fengfeng': 'his red scarf still round his neck, and his jian in its dark-brown scabbard leaning against the tub',
    }[p.hero]
    r1 = (f'{p.n} stands by the bathhouse doorway, reaching up with one paw to straighten the crooked little wooden sign '
          f'over the door, {p.his} tool pouch tucked under the other arm, warm steam puffing at {p.his} arm. Behind the '
          f'counter the rat keeper glares at {p.him}.') if p.hero == 'dangdang' else (
          f'{p.n} sits on the floor just inside the bathhouse doorway hugging {p.his} {bag} tightly, squinting as a big '
          f'puff of creamy-white steam blows into {p.his} face. Behind the counter the rat keeper glares at {p.him}.')
    return {
        'rat_bathhouse': (
            f'{bath} {keeper} The rat keeper stands behind the counter, eyes narrowed in a sly smile, rubbing his paws '
            f'together. {p.n} stands in front of the counter holding {p.his} {bag}, eyeing the steaming tubs.'),
        'rat_bathhouse_r0': (
            f'{bath} {p.n} soaks happily in a wooden bath tub up to the shoulders in milky water, a small folded white '
            f'towel on top of {p.his} head, eyes closed in bliss - {soak}. In the foreground by the counter, ONE small '
            f'grey mouse (the same kind as reference image 3, no hat, no spear) sneakily rummages through {p.n}\'s open '
            f'{bag} and pinches out one small potion bottle.'),
        'rat_bathhouse_r1': f'{bath} {keeper} {r1}',
    }


def bear_cellar(p: P) -> dict[str, str]:
    cellar = ('SETTING: the back of a dungeon cellar: a bit of stone wall, a wooden shelf with a row of clay jars, and '
              'a big pile of golden straw on the floor.')
    sneak = {'ninja': 'creeping on tiptoe with one paw raised, whiskers tense',
             'feifei': 'holding her breath, stepping lightly on tiptoe',
             'dangdang': 'crouching and looking at the slipped blanket',
             'fengfeng': 'stepping silently on tiptoe, one paw holding his scabbard still'}[p.hero]
    squash = ' His copper bracer is braced against the belly.' if p.hero == 'dangdang' else ''
    asleep = ('DANGDANG is cuddled in the bear\'s arms, both eyes half-open with a resigned deadpan look'
              if p.hero == 'dangdang' else
              f'{p.n} has fallen asleep in the hug too (both eyes closed as happy curved lines, a peaceful smile)')
    return {
        'bear_cellar': (
            f'{cellar} The bear lies curled up asleep on the straw, snoring, hugging a cloth bundle to its chest; a '
            f'little gold light glows from the bundle\'s opening. A patchwork blanket has slipped half off the bear, '
            f'and a few honey pots sit by its feet. {p.n} is beside the bear, {sneak}.'),
        'bear_cellar_r0': (
            f'{cellar} The bear has rolled over in its sleep and squashed {p.n} under its big round belly: only '
            f'{p.n}\'s head and one paw clutching the cloth bundle stick out from under the bear, {p.his} face squished '
            f'in a funny way.{squash} The bear sleeps on peacefully.'),
        'bear_cellar_r1': (
            f'{cellar} The bear sleeps sitting in the straw with the blanket now tucked neatly over its shoulders, '
            f'cuddling {p.n} in its arms like a teddy; {asleep}. With its other paw the bear pushes a small clay jar '
            f'toward {p.n}.'),
    }


def library_ladder(p: P) -> dict[str, str]:
    lib = ('SETTING: a tall wooden LIBRARY: very tall dark wooden bookshelves crammed with old books, a wooden rolling '
           'LADDER hooked onto a brass rail along the top of the shelves, and a paper lantern glowing warm.')
    keeper = 'THE LIBRARIAN: an old grey-and-white cat with round wire spectacles and a brown robe.'
    blanket = ' A cup of warm water sits on the floor beside her.' if p.hero == 'feifei' else ''
    return {
        'library_ladder': (
            f'{lib} {keeper} The librarian dozes behind a small wooden counter with a little wooden money box on it. '
            f'On the TOP shelf a few old book spines carry one big cat PAW PRINT - the master\'s mark, the same paw '
            f'print as the one carved on the chest lid in reference image 2 (but do NOT draw the chest). {p.n} stands '
            f'at the foot of the shelves, head tilted far back, staring up at the paw-marked books.'),
        'library_ladder_r0': (
            f'{lib} {p.n} clings to the rolling ladder as it whizzes along the rail past the shelves: one paw grips the '
            f'ladder, the other arm hugs THREE old books. Bold speed lines streak behind; the shelves rush past.'),
        'library_ladder_r1': (
            f'{lib} {keeper} {p.n} has fallen asleep slumped face-down on a big open book on the floor, a small wet '
            f'drool spot on the page. The librarian stands beside {p.him}, glaring down over his spectacles.'),
        'library_ladder_r2': (
            f'{lib} {p.n} sleeps curled up on the floor in the narrow aisle between two tall bookshelves, covered with '
            f'a thin patterned blanket, a peaceful face (both eyes closed).{blanket}'),
    }


def tower_kitchen(p: P) -> dict[str, str]:
    kit = ('SETTING: a busy wooden kitchen: a clay stove with a pot puffing creamy-white steam (solid, opaque), and a '
           'wooden rack holding a row of lacquered BENTO boxes; each bento lid shows only a small UP-ARROW mark (no '
           'writing).')
    oni = ('THE ONIGIRI MONSTERS: five SMALL rice-ball monsters as in reference image 3, each wearing a tiny apron.')
    look = {'ninja': 'sniffing the air hungrily, drooling a little',
            'feifei': 'frozen and startled too, both paws raised',
            'dangdang': 'glancing at the bento rack, which has one broken crossbar so the boxes lean crookedly',
            'fengfeng': 'calmly studying how the bento boxes are tied with travel knots'}[p.hero]
    work = {'ninja': 'the rice balls he shapes have little cat ears',
            'feifei': 'her rice balls are all exactly the same size, lined up neatly',
            'dangdang': 'behind him the bento rack is freshly repaired with a new pale wooden crossbar',
            'fengfeng': 'he ties each bento box with a neat travel knot'}[p.hero]
    return {
        'tower_kitchen': (
            f'{kit} {oni} The little onigiri monsters have all frozen mid-work, staring at {p.n} in alarm; one holds a '
            f'steaming rice ball. {p.n} stands in the kitchen doorway, {look}.'),
        'tower_kitchen_r0': (
            f'{kit} {oni} {p.n} sits by the stove happily eating from an open bento box in big mouthfuls, cheeks full; '
            f'the little onigiri monsters crowd around watching curiously.'),
        'tower_kitchen_r1': (
            f'{kit} {oni} A bento wrapped in a knotted cloth is tied onto {p.n}\'s back; the little onigiri monsters '
            f'stand in a neat row, all bowing politely to {p.him}.'),
        'tower_kitchen_r2': (
            f'{kit} {oni} {p.n} works side by side with the little onigiri monsters, shaping rice balls and packing '
            f'them into bento boxes - {work}.'),
    }


def wooden_men_alley(p: P) -> dict[str, str]:
    alley = ('SETTING: a long wooden training corridor with paper lanterns hanging from the ceiling beams; along both '
             'sides stand WOODEN TRAINING DUMMIES as in reference image 3, with round brass GEARS at their arm joints. '
             'A row of footprints is carved into the floorboards (no writing), and a loose wooden panel is set into '
             'one wall.')
    swing = {'ninja': 'the nearest dummy has just swung its wooden arm, stopping a hair in front of his nose - he '
                      'flinches with wide eyes',
             'feifei': 'the nearest dummy\'s wooden arm has just swished past her fringe - she flinches back with wide '
                       'eyes',
             'dangdang': 'the nearest dummy\'s wooden arm has just thudded against his raised copper bracer - he '
                         'stands firm, frowning',
             'fengfeng': 'the nearest dummy has just swung its wooden arm and he sidesteps it, his sword still '
                         'sheathed'}[p.hero]
    end = {'ninja': 'has a big round cartoon bump on his head and blinks in surprise',
           'feifei': 'has a couple of small purple bruise marks on one arm and blinks in disbelief',
           'dangdang': 'stands firm in a low horse stance, bracers raised, not having stepped back at all',
           'fengfeng': 'stands in a light footwork stance, his sword still sheathed at his waist, a small bump on '
                       'his head'}[p.hero]
    loot = {'ninja': 'brass gears, bolts and two or three small throwing darts',
            'feifei': 'brass gears and two or three thin needle-shaped darts',
            'dangdang': 'a bulging cloth bag of brass gears and two or three small throwing darts',
            'fengfeng': 'brass gears and two or three small throwing darts'}[p.hero]
    oil = ' and on his navy headband' if p.hero == 'ninja' else ''
    return {
        'wooden_men_alley': f'{alley} {p.n} stands at the entrance of the corridor: {swing}.',
        'wooden_men_alley_r0': (
            f'{alley} At the far END of the corridor: the last dummy\'s arm has stopped right at the tip of {p.n}\'s '
            f'nose, and a small flag has popped up out of the top of that dummy\'s head (the flag shows only a cat paw '
            f'print, no writing). {p.n} {end}.'),
        'wooden_men_alley_r1': (
            f'{alley} {p.n} crawls out from under the dummies\' gear machinery, arms full of {loot}; smudges of dark '
            f'machine oil on {p.his} face{oil}.'),
    }


def fallen_star(p: P) -> dict[str, str]:
    def place(done: bool, righted: bool) -> str:
        sky = ('Above the platform, in the empty air, a CONSTELLATION of small bright gold star shapes joined by thin '
               'gold lines floats in the night; ')
        sky += ('it is now COMPLETE - the returned star is back in place at the end of its line, shining brighter and '
                'bigger than all the others.' if done else
                'one corner of the constellation is clearly MISSING (an empty gap at the end of a line where a star '
                'should be).')
        arm = ('A small old bronze ARMILLARY sphere (a star-gazing instrument made of rings) stands upright again on '
               'its base, propped up with a nail.' if righted else
               'A small old bronze ARMILLARY sphere (a star-gazing instrument made of rings) lies toppled over on the '
               'platform' + (', one bolt of its base visibly snapped.' if p.hero == 'dangdang' else '.'))
        return f'SETTING: a stone star-gazing platform at the top of the tower. {sky} {arm}'
    star = ('THE FALLEN STAR: a glowing golden five-pointed star-shaped stone about the size of a melon, puffing '
            'creamy-white hot steam (solid, opaque), sitting in a small scorched crater in the stone.')
    hold = {'ninja': 'wrapped in a piece of cloth',
            'feifei': 'wrapped in her handkerchief',
            'dangdang': 'in his copper-bracered paws, the bracers smoking',
            'fengfeng': 'inside a leather pouch that is smoking with heat'}[p.hero]
    scrape = {'ninja': 'with the tip of one claw, and his claws now trail a streak of golden light',
              'feifei': 'with the tip of a thin gold needle, and the needle now trails a thin streak of golden light',
              'dangdang': 'with a small metal file and rubs it onto the rim of his copper bracer, which now glows with '
                          'a ring of golden light',
              'fengfeng': 'with the tip of his drawn jian, and the blade now trails a streak of golden light'}[p.hero]
    return {
        'fallen_star': f'{place(False, False)} {star} {p.n} crouches in front of it, peering at it with wide eyes.',
        'fallen_star_r0': (
            f'{place(False, False)} {p.n} clutches the fallen star (a glowing golden star-shaped stone) {hold}; it is '
            f'scorching hot - {p.his} face is scrunched up in a funny "hot hot hot!" grimace, with little puffs of '
            f'creamy steam and heat lines rising from {p.his} paws.'),
        'fallen_star_r1': (
            f'{place(False, False)} The fallen star has been doused with water: it is now a dull grey-gold '
            f'star-shaped stone giving off a big puff of white steam, covered in a thin layer of glittering gold dust. '
            f'{p.n} scrapes a little of the glittering dust off it {scrape}.'),
        'fallen_star_r2': (
            f'{place(True, p.hero == "dangdang")} {p.n} has just thrown the star back up into the sky: {p.he} stands in '
            f'a follow-through pose, looking up, and a soft warm golden light pours down on {p.him} from the '
            f'constellation. The star-shaped stone is gone from the platform (only the small scorched crater is left).'),
    }


def wind_chimes(p: P) -> dict[str, str]:
    hall = ('SETTING: a short covered wooden walkway at the top of the tower at night: wooden floorboards, a low '
            'wooden railing, and the underside of a tiled eave above, the eave hung with MANY small wind chimes as '
            'in reference image 3 (a small bell with a white paper strip hanging below it), in assorted soft colours.')
    blown = {'ninja': 'covering his ears with both paws, his headband tails whipping in the wind',
             'feifei': 'covering her ears with both paws, her ponytail and bow whipping in the wind',
             'dangdang': 'covering his ears with both paws, his waist sash flapping in the wind',
             'fengfeng': 'one paw holding down his red scarf so it does not blow away, the other paw pressed over one '
                         'ear'}[p.hero]
    calm = ' His sheathed jian (the sword inside its scabbard) lies across his knees.' if p.hero == 'fengfeng' else ''
    step = {'ninja': 'leaning forward into the wind, one foot stepping forward',
            'feifei': 'leaning forward into the wind, one paw on the railing to steady herself',
            'dangdang': 'feet planted wide, bracing against the wind head-on, bracers raised',
            'fengfeng': 'leaning forward into the wind in a light stepping stance, his red scarf flying high'}[p.hero]
    return {
        'wind_chimes': (
            f'{hall} The night wind blows hard: all the chimes swing sideways and their paper strips fly. At the far '
            f'end of the walkway ONE chime hangs dead still, its little clapper fallen on the floor beneath it. {p.n} '
            f'stands in the middle, {blown}.'),
        'wind_chimes_r0': (
            f'{hall} {p.n} sits cross-legged on the walkway with both eyes calmly closed, peaceful and relaxed, while '
            f'the chimes above flutter gently in the breeze.{calm}'),
        'wind_chimes_r1': f'{hall} {p.n} practises footwork in the strong wind: {step}. The chimes swing hard.',
        'wind_chimes_r2': (
            f'{hall} {p.n} holds up one small wind chime by its string - exactly like reference image 3 (a blue bell '
            f'with a white paper strip) - listening to it with a gentle smile. Behind {p.him} the whole row of chimes '
            f'hangs perfectly STILL, straight down, not a single one swinging.'),
    }


def miasma_crystal(p: P) -> dict[str, str]:
    top = ('SETTING: a cracked dark stone platform at the top of the tower at night, a thin coat of pale lilac frost on '
           'the stones.')
    crystal = ('THE CRYSTAL: a pointed jagged crystal like reference image 3 (deep violet-magenta, glowing from inside), '
               'solid and opaque, with a rim of pale purple frost.')
    reach = ('crouches beside it, gripping his sword hilt, NOT reaching for it'
             if p.hero == 'fengfeng' else
             f'crouches beside it with one paw reaching out - stopped in mid-air, hesitating')
    tuck = {'ninja': 'the front of his gi', 'feifei': 'the front of her jacket',
            'dangdang': 'his tool pouch', 'fengfeng': 'a leather pouch tied at his waist'}[p.hero]
    knocked = {'ninja': '', 'feifei': ' Her bamboo water tube lies beside her.',
               'dangdang': ' A crust of white frost covers his copper bracers.',
               'fengfeng': ' His jian is drawn in his paw.'}[p.hero]
    return {
        'miasma_crystal': (
            f'{top} {crystal} It is stuck in a crack of the platform, pulsing with purple light, and the stones around '
            f'it are frosted. Far away behind, a small cloud of dark purple mist hangs around a higher rooftop. {p.n} '
            f'{reach}.'),
        'miasma_crystal_r0': (
            f'{top} {p.n} stands on the platform, having just tucked the crystal into {tuck} (a faint purple glow shows '
            f'through). In the FOREGROUND, right at {p.his} feet, lies a small still puddle of rainwater, and {p.n} '
            f'looks down into it, uneasy. In the puddle we see {p.n}\'s REFLECTION (head and shoulders, upside down): '
            f'in the reflection the eyes glow PURPLE. {p.n}\'s real eyes are completely normal - {EYES[p.hero]}, the '
            f'usual colour - ONLY the eyes of the reflection in the water are purple. Make that contrast easy to see.'),
        'miasma_crystal_r1': (
            f'{top} The crystal has shattered into a scatter of glittering purple sand across the platform. A gust of '
            f'cold wind (a few bold creamy-white curved swoosh lines) has knocked {p.n} over: {p.he} sits on the '
            f'ground, dazed.{knocked}'),
    }


# 篇 → (關, 生成函式, 參考圖③④)
ACT_EVENTS: dict[str, tuple[int, object, list[str]]] = {
    'cell_bandit': (1, cell_bandit, []),
    'rat_bathhouse': (1, rat_bathhouse, ['rat']),
    'bear_cellar': (1, bear_cellar, ['bear']),
    'library_ladder': (2, library_ladder, []),
    'tower_kitchen': (2, tower_kitchen, ['onigiri']),
    'wooden_men_alley': (2, wooden_men_alley, ['dummy']),
    'fallen_star': (3, fallen_star, []),
    'wind_chimes': (3, wind_chimes, ['chime']),
    'miasma_crystal': (3, miasma_crystal, ['shard']),
}

# 換掉裝備句的幾張：姿勢會把劍鞘拿到身前、泡在澡盆裡
GEAR_OVERRIDE = {
    ('rat_bathhouse_r0', 'fengfeng'): 'the red scarf',
    ('wind_chimes_r0', 'fengfeng'): GEAR_FENGFENG_HELD,
    ('sparring_cat_r2', 'fengfeng'): GEAR_FENGFENG_HELD,
}
FEIFEI_NOTE = {
    'rat_bathhouse_r0': 'In the bath only her head, shoulders and paws show; her belt and needle tubes are simply hidden under the water.',
    'sleeping_guard_r2': 'Whatever is inside the shadow is simply hidden.',
}

# ---------------------------------------------------------------- 第七節：條件選項 8 條（只生新選項的結果圖）


def cond_scene(stem: str, p: P) -> str:
    if stem == 'sleeping_guard_r2':
        peek = {'ninja': 'his eyes, the tips of his ears and a bit of his navy headband',
                'feifei': 'her bright blue eyes and the tips of her ears',
                'dangdang': 'his amber eyes and the tips of his ears; the copper bracer on that forearm is wrapped in '
                            'a dark cloth so it cannot shine',
                'fengfeng': 'his amber eyes and the tips of his ears'}[p.hero]
        return (
            'the same spot as reference image 2, with the same big fat ORANGE tabby guard cat (copy him from reference '
            'image 2) slumped asleep against the door, eyes closed, snoring, a big round snot bubble at his nose. A '
            'money pouch hangs at his belt. Right beside him, a patch of deep dark SHADOW (a solid dark charcoal-blue '
            f'shape) fills the corner where the wall meets the floor; {p.n} hides inside that shadow - only {peek} show '
            'out of the darkness, plus ONE paw that is carefully hooking the money pouch off the guard\'s belt.')
    if stem == 'medicine_cat_r3':
        return (
            'the same medicine stall as in reference image 2, with the same CALICO medicine-seller cat (copy her from '
            f'reference image 2). {p.n} has volunteered to test her new antidote: {p.he} sits on the ground in front of '
            f'the stall holding out one paw, looking comically queasy - a pale greenish-blue tinge across the top of '
            f'{p.his} face, cold sweat drops, a wobbly mouth. The calico cat feeds {p.him} a spoonful of antidote from a '
            'small bottle with one hand and holds a little notebook and brush in the other, busily taking notes.')
    if stem == 'sparring_cat_r2':
        firm = {'ninja': 'arms crossed over his chest, a calm unbothered face',
                'feifei': 'both eyes squeezed shut and trembling, paws clenched at her chest',
                'dangdang': 'feet planted in a low horse stance, both copper bracers raised in front of his chest',
                'fengfeng': 'holding his sword - still in its scabbard - horizontally in front of his body with both '
                            'paws, calm'}[p.hero]
        return (
            'the same two cats as in reference image 2 (copy both from it): the proud WHITE cat and his little BLACK '
            f'junior. The white cat has just charged head-first into {p.n} and BOUNCED right off: he sits on his bottom '
            f'on the floor, dazed, a ring of little gold stars circling his head. {p.n} stands firm, not moved an inch: '
            f'{firm}. Beside them the little black cat doubles over laughing, holding his belly.')
    if stem == 'heavy_door_r2':
        pose = {'ninja': 'one paw thrust forward in a claw strike, a short gold slash streak trailing from his claws',
                'feifei': 'one arm extended forward, having just thrown a single thin gold needle',
                'dangdang': 'one open palm pushed straight forward in a low stance',
                'fengfeng': 'sliding his jian back into the scabbard at his waist after the cut'}[p.hero]
        return (
            'the same heavy stone door as in reference image 2, now swung HALF OPEN. A thick wooden door BAR lies on '
            f'the floor, snapped cleanly into two pieces. {p.n} holds the finishing pose of {p.his} strike: {pose}. '
            'Through the gap in the door, deeper inside, an open treasure chest glows gold.')
    if stem == 'greedy_merchant_r3':
        return (
            'the same greedy GREY merchant cat as in reference image 2 (copy his look and clothes from it). He clutches '
            'a huge armful of dried fish (a heap of small orange-brown dried fish) with a stunned, can\'t-believe-it '
            'face - mouth open, eyes wide - and his round spectacles are no longer on his face. '
            f'{p.n} hugs a big bulging cloth bundle tied at the top, with two or three treasures and two small potion '
            'bottles peeking out of it - and the merchant\'s round spectacles are caught in one corner of the bundle.')
    if stem == 'old_master_ghost_r2':
        touch = {'ninja': 'The ghost leans down and rests one big paw gently on top of QIUQIU\'s head; Qiuqiu looks up '
                          'at him with shining eyes.',
                 'feifei': 'The ghost holds FEIFEI\'s paw in his, gently arranging her fingers around one thin gold '
                           'needle; she looks up at him with happy, teary eyes.',
                 'dangdang': 'The ghost taps the back of DANGDANG\'s heel with the tip of one foot, and Dangdang sets '
                             'his feet wider apart into a steady stance, looking up with a moved, determined face.',
                 'fengfeng': 'The ghost holds up two fingers together like a sword blade, demonstrating a sword move; '
                             'FENGFENG, his jian drawn, copies the move, watching intently.'}[p.hero]
        return (
            'the same stone stairs as in reference image 2, with the same pale misty GHOST of the old master (copy him '
            'from reference image 2: a pale ice-blue ghost cat in a robe - drawn with SOLID flat pale-blue colours, not '
            'see-through). Now the ghost wears a real STRAW HAT exactly like reference image 3 - solid warm tan, the '
            'only non-blue thing on him. Under the hat his face has become clearer and unmistakably looks like the '
            f'master in reference image 4 (a big grey tabby with a calm, kind face), though still pale blue. {touch}')
    if stem == 'lost_kitten_r2':
        return (
            'the same little lost BLACK kitten as in reference image 2 (copy it: a tiny black kitten wearing a far '
            'too big dark headband) - now its oversized headband is folded up neatly and a gold BELL exactly like '
            'reference image 3 is tied onto it. The kitten grins happily, shaking its head so the bell jingles (small '
            f'motion marks). Three other tiny BLACK kittens tumble in and hug {p.n} from all sides. {p.n} holds one '
            'small potion bottle in one paw, smiling warmly.')
    if stem == 'noisy_kitchen_r3':
        return (
            f'the same kitchen as in reference image 2 (the same stove and big pot). {p.n} holds a bowl of stew in both '
            f'paws, eating with a blissful, satisfied face; in the bowl is one BIG chunk of tender stewed meat. Next to '
            f'{p.him} sits a small open wooden SUPPLY BOX with one small potion bottle placed inside it, and beside the '
            'box a small slip of paper showing only one cat paw print (no writing).')
    raise KeyError(stem)


# 條件選項：新選項的結果圖 → (既有事件代號, 參考圖③④)。序號照劇本第七節表（新索引＝既有選項數）
COND = {
    'sleeping_guard_r2': ('sleeping_guard', []),
    'medicine_cat_r3': ('medicine_cat', []),
    'sparring_cat_r2': ('sparring_cat', []),
    'heavy_door_r2': ('heavy_door', []),
    'greedy_merchant_r3': ('greedy_merchant', []),
    'old_master_ghost_r2': ('old_master_ghost', ['hat', 'master']),
    'lost_kitten_r2': ('lost_kitten', ['bell']),
    'noisy_kitchen_r3': ('noisy_kitchen', []),
}

# ---------------------------------------------------------------- 提示詞

HEAD = (
    'Create one new EVENT ILLUSTRATION for a cute cat-ninja card game. It is a cut-out vignette: only the characters '
    'and the few props of the scene (with at most a small patch of floor under them), on a truly transparent '
    'background.\n'
    'Reference image 1 is the hero\'s CURRENT official look: copy {name}\'s face, fur colours and markings, the head '
    'size relative to the body, the body proportions, the outfit and its colours EXACTLY from it. The hero is {look}.\n'
)
REF2_ACT = (
    'Reference image 2 is an existing event illustration from the SAME FLOOR of the tower: copy its ART STYLE (bold '
    'dark hand-drawn outlines, flat colours with soft cel shading, chunky cute chibi proportions), {mat}, and the way '
    'the scene is cut out on a transparent background. Do NOT copy its composition or its props, and do NOT take the '
    'hero\'s look from it - the look comes ONLY from reference image 1.\n'
)
REF2_COND = (
    'Reference image 2 is the MAIN illustration of this same event - the moment just before this one: keep the SAME '
    'setting, the same props and the same other characters (copy their looks from it), the same art style (bold dark '
    'hand-drawn outlines, flat colours with soft cel shading, chunky cute chibi proportions) and the same cut-out way '
    'on a transparent background, so the two pictures read as one story. But draw the NEW moment described below, and '
    'do NOT take the hero\'s look from it - the hero in reference image 2 may be an older drawing; the hero\'s look '
    'comes ONLY from reference image 1.\n'
)
TAIL = (
    'Only the characters described in this SCENE appear - no other cats or creatures, and never a second copy of the '
    'hero{mirror}. No text, no letters, no numbers, no writing of any kind (paper, signs, flags, book spines and labels '
    'carry only simple pictures or paw prints, never words), no speech bubbles, no frame, no border. Truly transparent '
    'RGBA background: no checkerboard drawing, no white box, no wall or sky filling the frame, no cast shadow outside '
    'the small floor patch. The whole scene is centred with a clear transparent margin on every side; nothing is cut '
    'off at the edges.\n'
    'Steam, smoke, mist, wind, glow and light are drawn SOLID and OPAQUE as flat shapes with outlines, never '
    'see-through.\n'
    'Style: thick black outlines, FLAT colours with only subtle soft shading - not painterly, no heavy airbrushed '
    'shadows, cute cartoon, not photorealistic. THE FACE ESPECIALLY: flat blocks of colour with hard edges between '
    'them; no shaded blob around the muzzle, no glow on the cheeks.\n'
)


class Job:
    def __init__(self, hero: str, stem: str, event: str, what: str, refs: list[str], kind: str, act: int = 0):
        self.hero, self.stem, self.event, self.what, self.refs, self.kind, self.act = hero, stem, event, what, refs, kind, act


def _jobs() -> dict[str, Job]:
    out: dict[str, Job] = {}
    for event, (act, fn, extras) in ACT_EVENTS.items():
        for hero in HEROES:
            for stem, what in fn(P(hero)).items():  # type: ignore[operator]
                refs = [f'idle_{hero}', f'scene_{event_name(hero, ACT_REF[act])}'] + extras
                out[event_name(hero, stem)] = Job(hero, stem, event, f'{ACT[act]} {what}', refs, 'act', act)
    for stem, (event, extras) in COND.items():
        for hero in HEROES:
            refs = [f'idle_{hero}', f'scene_{event_name(hero, event)}'] + extras
            out[event_name(hero, stem)] = Job(hero, stem, event, cond_scene(stem, P(hero)), refs, 'cond')
    return out


JOBS = _jobs()
EVENTS = list(ACT_EVENTS) + [COND[s][0] for s in COND]


def prompt_for(name: str) -> str:
    j = JOBS[name]
    # 她臉上那片深棕只能叫 markings，`mask` 在她身上只指脖子那塊布（art_rules 2026-09-13 稽核 中-11）
    look = LOOK[c1.LOOK_KEY[j.hero]].replace('dark-brown face mask', 'dark-brown face markings')
    text = HEAD.format(name=NAME[j.hero], look=look)
    text += REF2_ACT.format(mat=ACT_REF_NOTE[j.act]) if j.kind == 'act' else REF2_COND
    for i, key in enumerate(j.refs[2:], start=3):
        text += EXTRA[key][1].format(n=i) + '\n'
    text += f'SCENE: {j.what}\n'
    mirror = ' (the reflection in the puddle is the only exception)' if j.stem == 'miasma_crystal_r0' else ''
    text += TAIL.format(mirror=mirror)
    gear = GEAR_OVERRIDE.get((j.stem, j.hero))
    return text + rules(j.hero, gear, FEIFEI_NOTE.get(j.stem, ''))


def ref_path(key: str) -> Path:
    return REF / f'{key}.png'


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        on_white(idle_frame(c1.LOOK_KEY[hero]), .8).save(ref_path(f'idle_{hero}'))
    scenes = {k for j in JOBS.values() for k in j.refs if k.startswith('scene_')}
    for key in sorted(scenes):
        c1.white(Image.open(BG / f'{key.removeprefix("scene_")}.webp'), (1024, 768)).save(ref_path(key))
    for key, (src, _) in EXTRA.items():
        im = Image.open(ASSETS / src).convert('RGBA')
        if key == 'master':
            im = im.crop(MASTER_CROP)
        c1.white(im, (1024, 1024)).save(ref_path(key))
    print(f'參考圖已輸出到 {REF}（{len(list(REF.glob("*.png")))} 張）')


# ---------------------------------------------------------------- 生

def generate(name: str, note: str = '') -> tuple[str, int, str]:
    with c1._LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f'\n{note}' if note else '')
    refs_ = [ref_path(k) for k in JOBS[name].refs]
    command = [sys.executable, str(IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1536x1024', '--quality', 'high', '--prompt', text]
    for ref in refs_:
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
    c1.record(PROMPTS, name, {'attempt': attempt, 'status': status, 'prompt': text,
                              'refs': [r.name for r in refs_], 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


# ---------------------------------------------------------------- 挑（只放檔、不登記）

def pick(name: str, attempt: int, force: bool = False) -> None:
    src = SOURCE / f'{name}.try{attempt}.png'
    if not src.exists():
        raise SystemExit(f'找不到 {src.name}')
    raw = Image.open(src).convert('RGBA')
    errs = c1.gate(name, raw)
    if errs and not force:
        raise SystemExit(f'{name} 第 {attempt} 次沒過閘門：' + '；'.join(errs))
    # `--force` 只放行「透明比例 20～30%」這一種：這一批的場景（牢房、澡堂、書庫）本來就比第一批大，
    # 既有事件圖也有 20% 的（`event_dangdang_seclusion`）。四角不透明、主體碰邊一律不收，那兩種是真的壞。
    transparent = float((np.array(raw)[..., 3] == 0).mean())
    if errs and (len(errs) > 1 or not errs[0].startswith('透明的地方只有') or transparent < .2):
        raise SystemExit(f'{name} 第 {attempt} 次的閘門問題不能硬收：' + '；'.join(errs))
    cleaned, dropped = c1.clean(raw, .0015)
    out_img = c1.fit_event(cleaned)
    target = BG / f'{name}.webp'
    out_img.save(target, 'WEBP', quality=80, method=6)
    data = target.read_bytes()
    a = np.array(out_img)[..., 3]
    semi = float(((a > 0) & (a < 248)).sum() / max(1, (a > 0).sum()))
    j = JOBS[name]
    with c1._LOCK:
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        picks[name] = {'attempt': attempt, 'key': f'bg/{name}', 'file': target.relative_to(ROOT).as_posix(),
                       'event': j.event, 'stem': j.stem, 'hero': j.hero,
                       'sourceSize': list(raw.size), 'size': list(out_img.size), 'bytes': len(data),
                       'droppedSpecks': dropped, 'semiTransparentShare': round(semi, 4),
                       'gate': errs, 'sha256': hashlib.sha256(data).hexdigest(),
                       'at': time.strftime('%Y-%m-%d %H:%M:%S')}
        PICKS.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{name} 採用第 {attempt} 次 → {target.relative_to(ROOT).as_posix()}（{len(data)} 位元組，'
          f'清掉碎點 {dropped} 塊，半透明 {semi:.1%}）；清單先不登記（接線時跑 register）')


def register_picked(names: list[str], dry_run: bool) -> None:
    """照 `picks.json` 把挑定的圖登記進清單（程式接線時跑；寫法同第一批 `register`：兩格縮排、只加新行）。"""
    picks = json.loads(PICKS.read_text(encoding='utf-8'))
    names = names or sorted(picks)
    missing = [n for n in names if n not in picks]
    if missing:
        raise SystemExit(f'這幾張還沒挑定：{missing}')
    gone = [n for n in names if not (ROOT / picks[n]['file']).exists()]
    if gone:
        raise SystemExit(f'這幾張的檔案不在 public/：{gone}')
    entries = {'bg': {picks[n]['key']: picks[n]['file'].removeprefix('public/') for n in names}}
    if dry_run:
        print(f'（試跑，沒有寫檔）會登記 {len(names)} 筆 bg 鍵')
        return
    c1.register(entries)
    print(f'清單已登記 {len(names)} 筆')


# ---------------------------------------------------------------- 聯絡表與鍵名

def stems_of(event: str) -> list[str]:
    """這一篇要生的圖（照選項序號排），關卡限定＝主圖＋結果圖，條件選項＝那一張新結果圖。"""
    seen: list[str] = []
    for j in JOBS.values():
        if j.event == event and j.stem not in seen:
            seen.append(j.stem)
    return seen


def sheet(event: str, out_dir: Path) -> None:
    """一篇一張：每一列一個畫面（主圖、r0、r1…），四欄＝球球、菲菲、噹噹、封封，每格 500 像素寬。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    files = [BG / f'{event_name(h, s)}.webp' for s in stems_of(event) for h in HEROES]
    missing = [f.name for f in files if not f.exists()]
    if missing:
        raise SystemExit(f'還沒挑定：{missing}')
    c1.contact(files, out_dir / f'c2eb_{event}_500.png', 500, 4)


def keys() -> None:
    for name, j in JOBS.items():
        sys.stdout.write(f'bg/{name}\tpublic/assets/bg/{name}.webp\t{j.event}\t{j.stem}\n')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('refs')
    sub.add_parser('keys')
    p = sub.add_parser('prompt')
    p.add_argument('name')
    g = sub.add_parser('gen')
    g.add_argument('names', nargs='*')
    g.add_argument('--event', help='那一篇四隻全部（關卡限定＝主圖＋結果圖；條件選項＝新結果圖）')
    g.add_argument('--jobs', dest='workers', type=int, default=4)
    g.add_argument('--note', default='')
    k = sub.add_parser('pick')
    k.add_argument('name')
    k.add_argument('attempt', type=int)
    k.add_argument('--force', action='store_true', help='透明比例 20～30% 也收（只放行這一種；要在報告寫原因）')
    s = sub.add_parser('sheet')
    s.add_argument('event')
    s.add_argument('out_dir')
    r = sub.add_parser('register', help='接線時：把挑定的圖登記進清單（不給名字＝全部）')
    r.add_argument('names', nargs='*')
    r.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.command == 'refs':
        refs()
    elif args.command == 'keys':
        keys()
    elif args.command == 'prompt':
        print(prompt_for(args.name))
    elif args.command == 'pick':
        pick(args.name, args.attempt, args.force)
    elif args.command == 'sheet':
        sheet(args.event, Path(args.out_dir))
    elif args.command == 'register':
        register_picked(args.names, args.dry_run)
    else:
        names = list(args.names)
        if args.event:
            names += [event_name(h, s) for s in stems_of(args.event) for h in HEROES]
        unknown = [n for n in names if n not in JOBS]
        if unknown or not names:
            raise SystemExit(f'沒有這幾張：{unknown}' if unknown else '沒給要生哪幾張')
        SOURCE.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, attempt, status in pool.map(lambda n: generate(n, args.note), names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
