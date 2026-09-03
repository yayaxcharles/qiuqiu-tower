# -*- coding: utf-8 -*-
"""怪物工作檯：把 docs/怪物工作檯.json（tools/dump_monsters.test.ts 倒出）＋素材包的立繪嵌進
tools/monster_workbench_template.html，產出單頁 HTML 給使用者在網頁上改數值、寫備註。
用法：python tools/build_monster_workbench.py [輸出路徑]
網頁按「儲存到這一頁」會把改過的 JSON 寫回同一頁（artifact 能力），之後用 tools/apply_monster_workbench.py 套回 enemies.ts。
"""
import base64, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'docs' / '怪物工作檯.json').read_text(encoding='utf-8'))
manifest = json.loads((ROOT / 'public' / 'assets' / 'manifest.json').read_text(encoding='utf-8'))
mon = manifest.get('monsters', {})

def b64(rel):
    # 縮成 160 高的小圖再嵌：整包原圖 7 MB 在雲端頁面開不起來，縮圖不到 1 MB
    from PIL import Image
    import io as _io
    p = ROOT / 'public' / rel
    if not p.exists(): return None
    im = Image.open(p).convert('RGBA'); im.thumbnail((200, 160))
    buf = _io.BytesIO(); im.save(buf, 'WEBP', quality=72, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

images = {}
for m in data['monsters']:
    entry = mon.get(m['art']) or mon.get(m['art'].replace('codex/', ''))
    if not entry: continue
    images[m['id']] = {k: b64(entry[k]) for k in ('idle', 'attack') if entry.get(k)}

tpl = (ROOT / 'tools' / 'monster_workbench_template.html').read_text(encoding='utf-8')
html = tpl.replace('__DATA__', json.dumps(data, ensure_ascii=False)).replace('__IMAGES__', json.dumps(images))
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs' / '怪物工作檯.html'
out.write_text(html, encoding='utf-8')
print(out, len(data['monsters']), '隻', round(len(html) / 1e6, 2), 'MB')
