## 2026-09-21 · declined · a rule for the GitHub MCP going "invalid session" mid-session
- **Source:** capture 2026-09-21T0846Z, session b4d88c99-6449-5448-9d26-22fdf4e814a1 (#2190, #2192).
- **Reason:** the MCP server answered "Error POSTing to endpoint: invalid session" to 15 calls over
  17 minutes, reads and writes alike, while a fresh session connected on its first try; the run
  correctly refused to route around it through the shell and reported the two API steps it could not
  take. A skill triggered on that result text, telling a session to stop after the first couple of
  failures, was drafted and dropped: one occurrence in the 41 captures this run read is a platform
  outage rather than a durable condition, and the retry cost is already the shape
  calling-anything-claudecoderemote states for the tool it was measured on. The next pass that sees
  it again has two data points and should land it.
- **Actor:** the claudinite-growth/growth-extract run on work item #2196.

## 2026-09-22 · declined · a local merge is no evidence about GitHub's mergeability
- **Source:** the capture behind #2001, 2026-09-21, session c4f829ba-759d-5a25-9310-f1684119a48b.
- **Reason:** the run read `mergeable_state: dirty` on four PRs that merged cleanly under local git,
  and blamed the `merge=ours` driver this repo's session-start hook configures, which GitHub does
  not honour. Re-measuring with the drivers off merged cleanly too, so the driver was not the cause
  and the flag was stale against a base sha from Sept 13. A rule written from the first reading
  would have taught a mechanism that was not operating; the residue, that the flag can be a stale
  computation, is one run's inference and waits for a second sighting.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2230.

## 2026-09-22 · declined · a canon pack's RULES.md edit owes its README rule-index row
- **Source:** #979 proposed it; the owner's review on #987 answered "drop this rule".
- **Reason:** the owner turned it down outright.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · .github/workflows/ files can only arrive seeded at adoption
- **Source:** #979 proposed it; the owner's review on #987 answered "incorrect".
- **Reason:** the claim is false, so there was nothing to keep.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · tightening a vocabulary the engine and vendored packs share
- **Source:** #979 proposed it; the owner's review on #987 answered "don't understand this".
- **Reason:** the rule could not be read, and a rule a reader cannot follow costs every session and
  buys nothing.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · where setup-time state or a new capability lives
- **Source:** #979 proposed it; the owner's review on #987 answered "written similarly before".
- **Reason:** already covered by the standing distribution-model rule.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · a test walking git history must guard a shallow clone, as a check
- **Source:** the conversion pass in #1779, which authored `history-test-shallow-guard` and withdrew
  it.
- **Reason:** it fired on six real tests, every one walking the history of a fixture repo it created
  itself, and fixture history cannot be told from the repository's by a static signature. The prose
  bullet stays.
- **Actor:** @missingbulb (owner).

## 2026-09-22 · declined · a pack RULES.md bullet requires a co-changed README, as a check
- **Source:** the upgrade pass in #2110.
- **Reason:** measured over the 60 commits in the checkout, four touched a pack's `RULES.md` bullets
  and one of those rewords a lead-in rather than adding a rule, needing no README change;
  `requireCoChange` cannot see a net count, so the check would be wrong on one real case in four.
- **Actor:** @missingbulb (owner).

## 2026-09-23 · declined · promoting `pipe-tail-hides-exit` out of advisory
- **Source:** it fired in five of the 2026-09-22 window's captures, several calls each, and no
  session acted on it.
- **Reason:** the check is the canon `basics` pack's, and this run writes only local packs; the
  severity call is the usage-review's.
- **Actor:** the growth-extract run over the 2026-09-22 window.

## 2026-09-23 · declined · a shape for a state-transition table put to the owner
- **Source:** #2262, where the owner reshaped one table over three rounds - full label names,
  conditions as pseudocode naming the surface read, writes as `+ label`, one clause per line.
- **Reason:** how a summary is shaped is the owner's own preference, which is injected per session
  and goes stale the moment a pack copies it.
- **Actor:** the growth-extract run over the 2026-09-22 window.

## 2026-09-23 · declined · converting `changing-guidance-produced` to a check
- **Source:** the upgrade pass over this run's own additions.
- **Reason:** class G - the trigger is "guidance that produced a bad artifact", a judgment; a work
  rule reading "prose edited, no Agent dispatch" fires on every rewording and guesses intent.
- **Actor:** the growth-extract run over the 2026-09-22 window.

## 2026-09-24 · declined · proving a text transform with an independent matcher
- **Source:** #2286, whose real-shelf sweep deliberately used its own regex rather than the one
  `unmarkedProse` applies, so the proof could disagree with the transform.
- **Reason:** `building-simulator-stateful` already carries the correct-by-construction failure, and
  what is left is the generic "do not test a function with itself".
- **Actor:** the growth-extract run over the 2026-09-23 window.

## 2026-09-24 · declined · requiring every write into the mount to go through `copyIntoMount`
- **Source:** #2286 routed four vendor writers through it; a fifth added later would ship the
  provenance markers it strips, and only `apply-vendor-set` has a writer test.
- **Reason:** the check would have to assert that particular copy calls still read a particular way,
  which pins a point in time; the carrier is a writer test beside the other three, and those live
  under `packs/`, outside this task's write scope.
- **Actor:** the growth-extract run over the 2026-09-23 window.

## 2026-09-25 · declined · a stub may not read config that adoption writes after it is scaffolded
- **Source:** #2300's second half - adoption scaffolded the executor before bootstrap Part 6 wrote
  the endpoint's `tokenSecret`, so a new repo's executor never carried `CCR_ROUTINE_TOKEN` and
  needed a second human-merged edit to `.github/workflows/`.
- **Reason:** the fix is a static line in the stub with the ordering stated beside it, so what is
  left to say is why that line reads as it does - already-settled, and at its own site.
- **Actor:** the growth-extract run over the 2026-09-24 window.

## 2026-09-25 · declined · filter a generated env line against what the template already declares
- **Source:** #2300 taught `withDeclaredSecrets` to skip a secret the stub passes statically,
  because Actions refuses a workflow whose env names one key twice.
- **Reason:** a trap from one platform's own rule at one call site, where the comment now names it;
  a pack rule would be that comment charged to every session in every declaring repo.
- **Actor:** the growth-extract run over the 2026-09-24 window.

## 2026-09-25 · declined · a blind timer while waiting on CI
- **Source:** the capture behind #2301 answered an owner's `lgtm` with `sleep 240; echo timer-done`
  before re-reading the check run.
- **Reason:** `bare-sleep-wait` already guards it and already fired; the finding is advisory and the
  session proceeded, which is a severity question for that check rather than a new lesson.
- **Actor:** the growth-extract run over the 2026-09-24 window.

## 2026-09-25 · declined · guard `--base main` on the merge-policy runner
- **Source:** this run passed `--base main` to `merge-policy-run.mjs`, read the stale local ref, and
  got an `AUTOMERGE: no` naming 40 files from other people's merges; `--base origin/main` said yes.
- **Reason:** `git-pull-on-shallow-clone` already carries the fact - "nothing of value is ever on
  this repo's local main" - so a second guard restating it for one more command is noise. The
  wording that invited the bare name lives in `deliver-pr.md`, outside this task's write scope, and
  is filed as #2312.
- **Actor:** the growth-extract run over the 2026-09-24 window.

## 2026-09-26 · declined · Node's own fetch bypasses the agent proxy unless NODE_USE_ENV_PROXY=1
- **Source:** #2321's `read_github_login.mjs`, which runs the `GET /user` read in a child started
  with that variable because a web session's token is a proxy placeholder and `fetch` ignores
  `HTTPS_PROXY` without it.
- **Reason:** eleven `fetch` call sites in the tree and only this one runs inside a session's
  container; the rest run in Actions or a browser, where the proxy is absent. A check would have to
  tell those apart to stay quiet, and the comment at the site already names the trap. The next
  session-time fetch added anywhere makes it two holders and a real rule.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2335.

## 2026-09-26 · declined · converting `legacy-tolerance-holder-count` to a check
- **Source:** the upgrade pass over this run's own additions.
- **Reason:** class G - the condition is how many files hold the old spelling, which no signature
  reads, and the moment the rule applies already carries `legacy-tolerance-scheduled`, so a second
  advisory on the same added marker would fire on every legitimate tolerance too.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2335.

## 2026-09-27 · declined · a pack prose edit must run `engine-tests/rule-index.test.mjs`, as a check
- **Source:** the `prose-to-checks-sweep` run on work item #2354, re-deriving the
  `running-the-suite` skill's `editing-rules-md` bullet. Neither sweep catches a stale index
  (probed: a broken size band in a pack README leaves `check_the_world` and `check_the_work` silent
  at exit 0, and only that test red), so a transcript rule over "pack prose changed, the test never
  ran" would have been the carrier.
- **Reason:** the same territory the owner already closed on #987 ("drop this rule") for a canon
  pack's RULES.md owing its README rule-index row, and on the co-change shape declined 2026-09-22. A
  third spelling of it is re-litigating a settled call, not a new candidate.
- **Actor:** the `claudinite-growth/prose-to-checks-sweep` run on work item #2354.

## 2026-09-27 · declined · `spawning-child-process`, as a check over a worker's spawn options
- **Source:** row 94 of `docs/declarative-checks/rule-inventory.md`, re-derived against today's
  tree. Its recorded objection is about the declared block relations only, which a coded rule would
  not have.
- **Reason:** the objection stands for a different reason, so the row is stale rather than waiting
  on a key. Eleven of the twelve real child-process call sites under `packs/*/tasks/` pass the root
  positionally as `git -C <root>` and carry no `cwd` option at all, which satisfies the rule and
  fails the signature - so "the options object has no `cwd`" would fire on almost every worker in
  the tree.
- **Actor:** the `claudinite-growth/prose-to-checks-sweep` run on work item #2354.

## 2026-09-27 · declined · `writing-task-output`, as a check over a worker naming `GENERATED`
- **Source:** row 115 of `docs/declarative-checks/rule-inventory.md`, re-derived because its
  recorded objection - the `basics/baselining` exception - died with that task.
- **Reason:** the signature died with it too. Delivery reaches every worker through
  `worker-entry.mjs`'s bag rather than an import, so no worker imports `deliverGenerated`, and all
  five remaining `GENERATED` mentions under `packs/*/tasks/` are legacy read paths or comments. The
  rule's own prose still names `basics/baselining` as the deliberate exception, which no longer
  exists.
- **Actor:** the `claudinite-growth/prose-to-checks-sweep` run on work item #2354.

## 2026-09-27 · declined · a pack manifest inlines its own literals, as a world check over `pack.mjs`
- **Source:** the owner on #2369, "Inline these constants. Here and in other packs.", after
  each relevance detector's pattern had been factored into a named top-level const in its
  `pack.mjs`; the sweep in 10da6fb removed all of them, so the tree carries none and a `matchLines`
  forbidding `^const ` over `pack.mjs` would land green.
- **Reason:** routing, not strength. The rule is about the shelf's manifests, which this local
  pack's `ruleRoutingGuidance` excludes and routes to `claudinite-canon-curation`, and a
  growth-extract run may write only the repo's own local packs.
- **Actor:** run 36347796455, work item #2377.

## 2026-09-28 · declined · load searching-for-a-tool before the ToolSearch merge-to-main asks for
- **Source:** capture 2026-09-28 session f6b90b34 (#2383) at 10:18Z, and this run at 10:25Z: both
  followed step 1 of `merge-to-main` verbatim, both were denied `skill-not-loaded-for-call
  ToolSearch needs searching-for-a-tool`, and both spent a turn loading it.
  `packs/git-github/skills/merge-to-main/SKILL.md:17` is the corpus's only instruction to call
  `ToolSearch`, so the denial is deterministic on every merge this repo's owner authorises.
- **Reason:** routing, not strength. The fix is one clause in a canon pack's skill, which this local
  pack's `ruleRoutingGuidance` excludes, and a rule here telling sessions what the guard's own
  message already says would carry the cost without fixing the cause. Filed as #2389 instead.
- **Actor:** the growth-extract run over the 2026-09-28 window, work item #2386.

## 2026-09-28 · declined · pass the merge-policy engine origin/main, not the base branch's bare name
- **Source:** this run. `deliver-pr.md`'s fenced block reads `--base <the PR's base branch>`, so the
  substitution is `--base main`; local `main` sat at bd944ef1 (#2281, 2026-09-22) against
  `origin/main` at f170024, and the verdict came back `AUTOMERGE: no` over six days of history the
  run had not written. `--base origin/main` gives `AUTOMERGE: yes`.
- **Reason:** routing, and already covered. The session-side half is git-github-advanced's "never
  branch from the bare local `main` in a checkout nothing keeps current", which this case is one
  more dressing of; what is new is the doc inviting the bare name, and `claudinite-tasks` is a canon
  pack this run may not write. Filed as #2391 instead.
- **Actor:** the growth-extract run over the 2026-09-28 window, work item #2386.

## 2026-09-29 · declined · what makes a relevanceDetector fingerprint reliable
- **Source:** the owner's review on #2382, which dropped three fingerprints matching an artifact the
  pack itself prescribes (product-wiki, public-website, executable-requirements) and rewrote two
  that scanned every source file for a library in use (headless-browser, jwt) to read a near-root
  dependency manifest instead.
- **Reason:** routing, not strength. Authoring a shelf pack's manifest is
  claudinite-canon-curation's, and this local pack's ruleRoutingGuidance excludes it; a growth run
  writes only the local packs. Filed as #2402 instead, with the proposed rule and why it is not a
  check - leaflet and web-speech legitimately scan source, having no manifest to declare them in.
- **Actor:** the claudinite-growth/growth-extract run on #2398.

## 2026-09-29 · declined · a check behind proving-sweep-left
- **Source:** the upgrade pass over this run's own additions (#2398).
- **Reason:** class G, no moment to hang on. The violation lives in a scratchpad codemod script that
  is never tracked, so no world or work scope sees it, and an action guard would have to read a
  Write's content and decide that it both rewrites a module and re-imports it in the same process -
  not a signature that can be made confident. Prose stands.
- **Actor:** the claudinite-growth/growth-extract run on #2398.
