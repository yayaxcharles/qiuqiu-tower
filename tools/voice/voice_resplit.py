# -*- coding: utf-8 -*-
r"""切點跑掉的批次重切（不用再送請求）：用「聽寫配對」決定每一段有聲區段屬於哪一句。

做法：整批原檔先找出有聲區段（句與句之間的停頓通常 0.45 秒以上，所以用 0.25 秒以上的靜音當分界）；
每一句可以拿連續的 1～6 段，把候選的那幾段丟給語音辨識聽寫，跟那一句的讀音比差幾個假名，
用動態規劃找「全部句子的差距加總最小」的分法。結果寫進 job.json 的 force（人工切點），
之後照常跑 voice_post.py 就會用這些切點重切、重檢查。

用法（系統 Python）：python tools\voice\voice_resplit.py <群組> <try 編號>
"""
import json
import re
import subprocess
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
group, tryn = sys.argv[1], int(sys.argv[2])
d = PROJ / "vids" / "_audio" / "voice_work" / group / f"try{tryn}"
job = json.loads((d / "job.json").read_text(encoding="utf-8"))
ids = [x["id"] for x in job["lines"]]
N = len(ids)
kks = pykakasi.kakasi()
MAXK = 6


def kana(s):
    s = "".join(x["hira"] for x in kks.convert(s))
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = unicodedata.normalize("NFC", s).replace("っ", "").replace("ー", "")
    s = s.translate(str.maketrans("ぁぃぅぇぉゃゅょゎ", "あいうえおやゆよわ"))
    return re.sub(r"[^ぁ-ゟ]", "", s)


def ed(a, b):
    dp = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, len(b) + 1):
            cur = dp[j]
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return dp[len(b)]


wav = job["wav"]
r = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "silencedetect=noise=-40dB:d=0.25", "-f", "null", "-"],
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
audio = decode_audio(wav, sampling_rate=16000)
dur = len(audio) / 16000
if len(en) < len(st):
    en.append(dur)
isl, t = [], 0.0
for s, e in zip(st, en):
    if s > t:
        isl.append((t, s))
    t = e
if t < dur:
    isl.append((t, dur))
isl = [(a, b) for a, b in isl if b - a >= 0.06]
M = len(isl)
print(f"{group} try{tryn}：{N} 句、有聲區段 {M} 段")

model = WhisperModel("large-v3", device="cuda", compute_type="float16")
pad = np.zeros(int(16000 * 0.3), dtype=np.float32)
cache = {}


def hyp(i, j):  # 第 i 段到第 j-1 段合起來聽寫
    if (i, j) not in cache:
        a = audio[int(max(0, isl[i][0] - 0.05) * 16000):int(min(dur, isl[j - 1][1] + 0.1) * 16000)]
        segs, _ = model.transcribe(np.concatenate([pad, a, pad]), language="ja", beam_size=5, vad_filter=False,
                                   condition_on_previous_text=False, without_timestamps=True)
        cache[(i, j)] = "".join(s.text for s in segs).strip()
    return cache[(i, j)]


refs = [kana(L[i]["tts"]) for i in ids]
INF = float("inf")
dp = [[INF] * (M + 1) for _ in range(N + 1)]
bk = [[0] * (M + 1) for _ in range(N + 1)]
dp[0][0] = 0.0
for k in range(1, N + 1):
    for j in range(k, M - (N - k) + 1):
        for i0 in range(max(k - 1, j - MAXK), j):
            if dp[k - 1][i0] == INF:
                continue
            c = dp[k - 1][i0] + ed(refs[k - 1], kana(hyp(i0, j)))
            if c < dp[k][j]:
                dp[k][j], bk[k][j] = c, i0
runs, j = [], M
for k in range(N, 0, -1):
    runs.append((bk[k][j], j))
    j = bk[k][j]
runs.reverse()
force = {}
for k, (i0, j) in enumerate(runs):
    a0, b0 = isl[i0][0], isl[j - 1][1]
    lo = (isl[i0 - 1][1] + a0) / 2 if i0 > 0 else 0.0
    hi = (b0 + isl[j][0]) / 2 if j < M else dur
    force[ids[k]] = [round(max(lo, a0 - 0.05), 3), round(min(hi, b0 + 0.12), 3)]
    h = hyp(i0, j)
    e = ed(refs[k - 0], kana(h))
    print(f"  {ids[k]:18s} {force[ids[k]][0]:7.2f}–{force[ids[k]][1]:7.2f} 差 {e:2d}/{len(refs[k])}  "
          f"原「{L[ids[k]]['tts']}」→「{h}」")
job["force"] = force
job["force_note"] = "voice_resplit.py 以聽寫配對決定的切點"
(d / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"總差距 {dp[N][M]:.0f}；已寫入 {d / 'job.json'} 的 force")
