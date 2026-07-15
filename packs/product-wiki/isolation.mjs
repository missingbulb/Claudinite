import { defineBarrier } from '../barriers/engine.mjs';

// The wall: nothing outside product/ may reference the self-growing wiki
// folders; product/product-requirements is the one reviewed crossing point.
// This edge and product-wiki-layout are a designed pair — the glob target
// fails closed ("matched no directories", blocking) on an empty product/
// expansion, and layout owns the missing-skeleton complaint. Under the
// structural standard a renamed wiki folder is still a wiki folder, still
// barred — no per-folder disarm hole.
//
// Edge notes (each empirically verified against a real consumer tree):
// - to 'product/*' bars every direct CHILD DIRECTORY of product/; files
//   directly under product/ (the index README) stay reachable — a repo's root
//   CLAUDE.md legitimately links product/README.md.
// - allow keeps the crossing point reachable from every guarded file.
// - except 'product' unguards the whole product/ subtree (wikis reference
//   each other, sample-data, and outward freely — the wall is one-directional)
//   and satisfies the root-guard validation for the glob target.
// - except '.claudinite-checks.json': the settings file legitimately spells
//   wiki paths (accept entries, historical config) — configuration is not a
//   dependency.
// - No baked reviewed-exceptions: consumers excuse a deliberate crossing with
//   accept: [{ "rule": "product-wiki-isolation", "path": ..., "reason": ... }]
//   (see packs/product-wiki/README.md — the engine's generic fix text points
//   at per-rule except entries, which a pack-shipped fixed barrier can't take).
export default defineBarrier({
  id: 'product-wiki-isolation',
  description: 'Nothing outside product/ may reference the self-growing wiki folders — product/product-requirements is the only crossing point',
  why: 'the wikis are agent-rewritten, loosely-sourced research — code, tests, and docs that silently depend on them inherit unreviewed churn',
  doc: 'packs/product-wiki/README.md',
  edges: [{
    from: '.',
    to: 'product/*',
    allow: ['product/product-requirements'],
    except: ['product', '.claudinite-checks.json'],
    reason: 'the self-growing product wikis and their sample data are autonomous research the repo must not depend on; product/product-requirements is the one reviewed crossing point',
  }],
});
