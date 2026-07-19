import commentClassification from './comment-classification.mjs';
import referenceIntegrity from './reference-integrity.mjs';
import markdownLinkLabels from './markdown-link-labels.mjs';
import taskLifecycle from './task-lifecycle.mjs';
import warningSuppression from './warning-suppression.mjs';
import filePlacement from './file-placement.mjs';
import squashMergeHistory from './squash-merge-history.mjs';
import claudeMdLength from './claude-md-length.mjs';
import generatedMergeDriver from './generated-merge-driver.mjs';
import sharedConstants from './shared-constants.mjs';
import skillOwnership from './skill-ownership.mjs';
import catalogCompleteness from './catalog-completeness.mjs';
import claudiniteIsolation from './claudinite-isolation.mjs';
import packIndependence from './pack-independence.mjs';
import baselining from './run_daily/baselining.mjs';

// The baseline pack: working discipline, the task lifecycle, and the core
// checks. Declared explicitly like every other pack — no pack is active by
// default. Bootstrap's --init seeds the declaration and the nightly baselining
// backfills it into existing consumers; never fingerprinted (the declaration is
// authoritative — dropping it is a deliberate choice).
export default {
  id: 'basics',
  detect: null,
  marker: null,
  seededByDefault: true,
  prose: 'RULES.md',
  rules: [
    commentClassification,
    referenceIntegrity,
    markdownLinkLabels,
    taskLifecycle,
    warningSuppression,
    filePlacement,
    squashMergeHistory,
    claudeMdLength,
    generatedMergeDriver,
    sharedConstants,
    skillOwnership,
    catalogCompleteness,
    claudiniteIsolation,
    packIndependence,
  ],
  // The skills every project's work can call for, whatever its technology —
  // mounted wherever basics is declared (which --init seeds everywhere) by
  // skills/mount-skills.mjs. When one of these stops being a baseline
  // activity, move it to the pack whose projects need it; the skill-ownership
  // check keeps the whole catalog required by some pack.
  skills: [
    'adopt-claudinite',
    'authoring-agent-docs',
    'bug-investigation',
    'bump-version',
    'engineering-practices',
    'file-placement',
    'generate-project-instructions',
    'git-github-advanced',
    'merge-to-main',
    'repo-text-sweeps',
    'unattended-agents',
    'writing-tests',
  ],
  // The baseline daily task every member runs: baselining (re-run the idempotent
  // bootstrap + check-alignment). Being in basics — declared everywhere — makes it
  // fleet-universal without a fleet-core category.
  run_daily: [baselining],
};
