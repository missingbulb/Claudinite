import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { resolveStore } from '../user_pack_address.mjs';
import { CODEOWNERS_FILE, codeownersBlock, readBlock } from '../store_codeowners.mjs';

// The store's CODEOWNERS carries the block its directories derive (store_codeowners.mjs), and
// nothing after it re-owns them. The guarantee a person reads off it - nobody but them or the
// admin changed their pack - holds only while every directory has its line, so a directory
// added without regenerating the block is what this finds, in the same PR that added it.
//
// ADVISORY, like its siblings. A directory missing its line falls to the `/<path>/` admin line
// above it, so the drift fails safe: the person loses the right to approve their own edits,
// not the protection. What actually enforces review is the store's ruleset, a setting only a
// person can turn on, which the pack README describes.
//
// RELEVANCE-FIRST: inert unless this repo holds the store its own declaration names.
const PACK = 'claude-code-web-users-support';
const WRITER = 'node .claudinite/shared/packs/claude-code-web-users-support/write_store_codeowners.mjs';

const rule = {
  id: 'preferences-store-codeowners',
  severity: 'advisory',
  description: 'A personal-pack store this repo holds carries the CODEOWNERS block its person directories derive',
  doc: 'packs/claude-code-web-users-support/README.md',
  why: 'a person trusts that nobody but them or the admin edited their pack only while their directory has its code-owner line and the store requires code-owner review',

  run(ctx) {
    const store = resolveStore(ctx.config.packConfig?.[PACK] ?? null);
    if (!store) return [];
    const files = ctx.files ?? [];
    if (!files.some((f) => f.startsWith(`${store.path}/`))) return []; // this repo is not the store

    const expected = codeownersBlock(store, files);
    const text = files.includes(CODEOWNERS_FILE) ? ctx.read(CODEOWNERS_FILE) : null;
    const fix = `run \`${WRITER}\` and commit ${CODEOWNERS_FILE}`;
    if (text === null) {
      return [finding(rule, { file: CODEOWNERS_FILE, what: `is missing, so no person owns their directory under ${store.path}/`, fix })];
    }
    const found = readBlock(text);
    if (!found) {
      return [finding(rule, { file: CODEOWNERS_FILE, what: `carries no generated block for ${store.path}/`, fix })];
    }
    const out = [];
    if (found.block !== expected) {
      const have = new Set(found.block.split('\n'));
      const missing = expected.split('\n').filter((l) => !have.has(l) && !l.startsWith('#'));
      out.push(finding(rule, {
        file: CODEOWNERS_FILE,
        what: `its generated block is out of step with ${store.path}/${missing.length ? ` - missing ${missing.join(', ')}` : ''}`,
        fix,
      }));
    }
    if (found.ownerLinesAfter.length) {
      out.push(finding(rule, {
        file: CODEOWNERS_FILE,
        what: `has owner lines after the generated block (${found.ownerLinesAfter.join(', ')}), and GitHub's last matching line wins`,
        fix: `move those lines above the block, or remove them if they re-own ${store.path}/`,
      }));
    }
    return out;
  },
};

export default rule;
