# Working discipline

The working discipline that isn't itself a GitHub operation — general habits for how to approach a change, independent of any one project.

Start every requested change from the *problem*, not the solution — in any repository, not just this one. Before implementing, reach an explicit shared understanding with the owner of the problem the change is meant to solve **and** agreement that the requested change is the best way to solve it; a different fix, or no change at all, may serve the underlying problem better.

Open your reply to an owner comment with an explicit classification line — `Comment class: correction | feature | process-change | other` (`other` covers questions, approvals, and command phrases; a mixed comment names each part). **An automation dispatch prompt is a comment too** — classify it, class `other`, in your *first* substantive reply rather than at the end of the run. The class decides where the change lands and what must exist before any fix. Put the class **alone on that line**: the line is scanned for *every* class token on it, so restating the menu to rule options out ("not a correction, feature request, or process-change") declares all of them, arming the gates those classes carry. Any explanation goes on the next line. This cannot be taken back — the transcript is append-only, and a clean re-declaration further down does not override the first.

1. **A correction** — you misunderstood something. Repair the shared understanding, then rework what the misread already touched; the artifact changes as much as the correction demands, but a correction never adds a new requirement or rule.
2. **A feature** — agree on the requirement, record it in the project's requirements document (its executable spec, where it keeps one), write the test that proves it and watch it fail, then implement until it passes.
3. **A process change** — the owner is changing *how* work is done. The change lands as durable rules in the project's local scope — its own local packs (in Claudinite itself, its packs) — routed through the mechanism promotion ladder (platform setting → hook → check → skill → prose); promoting a rule into the shared canon is the growth lifecycle's separate call, not the interactive session's. Put on the ladder only a rule that constrains *how work is done* and outlives any one feature; a checkable signature doesn't earn a rule its place. Reject two shapes outright: a check that asserts particular code exists or still reads a particular way (it pins a point in time — it dies with the code it pins and constrains no later change), and a rule derivable from the product's requirements (that is a requirement — take it to mode 2: the requirements document and the test that proves it). Author the assurance first — the check the future world must satisfy — execute it and watch it fail, and only then make the fixes that turn it green. When the ladder lands the rule at prose (an in-flight judgment rule no check can carry), the equivalent step is showing the corpus doesn't already cover the rule before writing it.

The two build modes share one spine: state the expectation in its durable home first, watch it fail against the current world, then change the world to satisfy it — a fix made before its assurance exists can never show it addressed what the owner actually asked for.

Before building a mechanism for a behavior, verify against a real run that it isn't already provided. For release, deploy, versioning or CI plumbing, look for the shared pack that owns it first — copying a mechanic from a sibling repo is the tell that it belongs centrally. If no pack owns it, report the gap rather than authoring a third copy that gets deleted later along with its reviewed workflow.

**Minimize every task's shelf-life — the time from starting it until everyone can forget about it.** An open task is a standing tax: whoever returns to it pays a full reload of the context that was free while the work was hot. So finish a change by **watching it work now** — never park it on "check tomorrow", which is almost always the wrong choice in any context. A change to scheduled or unattended machinery does not wait for its next natural run — force one now (the scheduler's `FORCE_TASKS` lever, a `workflow_dispatch`, the fleet-wide force sweep) and watch it to a terminal state; those levers exist precisely so verification can happen while the change is still in someone's head. The same yardstick governs **migration planning**: prefer the design that converges in one forced pass over the one that trickles across nightly cycles, accept legacy input at the door so nothing has to wait for stragglers, and drive the stragglers with a standing mechanism rather than a phase someone must remember to close. When verifying now is genuinely impossible (an external release window, an upstream fix in flight), the follow-up must be a mechanism that comes to you — a scheduled task, a watched PR, an issue something converges — never a human's memory.

When feedback flags a misunderstanding, check whether the artifact is already correct before expanding it — if it is, say so and push back rather than editing; a misread doesn't imply the text is wrong. And size writing to its idea: "open one issue" takes a sentence, not three paragraphs.

When correcting or auditing an artifact against an authoritative source, derive the corrected version from the *source* before reading the existing draft, then diff against the old draft to surface what was actually wrong — reading the draft first anchors you to its framing and quietly carries its errors into your "fix."

Three harness-tool contracts, before you spend a call rediscovering them:

