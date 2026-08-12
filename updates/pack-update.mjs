import { copyFileSync, mkdirSync, rmSync, renameSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVendorSet, SHARED_SUBDIR } from '../vendoring/compute-vendor-set.mjs';
import { loadPacks, resolveDeclaredPacks, packEntryId } from '../engine/pack_loader/pack-registry.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';
import { migrationDirs, migrationApplies, flowOf, DECLARATION_FILE } from '../engine/checks/helpers/active-migrations.mjs';
import { loadMigrations, applyMigration } from '../engine/migrations/registry.mjs';
import { NEEDS_HUMAN, runSelfTest, deliveryDecision } from './engine-update.mjs';

// THE PACK UPDATE FLOW (docs/versioned-updates/DESIGN.md §3): move one repo's
// declared packs from the versions it has installed to the ones this canon ships.
// The same shape as the engine flow beside it — vendor, migrate, converge, stamp,
// gate — with three deliberate differences, each a consequence of what a pack IS:
//
//   1. IT WRITES `.github/workflows/`. The scheduler workflow's content is a
//      function of the TASK SET (`declaredSecrets` unions the required secrets of
//      every discovered task), so pack changes are what rewrite it — and this flow
//      is the one that carries a credential able to land it (owner decision 2).
//      That is what retires the withholding pattern: nothing is silently dropped
//      from a push here.
//   2. IT ENFORCES `minEngineVersion`. A pack version declares the lowest engine it
//      runs on; applying it past that is a guess, and a guess about whether a
//      member's engine can load a pack is how a fleet goes quiet. Violation is a
//      terminal, never a downgrade to "try anyway".
//   3. IT HAS AN AGENTIC TAIL — the one place agentic work survives, because the
//      pack's new rules meet member-authored content the canon has never seen. This
//      module is the DETERMINISTIC half and ends by saying whether that stage is
//      needed; the stage itself belongs to the shell that can dispatch a session.
//
// Everything else is shared with the engine flow on purpose: the same version
// predicate decides the gap, the same self-test gates the merge, and every
// non-green end is the same `needs-human` terminal (DESIGN §5).
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url))); // <canon>/updates/

// A pack's own half of the vendor set: its directory, and nothing else. The engine
// tree and the catalog belong to the engine flow, which is what keeps two flows
// converging one mount from ever fighting over a file.
export const isPackFile = (rel, id) => rel.startsWith(`packs/${id}/`);

// The records this repo still needs for one pack, oldest first — the same predicate
// the engine flow ranges over, with that pack's number instead of the engine's.
export function packRecordsInGap(id, installed, { today } = {}) {
  return migrationDirs().filter((d) => {
    const of = flowOf(d);
    return of.flow === 'pack' && of.pack === id && migrationApplies(d, { installed, today });
  });
}

// What a pack update would do to each declared pack, judged before anything is
// written: its installed version, the version this canon ships, whether the repo's
// engine satisfies the pack's minimum, and the records in between.
//
// `blocked` is the whole point of returning this rather than a boolean. A pack the
// engine is too old for is not skipped quietly and not applied hopefully — it is
// named, with both numbers, because the fix (update the engine first) is a sentence
// long and unguessable from a silent no-op.
export function planPackUpdates(packs, declared, installed, { today, engineVersion = ENGINE_VERSION } = {}) {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const plan = [];
  for (const entry of resolveDeclaredPacks(declared ?? [], packs)) {
    const id = packEntryId(entry);
    const pack = id === undefined ? undefined : byId.get(id);
    if (!pack || plan.some((p) => p.id === id)) continue;      // a local pack, or already planned
    const from = installed?.packVersions?.[id];
    const to = pack.version;
    const needs = pack.minEngineVersion;
    const blocked = typeof needs === 'number' && needs > engineVersion
      ? `pack "${id}" version ${to} needs engine ${needs}; this repo runs engine ${engineVersion}`
      : null;
    plan.push({
      id,
      from: typeof from === 'number' ? from : null,
      to: typeof to === 'number' ? to : null,
      blocked,
      records: packRecordsInGap(id, installed, { today }),
    });
  }
  return plan;
}

const outcome = (status, detail, extra = {}) => ({ status, detail, ...extra });

