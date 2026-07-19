import { finding } from '../../checks/lib/findings.mjs';
import { relativeImports, resolveRelative, engineSurface } from '../../checks/lib/imports.mjs';

// Pack independence: a pack's code imports only its OWN files and the engine
// surface (the engine roots plus the packs/-and-skills/-root machinery —
// checks/lib/imports.mjs owns that definition). Another pack's abilities
// arrive by DECLARING the dependency — `requires` on the pack manifest — and
// passing configuration; a helper both sides need moves into checks/lib. A
// pack must never import another pack's code, and never a canon-internal tree
// (migrations/, routines/): the vendor set ships a pack only when declared and
// ships no canon-internal tree at all, so such an import crashes every
// consumer that vendors the importer without its target (the failure the gated
// vendored-mount flip aborts on). The rule holds identically for a consumer's
// own local packs (.claudinite/local_packs/): they may reach the vendored
// engine surface, never a vendored pack's internals or a sibling local pack.
//
// Scope: code references (import/require specifiers in non-test .mjs files
// that RESOLVE to a real file — the tree-oracle discipline). Prose naming a
// pack stays free: docs legitimately talk about packs; code coupling is the
// class that crashes.

const PACK_ROOTS = ['packs/', '.claudinite/local_packs/'];
const SHARED_PREFIX = '.claudinite/shared/';

// A consumer's vendored corpus mirrors canon layout under the shared mount;
// strip that prefix so one classification covers both trees.
const canonical = (p) => (p.startsWith(SHARED_PREFIX) ? p.slice(SHARED_PREFIX.length) : p);

// The pack directory a path lives under ('packs/<id>' or
// '.claudinite/local_packs/<id>'), or null for machinery-root files and
// everything outside the pack roots.
function packHome(path) {
  for (const root of PACK_ROOTS) {
    if (!path.startsWith(root)) continue;
    const i = path.indexOf('/', root.length);
    if (i > root.length) return path.slice(0, i);
  }
  return null;
}

const rule = {
  id: 'pack-independence',
  severity: 'blocking',
  doc: 'extending.md',
  description: 'A pack\'s code imports only its own files and the engine surface — another pack\'s abilities arrive through declaration (requires) and configuration, never by importing its code',
  why: 'the vendor set ships a pack only when declared, so a cross-pack import crashes every consumer that vendors one pack without the other; abilities cross pack boundaries through declaration and configuration',

  run(ctx) {
    // Targets resolve against everything the repo knows: tracked files (the
    // vendored mount included — excluded from scanning, resolvable as targets)
    // plus the in-scope untracked set.
    const known = new Set([...ctx.tracked, ...ctx.allFiles]);
    const out = [];
    for (const file of ctx.files) {
      if (!file.endsWith('.mjs') || file.endsWith('.test.mjs')) continue;
      const home = packHome(file);
      if (!home) continue;
      const src = ctx.read(file);
      if (src === null) continue;
      const localImporter = home.startsWith('.claudinite/');
      for (const { spec, line } of relativeImports(src)) {
        const resolved = resolveRelative(file, spec, (p) => known.has(p));
        if (!resolved) continue; // a dangling specifier is breakage, not a boundary crossing
        const target = canonical(resolved);
        const targetHome = packHome(target);
        if (targetHome === home) continue;
        if (targetHome) {
          out.push(finding(rule, {
            file,
            line,
            what: `imports "${spec}" → ${resolved}, inside another pack (${targetHome})`,
            fix: `use the pack's abilities through declaration instead: name it in this pack's "requires" and pass configuration (e.g. a contributed rule), or move a helper both packs need into checks/lib — never import another pack's code`,
          }));
        } else if (!engineSurface(target) && (!localImporter || resolved !== target)) {
          // A canon pack importing outside the engine surface, or a local pack
          // reaching vendored canon internals beyond it. A local pack importing
          // its own project's code is the project's business, not this rule's.
          out.push(finding(rule, {
            file,
            line,
            what: `imports "${spec}" → ${resolved}, outside the vendored engine surface`,
            fix: 'move the shared helper into checks/lib (the engine surface every consumer carries) — this tree is not vendored into consumers, so the import crashes a vendored member',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
