# Claudinite — the canon's own non-portable working rules

This is the Claudinite home repo's own local pack: the capture surface for lessons that are
**specific to working on the canon itself** and would not make sense mounted into a consuming
project. Portable lessons — anything true for repos beyond this one — belong in the shared canon
under `packs/`/`skills/` instead (proposed by PR, or lifted by the promote stage).

The growth lifecycle writes here automatically: the `growth-extract` and `conversation-extract`
daily tasks route the canon's own non-portable lessons into this pack (each at the local
promotion ladder's strongest mechanism — a check where the rule is deterministic, otherwise terse
prose below). Entries accrete as sessions on the canon surface durable, canon-specific friction.

## Standing owner decisions — settled, do not re-litigate

- **`canon-curation` lives in `.claudinite/local_packs/`, not `packs/`** (owner decision,
  2026-07-19). The canon home's curation duties are Claudinite-maintaining-Claudinite —
  project-specific content on the home's own capture surface. Do not propose moving it back, and
  do not describe the move as open or provisional.
- **Local-pack `run_daily` scheduling is ON — the fleet's default path** (same decision). The
  planner reads every member's local-pack daily descriptors by default; never reintroduce an
  "experimental / not enabled" framing or an opt-in seam for it.
- **Packs-tree segregation is barriers configuration only.** Any rule about what the `packs/`
  tree may reference is expressed by declaring/configuring the `barriers` pack (contributed
  edges, `siblings`/`scope` capabilities — extend barriers generically if a capability is
  missing). Never write standalone code that checks packs-tree segregation.
