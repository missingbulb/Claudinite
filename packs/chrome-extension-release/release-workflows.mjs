import { finding } from '../../checks/lib/findings.mjs';

// The contract's ONE thin stub. It carries the exact name `Release` and calls
// all three canon reusable workflows (create-package, publish, daily) from its
// three if:-guarded jobs. The logic — and the per-operation failure-reporter
// issue keys ("Release: Create Package", …) — live in those canon workflows, so
// collapsing the caller to one file loses no triage. Exported so the pack's
// detect fingerprint can recognize a repo that already ships the pipeline.
// The privacy page has no stub of its own: it redeploys as part of every publish
// (via the publish workflow's deploy-privacy-page leg).
export const STUB_FILE = 'chrome-extension-release.yml';
export const STUB_NAME = 'Release';
export const CANON_WORKFLOWS = [
  'chrome-extension-release.yml',
  'chrome-extension-publish-store.yml',
  'chrome-extension-daily-release.yml',
];

const rule = {
  id: 'cer/release-workflows',
  severity: 'blocking',
  description: 'The single release.yml stub must exist, be named "Release", and call all three canon reusable workflows',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'every extension repo ships the same pipeline from one thin stub; the logic lives once in the canon, the stub owns only triggers',

  run(ctx) {
    const path = `.github/workflows/${STUB_FILE}`;
    const text = ctx.read(path);
    if (text === null) {
      return [finding(rule, {
        file: path,
        what: `${STUB_FILE} is missing`,
        fix: 'copy the single stub from the chrome-extension-release pack stubs/release.yml (nothing to substitute)',
      })];
    }

    const out = [];
    const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
    if (name !== STUB_NAME) {
      out.push(finding(rule, {
        file: path,
        what: `name: is "${name ?? '(none)'}" — the contract requires "${STUB_NAME}"`,
        fix: `set "name: ${STUB_NAME}"`,
      }));
    }

    for (const canon of CANON_WORKFLOWS) {
      if (!text.includes(`/.github/workflows/${canon}@`) && !text.includes(`/Claudinite/.github/workflows/${canon}`)) {
        out.push(finding(rule, {
          file: path,
          what: `does not call the canon reusable workflow ${canon}`,
          fix: `add the job that runs it: uses: missingbulb/Claudinite/.github/workflows/${canon}@main`,
        }));
      }
    }
    return out;
  },
};

export default rule;
