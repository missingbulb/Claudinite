import { finding } from '../../engine/checks/helpers/findings.mjs';

// The pack takes no config — the product-wiki/ layout IS the standard. A config
// object on the pack entry is a settings mistake (probably a misremembered
// knob), surfaced once, by this rule only (no cascade). Deliberately pack-local
// rather than a runner-level manifest flag: no other pack rejects config yet,
// and a core seam for it can subsume this when a second pack needs one. It
// stays coded because the value it judges is the NORMALIZED config — the
// entry's object and the top-level packConfig map both land in
// ctx.config.packConfig — which no declaration over the raw settings file
// sees in one place.
const rule = {
  id: 'product-wiki-config-guard',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'The product-wiki pack entry carries no config object — the layout is the standard',
  why: 'an ignored config object reads as a knob that works — the standard has none, so the mistake is surfaced once instead of silently doing nothing',

  run(ctx) {
    const cfg = ctx.config?.packConfig?.['product-wiki'];
    if (cfg === undefined || cfg === null) return [];
    return [finding(rule, {
      file: '.claudinite-checks.json',
      what: 'product-wiki config: the pack takes no config — the product-wiki/ layout is the standard',
      fix: 'remove the "config" object from the product-wiki pack entry (to silence the freshness advisory use rules: {"product-wiki-freshness": "off"})',
    })];
  },
};

export default rule;
