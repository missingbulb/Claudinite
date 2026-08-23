import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { parseSheepdogConfig } from '../fleet-config.mjs';

// The enforcer states a seeded pack's config TWICE, for two different audiences, in one
// file:
//
//   - on its OWN entry for that pack — what a session running HERE runs, read by this
//     repo's engine like any member's declaration, and
//   - inside `packSeeds` on its `claudinite-fleet-sheepdog` entry — what the fleet-pack-seed sweep
//     WRITES into every member (tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs).
//
// If the two disagree, the enforcer runs one configuration of a pack while every other
// repo under the owner runs another, and nothing anywhere compares them: the sweep
// writes the seed verbatim without consulting the enforcer's own entry, and a member
// has no way to know what the enforcer kept for itself.
//
// IT NAMES NO PACK, deliberately — the same design the sweep itself holds to
// ("THE ENFORCER NAMES NO PACK", fleet-config.mjs). The seeded ids are the whole
// vocabulary; for each one the enforcer ALSO declares, the two configs must agree. A
// pack the fleet standardizes on but this repo does not itself run is out of scope: an
// enforcer may hand out a pack it has no use for.
//
// AGREEMENT IS EXACT, because pack-agnostic is the point: nothing here may know that
// one pack's absent `path` means `preferences` while another's means something else.
// Two configs agree when they are the same value — which costs the enforcer nothing but
// writing a default out in both places, and buys a comparison that cannot be wrong
// about a pack it has never heard of.
//
// BLOCKING. The sweep SEEDS BUT NEVER OVERRIDES — "a member that already carries a
// config for it keeps that config" — so a wrong seed is written into each member
// exactly once and then sticks, and correcting it here un-writes nothing. The blast
// radius is every repo under the owner and the mistake is visible days later, in
// somebody else's repo.
const CONFIG = '.claudinite-checks.json';

// Order-insensitive value equality for two parsed configs: a config is JSON, so a
// canonical re-serialization is the whole comparison.
const canonical = (v) => JSON.stringify(v, (_, x) => (
  x !== null && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
    : x
));

// The line a literal sits on, for a clickable finding; null when absent.
function lineOf(text, needle) {
  const i = text.split('\n').findIndex((l) => l.includes(needle));
  return i === -1 ? null : i + 1;
}

const rule = {
  id: 'fleet-pack-seed-agrees',
  severity: 'blocking',
  description: 'A pack this fleet seeds and also declares here carries the same config in both places',
  doc: 'packs/claudinite-fleet-sheepdog/RULES.md',
  why: 'the pack-seed sweep writes a seed into every member and never overrides an existing entry, so a seed that disagrees with what the enforcer runs reaches the whole fleet once and sticks',

  run(ctx) {
    // Read the enforcer's file the way the SWEEP reads a repo's file — raw, through
    // fleet-config's one parser — so the seeds judged here are exactly the seeds that
    // would be written (it drops the malformed ones), and so a finding can point at a
    // line. `home` only feeds the owner default and the throw message; neither is used.
    const text = ctx.read(CONFIG);
    if (text === null) return [];
    let seeds;
    try {
      seeds = parseSheepdogConfig(JSON.parse(text), 'this repo').packSeeds;
    } catch {
      return []; // malformed JSON, or no claudinite-fleet-sheepdog config — loadConfig owns both findings
    }

    // Read the LOCAL side the way this repo's own engine reads it: the normalized
    // per-pack view, which is what actually configures the pack in a session here.
    const declared = new Set(ctx.config.packs ?? []);
    const local = ctx.config.packConfig ?? {};

    return seeds.flatMap((seed) => {
      if (!declared.has(seed.id)) return []; // seeded to the fleet, not run here
      const seeded = seed.config; // parseSheepdogConfig omits the key when there is none
      const own = local[seed.id];
      if (canonical(seeded ?? null) === canonical(own ?? null)) return [];
      return [finding(rule, {
        file: CONFIG,
        line: lineOf(text, `"${seed.id}"`),
        what: `the "${seed.id}" config seeded to the fleet (${JSON.stringify(seeded ?? null)}) is not the one this repo declares for itself (${JSON.stringify(own ?? null)})`,
        fix: `make the packSeeds entry for "${seed.id}" and this repo's own "${seed.id}" entry carry the same config — spell out defaults on both sides rather than leaving one implicit, and correct it before the next sweep, which writes the seed into each member once and never revisits it`,
      })];
    });
  },
};

export default rule;
