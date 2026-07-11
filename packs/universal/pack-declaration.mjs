import { finding } from '../../checks/lib/findings.mjs';

const rule = {
  id: 'pack-declaration',
  severity: 'blocking',
  description: 'The pack declaration in .claudinite-checks.json must match the packs the repo actually needs',
  doc: 'checks/DESIGN.md',
  why: 'the declaration is the truth that executes; the fingerprint keeps it from silently going stale in either direction',

  run(ctx) {
    const out = [];
    // ctx.knownPacks is attached by the runner from the pack registry. Every
    // pack is declarable — universal included; no pack is active by default.
    const declarable = ctx.knownPacks ?? [];
    const ids = new Set(declarable.map((p) => p.id));

    for (const name of ctx.config.packs) {
      if (!ids.has(name)) {
        out.push(finding(rule, {
          file: '.claudinite-checks.json',
          what: `declares unknown pack "${name}"`,
          fix: `remove it or fix the name — declarable packs: ${[...ids].join(', ')}`,
        }));
      }
    }

    for (const pack of declarable) {
      if (!pack.detect) continue; // no reliable fingerprint → declaration is authoritative
      const detected = pack.detect(ctx);
      const declared = ctx.config.packs.includes(pack.id);
      if (detected && !declared) {
        out.push(finding(rule, {
          file: '.claudinite-checks.json',
          what: `the repo contains ${pack.marker} but does not declare the "${pack.id}" pack`,
          fix: `add "${pack.id}" to "packs" in .claudinite-checks.json so its rules and prose activate from now on`,
        }));
      } else if (!detected && declared) {
        out.push(finding(rule, {
          file: '.claudinite-checks.json',
          what: `declares the "${pack.id}" pack but the repo has no ${pack.marker}`,
          fix: 'drop the pack from the declaration, or accept it with a reason if the declaration is deliberately ahead of the code',
        }));
      }
    }

    return out;
  },
};

export default rule;
