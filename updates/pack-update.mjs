import { copyFileSync, mkdirSync, rmSync, renameSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVendorSet, SHARED_SUBDIR } from '../vendoring/compute-vendor-set.mjs';
import { loadPacks, resolveDeclaredPacks, packEntryId } from '../engine/pack_loader/pack-registry.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';
import { isVersion, versionAbove } from '../engine/version.mjs';
import { RENAMED_PACKS } from '../engine/pack_loader/renamed-packs.mjs';
import { migrationDirs, migrationApplies, flowOf, DECLARATION_FILE } from '../engine/checks/helpers/active-migrations.mjs';
import { settingsPath } from '../engine/settings-file.mjs';
import { installedVersions, hasInstalledMount, withInstalledVersions } from '../engine/installed-versions.mjs';
import { loadMigrations, applyMigration } from '../engine/migrations/registry.mjs';
import { NEEDS_HUMAN, runSelfTest, deliveryDecision } from './engine-update.mjs';

// THE PACK UPDATE FLOW (docs/versioned-updates/DESIGN.md §3): move one repo's
// declared packs from the versions it has installed to the ones this canon ships.
// The same shape as the engine flow beside it — vendor, migrate, converge, stamp,
// gate — with three deliberate differences, each a consequence of what a pack IS:
//
//   1. IT OWNS `.github/workflows/`, and DELIVERS IT BY WITHHOLDING. The scheduler
//      workflow's content is a function of the STUB, which a pack update is what
//      re-vendors — and this flow is the only one that runs late enough to see the
//      stubs it just laid down.
//
//      What it does NOT have is a credential. Its caller pushes with the Action's
//      GITHUB_TOKEN, which GitHub never lets write under `.github/workflows/`, and
//      the refusal rejects the WHOLE ref — so a flow that wrote one would not
//      deliver a workflow, it would fail the entire update and everything riding on
//      it. So this flow computes the content and withholds it: nothing lands on
//      disk, the paths ride out in `withheld`, and the apply stage — which has an
//      MCP credential — writes them verbatim. That is a CREDENTIAL LANE, not
//      adaptation: the content is already decided, and the session supplies only
//      the one thing an Action token cannot (#797, #649).
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

// Everything under here is a path this flow's caller cannot push.
export const WORKFLOW_DIR = '.github/workflows/';

// …and where the content goes instead: a staging directory that IS pushable, holding
// the same relative paths under it, so delivery is a directory move and nothing has
// to be recomputed by the hand that performs it.
//
// THE CONTENT TRAVELS THROUGH THE REPOSITORY, not through the dispatch. That is the
// scheduler's standing rule for the code→agent boundary (engine/scheduler/code-work.mjs):
// a request payload may carry identifiers and the NAME of the condition that fired,
// "never findings and never instructions" — everything else goes through the repo.
// Two things fall out of obeying it, and both are worth more than the shortcut. The
// withheld file is REVIEWABLE: it lands in the update's own PR, where a human sees
// the workflow diff before any session touches it. And it is RECOVERABLE: if the
// session never runs, the content sits on the branch instead of evaporating with a
// request file, and the next cycle finds it already staged.
export const PENDING_DIR = '.claudinite/pending-workflows/';
export const stagedAt = (workflowPath) => `${PENDING_DIR}${workflowPath.slice(WORKFLOW_DIR.length)}`;

// Every file currently staged, repo-relative. One level deep, which is all
// `.github/workflows/` itself has.
export function stagedFiles(targetRoot) {
  const dir = join(targetRoot, PENDING_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => `${PENDING_DIR}${e.name}`);
}

// The member's vendored scheduler stub. Read from the MEMBER, not from this canon
// clone: the engine flow refreshed it earlier in the same cycle, and reading the
// member's copy is what makes this agree with `converge-wiring.mjs`'s own CLI —
// the thing a human runs by hand, and the thing bootstrap runs at adoption.
// The scheduler run and its drain sit at the path the slot scheduler used to hold
// (tasks-dispatch DESIGN §14), so this lane needs to know only one stub. The
// argument is kept because every caller has the member's config in hand and the
// signature is what fielded callers pass.
const STUB_DIR = '.claudinite/shared/engine/scheduler/stubs/';
export const stubFor = () => `${STUB_DIR}claudinite-scheduler.yml`;

