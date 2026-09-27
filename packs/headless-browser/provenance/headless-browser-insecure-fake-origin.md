## 2026-09-27 · born · out of the retired use-https-fake rule
- **Source:** the prose-to-checks sweep of the canon, over the pack's own prose.
- **Reason:** route interception is what makes a file a fake origin's harness, so it is the gate
  that separates the origin a run chooses from an http URL a page merely mentions.
- **Actor:** the canon-prose-to-checks task.
- **Mechanism:** declared, a line match on a non-loopback http literal, sparing the route pattern
  itself and an href/src/action in fulfilled markup.
- **Rejected:** the allowlist form, flagging every `goto(` whose argument is not an https literal,
  which would also catch an origin reaching the call through a variable - a parameterised goto is
  ordinary in a capture harness, so it reds correct work.
- **Retire when:** browsers stop gating capabilities on the origin's scheme.

## 2026-09-27 · scope-changed · the pack's own directory leaves the scan set
- **Reason:** a real-tree run of the check found it firing on the fixture file that exists to spell
  the shape it bans. The engine self-excludes a skill-scoped declaration's own directory and a
  pack-root one's not at all, so the exclusion is written by hand; a member never sees it, its copy
  of the pack living under the unscanned mount.
- **Actor:** the canon-prose-to-checks task.
- **Mechanism:** the pack path added to the check's `excludeFiles` alternation, and a clean fixture
  per check pinning it.
