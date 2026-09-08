#!/usr/bin/env bash
# The whole verification pass, in order. Serve first:
#   node ../../../.claude/skills/scroll-craft/scripts/serve.mjs --root . --port 4700 &
set -uo pipefail
cd "$(dirname "$0")/.."
SK=/home/user/alnajaf-lab/.claude/skills/scroll-craft
URL=${1:-http://localhost:4700}
strip() { sed 's/\x1b\[[0-9;]*m//g'; }
echo "== serving $(curl -s $URL | grep -o '<title>[^<]*</title>')"
echo; echo "== functional (controls, language, booking, fallbacks) =="
node render/functional.mjs --url $URL 2>&1 | grep -E '^(PASS|FAIL|ERRORS|  |all|[0-9]+ problem)'
for pass in "shots" "mobile --width 390 --height 844" "reduced --reduced-motion"; do
  name=${pass%% *}; rest=${pass#* }; [ "$name" = "$rest" ] && rest=""
  echo; echo "== shoot: $name =="; rm -rf lab/$name
  timeout 1500 node $SK/scripts/shoot.mjs --url $URL --out lab/$name $rest 2>&1 | strip | grep -vE '^  [0-9]+\.png' | grep -vE '^\s*$' | tail -12
done
echo; echo "== looks at the awkward sizes =="
node render/look.mjs --url $URL --out lab/look-wide --w 2000 --h 470 --stops 0,0.2,0.4,0.6,0.8,1 2>&1 | tail -3
node render/look.mjs --url $URL --out lab/look-ar --lang ar --stops 0,0.25,0.5,0.75,1 2>&1 | tail -3
