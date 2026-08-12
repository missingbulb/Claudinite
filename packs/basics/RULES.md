# Working discipline

The working discipline that isn't itself a GitHub operation — general habits for how to approach a
change, independent of any one project.

Start every requested change from the *problem*, not the solution — in any repository, not just
this one. Before implementing, reach an explicit shared understanding with the owner of the problem
the change is meant to solve **and** agreement that the requested change is the best way to solve
it; a different fix, or no change at all, may serve the underlying problem better.

Open your reply to an owner comment with an explicit classification line —
`Comment class: correction | feature | process-change | other` (`other` covers questions, approvals,
and command phrases; a mixed comment names each part). **An automation dispatch prompt is a comment
too** — classify it, class `other`, in your *first* substantive reply rather than at the end of
the run. The class decides where the change lands and what must exist before any fix. Put the class
**alone on that line**: the line is scanned for *every* class token on it, so restating the menu to
rule options out ("not a correction, feature request, or process-change") declares all of them,
arming the gates those classes carry. Any explanation goes on the next line. This cannot be taken
back — the transcript is append-only, and a clean re-declaration further down does not override
the first.

1. **A correction** — you misunderstood something. Repair the shared understanding, then rework
   what the misread already touched; the artifact changes as much as the correction demands, but a
   correction never adds a new requirement or rule.
2. **A feature** — agree on the requirement, record it in the project's requirements document (its
   executable spec, where it keeps one), write the test that proves it and watch it fail, then
   implement until it passes.
3. **A process change** — the owner is changing *how* work is done. The change lands as durable
   rules in the project's local scope — its own local packs (in Claudinite itself, its packs) —
   routed through the mechanism promotion ladder (platform setting → hook → check → skill →
   prose); promoting a rule into the shared canon is the growth lifecycle's separate call, not the
   interactive session's. Put on the ladder only a rule that constrains *how work is done* and
   outlives any one feature; a checkable signature doesn't earn a rule its place. Reject two shapes
   outright: a check that asserts particular code exists or still reads a particular way (it pins a
   point in time — it dies with the code it pins and constrains no later change), and a rule
   derivable from the product's requirements (that is a requirement — take it to mode 2: the
   requirements document and the test that proves it). Author the assurance first — the check the
   future world must satisfy — execute it and watch it fail, and only then make the fixes that
   turn it green. When the ladder lands the rule at prose (an in-flight judgment rule no check can
   carry), the equivalent step is showing the corpus doesn't already cover the rule before writing
   it.

The two build modes share one spine: state the expectation in its durable home first, watch it fail
against the current world, then change the world to satisfy it — a fix made before its assurance
exists can never show it addressed what the owner actually asked for.

Before building a mechanism for a behavior, verify against a real run that it isn't already
provided. For release, deploy, versioning or CI plumbing, look for the shared pack that owns it
first — copying a mechanic from a sibling repo is the tell that it belongs centrally. If no pack
owns it, report the gap rather than authoring a third copy that gets deleted later along with its
reviewed workflow.

**Minimize every task's shelf-life — the time from starting it until everyone can forget about
it.** An open task is a standing tax: whoever returns to it pays a full reload of the context that
was free while the work was hot. So finish a change by **watching it work now** — never park it on
"check tomorrow", which is almost always the wrong choice in any context. A change to scheduled or
unattended machinery does not wait for its next natural run — force one now (the scheduler's
`FORCE_TASKS` lever, a `workflow_dispatch`, the fleet-wide force sweep) and watch it to a terminal
state; those levers exist precisely so verification can happen while the change is still in
someone's head. The same yardstick governs **migration planning**: prefer the design that converges
in one forced pass over the one that trickles across nightly cycles, accept legacy input at the door
so nothing has to wait for stragglers, and drive the stragglers with a standing mechanism rather
than a phase someone must remember to close. When verifying now is genuinely impossible (an external
release window, an upstream fix in flight), the follow-up must be a mechanism that comes to you —
a scheduled task, a watched PR, an issue something converges — never a human's memory.

