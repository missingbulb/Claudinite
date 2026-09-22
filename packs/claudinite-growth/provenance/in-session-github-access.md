## 2026-09-13 · born · in-session code cannot reach GitHub over REST (#2245)
- **Source:** derived, not recorded - this clone's history begins at the 2026-09-13 re-seed, which
  is the earliest commit carrying the id; the decision behind the check predates it and the pack's
  backfill lane is where the rest of it belongs.
- **Reason:** the `routines-session-steps` rule's enforcement half. A `GITHUB_TOKEN` read, a
  `makeGh` client or a raw `api.github.com` fetch in code that runs in an MCP-only session cannot
  authenticate there, and the failure is invisible: the token is set but empty, so the request goes
  out unauthenticated and comes back as GitHub's IP-keyed rate-limit 403, a message about somebody
  else's traffic that names nothing about credentials.
- **Mechanism:** a declared check over the in-session trees, blocking, beside the skill whose rule
  it enforces. The three assertions are the three spellings of the same mistake; `tasks/` is
  deliberately outside the scope, because code-work runs Action-side with an injected token.
- **Landed:** before this clone's history.

## 2026-09-22 · scope-changed · the scope now names where migration records actually live (#2245)
- **Source:** the owner, auditing the 51 `check-never-fires` findings in the first production usage
  review (#2237) - the only one of them whose scope was genuinely empty.
- **Reason:** the pattern anchored at the repository root, `^(routines|migrations)/`, and no tree
  here carries either folder there: a migration record lives under the flow that owns it,
  `engine/migrations/` or `packs/<pack>/migrations/`. It selected nothing, so a blocking check read
  as enforcement while refusing nothing, and every fixture spelled the same dead layout and kept
  proving the matching.
- **Mechanism:** `(^|/)migrations/.*\.mjs$` - the structural form the records' own discovery uses,
  which reaches a member's vendored copies without a second arm. The `routines` arm went rather than
  being repointed: the skill teaches `dev/routines/<name>/` for a recurring routine, but that folder
  holds prose and shell, and no tree carries one. The test gained the assertion
  `writing-check-selects` asks for - the scope read off `git ls-files`, non-empty, both flows
  present - so the next layout change fails rather than being inherited.
- **Actor:** @missingbulb (owner), who filed #2245 naming the repoint, the assertion and the choice
  to drop a dead alternation rather than leave it.
- **Model:** Claude Opus 5.
- **Retire when:** the migration pass is no longer the in-session surface - a second surface
  arrives with its own arm and its own assertion, never by widening this one.
- **Landed:** #2245
