#!/usr/bin/env node
// The executable form of bootstrap.md: one idempotent invocation, run FROM the
// fetched canon tree AGAINST a consumer checkout, that performs every mechanical
// part of adoption — seed the declaration, declare the requested packs and record
// their interview answers, vendor the snapshot, track it, converge the wiring
// (hooks, workflows, rules index, seed local pack), anchor the
// scheduler, seed a minimal sweeps CI where none exists — then self-test, sweep,
// and report what is left for the session: the pending interview questions
// (batched, for ONE AskUserQuestion pass) and the steps only a human can take.
//
//   node <canon>/bootstrap.mjs --target <consumer-root> --repo <owner>/<repo>
//        [--packs id,id,…] [--answer <pack>/<question>=<text>]… [--ref <sha>]
//
// Adoption is version zero, which is the one state where whole-set vendoring is
// safe (see the adopt-claudinite skill on why a stamped repo must never re-run
// this). Re-running DURING adoption is the designed loop: record the interview
// answers and invoke again — everything converged stays converged.
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverPacks, resolveDeclaredPacks, packEntryId } from './engine/pack_loader/pack-registry.mjs';
import { seedDeclaration } from './engine/checks/helpers/seed-declaration.mjs';
import { loadConfig } from './engine/checks/helpers/repo-context.mjs';
import { applyVendor } from './vendoring/apply-vendor-set.mjs';
import { convergeWiring } from './engine/converge-wiring.mjs';
import { unansweredQuestions } from './packs/claudinite-lifecycle/updates/install.mjs';
import { runSelfTest } from './packs/claudinite-lifecycle/updates/engine-update.mjs';

const canonRoot = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const values = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const fail = (msg) => { console.error(`bootstrap: ${msg}`); process.exit(1); };

const target = value('--target') ?? process.cwd();
const fullName = value('--repo');
if (!fullName || !/^[^/]+\/[^/]+$/.test(fullName)) fail('need --repo <owner>/<repo> — the wiring (cron minute, local pack, executor) is a function of the full name');
const requested = values('--packs').flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);
const answers = values('--answer').map((raw) => {
  const m = /^([^/=]+)\/([^=]+)=([\s\S]*)$/.exec(raw);
  if (!m) fail(`--answer wants <pack>/<question>=<text>, got: ${raw}`);
  return { pack: m[1], question: m[2], text: m[3] };
});

const { packs, errors: packErrors } = await discoverPacks({ localRoot: target });
if (packErrors.length) fail(packErrors.map((e) => e.what).join('; '));
const byId = new Map(packs.map((p) => [p.id, p]));
for (const id of requested) if (!byId.has(id)) fail(`--packs names no canon pack: "${id}" (see packs/directory.GENERATED.md)`);
for (const a of answers) {
  const q = byId.get(a.pack)?.questions?.find((q) => q.id === a.question);
  if (!q) fail(`--answer names no adoption question: ${a.pack}/${a.question}`);
}

// 1. The declaration: seed if absent, then fold in the requested packs and the
// recorded answers. Structural rewrite is safe here and only here — during
// adoption the file is this script's own JSON.stringify output, not a
// hand-formatted settings file (the anchored-text rule protects the latter).
const seedResult = seedDeclaration(target, packs);
console.log(seedResult.existed ? 'bootstrap: declaration exists — converging it' : 'bootstrap: seeded .claudinite-settings.json');
const declPath = seedResult.path;
const decl = JSON.parse(readFileSync(declPath, 'utf8'));
const declared = Array.isArray(decl.packs) ? decl.packs : [];
for (const id of requested) {
  if (!declared.some((e) => packEntryId(e) === id)) { declared.push(id); console.log(`bootstrap: declared ${id}`); }
}
decl.packs = resolveDeclaredPacks(declared, packs);
for (const a of answers) {
  const i = decl.packs.findIndex((e) => packEntryId(e) === a.pack);
  if (i === -1) fail(`--answer for "${a.pack}", which is not declared — add it via --packs`);
  const entry = typeof decl.packs[i] === 'object' ? decl.packs[i] : { id: decl.packs[i] };
  entry.answers = { ...(entry.answers ?? {}), [a.question]: a.text };
  decl.packs[i] = entry;
  console.log(`bootstrap: recorded answer ${a.pack}/${a.question}`);
  const distill = byId.get(a.pack).questions.find((q) => q.id === a.question).distill;
  if (distill) console.log(`  distill: ${distill}`);
}
// The scheduler anchors (bootstrap.md's defaults), materialized so the file the
// owner would edit shows them.
if (!decl.taskScheduler) decl.taskScheduler = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
writeFileSync(declPath, `${JSON.stringify(decl, null, 2)}\n`);

// 2. Vendor the snapshot (whole-set + stamp; aborts before any write on error).
const vendored = await applyVendor(target, { ref: value('--ref') ?? null });
if (vendored.errors.length) fail(vendored.errors.map((e) => `${e.what}\n  fix: ${e.fix}`).join('\n'));
console.log(`bootstrap: vendored ${vendored.files} files (engine ${vendored.stamp.engineVersion}${vendored.stamp.ref ? `, ref ${vendored.stamp.ref.slice(0, 12)}` : ''})`);

