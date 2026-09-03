# -*- coding: utf-8 -*-
"""
build_art_inbox.py — 把 tools/art_inbox 交來的素材處理成遊戲用檔，並併進 manifest.json。
用法：python tools/build_art_inbox.py

  地圖底圖  map_tall.png    → public/assets/bg/map_tall.webp（1280x1704，跟著捲軸捲）
  節點圖示  map_node_*.png  → public/assets/icons/node_*.webp（綠幕去背，96x96）
  畫面底圖  screen_*.png    → public/assets/bg/screen_*.webp（1280x720）
  牌的底紋  card_paper_*.png → public/assets/bg/card_paper_*.webp（256x256，可平鋪）
  牌面插圖  card_<牌號>.png  → public/assets/cards/card/<牌號>.webp（去背，300x225）
  事件插圖  event_<事件號>.png → public/assets/bg/event_<事件號>.webp（去背，560x420）
  面板角花  frame_corner.png → public/assets/icons/corner_{tl,tr,bl,br}.webp（去背後自動鏡射出四個角）
  牌框      frame_{common,uncommon,rare}.png → public/assets/icons/cardframe_*.webp（去背，340x510）
  腳印      map_path.png     → public/assets/icons/paw.webp（去背、轉成朝右，放進 3:2 的框留出間距）
  主角立繪  hero_*.png       → public/assets/sprites/hero/*.webp（去背後放進同一張畫布、底部對齊）
  塔主立繪  boss_*.png       → public/assets/sprites/boss/*.webp（同上，另一張共用畫布）
  戰鬥背景  battle_*.png     → public/assets/bg/{low,mid,top}.webp（1280x720）

manifest 一律「讀進來再合併」：其他工具寫的鍵原樣保留，只新增 bg/map 與 icon/node_*。
去背沿用 chroma_key.py 的 key_out（門檻是照實際素材量出來的，不要在這裡另訂一套）。
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import CARD_BAND, CARD_HARD, CARD_SOFT, key_out   # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
INBOX = ROOT / "tools" / "art_inbox"
OUT = ROOT / "public" / "assets"
MANIFEST = OUT / "manifest.json"

ICON_PX = 96      # 節點顯示 44 像素，備 2 倍給高解析度螢幕
ICON_FILL = 0.94  # 去背裁到邊界後，主體要佔滿方框的比例


def fit_square(im: Image.Image, px: int, fill: float) -> Image.Image:
    """把去背後的主體等比縮進正方形畫布並置中。
    去背已經裁到不透明範圍，所以這裡只管縮放與留白，不再猜主體在哪。"""
    inner = int(px * fill)
    w, h = im.size
    s = min(inner / w, inner / h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    canvas.paste(im, ((px - im.width) // 2, (px - im.height) // 2), im)
    return canvas


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    for k in ("cards", "sprites", "monsters", "icons", "bg"):
        manifest.setdefault(k, {})
    manifest.setdefault("review", [])

    missing = []

    # 地圖底圖跟著捲軸捲，所以尺寸就是捲軸內容的大小 1280x1704
    # （= 上下留白 96×2 ＋ 十四段樓層間距 108，見 src/ui/screens/map.ts）。
    # 早期的 16:9 版 map_bg.png 已停用：拉成 1704 高會變形，只能固定不動，
    # 結果是爬十五層看到的景一模一樣。
    bg_src = INBOX / "map_tall.png"
    if bg_src.exists():
        dst = OUT / "bg" / "map_tall.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        # fit 而不是 resize：交來的圖不見得剛好那個比例，直接 resize 會把畫面拉變形
        ImageOps.fit(Image.open(bg_src).convert("RGB"), (1280, 1704), Image.LANCZOS).save(
            dst, "WEBP", quality=66, method=6)
        manifest["bg"]["bg/map_tall"] = dst.relative_to(OUT.parent).as_posix()
        print(f"地圖底圖 map_tall.webp {dst.stat().st_size // 1024} KB")
    else:
        missing.append(bg_src.name)
    # 第二、三關的長條圖（map_tall_mid／map_tall_top）：規格跟 map_tall 一樣，鍵是 bg/map_tall_<段>
    for src in sorted(INBOX.glob("map_tall_*.png")):
        if "." in src.stem:
            continue
        dst = OUT / "bg" / f"{src.stem}.webp"
        ImageOps.fit(Image.open(src).convert("RGB"), (1280, 1704), Image.LANCZOS).save(
            dst, "WEBP", quality=66, method=6)
        manifest["bg"][f"bg/{src.stem}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"地圖底圖 {src.stem}.webp {dst.stat().st_size // 1024} KB")

    # 畫面底圖：品質壓 74（比地圖底圖低一階）。七張一起進來，用 80 會吃掉圖片預算的餘裕，
    # 而這幾張中央本來就被面板蓋住、實際看得到的只有邊緣景物，壓一階看不太出來。
    for src in sorted(INBOX.glob("screen_*.png")):
        name = src.stem.replace("screen_", "")
        dst = OUT / "bg" / f"screen_{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        ImageOps.fit(Image.open(src).convert("RGB"), (1280, 720), Image.LANCZOS).save(
            dst, "WEBP", quality=66, method=6)
        manifest["bg"][f"bg/screen_{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"畫面底圖 screen_{name}.webp {dst.stat().st_size // 1024} KB")

    # 牌的底紋：近乎純色的紙紋，縮到 256 當平鋪磚。品質給高一點——這種平坦漸層
    # 壓太狠會出現一圈一圈的色帶，而檔案本來就只有幾 KB，省不了什麼。
    # 劇情定格圖（序章／結局幻燈片）：跟畫面底圖同規格
    for src in sorted(INBOX.glob("still_*.png")):
        if "." in src.stem:
            continue   # 生圖工具的雜檔（縮圖檢查等）一律不收
        dst = OUT / "bg" / f"{src.stem}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        ImageOps.fit(Image.open(src).convert("RGB"), (1280, 720), Image.LANCZOS).save(
            dst, "WEBP", quality=70, method=6)
        manifest["bg"][f"bg/{src.stem}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"劇情定格 {src.stem}.webp {dst.stat().st_size // 1024} KB")

    # 師父正常形態（綠幕去背的單張立繪，之後接對白頭像）
    mn = INBOX / "master_normal.png"
    if mn.exists():
        keyed = key_out(Image.open(mn).convert("RGB"))
        dst = OUT / "sprites" / "master_normal.webp"
        keyed.thumbnail((640, 720), Image.LANCZOS)
        keyed.save(dst, "WEBP", quality=80, method=6)
        manifest.setdefault("sprites", {})["master/normal"] = dst.relative_to(OUT.parent).as_posix()
        print(f"師父正常形態 master_normal.webp {dst.stat().st_size // 1024} KB")

    for src in sorted(INBOX.glob("card_paper_*.png")):
        name = src.stem.replace("card_paper_", "")
        dst = OUT / "bg" / f"card_paper_{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        Image.open(src).convert("RGB").resize((256, 256), Image.LANCZOS).save(
            dst, "WEBP", quality=92, method=6)
        manifest["bg"][f"bg/card_paper_{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"牌底紋 card_paper_{name}.webp {dst.stat().st_size // 1024} KB")

    # 牌面插圖。兩點跟其他批不一樣：
    #  1. 用 CARD_* 那組門檻——這批的特效本身就是綠色（殘影、音波、半透明的身體），
    #     用一般門檻會被挖得坑坑洞洞（量測與取值理由見 chroma_key.py）。
    #  2. crop=False：保留原本 4:3 的畫布。裁到主體邊界的話，每張主體的留白不同，
    #     牌面用等比縮放塞進 150×120 的框，同一隻貓會忽大忽小。
    # 只收「牌檔裡真的有這個牌號」的圖。生圖工具會在工作目錄留下雜檔
    # （2026-08-31 撿到 card_cuimian__ffmpeg.png 與 card_cuimian_thumbnail_check.png，
    # 後者是它自己做的 150x112 縮圖檢查），不擋的話會被當成兩張新牌收進清單。
    import re as _re
    known = set(_re.findall(r"\{ id: '([a-z_]+)'", (ROOT / "src/content/cards.ts").read_text(encoding="utf-8")))
    faces, unknown = [], []
    for f in sorted(INBOX.glob("card_*.png")):
        if f.stem.startswith("card_paper_"):
            continue
        (faces if f.stem[len("card_"):] in known else unknown).append(f)
    if unknown:
        print(f"  略過 {len(unknown)} 個認不出牌號的檔：{[f.name for f in unknown]}")
    if faces:
        # 先各自去背裁到主體，再放進「照最大主體算出來的共用畫布」。
        # 一開始是直接保留原本 4:3 的畫布（crop=False），想讓每張貓一樣大——
        # 結果每張都帶著同一圈空白，牌面的圖框只有 150×120，主體實際只畫到 75～114 像素寬，
        # 小得看不清楚。改成裁掉共用的空白、但保留彼此的相對大小：畫面看起來大了三成，
        # 每張貓仍然一樣大。
        keyed = {f.stem[len("card_"):]: key_out(Image.open(f), CARD_SOFT, CARD_HARD, CARD_BAND)
                 for f in faces}
        pad = 6
        cw = max(im.width for im in keyed.values()) + pad * 2
        ch = max(im.height for im in keyed.values()) + pad * 2
        scale = min(300 / cw, 240 / ch)
        for cid, im in sorted(keyed.items()):
            canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            canvas.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2), im)
            dst = OUT / "cards" / "card" / f"{cid}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            canvas.resize((round(cw * scale), round(ch * scale)), Image.LANCZOS).save(
                dst, "WEBP", quality=78, method=6)
            manifest["cards"][f"card/{cid}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"  （牌面共用畫布 {cw}x{ch} → 輸出 {round(cw*scale)}x{round(ch*scale)}）")
    n_cards = len(faces)
    if n_cards:
        total = sum((OUT / "cards" / "card" / f.name).stat().st_size
                    for f in (OUT / "cards" / "card").glob("*.webp"))
        print(f"牌面插圖 {n_cards} 張，共 {total // 1024} KB")

    # 事件插圖：每個事件一張。去背（畫面上只有角色與必要道具，浮在面板上），
    # 保留原畫布不裁，十張的角色大小才會一致。顯示 420 寬，輸出兩倍。
    for src in sorted(INBOX.glob("event_*.png")):
        eid = src.stem[len("event_"):]
        keyed = key_out(Image.open(src), CARD_SOFT, CARD_HARD, CARD_BAND, crop=False)
        dst = OUT / "bg" / f"event_{eid}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        keyed.resize((560, 420), Image.LANCZOS).save(dst, "WEBP", quality=84, method=6)
        manifest["bg"][f"bg/event_{eid}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"事件插圖 event_{eid}.webp {dst.stat().st_size // 1024} KB")

    # 牌框：稀有度用的邊框。只有「畫得出質感」的才生圖——常見那款是兩條線，程式畫就好
    # （實測生過一張，結果跟 CSS 兩行一樣，還多佔位元組）。
    # 不裁到主體邊界：框本來就要貼齊牌的四邊，裁掉會對不準。輸出 340x510＝牌的兩倍。
    for src in sorted(INBOX.glob("frame_*.png")):
        tag = src.stem[len("frame_"):]
        if tag == "corner":
            continue   # 那是面板的角花，下面另外處理
        keyed = key_out(Image.open(src), crop=False)
        dst = OUT / "icons" / f"cardframe_{tag}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        keyed.resize((340, 510), Image.LANCZOS).save(dst, "WEBP", quality=86, method=6)
        manifest["icons"][f"icon/cardframe_{tag}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"牌框 cardframe_{tag}.webp {dst.stat().st_size // 1024} KB")

    # 面板角花：只生左上角那一片，其餘三角由這裡鏡射出來（省三次生圖，也保證四角完全對稱）
    corner_src = INBOX / "frame_corner.png"
    if corner_src.exists():
        base = key_out(Image.open(corner_src))
        base.thumbnail((96, 96), Image.LANCZOS)
        flips = {
            "tl": base,
            "tr": base.transpose(Image.FLIP_LEFT_RIGHT),
            "bl": base.transpose(Image.FLIP_TOP_BOTTOM),
            "br": base.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.FLIP_TOP_BOTTOM),
        }
        for tag, im in flips.items():
            dst = OUT / "icons" / f"corner_{tag}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            im.save(dst, "WEBP", quality=88, method=6)
            manifest["icons"][f"icon/corner_{tag}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"角花 corner_*.webp ×4 {(OUT / 'icons' / 'corner_tl.webp').stat().st_size // 1024} KB/張")

    # 腳印：地圖上的路徑改用腳印串起來。
    # 原圖的腳掌朝上，先順時針轉 90 度變成朝右——畫面那邊會把整條路徑轉到線的角度，
    # 「朝右」等於「朝行進方向」，轉過去才會像沿著路走。
    # 再放進一個很寬的透明框：平鋪時多出來的那段空白就是腳印之間的間距。
    # 框寬 130 對腳印 50，等於腳印只佔三分之一——一開始用 3:2 的框，
    # 八十條路徑的腳印擠在一起像壁紙，拉開之後才像一串腳印。
    paw_src = INBOX / "map_path.png"
    if paw_src.exists():
        paw = key_out(Image.open(paw_src)).rotate(-90, expand=True)
        paw.thumbnail((50, 50), Image.LANCZOS)
        cell = Image.new("RGBA", (130, 56), (0, 0, 0, 0))
        cell.paste(paw, ((130 - paw.width) // 2, (56 - paw.height) // 2), paw)
        dst = OUT / "icons" / "paw.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        cell.save(dst, "WEBP", quality=88, method=6)
        manifest["icons"]["icon/paw"] = dst.relative_to(OUT.parent).as_posix()
        print(f"腳印 paw.webp {dst.stat().st_size // 1024} KB")

    for src in sorted(INBOX.glob("map_node_*.png")):
        name = src.stem.replace("map_node_", "")
        dst = OUT / "icons" / f"node_{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        fit_square(key_out(Image.open(src)), ICON_PX, ICON_FILL).save(
            dst, "WEBP", quality=88, method=6)
        manifest["icons"][f"icon/node_{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"圖示 node_{name}.webp {dst.stat().st_size // 1024} KB")

    # 打擊特效：這批只有「一團光」，不像圖示要對齊格線，所以**不塞進正方框**——
    # 斬擊是橫的、火花是圓的，硬塞成正方形會把橫的那張壓扁。裁到主體後照原比例縮，
    # 長邊 256 就夠用（畫面上最大的斬擊也才 200 寬）。
    for src in sorted(INBOX.glob("vfx_*.png")):
        name = src.stem.replace("vfx_", "")
        im = key_out(Image.open(src))
        box = im.getbbox()
        if box:
            im = im.crop(box)
        im.thumbnail((256, 256), Image.LANCZOS)
        dst = OUT / "icons" / f"vfx_{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "WEBP", quality=86, method=6)
        manifest["icons"][f"icon/vfx_{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"特效 vfx_{name}.webp {im.width}x{im.height} {dst.stat().st_size // 1024} KB")

    # 介面裝飾素材：木樑、名牌、意圖木牌、說明框的紙片。
    # 意圖木牌下面有一條垂下來的繩子，寬度只有牌身的一小截。
    # 那截要切掉——樣式表是把牌身橫向拉伸來配合不同寬度的字，
    # 繩子跟著拉會變成一條粗帶子。切點用「從下往上找到第一列夠寬的」自動抓，
    # 不寫死比例（每張生出來的繩長都不一樣）。
    for src in sorted(INBOX.glob("ui_*.png")):
        name = src.stem[len("ui_"):]
        im = key_out(Image.open(src))
        box = im.getbbox()
        if box:
            im = im.crop(box)
        if name.startswith("intent_"):
            a = np.asarray(im)
            widths = (a[:, :, 3] > 30).sum(axis=1)
            wide = widths.max()
            rows = np.nonzero(widths > wide * 0.55)[0]
            if len(rows):
                im = im.crop((0, 0, im.width, int(rows[-1]) + 1))
        dst = OUT / "icons" / f"ui_{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "WEBP", quality=86, method=6)
        manifest["icons"][f"icon/ui_{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"介面素材 ui_{name}.webp {im.width}x{im.height} {dst.stat().st_size // 1024} KB")

    # 秘寶與忍具圖示：檔名 `relic_<牌號>.png`、`potion_<牌號>.png`。
    # 塞進正方框（顯示只有 32～40 像素，備兩倍），跟節點圖示同一套處理。
    for prefix in ("relic", "potion"):
        for src in sorted(INBOX.glob(f"{prefix}_*.png")):
            name = src.stem[len(prefix) + 1:]
            dst = OUT / "icons" / f"{prefix}_{name}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            fit_square(key_out(Image.open(src)), ICON_PX, ICON_FILL).save(
                dst, "WEBP", quality=88, method=6)
            manifest["icons"][f"codex/{prefix}_{name}"] = dst.relative_to(OUT.parent).as_posix()
        n_icon = len(list(INBOX.glob(f"{prefix}_*.png")))
        if n_icon:
            print(f"{'秘寶' if prefix == 'relic' else '忍具'}圖示 {n_icon} 張")

    # 魔物立繪：檔名是 `monster_<牌號>_<idle|attack>.png`。
    # 每隻的兩張要一起放進「同一張畫布」再底部對齊，跟主角立繪同一個道理——
    # 不然待機換出手的瞬間，同一隻怪會忽大忽小。
    # 不同魔物之間**不共用**畫布：體型分小中大三級，本來就該不一樣大。
    mon_files = sorted(INBOX.glob("monster_*.png"))
    by_id: dict[str, dict[str, Image.Image]] = {}
    for f in mon_files:
        stem = f.stem[len("monster_"):]
        if "_" not in stem:
            print(f"  略過（檔名要 monster_<牌號>_<idle|attack>.png）：{f.name}")
            continue
        # 生圖工具會在工作目錄留暫存檔（`*.tmp.png`、`*.final.tmp.png`、
        # 還有像 `monsters__vacuum_attack.tmp.png` 這種）。檔名有「.」的一律不是正式產出，
        # 收進來會變成一隻叫「shadow_kitten_attack.final」的假魔物。
        if "." in stem:
            print(f"  略過（暫存檔）：{f.name}")
            continue
        mid, pose = stem.rsplit("_", 1)
        if pose not in ("idle", "attack", "hurt", "block"):
            print(f"  略過（姿勢只收 idle／attack／hurt／block）：{f.name}")
            continue
        by_id.setdefault(mid, {})[pose] = key_out(Image.open(f))
    for mid, poses in sorted(by_id.items()):
        pad = 8
        cw = max(im.width for im in poses.values()) + pad * 2
        ch = max(im.height for im in poses.values()) + pad * 2
        for pose, im in sorted(poses.items()):
            canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            canvas.paste(im, ((cw - im.width) // 2, ch - pad - im.height), im)
            # 畫面上最大的體型是 230x280（`.unit.size-large .sprite`），
            # 存兩倍給高解析度螢幕就夠了。本來存到 420x640，等於多背了一倍多的位元組。
            canvas.thumbnail((460, 560), Image.LANCZOS)
            dst = OUT / "monsters" / f"{mid}_{pose}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(dst, "WEBP", quality=72, method=6)
            manifest.setdefault("monsters", {}).setdefault(f"codex/monster_{mid}", {})[pose] =                 dst.relative_to(OUT.parent).as_posix()
        print(f"魔物 {mid}：{'／'.join(sorted(poses))}（畫布 {cw}x{ch}，底部對齊）")

    # 主角立繪：七張的主體高度本來就一致（實測都是 797），但寬度隨姿勢差很多。
    # 畫面用 object-fit: contain 塞進 240×300 的框，圖檔寬高比不同就會被縮成不同比例，
    # 換個姿勢貓就忽大忽小。所以全部放進「同一張畫布」再底部對齊置中，比例才鎖得住。
    for group in ("hero", "boss"):
        files = sorted(INBOX.glob(f"{group}_*.png"))
        if not files:
            continue
        keyed = {f.stem[len(group) + 1:]: key_out(Image.open(f)) for f in files}
        pad = 10
        cw = max(im.width for im in keyed.values()) + pad * 2
        ch = max(im.height for im in keyed.values()) + pad * 2
        for name, im in sorted(keyed.items()):
            canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            canvas.paste(im, ((cw - im.width) // 2, ch - pad - im.height), im)
            dst = OUT / "sprites" / group / f"{name}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(dst, "WEBP", quality=82, method=6)
            manifest["sprites"][f"{group}/{name}"] = dst.relative_to(OUT.parent).as_posix()
            print(f"立繪 {group}/{name}.webp {dst.stat().st_size // 1024} KB")
        print(f"  （{group} 共用畫布 {cw}x{ch}，底部對齊，換姿勢不會忽大忽小）")

    # 戰鬥背景：地板交界畫在畫面高度 56%，跟角色腳底（y=402／720）對齊
    for src in sorted(INBOX.glob("battle_*.png")):
        name = src.stem.replace("battle_", "")
        dst = OUT / "bg" / f"{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        ImageOps.fit(Image.open(src).convert("RGB"), (1280, 720), Image.LANCZOS).save(
            dst, "WEBP", quality=68, method=6)
        manifest["bg"][f"bg/{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"戰鬥背景 {name}.webp {dst.stat().st_size // 1024} KB")

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"完成；尚缺 {len(missing)} 張：{missing}")


if __name__ == "__main__":
    main()
