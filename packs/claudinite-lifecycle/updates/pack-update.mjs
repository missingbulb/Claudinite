import { copyFileSync, mkdirSync, rmSync, renameSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVendorSet, SHARED_SUBDIR } from '../../../vendoring/compute-vendor-set.mjs';
import { loadPacks, resolveDeclaredPacks, packEntryId } from '../../../engine/pack_loader/pack-registry.mjs';
import { ENGINE_VERSION } from '../../../engine/version.mjs';
import { isVersion, versionAbove } from '../../../engine/version.mjs';
import { RENAMED_PACKS } from '../../../engine/pack_loader/renamed-packs.mjs';
import { migrationDirs, migrationApplies, flowOf, DECLARATION_FILE } from '../../../engine/checks/helpers/active-migrations.mjs';
import { settingsPath } from '../../../engine/settings-file.mjs';
import { installedVersions, hasInstalledMount, withInstalledVersions } from '../../../engine/installed-versions.mjs';
import { loadMigrations, applyMigration, WITHHOLD_CAPABLE_ENV } from '../../../engine/migrations/registry.mjs';
import { NEEDS_HUMAN, runSelfTest, deliveryDecision } from './engine-update.mjs';

// THE PACK UPDATE FLOW (docs/versioned-updates/DESIGN.md §3): move one repo's
// declared packs from the versions it has installed to the ones this canon ships.
// The same shape as the engine flow beside it — vendor, migrate, converge, stamp,
// gate — with three deliberate differences, each a consequence of what a pack IS:
//
//   1. IT PUSHES NO WORKFLOW FILE, because it cannot: GitHub refuses the Action's
//      GITHUB_TOKEN under `.github/workflows/` and rejects the WHOLE ref for trying, so
//      one such path in the pushed tree fails the entire update. What it does instead is
//      the WITHHOLD lane — the write is staged to `.claudinite/pending-workflows/` and
//      reported in `withheld`, which raises the apply stage, whose session holds a
//      credential that may write there (#1509). The lane was retired in #1317 on the
//      premise that a member's workflows are static after adoption; #1494's executor
//      line is the counterexample that re-opened it.
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
const canonRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))); // <canon>/packs/claudinite-lifecycle/updates/<this file>

// A pack's own half of the vendor set: its directory, and nothing else. The engine
// tree and the catalog belong to the engine flow, which is what keeps two flows
// converging one mount from ever fighting over a file.
export const isPackFile = (rel, id) => rel.startsWith(`packs/${id}/`);

// The mount directories a pack has been vendored under BEFORE — every spelling that
// resolves to this id today (renamed-packs.mjs). A rename moves a pack's canon
// directory, and the vendor step below replaces a tree per id: the old directory
// matches no id any more, so without this it would sit in the mount forever holding a
// complete, loadable copy of the pack. That copy is not inert — `discoverPacks`
// canonicalizes a mounted pack's own id, so the stale tree announces the SAME id as
// the live one and the member runs the pack twice, one of them frozen at whatever it
// was renamed from. Swept here rather than by a migration record so the cleanup is a
// property of renaming, not something each rename has to remember.
export const legacySpellingsOf = (id) =>
  Object.entries(RENAMED_PACKS).filter(([, to]) => to === id).map(([from]) => from);

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
    const blocked = isVersion(needs) && versionAbove(needs, engineVersion)
      ? `pack "${id}" version ${to} needs engine ${needs}; this repo runs engine ${engineVersion}`
      : null;
    plan.push({
      id,
      from: isVersion(from) ? from : null,
      to: isVersion(to) ? to : null,
      blocked,
      records: packRecordsInGap(id, installed, { today }),
    });
  }
  return plan;
}

const outcome = (status, detail, extra = {}) => ({ status, detail, ...extra });

// Everything under here is a path this flow's caller cannot push, and the one
// definition of that fact. A record naming such a path is withheld from the pushed tree
// and staged for the apply stage, which delivers it on a credential that can.
export const WORKFLOW_DIR = '.github/workflows/';

// Where a withheld workflow file waits between this run staging it and the apply stage
// delivering it. Inside `.claudinite/`, so it rides the ordinary push the Action token
// CAN make; only the real `.github/workflows/` path is refused.
export const PENDING_DIR = '.claudinite/pending-workflows/';

