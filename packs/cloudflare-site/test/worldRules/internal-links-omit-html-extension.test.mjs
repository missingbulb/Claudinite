import { ruleTester } from '../../../../engine-tests/helpers.mjs';
import internalLinksOmitHtmlExtension from '../../worldRules/internal-links-omit-html-extension.mjs';

const config = (assets) => `${JSON.stringify({ compatibility_date: '2026-09-08', assets }, null, 2)}\n`;
const site = config({ directory: './site' });
const page = (body) => `<!doctype html>\n${body}\n`;

ruleTester(internalLinksOmitHtmlExtension, {
  clean: {
    'a repo with no wrangler config at all': {
      files: { 'site/index.html': page('<a href="about.html">about</a>') },
    },
    'a config declaring no published tree': {
      files: { 'wrangler.json': config({}), 'site/index.html': page('<a href="about.html">about</a>') },
    },
    'links already on the canonical path': {
      files: { 'wrangler.json': site, 'site/index.html': page('<a href="/about">about</a>\n<a href="docs/">docs</a>') },
    },
    'a page on somebody else\'s server': {
      files: {
        'wrangler.json': site,
        'site/index.html': page('<a href="https://acme.example/about.html">x</a>\n<a href="//acme.example/about.html">y</a>'),
      },
    },
    'a scheme spelled in capitals': {
      files: { 'wrangler.json': site, 'site/index.html': page('<a href="HTTPS://acme.example/about.html">x</a>') },
    },
    'a .html file outside the published tree': {
      files: { 'wrangler.json': site, 'site/index.html': page('<p>x</p>'), 'reports/run.html': page('<a href="old.html">x</a>') },
    },
    'a commented-out link': {
      files: { 'wrangler.json': site, 'site/index.html': page('<!-- <a href="about.html">about</a> -->') },
    },
    'a name that merely starts with .html': {
      files: { 'wrangler.json': site, 'site/index.html': page('<a href="about.htmlx">about</a>') },
    },
    'a deployment whose html handling is off': {
      files: {
        'wrangler.json': config({ directory: './site', html_handling: 'none' }),
        'site/index.html': page('<a href="about.html">about</a>'),
      },
    },
  },
  flagged: {
    'a relative link to the .html file': {
      files: { 'wrangler.json': site, 'site/index.html': page('<a href="about.html">about</a>') },
      at: [{ file: 'site/index.html', line: 2, what: /about\.html/, fix: /extensionless path/ }],
    },
    'a bare filename in single quotes, on the line it sits on': {
      files: { 'wrangler.json': site, 'site/index.html': '<!doctype html>\n<p>x</p>\n<a href=\'contact.html\'>contact</a>\n' },
      at: [{ file: 'site/index.html', line: 3, what: /contact\.html/ }],
    },
    'a link carrying a fragment': {
      files: { 'wrangler.json': site, 'site/index.html': page('<a href="/about.html#team">team</a>') },
      at: [{ file: 'site/index.html', line: 2, what: /\/about\.html#team/ }],
    },
    'two links on one line, and a folder index': {
      files: {
        'wrangler.json': site,
        'site/index.html': page('<a href="about.html">a</a> <a href="docs/index.html">d</a>'),
      },
      at: [
        { file: 'site/index.html', line: 2, what: /about\.html/ },
        { file: 'site/index.html', line: 2, what: /docs\/index\.html/ },
      ],
    },
    'a published tree one directory down': {
      files: { 'web/wrangler.json': site, 'web/site/index.html': page('<a href="about.html">about</a>') },
      at: [{ file: 'web/site/index.html', line: 2, what: /about\.html/ }],
    },
    'a deployment that forces trailing slashes': {
      files: {
        'wrangler.json': config({ directory: './site', html_handling: 'force-trailing-slash' }),
        'site/index.html': page('<a href="about.html">about</a>'),
      },
      at: [{ file: 'site/index.html', line: 2, fix: /trailing-slash path/ }],
    },
    'a deployment that drops trailing slashes': {
      files: {
        'wrangler.json': config({ directory: './site', html_handling: 'drop-trailing-slash' }),
        'site/index.html': page('<a href="about.html">about</a>'),
      },
      at: [{ file: 'site/index.html', line: 2, fix: /bare path/ }],
    },
  },
});
