import { finding } from '../../engine/checks/helpers/findings.mjs';
import { KEYS, parseConfig } from './stubs/actions/read-site-config/read-config.mjs';
import { shipsPipeline } from './release-workflows.mjs';

export const CONFIG_PATH = '.github/site.config';

// Directories that must never appear in a publish set. Two of them are the agent
// tooling (whose skill symlinks dangle on a runner and whose content is nobody's
// business on the public web), one is the CI plumbing, one is the dependency
// tree. This is a floor, not the mechanism: the publish set is ADDITIVE — what
// keeps a draft or a key off the site is that nothing publishes unless it is
// named. These four are the ones a "just publish everything" instinct reaches
// for first, so naming them fails fast with the reason attached.
const NEVER_PUBLISHED = ['.claude', '.claudinite', '.github', 'node_modules'];

// The publish set is validated where the repo can see it, not only on the runner
// at deploy time: the same parse the vendored read-site-config action runs (one
// definition, imported from the stub), plus the existence of every path it names.
const rule = {
  id: 'sw/site-config',
  severity: 'blocking',
  description: `${CONFIG_PATH} declares the publish set explicitly — all five keys, no unknown keys, every published path present`,
  doc: 'packs/static-website/RELEASE.md',
  why: 'the published artifact is an explicit list, so a stale entry silently drops a page from the live site and an unknown key silently does nothing',

  run(ctx) {
    if (!shipsPipeline(ctx)) return [];
    const text = ctx.read(CONFIG_PATH);
    if (text === null) {
      return [finding(rule, {
        file: CONFIG_PATH,
        what: `missing — the pipeline reads every repo value from it (${KEYS.map((k) => k.name).join(', ')})`,
        fix: `write ${CONFIG_PATH} with all five keys, explicitly (see the pack's RELEASE.md)`,
      })];
    }

    const { values, errors } = parseConfig(text);
    const out = errors.map((e) => finding(rule, {
      file: CONFIG_PATH,
      what: e.replace(`${CONFIG_PATH}: `, '').replace(`${CONFIG_PATH}:`, 'line '),
      fix: 'fix the key (the five are required and fully explicit — there are no defaults to fall back on)',
    }));

    const root = values.get('publish_root');
    const siteRoot = !root || root === '.' ? '' : `${root}/`;
    const fullOf = (p) => (p === '.' ? (siteRoot || '.') : `${siteRoot}${p}`);
    const paths = (values.get('publish_paths') ?? '').split(/\s+/).filter(Boolean);
    for (const p of paths) {
      const full = fullOf(p);
      if (NEVER_PUBLISHED.includes(p) || NEVER_PUBLISHED.includes(full)) {
        out.push(finding(rule, {
          file: CONFIG_PATH,
          what: `publishes "${p}" — tooling and dependency directories are never part of a published site`,
          fix: `drop "${p}" from publish_paths and name the site's own files instead`,
        }));
        continue;
      }
      if (full !== '.' && !ctx.tracked.some((f) => f === full || f.startsWith(`${full}/`))) {
        out.push(finding(rule, {
          file: CONFIG_PATH,
          what: `publish path "${p}" matches nothing tracked at "${full}" — the deploy fails on it, or quietly ships a smaller site than intended`,
          fix: `remove the entry, or fix the path (publish paths are relative to publish_root "${root ?? '.'}")`,
        }));
      }
    }

    // A site with no front page is the one broken deploy the assembly guard
    // catches at build time; catching it here means it never reaches main.
    const publishesIndex = paths.some((p) => {
      const full = fullOf(p);
      return full === `${siteRoot}index.html` || ctx.tracked.includes(`${full === '.' ? '' : `${full}/`}index.html`);
    });
    if (paths.length && !publishesIndex) {
      out.push(finding(rule, {
        file: CONFIG_PATH,
        what: 'no publish path carries an index.html — the deployed site\'s "/" would 404',
        fix: 'add the site\'s index.html (or the directory holding it) to publish_paths',
      }));
    }
    return out;
  },
};

export default rule;
