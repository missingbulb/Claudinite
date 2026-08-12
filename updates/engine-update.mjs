import { copyFileSync, mkdirSync, rmSync, renameSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVendorSet, SHARED_SUBDIR } from '../vendoring/compute-vendor-set.mjs';
import { PACK_DIRECTORY_FILE } from '../engine/pack_loader/pack-registry.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';
import { migrationDirs, migrationApplies, flowOf, DECLARATION_FILE } from '../engine/checks/helpers/active-migrations.mjs';
import {
  loadMigrations, migrationAgentic,
  applyFileAliases, applyMaterializations, applyRewrites, applyPackDeclarations,
} from '../engine/migrations/registry.mjs';
import { convergeWiring } from '../engine/scheduler/converge-wiring.mjs';

// THE ENGINE UPDATE FLOW (docs/versioned-updates/DESIGN.md §2): move one repo from
// the engine version it has installed to the one this canon tree ships. Fully
// deterministic — there is no agentic stage here and no lane to add one.
//
// Three steps, in this order and no other:
//
//   1. REPLACE the engine files in the mount, wholesale. The engine's own files
//      never migrate; they are overwritten, so a half-applied engine cannot exist.
//   2. RUN the engine migrations in the gap — the records that repair MEMBER-OWNED
//      files referencing engine surfaces (hooks, local-pack paths, the declaration).
//      Version-ranged: exactly the records above what the repo had installed.
//   3. CONVERGE the non-workflow wiring, then stamp the new version.
//
// The order is load-bearing. A record is written against the engine it lands with,
// so it must run on a mount that already holds that engine; and the stamp goes last
// because it is the claim that everything before it happened.
//
// WHAT THIS FLOW MAY NOT DO, by construction rather than by discipline:
//
//   - NO `.github/workflows/`. The Action token structurally cannot push there, and
//     a flow that writes a file it cannot deliver fails its whole push rather than
//     just that file. Workflow churn is the pack flow's (DESIGN §2.4, §3.7): the
//     wiring converge is called with `workflows: false`, and the materialize op
//     refuses a workflow dest unless the caller announced it can withhold — which
//     this flow never does.
//   - NO agentic work, ever (DESIGN §5). An engine record carrying an `agentic`
//     note is not something to interpret: it is a record in the wrong flow, and it
//     ends the run at `needs-human` BEFORE any write rather than being skipped
//     quietly or run by a model that this flow has no way to invoke.
//
// TRANSACTIONAL, like the vendor writer it borrows from: everything that can be
// judged is judged before the first byte is written, so a refused update leaves the
// repo running exactly the engine it was running.
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url))); // <canon>/updates/

// The engine half of a vendor set: the engine tree itself, plus the pack catalog,
// which is not any one pack's — it ships with every mount whatever the declaration,
// so nothing in the pack flow owns it.
export const isEngineFile = (rel) => rel.startsWith('engine/') || rel === PACK_DIRECTORY_FILE;

// The engine records this repo still needs, oldest first. `migrationApplies` is the
// same predicate vendoring fetches by, so "in the gap" means one thing corpus-wide.
export function engineRecordsInGap(installed, { today } = {}) {
  return migrationDirs()
    .filter((d) => flowOf(d).flow === 'engine' && migrationApplies(d, { installed, today }));
}

// The terminal reasons this flow can end on. Every one of them is a refusal to
// write, never a partial update — and each is a sentence a human can act on,
// because the only thing waiting on the other side of a stop is a person.
export const NEEDS_HUMAN = 'needs-human';

const outcome = (status, detail, extra = {}) => ({ status, detail, ...extra });

