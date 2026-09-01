# -*- coding: utf-8 -*-
"""第二、三關的魔物與關主生圖工作檔。

規格對齊 monsters.json：facing left、綠幕、實心不透明、一般魔物 768x768、關主 896x1024。
影球球另開 shadow_cat.json——它要附球球的設定表當參考圖（--ref 是整批套用的，得分開跑）。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MID = """

It stands (or rests) on the ground with its feet at the very bottom edge of the picture - do not draw it floating.
Fill the frame vertically: the monster should reach nearly the top and the bottom of the image.
Readable at small size: bold silhouette, strong shapes, a clear cartoon face.
Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.
Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.
Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.
Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green in the monster
itself unless the description says so.
Output {SIZE} PNG. Save the image as {ID} in the current directory and report the path."""


def mon(name, desc, idle, attack, size='768x768', kind='monster'):
    head = ("A single large cartoon boss monster" if kind == 'boss' else "A single cartoon monster")
    head += (" for a cute game set in a cat ninja tower, full body, facing left.\n\n"
             + ("The boss: " if kind == 'boss' else "The monster: ") + desc + "\n\nPose: ")
    out = {}
    for pose, text in (('idle', idle), ('attack', attack)):
        fid = "monster_%s_%s.png" % (name, pose)
        out[fid] = head + text + MID.replace('{SIZE}', size).replace('{ID}', fid)
    return out


jobs = {}

# ===== 新關主 =====
jobs.update(mon('orange_king',
    "an enormously fat ginger orange tabby cat king, round as a barrel, wearing a tiny gold crown wedged "
    "between his ears and a red cape too small for him, holding a half-eaten dried fish like a sceptre, "
    "smug sleepy eyes",
    "slouching back against nothing like a throne, belly out, chewing lazily",
    "belly-flopping forward with surprising speed, cape flying, crown tilting off",
    size='896x1024', kind='boss'))
jobs.update(mon('cowcat_boss',
    "a big muscular tuxedo cat with cow-pattern black and white patches, a wooden training staff strapped "
    "across the back, one black ear and one white ear, sharp confident grin; the black patches cover exactly "
    "half the face like a mask",
    "standing tall with arms crossed, tail swishing, weight on one leg",
    "spinning the wooden staff overhead with both paws, fur bristling",
    size='896x1024', kind='boss'))
jobs.update(mon('tanuki_lord',
    "a plump bake-danuki (japanese raccoon dog spirit) elder wearing a huge straw hat and a leaf stuck to "
    "his forehead, holding a big sake gourd, striped bushy tail, round belly he drums on, sly friendly grin",
    "drumming his round belly with both paws, cheeks puffed mid-chant",
    "tossing a swirl of leaves from his paw, hat brim lifting, eyes glowing faintly",
    size='896x1024', kind='boss'))
jobs.update(mon('persian_lady',
    "an elegant long-haired white persian cat noble lady with a flat squashed face, jewelled collar, holding "
    "a folding fan half open in front of her mouth, enormous fluffy tail curled around her feet like a gown",
    "sitting perfectly upright, fan raised, eyes closed in disdain",
    "snapping the fan shut and pointing it forward like giving an order, fur flaring",
    size='896x1024', kind='boss'))

# ===== 波斯大小姐的僕從 =====
jobs.update(mon('butler_cat',
    "a slim grey shorthair cat butler in a tiny black tailcoat and white gloves, monocle over one eye, "
    "standing stiffly upright with a silver tray tucked under one arm",
    "standing at attention, one paw behind the back, chin up",
    "flinging the silver tray forward like a discus, tailcoat flaring"))
jobs.update(mon('maid_cat',
    "a small cream-coloured cat maid with a frilly white headband and apron, carrying a long feather duster "
    "twice her height, earnest worried face",
    "hugging the feather duster upright like a spear, glancing sideways",
    "sweeping the giant feather duster in a wide arc, feathers flying"))

# ===== 塔中魔物 =====
jobs.update(mon('shiba_ronin',
    "a scruffy shiba inu dog ronin with a torn straw travelling cloak, a bamboo practice sword at the hip, "
    "curled tail, tired but proud expression",
    "standing side-on with a paw resting on the sword hilt, eyes half closed",
    "mid sword draw: bamboo sword swung out in a wide arc, cloak flying"))
jobs.update(mon('shamisen_cat',
    "a slender black-and-tan cat street musician sitting cross-legged, playing a shamisen (three-string "
    "japanese lute), wearing a loose kimono top, ears folded back in concentration",
    "plucking the shamisen calmly, one ear twitching",
    "striking a loud chord, strings visibly vibrating, fur puffed, mouth open in a yowl"))
jobs.update(mon('lantern_ghost',
    "a chochin-obake: a round red paper lantern spirit with one big eye, a long tongue lolling from a torn "
    "grinning mouth, a small flame flickering inside, tiny stubby arms",
    "swaying gently, tongue hanging, flame low",
    "lunging forward with the mouth wide open, flame blazing out of the tear"))
jobs.update(mon('windchime_sprite',
    "a small wind-chime spirit: a glass bell body with a long paper strip tail covered in doodles, two tiny "
    "arms, a serene closed-eye face painted on the glass",
    "hovering just above its paper strip coiled on the ground like a stand, bell tilted",
    "ringing violently, bell blurred with motion, paper strip whipping in a spiral"))
jobs.update(mon('tanuki_kid',
    "a small round bake-danuki cub with a leaf on its head, big sparkling eyes, striped tail bigger than "
    "its body, wearing a tiny straw raincoat",
    "standing on tiptoe trying to look big, paws on hips",
    "mid-transformation: half wrapped in a puff of smoke, leaf glowing, grinning"))
jobs.update(mon('geta_monster',
    "a bake-zori style sandal spirit: one giant wooden geta sandal with two eyes on the strap knot, a wide "
    "mouth along the front edge, standing on two tiny bare feet",
    "leaning to one side, mouth in a lazy grin",
    "jumping to stomp, sole facing forward, mouth yelling"))
jobs.update(mon('ink_cat',
    "a cat made of living black ink flowing out of a hanging scroll fragment it drags behind, dripping "
    "brush-stroke body, glowing white slit eyes, calligraphy swirls trailing off its back",
    "prowling low, ink dripping from its belly, scroll trailing",
    "rearing up into a splash of ink, one paw a giant brush-stroke slash"))

# ===== 塔頂魔物 =====
jobs.update(mon('moon_rabbit',
    "a white moon rabbit in a small indigo happi coat pounding mochi in a wooden mortar with a big mallet, "
    "long ears with pink inner tips, calm dignified face",
    "resting the mallet on the shoulder, one ear bent, standing by the mortar",
    "slamming the mallet down into the mortar, mochi stretching up, ears flying"))
jobs.update(mon('owl_sentry',
    "a round horned owl night sentry wearing a tiny iron helmet and a scarf, huge unblinking golden eyes, "
    "wings folded like a cloak, perched upright",
    "perched bolt upright, eyes wide, head turned almost backwards",
    "wings spread wide in a sudden flare, talons out, feathers scattering"))
jobs.update(mon('paper_crane',
    "an origami paper crane spirit the size of a cat, sharp folded edges, faint blue glow along the creases, "
    "one painted red eye on each side of the head",
    "standing with wings tucked, head high, perfectly still",
    "darting forward with wings snapped open flat like blades, creases glowing"))
jobs.update(mon('miasma_blob',
    "a blob of dark purple miasma with a faint cat-face forming and dissolving in it, small unstable arms, "
    "specks of violet light drifting inside its SOLID dark body",
    "hunched and bubbling, face half formed",
    "surging upward into a tall wave shape, mouth stretched wide, arms flailing"))
jobs.update(mon('night_panther',
    "a sleek black panther with faint violet stripes that glow like embers, silver bell on a frayed collar, "
    "long low body, cold calm eyes",
    "stalking low with shoulders rolling, tail straight back",
    "mid-pounce with claws out and mouth open, stripes flaring bright"))

dst = ROOT / 'tools/codex_jobs/act23_monsters.json'
dst.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
print('%d 張魔物與關主提示詞 -> %s' % (len(jobs), dst))

# ===== 影球球：要附球球設定表，另開工作檔 =====
shadow = {}
head = ("A single cartoon monster for a cute game set in a cat ninja tower, full body, facing left.\n\n"
        "The monster: a SHADOW CLONE of the grey tabby cat ninja in the attached reference sheet - the SAME "
        "proportions as the reference (big round head as large as the body, tiny muzzle, short chubby body, "
        "headband with two trailing tails), but made ENTIRELY of solid dark violet-black smoke: no fur "
        "markings, flat near-black silhouette with wisps of dark smoke curling off the head, ears and tail, "
        "and two glowing pale violet eyes with tiny bright pupils. Clearly the same character, turned evil."
        "\n\nPose: ")
poses = (('idle', "standing in a ready ninja stance, smoke drifting upward off its shoulders"),
         ('attack', "lunging forward with one smoke-claw swiping wide, a trail of smoke behind the arm"))
for pose, text in poses:
    fid = "monster_shadow_cat_%s.png" % pose
    shadow[fid] = head + text + MID.replace('{SIZE}', '768x768').replace('{ID}', fid)
dst2 = ROOT / 'tools/codex_jobs/shadow_cat.json'
dst2.write_text(json.dumps(shadow, ensure_ascii=False, indent=1), encoding='utf-8')
print('影球球 -> %s' % dst2)
