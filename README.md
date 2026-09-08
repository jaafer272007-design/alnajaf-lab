# alnajaf-lab

A lab repository, and the home of a Claude Code skill inventory.

## Skills

Skills live in [`.claude/skills/`](.claude/skills/README.md) and load
automatically in any Claude Code session opened on this repository. No install
step, and nothing to enable.

| Skill | What it does |
|---|---|
| [scroll-craft](.claude/skills/scroll-craft/SKILL.md) | Builds premium scroll-driven landing pages, then screenshots its own output to verify contrast, motion, and reduced-motion states. |

## Tools

| Tool | What it does |
|---|---|
| `tools/stillmotion.mjs` | Renders a scroll-scrubbed clip from a still photograph, locally and for free. Drops into the scroll-craft pipeline in place of its paid generation step. |

See the [inventory README](.claude/skills/README.md) for provenance, licence,
environment setup, and how to re-sync a vendored skill against its upstream. It
also documents a codec trap that silently blinds the verification pass, which is
worth reading before trusting a green run.
