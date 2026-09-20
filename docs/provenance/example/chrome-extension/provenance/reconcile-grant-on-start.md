## 2026-08-12 · born · split from `runtime-host-request`, whose reconcile clause it was (#775)
- **Source:** the clause of the #222 rule: a grant revoked from `chrome://extensions` out from under the worker.
- **Reason:** the grant can be revoked at any time, so the stored enabled-flag is reconciled against the permission actually granted on every worker start (the #222 reason, carried over with the clause).
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, beside the rule it left.
- **Landed:** #775 · pack version 2.

## 2026-09-05 · moved · from `RULES.md` into the `extension-host-permissions` skill, whose file records why (#1667)
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, now loaded only on a `manifest.json` edit; the trigger and the alternatives it beat are on the skill's file.
- **Landed:** #1667 (Refs #1662) · pack version 60903.6.
