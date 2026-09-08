# Skill inventory

Skills in this directory are picked up automatically by Claude Code for any
session opened on this repository. One directory per skill, each holding a
`SKILL.md` with YAML frontmatter.

| Skill | Source | Licence | Vendored at |
|---|---|---|---|
| [scroll-craft](scroll-craft/SKILL.md) | [nateherkai/scroll-craft](https://github.com/nateherkai/scroll-craft) | MIT | `0b81622`, 2026-09-04 |

## scroll-craft

Builds premium scroll-driven landing pages: it plans the visitor journey and
page grammar, generates or grades assets, writes semantic HTML on a token-driven
design floor, and screenshots its own output to verify contrast, motion, and
reduced-motion states. Say "scrollcraft", "layered hero", "scrollytelling", or
ask for a site that feels like an experience rather than a document.

### What was vendored

Upstream ships the skill as a Claude Code plugin, at
`plugins/nateherk-design/skills/scroll-craft/`. That directory is copied here
byte for byte, so a future update is a clean re-copy rather than a merge.

Two things differ from upstream, both deliberate:

- `LICENSE` is copied into the skill directory. Upstream keeps it at its repo
  root, and MIT requires the notice to travel with the copy.
- Upstream's `EXAMPLES.md` is not vendored. The registry's worked example points
  at it, and it is illustration only. Read it
  [upstream](https://github.com/nateherkai/scroll-craft/blob/main/EXAMPLES.md)
  when you want to see a filled-in fingerprint table.

To re-sync after an upstream release:

```bash
git clone --depth 1 https://github.com/nateherkai/scroll-craft /tmp/scroll-craft
rm -rf .claude/skills/scroll-craft
cp -R /tmp/scroll-craft/plugins/nateherk-design/skills/scroll-craft .claude/skills/
cp /tmp/scroll-craft/LICENSE .claude/skills/scroll-craft/LICENSE
```

Then update the version row in the table above.

### The workspace

The skill resolves its workspace to the nearest ancestor holding a `.git`, which
here means `scrollcraft/` at the repo root. Builds land in `scrollcraft/builds/`
and are gitignored. `scrollcraft/FINGERPRINTS.md` is tracked on purpose: it is
the registry the uniqueness gate reads, and it only does its job if it survives
between sessions.

### Environment

Run the preflight before a build, rather than checking by hand:

```bash
node .claude/skills/scroll-craft/scripts/doctor.mjs
```

A Claude Code cloud session starts with checks failing. The container is rebuilt
every session, so this runs once per session:

```bash
apt-get update -qq && apt-get install -y -qq ffmpeg          # required check
curl -sSLo /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y -qq /tmp/chrome.deb                        # see the codec note below
npm install --no-save --no-package-lock playwright-core       # at the repo root
```

Why each one:

- **ffmpeg** is absent, and it is the only check the preflight marks required.
  Do not point `SCROLLCRAFT_FFMPEG` at the build under `/opt/pw-browsers/`: that
  is Playwright's stripped copy, with no webp muxer and missing filters, and it
  fails as misleading syntax errors in your own commands. Ubuntu's package is a
  full build, verified here at 563 filters with libwebp present.
- **Google Chrome**, not the Chromium already on the box. This one is not
  optional and the preflight cannot see the problem, so it is written up on its
  own below.
- **playwright-core** resolves from the current directory upward, so installing
  it once at the repo root covers every build folder under it.

### The verification browser must decode H.264

The Chromium under `/opt/pw-browsers/` is Playwright's build, and Playwright
builds Chromium **without proprietary codecs**. It cannot decode H.264 at all:

```
canPlayType('video/mp4; codecs="avc1.42E01E")  ->  ""
loading a real clip  ->  DEMUXER_ERROR_NO_SUPPORTED_STREAMS
```

The skill's own `encode.sh` writes H.264 High profile, so every scrub clip a
build produces is undecodable by that browser. This fails in the worst possible
way. The harness runs, screenshots everything, and reports a page-wide
**FROZEN CLIP** warning, because from its side the clip genuinely never advances.
Nothing says the codec is missing. The temptation is to go and retune act spans
and dwell, which changes nothing, because the clip never loaded.

Real visitors are unaffected. Every shipping browser decodes H.264. It is only
the local verifier that is blind, which makes it worse, not better: the one step
the skill calls non-optional silently stops checking the thing it exists to
check.

Installing Google Chrome fixes it, and the harness prefers `/usr/bin/google-chrome`
over Chromium in its search order, so nothing needs configuring once it is there.
With Chrome the same build reports:

```
all 2 scrub clip(s) keep moving whenever they are on screen
```

Do not symlink Playwright's Chromium onto `/usr/bin/chromium` to satisfy the
preflight. The Chrome check passes and the clips still do not decode, which buys
a green preflight and a broken verification pass.

### Generating assets without paying

`KIE_AI_API_KEY` stays unset unless you are generating through kie.ai. The
network path to it works from here, confirmed by a proper authentication error
rather than a connection failure, so a key would function if you add one.

There are two free routes, and the skill endorses both.

**Layered planes, no video at all.** `hero-depth.md` is explicit that native
sticky scrolling with independently transformed planes gives depth without a
generated video, and the `parallax` device in `devices.md` is how. Cut the scene
into planes, give each a different rate, and the engine drives them from scroll.
This is the skill's own recommended premium hero and it costs nothing.

**Camera moves over supplied stills**, via `tools/stillmotion.mjs` in this
repository. It renders a real scrub clip from a photograph and occupies the same
pipeline position as the paid `kie.mjs shot` step:

```bash
node tools/stillmotion.mjs photo.jpg out/01.mp4 --move push --dur 5 --poster assets/01-poster.webp
bash .claude/skills/scroll-craft/scripts/encode.sh out/01.mp4 assets/01.mp4
bash .claude/skills/scroll-craft/scripts/encode.sh out/01.mp4 assets/01-m.mp4 mobile
```

Moves are `push`, `pull`, `pan-l`, `pan-r`, `tilt-u`, `tilt-d`, and `drift`. Two
choices in it are deliberate and worth keeping. Motion is linear, because the
scroll is already the easing and a clip that accelerates on its own fights the
hand. Rendering is supersampled, because zoompan rounds its crop window to whole
pixels and that shows as shimmer on edges during a slow move; measured here it
cut frame-to-frame jitter on sharp geometry by about a quarter. Very grainy
sources are the exception, and `--no-supersample` covers them.

The source still should out-resolve the output, since a camera move crops into
it. The script says so when it does not.

### Verified end to end

The whole chain was exercised on a throwaway build: render clips from a still,
encode them, serve the page, and drive the harness at desktop, phone, and
reduced-motion settings. All three passes came back with no dead scroll, clips
moving whenever on screen, and every cue clearing 4.5:1 contrast at its worst
frame. Playhead tracking from the harness report confirmed both clips advance
monotonically across their full five seconds under scroll.
