#!/usr/bin/env node
/*
 * stillmotion: render a scrub clip from a still image, locally and for free.
 *
 * This is a drop-in replacement for `kie.mjs shot` in the scroll-craft pipeline.
 * It occupies the same position and produces the same kind of file, so the rest
 * of the flow is unchanged:
 *
 *   node tools/stillmotion.mjs photo.jpg out/01.mp4 --move push --dur 5
 *   bash .claude/skills/scroll-craft/scripts/encode.sh out/01.mp4 assets/01.mp4
 *   bash .claude/skills/scroll-craft/scripts/encode.sh out/01.mp4 assets/01-m.mp4 mobile
 *
 * Why this works. A scrub clip is never played, it is scrubbed: the wheel is the
 * timeline and the visitor sets the rate. What the clip has to supply is a
 * continuous camera move through a scene, and a camera move across a large still
 * is exactly that. The frames a generative model would invent between the ends of
 * a slow push are frames nobody sees at a fixed rate anyway.
 *
 * Two consequences worth knowing:
 *
 * MOTION IS LINEAR, deliberately. Easing baked into the file fights the scroll,
 * because the scroll is already the easing. A clip that accelerates on its own
 * feels like it is fighting the hand.
 *
 * SUPERSAMPLED BY DEFAULT. zoompan rounds its crop window to whole pixels each
 * frame, which shows up as a shimmer on edges during a slow move. Rendering at
 * twice the target and scaling down halves that error. Measured here, it cut
 * frame-to-frame jitter on sharp geometry by about a quarter. On a very grainy
 * source the downscale can make grain shimmer instead, so --no-supersample is
 * there for that case.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const positional = args.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = args[i - 1];
  return !(prev && prev.startsWith("--") && !["no-supersample", "quiet"].includes(prev.slice(2)));
});

const [SRC, OUT] = positional;

const MOVES = ["push", "pull", "pan-l", "pan-r", "tilt-u", "tilt-d", "drift"];

if (!SRC || !OUT || has("help")) {
  console.error(`
stillmotion: a scrub clip from a still, rendered locally.

  node tools/stillmotion.mjs <still> <out.mp4> [options]

  --move <name>     ${MOVES.join(" | ")}          (default push)
  --dur <seconds>   clip length                    (default 5)
  --fps <n>         frame rate                     (default 30)
  --amount <n>      zoom or travel, 0.05 to 0.5    (default 0.18)
  --size <WxH>      output size                    (default 1920x1080)
  --poster <file>   also write a poster still (.webp)
  --no-supersample  render at target size, for very grainy sources
  --quiet           only print the output path

A push of 0.18 over five seconds is a slow, premium move. Past about 0.3 it
starts to read as a zoom effect rather than a camera.
`);
  process.exit(SRC && OUT ? 0 : 1);
}

// ------------------------------------------------------------------ ffmpeg --
// Same trap the skill warns about: a stripped ffmpeg reports a missing filter as
// a syntax error in your command. Count filters and refuse a thin build rather
// than emit a confusing failure later.
function pickFfmpeg() {
  const cands = [process.env.SCROLLCRAFT_FFMPEG, "ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"].filter(Boolean);
  for (const c of cands) {
    try {
      const out = execFileSync(c, ["-hide_banner", "-filters"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      if (out.split("\n").length > 200) return c;
    } catch { /* next */ }
  }
  return null;
}

const FFMPEG = pickFfmpeg();
if (!FFMPEG) {
  console.error("No full ffmpeg build found. A stripped build lacks zoompan and scale, and fails as a syntax error.\nInstall one (apt-get install ffmpeg) or set SCROLLCRAFT_FFMPEG.");
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  console.error(`Still not found: ${SRC}`);
  process.exit(1);
}

// ------------------------------------------------------------------- input --
const probe = (f) => {
  try {
    return execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f], { encoding: "utf8" }).trim();
  } catch { return null; }
};
const dims = probe(SRC);
if (!dims) { console.error(`Could not read ${SRC} as an image.`); process.exit(1); }
const [SW, SH] = dims.split(",").map(Number);

const MOVE = String(flag("move", "push"));
if (!MOVES.includes(MOVE)) {
  console.error(`Unknown move "${MOVE}". Pick one of: ${MOVES.join(", ")}`);
  process.exit(1);
}

const DUR = Number(flag("dur", 5));
const FPS = Number(flag("fps", 30));
const AMOUNT = Number(flag("amount", 0.18));
const SIZE = String(flag("size", "1920x1080"));
const [OW, OH] = SIZE.split("x").map(Number);

