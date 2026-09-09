#!/usr/bin/env bash
# Lighter encodes of the same clips for the single-file artifact, which must stay under 16 MB
# with every clip embedded as base64. Same dense keyframes, higher crf, desktop capped at 1080p.
set -euo pipefail
cd "$(dirname "$0")/.."
SK=/home/user/alnajaf-lab/.claude/skills/scroll-craft/scripts
mkdir -p preview-assets
for n in lab read drop; do
  [ -f "assets/$n.mp4" ] || continue
  bash "$SK/encode.sh" "assets/$n.mp4" "preview-assets/$n.mp4" desktop 28
  bash "$SK/encode.sh" "assets/$n-m.mp4" "preview-assets/$n-m.mp4" mobile 30
  cp "assets/$n.webp" "assets/$n-p.webp" preview-assets/
done
du -ch preview-assets/*.mp4 | tail -1