// The scheduler workflow this member should be carrying, as `{ pending, error }`.
// `pending` is null when the file is already converged; `error` is set when the
// answer could not be computed at all.
//
// NOT THROWING is deliberate: this is one surface of an update whose other surfaces
// have already landed, and a member whose settings will not parse has a problem this
// flow cannot fix and must not die of. A throw here would strand the whole update
// behind an unrelated fault.
//
// But NOT REPORTING was a bug, and a nasty one. The first version swallowed every
// failure to a bare `null`, which is the same answer as "already converged" — so a
// member whose settings stopped parsing would report a clean update, forever, while
// its wiring silently froze. That is precisely the failure mode this whole lane
// exists to end (#797): wiring that nothing converges and nothing complains about.
// Silence is the right behaviour for the TERMINAL and the wrong behaviour for the
// LOG, so the two are separated here.
export async function pendingSchedulerWorkflow(targetRoot, fullName, read) {
  try {
    if (!fullName) return { pending: null, error: 'no repo name — cannot resolve this repo\'s cron minute' };
    const { schedulerWorkflowTarget, SCHEDULER_WORKFLOW } = await import('../engine/scheduler/converge-wiring.mjs');
    const { loadConfig } = await import('../engine/checks/helpers/repo-context.mjs');
    const config = loadConfig(targetRoot);
    const stubRel = stubFor(config);
    const stub = read(stubRel);
    if (stub == null) return { pending: null, error: `no vendored scheduler stub at ${stubRel}` };
    // The repo's own anchor hour picks both cron hours (DESIGN §17); absent means the default.
    const content = schedulerWorkflowTarget(fullName, stub, config?.taskScheduler?.dailyHour);
    const pending = read(SCHEDULER_WORKFLOW) === content ? null : { path: SCHEDULER_WORKFLOW, content };
    return { pending, error: null };
  } catch (e) {
    return { pending: null, error: `could not compute the scheduler workflow: ${e.message}` };
  }
}

// The executor workflow (tasks-dispatch DESIGN §10). Separate from the scheduler
// lane above because the two answer different questions: one is the cron shim at a
// fixed path, the other is the event-driven drain beside it — but every member owes
// both, so a null answer here means already-converged, never not-applicable.
//
// It has to converge in the SAME cycle as the scheduler run, which is the whole reason this
// lane exists. The scheduler run and the executor are one mechanism split across two files:
// the scheduler run creates and readies work items and nothing else, so a member that received
// the scheduler run without the executor has a generator with no worker — a queue that fills
// every hour and is never drained, looking exactly like a repo whose tasks all
// declined. Delivering the pair together is what keeps that state unreachable.
export const EXECUTOR_STUB = `${STUB_DIR}claudinite-executor.yml`;

export async function pendingExecutorWorkflow(targetRoot, read) {
  try {
    const { EXECUTOR_WORKFLOW } = await import('../engine/scheduler/converge-wiring.mjs');
    const stub = read(EXECUTOR_STUB);
    if (stub == null) return { pending: null, error: `no vendored executor stub at ${EXECUTOR_STUB}` };
    // The stub verbatim: the executor workflow stopped being a function of the task
    // set when secrets moved to one static `toJSON(secrets)` line (#1301).
    const pending = read(EXECUTOR_WORKFLOW) === stub ? null : { path: EXECUTOR_WORKFLOW, content: stub };
    return { pending, error: null };
  } catch (e) {
    return { pending: null, error: `could not compute the executor workflow: ${e.message}` };
  }
}

