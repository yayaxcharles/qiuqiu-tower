# -*- coding: utf-8 -*-
"""把存得比顯示尺寸大太多的圖就地縮小重壓。

**為什麼需要這支**：`build_art_inbox.py` 只重建「原圖在 `tools/art_inbox` 裡」的素材。
最早那批魔物立繪是更早的管線做的、原圖不在那裡，所以打包腳本再怎麼改都碰不到它們，
一直維持 793x640 這種尺寸——畫面上最大只顯示 230x280。

這支直接讀已經去背好的 webp、縮到「兩倍顯示尺寸」再存回去。
會有二次壓縮的損失，但這些圖在畫面上只有兩三百像素，看不出來。

跑法：python tools/shrink_oversized.py [--dry]
"""
import io
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

# sprites：球球（框 270x300）與師父（320x320，第三階段的框到 350x350）。
# 2026-09-10 從 640 收到 **560**，跟魔物、牌面同一個標準看齊——560 對球球是 1.9 倍、
# 對師父最大的框是 1.6 倍，都還在「1080p 全螢幕縮放 1.5 倍」之上。
# 補了球球五張狀態立繪之後圖片欄剛好破 9 MB，這一刀省 0.27 MB 把它壓回去。
# **注意這一組會被重壓成 q74，而 `add_sprite.py` 存 sprites 用的是 q82**，所以對這 52 張
# 而言畫質參數是有動到的（只有魔物與牌面才是「純粹少送像素」）。實務上同時尺寸也降了，看不出來。
#
# cards：牌面插圖那個框是 150x104（`components.css` 的 `.card-art`，小張版本更小），
# 圖卻存成 299x240。上限取框的 1.75 倍＝262x182，跟魔物同一套道理。
CAPS = {
    "sprites": (560, 560),
    "cards": (262, 182),
}

# 意圖木牌那七張是拿來當 `border-image` 的九宮格（`combat.css` 的 `.intent[class*='i-']`），
# 只有邊框那一圈會被畫出來，而且畫出來只有 `border-image-width: 12px 9px 11px 9px`。
# 圖卻存成 1000x300，等於 22% 的左右邊＝220 像素被塞進 9 個 CSS 像素裡，肥了幾十倍。
# **縮它是安全的**：`border-image-slice` 用的是百分比（34% 22% 30% 22% fill），
# 會跟著來源尺寸一起縮；`border-image-width` 是 CSS 像素，本來就跟來源無關。
# 縮到 320 寬之後，邊框仍有約 70 個來源像素對 9 個 CSS 像素（2 倍螢幕也還有 3.9 倍餘裕）。
ICON_CAPS = {"ui_intent_": (320, 320)}

# 魔物**照體型分別設上限**（2026-09-10）。本來不分體型一律 460x560，
# 但小型魔物在畫面上只有 130x150（`.unit.size-small .sprite`），存 460 寬等於每一張都多背了
# 三倍半的像素，306 張加起來好幾 MB。
#
# 倍率取 **1.75 倍**（不是原本的 2 倍）：畫面 1280x720 等比放大，1080p 全螢幕的倍率剛好是 1.5，
# 1.75 還多留一點；1440p 是 2.0，會有一點點軟。實際把最細的三隻（狐仙、三味線貓、怨靈武者）
# 拉到 1440p 的像素數比對過，只有狐仙的尾巴細毛與法杖吊飾看得出略軟，其餘兩隻分不出來，
# 換到的是魔物那 306 張從 8.67 MB 降到約 5.9 MB。**省下來的全部是「不再送沒人看得到的像素」，
# 不是壓得比較爛**：`add_sprite.py` 存魔物用 q72，這裡重壓是 q74，畫質參數不降反升一格
#（多的只是二次壓縮那一點點損失，而尺寸同時砍掉一半以上，看不出來）。
# 框的尺寸在 `combat.ts` 的 SPRITE_BOX 與 `combat.css` 的三條 `.unit.size-*`，改要一起改。
MON_CAPS = {
    "small": (230, 265),     # 框 130x150
    "medium": (315, 370),    # 框 180x210
    "large": (405, 490),     # 框 230x280
}
# 個別放寬的框（跟 combat.ts 的 SPRITE_SIZE_OVERRIDE 一致）。
# **鍵是「檔名前綴」＝美術鍵去掉 `codex/monster_`，不是魔物 id**，兩者不一定同名：
# 鏡中球球的 id 是 `mirror_qiuqiu`，但牠跟影球球共用 `codex/monster_shadow_cat` 這組圖，
# 檔案叫 `shadow_cat_*.webp`。寫 id 就永遠對不到任何檔案、變成死碼，那批圖會掉進 medium
# 被縮到 315 寬，可是牠的框是 290x262，只剩 1.2 倍、比旁邊 2.1 倍的球球本人明顯糊
#（稽核 2026-09-10 高-2）。下面的 check_overrides() 就是防這件事再發生。
MON_CAP_OVERRIDE = {
    "armadillo_pup": (265, 265),    # 框 150x150
    # 影球球（大魔物，medium 框）與鏡中球球（290x262）共用這組圖，取大的那個框算
    "shadow_cat": (510, 460),
}
QUALITY = 74

