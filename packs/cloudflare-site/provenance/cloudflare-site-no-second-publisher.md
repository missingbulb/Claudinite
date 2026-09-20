## 2026-09-13 · born · converted from references.md (check:cloudflare-site/no-second-publisher)
- **Reason:** A workflow that deploys ships the tree with no version cut, no gate and no park lane;
  a `CNAME` file under the published tree is the previous host still claiming the domain. Both are
  leftovers rather than choices, which is why they are detected rather than handed to an adopter as
  checklist items — a checklist of steps that are no-ops for most adopters teaches its reader to
  skim it (owner, 2026-09-13: "It should not include turning off other registrars or disabling
  github pages as optional steps, so they need to be evaluated if they are there").
- **Mechanism:** a check
- **Retire when:** Retire it if the release ever becomes idempotent against a second publisher.
