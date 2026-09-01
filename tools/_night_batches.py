# -*- coding: utf-8 -*-
"""2026-09-02 夜間生圖：兩批依序跑（codex_gen.py 鐵則 2：多批在同一支腳本裡排隊，不靠偵測行程）。"""
import subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
runs = [
    [PY, str(ROOT / 'tools/codex_gen.py'), str(ROOT / 'tools/codex_jobs/screens_act23.json'), '--timeout', '900'],
    [PY, str(ROOT / 'tools/codex_gen.py'), str(ROOT / 'tools/codex_jobs/wolf_concept.json'), '--timeout', '900',
     '--ref', str(ROOT / 'tools/art_inbox/hero_ninja.png')],
]
for cmd in runs:
    print('>>>', ' '.join(cmd), flush=True)
    subprocess.run(cmd)
print('ALL BATCHES DONE', flush=True)
