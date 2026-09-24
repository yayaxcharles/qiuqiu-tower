"""把無損（VP8L）的大張 WebP 改存成「看不出差別的有損」WebP（2026-09-24 使用者：「我想優化載入的速度」
「如果有圖片之類的，你可以壓縮且無損的話都可以比照辦理」）。

- 顏色 q85、透明層維持無損（`alpha_quality=100`）：放大三倍才看得出一點點差別（對照圖在 `docs/審查報告/2026-09-24_讀取加速/`）。
- **只動無損的**：已經是有損（VP8／VP8X 有損）的不再壓，重跑不會一代一代越壓越糊。
- 小於門檻（預設 40 KB）的不動：省不了多少，徒增風險。新的沒有比原本小兩成以上也不換。
- 驗收紀錄與測試會釘圖檔的 sha256（確認上線的是驗收過的那一版）：換掉的每一張記「舊→新」，
  版控裡的文字檔（json／ts／md／py／txt／mjs）凡寫著舊雜湊的一律換成新雜湊，對照表存在
  `docs/審查報告/2026-09-24_讀取加速/sha_map_<名稱>.json`。

**之後重新打包動作圖、重生事件圖（那些工具存的是無損）之後，再跑一次這支就好。**

用法：
    python tools/recompress_webp.py public/assets/motion --name motion
    python tools/recompress_webp.py public/assets/bg public/assets/cards --name art --min-kb 40
    python tools/recompress_webp.py public/assets/bg --dry            # 只算，不寫
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/審查報告/2026-09-24_讀取加速'
QUALITY = 85


def is_lossless(raw: bytes) -> bool:
    """WebP 容器：`VP8L` 是無損；`VP8X` 擴充容器裡有 `VP8L` 區塊也是無損（有損的帶透明是 `ALPH`＋`VP8 `）"""
    if raw[:4] != b'RIFF' or raw[8:12] != b'WEBP':
        return False
    if raw[12:16] == b'VP8L':
        return True
    return raw[12:16] == b'VP8X' and b'VP8L' in raw[30:200]


def encode(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=QUALITY, alpha_quality=100, method=6)
    return buf.getvalue()


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('dirs', nargs='+')
    ap.add_argument('--name', default='art')
    ap.add_argument('--min-kb', type=int, default=40)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    mapping: dict[str, dict] = {}
    before = after = seen = 0
    for d in a.dirs:
        for f in sorted((ROOT / d).rglob('*.webp')):
            raw = f.read_bytes()
            seen += len(raw)
            if len(raw) < a.min_kb * 1024 or not is_lossless(raw):
                continue
            im = Image.open(io.BytesIO(raw))
            data = encode(im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB'))
            if len(data) > len(raw) * 0.8:
                continue
            rel = f.relative_to(ROOT).as_posix()
            mapping[hashlib.sha256(raw).hexdigest()] = {'file': rel, 'new': hashlib.sha256(data).hexdigest(), 'before': len(raw), 'after': len(data)}
            before += len(raw)
            after += len(data)
            if not a.dry:
                f.write_bytes(data)
            print(f'{rel:70s} {len(raw) // 1024:5d} → {len(data) // 1024:5d} KB', flush=True)
    print(f'掃了 {seen / 1048576:.1f} MB；換 {len(mapping)} 張：{before / 1048576:.1f} MB → {after / 1048576:.1f} MB（省 {(before - after) / 1048576:.1f} MB）')
    if a.dry or not mapping:
        return
    REPORT.mkdir(parents=True, exist_ok=True)
    (REPORT / f'sha_map_{a.name}.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    tracked = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True).stdout.decode('utf-8').split('\0')
    pat = re.compile(r'\b[0-9a-f]{64}\b')
    touched = 0
    for rel in tracked:
        if not rel or not re.search(r'\.(json|ts|md|py|txt|mjs)$', rel) or rel.startswith('docs/審查報告/2026-09-24_讀取加速/'):
            continue
        p = ROOT / rel
        try:
            text = p.read_bytes().decode('utf-8')
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        hits = {m for m in pat.findall(text) if m in mapping}
        if not hits:
            continue
        for h in hits:
            text = text.replace(h, mapping[h]['new'])
        p.write_bytes(text.encode('utf-8'))
        touched += 1
        print(f'  換雜湊 {rel}（{len(hits)} 個）', flush=True)
    print(f'改了 {touched} 份紀錄')


if __name__ == '__main__':
    main()
