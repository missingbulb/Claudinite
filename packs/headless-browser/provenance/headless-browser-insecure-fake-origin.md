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
