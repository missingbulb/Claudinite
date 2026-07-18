import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineBarrier } from '../barriers/engine.mjs';
import { SHARED_SUBDIR } from '../registry.mjs';

// Consumers must not couple to the vendored canon (mount/DESIGN.md): outside
// the wiring set, no file may reference .claudinite/ — product code that wants
// a canon helper inlines it, because depending on canon internals turns every
// canon refactor into a breaking migration for code the canon doesn't own.
// Composed on the barriers pack's exported engine (the fixed-graph pattern
// product-wiki established); gated on the vendored mount existing
// (.claudinite/shared/), so it is inert in the canon repo and in pre-flip
// consumers.
//
// The wiring carve-outs — the files that legitimately spell .claudinite/ paths:
// - '.claudinite': the mount subtree itself (local_packs/ referencing the canon;
//   the vendored files are already outside the scanned set).
// - '.claude': settings.json registers the hooks by path.
// - '.github/workflows': the CI stub runs the vendored engine.
// - 'CLAUDE.md': the @-import and the self-check line.
// - '.gitignore', '.gitattributes': the mount's housekeeping rules.
// - '.claudinite-checks.json': settings legitimately spell paths.
// Coverage note: quoted references (imports, requires, config values) and
// relative traversals resolve and fire; a bare unquoted `.claudinite/...` in
// prose falls outside the engine's candidate shapes — accepted, since
// imports/wiring are the coupling class that matters.
const barrier = defineBarrier({
  id: 'claudinite-isolation',
  description: 'Outside the wiring files (CLAUDE.md, .claude/, .gitignore, .gitattributes, .github/workflows/, the settings file), nothing may reference .claudinite/ — inline what you need instead of importing the canon',
  why: 'the vendored canon is refreshed nightly and refactored upstream; code that reaches into it inherits every canon rename as a breaking change',
  doc: 'mount/DESIGN.md',
  crossingExcuse: 'if the crossing is deliberate, excuse it with accept: [{ "rule": "claudinite-isolation", "path": "<file>", "reason": "..." }] in .claudinite-checks.json (a pack-shipped barrier takes no per-rule except entries)',
  edges: [{
    from: '.',
    to: '.claudinite',
    matchUniqueFilenames: false,
    except: ['.claudinite', '.claude', '.github/workflows', 'CLAUDE.md', '.gitignore', '.gitattributes', '.claudinite-checks.json'],
    reason: 'consumer files must not couple to the vendored canon — the wiring files are the reviewed exceptions (mount/DESIGN.md)',
  }],
});

export default {
  ...barrier,
  run(ctx) {
    if (!existsSync(join(ctx.root, SHARED_SUBDIR))) return [];
    return barrier.run(ctx);
  },
};