- **A `ToolSearch` that finds nothing is evidence about your query, not about the environment.** Deferred tools are matched on keywords that aren't their own vocabulary, so a capability can sit in the session while the search denies it. Search the fully-qualified name (`select:mcp__<server>__<tool>`, copied off the deferred-tools listing — the bare short name returns "no matching tools", which reads exactly like absence) and try the tool before telling the owner a step is theirs.
- **`Edit` requires the file to have been read *with the read tool*** — `cat`/`grep`/`sed` don't count, however much is already on screen. The moment shell output tells you which file you're about to change, read that exact path; a narrow offset window satisfies it.
- **A summarizing fetch tool is not a source.** Asked for exact text it returns a description, and ordinary publisher pages routinely `403`. When the bytes matter, `curl` into the scratchpad and read from disk. On a `403` don't retry and don't try a sibling URL — attribute the search snippet to the publisher instead of asserting it, and mark it for re-verification.

Fix build/test/CI warnings rather than tolerating them, with a small, targeted fix that addresses the *cause* in the same change — a clean run makes a genuinely new warning or error stand out.

Suppressing a warning — muting it with a flag (e.g. `--disable-warning`), `eslint-disable`, swallowing it, etc. — is **not** a small fix and never the quick path: reach for it only as a deliberate, reviewed decision once the real fix has been weighed and rejected. A suppression you do keep must **carry its reason at the site**: on the suppression line, or in the comment immediately above it, saying why the fix was rejected — that inline reason *is* the review record, so no second justification is recorded elsewhere. When the finding is on *text* rather than code, try deleting the flagged phrase before waiving it — decoration often buys the coupling the rule exists to prevent for nothing, and a waiver is for a crossing that genuinely must exist.

A blocked host is a **policy boundary, not an obstacle to route around**. When a sandbox or proxy denies a fetch, don't reach for an open-network runner — an ad-hoc CI workflow, a push-triggered "probe" — to make the request from somewhere the policy doesn't apply. Answer from committed reference material or ask the owner, and say plainly that anything unverifiable is unverified.

Before working around a finding from a vendored check, confirm the vendored copy is current — it reflects its last refresh, not upstream's head, so the fix may already exist upstream and simply not be pulled in yet.

When a warning can't be fixed with a small cause-addressing change now without hindering current work (e.g. it's waiting on an upstream release, or the real fix is a larger refactor), open a dedicated issue for it unless one is already open, then move on — resolving it (real fix, or a consciously-chosen suppression) happens in that issue's own change.

An approval — to merge, to ship, to proceed — applies only *backward*, to the work already in front of the owner when it's given, never to anything requested or done *after* it. A later follow-up, even a fix to the just-approved change, needs its own explicit approval; a chosen answer to a multiple-choice prompt isn't authorization just because an option's wording mentioned the action.

# The task lifecycle

The issue → branch → PR lifecycle every new task follows, independent of any one project. The rest of the git/GitHub procedures live in the `git-github-advanced` skill.

For every new task:

1. Create a GitHub issue describing the task before starting work.
2. Develop on a branch; reference that issue number in commit messages (e.g. `Refs #123`, `Fixes #123`, or `Closes #123`).
3. Update the issue's status (comments / close) as work progresses and when it's done.

A step only a human can perform — flipping a repository or console setting, granting a permission, adding a secret — gets **its own issue**, never a note in the PR body: the note merges and disappears with the PR while the setting stays unflipped. Give it a checkbox per step, what breaks while each is off, and its closing condition. The exception is a step whose home is an artifact the human is already editing. Before handing a step over at all, confirm you genuinely can't do it yourself.

# Engineering practices

General software-engineering practices, independent of any one project — portable, shared rules; project-specific rules (architecture, test mechanics) live in the consuming repo's own docs. The portable git/GitHub-operational practices — branch/commit history, merging, automated-job branches — live in [the git-github-advanced skill](../git-github/skills/git-github-advanced/SKILL.md); the mechanics of searching and rewriting text across files — grep/sed sweeps, renames, broken references — live in [the repo-text-sweeps skill](skills/repo-text-sweeps/SKILL.md); the practices for writing trustworthy tests — see-it-fail, snapshot/golden discipline, CI-only and heavy-browser tests, coverage gating — live in [the writing-tests skill](skills/writing-tests/SKILL.md); and how to investigate a bug and pin down its root cause — version-gap triage, re-deriving after a failed fix, probing for a real datapoint — lives in [the bug-investigation skill](skills/bug-investigation/SKILL.md).

