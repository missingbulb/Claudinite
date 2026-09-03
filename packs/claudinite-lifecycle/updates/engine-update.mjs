import { copyFileSync, mkdirSync, rmSync, renameSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeVendorSet, SHARED_SUBDIR } from '../../../vendoring/compute-vendor-set.mjs';
import { PACK_DIRECTORY_FILE } from '../../../engine/pack_loader/pack-registry.mjs';
import { ENGINE_VERSION } from '../../../engine/version.mjs';
import { isVersion } from '../../../engine/version.mjs';
import { migrationDirs, migrationApplies, flowOf, DECLARATION_FILE } from '../../../engine/checks/helpers/active-migrations.mjs';
import { settingsPath } from '../../../engine/settings-file.mjs';
import { installedVersions, hasInstalledMount, withInstalledVersions } from '../../../engine/installed-versions.mjs';
import { loadMigrations, applyMigration } from '../../../engine/migrations/registry.mjs';
import { convergeWiring } from '../../../engine/converge-wiring.mjs';
import { NEEDS_HUMAN_LABEL } from '../../claudinite-tasks/shared-code/work-items.mjs';

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
const canonRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))); // <canon>/packs/claudinite-lifecycle/updates/<this file>

// The engine half of a vendor set: the engine tree itself, plus the pack catalog,
// which is not any one pack's — it ships with every mount whatever the declaration,
// so nothing in the pack flow owns it.
// MIGRATION TOLERANCE (#1317): the tasks pack rides the ENGINE lane while the legacy
// `engine/scheduler/` shims exist. The shims re-export that pack, and the two lanes
// deliver on separate cycles — so shipping them apart hands every member a window in
// which its new engine names a pack its mount does not carry yet. That is not a stale
// import a version gate can cover: the old pack version the member still holds imports
// `engine/scheduler/*` by name, the shim there resolves to nothing, the pack fails to
// load, and the self-test gate below refuses to land the converge at all — which also
// means the member cannot receive the pack that would have fixed it. A shim and its
// target are one unit; the lane that ships one ships the other. Removed with the shims.
const LEGACY_SHIM_TARGET = 'packs/claudinite-tasks/';
export const isEngineFile = (rel) => rel.startsWith('engine/') || rel.startsWith(LEGACY_SHIM_TARGET) || rel === PACK_DIRECTORY_FILE;

// The engine records this repo still needs, oldest first. `migrationApplies` is the
// same predicate vendoring fetches by, so "in the gap" means one thing corpus-wide.
export function engineRecordsInGap(installed, { today } = {}) {
  return migrationDirs()
    .filter((d) => flowOf(d).flow === 'engine' && migrationApplies(d, { installed, today }));
}

// The terminal reasons this flow can end on. Every one of them is a refusal to
// write, never a partial update — and each is a sentence a human can act on,
// because the only thing waiting on the other side of a stop is a person. It is
// the scheduler's existing label, not a second spelling of the same idea: a repo
// with two "a human is needed" labels has neither.
export const NEEDS_HUMAN = NEEDS_HUMAN_LABEL;

// THE SELF-TEST GATE (DESIGN §2.5). The converged tree is asked "can Claudinite
// still run here?" before anything merges. It exists because of #555, where an
// engine change silently stopped every consumer pack from validating while the
// content checks stayed green — a content check cannot see its own machinery
// break, so a green sweep over a broken mount says nothing at all.
//
// Run from the MOUNT, never from the canon: the copy under test is the one the
// member will live with.
export function runSelfTest(root, run = defaultRun) {
  const st = join(root, SHARED_SUBDIR, 'engine', 'selftest.mjs');
  if (!existsSync(st)) return { ok: false, ran: false, output: 'no vendored selftest to gate on' };
  try { return { ok: true, ran: true, output: run(st, root) }; }
  catch (e) { return { ok: false, ran: true, output: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message }; }
}
const defaultRun = (st, root) => execFileSync(process.execPath, [st, '--root', root, '--strict'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: root });

// What happens to the update's PR, given the gate and the repo's own delivery
// preference. PURE — the whole policy in one place, so the shell that opens and
// merges the PR carries no judgment of its own.
//
//   green  → the repo's delivery setting decides (auto-merge, or leave for review)
//   red    → PR open, `needs-human`, stop. Every non-green terminal looks the same
//            (DESIGN §5); there is no "merge it anyway because the diff looked fine".
//
// `forceMergeOnRedCi` is the operator's signed judgment that a red gate is
// acceptable (owner decision 1). It is a PER-INVOCATION argument and is never read
// from the repo's declaration — a stored default would turn one operator's judgment
// about one release into a standing policy nobody remembers granting, which is the
// opposite of what an override is for. The outcome still records that it was used:
// an override that leaves no trace is indistinguishable from a gate that passed.
export function deliveryDecision({ selftestOk, delivery = 'auto-merge', forceMergeOnRedCi = false } = {}) {
  if (selftestOk) {
    return delivery === 'auto-merge'
      ? { action: 'merge', why: 'the converged tree passed its self-test' }
      : { action: 'keep', why: `the converged tree passed its self-test; delivery is "${delivery}", so the PR is the owner's to merge` };
  }
  if (forceMergeOnRedCi) {
    return { action: 'merge', forced: true, why: 'the converged tree FAILED its self-test, merged on the operator\'s explicit force-merge-on-red-ci' };
  }
  return {
    action: 'needs-human',
    label: NEEDS_HUMAN,
    why: 'the converged tree FAILED its self-test — the machinery that runs the rules is not intact, so the PR stays open',
  };
}

