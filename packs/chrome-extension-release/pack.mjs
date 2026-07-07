import { workflowFiles } from '../../checks/lib/workflows.mjs';
import releaseWorkflows, { STUBS } from './release-workflows.mjs';
import templateTokens from './template-tokens.mjs';
import versionSync from './version-sync.mjs';
import releaseLayout from './release-layout.mjs';
import privacyPermissionAlignment from './privacy-permission-alignment.mjs';
import permissionAddedStoreIssue from './permission-added-store-issue.mjs';
import readmeSections from './readme-sections.mjs';

// A repo "ships the release pipeline" once its workflows carry the standard's
// "Release: *" stub names — the fingerprint DESIGN.md pins the conformance suite
// to. A manifest alone never trips this, so coding an extension doesn't drag in
// the release checks; opting in — declaring the pack, then scaffolding the
// stubs, PRIVACY.md and the first-publication issue — does. The generic "Deploy
// privacy policy…" name is excluded on purpose: it is platform-agnostic and
// reused by other publish standards.
const RELEASE_NAMES = new Set(
  Object.values(STUBS).map((s) => s.name).filter((n) => n.startsWith('Release: '))
);

function shipsReleasePipeline(ctx) {
  return workflowFiles(ctx).some((wf) => {
    const text = ctx.read(wf);
    if (text === null) return false;
    const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
    return name != null && RELEASE_NAMES.has(name);
  });
}

export default {
  id: 'chrome-extension-release',
  always: false,
  marker: 'the standard "Release: *" Chrome Web Store workflow stubs',
  detect: shipsReleasePipeline,
  // RELEASE.md is the on-demand reference (linked from the coding pack's RULES
  // and from findings), not always-on prose: it is long, and only the checks
  // need to be eager.
  prose: null,
  rules: [
    releaseWorkflows,
    templateTokens,
    versionSync,
    releaseLayout,
    privacyPermissionAlignment,
    permissionAddedStoreIssue,
    readmeSections,
  ],
};
