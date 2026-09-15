# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(verify-in-production-1)** #1121 was filed against a scope its PR then dropped, so the
  verification was moot before the merge it waited on. Retire the merge-first rule only if a
  verification can track its PR's live diff.
- **(verify-in-production-2)** #1460 was filed and then hand-verified twelve minutes later — the
  artifact was readable all along and the issue was pure overhead. The bar stays "could not be
  watched now" for as long as filing costs a queue run.
- **(verify-in-production-3)** One executor batch spent five of its seven claimed items
  rediscovering unreadable artifacts and parking `needs-human-action` (#1184, #1253, #1268,
  #1288, #1291), before the coded form existed for the URL-readable ones among them. Retire only
  if queue sessions gain a way to read those surfaces.
- **(verify-in-production-4)** Three cross-repo `Verify:` items each parked minutes after being
  picked, on `repository "…" is not configured for this session` (#1349, #1351, #1396) — the
  queue's agent sessions are scoped to the filing repo alone. Retire only if those sessions gain
  cross-repo scope.
- **(verify-in-production-5)** Hand-set `task:status:*` labels produced an item closed wearing a
  live status (#1220) and one labelled `done` but left open (#1265); the done label hides the
  item from the leash. Retire only if the queue's transitions are enforced server-side.
- **(verify-in-production-6)** #1160's retry re-armed `Not-before:` from the field's old value,
  which the hourly release pass had already left in the past, so the item went ready on the next
  pass and a daily retry spent a session an hour.
- **(do-later-1)** #1160 carried its `Model:` line six paragraphs below its waits, where a retry
  rewriting `Not-before:` had no one block to edit and readers could not see what the run would
  do.
- **(writing-tests-1)** A UI-snapshot coverage gate parked behavioral leaves `9.1`–`9.3`/`3.4`
  and an unreachable `8.6` on cases that render none of them (#429).
- **(writing-tests-2)** The SPA-render fallback's CI test renders a `data:` URL whose script
  fills an empty root, not a live SPA (#310) — the live target was bot-blocked from CI.
- **(writing-tests-3)** A hostname-apex helper passed its hand-picked tests but mis-stripped
  `tel-aviv.gov.il` → `gov.il`; the gap only surfaced when the function was run over the actual
  list of existing URLs.
- **(writing-tests-4)** An audit of the canon's ~3,600 tests found ~30 assertions reading back a
  value the test's own setup had chosen: a declared check's `severity` (a pass-through of the
  declaration) and its `rule` id (the very id the test selected the check by). Retire the rule if
  findings stop carrying fields the engine copies through unchanged.
- **(writing-tests-5)** Four fleet-sheepdog task suites each asserted that their own `task.json`
  named its directory and a worker beside it. The canon had ~30 tasks, so the shape was held for
  the four that happened to have a suite and unguarded for the rest; folding it into
  `task-schema.test.mjs`'s existing tree walk covered all of them and deleted four copies. Retire
  the rule if per-member suites become mandatory for every member of such a set.
- **(writing-tests-6)** The same audit found `.fix` assertions split evenly between remedies
  computed from the input (`raise it to 1.2.4`, `rename it to <dir>README.md`) and static
  sentences re-typed from the declaration; only the first kind can fail for a reason that is a
  defect. Retire the rule if remedies stop being authored as editable prose.
- **(writing-tests-7)** Derived from xUnit Test Patterns' *Conditional Test Logic* smell and
  from `claudinite-canon-curation`'s standing rule that a check selecting inputs by path
  pattern must assert its scope is non-empty — the same failure on the test side, which no rule
  covered. Proven rather than argued: renaming the emitted `issue_write` call in
  `converge-item.mjs` left `converge-session.test.mjs`'s "names the repo it was given, on every
  call" green, and the same mutation against the pinned body fails on the count. Note the
  mechanism, which is why the rule says *how many* rather than *not empty*: the filter selected
  two call kinds and kept one, so the surviving `add_issue_comment` line satisfied the loop
  while the renamed call went unchecked. The audit found the same shape
  unpinned in `bootstrap.test.mjs`, `scenarios.test.mjs` and `rule-index.test.mjs`, and as an
  inner `if (script)` inside `task-schema.test.mjs`'s own pinned tree walk. Retire the rule if a
  runner reports per-assertion execution counts, which would make an unexecuted assertion
  visible without a pin.
- **(writing-tests-8)** *Software Engineering at Google* ch. 12, "Test via Public APIs": a test
  that reaches past the interface "is brittle, and almost any refactoring of the system under
  test (such as renaming its methods, factoring them out into a helper class…) would cause the
  test to break, even if such a change would be invisible to the class's real users." One
  holder in this corpus: `update-worker.test.mjs` greps `tasks/update/worker.mjs` — a module it
  also imports — for `settingsPath(root)`, `deliveryFor(declaration)` and the byte order of two
  lines (`target < disposal`). Those greps exist because the worker's only real entry point is
  `main()`, which drives git and the network; the rule's second clause is what that file should
  say instead. Retire if the corpus stops shipping modules whose whole behaviour sits behind one
  side-effecting entry point.
- **(check:declared-check-spec-keys)** The engine's declaration load drops a key it cannot place
  instead of throwing, because refusing it wedges a member holding an older engine (#1400); this
  check is where the typo half of that trade is caught. Retire it only if the load can refuse
  unknown keys again without wedging any fleet lane.
- **(check:reference-integrity)** Converted from `repo-text-sweeps`' prose in #552. The
  evidence for a blocking check is that nothing else catches it: a removed doc, module, or
  renamed path leaves dangling links, imports and index entries behind that **no test
  necessarily fails on** — a README docs-index link to a deleted file stays green. The prose
  also fixed the timing the check cannot enforce: grep the tree for the old path in the same
  change as the removal, not later. Reaffirm while dangling references stay invisible to the
  suite; retire only if the test suite starts failing on them.
- **(check:markdown-link-labels)** Converted from `repo-text-sweeps`' prose in #552. The
  mechanism a review needs is the sweep that produces it: a Markdown link carries its path
  **twice** — ``[`old/path.md`](old/path.md)`` holds it in both the visible label and the
  target — so a `sed` anchored on the `](href)` form rewrites the target and leaves the label
  reading the old path, and the doc then points right while *reading* wrong. Both the plain
  `[old/path.md]` and backticked label forms need the same rewrite. Reaffirm while Markdown
  duplicates the path across label and target; retire only if that stops being true.
- **(RULES-1)** Owner decision, set while planning the dashboard chain (#1613): "The owner
  reviews are here not to make sure all code was created perfectly … Your ability to write
  code at fantastic speeds means that making sure a code is perfect is a goal that pales in
  comparison to get the code out the door and working. The things I now care about are much
  more specific: I fear destructive code that deletes data in production, or creates such a bad
  experience that users leave. Anything which isn't easily reversible with another PR. The
  second thing I care about is growth — separation of concerns, making sure the system is
  simple. Seeing which folders changed tells me a lot about if the change made sense; a 3-file
  change for a change I expected to be a one-liner gives me indications not of destructive
  errors, but of opportunities to learn. So when we create a long chain of tasks and set
  automerge rules — the goal is to have a good prediction of the change that would come from a
  feature request, and if that prediction holds — merge and move on. Automerge policy failing is
  a major speed bump, but it allows us to make sure the wagon is on the right trail." Reaffirm
  while a person still reviews chain PRs by their footprint; retire only if the owner redefines
  what review is for.
- **(RULES-2)** An audit of this repo's own tree (#1637) found ~28 legacy declaration sites across
  `engine/` and `packs/` — none of which told a holder to move, and several, `engine/version.mjs`'s
  integer tolerance among them, carrying a stated end date that had passed with nothing scheduled
  to act on it. A tolerance added without those two halves is indistinguishable from a permanent
  feature. Reaffirm while tolerances can be added without a removal link; retire if a mechanism
  makes the omission impossible.
- **(RULES-2a)** The rule first said the gate must read back true rather than be a date, and the
  owner reversed it the same day (#1637): "the canon will never know the state of all active or
  inert repos that use it." A census gate is not the rigorous choice when the census cannot be
  taken; it is how a tolerance becomes permanent. The window's LENGTH is each change's own call —
  the owner set a week for the cleanup that prompted this — which is why the rule asks for a
  stated window and not a fixed one. Reaffirm while consumers converge on their own schedule and
  cannot be enumerated.
- **(writing-migration-plans-1)** Same decision as RULES-1: the sizing questions and the
  breakage cases were the ones the owner asked while planning #1602, and asked to have made
  into the planning skill "highlighting the importance of continuation".
- **(RULES-3)** Re-probed 2026-09-15 across four paths, each created by a Bash `printf` or the
  `Write` tool and never read: a repo file and a scratchpad file both edited with no prior read,
  while a file under `/home/user/` refused with "File has not been read yet" until a session
  `Write` made it current. So the gate is the path's *root*, not any session write — the
  2026-09-06 entry read a scratchpad exemption as a shell write counting, which sends a reader
  outside both roots to a shell write that does not unlock the edit. Retire the wording if Edit
  starts demanding a read inside the working directory, or stops demanding one outside it.
- **(searching-for-a-tool-1)** Re-probed 2026-09-15: `select:get_teams` now returns the tool's full
  schema, as does `select:mcp__github__get_teams`, and `get_teams` alone still resolves — so the two
  forms no longer differ and the rule no longer splits them. The 2026-09-06 probe recorded the
  opposite for `select:` with a short name, which is what the skill was written to route around.
  Retire the rule if `select:` stops accepting either spelling.
- **(RULES-4)** From `missingbulb/MissingBulbWebsite` via #1303: two copies of one constant table in
  different languages could not be paired by literal value because `"150"` is a substring of
  `"1500"`, so a value-matching guard mispaired rows silently. Pairing by name through the casing
  transform needs no per-value upkeep. Retire the clause if the guard helper gains value-boundary
  matching.
- **(RULES-5)** Owner process change: "When you create detailed, multi-task migration plans -
  before you start creating the issues - you need to get the owner's approval for the plan,
  including a quick description of every step (task), dependencies graph, and auto-merge rules
  (done after analyzing and predicting how the PR will look and what it will change)." The skill
  said "when the plan is agreed" three times without ever saying how agreement is obtained or that
  it gates filing, so a session could file tracker, links and edges and ask afterwards. Retire only
  if the owner says a filed-then-reviewed plan is acceptable.
- **(writing-migration-plans-2)** Same owner statement as RULES-5; this entry carries the three
  required contents of the submission (step lines, dependency graph, per-link automerge policy with
  its predicted diff) and the placement of the gate before any issue is filed.
- **(writing-migration-plans-3)** Owner, on the plan-approval change: "the point of separating
  detailed plans to many tasks is to have validatable checkpoints. If you have 2 big tasks on
  totally different parts of the system - it makes sense to split them to tasks, with different
  automerge rules, independent completion and production validations, etc. But if you have a large
  task and you just split it in two tasks that do work in the same place - there's no need for
  that, and it's only adding toil." The sizing section sorted steps into phases and divisions but
  never named the test a split must pass, so more links read as always the safer choice. Retire if
  a per-link cost ever drops to where splitting is free.

- **(ci-performance-evaluation-1)** #2012's run ledger: the canon's CI spends 11 s of 150 s in
  checkout and setup-node against 131 s of tests, so profiling was right there — but the skill
  had no branch for the other shape, a run whose install dwarfs its suite, and would have sent it
  through eight steps that only measure tests. Retire if the step-1 breakdown grows a mechanised
  classifier that routes the two shapes itself.
