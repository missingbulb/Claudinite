// Pack independence — as BARRIERS CONFIGURATION, not code. A pack's code
// imports only its OWN files and the engine surface; another pack's abilities
// arrive by DECLARING the dependency (`requires` on the pack manifest) and
// passing configuration, and a helper both sides need moves into checks/lib.
// A cross-pack import crashes every consumer that vendors the importer without
// its target (the vendor set ships a pack only when declared, and ships no
// canon-internal tree at all) — the failure the gated vendored-mount flip
// aborts on.
//
// This module is pure DATA: the barriers pack builds it into the rule
// (canon-curation `requires` barriers and carries this under `contributes` on
// its manifest — the same declaration-and-configuration composition the rule
// itself mandates; no code here checks anything). The `siblings` edge guards
// each pack under packs/ in turn; `to: "*"` confines it to itself plus the
// engine surface in `allow`; `scope: "imports"` keeps the ban on the coupling
// class that crashes — code imports — while prose stays free to talk about
// packs. The `allow` list IS the engine surface (the always-vendored roots
// plus the packs/skills machinery modules); a new machinery module joins it
// here, loudly — the barrier fails closed, never silently widens. The vendor
// writer's coherence guard (mount/vendor.mjs) backstops the same invariant at
// vendoring time.
//
// Home-only twice over: declared solely by the canon home (a contributed rule
// runs only where its contributor is active), and `gateDir` keeps it inert
// anywhere a packs/ tree doesn't exist.
export default {
  id: 'pack-independence',
  description: 'A pack\'s code imports only its own files and the engine surface — another pack\'s abilities arrive through declaration (requires) and configuration, never by importing its code',
  why: 'the vendor set ships a pack only when declared, so a cross-pack import crashes every consumer that vendors one pack without the other; abilities cross pack boundaries through declaration and configuration',
  doc: 'extending.md',
  crossingExcuse: 'if the crossing is deliberate, excuse it with accept: [{ "rule": "pack-independence", "path": "<file>", "reason": "..." }] in .claudinite-checks.json (a pack-shipped barrier takes no per-rule except entries)',
  gateDir: 'packs',
  edges: [{
    siblings: 'packs',
    to: '*',
    scope: 'imports',
    allow: [
      'checks',
      'mount',
      'packs/registry.mjs',
      'packs/env.mjs',
      'packs/interview.mjs',
      'packs/load-active-prose.mjs',
      'skills/registry.mjs',
      'skills/mount-skills.mjs',
    ],
    reason: 'a pack imports only its own files and the engine surface — declare the dependency and pass configuration (a contributed rule), or move the shared helper into checks/lib',
  }],
};
