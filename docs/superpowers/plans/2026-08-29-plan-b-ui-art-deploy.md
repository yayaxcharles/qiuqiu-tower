# 《球球勇闖魔物塔》實作計畫 B：美術產線、畫面與部署

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把計畫 A 做好的規則引擎接上畫面，變成能在瀏覽器裡完整打完一局的遊戲；同時建立從貼圖與 Codex 生圖到遊戲素材的產線，最後部署到 GitHub Pages。

**Architecture:** `src/ui/` 用原生 DOM＋CSS，每個畫面一個模組，靠一個極簡的畫面路由切換；所有遊戲狀態變化只透過計畫 A 的 `engine/` 函式，畫面只負責「把狀態畫出來、把點擊轉成引擎呼叫」。素材由 `tools/` 的 Python 腳本產出到 `public/assets/`，並生成一份 `manifest.json` 給畫面查表。

**Tech Stack:** TypeScript、Vite、Vitest、原生 DOM／CSS；Python 3.12＋Pillow（素材產線）；`codex exec`（生圖）；GitHub Actions（部署）。

**Spec:** `docs/superpowers/specs/2026-08-29-qiuqiu-tower-design.md`（§8.4 畫面與動畫、§8.5 大小預算、§9 美術管線、§10 畫面驗收、§11 部署）。

**前置：** 計畫 A 全部完成（`npm test` 全綠）。

## Global Constraints

- 規格 §1：電腦瀏覽器、滑鼠；1280×720 基準版面，視窗改變時整體等比縮放；不支援手機。
- 規格 §1：球球台詞句尾喵（內容在 `content/dialogue.ts`，畫面只查表，不自己寫台詞）。
- 規格 §8.5：程式 ≤150 KB、樣式 ≤30 KB、圖片 ≤3.5 MB（WebP）、不載入網頁字型；`dist/` 總計 ≤4 MB。
- 規格 §9.1：Dropbox 貼圖原圖只讀不改；產物放 `public/assets/`。
- 規格 §9.2：Codex 只能綠幕色鍵；一張一呼叫；提示詞入版控。
- 規格 §8.4：動畫全部 CSS；不用遊戲引擎、不用 Three.js。
- 編碼：`.py` 檔頭 `# -*- coding: utf-8 -*-`，在 Windows 用 `PYTHONUTF8=1` 跑；`.ts`／`.css`／`.json` UTF-8 無 BOM。
- 提交訊息繁體中文「類型：說明」。

---

## 檔案結構（本計畫會建立的）

```
tools/build_assets.py            貼圖 → 牌面 WebP＋裁標題帶立繪 WebP＋manifest.json
tools/crop_overrides.json        裁切線人工覆蓋（鍵 'ninja/12' → y）
tools/chroma_key.py              Codex 綠幕圖 → 透明 PNG → WebP
tools/codex_prompts/*.md         每張 Codex 圖的提示詞（含驗收清單）
tools/codex_run.ps1              逐張呼叫 codex exec 的批次腳本（UTF-8 BOM）
public/assets/{cards,sprites,monsters,icons,bg}/…   產物
public/assets/manifest.json      art 鍵 → 路徑
src/ui/assets.ts                 artUrl(key)；缺圖時回傳剪影佔位
src/ui/app.ts                    畫面路由、1280×720 縮放、整局狀態持有
src/ui/dom.ts                    el()/text() 小工具
src/ui/tooltip.ts                名詞提示
src/ui/dialogue.ts               對白疊層（逐句點擊）
src/ui/screens/{title,map,combat,reward,event,shop,rest,chest,result}.ts
src/ui/styles/{base,combat,map,screens}.css
src/main.ts                      掛載 app
.github/workflows/deploy.yml     推送 main 就建置並部署 Pages
README.md
tests/ui/*.test.ts               純函式（縮放計算、assets 查表、版面資料轉換）
```

---

### Task B1: 貼圖素材產線 `tools/build_assets.py`

**Files:**
- Create: `tools/build_assets.py`, `tools/crop_overrides.json`
- Output: `public/assets/cards/{ninja,daxia}/NN.webp`（80）、`public/assets/sprites/{ninja,daxia}/NN.webp`（80）、`public/assets/manifest.json`、`tools/out/review_sprites_{ninja,daxia}.png`（人工抽查用拼圖）

**Interfaces:**
- Produces: `manifest.json` 格式
  ```json
  { "cards": { "ninja/01": "assets/cards/ninja/01.webp" }, "sprites": { "ninja/01": "assets/sprites/ninja/01.webp" }, "review": ["ninja/12"] }
  ```
  鍵與 `content/cards.ts` 的 `art` 欄位一致（`ninja/NN`、`daxia/NN`）。`review` 列出裁切線是用退路（固定 20%）算出來的圖，需人工看。
- 規則：牌面＝整張含標題帶縮到寬 400；立繪＝裁掉標題帶後縮到高 640；WebP 品質 80；來源較舊且輸出已存在就跳過（可重跑）。

- [ ] **Step 1: 寫 `tools/crop_overrides.json`**

```json
{}
```

- [ ] **Step 2: 寫 `tools/build_assets.py`**

```python
# -*- coding: utf-8 -*-
"""
build_assets.py — 從 Dropbox 貼圖原圖產出遊戲素材。
  牌面：整張（含標題帶）→ 寬 400 WebP → public/assets/cards/<set>/<NN>.webp
  立繪：裁掉頂端標題帶 → 高 640 WebP → public/assets/sprites/<set>/<NN>.webp
  另產 public/assets/manifest.json 與 tools/out/review_sprites_<set>.png（抽查拼圖）。
用法：python tools/build_assets.py [--force] [--check]
  --force  忽略時間戳全部重做
  --check  只驗證產物齊全（給 CI／驗收用），不產圖
來源只讀；可重跑。
"""
import argparse
import json
import os
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
CARD_W = 400
SPRITE_H = 640
QUALITY = 80


def title_band_bottom(im: Image.Image) -> tuple[int, bool]:
    """回傳 (裁切線 y, 是否退路)。
    做法：標題帶在最上面，跟角色之間通常有一段完全透明的列。
    從頂端第一個不透明列往下找，找到連續 ≥4 列全透明就當作分界；只在上方 40% 內找。
    找不到就退路：裁掉 20% 高度，並標記人工檢查。"""
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


def save_webp(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=QUALITY, method=6)


def newer(src: Path, dst: Path) -> bool:
    return not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime


def build(force: bool) -> dict:
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    manifest = {"cards": {}, "sprites": {}, "review": []}
    for set_name, src_dir in SOURCES.items():
        if not src_dir.exists():
            sys.exit(f"找不到來源資料夾：{src_dir}")
        files = sorted(p for p in src_dir.glob("*.png") if p.stem[:2].isdigit())
        thumbs = []
        for src in files:
            key = f"{set_name}/{src.stem[:2]}"
            card_out = OUT / "cards" / set_name / f"{src.stem[:2]}.webp"
            sprite_out = OUT / "sprites" / set_name / f"{src.stem[:2]}.webp"
            manifest["cards"][key] = card_out.relative_to(ROOT / "public").as_posix()
            manifest["sprites"][key] = sprite_out.relative_to(ROOT / "public").as_posix()
            im = Image.open(src).convert("RGBA")
            if force or newer(src, card_out):
                card = im.copy()
                card.thumbnail((CARD_W, CARD_W * 4))
                save_webp(card, card_out)
            y, fallback = title_band_bottom(im)
            if key in overrides:
                y, fallback = int(overrides[key]), False
            if fallback:
                manifest["review"].append(key)
            if force or newer(src, sprite_out):
                sprite = im.crop((0, y, im.width, im.height))
                bbox = sprite.getchannel("A").getbbox()
                if bbox:
                    sprite = sprite.crop(bbox)
                sprite.thumbnail((SPRITE_H * 2, SPRITE_H))
                save_webp(sprite, sprite_out)
            t = Image.open(sprite_out).convert("RGBA")
            t.thumbnail((180, 160))
            thumbs.append(t)
        cols = 8
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * 180, rows * 160), (80, 80, 80, 255))
        for i, t in enumerate(thumbs):
            sheet.paste(t, ((i % cols) * 180, (i // cols) * 160), t)
        REVIEW_DIR.mkdir(parents=True, exist_ok=True)
        sheet.convert("RGB").save(REVIEW_DIR / f"review_sprites_{set_name}.png", quality=85)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest


def check() -> None:
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    problems = []
    for group in ("cards", "sprites"):
        if len(manifest[group]) != 80:
            problems.append(f"{group} 應有 80 筆，實際 {len(manifest[group])}")
        for key, rel in manifest[group].items():
            p = ROOT / "public" / rel
            if not p.exists():
                problems.append(f"缺檔：{rel}")
            elif p.stat().st_size > 120_000:
                problems.append(f"太大（>120KB）：{rel}")
    if problems:
        sys.exit("\n".join(problems))
    print(f"ok：80 牌面、80 立繪，待人工檢查 {len(manifest['review'])} 張：{manifest['review']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        check()
    else:
        m = build(args.force)
        print(f"完成：{len(m['cards'])} 牌面、{len(m['sprites'])} 立繪；待人工檢查：{m['review']}")
```

- [ ] **Step 3: 跑產線**

Run（PowerShell，專案根目錄）: `$env:PYTHONUTF8=1; python tools/build_assets.py`
Expected: 印出「完成：80 牌面、80 立繪；待人工檢查：[…]」；`public/assets/manifest.json` 存在。

- [ ] **Step 4: 驗證**

Run: `$env:PYTHONUTF8=1; python tools/build_assets.py --check`　Expected: 印出 `ok：80 牌面、80 立繪…`。
用 Read 工具打開 `tools/out/review_sprites_ninja.png` 與 `review_sprites_daxia.png` 看：每張立繪頂端不得殘留標題文字或底線；有殘留的把鍵與正確的 y 寫進 `tools/crop_overrides.json`（y 用原圖像素，例如 `{"daxia/13": 300}`），重跑 `--force` 再看一次。`review` 名單裡的每一張都要看過。
Run: `Get-ChildItem public/assets -Recurse -File | Measure-Object Length -Sum`　Expected: 總和 ≤ 3.5 MB。

- [ ] **Step 5: 提交**

```bash
git add tools/build_assets.py tools/crop_overrides.json public/assets/manifest.json public/assets/cards public/assets/sprites
git commit -m "美術：貼圖產線（牌面與立繪 WebP＋manifest）"
```
（`tools/out/` 加進 `.gitignore`，不入版控。）

---

### Task B2: Codex 生圖批次（魔物、圖示、背景、蜷縮）與去背

**Files:**
- Create: `tools/codex_prompts/template.md`, `tools/codex_prompts/subjects.json`, `tools/codex_run.py`, `tools/chroma_key.py`
- Output: `tools/codex_raw/<key>.png`（綠幕原圖，入版控以便重做）、`public/assets/{monsters,icons,bg,sprites/codex}/…webp`、更新 `public/assets/manifest.json`

**Interfaces:**
- Produces: manifest 增加 `"monsters": { "codex/monster_rat": { "idle": "assets/monsters/rat_idle.webp", "attack": "assets/monsters/rat_attack.webp" } }`、`"icons": { "icon/onigiri_full": "assets/icons/onigiri_full.webp", … }`、`"bg": { "bg/low": … }`、`"sprites"` 加一筆 `"codex/curl"`。鍵與 `content/*.ts` 的 `art` 欄位一致（魔物 `enemies.ts` 的 `art`、秘寶 `codex/relic_*`、忍具 `codex/potion_*`）。
- 規則：一張一呼叫；沒生出來的重跑腳本會自動補；提示詞固定入版控。

- [ ] **Step 1: 寫 `tools/codex_prompts/template.md`**

```md
# 生圖提示詞模板（每張＝共同段＋主題段＋存檔指示）

## 共同段（所有圖）
Style: same art style as the reference sticker sheet at `<REF>`: thick black outlines, flat colors with subtle soft gradients,
cute cartoon sticker look, no photorealism. Single subject, centered, filling about 80% of the canvas, no text, no letters,
no watermark, no sparkles or stars. Background must be a solid pure green (#00FF00) with no shading, for chroma keying.
Output 1024x1024 PNG.

## 主題段
（由 subjects.json 的 `subject` 欄位帶入）

## 存檔指示
Save the image as `<FILE>` in the current directory and report the path.

## 背景圖例外
背景（bg/*）不要綠幕：主題段自帶場景描述，畫滿整張 1792x1024，不放角色。
```

- [ ] **Step 2: 寫 `tools/codex_prompts/subjects.json`**