- **Naming anything** — name it by scope/responsibility, never by technology or mechanism.
- **Derived or duplicated data** — keep one source of truth, generate the rest from it, and have a test fail on drift.
- **Splitting a fact across more than one place** — do it only when a technological constraint forbids a single home.
- **The drift-guard test for a forced split** — have its own text name the two-or-more places it watches and why the split is forced.
- **A duplicate that mirrors executable logic** (a static list shadowing predicate/matcher functions) — drift-guard it by *executing* the real logic against the list, never by parsing the logic out.
- **That execution check** — run it both directions: every entry accepted by some predicate, and every predicate satisfied by some entry.
- **A value copied into files that can't share an import** — declare a `sharedConstants` entry in `.claudinite-checks.json`: its `value`, per-file `counts`, and a `what` naming the places and why.
- **A `sharedConstants`-guarded value** — keep every occurrence on one line; counts match the *flat* literal, comments included.
- **A guarded value that changes over time** (a version string bumped each release) — set `regex: true` and give a pattern; every match must be identical across the declared files.
- **When file A references file B** — in code comments and Markdown alike, state *what* A needs from B or *that* it delegates, never *how* B does its job.
- **One commit per concern** — two changes that could each stand alone (separately revertible, cherry-pickable, bisectable) don't share a commit.
- **A commit message that numbers unrelated items** — it is describing the split it should have been. More commits is not itself the goal.
- **A commit that has landed** — later work is a *new* commit, never a rewrite of that one.
- **A file a test autogenerates** — put `GENERATED` in its filename (`foo.GENERATED.md`, `foo.baseline.GENERATED.json`).
- **A GENERATED file** — never hand-edit it.
- **A merge conflict in a GENERATED file** — never resolve it by hand: take either side to clear the markers, re-run the generator against the merged inputs, commit its output.
- **Automating that take-either-side step** — give the file a `merge=ours` `.gitattributes` entry, plus a one-time `git config merge.ours.driver true` per clone.
- **A manual conflict resolution that will recur** — `git config rerere.enabled true` replays it automatically next time.
- **How a platform or runtime behaves** — verify it against authoritative docs or a real run, never against a comment or a prior commit's claim.
- **A *behaviour-preserving* optimisation** — hash the full outputs of the old and new paths across *every* branch (fuzz the inputs that select each) and accept only a bit-identical match.
- **A hot path whose rewrite risks correctness more than it buys speed** — leaving it un-optimised is legitimate; record it as a deliberate call, not an oversight.
- **Each dependency** — earn it: prefer a built-in, or a few lines, for a narrow job.
- **A dependency whose justifying assumption has lapsed** — drop it.
- **A raised edge case** (a review's "what about scenario X?") — before adding production code, check whether the existing composed rules already produce the right answer.
- **When they already do** — add no production code; pin it with a regression test, plus an accept criterion under the relevant requirement where you track those.
- **That regression test** — assert the contrast case too, so it bites if the rule interaction ever changes.
- **Before writing a bespoke how-to** — check it against the authoritative external docs and keep only what they don't carry: our failure modes, gotchas, the exact path we ran.
- **A path you haven't actually run** — never document or recommend it, however standard or better it looks.
- **Resilience that swallows errors** — during development, before a solution is proven right, add debugging information first and remove it later.
- **A capability applied best-effort behind a silent fallback** (a probe-gated optimisation, an optional platform feature, a hint the runtime may ignore) — record whether it actually engaged.
- **Recording that** — read the state back where the platform exposes it, and log which path ran.
- **Everything the software persists on a user's machine** — keep it under **one** user-deletable location.
- **A new storage need** — extend that location; never earn a second one.
- **Anything the platform forces outside it** (a registration the OS owns) — name it explicitly as the exception.
- **A user-facing statement about what the software does with a user's data** (a permission usage string, a privacy policy, a store-listing disclosure) — treat it as part of the behaviour's contract.
- **Changing that behaviour** — change the statement **in the same commit**.
- **Retaining something previously not retained, adding an outbound connection, or opening a listener** — that changes the *promise*: decide it explicitly and rewrite the disclosure before the code.
- **A standing absolute** ("no tracking", "no cookies", "no external assets") — expect it in more than one place; grep the whole surface and reconcile every hit in that same commit.
- **Driving an external runtime more than once in a session** (a headless browser, a device, a REPL, a deploy target) — write **one** parameterised driver script into the scratchpad and re-point it.
- **That driver script** — take the target, the selector, and the output path from argv rather than authoring a fresh throwaway per invocation.
- **Automating a task that needs live AI conversation context** (a reflection pass over a session) — hook it to an existing human workflow event, never to background infrastructure.
- **The cheapest such trigger** — a change to an existing command's definition.
- **An expected, handled outcome in a pipeline or CI workflow** (known-bad inputs, anticipated stops) — exit clean with a comment, not as a failure.
- **The failure signal** — reserve it for genuine breakage.
- **A fetch that works on your machine but 403/400s or hits a CAPTCHA from CI or a sandbox** — blame the *datacenter IP*, not the User-Agent; browser-like headers won't change it.
- **Fixing that fetch** — route it through a residential-proxy service (these usually render JS, so a single-page app records real content) rather than tweaking headers.
- **A target still blocked through a proxy** — treat it as un-cacheable.
- **`pkill -f "<pattern>"`** — never chain it; it matches the invoking shell too, so everything after the `;` or `&&` is silently dropped.
- **A `-f` pkill pattern** — break the self-match by bracketing one character (`pkill -f "[h]ttp.server 8099"`).
- **A cloud or root setup script** — make it `cd` into the checkout before running anything; it may start in the repo's *parent* directory.
- **A missing-dependency error (`Cannot find module …`) on a *fresh* checkout** — run the install and re-run before hunting for a code-level cause.
- **A property tracked in more than one place** (a spec tag, a side manifest, a per-item field) — collapse it into a single source of truth.
- **Choosing that source** — prefer a *structural* classifier, derived from where the item lives, over a hand-set field.
- **A default value** — avoid it; require the value explicitly, or make it structural.
- **Automation maintaining many instances of a config** (a fleet of repos, generated project files) — have it **materialize the explicit value into every file it maintains** instead of interpreting absence.
- **"Unknown"** — it is a state of its own: never encode it as a zero, an empty string, or a type's default, and never let a decoder collapse it into one.
- **A field that can legitimately be absent** — encode unknown as a missing key or an explicit null, and keep the zero for a real zero.
- **Every stage of a pipeline** — preserve all three states (absent, zero, a real value); never fold three into two.
- **The absent case** — treat it as a normal, permanent shape of the data, not a gap something downstream should close.
- **Two fields making overlapping claims about one fact** (a `free` flag beside a `price: 0`) — keep each meaning what its own source said and let the consumer decide.
- **A check that walks a file tree** (an orphan/reachability scan, a doc audit, a lint) — derive its file set from `git ls-files`, never a filesystem walk with a hardcoded path-to-skip.
- **A brand-new file** — it is untracked and sits outside that sweep; `git add` or commit first, then re-run, before reading green as coverage.
- **A check that scans source for a forbidden token** (a banned API, an impure import, a DOM specific) — strip comments before you match, so it matches *code, not prose*.
- **That stripping** — make it *string-aware*: a `//` inside `"https://…"` is not a comment.
- **The stripper itself** — reuse `stripComments` in [`engine/checks/helpers/code-scanning.mjs`](../../engine/checks/helpers/code-scanning.mjs).
- **A scan that can't import it** (a test running where the mount is absent) — inline the same string-aware pass and point a comment back at that canonical source.
- **A comment** — describe the code's *current state*, never the edit that produced it.
- **The change you just made** — never explain it in a comment; the diff and the commit message are where change history belongs.
- **An absence** — never comment that something was removed, renamed, or is "no longer" done.
- **A comment narrating a fix in the past tense** ("switched to X because Y broke") — keep only what is still true of the code in front of you ("X, because Y can't handle Z").
- **Every comment** — add it only when it carries something the code cannot; a comment that restates the code costs attention and adds nothing.
- **What a comment carries** — the *why*, or a cross-file relationship the code can't state itself.
- **A fact reconstructable from same-file code plus a known convention** — never restate it in a comment.
- **A file path a comment must name** — spell it in exactly one canonical place; every other mention points at that reference or the concept.
