import { finding } from '../../../../engine/checks/helpers/findings.mjs';

// Converted from this pack's prose: the nightly baselining that lands a
// `seededByDefault` pack on every member is gated `!isHome`, so the canon home is
// the one repo it never reaches — a newly seeded pack arrives everywhere except
// here, silently, and the home runs a fleet-wide pack short until someone
// notices. The invariant that closes it is a static one: every non-local pack
// whose manifest flags `seededByDefault` is named in the home's own
// `.claudinite-checks.json`. Two files, one comparison — so it converts.
//
// PARSED, NOT GREPPED (the skill's rule): `git grep seededByDefault` also hits the
// prose *about* seeding and the engine code that reads the flag. Since #564 the
// manifest is JSON, so parsing it is one `JSON.parse` — a pack that merely
// discusses the flag in its README or RULES.md is not a pack that sets it, and
// there is no comment-stripping left to get right.
//
// Scope is the home's OWN packs/ tree (`packs/<name>/pack.json`): a consumer's
// canon lives under `.claudinite/shared/packs/`, which this rule never reads —
// and the rule runs only where this local pack is declared, which is the home.
// Local packs are excluded by construction (they are hand-declared, never
// seeded), and the rule self-skips in any repo with no `packs/` tree.

const PACK_MANIFEST = /^packs\/([^/]+)\/pack\.json$/;
const SETTINGS = '.claudinite-checks.json';

const rule = {
  id: 'home-seeded-packs-declared',
  severity: 'blocking',
  description: "The canon home's .claudinite-checks.json declares every non-local pack that flags seededByDefault",
  doc: '.claudinite/local/packs/claudinite/RULES.md',
  why: 'the baselining that lands a seeded pack on every member is gated !isHome, so a newly seeded pack reaches the whole fleet except this repo — and the gap is invisible until something the pack was supposed to enforce goes missing here',

  run(ctx) {
    const manifests = ctx.tracked.filter((f) => PACK_MANIFEST.test(f));
    // Not the canon home (a consumer's canon lives under the shared mount, and a
    // repo with no settings file has no declaration to judge) — nothing to say.
    if (manifests.length === 0 || ctx.read(SETTINGS) === null) return [];

    const declared = new Set(ctx.config?.packs ?? []);
    const out = [];
    for (const file of manifests.sort()) {
      const source = ctx.read(file);
      if (source === null) continue;
      let manifest;
      // A manifest too broken to parse is the pack loader's finding to make, not
      // this rule's: it must not double-report, and it cannot read a flag out of
      // text that is not JSON.
      try { manifest = JSON.parse(source); } catch { continue; }
      if (manifest === null || typeof manifest !== 'object' || manifest.seededByDefault !== true) continue;
      const id = typeof manifest.id === 'string' ? manifest.id : PACK_MANIFEST.exec(file)[1];
      if (declared.has(id)) continue;
      out.push(finding(rule, {
        file: SETTINGS,
        line: null,
        what: `the "${id}" pack flags seededByDefault (${file}) but is not declared here`,
        fix: `add "${id}" to the "packs" array in ${SETTINGS} — the fleet's baselining skips this repo, so the home's declaration is hand-maintained; if the home is deliberately opting out, record an acceptance with the reason instead`,
      }));
    }
    return out;
  },
};

export default rule;
