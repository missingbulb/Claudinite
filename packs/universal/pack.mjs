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
import routineStructure from './routine-structure.mjs';

// The always-on pack: its prose is the baseline every session loads, its checks
// run for every project. Never declared (always active), never fingerprinted.
export default {
  id: 'universal',
  always: true,
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
    routineStructure,
  ],
};
