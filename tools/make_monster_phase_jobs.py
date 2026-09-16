# -*- coding: utf-8 -*-
"""關主換階段之後那張臉（2026-09-16）。規劃在 `docs/關主分階段立繪_規劃_2026-09-16.md`。

使用者實測：「打詛咒老住持，菲菲說牠長出鱗甲，可是牠長得一模一樣。」
十隻關主裡只有師父（`art: 'daxia'`，走 `sprites` 那條路）換階段會換立繪，其餘每隻只有五張，
三個階段共用同一張。程式端已經做好了：`src/ui/assets.ts` 的 `monsterPhaseKey` 第二階段查
`<原鍵>_p2`、第三階段 `_p3`，查不到往前退一階、最後退回原鍵（所以沒生的不會變剪影）。

**第一批只生「待機、出招、倒下」三張**（玩家九成的時間在看待機與出招；倒下一定要生，
因為關主都是在最後一個階段倒的，現在畫面用的是變身前那張，等於一定錯）。
挨打與防禦先沿用第一階段那張，程式會自動退回去。

哪幾隻、第二階段長什麼樣，一律照 `src/content/enemies.ts` 每隻的 `phases[].onEnter` 與
`phases[].line` 定——**規劃書那張表有三處跟程式對不上，這裡以程式為準**：

| 對不上的地方 | 規劃書寫的 | 程式真正寫的 | 這裡採用 |
|---|---|---|---|
| 奶牛貓二當家 | 兩段變身（≤130 爪力、≤85 召喚小弟） | **只有一段** `hpBelow: 85`、爪力 2、台詞「黑白兩色的毛全豎了起來」 | 只生 `_p2`，**沒有 `_p3`** |
| 「召喚小弟」那一段 | 算在奶牛貓頭上 | 是**狸大人**（`tanuki_lord`）`hpBelow: 130`、召喚狸小子 ×2 ＋爪力 3、台詞「葫蘆見底了」 | 改生狸大人的 `_p2`（牠也是塔主、規劃書整隻漏了） |
| 橘皮大王 | 「縮進去只露眼睛」 | 台詞「整顆站了起來」、反彈 3，註解寫「站起來全身是刺」 | **站起來**、外皮硬成尖刺，不是縮起來（縮起來是第一階段的 `curlUp`） |

另外兩處補正：三花貓武僧的台詞是「（睜開眼）」，所以眼睛一定要睜開（規劃書只寫脫袈裟）；
石獅子（`stone_lion`，強池）也有階段但不是關主，這批不做。

跑法（兩條線，四條會互相餓死——`codex_gen.py` 的坑 1）：

    python tools/make_monster_phase_jobs.py
    python tools/codex_gen.py tools/codex_jobs/monster_phase_a.json     # 第一條線
    python tools/codex_gen.py tools/codex_jobs/monster_phase_b.json     # 第二條線

生完逐張 Read 驗過再進倉（`--group monsters` 那條路認得 `_p2` 的畫布，見 `add_sprite.py`）：

    python tools/add_sprite.py --group monsters monster_hex_abbot_p2_idle.png ...

參考圖是**現行待機圖**鋪白底（`tools/ref/monster_refs/<id>_idle.png`），每次跑這支都重建一次。
續集圖的長相全靠參考圖，參考圖過期就會抄到壞版本（記憶 `reference_mus_art_pipeline`）。
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from art_rules import NO_PANEL  # noqa: E402
from build_block_queue import BLOCK_POSE  # noqa: E402
from build_down_queue import DOWN_POSE, DOWN_TAIL  # noqa: E402

JOBS = ROOT / 'tools' / 'codex_jobs'
RAW = ROOT / 'tools' / 'codex_raw'
MONS = ROOT / 'public' / 'assets' / 'monsters'
REFDIR = ROOT / 'tools' / 'ref' / 'monster_refs'

# ---------------------------------------------------------------------------
# 共用段落
# ---------------------------------------------------------------------------
# ★ 這批最容易踩的雷：**整隻重描會走鐘成另一隻貓**。所以提示詞只講「多了什麼」，
#   長相完全交給參考圖，並且把「不准換成別隻」寫成硬規則。
SAME = (
    "**THE ATTACHED PICTURE IS THIS EXACT CREATURE. COPY IT.** Same species, same face, same fur or "
    "skin colours and markings, same clothing and accessories, same build, same proportions, same head "
    "size relative to the body, same art style. It is still facing LEFT. Do NOT redesign it, do NOT "
    "swap it for a different animal, do NOT restyle the clothes, do NOT change its colour scheme and do "
    "NOT draw a second creature. Only the ONE change listed below and the pose are different from the "
    "reference.\n\n")

WHATS_NEW = (
    "**THE ONE CHANGE - this is the whole point of the picture, so make it big and obvious at a "
    "glance, while the creature is still instantly recognisable as the same character:**\n")

# ★ 2026-09-16 第一張（狸大人的待機）就踩到：變身敘述裡有「暖白色的變身煙霧」，
# 模型畫成一大團填滿四個角的雲，**去背是照「不是綠色的像素」裁的**（`chroma_key.key_out`），
# 於是那團煙也算進主體邊界，整隻被縮到只剩待機圖的八成二——換階段那一刻會忽然變小一截。
# 量得出來：`python tools/add_sprite.py --group monsters --check <檔名>` 會標 ⚠高度。
# 所以特效一律貼著身體，並且明講「畫面被裁到非綠色的部分為止」讓模型知道為什麼。
# ★ 同一晚第二次（貓又婆婆的待機）：這次不是煙，是**尾巴往右邊攤開**——五條尾巴橫著鋪出去，
# 整張圖變成接近正方形，塞進遊戲的直立框（大型怪 230×280）就只能整隻縮小，一樣矮 13.8%。
# 所以規則不能只講特效，要講**整張圖的長寬比**：畫出來的所有東西加起來必須是直的。
# 判準寫成看得見的數字（寬不超過高的八成），並講清楚後果——這是這批圖最會出事的地方。
UPRIGHT = (
    "**WHAT YOU DRAW MUST BE TALLER THAN IT IS WIDE - about the same upright proportions as the "
    "reference picture.** Measure everything you have drawn together - body, tails, hair, robes, "
    "staff, weapons, spikes, flames, smoke, the lot: it all has to fit inside an upright box no wider "
    "than about four fifths of its height. Anything that would stick out sideways - extra tails, a "
    "long tongue, a cape, a staff, opened armour panels - is drawn sweeping UP behind the creature or "
    "folded back close against its body, not reaching out to the left and right edges. "
    "**A wide picture gets shrunk down to fit the game's tall frame, so the creature ends up visibly "
    "SMALLER than it was before it transformed - that is the worst thing this picture can do.**\n")

TIGHT_FX = (
    "**KEEP EVERY EFFECT TIGHT AGAINST THE BODY.** Flames, smoke, steam, aura, sparks, shock lines and "
    "flying debris stay inside the creature's own outline or hug it within a hand's width - small "
    "curls and short bursts, not big billowing clouds. Do NOT fill the corners with effects, do NOT "
    "let them reach the edges of the picture, and do NOT surround the creature in a halo of cloud. "
    "**The picture gets cropped down to everything that is not green, so a wide cloud shrinks the "
    "creature itself and it comes out smaller than it should be.** The thing that touches the top and "
    "the bottom of the frame must be the CREATURE'S OWN BODY - its head or ears at the top, its feet "
    "at the bottom - not an effect.\n")

FRAME = (
    "\n\nFull body, facing LEFT, feet (or lowest point) at the very bottom edge of the picture - do not "
    "draw it floating. Fill the frame vertically: it reaches close to the top and the bottom.\n"
    "It must be at least as TALL in the frame as the creature in the reference picture - never smaller, "
    "never shrunk down with empty space above it.\n"
    + UPRIGHT + TIGHT_FX +
    "Readable at small size: bold silhouette, strong shapes, a clear cartoon face.\n"
    "ANATOMY RULE: count the limbs before finishing - the same number as the reference, no extra arms, "
    "legs, heads or tails except where the description above explicitly calls for them.\n")

TAIL = (
    "\nDraw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or "
    "see-through. Any glow, flame, aura, steam, smoke or spark is drawn as a solid shape with a thick "
    "outline, never faded out and never green.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no "
    "watermark, no border. Only ONE creature.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not "
    "photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green "
    "on the creature itself.\n"
    + NO_PANEL +
    "Output 1024x1024 PNG. Save the image as {name} in the current directory and report the path.")

IDLE_POSE = (
    "\n\nPose: STANDING READY in this new form - this is the idle picture the player stares at between "
    "turns, so it is waiting and watching the player, not mid-attack. Weight settled, but charged up "
    "and dangerous.\n")

# ★ 倒下那張跟「變身後的表情」會打架（`art_rules.py` 的第一個雷：規則寫太死會跟姿勢敘述打架）。
# 變身敘述幾乎每隻都寫「眼睛睜開／發光／張嘴怒吼」，倒下的規約卻要求「眼睛畫成兩個叉、嘴巴鬆開」。
# 不講清楚哪一邊贏，模型會兩邊各畫一半（睜大的紅眼睛配鬆開的嘴），倒下就看不出是倒下。
# ★ 第一版在這裡列了「鱗片、尖刺、多出來的尾巴、炸開的毛、脹大的身體、脫掉的衣服」當例子，
# 想說的是「變身後的特徵都要留著」——結果模型把**別隻的特徵**照單畫上去：
# 狸大人的倒地圖背上長出一排紅刺跟一片鱗（牠的變身敘述裡一個字都沒提）。
# 這就是 `art_rules.py` 第一個雷的另一種形狀：**舉例等於下指令**。
#
# 第二版改成反面寫（「不准加鱗片、尖刺、角……」）——**照樣長出來**，只是刺變成白的。
# 反面列舉一樣是列舉：那幾個字出現在提示詞裡，模型就會把它們畫進去。
# 第三版整段不提任何具體特徵，只回指「上面那段變身敘述」與參考圖，並要求「不准自己發明」。
# 教訓可以直接寫進 `art_rules.py`：**要擋一種東西，最好的寫法是連它的名字都不要出現。**
#
# 第四版是被「生不出來」逼出來的：第三版寫「你畫的每一個特徵都得來自那兩個地方，不准自己發明」，
# 跟倒下姿勢要求的「眼睛畫成兩個叉、嘴巴鬆開」直接打架（那兩樣既不在變身敘述裡、也不在參考圖上），
# 狸大人的倒地圖連兩次都在 80 秒內失敗。這正是 `art_rules.py` 第一個雷的辨識訊號：
# **同一張連續失敗兩次以上就是規則打架，不是運氣。**改成「臉與姿勢除外」就過了。
DOWN_OVERRIDE = (
    "\n**FOR THIS PICTURE ONLY - the pose below overrides the FACE.** It has been knocked out, so "
    "ignore any expression described above (open eyes, glowing eyes, bared fangs, a shout): its eyes "
    "are the two X shapes and its mouth is slack, exactly as the pose says. **Apart from the face and "
    "the pose, the creature looks exactly as THE ONE CHANGE above describes it and as the attached "
    "reference shows it** - that is the form it went down in, so the change is still on it. Do not "
    "give it any extra body part, texture or decoration that is not in the change description or in "
    "the reference picture.\n")


# ---------------------------------------------------------------------------
# 十組：`(原魔物 id, 第幾階段, 變身後多了什麼, 這一階段的招牌出招)`
# 每一條的依據都寫在旁邊，對應 `src/content/enemies.ts` 的 `phases[].line` 與 `onEnter`
# ---------------------------------------------------------------------------
SPECS: list[tuple[str, int, str, str, str]] = [
    # --- 第一關的四隻塔主 -------------------------------------------------
    (
        'nekomata', 2, 'the old grey cat granny yokai',
        # line「（尾巴分成了好幾條）」＋ onEnterMove 召尾巴；待機圖本來就有兩條尾巴與兩簇藍火
        "Her TAILS have split: instead of the two forked grey tails in the reference she now has FOUR "
        "or FIVE long grey tails, each one splitting into a forked tip. **They rise UP behind her "
        "shoulders and head like a fan of flames, not out sideways** - close together and clearly "
        "countable against the background, but none of them reaching past the edge of her own robe to "
        "the right. The tip of every tail is burning with the "
        "same BLUE-WHITE ghost flame as the two floating wisps in the reference, and that same "
        "blue-white flame now burns in both of her eyes instead of pupils. Her walking stick is still "
        "in her paw and her patched purple kimono is unchanged; her face is no longer half-lidded and "
        "bored but wide-eyed and hungry, mouth open showing small fangs.",
        "Pose: ATTACKING - hunched forward with all of her tails whipping out at once like a burst of "
        "lashes, curling up and over her own body rather than stretching away across the picture, "
        "blue ghost fire on the tips, one paw thrown forward to the LEFT.",
    ),
    (
        'iron_claw', 2, 'the steampunk mechanical cat',
        # line「（外殼彈開，裡面全是爪子）」＋反彈 1
        "Its armour has SPRUNG OPEN. The dark metal plates on its chest, shoulders, haunches and back "
        "are hinged wide apart like opened panels, still attached along one edge and sticking out, and "
        "the inside is packed with machinery: rows of long curved steel CLAWS and BLADES pushed out "
        "through the gaps, big brass gears now spinning and exposed, coiled springs and pistons, and a "
        "hot orange furnace light glowing out of the open chest cavity. Its single glowing orange eye "
        "now burns twice as bright, the brass wind-up key on its back is spinning, and small "
        "amber-white sparks jump off the joints. Same dark metal and brass colour scheme, same cat "
        "shape - it has just opened up.",
        "Pose: ATTACKING - lunging forward to the LEFT low to the ground with every claw and blade "
        "extended, both front paws swiping, open armour panels flared back like wings.",
    ),
    (
        'orange_king', 2, 'the enormous fat orange tabby king',
        # line「（整顆站了起來）」＋反彈 3；程式註解寫「站起來全身是刺」。
        # 規劃書的「縮起來只露眼睛」是第一階段的 `curlUp`，不是這裡
        # 2026-09-16 第一版的待機圖他還是坐在地上（只有變刺），跟台詞「（整顆站了起來）」對不上——
        # 正是使用者一開始抱怨的那種「說一套、畫一套」。所以「站起來」要寫成看得見的判準：
        # 只有兩隻後腳碰得到地面。
        "He has STOOD UP and gone spiky. In the reference he is slumped on the floor eating; now he is "
        "up on his hind legs at his full towering height, chest out, looking down at the player. "
        "**STANDING IS HALF THE POINT OF THIS PICTURE: the only parts of him touching the ground are "
        "his two hind feet.** His belly and his bottom are up in the air, his legs are straight under "
        "him and you can see the whole height of his body. He is never sitting, squatting, slumped or "
        "resting on the floor in this form - if his belly is on the ground, the picture is wrong. His "
        "orange fur has hardened into a knobbly pitted ORANGE-PEEL RIND like a citrus skin, and short "
        "thick SPIKES have pushed out all over his shoulders, forearms, back and belly - blunt orange "
        "cones with darker tips, not fine needles. The drumstick is gone: both paws are now big "
        "clenched fists. His crown has slipped forward on his head and his red cape is flung back; his "
        "half-lidded lazy eyes are now wide open and furious.",
        "Pose: ATTACKING - rearing back and bringing both spiked fists smashing DOWN to the LEFT in a "
        "huge overhead slam, belly thrust forward, cape flying up behind him.",
    ),
    (
        'frog_daimyo', 2, 'the fat toad lord in daimyo robes',
        # line「來人！」＋召喚蝌蚪 ×2
        "He has PUFFED UP and called his troops. Both cheek pouches are inflated to bursting - two "
        "enormous round balloons swelling out either side of his jaw, easily as wide as his head - and "
        "his whole body has swollen bigger and rounder, stretching his red and gold robe tight so the "
        "fastenings strain apart. Riding on his shoulders and clinging up his back are several small "
        "dark TADPOLES: fat black comma shapes with round white eyes and wriggling tails, five or six "
        "of them, clearly the same family as him. His folding fan is snapped shut in his fist, his "
        "eyes are bulging wide and his wide mouth is open in a bellowing shout.",
        "Pose: ATTACKING - lunging forward to the LEFT with his enormous pink TONGUE lashing out of his "
        "mouth and curling back on itself in a tight S in front of his face - its tip no further from "
        "his head than the width of his own head, never a long whip stretched across the picture. "
        "Cheeks still inflated, tadpoles hanging on.",
    ),
    # --- 第二關的五隻塔主 -------------------------------------------------
    (
        'cowcat_boss', 2, 'the muscular black-and-white cow-patch cat boxer',
        # line「（黑白兩色的毛全豎了起來）」＋爪力 2；第二階段的招是「合一連環」
        "Every hair on him is STANDING ON END. Both the black patches and the white patches of his fur "
        "have bristled straight out into spiky tufts, doubling his silhouette - shoulders, forearms, "
        "chest, cheeks and tail all spiked up like a bottle brush - while keeping exactly the same "
        "cow-patch black-and-white pattern in the same places. The wooden staff is gone from his back: "
        "he has dropped it and now has both bare fists PRESSED TOGETHER in front of his chest, one "
        "black paw and one white paw locked knuckle to knuckle. Warm white steam rises off his "
        "shoulders and his narrowed eyes now glow hot amber.",
        "Pose: ATTACKING - dropped into a deep low stance, driving one enormous straight punch to the "
        "LEFT with both fists still joined, body coiled behind it, a burst of warm white shock lines "
        "off the knuckles.",
    ),
    (
        'tanuki_lord', 2, 'the chubby tanuki lord',
        # line「（葫蘆見底了）」＋召喚狸小子 ×2＋爪力 3；第二階段有「大變身」與「泰山鼓壓」
        "His sake GOURD IS EMPTY and he has sobered into a fighting mood. The big gourd is tipped upside "
        "down and hanging loose off its cord with the stopper out and one last drop falling from the "
        "mouth. His straw hat has been knocked back off his head and hangs behind his neck on its cord, "
        "so his whole face shows for the first time: eyes now WIDE OPEN and fierce instead of the happy "
        "closed crescents, face flushed bright red across the muzzle and cheeks, mouth open in a shout. "
        "His blue-grey vest is shrugged off his shoulders and tied round his waist next to the red "
        "sash, and the small magic LEAF from his hat has moved onto his forehead - keep it the same "
        "muted olive-and-brown leaf it is in the reference, do not brighten it - and just two or three "
        "small curls of warm amber-and-white transformation smoke rising close against his shoulders.",
        # 2026-09-16 第一版是「兩手拍自己的肚子」，跟待機的「握拳擺在肚子前」在遊戲裡幾乎分不出來，
        # 重生成「整個人往左撲、肚子當攻城槌」。腳仍然踩在地上（取景要求腳貼底邊，浮空會打架）
        "Pose: ATTACKING - lunging hard forward to the LEFT in a deep stance with his front foot "
        "planted, his huge drum-tight BELLY thrust out toward the left edge like a battering ram and "
        "his whole body leaning behind it, both paws flung back behind his shoulders, head thrown back "
        "and mouth wide open in a roar, with two or three short warm white shock lines right at the "
        "front of the belly.",
    ),
    (
        'persian_lady', 2, 'the white Persian cat noblewoman',
        # line「你們這群沒用的東西！」＋爪力 2
        "Her composure has SHATTERED. All that long white fur has exploded outward into a frizzy "
        "electrified halo - ruff, tail and every tuft standing on end and twice as big, no longer "
        "smooth and groomed - and her jewelled tiara has slid sideways down her head. Her elegant "
        "closed-eye smile is gone: both eyes are now WIDE OPEN and bloodshot with tiny pinprick pupils, "
        "her mouth is stretched open mid-scream showing fangs, and her claws are fully out of her front "
        "paws. Her FOLDING FAN has been dropped and lies snapped open on the ground by her feet, "
        "clearly fallen. The crimson-and-gold robe is still on her but pulled crooked off one shoulder.",
        "Pose: ATTACKING - lunging forward to the LEFT mid-scream with one clawed paw slashing across, "
        "frizzed fur streaming back, tiara flying off balance.",
    ),
    (
        'dragon_cat', 2, 'the teal scaled dragon cat',
        # line「……吵醒我的，要付代價。」＋清爪力貓步＋爪力 3＋鱗甲 4；第一階段是 `asleep`
        "IT HAS WOKEN UP. In the reference it is asleep, curled in a flat ring with its head resting on "
        "its paws and a sleep bubble at its nose; now it has reared UP out of the coil - the front half "
        "of the long serpent body lifted high and arched, head raised at the top of the picture looking "
        "down to the LEFT, the rest of the body still coiled beneath it as a base. Both eyes are WIDE "
        "OPEN and blazing gold with slit pupils, the golden mane and the fur along its spine are "
        "bristled up into a spiked crest, its golden antlers are held high, its mouth is open showing "
        "fangs, and hot amber flame and warm white smoke curl out of both nostrils. The teal scales "
        "along its chest have thickened into overlapping armour plates with hard raised edges.",
        "Pose: ATTACKING - head thrust forward and down to the LEFT, jaws wide, breathing a short thick "
        "burst of solid amber-orange fire that reaches no further from its jaws than the length of its "
        "own head (not a long jet across the picture), body arched behind it like a drawn bow.",
    ),
    (
        'hex_abbot', 2, 'the old white long-haired cat abbot',
        # line「阿彌陀佛。」＋鱗甲 6。使用者實測的起點就是這一隻
        "Dark SCALES have burst out through his fur. Overlapping reptile scales in dark slate grey, "
        "almost black, with a cold blue-violet sheen and hard raised edges, "
        "now cover both of his forearms and the backs of his paws, climb up his "
        "neck out of the collar of his robe, and creep across the right side of his face in a patch "
        "around the eye and cheekbone, breaking through the white fur at the edges. A ridge of small "
        "pointed scale spines runs up the back of his neck. His eyes, closed and serene in the "
        "reference, are now OPEN and glowing dull red. Everything else is untouched: same white beard "
        "and moustache, same black-and-gold kasaya robe with the lotus panel, same prayer beads in his "
        "paw, same gourd at his hip.",
        "Pose: ATTACKING - stepping forward and driving one huge scaled palm out to the LEFT in a "
        "straight open-palm thrust, arm fully extended, beads swinging, robe sleeve flaring back.",
    ),
    (
        'calico_monk', 2, 'the chubby calico cat monk',
        # line「（睜開眼）」＋反彈 2＋格擋 15
        "His EYES HAVE SNAPPED OPEN and he has stripped for the fight. Both eyes are now wide open, "
        "round and fierce with hot amber irises, brows lowered - in the reference they are gently "
        "closed. His orange kasaya robe has been pulled right down off BOTH shoulders and is bunched "
        "and knotted around his waist, so his whole upper body is bare: a broad muscular calico chest "
        "and thick shoulders with the same orange, black and white patches carrying on across them. "
        "His paws are no longer pressed together in prayer - they are open and braced. The big wooden "
        "prayer beads still hang round his neck, and a faint warm golden shimmer outlines his skin.",
        "Pose: ATTACKING - risen up off the floor onto one knee and driving an open palm strike forward "
        "to the LEFT, shoulders squared, beads swinging, the other paw pulled back at the hip.",
    ),
]

# 兩條線各五隻（`codex_gen.py` 的坑 1：兩條可以，四條會互相餓死）
LANES = {'a': SPECS[:5], 'b': SPECS[5:]}


def fresh_ref(mid: str) -> str:
    """把**現行的**待機圖鋪白底存成參考圖。續集的長相全靠它，所以每次都重建、再驗一次比來源新。"""
    src = MONS / f'{mid}_idle.webp'
    if not src.exists():
        raise SystemExit(f'!! {src} 不在——{mid} 的待機圖還沒進倉？')
    REFDIR.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.paste(im, (0, 0), im)
    out = REFDIR / f'{mid}_idle.png'
    bg.convert('RGB').save(out)
    if out.stat().st_mtime < src.stat().st_mtime:
        raise SystemExit(f'!! 參考圖 {out} 還是比 {src} 舊')
    return out.relative_to(ROOT).as_posix()


def phase_count(mid: str) -> int:
    """這隻在 `enemies.ts` 裡有幾個階段——生一個不存在的階段圖，遊戲永遠不會拿它去用。"""
    src = (ROOT / 'src' / 'content' / 'enemies.ts').read_text(encoding='utf-8')
    lines = src.split('\n')
    starts = [(i, m.group(1)) for i, ln in enumerate(lines) for m in [re.search(r"\{ id: '([^']+)'", ln)] if m]
    for idx, (i, eid) in enumerate(starts):
        if eid != mid:
            continue
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        block = '\n'.join(lines[i:end])
        if 'phases:' not in block:
            return 0
        seg = block[block.index('phases:'):]
        # 只數第一層的 `{`：`phases: [{...}, {...}]` 有幾個就是幾階段
        depth = 0
        n = 0
        brace = 0
        for ch in seg:
            if ch == '[':
                depth += 1
            elif ch == ']':
                depth -= 1
                if depth == 0:
                    break
            elif depth == 1 and ch == '{':
                if brace == 0:
                    n += 1
                brace += 1
            elif depth == 1 and ch == '}':
                brace -= 1
        return n
    raise SystemExit(f'!! enemies.ts 裡找不到 id: {mid}')


def build() -> None:
    all_jobs: dict[str, dict[str, dict[str, str]]] = {'a': {}, 'b': {}}
    for lane, specs in LANES.items():
        for mid, phase, who, change, attack in specs:
            n = phase_count(mid)
            if n < phase - 1:
                raise SystemExit(f'!! {mid} 在 enemies.ts 只有 {n} 個階段，生不出 _p{phase}')
            ref = fresh_ref(mid)
            key = f'{mid}_p{phase}'
            head = ("A single cartoon monster for a cute game set in a cat ninja tower (Japanese yokai "
                    f"flavour), full body, facing left.\n\nThe creature: {who} in the attached picture, "
                    "part-way through a boss fight - it has just transformed into its second form.\n\n"
                    + SAME + WHATS_NEW + change + "\n")
            for pose, body, tailtext in (
                ('idle', IDLE_POSE, TAIL),
                ('attack', '\n\n' + attack + '\n', TAIL),
                # 倒下那張沿用 `build_down_queue.py` 的規約（那批 26 張人眼驗過）：
                # 縮成一團、眼睛變叉、長寬接近正方。關主都是在**最後一個階段**倒的，
                # 所以倒下一定要畫成變身後的樣子——現在畫面用的是變身前那張，等於一定錯。
                ('down', DOWN_OVERRIDE + DOWN_POSE + '\n', None),
            ):
                fid = f'monster_{key}_{pose}.png'
                if tailtext is None:
                    prompt = head + body + '\n' + TIGHT_FX + DOWN_TAIL.format(name=fid)
                else:
                    prompt = head + body + FRAME + tailtext.format(name=fid)
                all_jobs[lane][fid] = {'prompt': prompt, 'ref': ref}

    # ======================= 自檢：一律 SystemExit =======================
    seen: set[str] = set()
    for lane, jobs in all_jobs.items():
        for fid, job in jobs.items():
            if fid in seen:
                raise SystemExit(f'{fid} 在兩條線裡都排了')
            seen.add(fid)
            if not (ROOT / job['ref']).exists():
                raise SystemExit(f'{fid} 的參考圖不在：{job["ref"]}')
            # 坑 7 的防法（2026-09-16 修正）：**不要在這裡整支停下來**。
            # 第一版寫成「有舊原稿就 SystemExit」，結果生到第三張以後這支腳本就再也跑不起來——
            # 我改了提示詞、以為重建了工作檔，其實每次都是失敗離開、`codex_jobs/*.json` 停在最舊那版，
            # 於是接下來十幾張全部用舊提示詞生（狸大人的倒地圖連改三次都長出同一排刺，病根在這裡，
            # 不在提示詞）。改成**從工單裡拿掉、並且大聲印出來**：要重生就先把原稿改名留底，
            # 名字一變這裡就收得到，數量也對得起來。
            if job['prompt'].count('Save the image as') != 1 or f'Save the image as {fid}' not in job['prompt']:
                raise SystemExit(f'{fid}：存檔指令的檔名對不上或有兩句')
            if '#00FF00' not in job['prompt']:
                raise SystemExit(f'{fid}：少了綠幕那一句，去背會失敗')
            if 'COPY IT' not in job['prompt']:
                raise SystemExit(f'{fid}：少了「照參考圖畫」那段，會走鐘成另一隻')
            if 'TALLER THAN IT IS WIDE' not in job['prompt'] and not fid.endswith('_down.png'):
                raise SystemExit(f'{fid}：少了「整張圖要直的」那段，橫著攤開會被縮小一成多')
            if 'KEEP EVERY EFFECT TIGHT' not in job['prompt']:
                raise SystemExit(f'{fid}：少了「特效貼著身體」那段，大團煙霧會把主體擠小一成多')
    # 坑 5：變身敘述裡出現綠色或半透明的東西，去背後會在角色身上破一個洞。
    # 只掃**我自己寫的那段**（共用段落本來就要講「不准綠、不准透明」，一起掃會全部誤報）
    for specs in LANES.values():
        for mid, _phase, who, change, attack in specs:
            mine = f'{who} {change} {attack}'.lower()
            for bad in ('green', 'translucent', 'transparent', 'see-through', 'ghostly pale'):
                if bad in mine:
                    raise SystemExit(f'{mid}：變身敘述裡有「{bad}」，去背後會在牠身上破一個洞（坑 5）。'
                                     '要「發光」就靠形狀與暖色（琥珀、奶白、藍白），一律畫成實心。')

    if len(seen) != 30:
        raise SystemExit(f'!! 應該是 30 張（10 組 × 3 張），實際 {len(seen)}')

    # 已經有原稿的從工單拿掉（`codex_gen` 本來就會跳過，列在工單裡只會讓數字騙人）。
    # 要重生就先把 `tools/codex_raw/<檔名>` 改名成 `.previous-<日期>.png`，這裡自然就收得到。
    done = {fid for jobs in all_jobs.values() for fid in jobs if (RAW / fid).exists()}
    for lane in all_jobs:
        all_jobs[lane] = {k: v for k, v in all_jobs[lane].items() if k not in done}

    JOBS.mkdir(parents=True, exist_ok=True)
    for lane, jobs in all_jobs.items():
        out = JOBS / f'monster_phase_{lane}.json'
        out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
        sys.stdout.write(f'{out.name}：要生 {len(jobs)} 張\n')
        for fid, job in jobs.items():
            sys.stdout.write(f'  {fid}  <- {job["ref"]}\n')
    sys.stdout.write(f'已經有原稿、這次不生的 {len(done)} 張（要重生就先把原稿改名留底）\n')


# ===========================================================================
# 第二批（2026-09-16 晚）：挨打與防禦，10 組 × 2 張 ＝ 20 張
# ===========================================================================
# 跟第一批最大的差別有兩個，兩個都會靜靜出錯，所以寫在最前面：
#
# 1. **參考圖要用第二階段的待機圖**（`public/assets/monsters/<id>_p2_idle.webp`），不是第一階段那張。
#    這是「續集的續集」：拿第一階段當參考，生出來的挨打圖會是**沒有變身特徵的原版**，
#    而且因為姿勢對、長相也對，一張一張看很容易看不出來——要把五張姿勢排在一起才會發現
#    「怎麼只有這兩張沒有鱗片」。
#
# 2. **變身特徵一張都不能掉。** 挨打（縮著、閉眼）與防禦（抱頭、蜷起來）這兩個姿勢天生會把
#    身上的東西藏起來，模型最省力的畫法就是回到原版那隻。所以每隻要有一份
#    **看得見的特徵清單**（`KEEP`），逐條寫死。
#    注意這跟第一批倒下圖那個雷（`DOWN_OVERRIDE` 舉例害牠長出不該有的刺）**方向相反**但同一個道理：
#    列舉會被照單全收，所以列舉的內容一定要是**這一隻自己的**東西，不能是通用的形容詞。
#
# 為什麼不重用第一批的 `change`：那幾段是拿第一階段當參考寫的，句子裡有
#「In the reference he is slumped on the floor eating」這種話，換了參考圖之後會**跟新參考圖打架**。
# 所以另外寫一份現在式、不提參考圖的清單。
KEEP: dict[str, str] = {
    'nekomata':
        "  - FOUR or FIVE long grey tails with forked tips, raised up behind her shoulders and head (not two).\n"
        "  - A blue-white ghost flame burning on the tip of every one of those tails.\n"
        "  - Both of her eyes are blue-white flames instead of normal pupils.\n"
        "  - Her patched plum kimono, her ochre sash, her white top-knot with the hairpin and the little dangling "
        "ornament, and her gnarled wooden walking stick with the purple binding, bead and tassel.\n",
    'iron_claw':
        "  - Its dark metal armour plates are SPRUNG OPEN - hinged apart like opened panels, still attached along "
        "one edge and sticking out from its chest, shoulders, haunches and back.\n"
        "  - The machinery inside shows through those openings: rows of long curved steel claws and blades, "
        "exposed spinning brass gears, springs and pistons.\n"
        "  - A hot orange furnace light glowing out of the opened chest cavity.\n"
        "  - Its single glowing orange eye, its jagged metal muzzle, its brass wind-up key, its segmented tail.\n",
    'orange_king':
        "  - He is STANDING on his two hind legs at full height - the only parts of him touching the ground are "
        "his two hind feet. Never sitting, never slumped on the floor.\n"
        "  - His skin is a knobbly pitted orange-peel rind, dotted all over.\n"
        "  - Short thick blunt ORANGE SPIKES with darker tips covering his shoulders, arms, back, belly and tail.\n"
        "  - His small gold crown, his red cape, the round red jewel at his throat, his orange tabby stripes. "
        "He holds no food - both front paws are bare.\n",
    'frog_daimyo':
        "  - Both cheek pouches INFLATED to bursting - two enormous round balloons either side of his jaw, each "
        "about as wide as his head.\n"
        "  - Several small dark TADPOLES (fat black comma shapes with round white eyes and wriggling tails) "
        "riding on his shoulders and clinging up his back.\n"
        "  - His swollen body straining the red-and-gold daimyo robe, the round gold chrysanthemum crest on his "
        "chest, the gold rope belt with its tassels, the navy patterned underrobe, and his folding fan.\n",
    'cowcat_boss':
        "  - Every hair STANDING ON END: the black patches and the white patches alike bristled out into spiky "
        "tufts, so his whole outline is spiked like a bottle brush - shoulders, forearms, chest, cheeks and tail.\n"
        "  - NO wooden staff anywhere: he dropped it. His bare fists are what he fights with now.\n"
        "  - Eyes glowing hot amber, warm white steam rising off his shoulders.\n"
        "  - His cow-patch black-and-white markings in the same places, his black sash skirt with the brown rope "
        "belt and tassel, and the brown wraps on his forearms.\n",
    'tanuki_lord':
        "  - His straw hat is OFF his head, hanging behind his neck on its cord, so his whole face shows.\n"
        "  - His eyes are WIDE OPEN and fierce (never the happy closed crescents), and his muzzle and cheeks are "
        "flushed bright red.\n"
        "  - The sake gourd is EMPTY: tipped over and hanging loose with the stopper out.\n"
        "  - The small muted olive-and-brown leaf sitting on his forehead.\n"
        "  - His blue-grey vest shrugged off his shoulders and tied around his waist beside the red rope sash, "
        "and his ringed bushy tail.\n",
    'persian_lady':
        "  - All her long white fur EXPLODED outward into a frizzy electrified halo - ruff, tail and every tuft "
        "standing on end and twice its normal size, never smooth or groomed.\n"
        "  - Her folding fan is NOT in her paw: it lies snapped open on the ground by her feet.\n"
        "  - Her jewelled tiara sitting crooked on her head, her matching jewelled earring, and the gold collar "
        "with the ruby and turquoise stones.\n"
        "  - Her crimson-and-gold robe pulled askew off one shoulder, and her claws out of her front paws.\n",
    'dragon_cat':
        "  - It is AWAKE and reared UP - the front half of the long serpent body lifted and arched, head held "
        "high, the rest of the body coiled beneath it as a base. Never lying curled up asleep.\n"
        "  - Both eyes WIDE OPEN and blazing gold with slit pupils, never closed, and no sleep bubble anywhere.\n"
        "  - Its golden mane and the fur along its spine bristled up into a spiked crest, its golden antlers held "
        "high, hot amber flame and warm white smoke at its nostrils.\n"
        "  - Its teal overlapping scales, the pale gold belly bands, the golden tail plume, the pale gold swirl "
        "marking on its forehead.\n",
    'hex_abbot':
        "  - Overlapping dark slate-grey, almost-black reptile SCALES with a cold blue-violet sheen covering both "
        "forearms and the backs of both paws, climbing up his neck out of the robe collar, and spread across one "
        "side of his face around the eye and cheekbone.\n"
        "  - A ridge of small pointed scale spines running up the back of his neck.\n"
        "  - His eyes OPEN and glowing dull red - never closed and serene.\n"
        "  - His long white beard and moustache, his black-and-gold kasaya robe with the gold lotus panel, his "
        "wooden prayer beads and the brown gourd.\n",
    'calico_monk':
        "  - His orange kasaya robe pulled right DOWN off both shoulders and bunched and knotted around his "
        "waist, leaving his whole upper body bare - a broad muscular calico chest and thick shoulders.\n"
        "  - Both eyes WIDE OPEN, round and fierce with hot amber irises and lowered brows - never gently closed, "
        "and his paws are never pressed together in prayer.\n"
        "  - The big wooden prayer beads round his neck, his orange, black and white calico patches, and a faint "
        "warm golden shimmer outlining his skin.\n",
}

# ★ 挨打的姿勢照 `make_wave3_monster_jobs.py`／`make_hurt_jobs.py` 那套（全遊戲的挨打圖都這樣畫）。
#   「眼睛用力閉緊或睜大」兩種都給，是因為好幾隻的變身特徵就寫在眼睛上（老住持的紅眼、龍貓的金眼、
#   貓又的鬼火眼）——只准閉緊的話會跟特徵清單打架，那正是 `art_rules.py` 第一個雷。
HURT_POSE = (
    "\n\nPose: THE MOMENT IT GETS HIT - recoiling backwards (to the RIGHT, since it faces left), body tilted "
    "back and twisted away from the blow, head snapped back, mouth open in an 'ouch'. Its eyes may be screwed "
    "up in pain or blown wide in shock, whichever suits its face - but if the description above says its eyes "
    "glow or burn, they still glow or burn while it winces. Two or three small impact stars near the head, "
    "drawn small and solid in warm white or amber, right up against it. "
    "It is still on its feet and still in the fight - this is a flinch, not a collapse.\n")

# ★ 防禦的姿勢照 `build_block_queue.py`（那批 45 張人眼驗過），但要補一句化解高度衝突：
#   原文寫「壓低、縮成一團」，跟取景要求的「至少跟參考圖一樣高」直接打架，而
#   `add_sprite.py` 對 `block` 有「矮過待機一成就不給進倉」的硬擋——不化解的話會整批卡住。
BLOCK_HEIGHT = (
    "It braces by pulling itself in and setting its weight, NOT by shrinking: it still fills the frame from "
    "top to bottom and stays exactly as tall as the creature in the attached picture. A squashed-down guard "
    "gets rejected.\n")


def phase_ref(mid: str, phase: int = 2) -> str:
    """把**第二階段那張現行待機圖**鋪白底存成參考圖（挨打與防禦是續集的續集，拿第一階段會掉特徵）。

    直接讀 `public/assets/monsters/` 裡進倉的那張，不讀 `tools/codex_raw` 的原稿——
    進倉的那張才是玩家真的會看到的，不會有「原稿比進倉的舊」這種歧義
    （記憶 `reference_mus_art_pipeline`：參考圖過期就會抄到壞版本）。
    """
    src = MONS / f'{mid}_p{phase}_idle.webp'
    if not src.exists():
        raise SystemExit(f'!! {src} 不在——第一批的第二階段待機圖還沒進倉，挨打／防禦不能開工')
    REFDIR.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.paste(im, (0, 0), im)
    out = REFDIR / f'{mid}_p{phase}_idle.png'
    bg.convert('RGB').save(out)
    if out.stat().st_mtime < src.stat().st_mtime:
        raise SystemExit(f'!! 參考圖 {out} 還是比 {src} 舊')
    return out.relative_to(ROOT).as_posix()


def build2() -> None:
    """第二批：10 組的挨打與防禦，各兩條線（c／d）。"""
    all_jobs: dict[str, dict[str, dict[str, str]]] = {'c': {}, 'd': {}}
    for lane, specs in (('c', SPECS[:5]), ('d', SPECS[5:])):
        for mid, phase, who, _change, _attack in specs:
            keep = KEEP.get(mid)
            if not keep:
                raise SystemExit(f'!! {mid} 沒有 KEEP 清單，挨打／防禦會掉變身特徵')
            ref = phase_ref(mid, phase)
            key = f'{mid}_p{phase}'
            head = (
                "A single cartoon monster for a cute game set in a cat ninja tower (Japanese yokai flavour), "
                f"full body, facing left.\n\nThe creature: {who}, part-way through a boss fight.\n\n"
                "**THE ATTACHED PICTURE ALREADY SHOWS IT IN ITS TRANSFORMED SECOND FORM - that is the creature "
                "you are drawing.** Copy it exactly: same species, same face, same colours and markings, same "
                "clothing and accessories, same build, same proportions, same art style, still facing LEFT. "
                "Only the POSE and the expression are different. Do NOT redesign it and do NOT draw a second "
                "creature.\n\n"
                "**EVERY ONE OF THESE TRANSFORMED FEATURES MUST STILL BE VISIBLE IN YOUR PICTURE:**\n" + keep +
                "**Quietly dropping any of them is the one way this picture fails** - it would turn back into "
                "the creature it was BEFORE it transformed, and the game already has that picture. This pose "
                "hides things easily, so check the list once more before you finish.\n")
            for pose, body in (('hurt', HURT_POSE), ('block', '\n\n' + BLOCK_POSE.strip() + '.\n' + BLOCK_HEIGHT)):
                fid = f'monster_{key}_{pose}.png'
                all_jobs[lane][fid] = {'prompt': head + body + FRAME + TAIL.format(name=fid), 'ref': ref}

    # ======================= 自檢：一律 SystemExit =======================
    seen: set[str] = set()
    for lane, jobs in all_jobs.items():
        for fid, job in jobs.items():
            if fid in seen:
                raise SystemExit(f'{fid} 在兩條線裡都排了')
            seen.add(fid)
            if not (ROOT / job['ref']).exists():
                raise SystemExit(f'{fid} 的參考圖不在：{job["ref"]}')
            # 這一批最會靜靜出錯的地方：參考圖拿成第一階段那張
            if '_p2_idle.png' not in job['ref']:
                raise SystemExit(f'{fid} 的參考圖不是第二階段的待機圖（{job["ref"]}），變身特徵會整個掉光')
            if job['prompt'].count('Save the image as') != 1 or f'Save the image as {fid}' not in job['prompt']:
                raise SystemExit(f'{fid}：存檔指令的檔名對不上或有兩句')
            if '#00FF00' not in job['prompt']:
                raise SystemExit(f'{fid}：少了綠幕那一句，去背會失敗')
            if 'TRANSFORMED SECOND FORM' not in job['prompt']:
                raise SystemExit(f'{fid}：少了「附圖已經是第二階段」那段')
            if 'MUST STILL BE VISIBLE' not in job['prompt']:
                raise SystemExit(f'{fid}：少了變身特徵清單，這兩個姿勢會退回原版那隻')
            for need, why in (('TALLER THAN IT IS WIDE', '整張圖要直的'), ('KEEP EVERY EFFECT TIGHT', '特效貼著身體')):
                if need not in job['prompt']:
                    raise SystemExit(f'{fid}：少了「{why}」那段')
            if fid.endswith('_block.png') and 'A squashed-down guard gets rejected' not in job['prompt']:
                raise SystemExit(f'{fid}：防禦少了「不准壓矮」那句，會被 add_sprite 的 --allow-shorter 擋下')
    # 坑 5：特徵清單裡不可以出現綠色或半透明的東西
    for mid, keep in KEEP.items():
        for bad in ('green', 'translucent', 'transparent', 'see-through'):
            if bad in keep.lower():
                raise SystemExit(f'{mid} 的 KEEP 清單裡有「{bad}」，去背後會在牠身上破一個洞（坑 5）')
    if len(seen) != 20:
        raise SystemExit(f'!! 應該是 20 張（10 組 × 2 張），實際 {len(seen)}')

    done = {fid for jobs in all_jobs.values() for fid in jobs if (RAW / fid).exists()}
    for lane in all_jobs:
        all_jobs[lane] = {k: v for k, v in all_jobs[lane].items() if k not in done}

    JOBS.mkdir(parents=True, exist_ok=True)
    for lane, jobs in all_jobs.items():
        out = JOBS / f'monster_phase_{lane}.json'
        out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
        sys.stdout.write(f'{out.name}：要生 {len(jobs)} 張\n')
        for fid, job in jobs.items():
            sys.stdout.write(f'  {fid}  <- {job["ref"]}\n')
    sys.stdout.write(f'已經有原稿、這次不生的 {len(done)} 張（要重生就先把原稿改名留底）\n')


def sheet() -> None:
    """聯絡表：每隻的第一階段與第二階段**並排**（生圖三大教訓之一，整批拼成大圖才看得出走鐘）。

    三張表，判準各不相同：
      1. `變身前後.jpg`   待機圖左右並排——一眼看得出變身了嗎？還認得出是同一隻嗎？
      2. `出招.jpg`       新的出招圖十張——姿勢有沒有比待機矮（矮了進倉會被 `add_sprite` 擋下）。
      3. `倒下.jpg`       新的倒下圖十張——倒了沒？變身後的特徵還在不在？
    輸出到 `docs/審查報告/圖_2026-09-16/`。
    """
    import review_sheet
    out_dir = ROOT / 'docs' / '審查報告' / '圖_2026-09-16'
    out_dir.mkdir(parents=True, exist_ok=True)
    mids = [s[0] for specs in LANES.values() for s in specs]

    pairs: list[Path] = []
    for mid in mids:
        pairs += [MONS / f'{mid}_idle.webp', MONS / f'{mid}_p2_idle.webp']
    review_sheet.build(pairs, out_dir / '變身前後.jpg', cols=4)
    review_sheet.build([MONS / f'{m}_p2_attack.webp' for m in mids], out_dir / '出招.jpg', cols=4)
    review_sheet.build([MONS / f'{m}_p2_down.webp' for m in mids], out_dir / '倒下.jpg', cols=4)
    # 第二批：挨打與防禦。判準是「變身特徵有沒有掉」，所以**跟第二階段待機圖並排**看，
    # 不是自己十張排一排——掉了特徵的那張跟旁邊一比就跳出來了
    for pose, title in (('hurt', '挨打'), ('block', '防禦')):
        if not all((MONS / f'{m}_p2_{pose}.webp').exists() for m in mids):
            sys.stdout.write(f'（{title} 還沒生齊，跳過）\n')
            continue
        rows: list[Path] = []
        for mid in mids:
            rows += [MONS / f'{mid}_p2_idle.webp', MONS / f'{mid}_p2_{pose}.webp']
        review_sheet.build(rows, out_dir / f'{title}.jpg', cols=4)


if __name__ == '__main__':
    arg = sys.argv[1] if len(sys.argv) > 1 else ''
    if arg == 'sheet':
        sheet()
    elif arg == 'hurtblock':
        build2()
    elif arg in ('', 'idle'):
        build()
    else:
        raise SystemExit('用法：python tools/make_monster_phase_jobs.py [idle|hurtblock|sheet]\n'
                         '  idle       第一批：待機、出招、倒下（30 張，工作檔 a／b）\n'
                         '  hurtblock  第二批：挨打、防禦（20 張，工作檔 c／d，參考圖用第二階段的待機圖）\n'
                         '  sheet      重出聯絡表到 docs/審查報告/圖_2026-09-16/')
