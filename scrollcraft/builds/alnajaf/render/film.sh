#!/usr/bin/env bash
# Take a master clip and produce the page's assets: the desktop scrub encode, the portrait
# phone encode (centre crop), and a poster from each. Usage:
#   bash render/film.sh <master.mp4> <name>          e.g. bash render/film.sh source/aisle-take1.mp4 lab
#   bash render/film.sh <master.mp4> <name> 40 60    optional crop centre in % (x y) for the phone cut
set -euo pipefail
cd "$(dirname "$0")/.."
SK=/home/user/alnajaf-lab/.claude/skills/scroll-craft/scripts
IN=${1:?master clip}; NAME=${2:?asset name}; CX=${3:-50}; CY=${4:-50}
mkdir -p out assets
# desktop: the master as is, dense keyframes
bash "$SK/encode.sh" "$IN" "assets/$NAME.mp4"
# phone: 9:16 centre crop from the master, then the mobile encode
ffmpeg -v error -y -i "$IN" -vf "crop=ih*9/16:ih:(iw-ih*9/16)*$CX/100:0,scale=720:1280:flags=lanczos" -c:v libx264 -preset fast -crf 14 -an "out/$NAME-portrait.mp4"
bash "$SK/encode.sh" "out/$NAME-portrait.mp4" "assets/$NAME-m.mp4" mobile
# posters are the first frame of the encoded files, so the hand-off is seamless
ffmpeg -v error -y -i "assets/$NAME.mp4" -frames:v 1 -vf "scale=1920:-2" -c:v libwebp -quality 82 "assets/$NAME.webp"
ffmpeg -v error -y -i "assets/$NAME-m.mp4" -frames:v 1 -c:v libwebp -quality 82 "assets/$NAME-p.webp"
ls -la assets | grep "$NAME"
