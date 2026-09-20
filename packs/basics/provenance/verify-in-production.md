## 2026-09-01 · born · converted from references.md (verify-in-production-1): "A rewritten branch makes the brief describe a"
- **Reason:** #1121 was filed against a scope its PR then dropped, so the verification was moot
  before the merge it waited on.
- **Mechanism:** a step of the verify-in-production skill, a workflow
- **Retire when:** Retire the merge-first rule only if a verification can track its PR's live diff.

## 2026-09-01 · strengthened · converted from references.md (verify-in-production-2)
- **Reason:** #1460 was filed and then hand-verified twelve minutes later — the artifact was
  readable all along and the issue was pure overhead. The bar stays "could not be watched now" for
  as long as filing costs a queue run.
- **Mechanism:** a step of the verify-in-production skill, a workflow

## 2026-09-01 · strengthened · converted from references.md (verify-in-production-3): "A public URL"
- **Reason:** One executor batch spent five of its seven claimed items rediscovering unreadable
  artifacts and parking `needs-human-action` (#1184, #1253, #1268, #1288, #1291), before the coded
  form existed for the URL-readable ones among them.
- **Mechanism:** a step of the verify-in-production skill, a workflow
- **Retire when:** Retire only if queue sessions gain a way to read those surfaces.

## 2026-09-01 · strengthened · converted from references.md (verify-in-production-4)
- **Reason:** Three cross-repo `Verify:` items each parked minutes after being picked, on
  `repository "…" is not configured for this session` (#1349, #1351, #1396) — the queue's agent
  sessions are scoped to the filing repo alone.
- **Mechanism:** a step of the verify-in-production skill, a workflow
- **Retire when:** Retire only if those sessions gain cross-repo scope.

## 2026-09-01 · strengthened · converted from references.md (verify-in-production-5)
- **Reason:** Hand-set `task:status:*` labels produced an item closed wearing a live status (#1220)
  and one labelled `done` but left open (#1265); the done label hides the item from the leash.
- **Mechanism:** a step of the verify-in-production skill, a workflow
- **Retire when:** Retire only if the queue's transitions are enforced server-side.

## 2026-09-01 · strengthened · converted from references.md (verify-in-production-6)
- **Reason:** #1160's retry re-armed `Not-before:` from the field's old value, which the hourly
  release pass had already left in the past, so the item went ready on the next pass and a daily
  retry spent a session an hour.
- **Mechanism:** a step of the verify-in-production skill, a workflow
