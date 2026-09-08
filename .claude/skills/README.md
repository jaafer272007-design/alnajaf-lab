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

In a Claude Code cloud session the state is:

- **node** is present.
- **Chromium** is present but not where the preflight looks. Point it there with
  `export SCROLLCRAFT_CHROME=/opt/pw-browsers/chromium`, and the check passes.
- **ffmpeg** is missing, and this is the one required check. The build under
  `/opt/pw-browsers/` is Playwright's stripped copy: it has no webp muxer and is
  missing filters the encode step needs, so pointing `SCROLLCRAFT_FFMPEG` at it
  produces failures that read as syntax errors in your own command. Install a
  full build instead. Only the asset pipeline needs it, so a page built from
  supplied photography can skip it.
- **playwright-core** installs per build folder, with `npm i playwright-core`.
  Only the verification pass needs it.
- **KIE_AI_API_KEY** is unset. Only asset generation needs it. Building from
  supplied photos and footage is a first-class route that costs nothing.