When feedback flags a misunderstanding, check whether the artifact is already correct before
expanding it — if it is, say so and push back rather than editing; a misread doesn't imply the
text is wrong. And size writing to its idea: "open one issue" takes a sentence, not three
paragraphs.

When correcting or auditing an artifact against an authoritative source, derive the corrected
version from the *source* before reading the existing draft, then diff against the old draft to
surface what was actually wrong — reading the draft first anchors you to its framing and quietly
carries its errors into your "fix."

Three harness-tool contracts, before you spend a call rediscovering them:

- **A `ToolSearch` that finds nothing is evidence about your query, not about the environment.**
  Deferred tools are matched on keywords that aren't their own vocabulary, so a capability can sit
  in the session while the search denies it. Search the fully-qualified name
  (`select:mcp__<server>__<tool>`, copied off the deferred-tools listing — the bare short name
  returns "no matching tools", which reads exactly like absence) and try the tool before telling the
  owner a step is theirs.
- **`Edit` requires the file to have been read *with the read tool*** — `cat`/`grep`/`sed` don't
  count, however much is already on screen. The moment shell output tells you which file you're
  about to change, read that exact path; a narrow offset window satisfies it.
- **A summarizing fetch tool is not a source.** Asked for exact text it returns a description, and
  ordinary publisher pages routinely `403`. When the bytes matter, `curl` into the scratchpad and
  read from disk. On a `403` don't retry and don't try a sibling URL — attribute the search
  snippet to the publisher instead of asserting it, and mark it for re-verification.

Fix build/test/CI warnings rather than tolerating them, with a small, targeted fix that addresses
the *cause* in the same change — a clean run makes a genuinely new warning or error stand out.

Suppressing a warning — muting it with a flag (e.g. `--disable-warning`), `eslint-disable`,
swallowing it, etc. — is **not** a small fix and never the quick path: reach for it only as a
deliberate, reviewed decision once the real fix has been weighed and rejected. A suppression you do
keep must **carry its reason at the site**: on the suppression line, or in the comment immediately
above it, saying why the fix was rejected — that inline reason *is* the review record, so no
second justification is recorded elsewhere. When the finding is on *text* rather than code, try
deleting the flagged phrase before waiving it — decoration often buys the coupling the rule exists
to prevent for nothing, and a waiver is for a crossing that genuinely must exist.

A blocked host is a **policy boundary, not an obstacle to route around**. When a sandbox or proxy
denies a fetch, don't reach for an open-network runner — an ad-hoc CI workflow, a push-triggered
"probe" — to make the request from somewhere the policy doesn't apply. Answer from committed
reference material or ask the owner, and say plainly that anything unverifiable is unverified.

Before working around a finding from a vendored check, confirm the vendored copy is current — it
reflects its last refresh, not upstream's head, so the fix may already exist upstream and simply not
be pulled in yet.

