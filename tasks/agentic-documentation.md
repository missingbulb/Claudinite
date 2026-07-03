# Writing instruction docs for Claude

How to author a Markdown instruction file — a practice doc, a project `CLAUDE.md`, a routine spec — so Claude follows it reliably. These files are prompts; the rules below are downstream of Anthropic's own prompting guidance, cited inline to the Sources footer.

## Right altitude

- Write concrete rules Claude applies with judgment — the "Goldilocks zone between two common failure modes" [ctx]: hardcoded, brittle branching on one side, and vague high-level guidance that "falsely assumes shared context" on the other. Aim "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics" [ctx].
- Encode only what deviates from Claude's defaults; anything it already gets right is noise. Prune test: for each line ask "Would removing this cause Claude to make mistakes?" — if not, cut it [cc].

## Terseness is about adherence, not just tokens

- Bloat doesn't only cost context — it makes Claude *ignore* your real instructions: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions" [cc]. A rule that keeps getting missed usually means the file is too long, not that the rule is too weak.
- Aim for "the smallest possible set of high-signal tokens" [ctx]; specific, concise instructions are followed more consistently [mem].
- Keep an always-loaded file (a `CLAUDE.md`) under ~200 lines — longer "reduce[s] adherence" [mem]. When it grows, move on-demand or file-scoped rules into a skill or a path-scoped rule instead of padding it; `@`-imports still load at launch, so they organize context, they don't save it [mem][cc].

## Write each rule to be verifiable

- Lead with when it applies, then a concrete imperative you could check: "Use 2-space indentation" not "Format code properly"; "Run `npm test` before committing" not "Test your changes" [mem].
- Prefer positive instructions — tell Claude what to do, not what to avoid ("write flowing prose" over "don't use markdown") [pe].
- State the *why* only when it changes behavior, and put it in a trailing clause — never woven into the imperative. A reason can help Claude generalize the rule [pe], but the imperative alone must stand on its own, and the rationale is re-read cost on every load.
- One rule, one idea; ensure no two rules contradict — between conflicting instructions Claude "may pick one arbitrarily" [mem].

## Examples, structure, iteration

- Examples are among the most reliable ways to steer format and tone — "for an LLM, examples are the 'pictures' worth a thousand words" [ctx]. Give a few (3–5) diverse, canonical examples wrapped in `<example>` tags; don't dump "a laundry list of edge cases" [ctx][pe].
- Group with markdown headers and bullets over dense paragraphs, and open with a one-line scope [mem].
- Golden rule: "Show your prompt to a colleague with minimal context... If they'd be confused, Claude will be too" [pe] — write for a brilliant new hire, not a mind-reader.
- Treat the doc as a prompt: after editing, confirm Claude's behavior actually shifts, and reserve emphasis ("IMPORTANT", "YOU MUST") for the few rules that need it — current models over-trigger on aggressive phrasing [cc][pe].
- Instructions are advisory, not enforcement. For an action that must happen every time (before every commit, after each edit), a hook guarantees it where a doc cannot [mem][cc].

## Sources

- [ctx] — Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- [cc] — Claude Code best practices: https://code.claude.com/docs/en/best-practices
- [mem] — Claude Code memory (CLAUDE.md): https://code.claude.com/docs/en/memory
- [pe] — Prompt engineering, be clear and direct: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct
