import { workflowFiles } from '../../checks/lib/workflows.mjs';
import releaseWorkflows, { CANON_WORKFLOWS, STUB_NAME } from './release-workflows.mjs';
import templateTokens from './template-tokens.mjs';
import releaseConfig from './release-config.mjs';
import versionSync from './version-sync.mjs';
import releaseLayout from './release-layout.mjs';
import privacyPermissionAlignment from './privacy-permission-alignment.mjs';
import permissionAddedStoreIssue from './permission-added-store-issue.mjs';
import readmeSections from './readme-sections.mjs';

// A repo "ships the release pipeline" once it carries the consumer stub — a
// workflow named "Release" that calls the canon create-package reusable workflow
// — the fingerprint DESIGN.md pins the conformance suite to. A manifest alone
// never trips this, so coding an extension doesn't drag in the release checks;
// opting in — declaring the pack, then scaffolding the single release.yml stub,
// PRIVACY.md and the first-publication issue — does. Both halves matter: the
// name "Release" is the consumer marker (Claudinite's OWN canon workflows also
// reference chrome-extension-release.yml — they call each other — but are named
// "Chrome extension: … (reusable)", so the name check keeps the canon repo from
// self-matching). (The pre-consolidation fingerprint keyed on the three
// "Release: *" stub names, now per-operation constants inside the canon.)
const CREATE_PACKAGE_CANON = CANON_WORKFLOWS[0]; // chrome-extension-release.yml

function shipsReleasePipeline(ctx) {
  return workflowFiles(ctx).some((wf) => {
    const text = ctx.read(wf);
    if (text === null) return false;
    const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
    if (name !== STUB_NAME) return false;
    return text.includes(`/.github/workflows/${CREATE_PACKAGE_CANON}@`) ||
      text.includes(`/Claudinite/.github/workflows/${CREATE_PACKAGE_CANON}`);
  });
}

export default {
  id: 'chrome-extension-release',
  always: false,
  marker: 'the single "Release" Chrome Web Store workflow stub (calls the canon reusable workflows)',
  detect: shipsReleasePipeline,
  // RELEASE.md is the on-demand reference (linked from the coding pack's RULES
  // and from findings), not always-on prose: it is long, and only the checks
  // need to be eager.
  prose: null,
  rules: [
    releaseWorkflows,
    templateTokens,
    releaseConfig,
    versionSync,
    releaseLayout,
    privacyPermissionAlignment,
    permissionAddedStoreIssue,
    readmeSections,
  ],
};
