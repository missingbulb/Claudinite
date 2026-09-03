# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(RULES-1)** Three ad-hoc cross-repo `Verify:` items each parked on a scope denial minutes after
  being picked (#1349, #1351, #1396) — the executor provisions agent sessions with this repo's
  scope only. Retire the rule only if executor sessions gain cross-repo scope.
- **(RULES-2)** Hand-fabricated queue transitions produced an item closed wearing a live status
  (#1220) and one labelled `done` but left open (#1265); `converge-item.mjs` printing the exact
  calls is what makes the sequence reproducible on any session. Retire the rule only if the
  queue's transition is enforced server-side.
- **(RULES-3)** During the #1119 rename sweep, a file rewritten after the sweep started reinvented the
  retired constant as a comparison key, and the state comparison failed silently — a wrong
  count, no error, no failing test. Retire the rule only if a drift guard pins every comparison
  key to its constant.
- **(check:home-seeded-packs-declared)** Baselining lands a seeded pack on every member but is
  gated `!isHome`, so the canon's own declaration is hand-maintained and a newly
  `seededByDefault` pack would reach the whole fleet except this repo, invisibly. Retire the
  check only if baselining stops skipping the home.
- **(RULES-4)** Once the pipeline exists, the module headers and pack `README.md`s must
  independently state the same facts, so a surviving design doc is a third copy to keep in sync
  with both. #1169 also set the boundary: a doc still describing work in flight, and a much
  larger one many module headers cite by section, were decided separately rather than
  discovered mid-run. Retire the rule only if design docs stop being duplicated by the headers
  and READMEs the build produces.
- **(RULES-5)** Shepherd enumerates members at runtime, so a repo list committed to canon code
  would be a second and staler copy of the fleet. Retire the rule only if canon gains its own
  membership read.
- **(RULES-6)** Where a change is uniform by construction — prose, a doc, a move of something
  nothing executes from the mount — forcing delivery buys noise rather than assurance; forcing
  is for changes whose behaviour turns on how members differ. Retire the rule only if the
  nightly converge stops being the reliable delivery path.
- **(RULES-7)** #919 deleted the `configSchema` manifest seam and both coded per-pack
  validators whole, on the owner's call that a bespoke validation vocabulary is the wrong shape
  for config whichever end it is authored at; the PR states the accepted cost, that a malformed
  entry now goes silent. Retire the rule only if the owner reverses that call.
- **(RULES-8)** #959's captured session: the owner rejected an `engine/` module shared by two
  packs' tasks ("We can't ever have code that needs to be shared by two packs saved in
  'engine'. That breaks the model."), and then rejected even a shared file with a drift guard
  for the one piece that was genuinely identical logic ("why do you even need a drift guard?
  Just write the json. Don't overkill"). Retire the rule only if the owner reverses that call.
- **(RULES-9)** Owner, #1001, on the dashboard's fleet-value block: a number that only ever
  grows tells you nothing today, and the honest version is what happened in a window — this
  week versus last.
- **(RULES-10)** Owner, #1001: no invented figure, "no estimated hours saved unless something
  actually measures it".
- **(RULES-11)** #1008: windowing a stamp-derived figure — members that converged last week,
  counted from each member's single last-converge date — reads a steady, healthy population as
  declining purely from where the stamps fall relative to the window boundary.
- **(RULES-12)** #1106: a stamp the tightened parser rejects reads as "no version installed",
  which re-applies every migration record in the corpus — so retiring the tolerance on a date
  alone does more than leave a straggler behind. Retire the rule only if a rejected stamp stops
  meaning "uninstalled".
- **(RULES-13)** #880: `Monitor` and shell poll loops reported "still running" until they timed
  out, ~26 minutes lost across two PRs that were already green. Retire the rule only if this
  sandbox stops proxy-blocking `api.github.com`.
- **(RULES-14)** #952: bootstrap Part 9's hand-written vendored path named a directory that is
  never created, and Part 9 is the one step a session hands a person to go open — so the wrong
  path survived the session that wrote it into the handover. A link redirects where a spelled-
  out trail goes stale.
- **(RULES-15)** Recorded from the #864 run's own thread when the rule was written: a placement
  objection left unaddressed — the rest of the reply being right — went 55 minutes before the
  owner repeated it.
- **(RULES-16)** #1069: the writing-tasks workflow carve-out justified itself on two grounds
  that are false, because code-work runs inside the executor's own Action job — it declares
  `code_work_required_secrets`, and `id-token: write` is one line in that job's `permissions:`. Retire
  the rule only if code-work stops running Action-side.
- **(RULES-17)** #364 recorded the owner's reversal of #360's position as standing decisions in
  this pack's own `RULES.md` expressly "so they are never re-litigated" — the durable artifact,
  not the answer to the prompting question, is what stops the stale version being asserted
  again.
- **(RULES-18)** Owner decision, 2026-08-18: a pack whose subject is a Claudinite feature
  rather than a technology or a way of working carries the prefix. `claudinite-growth` predates
  the decision.
- **(RULES-19)** #934 scoped the dashboard as a canon-home dev tool under `dev/tools/`,
  explicitly leaving promotion to a vendored pack as a separate call; it landed in #935 as an
  opt-in pack instead, after the move-and-rewrite cycle that costs. Retire the rule only if the
  three distribution models collapse into one.
- **(RULES-20)** Mounting filters on the literal declaration and the home does not declare
  `git-github`, so that pack's skills are absent from this repo's `.claude/skills/` while their
  procedure still applies here.
- **(RULES-21)** `packs/README.md` was rewritten to state how to count instead of quoting a
  total, so that every pack change stopped having to edit it; a transcribed total is stale at
  the next pack change.
- **(RULES-22)** `comment-classification` blocked a session on `[Request interrupted by user
  for tool use]`, read as the owner's latest comment, because `humanText` drops an entry
  starting with `<` and lets a bracketed marker straight through. Retire the rule only if the
  helper stops screening by that first character.
- **(RULES-23)** Same incident as the transcript rule above: at the Stop hook a false positive
  blocks the turn and spends a whole cycle on something no edit can clear, so the fixture
  carries an interruption marker beside a real owner turn.
- **(RULES-24)** #1060: gating release checks on the orchestrator workflow's name alone means a
  repo that renamed it loses every release check including the one that tells it to rename it
  back — and gating on the config alone leaves `cer/release-config`, whose whole job is a
  missing config, unreachable. Two signals, either sufficient, is what survives.
- **(RULES-25)** #1118: `comment-classification` fired 204 blocking times in 31 days — 21% of
  all blocking findings, the second-most-fired check — each one a blocked Stop-hook turn spent
  re-emitting a line the session had already been told to emit. The owner's call was to keep
  the rule and drop the check.
- **(RULES-26)** A mount-shaped path works on every member and fails on exactly this repo,
  which runs the same code from the repo root — the one place where the breakage surfaces last.
- **(RULES-27)** #1081: the rename map fixes code-side id resolution but cannot rewrite a
  member's own already-committed config, which converges on its own schedule or never;
  rewriting the write side reaches only data the engine itself owns.
- **(RULES-28)** #1067: `MEMBER` covers any org member regardless of repo permission and
  `COLLABORATOR` includes read-only collaborators, so both are broader than push access. Retire
  the rule only if GitHub narrows what `author_association` means.
- **(RULES-29)** Learned on `build_vars` / `release-workflows`: a stub is copied into a
  member's `.github/` once and never re-copied, so nothing carries a newly-read key to the
  repos already holding the old copy. Retire the rule only if stubs gain a re-copy path.
- **(RULES-30)** The record comes from a fresh canon clone but the worker executing it is the
  member's vendored one, so a record that is not inert against an older mount fails the
  converge — after which the mount never advances and the fix can never arrive.
- **(RULES-31)** #1004: a converged tree carried the new engine beside the old `core` pack,
  whose file still imported `engine/scheduler/slots.mjs`; the pack failed to load, the mount's
  self-test failed, and the converge refused to land — a green run, an unmoved stamp and a
  `needs-human` PR. Retire the rule only if the engine and pack lanes deliver atomically.
- **(RULES-32)** #1004's fielded-import table was built by walking the trunk's pack history:
  scanning every ref fires on whatever is in flight, and an import that only ever existed on an
  unmerged branch was never delivered to anyone.
- **(RULES-33)** #907: the nightly refresh recomputes the vendor set from canon HEAD, so a
  pattern bug there is the one canon regression that does not heal itself, and a fixture cannot
  see it.
- **(RULES-34)** #907: a test re-asserting only the file that broke needs a fresh edit for the
  next file added beside it; one that walks the real directory does not.
- **(RULES-35)** #929: `FORCE_TASKS`'s replacement broke Shepherd's only caller because the
  migration enumerated this repo's own callers. #801/#907 is the same failure from the other
  side: two independently-maintained stub copies at one path declared different input names.
- **(RULES-36)** #1027: one bound reintroduced the bug a prior fix closed, on whichever side
  crossed the shorter phase's real need.
- **(RULES-37)** #1027: collapsing "the clock ran out" into a verdict on the work sent a reader
  chasing a repository-settings diagnosis for CI that was simply still running.
- **(RULES-38)** `growth-dedup`'s brief rendered 350KB against the ~64KB cap and would have
  422'd the run at its first step.
- **(RULES-39)** #1052: where the failure is conditional — a scope that 403s only against a
  private repo — a probe run where that condition is not met reports a false-positive pass, so
  a real observed 403 attributed to the permission that would fix it is worth more than the
  probe.
- **(RULES-40)** The target list is enumerated over `FLEET_GITHUB_TOKEN` while the routine's
  repo scope is hand-typed UI config no Action can read, so the drift completes silently and
  the run files a report that reads as a full sweep. Retire the rule only if that scope becomes
  machine-readable.
- **(RULES-41)** #974, owner-authored: `DRY_RUN` stopped being read and silently defaulted to
  the operation's most dangerous mode — live and unscoped.
- **(RULES-42)** #1094: a dashboard stuck showing a stale "hasn't converged" banner traced to
  exactly this — the deploy workflow's `on: push` never fired for the pushes that actually
  moved a mount. Retire the rule only if GitHub cascades workflows from `GITHUB_TOKEN`-authored
  pushes.
- **(RULES-43)** #1108: the same platform fact makes `.github/workflows/` the one path a
  converge cannot push into, so a member's copy moves only when a human merges a PR.
- **(RULES-44)** #1138: a check exercising the scheduler's own vendored stub had never been
  extended to the executor's, which is just as fleet-wide and just as capable of drifting
  unnoticed.
- **(RULES-45)** #1105: a year anchored on its last digit wraps to 0 in 2030 and sorts a decade
  of releases underneath every 2029 one.
- **(RULES-46)** #1105: `'60820.10'` and `'60820.1'` are different versions and the same float,
  so nothing in the corpus may parse one as a number.
- **(RULES-47)** #1126: with the directive printed after the payload, "that line" resolved to
  the directive itself and a session opened two replies in a row reciting it verbatim. The fix
  pinned three properties — the directive disclaims itself, no deixis, the literal emitted once
  and last.
- **(RULES-48)** #1119: the false green survives only until the lower PR merges and this one
  rebases onto its real base, so the check's own result against a pre-merge base proves
  nothing.
- **(RULES-49)** #1275 is the state a native closing keyword overwrites: the item converged to
  a `task:needs-human-approval` park with its work waiting on a person, while `Closes` fires on
  merge regardless of the label state convergence chose.
- **(RULES-50)** #929, #921 and #971 were three instances of one class: a `run: false` that the
  old mechanism consulted from nothing becomes a live self-closing landmine under the new one.
- **(RULES-51)** #939 and #892: two runs closed `outcome:done` while their own PR sat open
  needing a human, and one skipped the outcome label and the exec record entirely — five days
  of green-looking runs on one of them, because the sequence was left to a checklist recalled
  at the end.
- **(RULES-52)** #1073: stages chained by preconditions that re-derive the world self-heal on
  the next pick, so the marker is only worth its park on a stage whose side effect cannot be
  repeated.
- **(RULES-53)** #1051: already-printed output survives a `SIGKILL`; a file written on the way
  out is never written at all if the kill lands first.
- **(RULES-54)** #1119: two work lists on one member — `task:origin:ad-hoc`'s
  REQUESTED/SUSPECTED split — were serialized by nothing, because a same-title mutex is blind
  to two differently-titled items writing one target; naming the member's other open list in
  `Blocked-by:` is what fixed it.
- **(RULES-55)** #925: a single actor retrying its own stale claim cannot expose an identity-
  masked race, which is what hid F18 until two distinct executors raced.
- **(RULES-56)** #1013: the fielded-imports test answers from whatever partial history a
  shallow checkout happens to carry, and passes vacuously exactly when the real answer needs
  the history it lacks.
- **(RULES-57)** #922: a `.bak` taken earlier predates whatever else was edited in between, so
  restoring from it silently destroyed that work.
- **(RULES-58)** #1010: `git checkout --` restores from the index, so it destroys uncommitted
  work in the same file just as thoroughly as the `.bak` above.
- **(RULES-59)** #930/#931: five reruns of the ~55s suite cost 4.5 minutes to serve five
  different greps of the same unchanged output.
- **(RULES-60)** #1274: `git ls-files` excludes a test file created and not staged, so the run
  that certified green may never have executed it.
- **(RULES-61)** Measured across three sessions' tool wall-clock: #993's spent 18 full-suite
  runs (18 min) and 22 world sweeps (7 min) of 26 min, #941's 22 (22 min) and 27 (12 min) of 33
  min, #992's 7 and 8 of 14 min.
- **(RULES-62)** Three misses in one window, one of each shape: `CLAUDINITE_TASKS_SUSPEND_ALL`
  documented as live and never built, beside `exclusive` which had retired with its mechanism
  (#975); `session_scope`, a writer with no reader left and nothing saying so (#993); and the
  usage fold's `tasks` census, a reader whose parser outlived the log lines it read (#994).
- **(RULES-63)** #994: the census rows keep counting plausibly until the Actions retention
  window ages out, and then count nothing — the failure appears long after the change that
  caused it.
- **(RULES-64)** #1013: chaining one normalization onto the last makes the oldest vocabulary
  take two passes to reach today's, so a declaration written for it stops normalizing when a
  link in the chain goes.
- **(RULES-65)** #1042: an anchored regex cannot cross the nested closing bracket, so every
  element after it goes silently unreached — and a fixture built without that nesting spells
  the same gap the pattern has, proving nothing.
- **(RULES-66)** #880: a merge commit trips the blocking squash-merge-history check and costs a
  full rebase, a discarded CI run and a fresh wait — paid twice in one evening.
- **(RULES-67)** #922: a stale tracking ref makes git count the pre-squash commits as unpushed,
  so the next push is rejected and the stop hook reports local work that does not exist.
