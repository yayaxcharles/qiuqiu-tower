#!/bin/sh
# 事件與各畫面重跑（改了事件文字讓位之後）：EDGE_PORT=5241 EDGE_OUT=<資料夾> sh tools/i18n-edge/run-events.sh <記錄夾>
LOG=${1:-/tmp/i18n-edge-logs2}
mkdir -p "$LOG"
run() { name=$1; shift; node "$@" > "$LOG/$name.log" 2>&1 & }
for lang in en ja zh; do for vp in desk phone; do
  run "events_${lang}_${vp}" tools/i18n-edge/events.mjs $lang $vp
done; done
run screens_en tools/i18n-edge/screens.mjs en desk,phone
run screens_ja tools/i18n-edge/screens.mjs ja desk,phone
run misc tools/i18n-edge/misc.mjs
wait
echo done > "$LOG/ALL_DONE"