// Where a withheld workflow path is staged. One level deep and named for the workflow
// file itself, so the apply stage recovers the destination from the staged name alone.
export const stagedAt = (workflowPath) => `${PENDING_DIR}${workflowPath.slice(WORKFLOW_DIR.length)}`;

// Every staged file, repo-relative. One level deep, which is all `.github/workflows/`
// itself has. The sweep in `packUpdate` reads this to clear what an EARLIER cycle left
// without touching what the current one just staged.
export function stagedFiles(targetRoot) {
  const dir = join(targetRoot, PENDING_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => `${PENDING_DIR}${e.name}`);
}

// The member's vendored scheduler stub. Read from the MEMBER, not from this canon
// clone: the engine flow refreshed it earlier in the same cycle, and reading the
// member's copy is what makes this agree with `converge-wiring.mjs`'s own CLI —
// the thing a human runs by hand, and the thing bootstrap runs at adoption.
// Where the tasks pack's scheduler stub sits in a member's mount. EMPTIED of its
// caller, not removed, for the reason every `updates/*` export is — the tasks pack's
// own converge-workflows.mjs resolves the stubs it scaffolds from.
const STUB_DIR = '.claudinite/shared/packs/claudinite-tasks/stubs/';
export const stubFor = () => `${STUB_DIR}claudinite-scheduler.yml`;

// The scheduler and executor workflows a member should be carrying. EMPTIED, NOT
// REMOVED, for the reason every `updates/*` export is. No flow computes a workflow's
// content any more: the files are static after adoption and the tasks pack scaffolds
// them there (converge-workflows.mjs). `pending: null` is what "nothing to deliver"
// has always meant to a caller, so a stale worker still reads a coherent answer.
export async function pendingSchedulerWorkflow() { return { pending: null, error: null }; }
export async function pendingExecutorWorkflow() { return { pending: null, error: null }; }

export function applyStageFor(specs, withheld = []) {
  const asked = specs.filter((m) => m.applyStage);
  if (!asked.length && !withheld.length) return { needed: false };
  // A withheld workflow file needs the stage on its own, with no record asking: the file
  // is staged and undelivered, and only the stage's credential can finish it.
  // The reason names the CONDITION and the ARTIFACTS BY IDENTITY, and stops there —
  // it becomes `reason.detail` on the work item, and the payload it rides in
  // carries identifiers, never instructions (updates/terminals.mjs). So a record that
  // asked for a session is named, not quoted: its `applyStage.instructions` are in
  // the mount the update just vendored, on the branch the session is given, and the
  // session reads them from there like any other fact about the repo.
  const why = [
    ...(withheld.length ? [`${withheld.length} withheld workflow file(s) staged under ${PENDING_DIR}`] : []),
    ...asked.map((m) => `${m.dir}: ${m.applyStage.why}`),
  ].join('; ');
  return {
    needed: true,
    // The packs that RAISED the records, not every pack whose version moved: this
    // scopes a session, and naming packs with nothing to apply widens it.
    packs: [...new Set(asked.map((m) => flowOf(m.dir).pack))],
    records: asked.map((m) => m.dir),
    withheld,
    why,
  };
}

