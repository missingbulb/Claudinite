# github-pages — why its rules exist

Maintenance and review only: the reason behind each rule, written so a later pass can reaffirm or
retire it. No session loads this file and no rule points a reader here.

- **(RULES-1)** The trap is that every local preview — `file://`, `python -m http.server`, most
  dev servers — serves the site at a domain root, so a root-relative URL is correct there and
  wrong only once deployed, where nothing reports it but a 404 on the live page. A **custom
  domain** moves the site back to the root and makes the rule moot for that repo, which is why
  the rule states the subpath as the default rather than as an absolute. Retire it if these sites
  ever standardise on custom domains, or if the local preview is replaced by one that serves from
  the repo subpath.

- **(RULES-2)** The release is a task rather than a push-triggered workflow because the queue
  owns the trigger, the gate, the version bump and the park lanes, and a workflow that deploys on
  push has none of them: it ships a tree with no version cut, and a red run in the Actions list
  reaches nobody (owner, 2026-09-17: the hosting packs should have "a daily release task that will
  bump the version and release if there was any change"). The wake command is in the rule because
  a session that wants the site deployed now would otherwise reach for a push or a dispatch of
  its own. Retire the rule if the deploy ever becomes idempotent against a second publisher.

- **(check:gp/site-config)** The publish set is deliberately **additive**, and the check makes
  the cost of that choice survivable. The rejected alternative — "publish the repo except the
  tooling" — publishes every draft, note and key nobody thought to exclude, and publishes each
  *new* one silently the day it lands. Additive inverts the failure: a forgotten entry is a
  missing page, and the check catches a path that matches nothing tracked, a tooling directory
  in the set and a set with no `index.html` before any of them reaches the default branch.
  Retire it if the artifact ever stops being built from an explicit list.

- **(check:gp/deploy-workflow)** The deploy runs from the repo's own `.github/` because GitHub
  runs a Pages deploy only from a workflow job in the repo's own tree, never from the mount — so
  the pack holds the template and each repo hosts a managed copy. The check holds the copy
  present, dispatch-only and current, and holds every other workflow off the Pages actions,
  because a second publisher or a push trigger deploys a tree with no version cut and no park
  lane, and its green run looks exactly like success. Retire it if the vendored surface is ever
  replaced by something the member cannot hold a stale copy of.
