# -*- coding: utf-8 -*-
"""檢查譯稿 tools/voice/ja/<說話者>.json 跟待譯清單 _todo_<說話者>.json 一一對得上，並守幾條口吻規則。

用法：python tools/voice/check_ja.py [說話者 ...]（不給＝全部有譯稿的）
規則：
- 句數、順序、zh 一字不差；ja、tts 都不可空。
- 球球（ninja）：原文句尾是「喵」的，日文句尾（去掉標點）必須是「ニャ」。
- 其他角色：日文不准出現「ニャ」（菲菲的規矩：她不學師兄講話；噹噹、封封同理）。
- tts 不准有中文專用字形（例：貓、師父、魚）——防止把中文原句直接貼上。
"""
import json, re, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
DIR = Path(__file__).resolve().parent / "ja"
END = r"[！？。…～、,.!?―—ー\s」』）)]*$"
ZH_ONLY = re.compile(r"[貓魚們這喵麼說對裡與會關讓從]|師父")  # 日文不會用的繁體字形

speakers = sys.argv[1:] or sorted(p.stem for p in DIR.glob("*.json") if not p.stem.startswith("_") and p.stem != "glossary")
bad = 0
for sp in speakers:
    todo = json.loads((DIR / f"_todo_{sp}.json").read_text(encoding="utf-8"))
    f = DIR / f"{sp}.json"
    if not f.exists():
        print(f"{sp}: 還沒有譯稿"); bad += 1; continue
    done = json.loads(f.read_text(encoding="utf-8"))
    errs = []
    if len(done) != len(todo):
        errs.append(f"句數 {len(done)} ≠ 待譯 {len(todo)}")
    for i, (t, d) in enumerate(zip(todo, done)):
        if d.get("zh") != t["zh"]:
            errs.append(f"#{i} zh 對不上：{d.get('zh')!r} vs {t['zh']!r}")
            continue
        ja, tts = d.get("ja", "").strip(), d.get("tts", "").strip()
        if not ja or not tts:
            errs.append(f"#{i} ja/tts 空白：{t['zh']}")
            continue
        core = re.sub(END, "", ja)
        if sp == "ninja" and re.search("喵" + END, t["zh"]) and not core.endswith(("ニャ", "にゃ")):
            errs.append(f"#{i} 球球原文句尾有喵，日文沒有ニャ：{ja}")
        if sp != "ninja" and re.search("ニャ|にゃ", ja):
            errs.append(f"#{i} 非球球卻有ニャ：{ja}")
        if ZH_ONLY.search(tts):
            errs.append(f"#{i} tts 疑似中文字形：{tts}")
    print(f"{sp}: {len(done)} 句，{'OK' if not errs else f'{len(errs)} 個問題'}")
    for e in errs[:40]:
        print("  ", e)
    bad += bool(errs)
sys.exit(1 if bad else 0)
