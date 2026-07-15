import { defineBarrier } from '../barriers/engine.mjs';
import { PRODUCT_ROOT, SINK_DIR } from './lib.mjs';

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
// - matchUniqueFilenames OFF: wiki/sample-data filenames are agent-written,
//   so leaving the unique-basename layer on would let every distinctive
//   filename the growth routine invents become a repo-wide barred bare name
//   outside the consumer's review. Path references still fire.
// - No baked reviewed-exceptions, and consumers can't add any to a
//   pack-shipped edge — crossingExcuse points each finding at the lever that
//   works (an accept; see packs/product-wiki/README.md). Unlike a rule-owned
//   except, accepts are not staleness-audited — prune them by hand.
export default defineBarrier({
  id: 'product-wiki-isolation',
  description: 'Nothing outside product/ may reference the self-growing wiki folders — product/product-requirements is the only crossing point',
  why: 'the wikis are agent-rewritten, loosely-sourced research — code, tests, and docs that silently depend on them inherit unreviewed churn',
  doc: 'packs/product-wiki/README.md',
  crossingExcuse: 'if the crossing is deliberate, excuse it with accept: [{ "rule": "product-wiki-isolation", "path": "<file>", "reason": "..." }] in .claudinite-checks.json (a pack-shipped barrier takes no per-rule except entries — see packs/product-wiki/README.md)',
  edges: [{
    from: '.',
    to: `${PRODUCT_ROOT}/*`,
    allow: [SINK_DIR],
    matchUniqueFilenames: false,
    except: [PRODUCT_ROOT, '.claudinite-checks.json'],
    reason: 'the self-growing product wikis and their sample data are autonomous research the repo must not depend on; product/product-requirements is the one reviewed crossing point',
  }],
});
