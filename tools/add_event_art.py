# -*- coding: utf-8 -*-
"""
add_event_art.py — 只把指定的幾張事件插圖進倉，不動收件匣裡其他五百多張。

用法：python tools/add_event_art.py event_toll_again_paid.png event_robin_feast.png ...
  來源先找 tools/codex_raw/，找不到再找 tools/art_inbox/。處理方式跟 build_art_inbox.py 的事件那段
  一模一樣（去背、不裁、縮到 560x420、寫進 manifest 的 bg["bg/event_<id>"]），並把原稿複製一份進
  tools/art_inbox/，整批重跑時才不會漏掉它。
  整批重跑 build_art_inbox.py 會把 197 張 WebP 重新編碼一遍（2026-09-06 踩過），補幾張就用這支。
  事件畫面靠事件編號自動找圖（event.ts 的 artUrl('bg', `bg/event_<id>`)），events.ts 不用改。
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_art_inbox import INBOX, MANIFEST, OUT  # noqa: E402
from chroma_key import CARD_BAND, CARD_HARD, CARD_SOFT, HARD, SOFT, key_out  # noqa: E402
from manifest_io import merge  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"


def despill_all(im: Image.Image) -> Image.Image:
    """整張把綠壓到不超過紅藍的最大值。

    `key_out` 的去綠邊只作用在「離透明區幾個像素以內」的邊緣帶，那對一般插圖夠了；
    但主體本身有一大片**亮黃色**（紙箱那道寶光）時，黃與綠幕之間的過渡帶很寬，
    邊緣帶掃不到的地方會留下一圈螢光綠（實測 2.84% 的可見像素帶綠、綠度中位 139）。
    這支給「畫面裡本來就沒有任何綠色」的圖用——整張壓下去不會傷到主體。
    """
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and g > max(r, b):
                px[x, y] = (r, max(r, b), b, a)
    return im



def corner_haze(im: Image.Image) -> bool:
    """四個角落有沒有「不是全透明、也不是不透明」的灰膜。

    角落一定是背景，去乾淨的話 alpha 應該是 0。**不可以只看「不等於 0」**——
    有些圖的構圖本來就會頂到邊（`signal_r1` 右邊那片鐵板就是），那種角落是
    完全不透明的 255，屬於正常。灰膜的特徵是**卡在中間**：大約 30～190。

    兩個條件都要成立才算，各自擋掉一種誤判：
      - 四個角至少兩個卡在中間（1～247）→ 擋掉「主體剛好頂到某一角」（那種是 0 或 255）
      - 全圖有超過 15% 的像素是半透明 → 擋掉「角落剛好落在物件邊緣的抗鋸齒上」
        （`door_act1` 就是這樣：兩個角是 247，但全圖半透明比例只有 0.49%）
    真的有灰膜的那幾張，半透明比例量出來都在 49%～70%，跟 5% 以下差得很遠。

    **上界是 248 不是 200**（2026-09-13 稽核 中-1）。算式是
    `alpha = 255 × (1 − (綠度 − 232) / 16)`，所以角落 alpha 落在 200～247 ⇔ 原稿背景
    綠度 232.5～235.5——那是**最淡、但也最顯眼**的一種灰膜（背景 78%～97% 不透明，
    等於插圖後面一塊灰板），卡在 200 的上界正好把它放掉。
    全量過 289 張：角落 alpha 只有 0（814 個角）、≥248（309 個）、1～199（31 個）、
    200～247（2 個，都是 `door_act1`）四種，放寬到 248 新增誤殺 0 張。
    """
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    mid = sum(1 for x, y in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))
              if 0 < px[x, y][3] < 248)
    if mid < 2:
        return False
    a = rgba.getchannel("A").get_flattened_data()
    part = sum(1 for v in a if 8 <= v < 248)
    return part / (w * h) > 0.15

def green_left(im: Image.Image) -> float:
    """去完背之後還有幾成的可見像素是綠的（百分比）。

    判準跟 `key_out` 同一套（綠減去紅藍的最大值），門檻放寬到 60——
    那個程度的綠人眼一看就知道是沒去乾淨，不是畫上去的綠色物件。
    綠色的藥水瓶、草叢那種本來就該留著的，綠度多半在 60 以下。
    """
    px = im.convert("RGBA").load()
    vis = green = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a <= 16:
                continue
            vis += 1
            if g - max(r, b) > 60:
                green += 1
    return green / vis * 100 if vis else 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", help="event_<事件編號>.png")
    ap.add_argument("--strict", action="store_true",
                    help="用比較嚴的去背門檻（150/220，不是牌面那套 232/248）並整張去綠邊。"
                         "畫面裡本來就沒有綠色、又有大片亮黃或亮色光的圖用這個，"
                         "不然黃綠交界會留一圈螢光綠")
    # 2026-09-12：這個生圖模型吐出來的綠幕**不是每張都純綠**（量過 237～255 都有）。
    # 低於預設的 `CARD_HARD=248` 那幾張會被當成「接近綠」只去綠邊，背景整片留著沒挖掉。
    # `--strict` 的 150/220 又太嚴，畫面裡本來就有綠色的（貓薄荷、池水）會被挖出洞。
    # 所以另外開一組可調的，用法跟 `add_card_art.py` 一致：`--soft 190 --hard 230`
    ap.add_argument("--soft", type=int, help="低於這個綠度完全保留；不填用牌面那套 232")
    ap.add_argument("--hard", type=int, help="高於這個綠度完全挖掉；不填用牌面那套 248")
    args = ap.parse_args()
    names = args.names
    if not names:
        sys.exit(__doc__)
    # manifest 不在這裡讀：去背一輪要跑好幾分鐘，那段時間看門狗也在改同一份檔
    #（見 tools/manifest_io.py）。先把要加的條目收在手上，最後上鎖一次寫完。
    added: dict[str, str] = {}
    failed: list[str] = []
    for name in names:
        if not name.startswith("event_") or not name.endswith(".png"):
            print(f"檔名要是 event_<事件編號>.png：{name}，略過")
            continue
        src = RAW / name if (RAW / name).exists() else INBOX / name
        if not src.exists():
            print(f"找不到 {name}（codex_raw 與 art_inbox 都沒有），略過")
            continue
        eid = Path(name).stem[len("event_"):]
        soft = args.soft if args.soft is not None else (SOFT if args.strict else CARD_SOFT)
        hard = args.hard if args.hard is not None else (HARD if args.strict else CARD_HARD)
        keyed = key_out(Image.open(src), soft, hard, CARD_BAND, crop=False)
        if args.strict:
            keyed = despill_all(keyed)
        # 去背失敗要當場喊出來（2026-09-11）。預設的牌面門檻（232／248）對背景綠度
        # 只有 23x 的圖會漏掉一大片，而且**完全不出聲**——照樣印成功、照樣寫進 manifest，
        # 只有玩家看得到一片綠。量一下殘留，太多就自己改用嚴格門檻重做一次
        #
        # **還有第二種去背失敗，殘綠量不出來**（2026-09-13）：背景的綠**不夠純**
        # （量到 242～248，低於預設的硬門檻 248），於是那些像素拿到的是**半透明**
        # 而不是全透明——綠被扣掉了所以 `green_left` 看起來很漂亮，但整張背景
        # 蒙上一層灰膜，遊戲裡就是插圖後面多一個淡淡的方塊。
        # 判準用「四個角落的 alpha」：角落一定是背景，全透明才算過。
        # **手動指定門檻時不要自動蓋掉**（2026-09-13 稽核 中-3）：`check_haze.py` 會叫人
        # 用 `--soft 190 --hard 230`；如果那樣還不行、想改用比較溫和的一組去保護畫面裡
        # 本來就有的綠色物件，自動重做會靜靜把它換回 190/230，把綠色主體挖出洞。
        manual = args.soft is not None or args.hard is not None
        if not args.strict and not manual and (green_left(keyed) > 3.0 or corner_haze(keyed)):
            why = "背景綠度偏低" if green_left(keyed) > 3.0 else "背景變成半透明的灰膜"
            print(f"  ⚠ {name} 去背沒乾淨（{why}），改用寬門檻重做")
            keyed = despill_all(key_out(Image.open(src), 190, 230, CARD_BAND, crop=False))
        left = green_left(keyed)
        haze = corner_haze(keyed)
        #
        # **救不回來就不要存檔**（2026-09-13 稽核 中-2）。原本這裡只印警告然後照樣存、
        # 照樣併進 manifest——而排程把這支的輸出導進 log，畫面上只看得到「收了 N 張」。
        # 更糟的是 `pending()` 只列「還沒進倉的」，壞圖一旦寫進 manifest 就**永遠不會被重收**。
        # 那 7 張灰膜就是這樣活了好幾天的。
        # 不存檔的話原稿還在 `codex_raw`，下一輪照樣撿得到，人也會在結尾看到離開碼非 0。
        if left > 3.0 or haze:
            why = f"還剩 {left:.1f}% 綠" if left > 3.0 else "背景是半透明的灰膜"
            print(f"  ⚠⚠ {name} 去背救不回來（{why}），**沒有存檔**。"
                  f"手動試試看：python tools/add_event_art.py --strict {name}")
            failed.append(name)
            continue
        dst = OUT / "bg" / f"event_{eid}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        keyed.resize((560, 420), Image.LANCZOS).save(dst, "WEBP", quality=84, method=6)
        added[f"bg/event_{eid}"] = dst.relative_to(OUT.parent).as_posix()
        if src != INBOX / name:
            shutil.copy2(src, INBOX / name)
        print(f"事件插圖 event_{eid}.webp {dst.stat().st_size // 1024} KB")
    # 印的是**真的併進去幾筆**，不是「要求收幾張」（2026-09-13 稽核 中-4）。
    # 排程的「收了 N 張」數的是待收清單長度，逐檔跳過完全不影響那個數字——
    # `\r` 那個雷能藏五個半小時就是因為這個假數字。
    print(f"manifest.json 已併入 {merge('bg', added)} 筆")
    if failed:
        print(f"!! {len(failed)} 張去背失敗、沒有進倉：{'、'.join(failed)}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
