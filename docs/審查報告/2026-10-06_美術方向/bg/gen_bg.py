"""背景線（art-bg-1006）生圖：每關 4 張戰鬥背景候選＋每關 2 張地圖中層候選。一次一張、排隊跑。"""
import json, subprocess, sys, time
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
OUT = Path('F:/ClaudeWork/qiuqiu-coop/tools/codex_raw/美術方向_1006/bg')
OUT.mkdir(parents=True, exist_ok=True)

STYLE = ('Art style: cosy cartoon game, thick dark outlines, flat colours with soft cel shading, warm and hand-made, '
         'never sleek or photoreal. ')
BATTLE = ('Background painting for a 2D cat-ninja card game battle scene, landscape 3:2, front-facing, eye level, '
          'no characters, no people, no animals, no text, no letters. '
          'Composition rules (very important): the back wall (or railing) meets the floor along a straight horizontal line '
          'about halfway down the image (52 percent from the top). Everything below that line is an open, empty, flat floor '
          'with nothing standing on it. Props stand only against the back wall. Near-camera framing elements are allowed '
          'only at the very left and right edges and along the top edge (pillar edges, hanging branches, eaves, ropes), '
          'large and darker because they are close to the camera. The middle band of the picture, where two fighters will '
          'stand on the left and on the right, stays visually calm. Strong depth: atmospheric haze makes far things paler. ')
WANT = {
    # 第一關：低層、石牆地牢與練功房
    'art26_low_1.png': BATTLE + (
        'Low floor of a stone cat-ninja tower: a stone training hall at early morning. Diagonal shafts of pale golden '
        'sunlight fall from high barred windows across the back wall, dust glittering in the beams, a thin layer of mist '
        'hugging the flagstone floor. Wooden training dummies and a weapon rack against the back wall, a hanging rope '
        'and the dark edge of a near stone pillar at the far left and far right. Warm and calm. '),
    'art26_low_2.png': BATTLE + (
        'Low floor of a stone cat-ninja tower: a vaulted dungeon hall lit by two iron wall torches with warm orange '
        'light, and cool blue mist rolling in from a far stone archway in the middle of the back wall. Iron chains '
        'hang from the top corners close to the camera, moss on the old stones, a small wooden bench and barrels '
        'against the wall. Mysterious but cosy. '),
    'art26_low_3.png': BATTLE + (
        'Low floor of a stone cat-ninja tower: a stone training courtyard inside the tower walls at dusk, the sky '
        'above the wall glowing orange and violet, paper lanterns on wooden posts against the back wall just lit, '
        'a red maple branch reaching in from the top-left corner close to the camera, a few leaves on the stone floor '
        'edges, soft evening haze. '),
    'art26_low_4.png': BATTLE + (
        'Low floor of a stone cat-ninja tower: a stone storeroom turned practice room on a rainy day, rain visible '
        'through a high grated window, cool grey daylight mixing with a warm hanging oil lamp, sacks, rice barrels '
        'and a straw target against the back wall, wet sheen on the stone floor, thin mist. Near-camera wooden beam '
        'along the top edge. '),
    # 第二關：中層、木造和室與燈籠
    'art26_mid_1.png': BATTLE + (
        'Middle floor of a wooden cat-ninja pagoda tower: a large wooden hall at sunset, glowing paper shoji screens '
        'on the back wall lit orange from behind, slanted beams of warm light crossing the room, a row of round paper '
        'lanterns hanging from the ceiling beams, a dark near-camera wooden beam along the top edge and dark pillar '
        'edges at the far left and right. Polished wooden floorboards. '),
    'art26_mid_2.png': BATTLE + (
        'Middle floor of a wooden cat-ninja pagoda tower: a lantern-festival corridor at night, dozens of red and '
        'orange paper lanterns strung across the back, a wooden railing along the back with dark blue night and '
        'distant rooftops beyond, thin warm mist, glowing reflections on the wooden floor. Near-camera lantern '
        'strings and tassels along the top edge. '),
    'art26_mid_3.png': BATTLE + (
        'Middle floor of a wooden cat-ninja pagoda tower: a quiet tea room on a rainy afternoon, the back shoji doors '
        'slid open to a rainy bamboo garden, cool grey-green daylight, a warm standing paper lamp glowing in a corner, '
        'a low shelf with tea things against the back wall, wooden floor. Near-camera bamboo leaves hanging in from '
        'the top-right corner. '),
    'art26_mid_4.png': BATTLE + (
        'Middle floor of a wooden cat-ninja pagoda tower: a wooden dojo hall in the misty morning, soft light shafts '
        'through lattice windows high on the back wall, long calligraphy banners (blank, no letters) hanging on the '
        'wall, a weapon rack and a drum, pale morning haze, a dark near-camera pillar edge at the far left and right. '),
    # 第三關：頂層、月夜露台與雲
    'art26_top_1.png': BATTLE + (
        'Top of a cat-ninja pagoda tower: a moonlit stone terrace above a sea of clouds, a carved stone railing along '
        'the back with stone lanterns glowing warm on posts, a big full moon in a deep blue sky, thin cloud mist '
        'drifting across the terrace floor, a dark pine branch reaching in from the top-left corner close to the camera. '),
    'art26_top_2.png': BATTLE + (
        'Top of a cat-ninja pagoda tower: an open roof pavilion at dawn above the clouds, pink and gold sunrise light '
        'with long soft light rays, curved red pavilion eaves along the top edge close to the camera, a wooden railing '
        'along the back, distant mountain peaks poking through the clouds, morning mist. '),
    'art26_top_3.png': BATTLE + (
        'Top of a cat-ninja pagoda tower: a starry night terrace with fireflies, the moon half hidden behind thin '
        'glowing clouds, two warm hanging lanterns on wooden posts at the back, a low stone wall along the back with '
        'cloud sea beyond, soft blue haze on the stone floor, wind chimes hanging from the top edge close to the camera. '),
    'art26_top_4.png': BATTLE + (
        'Top of a cat-ninja pagoda tower: a cloud-level terrace at twilight with a crescent moon, purple and teal sky, '
        'long cloth banners fluttering on poles at the back, glowing lanterns along the back railing, wisps of cloud '
        'blowing across the floor, a dark near-camera pillar edge at the far right. '),
}
MAP = ('Very tall portrait background layer for a cat-ninja tower map screen, no characters, no text. Seen straight from '
       'the front: the dark hollow inside of a tall tower shaft, layered depth. The whole picture must be VERY DARK and LOW '
       'CONTRAST, deep shadows, muted colours, nothing bright except a few tiny distant lights, because game icons will be '
       'drawn on top of it. Content stays in the centre; the left and right edges fade into black. ')