for (const [name, v, lo, hi] of [["dur", DUR, 0.5, 60], ["fps", FPS, 12, 60], ["amount", AMOUNT, 0.01, 0.6]]) {
  if (!Number.isFinite(v) || v < lo || v > hi) {
    console.error(`--${name} must be between ${lo} and ${hi}, got ${v}`);
    process.exit(1);
  }
}
if (!Number.isFinite(OW) || !Number.isFinite(OH)) { console.error(`--size must look like 1920x1080`); process.exit(1); }

const SUPER = !has("no-supersample");
const RW = SUPER ? OW * 2 : OW;
const RH = SUPER ? OH * 2 : OH;
const QUIET = has("quiet");

// A camera move crops into the source, so the source has to out-resolve the
// render or the move magnifies missing detail. Warn rather than refuse: the
// operator may know the still is good enough.
if (SW < RW || SH < RH) {
  console.error(`note: still is ${SW}x${SH}, rendering at ${RW}x${RH}. The move crops in, so detail is being invented by the scaler.`);
  if (SW < OW || SH < OH) console.error(`      it is smaller than the output itself, which will look soft.`);
}

const N = Math.max(2, Math.round(DUR * FPS));
const last = N - 1;

// ------------------------------------------------------------------- moves --
// zoompan works in source coordinates. `on` is the output frame index, so every
// expression below is a straight line from the first frame to the last.
const centreX = "iw/2-(iw/zoom/2)";
const centreY = "ih/2-(ih/zoom/2)";
const travelX = (fromLeft) => fromLeft ? `(iw-iw/zoom)*on/${last}` : `(iw-iw/zoom)*(1-on/${last})`;
const travelY = (fromTop) => fromTop ? `(ih-ih/zoom)*on/${last}` : `(ih-ih/zoom)*(1-on/${last})`;

// A pan needs standing room to travel through, so it holds a fixed zoom rather
// than changing one.
const held = (1 + AMOUNT).toFixed(4);

const SPEC = {
  push:    { z: `1+${AMOUNT}*on/${last}`,       x: centreX,       y: centreY },
  pull:    { z: `${held}-${AMOUNT}*on/${last}`, x: centreX,       y: centreY },
  "pan-r": { z: held,                            x: travelX(true),  y: centreY },
  "pan-l": { z: held,                            x: travelX(false), y: centreY },
  "tilt-d":{ z: held,                            x: centreX,        y: travelY(true) },
  "tilt-u":{ z: held,                            x: centreX,        y: travelY(false) },
  drift:   { z: `1+${(AMOUNT * 0.6).toFixed(4)}*on/${last}`,
             x: `(iw-iw/zoom)*(0.35+0.30*on/${last})`,
             y: `(ih-ih/zoom)*(0.65-0.30*on/${last})` },
}[MOVE];

const chain = [
  `zoompan=z='${SPEC.z}':x='${SPEC.x}':y='${SPEC.y}':d=1:s=${RW}x${RH}:fps=${FPS}`,
  SUPER ? `scale=${OW}:${OH}:flags=lanczos` : null,
  "format=yuv420p",
].filter(Boolean).join(",");

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });

if (!QUIET) {
  console.log(`stillmotion  ${MOVE}  ${DUR}s @ ${FPS}fps  ${OW}x${OH}${SUPER ? "  (supersampled)" : ""}`);
  console.log(`  source     ${SRC}  ${SW}x${SH}`);
}

// A generous CRF here: this is a master, and encode.sh re-encodes it with the
// dense keyframe interval that actually makes it scrub. Compressing hard twice
// just throws away detail the second pass would have kept.
try {
  execFileSync(FFMPEG, [
    "-v", "error", "-loop", "1", "-i", SRC, "-t", String(DUR), "-r", String(FPS),
    "-vf", chain, "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-an", "-y", OUT,
  ], { stdio: ["ignore", "inherit", "inherit"] });
} catch (e) {
  console.error(`render failed: ${e.message}`);
  process.exit(1);
}

const POSTER = flag("poster", null);
if (POSTER) {
  fs.mkdirSync(path.dirname(path.resolve(POSTER)), { recursive: true });
  try {
    execFileSync(FFMPEG, ["-v", "error", "-i", OUT, "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", "-y", POSTER], { stdio: "inherit" });
  } catch {
    console.error(`poster failed for ${POSTER}. Is libwebp present in this ffmpeg build?`);
  }
}

if (QUIET) {
  console.log(OUT);
} else {
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`  wrote      ${OUT}  ${kb} KB  (${N} frames)`);
  if (POSTER) console.log(`  poster     ${POSTER}`);
  console.log(`\n  Next, for a file that actually scrubs:`);
  console.log(`    bash .claude/skills/scroll-craft/scripts/encode.sh ${OUT} assets/NN.mp4`);
  console.log(`    bash .claude/skills/scroll-craft/scripts/encode.sh ${OUT} assets/NN-m.mp4 mobile`);
}