// Whether this run's records ask for the agentic tail, and what they ask for.
//
// Separate and pure because it is the answer most worth being able to interrogate
// without a member tree: it decides whether an update costs a session, it is the
// half of the flow that #798 got wrong, and the wrong version of it was
// indistinguishable from the right one against any single repo.
// TWO INDEPENDENT REASONS, and they are not the same kind of thing:
//
//   - RECORDS ASKED. The pack's new rules met member-authored content the canon has
//     never seen, and a record's author said so. This is judgement work.
//   - PATHS WERE WITHHELD. `.github/workflows/` content that is already fully
//     decided and that only an MCP credential can land. Nothing here is a judgement
//     call; the session is a delivery mechanism.
//
// Kept distinct all the way to the brief, because a session told "apply the updated
// rules" when the truth is "write these two files verbatim" will go looking for
// judgement to exercise, and find some.
export function applyStageFor(specs, withheld = []) {
  const asked = specs.filter((m) => m.applyStage);
  if (!asked.length && !withheld.length) return { needed: false };
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

  // THE WITHHOLD, made literal. Everything bound for `.github/workflows/` is diverted
  // to the staging directory instead, so the tree this flow's caller commits can
  // never contain a path its token is refused for. Before this, the flow ANNOUNCED
  // the capability (see the env below) and had none: the first record materializing a
  // workflow would have written it, the worker's `git add -A` would have staged it,
  // and GitHub's refusal would have rejected the whole ref — failing the entire
  // update, not just that file.
  const withheld = [];
  const withhold = (path, content) => {
    if (!withheld.some((w) => w.path === path)) withheld.push({ path, staged: stagedAt(path) });
    put(stagedAt(path), content);
  };
  const write = (p, c) => (p.startsWith(WORKFLOW_DIR) ? withhold(p, c) : put(p, c));
  const move = (from, to) => { mkdirSync(dirname(join(targetRoot, to)), { recursive: true }); renameSync(join(targetRoot, from), join(targetRoot, to)); };
  const readTemplate = (p) => (existsSync(join(canonRoot, p)) ? readFileSync(join(canonRoot, p), 'utf8') : null);
  // The withhold handshake, announced — and now true. A record that materializes a
  // workflow file is applied rather than reported as skipped, because `write` above
  // routes it to the lane that can deliver it.
  const io = { exists, move, read, write, readTemplate, env: { CLAUDINITE_CAN_WITHHOLD_WORKFLOWS: '1' } };
  const applied = [];
  for (const m of specs) applied.push(...(await applyMigration(m, io)));

  // 2b. THE SCHEDULER WORKFLOW (#797). Its content is a function of the task set,
  //     and the vendor above is what just changed the task set — so this is the one
  //     point in the cycle where the answer is both knowable and current. The engine
  //     flow runs BEFORE the packs and would compute it from yesterday's tasks;
  //     baselining used to do it and was retired in #768 Phase 5, which is how every
  //     member's wiring came to be frozen at whatever baselining last wrote.
  //
  //     Withheld like any other workflow path, and by the same route, so "the file
  //     drifted" and "a record materialized one" reach the apply stage as one list.
  const wiring = await pendingSchedulerWorkflow(targetRoot, fullName, read);
  if (wiring.pending) withhold(wiring.pending.path, wiring.pending.content);
  const executor = await pendingExecutorWorkflow(targetRoot, read);
  if (executor.pending) withhold(executor.pending.path, executor.pending.content);

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
  const { writeRulesIndex, RULES_INDEX_FILE } = await import('../engine/pack_loader/generate-rules-index.mjs');
  const { ensureRulesIndexImport, ensureRulesIndexMergeAttribute } = await import('../engine/scheduler/converge-wiring.mjs');
  if (await writeRulesIndex(targetRoot)) applied.push(`converged ${RULES_INDEX_FILE}`);
  if (ensureRulesIndexImport(targetRoot)) applied.push('added the CLAUDE.md pack-index import');
  if (ensureRulesIndexMergeAttribute(targetRoot)) applied.push('declared merge=ours for the pack index');

  // …and sweep what is no longer owed. A staged file outlives its need the moment the
  // apply stage lands it: the workflow then matches its target, nothing withholds it
  // again, and a copy left in the staging directory would sit there permanently
  // looking like undelivered work. Sweeping is also how a stage that DID run gets
  // confirmed — the directory is empty exactly when nothing is outstanding.
  const owed = new Set(withheld.map((w) => w.staged));
  for (const stale of stagedFiles(targetRoot)) if (!owed.has(stale)) rmSync(join(targetRoot, stale), { force: true });

  // 3. Stamp each updated pack's version. Written per pack rather than wholesale, so
  //    a pack this run did not touch keeps the number it really has.
  const next = JSON.parse(readFileSync(settingsFile, 'utf8'));
  // Only what this run moved: a version lands on the entry of the pack it prices,
  // and a pack this run did not touch keeps the number it really has. The old
  // spelling of a renamed pack cannot be carried forward here even by accident —
  // there is no map to carry it in, only entries the declaration itself names
  // (#1041 is what a second key in a central map cost).
  const packVersions = {};
  for (const p of plan) if (p.to !== null) packVersions[p.id] = p.to;
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
  const wiringError = [wiring.error, executor.error].filter(Boolean).join('; ') || null;
  const detail = wiringError ? `${decision.why} — but ${wiringError}` : decision.why;

  return outcome(decision.action === 'needs-human' ? NEEDS_HUMAN : 'ok', detail, {
    plan, files: packFiles.length, applied, selftest, decision, withheld,
    wiringError, applyStage: applyStageFor(specs, withheld),
  });
}
