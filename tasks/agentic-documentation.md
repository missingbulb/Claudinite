# Writing instruction docs for Claude

How to author a Markdown doc an agent reads as instructions — a practice doc, a project `CLAUDE.md`, a routine spec. Read before writing or editing one. Every rule here binds this file too. Grounded in Anthropic's published guidance (sources at the end), not just local convention.

## Aim for the right altitude

The governing principle: sit between two failure modes — **brittle over-specification** (hardcoded, exhaustive branching logic that's fragile and high-maintenance) and **vague under-specification** (high-level guidance that gives no concrete signal). Write concrete rules the agent *applies with judgment*, not a decision tree it executes and not a platitude it can't act on.

## Terse — a finite attention budget

Instructions load into context on every relevant read; an `@`-imported doc pays its full length **every** session. It is not only token cost: **vague or bloated instructions measurably reduce adherence** — Claude follows specific, concise instructions more reliably. Find the smallest set of high-signal tokens, and encode only what **deviates** from what the model does by default. Heuristic: keep a `CLAUDE.md` under ~200 lines; past that, adherence drops — split into on-demand docs.

## Anatomy of one instruction — trigger + imperative (+ why only if it changes behavior)

The four things an instruction answers — *context*, *when*, *what*, *how much it matters* — collapse into three moves; don't write them as four labeled sections.

- **Lead with the trigger** — context and when the rule fires, merged into the opening clause — so the agent skips or applies it in one glance.
- **State the action as a concrete, verifiable imperative** — name the test, limit, path, or command: "Use 2-space indentation" not "format properly"; "Run `npm test` before committing" not "test your changes".
- **Add the *why* only when it changes behavior** (severity, a non-obvious risk), as a trailing clause — never woven through. Rationale orients a human reviewer once; to the agent it is re-paid noise on every read.
- **One rule = one idea, and no two rules contradict** — conflicting instructions make Claude pick arbitrarily; fold duplicates, remove stale ones.

## Use examples — a few, well-chosen

Examples are among the highest-signal clarifiers: include one where a rule is **subtly wrong by default**, and to pin an **exact output format or edge case**. Curate, don't exhaust — one sharp example beats five; park a long one in its own doc and cite it.

## Structure, loading, and iteration

- Open with a one-line **scope**: what it covers and when to read it — that line is the trigger an index points at.
- **Headers and bullets, flat imperative rules** — Claude scans structure the way a reader does; organized sections beat dense paragraphs.
- **`@`-import only docs that apply to essentially every session; move procedures, localized, or on-demand rules to a soft-linked doc, a skill, or a path-scoped rule** — force-loading a specialized doc taxes every unrelated session.
- **Iterate.** An instruction doc *is* a prompt: after writing, check it actually changes behavior and refine — don't pile on content without testing that it works.

---

Sources: Anthropic — [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (right altitude, attention budget), [How Claude remembers your project](https://code.claude.com/docs/en/memory) (< 200 lines, adherence, specificity, structure, load scope), [Be clear, direct, and detailed](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct), [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices).
