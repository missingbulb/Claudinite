// The baselining REHEARSAL runner (#593 phase 2): build a fixture consumer in a
// temp dir, run the REAL converge against this canon checkout, and report what a
// member would be left with.
//
// "The real converge" is load-bearing. It invokes the same three scripts the
// nightly worker invokes, as subprocesses, in the same order:
//
//   vendoring/apply-vendor-set.mjs   the mount + stamp
//   engine/scheduler/converge-wiring.mjs   workflow, hooks, badge row
//   engine/migrations/apply.mjs      the mechanical notes
//   vendoring/apply-vendor-set.mjs   again, when a note changed the DECLARATION (a
//                                    seeded pack's content is not in the first pass's
//                                    set — the worker does the same, conditionally)
//
// then asks the two questions that matter, in the order that matters:
//
//   engine/selftest.mjs      can Claudinite still RUN here?
//   check_the_world.mjs      and is the result conformant?
//
// Self-test first, because it is the one that catches a machinery break — and a
// broken machine reports no findings precisely because it is not running, so a
// content check consulted first would answer "green" and mean nothing.
//
// A rehearsal never touches the canon and never touches a real repo: everything
// happens under a temp dir that is removed afterwards.

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { removeTree } from '../../engine/remove-tree.mjs';
import { settingsPath, isSettingsFile } from '../../engine/settings-file.mjs';
import { installedVersions, withInstalledVersions } from '../../engine/installed-versions.mjs';

// The fixture's declaration with this mode's installed versions written in: the
// engine version at the top, and every declared pack pinned at the same number so
// each pack's own records select too. `installed: null` writes nothing, which is the
// shape a repo that has never been vendored actually has.
function withMode(content, mode) {
  const raw = JSON.parse(content);
  if (!mode.installed) return content;
  const packVersions = {};
  for (const entry of raw.packs ?? []) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (typeof id === 'string') packVersions[id] = mode.installed.packVersion;
  }
  return `${JSON.stringify(withInstalledVersions(raw, { engineVersion: mode.installed.engineVersion, packVersions }), null, 2)}\n`;
}

export const CANON = dirname(dirname(dirname(fileURLToPath(import.meta.url)))); // vendoring/rehearsal -> canon

// Every step is captured, never thrown: a rehearsal that dies on step two must
// still report which step and why, because "it failed" is not actionable and
// "apply-vendor-set exited 1 saying X" is.
function step(name, argv, env = {}, cwd = undefined) {
  try {
    const stdout = execFileSync(process.execPath, argv, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, cwd,
    });
    return { name, ok: true, stdout };
  } catch (e) {
    return { name, ok: false, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message };
  }
}

export function buildFixture(fixture, mode) {
  const root = mkdtempSync(join(tmpdir(), `claudinite-rehearsal-${fixture.name}-`));
  for (const [rel, content] of Object.entries(fixture.files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    // The declaration carries the mode's INSTALLED VERSIONS — that is what selects
    // migration records. Written structurally rather than by text substitution: the
    // pack versions land one per entry, so there is no single literal to replace,
    // and a fixture's declaration is generated data rather than a file anyone reads.
    writeFileSync(abs, isSettingsFile(rel) ? withMode(content, mode) : content);
  }
  // A real repo, because the sweep scopes its file set with git and an
  // uninitialised directory makes it fall back to whatever cwd it can find.
  //
  // `--no-gpg-sign` and the inline identity are not tidiness: a fixture must not
  // depend on the HOST's git configuration. A machine with commit signing wired
  // up fails these commits for reasons that have nothing to do with the canon
  // change under test, and the rehearsal then reports a fleet-breaking result
  // because a signing helper was unavailable.
  const git = (...a) => execFileSync('git', [
    '-c', 'user.email=rehearsal@example.invalid', '-c', 'user.name=rehearsal',
    '-c', 'commit.gpgsign=false', '-c', 'gpg.format=openpgp', ...a,
  ], { cwd: root, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '--no-gpg-sign', '-m', 'fixture');
  git('add', '-A');
  git('commit', '-q', '--no-gpg-sign', '-m', 'fixture content');
  return root;
}

export function rehearse(fixture, mode) {
  const root = buildFixture(fixture, mode);
  const steps = [];
  try {
    // apply-vendor-set reads the CANON checkout (its own root), so it alone runs
    // with the canon as cwd. Everything after it judges the FIXTURE, and must run
    // with the fixture as cwd — a sweep inheriting the canon's cwd resolves git
    // against the canon and cheerfully reports on the wrong repo.
    steps.push(step('apply-vendor-set', [join(CANON, 'vendoring/apply-vendor-set.mjs'), '--target', root]));
    if (steps.at(-1).ok) {
      const declarationBefore = readFileSync(settingsPath(root), 'utf8');
      steps.push(step('migrations-apply', [join(CANON, 'engine/migrations/apply.mjs')], { CLAUDE_PROJECT_DIR: root }, root));
      // The worker's conditional second pass, mirrored: a note that DECLARED a pack
      // left its content out of the set the first pass computed, and the fixture must
      // meet the same converge a member does — otherwise the rehearsal green-lights a
      // seed that would red every member for a night.
      if (readFileSync(settingsPath(root), 'utf8') !== declarationBefore) {
        steps.push(step('re-converge', [join(CANON, 'vendoring/apply-vendor-set.mjs'), '--target', root]));
      }
      // AFTER the migrations, which is the order the real flow runs in
      // (updates/engine-update.mjs: replace the engine, apply the records, THEN
      // converge the wiring). Anything the wiring converge derives from the
      // declaration — the rules index above all — is wrong if a record moved the
      // declaration after it ran, and the rehearsal is where that shows up.
      steps.push(step('converge-wiring', [join(CANON, 'engine/scheduler/converge-wiring.mjs'), 'fixture/rehearsal'],
        { CLAUDINITE_REPO_ROOT: root }, root));
      steps.push(step('selftest', [join(CANON, 'engine/selftest.mjs'), '--strict'], { CLAUDE_PROJECT_DIR: root }, root));
      const sweep = join(root, '.claudinite/shared/engine/checks/check_the_world.mjs');
      // The member runs its own VENDORED sweep, not the canon's — that is the
      // copy it will actually live with, and a converge that failed to vendor it
      // must read as a failure here rather than be silently covered for.
      steps.push(existsSync(sweep)
        ? step('check-the-world', [sweep], { CLAUDE_PROJECT_DIR: root }, root)
        : { name: 'check-the-world', ok: false, stdout: 'the converge vendored no check_the_world.mjs' });
    }
    const stamp = existsSync(settingsPath(root))
      ? installedVersions(JSON.parse(readFileSync(settingsPath(root), 'utf8')))
      : null;
    const failed = steps.filter((s) => !s.ok);
    return { fixture: fixture.name, mode: mode.name, ok: failed.length === 0, steps, failed, stamp };
  } finally {
    removeTree(root);
  }
}

// A one-line verdict per (fixture, mode), and the failing step's output beneath
// it — the shape a CI log should have when a canon PR breaks the fleet.
export function formatResult(r) {
  const head = `${r.ok ? 'PASS' : 'FAIL'}  ${r.fixture} [${r.mode}]`;
  if (r.ok) return head;
  return [head, ...r.failed.map((f) => `  ${f.name}:\n${f.stdout.split('\n').map((l) => `    ${l}`).join('\n')}`)].join('\n');
}