const outcome = (status, detail, extra = {}) => ({ status, detail, ...extra });

// Update `targetRoot` to this canon's engine version. `fullName` is the repo's
// owner/name, needed by the wiring converge. `today` pins the date fallback for a
// repo with no version stamp. `dryRun` runs every judgment and writes nothing —
// what the rehearsal wants, and what makes this testable against a real tree.
// `delivery` is the repo's own preference and `forceMergeOnRedCi` the operator's
// per-invocation override; both feed the decision this returns, never a merge it
// performs. `selfTestRun` is the gate's runner, injected so a test can drive both
// outcomes without a mount that is genuinely broken.
export async function engineUpdate(targetRoot, {
  fullName, today, dryRun = false, delivery = 'auto-merge', forceMergeOnRedCi = false, selfTestRun,
} = {}) {
  const settingsFile = settingsPath(targetRoot);
  if (!existsSync(settingsFile)) {
    return outcome(NEEDS_HUMAN, `${targetRoot} has no ${DECLARATION_FILE} — it has never adopted Claudinite`);
  }
  let raw;
  try { raw = JSON.parse(readFileSync(settingsFile, 'utf8')); }
  catch (e) { return outcome(NEEDS_HUMAN, `${DECLARATION_FILE} is not valid JSON: ${e.message}`); }

  const installed = hasInstalledMount(raw) ? installedVersions(raw) : null;
  const from = installed?.engineVersion ?? null;

  // The gap, decided before anything is touched.
  const records = engineRecordsInGap(installed, { today });
  // No agentic guard here any more: `loadMigrations` REJECTS the retired field for
  // every record it loads (#768 Phase 5), so a note cannot reach this flow to be
  // refused. The rule it enforced — the engine flow runs no agentic work, ever
  // (DESIGN §5) — is now true by construction rather than by a check per caller.
  const specs = (await loadMigrations()).filter((m) => records.includes(m.dir));

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

  // `env: {}` — never the ambient environment: the withhold handshake is an
  // announcement about the RUNNING process, and this process cannot deliver a
  // workflow file whatever its parent was able to do.
  const listDir = (p) => { try { return readdirSync(join(targetRoot, p)); } catch { return null; } };
  const remove = (p) => rmSync(join(targetRoot, p), { force: true });
  const importModule = (p) => import(pathToFileURL(join(targetRoot, p)).href);
  const io = { exists, move, read, write, readTemplate, listDir, remove, importModule, env: {} };
  const applied = [];
  for (const m of specs) applied.push(...(await applyMigration(m, io)));

  // 3. Wiring (never workflows), then the stamp that claims all of the above. The
  //    stub text and the secret list are the scheduler workflow's inputs, so with
  //    workflows off there is nothing to pass and nothing to compute.
  const wiring = await convergeWiring(targetRoot, fullName);

  // Re-RESOLVE and re-read, never reuse the path or the content read at entry: a
  // record in the gap above may have rewritten this file, and #1252's record renames
  // it outright — stamping the path resolved before that ran would write the engine
  // version into a file that no longer exists, recreating the retired name beside
  // the real declaration with nothing to say the two disagree.
  const stampPath = settingsPath(targetRoot);
  const next = withInstalledVersions(JSON.parse(readFileSync(stampPath, 'utf8')), { engineVersion: ENGINE_VERSION });
  writeFileSync(stampPath, `${JSON.stringify(next, null, 2)}\n`);

  // 4. Gate on the converged tree, and say what happens to the PR. This flow does
  //    not open or merge it — that is the shell's, which carries a token; what it
  //    must never carry is the judgment, so the decision is made and reported here.
  const selftest = runSelfTest(targetRoot, selfTestRun);
  const decision = deliveryDecision({ selftestOk: selftest.ok, delivery, forceMergeOnRedCi });

  return outcome(decision.action === 'needs-human' ? NEEDS_HUMAN : 'ok',
    decision.why, {
      from, to: ENGINE_VERSION, records, files: written.length, applied, wiring: wiring.changed,
      selftest, decision,
    });
}