```json
{
  "sprites/codex/curl": { "group": "sprites", "size": 640, "subject": "The gray tabby ninja cat from the reference (blue headband, pink inner ears, white chest) curled into a tight round ball on the floor, eyes shut, ears flat, tail wrapped around itself; a defensive 'curl up' pose." },

  "monsters/rat_idle":            { "group": "monsters", "size": 320, "subject": "A small gray rat soldier wearing a tiny paper hat, holding a toothpick spear, standing, mischievous grin." },
  "monsters/rat_attack":          { "group": "monsters", "size": 320, "subject": "The same small gray rat soldier lunging forward with its toothpick spear, mouth open." },
  "monsters/cucumber_idle":       { "group": "monsters", "size": 480, "subject": "A large cucumber lying on the ground with two sleepy eyes and a small mouth, looking harmless." },
  "monsters/cucumber_attack":     { "group": "monsters", "size": 480, "subject": "The same cucumber springing up into the air, eyes wide, motion lines." },
  "monsters/onigiri_idle":        { "group": "monsters", "size": 480, "subject": "A rice ball (onigiri) monster with seaweed wrap, worried face, stubby arms." },
  "monsters/onigiri_attack":      { "group": "monsters", "size": 480, "subject": "The same rice ball monster body-slamming forward, sticky rice grains flying." },
  "monsters/wood_dummy_idle":     { "group": "monsters", "size": 480, "subject": "A wooden training dummy (log body, wooden arms) standing upright, blank face carved into it." },
  "monsters/wood_dummy_attack":   { "group": "monsters", "size": 480, "subject": "The same wooden training dummy swinging one wooden arm." },
  "monsters/goat_idle":           { "group": "monsters", "size": 480, "subject": "A confused white goat with a bell, standing, chewing grass." },
  "monsters/goat_attack":         { "group": "monsters", "size": 480, "subject": "The same goat charging head-down with its horns." },
  "monsters/vacuum_idle":         { "group": "monsters", "size": 480, "subject": "A round robot vacuum cleaner with angry glowing eyes and a wide intake mouth." },
  "monsters/vacuum_attack":       { "group": "monsters", "size": 480, "subject": "The same robot vacuum roaring forward, dust cloud behind it, intake mouth wide open." },
  "monsters/black_ninja_idle":    { "group": "monsters", "size": 480, "subject": "A black cat ninja with a dark gray headband, yellow eyes, arms crossed, standing." },
  "monsters/black_ninja_attack":  { "group": "monsters", "size": 480, "subject": "The same black cat ninja throwing a shuriken, dynamic pose." },
  "monsters/orange_bandit_idle":  { "group": "monsters", "size": 480, "subject": "An orange tabby cat bandit with a red bandana mask and a wooden club, standing." },
  "monsters/orange_bandit_attack":{ "group": "monsters", "size": 480, "subject": "The same orange cat bandit swinging the wooden club overhead." },
  "monsters/catgrass_bug_idle":   { "group": "monsters", "size": 320, "subject": "A green caterpillar made of cat grass blades, with round eyes." },
  "monsters/catgrass_bug_attack": { "group": "monsters", "size": 320, "subject": "The same cat grass caterpillar spitting a green blob." },
  "monsters/scarecrow_idle":      { "group": "monsters", "size": 640, "subject": "A tall scarecrow guard with a straw hat, stitched face, holding a wooden sword, standing stiff." },
  "monsters/scarecrow_attack":    { "group": "monsters", "size": 640, "subject": "The same scarecrow guard chopping down with the wooden sword." },
  "monsters/big_cucumber_idle":   { "group": "monsters", "size": 640, "subject": "A giant thick cucumber lying down, with a smug face, small crown of leaves." },
  "monsters/big_cucumber_attack": { "group": "monsters", "size": 640, "subject": "The same giant cucumber rolling forward like a log, motion lines." },
  "monsters/ninja_boss_idle":     { "group": "monsters", "size": 640, "subject": "A large muscular black cat ninja leader with a scarred ear, purple headband, standing with arms folded." },
  "monsters/ninja_boss_attack":   { "group": "monsters", "size": 640, "subject": "The same black cat ninja leader throwing a rain of shurikens." },
  "monsters/giant_onigiri_idle":  { "group": "monsters", "size": 640, "subject": "A giant rice ball monster twice as tall as a cat, tired face, seaweed belt." },
  "monsters/giant_onigiri_attack":{ "group": "monsters", "size": 640, "subject": "The same giant rice ball monster jumping to crush downward, shadow beneath." },
  "monsters/black_kitten_idle":   { "group": "monsters", "size": 320, "subject": "A tiny black kitten wearing an oversized ninja headband that covers half its face." },
  "monsters/black_kitten_attack": { "group": "monsters", "size": 320, "subject": "The same tiny black kitten swiping with one paw." },

  "icons/onigiri_full":  { "group": "icons", "size": 128, "subject": "A single rice ball (onigiri) icon with seaweed wrap, glossy." },
  "icons/onigiri_empty": { "group": "icons", "size": 128, "subject": "An empty rice bowl icon, gray and dim, a few rice grains left." },
  "icons/fish":          { "group": "icons", "size": 128, "subject": "A small dried fish (currency) icon, golden brown." },
  "icons/status_claw":   { "group": "icons", "size": 128, "subject": "A red cat claw mark icon (three slashes)." },
  "icons/status_step":   { "group": "icons", "size": 128, "subject": "A blue cat paw print icon with motion lines." },
  "icons/status_belly":  { "group": "icons", "size": 128, "subject": "A cat lying on its back showing its belly, icon style, yellow-orange." },
  "icons/status_lazy":   { "group": "icons", "size": 128, "subject": "A sleepy half-closed cat eye with a 'zzz', icon style, purple." },
  "icons/status_puff":   { "group": "icons", "size": 128, "subject": "A puffed-up frightened cat tail icon, spiky fur, gray." },
  "icons/status_choke":  { "group": "icons", "size": 128, "subject": "A fish bone stuck in a throat icon, green tint." },
  "icons/status_stealth":{ "group": "icons", "size": 128, "subject": "A cat silhouette fading into smoke, icon style, dark blue." },
  "icons/status_stun":   { "group": "icons", "size": 128, "subject": "A coil of rope tied in a knot icon, brown." },
  "icons/status_thorns": { "group": "icons", "size": 128, "subject": "A round bronze mirror reflecting a spark icon." },
  "icons/potion_smoke_bomb":   { "group": "icons", "size": 128, "subject": "A small round smoke bomb with a fuse." },
  "icons/potion_shuriken":     { "group": "icons", "size": 128, "subject": "A four-point steel shuriken." },
  "icons/potion_onigiri":      { "group": "icons", "size": 128, "subject": "A rice ball wrapped in paper with a red ribbon." },
  "icons/potion_catgrass_tea": { "group": "icons", "size": 128, "subject": "A steaming cup of green tea with a cat grass leaf." },
  "icons/potion_firecracker":  { "group": "icons", "size": 128, "subject": "A red firecracker bundle with a lit fuse." },
  "icons/potion_rope":         { "group": "icons", "size": 128, "subject": "A coiled hemp rope." },
  "icons/potion_tuna":         { "group": "icons", "size": 128, "subject": "A whole fresh tuna fish, blue-silver." },
  "icons/potion_whetstone":    { "group": "icons", "size": 128, "subject": "A gray whetstone with claw scratches." },
  "icons/relic_headband":      { "group": "icons", "size": 128, "subject": "A blue ninja headband, folded." },
  "icons/relic_onigiri_bag":   { "group": "icons", "size": 128, "subject": "A cloth drawstring bag with a rice ball peeking out." },
  "icons/relic_tuna_can":      { "group": "icons", "size": 128, "subject": "A tin can of tuna with a fish label." },
  "icons/relic_catgrass":      { "group": "icons", "size": 128, "subject": "A small pot of cat grass." },
  "icons/relic_bell":          { "group": "icons", "size": 128, "subject": "A golden cat collar bell with a red ribbon." },
  "icons/relic_fish_jar":      { "group": "icons", "size": 128, "subject": "A glass jar full of dried fish." },
  "icons/relic_catnip":        { "group": "icons", "size": 128, "subject": "A bundle of catnip leaves tied with string." },
  "icons/relic_tail_bell":     { "group": "icons", "size": 128, "subject": "A tiny silver bell on a cat tail ring." },
  "icons/relic_wood_post":     { "group": "icons", "size": 128, "subject": "A short wooden post with a cat face painted on it." },
  "icons/relic_yarn_ball":     { "group": "icons", "size": 128, "subject": "A red ball of yarn with a loose thread." },
  "icons/relic_cat_teaser":    { "group": "icons", "size": 128, "subject": "A cat teaser wand with feathers." },
  "icons/relic_scroll":        { "group": "icons", "size": 128, "subject": "An old martial arts scroll with a paw seal." },
  "icons/relic_paper_bag":     { "group": "icons", "size": 128, "subject": "A brown paper bag with two eye holes cut out." },
  "icons/relic_bronze_mirror": { "group": "icons", "size": 128, "subject": "An ancient round bronze mirror with a cat engraving." },
  "icons/relic_tower_token":   { "group": "icons", "size": 128, "subject": "A black wooden token with a golden tower emblem." },

  "bg/low":  { "group": "bg", "subject": "Interior of an old stone tower, lower floors: mossy stone walls, torches, a wooden staircase going up, dim warm light, wide shot, no characters, cartoon style with thick outlines." },
  "bg/mid":  { "group": "bg", "subject": "Interior of an old wooden tower, middle floors: wooden beams, paper lanterns, stacked crates, a window with dusk light, wide shot, no characters, cartoon style with thick outlines." },
  "bg/top":  { "group": "bg", "subject": "Rooftop of a tall tower at night: full moon, drifting clouds, tiled roof edge, a meditation mat in the center, wide shot, no characters, cartoon style with thick outlines." }
}
```

- [ ] **Step 3: 寫 `tools/codex_run.py`**

