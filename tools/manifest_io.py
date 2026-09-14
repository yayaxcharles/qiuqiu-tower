# -*- coding: utf-8 -*-
"""manifest.json 的併入：**先鎖再讀、改完立刻寫**（2026-09-13 稽核 高-4）。

**為什麼需要**：生圖跑一整晚時有兩個行程同時在動這份檔——
`watch_art.py` 每 90 秒叫一次 `add_card_art.py` 收牌面，排程腳本每 15 分鐘叫一次
`add_event_art.py` 收事件圖。兩支原本都是「開頭讀整份 → 中間慢慢處理圖 → 結尾寫整份」，
而 `add_event_art.py` 光去背就要跑好幾分鐘，那幾分鐘就是重疊區。

撞上的後果是**靜音的**：webp 檔明明產出來了、主控台印的是成功，
但後寫的那一方會拿著幾分鐘前讀到的舊內容整份蓋回去，把對方剛加的條目抹掉。
之後 `tools/feifei_cardart.test.ts` 會突然變紅說「這張牌解不出圖」，
或者玩家直接看到一張沒有圖的牌——而且查不出是誰弄掉的。

修法兩件事一起做：
  1. **把讀的時機搬到最後**：處理圖的時候不碰 manifest，只把要加的條目收在手上。
  2. **讀與寫之間上鎖**：同一時間只有一個行程能做「讀→合併→寫」，那段只有幾毫秒。

鎖用資料夾（`os.mkdir` 在 Windows 與 POSIX 都是不可分割的動作，不像檔案要考慮
`O_EXCL` 的各種差異）。鎖太舊就視為前一個行程死掉留下的，直接接手。
"""
import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public" / "assets" / "manifest.json"
LOCK = ROOT / "public" / "assets" / ".manifest.lock"

WAIT = 0.2          # 拿不到鎖就等這麼久再試
TIMEOUT = 60.0      # 等超過這麼久就放棄（不要無限等，生圖排程會整個卡住）
STALE = 120.0       # 鎖比這個舊就當成是死掉的行程留下的


def _acquire() -> None:
    t0 = time.time()
    while True:
        try:
            os.mkdir(LOCK)
            return
        except FileExistsError:
            try:
                if time.time() - LOCK.stat().st_mtime > STALE:
                    os.rmdir(LOCK)                      # 前一個行程死了，接手
                    continue
            except OSError:
                pass                                    # 剛好被別人解掉，再試一次就好
            if time.time() - t0 > TIMEOUT:
                raise SystemExit(f"!! 等 {TIMEOUT:.0f} 秒還拿不到 manifest 的鎖，"
                                 f"請看一下是不是有行程卡住（鎖在 {LOCK}）")
            time.sleep(WAIT)


def _release() -> None:
    try:
        os.rmdir(LOCK)
    except OSError:
        pass


def read_for_scan(retries: int = 20, wait: float = 0.05) -> dict:
    """生圖期間要讀 manifest 就用這支，不要直接 `json.loads`。

    寫的那邊是「清空再寫」，中間有幾毫秒檔案是空的或半套的。撞進去的話
    `json.loads` 會丟 `JSONDecodeError`——而呼叫端多半只是讓那一輪什麼都不做、
    什麼都不印（殼沒開 `set -e`），**畫面上完全看不出來**。重試一次就過了。

    為什麼不改用「先寫暫存檔再改名」：Windows 上只要有人開著這個檔在讀，
    改名就會被擋（見 `merge` 裡的說明）。修在讀這一邊才是對的。
    """
    last: Exception | None = None
    for _ in range(retries):
        try:
            return json.loads(MANIFEST.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:    # 正在被覆寫
            last = e
            time.sleep(wait)
    raise SystemExit(f"!! manifest.json 讀了 {retries} 次都是壞的：{last}")


def merge(section: str, entries: dict[str, str]) -> int:
    """把 `entries` 併進 manifest 的 `section`，回傳併了幾筆。

    `entries` 空的時候什麼都不做（連鎖都不拿），這樣「這一輪沒有新圖」是零成本的。
    """
    if not entries:
        return 0
    _acquire()
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
        data.setdefault(section, {}).update(entries)
        #
        # **先寫暫存檔再換過去**（2026-09-13 稽核 中-5）。`write_text` 是「先清空再寫」，
        # 中間那一瞬間檔案是空的。拿鎖的只有寫的人，**讀的人不拿鎖**——生圖那幾小時
        # 排程每 15 分鐘要讀一次 manifest 決定哪些還沒進倉，撞進那個空窗就是
        # `JSONDecodeError`：那一輪什麼都不收、也什麼都不印（殼沒開 `set -e`），
        # 畫面上完全看不出來。`os.replace` 在 Windows 與 POSIX 都是不可分割的，
        # 讀的人永遠看到完整的舊檔或完整的新檔。
        #
        # **「先寫暫存檔再 `os.replace`」這招在 Windows 上行不通**（2026-09-13 實測）。
        # Windows 的檔案共用語意是：只要有人開著這個檔在讀，改名就會
        # `PermissionError: [WinError 5] 存取被拒`。實測三個讀取者每 5 毫秒讀一次，
        # 重試 40 次（2 秒）還是十次有七次失敗——等於把「偶爾讀到半套」
        # 換成「常常寫不進去」，後者嚴重得多（那一批圖等於白生）。
        #
        # 所以寫的這邊維持單純覆寫，**讓讀的人自己重試**（見 `read_for_scan`）。
        # 空窗只有幾毫秒，重試一次就過。
        MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    finally:
        _release()
    return len(entries)
