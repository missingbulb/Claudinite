import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { htmlHandling, parseWranglerConfig, publishedDir, wranglerConfigPath } from '../lib.mjs';

// WHY. Workers static assets picks one canonical URL per HTML page and 307s every
// other spelling of it there, the `.html` form included. A link that still names the
// file therefore costs every visitor who follows it a round trip that buys nothing,
// and nothing about the page looks wrong: the redirect is invisible, the content
// arrives, and only the waterfall says so.
//
// SCOPE. The `.html` files inside the published tree the wrangler config names - the
// pages that actually ship. A `.html` file elsewhere in the repo (a fixture, a saved
// report) is not served, so its links redirect nobody. Silent where the config sets
// `html_handling: none`, which turns the redirects off: there the extensionless path
// resolves through `not_found_handling` rather than to the page, so dropping the
// suffix is what would break the link.

// An `href`'s target, as markup spells it. A target carrying a scheme (`https:`,
// `mailto:`, `tel:`) or opening `//` belongs to somebody else's server, and how they
// serve their pages is not this deployment's business.
const HREF = /\bhref\s*=\s*(["'])([^"']*)\1/gi;
const ELSEWHERE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
// The suffix, at the end of the path - a query or a fragment may follow it, and
// `.htmlx` is a different name rather than this one.
const DOT_HTML = /\.html(?=$|[?#])/i;

// `stripComments` is the same pass for code; markup's one comment form has no
// literals to be careful of, so it is four lines here rather than an import that
// would answer a different language. Newlines are kept so a finding's line number
// still points at the line the reader sees.
function stripMarkupComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ''));
}

// What to link to instead, in the spelling this deployment's `html_handling` makes
// canonical. Every mode but `none` redirects the `.html` form somewhere; which
// somewhere is the whole difference between them.
const CANONICAL = {
  'auto-trailing-slash': 'the extensionless path - `about` for `about.html`, `docs/` for `docs/index.html`',
  'force-trailing-slash': 'the trailing-slash path - `about/` for `about.html`, `docs/` for `docs/index.html`',
  'drop-trailing-slash': 'the bare path - `about` for `about.html`, `docs` for `docs/index.html`',
};

const rule = {
  id: 'cloudflare-site/internal-links-omit-html-extension',
  severity: 'blocking',
  since: '2026-09-23',
  description: 'An internal link inside the published tree names the page\'s canonical path, never the .html file',
  doc: 'packs/cloudflare-site/RULES.md',
  why: 'Workers static assets 307s the .html form to the page\'s canonical path, so a link that spells it out costs every visitor that redirect',

  run(ctx) {
    const configPath = wranglerConfigPath(ctx.tracked);
    const config = configPath && parseWranglerConfig(ctx.read(configPath));
    const dir = config && publishedDir(config, configPath);
    if (!dir) return [];

    const mode = htmlHandling(config);
    const canonical = CANONICAL[mode];
    if (!canonical) return [];

    const out = [];
    for (const file of ctx.tracked.filter((f) => f.startsWith(`${dir}/`) && f.endsWith('.html'))) {
      const raw = ctx.read(file);
      if (raw === null) continue;
      stripMarkupComments(raw).split('\n').forEach((line, i) => {
        for (const [, , target] of line.matchAll(HREF)) {
          if (ELSEWHERE.test(target) || !DOT_HTML.test(target)) continue;
          out.push(finding(rule, {
            file,
            line: i + 1,
            what: `an internal link still points at the .html file: ${target}`,
            fix: `link to ${canonical} - the .html form goes on resolving through the 307 meanwhile, so nothing breaks while the links are corrected`,
          }));
        }
      });
    }
    return out;
  },
};

export default rule;
