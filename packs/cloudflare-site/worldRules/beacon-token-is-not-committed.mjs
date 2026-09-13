import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { BEACON_PLACEHOLDER, parseWranglerConfig, publishedDir, wranglerConfigPath } from '../lib.mjs';

// WHY. The Cloudflare Web Analytics beacon token is public, but it is also the
// deployment's: committed, it beacons from every checkout, every fork and every local
// preview into the production site's numbers — and nothing about the page looks
// wrong. The release substitutes it into the copy it uploads, from the
// `CLOUDFLARE_ANALYTICS_TOKEN` repository variable, so the committed file carries the
// placeholder and the loader no-ops until a deploy fills it in.
//
// SCOPE. The published tree only. A token in a test fixture or a doc is not what
// beacons; a token under the directory that reaches the public URL is. A script's
// comments are stripped first (`stripComments` preserves line numbers), so a token
// in a commented-out loader — which beacons nothing — does not count as present.
// Markup is scanned as written: an HTML comment carries no script to strip.

// A beacon token as it appears in the loader Cloudflare hands out: the `token` field
// of a `data-cf-beacon` attribute, or the same key set in a script.
const TOKEN = /["']?token["']?\s*:\s*["']([0-9a-f]{16,})["']/gi;

const rule = {
  id: 'cloudflare-site/beacon-token-is-not-committed',
  severity: 'blocking',
  since: '2026-09-13',
  description: 'A published file carries the beacon placeholder, never a real token',
  doc: 'packs/cloudflare-site/RULES.md',
  why: 'a committed token beacons from every checkout and fork into the production site\'s numbers, and the page looks identical either way',

  run(ctx) {
    const configPath = wranglerConfigPath(ctx.tracked);
    const dir = configPath && publishedDir(parseWranglerConfig(ctx.read(configPath)), configPath);
    if (!dir) return [];

    const out = [];
    for (const file of ctx.tracked.filter((f) => f.startsWith(`${dir}/`))) {
      const raw = ctx.read(file);
      if (raw === null) continue;
      const text = /\.(js|mjs|cjs)$/.test(file) ? stripComments(raw) : raw;
      text.split('\n').forEach((line, i) => {
        for (const [, token] of line.matchAll(TOKEN)) {
          out.push(finding(rule, {
            file,
            line: i + 1,
            what: `a Cloudflare beacon token is committed (${token.slice(0, 6)}…)`,
            fix: `put ${BEACON_PLACEHOLDER} back as the token's only value here and set the token as the CLOUDFLARE_ANALYTICS_TOKEN repository variable — the release substitutes it into the copy it uploads, and the committed file never carries it`,
          }));
        }
      });
    }
    return out;
  },
};

export default rule;
