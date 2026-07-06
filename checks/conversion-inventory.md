# Conversion inventory — every corpus rule, audited

> Companion to [DESIGN.md](DESIGN.md) (issue #127). Each discrete instruction in the mounted
> corpus, classified by the mechanism that should carry it. This is the audit that answers
> "is enough of the corpus convertible?" — and the worklist Phases 1–3 execute against.

**Dispositions:**

- **check** — post-hoc deterministic check (pack named). *(adv)* = ships advisory.
- **hook** — PreToolUse gate, blocks before the action runs.
- **skill** — becomes an on-demand procedure; unloads from always-on context.
- **setting** — platform enforces it (GitHub repo/branch settings); no code at all.
- **stays** — process/judgment guidance; remains an instruction. *(judge)* = a Phase-4
  LLM-judge candidate.
- **knowledge** — platform gotcha; stays soft-loaded, near-zero standing cost, no conversion.

## Verdict up front

~125 discrete instructions audited. **~45 convert to deterministic mechanisms** (≈40 checks
across five packs, 4 hooks, 2 settings, plus two whole docs becoming skills); **~60 stay** as
process/judgment; **~20 are knowledge** that shouldn't convert. So: a majority of
*instructions* — no. A majority of the **always-loaded context burden** — yes: four of the five
force-loaded docs unload entirely, and the two most breakage-prone task docs (filePlacement,
textAndFileManipulation) shrink to rationale.

## always/ — the force-loaded baseline (highest standing cost)

| Rule | Disposition |
|---|---|
| working-discipline: problem-first consensus before implementing | stays |
| working-discipline: confirm behavior isn't already provided | stays |
| working-discipline: misread ≠ wrong artifact; size writing to its idea | stays |
| working-discipline: clean-room rebuild from the authoritative source | stays |
| working-discipline: fix warnings, don't tolerate | per-project CI config (fail on warnings); rule text leaves baseline |
| working-discipline: never suppress a warning as the quick path | **check** `universal/warning-suppression`: diff adds `eslint-disable`, `@ts-ignore`, `--disable-warning`-style markers → finding demands the dedicated-issue path |
| working-discipline: approval applies only backward | stays |
| task-lifecycle: issue before work; commits reference it | **check** `universal/task-lifecycle`: commits since merge-base carry `#N`; the issue exists |
| task-lifecycle: update issue status as work progresses | **check** *(adv)*, partial — full flow lives in the merge skill |
| merge-to-main: the recipe (~4 calls) | **skill** (trigger stays the owner's "LGTM" preference) |
| merge-to-main: squash as the method | **setting** — GitHub "allow squash merging" only |
| merge-to-main: gate on CI only if the repo has it | folds into the skill |
| merge-to-main: lessons pass on every merge | folds into the skill (deterministic step, not a remembered trigger) |
| merge-to-main: don't re-read the issue; don't fight branch deletion | folds into the skill |
| temporary-workarounds: never delete a remote branch | **hook** — PreToolUse blocks `git push` delete refspecs; doc deleted when its list empties |
| growth/extracting-lessons.md (entire method doc, force-loaded) | **skill** — invoked by the merge skill and the "learned lessons" phrase; content unchanged, just no longer always-loaded |

**Baseline outcome: five force-loaded docs → working-discipline (trimmed) plus a slimmer index.**

## tasks/filePlacement.md — the flagship conversion

| Rule | Disposition |
|---|---|
| Reference-distance metric (0/1 healthy, 2+ reach; edge-counting) | **check** `universal/file-placement` *(adv)* — the metric is already specified mechanically |
| Mandated-location exemption (`.github/`, `.claude/`, root manifests) | codes into the check as an exemption list |
| Keep the mandated file thin (launcher → one near entry point) | **check** *(adv)*: count of distinct deep references from a mandated file |
| Test-location-convention exemption | codes into the check: detect the project's test root, exempt test→tested |
| Mirror the source tree when picking a test convention | **check** *(adv)*: source file with no mirrored test path |
| Deliberate cross-cutting concerns are allowed, few and named | the **acceptance** mechanism, with reason strings |
| Tooling acts on paths → structural, fail-safe splits | stays *(judge)* |
| Doc's remaining role | shrinks to rationale + "what to do about a smell" |

## tasks/textAndFileManipulation.md — outcomes convert, procedure follows them out

| Rule | Disposition |
|---|---|
| Grep inbound references after delete/rename | **check** `universal/reference-integrity`: dangling relative links, imports, index entries |
| Double-prefix / URL corruption in a naive sweep | outcome caught by reference-integrity + project tests; procedure text shrinks |
| `path.join`-segment references survive a rename pass | stays (in-flight; no "old path" known post-hoc) — outcome partially caught by tests |
| Specific→catch-all half-converted paths | same — outcome caught by reference-integrity where the result dangles |
| Re-read a file at its new path after `git mv` | stays (in-flight tool behavior) |
| Markdown link carries its path twice (label vs. href) | **check**: label path ≠ target path → finding; fully deterministic |
| Exclude by pathspec, not `grep -v` on content | stays (procedure); the runner's own lib obeys it |
| Derive structural-check file sets from `git ls-files` | stays; the runner obeys it |
| `Write` tool, never `cp` from harness-internal paths | stays (in-flight) |

## tasks/git-and-github.md — a lint pack plus two hooks

| Rule | Disposition |
|---|---|
| Status updates: comment, don't `issue_write`-overwrite | **hook** — PreToolUse warns/blocks `issue_write` `update` with a body |
| Commit often, in layers; tests-first ordering | stays |
| Don't rewrite published/shared history | **hook** (block force-push to protected branches) + **setting** (branch protection) |
| Squash-merge branch-sync gotchas (rebase --onto, stale lease) | knowledge |
| Commit-nag ≠ authorization to commit drift | stays |
| Open a PR early when the artifact is CI-only | stays |
| Sync early to keep conflicts small | stays |
| Fetch before branching off origin/main after a remote merge | knowledge |
| "Ahead by N" ≠ unmerged (content triage steps) | knowledge |
| `GITHUB_TOKEN` push triggers no workflows | knowledge |
| Gate optional CI jobs on a variable, not a secret | **check** `github-actions/`: `secrets.*` in a job-level `if:` |
| Automated job needs a unique branch per run | **check** `github-actions/` *(adv)*: date-keyed branch names in workflows |
| Create a brand-new label before `--add-label` | **check** `github-actions/` *(adv)* |
| `run:` steps have no `pipefail` by default | **check** `github-actions/`: piped `run:` without a bash shell default |
| Unattended workflow must escalate its own failure | **check** `github-actions/` *(adv)*: scheduled workflows lacking a failure-reporting job |
| `workflow_call` permission forwarding | knowledge (lint too fuzzy) |
| CI reading submodule files needs `submodules: true` | **check** `github-actions/`: repo has `.gitmodules` → checkout steps need the flag |
| Mark large fixtures `linguist-vendored` | **check**: committed files > threshold in fixture dirs lacking a `.gitattributes` entry |
| Renaming a directory housing a submodule | knowledge |
| Markdown in `<td>` needs blank lines | **check** *(adv)*, Markdown lint |
| `commit.gpgsign` doesn't cover merges | knowledge |
| Repo-allowlist scoping: query per-repo, never org-wide | stays (in-flight) |
| Merging gotchas (relocation refs, invariant reintroduction, porting across invariants) | stays/knowledge — reference-integrity re-run after a merge covers part |

## tasks/engineeringPractices.md

| Rule | Disposition |
|---|---|
| Name by scope, not technology | stays *(judge)* |
| Single source of truth + drift guards | stays — the *guards themselves* are already tests; the rule to add them is judgment |
| Shared-constants occurrence guard | already a test pattern in consuming repos; portable pack helper later |
| A states *what* from B, never *how* | stays *(judge)* |
| `GENERATED` filename discipline; never hand-edit or hand-merge | **check** *(adv)*: diff edits a `*GENERATED*` file with no generator-input change; `.gitattributes` `merge=ours` present |
| Verify platform behavior against a real run | stays |
| Earn each dependency | **check** *(adv)*: diff adds a manifest dependency → finding asks for justification |
| Bespoke how-to earns its place over upstream docs | stays *(judge)* |
| Resilience that swallows errors destroys observability | **check** *(adv)*: empty/swallowing catch lint |
| Hook AI-context automation to human workflow events | stays |
| Expected outcomes are clean exits, not failures | stays |
| Datacenter-IP-blocked fetches → residential proxy | knowledge |
| Setup script must `cd` into the checkout | knowledge |
| Fresh-checkout `Cannot find module` → run the install | knowledge |
| Structural classifier over hand-set field | stays — and the runner's pack-fingerprinting embodies it |
| Avoid default values | stays *(judge)* |
| `git ls-files` for tree-walking checks | stays; runner obeys |
| Comments carry *why*; a path spelled in one canonical place | **check** *(adv)*, partial: same path re-spelled across many comments; the *why* half stays *(judge)* |

## tasks/testingPractices.md

| Rule | Disposition |
|---|---|
| See a test fail before trusting it | stays |
| Run a new transform over the real corpus | stays |
| A stub at the bug's boundary can't catch it | stays |
| Teach a new call to every double | stays |
| Segment coverage gates by verification kind | stays |
| Drive goldens through the real code path | stays *(judge)* |
| Snapshot tests inject a fixed reference instant | **check** *(adv)*: `Date.now()` / argless `new Date()` in snapshot/golden test files |
| e2e twice-green before merge | per-project CI policy; text stays for now |
| CI-only tests self-diagnose and are hang-proof | **check** *(adv)*, partial: missing test-level timeouts |
| Hermetic self-authored inputs over live targets | stays |
| High-watermark gating for fuzzy metrics | stays (pattern; reusable pack helper later) |
| Human-reviewed expectation files | stays |
| Never silently re-baseline a golden | **check** *(adv)*: diff changes a committed baseline artifact → finding demands the approval flow |
| Record the artifact first, read expectations off it | stays |
| Deterministic regeneration; never shell to git from a test | **check** *(adv)*: git invocations inside test files |

## tasks/ — the rest

| Doc | Disposition |
|---|---|
| bug-investigations.md (all 3 rules) | stays — pure investigative process |
| agent-architecture.md (all 4 rules) | stays — it is this design's own rationale |
| agenticBestPractices.md (~13 rules) | stays, mostly in-flight agent behavior. Convertible slivers: `@import`-only-baseline → **check** `universal/claude-md` *(adv)* flagging new `@`-imports; per-routine tracking issue → **check** *(adv)*, deferred (needs API) |
| agentic-documentation.md (~20 rules) | mostly stays *(judge)*. Convertible: <200-line budget → **check** `universal/claude-md`; emphasis ("IMPORTANT"/"YOU MUST") count threshold → **check** *(adv)*; examples in `<example>` tags → **check** *(adv)* |

## technologies/

| Doc | Disposition |
|---|---|
| nodejs.md (2), html.md (1), aws-sam.md (3), chrome-extension.md (8), flutter.md (stub) | knowledge — runtime gotchas no local check can observe; already soft-loaded |
| **chrome-extension-release.md — the contract** | **check** `chrome-extension-release/` conformance suite (~12): five workflows with exact `name:`s · no surviving `__TOKENS__` · manifest ↔ `package.json` version sync · kebab-cased zip name · README Install/Releasing sections · `PRIVACY.md` present · STORE-LISTING justification row per manifest permission · release machinery under `dev/build/release/` · store-asset inventory (128px icon, ≥1 screenshot) · assets generator-backed · dependency-free bumper/filter scripts *(adv)*. Doc keeps the setup narrative and manual store steps |

## templates/ & bootstrap.md

| Rule | Disposition |
|---|---|
| Every project declares a category in its CLAUDE.md | **check** `universal/claude-md` *(adv)*: consumer CLAUDE.md lacking a category/template declaration |
| Bootstrap steps, template catalog, generator prompt | stays — procedures run at adoption, not per session. Bootstrap *gains* the Stop-hook registration step (Phase 1) |
