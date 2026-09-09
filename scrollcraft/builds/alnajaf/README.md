# Al-Najaf Specialized Laboratory: the site

Five numbered chapters on porcelain, one live object behind all of them. Read
`BRIEF.md` first: the story, the feeling curve, the peak, and every decision
made along the way live there, including why the first build was thrown away.

## Layout

```
index.html        the page: bilingual markup, five chapters, the booking form
site.css          tokens, type, chapters, controls, hover states, breakpoints
app.js            language, the scroll score (GSAP), pointer interactions, the world (three.js)
fonts/            self-hosted woff2 and fonts.css
vendor/           gsap, ScrollTrigger, ScrollSmoother, SplitText, three.js
render/           build and verification scripts (see below)
lab/              verification output. Not tracked.
```

There is no video and no image on the page. The object behind the chapters is
rendered live: a double helix of porcelain beads on steel rungs, posed per
chapter, opened and lit in the third. It costs nothing to generate and it
covers whatever viewport it is given, because it is drawn into the viewport.

## How it moves

- `ScrollSmoother` smooths the wheel; `ScrollTrigger` pins chapters 01 to 03
  and scrubs their timelines; `SplitText` splits headings into masked lines.
- Chapters 01 (lab) and 03 (method) are pinned frames inside tall sections; the
  section is the track and the inner frame is what pins. Chapter 02 is a rail
  that travels sideways under the wheel on desktop and under the thumb on a
  phone.
- The ground crossfades to night on the way into chapter 03 and back on the
  way out. The ground eases; the ink flips at the midpoint, so the two never
  meet grey on grey.
- Navigation is a dock: six chapter icons in a pill that widen on a spring as
  the pointer nears them (a plain-JS port of the framer-motion Dock, same
  mass, stiffness and damping), with a label that rises on hover and a red dot
  under the current chapter. Top centre on desktop, bottom edge on phones.
- Controls are soft glossy pills: a lit top edge, a shadow that lifts on hover
  and sinks on press, an icon that nudges. The WhatsApp send is the same pill
  in signal red.
- Everything else hoverable answers: magnetic buttons, tilting cards, a black
  band on instrument rows, lifting consultant cards, sliding arrows on contact
  rows, a cursor that grows on links.
- A browser that announces automation (`navigator.webdriver`) gets no smoothing
  and instant scrubs, so every screenshot is the frame for its position.
- Reduced motion: no smoother, instant scrubs, no idle spin, no reveals. No
  WebGL: the stage hides and the page stands. No JavaScript: a plain document.

## Verifying

```bash
node ../../../.claude/skills/scroll-craft/scripts/serve.mjs --root . --port 4700 &
bash render/verify-all.sh                 # functional test, three harness passes, awkward sizes
node render/functional.mjs                # controls, language, booking, fallbacks
node render/look.mjs --w 2000 --h 470     # screenshots at any size; --lang ar, --reduced
```

Run them on Google Chrome (the scripts do), not on Playwright's Chromium.

## Publishing

```bash
node render/build-artifact.mjs            # -> render/artifact.html, one file, ~90 KB
```

The artifact loads GSAP and three.js from cdnjs and the type from Google Fonts;
everything else is inlined. The folder itself is also a static site: copy
everything except `lab/` and `render/` to any host.

## What still needs the owner

- A vector or high-resolution logo. The header mark is a simplified crescent.
- Photographs of the six consultants, the five named instruments, and the
  building, if they want faces and rooms on the page.
- A native-speaker read of the Arabic copy. Service names reuse the lab's own
  wording; the chapter copy is mine.
- The example tests on each department card are the standard work of that
  department's named instrument, not a list taken from the lab. Confirm or
  replace them.
