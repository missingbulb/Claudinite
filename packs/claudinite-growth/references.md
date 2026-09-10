# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(unattended-agents-1)** Worked example: the origin project's daily lessons pass,
  `docs/claude/auto-lessons.md`.
- **(unattended-agents-2)** Downgrading the origin project's auto-extractor agent to Haiku led
  it to ship a bare-title case off a listing page instead of stopping; Sonnet bailed correctly
  (`docs/claude/auto-extractor.md`).
- **(unattended-agents-3)** Worked examples: the origin project's routines
  `docs/claude/auto-lessons.md` (its issue #365), `docs/claude/auto-fallback-coverage.md`
  (#366), `docs/claude/auto-branch-report.md` (#399).
- **(writing-tasks-1)** The bound and its best-effort enforcement are the task-code-work
  design's §2 and §6 — see issue #394.
- **(writing-tasks-2)** Owner correction on #1843: "Don't discuss how the PRs land in the task
  description. This should have been instructed in the skill on writing tasks." The rule against
  repeating a declaration in `task.md` already existed but listed field names, so the two worker
  docs that spelled the behaviour out without naming `expected_outcome` — `rule-revalidation` and
  `growth-dedup` — passed it, and `rule-revalidation`'s sentence was still describing a policy the
  declaration had moved off. Retire it if the landing story stops living in the declaration.
- **(writing-pack-prose-1)** Measured on two adjacent instructions in one spec: the one naming a
  file was got right first try 0 runs in 5, the one shipping a fenced command 5 in 5.
- **(check:task-md-only-when-agentic)** `task.md` is defined as the spec an agentic session
  follows, and `README.md` is what an agentless worker's human-facing record is called — the
  naming decision recorded in #1055. Retire the check only if that vocabulary changes.
- **(writing-pack-prose-2)** Owner decision on #1662's extraction pass (PR #1667): forty-odd
  rules had moved into description-triggered skills, and the owner's call was "unless we have a
  force-load-on-file-edits-paths that covers all the relevant times those instructions are needed,
  let's move them back to RULES.md" — a description is matched by the model reading the skill
  listing, which is not a predictable load. Reaffirm while the harness offers no deterministic
  trigger for a skill other than a file edit (or a user's own slash invocation); retire if one
  arrives and the corpus adopts it.
- **(RULES-2)** #1696: `writing-tasks` named the schedule board's issue and its state, so a
  change to the queue's own bookkeeping (#1677) bumped this pack too — three files for a
  parenthetical a task author never needed. Reaffirm while packs are versioned separately.
- **(unattended-agents-4)** #1739: `tidy-repo/tidy-issues` read "for each issue in scope, run
  the single-issue-triage skill" as one subagent per issue; the children re-derived the same
  view of `main` to return verdicts that were mostly `left`/`unchanged`, and the fan-out spent
  the worker's whole run bound, so the dispatch issue was never converged and the janitor
  parked it hours later. Reaffirm while fan-out is a subagent dispatch the parent's clock pays
  for.
- **(learning-a-technology-1)** The session that wrote the skill probed `developers.cloudflare.com`
  from a Claude Code web sandbox and got `CONNECT tunnel failed, response 403` — the environment's
  network policy, which the `fetching-from-the-web` skill says no alternate source and no later pass
  crosses. Neither of the two asks it was written from (missingbulb/ClaudiniteWebsite#454) could tell
  whether its research had reached the vendor's documentation at all, and nothing in either result
  recorded which. Retire only once every session's environment is known to allow
  vendor-documentation egress, or the `## Verified` record is checked by machine against a real
  fetch log.
- **(learning-a-technology-2)** Owner request on missingbulb/ClaudiniteWebsite#454: "consider the
  difference between the project-specific task and the technology skills, and try to assess if the
  project-specific task is also an ad-hoc thing for the current project or could fit in a different
  pack". The recorded verdict is what the promote stage reads to know whether a task travels with
  its skill; the bar a lesson clears and the ladder it descends stay
  [extracting-lessons.md](extracting-lessons.md)'s. Retire only if the lifecycle gains a way to read
  a task's intended home other than a recorded verdict.
- **(learning-a-technology-3)** Promotion lifts a skill's folder into a canon pack and the dedup
  stage then removes the local copy; a worker that spells the skill's code path in more than one
  place breaks at that removal, with nothing red naming the cause. Retire only if the engine
  resolves a skill's code by skill name rather than by path.
- **(check:technology-skill-cites-dated-sources)** Every session that loads a technology skill reads
  its procedure as verified, and the two shapes that are not — one written from search snippets, one
  written from memory behind an egress block — leave no other mark in the tree. The dated URL and the
  `## Verified` section are the only signatures a scan can see. Retire only if a skill's provenance
  is recorded somewhere a check can read it.
- **(check:technology-skill-links-inside-its-folder)** The basics rule against re-spelling how one
  file's dependency works already covers the ordinary case; the residue here is that a technology
  skill is promoted by *moving its folder*, so a link out of it dangles at the landing — the failure
  `references-integrity` catches for rationale markers and nothing catches for links. Retire only if
  promotion rewrites relative links.
- **(check:technology-skill-code-imports-inside-its-folder)** The same lifting failure for code: an
  outward import resolves in the pack it was written in and throws `ERR_MODULE_NOT_FOUND` wherever
  the folder lands, and the session writing this skill hit exactly that on its own fixture's first
  run. Test files are exempt because a fixture must reach the engine's declaration loader, and that
  one line is the known cost of a promotion. Retire only if skill code is bundled at promotion time.
