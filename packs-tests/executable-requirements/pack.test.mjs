import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { makeRepo, cleanup, git, writeFiles, makeTranscript } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import { runRule as dispatch } from '../../engine/checks/helpers/work.mjs';
import featureRequirementsFirst from './feature-requirements-first.mjs';

const SPEC = 'dev/requirements/requirements.md';

// Commit with a controlled committer date, so ordering vs the transcript's
// feature-comment timestamp is what each fixture says it is.
function commitAt(root, date, files, msg = 'work Refs #1') {
  writeFiles(root, files);
  git(root, 'add', '-A');
  const r = spawnSync('git', ['commit', '-q', '-m', msg], {
    cwd: root, encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test',
      GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
    },
  });
  if (r.status !== 0) throw new Error(`git commit failed: ${r.stderr}`);
}

const owner = (text, timestamp) => ({ type: 'user', timestamp, message: { role: 'user', content: text } });
const reply = (text, timestamp) => ({ type: 'assistant', timestamp, message: { role: 'assistant', content: [{ type: 'text', text }] } });

const FEATURE_AT = '2026-01-01T10:00:00Z';
const featureTurns = [
  owner('please add the widget', FEATURE_AT),
  reply('Comment class: feature — starting the feature run.', '2026-01-01T10:01:00Z'),
];

function runRule(root, entries) {
  if (!entries) return dispatch(featureRequirementsFirst, buildContext({ root, mode: 'changed' }));
  const { path, cleanup: rmTranscript } = makeTranscript(entries);
  try {
    return dispatch(featureRequirementsFirst, buildContext({ root, mode: 'changed', transcriptPath: path }));
  } finally { rmTranscript(); }
}

const specRepo = () => makeRepo({ base: { [SPEC]: '`1.1` seed requirement\n' } });

test('feature-requirements-first: flags code committed with no prior independent spec commit', () => {
  const root = specRepo();
  try {
    commitAt(root, '2026-01-01T10:30:00Z', { 'src/widget.js': 'code\n' });
    const findings = runRule(root, featureTurns);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /requirements\.md/);
  } finally { cleanup(root); }
});

test('feature-requirements-first: passes when an independent spec commit precedes the code', () => {
  const root = specRepo();
  try {
    commitAt(root, '2026-01-01T10:20:00Z', { [SPEC]: '`1.1` seed\n`1.2` widget\n' });
    commitAt(root, '2026-01-01T10:30:00Z', { 'src/widget.js': 'code\n' });
    assert.equal(runRule(root, featureTurns).length, 0);
  } finally { cleanup(root); }
});

test('feature-requirements-first: a mixed spec+code commit is not an independent spec commit', () => {
  const root = specRepo();
  try {
    commitAt(root, '2026-01-01T10:30:00Z', { [SPEC]: '`1.2` widget\n', 'src/widget.js': 'code\n' });
    assert.equal(runRule(root, featureTurns).length, 1);
  } finally { cleanup(root); }
});

test('feature-requirements-first: code committed before the feature comment is out of scope', () => {
  const root = specRepo();
  try {
    commitAt(root, '2026-01-01T09:00:00Z', { 'src/earlier.js': 'old task\n' });
    commitAt(root, '2026-01-01T10:20:00Z', { [SPEC]: '`1.2` widget\n' });
    commitAt(root, '2026-01-01T10:30:00Z', { 'src/widget.js': 'code\n' });
    assert.equal(runRule(root, featureTurns).length, 0);
  } finally { cleanup(root); }
});

test('feature-requirements-first: silent when the comment was not classified as a feature', () => {
  const root = specRepo();
  try {
    commitAt(root, '2026-01-01T10:30:00Z', { 'src/widget.js': 'code\n' });
    const findings = runRule(root, [
      owner('tighten the process', FEATURE_AT),
      reply('Comment class: process-change — writing the assurance first.', '2026-01-01T10:01:00Z'),
    ]);
    assert.equal(findings.length, 0);
  } finally { cleanup(root); }
});

test('feature-requirements-first: silent without a transcript (CI surface)', () => {
  const root = specRepo();
  try {
    commitAt(root, '2026-01-01T10:30:00Z', { 'src/widget.js': 'code\n' });
    assert.equal(runRule(root, null).length, 0);
  } finally { cleanup(root); }
});

// A check-the-work rule must be satisfiable by doing the work right. When the spec
// it would enforce ordering against isn't in the repo at all — a project whose spec
// lives elsewhere without declaring the path, or the pack pulled in via `requires`
// without the canonical file — no commit could satisfy it, so firing forces the
// wrong remedy (an `accept`, a check-the-WORLD instrument, or a post-hoc rebase).
// It must self-skip instead of emitting an unsatisfiable finding.
test('feature-requirements-first: self-skips when the spec file is absent from the repo', () => {
  const root = makeRepo({ base: {} }); // no dev/requirements/requirements.md
  try {
    commitAt(root, '2026-01-01T10:30:00Z', { 'src/widget.js': 'code\n' });
    assert.equal(runRule(root, featureTurns).length, 0);
  } finally { cleanup(root); }
});

// A project whose executable spec lives at a non-canonical path declares it on the
// executable-requirements pack entry (config.spec). The check enforces ordering
// against the REAL spec, so a doc-first commit at that path passes.
const CUSTOM_SPEC = 'dev/docs/REQUIREMENTS.md';
const specConfig = (specPath) =>
  JSON.stringify({ packs: [{ id: 'executable-requirements', config: { spec: specPath } }] });

test('feature-requirements-first: honors a configured non-canonical spec path (passes doc-first)', () => {
  const root = makeRepo({ base: { [CUSTOM_SPEC]: '`1.1` seed\n', '.claudinite-checks.json': specConfig(CUSTOM_SPEC) } });
  try {
    commitAt(root, '2026-01-01T10:20:00Z', { [CUSTOM_SPEC]: '`1.1` seed\n`1.2` widget\n' });
    commitAt(root, '2026-01-01T10:30:00Z', { 'src/widget.js': 'code\n' });
    assert.equal(runRule(root, featureTurns).length, 0);
  } finally { cleanup(root); }
});

test('feature-requirements-first: with a configured spec path, code before it still fires', () => {
  const root = makeRepo({ base: { [CUSTOM_SPEC]: '`1.1` seed\n', '.claudinite-checks.json': specConfig(CUSTOM_SPEC) } });
  try {
    commitAt(root, '2026-01-01T10:30:00Z', { 'src/widget.js': 'code\n' });
    const findings = runRule(root, featureTurns);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /dev\/docs\/REQUIREMENTS\.md/);
  } finally { cleanup(root); }
});
