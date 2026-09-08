# -*- coding: utf-8 -*-
"""
add_event_art.py — 只把指定的幾張事件插圖進倉，不動收件匣裡其他五百多張。

用法：python tools/add_event_art.py event_toll_again_paid.png event_robin_feast.png ...
  來源先找 tools/codex_raw/，找不到再找 tools/art_inbox/。處理方式跟 build_art_inbox.py 的事件那段
  一模一樣（去背、不裁、縮到 560x420、寫進 manifest 的 bg["bg/event_<id>"]），並把原稿複製一份進
  tools/art_inbox/，整批重跑時才不會漏掉它。
  整批重跑 build_art_inbox.py 會把 197 張 WebP 重新編碼一遍（2026-09-06 踩過），補幾張就用這支。
  事件畫面靠事件編號自動找圖（event.ts 的 artUrl('bg', `bg/event_<id>`)），events.ts 不用改。
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_art_inbox import INBOX, MANIFEST, OUT  # noqa: E402
from chroma_key import CARD_BAND, CARD_HARD, CARD_SOFT, key_out  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"


def main() -> None:
    names = sys.argv[1:]
    if not names:
        sys.exit(__doc__)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest.setdefault("bg", {})
    for name in names:
        if not name.startswith("event_") or not name.endswith(".png"):
            print(f"檔名要是 event_<事件編號>.png：{name}，略過")
            continue
        src = RAW / name if (RAW / name).exists() else INBOX / name
        if not src.exists():
            print(f"找不到 {name}（codex_raw 與 art_inbox 都沒有），略過")
            continue
        eid = Path(name).stem[len("event_"):]
        keyed = key_out(Image.open(src), CARD_SOFT, CARD_HARD, CARD_BAND, crop=False)
        dst = OUT / "bg" / f"event_{eid}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        keyed.resize((560, 420), Image.LANCZOS).save(dst, "WEBP", quality=84, method=6)
        manifest["bg"][f"bg/event_{eid}"] = dst.relative_to(OUT.parent).as_posix()
        if src != INBOX / name:
            shutil.copy2(src, INBOX / name)
        print(f"事件插圖 event_{eid}.webp {dst.stat().st_size // 1024} KB")
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("manifest.json 已併入")


if __name__ == "__main__":
    main()
