#!/bin/sh
# 菲菲剩下的生圖，一批接一批、生完就接進倉（2026-09-12）。
#
# **同時只跑一批**是 codex_gen.py 的規矩，所以整支用 `;` 串起來、不用 `&`。
# 順序＝先把每一類都補齊，最後才回頭磨牌面（牌面沒補到的會退回球球那張圖，
# 是這幾類裡最不刺眼的；地圖頭像、結局插圖放錯人則是一眼就看得出來）：
#   劇情 8（跑著）→ 地圖頭像 3 → 立繪 6 → 事件 41 → 剩下的牌面 ~80
#
# 每支 codex_gen 自己會跳過已經生好的，中斷重跑不會重做。
# 牌面的進倉由 `watch_art.py` 每 90 秒自動做，這裡只接其他三類。
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp

# 等某一批跑完。
#
# **這一行寫反過兩次**，記一下怎麼想才對：
#   `powershell "exit <行程數>"` → 行程還在＝離開碼非 0＝**失敗**；跑完＝0＝**成功**。
#   `until CMD; do …; done` ＝「CMD 一直失敗就一直等，成功才往下」——正是要的。
#   寫成 `while CMD` 或加 `!` 都會反過來，一啟動就往下衝，兩批一起搶額度。
# 另外 `pgrep -f` 在 Git Bash 下看不到 Windows 的 python，不能拿來判斷。
wait_for() {
  until powershell -NoProfile -Command "exit @(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -match '$1' }).Count" 2>/dev/null; do
    sleep 60
  done
}

# 進倉：把 tools/codex_raw 裡符合樣式、而且還沒進倉的檔名餵給對應的工具。
# 找不到檔案就跳過（那一批可能整批失敗），不讓整支排程斷在這裡。
integrate() {
  tool="$1"; shift
  pat="$1"; shift
  files=$(cd tools/codex_raw 2>/dev/null && ls $pat 2>/dev/null)
  if [ -n "$files" ]; then
    python "tools/$tool" "$@" $files || echo "!! $tool 進倉失敗，等人看一眼"
  else
    echo "!! 找不到 $pat，這一批可能沒生出來"
  fi
}

wait_for feifei_slides
echo "== 劇情八張結束 =="
integrate add_screen_bg.py 'feifei_still_act*.png'
integrate add_screen_bg.py 'feifei_still_embrace.png'
integrate add_screen_bg.py 'feifei_still_home.png'

python tools/codex_gen.py tools/codex_jobs/feifei_map_hero.json > $L/feifei_maphero.log 2>&1
echo "== 地圖頭像結束 =="
integrate add_icons.py 'map_hero_feifei_*.png'

python tools/codex_gen.py tools/codex_jobs/feifei_poses6.json --ref tools/ref/feifei_ref.png > $L/feifei_poses.log 2>&1
echo "== 立繪六張結束 =="
# 立繪要挑同一批的基準圖，不然換姿勢時角色會忽大忽小（見 add_sprite.py 的說明）
integrate add_sprite.py 'hero_feifei_down.png' --group hero --baseline feifei_attack
integrate add_sprite.py 'hero_feifei_choke.png' --group hero --baseline feifei_attack
integrate add_sprite.py 'hero_feifei_claw.png' --group hero --baseline feifei_attack
integrate add_sprite.py 'hero_feifei_kick.png' --group hero --baseline feifei_attack
integrate add_sprite.py 'hero_feifei_dash.png' --group hero --baseline feifei_attack
integrate add_sprite.py 'hero_feifei_punch.png' --group hero --baseline feifei_attack

python tools/codex_gen.py tools/codex_jobs/feifei_events.json --ref tools/ref/feifei_ref.png > $L/feifei_events.log 2>&1
echo "== 事件 41 張結束 =="
integrate add_event_art.py 'event_feifei_*.png'

python tools/codex_gen.py tools/codex_jobs/feifei_shared_cards.json --ref tools/ref/feifei_ref.png > $L/feifei_all.log 2>&1
echo "== 牌面補完（進倉由 watch_art.py 做） =="
