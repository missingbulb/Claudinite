import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeVendorSet, SHARED_SUBDIR } from '../vendoring/compute-vendor-set.mjs';
import { loadPacks, resolveDeclaredPacks, packEntryId } from '../engine/pack_loader/pack-registry.mjs';
import { ENGINE_VERSION } from '../engine/version.mjs';
import { DECLARATION_FILE } from '../engine/checks/helpers/active-migrations.mjs';
import { NEEDS_HUMAN, runSelfTest, deliveryDecision } from './engine-update.mjs';
import { isPackFile } from './pack-update.mjs';

// INSTALL = THE UPDATE FLOW FROM VERSION ZERO (docs/versioned-updates/DESIGN.md §4),
// with one difference that is not an optimisation but a correctness rule:
//
//   **AN INSTALL RUNS NO MIGRATIONS** (owner decision 9). The vendored content is
//   already the newest shape, so there is no older state to migrate. Replaying
//   history onto a fresh install is not merely wasted work — a record assumes the
//   shapes ITS ERA produced, and an empty repo is not one of them, so the replay is
//   a hazard. The install fetches no records and stamps the LATEST version directly;
//   migrations exist for repos installed at an older one.
//
// Everything else is the pack flow's: same vendor set, same self-test gate, same
// terminals. What differs is only where it starts.
//
// AN INSTALL IS NOT AN UPDATE IN DISGUISE. A pack the repo already has a version for
// is refused rather than reinstalled: reinstalling would stamp the newest version
// while skipping every record between, which is exactly how a member ends up
// claiming a state it was never migrated into.
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url))); // <canon>/updates/

const outcome = (status, detail, extra = {}) => ({ status, detail, ...extra });

// Which of the requested ids this repo can actually install, and why the rest are
// refused. Pure over the pack set and the stamp, so the judgment is testable with
// no repo on disk.
export function planInstall(packs, ids, installed, { engineVersion = ENGINE_VERSION } = {}) {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const stamped = installed?.packVersions ?? {};
  const install = [];
  const refused = [];
  for (const id of ids ?? []) {
    const pack = byId.get(id);
    if (!pack) { refused.push({ id, why: `"${id}" names no canon pack` }); continue; }
    if (typeof stamped[id] === 'number') {
      refused.push({ id, why: `"${id}" is already installed at version ${stamped[id]} — that is an update, not an install` });
      continue;
    }
    const needs = pack.minEngineVersion;
    if (typeof needs === 'number' && needs > engineVersion) {
      refused.push({ id, why: `"${id}" needs engine ${needs}; this repo runs engine ${engineVersion}` });
      continue;
    }
    install.push({ id, version: pack.version ?? null });
  }
  return { install, refused };
}

// The questions this install cannot answer for the repo. An interview is not a
// special terminal (DESIGN §3.9) — unanswered questions end the run exactly like a
// red check does: PR open, `needs-human`, stop. It degrades gracefully to async,
// which is what the live-session adoption skill could never do.
export function unansweredQuestions(packs, entries) {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const out = [];
  for (const entry of entries ?? []) {
    const id = packEntryId(entry);
    const pack = id === undefined ? undefined : byId.get(id);
    if (!pack?.questions?.length) continue;
    const answers = (typeof entry === 'object' && entry?.answers) || {};
    for (const q of pack.questions) {
      if (!q?.id || answers[q.id] !== undefined) continue;
      out.push({ pack: id, question: q.id, prompt: q.prompt ?? '' });
    }
  }
  return out;
}

