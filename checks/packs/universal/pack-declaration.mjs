import { finding } from '../../lib/findings.mjs';
import { TECH_PACKS } from '../fingerprints.mjs';

const rule = {
  id: 'pack-declaration',
  severity: 'blocking',
  description: 'The pack declaration in .claudinite-checks.json must match the technologies the repo actually contains',
  doc: 'checks/DESIGN.md',
  why: 'the declaration is the truth that executes; the fingerprint keeps it from silently going stale in either direction',

  run(ctx) {
    const out = [];
    const declared = ctx.config.packs;

    for (const name of declared) {
      if (name !== 'universal' && !(name in TECH_PACKS)) {
        out.push(finding(rule, {
          file: '.claudinite-checks.json',
          what: `declares unknown pack "${name}"`,
          fix: `remove it or fix the name — known packs: ${Object.keys(TECH_PACKS).join(', ')} (universal always runs and is never declared)`,
        }));
      }
    }

    for (const [name, spec] of Object.entries(TECH_PACKS)) {
      if (!spec.available) continue;
      const detected = spec.detect(ctx);
      if (detected && !declared.includes(name)) {
        out.push(finding(rule, {
          file: '.claudinite-checks.json',
          what: `the repo contains ${spec.marker} but does not declare the "${name}" pack`,
          fix: `add "${name}" to "packs" in .claudinite-checks.json so its conformance checks run from now on`,
        }));
      } else if (!detected && declared.includes(name)) {
        out.push(finding(rule, {
          file: '.claudinite-checks.json',
          what: `declares the "${name}" pack but the repo has no ${spec.marker}`,
          fix: 'drop the pack from the declaration, or accept it with a reason if the declaration is deliberately ahead of the code',
        }));
      }
    }

    return out;
  },
};

export default rule;