// 3. Track it: the two hook-log ignore lines are the WHOLE ignore contract (#385).
const ignorePath = join(target, '.gitignore');
const ignoreText = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
const missing = ['/.claudinite-hooks.log', '/.claudinite-hooks.log.tmp'].filter((l) => !ignoreText.split('\n').includes(l));
if (missing.length) {
  appendFileSync(ignorePath, (ignoreText && !ignoreText.endsWith('\n') ? '\n' : '') + missing.map((l) => `${l}\n`).join(''));
  console.log(`bootstrap: .gitignore ${missing.join(', ')}`);
}

// 4. Converge the DISTRIBUTION wiring — hooks, the rules index and its CLAUDE.md
// import, the mount's git attributes and the repo's own local pack (the one-time seed
// only bootstrap passes). Every member carries this set.
const config = loadConfig(target);
const wiring = await convergeWiring(target, fullName, { seedLocalPack: true });
if (wiring.error) fail(wiring.error);
console.log(wiring.changed.length ? `bootstrap: wiring — ${wiring.changed.join(', ')}` : 'bootstrap: wiring: already converged');

// 4b. …and the SCHEDULING wiring, only for a repo that DECLARED the tasks pack: the two
// workflow files belong to the mechanism that runs them, and a repo running no scheduled
// work carries neither (#1317). The gate is the declaration rather than the module's
// presence in the mount — during the migration the mount carries it either way, so a
// presence test would scaffold a queue onto every repo that never asked for one. The
// module is then reached through the mount rather than imported, so bootstrap names no
// pack it might not have vendored.
const declaresTasks = (loadConfig(target)?.packs ?? [])
  .some((e) => (typeof e === 'string' ? e : e?.id) === 'claudinite-tasks');
const scaffold = join(target, '.claudinite/shared/packs/claudinite-tasks/converge-workflows.mjs');
if (declaresTasks && existsSync(scaffold)) {
  const { convergeWorkflows, stubsDir, declaredSecrets } = await import(pathToFileURL(scaffold).href);
  const stubs = stubsDir(target);
  const stubPath = join(stubs, 'claudinite-scheduler.yml');
  if (!existsSync(stubPath)) fail(`vendored stub not found at ${stubPath}`);
  const executorPath = join(stubs, 'claudinite-executor.yml');
  const { changed } = convergeWorkflows(target, fullName, {
    schedulerStub: readFileSync(stubPath, 'utf8'),
    executorStub: existsSync(executorPath) ? readFileSync(executorPath, 'utf8') : null,
    secretNames: await declaredSecrets(target, config),
    dailyHour: config?.taskScheduler?.dailyHour,
  });
  console.log(changed.length ? `bootstrap: workflows — ${changed.join(', ')}` : 'bootstrap: workflows: already scaffolded');
} else {
  console.log('bootstrap: claudinite-tasks is not declared — this repo runs no scheduled work, so no workflows');
}

// 5. A place both sweeps deterministically run at each change (bootstrap.md's
// test/CI part). Seeded only when NO workflow runs the world sweep — a repo with
// its own CI keeps it, and adds the two steps there instead (reported below).
// One-time seed: the repo owns the file from here.
const CI_WORKFLOW = '.github/workflows/claudinite-ci.yml';
const workflowsDir = join(target, '.github', 'workflows');
const sweepWired = existsSync(workflowsDir) && readdirSync(workflowsDir)
  .some((f) => /\.ya?ml$/.test(f) && readFileSync(join(workflowsDir, f), 'utf8').includes('check_the_world.mjs'));
if (!sweepWired) {
  // The directory may not exist at all: a repo that declares no tasks pack was
  // scaffolded no workflow above, and this is the first file to land there.
  mkdirSync(workflowsDir, { recursive: true });
  writeFileSync(join(target, CI_WORKFLOW), `name: CI
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  claudinite-sweeps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: \${{ github.event.pull_request.head.sha || github.sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Conformance sweep (world scope)
        run: node .claudinite/shared/engine/checks/check_the_world.mjs
      - name: Conformance sweep (work scope)
        run: node .claudinite/shared/engine/checks/ci-work-scope.mjs --branch "\${{ github.head_ref || github.ref_name }}"
`);
  console.log(`bootstrap: seeded ${CI_WORKFLOW}`);
} else if (!existsSync(join(target, CI_WORKFLOW))) {
  console.log('bootstrap: a workflow already runs the world sweep — add the work sweep beside it if missing (bootstrap.md, the CI part)');
}

