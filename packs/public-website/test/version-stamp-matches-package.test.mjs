import { ruleTester } from '../../../engine-tests/helpers.mjs';
import versionStampMatchesPackage from '../worldRules/version-stamp-matches-package.mjs';

const base = { 'package.json': '{ "version": "1.0913.4" }\n' };

ruleTester(versionStampMatchesPackage, {
  clean: {
    'a page stamped with the recorded version': {
      files: { ...base, 'site/index.html': '<p class="copyright" title="version 1.0913.4">c</p>\n' },
    },
    'a page carrying no stamp at all': {
      files: { ...base, 'site/about.html': '<p title="about us">c</p>\n' },
    },
    'a repo with no version record has made no claim (FP guard)': {
      files: { 'site/index.html': '<p title="version 0.1">c</p>\n' },
    },
  },
  flagged: {
    'a stamp naming a version that was never served': {
      files: { ...base, 'site/index.html': '<p>x</p>\n<p class="copyright" title="version 1.0801.1">c</p>\n' },
      at: [{ file: 'site/index.html', line: 2, what: /names version 1\.0801\.1, but package\.json says 1\.0913\.4/, fix: /--stamp-only/ }],
    },
    // The pack knows no served directory, so a drifted stamp counts wherever the
    // page sits.
    'a drifted stamp outside any site directory': {
      files: { ...base, 'docs/notes.html': '<p title="version 0.1">c</p>\n' },
      at: [{ file: 'docs/notes.html', line: 1 }],
    },
    'every drifted stamp on the page, not just the first': {
      files: {
        ...base,
        'site/index.html': '<p title="version 1.0801.1">c</p>\n<i title="version 1.0801.2"></i>\n',
      },
      at: [
        { file: 'site/index.html', line: 1 },
        { file: 'site/index.html', line: 2 },
      ],
    },
  },
});
