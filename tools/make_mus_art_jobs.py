# -*- coding: utf-8 -*-
"""姆斯（烏龜）角色二的生圖工作檔（2026-09-03 夜）：

  mus_ref.json    1 張  角色設定表（先生這張，其餘全部用它當 --ref）
  mus_hero.json  11 張  戰鬥立繪（一律朝右，跟球球同一套狀態）
  mus_stills.json 3 張  序章幻燈片（姆斯視角）
  mus_cards.json 86 張  牌面插圖（讀 docs/角色二_烏龜_牌組.json）

跑法：python tools/make_mus_art_jobs.py
      python tools/codex_gen.py tools/codex_jobs/mus_ref.json --timeout 900 --retries 2
      python tools/codex_gen.py tools/codex_jobs/mus_hero.json --ref tools/codex_raw/mus_ref.png ...
接入：立繪要另外打包畫布（不要直接丟 build_art_inbox，會跟球球的畫布互相影響）；牌面等牌進 cards.ts 後再進 art_inbox。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JOBS = ROOT / 'tools' / 'codex_jobs'

TURTLE = ("Mus, a small round turtle disciple of the Turtle-Shell school: olive-green skin, a domed brown shell with hexagonal plates "
          "and a small carved clan emblem (a circle with a turtle-shell hexagon) on the back of the shell, "
          "a RED headband with two trailing tails, a short brown sleeveless vest, cloth leg wraps (gaiters) on the lower legs, "
          "a conical straw hat hanging on the back by a cord, big gentle round eyes with slightly droopy eyelids, "
          "stubby arms and legs, a calm slow-but-sturdy personality")
STYLE = ("Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
         "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the character except its skin, which must stay olive (not pure green).")

# ---------- 設定表 ----------
ref = {"mus_ref.png":
       "Character design sheet for a cute cartoon game. The character: " + TURTLE + ".\n\n"
       "Show the SAME character three times side by side on one canvas: full body front view, full body side view facing RIGHT, "
       "and a big face close-up with a friendly smile. Same proportions as a chibi mascot: head about as big as the body.\n"
       "Draw everything SOLID and OPAQUE. Nothing else in the picture: no text, no letters, no labels, no watermark, no border, no ground.\n"
       + STYLE + "\nOutput 1024x1024 PNG. Save the image as mus_ref.png in the current directory and report the path."}

# ---------- 戰鬥立繪（朝右）----------
POSES = {
    'idle': 'standing calmly, arms relaxed at the sides, small confident smile',
    'attack': 'lunging forward with the shell lowered like a battering ram, one fist punching ahead',
    'guard': 'crouched behind the raised shell, arms crossed in front, bracing',
    'dodge': 'leaning back on one foot, surprised, a blur of motion lines',
    'hit': 'knocked back, eyes squeezed shut, small stars around the head',
    'hurt': 'battered and wobbling, a bandage on the cheek, a sweat drop, but still standing',
    'win': 'one fist raised high in victory, big happy grin',
    'lose': 'sitting on the ground, head down, shell cracked slightly, sad',
    'curl': 'fully withdrawn into the shell, only the eyes peeking out of the front opening',
    'hungry': 'holding an empty rice bowl, drooling, hungry eyes',
    'power': 'a golden aura around the body, shell glowing, fists clenched, eyes blazing',
}
hero = {}
for pose, text in POSES.items():
    fid = f'hero_mus_{pose}.png'
    hero[fid] = ("The character: " + TURTLE + " (exactly the same design as the reference image).\n\nPose: " + text +
                 "\n\nFull body, FACING RIGHT (the character looks toward the right edge of the picture), feet at the very bottom edge of the picture, "
                 "do not draw it floating. Fill the frame vertically.\nKeep the exact same character design as the reference image - only the pose and expression differ.\n"
                 "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent.\n"
                 "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.\n"
                 + STYLE + f"\nOutput 896x896 PNG. Save the image as {fid} in the current directory and report the path.")

# ---------- 序章幻燈片 ----------
QIUQIU = ("the small grey tabby ninja cat Qiuqiu: light grey fur with dark stripes, white chest and paws, a NAVY headband with two trailing tails, "
          "a dark navy ninja outfit, big round eyes")
STILLS = {
    'still_mus_village': ("Dawn at the gate of a small ninja village in the mountains. " + QIUQIU + " is a tiny figure already running away up the road "
                           "toward a distant dark tower. In the foreground " + TURTLE + " stands at the gate, this time holding the straw hat in one hand instead of on the back, watching the cat go, "
                           "worried but calm. Soft pink and gold morning light."),
    'still_mus_pack': ("Night inside a small wooden hut lit by one paper lantern. " + TURTLE + " kneels on the floor carefully packing a cloth bundle: "
                        "rice balls, a rope, a small bell, a folded map. A wooden turtle-shell shield leans against the wall. Warm cozy lantern light, deep blue night outside the window."),
    'still_mus_tower': ("The foot of a huge dark stone tower at dusk, its top lost in purple clouds. " + TURTLE + " stands small at the bottom with a bundle on the back, "
                         "looking straight up with a determined face, one foot already on the first stone step. Torches on the wall, moody purple and orange sky."),
}
stills = {}
for name, desc in STILLS.items():
    fid = f'{name}.png'
    stills[fid] = (desc + "\n\nFull scene illustration with background, landscape 1280x720. No text, no letters, no watermark, no border.\n"
                   "Match the characters in the attached reference sheet EXACTLY: the turtle Mus is the sheet's RIGHT part (same face, shell, red headband, vest); "
                   "the grey tabby ninja cat Qiuqiu and the old master cat with the straw hat are the sheet's LEFT part - whenever they appear, keep their designs exactly.\n"
                   "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic. "
                   f"Draw a real background here (not green). Output 1280x720 PNG. Save the image as {fid} in the current directory and report the path.")

# ---------- 牌面插圖（86 張）----------
GIST = {
    'zhuang': 'giving a firm forward head-butt with the shell, small impact star',
    'suoke': 'pulling head and limbs halfway into the shell, shell glowing with a faint protective sheen',
    'zhuangji': 'charging shoulder-first with the whole shell, a shockwave bursting from the front of the shell',
    'guixi_qi': 'sitting cross-legged, eyes closed, breathing out a calm curl of mist, small green sparkles of healing',
    'keqiao': 'ramming forward with the pointed edge of the shell, piercing through a cracked wooden board',
    'nijiang': 'flinging a ball of mud with one hand, mud splatter flying',
    'kejiewo': 'grabbing a floating stone shield and pulling it toward itself with both hands',
    'hengsao': 'spinning on one foot with the shell swinging in a wide arc, motion lines',
    'shunshi': 'stumbling into a clumsy tumble-shove, one card slipping from the vest pocket',
    'sichuzhangwang': 'standing on tiptoe shading its eyes with one hand, looking far into the distance',
    'manmanxiang': 'sitting with chin on fist thinking hard, a thought bubble with three small cards',
    'deng': 'staring straight ahead with huge intense unblinking eyes, tiny sparkle',
    'xiayitiao': 'jumping with a startled face, arms up, three cards flying out of the vest',
    'youdongjing': 'crouched low with one ear-hand cupped, alert, a single ripple of sound',
    'tuotuolala': 'lying on its shell lazily holding one card above its face, a small yawn',
    'shensishulv': 'peering into a fanned hand of five cards with a magnifying glass',
    'yingke': 'standing firm with the shell suddenly grown thick and armoured, stone-like plates',
    'manbanpai': 'half hidden in the shell while one arm draws a card from a small deck',
    'xianduoyixia': 'fully inside the shell peeking out, a card held up beside the shell like a flag',
    'dihou': 'leaning forward giving a low growl, small angry vein mark, tiny sound lines',
    'shaitaiyang': 'lying on its back under a warm sun with a blissful face, healing sparkles',
    'houke': 'a translucent dome of light forming over the character, hands raised',
    'keci': 'the shell sprouting short sharp spikes, a small bounce-back spark on one spike',
    'yingci': 'the shell covered in long iron spikes, arms crossed confidently',
    'tuikai': 'pushing forward with both open palms, a soft shove wave',
    'shenxiyikou': 'taking a huge deep breath, chest and cheeks puffed out, energy lines gathering',
    'dagedun': 'napping upright with a little snore bubble, one card resting on the belly',
    'manzou': 'waving goodbye while walking away slowly, one card being tossed aside',
    'yaoayao': 'swinging a small hanging bell slowly, hypnotic spiral in the air',
    'tuigeini': 'handing over a dark cloud of grumpy faces to someone off-screen, relieved expression',
    'yazhu': 'pressing down hard on a glowing swirl with both hands, holding it still',
    'yazaikexia': 'sitting on top of its own overturned shell, pinning something underneath, smug',
    'laojingyan': 'an old-looking version with a tiny grey moustache, tapping its temple, one card glowing',
    'yuezhanyueyong': 'flexing both arms with growing muscle lines, small flames of spirit around it',
    'chibaobao': 'happily eating a big rice bowl with chopsticks, cheeks full, hearts floating',
    'laogutou': 'standing very steady in a horse stance, stone-solid legs, faint golden aura',
    'yijingzhidong': 'sitting perfectly still in meditation while wind and leaves rush past',
    'quandoupaxia': 'stomping the ground so hard that shockwave rings spread outward',
    'shenhuxisanci': 'inhaling with three glowing rice balls floating around the head',
    'laoguimingchang': 'an ancient turtle silhouette behind it, healing light on its chest',
    'dingke': 'jabbing upward with the top of the shell, shell edge glowing',
    'jiabei': 'a full-speed charge with the shell leading, dust cloud behind',
    'zhongta': 'slamming one heavy foot down, cracks radiating on the ground',
    'shuaiwei': 'swinging its short tail twice, two arc lines, a small shield spark on each',
    'zhanwen': 'planting both feet wide and standing firm, small ground marks',
    'shenhuxi': 'breathing calmly with eyes closed, a soft shield glow and a heart sparkle',
    'yingjie': 'bracing with the shell forward as a blow bounces back off it as a spark',
    'mojia': 'polishing the shell with a cloth until it shines twice as bright, sparkle stars',
    'laoyou': 'holding a small photo of the cat friend, smiling warmly, two cards in the other hand',
    'yikehuanjin': 'the shell glow flowing into the fists as red claw-like power lines',
    'jiliang': 'the shell cracking with light bursting out toward the front as a beam',
    'liuke': 'wrapping the shell in a rope harness, keeping a glowing shield fixed in place',
    'guijiadun': 'holding the shell in front like a huge round shield with spikes on the rim',
    'nizhua': 'swiping with a muddy paw, mud droplets, a choking cloud of dust',
    'yazhi': 'pinning a small imp-like shadow under one foot, stern face',
    'shuaisha': 'flinging two handfuls of sand in wide arcs',
    'tiejia': 'the shell turned into gleaming iron armour with rivets, arms crossed',
    'yingtou': 'head-butting a boulder so hard the boulder cracks, small dizzy stars on the turtle',
    'dingxue': 'poking one finger precisely at a glowing pressure point in the air',
    'luanzhuang': 'bouncing around wildly like a ricocheting ball, chaotic motion lines',
    'nuoyinuo': 'shuffling sideways with three cards being swapped in the air',
    'jianhuilai': 'picking a card back up from the ground, pleased',
    'guixidafa': 'deep meditation with a big green healing aura shaped like a turtle shell',
    'zhanzhuang': 'a low wide stance on a wooden post, perfectly balanced, blue speed marks at the feet',
    'xujin': 'gathering red power in both fists, veins of light on the arms',
    'yikefuren': 'bowing politely while a row of tiny monsters yawn sleepily, a heart of healing',
    'yaoyikou': 'biting into a big fish, happy, a small health heart',
    'sanlianding': 'three quick head-butts drawn as three afterimages',
    'cijia': 'the shell covered in short spikes AND a shield glow, ready stance',
    'yingcheng': 'gritting teeth with a scraped knee, two rice balls glowing in hand',
    'lianding': 'three rapid piercing horn-like jabs with the shell edge, three impact marks',
    'gunyiquan': 'rolled into a ball and spinning through a ring of small foes, dust everywhere',
    'wannianke': 'sitting inside a huge ancient shell with moss on it, shield glow every side',
    'sheshenyizhuang': 'a desperate all-out flying tackle with the shell, red danger lines',
    'quanliyizhuang': 'a mighty charge with red power lines and a huge impact burst',
    'xigezao': 'sitting in a wooden bath tub, clean and refreshed, dark clouds washing away',
    'suotougong': 'completely hidden inside the shell while blows bounce off harmlessly',
    'zhuangjizhong': 'a heavy shoulder charge with the shield glow doubled around the shell',
    'zhongxin': 'balancing a huge stack of stone plates on the shell, lifting a fist with extra power lines',
    'yifudangguan': 'standing alone in a narrow mountain gate, blocking it with the shell, small foes bouncing off',
    'kezhen': 'slamming the shell down so a ring of shockwaves hits several small shadows around it',
    'guixianyizhuang': 'a legendary charge with a giant golden turtle spirit overlapping the body',
    'budongrushan': 'seated like a mountain with a shield glow doubling in size, tiny birds resting on the shell',
    'wannianguijia': 'an ancient turtle spirit hovering above, pouring shield light and a heart into the character',
    'jiakehuichun': 'the shell glow melting into green healing light flowing into the chest',
    'guikezhen': 'a ring of small floating shell shields orbiting the character, each with a spike',
}
cards_src = json.loads((ROOT / 'docs' / '角色二_烏龜_牌組.json').read_text(encoding='utf-8'))
cards = {}
missing = []
for c in cards_src:
    g = GIST.get(c['id'])
    if not g:
        missing.append(c['id']); continue
    fid = f"card_mus_{c['id']}.png"
    cards[fid] = ("A small turtle ninja, cartoon illustration for a card game, landscape composition.\n"
                  "Same character as the reference image: " + TURTLE + ".\n"
                  "Subject: " + g + "\n"
                  "The subject fills about 80% of the frame, centred. Dynamic and readable at thumbnail size: bold silhouette, strong pose, no fine detail that disappears when shrunk.\n"
                  "Nothing else in the picture: no ground, no shadow, no text, no letters, no watermark.\n"
                  + STYLE + f"\nOutput 1024x768 PNG. Save the image as {fid} in the current directory and report the path.")
if missing:
    print('沒有描述的牌：', missing)

for name, jobs in (('mus_ref', ref), ('mus_hero', hero), ('mus_stills', stills), ('mus_cards', cards)):
    (JOBS / f'{name}.json').write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
    print(name, len(jobs), '張')