// 6. Stage what this run wrote, so the sweep below judges tracked content and the
// adoption commit is one `git commit` away. Only the surfaces bootstrap owns —
// never `-A`, which would sweep up whatever else the checkout holds.
try {
  const paths = ['.gitignore', '.gitattributes', '.claudinite-settings.json', '.claudinite', '.claude/settings.json', '.github/workflows', 'CLAUDE.md', 'README.md']
    .filter((p) => existsSync(join(target, p)));
  execFileSync('git', ['add', '--', ...paths], { cwd: target, stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`bootstrap: staged ${paths.join(', ')}`);
} catch { console.log('bootstrap: not a git checkout — staging skipped'); }

// 7. Gate and report. The self-test failing is genuine breakage (exit 1); world
// findings on an existing codebase are the expected backlog (bootstrap.md) and
// are reported, not fatal.
const selftest = runSelfTest(target);
console.log(selftest.ok ? 'selftest: ok' : `selftest: FAILED\n${selftest.output}`);
let sweep = { status: 0, output: '' };
try {
  sweep.output = execFileSync(process.execPath, [join(target, '.claudinite/shared/engine/checks/check_the_world.mjs'), '--root', target],
    { encoding: 'utf8', cwd: target, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) { sweep = { status: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
console.log(sweep.status === 0 ? 'world sweep: green' : `world sweep: findings to clear or accept before landing —\n${sweep.output.trim()}`);

const pending = unansweredQuestions(packs, decl.packs);
if (pending.length) {
  console.log(`\nPENDING ADOPTION QUESTIONS (${pending.length}) — ask them ALL in ONE AskUserQuestion pass (batch up to 4 per call), then re-run this same command with an --answer per reply:`);
  for (const p of pending) {
    console.log(`  ${p.pack}/${p.question}: ${p.prompt}`);
    const distill = byId.get(p.pack)?.questions?.find((q) => q.id === p.question)?.distill;
    if (distill) console.log(`    distill: ${distill}`);
  }
}
// Core's own hand-over, printed in every adoption beside the packs'. It is core's
// because the scheduler and the executor are engine, not a pack — and without it
// the block only ever printed for the few packs that declare one, so the steps a
// human genuinely has to take left the flow as a line in a PR body (#1167).
const CORE_HANDOVER = [{
  pack: 'core',
  step: 'Finish the `Claudinite executor - <repo>` routine in the routines UI (its own prompt carries the SETUP block: model, and this repo as its only source and outcome), mint its API token there, and set it as this repo Actions secret `CCR_ROUTINE_TOKEN` (Settings → Secrets and variables → Actions).',
  breaks: 'every agentful work item converges to needs-human with a hand-off naming the unset secret; agentless tasks keep running',
  done: 'a scheduler run dispatches an agentful item and a session starts for it',
}];
// The repository settings every delivery depends on, which no credential the fleet
// holds can set: both write endpoints need admin on the member and FLEET_GITHUB_TOKEN
// deliberately carries far less, so no sweep can converge them and no member can
// self-heal (#590, docs/future-directions.md). That leaves the hand-over block as the
// only place they reach a person. Gated on the tasks pack, because a repo running no
// scheduled work has no Action-authored pull request for any of the three to affect.
const DELIVERY_SETTINGS_HANDOVER = !declaresTasks ? [] : [{
  pack: 'core',
  step: 'Turn on Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests".',
  breaks: 'every delivery pushes its branch and then 403s opening the pull request, so nothing ever lands and abandoned branches accumulate nightly',
  done: 'a scheduler run reports a PR number rather than the Actions-permission remedy',
}, {
  pack: 'core',
  step: 'Turn on Settings → General → Pull Requests → "Allow auto-merge".',
  breaks: 'the auto-merge arm is rejected every cycle, so each delivery falls back to polling its own checks in-cycle and gives up on any PR whose CI outlasts that wait',
  done: 'a delivered PR shows auto-merge armed instead of a "could not arm auto-merge" line in the run log',
}, {
  pack: 'core',
  step: 'Turn on Settings → General → Pull Requests → "Automatically delete head branches".',
  breaks: 'a PR that GitHub auto-merges is merged outside the code that deletes the branch on the paths it merges itself, so those head branches are never cleaned up',
  done: 'the branch of an auto-merged delivery is gone once the PR merges',
}];
const handover = [...CORE_HANDOVER, ...DELIVERY_SETTINGS_HANDOVER, ...decl.packs.flatMap((e) => (byId.get(packEntryId(e))?.adoptionHandover ?? []).map((s) => ({ pack: packEntryId(e), ...s })))];
if (handover.length) {
  console.log(`\nHANDOVER — ${handover.length} step(s) only a human can do; file them as ONE issue, a checkbox each, never a note in the PR body:`);
  for (const h of handover) {
    console.log(`  [ ] (${h.pack}) ${h.step}`);
    if (h.breaks) console.log(`        while off: ${h.breaks}`);
    if (h.done) console.log(`        done when: ${h.done}`);
  }
}
console.log(`\nNEXT: ${pending.length ? 'interview → re-run → ' : ''}create the executor routine and write its endpoint into taskScheduler (bootstrap.md Part 6 — THIS session's work wherever the trigger tool is present, and before the commit so it lands in one PR), then commit (reference the adoption issue — create it BEFORE committing), push, PR. Once it lands: capture this session — Claudinite was not loaded when it started, so no SessionEnd hook will — with \`node .claudinite/shared/packs/claudinite-growth/capture-log.mjs --issue <adoption-issue>\`, and file the HANDOVER issue.`);
if (!selftest.ok) process.exit(1);
