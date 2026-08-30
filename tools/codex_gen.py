# -*- coding: utf-8 -*-
"""
codex_gen.py — 逐張呼叫 `codex exec` 生圖，輸出到 tools/codex_raw/<檔名>。

用法：python tools/codex_gen.py <工作檔.json> [--timeout 900] [--retries 2]
  工作檔是 {"檔名.png": "完整提示詞"} 的對照表，放在 tools/codex_jobs/ 底下。

三個踩過的坑，都寫死在這裡了：

1. **一次只跑一批。** 單張約 3～7 分鐘；同時開兩三批會互相搶，實測單張跑滿 20 分鐘還沒好。
   要排多批就一批跑完再跑下一批。
2. **逾時要接住。** 之前用 subprocess.run(timeout=...) 沒包 try，第一張逾時就整支中斷、
   後面十幾張全沒跑到。
3. **不要先刪再重生。** 之前重生前先 rm 舊檔，結果新的沒生出來、舊的也沒了
   （竹編牌框就是這樣弄丟的）。已存在的檔一律跳過；真要重生請自己先改名備份。
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"

CMD = ["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write",
       "-c", "sandbox_workspace_write.network_access=true", "--cd", str(RAW)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--retries", type=int, default=2)
    args = ap.parse_args()

    jobs = json.loads(Path(args.jobs).read_text(encoding="utf-8"))
    RAW.mkdir(parents=True, exist_ok=True)
    done = failed = skipped = 0

    for name, prompt in jobs.items():
        out = RAW / name
        if out.exists():
            skipped += 1
            continue
        t0 = time.time()
        print(f"[生圖] {name}", flush=True)
        for attempt in range(1, args.retries + 1):
            try:
                subprocess.run([*CMD, prompt], capture_output=True, text=True, timeout=args.timeout)
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
