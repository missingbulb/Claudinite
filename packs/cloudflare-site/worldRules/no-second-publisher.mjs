import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { workflowFiles } from '../../../engine/checks/helpers/github-workflows.mjs';
import { parseWranglerConfig, publishedDir, wranglerConfigPath } from '../lib.mjs';

// WHY. The release task is the one path to production: it cuts the version, gates on
// what has landed, and parks where a person has to act. A second publisher has none
// of that — a workflow that deploys ships the tree with no version cut and no park
// lane, and a green run looks exactly like success; a `CNAME` file left under the
// published tree is GitHub Pages still claiming the domain the Worker now serves,
// which is the leftover of a previous host rather than a setting anyone chose.
//
// Both are evaluated rather than handed to an adopter as a checklist item: a step
// that reads "turn the old host off, if it is on" is a no-op for most repos, and a
// checklist of no-ops teaches its reader to skim the list that exists to stop them.
//
// SCOPE. The repo's own workflows, and the published tree named by the wrangler
// config. A commented-out step is not a publisher.

// The publishing steps a site repo reaches for: GitHub Pages' three actions, the
// wrangler action, and a bare `wrangler deploy` in a `run:` line.
const PUBLISHES = /actions\/(deploy-pages|upload-pages-artifact|configure-pages)|cloudflare\/wrangler-action|wrangler(@\S+)?\s+(pages\s+)?deploy/;

const rule = {
  id: 'cloudflare-site/no-second-publisher',
  severity: 'blocking',
  since: '2026-09-13',
  description: 'Nothing but the site-release task publishes the site',
  doc: 'packs/cloudflare-site/RULES.md',
  why: 'a second publisher ships the tree with no version cut, no gate and no park lane — and its green run looks exactly like success',

  run(ctx) {
    const out = [];

    for (const file of workflowFiles(ctx)) {
      const text = ctx.read(file);
      if (text === null) continue;
      text.split('\n').forEach((line, i) => {
        if (/^\s*#/.test(line) || !PUBLISHES.test(line)) return;
        out.push(finding(rule, {
          file,
          line: i + 1,
          what: `${file} publishes the site from a workflow`,
          fix: 'publish from the site-release task instead — `wrangler` is a CLI, so the release needs no `uses:` step, and the task is what cuts the version and parks when Cloudflare refuses',
        }));
      });
    }

    const configPath = wranglerConfigPath(ctx.tracked);
    const dir = configPath && publishedDir(parseWranglerConfig(ctx.read(configPath)), configPath);
    if (dir) {
      for (const file of ctx.tracked.filter((f) => f === `${dir}/CNAME`)) {
        out.push(finding(rule, {
          file,
          what: `${file} claims the domain for GitHub Pages`,
          fix: 'delete it — the custom domains are the wrangler config\'s routes, Cloudflare writes the DNS record as the deploy attaches them, and a CNAME file left here keeps the old host claiming the same name',
        }));
      }
    }

    return out;
  },
};

export default rule;