// Update `targetRoot`'s declared packs to the versions this canon ships. Same
// arguments and same terminals as the engine flow; `dryRun` judges everything and
// writes nothing.
export async function packUpdate(targetRoot, {
  fullName, today, dryRun = false, delivery = 'auto-merge', forceMergeOnRedCi = false, selfTestRun,
} = {}) {
  const settingsPath = join(targetRoot, DECLARATION_FILE);
  if (!existsSync(settingsPath)) {
    return outcome(NEEDS_HUMAN, `${targetRoot} has no ${DECLARATION_FILE} — it has never adopted Claudinite`);
  }
  let raw;
  try { raw = JSON.parse(readFileSync(settingsPath, 'utf8')); }
  catch (e) { return outcome(NEEDS_HUMAN, `${DECLARATION_FILE} is not valid JSON: ${e.message}`); }

  const stamp = raw.claudinite ?? null;
  const installed = stamp && typeof stamp === 'object' ? stamp : null;
  const declared = Array.isArray(raw.packs) ? raw.packs : [];
  const packs = await loadPacks();

  // The engine the TARGET runs, not the one this canon ships: a member is updated
  // engine-first, and a pack update that read the canon's number would enforce
  // `minEngineVersion` against an engine the repo does not have.
  const engineVersion = typeof installed?.engineVersion === 'number' ? installed.engineVersion : ENGINE_VERSION;
  const plan = planPackUpdates(packs, declared, installed, { today, engineVersion });

  const blocked = plan.filter((p) => p.blocked);
  if (blocked.length) {
    return outcome(NEEDS_HUMAN, blocked.map((p) => p.blocked).join('; '), { plan });
  }

  const { files, errors } = await computeVendorSet(declared, { today, installed });
  if (errors.length) return outcome(NEEDS_HUMAN, errors.map((e) => e.what).join('; '), { errors, plan });

  const ids = plan.map((p) => p.id);
  const packFiles = files.filter((f) => ids.some((id) => isPackFile(f, id)));
  if (dryRun) {
    return outcome('ok', `would update ${plan.length} pack(s)`, { plan, files: packFiles.length, dryRun: true });
  }

  // 1. Replace each declared pack's tree wholesale — per pack, so a pack that is no
  //    longer declared keeps its files until the flow that owns removal takes them,
  //    and a pack this run does not touch is never disturbed.
  const sharedDir = join(targetRoot, SHARED_SUBDIR);
  for (const id of ids) rmSync(join(sharedDir, 'packs', id), { recursive: true, force: true });
  for (const file of packFiles) {
    const dest = join(sharedDir, file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(canonRoot, file), dest);
  }

  // 2. Run each pack's records, in the order the gap gives them.
  const wanted = new Set(plan.flatMap((p) => p.records));
  const specs = (await loadMigrations()).filter((m) => wanted.has(m.dir));
  const exists = (p) => existsSync(join(targetRoot, p));
  const read = (p) => (existsSync(join(targetRoot, p)) ? readFileSync(join(targetRoot, p), 'utf8') : null);
  const write = (p, c) => { mkdirSync(dirname(join(targetRoot, p)), { recursive: true }); writeFileSync(join(targetRoot, p), c); };
  const move = (from, to) => { mkdirSync(dirname(join(targetRoot, to)), { recursive: true }); renameSync(join(targetRoot, from), join(targetRoot, to)); };
  const readTemplate = (p) => (existsSync(join(canonRoot, p)) ? readFileSync(join(canonRoot, p), 'utf8') : null);
  // The withhold handshake, announced: THIS flow can deliver a workflow file, so a
  // record that materializes one is applied rather than reported as skipped.
  const io = { exists, move, read, write, readTemplate, env: { CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '1' } };
  const applied = [];
  for (const m of specs) applied.push(...(await applyMigration(m, io)));

  // 3. Stamp each updated pack's version. Written per pack rather than wholesale, so
  //    a pack this run did not touch keeps the number it really has.
  const next = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const packVersions = { ...(next.claudinite?.packVersions ?? {}) };
  for (const p of plan) if (p.to !== null) packVersions[p.id] = p.to;
  next.claudinite = { ...(next.claudinite ?? {}), packVersions };
  writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);

  // 4. The same gate the engine flow uses, then the agentic tail's own question.
  //    A pack update that changed nothing needs no session; one that moved a pack's
  //    rules over member-authored content is exactly what the apply stage is for.
  const selftest = runSelfTest(targetRoot, selfTestRun);
  const decision = deliveryDecision({ selftestOk: selftest.ok, delivery, forceMergeOnRedCi });
  const moved = plan.filter((p) => p.from !== p.to);

  return outcome(decision.action === 'needs-human' ? NEEDS_HUMAN : 'ok', decision.why, {
    plan, files: packFiles.length, applied, selftest, decision,
    applyStage: moved.length > 0
      ? { needed: true, packs: moved.map((p) => p.id), why: 'a pack\'s rules moved over content the canon has never seen' }
      : { needed: false },
  });
}
