# Worked example — `packs/chrome-extension` as the design renders it

The two things beside this file are what [the design](../../DESIGN.md) produces for one real pack,
placed here because nothing under `packs/` may hold a `provenance/` folder until the vendor set
excludes it. Once the mechanism lands, `provenance/` moves whole to
`packs/chrome-extension/provenance/`, `RULES.md` replaces the pack's own, and this README goes with
the rest of `docs/provenance/`.

- **`RULES.md`** — the pack's rules exactly as they stand today, plus the one thing the design adds
  to injected prose: every rule ends with a marker naming its provenance file. The two skills and
  the checks gain nothing, since their ids already name their files.
- **`provenance/`** — 36 element files and one `declined.md`, for a pack of 22 prose rules,
  2 skills, 4 coded checks, 7 declared checks, 1 task and the manifest: 37 carriers. One file,
  `content-script-module-syntax.md`, covers two — the classic-content-script rule and the check
  converted from it — so the file takes the check's name and the rule's marker cites it.

Every file was created by the marking pass (a dry run of `mark` over the real pack, which proposes
a slug per rule; the slugs here are the refined ones a maintainer would land). Thirteen files were
then filled by hand from the pack's git history, following the backfill method the design states —
the `born` entry derived from the adding commit, its pull request and the `VERSIONS.md` row
**before** re-reading the rule, and `unrecovered` wherever the history is silent. The other 23 are
header-only, which is exactly the state the backfill task consumes. A dry run of `check` over the
folder and the rendered `RULES.md` resolves every marker and id to a live file and finds every file
named.

| Filled | What it shows |
|---|---|
| `pack.md` | pack-level decisions: the pre-pack corpus file, the split into a release pack and the collapse back, the kept `cer/` ids |
| `url-filter-host-operators.md` | a rule born by promotion, then reworded by two corpus-wide passes; one line each |
| `content-script-module-syntax.md` | one element covering a rule **and** the check converted from it, with the deletion-test verdict (prose kept, and why) and a later split |
| `declarative-content-set-icon.md` | a check whose prose was deleted on conversion; the README-drift correction; the retire test |
| `extension-host-permissions.md` | a rule that became a path-forced skill, citing the corpus-wide guideline where it was decided |
| `chrome-store-releases.md` | a skill's life: standard, opt-in pack, vendoring, skill, force-load trigger |
| `cer-version-bumped.md` | a check with a full `Rejected` (the prior state) and a falsifiable `Retire when` |
| `cer-release-workflows.md` | a legacy tolerance's advisory and its convergence-window retirement |
| `store-release.md` | a task: birth, three policy changes, the `disabledTasks` decision |
| `id-token-for-jwt-backends.md`, `silent-refresh-prompt-none.md` | rules from the first promote; a clause cut as restating the rule |
| `tokens-in-session-storage.md`, `token-across-restarts.md` | a split, recorded on both sides |

`Model` values are the landing commits' own `Co-Authored-By` trailers, spelled as the trailer
spells them, and `unrecovered` where a squash commit carries none — the backfill never guesses a
model any more than a reason. `Actor` is a role throughout, as a canon pack requires.
