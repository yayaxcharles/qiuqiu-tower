# -*- coding: utf-8 -*-
"""2026-09-17 晚上使用者又點名一張：`event_dangdang_toolbox`。

| 檔案 | 壞在哪（使用者原話） |
|---|---|
| toolbox | 摸肩膀的右手有點怪 |

舊圖是一隻手伸直攔車、另一隻爪子「貼」在同一側肩膀上，看不到那隻手臂從哪裡接過來，
像一顆浮在肩膀上的爪子。改成**跨過胸前去揉另一邊肩膀**：整條手臂畫在胸口前面，
從肩膀一路看得到護臂跟爪子。

做法跟 `make_fix_0917b_jobs.py` 一樣：挖出最新那份工單、在尾巴接修正，原本對的一個字都不動。
兩張續集（`_r0`／`_r1`）不重生——這次只改他的手，場景、推車、老鼠都沒變。

  python tools/make_fix_0917c_jobs.py
  python tools/codex_gen.py tools/codex_jobs/fix_0917c.json
  python tools/add_event_art.py tools/codex_raw/event_dangdang_toolbox.png
"""
import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from make_fix_0917b_jobs import ANCHOR, ARMS, HEAD, JOBS, find_job  # noqa: E402
from make_dangdang_result_art_jobs import RAW  # noqa: E402

FIX = {
    "toolbox": ARMS + (
        "**THE PAW RUBBING HIS SHOULDER IS THE BROKEN PART.** In the old version a paw is stuck flat on "
        "his shoulder with no arm visibly leading to it. Draw it like this: one bracered forearm is held "
        "out level toward the cart to stop it. His OTHER arm bends up ACROSS THE FRONT OF HIS CHEST and "
        "that paw rubs the top of the OPPOSITE shoulder - the shoulder of the outstretched arm. That whole "
        "bent arm - upper arm, bronze bracer, paw - lies in front of his chest, so we can follow it from "
        "his own shoulder all the way to the paw. A couple of small solid ORANGE ache marks with thick "
        "black outlines at the shoulder being rubbed, and a wince on his face.\n"),
}


def main() -> None:
    jobs: dict[str, dict[str, str]] = {}
    for eid, fix in FIX.items():
        fid = f"event_dangdang_{eid}.png"
        job = find_job(fid)
        prompt = job["prompt"]
        if prompt.count(ANCHOR) != 1:
            raise SystemExit(f"!! {fid}：找不到唯一的 {ANCHOR!r}，工單格式變了")
        jobs[fid] = {"prompt": prompt.replace(ANCHOR, HEAD + fix + "\n" + ANCHOR, 1),
                     "ref": job.get("ref", "")}

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    for fid in jobs:
        old = RAW / fid
        if old.exists():
            old.rename(old.with_name(f"{old.stem}.prev-{stamp}.png"))
            sys.stdout.write(f"舊稿改名留底：{old.stem}.prev-{stamp}.png\n")

    out = JOBS / "fix_0917c.json"
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.stdout.write(f"{len(jobs)} 張 → {out.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
