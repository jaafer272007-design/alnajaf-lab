#!/usr/bin/env bash
# Encode every rendered master into scrub-ready clips and pull posters from the ENCODED files.
set -euo pipefail
cd "$(dirname "$0")/.."
SK=/home/user/alnajaf-lab/.claude/skills/scroll-craft
NAMES=(drop plasma crowd membrane letter reading report)
for i in "${!NAMES[@]}"; do
  n=${NAMES[$i]}
  [ -f "out/$i-$n-l.mp4" ] || { echo "missing out/$i-$n-l.mp4"; continue; }
  bash "$SK/scripts/encode.sh" "out/$i-$n-l.mp4" "assets/leg$i.mp4"
  if [ -f "out/$i-$n-p.mp4" ]; then
    ffmpeg -y -v error -i "out/$i-$n-p.mp4" -an -vf "scale=720:-2:flags=lanczos,format=yuv420p" -c:v libx264 -profile:v high -preset slow -crf 24 -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "assets/leg$i-m.mp4"
    ffmpeg -y -v error -i "assets/leg$i-m.mp4" -frames:v 1 -c:v libwebp -quality 82 "assets/p$i-p.webp"
  fi
  ffmpeg -y -v error -i "assets/leg$i.mp4" -frames:v 1 -vf scale=1600:-2 -c:v libwebp -quality 82 "assets/p$i.webp"
done
du -ch assets/*.mp4 | tail -1
