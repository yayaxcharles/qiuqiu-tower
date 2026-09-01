# -*- coding: utf-8 -*-
"""夜間第三批（地圖長條圖兩張）：等第一支排程在紀錄檔印出 ALL BATCHES DONE 才開跑（不靠偵測行程）。"""
import subprocess, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
LOG = Path(sys.argv[1])
while 'ALL BATCHES DONE' not in LOG.read_text(encoding='utf-8', errors='replace'):
    time.sleep(30)
cmd = [sys.executable, str(ROOT / 'tools/codex_gen.py'), str(ROOT / 'tools/codex_jobs/map_tall_act23.json'), '--timeout', '900']
print('>>>', ' '.join(cmd), flush=True)
subprocess.run(cmd)
print('BATCH 3 DONE', flush=True)
