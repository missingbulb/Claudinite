import { finding } from '../../checks/lib/findings.mjs';
import { configGuard } from './lib.mjs';

// The two fixed paths the whole standard hangs off: the index README and the
// human-reviewed product-requirements sink. Wiki folders are NOT required (a
// sink-first scaffold is legitimate) and neither is sample-data/ (an exclusion
// in the classifier, not an obligation). Checked against ctx.tracked so the
// requirement holds in --changed mode too.
const REQUIRED = ['product/README.md', 'product/product-requirements/README.md'];

const rule = {
  id: 'product-wiki-layout',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'A product-wiki repo carries the product/ skeleton: the index README and the reviewed product-requirements sink',
  why: 'a declared standard with no scaffold silently enforces nothing — the isolation wall and the wiki discipline both hang off these fixed paths',

  run(ctx) {
    const out = configGuard(ctx, rule);
    for (const path of REQUIRED) {
      if (!ctx.tracked.includes(path)) {
        out.push(finding(rule, {
          file: path,
          what: `the product-wiki standard requires ${path} but it is not tracked`,
          fix: "scaffold it per the template in packs/product-wiki/README.md, or remove the product-wiki declaration if this repo doesn't adopt the standard",
        }));
      }
    }
    return out;
  },
};

export default rule;
