# Version history

Records for `packs/claudinite-fleet-sheepdog/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60905.1 | 2026-09-05 | Task declarations name what the run does to pull requests in the four-value `expected_outcome` vocabulary (#1695): `pr` became `fresh_pr` and `none` became `no_code_changes`, the same behaviour under the word that now sits beside `amend_existing_or_create_new_pr` and `supersede_existing_pr`. |
| 60903.2 | 2026-09-03 | The config rules (`exclude`, `packSeeds`, seeds-agree) move out of `RULES.md` into the `configuring-the-fleet` skill, forced for `.claudinite-settings.json` (#1662). |
| 60903.1 | 2026-09-02 | Task declarations converted to `task.json`; the declaration's comments moved into each task's README (#1633). |
| 60902.3 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60902.2 | 2026-09-02 | The four fleet sweeps convert to `preconditions: ['none']`. Every input lives outside this repo, so no collector signal can predict the answer; the honest declaration is "always run, and no-op cheaply" (#1578). |
| 60902.1 | 2026-09-02 | The README's two mentions of the member's `adopt-requested-packs` task being "ceilinged at `open-pr`" are corrected: that ceiling changed to landing unattended in #1453, and both mentions now say so instead of naming the retired outcome spelling (#1470). |
| 60830.1 | 2026-08-30 | The pack and task READMEs say a failed sweep parks, rather than naming the retired bare `needs-human` label (#1395). |
| 60827.1 | 2026-08-27 | Drops the pointers to the fleet digest that moved to `claudinite-dashboard`, now that the digest is retired outright (#1392). Comments and README only; nothing a member runs changes. |
| 60824.2 | 2026-08-24 | `fleet-usage` and `usage-fleet.GENERATED.json` retired — the dashboard's fleet page now reads each member's own usage file directly, as the viewer, and derives coverage live; the destructive tail of #1158 (#1166). |
| 60824.1 | 2026-08-24 | Task workers reach delivery, GitHub and work-item helpers through the `claudinite-tasks` pack's `shared-code/` (#1317). |
| 60823.2 | 2026-08-23 | `fleet-baseline` reports OUTCOMES, not dispatches: after firing it follows each member until its declaration stamps canon's published engine and pack versions, reports converged / already-current / did-not-converge / never-started / unknown, and fails the run when a dispatched member never got there (#1293, reversing #649's give-up-the-follow for a bounded poll on a real terminal condition). |
| 60823.1 | 2026-08-23 | Reads a member's settings under either name; freshness is a version comparison, so the per-member canon compare and the `ref-not-on-trunk` state it detected are gone (#1252). |
| 60822.2 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60822.1 | 2026-08-22 | The canon-clone dispose goes through the shared `removeTree`, whose retry survives git's own housekeeping still writing into the tree (#1219). |
| 60821.2 | 2026-08-21 | This pack's inline version-history comments moved out of `pack.mjs` into this file. |
| 60821.1 | — | A member's add-packs work list is a MARKED issue targeting the member task, so the member's own scheduler run adopts it and the wake dispatch becomes a latency nudge (#1119). |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 19 | 2026-08-20 | The tick becomes the scheduler run, and the janitor stops parking finished work (#1108) |
| 18 | — | Renamed from `sheepdog` — the pack's subject is a Claudinite feature, so it carries the prefix that says so. The config reader takes an enforcer's entry under either spelling, since a declaration converges on its own schedule. |
| 17 | — | A task comment names the terminal a declined manual lever closes with in its current spelling; no behaviour moves. |
| 14 | — | Each fleet task's doc is a README.md — every one of them is agentless, and task.md is the spec an agent session reads (task-md-only-when-agentic, #1055). |
| 13 | — | The task contract moved into the claudinite-growth `writing-tasks` skill; the pointers in this pack's README and its three fleet task docs follow it (#975). |
| 12 | — | The FLEET_GITHUB_TOKEN grant is stated once, in fleet-token.mjs, and rendered into every message about it — additive, no migration, delivered so an enforcer's next token error names the whole grant instead of that sweep's subset (#1030). |
| 11 | — | Fleet-digest LEAVES, to the claudinite-dashboard pack — the pack whose page is the only thing that reads the series it writes. What stays here is an enforcer's `digest`, `owner` and `exclude` config, which the task still reads off this entry as its legacy source, so no enforcer declaration has to change. |
