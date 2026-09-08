#!/usr/bin/env bash
# Lighter encodes for the single-file artifact, which has a 16MB ceiling and
# counts base64 (about +33%). Same dense GOP, so it still scrubs.
set -euo pipefail
cd "$(dirname "$0")/.."
DCRF=${1:-30}; MCRF=${2:-32}
mkdir -p preview-assets
NAMES=(drop plasma crowd membrane letter reading report)
for i in "${!NAMES[@]}"; do
  n=${NAMES[$i]}
  ffmpeg -y -v error -i "out/$i-$n-l.mp4" -an -vf "scale=-2:720:flags=lanczos,format=yuv420p" \
    -c:v libx264 -profile:v high -preset slow -crf "$DCRF" -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart "preview-assets/leg$i.mp4"
  ffmpeg -y -v error -i "out/$i-$n-p.mp4" -an -vf "scale=-2:854:flags=lanczos,format=yuv420p" \
    -c:v libx264 -profile:v high -preset slow -crf "$MCRF" -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "preview-assets/leg$i-m.mp4"
  ffmpeg -y -v error -i "preview-assets/leg$i.mp4" -frames:v 1 -vf scale=1100:-2 -c:v libwebp -quality 74 "preview-assets/p$i.webp"
  ffmpeg -y -v error -i "preview-assets/leg$i-m.mp4" -frames:v 1 -vf scale=560:-2 -c:v libwebp -quality 74 "preview-assets/p$i-p.webp"
  printf "%s:%s/%s " "$n" "$(du -k preview-assets/leg$i.mp4|cut -f1)k" "$(du -k preview-assets/leg$i-m.mp4|cut -f1)k"
done
echo; RAW=$(du -ck preview-assets/*.mp4 preview-assets/*.webp | tail -1 | cut -f1)
echo "raw ${RAW}k -> base64 approx $(( RAW * 4 / 3 / 1024 ))MB"