// Install `ids` into `targetRoot`: declare them, vendor their content, stamp their
// latest versions, gate, and report. `dryRun` judges everything and writes nothing.
export async function installPacks(targetRoot, ids, {
  today, dryRun = false, delivery = 'auto-merge', forceMergeOnRedCi = false, selfTestRun, packs: packSet,
} = {}) {
  const settingsPath = join(targetRoot, DECLARATION_FILE);
  if (!existsSync(settingsPath)) {
    return outcome(NEEDS_HUMAN, `${targetRoot} has no ${DECLARATION_FILE} — adoption seeds the declaration first`);
  }
  let raw;
  try { raw = JSON.parse(readFileSync(settingsPath, 'utf8')); }
  catch (e) { return outcome(NEEDS_HUMAN, `${DECLARATION_FILE} is not valid JSON: ${e.message}`); }

  const installed = raw.claudinite && typeof raw.claudinite === 'object' ? raw.claudinite : null;
  const engineVersion = typeof installed?.engineVersion === 'number' ? installed.engineVersion : ENGINE_VERSION;
  // `packs` is injectable for the same reason `selfTestRun` is: the seed-op path is
  // only reachable through a manifest that declares one, and the canon deliberately
  // has none yet.
  const packs = packSet ?? await loadPacks();
  const { install, refused } = planInstall(packs, ids, installed, { engineVersion });
  if (!install.length) {
    return outcome(NEEDS_HUMAN, refused.map((r) => r.why).join('; ') || 'nothing to install', { refused });
  }

  // The declaration first: the vendor set is computed FROM it, so a pack that is not
  // declared has no content to lay down.
  const declared = Array.isArray(raw.packs) ? [...raw.packs] : [];
  for (const { id } of install) {
    if (!declared.some((e) => packEntryId(e) === id)) declared.push(id);
  }

  const entries = resolveDeclaredPacks(declared, packs);
  const unanswered = unansweredQuestions(packs, entries);

  // THE `requires` CLOSURE IS INSTALLED TOO, and stamped. A pack pulled in by another
  // (git-github via basics) has its content vendored either way — `computeVendorSet`
  // resolves the same closure — so stamping only the ids a caller happened to NAME
  // would leave the rest installed-but-unversioned. That is the same silent hole this
  // CLI was written to close, one level down: unversioned means the update flow reads
  // `from: null` and falls back to the landed-date window instead of comparing
  // numbers. A repo's real stamp already reflects this — the canary carries
  // `git-github: 1` without declaring it — so the arithmetic here is catching up with
  // what the fleet has always meant.
  const named = new Set(install.map((i) => i.id));
  const pulled = entries.map(packEntryId).filter((id) => typeof id === 'string' && !named.has(id));
  install.push(...planInstall(packs, pulled, installed, { engineVersion }).install);

  // No `installed` passed: an install fetches no migration records at all, whatever
  // the repo's stamp says. The set is content only.
  const { files, errors } = await computeVendorSet(declared, { today, installed: { engineVersion, packVersions: forcedCurrent(packs) } });
  if (errors.length) return outcome(NEEDS_HUMAN, errors.map((e) => e.what).join('; '), { errors, refused });

  const ourFiles = files.filter((f) => install.some(({ id }) => isPackFile(f, id)));
  const records = ourFiles.filter((f) => f.includes('/migrations/'));
  if (dryRun) {
    return outcome('ok', `would install ${install.map((i) => i.id).join(', ')}`,
      { install, refused, unanswered, files: ourFiles.length, records: records.length, dryRun: true });
  }

  const sharedDir = join(targetRoot, SHARED_SUBDIR);
  for (const file of ourFiles) {
    const dest = join(sharedDir, file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(canonRoot, file), dest);
  }

  // Stamp the LATEST version directly — the install's whole claim. Nothing is
  // migrated into it, so nothing may imply it was.
  const next = JSON.parse(readFileSync(settingsPath, 'utf8'));
  next.packs = declared;
  const packVersions = { ...(next.claudinite?.packVersions ?? {}) };
  for (const { id, version } of install) if (version !== null) packVersions[id] = version;
  next.claudinite = { ...(next.claudinite ?? {}), packVersions };
  writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);

  // Seed ops: the install-only effects the repo owns from here (DESIGN §4). Written
  // ONLY when the dest is absent — a seeded file is the member's from the moment it
  // lands, and an install that overwrote one would be doing exactly what the
  // seeded-vs-converged distinction exists to prevent.
  const seeded = [];
  for (const { id } of install) {
    const pack = packs.find((p) => p.id === id);
    for (const { template, dest } of pack?.seedOps ?? []) {
      const from = join(canonRoot, 'packs', id, template);
      const to = join(targetRoot, dest);
      if (!existsSync(from) || existsSync(to)) continue;
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      seeded.push(dest);
    }
  }

  const selftest = runSelfTest(targetRoot, selfTestRun);
  const decision = unanswered.length
    ? { action: 'needs-human', why: `${unanswered.length} adoption question(s) unanswered: ${unanswered.map((u) => `${u.pack}/${u.question}`).join(', ')}` }
    : deliveryDecision({ selftestOk: selftest.ok, delivery, forceMergeOnRedCi });

  return outcome(decision.action === 'needs-human' ? NEEDS_HUMAN : 'ok', decision.why, {
    install, refused, unanswered, files: ourFiles.length, seeded, selftest, decision,
    // An install is where the pack's rules FIRST meet this repo's content, so the
    // apply stage is always the next step — there is no "nothing moved" case here.
    applyStage: { needed: true, packs: install.map((i) => i.id), why: 'the pack\'s rules meet this repo for the first time' },
  });
}

