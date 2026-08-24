# Version history

Records for `packs/claudinite-fleet-sheepdog/pack.mjs`'s `version` field, one row per bump.
The rows below are version-numbered comments that used to sit beside `version:` in the
manifest, moved here verbatim; nothing earlier than the first of them was backfilled, and gaps
between rows (versions with no comment) were never recorded to begin with. Every bump from
here forward adds its own row.

| Version | Date | What changed |
|---|---|---|
| 60823.2 | 2026-08-23 | `fleet-baseline` reports OUTCOMES, not dispatches: after firing it follows each member until its declaration stamps canon's published engine and pack versions, reports converged / already-current / did-not-converge / never-started / unknown, and fails the run when a dispatched member never got there (#1293, reversing #649's give-up-the-follow for a bounded poll on a real terminal condition). |
| 60823.1 | 2026-08-23 | Reads a member's settings under either name; freshness is a version comparison, so the per-member canon compare and the `ref-not-on-trunk` state it detected are gone (#1252). |
| 11 | — | Fleet-digest LEAVES, to the claudinite-dashboard pack — the pack whose page is the only thing that reads the series it writes. What stays here is an enforcer's `digest`, `owner` and `exclude` config, which the task still reads off this entry as its legacy source, so no enforcer declaration has to change. |
| 12 | — | The FLEET_GITHUB_TOKEN grant is stated once, in fleet-token.mjs, and rendered into every message about it — additive, no migration, delivered so an enforcer's next token error names the whole grant instead of that sweep's subset (#1030). |
| 13 | — | The task contract moved into the claudinite-growth `writing-tasks` skill; the pointers in this pack's README and its three fleet task docs follow it (#975). |
| 14 | — | Each fleet task's doc is a README.md — every one of them is agentless, and task.md is the spec an agent session reads (task-md-only-when-agentic, #1055). |
| 17 | — | A task comment names the terminal a declined manual lever closes with in its current spelling; no behaviour moves. |
| 18 | — | Renamed from `sheepdog` — the pack's subject is a Claudinite feature, so it carries the prefix that says so. The config reader takes an enforcer's entry under either spelling, since a declaration converges on its own schedule. |
| 60821.1 | — | A member's add-packs work list is a MARKED issue targeting the member task, so the member's own scheduler run adopts it and the wake dispatch becomes a latency nudge (#1119). |
| 60821.2 | 2026-08-21 | This pack's inline version-history comments moved out of `pack.mjs` into this file. |
| 60822.1 | 2026-08-22 | The canon-clone dispose goes through the shared `removeTree`, whose retry survives git's own housekeeping still writing into the tree (#1219). |
| 60822.2 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60824.1 | 2026-08-24 | Queue vocabulary and delivery imports move to `claudinite-tasks/shared-code/*` (#1317). |
