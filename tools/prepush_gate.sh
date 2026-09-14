#!/bin/sh
# 推上線之前的閘門（2026-09-14）。由 .git/hooks/pre-push 呼叫，不用手動跑。
#
# 為什麼要有這個：2026-09-13 一天之內部署紅了八次，線上停在凌晨那一版一整天。
# 八次的病根分兩種，這支擋第一種、`tools/deploy.sh` 擋第二種：
#
#   1. **推出去的東西本身就是紅的。** 除錯畫面那筆（`19f36ce`）在本機根本沒跑完測試就推了，
#      掃描測試在雲端當場紅；而且就算本機跑過，我看結果用的是 `tail -3`，剛好把紅的那行截掉。
#   2. **推完沒看部署。** `git push` 成功只代表檔案傳上去了，雲端的測試跟打包紅了照樣是「推成功」。
#
# 這裡的做法是**在「要推的那一筆提交」上**跑一次跟雲端 `deploy.yml` 一樣的兩步
#（`npm test`、`npm run build`），紅了就不讓它推出去。
#
# **為什麼不直接在工作目錄跑**：工作目錄裡常常有還沒提交的東西（生到一半的圖、改到一半的檔）。
# 最常見的雲端紅燈是「新檔案忘了 git add」——工作目錄有、提交裡沒有，本機跑當然是綠的。
# 所以另開一個暫時的工作目錄，只放那一筆提交的內容，node_modules 借用現在這份（連結，不重裝）。
#
# 只擋會觸發部署的推送：推到 coopdeploy 或 origin 的 main。其他分支照常推。
# 真的要跳過（例如只改文件又急著推）：git push --no-verify —— 但那樣就是自己負責。

set -u
remote="$1"
case "$remote" in
  coopdeploy|origin) ;;
  *) exit 0 ;;
esac

zero=0000000000000000000000000000000000000000
sha=""
while read -r local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ] && [ "$local_sha" != "$zero" ]; then
    sha="$local_sha"
  fi
done
[ -n "$sha" ] || exit 0

top=$(git rev-parse --show-toplevel)
common=$(cd "$(git rev-parse --git-common-dir)" && pwd)
tmp="$(cygpath -u "$TEMP")/qiuqiu_gate_$$"
log="$tmp.log"
short=$(git rev-parse --short "$sha")
# 鉤子是被 git 叫起來的，環境裡可能帶著指向「這個」工作目錄的 GIT_DIR；
# 不清掉的話，暫時工作目錄裡跑的任何 git 指令都會跑回原本那份
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX

cleanup() {
  cd "$top" || return
  # 先拆掉借來的 node_modules 連結、確認拆掉了才刪目錄：
  # 連結還在的時候 remove --force，有可能順著連結把真的那份 node_modules 一起刪掉
  if [ -e "$tmp/node_modules" ]; then
    MSYS_NO_PATHCONV=1 cmd /c rmdir "$(cygpath -w "$tmp/node_modules")" >/dev/null 2>&1
  fi
  if [ -e "$tmp/node_modules" ]; then
    echo "[推送閘門] 拆不掉借來的 node_modules 連結，暫時工作目錄先留著沒刪：$tmp"
    return
  fi
  git worktree remove --force "$tmp" >/dev/null 2>&1
  git worktree prune >/dev/null 2>&1
}
trap cleanup EXIT

echo "[推送閘門] 在 $short 上跑測試與打包（跟雲端一樣的兩步），約一到兩分鐘…"
git worktree prune >/dev/null 2>&1
git worktree add --detach "$tmp" "$sha" >/dev/null 2>&1 || { echo "[推送閘門] 開暫時工作目錄失敗"; exit 1; }
# MSYS_NO_PATHCONV：不加的話 Git Bash 會把 `/J` 當成路徑改寫成 `J:\`，mklink 直接失敗
MSYS_NO_PATHCONV=1 cmd /c mklink /J "$(cygpath -w "$tmp/node_modules")" "$(cygpath -w "$top/node_modules")" >/dev/null 2>&1 \
  || { echo "[推送閘門] 借用 node_modules 失敗"; exit 1; }

cd "$tmp" || exit 1
if ! npx vitest run > "$log" 2>&1; then
  echo "[推送閘門] ✗ 測試紅了，這次不推。紅的是："
  grep -E "FAIL |Test Files |Tests " "$log" | head -20
  echo "（完整輸出：$(cygpath -w "$log")）"
  exit 1
fi
grep -E "Test Files |Tests " "$log"
# 打包編號用這一筆提交（雲端的 Actions 用 GITHUB_SHA，是同一個值）：兩邊打出來的主程式才會一模一樣，
# `tools/deploy.sh` 第三步比對檔名才有意義（2026-09-14 用時間當編號，第三步必定對不上）
# 網址路徑照要推的遠端帶（`vite.config.ts` 的 `SITE_NAME`）：連線版倉庫是 qiuqiu-tower-coop、單機版是 qiuqiu-tower。
# 雲端照 GITHUB_REPOSITORY 決定同一個值，兩邊主程式才會一模一樣。
# 傳倉庫名不傳路徑：Git Bash 會把「/qiuqiu-tower/」這種環境變數換成 Windows 路徑（實測變 /Program Files/Git/…）
case "$remote" in
  coopdeploy) site_name=qiuqiu-tower-coop ;;
  *) site_name=qiuqiu-tower ;;
esac
if ! BUILD_TAG="$sha" SITE_NAME="$site_name" npm run build >> "$log" 2>&1; then
  echo "[推送閘門] ✗ 打包失敗（型別或 vite），這次不推："
  grep -E "error|Error" "$log" | head -20
  echo "（完整輸出：$(cygpath -w "$log")）"
  exit 1
fi

# 記下這一筆打出來的主程式檔名，`tools/deploy.sh` 部署完拿去跟線上比
main_js=$(ls dist/assets/ | grep -E '^main-.*\.js$' | head -1)
echo "$sha $main_js" > "$common/qiuqiu_gate_last"
echo "[推送閘門] ✓ 綠的，放行（主程式 $main_js）"
rm -f "$log"
exit 0
