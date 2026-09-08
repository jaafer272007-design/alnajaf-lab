#!/usr/bin/env bash
# The whole verification pass, in order. Serve first: serve.mjs --root . --port 4700
set -uo pipefail
cd "$(dirname "$0")/.."
SK=/home/user/alnajaf-lab/.claude/skills/scroll-craft
URL=${1:-http://localhost:4700}
strip() { sed 's/\x1b\[[0-9;]*m//g'; }
echo "== serving $(curl -s $URL | grep -o '<title>[^<]*</title>')"; for i in 0 1 2 3 4 5 6; do printf "leg$i %s  " "$(curl -s -o /dev/null -w '%{http_code}' $URL/assets/leg$i.mp4)"; done; echo
echo; echo "== seam joins (PSNR of leg N last frame vs leg N+1 first frame, encoded files) =="
for i in 0 1 2 3 4 5; do
  j=$((i+1))
  ffmpeg -v error -y -sseof -0.05 -i assets/leg$i.mp4 -frames:v 1 lab/seam-$i-last.png
  ffmpeg -v error -y -i assets/leg$j.mp4 -frames:v 1 lab/seam-$j-first.png
  psnr=$(ffmpeg -i lab/seam-$i-last.png -i lab/seam-$j-first.png -filter_complex psnr -f null - 2>&1 | grep -oE 'average:[0-9.]+|average:inf' | tail -1 | cut -d: -f2)
  echo "  leg$i -> leg$j  ${psnr} dB"
done
echo; echo "== worldflight-assert =="; timeout 600 node $SK/scripts/worldflight-assert.mjs --url $URL 2>&1 | strip | grep -E 'PASS|FAIL|passed'
for pass in "shots" "mobile --width 390 --height 844" "reduced --reduced-motion"; do
  name=${pass%% *}; rest=${pass#* }; [ "$name" = "$rest" ] && rest=""
  echo; echo "== shoot: $name =="; rm -rf lab/$name
  timeout 1200 node $SK/scripts/shoot.mjs --url $URL --out lab/$name $rest 2>&1 | strip | grep -vE '^  [0-9]+\.png' | grep -vE '^\s*$' | tail -20
done
