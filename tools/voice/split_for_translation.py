# -*- coding: utf-8 -*-
"""把 lines_zh.json 依說話者拆成翻譯用的小檔（tools/voice/ja/_todo_<speaker>.json），每句附場景，給譯者看上下文。"""
import json, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
d = json.loads((HERE / "lines_zh.json").read_text(encoding="utf-8"))
out = HERE / "ja"
out.mkdir(exist_ok=True)
by = {}
for l in d["lines"]:
    by.setdefault(l["speaker"], []).append({"zh": l["text"], "ctx": l["ctx"][:4]})
for sp, xs in by.items():
    (out / f"_todo_{sp}.json").write_text(json.dumps(xs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(sp, len(xs))
