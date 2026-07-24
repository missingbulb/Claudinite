# Growth — promote lessons into the canon (the central stage)

The [growth lifecycle](../../README.md)'s central stage: read the target members' local packs, lift the portable lessons into the shared canon, and open a PR against the canon's default branch **for the owner to approve**. Declared only by the Claudinite home repo, so it runs **once, centrally**, never per project.

You run under the executor, dispatched by a `ready-for-agent` issue whose **Context section is binding scope**: it names the exact target members (those whose local packs changed in the window). Work exactly that list — the fleet enumeration already happened in the precondition; **do not enumerate the fleet yourself or widen past the Context**.

The task's declared outcome ceiling is **`open-pr`**: promotion is the **judgment gate before shared canon**. It opens a PR and **never arms auto-merge** — the owner approves it. But don't lean on that review as the portability check: [extract](/packs/grow_with_claudinite/extract.md) stays project-specific by design, so it's no second opinion, and the owner can't re-derive every portability call. This task's judgment is the real thing between a bad rule and every project that reads the canon — keep the bar high (dedupe against the whole corpus; default to reject when unsure).

## Conventions used in this doc

- **GitHub access is MCP-only** (`mcp__github__*`). You are outside each member repo — read its files over the API (get-file-contents, never a cross-repo checkout; the sandbox has no cross-repo git). The canon PR is opened over MCP too.
- **A member's local packs** are everything under `.claudinite/local/packs/` (the legacy `.claudinite/local_packs/` accepted during the rename window) — its own packs, never the read-only mounted canon elsewhere under `.claudinite/`.
- **`main`** stands for the canon's default branch.

## What each run does

### 1. Read the target members' local **packs**

For each member named in Context, read its **local packs**. The candidate pool is a local pack's captured knowledge — its `RULES.md` **prose** AND its own **checks** (a `<pack>/*.mjs` rule module — its id, description, and failure message *are* a captured, enforceable lesson; the strongest promotion lifts it to a **canon check**, generalized, reusing the [prose-to-checks](../../skills/prose-to-checks/SKILL.md) mechanics — or to canon prose when it doesn't generalize to a check). **Out of scope, staying put:** a lesson deliberately placed as a **code comment at its call site**, a project's task scripts, product source, and config. Never promote from product source. You don't need to tell new from old — the dedup step drops anything the canon already carries. No barrier holds tonight's extracts: read whatever is already **merged** on each member's default branch; anything landing mid-run is tomorrow's input.

### 2. Generalize each candidate — *before* judging whether it belongs

Generalize first, then decide worthiness — never the reverse. The act of generalizing is itself the portability probe — a rule that goes vacuous when lifted, or only makes sense with its project's context, isn't portable; leave it local. Work the rule standalone (origin naming and grouping carry no weight); strip the project (names, files, example stay in the origin repo — promote the distilled rule only); a **technology** mention isn't a disqualifier (lift it to the broadest scope that stays true — tech-specific is fine, *product*-specific is not); decide tool-vs-process and frame it for that home.

### 3. Then judge worthiness — deduped against the *entire* corpus

Holding the generalized rule, decide if it earns a place by the bar [item-routing.md](../../item-routing.md) owns (don't restate its gates). Lean **inclusive** — keep anything a future project could use — but be strict about **duplication**: dedupe against **every** corpus doc, not only the one you'd expect to own it.

### 4. Triage the mechanism, then route

- **Descend the promotion ladder first** ([item-routing.md](../../item-routing.md)'s mechanism triage). Prose is the fallback, not the default: a lesson a check can carry is **authored as the check** in this PR — the rule module in the right pack, the failure message carrying the generalized lesson, **plus a fixture test proving it fires** on a violating input and stays quiet on a clean one. When a confident detection-plus-fixture can't be authored unattended, land the lesson as prose **and** open a tagged conformance-backlog issue — never a silently-shipped broken check.
- **Route** each prose rule to its **one** owning doc ([item-routing.md](../../item-routing.md) owns the placement); match its voice and format; pick exactly one owner, never split or duplicate.
- **A technology with no home → mint a fingerprinted stub pack, in its own PR**, reusing the pack-writing mechanics [the generate-project-instructions skill](/packs/grow_with_claudinite/skills/generate-project-instructions/SKILL.md) owns — `packs/<tech>/` with `pack.mjs` (add the `marker`/`detect` fingerprint when the technology carries a reliable one, else `detect: null`), a `RULES.md` seeded from the lesson, a `README.md`, and its `packs/README.md` index row. A minted pack ships in its **own** PR, split from the run's lesson-promotion PR (a new pack earns its own review surface). Never mint from imagination and never park an empty one to fill later — a pack minted here is populated from the *real, portable lesson* that justified it.
- **Write it terse — when + what.** State the relevance (*when* it applies) and the rule (*what* to do); add a *why* only to flag severity, in a few words.
- **Bounded write surface — `packs/`/`skills/` only** (CI-enforced on the PR). Edit only the one owning doc — or, for a check-conversion, only the new rule module, its registration in the pack registry, and its fixture test. Don't "improve" unrelated rules while you're in there. The two bounded exceptions (both within `packs/`): the new-doc path [item-routing.md](../../item-routing.md) owns, and minting a stub pack.
- **Open a PR against `main`** on a per-run-unique branch — one PR for the whole run's accepted lessons (a minted stub is the exception: its own PR). Never a direct push. **Put the issue reference in the commit message** (`Refs #<n>` for the tracker below) — the `basics` `task-lifecycle` check reds CI on a promote commit that cites none.

### 5. Log the run to the tracker

Append a dated comment for every run that promoted at least one lesson, and for any notable rejection.

## Tracking issue

The standing self-improvement log is the issue titled exactly **`Claudinite tracker: Promote to Canon`**.

- **Find it by that exact title, never a fuzzy match or a hard-coded number** (a bare number can dangle).
- **Create it already closed if missing. Never open, close, or reopen it** — its state carries no meaning; only the log does.
- Log each run as a **dated comment** — the date, and per lesson: the origin repo, the **ladder rung it landed on** (check id / skill / owning doc, with the named reason when prose was the fallback), and the generalized rule (or, for a notable rejection, the reason and the existing rule that already covers it).

## What this task must never do

- **Never mine outside a local pack** — product source, task scripts, code comments, and config are out of scope; only a local pack's `RULES.md` prose and its own check modules are candidates.
- **Never promote a product-specific or one-off item** — it stays in that project's local packs.
- **Never weaken, restate, or duplicate an existing rule** — fold a genuine sharpening in per [item-routing.md](../../item-routing.md) instead.
- **Never widen past the Context member list**, and **never touch a member repo** — this task only reads members and writes the canon PR.
- **Run on `opus`** — every step is a judgment call (portability, duplication, ownership, how to generalize without distorting), and a downgraded model ships a plausible-but-wrong *acceptance* the owner's review is least likely to catch. This task declares `agent_model: opus`; the executor dispatches its subagent there.