_SIZES: dict[str, str] | None = None


def mon_cap(path: Path) -> tuple[int, int]:
    """這隻魔物的上限：檔名是 `<id>_<姿勢>.webp`，體型從 enemies.ts 的 size 讀"""
    global _SIZES
    if _SIZES is None:
        src = (ROOT / "src" / "content" / "enemies.ts").read_text(encoding="utf-8")
        _SIZES = {}
        for size, art in re.findall(r"size: '(small|medium|large)'[^\n]*?art: 'codex/monster_([a-z0-9_]+)'", src):
            _SIZES[art] = size
    # 姿勢名要跟 `add_sprite.py` 那份保持同步（2026-09-11 補 `down`）：
    # 剝不掉姿勢後綴，`mid` 就對不到 enemies.ts 的體型，整批默默掉進「照 large 算」的退路，
    # 小型魔物的倒地圖會用 405x490 的上限（該用 230x265），白白多背三倍半的像素
    mid = re.sub(r"_(idle|attack|hurt|block|down)$", "", path.stem)
    if mid in MON_CAP_OVERRIDE:
        return MON_CAP_OVERRIDE[mid]
    size = _SIZES.get(mid)
    if size is None:
        # 保險用的退路：現在 102 個檔名前綴在 enemies.ts 全部對得到體型，走不到這裡。
        # 日後若有魔物只進了圖、還沒寫進 enemies.ts，照最大的來，寧可大不要糊
        print(f"  （{mid} 在 enemies.ts 對不到體型，照 large 的上限）")
        return MON_CAPS["large"]
    return MON_CAPS[size]


def check_overrides() -> None:
    """例外表的每個鍵至少要對到一個檔案。對不到就是寫錯名字了，出聲，不要靜靜跳過"""
    stems = {re.sub(r"_(idle|attack|hurt|block|down)$", "", p.stem)
             for p in (ROOT / "public/assets/monsters").glob("*.webp")}
    bad = [k for k in MON_CAP_OVERRIDE if k not in stems]
    if bad:
        print(f"⚠ MON_CAP_OVERRIDE 有對不到檔案的鍵（那幾隻會照體型縮、例外等於沒寫）：{bad}")
        print("  鍵要用檔名前綴（美術鍵去掉 codex/monster_），不是魔物 id")


def main() -> None:
    dry = "--dry" in sys.argv
    check_overrides()
    saved = 0
    n = 0
    skipped = 0
    folders: list[tuple[str, tuple[int, int] | None]] = [*CAPS.items(), ("monsters", None), ("icons", None)]
    for folder, cap in folders:
        for f in sorted((ROOT / "public/assets" / folder).rglob("*.webp")):
            if folder == "icons":
                # 圖示只挑名單裡的前綴縮，其餘（秘寶、忍具、狀態）本來就已經是對的尺寸
                hit = next((c for pre, c in ICON_CAPS.items() if f.name.startswith(pre)), None)
                if hit is None:
                    continue
                mw, mh = hit
            else:
                mw, mh = cap if cap else mon_cap(f)
            im = Image.open(f).convert("RGBA")
            if im.width <= mw and im.height <= mh:
                continue
            before = f.stat().st_size
            im.thumbnail((mw, mh), Image.LANCZOS)
            # **一律先壓進記憶體、比過大小才決定要不要寫回**（2026-09-11 修）。
            # 這支重壓用 q74，`add_sprite.py` 存魔物卻是 q72——只超出上限一點點的圖，
            # 少掉的那幾十個像素抵不過畫質調高一格，重壓完反而**更大**。
            # 那批新防禦圖就這樣被寫胖了六張（鏡中貓 16 KB → 18 KB），整輪結算是「省下 -0.01 MB」。
            # 判準改成「真的變小才寫」：沒省到就原檔不動，反正超出上限個位數像素本來就無所謂。
            #（順帶：這樣連 `--dry` 都走同一條路，試跑印的數字跟實跑保證一致。）
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=QUALITY, method=6)
            after = buf.getbuffer().nbytes
            if after >= before:
                print(f"  （跳過 {f.name}：重壓 {before // 1024} KB → {after // 1024} KB，沒省到）")
                skipped += 1
                continue
            if not dry:
                f.write_bytes(buf.getvalue())
            print(f"  {f.relative_to(ROOT / 'public/assets')}　"
                  f"{before // 1024} KB → {after // 1024} KB　{im.size}")
            saved += before - after
            n += 1
    tail = f"，另有 {skipped} 張重壓後反而更大、原檔不動" if skipped else ""
    print(f"{'（試跑）' if dry else ''}縮了 {n} 張，省下 {saved / 1048576:.2f} MB{tail}")


if __name__ == "__main__":
    main()
