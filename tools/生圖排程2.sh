#!/bin/sh
# 收尾批（2026-09-12 深夜）：兩張走鐘的劇情圖 → 一張壞掉的牌面 → 剩下的牌面 → 事件圖 104 張。
# 等待條件用 `until`（行程還在＝離開碼非 0＝失敗，所以是 until 不是 while，寫反過三次）。
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp
wait_for() {
  until powershell -NoProfile -Command "exit @(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -match '$1' }).Count" 2>/dev/null; do
    sleep 45
  done
}
integrate() {
  tool="$1"; shift; pat="$1"; shift
  files=$(cd tools/codex_raw 2>/dev/null && ls $pat 2>/dev/null | grep -v '\.previous-')
  if [ -n "$files" ]; then python "tools/$tool" "$@" $files || echo "!! $tool 進倉失敗"; else echo "!! 找不到 $pat"; fi
}

wait_for feifei_slides_redo
echo "== 兩張劇情圖重生完 =="
integrate add_screen_bg.py 'feifei_still_act2_smoke.png'
integrate add_screen_bg.py 'feifei_still_act2_voice.png'

python tools/codex_gen.py tools/codex_jobs/feifei_card_redo.json --ref tools/ref/feifei_ref.png > $L/feifei_cardredo.log 2>&1
echo "== 縮一團重生完 =="
integrate add_card_art.py 'card_feifei_suoyituan.png'

python tools/codex_gen.py tools/codex_jobs/feifei_shared_cards.json --ref tools/ref/feifei_ref.png > $L/feifei_all.log 2>&1
echo "== 牌面補完 =="

python tools/codex_gen.py tools/codex_jobs/feifei_events.json --ref tools/ref/feifei_ref.png > $L/feifei_events2.log 2>&1
echo "== 事件圖補完 =="
integrate add_event_art.py 'event_feifei_*.png'