When a warning can't be fixed with a small cause-addressing change now without hindering current
work (e.g. it's waiting on an upstream release, or the real fix is a larger refactor), open a
dedicated issue for it unless one is already open, then move on — resolving it (real fix, or a
consciously-chosen suppression) happens in that issue's own change.

An approval — to merge, to ship, to proceed — applies only *backward*, to the work already in
front of the owner when it's given, never to anything requested or done *after* it. A later
follow-up, even a fix to the just-approved change, needs its own explicit approval; a chosen answer
to a multiple-choice prompt isn't authorization just because an option's wording mentioned the
action.

# The task lifecycle

The issue → branch → PR lifecycle every new task follows, independent of any one project. The
rest of the git/GitHub procedures live in the `git-github-advanced` skill.

For every new task:

1. Create a GitHub issue describing the task before starting work.
2. Develop on a branch; reference that issue number in commit messages (e.g. `Refs #123`,
   `Fixes #123`, or `Closes #123`).
3. Update the issue's status (comments / close) as work progresses and when it's done.

A step only a human can perform — flipping a repository or console setting, granting a permission,
adding a secret — gets **its own issue**, never a note in the PR body: the note merges and
disappears with the PR while the setting stays unflipped. Give it a checkbox per step, what breaks
while each is off, and its closing condition. The exception is a step whose home is an artifact the
human is already editing. Before handing a step over at all, confirm you genuinely can't do it
yourself.

# Engineering practices

General software-engineering practices, independent of any one project — portable, shared rules;
project-specific rules (architecture, test mechanics) live in the consuming repo's own docs. The
portable git/GitHub-operational practices — branch/commit history, merging, automated-job branches
— live in [the git-github-advanced skill](../git-github/skills/git-github-advanced/SKILL.md); the
mechanics of searching and rewriting text across files — grep/sed sweeps, renames, broken
references — live in [the repo-text-sweeps skill](skills/repo-text-sweeps/SKILL.md); the practices
for writing trustworthy tests — see-it-fail, snapshot/golden discipline, CI-only and heavy-browser
tests, coverage gating — live in [the writing-tests skill](skills/writing-tests/SKILL.md); and how
to investigate a bug and pin down its root cause — version-gap triage, re-deriving after a failed
fix, probing for a real datapoint — lives in
[the bug-investigation skill](skills/bug-investigation/SKILL.md).

- **Naming a file, module, or symbol** — name it for its scope or responsibility, not the
  technology or mechanism behind it.
- **Referring to a value from more than one place** — prefer a shared constant or a reference over
  copying it, and generate derived data rather than hand-maintaining it. If you can't, add a drift
  guard: the generic `sharedConstants` check for a plain value, or one that runs the real logic
  against the copy in both directions when the duplicate mirrors matcher or predicate logic. Keep
  the guarded literal itself unbroken, since a value split across a line break is invisible to the
  guard and to a `grep`/`sed` rename alike. Have the guard's own text name the places it watches and
  why the split is forced, and don't also comment the duplication — the guard covers it.
- **Writing file A so it depends on file B** — say what A needs from B, or that it delegates, and
  don't re-spell how B does its job. If you're about to paraphrase B's procedure, point at B
  instead. This holds for code comments and Markdown alike.
- **Committing** — one concern per commit: if two changes could each stand alone, split them, and
  a message that wants numbered items is the split talking. Once a commit has landed, revise with a
  new commit, never a rewrite of that one.
- **Working with a file a test or tool generates** — put `GENERATED` in its name, and don't
  hand-edit it; change the generator. Never resolve its merge conflict by hand: clear the markers
  with either side, re-run the generator against the merged inputs, and commit that output. Consider
  automating the clear with a `merge=ours` `.gitattributes` entry, and `git rerere` for a conflict
  that recurs.
- **Writing code that depends on how a platform or runtime behaves** — verify that behaviour
  against authoritative docs or a real run, not a comment or a prior commit's claim.
- **Optimising** — if the change is meant to preserve behaviour, prove it: hash the full outputs
  of both paths across every branch, fuzzing the inputs that select each, and accept only a
  bit-identical match. If the correctness risk outweighs the speed-up, leave the path alone and
  record that as a deliberate call.
- **Needing a library for a narrow job** — prefer a built-in, or a few lines. When the assumption
  that justified an existing dependency lapses, drop it.
- **Answering an edge case a review raised** — first check whether the existing composed rules
  already produce the right answer. If they do, add no production code: pin it with a regression
  test that asserts the contrast case too, plus an accept criterion where you track those, and don't
  re-state it in a comment.
- **Documenting a procedure** — read the authoritative external docs first and write only what
  they don't carry: our failure modes, gotchas, the exact path we ran. Don't document or recommend a
  path you haven't run, however standard it looks.
- **Writing code that can silently do nothing** — a swallowed error, a best-effort fallback, a
  probe-gated optimisation, a hint the runtime may ignore — record which path actually ran,
  reading the state back where the platform exposes it. During development, before the solution is
  proven right, add that debugging information first and remove it later. Without the record, a run
  where the capability never engaged is indistinguishable from one where it did and didn't help.
- **Persisting anything on a user's machine** — put it under the one user-deletable location, and
  extend that location rather than earn a second one. If the platform forces something outside it, a
  registration the OS owns, name that explicitly as the exception.
- **Changing what the software does with a user's data** — the permission string, privacy policy
  and store listing are part of the contract, so change them in the same commit. Retaining something
  new, opening a listener or adding an outbound connection changes the promise rather than adding a
  field: decide it explicitly and rewrite the disclosure before the code. Expect the claim in more
  than one place — grep the whole surface for the standing absolutes it touches ("no tracking",
  "no cookies", "no external assets") and reconcile every hit.
- **Driving an external runtime more than once in a session** — a headless browser, a device, a
  REPL, a deploy target — write one parameterised driver into the scratchpad, taking the target,
  the selector and the output path from argv, and re-point it rather than author a throwaway per
  invocation.
- **Automating something that needs live conversation context** — hook it to an existing human
  workflow event rather than background infrastructure; shell hooks have no conversation access and
  fire per turn, not at session end. Consider changing an existing command's definition — usually
  the cheapest trigger.
- **Writing the exit path of a pipeline or CI step** — an expected, handled outcome exits clean
  with a comment. Reserve non-zero for genuine breakage.
- **A fetch that works locally but fails from CI or a sandbox** — a 403/400 or a CAPTCHA wall is
  the datacenter IP, not the User-Agent, and headers won't change it. Route it through a residential
  proxy, which usually renders JS too. If it stays blocked through the proxy, treat the target as
  un-cacheable.
- **Killing a process by pattern** — `pkill -f` matches the invoking shell's own command line too,
  so never chain it, and bracket one character of the pattern (`[h]ttp.server 8099`) to break the
  self-match.
- **Working in a fresh checkout or sandbox** — a setup script may start in the repo's parent
  rather than the checkout, so `cd` in before running anything. A `Cannot find module` there is
  usually an install that hasn't run yet, not a code bug: install and re-run before hunting for a
  code-level cause.
- **Deciding where a config value or a classification lives** — avoid a default; require the value
  explicitly, or make it structural, derived from where the thing lives. Prefer a structural
  classifier to a hand-set field, and collapse a property tracked in several places into one. When
  automation maintains many copies of a config, have it materialize the explicit value into every
  file it maintains instead of interpreting absence.
- **Handling a value that can be unknown** — unknown is a state of its own: never encode it as a
  zero, an empty string or a type's default, and don't let a decoder collapse it into one. Keep it a
  missing key or an explicit null, keep the zero for a real zero, and preserve all three states at
  every stage of a pipeline. Treat absence as a permanent shape of the data rather than a gap to
  close, and where two fields claim the same fact, let each mean what its own source said and leave
  the call to the consumer.
- **Writing a check that scans the repo** — take the file set from `git ls-files` rather than a
  filesystem walk with paths to skip, and remember a brand-new file is untracked until you add it,
  so a green run isn't coverage of it. When scanning for a forbidden token, strip comments first so
  it matches code, not prose — string-aware, since a `//` inside a URL is not a comment. Reuse
  `stripComments` from
  [`engine/checks/helpers/code-scanning.mjs`](../../engine/checks/helpers/code-scanning.mjs); if the
  scan can't import it, inline the same pass and point a comment back at that source.
- **Writing a comment** — carry the why, or a cross-file relationship the code can't state itself;
  if the code plus a known convention already says it, write nothing. Describe the current state,
  never the edit that produced it: don't explain the change you just made, and don't note what was
  removed or renamed. If a comment narrates a past fix, keep only the part still true of the code in
  front of you. When it must name a path, spell that path in one canonical place and point every
  other mention there.
