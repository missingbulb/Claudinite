# Plan status update — re-verify each plan-tracking issue's checklist

The nightly convergence sweep over the repo's **`plan-tracking`** issues (the "read status
and pick up the work" trackers — [the pack README](../../README.md#the-plan-tracking-issue--kept-fresh-after-every-merge)
owns the convention; full rationale in
[docs/tracking-issue-freshness/DESIGN.md](../../../../docs/tracking-issue-freshness/DESIGN.md)).
The in-session `plan-tracking-freshness` check nudges the merging session; you are the net
under it: re-derive each tracker's checklist from the plan's own **per-phase verifiers** and
flip what sessions missed or what completed implicitly.

You run under the executor, dispatched by a `ready-for-agent` issue whose **Context section
is binding scope**: it names the open plan-tracking issue number(s) — update exactly those
issues and nothing else.

## Conventions used in this doc

- **GitHub access is MCP-native.** Reading and updating the tracker goes through the
  session's GitHub MCP tools (`mcp__github__*`). The unattended run has no shell GitHub
  access — never reach for `gh`/`curl`.
- **Verifiers.** A checklist item's verification is, in order of preference:
  1. **Code** — the item carries an inline marker `<!-- verify: <repo-path> -->` naming a
     dependency-free Node script (conventionally `docs/<plan>/verify/<phase-id>.mjs`).
     Run it from the repo root: **exit 0 ⇒ the phase is done**; non-zero ⇒ not done, and
     its stdout says what's missing. The script's verdict is authoritative — no judgment.
  2. **Prose** — no marker: the phase's own **Verify** block in the committed plan doc
     (the issue's "Read first" section links the doc) is the acceptance criteria, judged
     by you against observable state (files on `main`, merged PRs, issue/workflow
     activity). Flip only on **high-confidence** satisfaction; when unsure, leave the box.

## Per tracker, do this

1. **Read the tracker** (`issue_read`): the checklist in its description, and the linked
   plan doc on `main`.
2. **For each *unchecked* item**, run its verifier (code first, prose fallback):
   - **Passes** → flip it to `- [x]` (accumulate; one `issue_write` update per issue at
     the end, preserving the rest of the description byte-for-byte).
   - **Fails / not yet satisfiable / uncertain** → leave the box; no comment for the
     ordinary "still in progress" case.
3. **For each *checked* item that has a code verifier**, re-run it. A failing verifier on
   a checked box is a **regression signal**: do **not** un-flip the box (a human may know
   better — e.g. the verifier itself rotted); instead say so in the summary comment,
   naming the verifier and its output. Prose-verified checked items are not re-judged.
4. **Comment only when something happened.** If you flipped any box or found a regression,
   leave **one** summary comment on the tracker: which items changed and the evidence
   (verifier path + exit, or the observed facts behind a prose judgment). If nothing
   changed, write nothing — a nightly "no change" comment is noise.
5. **A fully-checked tracker stays open** — closing a finished plan is the owner's call
   (the final review is often itself the last item). If every box is checked, note it in
   the summary comment once (skip if the previous comment already says so).

## Don't

- **Don't** widen scope past the Context-named issues, and don't touch issues without the
  `plan-tracking` label.
- **Don't** edit anything in the tracker description except checkbox states.
- **Don't** un-flip a checked box — flag regressions in the comment instead.
- **Don't** guess at a prose criterion you can't observe from the repo/GitHub state —
  leave the box and move on.
