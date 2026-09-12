#!/bin/sh
# 收尾：牌面剩 18 → 事件圖剩 7 → 頭髮重做 12（事件 9、劇情 4）。
# 等待用 `until`（行程還在＝離開碼非 0＝失敗）。
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp
wait_for() {
  until powershell -NoProfile -Command "exit @(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -match '$1' }).Count" 2>/dev/null; do sleep 45; done
}
integrate() {
  tool="$1"; shift; pat="$1"; shift
  files=$(cd tools/codex_raw 2>/dev/null && ls $pat 2>/dev/null | grep -v '\.previous-')
  if [ -n "$files" ]; then python "tools/$tool" "$@" $files || echo "!! $tool 進倉失敗"; else echo "!! 找不到 $pat"; fi
}

wait_for feifei_shared_cards
echo "== 牌面補完 =="

python tools/codex_gen.py tools/codex_jobs/feifei_events.json --ref tools/ref/feifei_ref.png > $L/feifei_events3.log 2>&1
echo "== 事件圖補完 =="

python tools/codex_gen.py tools/codex_jobs/feifei_hair_redo_ev.json --ref tools/ref/feifei_ref.png > $L/feifei_hair_ev.log 2>&1
echo "== 頭髮重做（事件）完 =="
integrate add_event_art.py 'event_feifei_*.png'

python tools/codex_gen.py tools/codex_jobs/feifei_hair_redo_st.json --ref tools/ref/feifei_story_ref.png > $L/feifei_hair_st.log 2>&1
echo "== 頭髮重做（劇情）完 =="
integrate add_screen_bg.py 'feifei_still_*.png'
echo "== 全部結束 =="
