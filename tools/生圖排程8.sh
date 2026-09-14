#!/bin/sh
# 2026-09-13 下午：接在「走鐘 7 張」後面，跑全圖自檢抓到的 14 張。
#
# 一次只跑一批，所以先等前一批印出「結束：」。
# 進倉前先把舊原稿改名留底——不然生圖會「已存在跳過」、整批空轉還印成功
#（art_rules.py 第九個雷）。
set -u
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp

n=0
until grep -q '^結束：' $L/fix7.log 2>/dev/null; do
  n=$((n + 1))
  [ "$n" -gt 90 ] && { echo "!! 等太久，前一批可能夭折了，看 $L/fix7.log"; exit 1; }
  sleep 60
done
echo "== 前一批（走鐘 7 張）結束 =="
tail -1 $L/fix7.log

# 前一批進倉
python - <<'PY' | tr -d '\r' > $L/fix7_files.txt
import json, pathlib, sys
raw = pathlib.Path('tools/codex_raw')
out = [k for k in json.loads(pathlib.Path('tools/codex_jobs/feifei_fix_0913.json').read_text(encoding='utf-8'))
       if (raw / k).exists()]
sys.stdout.write('\n'.join(out))
PY
evs=$(grep '^event_' $L/fix7_files.txt || true)
cards=$(grep '^card_' $L/fix7_files.txt || true)
[ -n "$evs" ] && { python tools/add_event_art.py $evs || echo "!! 事件圖進倉失敗"; }
[ -n "$cards" ] && { python tools/add_card_art.py $cards || echo "!! 牌面進倉失敗"; }

# ---- 第二批：自檢抓到的 14 張 ----
# 舊原稿先改名留底
python - <<'PY'
import datetime, json, pathlib
stamp = datetime.date.today().strftime('%Y%m%d') + 'c'
raw = pathlib.Path('tools/codex_raw')
for k in json.loads(pathlib.Path('tools/codex_jobs/feifei_fix_0913b.json').read_text(encoding='utf-8')):
    p = raw / k
    if p.exists():
        p.rename(p.with_name(f'{p.stem}.previous-{stamp}.png'))
        print('留底', p.name)
PY

rm -f $L/fix14.log
python tools/codex_gen.py tools/codex_jobs/feifei_fix_0913b.json > $L/fix14.log 2>&1
echo "== 自檢那 14 張結束 =="
tail -1 $L/fix14.log

python - <<'PY' | tr -d '\r' > $L/fix14_files.txt
import json, pathlib, sys
raw = pathlib.Path('tools/codex_raw')
out = [k for k in json.loads(pathlib.Path('tools/codex_jobs/feifei_fix_0913b.json').read_text(encoding='utf-8'))
       if (raw / k).exists()]
sys.stdout.write('\n'.join(out))
PY
# 劇情立繪走 add_screen_bg（畫布不同），事件圖走 add_event_art
stills=$(grep '^feifei_still_' $L/fix14_files.txt || true)
evs=$(grep '^event_' $L/fix14_files.txt || true)
[ -n "$evs" ] && { python tools/add_event_art.py $evs || echo "!! 事件圖進倉失敗"; }
[ -n "$stills" ] && { python tools/add_screen_bg.py $stills || echo "!! 立繪進倉失敗"; }
echo "== 全部結束 =="