// Update `targetRoot` to this canon's engine version. `fullName` is the repo's
// owner/name, needed by the wiring converge. `today` pins the date fallback for a
// repo with no version stamp. `dryRun` runs every judgment and writes nothing —
// what the rehearsal wants, and what makes this testable against a real tree.
export async function engineUpdate(targetRoot, { fullName, today, dryRun = false } = {}) {
  const settingsPath = join(targetRoot, DECLARATION_FILE);
  if (!existsSync(settingsPath)) {
    return outcome(NEEDS_HUMAN, `${targetRoot} has no ${DECLARATION_FILE} — it has never adopted Claudinite`);
  }
  let raw;
  try { raw = JSON.parse(readFileSync(settingsPath, 'utf8')); }
  catch (e) { return outcome(NEEDS_HUMAN, `${DECLARATION_FILE} is not valid JSON: ${e.message}`); }

  const stamp = raw.claudinite ?? null;
  const installed = stamp && typeof stamp.engineVersion === 'number' ? stamp : null;
  const from = installed?.engineVersion ?? null;

  // The gap, decided before anything is touched.
  const records = engineRecordsInGap(installed, { today });
  const specs = (await loadMigrations()).filter((m) => records.includes(m.dir));
  const agentic = specs.filter((m) => migrationAgentic(m) !== null);
  if (agentic.length) {
    return outcome(NEEDS_HUMAN,
      `${agentic.length} engine migration(s) carry an agentic note, which the engine flow cannot run: `
      + `${agentic.map((m) => m.dir).join(', ')}. Move that work to the owning pack's apply stage.`,
      { records: records.length });
  }

  const declared = Array.isArray(raw.packs) ? raw.packs : [];
  const { files, errors } = await computeVendorSet(declared, { today, installed });
  if (errors.length) return outcome(NEEDS_HUMAN, errors.map((e) => e.what).join('; '), { errors });

  if (dryRun) {
    return outcome('ok', `would update engine ${from ?? 'unstamped'} → ${ENGINE_VERSION}`,
      { from, to: ENGINE_VERSION, records, files: files.filter(isEngineFile).length, dryRun: true });
  }

  // 1. Replace the engine, wholesale. The subtree goes and comes back: a file the
  //    new engine dropped must not survive in a mount, or the repo runs a corpus
  //    that exists nowhere.
  const sharedDir = join(targetRoot, SHARED_SUBDIR);
  rmSync(join(sharedDir, 'engine'), { recursive: true, force: true });
  const written = [];
  for (const file of files.filter(isEngineFile)) {
    const dest = join(sharedDir, file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(canonRoot, file), dest);
    written.push(file);
  }

  // 2. Run the gap's records against the repo's own files. The readers and writers
  //    are the repo; templates come from the canon this flow runs out of.
  const exists = (p) => existsSync(join(targetRoot, p));
  const read = (p) => (existsSync(join(targetRoot, p)) ? readFileSync(join(targetRoot, p), 'utf8') : null);
  const write = (p, c) => { mkdirSync(dirname(join(targetRoot, p)), { recursive: true }); writeFileSync(join(targetRoot, p), c); };
  const move = (from_, to) => { mkdirSync(dirname(join(targetRoot, to)), { recursive: true }); renameSync(join(targetRoot, from_), join(targetRoot, to)); };
  const readTemplate = (p) => (existsSync(join(canonRoot, p)) ? readFileSync(join(canonRoot, p), 'utf8') : null);

  const applied = [];
  for (const m of specs) {
    applied.push(...(await applyFileAliases(m, { exists, move })));
    // `env: {}` — never the ambient environment: the withhold handshake is an
    // announcement about the RUNNING process, and this process cannot deliver a
    // workflow file whatever its parent was able to do.
    applied.push(...(await applyMaterializations(m, { readTemplate, read, write, env: {} })));
    applied.push(...(await applyRewrites(m, { read, write })));
    applied.push(...(await applyPackDeclarations(m, { read, write })));
  }

  // 3. Wiring (never workflows), then the stamp that claims all of the above. The
  //    stub text and the secret list are the scheduler workflow's inputs, so with
  //    workflows off there is nothing to pass and nothing to compute.
  const wiring = await convergeWiring(targetRoot, fullName, '', [], { workflows: false });

  const next = JSON.parse(readFileSync(settingsPath, 'utf8'));
  next.claudinite = { ...(next.claudinite ?? {}), engineVersion: ENGINE_VERSION };
  writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);

  return outcome('ok', `engine ${from ?? 'unstamped'} → ${ENGINE_VERSION}`, {
    from, to: ENGINE_VERSION, records, files: written.length, applied, wiring: wiring.changed,
  });
}
