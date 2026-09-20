## 2026-09-18 · born · converted from references.md (RULES-2)
- **Reason:** The release is a task rather than a push-triggered workflow because the queue owns the
  trigger, the gate, the version bump and the park lanes, and a workflow that deploys on push has
  none of them: it ships a tree with no version cut, and a red run in the Actions list reaches
  nobody (owner, 2026-09-17: the hosting packs should have "a daily release task that will bump the
  version and release if there was any change"). The wake command is in the rule because a session
  that wants the site deployed now would otherwise reach for a push or a dispatch of its own.
- **Mechanism:** prose
- **Retire when:** Retire the rule if the deploy ever becomes idempotent against a second publisher.
