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

A Claude Code cloud session starts with two of its checks failing. The container
is rebuilt for every session, so this runs once per session:

```bash
apt-get update -qq && apt-get install -y -qq ffmpeg   # the one required check
ln -sfn /opt/pw-browsers/chromium /usr/bin/chromium   # a path the preflight looks in
npm install --no-save --no-package-lock playwright-core   # at the repo root
```

Why each one:

- **ffmpeg** is absent, and it is the only required check. Do not point
  `SCROLLCRAFT_FFMPEG` at the build under `/opt/pw-browsers/`: that is
  Playwright's stripped copy, with no webp muxer and missing filters, and it
  fails as misleading syntax errors in your own commands. Ubuntu's package is a
  full build, verified here at 563 filters with libwebp present.
- **Chromium** is installed but outside the paths the preflight and the
  screenshot harness search. Both read the same list, so a symlink onto
  `/usr/bin/chromium` satisfies them without any environment variable.
- **playwright-core** resolves from the current directory upward, so installing
  it once at the repo root covers every build folder under it. Only the
  verification pass needs it.

`KIE_AI_API_KEY` stays unset unless you are generating imagery. Building from
supplied photography needs no key and no spend, and the preflight treats it as
optional.

### Verified end to end

The full chain was exercised on a throwaway build: encode a clip, serve it,
drive it with the screenshot harness at desktop, phone, and reduced-motion
settings. All three passes completed and wrote contact sheets. `encode.sh`
produced the dense keyframe interval that makes a clip scrubbable, and the
harness correctly flagged frozen clips and thin contrast in the unmodified
skeleton, which is the behaviour that makes it worth running.
