# -*- coding: utf-8 -*-
"""
build_assets.py — 從 Dropbox 貼圖原圖產出遊戲素材（只產遊戲真的會用到的鍵）。
  牌面：整張（含標題帶）→ 寬 360 WebP → public/assets/cards/<set>/<NN>.webp
        鍵＝掃描 src/content/cards.ts 得到的 art 值（58 張牌）。
  立繪：裁掉頂端標題帶 → 高 512 WebP → public/assets/sprites/<set>/<NN>.webp
        ⚠ 2026-08-30 起遊戲**不再使用貼圖版立繪**（主角與塔主都換成 hero/*、boss/* 的專畫版），
          這一節產出的 ninja/*、daxia/* 已經沒有任何程式引用，共約 1.86 MB。
          重跑本腳本會把它們寫回去、也會把 manifest 補回那些鍵——重跑後記得再刪一次，
          或只跑牌面那一節（牌面 cards/* 還在用）。
        鍵＝忍者 40 張（球球固定姿勢＋每張忍術牌的出招姿勢）＋塔主 9 種姿勢（規格 §8.5）。
  另產 public/assets/manifest.json 與 tools/out/review_sprites_<set>.png（抽查拼圖）。
用法：python tools/build_assets.py [--force] [--check]
  --force  忽略時間戳全部重做
  --check  只驗證產物齊全（給 CI／驗收用），不產圖
manifest.json 是共用檔：本腳本只換 cards／sprites／review 三節，
其他鍵（chroma_key.py 寫的 monsters／icons／bg）與 sprites 裡的 codex/* 條目一律保留。
裁切線一律取自 tools/crop_overrides.json（怎麼量出來的寫在該檔的 _readme）；
每個覆寫值都記著當時來源 PNG 的指紋，指紋對不上就照舊用該值但發警告並列入 review。
來源只讀；可重跑。
"""
import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DROPBOX = Path(os.environ["USERPROFILE"]) / "Dropbox" / "08_軟體工具與遊戲" / "LINE貼圖" / "已上架"
SOURCES = {
    "ninja": DROPBOX / "忍者貓貓" / "20260801_彈1" / "RGBA原圖",
    "daxia": DROPBOX / "大俠貓貓篇" / "20260808_彈1" / "RGBA原圖",
}
OUT = ROOT / "public" / "assets"
REVIEW_DIR = ROOT / "tools" / "out"
OVERRIDES = ROOT / "tools" / "crop_overrides.json"
CARDS_TS = ROOT / "src" / "content" / "cards.ts"
CARD_W = 360
CARD_QUALITY = 72
SPRITE_H = 512
SPRITE_QUALITY = 70
MAX_FILE_BYTES = 120_000

# \b 是為了只吃 art: 這個欄位，別讓 heart:、fanart: 之類結尾是 art 的欄位混進來。
ART_RE = re.compile(r"\bart:\s*'([^']+)'")

# 球球的立繪：固定姿勢與每張忍術牌的出招姿勢，忍者 40 張全要（規格 §8.5）。
NINJA_SPRITE_KEYS = [f"ninja/{n:02d}" for n in range(1, 41)]
# 塔主的九種姿勢，來自規格 §6.4 的塔主姿勢表：
# 待機 36 深藏不露、蓄力 21、鐵頭功 05、金鐘罩 07、獅吼功 06、
# 醉拳 16、閉關 35、第二階段待機 33 走火入魔、戰敗 28 承讓。
BOSS_POSE_KEYS = [
    "daxia/36", "daxia/21", "daxia/05", "daxia/07", "daxia/06",
    "daxia/16", "daxia/35", "daxia/33", "daxia/28",
]


def card_keys() -> set[str]:
    """牌面鍵＝src/content/cards.ts 裡出現的 art 值（掃出來的，不手抄清單）。"""
    if not CARDS_TS.exists():
        sys.exit(f"找不到牌庫檔：{CARDS_TS}")
    keys = set(ART_RE.findall(CARDS_TS.read_text(encoding="utf-8")))
    if not keys:
        sys.exit(f"在 {CARDS_TS} 掃不到任何 art 鍵，正規表示式可能過期了")
    return keys


def sprite_keys() -> set[str]:
    """立繪鍵＝忍者 40 張＋塔主 9 種姿勢。"""
    return set(NINJA_SPRITE_KEYS) | set(BOSS_POSE_KEYS)


