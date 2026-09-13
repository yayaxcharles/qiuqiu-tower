#!/bin/sh
# 2026-09-14：除錯模式抓到菲菲四個專屬事件的開場插圖全部沒生（結果圖都有，只缺開場那張）。
set -u
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp

rm -f $L/fei_ev4.log
python tools/codex_gen.py --ref tools/ref/feifei_ref.png tools/codex_jobs/feifei_event_missing4.json \
  > $L/fei_ev4.log 2>&1
echo "== 四張完 =="
tail -1 $L/fei_ev4.log

files=$(python -c "
import json,sys
d=json.load(open('tools/codex_jobs/feifei_event_missing4.json',encoding='utf-8'))
sys.stdout.write('\n'.join(d))          # 不要用 print：Windows 會多一個 \r
" | tr -d '\r')
# shellcheck disable=SC2086
python tools/add_event_art.py $files
python tools/check_haze.py
echo "== 結束 =="
