import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { parseWranglerConfig, publishedDir, wranglerConfigPath, WRANGLER_CONFIGS } from '../lib.mjs';

// WHY. The wrangler config is the whole boundary of what reaches a public URL: the
// release uploads `assets.directory` and nothing else, and the repo around it holds
// the vendored mount, the queue's workers and the packs. A widened or missing
// directory is not a broken build — the deploy succeeds and publishes the agent
// tooling, or publishes nothing, and neither looks wrong anywhere.
//
// SCOPE. The one wrangler config the release reads (root or one directory down,
// JSON or JSONC). A repo declaring this pack has said it deploys this way, so a
// missing config is a finding rather than a reason to stay quiet.

const rule = {
  id: 'cloudflare-site/publishes-a-site-directory',
  on_fail: 'block',
  since: '2026-09-13',
  description: 'The wrangler config names a published subdirectory that exists, and pins a compatibility date',
  doc: 'packs/cloudflare-site/RULES.md',
  why: 'assets.directory is the only boundary between the published site and the repo holding the mount, the packs and the queue workers',

  run(ctx) {
    const configPath = wranglerConfigPath(ctx.tracked);
    if (!configPath) {
      return [finding(rule, {
        file: WRANGLER_CONFIGS[0],
        what: 'no wrangler.json or wrangler.jsonc at the repo root or one directory down',
        fix: 'add the wrangler config the release reads — it names the tree to upload (assets.directory) and the custom domains to attach; a TOML config is a wrangler setup this pack does not read',
      })];
    }

    const config = parseWranglerConfig(ctx.read(configPath));
    if (config === null) {
      return [finding(rule, {
        file: configPath,
        what: `${configPath} does not parse as JSON`,
        fix: 'fix the syntax — the release and these checks all read this file, and a config they cannot parse stops the release at the gate',
      })];
    }

    const out = [];
    const dir = publishedDir(config, configPath);
    if (!dir) {
      out.push(finding(rule, {
        file: configPath,
        what: 'the config declares no assets.directory',
        fix: 'set assets.directory to the one tree the site publishes — without it wrangler deploy has no target at all',
      }));
    } else if (dir === '' || dir === '.' || dir === configPath.slice(0, Math.max(0, configPath.lastIndexOf('/')))) {
      out.push(finding(rule, {
        file: configPath,
        what: `assets.directory publishes ${dir === '' || dir === '.' ? 'the repo root' : dir}`,
        fix: 'point assets.directory at a subdirectory holding the site and nothing else — publishing the tree that holds it publishes the vendored mount, the packs and the queue workers to a public URL',
      }));
    } else if (!ctx.tracked.some((f) => f.startsWith(`${dir}/`))) {
      out.push(finding(rule, {
        file: configPath,
        what: `assets.directory names ${dir}, which holds no tracked file`,
        fix: `create ${dir} with the site in it, or point assets.directory at the tree that is actually published — a deploy of an empty directory serves a 404 to every visitor and reports success`,
      }));
    }

    if (!config.compatibility_date) {
      out.push(finding(rule, {
        file: configPath,
        what: 'the config declares no compatibility_date',
        fix: 'pin compatibility_date, so the runtime a release lands on is a value in the repo rather than whatever the deploy day defaults to',
      }));
    }

    return out;
  },
};

export default rule;