def source_fingerprint(path: Path) -> str:
    """來源 PNG 的指紋：「位元組數-SHA-1 前 8 碼」。
    刻意不用修改時間：Dropbox 在另一台機器重新同步會換掉時間戳，
    內容其實沒變，拿時間戳當指紋會天天誤報。"""
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return f"{path.stat().st_size}-{h.hexdigest()[:8]}"


def load_overrides() -> dict[str, dict]:
    """讀 crop_overrides.json，一律回傳 {鍵: {"y": 裁切線, "source": 指紋或 None}}。
    新格式：{"_readme": "…", "overrides": {"ninja/01": {"y": 427, "source": "…"}}}
    舊的扁平格式 {"ninja/01": 427} 也照收，當作「沒記指紋」——不檢查、不發警告。"""
    if not OVERRIDES.exists():
        return {}
    raw = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        sys.exit(f"{OVERRIDES} 不是物件，先修好再跑")
    table = raw["overrides"] if isinstance(raw.get("overrides"), dict) else raw
    out: dict[str, dict] = {}
    for key, val in table.items():
        if key.startswith("_"):          # _readme 這類說明鍵不是裁切線
            continue
        if isinstance(val, dict):
            if "y" not in val:
                sys.exit(f"{OVERRIDES} 的 {key} 沒有 y 值，先修好再跑")
            out[key] = {"y": int(val["y"]), "source": val.get("source") or None}
        else:
            out[key] = {"y": int(val), "source": None}
    return out


def title_band_bottom(im: Image.Image) -> tuple[int, bool]:
    """回傳 (裁切線 y, 是否退路)。
    做法：標題帶在最上面，跟角色之間通常有一段完全透明的列。
    從頂端第一個不透明列往下找，找到連續 ≥4 列全透明就當作分界；只在上方 40% 內找。
    找不到就退路：裁掉 20% 高度，並標記人工檢查。
    註：這批貼圖幾乎都沒有透明間隔，實際採用的線一律來自 crop_overrides.json；
    本函式只在遇到沒有覆寫值的新圖時當退路，並把該鍵丟進 review 名單提醒人工看圖。"""
    alpha = im.getchannel("A")
    w, h = im.size
    row_opaque = [False] * h
    px = alpha.load()
    for y in range(h):
        for x in range(0, w, 2):          # 隔行取樣加速
            if px[x, y] > 16:
                row_opaque[y] = True
                break
    top = next((y for y in range(h) if row_opaque[y]), None)
    if top is None:
        return int(h * 0.2), True
    run = 0
    for y in range(top, int(h * 0.4)):
        if not row_opaque[y]:
            run += 1
            if run >= 4:
                return y + 1, False
        else:
            run = 0
    return int(h * 0.2), True


def save_webp(im: Image.Image, path: Path, quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)


def newer(src: Path, dst: Path) -> bool:
    return not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime


def prune(wanted_cards: set[str], wanted_sprites: set[str]) -> list[str]:
    """刪掉不再產出的舊 webp。只掃本腳本擁有的四個資料夾
    （cards/、sprites/ 底下的 ninja 與 daxia），不碰 sprites/codex/ 或
    chroma_key.py 的 monsters/、icons/、bg/。"""
    removed = []
    for group, wanted in (("cards", wanted_cards), ("sprites", wanted_sprites)):
        for set_name in SOURCES:
            d = OUT / group / set_name
            if not d.exists():
                continue
            for p in sorted(d.glob("*.webp")):
                if f"{set_name}/{p.stem}" not in wanted:
                    p.unlink()
                    removed.append(p.relative_to(OUT).as_posix())
    return removed


def write_manifest(cards: dict, sprites: dict, review: list) -> dict:
    """把 cards／sprites／review 三節寫回共用的 manifest.json，其餘鍵原封不動。
    sprites 裡由 chroma_key.py 寫的 codex/* 條目一併保留。"""
    path = OUT / "manifest.json"
    manifest = {}
    if path.exists():
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            sys.exit(f"既有的 manifest.json 解析失敗，先修好再跑：{e}")
        if not isinstance(manifest, dict):
            sys.exit("既有的 manifest.json 不是物件，先修好再跑")
    foreign = {k: v for k, v in manifest.get("sprites", {}).items() if k.startswith("codex/")}
    manifest["cards"] = cards
    manifest["sprites"] = {**sprites, **foreign}
    manifest["review"] = review
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    if foreign:
        print(f"（保留 {len(foreign)} 筆 codex 立繪條目：{sorted(foreign)}）")
    return manifest


