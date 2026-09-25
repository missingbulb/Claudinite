## 2026-06-18 · born · toolbar icon colored via declarativeContent (#363)
- **Reason:** a bare `hostSuffix` matcher also matches a lookalike host, and the real URL-to-icon
  match runs only inside Chrome.
- **Actor:** the owner.
- **Mechanism:** a gotcha in `docs/technicalGotchas.md`, written with the change that introduced the
  matchers.
- **Landed:** #363.

## 2026-07-16 · moved · Restructure local capture into a Claudinite local pack (#680)
- **Source:** the always-`@`-imported `dev/procedures/{workflow,github,testing,technicalGotchas}.md`
  docs, dissolved into this pack.
- **Actor:** the owner.
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md codebase gotcha, injected at session start.
- **Landed:** #680.

## 2026-07-23 · reworded · Growth dedup: prune gcec local items the canon now covers (#701)
- **Reason:** the canon chrome-extension pack now owns the raw-string `UrlFilter` match and its
  hostEquals + dot-hostSuffix fix (canon #319); kept only that the real match is exercised here
  solely by the CI-only real-Chrome test.
- **Actor:** the owner.
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Landed:** #701 (Refs #685).

## 2026-07-31 · reworded · gcec: growth-dedup (#802)
- **Reason:** the lookalike-hostSuffix rule and its fix are chrome-extension canon; the CI-only
  residue remains.
- **Actor:** the owner.
- **Model:** Claude, per the commit trailer.
- **Landed:** #802 (Refs #798).

## 2026-09-25 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
