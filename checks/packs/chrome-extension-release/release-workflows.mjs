import { finding } from '../../lib/findings.mjs';

// The contract's five workflows with these exact name: values — the failure
// reporter keys tracking issues on them (technologies/chrome-extension-release.md).
const REQUIRED = {
  'release.yml': 'Release: Create Package',
  'publish-chrome-store.yml': 'Release: Publish to Chrome Web Store',
  'daily-release.yml': 'Release: Daily Auto-Release',
  'deploy-privacy-page.yml': 'Deploy privacy policy to GitHub Pages',
  'report-failure.yml': 'Report workflow failure',
};

const rule = {
  id: 'cer/release-workflows',
  severity: 'blocking',
  description: 'The five standard release workflows must exist with their exact name: values',
  doc: 'technologies/chrome-extension-release.md',
  why: 'every extension repo ships the same pipeline; the exact names key the failure tracker',

  run(ctx) {
    const out = [];
    for (const [file, wanted] of Object.entries(REQUIRED)) {
      const path = `.github/workflows/${file}`;
      const text = ctx.read(path);
      if (text === null) {
        out.push(finding(rule, {
          file: path,
          what: `${file} is missing`,
          fix: `copy it from the canonical templates in technologies/chrome-extension-release/ and replace its __TOKENS__`,
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
    }
    return out;
  },
};

export default rule;
