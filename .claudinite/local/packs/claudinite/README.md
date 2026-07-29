# claudinite — the canon home's own local pack

Claudinite-specific working rules and lessons that are **not portable to a consumer**. Anything that
travels belongs in [`packs/`](../../../../packs/README.md), the shared canon; this pack is the
remainder.

It is the **capture surface** the `growth-extract` and `conversation-extract` scheduled tasks route
the canon's own non-portable lessons into. A lesson that turns out to travel does not stay here — it
becomes a PR against `packs/` instead.

Distinct from [canon-curation](../canon-curation/README.md), the home's other local pack:
canon-curation carries the fleet-facing *duties* (promoting members' lessons, policing `packs/`);
this one carries the working rules for developing Claudinite itself.

## How it is discovered

Like any local pack. The canon's own runner passes `discoverPacks({ localRoot: <repo root> })`, so
this directory is scanned alongside the canon `packs/` tree, and it is active because
`.claudinite-checks.json` declares it. Its `id` must equal its directory name (`claudinite`) and may
not shadow a canon pack id — the loader enforces both.
