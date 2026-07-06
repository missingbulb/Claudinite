import { finding } from '../../lib/findings.mjs';

// The contract's four thin stubs, each with its exact name: (the failure
// reporter keys tracking issues on them) and the canon reusable workflow it
// must call (technologies/chrome-extension-release.md).
const STUBS = {
  'release.yml': { name: 'Release: Create Package', canon: 'chrome-extension-release.yml' },
  'publish-chrome-store.yml': { name: 'Release: Publish to Chrome Web Store', canon: 'chrome-extension-publish-store.yml' },
  'daily-release.yml': { name: 'Release: Daily Auto-Release', canon: 'chrome-extension-daily-release.yml' },
  'deploy-privacy-page.yml': { name: 'Deploy privacy policy to GitHub Pages', canon: 'deploy-privacy-page.yml' },
};

const rule = {
  id: 'cer/release-workflows',
  severity: 'blocking',
  description: 'The four standard release stubs must exist, carry their exact name:, and call their canon reusable workflow',
  doc: 'technologies/chrome-extension-release.md',
  why: 'every extension repo ships the same pipeline; the logic lives once in the canon, stubs own only triggers and repo values',

  run(ctx) {
    const out = [];
    for (const [file, { name: wanted, canon }] of Object.entries(STUBS)) {
      const path = `.github/workflows/${file}`;
      const text = ctx.read(path);
      if (text === null) {
        out.push(finding(rule, {
          file: path,
          what: `${file} is missing`,
          fix: 'copy the stub from technologies/chrome-extension-release/ and fill in the repo values',
        }));
        continue;
      }
      const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
      if (name !== wanted) {
        out.push(finding(rule, {
          file: path,
          what: `name: is "${name ?? '(none)'}" — the contract requires "${wanted}"`,
          fix: 'set the exact name: — the failure reporter keys tracking issues on it',
        }));
      }
      if (!text.includes(`/.github/workflows/${canon}@`) && !text.includes(`/Claudinite/.github/workflows/${canon}`)) {
        out.push(finding(rule, {
          file: path,
          what: `does not call the canon reusable workflow ${canon}`,
          fix: `the stub owns only triggers and with: values — its job must be uses: missingbulb/Claudinite/.github/workflows/${canon}@main`,
        }));
      }
    }
    return out;
  },
};

export default rule;
