import referenceIntegrity from './universal/reference-integrity.mjs';
import secretsInJobIf from './github-actions/secrets-in-job-if.mjs';
import runPipefail from './github-actions/run-pipefail.mjs';
import checkoutSubmodules from './github-actions/checkout-submodules.mjs';
import scheduledFailureEscalation from './github-actions/scheduled-failure-escalation.mjs';
import labelCreateBeforeAdd from './github-actions/label-create-before-add.mjs';
import uniqueAutomationBranch from './github-actions/unique-automation-branch.mjs';
import releaseWorkflows from './chrome-extension-release/release-workflows.mjs';
import templateTokens from './chrome-extension-release/template-tokens.mjs';
import versionSync from './chrome-extension-release/version-sync.mjs';
import releaseLayout from './chrome-extension-release/release-layout.mjs';
import permissionJustifications from './chrome-extension-release/permission-justifications.mjs';
import readmeSections from './chrome-extension-release/readme-sections.mjs';
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
  'github-actions': [
    secretsInJobIf,
    runPipefail,
    checkoutSubmodules,
    scheduledFailureEscalation,
    labelCreateBeforeAdd,
    uniqueAutomationBranch,
  ],
  'chrome-extension-release': [
    releaseWorkflows,
    templateTokens,
    versionSync,
    releaseLayout,
    permissionJustifications,
    readmeSections,
  ],
};

export function selectRules(config) {
  const packs = ['universal', ...config.packs.filter((p) => p in PACK_RULES && p !== 'universal')];
  return packs.flatMap((p) => PACK_RULES[p]);
}
