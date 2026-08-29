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
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
REF = Path(os.environ["USERPROFILE"]) / "Dropbox" / "08_軟體工具與遊戲" / "LINE貼圖" / "參考圖" / "貓咪參考_九宮格.png"
TEMPLATE = (ROOT / "tools" / "codex_prompts" / "template.md").read_text(encoding="utf-8")
SUBJECTS = json.loads((ROOT / "tools" / "codex_prompts" / "subjects.json").read_text(encoding="utf-8"))

# 單張逾時（秒）與連續失敗上限：無人看顧批次跑時的保險絲，避免額度用完後空轉 60 幾次。
# 實測一張約 3～7 分鐘（不是記憶裡寫的 1～2 分鐘），所以逾時放到 20 分鐘才不會誤殺。
PER_IMAGE_TIMEOUT = 1200
MAX_CONSECUTIVE_FAILURES = 5


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
    fails = 0
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
        t0 = time.time()
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                               errors="replace", timeout=PER_IMAGE_TIMEOUT)
            rc, so, se = r.returncode, r.stdout or "", r.stderr or ""
        except subprocess.TimeoutExpired:
            rc, so, se = -1, "", f"逾時 {PER_IMAGE_TIMEOUT} 秒"
        if rc != 0 or not out.exists():
            fails += 1
            print(f"[失敗] {key}（第 {fails} 次連續失敗）\n{so[-800:]}\n{se[-800:]}", file=sys.stderr, flush=True)
            if fails >= MAX_CONSECUTIVE_FAILURES:
                print(f"[中止] 連續失敗 {fails} 次，停止本批（可能是額度用盡或未授權）。", file=sys.stderr, flush=True)
                break
            continue
        fails = 0
        done += 1
        print(f"[完成] {key}（{time.time() - t0:.0f} 秒）", flush=True)
        if args.limit and done >= args.limit:
            break
    missing = [k for k in SUBJECTS if not (RAW / (k.replace("/", "__") + ".png")).exists()]
    print(f"本次生成 {done} 張；尚缺 {len(missing)} 張：{missing[:10]}{'…' if len(missing) > 10 else ''}")


if __name__ == "__main__":
    main()
