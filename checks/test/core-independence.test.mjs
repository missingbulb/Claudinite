import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Core ⟂ pack/skill independence — a CANON SELF-TEST (issue #269).
//
// The engine must not know about the CONTENT it runs. `extending.md` states the
// principle ("Core is the engine that runs pack-contributed content … discovered
// structurally"): the mechanism is fixed, the content is open. A core file that
// names a specific pack or skill — by path, by identifier, in a string, or in a
// comment — has reached across that boundary, and prose can't hold the line (the
// canon already contradicts itself about whether the fleet census is core or the
// sheepdog pack's; that drift is exactly what let the planner become hostage to
// one pack's workflow being deployed — the coupling this guard exists to forbid).
//
// This is a TEST, not an instruction: it scans every core file and fails on any
// specific-pack/skill reference that isn't in the reviewed accept-map below.
//
// What it does NOT scan (a closed, documented set — naming content here is the
// file's whole point, not a coupling):
//   • pack/skill CONTENT itself (packs/<n>/**, skills/<n>/**)
//   • the catalogs whose purpose is to enumerate (CLAUDE.md, packs/README.md,
//     skills/README.md — the last one's completeness is itself a check)
//   • *.test.mjs — a test must reference what it tests (this file included)
//   • the canon's own declaration (.claudinite-checks.json) and personal prefs
//   • the historical one-time conversion ledger (checks/conversion-inventory.md)
//
// The ACCEPT map is the current coupling surface, each entry tagged with WHY and
// what removes it. Shrinking it to {} is the definition of "core is independent."
// Adding a NEW reference fails the build — so no fresh coupling slips in while the
// existing debt is paid down.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' });
const tracked = () => git('ls-files').trim().split('\n').filter(Boolean);

// Structural enumeration — never a hand-maintained list.
const dirNames = (dir, marker) => [
  ...new Set(
    tracked()
      .map((p) => p.match(new RegExp(`^${dir}/([^/]+)/${marker}$`)))
      .filter(Boolean)
      .map((m) => m[1]),
  ),
];
const PACKS = dirNames('packs', 'pack\\.mjs');
const SKILLS = dirNames('skills', 'SKILL\\.md');

// Names that are also ordinary English/JS words: matched ONLY as an explicit
// `packs/<name>` / `skills/<name>` path, never bare, so the guard doesn't fire on
// prose ("the basics", a `node` import, an `html` tag).
const AMBIGUOUS = new Set(['node', 'html', 'ios', 'android', 'basics', 'firebase', 'flutter']);
const distinctive = (n) => (n.includes('-') || n.includes('_') || n === 'sheepdog') && !AMBIGUOUS.has(n);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every specific pack/skill a core file's text refers to, as "pack:<n>"/"skill:<n>".
function referencedContent(text) {
  const found = new Set();
  for (const [kind, dir, names] of [['pack', 'packs', PACKS], ['skill', 'skills', SKILLS]]) {
    for (const n of names) {
      const asPath = new RegExp(`\\b${dir}/${esc(n)}\\b`);
      let hit = asPath.test(text);
      if (!hit && distinctive(n)) hit = new RegExp(`(^|[^\\w./-])${esc(n)}([^\\w./-]|$)`).test(text);
      if (hit) found.add(`${kind}:${n}`);
    }
  }
  return found;
}

const isContent = (f) => /^(packs|skills)\/[^/]+\//.test(f);
const CATALOGS = new Set(['CLAUDE.md', 'packs/README.md', 'skills/README.md']);
const SELF = new Set(['.claudinite-checks.json', 'checks/conversion-inventory.md']);
const isExempt = (f) =>
  CATALOGS.has(f) || SELF.has(f) || f.endsWith('.test.mjs') || f.startsWith('preferences/');

// ── Reason tags (the decoupling worklist). ───────────────────────────────────
const CENSUS_OK =
  'OK(census-as-separate-concern): the reference correctly describes an enforcer pack\'s fleet-coverage census (or its migration-retirement telemetry) as a SEPARATE, isolated concern — not the planner. The planner↔census coupling is removed (the planner is core & pack-agnostic in routines/fleet/plan.mjs); naming the census as the enforcer pack\'s own arm is a legitimate cross-reference, not a coupling.';
const SEEDING =
  'DECOUPLE(seeding): the default-seeded pack names are hardcoded in the engine. A pack should declare its own seed policy (e.g. detect:null + a seededByDefault flag) so bootstrap/run.mjs discover it structurally.';
const RELEASE =
  'DECOUPLE(release-infra): chrome-extension-release reusable release infra is hosted in the core .github/ tree. Decide whether this infra belongs behind the pack that owns it.';
const DOC_CITES =
  'DISCUSS(doc cites content): an engine/design doc names packs/skills as illustrative examples. Owner to decide whether such docs may cite content by name or must speak generically (this is the "skills — discuss later" set).';
const SEED_MIGRATION =
  'INHERENT: a one-time seed migration necessarily names the single pack it seeds; it self-retires once the fleet converges.';

// ── The current coupling surface. Each entry: { why, names:[...] }. ───────────
const ACCEPT = {
  // The planner↔census coupling is FIXED — the planner (routines/fleet/plan.mjs) is now
  // core & pack-agnostic, so auto-all-repos-maintenance.md no longer names sheepdog at all.
  // The files below still name the enforcer pack's census, but CORRECTLY — as a separate,
  // isolated concern — plus incidental example-cites, left per "fix the planner, leave the rest".
  'routines/auto-all-repos-maintenance.md': { why: DOC_CITES, names: ['pack:tidy-repo', 'pack:basics'] },
  'routines/fleet/DESIGN.md': {
    why: CENSUS_OK,
    names: [
      'pack:sheepdog', 'pack:tidy-repo', 'pack:basics', 'pack:research-project',
      'pack:chrome-extension', 'pack:chrome-extension-release', 'pack:github-actions',
      'skill:single-branch-status', 'skill:single-issue-triage', 'skill:single-pr-status', 'skill:unattended-agents',
    ],
  },
  'routines/fleet/scheduling.md': { why: CENSUS_OK, names: ['pack:sheepdog', 'pack:github-actions', 'skill:unattended-agents'] },
  'migrations/README.md': { why: CENSUS_OK, names: ['pack:sheepdog'] },
  'README.md': { why: CENSUS_OK, names: ['pack:sheepdog', 'pack:tidy-repo', 'pack:grow_with_claudinite', 'pack:basics'] },
  'extending.md': {
    why: DOC_CITES,
    names: ['pack:sheepdog', 'pack:tidy-repo', 'pack:grow_with_claudinite', 'pack:research-project', 'pack:spec-driven-product', 'skill:repo-text-sweeps'],
  },

  // Hardcoded default-seed pack list in the engine.
  'checks/run.mjs': { why: SEEDING, names: ['pack:grow_with_claudinite', 'pack:tidy-repo'] },
  'bootstrap.md': {
    why: SEEDING,
    names: [
      'pack:basics', 'pack:grow_with_claudinite', 'pack:tidy-repo',
      'pack:chrome-extension', 'pack:chrome-extension-release', 'pack:executable-requirements',
      'pack:research-project', 'pack:spec-driven-product',
      'skill:generate-project-instructions', 'skill:merge-to-main',
    ],
  },

  // chrome-extension-release reusable infra living in core .github/.
  '.github/workflows/README.md': { why: RELEASE, names: ['pack:chrome-extension', 'pack:chrome-extension-release'] },
  '.github/workflows/chrome-extension-daily-release.yml': { why: RELEASE, names: ['pack:chrome-extension', 'pack:chrome-extension-release', 'pack:github-actions'] },
  '.github/workflows/chrome-extension-publish-store.yml': { why: RELEASE, names: ['pack:chrome-extension', 'pack:chrome-extension-release'] },
  '.github/workflows/chrome-extension-release.yml': { why: RELEASE, names: ['pack:chrome-extension', 'pack:chrome-extension-release'] },
  '.github/actions/read-release-config/read-config.mjs': { why: RELEASE, names: ['pack:chrome-extension-release'] },

  // One-time seed migrations that name the pack they seed.
  'migrations/2026-07-12-grow-with-claudinite-seed.mjs': { why: SEED_MIGRATION, names: ['pack:grow_with_claudinite'] },
  'migrations/2026-07-12-tidy-repo-seed.mjs': { why: SEED_MIGRATION, names: ['pack:tidy-repo'] },

  // Engine/design docs citing packs/skills as examples — the "discuss later" set.
  'checks/DESIGN.md': {
    why: DOC_CITES,
    names: [
      'pack:basics', 'pack:chrome-extension-release', 'pack:github-actions',
      'skill:bug-investigation', 'skill:engineering-practices', 'skill:file-placement',
      'skill:lessons-learned', 'skill:merge-to-main', 'skill:unattended-agents',
    ],
  },
  'checks/README.md': { why: DOC_CITES, names: ['pack:basics', 'pack:github-actions', 'skill:file-placement'] },
  'consumer-safe-changes.md': { why: DOC_CITES, names: ['skill:repo-text-sweeps'] },
  'growth/README.md': { why: DOC_CITES, names: ['skill:lessons-learned', 'skill:merge-to-main', 'skill:prose-to-checks'] },
  'growth/dedup.md': { why: DOC_CITES, names: ['skill:git-github-advanced'] },
  'growth/discover-packs.md': { why: DOC_CITES, names: ['skill:generate-project-instructions', 'skill:git-github-advanced', 'skill:unattended-agents'] },
  'growth/extract.md': { why: DOC_CITES, names: ['skill:lessons-learned'] },
  'growth/item-routing.md': { why: DOC_CITES, names: ['skill:generate-project-instructions'] },
  'growth/promote.md': { why: DOC_CITES, names: ['pack:app-store-release', 'skill:generate-project-instructions', 'skill:git-github-advanced', 'skill:unattended-agents'] },
  '.github/actions/report-failure/action.yml': { why: DOC_CITES, names: ['skill:git-github-advanced'] },
};

test('canon enumeration is non-empty (guards a broken glob)', () => {
  assert.ok(PACKS.includes('sheepdog') && PACKS.includes('basics'), `packs discovered: ${PACKS.length}`);
  assert.ok(SKILLS.includes('merge-to-main') && SKILLS.length > 5, `skills discovered: ${SKILLS.length}`);
});

test('every ACCEPT entry is still live (prune paid-down debt)', () => {
  const stale = [];
  for (const [f, { names }] of Object.entries(ACCEPT)) {
    if (isExempt(f) || isContent(f)) { stale.push(`${f}: now exempt/content — remove from ACCEPT`); continue; }
    if (!existsSync(resolve(ROOT, f))) { stale.push(`${f}: file gone — remove from ACCEPT`); continue; }
    const refs = referencedContent(readFileSync(resolve(ROOT, f), 'utf8'));
    for (const n of names) if (!refs.has(n)) stale.push(`${f}: "${n}" no longer referenced — prune it from ACCEPT`);
  }
  assert.deepEqual(stale, [], `\nStale accept-map entries (the coupling was removed — delete the entry too):\n  ${stale.join('\n  ')}\n`);
});

test('no core file references a specific pack or skill outside the reviewed accept-map', () => {
  const violations = [];
  for (const f of tracked()) {
    if (isContent(f) || isExempt(f)) continue;
    const abs = resolve(ROOT, f);
    if (!existsSync(abs)) continue;
    const refs = referencedContent(readFileSync(abs, 'utf8'));
    if (!refs.size) continue;
    const allowed = new Set(ACCEPT[f]?.names ?? []);
    const unexpected = [...refs].filter((r) => !allowed.has(r)).sort();
    if (unexpected.length) violations.push(`${f}\n      references ${unexpected.join(', ')}`);
  }
  assert.deepEqual(
    violations,
    [],
    [
      '',
      'Core must be independent of the pack/skill CONTENT it runs (extending.md).',
      'A core file below names a specific pack/skill by path, identifier, or comment —',
      'that reaches across the engine/content boundary.',
      '',
      'Fix by removing the reference: contribute the behaviour through the owning pack',
      "(its run_daily/rules/skills), discover it structurally, or — if the reference is",
      'genuinely unavoidable and reviewed — add it to the ACCEPT map in this file with a',
      'reason. New couplings are not accepted silently.',
      '',
      ...violations.map((v) => `  • ${v}`),
      '',
    ].join('\n'),
  );
});
