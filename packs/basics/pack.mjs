import referenceIntegrity from './reference-integrity.mjs';
import markdownLinkLabels from './markdown-link-labels.mjs';
import taskLifecycle from './task-lifecycle.mjs';
import warningSuppression from './warning-suppression.mjs';
import filePlacement from './file-placement.mjs';
import packDeclaration from './pack-declaration.mjs';
import squashMergeHistory from './squash-merge-history.mjs';
import claudeMdLength from './claude-md-length.mjs';
import generatedMergeDriver from './generated-merge-driver.mjs';
import sharedConstants from './shared-constants.mjs';

// The baseline pack: working discipline, the task lifecycle, and the core
// checks. Declared explicitly like every other pack — no pack is active by
// default. Bootstrap's --init seeds the declaration and the nightly re-bootstrap
// backfills it into existing consumers; never fingerprinted (the declaration is
// authoritative — dropping it is a deliberate choice).
export default {
  id: 'basics',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  rules: [
    referenceIntegrity,
    markdownLinkLabels,
    taskLifecycle,
    warningSuppression,
    filePlacement,
    packDeclaration,
    squashMergeHistory,
    claudeMdLength,
    generatedMergeDriver,
    sharedConstants,
  ],
};
