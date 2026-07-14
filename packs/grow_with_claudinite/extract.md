# Growth — extract lessons (per member)

The [growth lifecycle](../canon-curation/README.md)'s capture stage, this pack's daily task: review a project's recent activity and fold any durable, reusable lesson into the project's own docs — at the project's own level, without straining to generalize it. It **commits directly to the project's default branch** (no per-run PR); finding nothing to add on a given run is a perfectly good outcome.

> This is the **unattended daily** routine. **Unlike** the owner's on-demand, in-session "learned lessons" command (which delivers a PR for review), this routine commits straight to `main`: it writes only the project's *own* local docs, and the owner has opted out of a per-run review gate here to keep the fleet's daily lesson-capture from piling up PRs. The shared canon stays gated — lifting anything up into it is [promote](../canon-curation/promote.md)'s job, and promote *does* open a PR.

## Capture at the project's own level

Write each lesson at whatever level reads naturally for this project — refer to its files, services, or mechanics wherever that's what makes the lesson clear, but don't force either extreme: don't contort a lesson to be hyper-specific, and don't polish it into a general, portable rule. Making a lesson portable is [promote](../canon-curation/promote.md)'s job, done centrally later (it picks up whatever is merged here by its next run); here, just capture it usefully and let promote lift whatever turns out to travel.

## Conventions used in this doc

- **Default branch.** `main` stands for **your repository's default branch** — substitute whatever your repo uses.
- **GitHub access is MCP-native.** Reading issue/PR activity and updating the tracking issue go through the session's **GitHub MCP tools** (`mcp__github__*`). The fleet run has no shell GitHub access — the shell reaches only a git-over-HTTPS proxy scoped to one repo, with no REST credential — so never reach for `gh`/`curl` or a cross-repo clone.
- **The project's local docs.** The set identified in [this pack's README](README.md#identifying-a-projects-local-docs) — the project's own guidance, never the mounted canon.

## How it finds lessons (scoped to the last 24h)

1. **Activity gate, first.** Count commits + updated issues/PRs in the window. None → stop; a quiet day has nothing to learn from.
2. **Read the window.** The last-24h **commits** (`git log --since`, full bodies, diffs where a fix is non-obvious) and **issue/PR activity** (`updated:>=<since>`, then the changed comments).
3. **Extract only durable, reusable lessons** — gotchas, engineering practices, test discipline, architecture rules, project mechanics — and **dedupe** each against what the project already documents. When in doubt, leave it out.
4. **Put each lesson where it will be read.** A lesson can land in the local doc that owns its kind, or — for a gotcha tied to one call site — as a comment right at that site. Which fits is a placement call [extracting-lessons.md](../../skills/lessons-learned/extracting-lessons.md) owns (usage-site comment vs. central doc); follow it rather than defaulting everything to a doc. Keep each addition terse and in the project's own voice.

If an edit touches something a test reads (a doc constant, a code path), run the project's offline test suite and keep it green before committing.

## Output: commit to `main`

If it found at least one genuinely new lesson, it **commits the edits directly to `main`** — one commit for the whole run, not one per lesson. This writes only the project's *own* local docs (not the shared canon), and the owner has opted for a direct commit here rather than a per-run PR, to keep the fleet's daily lesson-capture from flooding review requests. Keep the commit terse and reference the tracking issue. A run that finds nothing and commits nothing is fine — and common.

## Tracking: log each run under the routine's own issue

The routine's standing log is the issue titled exactly, in this member repo:

> **Claudinite tracker: Growth Extract**

Find it **by that exact title, never a fuzzy match or a hard-coded number** (a bare number can dangle, and it differs per repo). This tracker never had a fixed title before now, so there is no reliable prior title to migrate from — a run that finds no issue under the exact new title just creates one (closed); it does not need to search for an old name. **Never open, close, or reopen it** afterward — its state carries no meaning, only the log does. When a run adds a lesson, log it as a **dated comment** — not a sub-issue — so the issue accumulates a scrollable history, each entry naming **what was added and where**.

## Run on a capable model

Deciding whether a lesson is genuinely new and durable — and deduping it against what's already documented — is a **judgment call**, not mechanical extraction. A downgraded model adds noise or restates what's there, and there's **no per-run PR gate here to catch it** — the commit lands straight in the project's docs — so the capable-model requirement matters all the more. Run this routine on a capable model.

## What this routine must never do

- **Never touch the shared canon** — this routine writes only the project's *own* docs; lifting a lesson up into the canon is [promote](../canon-curation/promote.md)'s job.
- **Don't add noise** — a duplicate or hallucinated "lesson" is worse than adding nothing, the more so when it lands directly in the project's docs with no review gate.
