import secretsInJobIf from './secrets-in-job-if.mjs';
import runPipefail from './run-pipefail.mjs';
import checkoutSubmodules from './checkout-submodules.mjs';
import scheduledFailureEscalation from './scheduled-failure-escalation.mjs';
import labelCreateBeforeAdd from './label-create-before-add.mjs';
import uniqueAutomationBranch from './unique-automation-branch.mjs';
import pagesArtifactSymlinks from './pages-artifact-symlinks.mjs';
import noScheduledFleetExecutor from './no-scheduled-fleet-executor.mjs';

export default {
  id: 'github-actions',
  badge: {
    file: 'badge.svg',
    color: '#2563eb',
    glyph: 'M24 16a8 8 0 1 1-2.3-5.6 M22 7v4h-4 M14.2 13.2l5.2 2.8-5.2 2.8z',
  },
  marker: '.github/workflows/*.ya?ml',
  detect: (ctx) => ctx.tracked.some((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f)),
  prose: null,
  rules: [
    secretsInJobIf,
    runPipefail,
    checkoutSubmodules,
    scheduledFailureEscalation,
    labelCreateBeforeAdd,
    uniqueAutomationBranch,
    pagesArtifactSymlinks,
    noScheduledFleetExecutor,
  ],
};
