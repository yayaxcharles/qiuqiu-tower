# -*- coding: utf-8 -*-
"""掃事件插圖有沒有「去背只去一半」的灰膜（2026-09-13）。

**這是第三種去背失敗，前兩種的檢查都抓不到它。**
  1. 背景整片沒挖掉 → 玩家看到一片綠。`green_left` 抓得到。
  2. 亮黃與綠幕的交界留一圈螢光綠 → `despill_all` 處理。
  3. **背景變成半透明的灰膜**（這一種）：綠幕的綠不夠純（量到 242～248，
     低於預設硬門檻 248），那些像素拿到的是半透明而不是全透明。
     綠**被扣掉了**，所以殘綠量出來是漂亮的 0.6%——可是整張背景蒙著一層灰，
     遊戲裡看起來就是插圖後面多一個淡淡的方塊。

為什麼要有這支而不是寫成測試：專案沒裝任何 JavaScript 的圖片函式庫，
為了這件事裝一個不划算。`add_event_art.py` 進倉時已經會自己偵測並改用寬門檻重做，
這支是**事後複查**用的——整批生完跑一次，確認沒有漏網的。

用法：
  python tools/check_haze.py            # 掃全部，有問題就離開碼 1
  python tools/check_haze.py feifei     # 只掃檔名含 feifei 的
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from add_event_art import corner_haze  # noqa: E402

# **這裡刻意沒有放行名單**（2026-09-13 稽核 低-3）。
#
# 原本有 7 張球球的舊結果圖列在這裡當「已知未修」——它們的原稿早就不在
# `codex_raw`／`art_inbox`，所以沒辦法只重新去背。後來是用 `make_event_result_jobs.py --redo`
# 從 `events.ts` 把提示詞重新長出來、連圖一起重生，7 張全部修好了。
#
# 名單刪掉是刻意的：**照檔名永久放行**的話，那幾張日後再出問題會被報成
# 「已知未修」而不是「新的灰膜」——一條會自己說謊的檢查比沒有檢查更糟。
# 真的有修不了的，寧可讓它一直紅著。


def main() -> None:
    needle = sys.argv[1] if len(sys.argv) > 1 else ""
    bad = []
    for p in sorted((ROOT / "public" / "assets" / "bg").glob("*.webp")):
        if needle and needle not in p.name:
            continue
        if corner_haze(Image.open(p)):
            bad.append(p.name)

    if bad:
        print(f"!! 灰膜 {len(bad)} 張，進倉時重做一次：")
        for b in bad:
            print(f"   python tools/add_event_art.py --soft 190 --hard 230 {b[:-5]}.png")
            print(f"   （還是不行就改用 --strict，那是給「主體本身有大片亮色光」的圖用的）")
        raise SystemExit(1)
    print(f"沒有灰膜{'（只掃了含 ' + needle + ' 的）' if needle else ''}")


if __name__ == "__main__":
    main()