```python
# -*- coding: utf-8 -*-
"""
codex_run.py — 逐張呼叫 codex exec 生圖，輸出綠幕原圖到 tools/codex_raw/<key>.png。
用法：python tools/codex_run.py [--only 前綴] [--limit N]
  已存在的原圖跳過（重跑只補缺的）；每張約 1–2 分鐘，走使用者的 OpenAI 訂閱額度。
  指令模板來自記憶 reference_codex_image_bridge（0.148.0：-s workspace-write ＋ network_access=true）。
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
REF = Path(os.environ["USERPROFILE"]) / "Dropbox" / "08_軟體工具與遊戲" / "LINE貼圖" / "參考圖" / "貓咪參考_九宮格.png"
TEMPLATE = (ROOT / "tools" / "codex_prompts" / "template.md").read_text(encoding="utf-8")
SUBJECTS = json.loads((ROOT / "tools" / "codex_prompts" / "subjects.json").read_text(encoding="utf-8"))


def common_block() -> str:
    start = TEMPLATE.index("Style:")
    end = TEMPLATE.index("## 主題段")
    return TEMPLATE[start:end].strip().replace("<REF>", str(REF))


def build_prompt(key: str, spec: dict, filename: str) -> str:
    if spec["group"] == "bg":
        return (f"{spec['subject']} Same cartoon style as the reference sticker sheet at {REF}. "
                f"Output 1792x1024 PNG. Save the image as {filename} in the current directory and report the path.")
    return f"{common_block()}\nSubject: {spec['subject']}\nSave the image as {filename} in the current directory and report the path."


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    done = 0
    for key, spec in SUBJECTS.items():
        if args.only and not key.startswith(args.only):
            continue
        out = RAW / (key.replace("/", "__") + ".png")
        if out.exists():
            continue
        prompt = build_prompt(key, spec, out.name)
        cmd = ["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write",
               "-c", "sandbox_workspace_write.network_access=true", "--cd", str(RAW), prompt]
        print(f"[生圖] {key} → {out.name}", flush=True)
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0 or not out.exists():
            print(f"[失敗] {key}\n{r.stdout[-800:]}\n{r.stderr[-800:]}", file=sys.stderr)
            continue
        done += 1
        if args.limit and done >= args.limit:
            break
    missing = [k for k in SUBJECTS if not (RAW / (k.replace("/", "__") + ".png")).exists()]
    print(f"本次生成 {done} 張；尚缺 {len(missing)} 張：{missing[:10]}{'…' if len(missing) > 10 else ''}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 寫 `tools/chroma_key.py`**

```python
# -*- coding: utf-8 -*-
"""
chroma_key.py — 把 tools/codex_raw 的綠幕圖去背、去綠邊、縮到規格尺寸，存成 WebP 並更新 manifest.json。
用法：python tools/chroma_key.py [--check]
  背景圖（bg/*）不去背，只縮成 1280x720。
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
OUT = ROOT / "public" / "assets"
MANIFEST = OUT / "manifest.json"
SUBJECTS = json.loads((ROOT / "tools" / "codex_prompts" / "subjects.json").read_text(encoding="utf-8"))


def key_out(im: Image.Image) -> Image.Image:
    """綠幕→透明：以「綠減去紅藍的最大值」當綠度；綠度 ≥60 全透明、≤20 全不透明、中間線性；
    半透明邊緣把綠壓到不超過紅藍最大值（去綠邊）；最後 alpha 收 1 像素。"""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            greenness = g - max(r, b)
            if greenness >= 60:
                px[x, y] = (0, 0, 0, 0)
            elif greenness > 20:
                t = (greenness - 20) / 40.0
                px[x, y] = (r, min(g, max(r, b)), b, int(a * (1 - t)))
            elif greenness > 0:
                px[x, y] = (r, min(g, max(r, b)), b, a)
    alpha = im.getchannel("A").filter(ImageFilter.MinFilter(3))
    im.putalpha(alpha)
    bbox = alpha.getbbox()
    return im.crop(bbox) if bbox else im


def process() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"cards": {}, "sprites": {}, "review": []}
    manifest.setdefault("monsters", {}); manifest.setdefault("icons", {}); manifest.setdefault("bg", {})
    missing = []
    for key, spec in SUBJECTS.items():
        src = RAW / (key.replace("/", "__") + ".png")
        if not src.exists():
            missing.append(key); continue
        group = spec["group"]
        im = Image.open(src)
        if group == "bg":
            name = key.split("/")[1]
            dst = OUT / "bg" / f"{name}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            im.convert("RGB").resize((1280, 720)).save(dst, "WEBP", quality=80, method=6)
            manifest["bg"][f"bg/{name}"] = dst.relative_to(ROOT / "public").as_posix()
            continue
        im = key_out(im)
        size = int(spec["size"])
        if group == "icons":
            im.thumbnail((size, size))
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
            im = canvas
        else:
            im.thumbnail((size * 2, size))
        name = key.split("/", 1)[1]
        dst = OUT / group / f"{name.replace('codex/', '')}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "WEBP", quality=80, method=6)
        rel = dst.relative_to(ROOT / "public").as_posix()
        if group == "monsters":
            base, pose = name.rsplit("_", 1)
            manifest["monsters"].setdefault(f"codex/monster_{base}", {})[pose] = rel
        elif group == "icons":
            manifest["icons"][f"codex/{name}" if name.startswith(("relic_", "potion_")) else f"icon/{name}"] = rel
        else:
            manifest["sprites"]["codex/curl"] = rel
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"missing": missing}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--check", action="store_true"); args = ap.parse_args()
    r = process()
    if args.check and r["missing"]:
        sys.exit(f"尚缺 {len(r['missing'])} 張原圖：{r['missing']}")
    print(f"完成；尚缺原圖 {len(r['missing'])} 張")
```

- [ ] **Step 5: 先生 3 張試水**

Run（PowerShell）: `$env:PYTHONUTF8=1; python tools/codex_run.py --only sprites/codex --limit 1; python tools/codex_run.py --only monsters/cucumber --limit 2`
Expected: `tools/codex_raw/` 出現 3 張 PNG。用 Read 工具看：主體居中、無文字、背景純綠。不合格就改 `subjects.json` 的主題句，刪掉原圖重生。
Run: `$env:PYTHONUTF8=1; python tools/chroma_key.py`，再 Read `public/assets/monsters/cucumber_idle.webp`（可先用 Pillow 轉 PNG 疊在深色底上看邊緣）：不得有綠邊。綠邊殘留就把 `key_out` 的 60／20 兩個門檻各降 10 再跑。

- [ ] **Step 6: 生剩下的（分批，每批約 15 張、約 30 分鐘）**

Run: `$env:PYTHONUTF8=1; python tools/codex_run.py --limit 15`　重複到印出「尚缺 0 張」。每批結束跑一次 `python tools/chroma_key.py` 並 Read 幾張成品。
Run: `$env:PYTHONUTF8=1; python tools/chroma_key.py --check`　Expected: 印出「完成；尚缺原圖 0 張」。
Run: `Get-ChildItem public/assets -Recurse -File | Measure-Object Length -Sum`　Expected: 總和 ≤ 3.5 MB；超過就把魔物尺寸降一級（640→480）重跑。

- [ ] **Step 7: 提交**

```bash
git add tools/codex_prompts tools/codex_run.py tools/chroma_key.py tools/codex_raw public/assets
git commit -m "美術：Codex 生圖批次（魔物、圖示、背景、蜷縮）與色鍵去背"
```

---

### Task B3: 畫面骨架、縮放、素材查表、標題畫面、對白疊層、名詞提示

**Files:**
- Create: `src/ui/dom.ts`, `src/ui/assets.ts`, `src/ui/app.ts`, `src/ui/dialogue.ts`, `src/ui/tooltip.ts`, `src/ui/screens/title.ts`, `src/ui/styles/base.css`
- Modify: `src/main.ts`
- Test: `tests/ui/scale.test.ts`, `tests/ui/assets.test.ts`

**Interfaces:**
- Produces（後面畫面任務都靠這些）：
  ```ts
  // dom.ts
  export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string | ((ev: Event) => void)>, ...children: (Node | string)[]): HTMLElementTagNameMap[K]
  export function clear(node: Element): void
  // assets.ts
  export function loadManifest(): Promise<void>                                     // 讀 BASE_URL + 'assets/manifest.json'
  export function artUrl(group: 'cards' | 'sprites' | 'icons' | 'bg', key: string): string   // 缺圖回傳灰色剪影 data URI
  export function monsterUrl(artKey: string, pose: 'idle' | 'attack'): string
  export function computeScale(w: number, h: number): number                         // min(w/1280, h/720)
  // app.ts
  export type ScreenName = 'title' | 'map' | 'combat' | 'reward' | 'event' | 'shop' | 'rest' | 'chest' | 'result'
  export class App {
    run: RunState | null; cs: CombatState | null; stage: HTMLElement
    show(name: ScreenName, props?: unknown): void          // 各畫面模組向 registerScreen 登記
    newRun(seed?: string): void                            // 建局＋序章對白 → map
    continueRun(): boolean                                 // 讀檔成功 → map
    enterNode(nodeId: string): void                        // 依節點類型切畫面；戰鬥先播初見台詞
    save(): void                                           // 每離開一個節點呼叫
  }
  export function registerScreen(name: ScreenName, render: (app: App, root: HTMLElement, props: unknown) => void): void
  // dialogue.ts
  export function playDialogue(lines: DialogueLine[], onDone: () => void): void     // 全螢幕疊層，點一下下一句
  export function toast(text: string, speaker?: string): void                       // 戰鬥吐槽小氣泡，2 秒
  // tooltip.ts
  export function attachTooltip(node: HTMLElement, term: string): void               // 用 glossary[term]
  export function markupKeywords(text: string): DocumentFragment                     // 把牌面文字裡的名詞包成可提示的 span
  ```
- 畫面規則：`#stage` 固定 1280×720，`transform: scale(computeScale(innerWidth, innerHeight))` 置中；所有畫面畫進 `#stage`。字型 `"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif`，不載入網頁字型。

- [ ] **Step 1: 寫失敗測試**

`tests/ui/scale.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeScale } from '../../src/ui/assets';

describe('縮放', () => {
  it('取寬高比例較小者', () => {
    expect(computeScale(1280, 720)).toBe(1);
    expect(computeScale(2560, 1440)).toBe(2);
    expect(computeScale(1920, 720)).toBe(1);
    expect(computeScale(640, 720)).toBe(0.5);
  });
});
```

`tests/ui/assets.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { _setManifestForTest, artUrl, monsterUrl } from '../../src/ui/assets';

describe('素材查表', () => {
  it('有圖給路徑，缺圖給剪影', () => {
    _setManifestForTest({ cards: { 'ninja/01': 'assets/cards/ninja/01.webp' }, sprites: {}, monsters: { 'codex/monster_rat': { idle: 'assets/monsters/rat_idle.webp' } }, icons: {}, bg: {}, review: [] });
    expect(artUrl('cards', 'ninja/01')).toContain('assets/cards/ninja/01.webp');
    expect(artUrl('cards', 'ninja/99').startsWith('data:image/svg+xml')).toBe(true);
    expect(monsterUrl('codex/monster_rat', 'idle')).toContain('rat_idle');
    expect(monsterUrl('codex/monster_rat', 'attack')).toContain('rat_idle');   // 沒有攻擊圖就退回待機圖
    expect(monsterUrl('codex/monster_none', 'idle').startsWith('data:')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/ui`　Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫 `src/ui/dom.ts`**

```ts
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | ((ev: Event) => void)> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') node.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function clear(node: Element): void { while (node.firstChild) node.removeChild(node.firstChild); }
```

- [ ] **Step 4: 寫 `src/ui/assets.ts`**

```ts
export interface Manifest {
  cards: Record<string, string>; sprites: Record<string, string>;
  monsters: Record<string, { idle?: string; attack?: string }>;
  icons: Record<string, string>; bg: Record<string, string>; review: string[];
}
let manifest: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

const SILHOUETTE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="55" r="35" fill="#555"/><circle cx="30" cy="25" r="12" fill="#555"/><circle cx="70" cy="25" r="12" fill="#555"/></svg>');

export async function loadManifest(): Promise<void> {
  const res = await fetch(`${BASE}assets/manifest.json`);
  if (res.ok) manifest = { ...manifest, ...(await res.json()) };
}
export function _setManifestForTest(m: Manifest): void { manifest = m; }

export function artUrl(group: 'cards' | 'sprites' | 'icons' | 'bg', key: string): string {
  const rel = manifest[group][key];
  return rel ? `${BASE}${rel}` : SILHOUETTE;
}
export function monsterUrl(artKey: string, pose: 'idle' | 'attack'): string {
  const m = manifest.monsters[artKey];
  const rel = m?.[pose] ?? m?.idle;
  return rel ? `${BASE}${rel}` : SILHOUETTE;
}
export function computeScale(w: number, h: number): number { return Math.min(w / 1280, h / 720); }
```

- [ ] **Step 5: 寫 `src/ui/app.ts`**

```ts
import { dialogue } from '../content/dialogue';
import { enemyById, encounterById } from '../content/enemies';
import { nodeById } from '../engine/map';
import { beginCombat, chooseNode, newRun as engineNewRun } from '../engine/run';
import { loadRun, saveRun } from '../engine/save';
import type { CombatState, RunState } from '../engine/types';
import { computeScale } from './assets';
import { playDialogue, toast } from './dialogue';
import { clear, el } from './dom';

export type ScreenName = 'title' | 'map' | 'combat' | 'reward' | 'event' | 'shop' | 'rest' | 'chest' | 'result';
type Renderer = (app: App, root: HTMLElement, props: unknown) => void;
const screens = new Map<ScreenName, Renderer>();
export function registerScreen(name: ScreenName, render: Renderer): void { screens.set(name, render); }

export class App {
  run: RunState | null = null;
  cs: CombatState | null = null;
  stage: HTMLElement;
  seenEnemies = new Set<string>();

  constructor(root: HTMLElement) {
    this.stage = el('div', { id: 'stage' });
    root.append(this.stage);
    const fit = () => { this.stage.style.transform = `scale(${computeScale(window.innerWidth, window.innerHeight)})`; };
    window.addEventListener('resize', fit); fit();
  }

  show(name: ScreenName, props: unknown = {}): void {
    const r = screens.get(name);
    if (!r) throw new Error(`畫面尚未登記：${name}`);
    clear(this.stage);
    this.stage.dataset.screen = name;
    r(this, this.stage, props);
  }

  newRun(seed?: string): void {
    this.run = engineNewRun(seed && seed.trim() ? seed.trim() : `${Date.now()}`);
    this.seenEnemies.clear();
    playDialogue(dialogue.prologue, () => { this.save(); this.show('map'); });
  }

  continueRun(): boolean {
    const run = loadRun();
    if (!run) return false;
    this.run = run;
    this.show('map');
    return true;
  }

  save(): void { if (this.run && this.run.status === 'playing') saveRun(this.run); }

  enterNode(nodeId: string): void {
    const run = this.run; if (!run) return;
    const node = chooseNode(run, nodeId);
    switch (node.type) {
      case '戰鬥': case '大魔物': case '塔主': this.startFight(node.encounterId!, node.type === '塔主'); break;
      case '事件': this.show('event', { eventId: node.eventId }); break;
      case '罐頭鋪': this.show('shop'); break;
      case '貓窩': this.show('rest'); break;
      case '紙箱': this.show('chest'); break;
    }
  }

  startFight(encounterId: string, isBoss = false, bonusFish = 0): void {
    const run = this.run; if (!run) return;
    const go = () => {
      this.cs = beginCombat(run, encounterId);
      const firstNew = (encounterById[encounterId]?.enemies ?? []).find((id) => !this.seenEnemies.has(id));
      this.show('combat', { bonusFish });
      if (firstNew) { this.seenEnemies.add(firstNew); toast(dialogue.firstMeet[firstNew] ?? '', '球球'); }
      else toast(dialogue.battleStart[Math.floor(Math.random() * dialogue.battleStart.length)]!, '球球');
    };
    if (isBoss) playDialogue(dialogue.bossIntro, go); else go();
  }

  nodeTitle(nodeId: string): string {
    const n = nodeById(this.run!.map, nodeId);
    if (n.encounterId) return (encounterById[n.encounterId]?.enemies ?? []).map((id) => enemyById[id]?.name).join('、');
    return n.type;
  }
}
```

- [ ] **Step 6: 寫 `src/ui/dialogue.ts` 與 `src/ui/tooltip.ts`**

`src/ui/dialogue.ts`:
```ts
import type { DialogueLine } from '../content/dialogue';
import { el } from './dom';

export function playDialogue(lines: DialogueLine[], onDone: () => void): void {
  const stage = document.getElementById('stage')!;
  let i = 0;
  const box = el('div', { class: 'dialogue-overlay' });
  const speaker = el('div', { class: 'dialogue-speaker' });
  const text = el('div', { class: 'dialogue-text' });
  const hint = el('div', { class: 'dialogue-hint' }, '點一下繼續');
  box.append(el('div', { class: 'dialogue-box' }, speaker, text, hint));
  const render = () => {
    const l = lines[i]!;
    speaker.textContent = l.speaker === '旁白' ? '' : l.speaker;
    text.textContent = l.text;
    box.classList.toggle('narration', l.speaker === '旁白');
  };
  box.addEventListener('click', () => { i += 1; if (i >= lines.length) { box.remove(); onDone(); } else render(); });
  if (lines.length === 0) { onDone(); return; }
  render();
  stage.append(box);
}

export function toast(text: string, speaker = ''): void {
  if (!text) return;
  const stage = document.getElementById('stage')!;
  const t = el('div', { class: 'toast' }, speaker ? el('b', {}, speaker + '：') : '', text);
  stage.append(t);
  setTimeout(() => t.classList.add('out'), 1800);
  setTimeout(() => t.remove(), 2300);
}
```

`src/ui/tooltip.ts`:
```ts
import { glossary } from '../content/glossary';
import { el } from './dom';

const TERMS = Object.keys(glossary).sort((a, b) => b.length - a.length);
const RE = new RegExp(TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

let tip: HTMLElement | null = null;
function showTip(anchor: HTMLElement, term: string): void {
  hideTip();
  tip = el('div', { class: 'tooltip' }, el('b', {}, term), el('div', {}, glossary[term] ?? ''));
  document.getElementById('stage')!.append(tip);
  const r = anchor.getBoundingClientRect(), s = document.getElementById('stage')!.getBoundingClientRect();
  const scale = s.width / 1280;
  tip.style.left = `${Math.min(1280 - 280, (r.left - s.left) / scale)}px`;
  tip.style.top = `${Math.max(0, (r.top - s.top) / scale - 90)}px`;
}
function hideTip(): void { tip?.remove(); tip = null; }

export function attachTooltip(node: HTMLElement, term: string): void {
  node.classList.add('has-tip');
  node.addEventListener('mouseenter', () => showTip(node, term));
  node.addEventListener('mouseleave', hideTip);
}

export function markupKeywords(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(RE)) {
    frag.append(text.slice(last, m.index));
    const span = el('span', { class: 'kw' }, m[0]);
    attachTooltip(span, m[0]);
    frag.append(span);
    last = (m.index ?? 0) + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}
```

- [ ] **Step 7: 寫 `src/ui/screens/title.ts`、`src/ui/styles/base.css`、改 `src/main.ts`**

`src/ui/screens/title.ts`:
```ts
import { hasSave, loadBest } from '../../engine/save';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { el } from '../dom';

registerScreen('title', (app, root) => {
  const seed = el('input', { class: 'seed', placeholder: '種子（可留空）' });
  const best = loadBest();
  root.append(
    el('div', { class: 'title-screen' },
      el('img', { class: 'title-cat', src: artUrl('sprites', 'ninja/01'), alt: '球球' }),
      el('h1', {}, '球球勇闖魔物塔'),
      el('div', { class: 'title-buttons' },
        el('button', { class: 'btn primary', onclick: () => app.newRun(seed.value) }, '新的一局'),
        el('button', { class: 'btn', ...(hasSave() ? {} : { disabled: 'disabled' }), onclick: () => { if (!app.continueRun()) app.show('title'); } }, '續玩'),
        seed),
      el('div', { class: 'title-best' }, best ? `最佳成績：到達 ${best.floor}F${best.won ? '（通關）' : ''}` : '還沒有成績'),
      el('div', { class: 'title-note' }, '存檔存在這台電腦的瀏覽器裡。')));
});
```
（`hasSave`／`loadBest` 由計畫 A 的 Task 14 提供；`disabled` 屬性只要存在就會生效，所以用展開運算子在有存檔時完全不加這個屬性。）

`src/ui/styles/base.css`（重點段落；完整檔案照此風格補齊）:
```css
:root { --ink: #2b2118; --paper: #f6efe3; --accent: #c9702a; --panel: rgba(255,250,240,.92); }
html, body { margin: 0; height: 100%; background: #1a1410; overflow: hidden; font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; color: var(--ink); }
#app { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
#stage { position: relative; width: 1280px; height: 720px; transform-origin: center center; background: var(--paper); overflow: hidden; }
.btn { font: inherit; font-size: 20px; padding: 10px 22px; border: 2px solid var(--ink); border-radius: 12px; background: #fff; cursor: pointer; }
.btn.primary { background: var(--accent); color: #fff; }
.btn:disabled { opacity: .4; cursor: default; }
.title-screen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
.title-cat { height: 320px; animation: idle-bob 2.4s ease-in-out infinite; }
@keyframes idle-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.dialogue-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; cursor: pointer; z-index: 50; }
.dialogue-box { width: 1000px; margin-bottom: 40px; background: var(--panel); border: 3px solid var(--ink); border-radius: 16px; padding: 18px 26px; font-size: 24px; }
.dialogue-speaker { font-weight: bold; color: var(--accent); margin-bottom: 6px; }
.dialogue-hint { font-size: 14px; opacity: .6; text-align: right; }
.toast { position: absolute; left: 50%; top: 60px; transform: translateX(-50%); background: var(--panel); border: 2px solid var(--ink); border-radius: 14px; padding: 8px 18px; font-size: 20px; z-index: 40; transition: opacity .4s; }
.toast.out { opacity: 0; }
.tooltip { position: absolute; width: 260px; background: #fff; border: 2px solid var(--ink); border-radius: 10px; padding: 8px 10px; font-size: 15px; z-index: 60; pointer-events: none; }
.kw { text-decoration: underline dotted; cursor: help; }
```

`src/main.ts`:
```ts
import './ui/styles/base.css';
import { App } from './ui/app';
import { loadManifest } from './ui/assets';
import './ui/screens/title';

async function boot(): Promise<void> {
  await loadManifest();
  const app = new App(document.getElementById('app')!);
  app.show('title');
}
boot();
```

- [ ] **Step 8: 跑測試、型別檢查、開瀏覽器看**

Run: `npm test -- tests/ui`　Expected: 2 passed。`npx tsc --noEmit` 無錯誤（`map` 等畫面尚未登記時 `enterNode` 會丟錯，屬預期）。
Run: `npm run dev`，用 Chrome 擴充開 `http://localhost:5173/qiuqiu-tower/` 截圖：標題、球球立繪會上下浮、「新的一局」按下去出現序章對白、點四次後因 `map` 未登記而在主控台報「畫面尚未登記：map」（下一任務補）。縮小視窗確認整個舞台等比縮小、不出現捲軸。

- [ ] **Step 9: 提交**

```bash
git add src/ui src/main.ts tests/ui
git commit -m "畫面：骨架、縮放、素材查表、標題、對白疊層與名詞提示"
```

---

### Task B4: 牌面文字、牌元件、牌組檢視、狀態列、地圖畫面

**Files:**
- Create: `src/ui/cardtext.ts`, `src/ui/cardview.ts`, `src/ui/deckview.ts`, `src/ui/hud.ts`, `src/ui/screens/map.ts`, `src/ui/styles/map.css`
- Modify: `src/ui/app.ts`（`enterNode` 在 `chooseNode` 之後加 `this.save();`）、`src/main.ts`（import map 畫面）
- Test: `tests/ui/cardtext.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // cardtext.ts（純函式）
  export function describeCard(def: CardDef, upgraded: boolean): string     // 牌面規則文字，用規格 §6.1 的措辭
  // cardview.ts
  export function cardNode(card: CardInstance | CardDef, opts?: { upgraded?: boolean; onClick?: () => void; small?: boolean; selected?: boolean; disabled?: boolean }): HTMLElement
  // deckview.ts
  export function showDeckPicker(opts: { title: string; cards: CardInstance[]; pickable: boolean; cancellable: boolean; filter?: (c: CardInstance) => boolean; onPick: (uid: number | null) => void }): void
  // hud.ts
  export function renderHud(app: App, root: HTMLElement, opts?: { onPotion?: (potionId: string, index: number) => void }): HTMLElement
  ```
- 地圖版面：樓層 f 的 y＝690 − (f−1)×42；路線 x＝640＋(lane−1)×220（匯合層 x＝640）；節點是 34px 圓形按鈕，標字 戰／魔／？／鋪／窩／箱／主；邊用一層 SVG 畫線；目前節點紅框，可走的節點亮起可點，其餘半透明。

- [ ] **Step 1: 寫失敗測試 `tests/ui/cardtext.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { describeCard } from '../../src/ui/cardtext';

describe('牌面文字', () => {
  const t = (id: string, up = false) => describeCard(cardById[id]!, up);
  it('照規格措辭', () => {
    expect(t('sanjo')).toBe('造成 6 傷。');
    expect(t('sanjo', true)).toBe('造成 9 傷。');
    expect(t('bunshin')).toBe('造成 3 傷，次數＝連抓＋1（上限 5 次）。');
    expect(t('shunshou')).toBe('造成 6 傷；擊倒目標則 +15 小魚乾。');
    expect(t('zhuangsi')).toBe('蜷縮 5，獲得 1 隱身。消耗。');
    expect(t('susu')).toBe('對全體魔物造成 8 傷。');
    expect(t('jiejie')).toBe('每回合開始獲得 3 蜷縮。');
    expect(t('renwuwancheng')).toBe('每擊倒一隻魔物回復 6 生命。');
    expect(t('xianshuile')).toBe('回復 4 生命，然後立刻結束回合。');
    expect(t('zhongji')).toBe('不能打出。');
    expect(t('shishou')).toBe('不能打出。回合結束時若在手牌，受 1 傷。');
    expect(t('taxue')).toBe('獲得 1 隱身。消耗。');
    expect(t('taxue', true)).toBe('獲得 1 隱身。');
    expect(t('fengkou')).toBe('移除目標的爪力、貓步與蜷縮。');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/ui/cardtext.test.ts`　Expected: FAIL。

- [ ] **Step 3: 寫 `src/ui/cardtext.ts`**

```ts
import type { CardDef, Effect } from '../engine/types';

function one(fx: Effect): string {
  switch (fx.kind) {
    case 'damage': {
      const head = fx.target === 'all' ? `對全體魔物造成 ${fx.amount} 傷` : `造成 ${fx.amount} 傷`;
      const times = fx.scaleWithCombo ? `，次數＝連抓＋1（上限 ${fx.comboCap} 次）` : (fx.times ?? 1) > 1 ? ` ${fx.times} 次` : '';
      return head + times + (fx.ignoreBlock ? '，無視蜷縮' : '');
    }
    case 'damageRandom': return `造成 ${fx.min}～${fx.max} 隨機傷害`;
    case 'damageEqualBlock': return '對目標造成等同你目前蜷縮值的傷害（蜷縮不減）';
    case 'selfDamage': return `自己受 ${fx.amount} 傷`;
    case 'block': return `蜷縮 ${fx.amount}`;
    case 'stealBlock': return '奪走目標全部蜷縮變成你的';
    case 'draw': return `抽 ${fx.n} 張`;
    case 'drawIfTargetStatus': return `目標有${fx.name}則抽 ${fx.n} 張`;
    case 'drawNextTurn': return `下回合開始多抽 ${fx.n} 張`;
    case 'status':
      return fx.target === 'self' ? `獲得 ${fx.amount} ${fx.name}` : fx.target === 'all' ? `全體魔物獲得 ${fx.amount} ${fx.name}` : `給目標 ${fx.amount} ${fx.name}`;
    case 'removeStatuses': return `移除目標的${fx.names.join('、')}${fx.removeBlock ? '與蜷縮' : ''}`;
    case 'transferDebuffs': return '把你身上的翻肚、懶洋洋、炸毛、噎到全部移到目標身上';
    case 'energy': return `獲得 ${fx.n} 顆飯糰`;
    case 'heal': return `回復 ${fx.n} 生命`;
    case 'gold': return fx.onKill ? `擊倒目標則 +${fx.n} 小魚乾` : `+${fx.n} 小魚乾`;
    case 'scry': return `看抽牌堆頂 ${fx.n} 張、可丟掉任意張`;
    case 'exhaustFromHand': return `消耗手牌中 ${fx.n} 張牌`;
    case 'retainFromHand': return `選 ${fx.n} 張手牌保留到下回合`;
    case 'discardFromHand': return `棄 ${fx.n} 張`;
    case 'recoverFromDiscard': return '從棄牌堆選 1 張牌回到手上';
    case 'doubleNextAttack': return '本回合下一張攻擊牌傷害加倍';
    case 'endTurn': return '然後立刻結束回合';
    case 'noAttacksThisTurn': return '本回合不能再打攻擊牌';
    case 'immuneThisTurn': return '本回合魔物的攻擊全部打不到你';
    case 'power': {
      const inner = fx.effects.map(one).join('，');
      return fx.trigger === 'turnStart' ? `每回合開始${inner}` : fx.trigger === 'onKill' ? `每擊倒一隻魔物${inner}` : `回合結束時若本回合沒打攻擊牌，${inner}`;
    }
  }
}

export function describeCard(def: CardDef, upgraded: boolean): string {
  const effects = upgraded ? (def.upgrade.effects ?? def.effects) : def.effects;
  const keywords = upgraded ? (def.upgrade.keywords ?? def.keywords ?? []) : (def.keywords ?? []);
  const parts: string[] = [];
  if (keywords.includes('不可打出')) parts.push('不能打出。');
  if (effects.length) {
    const s = effects.map(one);
    // 順手牽羊這類「條件獎勵」用分號接；其餘用逗號
    const text = s.length === 2 && effects[1]?.kind === 'gold' && effects[1].onKill ? s.join('；') : s.join('，');
    parts.push(text + '。');
  }
  if (def.curse?.onTurnEnd) parts.push(`回合結束時若在手牌，受 ${def.curse.onTurnEnd} 傷。`);
  if (def.curse?.onTurnStart) parts.push(`每回合開始若在手牌，受 ${def.curse.onTurnStart} 傷。`);
  if (def.curse?.onDraw) parts.push('抽到時失去 1 顆飯糰。');
  if (keywords.includes('消耗')) parts.push('消耗。');
  if (keywords.includes('保留')) parts.push('保留。');
  return parts.join('');
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- tests/ui/cardtext.test.ts`　Expected: 1 passed（14 個斷言）。不過的先看是文字對照哪一條，只改 `cardtext.ts` 的措辭。

- [ ] **Step 5: 寫 `src/ui/cardview.ts`、`src/ui/deckview.ts`、`src/ui/hud.ts`**

`src/ui/cardview.ts`:
```ts
import { cardById } from '../content/cards';
import { cardStats } from '../engine/deck';
import type { CardDef, CardInstance } from '../engine/types';
import { artUrl } from './assets';
import { describeCard } from './cardtext';
import { el } from './dom';
import { markupKeywords } from './tooltip';

export function cardNode(card: CardInstance | CardDef, opts: { upgraded?: boolean; onClick?: () => void; small?: boolean; selected?: boolean; disabled?: boolean } = {}): HTMLElement {
  const isInst = 'uid' in card;
  const def = isInst ? cardById[card.cardId]! : card;
  const upgraded = isInst ? card.upgraded : (opts.upgraded ?? false);
  const cost = isInst ? cardStats(card).cost : (upgraded ? def.upgrade.cost ?? def.cost : def.cost);
  const node = el('div', { class: `card type-${def.type}${opts.small ? ' small' : ''}${opts.selected ? ' selected' : ''}${opts.disabled ? ' disabled' : ''}` },
    el('div', { class: 'card-cost' }, String(cost)),
    el('img', { class: 'card-art', src: artUrl('cards', def.art), alt: def.name, draggable: 'false' }),
    el('div', { class: 'card-name' }, def.name + (upgraded ? '＋' : '')),
    el('div', { class: 'card-text' }, markupKeywords(describeCard(def, upgraded))),
    el('div', { class: 'card-type' }, def.type));
  if (isInst) node.dataset.uid = String(card.uid);
  if (opts.onClick) node.addEventListener('click', () => { if (!opts.disabled) opts.onClick?.(); });
  return node;
}
```

`src/ui/deckview.ts`:
```ts
import type { CardInstance } from '../engine/types';
import { cardNode } from './cardview';
import { el } from './dom';

export function showDeckPicker(opts: { title: string; cards: CardInstance[]; pickable: boolean; cancellable: boolean; filter?: (c: CardInstance) => boolean; onPick: (uid: number | null) => void }): void {
  const stage = document.getElementById('stage')!;
  const overlay = el('div', { class: 'modal-overlay' });
  const grid = el('div', { class: 'deck-grid' });
  for (const c of opts.cards) {
    const ok = opts.filter ? opts.filter(c) : true;
    grid.append(cardNode(c, { small: true, disabled: opts.pickable && !ok, onClick: opts.pickable && ok ? () => { overlay.remove(); opts.onPick(c.uid); } : undefined }));
  }
  const close = el('button', { class: 'btn', onclick: () => { overlay.remove(); opts.onPick(null); } }, opts.pickable ? '不選' : '關閉');
  if (!opts.cancellable) close.setAttribute('disabled', 'disabled');
  overlay.append(el('div', { class: 'modal' }, el('h2', {}, opts.title), grid, close));
  stage.append(overlay);
}
```

`src/ui/hud.ts`:
```ts
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import type { App } from './app';
import { artUrl } from './assets';
import { showDeckPicker } from './deckview';
import { el } from './dom';
import { attachTooltip } from './tooltip';

export function renderHud(app: App, root: HTMLElement, opts: { onPotion?: (potionId: string, index: number) => void } = {}): HTMLElement {
  const run = app.run!;
  const hp = el('div', { class: 'hud-hp' }, el('div', { class: 'hud-hp-bar', style: `width:${Math.round((run.hp / run.maxHp) * 100)}%` }), el('span', {}, `${run.hp} / ${run.maxHp}`));
  const fish = el('div', { class: 'hud-fish' }, el('img', { src: artUrl('icons', 'icon/fish'), alt: '' }), ` ${run.fish}`);
  attachTooltip(fish, '小魚乾');
  const relics = el('div', { class: 'hud-relics' });
  for (const id of run.relics) {
    const r = relicById[id]!;
    const node = el('div', { class: 'hud-relic' }, el('img', { src: artUrl('icons', r.art), alt: r.name }));
    node.title = `${r.name}：${r.text}`;
    relics.append(node);
  }
  const potions = el('div', { class: 'hud-potions' });
  for (let i = 0; i < 3; i++) {
    const id = run.potions[i];
    const slot = el('div', { class: `hud-potion${id ? '' : ' empty'}` });
    if (id) {
      const p = potionById[id]!;
      slot.append(el('img', { src: artUrl('icons', p.art), alt: p.name }));
      slot.title = `${p.name}：${p.text}`;
      if (opts.onPotion) slot.addEventListener('click', () => opts.onPotion?.(id, i));
    }
    potions.append(slot);
  }
  const deckBtn = el('button', { class: 'btn small', onclick: () => showDeckPicker({ title: `牌組（${run.deck.length} 張）`, cards: run.deck, pickable: false, cancellable: true, onPick: () => {} }) }, `牌組 ${run.deck.length}`);
  const hud = el('div', { class: 'hud' }, el('div', { class: 'hud-floor' }, run.floor > 0 ? `${run.floor}F` : '塔下'), hp, fish, relics, potions, deckBtn, el('div', { class: 'hud-seed' }, `種子 ${run.seed}`));
  root.append(hud);
  return hud;
}
```

- [ ] **Step 6: 寫 `src/ui/screens/map.ts` 與 `src/ui/styles/map.css`，登記到 `main.ts`**

`src/ui/screens/map.ts`:
```ts
import { nextChoices } from '../../engine/map';
import type { MapNode } from '../../engine/types';
import { registerScreen } from '../app';
import { el } from '../dom';
import { renderHud } from '../hud';

const GLYPH: Record<MapNode['type'], string> = { 戰鬥: '戰', 大魔物: '魔', 事件: '？', 罐頭鋪: '鋪', 貓窩: '窩', 紙箱: '箱', 塔主: '主' };
const CONVERGED = new Set([8, 14, 15]);
function pos(n: MapNode): { x: number; y: number } {
  return { x: CONVERGED.has(n.floor) ? 640 : 640 + (n.lane - 1) * 220, y: 690 - (n.floor - 1) * 42 };
}

registerScreen('map', (app, root) => {
  const run = app.run!;
  root.append(el('div', { class: 'map-bg' }));
  renderHud(app, root);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'map-edges'); svg.setAttribute('viewBox', '0 0 1280 720');
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  for (const n of run.map.nodes) for (const id of n.next) {
    const m = byId.get(id)!; const a = pos(n), b = pos(m);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y)); line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y));
    svg.append(line);
  }
  root.append(svg);
  const choices = new Set(nextChoices(run.map, run.currentNode).map((n) => n.id));
  for (const n of run.map.nodes) {
    const { x, y } = pos(n);
    const cls = ['map-node', `t-${n.type}`];
    if (n.id === run.currentNode) cls.push('current');
    if (choices.has(n.id)) cls.push('choice');
    if (n.floor < run.floor) cls.push('past');
    const btn = el('button', { class: cls.join(' '), style: `left:${x - 17}px;top:${y - 17}px`, title: `${n.floor}F ${n.type}${n.encounterId ? '：' + app.nodeTitle(n.id) : ''}` }, GLYPH[n.type]);
    if (choices.has(n.id)) btn.addEventListener('click', () => app.enterNode(n.id));
    root.append(btn);
  }
  root.append(el('div', { class: 'map-hint' }, run.currentNode ? '選下一層要去哪' : '從 1F 選一條路進塔'));
});
```

`src/ui/styles/map.css`:
```css
.map-bg { position: absolute; inset: 0; background: linear-gradient(#2b2420, #4a3a2e 40%, #8a6a48); }
.map-edges { position: absolute; inset: 0; width: 1280px; height: 720px; pointer-events: none; }
.map-edges line { stroke: rgba(255,240,210,.35); stroke-width: 3; stroke-dasharray: 6 6; }
.map-node { position: absolute; width: 34px; height: 34px; border-radius: 50%; border: 3px solid #2b2118; background: #f6efe3; font: inherit; font-size: 16px; font-weight: bold; opacity: .45; cursor: default; }
.map-node.choice { opacity: 1; cursor: pointer; box-shadow: 0 0 0 4px rgba(255,220,120,.9); animation: pulse 1.2s ease-in-out infinite; }
.map-node.current { opacity: 1; border-color: #c9702a; box-shadow: 0 0 0 4px #c9702a; }
.map-node.past { opacity: .25; }
.map-node.t-大魔物, .map-node.t-塔主 { background: #e08a8a; }
.map-node.t-罐頭鋪 { background: #f1d27a; } .map-node.t-貓窩 { background: #bfe3c2; } .map-node.t-紙箱 { background: #d9b98a; } .map-node.t-事件 { background: #c9d6f2; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
.map-hint { position: absolute; right: 24px; bottom: 16px; color: #f6efe3; font-size: 18px; }
.hud { position: absolute; left: 0; top: 0; width: 1280px; height: 56px; display: flex; align-items: center; gap: 16px; padding: 0 16px; box-sizing: border-box; background: rgba(43,33,24,.85); color: #f6efe3; z-index: 10; }
.hud-hp { position: relative; width: 220px; height: 22px; background: #3a2a22; border-radius: 11px; overflow: hidden; text-align: center; font-size: 14px; line-height: 22px; }
.hud-hp-bar { position: absolute; left: 0; top: 0; height: 100%; background: #d9534f; }
.hud-hp span { position: relative; }
.hud-relics, .hud-potions { display: flex; gap: 6px; }
.hud-relic img, .hud-potion img { width: 32px; height: 32px; }
.hud-potion.empty { width: 32px; height: 32px; border: 1px dashed rgba(255,255,255,.4); border-radius: 6px; }
.hud-seed { margin-left: auto; font-size: 12px; opacity: .6; }
.modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 30; }
.modal { width: 1100px; max-height: 640px; overflow: auto; background: var(--panel); border: 3px solid var(--ink); border-radius: 16px; padding: 16px 20px; }
.deck-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin: 10px 0; }
.card { position: relative; width: 170px; height: 250px; border: 3px solid var(--ink); border-radius: 12px; background: #fff; overflow: hidden; display: flex; flex-direction: column; align-items: center; user-select: none; }
.card.small { transform: scale(.85); transform-origin: top left; }
.card.selected { outline: 4px solid #ffd35c; }
.card.disabled { opacity: .45; }
.card-cost { position: absolute; left: 6px; top: 6px; width: 30px; height: 30px; border-radius: 50%; background: #ffe9a8; border: 2px solid var(--ink); text-align: center; line-height: 28px; font-weight: bold; }
.card-art { width: 150px; height: 120px; object-fit: contain; margin-top: 8px; }
.card-name { font-weight: bold; font-size: 15px; margin-top: 2px; }
.card-text { font-size: 12.5px; padding: 2px 8px; text-align: center; line-height: 1.35; flex: 1; }
.card-type { font-size: 11px; opacity: .7; padding-bottom: 4px; }
.card.type-攻擊 { background: #fff4ee; } .card.type-技能 { background: #eef5ff; } .card.type-能力 { background: #f3eeff; }
```

`src/main.ts` 加 `import './ui/screens/map';` 與 `import './ui/styles/map.css';`。`src/ui/app.ts` 的 `enterNode` 在 `const node = chooseNode(run, nodeId);` 後加 `this.save();`。

- [ ] **Step 7: 型別檢查與瀏覽器驗證**

Run: `npx tsc --noEmit`、`npm test`　Expected: 全綠。
Run: `npm run dev`，瀏覽器：新的一局 → 序章四句 → 地圖出現 15 層、三條路、8／14／15 層匯合、1F 三個節點在閃；狀態列顯示 70/70、50 小魚乾、藍頭巾圖示；「牌組 10」按下去看到十張牌（參上／淡定／替身術）、牌面文字有底線可提示。點 1F 節點會因 `combat` 畫面未登記報錯（B5 補）。截圖存 `tools/out/screens/map.png`。

- [ ] **Step 8: 提交**

```bash
git add src/ui src/main.ts tests/ui
git commit -m "畫面：牌面文字與牌元件、牌組檢視、狀態列、地圖"
```

---

### Task B5: 戰鬥畫面

**Files:**
- Create: `src/ui/screens/combat.ts`, `src/ui/styles/combat.css`
- Modify: `src/ui/app.ts`（加 `afterCombat`、`firstEliteDone` 旗標）、`src/main.ts`（import）

**Interfaces:**
- Consumes（計畫 A）：`canPlay`、`playCard`、`endTurn`、`usePotion`、`resolveChoice`、`aliveEnemies`、`cardStats`、`getStatus`、`enemyById`、`dialogue`。
- Produces：
  ```ts
  // app.ts 新增
  afterCombat(bonusFish: number): void   // finishCombat → 輸：defeat 對白 → result；塔主：victory 對白 → result；大魔物第一次：afterFirstElite 對白 → reward；其他 → reward
  ```
- 版面（規格 §8.4）：球球在左（x 180，底 y 520）、魔物在右（最多 5 隻，x 從 620 起每隻 130）、手牌在下方（y 560 起，扇形）、左下飯糰×3 與三個牌堆數、右下「結束回合」；魔物頭上意圖（攻擊：劍圖示＋數字×次數；蜷縮：盾；增益／減益：箭頭；特殊：問號）。
- 操作：點手牌；需要目標的牌進入「選目標」模式，魔物亮起，點魔物出牌，按 Esc 或點空白取消；忍具同樣流程。
- 動畫（全 CSS class，0.4～0.6 秒後移除）：`.attack`（球球往前撲）、`.hit`（抖動＋閃紅）、`.dodge`（半透明側移）、`.pose-<art>`（球球換該牌姿勢 0.6 秒）、`.dead`（倒下淡出）、`.num`（浮動傷害數字）。每次狀態變化整個戰場重畫，再依「前後差異」加動畫 class：魔物 hp 降→hit＋數字；球球 hp 降→hit；`cs.log` 新增含「閃過」→dodge；有魔物 `dead` 變 true→dead。
- 台詞：飯糰歸零時 toast `dialogue.hungry`（每回合最多一次）；生命首次 <30% toast `dialogue.lowHp`；塔主進第二階段時 toast `dialogue.bossPhase2` 兩句（偵測 `enemies[0].phase` 由 0 變 1）；勝利 toast 隨機 `dialogue.battleWin`。

- [ ] **Step 1: 在 `app.ts` 加 `afterCombat`**

```ts
  firstEliteDone = false;
  secretScrollDone = false;

  afterCombat(bonusFish = 0): void {
    const run = this.run!, cs = this.cs!;
    const rewards = finishCombat(run, cs, bonusFish);
    this.cs = null;
    if (!rewards) { this.save(); playDialogue(dialogue.defeat, () => this.show('result')); return; }
    if (rewards.kind === '塔主') { playDialogue(dialogue.victory, () => this.show('result')); return; }
    const go = () => this.show('reward', rewards);
    if (rewards.kind === '大魔物' && !this.firstEliteDone) { this.firstEliteDone = true; playDialogue(dialogue.afterFirstElite, go); }
    else go();
  }
```
（`finishCombat` 從 `../engine/run` import；`result` 畫面在 B6。）

- [ ] **Step 2: 寫 `src/ui/screens/combat.ts`**

```ts
import { cardById } from '../../content/cards';
import { dialogue } from '../../content/dialogue';
import { enemyById } from '../../content/enemies';
import { potionById } from '../../content/potions';
import { aliveEnemies } from '../../engine/actions';
import { canPlay, endTurn, playCard, resolveChoice, usePotion } from '../../engine/combat';
import { cardStats } from '../../engine/deck';
import { getStatus } from '../../engine/statuses';
import type { CombatState, EnemyCombat, StatusName } from '../../engine/types';
import { registerScreen, type App } from '../app';
import { artUrl, monsterUrl } from '../assets';
import { cardNode } from '../cardview';
import { toast } from '../dialogue';
import { clear, el } from '../dom';
import { renderHud } from '../hud';
import { attachTooltip } from '../tooltip';

const STATUS_ICON: Record<StatusName, string> = {
  爪力: 'icon/status_claw', 貓步: 'icon/status_step', 翻肚: 'icon/status_belly', 懶洋洋: 'icon/status_lazy', 炸毛: 'icon/status_puff',
  噎到: 'icon/status_choke', 隱身: 'icon/status_stealth', 定身: 'icon/status_stun', 反彈: 'icon/status_thorns', 潛水: 'icon/status_stealth',
};
const POSE_IDLE = 'ninja/32', POSE_ATTACK = 'ninja/01', POSE_HIT = 'ninja/34', POSE_DODGE = 'ninja/08', POSE_HUNGRY = 'ninja/38', POSE_WIN = 'ninja/04', POSE_LOSE = 'ninja/36';

interface Snap { hp: number; block: number; enemies: Map<number, { hp: number; dead: boolean; phase: number }>; logLen: number }
function snap(cs: CombatState): Snap {
  return { hp: cs.player.hp, block: cs.player.block, enemies: new Map(cs.enemies.map((e) => [e.uid, { hp: e.hp, dead: e.dead, phase: e.phase }])), logLen: cs.log.length };
}

registerScreen('combat', (app, root, props) => {
  const { bonusFish = 0 } = (props as { bonusFish?: number }) ?? {};
  const cs = app.cs!;
  let targeting: { kind: 'card'; uid: number } | { kind: 'potion'; id: string } | null = null;
  let pose = POSE_IDLE;
  let hungryToldTurn = 0, lowHpTold = false, ended = false;
  const bgKey = app.run!.floor <= 5 ? 'bg/low' : app.run!.floor <= 10 ? 'bg/mid' : 'bg/top';

  function statusRow(u: { statuses: Partial<Record<StatusName, number>>; block: number }): HTMLElement {
    const row = el('div', { class: 'status-row' });
    if (u.block > 0) { const b = el('div', { class: 'status block' }, el('span', {}, String(u.block))); attachTooltip(b, '蜷縮'); row.append(b); }
    for (const [name, v] of Object.entries(u.statuses) as [StatusName, number][]) {
      if (!v) continue;
      const s = el('div', { class: 'status' }, el('img', { src: artUrl('icons', STATUS_ICON[name]), alt: name }), el('span', {}, String(v)));
      attachTooltip(s, name); row.append(s);
    }
    return row;
  }

  function intentNode(e: EnemyCombat): HTMLElement {
    const m = e.move;
    const dmg = m.effects.filter((f) => f.kind === 'damage') as { amount: number; times?: number }[];
    const rnd = m.effects.find((f) => f.kind === 'damageRandom') as { min: number; max: number } | undefined;
    let text = m.label;
    if (getStatus(e, '定身') > 0 && m.intent === 'attack') text = '（被定住）';
    else if (dmg.length) text = dmg.map((d) => `${d.amount * (e.charged ? 2 : 1)}${(d.times ?? 1) > 1 ? `×${d.times}` : ''}`).join('＋');
    else if (rnd) text = `${rnd.min * (e.charged ? 2 : 1)}～${rnd.max * (e.charged ? 2 : 1)}`;
    const n = el('div', { class: `intent i-${m.intent}` }, text);
    n.title = m.label;
    return n;
  }

  function render(): void {
    clear(root);
    root.append(el('img', { class: 'battle-bg', src: artUrl('bg', bgKey), alt: '' }));
    renderHud(app, root, { onPotion: (id) => { const d = potionById[id]!; if (d.target === 'enemy') { targeting = { kind: 'potion', id }; render(); } else act(() => usePotion(cs, id)); } });
    const field = el('div', { class: 'field' });
    const cat = el('div', { class: 'unit player', 'data-uid': 'p' },
      el('img', { class: 'sprite', src: artUrl('sprites', pose), alt: '球球' }), el('div', { class: 'hpbar' }, el('div', { style: `width:${(cs.player.hp / cs.player.maxHp) * 100}%` }), el('span', {}, `${cs.player.hp}/${cs.player.maxHp}`)), statusRow(cs.player));
    field.append(cat);
    cs.enemies.forEach((e, i) => {
      const def = enemyById[e.enemyId]!;
      const node = el('div', { class: `unit enemy size-${def.size}${e.dead ? ' gone' : ''}${targeting ? ' targetable' : ''}`, 'data-uid': String(e.uid), style: `left:${620 + i * 130}px` },
        intentNode(e),
        el('img', { class: 'sprite', src: def.art === 'daxia' ? artUrl('sprites', e.phase > 0 ? 'daxia/33' : 'daxia/36') : monsterUrl(def.art, 'idle'), alt: e.name }),
        el('div', { class: 'name' }, e.name),
        el('div', { class: 'hpbar' }, el('div', { style: `width:${(e.hp / e.maxHp) * 100}%` }), el('span', {}, `${e.hp}/${e.maxHp}`)), statusRow(e));
      if (targeting && !e.dead) node.addEventListener('click', () => pickTarget(e.uid));
      field.append(node);
    });
    root.append(field);
    const p = cs.player;
    const energy = el('div', { class: 'energy' });
    for (let i = 0; i < p.maxEnergy; i++) energy.append(el('img', { src: artUrl('icons', i < p.energy ? 'icon/onigiri_full' : 'icon/onigiri_empty'), alt: '' }));
    energy.append(el('span', {}, `${p.energy}/${p.maxEnergy}`)); attachTooltip(energy, '飽足');
    const piles = el('div', { class: 'piles' }, el('span', {}, `抽牌 ${p.drawPile.length}`), el('span', {}, `棄牌 ${p.discardPile.length}`), el('span', {}, `消耗 ${p.exhaustPile.length}`), el('span', {}, `連抓 ${p.cardsPlayedThisTurn}`));
    const hand = el('div', { class: 'hand' });
    p.hand.forEach((c, i) => {
      const def = cardById[c.cardId]!;
      const ok = canPlay(cs, c.uid, def.target === 'enemy' ? aliveEnemies(cs)[0]?.uid : undefined).ok;
      const n = cardNode(c, { disabled: !ok || !!targeting, selected: targeting?.kind === 'card' && targeting.uid === c.uid, onClick: () => onCard(c.uid) });
      const mid = (p.hand.length - 1) / 2;
      n.style.transform = `rotate(${(i - mid) * 4}deg) translateY(${Math.abs(i - mid) * 6}px)`;
      hand.append(n);
    });
    const endBtn = el('button', { class: 'btn primary end-turn', onclick: () => act(() => endTurn(cs)) }, '結束回合');
    root.append(energy, piles, hand, endBtn, el('div', { class: 'log' }, ...cs.log.slice(-4).map((l) => el('div', {}, l))));
    if (targeting) root.append(el('div', { class: 'target-hint', onclick: () => { targeting = null; render(); } }, '點一隻魔物當目標（點這裡取消）'));
    if (cs.pending) showPending();
  }

  function onCard(uid: number): void {
    const c = cs.player.hand.find((x) => x.uid === uid)!;
    const def = cardById[c.cardId]!;
    if (def.target === 'enemy') { targeting = { kind: 'card', uid }; render(); return; }
    act(() => { if (playCard(cs, uid)) pose = def.art.startsWith('ninja/') ? def.art : POSE_ATTACK; });
  }
  function pickTarget(enemyUid: number): void {
    const t = targeting; targeting = null;
    if (!t) return;
    if (t.kind === 'card') act(() => { const def = cardById[cs.player.hand.find((x) => x.uid === t.uid)!.cardId]!; if (playCard(cs, t.uid, enemyUid)) pose = def.art.startsWith('ninja/') ? def.art : POSE_ATTACK; });
    else act(() => usePotion(cs, t.id, enemyUid));
  }

  function showPending(): void {
    const pd = cs.pending!;
    const chosen = new Set<number>();
    const overlay = el('div', { class: 'modal-overlay' });
    const grid = el('div', { class: 'deck-grid' });
    const ok = el('button', { class: 'btn primary' }, '確定');
    const refresh = () => { ok.toggleAttribute('disabled', chosen.size < pd.min || chosen.size > pd.max); };
    const title = { exhaust: '選要消耗的牌', retain: '選要保留的牌', discard: '選要棄掉的牌', recover: '選要拿回手上的牌', scryDiscard: '抽牌堆頂的牌，選要丟掉的' }[pd.purpose];
    for (const c of pd.cards) {
      const n = cardNode(c, { small: true, onClick: () => { if (chosen.has(c.uid)) chosen.delete(c.uid); else if (chosen.size < pd.max) chosen.add(c.uid); n.classList.toggle('selected', chosen.has(c.uid)); refresh(); } });
      grid.append(n);
    }
    ok.addEventListener('click', () => { if (resolveChoice(cs, [...chosen])) { overlay.remove(); afterAction(snap(cs)); } });
    refresh();
    overlay.append(el('div', { class: 'modal' }, el('h2', {}, `${title}（${pd.min}～${pd.max} 張）`), grid, ok));
    root.append(overlay);
  }

  /** 執行一個引擎動作，然後依前後差異放動畫與台詞 */
  function act(fn: () => void): void {
    const before = snap(cs);
    fn();
    afterAction(before);
  }
  function afterAction(before: Snap): void {
    render();
    const p = cs.player;
    for (const e of cs.enemies) {
      const b = before.enemies.get(e.uid);
      const node = root.querySelector<HTMLElement>(`.enemy[data-uid="${e.uid}"]`);
      if (!node) continue;
      if (b && e.hp < b.hp) { node.classList.add('hit'); node.append(el('div', { class: 'num' }, `-${b.hp - e.hp}`)); }
      if (b && !b.dead && e.dead) node.classList.add('dead');
      if (b && b.phase === 0 && e.phase === 1) for (const l of dialogue.bossPhase2) toast(l.text, l.speaker);
    }
    const cat = root.querySelector<HTMLElement>('.unit.player');
    const newLog = cs.log.slice(before.logLen).join('\n');
    if (cat) {
      if (p.hp < before.hp) { cat.classList.add('hit'); cat.append(el('div', { class: 'num' }, `-${before.hp - p.hp}`)); pose = POSE_HIT; }
      else if (newLog.includes('閃過')) { cat.classList.add('dodge'); pose = POSE_DODGE; }
      else if (p.block > before.block) { pose = 'codex/curl'; }                 // 蜷縮：換成 Codex 生的捲球姿勢
      else if (cs.phase === 'player') cat.classList.add('attack');
    }
    if (p.energy === 0 && cs.phase === 'player' && hungryToldTurn !== cs.turn && p.hand.some((c) => cardStats(c).cost > 0)) { hungryToldTurn = cs.turn; toast(dialogue.hungry, '球球'); pose = POSE_HUNGRY; }
    if (!lowHpTold && p.hp < p.maxHp * 0.3 && p.hp > 0) { lowHpTold = true; toast(dialogue.lowHp, '球球'); }
    setTimeout(() => { pose = POSE_IDLE; if (!ended && cs.phase === 'player') render(); }, 600);
    if (cs.phase !== 'player' && !ended) {
      ended = true;
      pose = cs.phase === 'won' ? POSE_WIN : POSE_LOSE;
      render();
      if (cs.phase === 'won') toast(dialogue.battleWin[Math.floor(Math.random() * dialogue.battleWin.length)]!, '球球');
      setTimeout(() => app.afterCombat(bonusFish), 1200);
    }
  }

  render();
});
```

- [ ] **Step 3: 寫 `src/ui/styles/combat.css`**

```css
.battle-bg { position: absolute; inset: 0; width: 1280px; height: 720px; object-fit: cover; filter: brightness(.85); }
.field { position: absolute; left: 0; top: 56px; width: 1280px; height: 480px; }
.unit { position: absolute; bottom: 20px; width: 200px; text-align: center; transition: transform .25s; }
.unit.player { left: 90px; }
.unit .sprite { height: 300px; object-fit: contain; animation: idle-bob 2.4s ease-in-out infinite; }
.unit.enemy .sprite { transform: scaleX(-1); }
.unit.size-small .sprite { height: 160px; } .unit.size-medium .sprite { height: 240px; } .unit.size-large .sprite { height: 320px; }
.unit .name { font-weight: bold; color: #fff; text-shadow: 0 1px 2px #000; }
.hpbar { position: relative; height: 16px; background: #3a2a22; border: 2px solid #2b2118; border-radius: 8px; overflow: hidden; font-size: 12px; color: #fff; }
.hpbar > div { position: absolute; left: 0; top: 0; height: 100%; background: #d9534f; }
.hpbar span { position: relative; line-height: 16px; }
.status-row { display: flex; justify-content: center; gap: 4px; margin-top: 4px; min-height: 26px; }
.status { display: flex; align-items: center; gap: 2px; background: rgba(0,0,0,.55); color: #fff; border-radius: 6px; padding: 1px 5px; font-size: 13px; }
.status img { width: 18px; height: 18px; } .status.block { background: #2e6db4; }
.intent { display: inline-block; margin-bottom: 4px; padding: 2px 10px; border-radius: 10px; background: #fff; border: 2px solid #2b2118; font-weight: bold; }
.intent.i-attack { background: #ffd0d0; } .intent.i-block { background: #cfe2ff; } .intent.i-buff { background: #dff5d8; } .intent.i-debuff { background: #efd6ff; }
.unit.targetable { cursor: pointer; filter: drop-shadow(0 0 10px #ffd35c); }
.unit.gone { opacity: 0; pointer-events: none; }
.unit.attack .sprite { animation: lunge .4s ease-out; }
.unit.enemy.attack .sprite { animation: lunge-left .4s ease-out; }
.unit.hit .sprite { animation: shake .4s; filter: brightness(1.6) sepia(1) saturate(4) hue-rotate(-30deg); }
.unit.dodge .sprite { animation: dodge .5s ease-out; }
.unit.dead .sprite { animation: fall .6s forwards; }
.num { position: absolute; left: 50%; top: 30%; font-size: 34px; font-weight: bold; color: #ffec99; text-shadow: 0 2px 3px #000; animation: float 1s forwards; pointer-events: none; }
@keyframes lunge { 30% { transform: translateX(60px); } 100% { transform: translateX(0); } }
@keyframes lunge-left { 30% { transform: scaleX(-1) translateX(60px); } 100% { transform: scaleX(-1); } }
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }
@keyframes dodge { 40% { opacity: .3; transform: translateX(-50px); } 100% { opacity: 1; transform: none; } }
@keyframes fall { to { transform: rotate(80deg) translateY(60px); opacity: 0; } }
@keyframes float { to { transform: translate(-50%, -60px); opacity: 0; } }
.energy { position: absolute; left: 24px; top: 560px; display: flex; align-items: center; gap: 4px; font-size: 18px; color: #fff; text-shadow: 0 1px 2px #000; }
.energy img { width: 40px; height: 40px; }
.piles { position: absolute; left: 24px; top: 610px; display: flex; flex-direction: column; gap: 2px; font-size: 14px; color: #fff; text-shadow: 0 1px 2px #000; }
.hand { position: absolute; left: 200px; top: 540px; width: 880px; height: 180px; display: flex; justify-content: center; align-items: flex-end; }
.hand .card { margin: 0 -18px; transition: transform .15s; cursor: pointer; }
.hand .card:hover { transform: translateY(-40px) scale(1.08) !important; z-index: 5; }
.end-turn { position: absolute; right: 24px; top: 600px; }
.log { position: absolute; right: 24px; top: 70px; width: 260px; font-size: 12px; color: #fff; text-shadow: 0 1px 2px #000; opacity: .8; }
.target-hint { position: absolute; left: 50%; top: 470px; transform: translateX(-50%); background: #ffd35c; border: 2px solid #2b2118; border-radius: 10px; padding: 6px 14px; cursor: pointer; }
```

`src/main.ts` 加 `import './ui/screens/combat';`、`import './ui/styles/combat.css';`。

- [ ] **Step 4: 型別檢查與瀏覽器實測**

Run: `npx tsc --noEmit`、`npm test`　Expected: 全綠。
Run: `npm run dev`，瀏覽器：新的一局 → 進 1F 戰鬥。逐項確認並截圖到 `tools/out/screens/combat-*.png`：初見台詞氣泡；手牌扇形、飯糰三顆；點「參上」→魔物亮起→點魔物→球球撲一下、魔物抖動、浮出 −6、飯糰少一顆；出牌到飯糰歸零 → 「餓扁了……沒力氣喵……」；「結束回合」→ 魔物意圖執行、球球抖動或閃避；打到勝利 → 勝利台詞 → 進獎勵畫面（B6 未做時會報「畫面尚未登記：reward」，屬預期）。用 `duxin`（讀心術）測待選視窗：可勾選、確定鍵在數量不合時反灰。

- [ ] **Step 5: 提交**

```bash
git add src/ui src/main.ts
git commit -m "畫面：戰鬥（出牌、選目標、意圖、待選、動畫與台詞）"
```

---

### Task B6: 獎勵、事件、罐頭鋪、貓窩、紙箱、結算畫面

**Files:**
- Create: `src/ui/screens/reward.ts`, `event.ts`, `shop.ts`, `rest.ts`, `chest.ts`, `result.ts`, `src/ui/styles/screens.css`
- Modify: `src/ui/app.ts`（加 `backToMap()`）、`src/main.ts`（import 六個畫面與 css）

**Interfaces:**
- Consumes（計畫 A）：`takeCardReward`、`applyRunEffects`、`removeCard`、`upgradeCard`、`addCard`、`makeShop`、`buyCard`、`buyRelic`、`buyPotion`、`buyRemove`、`rest`、`openChest`、`recordBest`、`clearSave`、`eventById`、`relicById`、`potionById`、`dialogue`。
- Produces：`App.backToMap(): void`（`save()` 後 `show('map')`）。
- 規則：事件選項的 `costFish` 由畫面在套用結果前扣除（與機器人一致）；選項付不起就反灰。`needs: 'removeCard'|'upgradeCard'` 用 `showDeckPicker`（不可取消；沒有候選就略過）。

- [ ] **Step 1: `app.ts` 加 `backToMap`**

```ts
  backToMap(): void { this.save(); this.show('map'); }
```

- [ ] **Step 2: 寫六個畫面**

`src/ui/screens/reward.ts`:
```ts
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import type { CombatRewards } from '../../engine/rewards';
import { takeCardReward } from '../../engine/run';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { cardNode } from '../cardview';
import { el } from '../dom';

registerScreen('reward', (app, root, props) => {
  const r = props as CombatRewards;
  const run = app.run!;
  const items = el('div', { class: 'reward-items' }, el('div', { class: 'reward-item' }, `＋${r.fish} 小魚乾`));
  if (r.relic) { const d = relicById[r.relic]!; items.append(el('div', { class: 'reward-item' }, el('img', { src: artUrl('icons', d.art), alt: '' }), `秘寶「${d.name}」：${d.text}`)); }
  if (r.potion) { const d = potionById[r.potion]!; items.append(el('div', { class: 'reward-item' }, el('img', { src: artUrl('icons', d.art), alt: '' }), `忍具「${d.name}」`)); }
  const cards = el('div', { class: 'reward-cards' });
  const done = (id: string | null) => { takeCardReward(run, r, id); app.backToMap(); };
  for (const c of r.cards) cards.append(cardNode(c, { onClick: () => done(c.id) }));
  root.append(el('div', { class: 'screen reward' },
    el('h1', {}, r.kind === '大魔物' ? '打倒大魔物' : '打贏了'), items,
    r.cards.length ? el('h2', {}, '選一張牌帶走') : '', cards,
    el('button', { class: 'btn', onclick: () => done(null) }, r.cards.length ? '不拿牌，繼續' : '繼續')));
});
```

`src/ui/screens/event.ts`:
```ts
import { cardById } from '../../content/cards';
import { dialogue } from '../../content/dialogue';
import { FIXED_EVENT_FLOOR_5, eventById } from '../../content/events';
import { addCard, applyRunEffects, removeCard, upgradeCard, type RunEffectOutcome } from '../../engine/run';
import { registerScreen, type App } from '../app';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { playDialogue } from '../dialogue';
import { clear, el } from '../dom';
import { renderHud } from '../hud';

function settle(app: App, root: HTMLElement, outcome: RunEffectOutcome, resultText: string): void {
  const run = app.run!;
  const finish = () => { clear(root); renderHud(app, root); root.append(el('div', { class: 'screen event' }, el('p', { class: 'event-result' }, resultText), el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續'))); };
  if (!outcome) { finish(); return; }
  if ('needs' in outcome) {
    const filter = outcome.needs === 'upgradeCard' ? (c: { upgraded: boolean; cardId: string }) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病' : () => true;
    if (!run.deck.some(filter)) { finish(); return; }
    showDeckPicker({ title: outcome.needs === 'removeCard' ? '選一張牌移除' : '選一張牌升級', cards: run.deck, pickable: true, cancellable: false, filter,
      onPick: (uid) => { if (uid !== null) (outcome.needs === 'removeCard' ? removeCard : upgradeCard)(run, uid); finish(); } });
    return;
  }
  if ('chooseCard' in outcome) {
    clear(root); renderHud(app, root);
    const grid = el('div', { class: 'reward-cards' });
    for (const c of outcome.chooseCard) grid.append(cardNode(c, { onClick: () => { addCard(run, c.id); finish(); } }));
    root.append(el('div', { class: 'screen event' }, el('p', { class: 'event-result' }, resultText), el('h2', {}, '選一招'), grid, el('button', { class: 'btn', onclick: finish }, '都不要')));
    return;
  }
  app.startFight(outcome.fight.encounterId, false, outcome.fight.bonusFish);
}

registerScreen('event', (app, root, props) => {
  const { eventId } = props as { eventId: string };
  const ev = eventById[eventId]!;
  const run = app.run!;
  if (eventId === FIXED_EVENT_FLOOR_5 && !app.secretScrollDone) {   // 5F 大俠傳功：先播撿到秘笈的對白（App 加一個 secretScrollDone 旗標）
    app.secretScrollDone = true;
    playDialogue(dialogue.secretScroll, () => app.show('event', props));
    return;
  }
  renderHud(app, root);
  const choices = el('div', { class: 'event-choices' });
  for (const c of ev.choices) {
    const btn = el('button', { class: 'btn' }, c.label + (c.costFish ? `（${c.costFish} 小魚乾）` : ''));
    if ((c.costFish ?? 0) > run.fish) btn.setAttribute('disabled', 'disabled');
    btn.addEventListener('click', () => { if (c.costFish) run.fish -= c.costFish; settle(app, root, applyRunEffects(run, c.outcome), c.result); });
    choices.append(btn);
  }
  root.append(el('div', { class: 'screen event' }, el('h1', {}, ev.title), el('p', { class: 'event-text' }, ev.text), choices));
});
```

`src/ui/screens/shop.ts`:
```ts
import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { buyCard, buyPotion, buyRelic, buyRemove, makeShop } from '../../engine/run';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { clear, el } from '../dom';
import { renderHud } from '../hud';

registerScreen('shop', (app, root) => {
  const run = app.run!;
  const shop = makeShop(run);
  const line = dialogue.shopkeeper[Math.floor(Math.random() * dialogue.shopkeeper.length)]!;
  function render(): void {
    clear(root); renderHud(app, root);
    const cards = el('div', { class: 'shop-row' });
    shop.cards.forEach((it, i) => cards.append(el('div', { class: `shop-item${it.sold ? ' sold' : ''}` }, cardNode(it.def, { small: true, onClick: () => { if (buyCard(run, shop, i)) render(); } }), el('div', { class: 'price' }, it.sold ? '售出' : `${it.price} 小魚乾`))));
    const relics = el('div', { class: 'shop-row' });
    shop.relics.forEach((it, i) => { const d = relicById[it.id]!; relics.append(el('div', { class: `shop-item${it.sold ? ' sold' : ''}`, onclick: () => { if (buyRelic(run, shop, i)) render(); } }, el('img', { src: artUrl('icons', d.art), alt: '' }), el('div', {}, d.name), el('div', { class: 'small' }, d.text), el('div', { class: 'price' }, it.sold ? '售出' : `${it.price} 小魚乾`))); });
    const potions = el('div', { class: 'shop-row' });
    shop.potions.forEach((it, i) => { const d = potionById[it.id]!; potions.append(el('div', { class: `shop-item${it.sold ? ' sold' : ''}`, onclick: () => { if (buyPotion(run, shop, i)) render(); } }, el('img', { src: artUrl('icons', d.art), alt: '' }), el('div', {}, d.name), el('div', { class: 'small' }, d.text), el('div', { class: 'price' }, it.sold ? '售出' : `${it.price} 小魚乾`))); });
    const remove = el('button', { class: 'btn', onclick: () => showDeckPicker({ title: `放生一張牌（${run.removeCost} 小魚乾）`, cards: run.deck, pickable: true, cancellable: true, onPick: (uid) => { if (uid !== null) buyRemove(run, uid); render(); } }) }, `放生一張牌：${run.removeCost} 小魚乾`);
    if (run.fish < run.removeCost) remove.setAttribute('disabled', 'disabled');
    root.append(el('div', { class: 'screen shop' }, el('h1', {}, '罐頭鋪'), el('p', { class: 'shopkeeper' }, `橘貓老闆：「${line}」`), cards, relics, potions, el('div', { class: 'shop-actions' }, remove, el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '離開'))));
  }
  render();
});
```

`src/ui/screens/rest.ts`:
```ts
import { cardById } from '../../content/cards';
import { dialogue } from '../../content/dialogue';
import { relicById } from '../../content/relics';
import { rest } from '../../engine/run';
import { registerScreen } from '../app';
import { showDeckPicker } from '../deckview';
import { playDialogue, toast } from '../dialogue';
import { el } from '../dom';
import { renderHud } from '../hud';

registerScreen('rest', (app, root) => {
  const run = app.run!;
  const mult = run.relics.reduce((m, id) => m * (relicById[id]?.hooks.restMultiplier ?? 1), 1);
  const heal = Math.min(run.maxHp - run.hp, Math.floor(run.maxHp * 0.3 * mult));
  const up = run.deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病');
  const show = () => {
    renderHud(app, root);
    const sleep = el('button', { class: 'btn primary', onclick: () => { rest(run, '打盹'); toast(dialogue.restLines[0]!, '球球'); setTimeout(() => app.backToMap(), 900); } }, `打盹（回復 ${heal} 生命）`);
    const sharpen = el('button', { class: 'btn', onclick: () => showDeckPicker({ title: '磨爪：選一張牌升級', cards: run.deck, pickable: true, cancellable: true, filter: (c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病', onPick: (uid) => { if (uid !== null) { rest(run, '磨爪', uid); toast(dialogue.restLines[1]!, '球球'); setTimeout(() => app.backToMap(), 900); } } }) }, '磨爪（升級一張牌）');
    if (up.length === 0) sharpen.setAttribute('disabled', 'disabled');
    root.append(el('div', { class: 'screen rest' }, el('h1', {}, '貓窩'), el('p', {}, '暖暖的，只能選一件事做。'), el('div', { class: 'rest-actions' }, sleep, sharpen)));
  };
  if (run.floor === 14) playDialogue(dialogue.restBeforeBoss, show); else show();
});
```

`src/ui/screens/chest.ts`:
```ts
import { dialogue } from '../../content/dialogue';
import { relicById } from '../../content/relics';
import { openChest } from '../../engine/run';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { toast } from '../dialogue';
import { el } from '../dom';
import { renderHud } from '../hud';

registerScreen('chest', (app, root) => {
  const run = app.run!;
  renderHud(app, root);
  toast(dialogue.chestLine, '球球');
  const id = openChest(run);
  const body = id ? el('div', { class: 'reward-item' }, el('img', { src: artUrl('icons', relicById[id]!.art), alt: '' }), `找到秘寶「${relicById[id]!.name}」：${relicById[id]!.text}`) : el('p', {}, '箱子裡只有一堆碎紙，常見的秘寶都拿過了。');
  root.append(el('div', { class: 'screen chest' }, el('h1', {}, '紙箱'), body, el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續')));
});
```

`src/ui/screens/result.ts`:
```ts
import { dialogue } from '../../content/dialogue';
import { relicById } from '../../content/relics';
import { clearSave, recordBest } from '../../engine/save';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { showDeckPicker } from '../deckview';
import { el } from '../dom';

registerScreen('result', (app, root) => {
  const run = app.run!;
  const won = run.status === 'won';
  const best = recordBest(run);
  clearSave();
  const relics = el('div', { class: 'result-relics' }, ...run.relics.map((id) => el('img', { src: artUrl('icons', relicById[id]!.art), alt: relicById[id]!.name, title: relicById[id]!.name })));
  root.append(el('div', { class: `screen result ${won ? 'won' : 'lost'}` },
    el('img', { class: 'result-cat', src: artUrl('sprites', won ? 'ninja/04' : 'ninja/36'), alt: '' }),
    el('h1', {}, won ? '通關' : '任務失敗'),
    el('div', { class: 'result-stats' }, `到達 ${run.floor}F　擊倒 ${run.stats.kills} 隻　${run.stats.turns} 回合　牌組 ${run.deck.length} 張　種子 ${run.seed}`),
    relics,
    el('button', { class: 'btn', onclick: () => showDeckPicker({ title: '最終牌組', cards: run.deck, pickable: false, cancellable: true, onPick: () => {} }) }, '看牌組'),
    el('div', { class: 'result-best' }, `最佳成績：${best.floor}F${best.won ? '（通關）' : ''}`),
    won ? el('p', { class: 'teaser' }, `球球：「${dialogue.victoryTeaser}」`) : '',
    el('button', { class: 'btn primary', onclick: () => { app.run = null; app.show('title'); } }, '回到村子')));
});
```

- [ ] **Step 3: 寫 `src/ui/styles/screens.css`**

```css
.screen { position: absolute; left: 0; top: 56px; width: 1280px; height: 664px; box-sizing: border-box; padding: 24px 60px; display: flex; flex-direction: column; align-items: center; gap: 14px; overflow: auto; }
.screen h1 { margin: 0; font-size: 36px; }
.reward-items, .result-relics { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; }
.reward-item { display: flex; align-items: center; gap: 8px; background: var(--panel); border: 2px solid var(--ink); border-radius: 12px; padding: 8px 14px; font-size: 18px; }
.reward-item img, .result-relics img { width: 40px; height: 40px; }
.reward-cards { display: flex; gap: 20px; }
.reward-cards .card { cursor: pointer; transition: transform .15s; } .reward-cards .card:hover { transform: translateY(-10px); }
.event-text, .event-result { max-width: 900px; font-size: 22px; line-height: 1.6; background: var(--panel); border: 2px solid var(--ink); border-radius: 14px; padding: 16px 22px; }
.event-choices, .rest-actions, .shop-actions { display: flex; flex-direction: column; gap: 10px; align-items: stretch; width: 520px; }
.shop-row { display: flex; gap: 14px; justify-content: center; }
.shop-item { display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--panel); border: 2px solid var(--ink); border-radius: 12px; padding: 8px; width: 170px; cursor: pointer; font-size: 14px; }
.shop-item img { width: 56px; height: 56px; } .shop-item .small { font-size: 12px; opacity: .8; text-align: center; } .shop-item .price { font-weight: bold; color: var(--accent); }
.shop-item.sold { opacity: .4; pointer-events: none; }
.shopkeeper { font-size: 18px; opacity: .85; }
.result-cat { height: 220px; } .result.lost { background: #2b2118; color: #f6efe3; }
.result-stats { font-size: 20px; } .teaser { font-size: 20px; opacity: .85; }
```

`src/main.ts` 加六個畫面的 import 與 `import './ui/styles/screens.css';`。

- [ ] **Step 4: 型別檢查、瀏覽器打完一整局**

Run: `npx tsc --noEmit`、`npm test`　Expected: 全綠。
Run: `npm run dev`，用瀏覽器從標題打到結算（輸或贏都可以，至少經過：獎勵選牌、一個事件、罐頭鋪買牌與放生、貓窩磨爪、8F 紙箱、7F 大魔物後的頭目台詞、14F 貓窩前的獨白）。每個畫面截圖到 `tools/out/screens/`。中途關掉分頁再開：標題「續玩」可用且回到同一節點。結算後「續玩」反灰、最佳成績更新。

- [ ] **Step 5: 提交**

```bash
git add src/ui src/main.ts
git commit -m "畫面：獎勵、事件、罐頭鋪、貓窩、紙箱、結算"
```

---

### Task B7: 大小檢查、部署到 GitHub Pages、說明檔

**Files:**
- Create: `tools/check_size.py`, `.github/workflows/deploy.yml`, `README.md`
- Modify: `package.json`（加 `"size": "python tools/check_size.py"`）

- [ ] **Step 1: 寫 `tools/check_size.py`**

```python
# -*- coding: utf-8 -*-
"""check_size.py — 檢查 dist/ 是否符合規格 §8.5 的大小預算。先跑 npm run build。"""
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parents[1] / "dist"
LIMITS = {"js": 150_000, "css": 30_000, "img": 3_500_000, "total": 4_000_000}

def main() -> None:
    if not DIST.exists():
        sys.exit("沒有 dist/，先跑 npm run build")
    sizes = {"js": 0, "css": 0, "img": 0, "total": 0}
    for p in DIST.rglob("*"):
        if not p.is_file():
            continue
        n = p.stat().st_size
        sizes["total"] += n
        if p.suffix == ".js": sizes["js"] += n
        elif p.suffix == ".css": sizes["css"] += n
        elif p.suffix in (".webp", ".png", ".jpg", ".svg"): sizes["img"] += n
    bad = [f"{k}：{v/1000:.0f} KB > {LIMITS[k]/1000:.0f} KB" for k, v in sizes.items() if v > LIMITS[k]]
    for k, v in sizes.items():
        print(f"{k}: {v/1000:.0f} KB（上限 {LIMITS[k]/1000:.0f} KB）")
    if bad:
        sys.exit("超過預算：" + "；".join(bad))
    print("大小 OK")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 建置並檢查**

Run: `npm run build; $env:PYTHONUTF8=1; python tools/check_size.py`　Expected: 印出四行大小與「大小 OK」。超過就先看是哪一類：圖片超過→降 WebP 品質到 70 或魔物尺寸降一級；程式超過→查是否把 `content` 資料重複打包。
Run: `npm run preview`，瀏覽器開 `http://localhost:4173/qiuqiu-tower/` 確認打包版能開、圖片都載得到（網址帶 `/qiuqiu-tower/` 前綴，這就是 GitHub Pages 的路徑）。

- [ ] **Step 3: 寫 `.github/workflows/deploy.yml`**

```yaml
name: 部署到 GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: 寫 `README.md`**

```md
# 球球勇闖魔物塔

灰貓忍者「球球」爬魔物塔的牌組構築肉鴿遊戲，純網頁、免安裝。線上玩：https://yayax.github.io/qiuqiu-tower/

## 怎麼玩
- 每回合三顆飯糰，出牌吃飯糰；魔物頭上有意圖，看著出牌。
- 15 層，最頂是塔主。打贏拿牌、小魚乾、秘寶；罐頭鋪買東西、貓窩打盹或磨爪。
- 存檔在瀏覽器裡，關掉可以續玩；戰鬥中途關掉會從那場重打。

## 開發
- `npm install`、`npm run dev`（開發預覽）、`npm test`（全部測試）、`npm run balance`（機器人 500 局平衡報告）、`npm run build`（打包到 dist/）、`python tools/check_size.py`（大小預算）。
- 規格：`docs/superpowers/specs/2026-08-29-qiuqiu-tower-design.md`；計畫：`docs/superpowers/plans/`。
- 內容都在 `src/content/`（牌、秘寶、忍具、魔物、事件、對白），改數值不用動程式。

## 素材
- 貼圖來源在 Dropbox（只讀）；`python tools/build_assets.py` 產牌面與立繪。
- 魔物、圖示、背景用 Codex 生：`python tools/codex_run.py` 後 `python tools/chroma_key.py`。提示詞在 `tools/codex_prompts/`。

## 部署
推到 `main` 就會由 GitHub Actions 建置並發布到 GitHub Pages（倉庫設定 → Pages → Source 選 GitHub Actions）。
```

- [ ] **Step 5: 推上 GitHub（需要使用者）**

這台機器沒有 `gh`。二選一：
1. `winget install GitHub.cli` → `gh auth login` → `gh repo create qiuqiu-tower --public --source . --push`
2. 使用者在 GitHub 網頁建空倉庫 `qiuqiu-tower`，然後：`git remote add origin https://github.com/yayax/qiuqiu-tower.git; git push -u origin main`

推送後：倉庫 Settings → Pages → Build and deployment → Source 選「GitHub Actions」；Actions 分頁看工作流跑完；開 `https://yayax.github.io/qiuqiu-tower/`。使用者帳號名若不是 `yayax`，把 README 與 `vite.config.ts` 的 `base` 都改成實際倉庫名。

- [ ] **Step 6: 提交**

```bash
git add tools/check_size.py .github/workflows/deploy.yml README.md package.json
git commit -m "建置：大小檢查、GitHub Pages 部署流程與說明"
```

---

## 計畫 B 完成判準（規格 §10）

- `npm test` 全綠、`npx tsc --noEmit` 無錯誤、`python tools/check_size.py` 印「大小 OK」。
- 素材：80 牌面、80 立繪、Codex 約 73 張全部到位（`python tools/chroma_key.py --check` 尚缺 0 張），抽查過邊緣。
- 瀏覽器實際打完一整局並截圖九個畫面；續玩、最佳成績、種子重現都試過。
- 線上網址能開、能玩（使用者做完 B7 步驟 5 後）。
- 在 `Dropbox\claude-config\SHARED_WORKLOG.md` 補一筆，並在記憶池新增 `project_qiuqiu_tower.md`（位置、指令、素材產線、部署方式、未做清單）。
- 最終真人驗收是使用者：畫面順不順手、台詞有沒有貓味、平衡要不要調。
