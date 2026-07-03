# Writing instruction docs for Claude

How to author a Markdown doc an agent reads as instructions — a practice doc, a project `CLAUDE.md`, a routine spec. Read before writing or editing one. Every rule here binds this file too.

## Cost model — why terse

Instructions load into the context budget on every relevant read; an `@`-imported doc pays its full length **every** session. So write the shortest version that stays unambiguous, and encode only what **deviates** from what the model does by default — never restate general good practice or the model's own habits.

## Anatomy of one instruction — when + what (+ why only if it changes behavior)

The four things a complete instruction answers — *in what context*, *when to apply*, *what to do*, *how much it matters* — collapse into three moves; don't write them as four labeled sections.

- **Lead with the trigger** — the context and when the rule fires, merged into the opening clause — so the agent skips or applies it in one glance.
- **State the action as a concrete imperative** — name the test, limit, or command, not a vague adjective ("keep it short" → give the bound).
- **Add the *why* only when it changes behavior** (severity, a non-obvious risk), as a trailing clause or parenthetical — never woven through the rule. Rationale orients a human reviewer once; to the agent it is re-paid noise on every read.
- **One rule = one idea.** Don't bundle two lessons in a bullet.

## Length & detail

- As short as stays unambiguous, no shorter — terseness cuts padding, not detail. Ambiguity costs a wrong guess; the few concrete words that prevent it are cheap.
- A **worked example** earns its tokens only for a rule that's subtly wrong by default; otherwise the imperative stands alone. If the example is long, keep it in its own doc and cite it.

## Structure of a doc

- Open with a one-line **scope**: what it covers and when to read it — that line is the trigger an index points at.
- Then flat, self-contained rules in the imperative; group only when grouping aids retrieval. Match the surrounding doc's voice and format.
- `@`-import only docs that apply to essentially **every** session; soft-link the rest so they load on demand — force-loading a specialized doc taxes every unrelated session.
