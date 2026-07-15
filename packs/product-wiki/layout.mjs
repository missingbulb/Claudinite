import { finding } from '../../checks/lib/findings.mjs';
import { configGuard, INDEX_README, SINK_README } from './lib.mjs';

// The two fixed paths the whole standard hangs off: the index README and the
// human-reviewed product-requirements sink. Wiki folders are NOT required (a
// sink-first scaffold is legitimate) and neither is sample-data/ (an exclusion
// in the classifier, not an obligation). A path satisfies the check when it is
// tracked OR freshly written and not yet staged (ctx.files carries untracked
// files) — a mid-session scaffold must not wedge the Stop hook into
// re-creating files that already exist.
const REQUIRED = [INDEX_README, SINK_README];

const rule = {
  id: 'product-wiki-layout',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'A product-wiki repo carries the product/ skeleton: the index README and the reviewed product-requirements sink',
  why: 'a declared standard with no scaffold silently enforces nothing — the isolation wall and the wiki discipline both hang off these fixed paths',

  run(ctx) {
    const out = configGuard(ctx, rule);
    for (const path of REQUIRED) {
      if (!ctx.tracked.includes(path) && !ctx.files.includes(path)) {
        out.push(finding(rule, {
          file: path,
          what: `the product-wiki standard requires ${path} but it does not exist`,
          fix: "scaffold it per the template in packs/product-wiki/README.md, or remove the product-wiki declaration if this repo doesn't adopt the standard",
        }));
      }
    }
    return out;
  },
};

export default rule;