// Update `targetRoot`'s declared packs to the versions this canon ships. Same
// arguments and same terminals as the engine flow; `dryRun` judges everything and
// writes nothing.
export async function packUpdate(targetRoot, {
  fullName, today, dryRun = false, delivery = 'auto-merge', forceMergeOnRedCi = false, selfTestRun,
  extraRecords = [],
} = {}) {
  const settingsFile = settingsPath(targetRoot);
  if (!existsSync(settingsFile)) {
    return outcome(NEEDS_HUMAN, `${targetRoot} has no ${DECLARATION_FILE} — it has never adopted Claudinite`);
  }
  let raw;
  try { raw = JSON.parse(readFileSync(settingsFile, 'utf8')); }
  catch (e) { return outcome(NEEDS_HUMAN, `${DECLARATION_FILE} is not valid JSON: ${e.message}`); }

  // The shape reader canonicalizes a legacy map's keys on the way out: a pack
  // renamed since a member last stamped it reads as never-installed otherwise.
  const installed = hasInstalledMount(raw) ? installedVersions(raw) : null;
  const declared = Array.isArray(raw.packs) ? raw.packs : [];
  const packs = await loadPacks();

  // The engine the TARGET runs, not the one this canon ships: a member is updated
  // engine-first, and a pack update that read the canon's number would enforce
  // `minEngineVersion` against an engine the repo does not have.
  const engineVersion = isVersion(installed?.engineVersion) ? installed.engineVersion : ENGINE_VERSION;
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
  //    and a pack this run does not touch is never disturbed. A pack the canon has
  //    RENAMED takes its old directories with it (legacySpellingsOf above).
  const sharedDir = join(targetRoot, SHARED_SUBDIR);
  for (const id of ids) {
    rmSync(join(sharedDir, 'packs', id), { recursive: true, force: true });
    for (const legacy of legacySpellingsOf(id)) rmSync(join(sharedDir, 'packs', legacy), { recursive: true, force: true });
  }
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

  const put = (p, c) => { mkdirSync(dirname(join(targetRoot, p)), { recursive: true }); writeFileSync(join(targetRoot, p), c); };

  // A path under `.github/workflows/` is WITHHELD from the pushed tree and staged for the
  // apply stage (#649, re-opened in #1509). The flow's caller pushes with the Action's
  // GITHUB_TOKEN, which GitHub never lets write there, and the refusal rejects the whole
  // ref — so the file must not be in the tree this run commits. The apply stage is a
  // different credential: it raises a work item for an agent session, and the Claude
  // GitHub App carries `workflows: write`, which is what actually delivers the file.
  //
  // #1317 dropped these writes instead, on the ground that "a member's workflows are
  // static after adoption". #1494 is the counterexample — the executor's CLAUDINITE_VARS
  // line is a workflow change every member needs — so the lane is open again.
  const withheld = [];
  // Which packs finished this run still OWING a file. A withheld path is delivered by
  // the apply stage on another credential, not here, so the pack it belongs to has not
  // actually reached the version this run would stamp — see the stamp step below.
  //
  // Attributed as the write happens rather than by counting `withheld` afterwards: two
  // records from DIFFERENT packs may name the same workflow path, and the second one's
  // write grows nothing, so a count would stamp the pack whose content is the one
  // actually staged.
  const owesDelivery = new Set();
  let owedBy = null;
  const write = (p, c) => {
    if (!p.startsWith(WORKFLOW_DIR)) return put(p, c);
    put(stagedAt(p), c);
    if (!withheld.includes(p)) withheld.push(p);
    if (owedBy) owesDelivery.add(owedBy);
  };
  const move = (from, to) => { mkdirSync(dirname(join(targetRoot, to)), { recursive: true }); renameSync(join(targetRoot, from), join(targetRoot, to)); };
  const readTemplate = (p) => (existsSync(join(canonRoot, p)) ? readFileSync(join(canonRoot, p), 'utf8') : null);
  // The announcement is what un-skips a record naming a workflow path. It is an env
  // handshake rather than a probe of the disk because what matters is what THIS process
  // can do, and the vendor step earlier in this same cycle already replaced the on-disk
  // worker while the old code is still running (registry.mjs states the same).
  const io = { exists, move, read, write, readTemplate, env: { [WITHHOLD_CAPABLE_ENV]: '1' } };
  const applied = [];
  for (const m of [...specs, ...extraRecords]) {
    owedBy = flowOf(m.dir).pack ?? null;
    applied.push(...(await applyMigration(m, io)));
  }
  owedBy = null;

  // 2c. THE CLAUDE.md PACK INDEX (#807), for the same reason as 2b and at the same
  //     point: its content is a function of the pack set, and the vendor above is
  //     what just changed it. The engine flow converges the index too, but it runs
  //     BEFORE the packs in a cycle — so on the one night a pack lands, the engine
  //     flow's copy is already yesterday's, and without this the member would carry
  //     a stale index (and inject the whole corpus through the hook as a fallback)
  //     until some later cycle happened to touch the engine.
  //
  //     Written straight to the tree rather than withheld: the index is not a
  //     workflow path, so no credential refuses it.
  const { writeRulesIndex, RULES_INDEX_FILE } = await import('../../../engine/pack_loader/generate-rules-index.mjs');
  const { ensureRulesIndexImport, ensureRulesIndexMergeAttribute } = await import('../../../engine/converge-wiring.mjs');
  if (await writeRulesIndex(targetRoot)) applied.push(`converged ${RULES_INDEX_FILE}`);
  if (ensureRulesIndexImport(targetRoot)) applied.push('added the CLAUDE.md pack-index import');
  if (ensureRulesIndexMergeAttribute(targetRoot)) applied.push('declared merge=ours for the pack index');

  // …and sweep the staging directory of anything this run did NOT put there: a file
  // staged by an earlier cycle was either delivered or abandoned, and either way the
  // record that staged it would stage it again. Scoping the sweep is load-bearing — an
  // unscoped one deletes the delivery this very run just staged, silently and green.
  const stagedNow = new Set(withheld.map(stagedAt));
  for (const stale of stagedFiles(targetRoot)) {
    if (stagedNow.has(stale)) continue; // this run's own delivery, not a leftover
    rmSync(join(targetRoot, stale), { force: true });
  }

  // 3. Stamp each updated pack's version. Written per pack rather than wholesale, so
  //    a pack this run did not touch keeps the number it really has.
  const next = JSON.parse(readFileSync(settingsFile, 'utf8'));
  // Only what this run moved: a version lands on the entry of the pack it prices,
  // and a pack this run did not touch keeps the number it really has. The old
  // spelling of a renamed pack cannot be carried forward here even by accident —
  // there is no map to carry it in, only entries the declaration itself names
  // (#1041 is what a second key in a central map cost).
  //
  //    A PACK THAT STILL OWES A WITHHELD FILE IS NOT STAMPED (#1545). The stamp is
  //    this member's claim to have received the version, and a version whose record
  //    staged a workflow file has been received only once the apply stage delivers it.
  //    Stamping first is unrecoverable rather than merely early: `migrationApplies` is
  //    `want > have`, so the moment the stamp lands the record stops applying, stops
  //    vendoring, and the staged copy — the one remaining source of the content — is
  //    swept by the next cycle as a leftover. Holding the number back keeps the record
  //    in range, so an undelivered file is simply staged again next cycle, which is
  //    what makes a merged-but-undelivered PR self-healing instead of a silent loss.
  const packVersions = {};
  for (const p of plan) if (p.to !== null && !owesDelivery.has(p.id)) packVersions[p.id] = p.to;
  writeFileSync(settingsFile, `${JSON.stringify(withInstalledVersions(next, { packVersions }), null, 2)}\n`);

  // 4. The same gate the engine flow uses, then the agentic tail's own question —
  //    ASKED OF THE RECORDS, NOT OF THE VERSION PLAN (#798).
  //
  //    This used to be `moved.length > 0`: any declared pack whose version number
  //    changed summoned a session. That is a fact about the CANON, and the stage
  //    exists for a fact about the MEMBER — the pack's new rules met content the
  //    canon has never seen. The two coincide only by accident.
  //
  //    The cost of conflating them was not theoretical. A record can only reach an
  //    up-to-date member if its pack's manifest version bumps (`migrationApplies` is
  //    `want > have` against the stamped number, and the stamp written is the
  //    manifest's). So every mechanical migration — a regex rewrite, a rename, a
  //    declaration seed, all deterministic and idempotent — had to buy a session on
  //    every member in the fleet to reach them at all. Deterministic work priced as
  //    agentic work is how a fleet learns to dread its own updates.
  //
  //    So the records answer. Each one's author knew which kind they were writing,
  //    and `applyStage` is where they say so. A bump carrying no such record is
  //    silent, which is what makes a first live run of an agentic change something
  //    you can aim at one member instead of fourteen at once.
  const selftest = runSelfTest(targetRoot, selfTestRun);
  const decision = deliveryDecision({ selftestOk: selftest.ok, delivery, forceMergeOnRedCi });
  // A wiring failure rides out on `detail`, which the worker already prints and which
  // becomes the PR body and the work item's reason. Appended rather than given a
  // field of its own, because a new field only reaches a member when its worker
  // catches up a cycle later, and `detail` reaches every fielded worker today.
  // No flow computes a workflow any more, so there is no wiring failure left to ride
  // out on `detail`. The field stays null rather than absent: a fielded worker reads it,
  // and a key that vanished would read as a worker too old to report one.
  const wiringError = null;
  const detail = decision.why;

  return outcome(decision.action === 'needs-human' ? NEEDS_HUMAN : 'ok', detail, {
    plan, files: packFiles.length, applied, selftest, decision, withheld,
    wiringError, applyStage: applyStageFor(specs, withheld),
  });
}
