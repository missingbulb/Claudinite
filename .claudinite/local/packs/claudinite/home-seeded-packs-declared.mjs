import { finding } from '../../../../engine/checks/helpers/findings.mjs';

// Converted from this pack's prose: the nightly baselining that lands a
// `seededByDefault` pack on every member is gated `!isHome`, so the canon home is
// the one repo it never reaches — a newly seeded pack arrives everywhere except
// here, silently, and the home runs a fleet-wide pack short until someone
// notices. The invariant that closes it is a static one: every non-local pack
// whose module flags `seededByDefault` is named in the home's own
// `.claudinite-checks.json`. Two files, one comparison — so it converts.
//
// PARSED, NOT GREPPED (the skill's rule): `git grep seededByDefault` also hits
// the prose *about* seeding and the engine code that reads the flag. This scans
// exactly the pack modules the home's own `packs/` tree carries, with their
// comments blanked out first, so a pack.mjs that merely discusses the flag in a
// comment is not mistaken for one that sets it.
//
// Scope is the home's OWN packs/ tree (`packs/<name>/pack.mjs`): a consumer's
// canon lives under `.claudinite/shared/packs/`, which this rule never reads —
// and the rule runs only where this local pack is declared, which is the home.
// Local packs are excluded by construction (they are hand-declared, never
// seeded), and the rule self-skips in any repo with no `packs/` tree.

const PACK_MODULE = /^packs\/([^/]+)\/pack\.mjs$/;
const SETTINGS = '.claudinite-checks.json';
const SEEDED = /(^|[^\w.$])seededByDefault\s*:\s*true\b/;
const ID = /(^|[^\w.$])id\s*:\s*(['"`])([^'"`]+)\2/;

// `source` with its comments blanked out (newlines kept, so nothing shifts).
// Walks strings and template literals so a `//` inside one is left alone.
function stripComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { out += source.slice(i, i + 2); i += 2; continue; }
        out += source[i];
        i += 1;
      }
      out += source[i] ?? '';
      i += 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const rule = {
  id: 'home-seeded-packs-declared',
  severity: 'blocking',
  description: "The canon home's .claudinite-checks.json declares every non-local pack that flags seededByDefault",
  doc: '.claudinite/local/packs/claudinite/RULES.md',
  why: 'the baselining that lands a seeded pack on every member is gated !isHome, so a newly seeded pack reaches the whole fleet except this repo — and the gap is invisible until something the pack was supposed to enforce goes missing here',

  run(ctx) {
    const modules = ctx.tracked.filter((f) => PACK_MODULE.test(f));
    // Not the canon home (a consumer's canon lives under the shared mount, and a
    // repo with no settings file has no declaration to judge) — nothing to say.
    if (modules.length === 0 || ctx.read(SETTINGS) === null) return [];

    const declared = new Set(ctx.config?.packs ?? []);
    const out = [];
    for (const file of modules.sort()) {
      const source = ctx.read(file);
      if (source === null) continue;
      const code = stripComments(source);
      if (!SEEDED.test(code)) continue;
      const id = ID.exec(code)?.[3] ?? PACK_MODULE.exec(file)[1];
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
