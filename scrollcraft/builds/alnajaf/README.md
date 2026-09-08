# Al-Najaf Specialized Laboratory: the site

One continuous scroll-driven world, built with scroll-craft. Read `BRIEF.md`
first: the story, the feeling curve, the peak, and every decision made along
the way live there.

## Layout

```
index.html        the page. Worldflight markup, bilingual copy, requisition, booking
site.css          page styles over the scrollcraft floor
app.js            page-local behaviour: language, requisition, plates, WhatsApp, live 3D layer
scrollcraft.js    the engine, copied from the skill. Never edited per project.
scrollcraft.css   the engine's stylesheet
assets/           encoded clips (legN.mp4 desktop, legN-m.mp4 phone) and posters (pN.webp, pN-p.webp)
fonts/            self-hosted woff2 and fonts.css
vendor/           three.js module and RoomEnvironment for the live layer
render/           the offline world renderer (see below)
lab/              verification output. Not tracked.
out/              master renders. Not tracked.
```

## Rendering the world

Every clip is rendered locally, for free. `render/world.js` holds all seven
scenes as deterministic functions of leg and time; `render/render.mjs` drives
them in headless Chrome and writes frames, then ffmpeg assembles masters.

```bash
node render/render.mjs --preview                 # five frames per leg, quick look
node render/render.mjs --w 1920 --h 1080 --fps 25   # landscape masters -> out/
node render/render.mjs --w 720 --h 1280 --fps 25    # portrait masters  -> out/
node render/render.mjs --legs 0 ...              # a subset
bash render/encode-all.sh                        # masters -> assets/, dense-GOP, posters from the encoded files
```

A full render of both orientations takes about an hour on four cores with
software WebGL. The environment needs a full ffmpeg build and Google Chrome;
`node ../../../.claude/skills/scroll-craft/scripts/doctor.mjs` checks both.

## Verifying

```bash
node ../../../.claude/skills/scroll-craft/scripts/serve.mjs --root . --port 4700 &
node ../../../.claude/skills/scroll-craft/scripts/worldflight-assert.mjs --url http://localhost:4700
node ../../../.claude/skills/scroll-craft/scripts/shoot.mjs --url http://localhost:4700 --out lab/shots
node ../../../.claude/skills/scroll-craft/scripts/shoot.mjs --url http://localhost:4700 --out lab/mobile --width 390 --height 844
node ../../../.claude/skills/scroll-craft/scripts/shoot.mjs --url http://localhost:4700 --out lab/reduced --reduced-motion
```

Run them on Google Chrome, never on Playwright's Chromium: it cannot decode
H.264 and reports every clip as frozen. Then read the contact sheets.

## Deploying

The folder is a static site. Copy everything except `lab/`, `out/`, and
`render/frames/` to any static host, at the root or any base path; every
reference is relative. Nothing needs a server: the booking form composes a
WhatsApp message and opens it, and the call and directions links are plain
links.

## What still needs the owner

- A vector or high-resolution logo. The header mark is a simplified drawing of
  the crescent and helix from the 254-pixel original.
- Photographs of the six doctors, the five named instruments, and the building.
- A read of the Arabic story copy by a native speaker at the lab. The service
  names and the mission line reuse the lab's own wording; the story lines are
  mine.
