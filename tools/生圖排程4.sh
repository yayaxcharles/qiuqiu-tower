#!/bin/sh
# 收尾（2026-09-13 凌晨）：新事件結果圖 4 → 牌面剩下的 → 事件圖剩下的 → 頭髮重做 13。
# 每支 codex_gen 自己會跳過已經生好的，中斷重跑不會重做。
# 牌面的進倉由 watch_art.py 每 90 秒自動做，這裡只接其他類。
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp

integrate() {
  tool="$1"; shift
  pat="$1"; shift
  files=$(cd tools/codex_raw 2>/dev/null && ls $pat 2>/dev/null | grep -v '\.previous-')
  if [ -n "$files" ]; then
    python "tools/$tool" "$@" $files || echo "!! $tool 進倉失敗，等人看一眼"
  else
    echo "!! 找不到 $pat，這一批可能沒生出來"
  fi
}

python tools/codex_gen.py tools/codex_jobs/feifei_new_events.json --ref tools/ref/feifei_ref.png > $L/feifei_newev.log 2>&1
echo "== 新事件結果圖 4 張完 =="
integrate add_event_art.py 'event_feifei_pouch_*.png'
integrate add_event_art.py 'event_feifei_signal_*.png'

python tools/codex_gen.py tools/codex_jobs/feifei_shared_cards.json --ref tools/ref/feifei_ref.png > $L/feifei_all.log 2>&1
echo "== 牌面補完 =="

python tools/codex_gen.py tools/codex_jobs/feifei_events.json --ref tools/ref/feifei_ref.png > $L/feifei_events4.log 2>&1
echo "== 事件圖補完 =="

python tools/codex_gen.py tools/codex_jobs/feifei_hair_redo_ev.json --ref tools/ref/feifei_ref.png > $L/feifei_hair_ev.log 2>&1
echo "== 頭髮重做（事件）完 =="
integrate add_event_art.py 'event_feifei_*.png'

python tools/codex_gen.py tools/codex_jobs/feifei_hair_redo_st.json --ref tools/ref/feifei_story_ref.png > $L/feifei_hair_st.log 2>&1
echo "== 頭髮重做（劇情）完 =="
integrate add_screen_bg.py 'feifei_still_*.png'
echo "== 全部結束 =="