def build(force: bool) -> dict:
    # 來源檢查一定要排在 prune() 之前：沒同步 Dropbox 的機器（工作機、CI）
    # 若先刪再中止，等於把已產好的 webp 全刪光卻補不回來。
    missing = [str(d) for d in SOURCES.values() if not d.exists()]
    if missing:
        sys.exit("找不到來源資料夾（沒有刪任何檔就停下了）：\n" + "\n".join(missing))
    overrides = load_overrides()
    wanted_cards = card_keys()
    wanted_sprites = sprite_keys()
    removed = prune(wanted_cards, wanted_sprites)
    if removed:
        print(f"刪掉 {len(removed)} 個不再使用的舊檔")
    cards, sprites, review = {}, {}, []
    for set_name, src_dir in SOURCES.items():
        files = sorted(p for p in src_dir.glob("*.png") if p.stem[:2].isdigit())
        thumbs = []
        for src in files:
            key = f"{set_name}/{src.stem[:2]}"
            need_card = key in wanted_cards
            need_sprite = key in wanted_sprites
            if not need_card and not need_sprite:
                continue
            im = Image.open(src).convert("RGBA")
            if need_card:
                card_out = OUT / "cards" / set_name / f"{src.stem[:2]}.webp"
                cards[key] = card_out.relative_to(ROOT / "public").as_posix()
                if force or newer(src, card_out):
                    card = im.copy()
                    card.thumbnail((CARD_W, CARD_W * 4))
                    save_webp(card, card_out, CARD_QUALITY)
            if need_sprite:
                sprite_out = OUT / "sprites" / set_name / f"{src.stem[:2]}.webp"
                sprites[key] = sprite_out.relative_to(ROOT / "public").as_posix()
                ov = overrides.get(key)
                if ov:
                    y = ov["y"]
                    # 有覆寫值就不再猜，但要確認當初量這條線的那張原圖沒被換掉；
                    # 換掉了照樣用舊值（亂猜更糟），只是叫人來看一眼。
                    now = source_fingerprint(src)
                    if ov["source"] and ov["source"] != now:
                        print(f"警告：{key} 的來源圖換過了（記錄 {ov['source']}、現在 {now}）；"
                              f"仍照 crop_overrides.json 的 y={y} 裁，已列入待人工檢查")
                        review.append(key)
                else:
                    y, fallback = title_band_bottom(im)
                    if fallback:
                        review.append(key)
                if force or newer(src, sprite_out):
                    sprite = im.crop((0, y, im.width, im.height))
                    bbox = sprite.getchannel("A").getbbox()
                    if bbox:
                        sprite = sprite.crop(bbox)
                    sprite.thumbnail((SPRITE_H * 2, SPRITE_H))
                    save_webp(sprite, sprite_out, SPRITE_QUALITY)
                t = Image.open(sprite_out).convert("RGBA")
                t.thumbnail((180, 160))
                thumbs.append(t)
        cols = 8
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * 180, max(rows, 1) * 160), (80, 80, 80, 255))
        for i, t in enumerate(thumbs):
            sheet.paste(t, ((i % cols) * 180, (i // cols) * 160), t)
        REVIEW_DIR.mkdir(parents=True, exist_ok=True)
        sheet.convert("RGB").save(REVIEW_DIR / f"review_sprites_{set_name}.png", quality=85)
    return write_manifest(cards, sprites, review)


def dir_size(root: Path) -> tuple[int, int]:
    """回傳 (總位元組, 檔案數)。"""
    total = count = 0
    for p in root.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
            count += 1
    return total, count


def check() -> None:
    manifest_path = OUT / "manifest.json"
    if not manifest_path.exists():
        sys.exit(f"找不到 {manifest_path}，先跑一次產線")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    wanted_cards = card_keys()
    wanted_sprites = sprite_keys()
    problems = []

    # 牌面：cards.ts 裡每個 art 鍵都必須有檔，缺一張就是錯
    #（加了新牌卻沒重跑產線，會在這裡被抓到）
    got_cards = manifest.get("cards", {})
    for key in sorted(wanted_cards):
        rel = got_cards.get(key)
        if rel is None:
            problems.append(f"牌面缺鍵：{key}（cards.ts 有這張牌，manifest 沒有；加牌後要重跑產線）")
        elif not (ROOT / "public" / rel).exists():
            problems.append(f"缺檔：{rel}")
    extra_cards = sorted(set(got_cards) - wanted_cards)
    if extra_cards:
        problems.append(f"牌面多出 {len(extra_cards)} 個沒人用的鍵：{extra_cards}")

    # 立繪：本腳本負責的鍵必須剛好是那 49 個（codex/* 是別的腳本的，不算在內）
    all_sprites = manifest.get("sprites", {})
    own_sprites = {k: v for k, v in all_sprites.items() if not k.startswith("codex/")}
    foreign_sprites = sorted(k for k in all_sprites if k.startswith("codex/"))
    if set(own_sprites) != wanted_sprites:
        missing = sorted(wanted_sprites - set(own_sprites))
        extra = sorted(set(own_sprites) - wanted_sprites)
        if missing:
            problems.append(f"立繪缺鍵 {len(missing)} 個：{missing}")
        if extra:
            problems.append(f"立繪多出 {len(extra)} 個沒人用的鍵：{extra}")
    for key, rel in sorted(own_sprites.items()):
        if not (ROOT / "public" / rel).exists():
            problems.append(f"缺檔：{rel}")

    # 每個貼圖檔 ≤MAX_FILE_BYTES；bg／icons／monsters 這類別的腳本的產物只提醒不擋
    limit_kb = MAX_FILE_BYTES // 1000
    oversize_note = []
    for group in ("cards", "sprites"):
        d = OUT / group
        if not d.exists():
            continue
        for p in sorted(d.rglob("*.webp")):
            if p.stat().st_size > MAX_FILE_BYTES:
                problems.append(f"太大（>{limit_kb}KB）：{p.relative_to(ROOT / 'public').as_posix()}")
    for p in sorted(OUT.rglob("*")):
        if p.is_file() and not p.is_relative_to(OUT / "cards") and not p.is_relative_to(OUT / "sprites"):
            if p.stat().st_size > MAX_FILE_BYTES:
                oversize_note.append(f"{p.relative_to(ROOT / 'public').as_posix()} {p.stat().st_size:,}")

    if problems:
        sys.exit("\n".join(problems))

    cards_bytes, cards_n = dir_size(OUT / "cards")
    sprites_bytes, sprites_n = dir_size(OUT / "sprites")
    total_bytes, total_n = dir_size(OUT)
    review = manifest.get("review", [])
    print(f"ok：牌面 {len(got_cards)} 張（cards.ts 掃到 {len(wanted_cards)} 個 art 鍵，全部有檔）、"
          f"立繪 {len(own_sprites)} 張（應有 {len(wanted_sprites)}），"
          f"待人工檢查 {len(review)} 張：{review}")
    if review:
        # 只是提醒，不擋：這些是裁切線沒把握的（來源圖換過，或沒有覆寫值走了退路）。
        print("↑ 這幾張的裁切線沒把握，請人打開 tools/out/review_sprites_<套組>.png "
              "或原圖看一眼，必要時更新 tools/crop_overrides.json 的 y 與 source。")
    if foreign_sprites:
        print(f"另有別的腳本的立繪 {len(foreign_sprites)} 筆（不計入 49）：{foreign_sprites}")
    print(f"牌面 {cards_n} 檔 {cards_bytes:,} 位元組；立繪 {sprites_n} 檔 {sprites_bytes:,} 位元組")
    if oversize_note:
        print(f"提醒：public/assets/ 底下有 {len(oversize_note)} 個非貼圖檔超過 {limit_kb} KB（不擋）：{oversize_note}")
    print(f"public/assets/ 總計 {total_bytes:,} 位元組（{total_bytes / 1048576:.2f} MB），{total_n} 個檔")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        check()
    else:
        m = build(args.force)
        own = [k for k in m["sprites"] if not k.startswith("codex/")]
        print(f"完成：{len(m['cards'])} 牌面、{len(own)} 立繪；待人工檢查：{m['review']}")
