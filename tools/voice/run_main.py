# -*- coding: utf-8 -*-
r"""爪破魔塔日文配音：主線過場＋戰鬥吐槽（不含魔物初見 firstMeet）逐批生成→切句→念錯檢查。
每一批＝台詞表的 batch 欄（同一個聲音、約 600 字／45 句）只送一次請求。
遇到額度用完就停，已完成的批次保留；再跑一次會從沒做的接著做。

用法（系統 Python，在專案資料夾）：python tools\voice\run_main.py
"""
import json, subprocess, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
PROJ = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
WORK = PROJ / "vids" / "_audio" / "voice_work"
GEM_PY = r"E:\AI\gemini-tts-eval\venv\Scripts\python.exe"
SKIP_TIERS = {"firstMeet"}

S = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
batches = {}
for l in S["lines"]:
    if l["tier"] in SKIP_TIERS:
        continue
    batches.setdefault(l["batch"], []).append(l)

print(f"共 {len(batches)} 批、{sum(len(v) for v in batches.values())} 句")
for n, (b, ls) in enumerate(sorted(batches.items())):
    group = ls[0]["group"]
    tryn = 100 + n  # 固定編號：同一批每次重跑都對到同一個資料夾
    d = WORK / group / f"try{tryn}"
    if not (d / "raw.wav").exists():
        print(f"→ {b}（{len(ls)} 句）")
        cmd = [GEM_PY, str(HERE / "voice_gen.py"), "--group", group, "--try", str(tryn),
               "--ids", ",".join(l["id"] for l in ls)]
        if subprocess.run(cmd).returncode != 0:
            sys.exit(f"{b} 生成失敗或額度用完，停在這裡（已完成的保留）")
    if not (d / "check_out.json").exists():
        subprocess.run([sys.executable, str(HERE / "voice_post.py"), group, str(tryn)])
print("全部批次完成")
