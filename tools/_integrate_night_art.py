# -*- coding: utf-8 -*-
"""把夜間生圖批次（節點畫面變體、地圖長條圖）從 codex_raw 搬進 art_inbox 並打包。已存在的 inbox 檔不覆蓋。"""
import shutil, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
RAW, INBOX = ROOT / 'tools/codex_raw', ROOT / 'tools/art_inbox'
names = [f'screen_{k}_{a}.png' for k in ('shop', 'rest', 'chest', 'event') for a in ('mid', 'top')] + ['map_tall_mid.png', 'map_tall_top.png']
moved, missing = [], []
for n in names:
    src, dst = RAW / n, INBOX / n
    if not src.exists():
        missing.append(n); continue
    if not dst.exists():
        shutil.copy2(src, dst)
    moved.append(n)
print('進 inbox：', moved)
print('還沒生出來：', missing)
subprocess.run([sys.executable, str(ROOT / 'tools/build_art_inbox.py')], check=False)
