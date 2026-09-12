# -*- coding: utf-8 -*-
"""
watch_art.py — 生圖跑一整晚時，**邊生邊接**，不必等整批跑完再手動補。

為什麼要：整批 120 張要跑五、六個小時，中途停掉就白等。這支每 90 秒看一次
tools/codex_raw/，發現有還沒進倉的牌面就叫 add_card_art.py 接進去。

兩個「等一下」的保護：
  1. 檔案大小連兩次一樣才動它——不然會讀到寫到一半的 PNG。
  2. 去背門檻**每張自己量**：這個生圖模型吐出來的綠幕不是每次都純綠
     （量過 240～255 都有），用寫死的 232/248 會把 240 那批當成「接近綠」
     只做去綠邊、結果整張背景變灰塊。量到角落綠度低於 250 就整批改用寬門檻。

只管牌面。立繪的畫布要挑同一批的基準圖，挑錯會忽大忽小，那個要人看著做。
"""
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
OUT = ROOT / "public" / "assets" / "cards" / "card"
LOG = ROOT / "tools" / "watch_art.log"

PERIOD = 90
MAX_HOURS = 8


def say(msg: str) -> None:
    line = time.strftime("%H:%M:%S") + "  " + msg
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def corner_green(p: Path) -> int:
    """四個角落的綠度取最小值。255＝純綠幕，越低代表這張的綠越髒。"""
    im = Image.open(p).convert("RGB")
    w, h = im.size
    vals = []
    for x, y in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)):
        r, g, b = im.getpixel((x, y))
        vals.append(int(g) - max(int(r), int(b)))
    return min(vals)


def pending() -> list[Path]:
    return [p for p in sorted(RAW.glob("card_feifei_*.png"))
            if not (OUT / (p.stem[5:] + ".webp")).exists()]


def main() -> int:
    say("看門狗開工，每 " + str(PERIOD) + " 秒看一次")
    sizes: dict[str, int] = {}
    deadline = time.time() + MAX_HOURS * 3600
    done_total = 0
    while time.time() < deadline:
        ready = []
        for p in pending():
            s = p.stat().st_size
            if sizes.get(p.name) == s and s > 0:
                ready.append(p)
            sizes[p.name] = s
        if ready:
            dirty = min(corner_green(p) for p in ready) < 250
            args = ["--soft", "190", "--hard", "230"] if dirty else []
            cmd = [sys.executable, str(ROOT / "tools" / "add_card_art.py")] + args + [p.name for p in ready]
            r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
            if r.returncode == 0:
                done_total += len(ready)
                say("接了 " + str(len(ready)) + " 張（" + ("寬門檻" if dirty else "預設門檻") + "）："
                    + "、".join(p.stem[12:] for p in ready) + "　累計 " + str(done_total))
            else:
                say("接圖失敗：" + (r.stderr or r.stdout)[-400:])
        time.sleep(PERIOD)
    say("看門狗到時間收工，累計接了 " + str(done_total) + " 張")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
