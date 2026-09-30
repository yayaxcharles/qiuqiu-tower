#!/bin/sh
# 修正前後對照：把極端版面檢查的各支腳本在本機開發伺服器上平行跑一輪，結果寫進 EDGE_OUT。
#   EDGE_PORT=5241 EDGE_OUT=<資料夾> sh tools/i18n-edge/run-all.sh <記錄夾>
# 需要先開 vite：npx vite --port 5241 --host 127.0.0.1 --strictPort
LOG=${1:-/tmp/i18n-edge-logs}
mkdir -p "$LOG"
run() { name=$1; shift; node "$@" > "$LOG/$name.log" 2>&1 & }
run hud tools/i18n-edge/hud-check.mjs en,ja,zh desk,phone ninja
run bless tools/i18n-edge/bless-check.mjs en,ja,zh desk,phone
run cards tools/i18n-edge/cards.mjs en,ja,zh desk,phone
for lang in en ja zh; do for vp in desk phone; do
  run "events_${lang}_${vp}" tools/i18n-edge/events.mjs $lang $vp
done; done
run screens_en tools/i18n-edge/screens.mjs en desk,phone
run screens_ja tools/i18n-edge/screens.mjs ja desk,phone
run tips tools/i18n-edge/tips-real.mjs en,ja,zh desk,phone
run intents tools/i18n-edge/intents.mjs en,ja desk,phone
run shoplines tools/i18n-edge/shop-lines.mjs en,ja desk,phone
run misc tools/i18n-edge/misc.mjs
wait
echo done > "$LOG/ALL_DONE"
