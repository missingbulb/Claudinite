import referenceIntegrity from './universal/reference-integrity.mjs';
import markdownLinkLabels from './universal/markdown-link-labels.mjs';
import taskLifecycle from './universal/task-lifecycle.mjs';
import warningSuppression from './universal/warning-suppression.mjs';
import filePlacement from './universal/file-placement.mjs';
import packDeclaration from './universal/pack-declaration.mjs';
import squashMergeHistory from './universal/squash-merge-history.mjs';

// universal always runs; technology packs join here as their rules land (Phase 2)
// and become selectable via the declaration in .claudinite-checks.json.
export const PACK_RULES = {
  universal: [
    referenceIntegrity,
    markdownLinkLabels,
    taskLifecycle,
    warningSuppression,
    filePlacement,
    packDeclaration,
    squashMergeHistory,
  ],
};

export function selectRules(config) {
  const packs = ['universal', ...config.packs.filter((p) => p in PACK_RULES && p !== 'universal')];
  return packs.flatMap((p) => PACK_RULES[p]);
}
