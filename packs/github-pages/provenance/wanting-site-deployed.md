## 2026-09-18 · born · Rebuild github-pages as a nightly release task over one deploy workflow (#2101)
- **Source:** the owner's boundary, 2026-09-17: a hosting pack "needs to only care itself with how
  to serve, wire release, maintain a release ... not anything else that deals 'being a website' like
  versions".
- **Reason:** the `site-release` task is the one path to production because the queue owns the
  trigger, the gate, the version cut and the park lanes. A second publisher has none of them: it
  ships a tree with no version cut, and its green run looks exactly like success while a red one in
  the Actions list reaches nobody.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** prose carrying the wake command, because a session that wants the site deployed now
  would otherwise reach for a push or a dispatch of its own; the `gp/deploy-workflow` check holds
  the other half, that no second workflow publishes.
- **Rejected:** a workflow that publishes on push, which is the shape the pack had until this change
  and the shape a session reaches for first.
- **Retire when:** the deploy becomes idempotent against a second publisher.
- **Landed:** #2101 · pack version 60917.1.
