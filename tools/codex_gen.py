# -*- coding: utf-8 -*-
"""
codex_gen.py — 逐張呼叫 `codex exec` 生圖，輸出到 tools/codex_raw/<檔名>。

用法：python tools/codex_gen.py <工作檔.json> [--timeout 900] [--retries 2] [--ref 參考圖.png]
  工作檔是 {"檔名.png": "完整提示詞"} 的對照表，放在 tools/codex_jobs/ 底下。
  --ref 會把圖用 `codex exec -i` 附上去，讓每張都照同一個範本畫。

七個踩過的坑，都寫死在這裡了：

1. **一次只跑一批。** 單張約 3～7 分鐘；同時開兩三批會互相搶，實測單張跑滿 20 分鐘還沒好。
   要排多批就一批跑完再跑下一批。
2. **不要用「有沒有 codex.exe」判斷忙不忙。** 那支多半是常駐的 `app-server`（開著就一直在），
   拿它當忙碌訊號會讓排隊腳本永遠等下去——2026-08-31 有三個排隊就是這樣卡死好幾小時，
   什麼都沒生。要排多批就在**同一支腳本裡依序呼叫這支程式**，不要靠偵測行程。
3. **逾時要接住。** 之前用 subprocess.run(timeout=...) 沒包 try，第一張逾時就整支中斷、
   後面十幾張全沒跑到。
4. **角色一定要附參考圖（`--ref`）。** 只用文字描述（「灰虎斑、深藍頭帶、瞇瞇眼…」）
   等於讓生圖每次自己想像一隻貓，七十八張牌上的主角長相全不一樣。
   使用者的原話：「主角的長相問題，變形不統一了，姿勢動作倒是沒問題」。
   設定表用 `tools/make_hero_ref.py` 產。
5. **提示詞裡不要出現「綠色」，也不要要求半透明。** 產出的圖是畫在綠幕上、要去背的。
   寫「亮綠色泡泡」→ 泡泡跟背景同色，去背後被 despill 洗成土黃（毒霧那張）；
   寫「半透明的金鐘」→ 綠幕從鐘裡透出來，去背後 21% 的可見像素帶綠（金鐘罩那張）。
   要「光」的感覺就靠形狀跟亮色，一律畫成實心、不碰綠色系。
6. **提示詞一律走標準輸入，不要當成命令列參數。** `-i/--image` 是可變長度參數，
   會把後面的提示詞也當成圖檔吃掉，codex 就變成「等 stdin 但沒東西」、0 秒失敗。
   固定用 `input=提示詞` 餵進去，有沒有附參考圖都一樣，不用兩套寫法。
7. **不要先刪再重生。** 之前重生前先 rm 舊檔，結果新的沒生出來、舊的也沒了
   （竹編牌框就是這樣弄丟的）。已存在的檔一律跳過；真要重生請自己先改名備份。
8. **額度用完要等，不要一路失敗下去。** 2026-09-08 傍晚生到第 50 幾張時 Codex 回
   「You've hit your usage limit … try again at 5:07 PM」，每張 9 秒就失敗，35 張工單十分鐘內全部
   燒掉（都沒生）。現在會從錯誤訊息裡抓「幾點幾分再試」，睡到那個時間再重試同一張、不算失敗；
   抓不到時間就等 30 分鐘。最多等 --max-wait-hours（預設 8）小時。
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"

CMD = ["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write",
       "-c", "sandbox_workspace_write.network_access=true", "--cd", str(RAW)]


LIMIT_RE = re.compile(r"try again at (\d{1,2}):(\d{2}) ?(AM|PM)", re.I)
# 坑 9（2026-09-10）：生圖模型會回「Selected model is at capacity」——這是**伺服器當下滿載**，
# 不是額度用完、也不是提示詞有問題。它 16 秒就失敗，兩次重試在半分鐘內全部燒光，
# 整批工單就這樣「全失敗」收場（紙箱那兩張第一次就是這樣掛的）。
# 認出來就固定等 CAPACITY_WAIT 秒再試同一張，不吃重試次數。
CAPACITY_RE = re.compile(r"at capacity", re.I)
CAPACITY_WAIT = 180


def limit_wait_seconds(stderr: str, now: dt.datetime | None = None) -> int | None:
    """錯誤輸出裡有「usage limit」就回要等幾秒（訊息裡的時間＋2 分鐘；抓不到時間＝30 分鐘）；沒有回 None"""
    if "usage limit" not in stderr:
        return None
    m = LIMIT_RE.search(stderr)
    if not m:
        return 30 * 60
    now = now or dt.datetime.now()
    hour, minute, ampm = int(m.group(1)), int(m.group(2)), m.group(3).upper()
    hour = hour % 12 + (12 if ampm == "PM" else 0)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + dt.timedelta(minutes=2)
    if target <= now:
        target += dt.timedelta(days=1)
    return int((target - now).total_seconds())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--ref", help="參考圖，會用 codex exec -i 附上去（角色圖一定要給）")
    ap.add_argument("--max-wait-hours", type=float, default=8, help="額度用完最多等幾小時（坑 8）")
    args = ap.parse_args()
    waited = 0.0

    jobs = json.loads(Path(args.jobs).read_text(encoding="utf-8"))
    ref: list[str] = []
    if args.ref:
        rp = Path(args.ref).resolve()
        if not rp.exists():
            sys.exit(f"參考圖不存在：{rp}")
        ref = ["-i", str(rp)]
        print(f"[參考圖] {rp.name}", flush=True)
    RAW.mkdir(parents=True, exist_ok=True)
    done = failed = skipped = 0

    for name, job in jobs.items():
        # 2026-09-08 起一條工單可以自己帶參考圖：{"prompt": "...", "ref": "路徑"}，沒帶的用 --ref。
        # 魔物挨打圖每隻要配自己的待機圖當參考，76 隻總不能開 76 個工作檔
        prompt = job if isinstance(job, str) else job["prompt"]
        ref_i = ref
        if isinstance(job, dict) and job.get("ref"):
            # 工單裡的相對路徑一律相對倉庫根目錄，不看在哪個目錄執行；找不到要喊出來，
            # 不然就是坑 4 的無參考圖生圖、還回報成功（稽核 2026-09-08 低-3）
            rp = Path(job["ref"])
            rp = (rp if rp.is_absolute() else ROOT / rp).resolve()
            if rp.exists():
                ref_i = ["-i", str(rp)]
            else:
                print(f"  ⚠ 參考圖不存在：{rp}，改用 --ref{'' if ref else '（也沒給，會沒參考圖）'}", flush=True)
        out = RAW / name
        if out.exists():
            skipped += 1
            continue
        t0 = time.time()
        print(f"[生圖] {name}", flush=True)
        attempt = 0
        while attempt < args.retries:
            attempt += 1
            try:
                r = subprocess.run([*CMD, *ref_i], input=prompt, capture_output=True,
                                   text=True, encoding="utf-8", errors="replace", timeout=args.timeout)
                wait = limit_wait_seconds(r.stderr + r.stdout)
                if wait is not None and not out.exists():
                    # 額度用完（坑 8）：等到訊息裡的時間再試同一張，不算失敗、不吃重試次數
                    if waited + wait > args.max_wait_hours * 3600:
                        print(f"  額度用完，要等 {wait // 60} 分鐘，超過上限 {args.max_wait_hours} 小時，放棄這批", flush=True)
                        failed += 1
                        print(f"結束：完成 {done}、失敗 {failed}、已存在跳過 {skipped}（額度用完提早結束）", flush=True)
                        sys.exit(1)
                    print(f"  額度用完，等 {wait // 60} 分鐘（{(dt.datetime.now() + dt.timedelta(seconds=wait)):%H:%M} 再試）", flush=True)
                    time.sleep(wait)
                    waited += wait
                    attempt -= 1
                    continue
                if not out.exists() and CAPACITY_RE.search(r.stderr + r.stdout):
                    # 坑 9：模型滿載，等一下再試同一張，不吃重試次數
                    if waited + CAPACITY_WAIT > args.max_wait_hours * 3600:
                        print("  模型持續滿載，等待時間已到上限，放棄這批", flush=True)
                        break
                    print(f"  模型滿載，等 {CAPACITY_WAIT // 60} 分鐘再試同一張", flush=True)
                    time.sleep(CAPACITY_WAIT)
                    waited += CAPACITY_WAIT
                    attempt -= 1
                    continue
            except subprocess.TimeoutExpired:
                print(f"  第 {attempt} 次逾時（{args.timeout} 秒）", flush=True)
            except OSError as e:
                print(f"  第 {attempt} 次出錯：{e}", flush=True)
            if out.exists():
                break
            if attempt < args.retries:
                print(f"  第 {attempt} 次沒產出，重試", flush=True)
        ok = out.exists()
        done += ok
        failed += not ok
        print(f"[{'完成' if ok else '失敗'}] {name}（{int(time.time() - t0)} 秒）"
              f"　累計 完成 {done}／失敗 {failed}", flush=True)

    print(f"結束：完成 {done}、失敗 {failed}、已存在跳過 {skipped}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