// The version map that makes the record gate answer "nothing applies": every pack at
// its newest. An install must fetch no records, and saying so through the same
// predicate the other flows use is better than a second code path that could drift
// from it.
const forcedCurrent = (packs) => Object.fromEntries(packs.map((p) => [p.id, p.version ?? 0]));

// CLI: `node install.mjs --target <dir> <pack-id>…` — install packs into a repo, from
// a fresh canon clone. Run by the adoption skills (adopt-pack, adopt-claudinite).
//
// WHY THIS EXISTS AT ALL (#768). The skills used to converge an adoption by hand:
// fetch canon, run `vendoring/apply-vendor-set.mjs`, advance the stamp. That lays the
// pack's FILES down correctly and gets one thing wrong that nothing notices for weeks
// — it never writes `claudinite.packVersions[<id>]`. The pack is then installed but
// UNVERSIONED, so the next update flow reads `from: null`, and `migrationApplies`
// falls back to its landed-date window because it cannot compare numbers. A pack
// adopted today can therefore be handed records written for the shapes of an older
// era, which is precisely what "an install runs no migrations" exists to prevent.
//
// One runner, one stamp. The skills describe intent and hand-offs; the arithmetic of
// what version a repo is now at belongs here, where the update flows read it from.
async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] ?? null; };
  const targetRoot = flag('--target') ?? process.env.CLAUDINITE_REPO_ROOT ?? process.cwd();
  const dryRun = argv.includes('--dry-run');
  const consumed = new Set(['--target', targetRoot, '--dry-run', '--delivery', flag('--delivery')]);
  const ids = argv.filter((a) => !a.startsWith('--') && !consumed.has(a));
  if (!ids.length) {
    console.error('install: name at least one pack id — `node install.mjs --target <dir> <pack-id>…`');
    process.exit(1);
  }

  const r = await installPacks(targetRoot, ids, { dryRun, delivery: flag('--delivery') ?? 'auto-merge' });
  for (const i of r.install ?? []) console.log(`install: ${i.id} → version ${i.version ?? 'unversioned'}`);
  for (const f of r.refused ?? []) console.log(`install: REFUSED ${f.id} — ${f.why}`);
  for (const s of r.seeded ?? []) console.log(`install: seeded ${s}`);
  console.log(`install: ${r.status} — ${r.detail}`);

  // A refusal is not a partial success. `planInstall` refuses a pack whose engine is
  // too old, an unknown id, and a pack already installed (that is an UPDATE, and
  // running an install over it would restamp the repo to the newest version while
  // skipping every record in between). Exiting 0 there would let a caller's `&&`
  // chain carry on as if the pack were adopted.
  if (r.status === NEEDS_HUMAN || (r.refused ?? []).length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`install failed: ${e.message}`); process.exit(1); });
}
