# -*- coding: utf-8 -*-
r"""兩句之間沒有停頓、切點落在聲音中間時，重找這一刀（不用再送請求）。

做法：把「前一句＋後一句」那段拿去語音辨識、要每個字的時間，數假名數到前一句的長度，
在那個字的結尾到下一個字開頭之間，挑最安靜的 20 毫秒下刀。
整批其他句子的切點原樣寫進 job.json 的 force（固定住），只改這兩句；之後跑 voice_post.py 重切、重檢查。

用法（系統 Python）：python tools\voice\voice_fixjoin.py <群組> <try 編號> <前一句 id> [<前一句 id> ...]
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
import pykakasi

HERE = Path(__file__).parent
PROJ = HERE.parents[1]
S = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
L = {l["id"]: l for l in S["lines"]}
group, tryn, firsts = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
d = PROJ / "vids" / "_audio" / "voice_work" / group / f"try{tryn}"
job = json.loads((d / "job.json").read_text(encoding="utf-8"))
sp = json.loads((d / "split.json").read_text(encoding="utf-8"))["lines"]
order = [x["id"] for x in job["lines"]]
kks = pykakasi.kakasi()


def kana(s):
    s = "".join(x["hira"] for x in kks.convert(s))
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = unicodedata.normalize("NFC", s).replace("っ", "").replace("ー", "")
    s = s.translate(str.maketrans("ぁぃぅぇぉゃゅょゎ", "あいうえおやゆよわ"))
    return re.sub(r"[^ぁ-ゟ]", "", s)


audio = decode_audio(job["wav"], sampling_rate=16000)
model = WhisperModel("large-v3", device="cuda", compute_type="float16")
force = dict(job.get("force", {}))
for i in order:  # 其他句子固定在現在的切點
    force.setdefault(i, [sp[i]["start"], sp[i]["end"]])
for a in firsts:
    b = order[order.index(a) + 1]
    t0, t1 = sp[a]["start"], sp[b]["end"]
    seg = audio[int(t0 * 16000):int(t1 * 16000)]
    segs, _ = model.transcribe(seg, language="ja", beam_size=5, vad_filter=False, word_timestamps=True,
                               condition_on_previous_text=False)
    words = [w for s in segs for w in s.words]
    need = len(kana(L[a]["tts"]))
    # 假名數差 2 個以內的字間都算候選；每個候選在「這個字開頭～下一個字結尾」裡找最安靜的 20 毫秒
    # （語音辨識給的字時間常把停頓算進字裡，所以窗要含兩邊的字），挑最安靜的候選，一樣安靜就挑數目最接近的
    fr = int(0.02 * 16000)

    def quietest(lo, hi):
        best, best_t, t = None, None, lo
        while t + 0.02 <= hi:
            x = audio[int(t * 16000):int(t * 16000) + fr]
            e = float(np.sqrt(np.mean(x ** 2))) if len(x) else 1.0
            if best is None or e < best:
                best, best_t = e, t + 0.01
            t += 0.005
        return best, best_t

    cnt, cands = 0, []
    for k, w in enumerate(words[:-1]):
        cnt += len(kana(w.word))
        if abs(cnt - need) <= 2:
            e, tt = quietest(t0 + w.start, t0 + words[k + 1].end)
            if e is not None:
                cands.append((round(20 * np.log10(e + 1e-9)), abs(cnt - need), tt, k))
    if not cands:
        print(f"{a}：找不到交界，跳過（辨識：{''.join(w.word for w in words)}）")
        continue
    db, _, best_t, cut_k = min(cands)
    best = 10 ** (db / 20)
    force[a] = [force[a][0], round(best_t, 3)]
    force[b] = [round(best_t, 3), force[b][1]]
    print(f"{a}｜{b}：原切點 {sp[a]['end']:.3f} → {best_t:.3f}（最安靜處音量 {20 * np.log10(best + 1e-9):.0f} dB）"
          f"；辨識「{''.join(w.word for w in words[:cut_k + 1])}｜{''.join(w.word for w in words[cut_k + 1:])}」")
job["force"] = force
job["force_note"] = (job.get("force_note", "") + "；voice_fixjoin.py 重找沒停頓的交界").lstrip("；")
(d / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=1), encoding="utf-8")
