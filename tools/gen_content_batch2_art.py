"""內容擴充第二批的圖（2026-09-23，批次 c2）：秘寶圖示 16、忍具圖示 6。

規格來源：`docs/審查報告/2026-09-23/內容擴充提案_秘寶忍具事件.md` 第⑤節「第二批」表（計數型 5、角色新掛鉤 5、
罐頭鋪限定 3、事件限定 3（師門套組第三件「師父的舊木劍」就在這裡；斗笠、酒葫蘆早就有圖）、忍具 6）。
提案沒給代號，這裡取的代號寫在派工暫存區的 `batch2_icon_keys.md`（也印得出來：`keys`）。
事件圖這一輪不做（劇本還在寫）。丟出去的「迷魂香」飛行物走 `tools/gen_projectile_art.py`（`daze_incense`）。

做法照第一批（`gen_content_batch1_art.py`，裁切、閘門、清單寫法、聯絡表都直接借它的）：
  gpt-image-1.5 真透明（codex-oauth），參考圖＝同類三張既有圖示拼一張（只取畫風；除了師父的舊木劍參考師門套組
  另兩件之外，每張都放一張第一批的新圖示），
  挑定後裁透明邊、長邊貼滿 128、置中，存 `public/assets/icons/<名>.webp`（quality 80），清單鍵 `codex/<名>`。

**計數型秘寶**（`COUNTER`，照殺戮尖塔：數字由程式疊在圖示右下角，圖上不畫字）：
  挑定時改用 `fit_counter`——找「右下角 `CORNER`×`CORNER` 一點都不碰到」的最大縮放與最靠中間的位置，
  再驗一次那一角全透明（沒過就不收）。提示詞也先請它把東西畫在左上四分之三。

用法：
    python tools/gen_content_batch2_art.py refs
    python tools/gen_content_batch2_art.py prompt relic_hourglass
    python tools/gen_content_batch2_art.py gen relic_hourglass potion_bento --jobs 4
    python tools/gen_content_batch2_art.py gen relic_hourglass --note "修正說明"
    python tools/gen_content_batch2_art.py pick relic_hourglass 2     # 裁、縮、存 webp、併進清單
    python tools/gen_content_batch2_art.py sheet relic <輸出資料夾>     # relic / potion / mix
    python tools/gen_content_batch2_art.py keys
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
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_content_batch1_art as c1  # noqa: E402

ROOT = c1.ROOT
SOURCE = ROOT / 'tools/motion-art-source/c2'
REF = SOURCE / '_ref'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
ICONS = c1.ICONS
ICON_SIZE = c1.ICON_SIZE
# 計數型秘寶右下角留空的邊長（128 像素座標）。狀態列 32 像素顯示時約 11 像素、戰鬥 42 像素時約 14 像素，
# 放得下一位數（這五件的數字都是個位數：10 張、3 回合、4 回合、第 3 張、3 格）
CORNER = 44

# 名 → (畫什麼, 參考畫風的三張同類既有圖示, 中文名)。名字＝檔名＝清單鍵去掉 `codex/`
ICON_JOBS: dict[str, tuple[str, list[str], str]] = {
    # ---- 計數型 5 件（右下角留給數字）
    'relic_wooden_dummy': (
        'a WING CHUN WOODEN TRAINING DUMMY: a thick upright round wooden post (warm brown wood with visible grain '
        'and a few worn scuffs) with THREE short round wooden arms sticking out of its upper half (two at the same '
        'height angled forward, one lower in the middle) and one bent wooden leg near the bottom, standing on a '
        'small square wooden base. The arms are the recognisable shape. No face on it.',
        ['relic_wood_post', 'relic_anvil', 'relic_scratch_board'], '木人樁'),
    'relic_hourglass': (
        'an HOURGLASS: a sturdy dark-wood frame (round top and bottom plates joined by three turned wooden '
        'pillars) holding a clear glass hourglass, bright golden-yellow sand half in the top bulb and half piled in '
        'the bottom bulb, a thin stream of sand falling through the narrow waist. Tall and narrow, standing upright.',
        ['relic_bamboo_tube', 'relic_qi_gourd', 'relic_master_teacup'], '沙漏'),
    # 第一次畫成「細香插在小蓮花座」：32 像素時只剩一條紅線，認不出來（2026-09-23 看聯絡表），
    # 改成「寬口香碗占下半、一根明顯比線粗的香」，讓碗撐出份量
    'relic_incense_stick': (
        'a TIME-KEEPING INCENSE BOWL: a wide round celadon-blue porcelain incense bowl filled with grey ash (the '
        'bowl is the biggest, boldest part of the picture), with ONE tall dark-red incense stick standing straight '
        'up in it - the stick is clearly thick (like a pencil, not a thread) and marked with FOUR evenly spaced '
        'gold rings like a measuring stick - its top tip glowing orange and a big curl of creamy-white smoke '
        'rising from it. One single stick - not a bundle.',
        ['relic_sleepless_censer', 'relic_old_sword_tassel', 'relic_tassel_knot'], '線香'),
    'relic_dart_case': (
        'a HIDDEN-WEAPON DART CASE: a small rectangular black-lacquered wooden box with gold corner fittings and a '
        'gold spring latch, lying at a slight three-quarter angle; its front face has a row of three small round '
        'holes, and three sharp steel dart tips poke out of the holes. Compact, solid and mechanical.',
        ['relic_claw_sheath', 'relic_blood_dagger', 'relic_mad_sheath'], '暗器匣'),
    'relic_piggy_bank': (
        'a CERAMIC PIGGY BANK: one plump glossy pink ceramic piggy bank (a round fat pig shape with four stubby '
        'legs, a flat round snout, two small ears and a curly tail), a dark coin slot on its back and one gold '
        'square-holed coin half-way into the slot. Cute and round.',
        ['relic_greedy_pouch', 'relic_lucky_cat', 'relic_daruma'], '撲滿'),
    # ---- 角色新掛鉤 5 件
    'relic_full_moon_sword': (
        'a FULL-MOON SWORD INTENT: a bright straight steel jian sword (gold guard, dark-red wrapped grip, a short '
        'red tassel on the pommel) held diagonally, point up, in front of a big round glowing pale-gold FULL MOON '
        'disc behind it; a few short gold light rays around the moon. The sword and the round moon are the two '
        'bold shapes.',
        ['relic_whet_stone', 'relic_tower_moon', 'relic_old_sword_tassel'], '滿月劍意'),
    'relic_sheath_pendant': (
        'a SWORD-SHEATH PENDANT: a short straight jian fully sheathed in a dark-brown lacquered scabbard with '
        'brass fittings, only its gold guard and wrapped grip showing, held upright; from a ring on the scabbard '
        'hangs a round flat gold medallion pendant on a short red cord. Calm and neat - no cracks, no flames.',
        ['relic_tassel_knot', 'relic_old_sword_tassel', 'relic_jade_pendant'], '收鞘墜'),
    'relic_five_poison_manual': (
        'a FIVE-POISONS MANUAL: one thick closed stitched martial-arts book with a deep plum-purple cover, a '
        'cream spine with brown stitching, and one big bold YELLOW SCORPION picture on the front cover (a simple '
        'solid scorpion silhouette, no writing), plus one fat drop of sickly lime-green poison dripping from the '
        'bottom corner of the book.',
        ['relic_snake_fang', 'relic_miasma_sachet', 'relic_scroll'], '五毒譜'),
    'relic_iron_wall': (
        'an IRON WALL: a short thick section of wall built from big dark-iron plates held together with rows of '
        'round rivets, seen at a slight three-quarter angle, with a row of short sharp steel spikes along its top '
        'edge. Heavy, squat and blocky.',
        ['relic_anvil', 'relic_iron_shirt', 'relic_turtle_shell'], '鐵壁'),
    'relic_clone_scroll': (
        'a SHADOW-CLONE SCROLL: one rolled-up ninja hand scroll held upright (cream paper, dark navy wooden '
        'end-rods, tied with a navy cord and a small red seal), with TWO dark violet-black shadow copies of the '
        'same scroll overlapping behind it, offset to the left and slightly lower, like afterimages (the copies '
        'are solid dark violet with black outlines, not see-through).',
        ['relic_shadow_band', 'relic_worn_scroll', 'relic_shadow_cloak'], '影分身卷軸'),
    # ---- 罐頭鋪限定 3 件
    'relic_member_card': (
        'a SHOP MEMBERSHIP CARD: one small rectangular stiff card with rounded corners, warm cream-gold with a '
        'thick gold border, a big bold red CAT PAW PRINT stamped on its left half and a small blue-and-silver '
        'sardine tin picture on its right half, and a short red cord tied through a hole in one corner. A picture '
        'card only - no writing, no letters, no numbers on it.',
        ['relic_lucky_coin', 'relic_crane_bookmark', 'relic_greedy_pouch'], '會員卡'),
    'relic_shop_abacus': (
        'a SHOPKEEPER ABACUS: one whole rectangular Chinese abacus in a dark-brown wooden frame, with several '
        'vertical rods of round reddish-brown beads (a crossbar near the top), seen at a slight three-quarter '
        'angle, one gold square-holed coin resting on its top corner. The whole frame is visible - it is a full '
        'abacus, not a single row of beads.',
        ['relic_greedy_pouch', 'relic_glutton_purse', 'relic_wooden_fish'], '店主的算盤'),
    'relic_wholesale_crate': (
        'a WHOLESALE CRATE: an open square wooden shipping crate (light pine planks, dark nails, rope handles on '
        'the sides) packed full of many small corked potion bottles standing in rows - red, blue, purple and '
        'orange bottles - with a couple more poking out over the top.',
        ['relic_potion_bag', 'relic_shared_bento', 'relic_sardine_tin'], '批發箱'),
    # ---- 事件限定 3 件（師父的舊木劍＝師門套組第三件，跟斗笠、酒葫蘆同一組）
    'relic_demon_shard': (
        'a DEMON-QI SHARD: one jagged broken crystal shard of dark crimson-violet stone with sharp facets and a '
        'faint inner red glow, surrounded by a few curling wisps of dark purple-red miasma (solid, with black '
        'outlines). Ominous and sharp.',
        ['relic_miasma_charm', 'relic_obsidian_claw', 'relic_mad_sheath'], '魔氣殘片'),
    'relic_bandit_iou': (
        'a BANDIT\'S IOU NOTE: one crumpled cream paper slip, dog-eared, blank except for one big bold RED PAW '
        'PRINT stamp in its middle, pinned by a small rough dagger stuck diagonally through its top corner, with '
        'two copper square-holed coins lying beside its bottom edge. Blank paper - no writing, no letters, no '
        'characters, no numbers.',
        ['relic_greedy_pouch', 'relic_blood_dagger', 'relic_crane_bookmark'], '山賊的欠條'),
    'relic_master_wood_sword': (
        'the MASTER\'S OLD WOODEN SWORD: one old wooden practice sword shaped like a straight jian, pale honey '
        'wood worn smooth, with a few small nicks along the edges, a plain wooden guard, a grip wrapped in faded '
        'navy cloth, and a short RED CORD tied in a knot at the pommel (the same red as the master\'s gourd cord). '
        'Shown diagonally, point up.',
        ['relic_master_gourd', 'relic_master_hat', 'relic_coin_sword'], '師父的舊木劍'),
    # ---- 忍具 6 支
    'potion_revive_incense': (
        'a SOUL-RETURNING INCENSE COIL: one dark-brown spiral coil of incense (a flat round spiral) resting on a '
        'small three-legged bronze stand, its outer tip glowing orange, and its creamy-white smoke curling up '
        'into the shape of a small warm golden HEART above it.',
        ['potion_revive_pill', 'potion_qi_tea', 'potion_catgrass_tea'], '回魂香'),
    'potion_bento': (
        'a WRAPPED LUNCH BOX: one square bento box wrapped in a blue furoshiki cloth with white polka dots, the '
        'cloth tied in a big knot on top with two ear-like corners sticking up, and one pair of wooden chopsticks '
        'tucked into the knot. Plump and round-cornered.',
        ['potion_onigiri', 'potion_share_half', 'potion_tuna'], '便當'),
    'potion_demon_mirror': (
        'a DEMON-REVEALING MIRROR: one OCTAGONAL bagua mirror - a red lacquered eight-sided wooden frame with '
        'short black line marks on each of the eight sides (simple broken and unbroken bars, not writing) around a '
        'round shiny convex silver mirror in the centre - with a bold beam of warm golden light shining out of the '
        'mirror towards the upper right.',
        ['potion_your_way', 'potion_mirror_shard', 'potion_sword_talisman'], '照妖鏡'),
    'potion_transfer_pill': (
        'a QI-TRANSFER PILL BOX: one small round open celadon-blue porcelain pill box, its lid leaning against it, '
        'with two round glowing golden pills inside, and one golden ribbon of qi energy curling up out of the box '
        'and splitting into two ends.',
        ['potion_revive_pill', 'potion_needle_salve', 'potion_qi_tea'], '傳功丹'),
    'potion_swap_talisman': (
        'a SWAP TALISMAN: one tall vertical rectangular pale-yellow paper talisman with a purple border and a '
        'small purple tassel at the top, with two bold curved RED ARROWS chasing each other in a circle in its '
        'centre (a swap symbol, no writing), and a few short golden spark lines at its edges.',
        ['potion_sword_talisman', 'potion_nine_lives', 'potion_your_way'], '替換符'),
    'potion_daze_incense': (
        'a DAZING INCENSE PELLET: one small round incense ball of dark plum-purple paste wrapped with a thin band '
        'of white paper, smouldering at the top with a tiny orange ember, giving off a thick swirl of pink-violet '
        'smoke that curls into a SPIRAL (a hypnotic swirl), solid with dark outlines.',
        ['potion_nip_ball', 'potion_smoke_bomb', 'potion_spread_powder'], '迷魂香'),
}

COUNTER = ('relic_wooden_dummy', 'relic_hourglass', 'relic_incense_stick', 'relic_dart_case', 'relic_piggy_bank')

COUNTER_NOTE = (
    'COMPOSITION: keep the item in the UPPER-LEFT three quarters of the picture and leave the LOWER-RIGHT corner '
    '(about a third of the width and a third of the height) completely EMPTY and transparent - the game draws a '
    'small counter number there later. Do NOT draw any number yourself.\n')


def prompt_for(name: str) -> str:
    text = c1.ICON_PROMPT.format(what=ICON_JOBS[name][0])
    return text + ('\n' + COUNTER_NOTE if name in COUNTER else '')


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    # 三張同類既有圖示拼一張（上兩張、下一張），同第一批
    for name, (_, style, _) in ICON_JOBS.items():
        sheet = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
        for i, stem in enumerate(style):
            icon = Image.open(ICONS / f'{stem}.webp').convert('RGBA').resize((420, 420), Image.LANCZOS)
            sheet.alpha_composite(icon, [(46, 46), (558, 46), (302, 558)][i])
        sheet.convert('RGB').save(REF / f'style_{name}.png')
    print(f'參考圖已輸出到 {REF}')


def generate(name: str, note: str = '') -> tuple[str, int, str]:
    with c1._LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f'\n{note}' if note else '')
    ref = REF / f'style_{name}.png'
    command = [sys.executable, str(c1.IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1024x1024', '--quality', 'high', '--prompt', text,
               '--image', str(ref), '--out', str(target), '--force']
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
    c1.record(PROMPTS, name, {'attempt': attempt, 'status': status, 'prompt': text, 'refs': [ref.name],
                              'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def fit_counter(im: Image.Image) -> Image.Image:
    """計數型：裁透明邊後，找「右下角 CORNER×CORNER 一點都不碰到」的最大縮放，位置挑最靠中間的那個。

    判斷碰不碰到用「右下方還有沒有東西」的累計表：主體放在 (x, y) 時，碰到右下角 ⇔
    主體裡座標 ≥ (128−CORNER−y, 128−CORNER−x) 的那一塊不是空的。
    """
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    base = ICON_SIZE / max(im.size)
    limit = ICON_SIZE - CORNER
    for step in range(100, 50, -1):
        k = base * step / 100
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        small = im.resize((w, h), Image.LANCZOS)
        mask = (np.array(small.getchannel('A')) > 8).astype(np.int32)
        # tail[i, j]＝mask[i:, j:] 裡有沒有東西（右下累計）
        tail = mask[::-1, ::-1].cumsum(0).cumsum(1)[::-1, ::-1] > 0
        cx, cy = (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2
        best: tuple[float, int, int] | None = None
        for y in range(0, ICON_SIZE - h + 1):
            for x in range(0, ICON_SIZE - w + 1):
                i, j = max(0, limit - y), max(0, limit - x)
                if i < h and j < w and tail[i, j]:
                    continue
                d = (x - cx) ** 2 + (y - cy) ** 2
                if best is None or d < best[0]:
                    best = (d, x, y)
        if best:
            canvas = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
            canvas.paste(small, (best[1], best[2]))
            return canvas
    raise SystemExit('縮到一半還是讓不出右下角，這張要重生')


def corner_alpha(im: Image.Image) -> int:
    return int(np.array(im.getchannel('A'))[ICON_SIZE - CORNER:, ICON_SIZE - CORNER:].max())


def pick(name: str, attempt: int, force: bool = False) -> None:
    src = SOURCE / f'{name}.try{attempt}.png'
    if not src.exists():
        raise SystemExit(f'找不到 {src.name}')
    raw = Image.open(src).convert('RGBA')
    errs = c1.gate(name, raw)
    if errs and not force:
        raise SystemExit(f'{name} 第 {attempt} 次沒過閘門：' + '；'.join(errs))
    cleaned, dropped = c1.clean(raw, .004)
    counter = name in COUNTER
    out_img = fit_counter(cleaned) if counter else c1.fit_icon(cleaned)
    if counter and corner_alpha(out_img) > 8:
        raise SystemExit(f'{name}：右下角沒讓出來（alpha {corner_alpha(out_img)}）')
    target = ICONS / f'{name}.webp'
    out_img.save(target, 'WEBP', quality=80, method=6)
    data = target.read_bytes()
    # 存成 webp 之後再驗一次那一角（有損壓縮可能在邊上帶出一點點）
    if counter and corner_alpha(Image.open(target).convert('RGBA')) > 8:
        raise SystemExit(f'{name}：存檔後右下角有殘影')
    a = np.array(out_img)[..., 3]
    semi = float(((a > 0) & (a < 248)).sum() / max(1, (a > 0).sum()))
    key = f'codex/{name}'
    c1.register({'icons': {key: target.relative_to(ROOT / 'public').as_posix()}})
    with c1._LOCK:
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        picks[name] = {'attempt': attempt, 'key': key, 'file': target.relative_to(ROOT).as_posix(),
                       'counterCorner': CORNER if counter else None,
                       'sourceSize': list(raw.size), 'size': list(out_img.size), 'bytes': len(data),
                       'droppedSpecks': dropped, 'semiTransparentShare': round(semi, 4),
                       'gate': errs, 'sha256': hashlib.sha256(data).hexdigest(),
                       'at': time.strftime('%Y-%m-%d %H:%M:%S')}
        PICKS.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{name} 採用第 {attempt} 次 → {target.relative_to(ROOT).as_posix()}（{len(data)} 位元組，'
          f'清掉碎點 {dropped} 塊，半透明 {semi:.1%}）→ 清單鍵 {key}' + ('（右下角已讓出）' if counter else ''))


def counter_preview(out: Path, scale: int) -> None:
    """計數型五件疊上假數字（白字黑邊，右下角）看讓出來的角落夠不夠——只是給人看，圖檔本身沒有字。"""
    sizes = (32, 42)
    gap = 8 * scale
    width = gap + len(COUNTER) * (46 * scale + gap)
    height = gap + len(sizes) * (46 * scale + gap)
    sheet = Image.new('RGB', (width, height), (58, 42, 28))
    font = c1._font(round(12 * scale))
    for r, px in enumerate(sizes):
        p, s = (px + 4) * scale, px * scale
        for i, name in enumerate(COUNTER):
            x, y = gap + i * (46 * scale + gap), gap + r * (46 * scale + gap)
            panel = Image.new('RGBA', (p, p), (240, 230, 212, 255))
            ImageDraw.Draw(panel).rectangle([0, 0, p - 1, p - 1], outline=(58, 42, 28), width=max(1, round(1.5 * scale)))
            panel.alpha_composite(Image.open(ICONS / f'{name}.webp').convert('RGBA').resize((s, s), Image.LANCZOS),
                                  ((p - s) // 2, (p - s) // 2))
            d = ImageDraw.Draw(panel)
            d.text((p - 2 * scale, p - 1 * scale), str(i + 3), font=font, anchor='rb', fill=(255, 255, 255),
                   stroke_width=max(1, round(1.5 * scale)), stroke_fill=(0, 0, 0))
            sheet.paste(panel.convert('RGB'), (x, y))
    sheet.save(out)
    print(f'計數角落預覽 {out}（{sheet.size[0]}×{sheet.size[1]}，數字是假的、程式之後疊）')


def sheet(kind: str, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    if kind in ('relic', 'potion'):
        names = [n for n in ICON_JOBS if n.startswith(kind)]
        c1.contact([ICONS / f'{n}.webp' for n in names], out_dir / f'c2_{kind}_500.png', 500, 4)
    elif kind == 'mix':
        for pool in ('relic', 'potion'):
            new = [n for n in ICON_JOBS if n.startswith(pool)]
            # 舊的挑第一批的新圖示＋更早的，一張隔一張排（第一批的名單在 c1.ICON_JOBS）
            b1 = [n for n in c1.ICON_JOBS if n.startswith(pool)]
            older = sorted(p.stem for p in ICONS.glob(f'{pool}_*.webp') if p.stem not in ICON_JOBS and p.stem not in b1)
            old = (b1[:len(new) // 2] + older[:len(new)])[:len(new)]
            c1.mix_sheet(out_dir / f'c2_{pool}_mix_1x.png', new, old, 1)
            c1.mix_sheet(out_dir / f'c2_{pool}_mix_3x.png', new, old, 3)
        counter_preview(out_dir / 'c2_counter_1x.png', 1)
        counter_preview(out_dir / 'c2_counter_3x.png', 3)
    else:
        raise SystemExit(f'不認得 {kind}')


def keys() -> None:
    for name, (_, _, zh) in ICON_JOBS.items():
        print(f'{zh}\tcodex/{name}\tpublic/assets/icons/{name}.webp' + ('\t計數型' if name in COUNTER else ''))


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
        sheet(args.kind, Path(args.out_dir))
    else:
        unknown = [n for n in args.names if n not in ICON_JOBS]
        if unknown:
            raise SystemExit(f'沒有這幾張：{unknown}')
        SOURCE.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, attempt, status in pool.map(lambda n: generate(n, args.note), args.names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)


if __name__ == '__main__':
    main()
