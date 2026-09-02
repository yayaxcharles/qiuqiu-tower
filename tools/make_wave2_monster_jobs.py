# -*- coding: utf-8 -*-
"""怪物與關主擴充・第二波（2026-09-03）的生圖工作檔：18 個單位 × 待機／出手 = 36 張。

規格同 make_new_monsters_jobs.py（面朝左、綠幕去背、滿版）。跑法：
  python tools/make_wave2_monster_jobs.py            → tools/codex_jobs/monsters_wave2.json
  python tools/codex_gen.py tools/codex_jobs/monsters_wave2.json --timeout 900 --retries 2
產出 codex_raw/monster_<id>_<idle|attack>.png → 複製進 art_inbox → build_art_inbox.py。
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


def mon(name, desc, idle, attack, size='768x768'):
    head = ("A single cartoon monster for a cute game set in a cat ninja tower, full body, facing left.\n\n"
            "The monster: " + desc + "\n\nPose: ")
    out = {}
    for pose, text in (('idle', idle), ('attack', attack)):
        fid = "monster_%s_%s.png" % (name, pose)
        out[fid] = head + text + MID.replace('{SIZE}', size).replace('{ID}', fid)
    return out


jobs = {}

# ===== 塔下 =====
jobs.update(mon('dango_slime',
    "a big wobbly dango slime: a translucent-looking but SOLID painted pale-pink mochi blob with two smaller "
    "dumpling lumps stuck to its sides, a sleepy round face, a tiny skewer stuck in its head like a hairpin",
    "sitting in a soft blob shape, wobbling, sleepy smile",
    "lunging forward mid-splat, body stretched toward the left, mouth open"))
jobs.update(mon('dango_bit',
    "a tiny pink dango ball with a simple happy face and stubby feet, no arms",
    "bouncing on the spot, cheerful", "hopping forward with a head-butt, eyes squeezed shut", size='512x512'))
jobs.update(mon('armadillo_pup',
    "a small baby armadillo with a rounded segmented brown shell, big innocent eyes, tiny claws, short tail",
    "standing on all fours, curious, looking left",
    "rolled up into a tight ball, shell facing outward, only eyes peeking", size='512x512'))
jobs.update(mon('lantern_moth',
    "a plump fluffy moth spirit the size of a cat, dusty beige fur, feathered antennae, four big wings with "
    "faint eye spots, carrying a small glowing paper lantern in its front legs",
    "hovering just above the ground with wings spread, lantern glowing softly",
    "diving toward the left with wings folded back, scattering yellow dust", size='768x768'))
jobs.update(mon('hibernating_bear',
    "a big round brown bear with a nightcap and a striped scarf, very fluffy, huge paws, small sleepy eyes",
    "curled up asleep on the ground with a Z-shaped snore bubble, peaceful",
    "wide awake and furious, standing on hind legs, both paws raised to slam down", size='1024x1024'))

# ===== 塔中 =====
jobs.update(mon('puffer_spirit',
    "a pufferfish spirit floating at knee height: round grey-blue body with pale belly, small spikes, big "
    "grumpy eyes, tiny fins, a red bandana",
    "moderately puffed, fins paddling, grumpy",
    "puffed up to the maximum like a spiky balloon, cheeks bulging, cracks of light showing (about to burst)"))
jobs.update(mon('plated_beetle',
    "a rhinoceros beetle warrior in samurai-style plated armour: glossy dark-brown shell with bronze plates, "
    "a big horn, six sturdy legs, fierce little eyes",
    "standing firm, horn up, plates gleaming",
    "charging to the left with horn lowered, legs kicking dust"))
jobs.update(mon('rat_general',
    "a large rat general in a lacquered war helmet with a red plume, tattered cloak, holding a curved sword "
    "in one paw and a small war fan in the other, scar over one eye",
    "standing proud, sword resting on shoulder, fan raised as if giving orders",
    "slashing the sword toward the left, cloak flaring"))
jobs.update(mon('curse_priest',
    "a hunched cat priest in dark violet robes with a tall black hat, face hidden in shadow except two "
    "glowing pale eyes, holding a wooden staff with paper talismans hanging from it",
    "standing still, staff planted, talismans drifting",
    "thrusting the staff forward toward the left, talismans flaring with violet light"))

# ===== 塔頂 =====
jobs.update(mon('phantom_fox',
    "a ghostly white fox spirit with three tails, pale blue flames at the tail tips, body edges fading into "
    "wisps but drawn SOLID, red markings around the eyes",
    "sitting elegantly, tails swaying, calm",
    "leaping to the left with claws out, fox-fire trailing"))
jobs.update(mon('red_oni',
    "a huge red oni brute: crimson skin, two short horns, wild black hair, tiger-stripe loincloth, iron "
    "club with studs, bulging muscles, angry underbite with tusks",
    "standing with the club resting on the ground, glaring left",
    "swinging the iron club in a wide arc toward the left, roaring", size='1024x1024'))
jobs.update(mon('moon_moth_queen',
    "a regal giant moth queen: silver-white wings with crescent-moon patterns, a small crown, elegant "
    "feathered antennae, a long flowing body like a kimono, soft glow",
    "hovering with wings spread wide like a fan, serene",
    "wings beating forward releasing a cloud of glittering silver scales toward the left"))
jobs.update(mon('jizo_golem',
    "a stone jizo statue golem: weathered grey stone body with a red bib, serene carved face with closed "
    "eyes, moss on the shoulders, thick stone hands pressed together",
    "standing motionless like a shrine statue, hands together",
    "one massive stone palm thrust forward toward the left, cracks glowing faintly", size='1024x1024'))

# ===== 關主 =====
jobs.update(mon('frog_daimyo',
    "a fat frog lord in an ornate daimyo kimono with wide shoulders, a tiny top-knot wig, a folding fan, "
    "a golden crest on his chest, smug half-closed eyes",
    "sitting on his haunches like a lord on a dais, fan open",
    "mouth wide open with a long pink tongue shooting to the left", size='1024x1024'))
jobs.update(mon('tadpole',
    "a small black tadpole soldier with a tiny straw hat and a wooden spear, big eyes, wriggly tail",
    "standing upright on its tail, spear ready", "jabbing the spear forward to the left", size='512x512'))
jobs.update(mon('armadillo_king',
    "a giant old armadillo king with a heavily armoured golden-brown shell covered in spikes, a small "
    "iron crown, long scarred snout, powerful claws",
    "standing tall on hind legs, shell gleaming",
    "rolled into a huge spiked ball mid-roll toward the left, motion lines", size='1024x1024'))
jobs.update(mon('dragon_cat',
    "a long serpentine dragon-cat: cat head with whiskers and small antler horns, a long scaled body in "
    "teal and cream coiled beneath it, fluffy mane, tufted tail",
    "coiled up asleep with head resting on its coils, snore bubble",
    "rearing up with mouth open breathing a swirl of teal flame toward the left", size='1024x1024'))
jobs.update(mon('hex_abbot',
    "a very old cat abbot in golden-and-black kesa robes, long white eyebrows and beard, prayer beads, "
    "holding a wooden fish drum and a mallet, an eerie calm smile",
    "sitting in meditation, beads in hand",
    "striking the wooden fish drum, sound rings and paper charms bursting toward the left", size='1024x1024'))

out = ROOT / 'tools' / 'codex_jobs' / 'monsters_wave2.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
print(out, len(jobs), '張')
