#!/bin/sh
# 菲菲的開頭影片：把合成檔與素材丟進 Remotion 專案算繪，成品直接放進遊戲的 public/video/opening_feifei.mp4
# 用法：sh tools/video/feifei_opening/render.sh   （家用機；Remotion 專案在 F:\ClaudeWork\remotion-video，可用 RV=… 改）
# 字型走 @remotion/google-fonts（Noto Sans TC／Noto Serif TC／EB Garamond），算繪時要有網路。
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
GAME=$(cd "$HERE/../../.." && pwd)
RV=${RV:-/f/ClaudeWork/remotion-video}
OUT="$GAME/public/video/opening_feifei.mp4"

mkdir -p "$RV/src/qiuqiu" "$RV/public/qiuqiu/bg" "$RV/public/qiuqiu/sprites" "$RV/public/qiuqiu/bgm"
cp "$HERE/FeifeiOpening.tsx" "$HERE/entry.tsx" "$RV/src/qiuqiu/"
for b in screen_result_win screen_title low; do cp "$GAME/public/assets/bg/$b.webp" "$RV/public/qiuqiu/bg/"; done
for s in seclude idle1 idle3 headbutt3; do cp "$GAME/public/assets/sprites/boss/$s.webp" "$RV/public/qiuqiu/sprites/"; done
for s in feifei_throw feifei_lose feifei_stealth feifei_win ninja_dash; do cp "$GAME/public/assets/sprites/hero/$s.webp" "$RV/public/qiuqiu/sprites/"; done
cp "$GAME/public/bgm/act1.mp3" "$RV/public/qiuqiu/bgm/"

cd "$RV"
npx remotion render src/qiuqiu/entry.tsx FeifeiOpening "$OUT" --codec h264 --crf 28 --audio-codec aac --audio-bitrate 128k
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of default=nw=1 "$OUT"