WANT_MAP = {
    'art26_mapmid_1.png': MAP + 'Stone tower: zig-zag stone staircases climbing up through the dark, iron chains, stone '
        'arches and cross beams, a few small torch lights far away, faint dusty haze. ',
    'art26_mapmid_2.png': MAP + 'Stone dungeon tower: a spiral of stone steps around the shaft, wooden scaffolding beams, '
        'hanging ropes, two or three dim torches far up, cold blue haze at the bottom. ',
    'art26_mapmid_mid_1.png': MAP + 'Wooden pagoda tower: wooden staircases and ladders climbing between timber floors, '
        'heavy cross beams, small paper lanterns glowing faintly far up, thin warm haze. ',
    'art26_mapmid_mid_2.png': MAP + 'Wooden pagoda tower: stacked timber galleries with railings around an open shaft, '
        'criss-cross roof beams, a few distant red paper lanterns, soft mist. ',
    'art26_mapmid_top_1.png': MAP + 'Top of a pagoda tower open to the night: wooden beams and stone steps rising toward a '
        'deep blue night sky with faint stars and drifting clouds, a few tiny lantern lights, cool mist. ',
    'art26_mapmid_top_2.png': MAP + 'Top of a pagoda tower: open-air stone stairs and broken beams climbing into a moonlit '
        'cloud sea, faint moonlight from above, dim stone lanterns, thin mist. ',
}
jobs = [(k, v + STYLE, '1536x1024') for k, v in WANT.items()] + [(k, v + STYLE, '1024x1536') for k, v in WANT_MAP.items()]
only = set(sys.argv[1:])
log = OUT / 'prompts.json'
saved = json.loads(log.read_text(encoding='utf-8')) if log.exists() else {}
for name, prompt, size in jobs:
    if only and name not in only:
        continue
    out = OUT / name
    saved[name] = {'size': size, 'prompt': prompt}
    log.write_text(json.dumps(saved, ensure_ascii=False, indent=1), encoding='utf-8')
    if out.exists() and not only:
        print('已有', name, flush=True)
        continue
    t = time.time()
    cmd = [sys.executable, str(IMAGE_GEN), 'generate', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
           '--size', size, '--quality', 'high', '--prompt', prompt, '--out', str(out), '--force']
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    ok = r.returncode == 0 and out.exists()
    print(name, 'ok' if ok else '失敗 ' + (r.stderr or r.stdout)[-400:], f'{time.time() - t:.0f} 秒', flush=True)
