# Version history

Records for `packs/claudinite-canon-curation/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60921.2 | 2026-09-21 | Convert the instructions a repo already wrote into its pack (#2191) |
| 60921.1 | 2026-09-21 | Move every pack's VERSIONS.md under its provenance/ folder (#2192) |
| 60920.5 | 2026-09-20 | A task cadence measures whole UTC periods, not a per-repo anchor (#2182) |
| 60920.4 | 2026-09-20 | Provenance: the marking pass, every rule marked and every references.md converted (#2178) |
| 60920.3 | 2026-09-20 | Provenance: the mechanism - the grammar, the tool, the checks, the forced skill, the record (#2176) |
| 60920.2 | 2026-09-20 | Skill frontmatter: a skill declares what its body is, workflow or guidelines (#2166) |
| 60920.1 | 2026-09-20 | Restructure the tasks pack's public surface behind shims and collapse its aliases (#2116) |
| 60917.1 | 2026-09-17 | Derive the tasks pack's published surface instead of hand-listing it (#2099) |
| 60915.5 | 2026-09-15 | Give the tasks pack one public surface, and make it enforceable in members (#2068) |
| 60915.4 | 2026-09-15 | Claudinite canon: rule revalidation (#2058) |
| 60915.3 | 2026-09-15 | Scope claudinite-growth to local packs, give the shelf its own tasks (#2047) |
| 60915.2 | 2026-09-15 | Five canon tasks change what they do to their pull requests (#2045) |
| 60915.1 | 2026-09-15 | Track a change worked on now by its PR, not an issue (#2016) |
| 60914.1 | 2026-09-14 | claudinite-tasks: roles as folders — src/<role>/, typed world ports, queue/ frozen as ABI (#1890) |
| 60913.1 | 2026-09-13 | State a rule's prose size as a band, not an exact word count (#2009) |
| 60906.6 | 2026-09-06 | Retire the tidy-repo pack; absorb improve-comments into basics (#1842) |
| 60906.5 | 2026-09-06 | Enforce newest-first ordering in every pack's VERSIONS.md (#1543) |
| 60906.4 | 2026-09-06 | Promote the validated survivors of four growth-promote PRs (#1828) |
| 60906.3 | 2026-09-06 | Give the three canon-curation PR tasks an automerge policy (#1822) |
| 60906.2 | 2026-09-06 | Scheduling is the task's own precondition; the scheduler keeps no state (#1733) |
| 60906.1 | 2026-09-06 | Claudinite: pack version history (#1730); Rules to checks with the four-moment mechanisms: 27 bullets retired across basics, the home pack and canon-curation (#1779) |
| 60905.2 | 2026-09-05 | Pack versions are cut on main by automation, never in the pull request (#1726) |
| 60905.1 | 2026-09-05 | Task declarations name what the run does to pull requests in the four-value `expected_outcome` vocabulary (#1695): `pr` became `fresh_pr` and `none` became `no_code_changes`, the same behaviour under the word that now sits beside `amend_existing_or_create_new_pr` and `supersede_existing_pr` — except that `growth-discover-packs` and `growth-promote` declare `amend_existing_or_create_new_pr` (owner, 2026-09-04): their `task.md` files deliver on the branch and pull request the item names, a run authors one pack rather than one per gap, and a promote run names a technology with no home on its tracker instead of minting the stub in a second pull request. |
| 60904.2 | 2026-09-04 | The pack drops its `barriers` requirement, vestigial since its segregation wall became a declared `forbidReferences` check the engine runs, and the segregation rule points at where a shelf's graph now lives — the baseline pack's `config.barriers`, the mechanism having been absorbed into `basics` (#1681). The Claudinite canon's own reason for that graph, retired from the barriers pack's adoption answer, becomes `(RULES-12)`. |
| 60904.1 | 2026-09-04 | claudinite-canon-curation owns the shelf: pack-facing rules and the entry-await check leave the claudinite local pack (#1674) |
| 60903.4 | 2026-09-03 | `writing-claudinite-skills` names `force-load-on-file-edits-paths` as the way a skill forces itself for the files it names, and forces itself for `packs/*/skills/**` the same way (#1648). |
| 60903.3 | 2026-09-03 | A task's `task.md` opens on what the run does: the stage-labelling framing, the why-it-runs-centrally rationale and the skill procedure it already points at are gone. |
| 60903.2 | 2026-09-02 | Task declarations converted to `task.json`; the declaration's comments moved into each task's README (#1633). |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.2 | 2026-09-02 | `pack-version-bumped` and the `growth-promote` task doc drop the retired `.claudinite/local_packs/` root — a repo's own packs live at `.claudinite/local/packs/` and nowhere else (#1627). |
| 60902.1 | 2026-09-02 | The three curation tasks convert to declarative `preconditions`. `growth-promote` keeps its fleet gate as a task-local term (`fleet-local-packs-changed`) — and an unreadable fleet is now an ERROR rather than a decline, since "no credential" and "nothing to promote" looked identical forever. `growth-discover-packs` and `upstream-watch` become `['none']`: their standing scope (the covered members, the packs carrying an `## Upstream` section) moves into their worker docs, where instruction that says the same thing every run belongs (#1578). |
| 60901.3 | 2026-09-01 | `growth-promote` stops filtering members on `hasLocalPacks` — every member carries local packs, seeded at adoption, so declaring the growth pack is the whole participation test and the field it read is gone from the fleet signal (#1562). |
| 60901.2 | 2026-09-01 | A third task, `upstream-watch` (monthly): the shelf's own currency against the technologies it teaches. A pack opts in with an `## Upstream` section in its README — what to watch, where it publishes, and the state its content was last reconciled against — and the run reads what published since, corrects the packs that were dated, and advances the anchors. Keeping a pack current is the canon's duty, so no pack schedules a watcher of its own. |
| 60901.1 | 2026-09-01 | The pack adopts the references convention: `references.md` carries the #385 no-catalog decision behind both skills and the #1482 incident behind `pack-version-claimed-once`, cited by bare `(n)` markers (#1564). |
| 60831.1 | 2026-08-31 | First canon version. Promoted from the canon home's `canon-curation` local pack and generalized over any canon: the write surface is the `packs/` shelf plus whatever `write_paths` declares, the skill check is anchored on a pack tree instead of the engine's own tracked registry, and the prose names a canon rather than this one. It also takes `generate-project-instructions` from `claudinite-growth` — the pack-writing method its two tasks apply, and a canon-side decision a member should not be carrying (#1537). |
